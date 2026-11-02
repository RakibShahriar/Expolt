/* ==========================================================================
   Noor Autos & Imports Ltd — Dealer Management System
   core.js : data store, formatting, router, UI kit, business rules.
   Plain browser JavaScript (no build step). Everything hangs off window.NA.
   ========================================================================== */
(function () {
  'use strict';

  const NA = (window.NA = window.NA || {});
  const STORAGE_KEY = 'noor-autos-dms-v1';

  /* ------------------------------------------------------------------------
     Process definitions — mirror the NAIL Business Process Flowchart.
     Every page reads stage lists from here so labels never drift.
     ------------------------------------------------------------------------ */
  NA.FLOW = {
    leadSources: ['Facebook Ads', 'Google Ads', 'Walk-in', 'WhatsApp', 'Corporate', 'Referral', 'Event', 'Dealer / Partner', 'Website'],
    leadStages: [
      { key: 'new',         label: 'New',            hint: 'Name, mobile, source and model',              icon: 'user-plus', tone: 'gray' },
      { key: 'qualified',   label: 'Qualified',      hint: 'Budget, how they pay and when',               icon: 'filter',    tone: 'gray' },
      { key: 'engaged',     label: 'In touch',       hint: 'A call, WhatsApp, meeting, email or brochure', icon: 'message',  tone: 'gray' },
      { key: 'visit',       label: 'Showroom visit', hint: 'Date, who met them and models seen',          icon: 'store',     tone: 'gray' },
      { key: 'testdrive',   label: 'Test drive',     hint: 'Signed form and driving licence',             icon: 'steering',  tone: 'blue' },
      { key: 'opportunity', label: 'Quote given',    hint: 'Price, discount and validity',                icon: 'file-text', tone: 'blue' },
    ],
    leadClosed: [
      { key: 'won',  label: 'Won',  tone: 'green' },
      { key: 'lost', label: 'Lost', tone: 'gray' },
    ],
    channels: [
      { key: 'Retail',    label: 'Retail (self-funded)', icon: 'wallet' },
      { key: 'Bank',      label: 'Bank finance',         icon: 'bank' },
      { key: 'Corporate', label: 'Corporate',            icon: 'building' },
    ],
    orderStages: [
      { key: 'booking',  label: 'Booked',              hint: 'Money receipt · demo VIN for reference only',  icon: 'receipt',      tone: 'gray'  },
      { key: 'payment',  label: 'Waiting for payment', hint: 'Cash · RTGS · cheque · instalments, confirmed by Accounts', icon: 'wallet', tone: 'amber' },
      { key: 'vin',      label: 'Ready for VIN',       hint: '100% confirmed · the actual VIN is linked',    icon: 'key',          tone: 'blue'  },
      { key: 'brta',     label: 'Registration',        hint: 'Customer name · insurance · bank as co-owner', icon: 'id-card',      tone: 'teal'  },
      { key: 'delivery', label: 'Ready to hand over',  hint: 'Inspection · handover form · signed acknowledgement', icon: 'car', tone: 'green' },
      { key: 'delivered',label: 'Delivered',           hint: 'The warranty starts automatically',            icon: 'check-circle', tone: 'gray'  },
    ],
    /** Not a step: where a cancelled order ends. */
    orderCancelled: { key: 'cancelled', label: 'Cancelled', tone: 'red' },
    bankSteps: [
      { key: 'application',  label: 'Loan application' },
      { key: 'approval',     label: 'Approval' },
      { key: 'sanction',     label: 'Sanction letter' },
      { key: 'documents',    label: 'Bank documents' },
      { key: 'disbursement', label: 'Disbursement' },
    ],
    corporateDocs: ['Purchase Order', 'Award Letter', 'Letter of Intent'],
    paymentMethods: ['Cash', 'RTGS', 'Cheque', 'Bank Transfer', 'Pay Order', 'Card', 'bKash / Nagad', 'VDS/AIT certificate', 'Bank Disbursement'],
    /** Money going out (expenses, salaries, suppliers). */
    payOutMethods: ['Cash', 'Bank Transfer', 'Cheque', 'Pay Order', 'RTGS', 'Card', 'bKash / Nagad'],
    poStages: [
      { key: 'po',        label: 'Order and advance',     hint: 'Order confirmed · proforma invoice attached', icon: 'file-text' },
      { key: 'allocated', label: 'Shipment batch',        hint: 'Batch tracked · quantity · status',           icon: 'boxes' },
      { key: 'releasing', label: 'Final payment and VIN', hint: 'Final payment per car · VIN received',        icon: 'key' },
      { key: 'receiving', label: 'Arrival check',         hint: 'VIN checked · damage check',                  icon: 'clipboard-check' },
      { key: 'closed',    label: 'In stock',              hint: 'Gulshan warehouse or Uttara showroom',        icon: 'warehouse' },
    ],
    emergencyStages: [
      { key: 'check',     label: 'Check availability', hint: 'Confirm the VIN with CG Runner',      icon: 'search' },
      { key: 'confirmed', label: 'VIN confirmed',      hint: 'Emergency purchase order raised',     icon: 'key' },
      { key: 'paid',      label: 'Paid in full',       hint: 'Supplier bill recorded at once',      icon: 'wallet' },
      { key: 'received',  label: 'Arrival check',      hint: 'Car added to stock · inspected',      icon: 'clipboard-check' },
    ],
    lotStatuses: ['Allocated', 'In Production', 'Shipped', 'At Chattogram Port', 'Customs Cleared', 'Delivered to Warehouse'],
    // One set of words for a car's status on every screen (Vehicles, orders, customers, reports).
    vehicleStatuses: [
      { key: 'in_transit', label: 'On the way',  tone: 'blue',   icon: 'truck' },
      { key: 'pdi',        label: 'To inspect',  tone: 'amber',  icon: 'clipboard-check' },
      { key: 'available',  label: 'Available',   tone: 'green',  icon: 'check-circle' },
      { key: 'allocated',  label: 'Sold',        tone: 'violet', icon: 'key' },   // given to an order (VIN assigned), not yet handed over
      { key: 'hold',       label: 'On hold',     tone: 'red',    icon: 'alert' },  // damage found / returned car: not for sale until resolved
      { key: 'demo',       label: 'Demo car',    tone: 'teal',   icon: 'steering' },
      { key: 'delivered',  label: 'Delivered',   tone: 'gray',   icon: 'check' },
    ],
    serviceTypes: ['Periodic Maintenance', 'Inspection', 'Warranty Repair', 'General Repair', 'Battery Health Check', 'Body & Paint'],
    serviceChannels: ['Phone', 'WhatsApp', 'Website', 'Walk-in'],
    jobStages: [
      { key: 'open',        label: 'Job card opened', icon: 'clipboard' },
      { key: 'in_progress', label: 'In the workshop', icon: 'wrench' },
      { key: 'completed',   label: 'Work done',       icon: 'check-circle' },
      { key: 'invoiced',    label: 'Billed',          icon: 'receipt' },
      { key: 'closed',      label: 'Closed',          icon: 'check' },
    ],
    followUpTypes: ['Satisfaction Call', 'Service Reminder', 'Warranty Renewal', 'Insurance Renewal', 'Registration Renewal'],
    costCentres: ['Showroom', 'Warehouse', 'Workshop', 'Administration', 'Marketing'],
    staffRoles: ['Managing Director', 'Sales Manager', 'Sales Consultant', 'Service Manager', 'Service Advisor', 'Technician', 'Accounts', 'Procurement', 'Admin & HR', 'Driver'],
  };

  NA.stageIndex = (list, key) => list.findIndex((s) => s.key === key);
  NA.stageLabel = (list, key) => {
    const s = (list || []).find((x) => x.key === key);
    if (s) return s.label;
    if (key === 'cancelled') return 'Cancelled';
    return key ? String(key).charAt(0).toUpperCase() + String(key).slice(1).replace(/_/g, ' ') : '—';
  };
  NA.stageTone = (list, key) => {
    if (key === 'cancelled') return 'red';
    return ((list || []).find((x) => x.key === key) || {}).tone || 'gray';
  };

  /* ------------------------------------------------------------------------
     Data store (localStorage). Collections are plain arrays of objects.
     ------------------------------------------------------------------------ */
  const COLLECTIONS = [
    'models', 'staff', 'vendors', 'customers', 'leads', 'orders', 'payments',
    'vehicles', 'purchaseOrders', 'vendorPayments', 'warranties', 'serviceBookings',
    'jobCards', 'invoices', 'parts', 'followUps', 'expenses', 'attendance', 'assets',
    'compliance', 'activity', 'approvals', 'leaves', 'targets', 'partOrders', 'vatReturns',
  ];
  NA.COLLECTIONS = COLLECTIONS;

  function emptyDb() {
    const db = { meta: { version: 1, createdAt: new Date().toISOString() }, settings: {}, counters: {} };
    COLLECTIONS.forEach((c) => (db[c] = []));
    return db;
  }

  NA.defaultSettings = () => ({
    company: 'Noor Autos & Imports Ltd',
    tagline: 'Authorized BYD Dealership · Bangladesh',
    vatRate: 0.15,
    advancePct: 0.30,
    labourRate: 2500,
    locations: ['Gulshan Warehouse', 'Uttara Showroom'],
    currency: 'BDT',
    officeStart: '09:00',      // attendance: the office opens
    lateAfter: '09:15',        // attendance: arriving after this is late
    holidays: [],              // public holidays: { date: 'yyyy-mm-dd', name } (plain 'yyyy-mm-dd' strings also work); Friday is always off
    currentUser: 'Admin',
  });
  /** Friday, or a public holiday from Settings. */
  NA.isHoliday = (d) => new Date(d + 'T00:00:00').getDay() === 5
    || ((NA.db && NA.db.settings && NA.db.settings.holidays) || []).some((h) => (typeof h === 'string' ? h : h && h.date) === d);

  NA.load = function () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const db = JSON.parse(raw);
        COLLECTIONS.forEach((c) => { if (!Array.isArray(db[c])) db[c] = []; });
        db.settings = Object.assign(NA.defaultSettings(), db.settings || {});
        db.counters = db.counters || {};
        NA.db = db;
        return true;
      }
    } catch (e) { console.warn('Could not read saved data', e); }
    NA.db = emptyDb();
    NA.db.settings = NA.defaultSettings();
    return false;
  };

  let saveTimer = null;
  NA.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(NA.saveNow, 60);
  };
  NA.saveNow = function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(NA.db)); }
    catch (e) { console.error(e); NA.ui && NA.ui.toast('Could not save — browser storage is full or blocked', 'error'); }
  };
  window.addEventListener('beforeunload', () => NA.saveNow());

  NA.reset = function (withDemo) {
    NA.db = emptyDb();
    NA.db.settings = NA.defaultSettings();
    if (withDemo && NA.seed) NA.seed(NA.db);
    NA.saveNow();
  };

  NA.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  /** Next human code, e.g. NA.nextCode('LD') -> 'LD-0007'. */
  NA.nextCode = function (prefix, pad = 4) {
    const n = (NA.db.counters[prefix] || 0) + 1;
    NA.db.counters[prefix] = n;
    return prefix + '-' + String(n).padStart(pad, '0');
  };

  NA.col = (name) => NA.db[name];
  NA.get = (name, id) => (id == null || !Array.isArray(NA.db[name]) ? null : NA.db[name].find((x) => x.id === id) || null);
  NA.find = (name, fn) => NA.db[name].find(fn) || null;
  NA.where = (name, fn) => NA.db[name].filter(fn);

  NA.insert = function (name, obj) {
    const now = new Date().toISOString();
    const rec = Object.assign({ id: NA.uid(), createdAt: now, updatedAt: now }, obj);
    NA.db[name].unshift(rec);
    NA.save();
    NA.emit('change', { name, rec });
    return rec;
  };
  NA.update = function (name, id, patch) {
    const rec = NA.get(name, id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    NA.save();
    NA.emit('change', { name, rec });
    return rec;
  };
  NA.remove = function (name, id) {
    const i = NA.db[name].findIndex((x) => x.id === id);
    if (i >= 0) NA.db[name].splice(i, 1);
    NA.save();
    NA.emit('change', { name });
  };

  /** Append to a record's own timeline and to the global activity feed. */
  NA.log = function (text, opts = {}) {
    const me = NA.me ? NA.me() : { name: NA.db.settings.currentUser, staffId: null };
    // ownerId: whose record this is about (so a consultant sees activity on their own deals); byStaffId: who did it.
    const entry = { id: NA.uid(), at: new Date().toISOString(), text, link: opts.link || null, kind: opts.kind || 'info', by: me.name,
      byStaffId: me.staffId || null, ownerId: (opts.rec && (opts.rec.ownerId || opts.rec.consultantId)) || null };
    NA.db.activity.unshift(entry);
    // On one computer keep the feed short; the office server keeps the full history.
    if (!(NA.sync && NA.sync.on) && NA.db.activity.length > 1000) NA.db.activity.length = 1000;
    if (opts.rec) {
      opts.rec.history = opts.rec.history || [];
      opts.rec.history.unshift({ at: entry.at, text, by: entry.by });
    }
    NA.save();
  };

  /* tiny event bus */
  const listeners = {};
  NA.on = (evt, fn) => ((listeners[evt] = listeners[evt] || []).push(fn), () => (listeners[evt] = listeners[evt].filter((f) => f !== fn)));
  NA.emit = (evt, data) => (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  /* ------------------------------------------------------------------------
     Formatting
     ------------------------------------------------------------------------ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  NA.esc = esc;

  /** Bangladeshi digit grouping: 12,34,56,789 */
  function groupBD(n) {
    const neg = n < 0; n = Math.abs(Math.round(n));
    const s = String(n);
    if (s.length <= 3) return (neg ? '-' : '') + s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return (neg ? '-' : '') + rest + ',' + last3;
  }
  NA.fmt = {
    num: (n) => groupBD(Number(n) || 0),
    money: (n) => '৳ ' + groupBD(Number(n) || 0),
    /** Compact: ৳ 45.6 L / ৳ 2.35 Cr */
    short: (n) => {
      n = Number(n) || 0; const a = Math.abs(n);
      if (a >= 1e7) return '৳ ' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
      if (a >= 1e5) return '৳ ' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L';
      if (a >= 1e3) return '৳ ' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      return '৳ ' + groupBD(n);
    },
    pct: (x, d = 0) => (Number(x || 0) * 100).toFixed(d) + '%',
    date: (iso) => {
      if (!iso) return '—';
      const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    dateShort: (iso) => {
      if (!iso) return '—';
      const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
      return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    },
    datetime: (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },
    ago: (iso) => {
      if (!iso) return '—';
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
      return NA.fmt.date(iso);
    },
    phone: (p) => p || '—',
  };

  /* Dates — ISO yyyy-mm-dd strings everywhere for plain dates. */
  NA.today = () => toISODate(new Date());
  function toISODate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  NA.toISODate = toISODate;
  NA.addDays = (iso, n) => { const d = new Date((iso || NA.today()) + 'T00:00:00'); d.setDate(d.getDate() + n); return toISODate(d); };
  NA.addMonths = (iso, n) => { const d = new Date((iso || NA.today()) + 'T00:00:00'); d.setMonth(d.getMonth() + n); return toISODate(d); };
  NA.daysBetween = (a, b) => Math.round((new Date((b || NA.today()) + 'T00:00:00') - new Date((a || NA.today()) + 'T00:00:00')) / 86400000);

  /* ------------------------------------------------------------------------
     Lookups
     ------------------------------------------------------------------------ */
  NA.model = (id) => NA.get('models', id);
  NA.modelName = (id) => { const m = NA.model(id); return m ? m.name + (m.variant ? ' ' + m.variant : '') : '—'; };
  NA.customer = (id) => NA.get('customers', id);
  NA.customerName = (id) => { const c = NA.customer(id); return c ? c.name : '—'; };
  NA.staffName = (id) => { const s = NA.get('staff', id); return s ? s.name : '—'; };
  NA.staffBy = (role) => NA.where('staff', (s) => s.active !== false && (Array.isArray(role) ? role.includes(s.role) : s.role === role));
  NA.vendorName = (id) => { const v = NA.get('vendors', id); return v ? v.name : '—'; };
  NA.vehicle = (id) => NA.get('vehicles', id);
  NA.vehicleByVin = (vin) => NA.find('vehicles', (v) => v.vin && v.vin.toUpperCase() === String(vin).toUpperCase());

  /* ------------------------------------------------------------------------
     Business rules shared by several modules (single source of truth).
     ------------------------------------------------------------------------ */
  const B = (NA.biz = {});

  B.orderNet = (o) => Math.max(0, (Number(o.price) || 0) - (Number(o.discount) || 0));

  /* Customer money. A payment only counts towards "fully paid" once Accounts has confirmed it:
     cash handed over to Accounts, a cheque or pay order cleared, a transfer seen in the bank.
     Payments from before this rule have no status and count as confirmed. Refunds are negative amounts. */
  B.paymentCleared = (p) => !p.status || p.status === 'cleared';
  B.paymentPending = (p) => p.status === 'pending';
  B.paymentBounced = (p) => p.status === 'bounced';
  B.orderPayments = (o) => NA.where('payments', (p) => p.orderId === o.id);
  const sumOf = (list) => list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  /** Confirmed money (what counts). */
  B.orderPaid = (o) => sumOf(B.orderPayments(o).filter(B.paymentCleared));
  /** Money handed in but not yet confirmed by Accounts. */
  B.orderPending = (o) => sumOf(B.orderPayments(o).filter(B.paymentPending));
  /** Confirmed + waiting for confirmation. */
  B.orderReceived = (o) => B.orderPaid(o) + B.orderPending(o);
  B.orderBalance = (o) => Math.max(0, B.orderNet(o) - B.orderPaid(o));
  /** What the customer still has to hand over (pending money counted as handed over). */
  B.orderToCollect = (o) => Math.max(0, B.orderNet(o) - B.orderReceived(o));
  B.orderPaidPct = (o) => { const n = B.orderNet(o); return n ? Math.min(1, B.orderPaid(o) / n) : 0; };
  B.isFullyPaid = (o) => B.orderNet(o) > 0 && B.orderBalance(o) <= 0.5;
  /** Corporate orders are confirmed by PO / award / intent letter instead of booking money. */
  B.isOrderConfirmed = (o) => o.channel === 'Corporate' ? !!(o.corporate && o.corporate.docRef) : B.orderReceived(o) > 0;

  /** New payments: Accounts' own cash/transfer entries are confirmed at once; everything else waits for Accounts. */
  B.initialPaymentStatus = (method) => {
    if (!(NA.can && NA.can('payments.verify'))) return 'pending';
    return ['Cheque', 'Pay Order'].includes(method) ? 'pending' : 'cleared';
  };
  B.paymentsToVerify = () => NA.where('payments', B.paymentPending).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  /** Cheque / transfer numbers are compared without spaces or case. */
  B.refKey = (r) => String(r || '').replace(/\s+/g, '').toUpperCase();
  /** Another receipt on this computer with the same reference as p (refunds and money marked not received left out), or null. */
  B.sameRefPayment = (p) => {
    const k = B.refKey(p && p.ref);
    if (!k) return null;
    return NA.find('payments', (x) => x.id !== p.id && x.kind !== 'refund' && !((Number(x.amount) || 0) < 0) && !B.paymentBounced(x) && B.refKey(x.ref) === k) || null;
  };

  /** Log a customer payment against an order. Moves booking -> payment automatically. */
  B.recordPayment = function (order, { amount, method, date, ref, note }) {
    const status = B.initialPaymentStatus(method || 'Cash');
    const p = NA.insert('payments', {
      receiptNo: NA.nextCode('MR', 5), orderId: order.id, customerId: order.customerId,
      date: date || NA.today(), amount: Number(amount) || 0, method: method || 'Cash', ref: ref || '', note: note || '',
      status, receivedBy: NA.me ? NA.me().name : NA.db.settings.currentUser, receivedById: (NA.myStaffId && NA.myStaffId()) || null,
      verifiedBy: status === 'cleared' && NA.me ? NA.me().name : null, verifiedById: status === 'cleared' ? ((NA.myStaffId && NA.myStaffId()) || null) : null,
      verifiedAt: status === 'cleared' ? new Date().toISOString() : null,
    });
    NA.log(`Payment ${NA.fmt.money(p.amount)} (${p.method}) received for ${order.code} — receipt ${p.receiptNo}${status === 'pending' ? ' · waiting for Accounts to confirm' : ''}`, { rec: order, link: '#/sales/' + order.id, kind: 'money' });
    B.syncStage(order);
    return p;
  };

  /** Accounts confirms (cleared) or rejects (bounced) a payment. */
  B.verifyPayment = function (p, ok, note) {
    const me = NA.me ? NA.me().name : NA.db.settings.currentUser;
    NA.update('payments', p.id, { status: ok ? 'cleared' : 'bounced', verifiedBy: me, verifiedById: (NA.myStaffId && NA.myStaffId()) || null, verifiedAt: new Date().toISOString(), verifyNote: note || '' });
    const order = NA.get('orders', p.orderId);
    if (order) B.syncStage(order);
    NA.log(ok ? `Payment ${p.receiptNo} (${NA.fmt.money(p.amount)}) confirmed by ${me}` : `Payment ${p.receiptNo} (${NA.fmt.money(p.amount)}) BOUNCED${note ? ' — ' + note : ''}`,
      { rec: order, link: order ? '#/sales/' + order.id : '#/finance', kind: ok ? 'money' : 'warn' });
    if (!ok && order && order.stage !== 'cancelled') {
      NA.insert('followUps', { customerId: order.customerId, orderId: order.id, consultantId: order.consultantId, due: NA.today(), type: 'Payment Follow-up', status: 'pending', notes: `Payment ${p.receiptNo} bounced${note ? ': ' + note : ''} — collect again` });
    }
  };

  /** Vehicles that may be linked to an order (actual VIN stock). */
  B.availableVehicles = (modelId, color) => NA.where('vehicles', (v) => v.status === 'available' && (!modelId || v.modelId === modelId) && (!color || !v.color || v.color === color));

  /** Discounts above the consultant's limit need a manager's approval (orders created before approvals existed are fine). */
  B.discountOk = (o) => {
    const d = Number(o.discount) || 0;
    if (!d || !NA.approvals) return true;
    const p = NA.policy();
    if (d <= p.discountFree) return true;
    const start = NA.db.settings.policyStart;
    if (start && String(o.createdAt || '').slice(0, 10) < start && !o.discountChangedAt) return true;
    // Approved on the order itself, or on the quotation of the lead it came from — for the model that was quoted
    // (approvals from before the model was recorded still count).
    if (NA.approvals.isApproved('orders', o.id, 'discount', d)) return true;
    const la = o.leadId ? NA.approvals.find('leads', o.leadId, 'discount') : null;
    return !!la && (!la.data || !la.data.modelId || la.data.modelId === o.modelId) && NA.approvals.isApproved('leads', o.leadId, 'discount', d);
  };
  /** Car before full payment approved by the MD, for at least what is still owed (a price raised or a payment bounced
      after the approval needs a new one). Orders approved with the old on/off switch (before approvals existed) still count. */
  B.creditApproved = (o) => (!!NA.approvals && NA.approvals.isApproved('orders', o.id, 'credit', B.orderBalance(o)))
    || !!(o.corporate && o.corporate.creditApproved && o.corporate.creditApprovedAt);
  /** Corporate orders need the company's purchase order / award letter on file first. */
  B.corpDocMissing = (o) => o.channel === 'Corporate' && !(o.corporate && o.corporate.docRef);
  /** What is wrong with a car that stops a sale or a handover ('' = nothing). */
  B.carProblem = function (v) {
    if (!v) return '';
    if (v.status === 'hold') return v.holdReason || 'The car is on hold';
    if (v.holdReason) return v.holdReason;
    if (v.pdi && v.pdi.flagged) return v.pdi.notes || 'A problem was found at the inspection';
    if (v.pdi && v.pdi.damageCheck && !/^ok$/i.test(String(v.pdi.damageCheck).trim())) return 'Damage found at the inspection: ' + v.pdi.damageCheck;
    return '';
  };
  B.cancelPending = (o) => !!NA.approvals && NA.approvals.isPending('orders', o.id, 'cancel');

  /** Reasons a VIN cannot be given to this order yet (empty = it can). */
  B.vinBlockers = function (o) {
    const out = [];
    if (['delivered', 'cancelled'].includes(o.stage)) out.push('The order is ' + (o.stage === 'cancelled' ? 'cancelled' : 'already delivered'));
    if (!B.isFullyPaid(o) && !B.creditApproved(o)) {
      const pend = B.orderPending(o);
      out.push(`Needs 100% confirmed payment — ${NA.fmt.money(B.orderBalance(o))} to go${pend ? ` (${NA.fmt.money(pend)} waiting for Accounts)` : ''}`);
    }
    if (!B.discountOk(o)) out.push('The discount is waiting for approval');
    if (B.cancelPending(o)) out.push('A cancellation has been requested');
    if (B.corpDocMissing(o)) out.push('The company’s purchase order is not on the order yet');
    return out;
  };
  /** Rule from the flowchart: the actual VIN is assigned ONLY after 100% customer payment
      (or when the Managing Director has approved credit, e.g. a corporate PO or a bank disbursement on the way). */
  B.canAssignVin = (o) => B.vinBlockers(o).length === 0;

  /** Reasons the car cannot be handed over yet (empty = it can). */
  B.deliveryBlockers = function (o) {
    const out = [];
    if (!o.vehicleId) out.push('No VIN given yet');
    if (!B.isFullyPaid(o) && !B.creditApproved(o)) out.push(`Payment not complete — ${NA.fmt.money(B.orderBalance(o))} still to be confirmed`);
    if (!B.discountOk(o)) out.push('The discount is waiting for approval');
    if (B.cancelPending(o)) out.push('A cancellation has been requested');
    const v = o.vehicleId && NA.vehicle(o.vehicleId);
    if (v && !v.pdi) out.push('The car has not been inspected (PDI) yet');
    if (v && B.carProblem(v)) out.push('Car on hold: ' + B.carProblem(v));
    if (!(o.brta && o.brta.regNo)) out.push('No BRTA registration number yet');
    if (o.brta && o.brta.regNo && !(o.brta.insurer && o.brta.policyNo)) out.push('Insurance not recorded');
    return out;
  };

  /** Where an order really is. The saved stage can lag behind (money confirmed on another screen). Never moves past the VIN. */
  B.stageOf = function (o) {
    if (!o) return '';
    if (o.vehicleId || !['booking', 'payment', 'vin'].includes(o.stage)) return o.stage;
    if (B.canAssignVin(o)) return 'vin';
    return B.orderReceived(o) > 0 ? 'payment' : 'booking';
  };
  /** Save the stage the order has really reached (booking / payment / vin). Called whenever money or an approval changes. */
  B.syncStage = function (order) {
    const o = order && NA.get('orders', order.id);
    if (!o || o.vehicleId || !['booking', 'payment', 'vin'].includes(o.stage)) return;
    const target = B.stageOf(o);
    if (!target || target === o.stage) return;
    NA.update('orders', o.id, { stage: target });
    if (target === 'vin') {
      NA.log(`${o.code} is ready for its VIN (${B.isFullyPaid(o) ? '100% paid and confirmed' : 'car before full payment approved'})`, { rec: o, link: '#/sales/' + o.id, kind: 'success' });
    }
  };

  B.assignVin = function (order, vehicleId) {
    const v = NA.vehicle(vehicleId);
    if (!v || v.status !== 'available') throw new Error('Vehicle is not available');
    const fresh = NA.get('orders', order.id) || order;
    if (fresh.vehicleId) throw new Error('This order already has a car (' + ((NA.vehicle(fresh.vehicleId) || {}).vin || 'VIN given') + ')');
    if (!['booking', 'payment', 'vin'].includes(fresh.stage)) throw new Error('This order is past the VIN step');
    if (v.reservedFor && v.reservedFor !== order.id) throw new Error('This car is kept for another order');
    if (!B.canAssignVin(fresh)) throw new Error(B.vinBlockers(fresh)[0] || 'VIN can only be assigned after 100% payment');
    NA.update('vehicles', v.id, { status: 'allocated', orderId: order.id, customerId: order.customerId, reservedFor: null });
    // Other cars kept for this order are free again.
    NA.where('vehicles', (x) => x.id !== v.id && x.reservedFor === order.id).forEach((x) => NA.update('vehicles', x.id, { reservedFor: null }));
    NA.update('orders', order.id, { vehicleId: v.id, stage: 'brta', vinAssignedAt: NA.today() });
    NA.log(`VIN ${v.vin} assigned to ${order.code} (${NA.customerName(order.customerId)})`, { rec: order, link: '#/sales/' + order.id, kind: 'success' });
  };

  /** A number from Settings; 0 is a real value, only a blank falls back to the default. */
  const setOr = (v, d) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

  /** Called when a vehicle is handed over. Creates warranty, invoice, follow-up. */
  B.deliverOrder = function (order, delivery) {
    if (order.stage === 'delivered') return;   // already handed over (e.g. a second screen was out of date)
    const v = NA.vehicle(order.vehicleId);
    const m = NA.model(order.modelId) || {};
    const date = (delivery && delivery.date) || NA.today();
    NA.update('orders', order.id, { stage: 'delivered', delivery: Object.assign({}, order.delivery, delivery, { date }), deliveredAt: date });
    if (v) NA.update('vehicles', v.id, { status: 'delivered', deliveredAt: date, regNo: (order.brta && order.brta.regNo) || v.regNo, location: 'Customer' });
    // Warranty activated automatically on delivery — expiry auto-calculated
    if (!NA.find('warranties', (w) => w.orderId === order.id)) {
      NA.insert('warranties', {
        code: NA.nextCode('WR'), orderId: order.id, vehicleId: v && v.id, customerId: order.customerId, modelId: order.modelId,
        vin: v && v.vin, regNo: order.brta && order.brta.regNo, start: date,
        expiry: NA.addMonths(date, setOr(m.warrantyMonths, 72)), batteryExpiry: NA.addMonths(date, setOr(m.batteryWarrantyMonths, 96)),
        kmLimit: setOr(m.warrantyKm, 150000), status: 'active',
      });
    }
    // Sales invoice
    if (!NA.find('invoices', (i) => i.kind === 'vehicle' && i.refId === order.id)) {
      const net = B.orderNet(order); const vat = NA.db.settings.vatRate;
      const base = Math.round(net / (1 + vat));
      NA.insert('invoices', {
        no: NA.nextCode('INV', 5), kind: 'vehicle', refId: order.id, customerId: order.customerId, date,
        lines: [{ desc: NA.modelName(order.modelId) + ' — VIN ' + (v ? v.vin : ''), qty: 1, rate: base }],
        subtotal: base, vat: net - base, vatRate: vat, total: net, paid: B.orderPaid(order), billing: B.isFullyPaid(order) ? 'paid' : 'credit', costCentre: 'Showroom',
        // What the car cost us on the day, so its margin never moves (the office server fills it in when the person
        // handing over cannot see costs).
        costAtSale: v && NA.can('costs.view') ? (Number(v.landedCost) || Number(v.cost) || undefined) : undefined,
      });
    }
    // Follow-ups: satisfaction call after 3 days, first service reminder at 3 months
    NA.insert('followUps', { customerId: order.customerId, vehicleId: v && v.id, orderId: order.id, consultantId: order.consultantId || null, due: NA.addDays(date, 3), type: 'Satisfaction Call', status: 'pending', notes: 'Post-delivery check-in' });
    NA.insert('followUps', { customerId: order.customerId, vehicleId: v && v.id, orderId: order.id, due: NA.addMonths(date, 3), type: 'Service Reminder', status: 'pending', notes: 'First free service' });
    NA.log(`${order.code} delivered to ${NA.customerName(order.customerId)} — warranty activated`, { rec: order, link: '#/sales/' + order.id, kind: 'success' });
  };

  B.warrantyFor = (vehicleId) => NA.find('warranties', (w) => w.vehicleId === vehicleId);
  B.warrantyActive = (w, onDate) => !!w && w.status !== 'void' && (onDate || NA.today()) <= w.expiry;

  /* Parts: reserve on job card, consume on completion. */
  B.partFree = (p) => (Number(p.onHand) || 0) - (Number(p.reserved) || 0);
  B.partLow = (p) => B.partFree(p) <= (Number(p.reorderLevel) || 0);
  B.reservePart = function (partId, qty) {
    const p = NA.get('parts', partId); if (!p) throw new Error('Part not found');
    if (B.partFree(p) < qty) throw new Error(`Only ${B.partFree(p)} × ${p.name} free in stock`);
    NA.update('parts', partId, { reserved: (Number(p.reserved) || 0) + Number(qty) });
  };
  B.releasePart = function (partId, qty) {
    const p = NA.get('parts', partId); if (!p) return;
    NA.update('parts', partId, { reserved: Math.max(0, (Number(p.reserved) || 0) - Number(qty)) });
  };
  B.consumePart = function (partId, qty) {
    const p = NA.get('parts', partId); if (!p) return;
    NA.update('parts', partId, { reserved: Math.max(0, (Number(p.reserved) || 0) - Number(qty)), onHand: Math.max(0, (Number(p.onHand) || 0) - Number(qty)) });
  };

  /** Totals for a job card. Warranty jobs bill BDT 0 to the customer. */
  B.jobTotals = function (jc, vatRate) {
    const num = (x) => Number(x) || 0;
    const r = jc.labourRate;
    const rate = r !== null && r !== undefined && r !== '' && !isNaN(Number(r)) ? Number(r) : num(NA.db.settings.labourRate);
    const parts = (jc.parts || []).reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
    const labour = Math.round(num(jc.labourHours) * rate);
    const subtotal = parts + labour;
    // Warranty jobs and work on our own cars bill ৳0 to the customer.
    const paid = jc.billing !== 'warranty' && jc.billing !== 'internal' && !!jc.customerId;
    const discount = paid && jc.discount ? Math.min(subtotal, Math.max(0, num(jc.discount.amount))) : 0;
    const net = subtotal - discount;
    const vr = vatRate != null ? num(vatRate) : num(NA.db.settings.vatRate);
    const vat = paid ? Math.round(net * vr) : 0;
    return { parts, labour, subtotal, discount, net, vat, vatRate: vr, total: paid ? net + vat : 0, internalCost: subtotal, paid };
  };

  /** Purchase orders */
  B.poTotal = (po) => (po.units || []).reduce((s, u) => s + (Number(u.unitCost) || 0), 0);
  B.vendorPaymentLive = (p) => !(p.void || p.status === 'void');
  B.poPaid = (po) => NA.where('vendorPayments', (p) => p.poId === po.id && B.vendorPaymentLive(p)).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  /** Is this purchase order approved (or from before approvals)? Purchasing's own rule wins when it is loaded. */
  B.poApproval = function (po) {
    if (NA.purchasing && typeof NA.purchasing.approvalOf === 'function') return NA.purchasing.approvalOf(po);
    const kind = po.type === 'emergency' ? 'emergency' : 'po';
    if (kind === 'po' && NA.policy && NA.policy().poApproval === false) return 'approved';
    const st = NA.approvals ? NA.approvals.state('purchaseOrders', po.id, kind) : 'none';
    if (st !== 'none') return st;
    if (po.approval && po.approval.status && po.approval.status !== 'cancelled') return po.approval.status;
    if (po.approvedAt || po.approvedBy) return 'approved';
    const start = NA.db.settings.policyStart;
    return start && String(po.createdAt || '').slice(0, 10) < start ? 'approved' : 'none';
  };
  /** Cars on this order count as "coming": approved orders; emergency ones once the VIN is confirmed. */
  B.poCounts = (po) => B.poApproval(po) === 'approved' && (po.type !== 'emergency' || ['confirmed', 'paid', 'received'].includes(po.stage));

  /** Demand signal per model: open pipeline + order backlog vs free stock. */
  B.demandByModel = function () {
    return NA.db.models.filter((m) => m.active !== false).map((m) => {
      const pipeline = NA.where('leads', (l) => l.modelId === m.id && ['qualified', 'engaged', 'visit', 'testdrive', 'opportunity'].includes(l.stage)).length;
      const hot = NA.where('leads', (l) => l.modelId === m.id && ['testdrive', 'opportunity'].includes(l.stage)).length;
      const backlog = NA.where('orders', (o) => o.modelId === m.id && ['booking', 'payment', 'vin'].includes(o.stage) && !o.vehicleId).length;
      const available = NA.where('vehicles', (v) => v.modelId === m.id && v.status === 'available').length;
      const incoming = NA.where('vehicles', (v) => v.modelId === m.id && ['in_transit', 'pdi'].includes(v.status)).length
        + NA.db.purchaseOrders.filter((po) => !['closed', 'received', 'cancelled'].includes(po.stage) && B.poCounts(po))
          .reduce((s, po) => s + (po.units || []).filter((u) => u.modelId === m.id && !u.vehicleId).length, 0);
      const sold90 = NA.where('orders', (o) => o.modelId === m.id && o.stage === 'delivered' && o.deliveredAt && NA.daysBetween(o.deliveredAt, NA.today()) <= 90).length;
      const forecast = Math.ceil(sold90 / 3 * 2 + hot * 0.5 + backlog); // next ~60 days
      const suggested = Math.max(0, forecast - available - incoming);
      return { model: m, pipeline, hot, backlog, available, incoming, sold90, forecast, suggested };
    });
  };

  /* ------------------------------------------------------------------------
     Icons — inline SVG (stroke icons, 24px grid).
     ------------------------------------------------------------------------ */
  const ICONS = {
    'dashboard': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    'flow': '<circle cx="5" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/>',
    'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.6 3.5 6"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    'user-plus': '<circle cx="10" cy="8" r="4"/><path d="M2 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/><path d="M19 4v6M16 7h6"/>',
    'filter': '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    'message': '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12z"/>',
    'whatsapp': '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6z"/><path d="M9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z"/>',
    'phone': '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    'store': '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 11v9h14v-9M10 20v-5h4v5"/>',
    'steering': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M3.5 10.5 9.6 11.2M20.5 10.5l-6.1.7M12 14.5V21"/>',
    'file-text': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    'receipt': '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    'wallet': '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    'id-card': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2M14 10h4M14 13h3"/>',
    'car': '<path d="M5 17H3v-4.5L5 7h14l2 5.5V17h-2"/><path d="M3 12.5h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    'check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'bank': '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    'building': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    'boxes': '<path d="M3 8.5 12 4l9 4.5-9 4.5z"/><path d="M3 8.5V16l9 4.5 9-4.5V8.5M12 13v7.5"/>',
    'clipboard-check': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    'clipboard': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    'warehouse': '<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8M7 17h10"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'truck': '<path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    'cart': '<path d="M3 4h2.5l2.2 11h10.6L20.5 7H6.6"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    'wrench': '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.7L3 17.7 6.3 21l5.7-5.7a4.5 4.5 0 0 0 5.7-6l-2.8 2.8-2.4-.6-.6-2.4z"/>',
    'shield': '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    'cog': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    'cog-parts': '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    'chart': '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
    'pie': '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    'briefcase': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
    'alert': '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    'bolt': '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    'edit': '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'download': '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    'upload': '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
    'print': '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    'star': '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
    'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'more': '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    'map-pin': '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    'battery': '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3M6 10v4M9.5 10v4"/>',
    'tag': '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    'lock': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'refresh': '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
    'hr': '<circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9"/><path d="M15 15h6M18 12v6"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    'zap-route': '<path d="M4 19c4 0 4-14 8-14s4 14 8 14"/><path d="M18 3l3 2-3 2"/>',
    'home': '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
    'inbox': '<path d="M3 13.5 5.5 5h13l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z"/><path d="M3 13.5h5.5a3.5 3.5 0 0 0 7 0H21"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    'trophy': '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
    'logout': '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    'swap': '<path d="M7 4 3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    'moon': '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    'hand': '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-2.5 0-4-1.2-5.3-3.2L3 14.6a1.6 1.6 0 0 1 2.6-1.8L8 15.5"/>',
    'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    'stamp': '<path d="M9.5 12.5V9a2.5 2.5 0 1 1 5 0v3.5"/><path d="M5 15.5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3V17H5zM5 20.5h14"/>',
    'pdi': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8.5 16.5l1.5 1.5 3-3"/>',
    'gate': '<path d="M4 21V5M20 21V5M4 9h16M4 14h16M9 9v5M14 9v5"/>',
    'layers': '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    'book': '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    'percent': '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    'eye-off': '<path d="M3 3l18 18M10.6 6.1A9.5 9.5 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.6C4.6 8.9 3.3 10.7 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  };
  NA.icon = (name, size = 18, cls = '') =>
    `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS['info']}</svg>`;
  NA.ICON_NAMES = Object.keys(ICONS);

  /* ------------------------------------------------------------------------
     UI kit — every helper returns an HTML string unless noted.
     Pages render with template strings and wire events by delegation:
       NA.ui.delegate(root, 'click', '[data-act]', (el, ev) => { ... })
     ------------------------------------------------------------------------ */
  const ui = (NA.ui = {});

  ui.badge = (text, tone = 'gray', icon) => `<span class="badge badge-${tone}">${icon ? NA.icon(icon, 13) : ''}${esc(text)}</span>`;
  ui.vehicleStatusBadge = (key) => { const s = NA.FLOW.vehicleStatuses.find((x) => x.key === key) || { label: key, tone: 'gray' }; return ui.badge(s.label, s.tone); };

  ui.avatar = (name, size = 32) => {
    const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;--h:${h}">${esc(initials)}</span>`;
  };

  ui.kpi = ({ label, value, sub, icon, tone = 'neutral', href }) =>
    `<${href ? `a href="${href}"` : 'div'} class="kpi kpi-${tone}">
      <div class="kpi-top">${icon ? `<span class="kpi-icon">${NA.icon(icon, 18)}</span>` : ''}<span class="kpi-label">${esc(label)}</span></div>
      <div class="kpi-value">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </${href ? 'a' : 'div'}>`;

  ui.empty = (msg, icon = 'info', actionHtml = '') =>
    `<div class="empty">${NA.icon(icon, 28)}<p>${esc(msg)}</p>${actionHtml}</div>`;

  /** A record that is missing here: removed, or (in shared mode) belonging to someone else. */
  ui.notFound = (what = 'record', backHref = '#/dashboard', backLabel = 'Back') =>
    `<div class="card pad">${ui.empty(`This ${what} isn’t available to you. It may belong to another person’s work, or it was removed.`, 'eye-off',
      `<a class="btn btn-ghost mt-8" href="${backHref}">${esc(backLabel)}</a>`)}</div>`;

  ui.progress = (ratio, tone = 'brand') => `<div class="progress progress-${tone}"><span style="width:${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%"></span></div>`;

  /** Horizontal stepper. steps: [{label, hint?, icon?}], current index; done < current. */
  ui.stepper = (steps, current, opts = {}) => `<ol class="stepper ${opts.compact ? 'stepper-compact' : ''}">
    ${steps.map((s, i) => {
      const st = i < current ? 'done' : i === current ? 'current' : 'todo';
      return `<li class="step step-${st}" ${opts.clickable ? `data-step="${i}"` : ''}>
        <span class="step-dot">${st === 'done' ? NA.icon('check', 14) : s.icon ? NA.icon(s.icon, 14) : i + 1}</span>
        <span class="step-text"><b>${esc(s.label)}</b>${s.hint && !opts.compact ? `<small>${esc(s.hint)}</small>` : ''}</span>
      </li>`;
    }).join('')}
  </ol>`;

  /** Simple table. cols: [{label, render(row) => html, cls?}], rows: array. onRowAttr(row) -> attribute string */
  ui.table = (cols, rows, opts = {}) => {
    if (!rows.length) return ui.empty(opts.empty || 'Nothing here yet', opts.emptyIcon || 'info');
    return `<div class="table-wrap"><table class="table">
      <thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  };

  /** Tabs header. tabs: [{key,label,count?}] */
  ui.tabs = (tabs, active, attr = 'data-tab') => `<div class="tabs">${tabs.map((t) =>
    `<button class="tab ${t.key === active ? 'active' : ''}" ${attr}="${esc(t.key)}">${t.icon ? NA.icon(t.icon, 15) : ''}${esc(t.label)}${t.count != null ? `<span class="tab-count">${t.count}</span>` : ''}</button>`).join('')}</div>`;

  /* ---------------- Forms ----------------
     fields: [{name, label, type: text|number|date|select|textarea|checkbox|tel|email|money|radio-cards,
               options: [str] | [{value,label,icon?,hint?}], required, placeholder, help, span: 1|2, min, max, step }]
  */
  ui.form = (fields, values = {}) => `<div class="form-grid">${fields.map((f) => ui.field(f, values[f.name])).join('')}</div>`;
  ui.field = (f, v) => {
    const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 6);
    const val = v == null ? (f.value != null ? f.value : '') : v;
    const req = f.required ? 'required' : '';
    const span = f.span === 2 ? 'span-2' : '';
    const label = f.label ? `<label for="${id}">${esc(f.label)}${f.required ? ' <i class="req">*</i>' : ''}</label>` : '';
    const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
    const opts = (f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
    let input;
    switch (f.type) {
      case 'select':
        input = `<select id="${id}" name="${f.name}" ${req}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || 'Select…')}</option>` : ''}${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
        break;
      case 'textarea':
        input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" ${req}>${esc(val)}</textarea>`;
        break;
      case 'checkbox':
        return `<label class="check ${span}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}/> <span>${esc(f.label)}</span>${help}</label>`;
      case 'radio-cards':
        return `<div class="field ${span}">${f.label ? `<label>${esc(f.label)}${f.required ? ' <i class="req">*</i>' : ''}</label>` : ''}<div class="radio-cards">${opts.map((o) =>
          `<label class="radio-card"><input type="radio" name="${f.name}" value="${esc(o.value)}" ${String(o.value) === String(val) ? 'checked' : ''} ${req}/><span>${o.icon ? NA.icon(o.icon, 20) : ''}<b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span></label>`).join('')}</div>${help}</div>`;
      case 'money':
        input = `<div class="input-prefix"><span>৳</span><input id="${id}" type="number" name="${f.name}" value="${esc(val)}" min="${f.min != null ? f.min : 0}" step="${f.step || 1}" placeholder="${esc(f.placeholder || '0')}" ${req}/></div>`;
        break;
      default:
        input = `<input id="${id}" type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''} ${req}/>`;
    }
    return `<div class="field ${span}">${label}${input}${help}</div>`;
  };
  /** Read all named inputs in an element into an object. Numbers become numbers, checkboxes booleans. */
  ui.readForm = (root) => {
    const out = {};
    root.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
      else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
      else out[el.name] = el.value.trim();
    });
    return out;
  };
  /** Returns true if the form is valid; otherwise highlights the first invalid field. */
  ui.validate = (root) => {
    const bad = [...root.querySelectorAll('[required]')].find((el) => el.type === 'radio' ? !root.querySelector(`[name="${el.name}"]:checked`) : !String(el.value).trim());
    if (bad) { bad.focus(); (bad.closest('.field') || bad).classList.add('invalid'); ui.toast('Please fill the required fields', 'error'); return false; }
    return true;
  };

  /* ---------------- Overlays ---------------- */
  let overlayStack = [];
  /** Open a modal. body: html string. actions: [{label, kind:'primary'|'ghost'|'danger', onClick(modalEl) -> false to keep open}]
      onMount(modalEl) runs after insertion. Returns the modal element. */
  ui.modal = ({ title, subtitle, body, actions = [], size = 'md', onMount, onClose }) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="modal modal-${size}" role="dialog" aria-modal="true">
      <header class="modal-head"><div><h3>${esc(title || '')}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Close">${NA.icon('x')}</button></header>
      <div class="modal-body">${body || ''}</div>
      ${actions.length ? `<footer class="modal-foot">${actions.map((a, i) => `<button class="btn btn-${a.kind || 'ghost'}" data-action-idx="${i}">${a.icon ? NA.icon(a.icon, 16) : ''}${esc(a.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
    document.body.appendChild(wrap);
    const el = wrap.querySelector('.modal');
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.classList.add('closing'); wrap.style.pointerEvents = 'none';
      setTimeout(() => wrap.remove(), 160); overlayStack = overlayStack.filter((x) => x !== wrap); onClose && onClose();
    };
    wrap._close = close;
    overlayStack.push(wrap);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('[data-close]').onclick = close;
    actions.forEach((a, i) => {
      const b = wrap.querySelector(`[data-action-idx="${i}"]`);
      // The button stays disabled until its work is done, so a double click cannot save twice.
      b.onclick = async () => {
        if (closed || b.disabled) return;
        if (!a.onClick) return close();
        b.disabled = true;
        let r;
        try { r = await a.onClick(el); } catch (e) { console.error(e); ui.toast(e.message || 'Something went wrong', 'error'); r = false; }
        if (r !== false) close(); else b.disabled = false;
      };
    });
    onMount && onMount(el);
    const first = el.querySelector('input:not([type=hidden]),select,textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return el;
  };
  ui.closeTop = () => { const w = overlayStack[overlayStack.length - 1]; if (w) w._close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlayStack.length) ui.closeTop(); });

  /** Right-side drawer for record details. Same params as modal. */
  ui.drawer = (opts) => ui.modal(Object.assign({}, opts, { size: 'drawer' }));

  ui.confirm = (message, { title = 'Please confirm', okLabel = 'Confirm', danger = false } = {}) => new Promise((resolve) => {
    let ok = false;
    ui.modal({ title, body: `<p>${message}</p>`, size: 'sm', onClose: () => resolve(ok),
      actions: [{ label: 'Cancel' }, { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { ok = true; } }] });
  });

  /** Modal with a form; resolves via onSubmit(values, modalEl) which may return false to keep open. */
  ui.formModal = ({ title, subtitle, fields, values, submitLabel = 'Save', onSubmit, size = 'md', intro = '' }) =>
    ui.modal({ title, subtitle, size, body: intro + `<form class="modal-form" onsubmit="return false">${ui.form(fields, values)}</form>`,
      actions: [{ label: 'Cancel' }, { label: submitLabel, kind: 'primary', onClick: async (el) => {
        const form = el.querySelector('form');
        if (!ui.validate(form)) return false;
        const r = await onSubmit(ui.readForm(form), el);
        return r === false ? false : true;
      } }] });

  ui.toast = (msg, kind = 'success') => {
    let host = document.getElementById('toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + kind;
    t.innerHTML = NA.icon(kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check-circle', 18) + `<span>${esc(msg)}</span>`;
    host.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3600);
  };

  /** Event delegation helper. Returns an unbind function. */
  ui.delegate = (root, type, selector, handler) => {
    const fn = (e) => { const el = e.target.closest(selector); if (el && root.contains(el)) handler(el, e); };
    root.addEventListener(type, fn);
    return () => root.removeEventListener(type, fn);
  };

  /** Common select options */
  ui.opts = {
    models: () => NA.db.models.filter((m) => m.active !== false).map((m) => ({ value: m.id, label: NA.modelName(m.id) })),
    staff: (roles) => NA.staffBy(roles || NA.FLOW.staffRoles).map((s) => ({ value: s.id, label: s.name + ' — ' + s.role })),
    consultants: () => NA.staffBy(['Sales Consultant', 'Sales Manager']).map((s) => ({ value: s.id, label: s.name })),
    technicians: () => NA.staffBy(['Technician', 'Service Advisor']).map((s) => ({ value: s.id, label: s.name })),
    customers: () => NA.db.customers.map((c) => ({ value: c.id, label: c.name + (c.mobile ? ' · ' + c.mobile : '') })),
    locations: () => NA.db.settings.locations,
    vendors: () => NA.db.vendors.map((v) => ({ value: v.id, label: v.name })),
    colors: (modelId) => { const m = NA.model(modelId); return (m && m.colors) || ['Ski White', 'Cosmos Black', 'Surf Blue', 'Boulder Grey']; },
  };

  /** Simple SVG bar chart: data [{label, value, tone?}] */
  ui.bars = (data, { height = 160, money = false } = {}) => {
    if (!data.length) return ui.empty('No data');
    const max = Math.max(1, ...data.map((d) => d.value));
    return `<div class="bars" style="height:${height}px">${data.map((d) => `
      <div class="bar-col" title="${esc(d.label)}: ${money ? NA.fmt.money(d.value) : d.value}">
        <span class="bar-val">${money ? NA.fmt.short(d.value) : d.value}</span>
        <span class="bar bar-${d.tone || 'brand'}" style="height:${(d.value / max) * 100}%"></span>
        <span class="bar-label">${esc(d.label)}</span>
      </div>`).join('')}</div>`;
  };

  /** Donut: data [{label, value, color}] */
  ui.donut = (data, { size = 140, center = '' } = {}) => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let acc = 0; const r = 15.915;
    const segs = data.map((d) => { const pct = (d.value / total) * 100; const s = `<circle r="${r}" cx="21" cy="21" fill="transparent" stroke="${d.color}" stroke-width="5" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${25 - acc}"/>`; acc += pct; return s; }).join('');
    return `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 42 42" class="donut"><circle r="${r}" cx="21" cy="21" fill="transparent" stroke="var(--line)" stroke-width="5"/>${segs}<text x="21" y="22.5" text-anchor="middle" class="donut-center">${esc(center)}</text></svg>
      <ul class="legend">${data.map((d) => `<li><i style="background:${d.color}"></i>${esc(d.label)}<b>${d.value}</b></li>`).join('')}</ul></div>`;
  };

  /** Print a block of HTML (receipts, handover forms, invoices). Returns the print window, or null when pop-ups are blocked. */
  ui.print = (title, html) => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { ui.toast('Allow pop-ups for this site to print', 'error'); return null; }
    const s = NA.db.settings;
    w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
      body{font-family:Inter,system-ui,Arial,sans-serif;color:#1d2327;margin:40px;font-size:13px}
      .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #d0021b;padding-bottom:14px;margin-bottom:24px}
      .ph img{height:46px} h1{font-size:20px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin:14px 0}
      td,th{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f6f6f6} .r{text-align:right}
      .sig{display:flex;justify-content:space-between;margin-top:70px}.sig div{border-top:1px solid #333;padding-top:6px;width:40%;text-align:center}
      .muted{color:#666}</style></head><body>
      <div class="ph"><img src="${location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '')}assets/noor-logo.png"/><div class="muted" style="text-align:right">${esc(s.company)}<br>${esc(s.tagline)}</div></div>
      ${html}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
    return w;
  };

  /* ------------------------------------------------------------------------
     Router — hash based: #/section/param1/param2
     Pages register with NA.page({ id, path, title, icon, render(root, params, query) })
     render() receives the main content element; it may return a cleanup fn.
     ------------------------------------------------------------------------ */
  NA.pages = {};
  NA.page = (def) => { NA.pages[def.path] = def; };

  let cleanup = null;
  NA.go = (hash) => { if (location.hash === hash) NA.render(); else location.hash = hash; };
  NA.currentRoute = () => {
    const raw = (location.hash || '#/dashboard').slice(1);
    const [pathPart, qs] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    return { section: parts[0] || 'dashboard', params: parts.slice(1).map(decodeURIComponent), query };
  };
  /** Re-render the current page (call after data changes). Keeps scroll position. */
  NA.render = () => {
    const main = document.getElementById('main');
    if (!main) return;
    const { section, params, query } = NA.currentRoute();
    const page = NA.pages[section] || {
      title: 'Not found',
      render: (root) => { root.innerHTML = `<div class="card pad">${ui.empty('This screen does not exist. It may have moved.', 'search', '<a class="btn btn-primary" href="#/dashboard">Go to Today</a>')}</div>`; },
    };
    const scroll = main.scrollTop;
    const sameSection = main.dataset.section === section;
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    main.dataset.section = section;
    const root = document.createElement('div');
    root.className = 'page page-' + section;
    main.replaceChildren(root);
    try { cleanup = page.render(root, params, query) || null; }
    catch (e) {
      console.error(e);
      root.innerHTML = `<div class="card pad">${ui.empty('Something went wrong on this screen: ' + e.message, 'alert')}</div>`;
    }
    if (sameSection) main.scrollTop = scroll; else main.scrollTop = 0;
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.section === section));
    document.title = (page.title || 'Noor Autos') + ' · Noor Autos DMS';
    NA.emit('rendered', { section });
  };
  window.addEventListener('hashchange', () => NA.render());

  /** Standard page header html. actions: html string of buttons. */
  ui.pageHead = ({ title, subtitle, actions = '', crumbs }) => `<header class="page-head">
    <div>${crumbs ? `<nav class="crumbs">${crumbs.map((c) => c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`).join(NA.icon('chevron-right', 14))}</nav>` : ''}
    <h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${subtitle}</p>` : ''}</div>
    <div class="page-actions">${actions}</div></header>`;

  ui.btn = (label, { kind = 'ghost', icon, act, attrs = '', href, size } = {}) => href
    ? `<a class="btn btn-${kind} ${size ? 'btn-' + size : ''}" href="${href}" ${attrs}>${icon ? NA.icon(icon, 16) : ''}${esc(label)}</a>`
    : `<button class="btn btn-${kind} ${size ? 'btn-' + size : ''}" ${act ? `data-act="${act}"` : ''} ${attrs}>${icon ? NA.icon(icon, 16) : ''}${esc(label)}</button>`;

  /** Global search across customers, leads, orders, VINs, job cards. */
  NA.search = (q) => {
    q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
    const hit = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(q));
    const out = [];
    NA.db.leads.forEach((l) => hit(l.name, l.mobile, l.code) && out.push({ type: 'Lead', icon: 'user-plus', title: l.name, sub: l.code + ' · ' + NA.stageLabel(NA.FLOW.leadStages.concat(NA.FLOW.leadClosed), l.stage), href: '#/leads/' + l.id }));
    NA.db.customers.forEach((c) => hit(c.name, c.mobile, c.company, c.email) && out.push({ type: 'Customer', icon: 'user', title: c.name, sub: c.mobile || '', href: '#/customers/' + c.id }));
    NA.db.orders.forEach((o) => hit(o.code, NA.customerName(o.customerId)) && out.push({ type: 'Order', icon: 'receipt', title: o.code + ' · ' + NA.customerName(o.customerId), sub: NA.modelName(o.modelId) + ' · ' + NA.stageLabel(NA.FLOW.orderStages, o.stage), href: '#/sales/' + o.id }));
    NA.db.vehicles.forEach((v) => hit(v.vin, v.regNo, v.motorNo) && out.push({ type: 'Vehicle', icon: 'car', title: v.vin, sub: NA.modelName(v.modelId) + ' · ' + v.color, href: '#/inventory/' + v.id }));
    NA.db.purchaseOrders.forEach((p) => hit(p.code) && out.push({ type: 'PO', icon: 'cart', title: p.code, sub: NA.vendorName(p.vendorId), href: '#/procurement/' + p.id }));
    NA.db.jobCards.forEach((j) => hit(j.code, NA.customerName(j.customerId)) && out.push({ type: 'Job card', icon: 'wrench', title: j.code, sub: NA.customerName(j.customerId), href: '#/service/job/' + j.id }));
    NA.db.parts.forEach((p) => hit(p.sku, p.name) && out.push({ type: 'Part', icon: 'cog-parts', title: p.name, sub: p.sku, href: '#/parts?q=' + encodeURIComponent(p.sku) }));
    // Only results this person can open (Accounts receive job cards but have no Service screen, for example).
    const opens = (href) => !NA.canSee || NA.canSee(String(href).replace(/^#\//, '').split(/[/?]/)[0]);
    return out.filter((r) => opens(r.href)).slice(0, 20);
  };
})();
