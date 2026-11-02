#!/usr/bin/env python3
"""
Noor Autos DMS: shared office server.

Run this on one office computer. Everyone else opens the address it prints
(e.g. http://192.168.1.20:8765) in their browser and signs in with a PIN.
All staff then work on the same data, live.

  * Data is kept in   data/noor-dms.sqlite
  * Daily copies go to data/backups/ (the last 30 are kept), plus one copy
    just before anyone restores a backup or resets the system.

Uses only the Python 3 standard library: there is nothing to install.
Usage:  python3 server.py [--port 8765] [--host 0.0.0.0]

Online on Vercel (see VERCEL.md): api/index.py serves `app` below. With DATABASE_URL set the
data is kept in Postgres instead of the file above, and this needs psycopg (requirements.txt).
"""
import argparse
import datetime
import glob
import gzip
import hashlib
import hmac
import http.client
import http.server
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
from urllib.parse import urlparse, parse_qs, parse_qsl, urlencode

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('NA_DATA') or os.path.join(ROOT, 'data')
DB_PATH = os.path.join(DATA_DIR, 'noor-dms.sqlite')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')
KEEP_BACKUPS = 30
SESSION_DAYS = 30
ONLINE_SECONDS = 20
MAX_BODY = 40 * 1024 * 1024
COOKIE = 'na_session'
DATABASE_URL = os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL') or ''
PG = bool(DATABASE_URL)
HOSTED = PG or bool(os.environ.get('VERCEL'))
# Every browser check is a paid request online, so it asks less often than on the office network.
HOSTED_POLL_MS = max(1000, int(os.environ.get('NA_POLL_MS') or 5000))
# Online, one request can carry only 4.5 MB: larger restores go up in parts of this many characters.
HOSTED_MAX_PART = 1000000
# Online servers run in UTC. Bangladesh is UTC+6 all year; this form needs no time zone files.
if HOSTED and hasattr(time, 'tzset'):
    os.environ['TZ'] = os.environ.get('NA_TZ') or '<+06>-6'
    time.tzset()

NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,40}$')
PREFIX_RE = re.compile(r'^[A-Z0-9]{1,8}$')
PIN_RE = re.compile(r'^\d{4,8}$')

lock = threading.RLock()
conn = None
prepared = False


