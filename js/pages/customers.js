/* ==========================================================================
   Customers — the directory and one page per customer.
   Routes: #/customers (directory) and #/customers/<id> (orders, cars and
   warranty, money, service, follow-ups, leads, history).
   A Sales Consultant sees their own customers (and, read only, the customer
   of an order they own). Name, mobile, NID, TIN and type are locked once the
   customer has bought; only managers and Accounts change them (logged
   old → new). Money shows confirmed and waiting
   amounts separately; cancelled orders never count as paid and money still
   held on them shows as "Refund due".
   Exposes NA.actions.newCustomer(prefill) and NA.actions.editCustomer(id).
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const ui = NA.ui;
  const esc = NA.esc;
  const B = NA.biz;

  /* ---------------- helpers ---------------- */
  const refresh = () => (NA.refresh ? NA.refresh() : NA.render());
  function normMobile(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('880')) d = d.slice(2);
    if (d.length === 10 && d[0] === '1') d = '0' + d;
    return d;
  }
  const validMobile = (v) => /^01[3-9]\d{8}$/.test(normMobile(v));
  const validEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());
  const prettyMobile = (v) => { const d = normMobile(v); return d.length === 11 ? d.slice(0, 5) + '-' + d.slice(5) : (v || '—'); };
  const telHref = (v) => 'tel:+88' + normMobile(v);
  const waHref = (v) => 'https://wa.me/88' + normMobile(v);
  const dash = '<span class="muted">—</span>';
  const money = (n) => NA.fmt.money(n);
  const callAction = (name, arg, label) => {
    if (NA.actions && typeof NA.actions[name] === 'function') NA.actions[name](arg);
    else ui.toast((label || 'That screen') + ' is not available', 'error');
  };
  /** Shared CRM helpers live in leads.js; small fallbacks keep this page working without it. */
  const LU = () => NA.leadUtils || {};
  function fieldError(scope, name, msg) {
    if (LU().fieldError) return LU().fieldError(scope, name, msg);
    ui.toast(msg, 'error'); return false;
  }
  const clearErrors = (scope) => { if (LU().clearErrors) LU().clearErrors(scope); };

  /* Who may do what here. */
  const isManager = () => NA.isManager();
  /** Sees order money (Sales, Accounts, managers); the workshop does not. */
  const seesMoney = () => NA.canSee('sales');
  /** May change a customer's identity after the sale. */
  const mayEditIdentity = () => NA.isManager() || NA.isRole('accounts');
  const mayAssign = () => NA.can('leads.assign');
  /** A consultant works with (and changes) only their own customers; everyone else here works with all of them. */
  const ownCustomer = (c) => !NA.isRole('sales') || NA.isMine(c);
  /** The consultant has an order for this customer, so they see the customer too (read only). */
  const viaMyOrder = (c) => NA.db.orders.some((o) => o.customerId === c.id && NA.isMine(o));

  // The Orders screen's words and colours (core), at the stage the order has really reached, so an order looks the same everywhere.
  const ORDER_STAGES = NA.FLOW.orderStages.concat(NA.FLOW.orderCancelled ? [NA.FLOW.orderCancelled] : []);
  const stageNow = (o) => (B.stageOf ? B.stageOf(o) : o.stage);
  const orderWord = (o) => NA.stageLabel(ORDER_STAGES, stageNow(o));
  const orderBadge = (o) => { const k = stageNow(o); return ui.badge(NA.stageLabel(ORDER_STAGES, k), NA.stageTone(ORDER_STAGES, k)); };
  const JOB_TONE = { open: 'blue', in_progress: 'amber', completed: 'teal', invoiced: 'green' };
  // The Leads screen's words and colours (core).
  const LEAD_STAGES = NA.FLOW.leadStages.concat(NA.FLOW.leadClosed);
  const leadWord = (k) => NA.stageLabel(LEAD_STAGES, k);
  const leadTone = (k) => NA.stageTone(LEAD_STAGES, k);
  const PAY_WORD = { cleared: 'Confirmed', pending: 'Waiting for Accounts', bounced: 'Not received' };
  const PAY_TONE = { cleared: 'green', pending: 'amber', bounced: 'red' };
  const payStatus = (p) => (p.status === 'pending' || p.status === 'bounced' ? p.status : 'cleared');

  /** Approximate swatch colour from a BYD colour name. */
  function colorHex(name) {
    const n = String(name || '').toLowerCase();
    const map = [['white', '#f4f5f6'], ['black', '#1f2326'], ['grey', '#8a9097'], ['gray', '#8a9097'], ['blue', '#3d6fb6'], ['red', '#c0202e'], ['pink', '#e8a3b5'], ['green', '#3f5f4a']];
    const hit = map.find(([k]) => n.includes(k));
    return hit ? hit[1] : '#c8ced3';
  }
  const swatch = (c) => `<span class="swatch" style="background:${colorHex(c)}"></span>`;

  /** Money on one order. Only confirmed money counts as paid; toCollect is what the customer has still to hand over
      (money waiting for Accounts counts as handed over). A cancelled order owes nothing; a refund is due only when the
      approved cancellation says so (refund.status 'due'). A cancellation approved with no refund (the booking money
      kept) owes nothing back. Only old cancellations from before that record existed count the money still held. */
  function orderMoney(o, pays) {
    let cleared = 0, pending = 0;
    (pays || B.orderPayments(o)).forEach((p) => {
      const st = payStatus(p), a = Number(p.amount) || 0;
      if (st === 'cleared') cleared += a; else if (st === 'pending') pending += a;
    });
    const r = o.refund || null;
    if (o.stage === 'cancelled') {
      const due = r ? (r.status === 'due' ? Number(r.amount) || 0 : 0) : (o.cancel ? 0 : Math.max(0, cleared));
      return { net: 0, cleared: 0, pending: 0, owed: 0, toCollect: 0, refund: due > 0.5 ? due : 0, held: cleared, cancelled: true };
    }
    const net = B.orderNet(o);
    return { net, cleared, pending, owed: Math.max(0, net - cleared), toCollect: Math.max(0, net - cleared - pending), refund: r && r.status === 'due' ? Number(r.amount) || 0 : 0, held: 0, cancelled: false };
  }

  /** Everything linked to one customer, gathered once per render. */
  function profile(c) {
    const orders = NA.where('orders', (o) => o.customerId === c.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const live = orders.filter((o) => o.stage !== 'cancelled');
    const orderIds = new Set(orders.map((o) => o.id));
    // Car money only: workshop money is billed on its own invoices.
    const payments = NA.where('payments', (p) => !!p.orderId && (orderIds.has(p.orderId) || p.customerId === c.id))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const byOrder = new Map();
    payments.forEach((p) => { const a = byOrder.get(p.orderId) || []; a.push(p); byOrder.set(p.orderId, a); });
    const money = new Map(orders.map((o) => [o.id, orderMoney(o, byOrder.get(o.id) || [])]));
    const total = (k) => orders.reduce((s, o) => s + money.get(o.id)[k], 0);
    const vehicles = NA.where('vehicles', (v) => v.customerId === c.id || (v.orderId && orderIds.has(v.orderId)));
    const jobs = NA.where('jobCards', (j) => j.customerId === c.id).sort((a, b) => String(b.openedAt || b.createdAt).localeCompare(String(a.openedAt || a.createdAt)));
    const bookings = NA.where('serviceBookings', (b) => b.customerId === c.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const followUps = NA.where('followUps', (f) => f.customerId === c.id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    // Leads are linked by id; a lead with the same number is only a suggestion (family members share phones).
    const m = normMobile(c.mobile);
    const leads = NA.where('leads', (l) => l.customerId === c.id);
    const leadSuggest = m.length === 11 ? NA.where('leads', (l) => !l.customerId && normMobile(l.mobile) === m) : [];
    const invoices = NA.where('invoices', (i) => i.customerId === c.id);
    const serviceSpend = invoices.filter((i) => i.kind === 'service').reduce((s, i) => s + (Number(i.total) || 0), 0);
    return {
      orders, live, payments, money, vehicles, jobs, bookings, followUps, leads, leadSuggest, invoices, serviceSpend,
      value: total('net'), paid: total('cleared'), waiting: total('pending'), toCollect: total('toCollect'), refundDue: total('refund'),
    };
  }

  /** What the directory needs, in one pass over each list (not customers × records). */
  function directoryStats() {
    const stats = new Map();
    const get = (id) => { let s = stats.get(id); if (!s) stats.set(id, (s = Object.assign({}, EMPTY_STATS))); return s; };
    const pays = new Map();
    NA.db.payments.forEach((p) => { if (!p.orderId) return; const a = pays.get(p.orderId) || []; a.push(p); pays.set(p.orderId, a); });
    NA.db.orders.forEach((o) => {
      if (!o.customerId) return;
      const s = get(o.customerId); const mm = orderMoney(o, pays.get(o.id) || []);
      if (!mm.cancelled) { s.orders++; if (o.stage !== 'delivered') s.open++; }
      s.net += mm.net; s.toCollect += mm.toCollect; s.waiting += mm.pending; s.refund += mm.refund;
    });
    NA.db.vehicles.forEach((v) => { if (!v.customerId) return; const s = get(v.customerId); s.cars++; if (v.status === 'delivered') s.owner = true; });
    return stats;
  }

  /** The customer's consultant: set on the record, or (older records) the salesperson who owns it. */
  const consultantOf = (c) => {
    if (c.consultantId) return c.consultantId;
    const s = c.ownerId && NA.get('staff', c.ownerId);
    return s && ['Sales Consultant', 'Sales Manager'].includes(s.role) ? s.id : '';
  };

  /** Has this customer bought, as far as this person's screens show (firstOrderAt: stamped by Orders when it books one)? */
  const hasBought = (c) => !!c.firstOrderAt || NA.db.orders.some((o) => o.customerId === c.id) || NA.db.payments.some((p) => p.customerId === c.id && !!p.orderId)
    || NA.db.vehicles.some((v) => v.customerId === c.id) || NA.db.warranties.some((w) => w.customerId === c.id)
    || NA.db.invoices.some((i) => i.customerId === c.id && i.kind === 'vehicle');
  /** The workshop receives no orders, so it cannot see a booking: a customer of the sales team counts as bought there. */
  const salesCustomer = (c) => !NA.canSee('sales') && !!(consultantOf(c) || c.leadId);
  /** Name, mobile, NID, TIN and type are locked once the customer has bought (managers and Accounts change them with a reason). */
  const identityLocked = (c) => hasBought(c) || salesCustomer(c);

  function ensureCss() {
    if (!document.head || document.getElementById('css-customers')) return;
    const s = document.createElement('style');
    s.id = 'css-customers';
    s.textContent = `
      .cu-kpis { margin-bottom: 24px; }
      .cu-toolbar { margin-bottom: 20px; gap: 10px 12px; }
      .cu-search { position: relative; flex: 1 1 240px; max-width: 380px; }
      .cu-search input { width: 100%; padding-left: 34px !important; }
      .cu-search .ico { position: absolute; left: 11px; top: 9px; color: var(--muted); pointer-events: none; }
      .cu-count { font-size: 12.5px; color: var(--muted); margin-left: auto; }
      .cu-more { display: flex; justify-content: center; padding: 14px; }
      .cu-banner { margin-bottom: 20px; }
      .cu-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 20px; }
      .cu-sum > div { padding: 18px 22px; min-width: 0; }
      .cu-sum > div + div { box-shadow: inset .5px 0 0 var(--line-2); }
      .cu-sum small { display: block; color: var(--muted); font-size: 13px; font-weight: 500; }
      .cu-sum b { display: block; font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -.025em; margin-top: 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cu-sum span { display: block; color: var(--muted); font-size: 12.5px; margin-top: 4px; }
      /* Money is never cut off: two columns as soon as four get narrow, one on a phone. */
      @media (max-width: 1280px) { .cu-sum { grid-template-columns: 1fr 1fr; } .cu-sum > div:nth-child(3) { box-shadow: inset 0 .5px 0 var(--line-2); } .cu-sum > div:nth-child(4) { box-shadow: inset .5px .5px 0 var(--line-2); } }
      @media (max-width: 560px) { .cu-sum { grid-template-columns: 1fr; } .cu-sum > div { padding: 14px 18px; } .cu-sum > div + div, .cu-sum > div:nth-child(3), .cu-sum > div:nth-child(4) { box-shadow: inset 0 .5px 0 var(--line-2); } }
      .cu-journey { margin-bottom: 20px; }
      .cu-journey-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
      .cu-journey-sub { font-size: 12.5px; color: var(--muted); }
      .cu-journey-sub a { color: var(--tint); }
      .cu-next { margin-bottom: 24px; }
      .cu-main, .cu-side { gap: 20px; }
      .cu-card-head-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .cu-veh { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .cu-veh .vin-card { cursor: default; }
      .cu-veh .vin-card:hover { box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--line-2); }
      .cu-veh .v-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .cu-veh .v-name { font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
      .cu-veh .v-rows { display: grid; grid-template-columns: 90px 1fr; gap: 4px 10px; font-size: 12.5px; }
      .cu-veh .v-rows span:nth-child(odd) { color: var(--muted); }
      .cu-veh .v-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .cu-veh .v-foot .grow { flex: 1; }
      .cu-ledger tr.is-void td { color: var(--muted); }
      .cu-ledger td.is-wait { color: var(--muted); }
      .cu-ledger td.is-bounced { color: var(--muted); text-decoration: line-through; }
      .page-customers .swatch { box-shadow: inset 0 0 0 1px var(--line); }
      .cu-pay { min-width: 110px; }
      .cu-complaint { max-width: 260px; }
      .cu-contact-head { display: flex; align-items: center; gap: 14px; padding: 18px 18px 14px; }
      .cu-contact-head b { display: block; font-size: 17px; font-weight: 600; letter-spacing: -.015em; }
      .cu-contact-head .small { display: block; }
      .cu-contact-btns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 18px 16px; }
      .cu-contact-btns .btn { padding: 0 8px; }
      .cu-lock { padding: 0 2px; margin: 8px 16px 0; }
      .cu-fu li .grow .t { white-space: normal; }
      .cu-booked { padding: 16px 24px 0; }
      .cu-booked .ar-icon { background: var(--blue-50); color: var(--blue); }
      .cu-booked .grow { flex: 1; min-width: 0; }
      .cu-lead-ico { color: var(--muted); }
      .cu-modal .radio-cards { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
      .cu-modal .radio-card span { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 2px 8px; padding: 10px 12px; }
      .cu-modal .radio-card span small { flex-basis: 100%; }
      @media (max-width: 560px) { .next-step { flex-wrap: wrap; } .next-step > .btn { width: 100%; justify-content: center; } .cu-contact-btns { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(s);
  }

  /* ---------------- Add / edit customer ---------------- */
  const IDENTITY = ['type', 'name', 'mobile', 'nid', 'tin'];
  /** Is this name, mobile, NID, TIN or type the one already stored? (The same digits; no type means a person.) */
  const sameIdentity = (k, a, b) => (k === 'mobile' ? normMobile(a) === normMobile(b)
    : k === 'type' ? (a || 'Individual') === (b || 'Individual') : String(a || '').trim() === String(b || '').trim());
  /** Active consultants, plus the current one when they have left (so saving never quietly unassigns the customer). */
  const consultantOpts = (cur) => {
    const opts = [{ value: '', label: 'Unassigned' }].concat(ui.opts.consultants());
    if (!cur || opts.some((o) => o.value === cur)) return opts;
    const s = NA.get('staff', cur);
    return opts.concat([{ value: cur, label: (s ? s.name : 'Former consultant') + (!s || s.active === false ? ' (left)' : '') }]);
  };
  function customerFields(locked, cur) {
    const f = [
      { name: 'type', label: 'Who is buying?', type: 'radio-cards', required: true, span: 2, options: [
        { value: 'Individual', label: 'A person', icon: 'user', hint: 'Buying for themselves' },
        { value: 'Corporate', label: 'A company', icon: 'building', hint: 'Company or fleet' }] },
      { name: 'name', label: 'Full name or company name', required: true },
      { name: 'mobile', label: 'Mobile number', type: 'tel', required: true, placeholder: '01XXXXXXXXX', help: '11 digits' },
      // Shown by type: NID for a person, TIN / BIN and a contact person for a company.
      { name: 'nid', label: 'NID number', placeholder: 'From the national ID card', help: 'Needed before BRTA registration' },
      { name: 'tin', label: 'TIN / BIN', placeholder: 'Optional' },
      { name: 'contactPerson', label: 'Contact person', placeholder: 'e.g. Mr. Habib, Procurement' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'Optional' },
      { name: 'address', label: 'Address', span: 2, placeholder: 'House, road, area, city' },
    ];
    if (mayAssign()) f.push({ name: 'consultantId', label: 'Consultant', type: 'select', options: consultantOpts(cur), placeholder: false });
    if (locked && mayEditIdentity()) f.push({ name: 'reason', label: 'Why are the name or ID details changing?', type: 'textarea', rows: 2, span: 2, placeholder: 'Only needed if you change the name, mobile, NID, TIN or type' });
    f.push({ name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 });
    return f;
  }

  /** Server-wide duplicate check (NA.lookupMobile through leads.js); a simple local check if that is missing. */
  async function dupCheck(el, mobile, except) {
    if (LU().dupOk) return LU().dupOk(el, 'customer', mobile, except);
    const m = normMobile(mobile);
    const hit = NA.db.customers.find((x) => normMobile(x.mobile) === m && (!except || x.id !== except.id));
    if (!hit) return [];
    const box = el.querySelector('[data-dup]');
    if (box) box.innerHTML = `<div class="callout callout-warn cu-banner">${NA.icon('alert', 16)}<div class="grow"><b>${esc(hit.name)} already has this number.</b></div><a class="btn btn-sm btn-ghost" href="#/customers/${esc(hit.id)}" data-dup-link>Open it</a></div>`;
    return false;
  }

  function customerModal(c, prefill) {
    const isNew = !c;
    if (isNew && NA.isRole('sales') && !NA.myStaffId()) { ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error'); return; }
    if (!isNew && !ownCustomer(c)) { ui.toast('Only the customer’s own consultant or the Sales Manager changes their details', 'info'); return; }
    const locked = !isNew && identityLocked(c);
    // After a sale, only managers and Accounts change the name, mobile, NID, TIN or type.
    const frozen = locked && !mayEditIdentity();
    const why = !frozen ? '' : hasBought(c) ? 'because this customer has bought a car'
      : 'because this is a customer of the sales team, who may already have booked an order';
    const values = Object.assign({ type: 'Individual' }, isNew ? prefill || {} : c);
    values.consultantId = isNew ? values.consultantId || '' : consultantOf(c);
    const el = ui.formModal({
      title: isNew ? 'Add customer' : 'Edit customer', subtitle: isNew ? 'Customers are also added automatically when a lead becomes an order.' : esc(c.name),
      submitLabel: isNew ? 'Add customer' : 'Save changes',
      intro: (frozen ? `<div class="callout callout-info cu-banner">${NA.icon('lock', 16)}<div>The name, mobile, NID, TIN and type are locked ${why}. The Sales Manager or Accounts can change them.</div></div>` : '') + '<div data-dup></div>',
      fields: customerFields(locked, values.consultantId), values,
      onSubmit: async (v, modal) => {
        clearErrors(modal);
        const fresh = c ? NA.customer(c.id) || c : null;
        if (frozen) IDENTITY.forEach((k) => { v[k] = fresh[k] || (k === 'type' ? 'Individual' : ''); });
        // A locked mobile is not this person's to correct, so it does not stop the save.
        if (!frozen && !validMobile(v.mobile)) return fieldError(modal, 'mobile', 'Enter 11 digits starting with 01, e.g. 01712345678');
        if (!validEmail(v.email)) return fieldError(modal, 'email', 'This email address doesn’t look right');
        if ((isNew || normMobile(v.mobile) !== normMobile(fresh.mobile)) && (await dupCheck(modal, v.mobile, c ? { kind: 'customer', id: c.id } : null)) === false) return false;
        const corp = v.type === 'Corporate';
        const keep = (k) => (fresh ? fresh[k] || '' : '');
        const data = {
          type: v.type || 'Individual', name: v.name, mobile: normMobile(v.mobile), email: v.email, address: v.address,
          // Fields hidden for this type keep what was there before.
          nid: corp ? keep('nid') : v.nid, tin: corp ? v.tin : keep('tin'), contactPerson: corp ? v.contactPerson : keep('contactPerson'),
          company: corp ? v.name : (fresh && fresh.company && fresh.company !== fresh.name ? fresh.company : ''), notes: v.notes,
        };
        // The consultant changes only when the manager picked someone else (NA.update moves ownerId with it, and
        // keeps an unassigned customer with this manager until someone takes it).
        if (mayAssign()) { if (isNew || (v.consultantId || '') !== consultantOf(fresh)) data.consultantId = v.consultantId || ''; }
        else if (isNew) data.consultantId = NA.isRole('sales') ? NA.myStaffId() || '' : '';
        if (isNew) {
          const me = NA.me();
          const rec = NA.insert('customers', Object.assign(data, { history: [], createdBy: me.name, createdById: me.staffId || null }));
          NA.log(`New customer ${rec.name} added`, { rec, link: '#/customers/' + rec.id, kind: 'success' });
          ui.toast('Customer added');
          if (prefill && prefill.stay) refresh(); else NA.go('#/customers/' + rec.id);
          return;
        }
        // Only the name and ID details someone really changed are saved: the same mobile written another way, or a
        // missing type, is no change. (Once the customer has bought, the office server refuses any change to them from
        // anyone but managers and Accounts, and the whole save would be undone.)
        IDENTITY.forEach((k) => { if (sameIdentity(k, data[k], fresh[k])) delete data[k]; });
        const identity = !frozen && IDENTITY.some((k) => k in data);
        if (locked && identity && !v.reason) return fieldError(modal, 'reason', 'Say why the name or ID details are changing');
        const WORD = { type: 'type', name: 'name', mobile: 'mobile', nid: 'NID', tin: 'TIN', contactPerson: 'contact person', email: 'email', address: 'address', consultantId: 'consultant' };
        const show = (k, x) => (k === 'consultantId' ? (x ? NA.staffName(x) : 'Unassigned') : x || '—');
        const before = Object.assign({}, fresh, { consultantId: consultantOf(fresh), type: fresh.type || 'Individual' });
        const changes = Object.keys(WORD).filter((k) => k in data && String(before[k] || '') !== String(data[k] || '')).map((k) => `${WORD[k]} ${show(k, before[k])} → ${show(k, data[k])}`);
        NA.update('customers', c.id, data);
        // Given to someone else: the customer's own open calls go along (leads.js customerHandedOver).
        const moved = 'consultantId' in data && LU().customerHandedOver ? LU().customerHandedOver(c.id, before.consultantId, (NA.customer(c.id) || {}).ownerId) : 0;
        if (moved) changes.push(`${moved} open call${moved === 1 ? '' : 's'} went too`);
        if (changes.length) NA.log(`Customer ${data.name || fresh.name} changed: ${changes.join('; ')}${identity && v.reason ? ' — reason: ' + v.reason : ''}`, { rec: NA.customer(c.id), link: '#/customers/' + c.id, kind: identity && locked ? 'warn' : 'info' });
        ui.toast('Saved');
        refresh();
      },
    });
    el.classList.add('cu-modal');
    // Show only the fields that fit the type.
    const toggle = () => {
      const t = (el.querySelector('[name=type]:checked') || {}).value || 'Individual';
      [['nid', t !== 'Corporate'], ['tin', t === 'Corporate'], ['contactPerson', t === 'Corporate']].forEach(([n, on]) => {
        const f = el.querySelector(`[name=${n}]`); const box = f && f.closest('.field'); if (box) box.classList.toggle('hidden', !on);
      });
    };
    el.addEventListener('change', toggle);
    toggle();
    if (frozen) IDENTITY.forEach((n) => el.querySelectorAll(`[name=${n}]`).forEach((x) => { x.disabled = true; }));
    if (LU().wireDup) LU().wireDup(el, 'customer', c ? { kind: 'customer', id: c.id } : null, c ? c.mobile : '');
    else { const box = el.querySelector('[data-dup]'); if (box) box.addEventListener('click', (e) => { if (e.target.closest('[data-dup-link]')) ui.closeTop(); }); }
  }

  /* ---------------- Follow-ups (light-weight, shared with service.js data) ---------------- */
  /** A call a manager makes: the call-back after a low rating. */
  const managerCall = (f) => !!f.escalated || f.type === 'Manager call-back';
  /** The Service screen's follow-up rules (NA.service, service.js), so every screen routes and gates follow-ups the
      same way. The small local rules below are used only when it is not loaded. */
  const SV = () => NA.service || {};
  /** Who closes this follow-up when this person may not ('' = they may): call-backs are the Sales Manager's,
      complaints the Service Manager's, the rest whoever may change follow-ups (a consultant only their own). */
  const closedBy = (f) => (typeof SV().followUpCloser === 'function' ? SV().followUpCloser(f)
    : managerCall(f) && !NA.isManager() ? 'the Sales Manager'
      : f.type === 'Complaint' && !NA.can('service.approve') ? 'the Service Manager' : '');
  const closedByNote = (f) => `<span class="lock-note">${NA.icon('lock', 13)}For ${esc(closedBy(f))}</span>`;
  /** The workshop's own calls: about a job, or with no consultant and not a sales call. */
  const workshopCall = (f) => (typeof SV().isServiceCall === 'function' ? SV().isServiceCall(f)
    : !!f.jobCardId || (!f.consultantId && f.type !== 'Payment Follow-up' && !managerCall(f)));
  /** Who a follow-up planned here belongs to. The sales team's go to the customer's consultant (their Today screen);
      anyone else's (the service desk, Accounts) stay with the person who planned them, on the workshop's list. */
  const plannedBy = (c, consultantId) => (NA.can('leads.create')
    ? { consultantId: consultantId || consultantOf(c) || null }
    : { consultantId: null, assignedTo: NA.myStaffId() || null });
  /** Who calls an unhappy customer back: the Sales Manager (the Managing Director when there is none). */
  const callBackBy = () => (NA.staffBy(['Sales Manager'])[0] || NA.staffBy(['Managing Director'])[0] || {}).id || null;
  const serviceManagerId = () => (NA.staffBy(['Service Manager'])[0] || {}).id || null;

  function addFollowUp(c, vehicles) {
    ui.formModal({
      title: 'Schedule follow-up', subtitle: esc(c.name), submitLabel: 'Schedule',
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: NA.FLOW.followUpTypes, required: true, placeholder: false },
        { name: 'due', label: 'Due date', type: 'date', required: true },
        { name: 'vehicleId', label: 'Vehicle', type: 'select', options: vehicles.map((v) => ({ value: v.id, label: NA.modelName(v.modelId) + ' · ' + (v.regNo || v.vin) })), placeholder: 'Not vehicle-specific' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
      ],
      values: { type: NA.FLOW.followUpTypes[0], due: NA.addDays(NA.today(), 3), vehicleId: vehicles.length === 1 ? vehicles[0].id : '' },
      onSubmit: (v, el) => {
        clearErrors(el);
        if (v.due < NA.today()) return fieldError(el, 'due', 'Pick today or a later day');
        NA.insert('followUps', Object.assign({ customerId: c.id, vehicleId: v.vehicleId || null, due: v.due, type: v.type, status: 'pending', notes: v.notes || '', createdBy: NA.me().name }, plannedBy(c)));
        NA.log(`${v.type} planned for ${c.name} on ${NA.fmt.date(v.due)}`, { rec: c, link: '#/customers/' + c.id });
        ui.toast('Follow-up planned'); refresh();
      },
    });
  }
  /** One completion form for follow-ups: the Service screen's if it offers one, otherwise this one (same record shape). */
  function completeFollowUp(c, f) {
    // A call-back or a complaint is closed by the manager it belongs to, never by the person it is about.
    const who = closedBy(f);
    if (who) { ui.toast(who.charAt(0).toUpperCase() + who.slice(1) + ' closes this one', 'info'); return; }
    if (NA.actions && typeof NA.actions.completeFollowUp === 'function') { NA.actions.completeFollowUp(f.id); return; }
    const WORDS = ['', 'Very unhappy', 'Unhappy', 'Okay', 'Happy', 'Very happy'];
    const complaint = f.type === 'Complaint';
    // Closing an escalation needs what was done; it is not rated again.
    const escal = complaint || managerCall(f);
    const el = ui.formModal({
      title: complaint ? 'Close the complaint' : escal ? 'Close the call-back' : 'Mark as done', subtitle: esc(f.type) + ' · ' + esc(c.name), submitLabel: escal ? 'Close it' : 'Mark done',
      fields: [
        escal ? null : { name: 'rating', label: f.type === 'Satisfaction Call' ? 'How happy is the customer?' : 'How happy is the customer? (optional)', type: 'radio-cards', span: 2, required: f.type === 'Satisfaction Call',
          options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n + (n === 1 ? ' star' : ' stars'), hint: WORDS[n] })) },
        { name: 'outcome', label: complaint ? 'What did we do about it?' : escal ? 'What did the customer say, and what was done?' : 'What did the customer say?', type: 'textarea', span: 2, rows: 3, required: escal,
          placeholder: escal ? 'e.g. Called back, the noise was a loose trim — fixed free on Saturday' : 'e.g. Happy with the car, asked about a home charger' },
        { name: 'nextType', label: 'Next follow-up (optional)', type: 'select', options: NA.FLOW.followUpTypes, placeholder: 'None' },
        { name: 'nextDue', label: 'On', type: 'date', min: NA.today() },
      ].filter(Boolean),
      values: { outcome: f.outcome || '', nextDue: NA.addMonths(NA.today(), 3) },
      onSubmit: (v, modal) => {
        clearErrors(modal);
        if (escal && !v.outcome) return fieldError(modal, 'outcome', complaint ? 'Write what was done about the complaint' : 'Write what the customer said and what was done');
        const now = NA.get('followUps', f.id);
        if (!now || now.status === 'done') { ui.toast('Someone has already closed this follow-up', 'info'); refresh(); return; }
        const me = NA.me();
        const rating = Number(v.rating) || null;
        NA.update('followUps', f.id, { status: 'done', doneAt: NA.today(), doneBy: me.name, doneById: me.staffId || null, rating, outcome: v.outcome || '', notes: f.notes || '' });
        // On the customer's timeline only when this person may change the customer (not a customer seen through an order).
        NA.log(`${f.type} ${escal ? 'closed' : 'done'} for ${c.name}${rating ? ' — ' + rating + ' of 5' : ''} (by ${me.name})${escal ? ': ' + v.outcome : ''}`, { rec: ownCustomer(c) ? c : NA.get('followUps', f.id), link: '#/customers/' + c.id, kind: rating && rating <= 2 ? 'warn' : 'success' });
        if (v.nextType && v.nextDue) {
          NA.insert('followUps', Object.assign({ customerId: c.id, vehicleId: f.vehicleId || null, orderId: f.orderId || null, due: v.nextDue, type: v.nextType, status: 'pending',
            notes: 'Planned after ' + f.type.toLowerCase(), createdBy: me.name }, plannedBy(c, managerCall(f) ? '' : f.consultantId)));
        }
        if (rating && rating <= 2) {
          if (workshopCall(f)) {
            // The workshop's calls: a complaint the Service Manager closes, as the Service screen opens one.
            if (!NA.find('followUps', (x) => x.type === 'Complaint' && x.fromId === f.id)) {
              NA.insert('followUps', { customerId: c.id, vehicleId: f.vehicleId || null, jobCardId: f.jobCardId || null, fromId: f.id, due: NA.today(), type: 'Complaint', status: 'pending',
                assignedTo: serviceManagerId(), notes: `Rated ${rating}/5${v.outcome ? ': ' + v.outcome : ''}`, createdBy: me.name });
            }
            ui.toast('Low rating — a complaint is open for the Service Manager', 'info');
          } else {
            // The sales team's calls: the Sales Manager calls back (consultantId = who calls, so it is on no one
            // else's list); it stays with the follow-up's owner, so the consultant sees it but cannot close it.
            NA.insert('followUps', { customerId: c.id, vehicleId: f.vehicleId || null, orderId: f.orderId || null, fromId: f.id, due: NA.today(), type: 'Manager call-back', status: 'pending', escalated: true,
              consultantId: callBackBy() || consultantOf(c) || null, ownerId: f.ownerId || me.staffId || null,
              notes: `Rated ${rating} of 5 on the ${f.type.toLowerCase()}${v.outcome ? ': ' + v.outcome : ''}`, createdBy: me.name });
            ui.toast('Low rating — the Sales Manager will call the customer back', 'info');
          }
        } else ui.toast(escal ? 'Closed' : 'Follow-up done');
        refresh();
      },
    });
    el.classList.add('cu-modal');
  }

  /* ======================================================================
     Directory
     ====================================================================== */
  const PAGE = 100;
  const state = { q: '', type: '', flag: '', limit: PAGE };
  // toCollect: still to hand over; waiting: handed over, not yet confirmed by Accounts.
  const EMPTY_STATS = { orders: 0, open: 0, cars: 0, owner: false, net: 0, toCollect: 0, waiting: 0, refund: 0 };

  function renderList(root) {
    ensureCss();
    // A consultant works with their own customers (the office server only sends those anyway).
    const mine = NA.isRole('sales');
    const all = mine ? NA.db.customers.filter((c) => NA.isMine(c)) : NA.db.customers;
    const stats = directoryStats();
    const st = (c) => stats.get(c.id) || EMPTY_STATS;
    const showMoney = seesMoney();
    const nInd = all.filter((c) => c.type !== 'Corporate').length;
    const nCorp = all.length - nInd;
    // Money waiting for Accounts has been handed over, so it is not "still to collect" (the Orders screen's rule).
    const owing = all.filter((c) => st(c).toCollect > 0.5);
    const refunds = all.filter((c) => st(c).refund > 0.5);
    const owners = all.filter((c) => st(c).owner);
    const tiles = [
      ui.kpi({ label: mine ? 'My customers' : 'Customers', value: all.length, sub: `${nInd} ${nInd === 1 ? 'person' : 'people'} · ${nCorp} ${nCorp === 1 ? 'company' : 'companies'}`, icon: 'users' }),
      ui.kpi({ label: 'Car owners', value: owners.length, sub: 'have their BYD', icon: 'car' }),
    ];
    if (showMoney) tiles.push(
      ui.kpi({ label: 'Still to collect', value: NA.fmt.short(owing.reduce((s, c) => s + st(c).toCollect, 0)), sub: `${owing.length} customer${owing.length === 1 ? '' : 's'} still paying`, icon: 'wallet', tone: owing.length ? 'amber' : 'neutral' }),
      ui.kpi({ label: 'Refunds due', value: NA.fmt.short(refunds.reduce((s, c) => s + st(c).refund, 0)), sub: refunds.length ? `${refunds.length} cancelled order${refunds.length === 1 ? '' : 's'} with money held` : 'none', icon: 'undo', tone: refunds.length ? 'red' : 'neutral' }));
    const allActive = !state.type && !state.flag;
    const chip = (key, val, label, n) => `<button class="chip ${(key === 'all' ? allActive : state[key] === val) ? 'active' : ''}" data-act="chip" data-k="${key}" data-v="${val}">${esc(label)} <span class="n">${n}</span></button>`;

    root.innerHTML = ui.pageHead({
      title: mine ? 'My customers' : 'Customers',
      subtitle: mine ? 'The people you sell to, with their orders, cars and money in one place.' : 'Every buyer — people and companies — with orders, cars, money and service in one place.',
      actions: ui.btn('Add customer', { kind: 'primary', icon: 'plus', act: 'add' }),
    }) + `<div class="grid grid-${tiles.length} cu-kpis">${tiles.join('')}</div>
      <div class="toolbar cu-toolbar">
        <label class="cu-search">${NA.icon('search', 16)}<input type="search" data-search placeholder="Search name, mobile, email or company" value="${esc(state.q)}" autocomplete="off" aria-label="Search customers"/></label>
        <div class="chips">${chip('all', '', 'All', all.length)}${chip('type', 'Individual', 'People', nInd)}${chip('type', 'Corporate', 'Companies', nCorp)}
          ${showMoney ? chip('flag', 'balance', 'Still paying', owing.length) : ''}${showMoney && refunds.length ? chip('flag', 'refund', 'Refund due', refunds.length) : ''}${chip('flag', 'owner', 'Car owners', owners.length)}</div>
        <span class="cu-count" data-count></span>
      </div>
      <div data-results></div>`;

    const balance = (c) => {
      const s = st(c);
      if (s.refund > 0.5) return `<span class="tone-red strong">Refund due ${esc(money(s.refund))}</span>`;
      if (!s.orders) return '';
      if (s.toCollect > 0.5) return `<span class="tone-red strong">${esc(money(s.toCollect))}</span>`;
      return s.waiting > 0.5 ? '<span class="tone-amber">Waiting for Accounts</span>' : '<span class="muted">Paid</span>';
    };
    const draw = () => {
      const q = state.q.toLowerCase().trim(); const qd = q.replace(/\D/g, '');
      const rows = all.filter((c) => {
        if (state.type && (c.type || 'Individual') !== state.type) return false;
        const s = st(c);
        if (state.flag === 'balance' && !(s.toCollect > 0.5)) return false;
        if (state.flag === 'refund' && !(s.refund > 0.5)) return false;
        if (state.flag === 'owner' && !s.owner) return false;
        if (q) {
          const hay = [c.name, c.email, c.company, c.contactPerson, c.address, c.nid, c.tin].join(' ').toLowerCase();
          if (!hay.includes(q) && !(qd.length >= 3 && String(c.mobile || '').replace(/\D/g, '').includes(qd))) return false;
        }
        return true;
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const shown = rows.slice(0, state.limit);
      const box = root.querySelector('[data-results]');
      if (box) box.innerHTML = !all.length
        ? `<div class="card pad">${ui.empty(mine ? 'No customers yet. Your buyers appear here when one of your leads becomes an order.' : 'No customers yet. They are added automatically when a lead becomes an order — or add one now.', 'users', ui.btn('Add customer', { kind: 'primary', icon: 'plus', act: 'add' }))}</div>`
        : `<div class="card">${ui.table([
          { label: 'Customer', render: (c) => `<div class="row">${ui.avatar(c.name, 32)}<div class="grow"><div class="cell-main">${esc(c.name)}${c.type === 'Corporate' ? ' ' + ui.badge('Company', 'gray', 'building') : ''}</div><div class="cell-sub">${esc(c.type === 'Corporate' ? (c.contactPerson || '') : (c.address || ''))}</div></div></div>` },
          { label: 'Mobile', render: (c) => `<div class="row gap-4 nowrap"><span>${esc(prettyMobile(c.mobile))}</span>${c.mobile ? `<a class="icon-btn" href="${esc(telHref(c.mobile))}" title="Call" aria-label="Call">${NA.icon('phone', 15)}</a><a class="icon-btn" href="${esc(waHref(c.mobile))}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${NA.icon('whatsapp', 15)}</a>` : ''}</div>` },
          mine ? null : { label: 'Consultant', render: (c) => { const k = consultantOf(c); return k ? `<span class="small">${esc(NA.staffName(k))}</span>` : '<span class="small muted">Unassigned</span>'; } },
          { label: 'Cars', cls: 'right', render: (c) => (st(c).cars ? String(st(c).cars) : dash) },
          showMoney ? { label: 'Balance', cls: 'right', render: balance } : null,
          { label: 'Customer since', render: (c) => `<span class="small muted nowrap">${esc(NA.fmt.date(c.createdAt))}</span>` },
        ].filter(Boolean), shown, { rowAttr: (c) => `data-href="#/customers/${esc(c.id)}"`, empty: 'No customers match', emptyIcon: 'search' })}
          ${rows.length > shown.length ? `<div class="cu-more"><button class="btn btn-ghost btn-sm" data-act="more">Show ${Math.min(PAGE, rows.length - shown.length)} more</button></div>` : ''}</div>`;
      const cnt = root.querySelector('[data-count]'); if (cnt) cnt.textContent = rows.length > shown.length ? `${shown.length} of ${rows.length}` : rows.length + ' shown';
    };
    draw();

    const off = [];
    const on = (t, fn) => { root.addEventListener(t, fn); off.push(() => root.removeEventListener(t, fn)); };
    on('input', (e) => { if (e.target.matches && e.target.matches('[data-search]')) { state.q = e.target.value; state.limit = PAGE; draw(); } });
    on('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) {
        if (a.dataset.act === 'add') customerModal(null);
        if (a.dataset.act === 'more') { state.limit += PAGE; draw(); }
        if (a.dataset.act === 'chip') {
          const k = a.dataset.k;
          if (k === 'all') { state.type = ''; state.flag = ''; } else state[k] = state[k] === a.dataset.v ? '' : a.dataset.v;
          state.limit = PAGE; NA.render();
        }
        return;
      }
      if (e.target.closest('a')) return;
      const tr = e.target.closest('[data-href]');
      if (tr) NA.go(tr.dataset.href);
    });
    return () => off.forEach((f) => f());
  }

  /* ======================================================================
     Customer 360°
     ====================================================================== */
  const JOURNEY = [
    // "Ready for VIN", not "Paid": a car can also get its VIN before full payment, with the Managing Director's approval.
    { label: 'Lead', icon: 'user-plus' }, { label: 'Booked', icon: 'receipt' }, { label: 'Paying', icon: 'wallet' },
    { label: 'Ready for VIN', icon: 'key' }, { label: 'Registration', icon: 'id-card' }, { label: 'Hand-over', icon: 'car' }, { label: 'After-sales', icon: 'wrench' },
  ];
  /** Orders the customer still has money to hand over on (what the Orders screen accepts a payment for). */
  const toCollectOn = (p) => p.live.filter((o) => p.money.get(o.id).toCollect > 0.5);

  /** Record a payment on one of THIS customer's orders — never a list of everyone's orders. */
  function recordPayment(c, p, oid) {
    if (!NA.can('payments.record')) return;
    if (oid) { callAction('recordPayment', oid, 'Payments'); return; }
    const owing = toCollectOn(p);
    if (owing.length === 1) { callAction('recordPayment', owing[0].id, 'Payments'); return; }
    if (!owing.length) { ui.toast(p.waiting > 0.5 ? 'Everything is handed over — Accounts still has to confirm it' : 'Nothing is owed on this customer’s orders', 'info'); return; }
    ui.modal({
      title: 'Which order is it for?', subtitle: esc(c.name), size: 'sm',
      body: `<div class="glist">${owing.map((o) => `<button type="button" class="gl-row" data-pick="${esc(o.id)}"><div class="gl-main"><b>${esc(o.code)} · ${esc(NA.modelName(o.modelId))}</b>
        <small>${esc(money(p.money.get(o.id).toCollect))} still to collect</small></div>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`).join('')}</div>`,
      actions: [{ label: 'Cancel' }],
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        ui.closeTop(); callAction('recordPayment', b.dataset.pick, 'Payments');
      }),
    });
  }
  /** Does this role receive the workshop's records? (A consultant does not.) */
  const seesService = () => NA.isRole('owner') || ['jobCards', 'serviceBookings'].some((k) => ((NA.ACCESS || {})[NA.role()] || {})[k]);

  /** Car released before full payment: the Managing Director's approval (or the older "credit approved" switch). */
  const creditOk = (o) => B.creditApproved(o) || !!(o.corporate && o.corporate.creditApproved && o.corporate.creditApprovedAt);

  function nextStep(c, p) {
    const box = (icon, title, sub, btn) => `<div class="next-step"><span class="ns-icon">${NA.icon(icon, 20)}</span><div class="ns-text"><b>${title}</b><small>${sub}</small></div>${btn || ''}</div>`;
    const openBtn = (o, label) => (NA.canSee('sales') ? ui.btn(label || 'Open order', { kind: 'primary', icon: 'arrow-right', href: '#/sales/' + o.id }) : '');
    // Money to give back comes first.
    const back = seesMoney() && p.orders.find((o) => p.money.get(o.id).refund > 0.5);
    if (back) {
      const approved = back.refund && back.refund.status === 'due';
      return box('undo', `Refund ${esc(money(p.money.get(back.id).refund))} on cancelled order ${esc(back.code)}`,
        approved ? 'The cancellation is approved — Accounts pays the refund and records it on the order.' : 'The order was cancelled while money was still held. The refund needs the Managing Director’s approval on the order.', openBtn(back));
    }
    const open = p.live.filter((o) => o.stage !== 'delivered');
    const unconfirmed = open.find((o) => o.channel === 'Corporate' && !B.isOrderConfirmed(o));
    if (unconfirmed) return box('file-text', `Get the purchase order for ${esc(unconfirmed.code)}`,
      'A company order is confirmed by its purchase order, award letter or letter of intent — no booking money needed.', openBtn(unconfirmed));
    const owing = seesMoney() && open.find((o) => p.money.get(o.id).owed > 0.5 && !creditOk(o));
    if (owing) {
      const mm = p.money.get(owing.id);
      const toCollect = mm.toCollect;
      if (toCollect <= 0.5) return box('clock', `${esc(money(mm.pending))} waiting for Accounts`, `${esc(owing.code)} is fully handed over. It counts once Accounts confirms it.`,
        NA.can('payments.verify') ? ui.btn('Confirm money', { kind: 'primary', icon: 'check', href: '#/approvals?tab=money' }) : openBtn(owing));
      return box('wallet', `Collect ${esc(money(toCollect))} on ${esc(owing.code)}`,
        `${esc(NA.modelName(owing.modelId))} · ${esc(money(mm.cleared))} confirmed${mm.pending ? ' · ' + esc(money(mm.pending)) + ' waiting for Accounts' : ''}. The car gets its VIN only after 100% is confirmed.`,
        NA.can('payments.record') ? ui.btn('Record payment', { kind: 'primary', icon: 'wallet', act: 'pay', attrs: `data-id="${esc(owing.id)}"` }) : openBtn(owing));
    }
    const active = open[0];
    if (active) return box('receipt', `Carry on with order ${esc(active.code)}`, `${esc(orderWord(active))} — ${esc((NA.FLOW.orderStages.find((s) => s.key === stageNow(active)) || {}).hint || '')}`, openBtn(active));
    // A follow-up this person can close comes first; a manager's call-back only shows who has it.
    const dueList = p.followUps.filter((f) => f.status !== 'done' && f.due <= NA.today());
    const due = dueList.find((f) => !closedBy(f)) || dueList[0];
    if (due) return box('bell', `${esc(due.type)} is due`, `Due ${esc(NA.fmt.date(due.due))}${due.notes ? ' · ' + esc(due.notes) : ''}`,
      closedBy(due) ? closedByNote(due) : ui.btn('Mark as done', { kind: 'primary', icon: 'check', act: 'fu-done', attrs: `data-id="${esc(due.id)}"` }));
    const upcoming = p.bookings.find((b) => b.status === 'booked' && b.date >= NA.today());
    if (upcoming) return box('calendar', `Service booked for ${esc(NA.fmt.date(upcoming.date))}`, `${esc(upcoming.type)}${upcoming.time ? ' at ' + esc(upcoming.time) : ''} · ${esc(upcoming.code || '')}`,
      NA.canSee('service') ? ui.btn('See bookings', { kind: 'primary', icon: 'arrow-right', href: '#/service?tab=bookings' }) : '');
    if (p.vehicles.some((v) => v.status === 'delivered')) return box('wrench', 'Keep in touch', NA.can('service.manage') ? 'Book the next service or a battery health check.' : 'The workshop books the next service or battery health check.',
      NA.can('service.manage') ? ui.btn('Book service', { kind: 'primary', icon: 'calendar', act: 'book' }) : '');
    const lead = p.leads.find((l) => !['won', 'lost'].includes(l.stage));
    if (lead && NA.canSee('leads')) return box('user-plus', `Carry on with lead ${esc(lead.code)}`, `${esc(NA.modelName(lead.modelId))} · ${esc(leadWord(lead.stage))}`,
      ui.btn('Open lead', { kind: 'primary', icon: 'arrow-right', href: '#/leads/' + lead.id }));
    if (NA.can('orders.create')) return box('receipt', 'Ready to buy?', 'Start an order — booking money or a purchase order confirms it.', ui.btn('New order', { kind: 'primary', icon: 'plus', act: 'order' }));
    return box('check-circle', 'Nothing to do right now', 'Everything for this customer is up to date.', '');
  }

  function journeyIdx(p) {
    const focus = p.live.find((o) => o.stage !== 'delivered') || p.live[0];
    // Every order cancelled: back to the start, but say so (not "no order yet").
    if (!focus) return p.orders.length ? { idx: 0, order: p.orders[0], cancelled: true } : { idx: 0, order: null };
    const i = NA.stageIndex(NA.FLOW.orderStages, stageNow(focus));
    return { idx: i < 0 ? 1 : i + 1, order: focus };
  }

  function card(title, icon, body, actions = '', opts = {}) {
    return `<div class="card"><div class="card-head"><h3>${NA.icon(icon, 16)}${esc(title)}${opts.count != null ? ` <span class="tab-count">${opts.count}</span>` : ''}</h3><div class="cu-card-head-actions">${actions}</div></div>${opts.flush ? body : `<div class="card-body">${body}</div>`}${opts.foot ? `<div class="card-foot">${opts.foot}</div>` : ''}</div>`;
  }

  function renderDetail(root, id) {
    ensureCss();
    const c = NA.customer(id);
    // A consultant opens their own customers, and the customer of an order they own (read only: the office server
    // sends those too, as a customer can buy from two consultants). Anything else: not here, or someone else's.
    const readOnly = !!c && !ownCustomer(c);
    if (!c || (readOnly && !viaMyOrder(c))) {
      root.innerHTML = ui.pageHead({ title: 'Customer', crumbs: [{ label: 'Customers', href: '#/customers' }, { label: 'Not available' }] }) + ui.notFound('customer', '#/customers', 'All customers');
      return;
    }
    const p = profile(c);
    const corp = c.type === 'Corporate';
    const j = journeyIdx(p);
    const delivered = p.vehicles.filter((v) => v.status === 'delivered');
    const showMoney = seesMoney();
    const locked = identityLocked(c);
    const canBook = NA.can('service.manage');
    const owingOrders = toCollectOn(p);

    /* orders */
    const ordersHtml = ui.table([
      { label: 'Order', render: (o) => `<div class="cell-main">${esc(o.code)}</div><div class="cell-sub">${esc(NA.fmt.date((o.booking && o.booking.date) || o.createdAt))}${o.channel ? ' · ' + esc(o.channel) : ''}</div>` },
      { label: 'Car', render: (o) => `<div>${esc(NA.modelName(o.modelId))}</div><div class="cell-sub">${o.color ? swatch(o.color) + ' ' + esc(o.color) : ''}</div>` },
      { label: 'Stage', render: (o) => orderBadge(o) },
      { label: 'Paid', render: (o) => {
        const mm = p.money.get(o.id);
        if (mm.cancelled) return dash;
        const r = mm.net ? Math.min(1, mm.cleared / mm.net) : 0;
        return `<div class="cu-pay"><div class="row-between small"><b>${Math.round(r * 100)}%</b><span class="muted">${esc(NA.fmt.short(mm.cleared))}</span></div>${ui.progress(r, r >= 1 ? 'green' : 'amber')}${mm.pending ? `<div class="cell-sub">${esc(NA.fmt.short(mm.pending))} waiting for Accounts</div>` : ''}</div>`;
      } },
      { label: 'Balance', cls: 'right', render: (o) => {
        const mm = p.money.get(o.id);
        if (mm.cancelled) return mm.refund ? `<span class="tone-red strong">Refund due ${esc(money(mm.refund))}</span>` : '<span class="muted">Cancelled</span>';
        if (mm.toCollect > 0.5) return `<span class="tone-red strong">${esc(money(mm.toCollect))}</span>`;
        return mm.pending > 0.5 ? '<span class="tone-amber">Waiting for Accounts</span>' : '<span class="muted">Paid</span>';
      } },
    ], p.orders, { rowAttr: (o) => `data-href="#/sales/${esc(o.id)}"`, empty: 'No orders yet' });

    /* vehicles */
    const vehiclesHtml = p.vehicles.length ? `<div class="cu-veh">${p.vehicles.map((v) => {
      const w = B.warrantyFor(v.id); const active = B.warrantyActive(w);
      const wBadge = !w ? ui.badge(v.status === 'delivered' ? 'No warranty record' : 'Activates on delivery', 'gray', 'shield')
        : active ? ui.badge('Warranty active', 'green', 'shield') : ui.badge(w.status === 'void' ? 'Warranty void' : 'Warranty expired', 'red', 'shield');
      const left = w && active ? NA.daysBetween(NA.today(), w.expiry) : null;
      return `<div class="vin-card">
        <div class="v-top"><span class="v-name">${NA.icon('car', 16)} ${esc(NA.modelName(v.modelId))}</span>${ui.vehicleStatusBadge(v.status)}</div>
        <div class="v-rows">
          <span>VIN</span><span class="mono">${esc(v.vin || '—')}</span>
          <span>Reg. no.</span><span>${esc(v.regNo || 'Pending BRTA')}</span>
          <span>Colour</span><span>${v.color ? swatch(v.color) + ' ' + esc(v.color) : '—'}</span>
          ${v.deliveredAt ? `<span>Delivered</span><span>${esc(NA.fmt.date(v.deliveredAt))}</span>` : ''}
          ${w ? `<span>Warranty</span><span>until ${esc(NA.fmt.date(w.expiry))}${left != null ? ` <span class="muted">(${left > 365 ? Math.floor(left / 365) + 'y ' : ''}${Math.floor((left % 365) / 30)}m left)</span>` : ''}</span>
                 <span>Battery</span><span>until ${esc(NA.fmt.date(w.batteryExpiry))}</span>` : ''}
          ${v.km != null && v.status === 'delivered' ? `<span>Odometer</span><span>${esc(NA.fmt.num(v.km))} km</span>` : ''}
        </div>
        <div class="v-foot">${wBadge}<span class="grow"></span>
          ${v.status === 'delivered' && canBook ? ui.btn('Book service', { size: 'sm', icon: 'calendar', act: 'book', attrs: `data-vehicle="${esc(v.id)}"` }) : ''}
          ${NA.canSee('inventory') ? ui.btn('Details', { size: 'sm', kind: 'plain', href: '#/inventory/' + v.id }) : ''}</div>
      </div>`;
    }).join('')}</div>` : ui.empty('No car yet — a VIN is linked once an order is fully paid', 'car');

    /* money received, receipt by receipt (totals are in the strip at the top) */
    const orderCode = (oid) => { const o = NA.get('orders', oid); return o ? o.code : '—'; };
    const cancelledIds = new Set(p.orders.filter((o) => o.stage === 'cancelled').map((o) => o.id));
    const ledgerHtml = p.payments.length ? `<div class="table-wrap"><table class="table cu-ledger">
        <thead><tr><th>Date</th><th>Receipt</th><th>Order</th><th>How</th><th>Status</th><th class="right">Amount</th></tr></thead>
        <tbody>${p.payments.map((x) => {
          const st = payStatus(x); const amt = Number(x.amount) || 0; const refund = amt < 0 || x.kind === 'refund';
          const gone = cancelledIds.has(x.orderId);
          return `<tr data-href="#/sales/${esc(x.orderId)}" class="${gone ? 'is-void' : ''}"><td class="nowrap">${esc(NA.fmt.date(x.date))}</td><td>${esc(x.receiptNo || '—')}</td>
            <td>${esc(orderCode(x.orderId))}${gone ? '<div class="cell-sub">Cancelled order</div>' : ''}</td>
            <td>${esc(refund ? 'Refund' + (x.method ? ' · ' + x.method : '') : x.method || '')}${x.ref ? `<div class="cell-sub">${esc(x.ref)}</div>` : ''}</td>
            <td>${ui.badge(refund && st === 'cleared' ? 'Paid back' : PAY_WORD[st], refund && st === 'cleared' ? 'gray' : PAY_TONE[st])}</td>
            <td class="right strong num ${st === 'pending' ? 'is-wait' : st === 'bounced' ? 'is-bounced' : ''}">${esc(money(amt))}</td></tr>`;
        }).join('')}</tbody>
      </table></div>` : ui.empty('No money received yet', 'wallet');

    /* service */
    const vehLabel = (vid) => { const v = NA.vehicle(vid); return v ? NA.modelName(v.modelId) + (v.regNo ? ' · ' + v.regNo : '') : '—'; };
    const upcoming = p.bookings.filter((b) => b.status === 'booked');
    const serviceHtml = !seesService()
      ? `<div class="card-body">${ui.empty('The workshop keeps this customer’s service history. Ask the service team if you need it.', 'wrench')}</div>`
      : (upcoming.length ? `<div class="cu-booked">${upcoming.map((b) => `<div class="alert-row"><span class="ar-icon">${NA.icon('calendar', 16)}</span>
        <div class="grow"><b>${esc(b.type)}</b> · ${esc(NA.fmt.date(b.date))}${b.time ? ' ' + esc(b.time) : ''}<div class="small muted">${esc(vehLabel(b.vehicleId))} · via ${esc(b.channel || '—')}${b.notes ? ' · ' + esc(b.notes) : ''}</div></div>${ui.badge('Booked', 'blue')}</div>`).join('')}</div>` : '')
      + (p.jobs.length ? ui.table([
        { label: 'Job card', render: (x) => `<div class="cell-main">${esc(x.code)}</div><div class="cell-sub">${esc(NA.fmt.date(x.openedAt || x.createdAt))}</div>` },
        { label: 'Car', render: (x) => esc(vehLabel(x.vehicleId)) },
        { label: 'Complaint', render: (x) => `<div class="cu-complaint">${esc(x.complaint || '—')}</div>` },
        { label: 'Billing', render: (x) => (x.billing === 'warranty' ? ui.badge('Warranty · ৳0', 'green', 'shield') : ui.badge('Paid service', 'gray')) },
        { label: 'Status', render: (x) => ui.badge(NA.stageLabel(NA.FLOW.jobStages, x.status), JOB_TONE[x.status] || 'gray') },
        { label: 'Total', cls: 'right', render: (x) => esc(money(B.jobTotals(x).total)) },
      ], p.jobs, { rowAttr: (x) => (NA.canSee('service') ? `data-href="#/service/job/${esc(x.id)}"` : '') }) : `<div class="card-body">${ui.empty(delivered.length ? 'No workshop visits yet' : 'Service history starts after the car is handed over', 'wrench')}</div>`);

    /* follow-ups */
    const pendingFu = p.followUps.filter((f) => f.status !== 'done');
    const doneFu = p.followUps.filter((f) => f.status === 'done').sort((a, b) => String(b.doneAt || b.due).localeCompare(String(a.doneAt || a.due)));
    const fuHtml = p.followUps.length ? `<ul class="list cu-fu">${pendingFu.concat(doneFu.slice(0, 4)).map((f) => {
      const over = f.status !== 'done' && f.due < NA.today(); const today = f.status !== 'done' && f.due === NA.today();
      const done = f.status === 'done';
      return `<li><span class="dot ${done ? 'dot-green' : over ? 'dot-red' : today ? 'dot-amber' : 'dot-blue'}"></span>
        <div class="grow"><div class="t">${esc(f.type)}</div><div class="s">${done ? 'Done ' + esc(NA.fmt.date(f.doneAt || f.due)) + (f.doneBy ? ' by ' + esc(f.doneBy) : '') + (f.rating ? ' · ' + f.rating + ' of 5' : '')
          : (over ? '<span class="tone-red strong">Overdue</span> · ' : today ? '<span class="tone-amber strong">Today</span> · ' : 'Due ') + esc(NA.fmt.date(f.due))}${f.notes ? ' · ' + esc(f.notes) : ''}${done && f.outcome ? ' — ' + esc(f.outcome) : ''}</div></div>
        ${done ? '' : closedBy(f) ? closedByNote(f) : ui.btn('Done', { size: 'sm', icon: 'check', act: 'fu-done', attrs: `data-id="${esc(f.id)}"` })}</li>`;
    }).join('')}</ul>` : ui.empty('No follow-ups planned', 'bell');

    /* leads: linked ones, plus leads with the same number offered as a suggestion */
    const leadLink = (l, body) => (NA.canSee('leads') ? `<a class="t" href="#/leads/${esc(l.id)}">${body}</a>` : `<span class="t">${body}</span>`);
    const leadsHtml = p.leads.length || p.leadSuggest.length ? `<ul class="list">${p.leads.map((l) => `<li><span class="ar-icon cu-lead-ico">${NA.icon('user-plus', 16)}</span>
        <div class="grow">${leadLink(l, esc(l.code) + ' · ' + esc(NA.modelName(l.modelId)))}<div class="s">${esc(l.source || '')} · ${esc(NA.fmt.date(l.createdAt))}</div></div>${ui.badge(leadWord(l.stage), leadTone(l.stage))}</li>`).join('')}
      ${p.leadSuggest.map((l) => `<li><span class="ar-icon cu-lead-ico">${NA.icon('info', 16)}</span>
        <div class="grow">${leadLink(l, esc(l.code) + ' · ' + esc(l.name))}<div class="s">Same mobile number — is this the same person?</div></div>
        ${NA.canSee('leads') ? ui.btn('Link', { size: 'sm', kind: 'plain', act: 'link-lead', attrs: `data-id="${esc(l.id)}"` }) : ''}</li>`).join('')}</ul>` : ui.empty('No leads linked', 'user-plus');

    /* timeline: customer + their orders */
    const tl = (c.history || []).map((h) => Object.assign({ ref: '' }, h))
      .concat(...p.orders.map((o) => (o.history || []).map((h) => Object.assign({ ref: o.code }, h))))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 15);

    const bookVehicle = delivered.length === 1 ? delivered[0].id : '';
    const row = (label, value) => `<div class="gl-row"><span class="gl-label grow">${esc(label)}</span><span class="gl-value">${value}</span></div>`;
    // One summary of the money (the ledger below lists the receipts). "Still to collect" leaves out money already
    // handed over and waiting for Accounts, which has its own box (the Orders screen's rule).
    const strip = showMoney && p.orders.length ? `<div class="card cu-sum">
        <div><small>Still to collect</small><b class="${p.toCollect > 0.5 ? 'tone-red' : ''}">${esc(money(p.toCollect))}</b><span>${p.live.length ? `on ${p.live.length} order${p.live.length === 1 ? '' : 's'}` : 'no open orders'}</span></div>
        <div><small>Paid</small><b>${esc(money(p.paid))}</b><span>confirmed by Accounts</span></div>
        <div><small>Waiting for Accounts</small><b class="${p.waiting > 0.5 ? 'tone-amber' : ''}">${esc(money(p.waiting))}</b><span>handed in, not confirmed yet</span></div>
        <div><small>Refund due</small><b class="${p.refundDue > 0.5 ? 'tone-red' : ''}">${esc(money(p.refundDue))}</b><span>${p.refundDue > 0.5 ? 'on cancelled orders' : 'nothing to give back'}</span></div>
      </div>` : '';
    const consultant = consultantOf(c) ? NA.staffName(consultantOf(c)) : '';
    root.innerHTML = ui.pageHead({
      title: c.name,
      crumbs: [{ label: NA.isRole('sales') ? 'My customers' : 'Customers', href: '#/customers' }, { label: c.name }],
      subtitle: `<span class="row wrap gap-4">${corp ? ui.badge('Company', 'gray', 'building') : ''}<span class="muted">Customer since ${esc(NA.fmt.date(c.createdAt))} · ${p.vehicles.length} car${p.vehicles.length === 1 ? '' : 's'}${consultant ? ' · ' + esc(consultant) : ''}</span></span>`,
      actions: (readOnly ? '' : ui.btn('Edit', { icon: 'edit', act: 'edit' }))
        + (canBook ? ui.btn('Book service', { icon: 'calendar', act: 'book', attrs: bookVehicle ? `data-vehicle="${esc(bookVehicle)}"` : '' }) : '')
        + (NA.can('orders.create') ? ui.btn('New order', { icon: 'plus', act: 'order' }) : ''),
    }) + `
      ${NA.ui.approvalBanners('customers', c.id) ? `<div class="stack cu-banner">${NA.ui.approvalBanners('customers', c.id)}</div>` : ''}
      ${strip}
      <div class="card pad cu-journey"><div class="cu-journey-head"><h3 class="section-title">Where things stand</h3>
        <span class="cu-journey-sub">${j.order ? `${j.cancelled ? 'Last order ' : 'Following '}${NA.canSee('sales') ? `<a href="#/sales/${esc(j.order.id)}">${esc(j.order.code)}</a>` : esc(j.order.code)} · ${esc(NA.modelName(j.order.modelId))}${j.cancelled ? ' · cancelled' : ''}` : 'No order yet'}</span></div>
        ${ui.stepper(JOURNEY, j.idx, { compact: true })}</div>
      <div class="cu-next">${nextStep(c, p)}</div>
      <div class="grid grid-main-side">
        <div class="stack cu-main">
          ${showMoney ? card('Orders', 'receipt', ordersHtml, '', { count: p.orders.length, flush: true }) : ''}
          ${card('Cars', 'car', vehiclesHtml, '', { count: p.vehicles.length })}
          ${showMoney ? card('Money received', 'wallet', ledgerHtml, NA.can('payments.record') && owingOrders.length ? ui.btn('Record payment', { size: 'sm', icon: 'wallet', act: 'pay' }) : '', { count: p.payments.length, flush: true }) : ''}
          ${card('Service', 'wrench', serviceHtml, canBook ? ui.btn('Book service', { size: 'sm', icon: 'calendar', act: 'book', attrs: bookVehicle ? `data-vehicle="${esc(bookVehicle)}"` : '' }) : '', { count: seesService() ? p.jobs.length : null, flush: true })}
        </div>
        <div class="stack cu-side">
          <section>
            <div class="glist">
              <div class="cu-contact-head">${ui.avatar(c.name, 48)}<div class="grow"><b>${esc(c.name)}</b><span class="small muted">${esc(corp ? (c.contactPerson ? 'Contact: ' + c.contactPerson : 'Company') : 'Person')}</span></div></div>
              <div class="cu-contact-btns">
                ${c.mobile ? `<a class="btn btn-ghost" href="${esc(telHref(c.mobile))}">${NA.icon('phone', 16)}Call</a>
                <a class="btn btn-ghost" href="${esc(waHref(c.mobile))}" target="_blank" rel="noopener">${NA.icon('whatsapp', 16)}WhatsApp</a>`
                  : `<span class="btn btn-ghost disabled" title="No mobile number">${NA.icon('phone', 16)}Call</span><span class="btn btn-ghost disabled" title="No mobile number">${NA.icon('whatsapp', 16)}WhatsApp</span>`}
                ${c.email ? `<a class="btn btn-ghost" href="mailto:${esc(c.email)}">${NA.icon('mail', 16)}Email</a>` : `<span class="btn btn-ghost disabled" title="No email on file">${NA.icon('mail', 16)}Email</span>`}
              </div>
              ${row('Mobile', esc(prettyMobile(c.mobile)))}
              ${row('Email', c.email ? esc(c.email) : '—')}
              ${row('Address', c.address ? esc(c.address) : '—')}
              ${corp ? row('TIN / BIN', c.tin ? esc(c.tin) : '—') : row('NID', c.nid ? esc(c.nid) : '<span class="tone-amber">Needed before BRTA</span>')}
              ${row('Consultant', consultant ? esc(consultant) : 'Unassigned')}
              ${c.notes ? row('Notes', esc(c.notes)) : ''}
            </div>
            ${readOnly ? `<p class="glist-foot lock-note cu-lock">${NA.icon('lock', 13)}${consultant ? esc(consultant) + ' looks after this customer' : 'This is not your customer'}. You see them because of your order.</p>`
              : locked ? `<p class="glist-foot lock-note cu-lock">${NA.icon('lock', 13)}${mayEditIdentity() ? 'Bought a car: change the name or ID details only with a reason.'
              : hasBought(c) ? 'Name, mobile, NID, TIN and type are locked after a sale.' : 'Name, mobile, NID, TIN and type are kept by the sales team.'}</p>` : ''}
          </section>
          ${card('Follow-ups', 'bell', fuHtml, readOnly ? '' : ui.btn('Plan', { size: 'sm', icon: 'plus', act: 'fu-add' }), { count: pendingFu.length })}
          ${p.leads.length || p.leadSuggest.length || NA.canSee('leads') ? card('Leads', 'user-plus', leadsHtml, '', { count: p.leads.length }) : ''}
          ${card('History', 'clock', tl.length ? `<ul class="timeline">${tl.map((h) => `<li>${h.ref ? `<b>${esc(h.ref)}</b> · ` : ''}${esc(h.text)}<small>${esc(NA.fmt.datetime(h.at))}${h.by ? ' · ' + esc(h.by) : ''}</small></li>`).join('')}</ul>` : ui.empty('Nothing yet', 'clock'))}
        </div>
      </div>`;

    const off = [];
    off.push(ui.delegate(root, 'click', '[data-act]', (el, e) => {
      e.stopPropagation();
      const a = el.dataset.act;
      const cur = NA.customer(c.id) || c;
      if (a === 'edit') { if (!readOnly) customerModal(cur); }
      else if (a === 'order') { if (NA.can('orders.create')) callAction('newOrder', { customerId: cur.id, consultantId: consultantOf(cur) }, 'Orders'); }
      else if (a === 'book') {
        const pre = { customerId: cur.id }; if (el.dataset.vehicle) pre.vehicleId = el.dataset.vehicle;
        callAction('newServiceBooking', pre, 'Service');
      } else if (a === 'pay') recordPayment(cur, p, el.dataset.id);
      else if (a === 'fu-add') { if (!readOnly) addFollowUp(cur, p.vehicles); }
      else if (a === 'fu-done') { const f = NA.get('followUps', el.dataset.id); if (f) completeFollowUp(cur, f); }
      else if (a === 'link-lead') {
        const l = NA.get('leads', el.dataset.id); if (!l) return;
        NA.update('leads', l.id, { customerId: cur.id });
        NA.log(`Lead ${l.code} linked to customer ${cur.name}`, { rec: l, link: '#/customers/' + cur.id });
        ui.toast('Linked'); refresh();
      }
    }));
    off.push(ui.delegate(root, 'click', '[data-href]', (el, e) => {
      if (e.target.closest('[data-act]') || e.target.closest('a')) return;
      NA.go(el.dataset.href);
    }));
    return () => off.forEach((f) => f());
  }

  /* ---------------- Registration ---------------- */
  NA.actions = NA.actions || {};
  NA.actions.newCustomer = (prefill) => customerModal(null, prefill);
  NA.actions.editCustomer = (id) => { const c = NA.customer(id); if (c) customerModal(c); };

  NA.page({
    path: 'customers', title: 'Customers', icon: 'users',
    render(root, params) { return params && params[0] ? renderDetail(root, params[0]) : renderList(root); },
  });
})();
