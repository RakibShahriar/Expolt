/* ==========================================================================
   access.js — who is using the app, what they may see and do.

   Roles follow the dealership's job titles. A Sales Consultant works only
   with their own leads, customers, orders and payments; managers see all.

   In shared mode (server.py) the office server is the real gatekeeper: it
   only ever sends a person the records their role may see, hides cost and
   salary figures from people who should not see them, and refuses changes
   they are not allowed to make. This file mirrors those rules in the
   browser so menus and buttons only offer what will actually work.

   Opened on one computer (no server) the app runs as the Managing Director.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;

  NA.ROLES = {
    owner:         { label: 'Managing Director',   short: 'Owner' },
    sales_manager: { label: 'Sales Manager',       short: 'Sales manager' },
    sales:         { label: 'Sales Consultant',    short: 'Sales' },
    accounts:      { label: 'Accounts',            short: 'Accounts' },
    procurement:   { label: 'Procurement & Stock', short: 'Procurement' },
    service_manager: { label: 'Service Manager',   short: 'Service manager' },
    service:       { label: 'Service',             short: 'Service' },
    hr:            { label: 'Admin & HR',          short: 'Admin & HR' },
  };
  NA.ROLE_KEYS = Object.keys(NA.ROLES);

  const TITLE_ROLE = {
    'Managing Director': 'owner', 'Sales Manager': 'sales_manager', 'Sales Consultant': 'sales',
    'Accounts': 'accounts', 'Procurement': 'procurement', 'Service Manager': 'service_manager', 'Service Advisor': 'service',
    'Technician': 'service', 'Admin & HR': 'hr', 'Driver': 'service',
  };
  /** The usual sign-in role for a job title from the staff list. */
  NA.roleForTitle = (title) => TITLE_ROLE[title] || 'sales';
  NA.roleLabel = (role) => (NA.ROLES[role] || { label: role || '—' }).label;

  /** The person using the app: { name, role, staffId, admin }. */
  NA.me = function () {
    if (NA.sync && NA.sync.on && NA.sync.me) return NA.sync.me;
    const s = (NA.db && NA.db.settings) || {};
    const staff = (NA.db && NA.db.staff) || [];
    const st = staff.find((x) => x.name === s.currentUser) || staff.find((x) => x.role === 'Managing Director') || null;
    // On one computer the app runs as the Managing Director: use their name, not the placeholder 'Admin'.
    const name = (s.currentUser && s.currentUser !== 'Admin' ? s.currentUser : st && st.name) || s.currentUser || 'Admin';
    return { name, role: 'owner', staffId: st ? st.id : null, admin: true, local: true };
  };
  NA.role = () => NA.me().role;
  NA.isRole = (...roles) => roles.includes(NA.role());
  /** Sees everyone's sales and CRM records. */
  NA.isManager = () => NA.isRole('owner', 'sales_manager');
  NA.myStaffId = () => NA.me().staffId || null;

  /* ------------------------------------------------------------------------
     Permissions. The Managing Director (owner) can do everything.
     ------------------------------------------------------------------------ */
  const EVERYONE = '*';
  const P = {
    // Screens
    'see.today': EVERYONE,
    'see.dashboard': EVERYONE,
    'see.approvals': EVERYONE,
    'see.leads': ['sales_manager', 'sales'],
    'see.customers': ['sales_manager', 'sales', 'accounts', 'service', 'service_manager'],
    'see.sales': ['sales_manager', 'sales', 'accounts'],
    'see.inventory': ['sales_manager', 'sales', 'accounts', 'procurement', 'service', 'service_manager'],
    'see.procurement': ['sales_manager', 'accounts', 'procurement'],   // the Sales Manager reads arrival dates and demand
    'see.service': ['service', 'service_manager'],
    'see.parts': ['service', 'service_manager', 'procurement'],
    'see.finance': ['accounts'],
    'see.admin': ['hr', 'accounts'],             // Accounts: staff (read), payroll to pay, assets and licences
    'see.reports': ['sales_manager', 'accounts', 'service_manager', 'procurement'],   // Purchasing: stock age
    'see.process': EVERYONE,
    'see.settings': EVERYONE,

    // Sales and CRM
    'leads.all': ['sales_manager'],           // everyone's leads, not just one's own
    'leads.assign': ['sales_manager'],        // give a lead or customer to another consultant
    'leads.create': ['sales_manager', 'sales'],
    'orders.create': ['sales_manager', 'sales'],
    'orders.edit': ['sales_manager', 'sales'],
    'payments.record': ['sales_manager', 'sales', 'accounts'],
    'payments.verify': ['accounts'],          // confirm cash handed over / cheque cleared
    'vin.assign': ['sales_manager', 'accounts'],
    'delivery.complete': ['sales_manager', 'sales'],
    'costs.view': ['sales_manager', 'accounts', 'procurement'],
    'targets.set': ['sales_manager'],

    // Stock and buying
    'stock.edit': ['procurement'],
    'po.manage': ['procurement'],
    'vendor.pay': ['accounts'],

    // After-sales
    'service.manage': ['service', 'service_manager'],
    'service.approve': ['service_manager'],    // warranty jobs, service discounts, cancelling started jobs
    'parts.manage': ['service', 'service_manager', 'procurement'],
    'parts.adjust': ['procurement'],

    // Back office
    'expenses.record': EVERYONE,
    'finance.manage': ['accounts'],
    'hr.manage': ['hr'],
    'payroll.view': ['hr', 'accounts'],
    'leave.request': EVERYONE,

    // Owner only
    'models.edit': [],
    'settings.company': [],
    'settings.policy': [],
    'records.delete': [],
    'staff.signins': [],
  };
  NA.PERMS = P;

  /** Plain words for each role and for what a permission lets someone do (Settings → You, How we work). */
  NA.ROLE_TEXT = {
    owner: 'Runs the company. Sees everything and has the final say on the big decisions.',
    sales_manager: 'Leads the sales team. Sees every lead, customer and order, gives VINs and approves discounts within the limit.',
    sales: 'Sells cars. Works only with their own leads, customers, orders and payments.',
    accounts: 'Looks after the money. Confirms every customer payment, gives VINs and pays suppliers, refunds, salaries and expenses.',
    procurement: 'Buys and looks after the cars and parts: purchase orders, shipment batches, arrival checks and stock.',
    service_manager: 'Runs the workshop. Approves free warranty work, service discounts and cancelling a started job.',
    service: 'Books services, runs job cards, bills customers and hands their cars back.',
    hr: 'Looks after staff, attendance, leave, payroll and licences.',
  };
  NA.ABILITIES = [
    ['leads.all', 'See every consultant’s leads, customers and orders'],
    ['leads.create', 'Add leads and follow them up'],
    ['leads.assign', 'Hand a lead or customer to another consultant'],
    ['orders.create', 'Book sales orders'],
    ['payments.record', 'Record customer payments'],
    ['payments.verify', 'Confirm customer money: cash handed over, cheque cleared'],
    ['vin.assign', 'Give a VIN to a fully paid order'],
    ['delivery.complete', 'Hand over cars to customers'],
    ['costs.view', 'See what cars cost us and the margins'],
    ['targets.set', 'Set monthly sales targets'],
    ['po.manage', 'Raise purchase orders'],
    ['stock.edit', 'Receive, check and move cars in stock'],
    ['vendor.pay', 'Pay suppliers'],
    ['service.manage', 'Book services and run job cards'],
    ['service.approve', 'Approve warranty jobs and service discounts'],
    ['parts.manage', 'Look after spare parts'],
    ['parts.adjust', 'Receive parts orders and correct counts'],
    ['finance.manage', 'Keep the accounts, pay expenses, salaries and refunds'],
    ['hr.manage', 'Look after staff, attendance and leave'],
  ];

  /** True when the current person may do `perm`. */
  NA.can = function (perm, role) {
    role = role || NA.role();
    if (role === 'owner') return true;
    const r = P[perm];
    return !!r && (r === EVERYONE || r.includes(role));
  };
  NA.canSee = (section) => NA.can('see.' + section);
  /** Roles that hold a permission (owner always included). */
  NA.rolesWith = (perm) => NA.ROLE_KEYS.filter((r) => NA.can(perm, r));

  /* ------------------------------------------------------------------------
     Record ownership. Sales and CRM records carry ownerId = the staff id of
     the consultant responsible. The server uses it to decide who sees what.
     ------------------------------------------------------------------------ */
  const ownerOf = (col, id) => { const r = id && NA.get(col, id); return r ? r.ownerId || r.consultantId || null : null; };
  const OWNER_RULES = {
    leads: (r) => r.consultantId,
    orders: (r) => r.consultantId,
    quotations: (r) => r.consultantId || ownerOf('leads', r.leadId) || ownerOf('orders', r.orderId),
    customers: (r) => r.consultantId,
    payments: (r) => ownerOf('orders', r.orderId),
    warranties: (r) => ownerOf('orders', r.orderId),
    invoices: (r) => (r.kind === 'vehicle' ? ownerOf('orders', r.refId) : null),
    followUps: (r) => r.consultantId || ownerOf('orders', r.orderId) || ownerOf('leads', r.leadId),
    testDrives: (r) => ownerOf('leads', r.leadId),
    approvals: () => null,
    expenses: () => null,
    leaves: (r) => r.staffId,
    targets: (r) => r.staffId,
    attendance: (r) => r.staffId,
    activity: () => null,
  };
  NA.OWNED_COLLECTIONS = Object.keys(OWNER_RULES);

  /** Fill ownerId on a new record (and byStaffId on activity entries). */
  NA.stampOwner = function (name, rec) {
    if (!rec || !OWNER_RULES[name]) return rec;
    if (rec.ownerId == null) {
      const derived = OWNER_RULES[name](rec);
      // Records nobody else owns belong to whoever creates them (a consultant's own customer, a claim, a request…)
      const shared = ['invoices', 'warranties', 'targets', 'attendance'];
      rec.ownerId = derived || (shared.includes(name) ? null : NA.myStaffId());
    }
    return rec;
  };

  const origInsert = NA.insert;
  NA.insert = function (name, obj) {
    NA.stampOwner(name, obj);
    return origInsert(name, obj);
  };
  const origUpdate = NA.update;
  NA.update = function (name, id, patch) {
    // Changing the consultant on a lead or order hands the record over; taking the consultant off leaves it with
    // the manager who did it (consultants no longer see it).
    if (patch && 'consultantId' in patch && ['leads', 'orders', 'quotations', 'customers'].includes(name)) {
      patch.ownerId = patch.consultantId || NA.myStaffId() || null;
    }
    return origUpdate(name, id, patch);
  };

  /** True when this record is the current person's own (or they can see everyone's). */
  NA.isMine = (rec) => !!rec && (!!NA.myStaffId() && (rec.ownerId === NA.myStaffId() || rec.consultantId === NA.myStaffId()));

  /** Default consultant for a new lead/order: yourself if you sell, otherwise nobody yet. */
  NA.defaultConsultant = () => (NA.isRole('sales', 'sales_manager') ? NA.myStaffId() : '');

  /** Staff ids that are consultants (for "assign to" pickers). */
  NA.consultants = () => NA.staffBy(['Sales Consultant', 'Sales Manager']);

  /* ------------------------------------------------------------------------
     What each role receives from the office server (mirror of server.py
     ACCESS). 'all' = every record, 'read' = every record (no changes),
     'own' = only records whose ownerId is theirs. Missing = nothing.
     ------------------------------------------------------------------------ */
  const ALL = 'all', READ = 'read', OWN = 'own';
  const SELF = { approvals: OWN, activity: OWN, expenses: OWN, leaves: OWN, attendance: OWN, models: READ, staff: READ };
  const acc = (extra) => Object.assign({}, SELF, extra);
  NA.ACCESS = {
    sales_manager: acc({ leads: ALL, customers: ALL, orders: ALL, payments: ALL, quotations: ALL, testDrives: ALL, followUps: ALL, vehicles: ALL, warranties: ALL, invoices: ALL, targets: ALL, activity: ALL, serviceBookings: READ, jobCards: READ, purchaseOrders: READ, vendorPayments: READ, vendors: READ, transfers: ALL }),
    sales: acc({ leads: OWN, customers: OWN, orders: OWN, payments: OWN, quotations: OWN, testDrives: OWN, followUps: OWN, warranties: OWN, invoices: OWN, targets: READ, vehicles: ALL, transfers: READ }),
    accounts: acc({ customers: ALL, orders: ALL, payments: ALL, vehicles: ALL, invoices: ALL, warranties: READ, purchaseOrders: ALL, partOrders: ALL, vendorPayments: ALL, vendors: ALL, expenses: ALL, assets: ALL, compliance: ALL, vatReturns: ALL, jobCards: READ, serviceBookings: READ, parts: READ, followUps: ALL, targets: READ, activity: ALL, transfers: READ }),
    procurement: acc({ purchaseOrders: ALL, vendors: ALL, vehicles: ALL, parts: ALL, partOrders: ALL, vendorPayments: READ, orders: READ, leads: READ, jobCards: READ, transfers: ALL }),
    service: acc({ customers: ALL, vehicles: ALL, warranties: ALL, serviceBookings: ALL, jobCards: ALL, invoices: ALL, parts: ALL, partOrders: ALL, followUps: ALL, payments: OWN, vendors: READ, transfers: READ }),
    hr: acc({ staff: ALL, attendance: ALL, leaves: ALL, assets: ALL, compliance: ALL }),
  };
  NA.ACCESS.service_manager = Object.assign({}, NA.ACCESS.service, { activity: ALL, payments: ALL });
  /** May the person signed in here change this record? (The office server's basic rule; it adds a few more checks.) */
  NA.mayWrite = function (c, rec) {
    const role = NA.role();
    if (role === 'owner') return true;
    const t = (NA.ACCESS[role] || {})[c];
    return t === ALL || (t === OWN && !!rec && !!NA.myStaffId() && rec.ownerId === NA.myStaffId());
  };
  const COST_ROLES = ['owner', 'sales_manager', 'accounts', 'procurement'];
  const PAY_ROLES = ['owner', 'hr', 'accounts'];
  const REDACT = { vehicles: [COST_ROLES, ['cost', 'landedCost', 'unitCost', 'purchaseCost']], models: [COST_ROLES, ['cost']],
    parts: [COST_ROLES, ['cost', 'avgCost']], staff: [PAY_ROLES, ['salary', 'basic', 'allowance', 'bankAccount', 'bankName', 'nid', 'salaryHistory', 'emergency']],
    invoices: [COST_ROLES, ['costAtSale']] };
  const DOC_READ = { payroll: ['hr', 'accounts'] };

  /** The part of a full data set that a role would receive (a deep copy). */
  /* Figures inside lists, approvals about costs, and activity lines about buying (mirror of server.py). */
  const REDACT_NESTED = { partOrders: { lines: ['unitCost', 'cost', 'value', 'lineTotal'], receipts: ['value', 'cost', 'unitCost'] }, parts: { stockLog: ['cost', 'value', 'unitCost'] }, models: { priceHistory: ['cost'] } };
  const REDACT_TOP_EXTRA = { partOrders: ['total', 'subtotal', 'value'] };
  /* Records some roles receive only in outline (Purchasing counts leads per model, never sees who they are). */
  const KEEP_ONLY = { leads: [['procurement'], ['id', 'code', 'modelId', 'color', 'stage', 'stageAt', 'consultantId', 'ownerId', 'orderId', 'source', 'createdAt', 'updatedAt']] };
  const COST_APPROVALS = ['po', 'stock_adjust', 'emergency', 'vendor_payment'];
  const COST_LINKS = ['#/procurement', '#/finance'];

  /** The part of a full data set that a role would receive (a deep copy). */
  NA.visibleDb = function (full, role, staffId) {
    const db = JSON.parse(JSON.stringify(full));
    if (role === 'owner') return db;
    const table = NA.ACCESS[role] || {};
    const costRole = COST_ROLES.includes(role);
    const owns = (c, r) => !!staffId && (r.ownerId === staffId || (c === 'activity' && r.byStaffId === staffId));
    // Customers of the orders this person owns (worked out before orders are filtered).
    const myOrderCustomers = new Set((full.orders || []).filter((o) => owns('orders', o)).map((o) => o.customerId));
    // Approvals last: one also reaches whoever can see the record it is about.
    Object.keys(db).sort((x, y) => (x === 'approvals') - (y === 'approvals')).forEach((c) => {
      const v = db[c];
      if (!Array.isArray(v)) { if (DOC_READ[c] && !DOC_READ[c].includes(role)) delete db[c]; return; }
      const a = table[c];
      db[c] = v.filter((r) => {
        if (c === 'approvals' && (r.approverRoles || []).includes(role)) return true;
        if (c === 'activity' && !costRole && COST_LINKS.some((x) => String(r.link || '').startsWith(x)) && !owns(c, r)) return false;
        // The Service Manager receives workshop money, not the sales team's car payments.
        if (c === 'payments' && role === 'service_manager' && r.orderId && !owns(c, r)) return false;
        if (a === ALL || a === READ || (a === OWN && owns(c, r))) return true;
        if (c === 'customers' && a === OWN && myOrderCustomers.has(r.id)) return true;
        return c === 'approvals' && !!r.refC && !!r.refId && r.refC !== 'approvals' && !!table[r.refC]
          && Array.isArray(db[r.refC]) && db[r.refC].some((x) => x && x.id === r.refId);
      });
      const red = REDACT[c];
      if (red && !red[0].includes(role)) db[c].forEach((r) => red[1].forEach((f) => delete r[f]));
      const keep = KEEP_ONLY[c];
      if (keep && keep[0].includes(role)) db[c].forEach((r) => Object.keys(r).forEach((f) => { if (!keep[1].includes(f)) delete r[f]; }));
      if (!costRole) {
        (REDACT_TOP_EXTRA[c] || []).forEach((f) => db[c].forEach((r) => delete r[f]));
        if (c === 'approvals') db[c].forEach((r) => { if (COST_APPROVALS.includes(r.type)) ['amount', 'value', 'data'].forEach((f) => delete r[f]); });
        Object.keys(REDACT_NESTED[c] || {}).forEach((f) => db[c].forEach((r) => {
          if (Array.isArray(r[f])) r[f].forEach((it) => { if (it && typeof it === 'object') REDACT_NESTED[c][f].forEach((k) => delete it[k]); });
        }));
      }
    });
    NA.COLLECTIONS.forEach((c) => { if (!Array.isArray(db[c])) db[c] = []; });
    return db;
  };


  /**
   * Managing Director: see the app exactly as one staff member sees it. Nothing is saved while
   * previewing (and in shared mode syncing pauses); "Exit" reloads the real data.
   */
  /** The role each person signs in with, by staff id. On the office server the Managing Director can set it apart from
      the job title (Settings → Sign-in and roles), so the server is asked; on one computer the job title decides ({}). */
  NA.signInRoles = async function () {
    if (!(NA.sync && NA.sync.on && NA.sync.api)) return {};
    try {
      const out = {};
      ((await NA.sync.api('api/users')).users || []).forEach((u) => { if (u.staffId) out[u.staffId] = u.role || (u.admin ? 'owner' : 'sales'); });
      return out;
    } catch (e) { return {}; }
  };

  NA.previewAs = async function (staffId) {
    const st = NA.get('staff', staffId);
    if (!st || NA.preview || !NA.isRole('owner')) return;
    const role = (await NA.signInRoles())[st.id] || NA.roleForTitle(st.role);
    if (NA.preview) return;
    NA.db = NA.visibleDb(NA.db, role, st.id);
    NA.db.settings.currentUser = st.name;
    if (NA.sync) NA.sync.on = false;
    NA.save = NA.saveNow = () => {};
    NA.preview = { name: st.name, role, staffId: st.id };
    NA.me = () => ({ name: st.name, role, staffId: st.id, admin: false, preview: true });
    document.documentElement.classList.add('previewing');
    NA.emit('preview', NA.preview);
    location.hash = '#/dashboard';
    NA.refresh();
  };
  NA.endPreview = () => { location.hash = '#/dashboard'; location.reload(); };

  /* Make sure data from before roles existed has owners (runs where everything is visible). */
  NA.migrateOwners = function (db) {
    db = db || NA.db;
    let n = 0;
    const byId = (col) => new Map((db[col] || []).map((r) => [r.id, r]));
    const orders = byId('orders');
    const own = (col, fn) => (db[col] || []).forEach((r) => { if (r.ownerId == null) { const o = fn(r); if (o) { r.ownerId = o; n++; } } });
    own('leads', (r) => r.consultantId);
    own('orders', (r) => r.consultantId);
    own('payments', (r) => { const o = orders.get(r.orderId); return o && (o.ownerId || o.consultantId); });
    own('warranties', (r) => { const o = orders.get(r.orderId); return o && (o.ownerId || o.consultantId); });
    own('invoices', (r) => { if (r.kind !== 'vehicle') return null; const o = orders.get(r.refId); return o && (o.ownerId || o.consultantId); });
    // A customer belongs to the consultant of their latest order, else of their latest lead.
    const latest = {};
    (db.leads || []).concat(db.orders || []).forEach((r) => {
      if (!r.customerId || !r.consultantId) return;
      const prev = latest[r.customerId];
      const isOrder = !!r.channel || r.stage === 'booking' || 'price' in r;
      if (!prev || (isOrder && !prev.isOrder) || (isOrder === prev.isOrder && String(r.createdAt) > String(prev.at))) latest[r.customerId] = { id: r.consultantId, at: r.createdAt, isOrder };
    });
    own('customers', (r) => latest[r.id] && latest[r.id].id);
    own('followUps', (r) => (r.customerId && latest[r.customerId] ? latest[r.customerId].id : null));
    ['attendance', 'leaves', 'targets'].forEach((c) => own(c, (r) => r.staffId));
    return n;
  };
})();