# --------------------------------------------------------------------------- database
def open_db():
    import sqlite3
    os.makedirs(BACKUP_DIR, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA synchronous=NORMAL')
    c.executescript('''
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (
        c TEXT NOT NULL, id TEXT NOT NULL, data TEXT, rev INTEGER NOT NULL, ord REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (c, id));
      CREATE INDEX IF NOT EXISTS records_rev ON records(rev);
      CREATE TABLE IF NOT EXISTS users (
        name TEXT PRIMARY KEY COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL,
        admin INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, role TEXT, staff_id TEXT);
      CREATE TABLE IF NOT EXISTS audit (
        at REAL NOT NULL, name TEXT NOT NULL, c TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL, fields TEXT);
      CREATE INDEX IF NOT EXISTS audit_rec ON audit(c, id);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, created REAL NOT NULL, last_seen REAL NOT NULL);
    ''')
    cols = [r[1] for r in c.execute('PRAGMA table_info(users)')]
    if 'role' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN role TEXT')
    if 'staff_id' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN staff_id TEXT')
    return c


# The same tables in Postgres. Names ignore capitals through citext, times need double precision (REAL is too coarse
# there), and rowid is written out because Postgres has none of its own.
PG_SCHEMA = '''
  CREATE EXTENSION IF NOT EXISTS citext;
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS records (
    c TEXT NOT NULL, id TEXT NOT NULL, data TEXT, rev BIGINT NOT NULL, ord DOUBLE PRECISION NOT NULL DEFAULT 0,
    rowid BIGSERIAL, PRIMARY KEY (c, id));
  CREATE INDEX IF NOT EXISTS records_rev ON records(rev);
  CREATE TABLE IF NOT EXISTS users (
    name CITEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, role TEXT, staff_id TEXT);
  CREATE TABLE IF NOT EXISTS audit (
    at DOUBLE PRECISION NOT NULL, name TEXT NOT NULL, c TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL, fields TEXT,
    rowid BIGSERIAL PRIMARY KEY);
  CREATE INDEX IF NOT EXISTS audit_rec ON audit(c, id);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, name CITEXT NOT NULL, created DOUBLE PRECISION NOT NULL, last_seen DOUBLE PRECISION NOT NULL);
  CREATE TABLE IF NOT EXISTS backups (
    name TEXT PRIMARY KEY, at DOUBLE PRECISION NOT NULL, daily INTEGER NOT NULL, data BYTEA NOT NULL);
'''
# One number that every server instance queues on, so saves stay in order however many instances are running.
PG_BEGIN = """BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL idle_in_transaction_session_timeout = '30s';
              SELECT pg_advisory_xact_lock(7270011)"""


def pg_dsn():
    """Connection settings without the extras hosting providers add that the Postgres library rejects."""
    u = urlparse(DATABASE_URL)
    keep = ('sslmode', 'channel_binding', 'options', 'sslrootcert', 'target_session_attrs')
    return u._replace(query=urlencode([(k, v) for k, v in parse_qsl(u.query) if k in keep])).geturl()


def pg_sql(sql):
    """The few places the SQL in this file differs in Postgres. In SQLite LIKE ignores capitals and has no escape character."""
    sql = sql.replace('%', '%%').replace(' COLLATE NOCASE', '').replace(' LIKE ?', " ILIKE ? ESCAPE ''")
    return sql.replace('?', '%s')


class PgConn:
    """Postgres behind the same execute() the rest of this file uses with SQLite."""
    def __init__(self):
        import psycopg
        # No prepared statements: the connection poolers hosting providers put in front of Postgres do not keep them.
        self.raw = psycopg.connect(pg_dsn(), autocommit=True, prepare_threshold=None, connect_timeout=10)

    def execute(self, sql, args=()):
        return self.raw.execute(pg_sql(sql), args)

    def executemany(self, sql, rows):
        with self.raw.cursor() as cur:
            cur.executemany(pg_sql(sql), rows)

    def close(self):
        try:
            self.raw.close()
        except Exception:
            pass


def pg_begin():
    """Start a transaction. A connection left idle while the instance was paused may be gone: open a new one once."""
    global conn
    for last_try in (False, True):
        try:
            if conn is None or conn.raw.closed:
                conn = PgConn()
            conn.raw.execute(PG_BEGIN)
            return conn
        except Exception:
            if conn is not None:
                conn.close()
            conn = None
            if last_try:
                raise


class tx:
    """Serialise all database work and wrap it in one transaction."""
    def __enter__(self):
        lock.acquire()
        try:
            if PG:
                return pg_begin()
            conn.execute('BEGIN IMMEDIATE')
            return conn
        except BaseException:
            lock.release()
            raise

    def __exit__(self, exc_type, exc, tb):
        global conn
        try:
            conn.execute('ROLLBACK' if exc_type else 'COMMIT')
        except Exception:
            if PG:      # the connection is no use now: the next request opens a new one
                conn.close()
                conn = None
            if not exc_type:
                raise
        finally:
            lock.release()
        return False


def prepare_db():
    global conn, prepared
    if not PG:
        conn = open_db()
    with tx() as db:
        if PG:
            db.raw.execute(PG_SCHEMA)
        upgrade_users(db)
        ensure_owners(db)
        ensure_policy_start(db)
    prepared = True


def kv_get(db, k, default=None):
    row = db.execute('SELECT v FROM kv WHERE k=?', (k,)).fetchone()
    return row[0] if row else default


def kv_set(db, k, v):
    db.execute('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', (k, str(v)))


def next_rev(db):
    r = int(kv_get(db, 'rev', '0')) + 1
    kv_set(db, 'rev', r)
    return r


def epoch(db):
    e = kv_get(db, 'epoch')
    if not e:
        e = secrets.token_hex(6)
        kv_set(db, 'epoch', e)
    return e


def has_data(db):
    return db.execute('SELECT 1 FROM records WHERE data IS NOT NULL LIMIT 1').fetchone() is not None


def strip_local(c, rid, obj):
    """Who is signed in is per-browser, never shared."""
    if c == '_doc' and rid == 'settings' and isinstance(obj, dict):
        obj.pop('currentUser', None)
    return obj


# --------------------------------------------------------------------------- who may see and change what
# Mirrors js/access.js. The Managing Director (role 'owner') sees and changes everything.
# 'all'  = sees every record and may change them
# 'read' = sees every record, may not change them
# 'own'  = sees and changes only records whose ownerId is their own staff id
# missing = sees nothing of that kind
ALL, READ, OWN = 'all', 'read', 'own'
ROLES = ('owner', 'sales_manager', 'sales', 'accounts', 'procurement', 'service_manager', 'service', 'hr')
TITLE_ROLE = {
    'managing director': 'owner', 'sales manager': 'sales_manager', 'sales consultant': 'sales',
    'accounts': 'accounts', 'procurement': 'procurement', 'service manager': 'service_manager', 'service advisor': 'service',
    'technician': 'service', 'admin & hr': 'hr', 'driver': 'service',
}
_SELF = {'approvals': OWN, 'activity': OWN, 'expenses': OWN, 'leaves': OWN, 'attendance': OWN, 'models': READ, 'staff': READ}
ACCESS = {
    'sales_manager': dict(_SELF, leads=ALL, customers=ALL, orders=ALL, payments=ALL, quotations=ALL, testDrives=ALL,
                          followUps=ALL, vehicles=ALL, warranties=ALL, invoices=ALL, targets=ALL, activity=ALL,
                          serviceBookings=READ, jobCards=READ, purchaseOrders=READ, vendorPayments=READ, vendors=READ,
                          transfers=ALL),
    'sales': dict(_SELF, leads=OWN, customers=OWN, orders=OWN, payments=OWN, quotations=OWN, testDrives=OWN,
                  followUps=OWN, warranties=OWN, invoices=OWN, targets=READ, vehicles=ALL, transfers=READ),
    'accounts': dict(_SELF, customers=ALL, orders=ALL, payments=ALL, vehicles=ALL, invoices=ALL, warranties=READ,
                     purchaseOrders=ALL, partOrders=ALL, vendorPayments=ALL, vendors=ALL, expenses=ALL, assets=ALL, compliance=ALL,
                     vatReturns=ALL,
                     jobCards=READ, serviceBookings=READ, parts=READ, followUps=ALL,
                     targets=READ, activity=ALL, transfers=READ),
    'procurement': dict(_SELF, purchaseOrders=ALL, vendors=ALL, vehicles=ALL, parts=ALL, partOrders=ALL, vendorPayments=READ,
                        orders=READ, leads=READ, jobCards=READ, transfers=ALL),
    'service': dict(_SELF, customers=ALL, vehicles=ALL, warranties=ALL, serviceBookings=ALL, jobCards=ALL,
                    invoices=ALL, parts=ALL, partOrders=ALL, followUps=ALL, payments=OWN, vendors=READ, transfers=READ),
    'hr': dict(_SELF, staff=ALL, attendance=ALL, leaves=ALL, assets=ALL, compliance=ALL),
}
ACCESS['service_manager'] = dict(ACCESS['service'], activity=ALL, payments=ALL)
# Documents that are not lists (settings, payroll …): who may read / change them.
DOC_READ = {'settings': None, 'meta': None, 'payroll': ('hr', 'accounts')}   # None = everyone
DOC_WRITE = {'payroll': ('hr',)}                                                # owner always may
# Figures only some roles may see. They are removed before records are sent.
COST_ROLES = ('owner', 'sales_manager', 'accounts', 'procurement')
PAY_ROLES = ('owner', 'hr', 'accounts')
REDACT = {
    'vehicles': (COST_ROLES, ('cost', 'landedCost', 'unitCost', 'purchaseCost')),
    'models': (COST_ROLES, ('cost',)),
    'parts': (COST_ROLES, ('cost', 'avgCost')),
    'staff': (PAY_ROLES, ('salary', 'basic', 'allowance', 'bankAccount', 'bankName', 'nid', 'salaryHistory', 'emergency')),
    'invoices': (COST_ROLES, ('costAtSale',)),
}
# Figures inside lists (parts-order lines, stock movements) that only cost roles may see.
REDACT_NESTED = {
    'partOrders': {'lines': ('unitCost', 'cost', 'value', 'lineTotal'), 'receipts': ('value', 'cost', 'unitCost')},
    'parts': {'stockLog': ('cost', 'value', 'unitCost')},
    'models': {'priceHistory': ('cost',)},
}
REDACT_TOP_EXTRA = {'partOrders': ('total', 'subtotal', 'value')}
# Records some roles receive only in outline: every other field is removed. Purchasing plans stock from how many leads
# want each model; it never sees who they are or what they said.
KEEP_ONLY = {
    'leads': (('procurement',), ('id', 'code', 'modelId', 'color', 'stage', 'stageAt', 'consultantId', 'ownerId', 'orderId',
                                 'source', 'createdAt', 'updatedAt')),
}
# Approvals whose amount is a cost (purchase orders, stock write-offs): the amount stays with cost roles.
COST_APPROVALS = ('po', 'stock_adjust', 'emergency', 'vendor_payment')
# Activity lines about buying and the books carry supplier costs: only cost roles receive other people's.
COST_LINKS = ('#/procurement', '#/finance')
# Once a customer has bought, only these roles change who they are (name, mobile, NID, TIN, type).
IDENTITY_FIELDS = ('name', 'mobile', 'nid', 'tin', 'type')
IDENTITY_ROLES = ('owner', 'sales_manager', 'accounts')
# Only the Managing Director may delete these (others cancel or void them instead).
PROTECTED = {'leads', 'customers', 'orders', 'payments', 'invoices', 'vendorPayments', 'purchaseOrders',
             'vehicles', 'warranties', 'jobCards', 'approvals', 'activity', 'quotations'}
DECISION_FIELDS = {'status', 'decidedBy', 'decidedById', 'decidedAt', 'note', 'updatedAt'}
# Customer money counts only once Accounts confirms it. Anyone else records a receipt as waiting and cannot confirm it,
# mark it not received, or change its figures afterwards (printing it or handing it to another consultant is fine).
PAYMENT_LOCKED = ('status', 'verifiedBy', 'verifiedById', 'verifiedAt', 'verifyNote', 'amount', 'kind', 'orderId',
                  'invoiceId', 'jobCardId', 'customerId', 'method', 'ref', 'date', 'receiptNo')


def role_for_title(title):
    return TITLE_ROLE.get(str(title or '').strip().lower(), 'sales')


def access(user, c):
    if user['role'] == 'owner':
        return ALL
    return ACCESS.get(user['role'], {}).get(c)


def doc_readable(user, doc_id):
    if user['role'] == 'owner':
        return True
    if doc_id not in DOC_READ:
        return True
    allowed = DOC_READ[doc_id]
    return allowed is None or user['role'] in allowed


def doc_writable(user, doc_id):
    return user['role'] == 'owner' or user['role'] in DOC_WRITE.get(doc_id, ())


def owns(user, c, rec):
    sid = user.get('staffId')
    if not sid or not isinstance(rec, dict):
        return False
    if rec.get('ownerId') == sid:
        return True
    return c == 'activity' and rec.get('byStaffId') == sid


def visible(user, c, rid, rec, db=None):
    """May this person see this record at all?"""
    if user['role'] == 'owner':
        return True
    if c == '_doc':
        return doc_readable(user, rid)
    if c == 'approvals' and isinstance(rec, dict) and user['role'] in (rec.get('approverRoles') or []):
        return True
    a = access(user, c)
    if c == 'activity' and user['role'] not in COST_ROLES and isinstance(rec, dict) \
            and str(rec.get('link') or '').startswith(COST_LINKS) and not owns(user, c, rec):
        return False
    if c == 'payments' and user['role'] == 'service_manager' and isinstance(rec, dict) and rec.get('orderId') \
            and not owns(user, c, rec):
        return False
    if a in (ALL, READ):
        return True
    if a == OWN and owns(user, c, rec):
        return True
    # A consultant also sees the customer of every order they own (a customer can buy from two consultants).
    if c == 'customers' and a == OWN and db is not None and user.get('staffId') and owns_order_of(db, user, rid):
        return True
    # An approval also reaches whoever can see the record it is about (a discount the Sales Manager approved on a
    # consultant's order must reach that consultant, or the order looks blocked on their screen).
    if c == 'approvals' and db is not None and isinstance(rec, dict) and rec.get('refC') and rec.get('refId'):
        ref_c, ref_id = str(rec['refC']), str(rec['refId'])
        if ref_c not in ('approvals', '_doc') and access(user, ref_c):
            row = db.execute('SELECT data FROM records WHERE c=? AND id=?', (ref_c, ref_id)).fetchone()
            if row and row[0] is not None:
                return visible(user, ref_c, ref_id, json.loads(row[0]), db)
    return False


def hidden_fields(user, c, rec):
    """Top-level fields of this record that this person may not see."""
    if user['role'] == 'owner' or not isinstance(rec, dict):
        return []
    out = []
    rule = REDACT.get(c)
    if rule and user['role'] not in rule[0]:
        out += list(rule[1])
    if user['role'] not in COST_ROLES:
        out += list(REDACT_TOP_EXTRA.get(c, ()))
        if c == 'approvals' and rec.get('type') in COST_APPROVALS:
            out += ['amount', 'value', 'data']
    keep = KEEP_ONLY.get(c)
    if keep and user['role'] in keep[0]:
        out += [k for k in rec if k not in keep[1] and k not in out]
    return out


def needs_redact(user, c):
    return user['role'] != 'owner' and (c in REDACT or c in REDACT_NESTED or c in REDACT_TOP_EXTRA or c in KEEP_ONLY
                                        or c == 'approvals')


def owns_order_of(db, user, customer_id):
    pattern = '%"customerId":' + json.dumps(str(customer_id)) + '%'
    for (d,) in db.execute("SELECT data FROM records WHERE c='orders' AND data IS NOT NULL AND data LIKE ?", (pattern,)):
        o = json.loads(d)
        if isinstance(o, dict) and str(o.get('customerId')) == str(customer_id) and owns(user, 'orders', o):
            return True
    return False


def has_bought(db, customer, customer_id):
    """Has this customer bought a car (an order, or a car or warranty in their name)?"""
    if isinstance(customer, dict) and customer.get('firstOrderAt'):
        return True
    pattern = '%"customerId":' + json.dumps(str(customer_id)) + '%'
    for c in ('orders', 'vehicles', 'warranties'):
        for (d,) in db.execute('SELECT data FROM records WHERE c=? AND data IS NOT NULL AND data LIKE ?', (c, pattern)):
            r = json.loads(d)
            if isinstance(r, dict) and str(r.get('customerId')) == str(customer_id):
                return True
    return False


def redact(user, c, rec):
    if not isinstance(rec, dict) or user['role'] == 'owner':
        return rec
    hide = hidden_fields(user, c, rec)
    nested = REDACT_NESTED.get(c) if user['role'] not in COST_ROLES else None
    if not hide and not nested:
        return rec
    out = {k: v for k, v in rec.items() if k not in hide}
    for f, keys in (nested or {}).items():
        if isinstance(out.get(f), list):
            out[f] = [{k: v for k, v in it.items() if k not in keys} if isinstance(it, dict) else it for it in out[f]]
    return out


def item_key(it, i):
    if isinstance(it, dict):
        for k in ('id', 'lid', 'at', 'partId'):
            if it.get(k) not in (None, ''):
                return (k, str(it.get(k)))
    return ('#', i)


def restore_nested(cur_list, new_list, keys):
    """Put hidden figures back on list items this person sent back (matched by id, time or part)."""
    if not isinstance(cur_list, list) or not isinstance(new_list, list):
        return
    by = {item_key(it, i): it for i, it in enumerate(cur_list) if isinstance(it, dict)}
    for i, it in enumerate(new_list):
        old = by.get(item_key(it, i)) if isinstance(it, dict) else None
        if old:
            for k in keys:
                if k not in it and k in old:
                    it[k] = old[k]


def policy(db):
    row = db.execute("SELECT data FROM records WHERE c='_doc' AND id='settings'").fetchone()
    p = {'discountFree': 20000, 'discountManager': 100000, 'expenseFree': 2000, 'expenseAccounts': 10000,
         'serviceDiscountFree': 2000, 'serviceDiscountManager': 10000}
    try:
        p.update((json.loads(row[0]) or {}).get('policy') or {})
    except (TypeError, ValueError, AttributeError):
        pass
    return p


def approver_roles(db, kind, amount):
    """Who decides an approval request: the server decides, not the browser that asks."""
    p = policy(db)
    try:
        amount = float(amount or 0)
    except (TypeError, ValueError):
        amount = 0

    def limit(key):
        v = p.get(key)
        return num(v) if v not in (None, '') else 0.0
    if kind == 'discount':
        return ['owner'] if amount > limit('discountManager') else ['sales_manager']
    if kind == 'expense':
        return ['owner'] if amount > limit('expenseAccounts') else ['accounts']
    if kind == 'service_discount':
        return ['owner'] if amount > limit('serviceDiscountManager') else ['service_manager']
    if kind in ('warranty_job', 'job_cancel'):
        return ['service_manager']
    if kind == 'transfer':
        return ['sales_manager']
    if kind == 'leave':
        return ['hr']
    return ['owner']


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def approved_request(db, ref_c, ref_id, kind, amount):
    """Is there an approved request of this kind for this record, for at least this amount?"""
    pattern = '%' + json.dumps(str(ref_id)) + '%'
    for (d,) in db.execute("SELECT data FROM records WHERE c='approvals' AND data IS NOT NULL AND data LIKE ?", (pattern,)):
        a = json.loads(d)
        if (a.get('refC') == ref_c and str(a.get('refId')) == str(ref_id) and a.get('type') == kind and a.get('status') == 'approved'
                and num(a.get('value') if a.get('value') is not None else a.get('amount')) >= amount - 0.5):
            return True
    return False


def check_expense(db, user, ch, current):
    """An expense becomes 'approved' or 'paid' only within the person's authority: small amounts need nobody,
    then Accounts, then the Managing Director. Nobody approves their own claim; payroll needs the MD's approval."""
    after = merged(current, ch)
    if not isinstance(after, dict):
        return
    paid_states = ('approved', 'paid')
    st = after.get('status') or 'paid'               # records without a status are old, paid expenses
    if st not in paid_states:
        return
    if isinstance(current, dict) and (current.get('status') or 'paid') in paid_states and num(after.get('amount')) <= num(current.get('amount')) + 0.5:
        return                                        # already approved; paying it or editing details is fine
    amount = num(after.get('amount'))
    if amount <= num(policy(db).get('expenseFree')):
        return
    if user['role'] in approver_roles(db, 'expense', amount) and after.get('ownerId') != user.get('staffId'):
        return
    if approved_request(db, 'expenses', ch['id'], 'expense', amount):
        return
    month = str(after.get('payrollMonth') or '') or (str(after.get('ref') or '')[8:] if str(after.get('ref') or '').startswith('PAYROLL-') else '')
    if month and approved_request(db, 'payroll', month, 'payroll', amount):
        return
    raise PermissionError


PAYROLL_PAY_FIELDS = {'status', 'paidAt', 'paidBy', 'paidById', 'method', 'payRef', 'expenseIds', 'total', 'history', 'updatedAt'}


def payroll_payment_only(current, ch):
    """Accounts may record that an approved month was paid, and change nothing else in the payroll."""
    cur = current if isinstance(current, dict) else {}
    after = merged(cur, ch)
    if not isinstance(after, dict) or set(cur) - set(after):
        return False
    for k in set(after) | set(cur):
        a, b = cur.get(k), after.get(k)
        if a == b:
            continue
        if not isinstance(a, dict) or not isinstance(b, dict):
            return False
        if a.get('status') not in ('approved', 'paid') or b.get('status') not in ('approved', 'paid'):
            return False
        if {f for f in set(a) | set(b) if a.get(f) != b.get(f)} - PAYROLL_PAY_FIELDS:
            return False
    return True


def check_payment(user, ch, current):
    """Only Accounts (and the MD) confirm customer money: everyone else's receipts start as waiting."""
    after = merged(current, ch)
    if not isinstance(after, dict):
        raise PermissionError
    if current is None:
        if after.get('status') != 'pending' or after.get('kind') == 'refund' or num(after.get('amount')) <= 0 \
                or any(after.get(f) for f in ('verifiedBy', 'verifiedById', 'verifiedAt')):
            raise PermissionError
        return
    if any(after.get(f) != current.get(f) for f in PAYMENT_LOCKED):
        raise PermissionError


def check_vehicle_for_seller(db, user, ch, current):
    """Consultants only touch cars given to their own orders (registration number, handover)."""
    if not isinstance(current, dict) or ch.get('del') or 'put' in ch:
        raise PermissionError
    order_id = current.get('orderId')
    if not order_id or merged(current, ch).get('orderId') != order_id:
        raise PermissionError
    row = db.execute("SELECT data FROM records WHERE c='orders' AND id=?", (str(order_id),)).fetchone()
    if not row or row[0] is None or not owns(user, 'orders', json.loads(row[0])):
        raise PermissionError


def check_change(db, user, ch, current):
    """Return the record value to store (possibly adjusted), or raise PermissionError."""
    c, rid = ch['c'], ch['id']
    role = user['role']
    deleting = bool(ch.get('del'))
    if c == '_doc':
        if doc_writable(user, rid):
            return None
        if rid == 'payroll' and role == 'accounts' and payroll_payment_only(current, ch):
            return None
        raise PermissionError
    if c == 'vehicles' and isinstance(current, dict) and not deleting:
        # One car, one customer: a car already given to an order cannot be given to another one in the same breath
        # (two people assigning at once). Release it first (orderId cleared), then assign it again.
        new_order = merged(current, ch).get('orderId')
        if current.get('orderId') and new_order and new_order != current.get('orderId') and current.get('status') in ('allocated', 'delivered'):
            raise PermissionError
    if role == 'owner':
        return None
    a = access(user, c)
    if c == 'approvals':
        return check_approval(db, user, ch, current)
    if c == 'expenses' and not deleting and a in (ALL, OWN):
        check_expense(db, user, ch, current)
    if c == 'payments' and role != 'accounts' and not deleting:
        check_payment(user, ch, current)
    if c == 'orders' and role == 'procurement':
        # Purchasing reads orders; the one thing it writes is the emergency purchase it started for one.
        if not isinstance(current, dict) or deleting or 'put' in ch:
            raise PermissionError
        after = merged(current, ch)
        if {k for k in set(after) | set(current) if after.get(k) != current.get(k)} - {'emergencyPO', 'updatedAt'}:
            raise PermissionError
        return None
    if c == 'followUps' and isinstance(current, dict) and not deleting:
        after = merged(current, ch)
        closing = after.get('status') in ('done', 'closed') and current.get('status') not in ('done', 'closed')
        if closing and (current.get('escalated') or current.get('type') == 'Manager call-back') and role != 'sales_manager':
            raise PermissionError
        if closing and current.get('type') == 'Complaint' and role != 'service_manager':
            raise PermissionError
    if c == 'customers' and isinstance(current, dict) and not deleting and role not in IDENTITY_ROLES:
        after = merged(current, ch)
        if any(str(after.get(f) or '') != str(current.get(f) or '') for f in IDENTITY_FIELDS) and has_bought(db, current, rid):
            raise PermissionError
    if c == 'vehicles' and role == 'sales':
        check_vehicle_for_seller(db, user, ch, current)
        return None
    if a == ALL:
        if deleting and c in PROTECTED:
            raise PermissionError
        return None
    if a == OWN:
        if deleting:
            if c in PROTECTED:
                raise PermissionError
        if current is not None and not owns(user, c, current):
            raise PermissionError
        if not deleting:
            after = merged(current, ch)
            if not owns(user, c, after):
                raise PermissionError
        return None
    raise PermissionError


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def merged(current, ch):
    if 'put' in ch:
        return ch['put']
    value = dict(current) if isinstance(current, dict) else {}
    value.update(ch.get('set') or {})
    for f in ch.get('unset') or []:
        value.pop(f, None)
    # Counters (parts on hand / reserved) travel as increments, so two people moving stock at once both count.
    inc = ch.get('inc') if isinstance(ch.get('inc'), dict) else {}
    for f, d in inc.items():
        if is_number(d):
            value[f] = (value.get(f) if is_number(value.get(f)) else 0) + d
    return value


def check_approval(db, user, ch, current):
    sid = user.get('staffId')
    if ch.get('del'):
        raise PermissionError
    after = merged(current, ch)
    if not isinstance(after, dict):
        raise PermissionError
    if current is None:
        # A new request: it is the asker's own, and the server decides who approves it.
        if not sid or after.get('ownerId') != sid:
            raise PermissionError
        roles = approver_roles(db, after.get('type'), after.get('amount'))
        after['approverRoles'] = roles
        if after.get('status') != 'pending' and user['role'] not in roles:
            raise PermissionError
        return after
    changed = {k for k in set(after) | set(current) if after.get(k) != current.get(k)}
    if current.get('status') == 'pending' and user['role'] in (current.get('approverRoles') or []) and current.get('ownerId') != sid:
        if changed - DECISION_FIELDS:
            raise PermissionError
        return None
    if owns(user, 'approvals', current) and current.get('status') == 'pending':
        if changed - {'status', 'note', 'updatedAt'} or after.get('status') not in ('pending', 'cancelled'):
            raise PermissionError
        return None
    raise PermissionError


def replace_all(db, data):
    """Swap the whole data set (restore a backup, load demo data, start fresh)."""
    if not isinstance(data, dict):
        raise ValueError('Data must be an object')
    db.execute('DELETE FROM records')
    rev = next_rev(db)
    rows = []
    for key, value in data.items():
        if not NAME_RE.match(str(key)):
            continue
        if key == 'counters':
            continue
        if isinstance(value, list):
            for i, rec in enumerate(value):
                if isinstance(rec, dict) and rec.get('id') is not None:
                    rows.append((key, str(rec['id']), json.dumps(rec, separators=(',', ':')), rev, float(i)))
        else:
            rows.append(('_doc', key, json.dumps(strip_local('_doc', key, value), separators=(',', ':')), rev, 0.0))
    db.executemany('INSERT INTO records(c, id, data, rev, ord) VALUES(?,?,?,?,?) '
                   'ON CONFLICT(c, id) DO UPDATE SET data=excluded.data, rev=excluded.rev, ord=excluded.ord', rows)
    counters = data.get('counters') if isinstance(data.get('counters'), dict) else {}
    counters = {k: int(v) for k, v in counters.items() if PREFIX_RE.match(str(k)) and isinstance(v, (int, float))}
    # Document numbers never go backwards, so a restored backup cannot repeat a receipt or invoice number.
    try:
        before = json.loads(kv_get(db, 'counters', '{}'))
    except ValueError:
        before = {}
    for k, v in before.items():
        if PREFIX_RE.match(str(k)) and isinstance(v, (int, float)):
            counters[k] = max(int(v), counters.get(k, 0))
    kv_set(db, 'counters', json.dumps(counters))
    kv_set(db, 'epoch', secrets.token_hex(6))
    ensure_owners(db, rev)
    ensure_policy_start(db)
    return rev


def ensure_owners(db, rev=None):
    """Older data has no ownerId on sales records: give each one to its consultant (mirrors NA.migrateOwners)."""
    def load(c):
        return {rid: json.loads(d) for rid, d in db.execute('SELECT id, data FROM records WHERE c=? AND data IS NOT NULL', (c,))}
    cols = {c: load(c) for c in ('leads', 'orders', 'payments', 'warranties', 'invoices', 'customers', 'followUps', 'attendance', 'leaves', 'targets')}
    orders = cols['orders']

    def order_owner(oid):
        o = orders.get(oid) or {}
        return o.get('ownerId') or o.get('consultantId')

    latest = {}
    for c in ('leads', 'orders'):
        for r in cols[c].values():
            cid, con = r.get('customerId'), r.get('consultantId')
            if not cid or not con:
                continue
            is_order = c == 'orders'
            prev = latest.get(cid)
            if not prev or (is_order and not prev[2]) or (is_order == prev[2] and str(r.get('createdAt')) > str(prev[1])):
                latest[cid] = (con, r.get('createdAt'), is_order)
    rules = {
        'leads': lambda r: r.get('consultantId'),
        'orders': lambda r: r.get('consultantId'),
        'payments': lambda r: order_owner(r.get('orderId')),
        'warranties': lambda r: order_owner(r.get('orderId')),
        'invoices': lambda r: order_owner(r.get('refId')) if r.get('kind') == 'vehicle' else None,
        'customers': lambda r: (latest.get(r.get('id')) or (None,))[0],
        'followUps': lambda r: (latest.get(r.get('customerId')) or (None,))[0],
        'attendance': lambda r: r.get('staffId'),
        'leaves': lambda r: r.get('staffId'),
        'targets': lambda r: r.get('staffId'),
    }
    fixed = []
    for c, rule in rules.items():
        for rid, r in cols[c].items():
            if isinstance(r, dict) and r.get('ownerId') is None:
                owner = rule(r)
                if owner:
                    r['ownerId'] = owner
                    fixed.append((c, rid, r))
    if fixed:
        rev = rev or next_rev(db)
        for c, rid, r in fixed:
            db.execute('UPDATE records SET data=?, rev=? WHERE c=? AND id=?', (json.dumps(r, separators=(',', ':')), rev, c, rid))
    return len(fixed)


def ensure_policy_start(db):
    """Approval rules start today: orders made before this are not held up by them."""
    row = db.execute("SELECT data FROM records WHERE c='_doc' AND id='settings'").fetchone()
    if not row or row[0] is None:
        return
    st = json.loads(row[0])
    if isinstance(st, dict) and not st.get('policyStart'):
        st['policyStart'] = datetime.date.today().isoformat()
        db.execute("UPDATE records SET data=?, rev=? WHERE c='_doc' AND id='settings'", (json.dumps(st, separators=(',', ':')), next_rev(db)))


def full_db_json(db, user):
    """The data set this person may see, as one JSON text."""
    parts = {}
    docs = []
    everything = user['role'] == 'owner'
    for c, rid, data in db.execute('SELECT c, id, data FROM records WHERE data IS NOT NULL ORDER BY c, ord, rowid'):
        if not everything:
            rec = json.loads(data)
            if not visible(user, c, rid, rec, db):
                continue
            if needs_redact(user, c):
                data = json.dumps(redact(user, c, rec), separators=(',', ':'))
        if c == '_doc':
            docs.append(json.dumps(rid) + ':' + data)
        else:
            parts.setdefault(c, []).append(data)
    body = docs + [json.dumps(c) + ':[' + ','.join(items) + ']' for c, items in parts.items()]
    return '{' + ','.join(body) + '}'


def outgoing(user, c, rid, data, db=None):
    """One changed record as this person should receive it: null when they may not see it."""
    if data is None:
        return 'null'
    if user['role'] == 'owner':
        return data
    rec = json.loads(data)
    if not visible(user, c, rid, rec, db):
        return 'null'
    return json.dumps(redact(user, c, rec), separators=(',', ':')) if needs_redact(user, c) else data


def stamp_cost_at_sale(db, inv):
    """A car's sales invoice keeps what the car cost us on the day, so its margin never moves later. The server fills it
    in because the consultant who hands the car over cannot see costs."""
    if inv.get('kind') != 'vehicle' or is_number(inv.get('costAtSale')) or not inv.get('refId'):
        return
    row = db.execute("SELECT data FROM records WHERE c='orders' AND id=?", (str(inv['refId']),)).fetchone()
    order = json.loads(row[0]) if row and row[0] else {}
    vid = order.get('vehicleId')
    row = db.execute("SELECT data FROM records WHERE c='vehicles' AND id=?", (str(vid),)).fetchone() if vid else None
    car = json.loads(row[0]) if row and row[0] else {}
    cost = car.get('landedCost') if is_number(car.get('landedCost')) and car.get('landedCost') else car.get('cost')
    if is_number(cost) and cost:
        inv['costAtSale'] = cost


def stamp_stock_adjust_value(db, appr):
    """A stock count asked for by someone who cannot see costs arrives without its value: the server fills it in from
    the part's cost, so the Managing Director sees the amount as soon as the request arrives."""
    if appr.get('type') != 'stock_adjust' or appr.get('refC') != 'parts' or num(appr.get('amount')) > 0:
        return
    data = appr.get('data') if isinstance(appr.get('data'), dict) else {}
    delta = num(data.get('delta'))
    row = db.execute("SELECT data FROM records WHERE c='parts' AND id=?", (str(appr.get('refId') or ''),)).fetchone()
    part = json.loads(row[0]) if row and row[0] else {}
    cost = part.get('cost') if is_number(part.get('cost')) and part.get('cost') else part.get('avgCost')
    if delta and is_number(cost) and cost:
        appr['amount'] = appr['value'] = round(abs(delta) * cost, 2)


def apply_change(db, ch, rev, user):
    """Apply one change from a browser. Returns False when this person may not make it."""
    c, rid = ch.get('c'), ch.get('id')
    if not isinstance(c, str) or not NAME_RE.match(c) or c == 'counters':
        raise ValueError('Bad collection name')
    if not isinstance(rid, str) or not 0 < len(rid) <= 120:
        raise ValueError('Bad record id')
    row = db.execute('SELECT data, ord FROM records WHERE c=? AND id=?', (c, rid)).fetchone()
    current = json.loads(row[0]) if row and row[0] is not None else None
    try:
        override = check_change(db, user, ch, current)
    except PermissionError:
        return False
    if ch.get('del'):
        if row and row[0] is not None:
            db.execute('UPDATE records SET data=NULL, rev=? WHERE c=? AND id=?', (rev, c, rid))
        return True
    value = override if override is not None else merged(current, ch)
    if c == 'invoices' and current is None and isinstance(value, dict):
        stamp_cost_at_sale(db, value)
    if c == 'approvals' and current is None and isinstance(value, dict):
        stamp_stock_adjust_value(db, value)
    # Fields hidden from this person must survive their edit.
    if isinstance(current, dict) and isinstance(value, dict) and user['role'] != 'owner':
        for f in hidden_fields(user, c, current):
            if f in current:
                value[f] = current[f]
        if user['role'] not in COST_ROLES:
            for f, keys in REDACT_NESTED.get(c, {}).items():
                restore_nested(current.get(f), value.get(f), keys)
    value = strip_local(c, rid, value)
    data = json.dumps(value, separators=(',', ':'))
    if row:
        db.execute('UPDATE records SET data=?, rev=? WHERE c=? AND id=?', (data, rev, c, rid))
    else:
        # New records go to the front of their list, like the app does locally.
        low = db.execute('SELECT MIN(ord) FROM records WHERE c=?', (c,)).fetchone()[0]
        db.execute('INSERT INTO records(c, id, data, rev, ord) VALUES(?,?,?,?,?)',
                   (c, rid, data, rev, (low if low is not None else 0) - 1))
    return True


# --------------------------------------------------------------------------- people
def hash_pin(pin, salt):
    return hashlib.pbkdf2_hmac('sha256', pin.encode(), bytes.fromhex(salt), 150000).hex()


def has_left(db, staff_id):
    """Marked as left on the People screen (staff.active is false)."""
    if not staff_id:
        return False
    row = db.execute("SELECT data FROM records WHERE c='staff' AND id=?", (str(staff_id),)).fetchone()
    try:
        return bool(row and row[0] and json.loads(row[0]).get('active') is False)
    except ValueError:
        return False


def staff_records(db):
    return [json.loads(d) for (d,) in db.execute("SELECT data FROM records WHERE c='staff' AND data IS NOT NULL")]


def staff_by_name(db, name):
    low = name.strip().lower()
    for s in staff_records(db):
        if isinstance(s, dict) and str(s.get('name') or '').strip().lower() == low:
            return s
    return None


def set_user(db, name, pin=None, admin=None, role=None, staff_id=None):
    row = db.execute('SELECT salt, hash, admin, role, staff_id FROM users WHERE name=?', (name,)).fetchone()
    if role is not None and role not in ROLES:
        raise ValueError('Unknown role')
    if row is None:
        if not pin:
            raise ValueError('A PIN is needed for a new person')
        if staff_id:
            st = next((x for x in staff_records(db) if isinstance(x, dict) and x.get('id') == staff_id), None)
        else:
            st = staff_by_name(db, name)
            staff_id = st.get('id') if st else None
        if role is None:
            role = 'owner' if admin else role_for_title(st.get('role') if st else '')
        salt = secrets.token_hex(16)
        db.execute('INSERT INTO users(name, salt, hash, admin, created, role, staff_id) VALUES(?,?,?,?,?,?,?)',
                   (name, salt, hash_pin(pin, salt), 1 if (admin or role == 'owner') else 0,
                    datetime.datetime.now().isoformat(timespec='seconds'), role, staff_id or None))
        return
    signout = False
    if pin:
        salt = secrets.token_hex(16)
        db.execute('UPDATE users SET salt=?, hash=? WHERE name=?', (salt, hash_pin(pin, salt), name))
        signout = True
    if admin is not None:
        db.execute('UPDATE users SET admin=? WHERE name=?', (1 if admin else 0, name))
    if role is not None and role != row[3]:
        db.execute('UPDATE users SET role=? WHERE name=?', (role, name))
        if role == 'owner':
            db.execute('UPDATE users SET admin=1 WHERE name=?', (name,))
        signout = True   # what they may see has changed: they sign in again and get the right data
    if staff_id is not None and staff_id != row[4]:
        db.execute('UPDATE users SET staff_id=? WHERE name=?', (staff_id or None, name))
        signout = True
    if signout:
        db.execute('DELETE FROM sessions WHERE name=?', (name,))


def upgrade_users(db):
    """Sign-ins made before roles existed: take the role from the staff list."""
    for name, admin in db.execute('SELECT name, admin FROM users WHERE role IS NULL').fetchall():
        st = staff_by_name(db, name)
        role = 'owner' if admin else role_for_title(st.get('role') if st else '')
        db.execute('UPDATE users SET role=?, staff_id=? WHERE name=?', (role, st.get('id') if st else None, name))


def new_session(db, name):
    token = secrets.token_urlsafe(32)
    now = time.time()
    db.execute('INSERT INTO sessions(token, name, created, last_seen) VALUES(?,?,?,?)', (token, name, now, now))
    db.execute('DELETE FROM sessions WHERE last_seen < ?', (now - SESSION_DAYS * 86400,))
    return token


def online_names(db):
    rows = db.execute('SELECT DISTINCT s.name FROM sessions s JOIN users u ON u.name = s.name WHERE s.last_seen > ?',
                      (time.time() - ONLINE_SECONDS,)).fetchall()
    return sorted(r[0] for r in rows)


def clean_name(v):
    name = ' '.join(str(v or '').split())
    if not 1 <= len(name) <= 60:
        raise ValueError('Enter a name (up to 60 characters)')
    return name


# On a server reachable from the internet, set NA_MIN_PIN=6 (or 8) so short PINs cannot be chosen (online it starts at 6).
MIN_PIN = min(8, max(4, int(os.environ.get('NA_MIN_PIN') or (6 if HOSTED else 4))))


def clean_pin(v):
    pin = str(v or '').strip()
    if not PIN_RE.match(pin) or len(pin) < MIN_PIN:
        raise ValueError('The PIN must be %d to 8 digits' % MIN_PIN if MIN_PIN > 4 else 'The PIN must be 4 to 8 digits')
    return pin


# --------------------------------------------------------------------------- backups
COLLECTIONS = ('models', 'staff', 'vendors', 'customers', 'leads', 'orders', 'payments',
               'vehicles', 'purchaseOrders', 'vendorPayments', 'warranties', 'serviceBookings',
               'jobCards', 'invoices', 'parts', 'followUps', 'expenses', 'attendance', 'assets',
               'compliance', 'activity', 'approvals', 'leaves', 'targets', 'partOrders', 'vatReturns')


def backup_file_json(db):
    """Everything, as the same file Settings > Data > Download backup makes, so it restores the same way."""
    data = json.loads(full_db_json(db, {'role': 'owner'}))
    # Restoring expects every kind of record to be there, even with none in it yet (mirrors NA.COLLECTIONS).
    for c in COLLECTIONS:
        data.setdefault(c, [])
    data.setdefault('settings', {})
    data['counters'] = json.loads(kv_get(db, 'counters', '{}'))
    data['meta'] = dict(data.get('meta') if isinstance(data.get('meta'), dict) else {}, app='Noor Autos DMS', by='Daily server backup',
                        exportedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
    return json.dumps(data, separators=(',', ':'))


def pg_backup(db, label=None):
    """Online there are no files to keep: copies go in their own table. Same limits as the files on the office server."""
    stamp = datetime.date.today().isoformat()
    name = 'noor-dms-%s.json' % stamp if not label else 'noor-dms-%s-%s-%s.json' % (stamp, datetime.datetime.now().strftime('%H%M%S'), label)
    blob = gzip.compress(backup_file_json(db).encode('utf-8'))
    daily = 0 if label else 1
    db.execute('INSERT INTO backups(name, at, daily, data) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at, data=excluded.data',
               (name, time.time(), daily, blob))
    db.execute('DELETE FROM backups WHERE daily=? AND name NOT IN (SELECT name FROM backups WHERE daily=? ORDER BY at DESC LIMIT ?)',
               (daily, daily, KEEP_BACKUPS))
    return name


def pg_daily_backup(db):
    """No background work runs online, so the first person to open the app each day makes that day's copy."""
    name = 'noor-dms-%s.json' % datetime.date.today().isoformat()
    if PG and has_data(db) and not db.execute('SELECT 1 FROM backups WHERE name=?', (name,)).fetchone():
        pg_backup(db)


def backup(label=None):
    if PG:
        with tx() as db:
            return pg_backup(db, label)
    import sqlite3
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.date.today().isoformat()
    name = 'noor-dms-%s.sqlite' % stamp if not label else 'noor-dms-%s-%s-%s.sqlite' % (stamp, datetime.datetime.now().strftime('%H%M%S'), label)
    dest = os.path.join(BACKUP_DIR, name)
    with lock:
        out = sqlite3.connect(dest)
        try:
            conn.backup(out)
        finally:
            out.close()
    daily = sorted(glob.glob(os.path.join(BACKUP_DIR, 'noor-dms-????-??-??.sqlite')))
    for old in daily[:-KEEP_BACKUPS]:
        os.remove(old)
    extra = sorted(glob.glob(os.path.join(BACKUP_DIR, 'noor-dms-*-*-*-*.sqlite')))
    for old in extra[:-KEEP_BACKUPS]:
        os.remove(old)
    return dest


def backup_loop():
    while True:
        try:
            today = os.path.join(BACKUP_DIR, 'noor-dms-%s.sqlite' % datetime.date.today().isoformat())
            if not os.path.exists(today):
                with lock:
                    worth_it = has_data(conn)
                if worth_it:
                    backup()
        except Exception as e:  # never let backups stop the server
            print('Backup failed:', e, file=sys.stderr)
        time.sleep(600)


# --------------------------------------------------------------------------- HTTP
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Api:
    """What every API route needs from a request, however the request arrived."""
    def send_json(self, status, obj=None, raw=None, cookie=None):
        body = (raw if raw is not None else json.dumps(obj, separators=(',', ':'))).encode('utf-8')
        headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store')]
        # Online, one answer can carry only 4.5 MB, so large ones (all the data at sign-in) travel compressed.
        if len(body) > 65536 and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
            body = gzip.compress(body, 6)
            headers.append(('Content-Encoding', 'gzip'))
        if cookie is not None:
            secure = '; Secure' if self.headers.get('X-Forwarded-Proto') == 'https' else ''
            if cookie:
                headers.append(('Set-Cookie', '%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Strict%s' % (COOKIE, cookie, SESSION_DAYS * 86400, secure)))
            else:
                headers.append(('Set-Cookie', '%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict%s' % (COOKIE, secure)))
        self.respond(status, headers, body)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise ApiError(413, 'That is too much data to send at once')
        if not n:
            return {}
        try:
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except ValueError:
            raise ApiError(400, 'Request was not valid JSON')
        if not isinstance(data, dict):
            raise ApiError(400, 'Request must be a JSON object')
        return data

    def token(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == COOKIE:
                return v
        return None

    def user(self, db):
        """The signed-in person, or None. Also marks them as online."""
        t = self.token()
        if not t:
            return None
        row = db.execute('SELECT s.name, u.admin, s.last_seen, u.role, u.staff_id FROM sessions s JOIN users u ON u.name = s.name WHERE s.token=?', (t,)).fetchone()
        if not row:
            return None
        now = time.time()
        if now - row[2] > 5:
            db.execute('UPDATE sessions SET last_seen=? WHERE token=?', (now, t))
        role = row[3] if row[3] in ROLES else ('owner' if row[1] else 'sales')
        if role != 'owner' and not row[1] and has_left(db, row[4]):
            db.execute('DELETE FROM sessions WHERE token=?', (t,))
            return None
        return {'name': row[0], 'admin': bool(row[1]) or role == 'owner', 'role': role, 'staffId': row[4]}

    def need_user(self, db, admin=False):
        u = self.user(db)
        if not u:
            raise ApiError(401, 'Please sign in')
        if admin and not u['admin']:
            raise ApiError(403, 'Only an administrator can do this')
        return u

    def api(self, method, path):
        try:
            # The app always sends this header; other websites cannot, which blocks cross-site requests.
            if method == 'POST' and self.headers.get('X-NA') != '1':
                raise ApiError(403, 'Missing request header')
            handler = ROUTES.get((method, path))
            if not handler:
                raise ApiError(404, 'Unknown address')
            if not prepared:
                if not PG:
                    # No database yet: the app runs as a demo, with sample data kept in each visitor's own browser.
                    if path == '/api/status':
                        return self.send_json(200, {'shared': False, 'demo': True})
                    raise ApiError(503, 'No database is connected. Add DATABASE_URL to this project (see VERCEL.md).')
                prepare_db()
            handler(self)
        except ApiError as e:
            self.send_json(e.status, {'error': e.message})
        except ValueError as e:
            self.send_json(400, {'error': str(e)})
        except Exception as e:  # keep the server running whatever happens
            self.log_error('API error on %s: %r', path, e)
            # Online, details of the database stay in the logs, away from the open internet.
            self.send_json(500, {'error': 'Server error. Please try again.' if HOSTED else 'Server error: %s' % e})


class WsgiHeaders:
    def __init__(self, environ):
        self.environ = environ

    def get(self, name):
        key = name.upper().replace('-', '_')
        return self.environ.get(key if key in ('CONTENT_LENGTH', 'CONTENT_TYPE') else 'HTTP_' + key)


class WsgiRequest(Api):
    def __init__(self, environ):
        query = environ.get('QUERY_STRING')
        self.path = (environ.get('PATH_INFO') or '/') + ('?' + query if query else '')
        self.headers = WsgiHeaders(environ)
        self.rfile = environ['wsgi.input']
        self.result = None

    def respond(self, status, headers, body):
        self.result = (status, headers, body)

    def log_error(self, fmt, *args):
        sys.stderr.write((fmt % args) + '\n')


def app(environ, start_response):
    """Entry point when a hosting platform runs this file (Vercel: see api/index.py). Pages are served by the platform."""
    req = WsgiRequest(environ)
    path = environ.get('PATH_INFO') or '/'
    if path == '/api/index':    # the platform may show the rewritten address: vercel.json passes the real one along
        path = '/api/' + (parse_qs(environ.get('QUERY_STRING') or '').get('path') or [''])[0]
    req.api(environ['REQUEST_METHOD'], path)
    status, headers, body = req.result
    start_response('%d %s' % (status, http.client.responses.get(status, '')),
                   headers + [('Content-Length', str(len(body))), ('X-Content-Type-Options', 'nosniff')])
    return [body]


class Handler(Api, http.server.SimpleHTTPRequestHandler):
    server_version = 'NoorAutosDMS/1.0'

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # quieter log: only problems
    def log_message(self, fmt, *args):
        pass

    def log_error(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    # ---- static files (never the database or this program)
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            return self.api('GET', path)
        low = path.lower()
        if low.startswith('/data') or low.endswith(('.py', '.sqlite', '.command', '.bat')) or '/.' in low:
            return self.send_error(404)
        if path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_HEAD(self):
        return self.send_error(405)

    def do_POST(self):
        path = urlparse(self.path).path
        if not path.startswith('/api/'):
            return self.send_error(405)
        return self.api('POST', path)

    def respond(self, status, headers, body):
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def r_status(h):
    with tx() as db:
        u = h.user(db)
        setup = db.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 0
    h.send_json(200, {'shared': True, 'setup': setup, 'user': u, 'minPin': MIN_PIN})


def r_login_names(h):
    with tx() as db:
        names = [r[0] for r in db.execute('SELECT name FROM users ORDER BY name COLLATE NOCASE')]
    h.send_json(200, {'names': names})


def r_setup(h):
    b = h.body()
    name, pin = clean_name(b.get('name')), clean_pin(b.get('pin'))
    with tx() as db:
        if db.execute('SELECT COUNT(*) FROM users').fetchone()[0]:
            raise ApiError(409, 'The system is already set up. Please sign in.')
        if isinstance(b.get('db'), dict):
            replace_all(db, b['db'])
        set_user(db, name, pin, admin=True)
        token = new_session(db, name)
    h.send_json(200, {'ok': True}, cookie=token)


def r_login(h):
    b = h.body()
    name, pin = clean_name(b.get('name')), str(b.get('pin') or '')
    key = 'failed_login:' + name.lower()
    with tx() as db:
        row = db.execute('SELECT name, salt, hash, admin, role, staff_id FROM users WHERE name=?', (name,)).fetchone()
        # Kept in the database: online, each attempt may reach a different server instance.
        count, until = json.loads(kv_get(db, key, '[0, 0]'))
        if row is not None and until > time.time():
            raise ApiError(429, 'Too many wrong PINs. Try again in %d minutes.' % max(1, round((until - time.time()) / 60)))
        ok = row is not None and hmac.compare_digest(hash_pin(pin, row[1]), row[2])
        if ok and not row[3] and row[4] != 'owner' and has_left(db, row[5]):
            raise ApiError(403, 'This sign-in is turned off because %s has left the company.' % row[0])
        if ok:
            db.execute('DELETE FROM kv WHERE k=?', (key,))
            token = new_session(db, row[0])
        elif row is not None:
            count += 1
            kv_set(db, key, json.dumps([0, time.time() + 300] if count >= 5 else [count, 0]))
    if not ok:
        raise ApiError(401, 'Wrong name or PIN' + ('. Locked for 5 minutes.' if count >= 5 else ''))
    h.send_json(200, {'ok': True}, cookie=token)


def r_logout(h):
    t = h.token()
    if t:
        with tx() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (t,))
    h.send_json(200, {'ok': True}, cookie='')


def r_db(h):
    with tx() as db:
        u = h.need_user(db)
        raw = full_db_json(db, u)
        rev = int(kv_get(db, 'rev', '0'))
        meta = {'epoch': epoch(db), 'rev': rev, 'counters': json.loads(kv_get(db, 'counters', '{}')), 'me': u, 'online': online_names(db)}
        if HOSTED:
            meta['hosted'] = {'pollMs': HOSTED_POLL_MS, 'maxPart': HOSTED_MAX_PART}
        pg_daily_backup(db)
    h.send_json(200, raw='{"db":%s,%s' % (raw, json.dumps(meta, separators=(',', ':'))[1:]))


def r_sync(h):
    b = h.body()
    changes = b.get('changes') or []
    if not isinstance(changes, list):
        raise ApiError(400, 'changes must be a list')
    since = int(b.get('since') or 0)
    refused = []
    with tx() as db:
        u = h.need_user(db)
        current = epoch(db)
        if b.get('epoch') != current:
            # Someone restored a backup or reset the data: start over from the new data set.
            h.send_json(200, {'reload': True, 'epoch': current})
            return
        if changes:
            rev = next_rev(db)
            now = time.time()
            for ch in changes:
                if not isinstance(ch, dict):
                    continue
                if not apply_change(db, ch, rev, u):
                    refused.append((ch.get('c'), ch.get('id')))
                elif ch.get('c') != 'activity':
                    op = 'delete' if ch.get('del') else ('create' if 'put' in ch else 'edit')
                    fields = None if op != 'edit' else ','.join(sorted(list((ch.get('set') or {}).keys()) + list(ch.get('unset') or []) + list((ch.get('inc') or {}).keys() if isinstance(ch.get('inc'), dict) else [])))[:400]
                    db.execute('INSERT INTO audit(at, name, c, id, op, fields) VALUES(?,?,?,?,?,?)', (now, u['name'], ch.get('c'), ch.get('id'), op, fields))
        rows = db.execute('SELECT c, id, data FROM records WHERE rev > ? ORDER BY rev', (since,)).fetchall()
        # Put refused records back the way they really are on this person's screen.
        seen = {(c, rid) for c, rid, _ in rows}
        for c, rid in refused:
            if (c, rid) not in seen:
                row = db.execute('SELECT data FROM records WHERE c=? AND id=?', (c, rid)).fetchone()
                rows.append((c, rid, row[0] if row else None))
        now_rev = int(kv_get(db, 'rev', '0'))
        online = online_names(db)
        items = ['{"c":%s,"id":%s,"data":%s}' % (json.dumps(c), json.dumps(rid), outgoing(u, c, rid, data, db)) for c, rid, data in rows]
    h.send_json(200, raw='{"rev":%d,"online":%s,"refused":%d,"changes":[%s]}' % (now_rev, json.dumps(online), len(refused), ','.join(items)))


def digits(v):
    return re.sub(r'\D', '', str(v or ''))[-10:]


def r_lookup(h):
    """Is this mobile number already a customer or lead? Answers without showing other people's records."""
    b = h.body()
    mobile = digits(b.get('mobile'))
    if len(mobile) < 8:
        h.send_json(200, {'matches': []})
        return
    with tx() as db:
        u = h.need_user(db)
        names = {s.get('id'): s.get('name') for s in staff_records(db) if isinstance(s, dict)}
        out = []
        for c in ('customers', 'leads'):
            for rid, data in db.execute('SELECT id, data FROM records WHERE c=? AND data IS NOT NULL', (c,)):
                r = json.loads(data)
                if not isinstance(r, dict) or digits(r.get('mobile')) != mobile:
                    continue
                owner = r.get('ownerId') or r.get('consultantId')
                mine = bool(u.get('staffId')) and owner == u.get('staffId')
                seeable = visible(u, c, rid, r, db)
                out.append({'kind': 'customer' if c == 'customers' else 'lead', 'id': rid if seeable else None,
                            'name': r.get('name') if seeable else None, 'stage': r.get('stage') if c == 'leads' else None,
                            'ownerId': owner, 'ownerName': names.get(owner) or 'nobody yet', 'mine': mine})
    h.send_json(200, {'matches': out})


def r_lookup_ref(h):
    """Was this cheque / transfer reference used on another receipt? Answers without customer details."""
    b = h.body()
    ref = re.sub(r'\s+', '', str(b.get('ref') or '')).upper()
    if len(ref) < 3:
        h.send_json(200, {'matches': []})
        return
    with tx() as db:
        h.need_user(db)
        out = []
        for (d,) in db.execute("SELECT data FROM records WHERE c='payments' AND data IS NOT NULL"):
            p = json.loads(d)
            if isinstance(p, dict) and re.sub(r'\s+', '', str(p.get('ref') or '')).upper() == ref:
                out.append({'id': p.get('id'), 'receiptNo': p.get('receiptNo'), 'date': p.get('date'), 'amount': p.get('amount'),
                            'method': p.get('method'), 'status': p.get('status')})
    h.send_json(200, {'matches': out})


def r_next_code(h):
    b = h.body()
    prefix = str(b.get('prefix') or '')
    if not PREFIX_RE.match(prefix):
        raise ApiError(400, 'Bad number prefix')
    with tx() as db:
        h.need_user(db)
        counters = json.loads(kv_get(db, 'counters', '{}'))
        n = int(counters.get(prefix, 0)) + 1
        counters[prefix] = n
        kv_set(db, 'counters', json.dumps(counters))
    h.send_json(200, {'n': n})


def r_replace_part(h):
    """One piece of a restore too large for a single request. /api/replace puts the pieces together."""
    b = h.body()
    upload, i = str(b.get('upload') or ''), b.get('i')
    if not re.match(r'^[a-z0-9]{8,32}$', upload) or not isinstance(i, int) or not isinstance(b.get('text'), str):
        raise ApiError(400, 'Bad upload')
    with tx() as db:
        h.need_user(db, admin=True)
        kv_set(db, 'upload:%s:%06d' % (upload, i), json.dumps(b['text']))
    h.send_json(200, {'ok': True})


def r_replace(h):
    b = h.body()
    upload = str(b.get('upload') or '')
    if not isinstance(b.get('db'), dict) and not re.match(r'^[a-z0-9]{8,32}$', upload):
        raise ApiError(400, 'No data sent')
    with tx() as db:
        u = h.need_user(db, admin=True)
        if upload:
            parts = db.execute('SELECT v FROM kv WHERE k LIKE ? ORDER BY k', ('upload:%s:%%' % upload,)).fetchall()
            if len(parts) != b.get('n'):
                raise ApiError(400, 'Part of the data did not arrive. Please try again.')
            b['db'] = json.loads(''.join(json.loads(p[0]) for p in parts))
            if not isinstance(b['db'], dict):
                raise ApiError(400, 'No data sent')
    backup('before-replace')
    with tx() as db:
        replace_all(db, b['db'])
        db.execute('DELETE FROM kv WHERE k LIKE ?', ('upload:%',))
        out = {'epoch': epoch(db), 'rev': int(kv_get(db, 'rev', '0'))}
    print('All data replaced by %s' % u['name'])
    h.send_json(200, out)


def r_backups(h):
    """The copies kept online (the office server keeps its copies as files instead)."""
    if not PG:
        raise ApiError(404, 'Unknown address')
    with tx() as db:
        h.need_user(db, admin=True)
        rows = db.execute('SELECT name, at, daily, length(data) FROM backups ORDER BY at DESC').fetchall()
    h.send_json(200, {'backups': [{'name': n, 'at': datetime.datetime.fromtimestamp(a).isoformat(timespec='minutes'), 'daily': bool(d), 'size': z}
                                  for n, a, d, z in rows]})


def r_backup_download(h):
    if not PG:
        raise ApiError(404, 'Unknown address')
    name = (parse_qs(urlparse(h.path).query).get('name') or [''])[0]
    with tx() as db:
        h.need_user(db, admin=True)
        row = db.execute('SELECT data FROM backups WHERE name=?', (name,)).fetchone()
    if not row:
        raise ApiError(404, 'That backup is no longer kept')
    headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store'),
               ('Content-Disposition', 'attachment; filename="%s"' % re.sub(r'[^A-Za-z0-9._-]', '', name))]
    if 'gzip' in (h.headers.get('Accept-Encoding') or ''):
        h.respond(200, headers + [('Content-Encoding', 'gzip')], bytes(row[0]))
    else:
        h.respond(200, headers, gzip.decompress(bytes(row[0])))


def r_users(h):
    with tx() as db:
        h.need_user(db, admin=True)
        online = set(online_names(db))
        last = dict(db.execute('SELECT name, MAX(last_seen) FROM sessions GROUP BY name').fetchall())
        users = [{'name': n, 'admin': bool(a), 'created': c, 'online': n in online, 'role': r or ('owner' if a else 'sales'), 'staffId': sid,
                  'lastSeen': datetime.datetime.fromtimestamp(last[n]).isoformat(timespec='minutes') if last.get(n) else None}
                 for n, a, c, r, sid in db.execute('SELECT name, admin, created, role, staff_id FROM users ORDER BY name COLLATE NOCASE')]
    h.send_json(200, {'users': users})


def r_user_save(h):
    b = h.body()
    name = clean_name(b.get('name'))
    pin = clean_pin(b.get('pin')) if b.get('pin') else None
    role = b.get('role')
    if role is not None and role not in ROLES:
        raise ApiError(400, 'Unknown role')
    staff_id = b.get('staffId')
    if staff_id is not None and not isinstance(staff_id, str):
        raise ApiError(400, 'Bad staff id')
    with tx() as db:
        me = h.need_user(db, admin=True)
        admin = b.get('admin')
        self_edit = name.lower() == me['name'].lower()
        if self_edit and admin is not None and not admin:
            raise ApiError(400, 'You cannot remove your own administrator rights')
        if self_edit and role is not None and role != me['role']:
            raise ApiError(400, 'Ask another administrator to change your own role')
        if b.get('create') and db.execute('SELECT 1 FROM users WHERE name=?', (name,)).fetchone():
            raise ApiError(409, '%s can already sign in' % name)
        set_user(db, name, pin, None if admin is None else bool(admin), role, staff_id)
    h.send_json(200, {'ok': True})


def r_user_delete(h):
    b = h.body()
    name = clean_name(b.get('name'))
    with tx() as db:
        me = h.need_user(db, admin=True)
        if name.lower() == me['name'].lower():
            raise ApiError(400, 'You cannot remove yourself')
        db.execute('DELETE FROM users WHERE name=?', (name,))
        db.execute('DELETE FROM sessions WHERE name=?', (name,))
        db.execute('DELETE FROM kv WHERE k=?', ('failed_login:' + name.lower(),))
    h.send_json(200, {'ok': True})


def r_audit(h):
    """The permanent change log (who changed what, when). Managing Director / administrators only."""
    q = parse_qs(urlparse(h.path).query)
    limit = max(1, min(1000, int((q.get('limit') or ['300'])[0] or 300)))
    c = (q.get('c') or [''])[0]
    rid = (q.get('id') or [''])[0]
    before = (q.get('before') or [''])[0]
    before_row = (q.get('beforeRow') or [''])[0]
    sql, args = 'SELECT at, name, c, id, op, fields, rowid FROM audit', []
    where = []
    if before:
        # Older pages: pass 'ts' and 'row' of the last entry you have (row keeps one save from being split).
        try:
            stamp = float(before)
        except ValueError:
            stamp = datetime.datetime.fromisoformat(before).timestamp()
        if before_row.isdigit():
            where.append('(at<? OR (at=? AND rowid<?))'); args += [stamp, stamp, int(before_row)]
        else:
            where.append('at<?'); args.append(stamp)
    if c:
        where.append('c=?'); args.append(c)
    if rid:
        where.append('id=?'); args.append(rid)
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += ' ORDER BY at DESC, rowid DESC LIMIT ?'
    args.append(limit)
    with tx() as db:
        h.need_user(db, admin=True)
        rows = db.execute(sql, args).fetchall()
    h.send_json(200, {'entries': [{'at': datetime.datetime.fromtimestamp(a).isoformat(timespec='seconds'), 'ts': a, 'row': rw, 'name': n, 'c': cc, 'id': i, 'op': op, 'fields': f}
                                  for a, n, cc, i, op, f, rw in rows], 'more': len(rows) == limit})


def r_my_pin(h):
    b = h.body()
    new = clean_pin(b.get('pin'))
    with tx() as db:
        me = h.need_user(db)
        row = db.execute('SELECT salt, hash FROM users WHERE name=?', (me['name'],)).fetchone()
        if not hmac.compare_digest(hash_pin(str(b.get('old') or ''), row[0]), row[1]):
            raise ApiError(400, 'Your current PIN is not right')
        set_user(db, me['name'], new)
        token = new_session(db, me['name'])  # changing a PIN signs out other devices
    h.send_json(200, {'ok': True}, cookie=token)


ROUTES = {
    ('GET', '/api/status'): r_status,
    ('GET', '/api/login-names'): r_login_names,
    ('POST', '/api/setup'): r_setup,
    ('POST', '/api/login'): r_login,
    ('POST', '/api/logout'): r_logout,
    ('GET', '/api/db'): r_db,
    ('POST', '/api/sync'): r_sync,
    ('POST', '/api/lookup'): r_lookup,
    ('POST', '/api/lookup-ref'): r_lookup_ref,
    ('GET', '/api/audit'): r_audit,
    ('POST', '/api/next-code'): r_next_code,
    ('POST', '/api/replace'): r_replace,
    ('POST', '/api/replace-part'): r_replace_part,
    ('GET', '/api/backups'): r_backups,
    ('GET', '/api/backups/download'): r_backup_download,
    ('GET', '/api/users'): r_users,
    ('POST', '/api/users'): r_user_save,
    ('POST', '/api/users/delete'): r_user_delete,
    ('POST', '/api/me/pin'): r_my_pin,
}


def lan_addresses():
    found = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        found.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return [a for a in found if not a.startswith('127.')]


def import_sqlite(path):
    """Move an office server's data file into an empty online database: records, sign-ins and the change log."""
    import pathlib
    import sqlite3
    if not PG:
        sys.exit('Set DATABASE_URL first, to the online database that should receive the data.')
    src = sqlite3.connect(pathlib.Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    prepare_db()
    with tx() as db:
        if db.execute('SELECT 1 FROM users LIMIT 1').fetchone() or has_data(db):
            sys.exit('That database already has data in it. Nothing was changed.')
        db.executemany('INSERT INTO kv(k, v) VALUES(?,?)', src.execute("SELECT k, v FROM kv WHERE k NOT LIKE 'failed_login:%'").fetchall())
        db.executemany('INSERT INTO records(c, id, data, rev, ord) VALUES(?,?,?,?,?)', src.execute('SELECT c, id, data, rev, ord FROM records ORDER BY rowid').fetchall())
        db.executemany('INSERT INTO users(name, salt, hash, admin, created, role, staff_id) VALUES(?,?,?,?,?,?,?)',
                       src.execute('SELECT name, salt, hash, admin, created, role, staff_id FROM users').fetchall())
        db.executemany('INSERT INTO audit(at, name, c, id, op, fields) VALUES(?,?,?,?,?,?)', src.execute('SELECT at, name, c, id, op, fields FROM audit ORDER BY rowid').fetchall())
        counts = [(t, db.execute('SELECT COUNT(*) FROM %s' % t).fetchone()[0]) for t in ('records', 'users', 'audit')]
    src.close()
    print('Imported: ' + ', '.join('%d %s' % (n, t) for t, n in counts))


def main():
    ap = argparse.ArgumentParser(description='Noor Autos DMS shared server')
    ap.add_argument('--port', type=int, default=int(os.environ.get('NA_PORT', 8765)))
    ap.add_argument('--host', default=os.environ.get('NA_HOST', '0.0.0.0'), help='0.0.0.0 = reachable from the office network')
    ap.add_argument('--import-sqlite', metavar='FILE', help='copy an office data file into the database at DATABASE_URL, then stop')
    args = ap.parse_args()

    if args.import_sqlite:
        return import_sqlite(args.import_sqlite)
    prepare_db()
    if not PG:
        threading.Thread(target=backup_loop, daemon=True).start()
    http.server.ThreadingHTTPServer.daemon_threads = True
    try:
        httpd = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        print('Could not start on port %d (%s). Is the server already running?' % (args.port, e.strerror))
        sys.exit(1)

    print('')
    print('  Noor Autos DMS: shared server is running')
    print('  -----------------------------------------')
    print('  On this computer:      http://localhost:%d' % args.port)
    if args.host in ('0.0.0.0', ''):
        for ip in lan_addresses():
            print('  Other office computers: http://%s:%d' % (ip, args.port))
    if PG:
        print('  Data:                  Postgres database (DATABASE_URL)')
    else:
        print('  Data file:             %s' % DB_PATH)
        print('  Daily backups:         %s' % BACKUP_DIR)
    print('')
    print('  Keep this window open while people are working. Press Ctrl+C to stop.')
    print('')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping...')
    finally:
        httpd.server_close()
        conn.close()


if __name__ == '__main__':
    main()
