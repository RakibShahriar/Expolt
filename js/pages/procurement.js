/* ==========================================================================
   Purchasing — buying cars and paying the suppliers.

   From BYD: plan → purchase order → the Managing Director approves →
   Accounts pays the advance → BYD allocates a shipment batch (lot) →
   Accounts pays the final share for each car → Purchasing enters each VIN →
   arrival check → in stock.
   Emergency purchase (CG Runner): check availability → VIN and price → the
   Managing Director approves → Accounts pays 100% → arrival check → the car
   is kept for the customer order it was bought for.

   Purchasing (po.manage) raises orders, batches and VINs and receives cars;
   Accounts (vendor.pay) pays; the Managing Director approves and is the only
   one who may void a payment. Every money step stores who did it, and the
   advance share is stored on each order so a Settings change never rewrites
   an old order.

   Routes:  #/procurement[?tab=plan|pos|emergency|payments][&stage=<key>]
            #/procurement/<poId>
   Actions: NA.actions.newPO(prefill), NA.actions.newEmergencyPO(prefill),
            NA.actions.receiveUnit(vehicleId, opts)
   Shared:  NA.purchasing.releasesDue(po?), .owed(po), .stageOf(po), .approvalOf(po), .demand(), .pctOf(po), .urgentAsks()
   Writes on a customer order only o.emergencyPO {id, code, stage, eta, approval} (the one field the server lets
   Purchasing change), so consultants can follow an emergency purchase.
   Uses NA.stock (inventory.js: VIN rules, paint swatches, arrival check).
   inventory.js loads after this file, so NA.stock is looked up when needed.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const ui = NA.ui;
  const F = NA.fmt;
  const B = NA.biz;
  const A = NA.approvals;
  NA.actions = NA.actions || {};

  /* ------------------------------------------------------------------ CSS */
  function ensureCss() {
    if (typeof document === 'undefined' || !document.head || document.getElementById('css-procurement')) return;
    const s = document.createElement('style');
    s.id = 'css-procurement';
    s.textContent = `
      .page-procurement .tabs { margin-bottom: 24px; }
      .pr-todo { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-bottom: 28px; }
      .pr-todo .alert-row { margin: 0; background: var(--surface); box-shadow: var(--shadow-sm); }
      .pr-todo .alert-row:hover { background: var(--surface-2); }
      .pr-todo .alert-row b { display: block; font-weight: 600; letter-spacing: -.01em; }
      .pr-todo .alert-row small { display: block; color: var(--muted); font-size: 12.5px; }
      .pr-ico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none; color: #fff; }
      .pr-block { margin-bottom: 24px; }
      .pr-stack { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
      .pr-po-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
      a.pr-po-card { display: flex; flex-direction: column; }
      .pr-pc-body { padding: 20px 22px 18px; display: flex; flex-direction: column; gap: 12px; flex: 1; }
      .pr-pc-foot { padding: 12px 22px 14px; border-top: .5px solid var(--line-2); font-size: 13px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .pr-pc-foot b { color: var(--ink-2); font-weight: 500; text-align: right; }
      .pr-code { font-weight: 600; font-size: 16px; letter-spacing: -.01em; }
      .pr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .pr-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; background: var(--fill-2); color: var(--ink-2); font-size: 12.5px; font-weight: 500; }
      .pr-money-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
      .pr-money-row b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
      .pr-qty { width: 76px; height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 8px; background: var(--field-bg); text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; outline: none; }
      .pr-qty:focus { border-color: var(--tint); box-shadow: var(--focus); }
      .pr-qty.has { border-color: var(--tint); background: var(--tint-soft); }
      .pr-plan-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .pr-plan-sum, .pr-total { display: flex; gap: 28px; flex-wrap: wrap; }
      .pr-plan-sum div, .pr-total div { display: flex; flex-direction: column; }
      .pr-plan-sum small, .pr-total small { color: var(--muted); font-size: 12.5px; }
      .pr-plan-sum b, .pr-total b { font-size: 17px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
      .pr-total { margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: var(--fill-3); }
      .pr-lines { display: flex; flex-direction: column; gap: 10px; }
      .pr-line { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) 76px minmax(0, 1.4fr) 104px 36px; gap: 10px; align-items: end; padding: 12px; border-radius: 14px; background: var(--fill-3); }
      .pr-line label { display: block; font-size: 12.5px; font-weight: 500; color: var(--muted); margin-bottom: 6px; }
      .pr-line select, .pr-line input { width: 100%; height: 40px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px; background: var(--field-bg); outline: none; }
      .pr-line select:focus, .pr-line input:focus { border-color: var(--tint); box-shadow: var(--focus); }
      .pr-line input.pr-off { border-color: var(--amber-solid); }
      .pr-line .pr-lt { font-weight: 600; text-align: right; padding-bottom: 10px; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .pr-line .icon-btn { width: 36px; height: 40px; }
      .pr-line .icon-btn:disabled { opacity: .3; pointer-events: none; }
      .pr-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; margin: 10px 0 4px; }
      .pr-pick label { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 10px 14px; border-radius: 12px; background: var(--fill-3); cursor: pointer; font-size: 13.5px; }
      .pr-pick label.pr-locked { cursor: default; opacity: .6; }
      .pr-pick small { display: block; color: var(--muted); font-size: 12.5px; margin-top: 1px; }
      .pr-pick-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; }
      .pr-vin-rows { display: flex; flex-direction: column; gap: 12px; }
      .pr-vin-row { padding: 14px 16px; border-radius: 14px; background: var(--fill-3); }
      .pr-vin-row .form-grid { margin-top: 12px; }
      .pr-vin-input { font-family: var(--mono); letter-spacing: .06em; text-transform: uppercase; }
      .pr-ns-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .page-procurement .next-step { margin-bottom: 28px; }
      .page-procurement .next-step.pr-done { background: var(--green-50); }
      .page-procurement .next-step.pr-done .ns-icon { background: var(--green-solid); }
      .page-procurement .next-step.pr-wait { background: var(--amber-50); }
      .page-procurement .next-step.pr-wait .ns-icon { background: var(--amber-solid); }
      .page-procurement .next-step.pr-stop { background: var(--red-50); }
      .page-procurement .next-step.pr-stop .ns-icon { background: var(--red-solid); }
      .pr-also { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
      .pr-lot { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
      .pr-lot + .pr-lot { border-top: .5px solid var(--line-2); }
      .pr-lot-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
      .pr-lot .stepper-compact .step { min-width: 64px; }
      .pr-cell-act { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
      .pr-void { color: var(--muted); }
      .pr-void .pr-amt { text-decoration: line-through; }
      .pr-tight { margin: 0 0 8px; }
      @media (max-width: 900px) {
        .pr-line { grid-template-columns: 1fr 1fr; }
        .pr-line .pr-lt { text-align: left; padding-bottom: 0; }
      }
      @media (max-width: 560px) {
        .pr-po-grid { grid-template-columns: 1fr; }
        .page-procurement .next-step { flex-wrap: wrap; }
        .pr-ns-actions { width: 100%; }
      }`;
    document.head.appendChild(s);
  }

  /* -------------------------------------------------------------- helpers */
  const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn ? fn(x) : x) || 0), 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const pctTxt = (x) => Math.round((Number(x) || 0) * 100) + '%';
  const VP_METHODS = ['TT (bank transfer)', 'LC', 'RTGS', 'Pay order', 'Cheque', 'Cash'];
  const S = () => NA.stock || {};   // inventory.js loads after this file
  const stamp = () => ({ by: NA.me().name, byId: NA.myStaffId(), at: new Date().toISOString() });
  /** Supplier prices and payments only for people who may see costs. */
  const seeMoney = () => NA.can('costs.view');
  const M = (n) => (seeMoney() ? F.money(n) : '—');
  const MS = (n) => (seeMoney() ? F.short(n) : '—');
  const lock = (t) => `<span class="lock-note">${NA.icon('lock', 14)}${esc(t)}</span>`;
  /** Mirrors the office server: may this person change records of this kind? */
  function canWrite(c) {
    const role = NA.role();
    if (role === 'owner') return true;
    const t = NA.ACCESS && NA.ACCESS[role];
    return t ? t[c] === 'all' : true;
  }
  /** Who may do which step (checked before a sheet opens, so a step is never half saved). */
  const can = {
    manage: () => NA.can('po.manage') && canWrite('purchaseOrders'),
    pay: () => NA.can('vendor.pay') && canWrite('vendorPayments') && canWrite('purchaseOrders'),
    inspect: () => (S().canInspect ? S().canInspect() : NA.can('stock.edit')) && canWrite('vehicles'),
    receive: () => NA.can('po.manage') && canWrite('purchaseOrders') && canWrite('vehicles'),
    assign: () => NA.can('vin.assign'),
    voidPay: () => NA.isRole('owner'),
  };

  /* Supplier payments. A voided payment stays on record and counts nowhere (core: B.vendorPaymentLive, B.poPaid). */
  const vpLive = B.vendorPaymentLive;
  const allPays = (po) => NA.where('vendorPayments', (p) => p.poId === po.id);
  const payments = (po) => allPays(po).filter(vpLive);
  const isAdv = (p) => /^advance/i.test(p.kind || '');
  const isRel = (p) => /^(release|final)/i.test(p.kind || '');
  const isFull = (p) => /^full/i.test(p.kind || '');
  function kindText(p) {
    const pc = /\d+(\.\d+)?%/.exec(p.kind || '');
    const base = isAdv(p) ? 'Advance' : isRel(p) ? 'Final payment' : isFull(p) ? 'Full payment' : p.kind || 'Payment';
    return base + (pc && !isFull(p) ? ' (' + pc[0] + ')' : '');
  }
  const paidOn = B.poPaid;
  const isEm = (po) => po.type === 'emergency';
  const modelColors = (modelId) => ui.opts.colors(modelId);

  /** The advance share agreed on this order: stored on it; older orders read it from their advance payment. */
  function pctOf(po) {
    const n = Number(po && po.advancePct);
    if (n > 0 && n < 1) return n;
    const fromPay = po ? allPays(po).filter(isAdv).map((p) => { const m = /(\d+(?:\.\d+)?)\s*%/.exec(p.kind || ''); return m ? Number(m[1]) / 100 : 0; }).find((x) => x > 0 && x < 1) : 0;
    if (fromPay) return fromPay;
    const s = Number(NA.db.settings.advancePct);
    return s > 0 && s < 1 ? s : 0.3;
  }
  const settingsPct = () => { const s = Number(NA.db.settings.advancePct); return s > 0 && s < 1 ? s : 0.3; };
  const advTxt = (po) => pctTxt(pctOf(po));
  const relTxt = (po) => pctTxt(1 - pctOf(po));
  const advRequired = (po) => Math.round(B.poTotal(po) * pctOf(po));
  const advPaid = (po) => sum(payments(po).filter(isAdv), (p) => p.amount);
  const advLeft = (po) => Math.max(0, advRequired(po) - advPaid(po));
  const advDone = (po) => advRequired(po) > 0 && advPaid(po) >= advRequired(po) - 1;
  const relDue = (po, u) => Math.round((Number(u.unitCost) || 0) * (1 - pctOf(po)));
  const fullPaid = (po) => sum(payments(po).filter(isFull), (p) => p.amount);
  /** Still owed to the supplier. Only a commitment counts (the rule Today uses): an approved order that is not cancelled,
      and an emergency purchase once its VIN and price are confirmed. Waiting, declined or never sent: nothing is owed. */
  function outstanding(po) {
    const k = computeStage(po);
    return k === 'cancelled' || (isEm(po) && k === 'check') || !isApproved(po) ? 0 : Math.max(0, B.poTotal(po) - paidOn(po));
  }
  /** Left to pay on this order, approved or not (its own page says which). */
  const leftOn = (po) => (computeStage(po) === 'cancelled' ? 0 : Math.max(0, B.poTotal(po) - paidOn(po)));

  /* Customer orders. Purchasing cannot read customer payments or names, so it reads the order's saved stage instead
     of a percentage that would always say 0%. */
  const seesPayments = () => NA.isRole('owner') || !!(NA.ACCESS && NA.ACCESS[NA.role()] && NA.ACCESS[NA.role()].payments);
  /** How far a customer order is paid, in words that are true for whoever reads them (lower case, mid-sentence). */
  function paidWords(o) {
    if (seesPayments()) return B.isFullyPaid(o) ? 'paid in full' : Math.round(B.orderPaidPct(o) * 100) + '% paid';
    return o.stage === 'vin' ? 'ready for its VIN' : o.stage === 'payment' ? 'part paid' : 'booked, nothing paid yet';
  }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  /** Ready for its VIN: from the payments when this person can read them, else from the saved stage. */
  const orderReady = (o) => (seesPayments() ? B.canAssignVin(o) : o.stage === 'vin');
  /** Confirmed: booking money in, or the company's purchase order on file. */
  const orderConfirmed = (o) => (seesPayments() || o.channel === 'Corporate' ? B.isOrderConfirmed(o) : o.stage !== 'booking');
  const custOf = (o) => (NA.customerName(o.customerId) !== '—' ? ' · ' + NA.customerName(o.customerId) : '');

  /* Each car on an order. Payments and vehicles are their own records, so they stay the truth even when two
     people saved the same order at once and one copy of its car list won. */
  const unitPays = (po, u) => allPays(po).filter((p) => (isRel(p) || isFull(p)) && (p.unitId ? p.unitId === u.id : !!u.vin && !!p.vin && cleanVin(p.vin) === cleanVin(u.vin)));
  const unitPaid = (po, u) => { const ps = unitPays(po, u); return ps.length ? ps.some(vpLive) : !!u.releasePaidAt; };
  const unitVehicle = (po, u) => (u.vehicleId && NA.vehicle(u.vehicleId)) || NA.find('vehicles', (v) => v.poId === po.id && v.unitId === u.id) || null;
  const unitHasVin = (po, u) => !!u.vehicleId || !!unitVehicle(po, u);
  /** In and checked: arrived at our place and its arrival check is saved (a car only waiting for the check is not). */
  const checkedIn = (v) => !!(v && v.arrivedAt && v.pdi && v.status !== 'in_transit');
  const unitReceived = (po, u) => !!u.receivedAt || checkedIn(unitVehicle(po, u));
  const unitStatus = (po, u) => { const v = unitVehicle(po, u); return !v ? '' : S().statusOf ? S().statusOf(v) : v.status; };

  /* VIN rules, paint swatches and status words live in inventory.js (NA.stock). Small fallbacks keep this page working alone. */
  const cleanVin = (raw) => (S().cleanVin ? S().cleanVin(raw) : String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, ''));
  function vinProblem(raw, opts) {
    if (S().vinProblem) return S().vinProblem(raw, opts);
    const vin = cleanVin(raw);
    if (!vin) return 'Enter the VIN';
    if (vin.length !== 17 || /[^A-Z0-9]|[IOQ]/.test(vin)) return 'A VIN has 17 letters and numbers, never I, O or Q';
    return NA.vehicleByVin(vin) ? 'This VIN is already on another car' : null;
  }
  const swatch = (c) => (S().swatch ? S().swatch(c) : '');
  const carLabel = (u) => `${swatch(u.color)} <b>${esc(NA.modelName(u.modelId))}</b> <span class="muted">${esc(u.color || '')}</span>`;

  /* ------------------------------------------------------------ approvals */
  const approvalKind = (po) => (isEm(po) ? 'emergency' : 'po');
  /** 'approved' | 'pending' | 'rejected' | 'none' — the same rule Accounts and Today use. People who cannot see
      the approval itself (Accounts) read the copy kept on the order. */
  function approvalOf(po) {
    const kind = approvalKind(po);
    if (kind === 'po' && NA.policy().poApproval === false) return 'approved';
    const st = A ? A.state('purchaseOrders', po.id, kind) : 'none';
    if (st !== 'none') return st;
    if (po.approval && po.approval.status && po.approval.status !== 'cancelled') return po.approval.status;
    if (po.approvedAt || po.approvedBy) return 'approved';
    const start = NA.db.settings.policyStart;
    return start && String(po.createdAt || '').slice(0, 10) < start ? 'approved' : 'none';   // raised before approvals existed
  }
  const isApproved = (po) => approvalOf(po) === 'approved';
  /** Raised while Settings did not ask for the Managing Director's OK on purchase orders: it carries an approval stamped
      by the rules, so turning the switch back on later does not take the approval away. */
  const NOT_NEEDED = 'Not needed by the rules';
  const notNeeded = (po) => !!(po && po.approval && po.approval.status === 'approved' && !po.approval.by && po.approval.note === NOT_NEEDED);
  /** Who approved it and when (null for orders from before approvals, and for orders that needed no approval). */
  function approvedBy(po) {
    const a = A ? A.find('purchaseOrders', po.id, approvalKind(po)) : null;
    if (a && a.status === 'approved') return { by: a.decidedBy, at: a.decidedAt };
    if (po.approval && po.approval.status === 'approved' && !notNeeded(po)) return { by: po.approval.by, at: po.approval.at };
    return null;
  }
  const approvalNote = (po) => { const a = A ? A.find('purchaseOrders', po.id, approvalKind(po)) : null; return (a && a.note) || (po.approval && po.approval.note) || ''; };
  /** Keep a copy of the decision on the order, for people who cannot see approvals. */
  function stampApproval(po, a) {
    if (!po || !a || !canWrite('purchaseOrders')) return;
    NA.update('purchaseOrders', po.id, { approval: { id: a.id, status: a.status, by: a.decidedBy || null, byId: a.decidedById || null, at: a.decidedAt || null,
      askedBy: a.requestedBy || null, askedAt: a.createdAt || null, value: a.value, note: a.note || '' } });
    if (isEm(po) && po.orderId) copyToOrder(po.orderId);
  }
  const baseCost = (po, u) => Number(po.modelCost) || Number((NA.model(u.modelId) || {}).cost) || 0;
  const premiumOf = (po) => { const u = (po.units || [])[0] || {}; const b = baseCost(po, u); return b ? (Number(u.unitCost) || 0) - b : 0; };
  const offList = (modelId, cost) => { const b = Number((NA.model(modelId) || {}).cost) || 0; return b > 0 && Math.abs((Number(cost) || 0) - b) / b > 0.01; };
  /** Same model and colour: free in stock, on the way with a VIN, and still on order from BYD (approved orders only). */
  function matching(modelId, color) {
    const same = (v) => v.modelId === modelId && (!color || !v.color || v.color === color) && !v.reservedFor && !v.orderId;
    const st = (v) => (S().statusOf ? S().statusOf(v) : v.status);
    const onOrder = NA.db.purchaseOrders.filter((p) => !isEm(p) && !['closed', 'cancelled'].includes(computeStage(p)) && isApproved(p))
      .reduce((n, p) => n + (p.units || []).filter((u) => u.modelId === modelId && (!color || u.color === color) && !unitHasVin(p, u)).length, 0);
    return { inStock: NA.where('vehicles', (v) => same(v) && st(v) === 'available' && !v.holdReason).length,
      coming: NA.where('vehicles', (v) => same(v) && ['in_transit', 'pdi'].includes(st(v))).length, onOrder };
  }
  const matchText = (m) => (m.inStock || m.coming || m.onOrder ? `${m.inStock} in stock, ${m.coming} on the way, ${m.onOrder} on order from BYD` : 'None in stock, on the way or on order');
  /* The title is written into the activity feed, which people without cost rights read (the Service Manager):
     it carries no money. The amounts are in the detail and the approval's amount, which only reach people who
     can see the order. */
  function approvalOpts(po) {
    const total = B.poTotal(po);
    const units = po.units || [];
    let title, detail;
    if (isEm(po)) {
      const u = units[0] || {};
      const o = po.orderId ? NA.get('orders', po.orderId) : null;
      const prem = premiumOf(po);
      title = `${po.code}: emergency ${[NA.modelName(u.modelId), u.color].filter(Boolean).join(' ')} from ${NA.vendorName(po.vendorId)}`;
      detail = [`Agreed price ${F.money(total)}`, prem > 0 ? `${F.money(prem)} above the BYD cost` : prem < 0 ? 'Below the BYD cost' : '',
        o ? `For ${o.code}${NA.customerName(o.customerId) !== '—' ? ' (' + NA.customerName(o.customerId) + ')' : ''}, ${paidWords(o)}` : 'Not for a customer order (stock car)',
        'Same car: ' + matchText(matching(u.modelId, u.color))].filter(Boolean).join(' · ');
    } else {
      const off = groupUnits(units).filter((l) => offList(l.modelId, l.unitCost));
      title = `${po.code}: ${plural(units.length, 'car')} from ${NA.vendorName(po.vendorId)}`;
      detail = `Order value ${F.money(total)} · ` + groupUnits(units).map((l) => `${l.qty} × ${[NA.modelName(l.modelId), l.color].filter(Boolean).join(' ')}`).join(', ')
        + ` · ${advTxt(po)} advance ${F.money(advRequired(po))}` + (off.length ? ` · price differs from the price list on ${plural(off.length, 'line')}` : '');
    }
    return { type: approvalKind(po), ref: { c: 'purchaseOrders', id: po.id, code: po.code }, title, detail, amount: total, value: total };
  }
  /** Send an order to the Managing Director (approved at once when the Managing Director raises it). */
  function askApproval(po, reason) {
    if (!A) return null;
    const a = A.request(Object.assign(approvalOpts(po), { reason: reason || '' }));
    stampApproval(NA.get('purchaseOrders', po.id) || po, a);
    return a;
  }
  /** Ask again with the reason sheet (after a decline, or when nobody asked yet). */
  function askAgain(po) {
    if (!can.manage() || !A || !NA.ui.requestApproval) return;
    NA.ui.requestApproval(Object.assign({ sheetTitle: 'Ask the Managing Director',
      placeholder: isEm(po) ? 'e.g. Customer paid in full and needs the car this week' : 'e.g. Stock for the festive season, as planned' }, approvalOpts(po)))
      .then((a) => { if (a) { stampApproval(NA.get('purchaseOrders', po.id) || po, a); NA.refresh(); } });
  }

  /* ---------------------------------------------------------- step words */
  /* The steps and their words come from core (NA.FLOW). Only the order's own advance share is added, and the
     hints are left out: the "what happens next" bar explains the step. */
  const plainSteps = (list) => list.map((s) => ({ key: s.key, label: s.label, icon: s.icon }));
  const poSteps = (po) => plainSteps(NA.FLOW.poStages).map((s) => (s.key === 'po' ? Object.assign(s, { label: `Order and ${advTxt(po)} advance` })
    : s.key === 'releasing' ? Object.assign(s, { label: `Final ${relTxt(po)} and VINs` }) : s));
  const EM_STEPS = plainSteps(NA.FLOW.emergencyStages);
  const STAGE_TEXT = { po: 'Ordered', allocated: 'Batch allocated', releasing: 'Final payments', receiving: 'On the way', closed: 'In stock',
    check: 'Checking', confirmed: 'VIN confirmed', paid: 'Paid', received: 'Received', cancelled: 'Cancelled' };
  const stageText = (k) => STAGE_TEXT[k] || k || '—';
  const LOT_TEXT = { 'Allocated': 'Allocated', 'In Production': 'Being built', 'Shipped': 'Shipped', 'At Chattogram Port': 'At Chattogram port',
    'Customs Cleared': 'Cleared customs', 'Delivered to Warehouse': 'At our warehouse' };
  const lotText = (s) => LOT_TEXT[s] || s || '—';
  const LOTS = NA.FLOW.lotStatuses;
  const LOT_LAST = LOTS[LOTS.length - 1];

  /** Group units into lines: [{modelId,color,qty,unitCost,total}] */
  function groupUnits(units) {
    const map = {};
    (units || []).forEach((u) => {
      const k = u.modelId + '|' + (u.color || '') + '|' + (u.unitCost || 0);
      if (!map[k]) map[k] = { modelId: u.modelId, color: u.color, qty: 0, unitCost: Number(u.unitCost) || 0, total: 0 };
      map[k].qty++; map[k].total += Number(u.unitCost) || 0;
    });
    return Object.values(map);
  }
  function modelChips(units) {
    const byModel = {};
    (units || []).forEach((u) => { byModel[u.modelId] = (byModel[u.modelId] || 0) + 1; });
    return `<div class="pr-chips">${Object.keys(byModel).map((m) => `<span class="pr-chip">${byModel[m]} × ${esc(NA.modelName(m))}</span>`).join('')}</div>`;
  }

  /** Grey for finished or stopped, blue while it moves, amber only while it waits for a decision. */
  function stageBadge(po) {
    const k = computeStage(po);
    if (k === 'cancelled') return ui.badge('Cancelled', 'gray', 'x');
    const ap = approvalOf(po);
    if (ap === 'pending') return ui.badge('Waiting for approval', 'amber', 'clock');
    if (ap === 'rejected') return ui.badge('Declined', 'red', 'x');
    if (k === 'closed' || k === 'received') return ui.badge(stageText(k), 'gray', 'check');
    if (ap !== 'approved' && !(isEm(po) && k === 'check')) return ui.badge('Not approved yet', 'gray', 'lock');
    return ui.badge(stageText(k), 'blue');
  }

  function etaText(eta) {
    if (S().etaText) return S().etaText(eta);
    if (!eta) return 'Arrival date not known yet';
    const d = NA.daysBetween(NA.today(), eta);
    return d === 0 ? 'Arrives today' : d > 0 ? `Arrives ${F.dateShort(eta)} · in ${plural(d, 'day')}` : `Was due ${F.dateShort(eta)} · ${plural(-d, 'day')} late`;
  }

  /** The "what happens next" bar. tone: done | wait | stop. also: extra lines (html) for other open steps. */
  function nextStepBox({ icon, title, desc, actions, tone, also }) {
    return `<div class="next-step ${tone ? 'pr-' + tone : ''}"><span class="ns-icon">${NA.icon(icon || 'arrow-right', 20)}</span>
      <div class="ns-text"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}${also && also.length ? `<div class="pr-also">${also.join('')}</div>` : ''}</div>
      ${actions ? `<div class="pr-ns-actions">${actions}</div>` : ''}</div>`;
  }

  function timeline(rec) {
    const h = rec.history || [];
    if (!h.length) return `<ul class="timeline"><li>Raised<small>${esc(F.datetime(rec.createdAt))}</small></li></ul>`;
    return `<ul class="timeline">${h.slice(0, 30).map((x) => `<li>${esc(x.text)}<small>${esc(F.datetime(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</small></li>`).join('')}</ul>`;
  }

  /** One supplier payment as a grouped-list row (voided ones struck through, with the reason). */
  function payRow(p) {
    const live = vpLive(p);
    return `<div class="gl-row ${live ? '' : 'pr-void'}"><span class="gl-main"><b>${esc(kindText(p))}${p.vin ? ` · <span class="mono">${esc(p.vin)}</span>` : ''}</b>
        <small>${esc(F.date(p.date))} · ${esc(p.method || '—')} · ${esc(p.ref || 'no reference')}${p.vendorBillNo ? ' · bill ' + esc(p.vendorBillNo) : ''}${p.paidBy ? ' · ' + esc(p.paidBy) : ''}${live ? '' : ' · voided' + (p.void && p.void.reason ? ': ' + esc(p.void.reason) : '')}</small></span>
      <span class="gl-value pr-amt">${esc(M(p.amount))}</span>${live && can.voidPay() ? `<button class="btn btn-plain btn-sm" data-act="void" data-id="${esc(p.id)}">Void</button>` : ''}</div>`;
  }

  function markInvalid(el, name, msg) {
    const f = el.querySelector(`[name="${name}"]`);
    if (f && f.closest) { const box = f.closest('.field') || f.closest('.check'); if (box) box.classList.add('invalid'); try { f.focus(); } catch (e) { /* ignore */ } }
    ui.toast(msg, 'error');
    return false;
  }

  /** Modal with a form, our own body, validation and optional onMount. danger: a red submit button. */
  function openForm({ title, subtitle, size = 'md', intro = '', fields, values, extra = '', submitLabel = 'Save', submitIcon, onSubmit, onMount, danger }) {
    return ui.modal({
      title, subtitle, size,
      body: intro + `<form class="modal-form" onsubmit="return false">${fields ? ui.form(fields, values || {}) : ''}${extra}</form>`,
      actions: [{ label: 'Cancel' }, {
        label: submitLabel, kind: danger ? 'danger' : 'primary', icon: submitIcon, onClick: async (el) => {
          const form = el.querySelector('form');
          if (!ui.validate(form)) return false;
          const r = await onSubmit(ui.readForm(form), el, form);
          return r !== false;
        },
      }],
      onMount: (el) => {
        el.addEventListener('input', (e) => { const f = e.target.closest && e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
        el.addEventListener('change', (e) => { const f = e.target.closest && e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
        if (onMount) onMount(el);
      },
    });
  }

  /** Live VIN feedback under the input (count and whether it is free), from NA.stock. */
  function wireVin(input, opts) {
    if (!input || !input.setAttribute) return;
    if (input.classList) input.classList.add('pr-vin-input');
    input.setAttribute('maxlength', '17');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (S().wireVin) S().wireVin(input, opts);
  }

  function ensureVendors() {
    if (!NA.db.vendors.some((v) => v.type === 'Principal')) {
      const p = settingsPct();
      NA.insert('vendors', { name: 'BYD Auto Industry Co., Ltd. (Export)', type: 'Principal', country: 'China', contact: '', terms: pctTxt(p) + ' advance after approval · ' + pctTxt(1 - p) + ' per car before it ships' });
    }
    if (!NA.db.vendors.some((v) => v.type === 'Emergency supplier')) {
      NA.insert('vendors', { name: 'CG Runner', type: 'Emergency supplier', country: 'Bangladesh', contact: '', terms: '100% when the VIN is confirmed' });
    }
  }
  const vendorOfType = (type) => NA.find('vendors', (v) => v.type === type) || NA.db.vendors[0] || null;

  /** Record money paid to a supplier (Accounts or the Managing Director). The caller writes the activity line. */
  function recordVendorPayment(po, data) {
    const who = stamp();
    return NA.insert('vendorPayments', Object.assign({ poId: po.id, vendorId: po.vendorId, date: NA.today(), amount: 0, kind: '', ref: '', method: VP_METHODS[0] }, data,
      { amount: Number(data.amount) || 0, status: 'paid', paidBy: who.by, paidById: who.byId, paidAt: who.at, void: null }));
  }
  /** A live payment to this supplier that already used this bank reference (or bill no.). */
  function refTaken(vendorId, ref, field) {
    const r = String(ref || '').trim().toLowerCase();
    if (!r) return null;
    const f = field || 'ref';
    return NA.find('vendorPayments', (p) => vpLive(p) && p.vendorId === vendorId && String(p[f] || '').trim().toLowerCase() === r);
  }
  const takenText = (p, what) => { const x = NA.get('purchaseOrders', p.poId); return `${what || 'This reference'} is already used${x ? ' on ' + x.code : ''} (${F.date(p.date)})`; };
  /** Payment dates: not before the order, not in the future. */
  function dateProblem(po, d) {
    if (!d) return 'Enter the date';
    if (d > NA.today()) return 'The date is in the future';
    if (po.date && d < po.date) return `The date is before the order (${F.date(po.date)})`;
    return null;
  }
  /** Why the current person cannot pay on this order now ('' when they can). */
  function payBlock(po) {
    if (!can.pay()) return 'Accounts pays suppliers';
    if (computeStage(po) === 'cancelled') return 'This order is cancelled';
    const ap = approvalOf(po);
    if (ap === 'pending') return 'Waiting for the Managing Director to approve';
    if (ap === 'rejected') return 'The Managing Director declined this order';
    if (ap !== 'approved') return 'The Managing Director has not approved this order yet';
    return '';
  }

  /** The stage follows the records (payments, VINs, arrivals), so it can never drift from reality. */
  function computeStage(po) {
    if (po.stage === 'cancelled') return 'cancelled';
    const units = po.units || [];
    if (isEm(po)) {
      const u = units[0] || {};
      if (unitReceived(po, u)) return 'received';
      const total = B.poTotal(po);
      if (total > 0 && fullPaid(po) >= total - 1) return 'paid';
      if (u.vin) return 'confirmed';
      return 'check';
    }
    const n = units.length;
    const withVin = units.filter((u) => unitHasVin(po, u)).length;
    const rec = units.filter((u) => unitReceived(po, u)).length;
    const paidCars = units.filter((u) => unitPaid(po, u)).length;
    if (n && rec === n) return 'closed';
    if (n && withVin === n) return 'receiving';
    if (withVin > 0 || paidCars > 0) return 'releasing';
    if ((po.lots || []).length) return 'allocated';
    return 'po';
  }
  const freshPO = (po) => NA.get('purchaseOrders', po.id) || po;
  /** Save the car list and batches, stamp the advance share on older orders, and move the stage on. Returns the new stage if it changed. */
  function savePO(po, patch) {
    const base = { units: po.units || [], lots: po.lots || [] };
    if (!isEm(po) && !(Number(po.advancePct) > 0 && Number(po.advancePct) < 1)) base.advancePct = pctOf(po);
    NA.update('purchaseOrders', po.id, Object.assign(base, patch || {}));
    const s = computeStage(po);
    let moved = null;
    if (s !== po.stage) {
      NA.update('purchaseOrders', po.id, { stage: s });
      NA.log(`${po.code}: ${stageText(s).toLowerCase()}`, { rec: po, link: '#/procurement/' + po.id, kind: s === 'closed' || s === 'received' ? 'success' : 'info' });
      moved = s;
    }
    if (isEm(po) && po.orderId) copyToOrder(po.orderId);   // the customer order follows its emergency purchase
    return moved;
  }
  /** When every car of a batch is in, the batch is at our warehouse. Returns true if something changed. */
  function lotsFollow(po) {
    let changed = false;
    (po.lots || []).forEach((l) => {
      const inLot = (po.units || []).filter((u) => u.lotNo === l.lotNo);
      if (inLot.length && inLot.every((u) => unitReceived(po, u)) && l.status !== LOT_LAST) {
        l.status = LOT_LAST;
        l.statusDates = Object.assign({}, l.statusDates, { [LOT_LAST]: NA.today() });
        changed = true;
      }
    });
    return changed;
  }
  /** Bring an order in line with its cars when someone else checked them (the workshop cannot see orders). Purchasing only. */
  function reconcile(po) {
    if (!po || po.stage === 'cancelled' || !can.manage()) return;
    let changed = false;
    (po.units || []).forEach((u) => {
      const v = unitVehicle(po, u);
      if (v && !u.vehicleId) { u.vehicleId = v.id; u.vin = u.vin || v.vin; changed = true; }
      if (!u.receivedAt && checkedIn(v)) { u.receivedAt = v.arrivedAt; u.location = v.location || ''; changed = true; }
    });
    if (lotsFollow(po)) changed = true;
    if (!isEm(po) && !(Number(po.advancePct) > 0 && Number(po.advancePct) < 1)) changed = true;   // older order: keep its advance share from now on
    if (changed || computeStage(po) !== po.stage) savePO(po);
    (po.lots || []).forEach((l) => etaToCars(po, l.lotNo, l.eta));   // cars on the way before arrival dates were copied
  }
  /** Bring every order up to date when Purchasing opens the hub, so people who read orders (Accounts, Today) or only
      cars (sales) see the same thing: the stage the cars reached, each older order's own advance share, and each
      batch's arrival date on its cars. Each version of an order is looked at once, so a refused save cannot loop. */
  const caughtUp = new Set();
  function catchUp(all) {
    if (!can.manage()) return;
    all.forEach((po) => {
      const k = computeStage(po);
      const key = po.id + ':' + k + ':' + (po.updatedAt || '');
      if (k === 'cancelled' || caughtUp.has(key)) return;
      caughtUp.add(key);
      if (k !== po.stage) { reconcile(po); return; }
      if (!isEm(po) && !(Number(po.advancePct) > 0 && Number(po.advancePct) < 1)) NA.update('purchaseOrders', po.id, { advancePct: pctOf(po) });
      (po.lots || []).forEach((l) => etaToCars(po, l.lotNo, l.eta));
    });
    copiesFollow(all);   // customer orders show their emergency purchase (also ones started before the copy existed)
  }

  function topColor(model) {
    const counts = {};
    NA.where('orders', (o) => o.modelId === model.id && ['booking', 'payment', 'vin'].includes(o.stage) && !o.vehicleId && o.color)
      .forEach((o) => { counts[o.color] = (counts[o.color] || 0) + 3; });
    NA.where('orders', (o) => o.modelId === model.id && o.stage === 'delivered' && o.color).forEach((o) => { counts[o.color] = (counts[o.color] || 0) + 1; });
    const cols = modelColors(model.id);
    const best = Object.keys(counts).filter((c) => cols.includes(c)).sort((a, b) => counts[b] - counts[a])[0];   // only a colour the model is sold in
    return best || cols[0] || '';
  }

  /* ================================================================ ACTIONS */

  /** New standard purchase order. prefill: {units:[{modelId,color,qty,unitCost?}], vendorId, proformaRef, notes, onSaved} */
  NA.actions.newPO = function (prefill) {
    prefill = prefill || {};
    if (!can.manage()) { ui.toast('Purchasing raises purchase orders', 'info'); return; }
    const models = NA.db.models.filter((m) => m.active !== false);
    if (!models.length) { ui.toast('Add the car models in Settings first', 'error'); return; }
    ensureCss();
    ensureVendors();
    const principal = vendorOfType('Principal');
    const pct = settingsPct();   // stored on the order: later changes in Settings do not touch it
    const needsOk = !!A && NA.policy().poApproval !== false && A.needed('po', 1);
    const mk = (l) => {
      const m = NA.model(l.modelId) || models[0];
      const cols = modelColors(m.id);
      return { modelId: m.id, color: cols.includes(l.color) ? l.color : cols[0] || '', qty: Math.max(1, Math.round(Number(l.qty) || 1)), unitCost: Number(l.unitCost) || Number(m.cost) || 0 };
    };
    let lines = (prefill.units && prefill.units.length ? prefill.units : [{ modelId: models[0].id }]).map(mk);
    const totals = () => {
      const units = sum(lines, (l) => l.qty);
      const total = sum(lines, (l) => l.qty * l.unitCost);
      return { units, total, adv: Math.round(total * pct) };
    };
    const lineHtml = (l, i) => `<div class="pr-line" data-i="${i}">
        <div><label>Model</label><select data-l="model">${models.map((m) => `<option value="${esc(m.id)}" ${m.id === l.modelId ? 'selected' : ''}>${esc(NA.modelName(m.id))}</option>`).join('')}</select></div>
        <div><label>Colour</label><select data-l="color">${modelColors(l.modelId).map((c) => `<option ${c === l.color ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label>Cars</label><input type="number" min="1" max="100" step="1" data-l="qty" value="${l.qty}"/></div>
        <div><label>Price per car (৳)</label><input type="number" min="0" step="1000" data-l="cost" value="${l.unitCost}" class="${offList(l.modelId, l.unitCost) ? 'pr-off' : ''}"/></div>
        <div class="pr-lt" data-lt>${F.short(l.qty * l.unitCost)}</div>
        <div><button type="button" class="icon-btn" data-line-del aria-label="Remove this line" ${lines.length < 2 ? 'disabled' : ''}>${NA.icon('trash', 16)}</button></div>
      </div>`;
    const body = `
      ${needsOk ? `<div class="callout callout-info pr-block">${NA.icon('info')}<div>The Managing Director approves the order first. After that Accounts pays the ${esc(pctTxt(pct))} advance.</div></div>` : ''}
      ${prefill.units && prefill.units.length ? `<p class="muted pr-block">Filled in from the plan. Choose the colours and change the numbers as needed.</p>` : ''}
      <form class="modal-form" onsubmit="return false"><div class="form-grid">
        ${ui.field({ name: 'vendorId', label: 'Supplier', type: 'select', options: ui.opts.vendors(), required: true, placeholder: false }, prefill.vendorId || (principal && principal.id))}
        ${ui.field({ name: 'proformaRef', label: 'Supplier quote no. (proforma)', required: true, placeholder: 'e.g. PI-BYD-25-1102' }, prefill.proformaRef)}
        ${ui.field({ name: 'date', label: 'Order date', type: 'date', required: true, max: NA.today() }, NA.today())}
        ${ui.field({ name: 'notes', label: 'Note', placeholder: 'e.g. Stock for Eid' }, prefill.notes)}
        <div class="form-section">Cars on this order</div>
        <div class="span-all"><div class="pr-lines" data-lines>${lines.map(lineHtml).join('')}</div>
          <button type="button" class="btn btn-ghost btn-sm mt-12" data-line-add>${NA.icon('plus', 15)}Add another model or colour</button>
          <p class="help mt-8" data-off></p></div>
      </div>
      <div class="pr-total" data-totals></div></form>`;

    ui.modal({
      title: 'New purchase order', subtitle: esc(`To BYD · ${pctTxt(pct)} advance after approval, ${pctTxt(1 - pct)} per car before it ships`), size: 'lg', body,
      onMount: (el) => {
        const linesBox = el.querySelector('[data-lines]');
        const drawTotals = () => {
          const t = totals();
          el.querySelector('[data-totals]').innerHTML = `<div><small>Cars</small><b>${t.units}</b></div><div><small>Order value</small><b>${F.money(t.total)}</b></div><div><small>${esc(pctTxt(pct))} advance${needsOk ? ' after approval' : ''}</small><b>${F.money(t.adv)}</b></div>`;
          const off = lines.filter((l) => offList(l.modelId, l.unitCost)).length;
          const h = el.querySelector('[data-off]');
          if (h) h.textContent = off ? `The price differs from the price list on ${plural(off, 'line')} — say why in the note. The Managing Director sees it.` : '';
        };
        const drawLines = () => { linesBox.innerHTML = lines.map(lineHtml).join(''); drawTotals(); };
        const idx = (t) => Number(t.closest('.pr-line').dataset.i);
        linesBox.addEventListener('change', (e) => {
          const t = e.target; if (!t.dataset || !t.dataset.l) return; const i = idx(t);
          if (t.dataset.l === 'model') { const m = NA.model(t.value); lines[i] = { modelId: m.id, color: modelColors(m.id)[0] || '', qty: lines[i].qty, unitCost: Number(m.cost) || 0 }; drawLines(); }
          if (t.dataset.l === 'color') lines[i].color = t.value;
        });
        linesBox.addEventListener('input', (e) => {
          const t = e.target; if (!t.dataset || !t.dataset.l) return; const i = idx(t);
          if (t.dataset.l === 'qty') lines[i].qty = Math.max(0, Math.round(Number(t.value) || 0));
          if (t.dataset.l === 'cost') { lines[i].unitCost = Math.max(0, Number(t.value) || 0); t.classList.toggle('pr-off', offList(lines[i].modelId, lines[i].unitCost)); }
          const lt = t.closest('.pr-line').querySelector('[data-lt]'); if (lt) lt.textContent = F.short(lines[i].qty * lines[i].unitCost);
          drawTotals();
        });
        linesBox.addEventListener('click', (e) => {
          const b = e.target.closest('[data-line-del]'); if (!b || lines.length < 2) return;
          lines.splice(idx(b), 1); drawLines();
        });
        el.querySelector('[data-line-add]').addEventListener('click', () => {
          const last = lines[lines.length - 1];
          lines.push(mk({ modelId: last ? last.modelId : models[0].id })); drawLines();
        });
        el.addEventListener('input', (e) => { const f = e.target.closest && e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
        drawTotals();
      },
      actions: [{ label: 'Cancel' }, {
        label: needsOk ? 'Send for approval' : 'Create purchase order', kind: 'primary', icon: 'check', onClick: (el) => {
          const form = el.querySelector('form');
          if (!ui.validate(form)) return false;
          const v = ui.readForm(form);
          const good = lines.filter((l) => l.modelId && l.qty > 0);
          if (!good.length) { ui.toast('Add at least one car to the order', 'error'); return false; }
          if (good.some((l) => !(l.unitCost > 0))) { ui.toast('Enter the price for every line', 'error'); return false; }
          const nUnits = sum(good, (l) => l.qty);
          if (nUnits > 300) { ui.toast('That is more than 300 cars — split it into several orders', 'error'); return false; }
          if (v.date > NA.today()) return markInvalid(el, 'date', 'The order date is in the future');
          const dup = NA.find('purchaseOrders', (p) => p.stage !== 'cancelled' && p.proformaRef && p.proformaRef.toLowerCase() === v.proformaRef.toLowerCase());
          if (dup) return markInvalid(el, 'proformaRef', `Quote ${v.proformaRef} is already on ${dup.code}`);
          if (good.some((l) => offList(l.modelId, l.unitCost)) && !v.notes) return markInvalid(el, 'notes', 'Say why the price differs from the price list');
          const units = [];
          good.forEach((l) => { for (let k = 0; k < l.qty; k++) units.push({ id: NA.uid(), modelId: l.modelId, color: l.color, unitCost: Number(l.unitCost), lotNo: '', vin: null, vehicleId: null, releasePaidAt: null, releaseRef: '', receivedAt: null }); });
          const who = stamp();
          const ruleOk = NA.policy().poApproval === false;   // Settings: purchase orders do not need the MD's OK
          const po = NA.insert('purchaseOrders', {
            code: NA.nextCode('PO'), type: 'standard', vendorId: v.vendorId, date: v.date || NA.today(), proformaRef: v.proformaRef,
            stage: 'po', currency: 'BDT', advancePct: pct, lots: [], units, notes: v.notes || '', history: [],
            createdBy: who.by, createdById: who.byId,
            approval: ruleOk ? { id: null, status: 'approved', note: NOT_NEEDED, by: null, byId: null, at: who.at } : null,
          });
          // No money in activity lines: some people who read the feed may not see supplier prices.
          NA.log(`${po.code} raised with ${NA.vendorName(po.vendorId)} — ${plural(units.length, 'car')} (quote ${po.proformaRef})`, { rec: po, link: '#/procurement/' + po.id, kind: 'info' });
          const a = !ruleOk ? askApproval(po, v.notes) : null;
          if (typeof prefill.onSaved === 'function') prefill.onSaved(po);
          ui.toast(!a ? `${po.code} created` : a.status === 'approved' ? `${po.code} created and approved` : `${po.code} sent to the Managing Director`, a && a.status !== 'approved' ? 'info' : 'success');
          NA.go('#/procurement/' + po.id);
          NA.refresh();
          return true;
        },
      }],
    });
  };

  /** An emergency purchase still under way for this customer order. One whose car has arrived stops counting once that
      car cannot go to the order (on hold, given to another order, or no longer kept for it), so Purchasing can find
      the customer another car. */
  function openUrgentFor(orderId) {
    return NA.find('purchaseOrders', (p) => isEm(p) && p.orderId === orderId && p.stage !== 'cancelled' && stillFor(p, orderId));
  }
  function stillFor(p, orderId) {
    if (computeStage(p) !== 'received') return true;
    return carStillFor(unitVehicle(p, (p.units || [])[0] || {}), orderId);
  }
  /** The car can still go to this order: given to it, or kept for it and not on hold. */
  function carStillFor(v, orderId) {
    if (!v) return false;
    if (v.orderId) return v.orderId === orderId;
    return v.reservedFor === orderId && ['available', 'pdi'].includes(S().statusOf ? S().statusOf(v) : v.status);
  }

  /* Purchasing's copy of the emergency purchase on its customer order: o.emergencyPO = {id, code, stage, eta, approval}.
     Consultants receive no purchase orders, so this is how their order page follows the purchase, and how a cancellation
     goes to the Managing Director once a car is being bought. The office server lets Purchasing write exactly this one
     field on an order, so nothing else on the order is written with it (no history line either). The copy follows the
     purchase under way for the order, else the latest one (a cancelled one says so). */
  const COPY_KEYS = ['id', 'code', 'stage', 'eta', 'approval'];
  function orderCopy(orderId) {
    const mine = NA.where('purchaseOrders', (p) => isEm(p) && p.orderId === orderId);
    if (!mine.length) return null;
    const po = openUrgentFor(orderId) || mine.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    return { id: po.id, code: po.code || '', stage: computeStage(po), eta: po.eta || '', approval: approvalOf(po) };
  }
  /** Write the copy when it changed: Purchasing (allowed this one field), or anyone who may change orders. */
  function copyToOrder(orderId) {
    if (!orderId || !(canWrite('orders') || NA.isRole('procurement'))) return false;
    const o = NA.get('orders', orderId);
    const copy = o ? orderCopy(orderId) : null;
    const was = (o && o.emergencyPO) || {};
    if (!copy || COPY_KEYS.every((k) => String(was[k] || '') === String(copy[k] || ''))) return false;
    NA.update('orders', o.id, { emergencyPO: copy });
    return true;
  }
  /** Bring the copies up to date when Purchasing opens its pages (purchases started before the copy existed).
      Each value is tried once per visit, so a refused save cannot loop. */
  const copied = new Set();
  function copiesFollow(list) {
    if (!can.manage()) return;
    new Set(list.filter((p) => isEm(p) && p.orderId).map((p) => p.orderId)).forEach((id) => {
      const key = id + ':' + JSON.stringify(orderCopy(id));
      if (copied.has(key)) return;
      copied.add(key);
      copyToOrder(id);
    });
  }
  /** The order's copy says a purchase is under way (for people who cannot see the purchase order itself). */
  function copyUnderWay(o) {
    const c = o && o.emergencyPO;
    if (!c || !c.id || NA.get('purchaseOrders', c.id) || c.stage === 'cancelled') return false;
    return c.stage !== 'received' || carStillFor(NA.find('vehicles', (v) => v.poId === c.id), o.id);
  }

  /** Emergency purchase from a local supplier (CG Runner). prefill {modelId, color, orderId} */
  NA.actions.newEmergencyPO = function (prefill) {
    prefill = prefill || {};
    if (!can.manage()) { ui.toast('Purchasing starts emergency purchases', 'info'); return; }
    const models = NA.db.models.filter((m) => m.active !== false);
    if (!models.length) { ui.toast('Add the car models in Settings first', 'error'); return; }
    ensureCss();
    ensureVendors();
    const cg = vendorOfType('Emergency supplier');
    const ord = prefill.orderId ? NA.get('orders', prefill.orderId) : null;
    const already = ord && openUrgentFor(ord.id);
    if (already) { ui.toast(`${ord.code} already has an emergency purchase — ${already.code}`, 'info'); NA.go('#/procurement/' + already.id); return; }
    // Orders where sales asked for an emergency car come first (oldest request first).
    const openOrders = NA.where('orders', (o) => ['booking', 'payment', 'vin'].includes(o.stage) && !o.vehicleId && !openUrgentFor(o.id))
      .sort((a, b) => (!!b.emergencyRequest - !!a.emergencyRequest) || String((a.emergencyRequest || {}).at || a.createdAt).localeCompare(String((b.emergencyRequest || {}).at || b.createdAt)));
    const who = (o) => (NA.customerName(o.customerId) !== '—' ? ' · ' + NA.customerName(o.customerId) : '');
    const modelId = (ord && ord.modelId) || prefill.modelId || models[0].id;
    const cols = modelColors(modelId);
    const want = (ord && ord.color) || prefill.color;
    const color = cols.includes(want) ? want : cols[0];
    const fields = [
      { name: 'orderId', label: 'For which customer order?', type: 'select', span: 2, placeholder: 'Not for an order — a stock car',
        options: openOrders.map((o) => ({ value: o.id, label: `${o.code}${who(o)} · ${NA.modelName(o.modelId)} ${o.color || ''}${o.emergencyRequest ? ' · asked ' + F.ago(o.emergencyRequest.at) : ''}` })),
        help: 'Orders where sales asked for an emergency car are first. The car is kept for this order when it arrives.' },
      { name: 'modelId', label: 'Model', type: 'select', required: true, options: ui.opts.models(), placeholder: false },
      { name: 'color', label: 'Colour', type: 'select', options: cols, placeholder: false },
      { name: 'vendorId', label: 'Supplier', type: 'select', options: ui.opts.vendors(), required: true, placeholder: false },
      { name: 'date', label: 'Date', type: 'date', required: true, max: NA.today() },
      { name: 'availabilityNote', label: 'What did the supplier say?', type: 'textarea', span: 2, rows: 2, placeholder: 'e.g. One car in the Tejgaon yard, can deliver in 2 days' },
    ];
    openForm({
      title: 'Emergency purchase', subtitle: 'From a local supplier, for a customer who cannot wait for the next BYD shipment',
      size: 'md', submitLabel: 'Start', submitIcon: 'search',
      intro: `<div class="callout callout-info pr-block">${NA.icon('info')}<div>Next: confirm the VIN and price with the supplier. The Managing Director approves, then Accounts pays 100% and you collect the car.</div></div>`,
      fields, values: { vendorId: cg && cg.id, date: NA.today(), orderId: ord ? ord.id : '', modelId, color },
      onMount: (el) => {
        const mSel = el.querySelector('[name="modelId"]');
        const cSel = el.querySelector('[name="color"]');
        const oSel = el.querySelector('[name="orderId"]');
        const fillColors = (sel) => { cSel.innerHTML = modelColors(mSel.value).map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join(''); };
        mSel.addEventListener('change', () => fillColors());
        oSel.addEventListener('change', () => {
          const o = NA.get('orders', oSel.value); if (!o) return;
          mSel.value = o.modelId; fillColors(o.color);
        });
      },
      onSubmit: (v, el) => {
        const m = NA.model(v.modelId);
        const o = v.orderId ? NA.get('orders', v.orderId) : null;
        if (o && openUrgentFor(o.id)) return markInvalid(el, 'orderId', `${o.code} already has an emergency purchase`);
        if (v.date > NA.today()) return markInvalid(el, 'date', 'The date is in the future');
        const who = stamp();
        const po = NA.insert('purchaseOrders', {
          code: NA.nextCode('PO'), type: 'emergency', vendorId: v.vendorId, date: v.date || NA.today(), stage: 'check', currency: 'BDT', lots: [],
          units: [{ id: NA.uid(), modelId: v.modelId, color: v.color, unitCost: Number(m && m.cost) || 0, vin: null, vehicleId: null, releasePaidAt: null, receivedAt: null }],
          orderId: o ? o.id : null, modelCost: Number(m && m.cost) || 0, availabilityNote: v.availabilityNote || '', forOrderNote: o ? 'For ' + o.code : '', history: [],
          createdBy: who.by, createdById: who.byId, approval: null,
        });
        NA.log(`${po.code}: emergency purchase started with ${NA.vendorName(po.vendorId)} — ${NA.modelName(v.modelId)} ${v.color || ''}${o ? ' for ' + o.code : ''}`, { rec: po, link: '#/procurement/' + po.id, kind: 'warn' });
        if (o && canWrite('orders')) NA.log(`Emergency purchase ${po.code} started for this order`, { rec: o, link: '#/procurement/' + po.id, kind: 'info' });
        if (o) copyToOrder(o.id);   // the consultant follows it on the order
        ui.toast(`${po.code} started — confirm the VIN and price next`);
        NA.go('#/procurement/' + po.id);
        NA.refresh();
      },
    });
  };

  /** Check a car that came on a purchase order. Every entry point (Vehicles, Today, this page) comes here, so the
      order's car is marked received at once. People who cannot change orders get the plain check; the order then
      catches up when Purchasing opens it. opts are passed on to the check (arrival, title). */
  NA.actions.receiveUnit = function (vehicleId, opts) {
    const v = NA.vehicle(vehicleId);
    if (!v) { ui.toast('This car is not in the list', 'error'); return null; }
    if (typeof NA.actions.recordPDI !== 'function') { ui.toast('The arrival check is not available', 'error'); return null; }
    const plain = Object.assign({}, opts, { direct: true });   // direct: recordPDI does not send it back here
    const po = v.poId ? NA.get('purchaseOrders', v.poId) : null;
    const u = po && (po.units || []).find((x) => x.vehicleId === vehicleId || (v.unitId && x.id === v.unitId));
    if (!u || u.receivedAt || po.stage === 'cancelled' || !canWrite('purchaseOrders')) return NA.actions.recordPDI(vehicleId, plain);
    // A car still on the way is checked on arrival (date and place); one already here keeps its arrival date.
    return NA.actions.recordPDI(vehicleId, Object.assign(plain, { onSaved: (veh, res) => markReceived(po.id, u.id, res, veh) }));
  };
  function markReceived(poId, unitId, res, veh) {
    const po = NA.get('purchaseOrders', poId);
    const u = po && (po.units || []).find((x) => x.id === unitId);
    if (!u) return;
    const who = stamp();
    const v = veh || (u.vehicleId ? NA.vehicle(u.vehicleId) : null);
    const at = (v && v.location) || res.location || u.location || '';
    if (v && !u.vehicleId) Object.assign(u, { vehicleId: v.id, vin: u.vin || v.vin });
    Object.assign(u, { receivedAt: (v && v.arrivedAt) || res.arrivalDate || NA.today(), location: at, receivedBy: who.by, receivedById: who.byId });
    lotsFollow(po);
    NA.log(`${po.code}: VIN ${u.vin || ''} arrived at ${at || '—'} — ${res.status === 'hold' ? 'on hold: ' + res.holdReason : 'passed the check'}`, { rec: po, link: '#/procurement/' + po.id, kind: res.status === 'hold' ? 'warn' : 'success' });
    if (savePO(po) === 'closed') {
      const held = (po.units || []).filter((x) => unitStatus(po, x) === 'hold').length;
      ui.toast(held ? `All cars are in — ${plural(held, 'car')} on hold until fixed` : 'All cars on this order are in stock', held ? 'info' : 'success');
    }
  }

  /* -------------------------------------------- standard order: the steps */
  /** Accounts pays the advance: only on an approved order, never more than what is due, a reference used once. */
  function payAdvance(po) {
    po = freshPO(po);
    const why = payBlock(po);
    if (why) return ui.toast(why, 'info');
    const due = advLeft(po);
    if (due < 1) return ui.toast('The advance is already paid', 'info');
    openForm({
      title: `Pay the ${advTxt(po)} advance`, subtitle: esc(`${po.code} · ${NA.vendorName(po.vendorId)} · order value ${F.money(B.poTotal(po))}`),
      submitLabel: 'Record payment', submitIcon: 'wallet',
      fields: [
        { name: 'amount', label: 'Amount paid', type: 'money', required: true, help: `Due now: ${F.money(due)}. It cannot be more than that.` },
        { name: 'date', label: 'Paid on', type: 'date', required: true, max: NA.today() },
        { name: 'method', label: 'Paid by', type: 'select', options: VP_METHODS, placeholder: false },
        { name: 'ref', label: 'Bank transfer / LC ref.', required: true, placeholder: 'e.g. LC-AD-9420' },
      ],
      values: { amount: due, date: NA.today(), method: VP_METHODS[0] },
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const stop = payBlock(cur);   // cancelled meanwhile, or the approval changed
        if (stop) { ui.toast(stop, 'error'); NA.refresh(); return; }
        const left = advLeft(cur);
        if (!(v.amount > 0)) return markInvalid(el, 'amount', 'Enter the amount paid');
        if (v.amount > left + 1) return markInvalid(el, 'amount', `That is more than the ${F.money(left)} still due`);
        const dp = dateProblem(cur, v.date); if (dp) return markInvalid(el, 'date', dp);
        const dup = refTaken(cur.vendorId, v.ref); if (dup) return markInvalid(el, 'ref', takenText(dup));
        const p = recordVendorPayment(cur, { amount: v.amount, kind: 'Advance ' + advTxt(cur), date: v.date, method: v.method, ref: v.ref });
        NA.log(`${cur.code}: ${advDone(cur) ? 'advance' : 'part of the advance'} paid to ${NA.vendorName(cur.vendorId)} (ref ${p.ref})`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'money' });
        savePO(cur);
        ui.toast(advDone(cur) ? 'Advance paid — Purchasing records the shipment batch next' : 'Part of the advance recorded');
        NA.refresh();
      },
    });
  }

  /** Batch numbers are unique across all orders. */
  function batchTaken(lotNo, po, lot) {
    const n = String(lotNo || '').toUpperCase();
    return NA.db.purchaseOrders.find((p) => (p.lots || []).some((l) => String(l.lotNo || '').toUpperCase() === n && !(p.id === po.id && lot && l.lotNo === lot.lotNo))) || null;
  }
  function nextBatchNo(po) {
    const d = new Date();
    const base = 'LOT-' + String(d.getFullYear()).slice(2) + '-' + String(d.getMonth() + 1).padStart(2, '0');
    for (let i = 0; i < 26; i++) { const c = base + String.fromCharCode(65 + i); if (!batchTaken(c, po, null)) return c; }
    return base + '-' + Date.now().toString(36).slice(-3).toUpperCase();
  }
  /** Copy a batch's arrival date onto its cars that are on the way (sales can see cars, not orders). Writes only the cars that differ. */
  function etaToCars(po, lotNo, eta) {
    if (!lotNo || !canWrite('vehicles')) return;
    NA.where('vehicles', (x) => x.poId === po.id && x.lotNo === lotNo && x.status === 'in_transit' && (x.eta || '') !== (eta || ''))
      .forEach((x) => NA.update('vehicles', x.id, { eta: eta || '' }));
  }

  /** Purchasing records the shipment batch (lot) BYD allocated: number, expected arrival, which cars. */
  function lotModal(po, lot) {
    po = freshPO(po);
    if (!can.manage()) return ui.toast('Purchasing records shipment batches', 'info');
    if (computeStage(po) === 'cancelled') return ui.toast('This order is cancelled', 'info');
    if (!lot && !isApproved(po)) return ui.toast('The Managing Director approves the order first', 'info');
    if (!lot && !advDone(po)) return ui.toast(`BYD allocates a batch after the ${advTxt(po)} advance — Accounts pays it`, 'info');
    const editing = !!lot;
    const units = po.units || [];
    const fixed = (u) => unitHasVin(po, u) || unitPaid(po, u);   // paid or VIN in: its batch no longer changes
    const pickable = units.filter((u) => !fixed(u) && (!u.lotNo || (lot && u.lotNo === lot.lotNo)));
    const locked = lot ? units.filter((u) => fixed(u) && u.lotNo === lot.lotNo) : [];
    const extra = `<div class="form-section">Which cars are in this batch?</div>
      ${pickable.length || locked.length ? `<div class="span-all"><div class="pr-pick-head"><span class="help">Tick the cars BYD put in this batch.</span>${pickable.length > 1 ? '<button type="button" class="btn btn-plain btn-sm" data-pick-all>Tick all</button>' : ''}</div>
      <div class="pr-pick">${locked.map((u) => `<label class="pr-locked">${NA.icon('lock', 14)}<span class="grow">${carLabel(u)}<small>${unitHasVin(po, u) ? 'VIN received' : 'Final payment made'}</small></span></label>`).join('')}
      ${pickable.map((u) => `<label><input type="checkbox" class="box" data-unit="${esc(u.id)}" ${!lot || u.lotNo === lot.lotNo ? 'checked' : ''}/><span class="grow">${carLabel(u)}</span></label>`).join('')}</div></div>`
      : '<p class="help span-all">Every car on this order is already in a batch.</p>'}`;
    openForm({
      title: editing ? `Batch ${lot.lotNo}` : 'Add a shipment batch', subtitle: esc(`${po.code} · the batch (lot) BYD allocated`), size: 'lg',
      submitLabel: editing ? 'Save batch' : 'Add batch', submitIcon: 'boxes',
      fields: [
        { name: 'lotNo', label: 'Batch (lot) number from BYD', required: true, placeholder: 'e.g. LOT-25-11A' },
        { name: 'eta', label: 'Expected at our warehouse', type: 'date' },
        { name: 'shipment', label: 'Ship or shipment', placeholder: 'e.g. MV Ocean Pride', span: 2 },
      ],
      values: lot ? { lotNo: lot.lotNo, eta: lot.eta, shipment: lot.shipment } : { lotNo: nextBatchNo(po), eta: NA.addDays(NA.today(), 45) },
      extra,
      onMount: (el) => {
        const all = el.querySelector('[data-pick-all]');
        if (all) all.addEventListener('click', () => el.querySelectorAll('[data-unit]').forEach((c) => { c.checked = true; }));
      },
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const curLot = lot ? (cur.lots || []).find((l) => l.lotNo === lot.lotNo) : null;
        const lotNo = String(v.lotNo || '').trim().toUpperCase();
        const clash = batchTaken(lotNo, cur, curLot);
        if (clash) return markInvalid(el, 'lotNo', `Batch ${lotNo} is already on ${clash.code}`);
        const picked = [...el.querySelectorAll('[data-unit]')].filter((c) => c.checked).map((c) => c.dataset.unit);
        if (!picked.length && !locked.length) { ui.toast('Tick at least one car for this batch', 'error'); return false; }
        const oldNo = curLot ? curLot.lotNo : null;
        (cur.units || []).forEach((u) => {
          if (fixed(u)) { if (oldNo && u.lotNo === oldNo) u.lotNo = lotNo; return; }
          if (picked.includes(u.id)) u.lotNo = lotNo;
          else if (oldNo && u.lotNo === oldNo) u.lotNo = '';
        });
        const qty = (cur.units || []).filter((u) => u.lotNo === lotNo).length;
        const rec = { lotNo, qty, eta: v.eta || '', shipment: v.shipment || '' };
        cur.lots = cur.lots || [];
        const who = stamp();
        if (curLot) {
          if ((curLot.eta || '') !== rec.eta) curLot.etaHistory = [{ eta: rec.eta, was: curLot.eta || '', at: who.at, by: who.by }].concat(curLot.etaHistory || []).slice(0, 10);
          Object.assign(curLot, rec);
        } else cur.lots.push(Object.assign(rec, { status: LOTS[0], statusDates: { [LOTS[0]]: NA.today() }, by: who.by, byId: who.byId }));
        if (oldNo && oldNo !== lotNo) NA.where('vehicles', (x) => x.poId === cur.id && x.lotNo === oldNo).forEach((x) => NA.update('vehicles', x.id, { lotNo }));
        etaToCars(cur, lotNo, rec.eta);
        NA.log(`${cur.code}: batch ${lotNo} ${editing ? 'updated' : 'added'} — ${plural(qty, 'car')}${v.eta ? ', expected ' + F.date(v.eta) : ''}`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'info' });
        savePO(cur);
        ui.toast(editing ? 'Batch saved' : `Batch ${lotNo} added`);
        NA.refresh();
      },
    });
  }

  /** Move a batch one step forward (never back), with the date it happened. */
  function advanceLot(po, lotNo) {
    po = freshPO(po);
    if (!can.manage()) return;
    const lot = (po.lots || []).find((l) => l.lotNo === lotNo);
    if (!lot) return;
    const i = LOTS.indexOf(lot.status);
    if (i >= LOTS.length - 1) return ui.toast('This batch is already at our warehouse', 'info');
    const next = LOTS[i + 1];
    const askEta = next !== LOT_LAST;
    openForm({
      title: `Batch ${lot.lotNo}: ${lotText(next).toLowerCase()}`, subtitle: esc(po.code), size: 'sm', submitLabel: 'Save',
      fields: [{ name: 'date', label: 'When', type: 'date', required: true, max: NA.today() }].concat(askEta ? [{ name: 'eta', label: 'Expected at our warehouse', type: 'date' }] : []),
      values: { date: NA.today(), eta: lot.eta || '' },
      onSubmit: (v, el) => {
        if (v.date > NA.today()) return markInvalid(el, 'date', 'The date is in the future');
        const cur = freshPO(po);
        const l = (cur.lots || []).find((x) => x.lotNo === lotNo);
        if (!l) return;
        const who = stamp();
        l.status = next;
        l.statusDates = Object.assign({}, l.statusDates, { [next]: v.date });
        if (askEta && (v.eta || '') !== (l.eta || '')) {
          l.etaHistory = [{ eta: v.eta || '', was: l.eta || '', at: who.at, by: who.by }].concat(l.etaHistory || []).slice(0, 10);
          l.eta = v.eta || '';
          etaToCars(cur, l.lotNo, l.eta);
        }
        NA.log(`${cur.code}: batch ${l.lotNo} — ${lotText(next).toLowerCase()} (${F.date(v.date)})`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'info' });
        savePO(cur);
        const waiting = (cur.units || []).filter((u) => u.lotNo === l.lotNo && unitHasVin(cur, u) && !unitReceived(cur, u)).length;
        ui.toast(next === LOT_LAST && waiting ? `Batch at the warehouse — check ${plural(waiting, 'car')} now` : `Batch ${l.lotNo}: ${lotText(next).toLowerCase()}`, 'info');
        NA.refresh();
      },
    });
  }

  /** Accounts pays the final share for one or more cars in a batch. Each car's amount is fixed by the order. */
  function payRelease(po, unitIds) {
    po = freshPO(po);
    const why = payBlock(po) || (!advDone(po) ? `Pay the ${advTxt(po)} advance first` : '');
    if (why) return ui.toast(why, 'info');
    const cand = (po.units || []).filter((u) => u.lotNo && !unitPaid(po, u));
    if (!cand.length) return ui.toast('No car is waiting for its final payment', 'info');
    const want = unitIds && unitIds.length ? unitIds : null;
    const firstLot = (cand.find((u) => want && want.includes(u.id)) || cand[0]).lotNo;
    const pre = (u) => (want ? want.includes(u.id) : u.lotNo === firstLot);
    openForm({
      title: `Final ${relTxt(po)} payment`, subtitle: esc(`${po.code} · ${NA.vendorName(po.vendorId)}`), size: 'lg', submitLabel: 'Record payment', submitIcon: 'wallet',
      intro: `<p class="muted pr-tight">Tick the cars this payment covers. BYD then sends their VINs, and Purchasing enters them.</p>
        <div class="pr-pick-head"><span class="help">${plural(cand.length, 'car')} waiting</span>${cand.length > 1 ? '<button type="button" class="btn btn-plain btn-sm" data-all>Tick all</button>' : ''}</div>
        <div class="pr-pick">${cand.map((u) => `<label><input type="checkbox" class="box" data-unit="${esc(u.id)}" ${pre(u) ? 'checked' : ''}/><span class="grow">${carLabel(u)}<small>Batch ${esc(u.lotNo)} · ${esc(F.money(relDue(po, u)))}</small></span></label>`).join('')}</div>
        <div class="pr-total pr-block" data-sum></div>`,
      fields: [
        { name: 'date', label: 'Paid on', type: 'date', required: true, max: NA.today() },
        { name: 'method', label: 'Paid by', type: 'select', options: VP_METHODS, placeholder: false },
        { name: 'ref', label: 'Bank transfer / LC ref.', required: true, span: 2, placeholder: 'e.g. TT-55102' },
      ],
      values: { date: NA.today(), method: VP_METHODS[0] },
      onMount: (el) => {
        const draw = () => {
          const ids = [...el.querySelectorAll('[data-unit]')].filter((c) => c.checked).map((c) => c.dataset.unit);
          const box = el.querySelector('[data-sum]');
          if (box) box.innerHTML = `<div><small>Cars</small><b>${ids.length}</b></div><div><small>Total to pay</small><b>${F.money(sum(cand.filter((u) => ids.includes(u.id)), (u) => relDue(po, u)))}</b></div>`;
        };
        el.addEventListener('change', (e) => { if (e.target && e.target.dataset && e.target.dataset.unit) draw(); });
        const all = el.querySelector('[data-all]');
        if (all) all.addEventListener('click', () => { el.querySelectorAll('[data-unit]').forEach((c) => { c.checked = true; }); draw(); });
        draw();
      },
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const stop = payBlock(cur);
        if (stop) { ui.toast(stop, 'error'); NA.refresh(); return; }
        const ids = [...el.querySelectorAll('[data-unit]')].filter((c) => c.checked).map((c) => c.dataset.unit);
        const units = (cur.units || []).filter((u) => ids.includes(u.id));
        if (!units.length) { ui.toast('Tick at least one car', 'error'); return false; }
        const done = units.filter((u) => unitPaid(cur, u));
        if (done.length) { ui.toast(`${plural(done.length, 'car')} ${done.length === 1 ? 'was' : 'were'} paid meanwhile — open the order again`, 'error'); return false; }
        const dp = dateProblem(cur, v.date); if (dp) return markInvalid(el, 'date', dp);
        const dup = refTaken(cur.vendorId, v.ref); if (dup) return markInvalid(el, 'ref', takenText(dup));
        const batch = units.length > 1 ? NA.uid() : null;
        units.forEach((u) => {
          const p = recordVendorPayment(cur, { amount: relDue(cur, u), kind: 'Release ' + relTxt(cur), date: v.date, method: v.method, ref: v.ref, unitId: u.id, vin: u.vin || '', lotNo: u.lotNo || '', batch });
          Object.assign(u, { releasePaidAt: v.date, releaseRef: v.ref, releasePaymentId: p.id });
        });
        NA.log(`${cur.code}: final ${relTxt(cur)} paid for ${plural(units.length, 'car')} (ref ${v.ref})`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'money' });
        savePO(cur);
        ui.toast(`Paid for ${plural(units.length, 'car')} — Purchasing enters the VINs when BYD sends them`);
        NA.refresh();
      },
    });
  }

  /** Purchasing types (or scans) the VINs BYD sent for cars whose final payment is made. Each becomes a car on the way. */
  function enterVins(po, unitIds) {
    po = freshPO(po);
    if (!can.receive()) return ui.toast('Purchasing enters the VINs', 'info');
    if (computeStage(po) === 'cancelled') return ui.toast('This order is cancelled', 'info');
    const cand = (po.units || []).filter((u) => unitPaid(po, u) && !unitHasVin(po, u));
    if (!cand.length) return ui.toast('A car gets its VIN after its final payment', 'info');
    if (S().ensureCss) S().ensureCss();
    const first = unitIds && unitIds.length ? cand.filter((u) => unitIds.includes(u.id)) : [];
    const list = first.concat(cand.filter((u) => !first.includes(u)));
    const rows = list.map((u, i) => `<div class="pr-vin-row"><div>${carLabel(u)} <span class="muted small">· batch ${esc(u.lotNo || '—')}</span></div>
        <div class="form-grid">${ui.field({ name: 'vin_' + i, label: 'VIN', placeholder: '17 letters and numbers', help: 'Leave it empty if it has not come yet' })}
          ${ui.field({ name: 'motor_' + i, label: 'Motor no.', placeholder: 'Optional' })}</div></div>`).join('');
    openForm({
      title: 'Enter VINs from BYD', subtitle: esc(`${po.code} · ${plural(cand.length, 'car')} paid and waiting for the VIN`), size: 'lg', submitLabel: 'Save VINs', submitIcon: 'key',
      intro: '<p class="muted pr-block">Type or scan each VIN as BYD sends it. The car then shows as on the way, with its batch’s arrival date.</p>',
      extra: `<div class="pr-vin-rows">${rows}</div><div class="form-grid mt-16">${ui.field({ name: 'year', label: 'Model year', type: 'number', min: 2020, max: 2100 }, new Date().getFullYear())}</div>`,
      onMount: (el) => list.forEach((u, i) => {
        const others = () => new Set(list.map((x, j) => (j === i ? '' : cleanVin((el.querySelector(`[name="vin_${j}"]`) || {}).value))).filter(Boolean));
        wireVin(el.querySelector(`[name="vin_${i}"]`), () => ({ exceptUnitId: u.id, taken: others() }));
      }),
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const filled = list.map((u, i) => ({ u, i, vin: cleanVin(v['vin_' + i]), motor: v['motor_' + i] || '' })).filter((x) => x.vin);
        if (!filled.length) return markInvalid(el, 'vin_0', 'Enter at least one VIN');
        const seen = new Set();
        for (const x of filled) {
          const p = vinProblem(x.vin, { exceptUnitId: x.u.id, taken: seen });
          if (p) return markInvalid(el, 'vin_' + x.i, p);
          seen.add(x.vin);
        }
        const year = Number(v.year) || new Date().getFullYear();
        const who = stamp();
        let n = 0;
        filled.forEach((x) => {
          const u = (cur.units || []).find((y) => y.id === x.u.id);
          if (!u || unitHasVin(cur, u)) return;
          const lot = (cur.lots || []).find((l) => l.lotNo === u.lotNo);
          const veh = NA.insert('vehicles', {
            vin: x.vin, motorNo: x.motor, modelId: u.modelId, color: u.color, year, status: 'in_transit', location: 'In transit',
            cost: Number(u.unitCost) || 0, poId: cur.id, unitId: u.id, lotNo: u.lotNo || '', eta: (lot && lot.eta) || '', arrivedAt: null, pdi: null, km: 0, history: [],
            addedBy: who.by, addedById: who.byId,
          });
          NA.log(`VIN ${x.vin} from ${NA.vendorName(cur.vendorId)} on ${cur.code} — on the way`, { rec: veh, link: '#/inventory/' + veh.id, kind: 'info' });
          Object.assign(u, { vin: x.vin, vehicleId: veh.id, motorNo: x.motor, year, vinBy: who.by, vinById: who.byId, vinAt: who.at });
          n++;
        });
        NA.log(`${cur.code}: ${plural(n, 'VIN')} entered`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'info' });
        savePO(cur);
        ui.toast(`${plural(n, 'VIN')} saved — the ${n === 1 ? 'car shows' : 'cars show'} as on the way`);
        NA.refresh();
      },
    });
  }

  /** Cancel with a reason, only while nothing is paid and no VIN came in. The order is kept for the record. */
  function cancelPO(po) {
    po = freshPO(po);
    if (!can.manage()) return;
    if (payments(po).length || (po.units || []).some((u) => unitHasVin(po, u))) return ui.toast('Money was paid or a VIN came in — this order can no longer be cancelled here', 'info');
    openForm({
      title: isEm(po) ? 'Cancel this emergency purchase' : 'Cancel this purchase order', subtitle: esc(po.code), size: 'sm', submitLabel: 'Cancel order', danger: true,
      intro: '<p class="muted pr-block">It stays on record, marked cancelled.</p>',
      fields: [{ name: 'reason', label: 'Why?', type: 'textarea', rows: 2, required: true, placeholder: isEm(po) ? 'e.g. The supplier sold the car to someone else' : 'e.g. BYD sent a new quote' }],
      onSubmit: (v) => {
        const cur = freshPO(po);
        // Checked again: Accounts may have paid, or a VIN may have come in, while this sheet was open.
        if (computeStage(cur) === 'cancelled') { ui.toast(`${cur.code} is already cancelled`, 'info'); NA.refresh(); return; }
        if (payments(cur).length || (cur.units || []).some((u) => unitHasVin(cur, u))) { ui.toast('Money was paid or a VIN came in meanwhile — this order can no longer be cancelled here', 'error'); NA.refresh(); return; }
        const pend = A ? A.find('purchaseOrders', cur.id, approvalKind(cur)) : null;
        if (pend && pend.status === 'pending') A.withdraw(pend);
        NA.update('purchaseOrders', cur.id, { stage: 'cancelled', cancelledAt: NA.today(), cancelled: Object.assign({ reason: v.reason }, stamp()) });
        NA.log(`${cur.code} cancelled — ${v.reason}`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'warn' });
        if (isEm(cur) && cur.orderId) copyToOrder(cur.orderId);
        ui.toast(cur.code + ' cancelled', 'info');
        NA.refresh();
      },
    });
  }

  /** The Managing Director voids a wrong supplier payment with a reason. It stays on record and counts nowhere. */
  function voidPayment(p) {
    if (!can.voidPay()) return ui.toast('Only the Managing Director can void a supplier payment', 'info');
    if (!vpLive(p)) return;
    const po = NA.get('purchaseOrders', p.poId);
    const withCar = !!po && (po.units || []).some((u) => (p.unitId ? u.id === p.unitId : u.releasePaymentId === p.id) && unitHasVin(po, u));
    openForm({
      title: 'Void this payment', subtitle: esc(`${kindText(p)} · ${F.money(p.amount)} · ${p.ref || 'no reference'}`), size: 'sm', submitLabel: 'Void payment', danger: true,
      intro: `<p class="muted pr-block">The payment stays on record but no longer counts. ${withCar ? 'The car keeps its VIN; its final payment shows as due again.' : 'The amount shows as due again.'}</p>`,
      fields: [{ name: 'reason', label: 'Why?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Entered twice by mistake' }],
      onSubmit: (v) => {
        NA.update('vendorPayments', p.id, { status: 'void', void: Object.assign({ reason: v.reason }, stamp()) });
        const cur = po && NA.get('purchaseOrders', po.id);
        if (cur) {
          (cur.units || []).forEach((u) => {
            if ((p.unitId && u.id === p.unitId) || u.releasePaymentId === p.id) { if (!unitPaid(cur, u)) Object.assign(u, { releasePaidAt: null, releaseRef: '', releasePaymentId: null }); }
          });
          NA.log(`${cur.code}: ${kindText(p).toLowerCase()} (ref ${p.ref || '—'}) voided — ${v.reason}`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'warn' });
          savePO(cur);
        }
        ui.toast('Payment voided', 'info');
        NA.refresh();
      },
    });
  }

  /** Printout. Until approved it says DRAFT — not approved; a cancelled order says CANCELLED. */
  function printPO(po) {
    const lines = groupUnits(po.units);
    const total = B.poTotal(po);
    const pays = payments(po).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const k = computeStage(po);
    const ok = isApproved(po);
    const by = approvedBy(po);
    const mark = k === 'cancelled' ? 'CANCELLED' : !ok ? 'DRAFT — not approved' : '';
    const html = `${mark ? `<p style="border:2px solid #d0021b;color:#d0021b;font-weight:700;font-size:18px;text-align:center;padding:10px;margin:0 0 20px">${esc(mark)}</p>` : ''}
      <h1>${isEm(po) ? 'Emergency purchase order' : 'Purchase order'} ${esc(po.code)}</h1>
      <p class="muted">Date ${esc(F.date(po.date))}${po.proformaRef ? ' · Supplier quote ' + esc(po.proformaRef) : ''}${po.vendorBillNo ? ' · Supplier bill ' + esc(po.vendorBillNo) : ''}</p>
      <p><b>Supplier:</b> ${esc(NA.vendorName(po.vendorId))}</p>
      <table><thead><tr><th>Model</th><th>Colour</th><th class="r">Cars</th><th class="r">Price per car</th><th class="r">Amount</th></tr></thead><tbody>
      ${lines.map((l) => `<tr><td>${esc(NA.modelName(l.modelId))}</td><td>${esc(l.color || '')}</td><td class="r">${l.qty}</td><td class="r">${esc(F.money(l.unitCost))}</td><td class="r">${esc(F.money(l.total))}</td></tr>`).join('')}
      <tr><th colspan="4" class="r">Total</th><th class="r">${esc(F.money(total))}</th></tr></tbody></table>
      ${isEm(po) ? '<p>Payment terms: 100% when the VIN is confirmed.</p>' : `<p>Payment terms: ${esc(advTxt(po))} advance (${esc(F.money(advRequired(po)))}), then ${esc(relTxt(po))} per car before it ships.</p>`}
      ${pays.length ? `<h3>Payments</h3><table><thead><tr><th>Date</th><th>What</th><th>Reference</th><th>VIN</th><th class="r">Amount</th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td>${esc(F.date(p.date))}</td><td>${esc(kindText(p))}</td><td>${esc(p.ref || '')}</td><td>${esc(p.vin || '')}</td><td class="r">${esc(F.money(p.amount))}</td></tr>`).join('')}
      <tr><th colspan="4" class="r">Still to pay</th><th class="r">${esc(F.money(outstanding(po)))}</th></tr></tbody></table>` : ''}
      <p>${k === 'cancelled' ? `Cancelled${po.cancelled ? ' by ' + esc(po.cancelled.by) + ' on ' + esc(F.date(po.cancelled.at)) + ' — ' + esc(po.cancelled.reason) : ''}.`
        : ok ? (by ? `Approved by ${esc(by.by)} on ${esc(F.date(by.at))}.` : notNeeded(po) || (!isEm(po) && NA.policy().poApproval === false) ? 'No approval needed under the rules.' : 'Approved.') : 'Not approved yet — this is not a valid order.'}</p>
      <div class="sig"><div>Prepared by (Purchasing)${po.createdBy ? '<br>' + esc(po.createdBy) : ''}</div><div>Approved by (Managing Director)${by && by.by ? '<br>' + esc(by.by) : ''}</div></div>`;
    ui.print(po.code, html);
  }

  /* --------------------------------------------- emergency purchase steps */
  /** Purchasing types the VIN and the price agreed with the supplier; the Managing Director then approves the purchase.
      A changed VIN or price needs a new approval. */
  function emConfirm(po) {
    po = freshPO(po);
    const u = (po.units || [])[0];
    if (!u) return;
    if (!can.manage()) return ui.toast('Purchasing confirms the VIN with the supplier', 'info');
    if (computeStage(po) === 'cancelled') return ui.toast('This purchase is cancelled', 'info');
    if (payments(po).length || unitHasVin(po, u)) return ui.toast('The VIN and price cannot change after a payment', 'info');
    if (S().ensureCss) S().ensureCss();
    const o = po.orderId ? NA.get('orders', po.orderId) : null;
    const base = baseCost(po, u);
    const asks = !!A && A.needed('emergency', 1);
    openForm({
      title: 'VIN and price from the supplier', subtitle: esc(`${po.code} · ${NA.modelName(u.modelId)} · ${u.color || ''}`), submitLabel: asks ? 'Save and ask for approval' : 'Save', submitIcon: 'key',
      fields: [
        { name: 'vin', label: 'VIN', required: true, span: 2, placeholder: '17 letters and numbers', help: 'Exactly 17 characters — never I, O or Q' },
        { name: 'motorNo', label: 'Motor no.', placeholder: 'Optional' },
        { name: 'year', label: 'Model year', type: 'number', min: 2020, max: 2100 },
        { name: 'unitCost', label: 'Agreed price (paid 100%)', type: 'money', required: true, help: base && seeMoney() ? 'Our BYD cost for this model: ' + F.money(base) : '' },
        { name: 'eta', label: 'Ready to collect on', type: 'date', help: 'If the supplier said. Sales sees it on the order.' },
        { name: 'reason', label: 'Why buy it now? (for the Managing Director)', type: 'textarea', rows: 2, span: 2, placeholder: 'e.g. Customer paid in full and needs the car for a wedding on Friday' },
      ],
      values: { vin: u.vin || '', motorNo: u.motorNo || '', year: u.year || new Date().getFullYear(), unitCost: u.unitCost, eta: po.eta || '', reason: (o && o.emergencyRequest && o.emergencyRequest.note) || '' },
      onMount: (el) => wireVin(el.querySelector('[name="vin"]'), { exceptUnitId: u.id }),
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const cu = (cur.units || [])[0];
        // Checked again: the supplier may have been paid, or the purchase cancelled, while this sheet was open.
        if (computeStage(cur) === 'cancelled') { ui.toast('This purchase is cancelled', 'info'); NA.refresh(); return; }
        if (payments(cur).length || unitHasVin(cur, cu)) { ui.toast('The supplier was paid meanwhile — the VIN and price can no longer change', 'error'); NA.refresh(); return; }
        const vin = cleanVin(v.vin);
        const p = vinProblem(vin, { exceptUnitId: cu.id });
        if (p) return markInvalid(el, 'vin', p);
        if (!(v.unitCost > 0)) return markInvalid(el, 'unitCost', 'Enter the agreed price');
        if (v.eta && cur.date && v.eta < cur.date) return markInvalid(el, 'eta', `The date is before the purchase started (${F.date(cur.date)})`);
        const changed = cleanVin(cu.vin) !== vin || Number(cu.unitCost) !== Number(v.unitCost);
        Object.assign(cu, { vin, motorNo: v.motorNo || '', year: Number(v.year) || new Date().getFullYear(), unitCost: Number(v.unitCost) });
        NA.log(`${cur.code}: VIN ${vin} and price confirmed by ${NA.vendorName(cur.vendorId)}`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'info' });
        savePO(cur, { eta: v.eta || '' });
        const ap = approvalOf(cur);
        const a = changed || ap === 'none' || ap === 'rejected' ? askApproval(cur, v.reason) : null;
        ui.toast(!a ? 'Saved' : a.status === 'approved' ? 'Approved — Accounts can pay the supplier' : 'Sent to the Managing Director for approval', a && a.status !== 'approved' ? 'info' : 'success');
        NA.refresh();
      },
    });
  }

  /** Accounts pays the supplier 100% once the Managing Director approved the purchase. Bill no. and reference are used once. */
  function emPay(po) {
    po = freshPO(po);
    const u = (po.units || [])[0];
    const why = payBlock(po) || (!u || !u.vin ? 'Purchasing confirms the VIN first' : '');
    if (why) return ui.toast(why, 'info');
    const total = B.poTotal(po);
    const due = Math.max(0, total - paidOn(po));
    if (due < 1) return ui.toast('Already paid in full', 'info');
    openForm({
      title: 'Pay the supplier', subtitle: esc(`${po.code} · ${NA.vendorName(po.vendorId)} · VIN ${u.vin}`), submitLabel: 'Record payment', submitIcon: 'wallet',
      intro: `<p class="muted pr-block">The supplier hands the car over after full payment. Agreed price: ${esc(F.money(total))}.</p>`,
      fields: [
        { name: 'vendorBillNo', label: 'Supplier bill no.', required: true, placeholder: 'e.g. CGR-INV-2025-118' },
        { name: 'amount', label: 'Amount paid', type: 'money', required: true, help: 'Due now: ' + F.money(due) },
        { name: 'date', label: 'Paid on', type: 'date', required: true, max: NA.today() },
        { name: 'method', label: 'Paid by', type: 'select', options: VP_METHODS, placeholder: false },
        { name: 'ref', label: 'Bank transfer or cheque ref.', required: true, span: 2, placeholder: 'e.g. RTGS-CITY-88120' },
      ],
      values: { vendorBillNo: po.vendorBillNo || '', amount: due, date: NA.today(), method: 'RTGS' },
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const cu = (cur.units || [])[0];
        const stop = payBlock(cur);
        if (stop) { ui.toast(stop, 'error'); NA.refresh(); return; }
        const left = Math.max(0, B.poTotal(cur) - paidOn(cur));
        if (!(v.amount > 0)) return markInvalid(el, 'amount', 'Enter the amount paid');
        if (v.amount > left + 1) return markInvalid(el, 'amount', `That is more than the ${F.money(left)} still due`);
        const dp = dateProblem(cur, v.date); if (dp) return markInvalid(el, 'date', dp);
        const dup = refTaken(cur.vendorId, v.ref); if (dup) return markInvalid(el, 'ref', takenText(dup));
        const bill = refTaken(cur.vendorId, v.vendorBillNo, 'vendorBillNo');
        if (bill && bill.poId !== cur.id) return markInvalid(el, 'vendorBillNo', takenText(bill, 'This bill no.'));
        const p = recordVendorPayment(cur, { amount: v.amount, kind: 'Full 100%', date: v.date, method: v.method, ref: v.ref, vendorBillNo: v.vendorBillNo, vin: cu.vin, unitId: cu.id });
        cur.vendorBillNo = v.vendorBillNo;
        const inFull = fullPaid(cur) >= B.poTotal(cur) - 1;
        if (inFull) Object.assign(cu, { releasePaidAt: v.date, releaseRef: v.ref, releasePaymentId: p.id });
        NA.log(`${cur.code}: ${inFull ? 'paid in full' : 'part payment'} to ${NA.vendorName(cur.vendorId)} (bill ${v.vendorBillNo}, ref ${v.ref})`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'money' });
        savePO(cur, { vendorBillNo: v.vendorBillNo });
        const full = computeStage(cur) === 'paid';
        ui.toast(full ? 'Paid in full — Purchasing collects the car and checks it' : `Part payment recorded — ${F.money(Math.max(0, B.poTotal(cur) - paidOn(cur)))} still due`, full ? 'success' : 'info');
        NA.refresh();
      },
    });
  }

  /** The VIN turned out to be on another car already: show it and offer a way forward. */
  function vinClash(po, v) {
    const k = S().statusOf ? S().statusOf(v) : v.status;
    ui.modal({
      title: 'This VIN is already on another car', size: 'sm',
      body: `<p>${esc((po.units[0] || {}).vin || '')} is on a ${esc(NA.modelName(v.modelId))} (${esc(S().statusLabel ? S().statusLabel(k).toLowerCase() : k)}). Check the VIN on the papers, then correct it here or on that car.</p>`,
      actions: [{ label: 'Open that car', onClick: () => { NA.go('#/inventory/' + v.id); } }, { label: 'Correct the VIN', kind: 'primary', onClick: () => { setTimeout(() => fixUrgentVin(po), 200); } }],
    });
  }
  /** Correct a mistyped VIN on an emergency purchase before the car is collected (Purchasing, with a reason). */
  function fixUrgentVin(po) {
    po = freshPO(po);
    const u = (po.units || [])[0];
    if (!u || !can.manage() || unitHasVin(po, u)) return;
    if (S().ensureCss) S().ensureCss();
    openForm({
      title: 'Correct the VIN', subtitle: esc(`${po.code} · now ${u.vin || '—'}`), size: 'sm', submitLabel: 'Save',
      fields: [
        { name: 'vin', label: 'Right VIN', required: true, placeholder: '17 letters and numbers', help: 'Exactly 17 characters — never I, O or Q' },
        { name: 'reason', label: 'What was wrong?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Typed 8 instead of B' },
      ],
      onMount: (el) => wireVin(el.querySelector('[name="vin"]'), { exceptUnitId: u.id }),
      onSubmit: (v, el) => {
        const cur = freshPO(po);
        const cu = cur.units[0];
        if (unitHasVin(cur, cu)) { ui.toast('The car was collected meanwhile — correct the VIN on the car itself', 'error'); NA.refresh(); return; }
        const vin = cleanVin(v.vin);
        const p = vinProblem(vin, { exceptUnitId: cu.id }); if (p) return markInvalid(el, 'vin', p);
        const old = cu.vin;
        cu.vin = vin;
        NA.log(`${cur.code}: VIN corrected ${old || '—'} → ${vin} — ${v.reason}`, { rec: cur, link: '#/procurement/' + cur.id, kind: 'warn' });
        savePO(cur);
        ui.toast('VIN corrected');
        NA.refresh();
      },
    });
  }

  /** Purchasing collects the car: arrival check, then the car is in stock and kept for its customer order. */
  function emReceive(po) {
    po = freshPO(po);
    const u = (po.units || [])[0];
    if (!u) return;
    if (!can.receive()) return ui.toast('Purchasing collects the car and checks it', 'info');
    if (unitReceived(po, u)) return ui.toast('This car is already in', 'info');
    if (!(B.poTotal(po) > 0 && fullPaid(po) >= B.poTotal(po) - 1)) return ui.toast('Accounts pays the supplier in full before the car is collected', 'info');
    const clash = u.vin ? NA.vehicleByVin(u.vin) : null;
    if (clash) return vinClash(po, clash);
    if (typeof NA.actions.pdiModal !== 'function') return ui.toast('The arrival check is not available', 'error');
    NA.actions.pdiModal({
      title: 'Check on arrival', subtitle: `${NA.modelName(u.modelId)} · ${u.color || ''} · ${po.code}`, vin: u.vin, arrival: true,
      onSave: (res) => {
        const cur = freshPO(po);
        const cu = cur.units[0];
        if (NA.vehicleByVin(cu.vin)) { ui.toast('A car with this VIN was added meanwhile — open the purchase again', 'error'); NA.refresh(); return true; }
        const o = cur.orderId ? NA.get('orders', cur.orderId) : null;
        const keep = o && !o.vehicleId && !['delivered', 'cancelled'].includes(o.stage) ? o.id : null;
        const who = stamp();
        const hold = res.status === 'hold';
        const veh = NA.insert('vehicles', {
          vin: cu.vin, motorNo: cu.motorNo || '', modelId: cu.modelId, color: cu.color, year: cu.year || new Date().getFullYear(),
          status: hold ? 'hold' : 'available', holdReason: hold ? res.holdReason : '', hold: hold ? Object.assign({ from: 'inspection' }, who) : null,
          location: res.location, cost: Number(cu.unitCost) || 0, poId: cur.id, unitId: cu.id, lotNo: '', source: 'Emergency purchase (' + NA.vendorName(cur.vendorId) + ')',
          arrivedAt: res.arrivalDate, pdi: res.pdi, km: res.odometer || 0, history: [], reservedFor: keep, addedBy: who.by, addedById: who.byId,
        });
        NA.log(`VIN ${cu.vin} collected from ${NA.vendorName(cur.vendorId)} (${cur.code}) at ${res.location} — ${hold ? 'on hold: ' + res.holdReason : 'passed the check'}${keep ? ' · kept for ' + o.code : ''}`, { rec: veh, link: '#/inventory/' + veh.id, kind: hold ? 'warn' : 'success' });
        Object.assign(cu, { vehicleId: veh.id, receivedAt: res.arrivalDate, location: res.location, receivedBy: who.by, receivedById: who.byId });
        savePO(cur);
        ui.toast(hold ? 'Received — the car is on hold until it is fixed' : keep ? `Received — kept for ${o.code}` : 'Received — the car is in stock', hold ? 'info' : 'success');
        NA.refresh();
        // The Sales Manager or Accounts may give the VIN straight away when the customer has paid in full.
        if (keep && !hold && can.assign() && B.canAssignVin(o) && typeof NA.actions.assignVehicle === 'function') setTimeout(() => NA.actions.assignVehicle(veh.id, o.id), 250);
        return true;
      },
    });
  }

  /* Keep a copy of each decision on the order (runs in the approver's browser), so Accounts — who cannot see
     approvals — knows when it may pay. */
  if (A) ['po', 'emergency'].forEach((type) => A.onDecide(type, (a, decision) => {
    if (a.refC !== 'purchaseOrders') return;
    const po = NA.get('purchaseOrders', a.refId);
    if (!po || !canWrite('purchaseOrders')) return;
    if (decision === 'cancelled') {
      const latest = A.find('purchaseOrders', po.id, type);
      NA.update('purchaseOrders', po.id, { approval: latest ? { id: latest.id, status: latest.status, by: latest.decidedBy || null, at: latest.decidedAt || null, value: latest.value, note: latest.note || '' } : null });
    } else {
      NA.update('purchaseOrders', po.id, { approval: { id: a.id, status: decision, by: a.decidedBy || NA.me().name, byId: a.decidedById || NA.myStaffId(),
        at: a.decidedAt || new Date().toISOString(), value: a.value, note: a.note || '', askedBy: a.requestedBy || null, askedAt: a.createdAt || null } });
    }
    if (isEm(po) && po.orderId) copyToOrder(po.orderId);   // the consultant sees the decision on the order
  }));

  /* ================================================================ PAGES */
  const hubState = { q: '', kind: '' };
  const planQty = {};

  NA.page({
    path: 'procurement', title: 'Purchasing', icon: 'cart',
    render(root, params, query) {
      ensureCss();
      query = query || {};
      if (params && params[0]) {
        const po = NA.get('purchaseOrders', params[0]);
        if (!po) {
          root.innerHTML = ui.pageHead({ title: 'Purchase order', crumbs: [{ label: 'Purchasing', href: '#/procurement' }] })
            + (ui.notFound ? ui.notFound('purchase order', '#/procurement', 'All purchase orders') : `<div class="card pad">${ui.empty('This purchase order is not in the list.', 'cart')}</div>`);
          return null;
        }
        return isEm(po) ? renderEmergencyDetail(root, po) : renderPODetail(root, po);
      }
      return renderHub(root, query);
    },
  });

  /* ------------------------------------------------------------------ hub */
  /** Customer orders where sales asked for an emergency car and nobody started a purchase yet (oldest first). People
      who receive no purchase orders go by the copy Purchasing keeps on the order. */
  const urgentAsks = () => NA.where('orders', (o) => o.emergencyRequest && ['booking', 'payment', 'vin'].includes(o.stage) && !o.vehicleId && !openUrgentFor(o.id) && !copyUnderWay(o))
    .sort((a, b) => String(a.emergencyRequest.at || '').localeCompare(String(b.emergencyRequest.at || '')));

  /** The day the Managing Director approved an order (its order date when it was raised before approvals). */
  const approvedOn = (po) => { const b = approvedBy(po); return String((b && b.at) || po.date || '').slice(0, 10); };
  /** The day the advance was paid in full ('' while it is not). */
  function advPaidOn(po) {
    const need = advRequired(po);
    let s = 0;
    for (const p of payments(po).filter(isAdv).sort((a, b) => String(a.date).localeCompare(String(b.date)))) { s += Number(p.amount) || 0; if (s >= need - 1) return String(p.date || ''); }
    return '';
  }
  /** The day BYD put a car's batch on the order. */
  const lotOn = (po, lotNo) => { const l = (po.lots || []).find((x) => x.lotNo === lotNo); const d = (l && l.statusDates) || {}; return String(d[LOTS[0]] || Object.values(d).sort()[0] || ''); };
  /** Final payments due now, one row per car — the one rule Purchasing, Accounts and Today use: the order is approved
      and not cancelled, its advance is paid, the car is in a shipment batch and it has no live final payment (a voided
      one makes it due again). po: one order, or every order when left out. Oldest first.
      → [{poId, poCode, unitId, vin, modelId, color, lotNo, amount, since}] */
  function releasesDue(po) {
    const out = [];
    (po ? [po] : NA.db.purchaseOrders).forEach((p) => {
      if (!p || isEm(p) || computeStage(p) === 'cancelled' || !isApproved(p) || !advDone(p)) return;
      const from = [approvedOn(p), advPaidOn(p)];
      (p.units || []).filter((u) => u.lotNo && !unitPaid(p, u)).forEach((u) => {
        const v = unitVehicle(p, u);
        out.push({ poId: p.id, poCode: p.code, unitId: u.id, vin: u.vin || (v && v.vin) || '', modelId: u.modelId, color: u.color || '', lotNo: u.lotNo,
          amount: relDue(p, u), since: from.concat(lotOn(p, u.lotNo)).filter(Boolean).sort().pop() || String(p.date || '') });
      });
    });
    return out.sort((a, b) => String(a.since).localeCompare(String(b.since)));
  }
  /** Everything payable now on approved orders: [{po, what, amount, kind, cars?}], oldest order first. */
  function dueNow(po) {
    if (computeStage(po) === 'cancelled' || !isApproved(po)) return [];
    if (isEm(po)) {
      const u = (po.units || [])[0];
      const left = Math.max(0, B.poTotal(po) - paidOn(po));
      return u && u.vin && left >= 1 ? [{ what: 'Full payment (emergency purchase)', amount: left, kind: 'full' }] : [];
    }
    if (!advDone(po)) return advLeft(po) >= 1 ? [{ what: advTxt(po) + ' advance', amount: advLeft(po), kind: 'adv' }] : [];
    const cars = releasesDue(po);
    return cars.length ? [{ what: `Final ${relTxt(po)} for ${plural(cars.length, 'car')}`, amount: sum(cars, (c) => c.amount), kind: 'rel', cars }] : [];
  }
  const dueRows = () => NA.db.purchaseOrders.reduce((out, po) => out.concat(dueNow(po).map((d) => Object.assign({ po }, d))), [])
    .sort((a, b) => String(a.po.date).localeCompare(String(b.po.date)));
  /** An emergency purchase with its VIN and price, still without the Managing Director's approval. */
  const urgentNeedsOk = (p) => isEm(p) && computeStage(p) === 'confirmed' && !isApproved(p);
  const needsVin = (p) => !isEm(p) && computeStage(p) !== 'cancelled' && (p.units || []).some((u) => unitPaid(p, u) && !unitHasVin(p, u));
  const needsBatch = (p) => !isEm(p) && computeStage(p) !== 'cancelled' && isApproved(p) && advDone(p) && (p.units || []).some((u) => !u.lotNo && !unitHasVin(p, u));
  /** Waiting for a decision the current person can make (the Managing Director, for purchase orders). */
  const canDecideOn = (p) => { if (!A || approvalOf(p) !== 'pending') return false; const a = A.find('purchaseOrders', p.id, approvalKind(p)); return !!a && A.canDecide(a); };
  /** Never sent for approval, or declined: Purchasing asks (again) or cancels. */
  const needsAsk = (p) => ['none', 'rejected'].includes(approvalOf(p));

  /** What the current person should do here, in a few rows. Every number equals the list it opens.
      An approval row goes only to whoever decides it; Purchasing sees the orders it still has to send. */
  function hubTodo(all, asked) {
    const out = [];
    const live = all.filter((p) => computeStage(p) !== 'cancelled');
    const stdOpen = live.filter((p) => !isEm(p) && computeStage(p) !== 'closed');
    const emWait = live.filter(urgentNeedsOk);
    const stdDecide = stdOpen.filter(canDecideOn);
    if (stdDecide.length) out.push({ icon: 'stamp', bg: 'bg-amber', title: `${plural(stdDecide.length, 'order')} to approve`, sub: 'Open each one to approve or decline', href: '#/procurement?tab=pos&stage=decide' });
    const emDecide = emWait.filter(canDecideOn);
    if (emDecide.length) out.push({ icon: 'stamp', bg: 'bg-amber', title: `${plural(emDecide.length, 'emergency purchase')} to approve`, sub: 'Open each one to approve or decline', href: '#/procurement?tab=emergency&stage=decide' });
    if (can.pay()) {
      const due = dueRows();
      if (due.length) out.push({ icon: 'wallet', bg: 'bg-tint', title: `${MS(sum(due, (d) => d.amount))} to pay suppliers now`, sub: plural(due.length, 'payment') + ' due on approved orders', href: '#/procurement?tab=payments' });
    }
    if (can.manage()) {
      const stdAsk = stdOpen.filter(needsAsk);
      if (stdAsk.length) out.push({ icon: 'stamp', bg: 'bg-amber', title: `${plural(stdAsk.length, 'order')} to send for approval`, sub: 'Not sent yet, or declined — ask again or cancel', href: '#/procurement?tab=pos&stage=ask' });
      const emAsk = emWait.filter(needsAsk);
      if (emAsk.length) out.push({ icon: 'stamp', bg: 'bg-amber', title: `${plural(emAsk.length, 'emergency purchase')} to send for approval`, sub: 'Not sent yet, or declined — ask again or cancel', href: '#/procurement?tab=emergency&stage=ask' });
      const vinPOs = live.filter(needsVin);
      const nVin = sum(vinPOs, (p) => (p.units || []).filter((u) => unitPaid(p, u) && !unitHasVin(p, u)).length);
      if (nVin) out.push({ icon: 'key', bg: 'bg-tint', title: `${plural(nVin, 'car')} waiting for ${nVin === 1 ? 'its' : 'their'} VIN`, sub: 'Final payment made · ' + plural(vinPOs.length, 'order'), href: '#/procurement?tab=pos&stage=vin' });
      if (asked.length) out.push({ icon: 'bolt', bg: 'bg-amber', title: `${plural(asked.length, 'emergency car request')} from sales`, sub: 'Check with the supplier and start the purchase', href: '#/procurement?tab=emergency' });
      const batch = live.filter(needsBatch);
      if (batch.length) out.push({ icon: 'boxes', bg: 'bg-gray', title: `${plural(batch.length, 'order')} ${batch.length === 1 ? 'needs' : 'need'} a shipment batch`, sub: 'Advance paid — record the batch from BYD', href: '#/procurement?tab=pos&stage=batch' });
    }
    return out.slice(0, 4);
  }

  /** Cars coming for a model, counting only what is certain: cars on the way or waiting for their check, and cars
      without a VIN yet on approved orders (an emergency purchase once its VIN and price are confirmed). Orders that
      wait for approval, were declined or are still an enquiry do not hide a shortage. */
  function arrivingFor(modelId) {
    const st = (v) => (S().statusOf ? S().statusOf(v) : v.status);
    const cars = NA.where('vehicles', (v) => v.modelId === modelId && ['in_transit', 'pdi'].includes(st(v))).length;
    const onOrder = NA.db.purchaseOrders.filter((p) => !['closed', 'received', 'cancelled', 'check'].includes(computeStage(p)) && isApproved(p))
      .reduce((n, p) => n + (p.units || []).filter((u) => u.modelId === modelId && !unitHasVin(p, u)).length, 0);
    return cars + onOrder;
  }
  /** The plan: core's demand per model, with "arriving" (and so "suggested") counted by the rule above. */
  const planRows = () => B.demandByModel().map((r) => {
    const incoming = arrivingFor(r.model.id);
    return Object.assign({}, r, { incoming, suggested: Math.max(0, r.forecast - r.available - incoming) });
  });

  function renderHub(root, query) {
    const emKeys = EM_STEPS.map((s) => s.key);
    let tab = query.tab === 'demand' ? 'plan' : query.tab;
    let stage = query.stage || '';
    if (!tab) {
      if (stage === 'plan' || stage === 'demand') { tab = 'plan'; stage = ''; }
      else if (emKeys.includes(stage)) tab = 'emergency';
      else tab = 'pos';
    }
    if (!['plan', 'pos', 'emergency', 'payments'].includes(tab)) tab = 'pos';

    const all = NA.db.purchaseOrders;
    catchUp(all);
    const std = all.filter((p) => !isEm(p));
    const em = all.filter(isEm);
    const open = (p) => !['closed', 'received', 'cancelled'].includes(computeStage(p));
    const demand = planRows();
    const asked = urgentAsks();
    const tabs = [
      { key: 'plan', label: 'Plan', count: sum(demand, (r) => r.suggested) || null },
      { key: 'pos', label: 'Orders', count: std.filter(open).length || null },
      { key: 'emergency', label: 'Emergency', count: em.filter(open).length + asked.length || null },
      { key: 'payments', label: 'Payments', count: can.pay() ? dueRows().length || null : null },
    ];
    let content = '';
    if (tab === 'plan') content = demandTab(demand);
    else if (tab === 'pos') content = posTab(std, stage);
    else if (tab === 'emergency') content = emergencyTab(em, stage, asked);
    else content = paymentsTab(all);

    const todo = hubTodo(all, asked);
    // One blue button per view: on the plan it is "Create purchase order" at the bottom.
    const actions = can.manage() ? ui.btn('Emergency purchase', { icon: 'bolt', act: 'new-em' }) + ui.btn('New purchase order', { icon: 'plus', kind: tab === 'plan' ? 'ghost' : 'primary', act: 'new-po' }) : '';
    root.innerHTML = ui.pageHead({ title: 'Purchasing', subtitle: 'Cars we order from BYD, emergency purchases from local suppliers, and what we pay suppliers.', actions })
      + (todo.length ? `<div class="pr-todo">${todo.map((t) => `<a class="alert-row" href="${t.href}"><span class="pr-ico ${t.bg}">${NA.icon(t.icon, 17)}</span><div class="grow"><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></div>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`).join('')}</div>` : '')
      + `${ui.tabs(tabs, tab)}<div data-tab-body>${content}</div>`;

    const offs = [
      ui.delegate(root, 'click', '[data-tab]', (el) => NA.go('#/procurement?tab=' + el.dataset.tab)),
      ui.delegate(root, 'click', '[data-act]', (el, ev) => {
        const act = el.dataset.act;
        if (act === 'new-po') NA.actions.newPO();
        else if (act === 'new-em') NA.actions.newEmergencyPO();
        else if (act === 'stage') NA.go('#/procurement?tab=' + tab + (el.dataset.stage ? '&stage=' + el.dataset.stage : ''));
        else if (act === 'kind') { hubState.kind = el.dataset.kind || ''; NA.render(); }
        else if (act === 'em-for-order') { if (ev && ev.preventDefault) ev.preventDefault(); NA.actions.newEmergencyPO({ orderId: el.dataset.order }); }
        else if (act === 'plan-po') createFromPlan(demand);
        else if (act === 'plan-reset') { demand.forEach((r) => { planQty[r.model.id] = r.suggested; }); NA.render(); }
        else if (act === 'plan-clear') { demand.forEach((r) => { planQty[r.model.id] = 0; }); NA.render(); }
        else if (act === 'pay-due') {
          const po = NA.get('purchaseOrders', el.dataset.id); if (!po) return;
          if (el.dataset.kind === 'adv') payAdvance(po); else if (el.dataset.kind === 'rel') payRelease(po); else emPay(po);
        } else if (act === 'void') { const p = NA.get('vendorPayments', el.dataset.id); if (p) voidPayment(p); }
      }),
      ui.delegate(root, 'input', '[data-plan-qty]', (el) => { planQty[el.dataset.planQty] = Math.max(0, Math.round(Number(el.value) || 0)); el.classList.toggle('has', planQty[el.dataset.planQty] > 0); drawPlanSum(root, demand); }),
      ui.delegate(root, 'input', '[data-po-search]', (el) => {
        hubState.q = el.value;
        const box = root.querySelector('[data-po-list]');
        if (box) box.innerHTML = poCards(filterPOs(std, validStage(std, stage)), 'No purchase orders match this search');
      }),
    ];
    if (tab === 'plan') drawPlanSum(root, demand);
    return () => offs.forEach((f) => f());
  }

  /* ------------------------------------------------------------- plan tab */
  /** What to order next: six plain columns. The reasons sit under the expected demand. Colours are chosen on the order. */
  function demandTab(rows) {
    rows.forEach((r) => { if (planQty[r.model.id] == null) planQty[r.model.id] = r.suggested; });
    if (!rows.length) return `<div class="card">${ui.empty('No car models yet. Add them in Settings to start planning.', 'chart', ui.btn('Open Settings', { href: '#/settings' }))}</div>`;
    const manage = can.manage();
    const why = (r) => `${r.sold90} sold in 90 days · ${plural(r.hot, 'hot lead')} · ${r.backlog} waiting for a car`;
    const cols = [
      { label: 'Model', render: (r) => `<div class="cell-main">${esc(r.model.name)}</div><div class="cell-sub">${esc(r.model.variant || '')}</div>` },
      { label: 'In stock', cls: 'right', render: (r) => `<span class="num">${r.available}</span>` },
      { label: 'Arriving', cls: 'right', render: (r) => `<span class="num">${r.incoming}</span>` },
      { label: 'Expected demand', render: (r) => `<div class="cell-main num">${plural(r.forecast, 'car')} in 60 days</div><div class="cell-sub">${esc(why(r))}</div>` },
      { label: 'Suggested', render: (r) => (r.suggested > 0 ? ui.badge('Order ' + r.suggested, 'blue') : ui.badge('Covered', 'gray', 'check')) },
    ];
    if (manage) cols.push({ label: 'Order', cls: 'right', render: (r) => `<input class="pr-qty ${planQty[r.model.id] > 0 ? 'has' : ''}" type="number" min="0" max="100" step="1" value="${planQty[r.model.id]}" data-plan-qty="${esc(r.model.id)}" aria-label="Cars to order: ${esc(r.model.name)}"/>` });
    return `<div class="card">
        <div class="card-head"><h3>What to order next</h3>${manage ? `<div class="row">${ui.btn('Use the suggestions', { size: 'sm', act: 'plan-reset' })}${ui.btn('Clear', { size: 'sm', act: 'plan-clear' })}</div>` : ''}</div>
        <p class="card-body muted small">Expected demand is two thirds of the last 90 days’ sales, plus half the hot leads, plus orders still waiting for a car. Arriving is cars on the way and cars still to come on approved orders. Suggested is the demand minus what is in stock and arriving.${manage ? ' You choose the colours on the next screen.' : ''}</p>
        ${ui.table(cols, rows)}
        ${manage ? `<div class="card-foot pr-plan-foot"><div class="pr-plan-sum" data-plan-sum></div>
          <button class="btn btn-primary" data-act="plan-po">${NA.icon('cart', 16)}Create purchase order</button></div>` : ''}
      </div>`;
  }

  function drawPlanSum(root, rows) {
    const box = root.querySelector('[data-plan-sum]');
    if (!box) return;
    const picked = rows.filter((r) => planQty[r.model.id] > 0);
    const units = sum(picked, (r) => planQty[r.model.id]);
    const value = sum(picked, (r) => planQty[r.model.id] * (Number(r.model.cost) || 0));
    const pct = settingsPct();
    box.innerHTML = `<div><small>Cars to order</small><b>${units}</b></div><div><small>Order value (about)</small><b>${esc(M(value))}</b></div><div><small>${esc(pctTxt(pct))} advance after approval</small><b>${esc(M(Math.round(value * pct)))}</b></div>`;
    const btn = root.querySelector('[data-act="plan-po"]');
    if (btn) { btn.disabled = units === 0; btn.title = units ? '' : 'Enter how many cars to order for at least one model'; }
  }

  function createFromPlan(rows) {
    const units = rows.filter((r) => planQty[r.model.id] > 0).map((r) => ({ modelId: r.model.id, color: topColor(r.model), qty: planQty[r.model.id] }));
    if (!units.length) { ui.toast('Enter how many cars to order for at least one model', 'error'); return; }
    NA.actions.newPO({ units, onSaved: () => { rows.forEach((r) => { delete planQty[r.model.id]; }); } });
  }

  /* ----------------------------------------------------------- orders tab */
  const STAGE_KEYS = ['po', 'allocated', 'releasing', 'receiving', 'closed'];
  const SPECIAL = { approval: (p) => !isApproved(p), decide: canDecideOn, ask: needsAsk, vin: needsVin, batch: needsBatch };
  /** To-do filters with no chip of their own until a to-do row opens them. */
  const QUIET = { decide: 'To approve', ask: 'To send for approval' };
  /** stage '' = all open (finished and cancelled orders are left out); 'approval' | 'decide' | 'ask' | 'vin' | 'batch' are to-do filters. */
  function filterPOs(list, stage, noSearch) {
    const q = noSearch ? '' : hubState.q.trim().toLowerCase();
    return list.filter((p) => {
      const k = computeStage(p);
      if (SPECIAL[stage]) { if (k === 'cancelled' || k === 'closed' || !SPECIAL[stage](p)) return false; }
      else if (stage) { if (k !== stage) return false; }
      else if (k === 'closed' || k === 'cancelled') return false;
      if (!q) return true;
      const hay = [p.code, NA.vendorName(p.vendorId), p.proformaRef, p.notes, ...(p.lots || []).map((l) => l.lotNo), ...(p.units || []).map((u) => NA.modelName(u.modelId) + ' ' + (u.color || '') + ' ' + (u.vin || ''))].join(' ').toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  const validStage = (std, stage) => (!stage || STAGE_KEYS.includes(stage) || SPECIAL[stage] || stage === 'cancelled' ? stage : '');

  /** One line under each card: what this order is waiting for, and from whom. */
  function poNextHint(po) {
    const k = computeStage(po);
    if (k === 'cancelled') return 'Cancelled';
    const ap = approvalOf(po);
    if (ap === 'pending') return 'Waiting for the Managing Director';
    if (ap === 'rejected') return 'Declined by the Managing Director';
    if (ap !== 'approved') return 'Needs the Managing Director’s approval';
    const u = po.units || [];
    if (!advDone(po)) return `Accounts pays the ${advTxt(po)} advance`;
    const noLot = u.filter((x) => !x.lotNo && !unitHasVin(po, x)).length;
    const toPay = u.filter((x) => x.lotNo && !unitPaid(po, x)).length;
    const noVin = u.filter((x) => unitPaid(po, x) && !unitHasVin(po, x)).length;
    const onWay = u.filter((x) => unitHasVin(po, x) && !unitReceived(po, x)).length;
    const eta = nextEta(po);
    const when = eta ? ' · ' + eta : '';
    if (noLot) return `${plural(noLot, 'car')} to put in a batch`;
    if (toPay) return `Final payment for ${plural(toPay, 'car')}${when}`;
    if (noVin) return `${plural(noVin, 'VIN')} to enter${when}`;
    if (onWay) return `${plural(onWay, 'car')} on the way${when}`;
    const held = u.filter((x) => unitStatus(po, x) === 'hold').length;
    return held ? `All in · ${held} on hold` : 'All cars in stock';
  }
  /** When the next batch still to come is expected, in a few words ('' when no date is known). */
  function nextEta(po) {
    const eta = (po.lots || []).filter((l) => l.status !== LOT_LAST && l.eta).map((l) => l.eta).sort()[0];
    if (!eta) return '';
    const d = NA.daysBetween(NA.today(), eta);
    return d === 0 ? 'arrives today' : d > 0 ? 'arrives ' + F.dateShort(eta) : 'was due ' + F.dateShort(eta);
  }

  function poCards(list, emptyMsg) {
    if (!list.length) return `<div class="card">${ui.empty(emptyMsg || 'No purchase orders here', 'cart', can.manage() ? ui.btn('New purchase order', { icon: 'plus', act: 'new-po' }) : '')}</div>`;
    return `<div class="pr-po-grid">${list.map((po) => {
      const total = B.poTotal(po); const paid = paidOn(po); const ratio = total ? Math.min(1, paid / total) : 0;
      const u = po.units || [];
      const rec = u.filter((x) => unitReceived(po, x)).length;
      const k = computeStage(po);
      const steps = poSteps(po);
      const idx = k === 'closed' ? steps.length : Math.max(0, NA.stageIndex(steps, k));
      return `<a class="card pr-po-card" href="#/procurement/${esc(po.id)}">
        <div class="pr-pc-body">
          <div class="row-between"><span class="pr-code">${esc(po.code)}</span>${stageBadge(po)}</div>
          <div class="small muted">${esc(NA.vendorName(po.vendorId))} · ${esc(F.date(po.date))}</div>
          ${modelChips(u)}
          ${seeMoney() ? `<div><div class="pr-money-row"><span>Paid <b>${esc(F.short(paid))}</b> of ${esc(F.short(total))}</span><span class="num">${Math.round(ratio * 100)}%</span></div>${ui.progress(ratio, ratio >= 0.999 ? 'green' : 'blue')}</div>` : ''}
          ${k === 'cancelled' ? '' : ui.stepper(steps, idx, { compact: true })}
        </div>
        <div class="pr-pc-foot"><span>${rec} of ${u.length} in stock</span><b>${esc(poNextHint(po))}</b></div>
      </a>`;
    }).join('')}</div>`;
  }

  function posTab(std, stage) {
    const st = validStage(std, stage);
    const chips = [{ key: '', label: 'All open' }, { key: 'approval', label: 'Needs approval' }]
      .concat(QUIET[st] ? [{ key: st, label: QUIET[st] }] : [])
      .concat(STAGE_KEYS.map((k) => ({ key: k, label: stageText(k) })))
      .concat([{ key: 'vin', label: 'VIN to enter' }, { key: 'batch', label: 'Needs a batch' }, { key: 'cancelled', label: 'Cancelled' }])
      .map((c) => Object.assign(c, { n: filterPOs(std, c.key, true).length }))
      .filter((c) => c.key === '' || c.n > 0 || c.key === st);
    const list = filterPOs(std, st);
    return `<div class="toolbar">
        <input type="search" placeholder="Search order, quote, batch, model or VIN" value="${esc(hubState.q)}" data-po-search aria-label="Search purchase orders"/>
      </div>
      <div class="chips pr-block">${chips.map((c) => `<button class="chip ${c.key === st ? 'active' : ''}" data-act="stage" data-stage="${esc(c.key)}">${esc(c.label)} <span class="n">${c.n}</span></button>`).join('')}</div>
      <div data-po-list>${poCards(list, st ? 'No purchase orders here' : 'No open purchase orders. Start from the plan, or create one.')}</div>`;
  }

  /* -------------------------------------------------------- emergency tab */
  function emCard(po) {
    const u = (po.units || [])[0] || {};
    const o = po.orderId ? NA.get('orders', po.orderId) : null;
    const k = computeStage(po);
    const idx = k === 'received' ? EM_STEPS.length : Math.max(0, NA.stageIndex(EM_STEPS, k));
    return `<a class="card pr-po-card" href="#/procurement/${esc(po.id)}"><div class="pr-pc-body">
        <div class="row-between"><span class="pr-code">${esc(po.code)}</span>${stageBadge(po)}</div>
        <div>${carLabel(u)}</div>
        <div class="small">${u.vin ? `<span class="mono">${esc(u.vin)}</span>` : '<span class="muted">VIN not confirmed yet</span>'}</div>
        <div class="small muted">${o ? `For ${esc(o.code)}${esc(custOf(o))}` : esc(po.availabilityNote || 'A stock car, not for an order')}</div>
        ${seeMoney() && u.vin ? `<div class="pr-money-row"><span>Paid <b>${esc(F.short(paidOn(po)))}</b> of ${esc(F.short(B.poTotal(po)))}</span><span>${esc(F.date(po.date))}</span></div>` : ''}
        ${k === 'cancelled' ? '' : ui.stepper(EM_STEPS, idx, { compact: true })}
      </div></a>`;
  }
  function emergencyTab(em, stage, asked) {
    const keys = EM_STEPS.map((s) => s.key);
    const EM_SPECIAL = { approval: urgentNeedsOk, decide: (p) => urgentNeedsOk(p) && canDecideOn(p), ask: (p) => urgentNeedsOk(p) && needsAsk(p) };
    const st = keys.includes(stage) || stage === 'cancelled' || EM_SPECIAL[stage] ? stage : '';
    const openEm = (p) => !['received', 'cancelled'].includes(computeStage(p));
    const list = em.filter((p) => (EM_SPECIAL[st] ? EM_SPECIAL[st](p) : st ? computeStage(p) === st : openEm(p))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const chips = [{ key: '', label: 'Open', n: em.filter(openEm).length }, { key: 'approval', label: 'Needs approval', n: em.filter(urgentNeedsOk).length }]
      .concat(QUIET[st] ? [{ key: st, label: QUIET[st], n: em.filter(EM_SPECIAL[st]).length }] : [])
      .concat(EM_STEPS.map((s) => ({ key: s.key, label: stageText(s.key), n: em.filter((p) => computeStage(p) === s.key).length })))
      .concat([{ key: 'cancelled', label: 'Cancelled', n: em.filter((p) => computeStage(p) === 'cancelled').length }])
      .filter((c) => !c.key || c.n || c.key === st);
    // Other confirmed orders with no free car of their model and colour (no request from sales yet).
    const waiting = NA.where('orders', (o) => ['booking', 'payment', 'vin'].includes(o.stage) && !o.vehicleId && !o.emergencyRequest && orderConfirmed(o)
      && !openUrgentFor(o.id) && !matching(o.modelId, o.color).inStock);
    const start = (o) => (can.manage() ? `<button class="btn btn-plain btn-sm" data-act="em-for-order" data-order="${esc(o.id)}">Start</button>` : '');
    const askRows = asked.map((o) => {
      const r = o.emergencyRequest || {};
      return `<div class="gl-row"><span class="gl-main"><b>${esc(o.code)}${esc(custOf(o))}</b><small>${esc(NA.modelName(o.modelId))} ${esc(o.color || '')} · ${esc(paidWords(o))} · asked ${esc(F.ago(r.at))}${r.by ? ' by ' + esc(r.by) : ''}${r.note ? ' · “' + esc(r.note) + '”' : ''}</small></span>${start(o)}</div>`;
    }).join('');
    const waitRows = waiting.slice(0, 12).map((o) => {
      const m = matching(o.modelId, o.color);
      return `<div class="gl-row"><span class="gl-main"><b>${esc(o.code)}${esc(custOf(o))}</b><small>${esc(NA.modelName(o.modelId))} ${esc(o.color || '')} · ${esc(paidWords(o))} · ${m.coming || m.onOrder ? esc(`${m.coming} on the way, ${m.onOrder} on order from BYD`) : 'none on the way'}</small></span>${start(o)}</div>`;
    }).join('');
    return `${asked.length ? `<section class="pr-block"><div class="glist-title">Sales asked for an emergency car</div><div class="glist">${askRows}</div>
        <p class="glist-foot">The Managing Director approves the price first. The car is kept for the order when it arrives.</p></section>` : ''}
      ${list.length || st || !asked.length ? `<div class="chips pr-block">${chips.map((c) => `<button class="chip ${c.key === st ? 'active' : ''}" data-act="stage" data-stage="${esc(c.key)}">${esc(c.label)} <span class="n">${c.n}</span></button>`).join('')}</div>
      ${list.length ? `<div class="pr-po-grid pr-block">${list.map(emCard).join('')}</div>` : `<div class="card pr-block">${ui.empty(st ? 'No emergency purchases here' : 'No emergency purchase in progress', 'bolt', can.manage() ? ui.btn('Emergency purchase', { icon: 'bolt', act: 'new-em' }) : '')}</div>`}` : ''}
      ${waiting.length ? `<section><div class="glist-title">Other orders with no matching car in stock</div><div class="glist">${waitRows}</div>
        <p class="glist-foot">Only when the customer cannot wait for the next BYD shipment.</p></section>` : ''}`;
  }

  /* --------------------------------------------------------- payments tab */
  /** Due now (on approved orders), still owed later, and every payment made — voided ones kept and marked. */
  function paymentsTab(all) {
    const pays = NA.db.vendorPayments.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const live = pays.filter(vpLive);
    const kinds = [
      { key: '', label: 'All', test: vpLive },
      { key: 'adv', label: 'Advances', test: (p) => vpLive(p) && isAdv(p) },
      { key: 'rel', label: 'Final payments', test: (p) => vpLive(p) && isRel(p) },
      { key: 'full', label: 'Emergency purchases', test: (p) => vpLive(p) && isFull(p) },
      { key: 'void', label: 'Voided', test: (p) => !vpLive(p) },
    ].filter((k) => k.key !== 'void' || pays.some((p) => !vpLive(p)));
    const kind = kinds.find((k) => k.key === hubState.kind) || kinds[0];
    const shown = pays.filter(kind.test);
    const due = dueRows();
    const dueTotal = sum(due, (d) => d.amount);
    const owed = sum(all, outstanding);
    const month = NA.today().slice(0, 7);
    const thisMonth = live.filter((p) => String(p.date || '').slice(0, 7) === month);
    const open = all.filter((p) => outstanding(p) > 0.5).sort((a, b) => outstanding(b) - outstanding(a));
    const dueHtml = due.length ? `<div class="glist">${due.map((d) => `<div class="gl-row"><span class="gl-main"><b><a href="#/procurement/${esc(d.po.id)}">${esc(d.po.code)}</a> · ${esc(NA.vendorName(d.po.vendorId))}</b><small>${esc(d.what)}</small></span>
        <span class="gl-value">${esc(M(d.amount))}</span>${can.pay() ? `<button class="btn btn-plain btn-sm" data-act="pay-due" data-id="${esc(d.po.id)}" data-kind="${esc(d.kind)}">Pay</button>` : ''}</div>`).join('')}</div>
        ${can.pay() ? '' : '<p class="glist-foot">Accounts pays these.</p>'}`
      : '<div class="glist"><div class="gl-row"><span class="gl-main muted">Nothing is due on approved orders.</span></div></div>';
    const openHtml = open.length ? `<div class="glist">${open.slice(0, 12).map((p) => {
        const total = B.poTotal(p); const paid = paidOn(p);
        return `<a class="gl-row" href="#/procurement/${esc(p.id)}"><span class="gl-main"><b>${esc(p.code)} · ${esc(NA.vendorName(p.vendorId))}</b><small>Paid ${esc(MS(paid))} of ${esc(MS(total))}${isEm(p) ? ' · emergency purchase' : ''}</small></span>
          <span class="gl-value">${esc(MS(outstanding(p)))}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`;
      }).join('')}</div>` : '<div class="glist"><div class="gl-row"><span class="gl-main muted">Every supplier is paid up.</span></div></div>';
    return `
      <div class="grid grid-3 pr-block">
        ${ui.kpi({ label: 'Due to pay now', value: MS(dueTotal), sub: due.length ? plural(due.length, 'payment') + ' on approved orders' : 'Nothing due' })}
        ${ui.kpi({ label: 'Still owed to suppliers', value: MS(owed), sub: open.length ? 'On ' + plural(open.length, 'approved order') + ', including later payments' : 'Nothing owed' })}
        ${ui.kpi({ label: 'Paid this month', value: MS(sum(thisMonth, (p) => p.amount)), sub: plural(thisMonth.length, 'payment') })}
      </div>
      <div class="grid grid-2 pr-block">
        <section><div class="glist-title">Due now</div>${dueHtml}</section>
        <section><div class="glist-title">Still owed, by order</div>${openHtml}</section>
      </div>
      <div class="chips pr-block">${kinds.map((k) => `<button class="chip ${k.key === kind.key ? 'active' : ''}" data-act="kind" data-kind="${k.key}">${esc(k.label)}</button>`).join('')}</div>
      <div class="card">${ui.table([
        { label: 'Date', render: (p) => `<span class="nowrap">${esc(F.date(p.date))}</span>` },
        { label: 'Order', render: (p) => { const po = NA.get('purchaseOrders', p.poId); return po ? `<a href="#/procurement/${esc(po.id)}" class="cell-main">${esc(po.code)}</a><div class="cell-sub">${esc(NA.vendorName(p.vendorId))}</div>` : `<span class="muted">${esc(NA.vendorName(p.vendorId))}</span>`; } },
        { label: 'What', render: (p) => `${esc(kindText(p))}${p.vin ? `<div class="cell-sub mono">${esc(p.vin)}</div>` : ''}` },
        { label: 'Reference', render: (p) => `<span class="mono">${esc(p.ref || '—')}</span>${p.vendorBillNo ? `<div class="cell-sub">Bill ${esc(p.vendorBillNo)}</div>` : ''}<div class="cell-sub">${esc(p.method || '')}${p.paidBy ? ' · ' + esc(p.paidBy) : ''}</div>` },
        { label: 'Amount', cls: 'right', render: (p) => (vpLive(p) ? `<b class="nowrap num">${esc(M(p.amount))}</b>` : `<span class="nowrap num pr-void"><span class="pr-amt">${esc(M(p.amount))}</span></span><div class="cell-sub">Voided${p.void && p.void.reason ? ': ' + esc(p.void.reason) : ''}</div>`) },
        { label: '', cls: 'right', render: (p) => (vpLive(p) && can.voidPay() ? `<button class="btn btn-plain btn-sm" data-act="void" data-id="${esc(p.id)}">Void</button>` : '') },
      ], shown, { empty: kind.key === 'void' ? 'No voided payments' : 'No supplier payments yet', emptyIcon: 'wallet' })}
      ${shown.length && kind.key !== 'void' ? `<div class="card-foot row-between"><span class="muted">${plural(shown.length, 'payment')}</span><b class="num">${esc(M(sum(shown, (p) => p.amount)))}</b></div>` : ''}</div>`;
  }

  /* ------------------------------------------------------------ PO detail */
  const glRow = (label, value, sub, cls) => `<div class="gl-row"><span class="gl-main"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="gl-value ${cls || ''}">${value}</span></div>`;
  const paysList = (po) => {
    const pays = allPays(po).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return `<div class="glist">${pays.length ? pays.map(payRow).join('') : '<div class="gl-row"><span class="gl-main muted">No payments yet.</span></div>'}</div>${can.pay() ? '' : '<p class="glist-foot">Accounts records supplier payments.</p>'}`;
  };
  /** What happens next: the current person's own step first, the other open steps listed underneath. */
  function pickNext(tasks) {
    const i = tasks.findIndex((t) => t.who && can[t.who] && can[t.who]());
    const main = tasks[i >= 0 ? i : 0];
    return Object.assign({}, main.ns, { also: tasks.filter((t) => t !== main).map((t) => `<span class="lock-note">${NA.icon('clock', 14)}${esc(t.ns.title)}</span>`) });
  }
  const approvedText = (po) => {
    const ap = approvalOf(po);
    const by = approvedBy(po);
    if (ap === 'approved') return by ? `${by.by || 'Managing Director'} · ${F.date(by.at)}` : notNeeded(po) || (NA.policy().poApproval === false && !isEm(po)) ? 'Not needed' : 'Raised before approvals';
    return ap === 'pending' ? 'Waiting' : ap === 'rejected' ? 'Declined' : 'Not asked yet';
  };

  function renderPODetail(root, po) {
    reconcile(po);
    po = freshPO(po);
    const units = po.units || [];
    const lots = po.lots || [];
    const total = B.poTotal(po);
    const paid = paidOn(po);
    const k = computeStage(po);
    const cancelled = k === 'cancelled';
    const ap = approvalOf(po);
    const ok = ap === 'approved';
    const adOK = advDone(po);
    const steps = poSteps(po);
    const idx = cancelled ? -1 : k === 'closed' ? steps.length : Math.max(0, NA.stageIndex(steps, k));
    const lotOf = (u) => lots.find((l) => l.lotNo === u.lotNo);
    const noLot = units.filter((u) => !u.lotNo && !unitHasVin(po, u));
    const toPay = units.filter((u) => u.lotNo && !unitPaid(po, u));
    const noVin = units.filter((u) => unitPaid(po, u) && !unitHasVin(po, u));
    const toCheck = units.filter((u) => unitHasVin(po, u) && !unitReceived(po, u));
    const held = units.filter((u) => unitStatus(po, u) === 'hold');
    const due = dueNow(po);
    const dueTotal = sum(due, (d) => d.amount);
    const aRec = A ? A.find('purchaseOrders', po.id, 'po') : null;
    const decider = !!aRec && A.canDecide(aRec);
    const primary = (label, act, attrs) => ui.btn(label, { kind: 'primary', act, attrs });

    const tasks = [];
    if (cancelled) tasks.push({ ns: { tone: 'stop', icon: 'x', title: 'This purchase order was cancelled', desc: po.cancelled ? `${po.cancelled.reason} · ${po.cancelled.by || ''} · ${F.date(po.cancelled.at)}` : 'It is kept for the record.' } });
    else if (!ok) {
      if (ap === 'pending') tasks.push({ ns: { tone: 'wait', icon: 'stamp', title: decider ? 'Approve or decline this order' : 'Waiting for the Managing Director', desc: decider ? 'Use the buttons above. Nothing is paid until it is approved.' : 'Nothing can be paid until the order is approved.' } });
      else if (ap === 'rejected') tasks.push({ ns: { tone: 'stop', icon: 'x', title: 'The Managing Director declined this order', desc: approvalNote(po) || 'Change the plan and ask again, or cancel the order.', actions: can.manage() ? primary('Ask again', 'ask') : lock('Purchasing decides what happens next') } });
      else tasks.push({ ns: { icon: 'stamp', title: 'Ask the Managing Director to approve', desc: 'The advance is paid only after approval.', actions: can.manage() ? primary('Ask for approval', 'ask') : lock('Purchasing asks for approval') } });
    } else if (!adOK) {
      tasks.push({ who: 'pay', ns: { icon: 'wallet', title: `Pay the ${advTxt(po)} advance — ${M(advLeft(po))}`, desc: 'BYD allocates a shipment batch once the advance arrives.', actions: can.pay() ? primary('Pay advance', 'advance') : lock('Accounts pays this') } });
    } else {
      if (noLot.length) tasks.push({ who: 'manage', ns: { icon: 'boxes', title: lots.length ? `Put ${plural(noLot.length, 'car')} into a shipment batch` : 'Add the shipment batch from BYD', desc: 'Batch (lot) number, expected arrival, and which cars are in it.', actions: can.manage() ? primary('Add batch', 'add-lot') : lock('Purchasing does this') } });
      if (toPay.length) tasks.push({ who: 'pay', ns: { icon: 'wallet', title: `Final ${relTxt(po)} for ${plural(toPay.length, 'car')} — ${M(sum(toPay, (u) => relDue(po, u)))}`, desc: 'BYD sends each VIN after its final payment.', actions: can.pay() ? primary('Pay final payment', 'pay-rel') : lock('Accounts pays this') } });
      if (noVin.length) tasks.push({ who: 'receive', ns: { icon: 'key', title: `Enter the VIN for ${plural(noVin.length, 'car')}`, desc: 'The final payment is made — type each VIN when BYD sends it.', actions: can.receive() ? primary('Enter VINs', 'vins') : lock('Purchasing enters the VINs') } });
      if (toCheck.length) {
        const l = lotOf(toCheck[0]);
        tasks.push({ who: 'inspect', ns: { icon: 'clipboard-check', title: `Check ${plural(toCheck.length, 'car')} on arrival`, desc: l ? `Batch ${l.lotNo} · ${lotText(l.status).toLowerCase()} · ${etaText(l.eta)}` : 'VIN, keys, cable, papers, damage and battery.',
          actions: can.inspect() ? primary('Check on arrival', 'receive', `data-unit="${esc(toCheck[0].id)}"`) : lock('Purchasing or the workshop does this') } });
      }
      if (!tasks.length) tasks.push({ ns: { tone: 'done', icon: 'check-circle', title: units.length === 1 ? 'The car is in' : `All ${plural(units.length, 'car')} are in`, desc: held.length ? `${plural(held.length, 'car')} on hold until fixed — see Vehicles.` : 'Every car passed its arrival check.', actions: ui.btn('Open vehicles', { href: '#/inventory' }) } });
    }

    // Cars
    const payCell = (u) => {
      if (unitPaid(po, u)) return `<span class="tone-green">Paid</span><div class="cell-sub">${esc(F.date(u.releasePaidAt))}${u.releaseRef ? ' · ' + esc(u.releaseRef) : ''}</div>`;
      if (cancelled) return '<span class="muted">—</span>';
      const amt = `<span class="num nowrap">${esc(M(relDue(po, u)))}</span>`;
      if (!u.lotNo) return `${amt}<div class="cell-sub">After it is in a batch</div>`;
      if (!ok || !adOK) return `${amt}<div class="cell-sub">After the advance</div>`;
      return `<div class="pr-cell-act">${amt}${can.pay() ? `<button class="btn btn-plain btn-sm" data-act="pay-rel" data-unit="${esc(u.id)}">Pay</button>` : '<span class="cell-sub">Due now</span>'}</div>`;
    };
    const vinCell = (u) => {
      const v = unitVehicle(po, u);
      if (v) return `<a class="mono" href="#/inventory/${esc(v.id)}">${esc(v.vin)}</a>`;
      if (u.vin) return `<span class="mono">${esc(u.vin)}</span>`;
      if (unitPaid(po, u) && !cancelled) return can.receive() ? `<button class="btn btn-plain btn-sm" data-act="vins" data-unit="${esc(u.id)}">Enter VIN</button>` : '<span class="muted">To come from BYD</span>';
      return '<span class="muted">After the final payment</span>';
    };
    const arrivalCell = (u) => {
      const v = unitVehicle(po, u);
      if (unitReceived(po, u)) return `${v && S().statusBadge ? S().statusBadge(v) : ui.badge('In stock', 'gray')}<div class="cell-sub">${esc(F.date(u.receivedAt || (v && v.arrivedAt)))}${v && v.location ? ' · ' + esc(v.location) : ''}</div>`;
      if (v) {
        const l = lotOf(u);
        const where = v.arrivedAt && v.status !== 'in_transit' ? `Arrived ${F.dateShort(v.arrivedAt)} · to be checked` : etaText(v.eta || (l && l.eta) || '');
        return `<div class="pr-cell-act"><span class="small">${esc(where)}</span>${can.inspect() ? `<button class="btn btn-plain btn-sm" data-act="receive" data-unit="${esc(u.id)}">Check on arrival</button>` : ''}</div>`;
      }
      return '<span class="muted">—</span>';
    };
    const carCols = [{ label: 'Car', render: (u) => `<div class="nowrap">${carLabel(u)}</div><div class="cell-sub">${u.lotNo ? 'Batch ' + esc(u.lotNo) : 'Not in a batch yet'}</div>` }];
    if (seeMoney()) carCols.push({ label: 'Price', cls: 'right', render: (u) => `<span class="num nowrap">${esc(F.money(u.unitCost))}</span>` });
    carCols.push({ label: 'Final ' + relTxt(po), render: payCell }, { label: 'VIN', render: vinCell }, { label: 'Arrival', render: arrivalCell });

    // Shipment batches, each with a forward-only "Mark as …" step
    const lotsHtml = lots.length ? `<div class="card">${lots.map((l) => {
        const inLot = units.filter((u) => u.lotNo === l.lotNo);
        const si = Math.max(0, LOTS.indexOf(l.status));
        const next = LOTS[si + 1];
        const since = l.statusDates && l.statusDates[l.status];
        const recN = inLot.filter((u) => unitReceived(po, u)).length;
        return `<div class="pr-lot">
          <div class="pr-lot-head"><div><b>${esc(l.lotNo)}</b> <span class="muted small">· ${plural(inLot.length, 'car')}${l.shipment ? ' · ' + esc(l.shipment) : ''}</span>
            <div class="small muted mt-4">${esc(lotText(l.status))}${since ? ' since ' + esc(F.dateShort(since)) : ''} · ${esc(l.status === LOT_LAST ? `${recN} of ${inLot.length} checked` : etaText(l.eta))}</div></div>
            ${can.manage() && !cancelled ? `<div class="row">${next ? `<button class="btn btn-plain btn-sm" data-act="lot-next" data-lot="${esc(l.lotNo)}">Mark as ${esc(lotText(next).toLowerCase())}</button>` : ''}<button class="btn btn-plain btn-sm" data-act="edit-lot" data-lot="${esc(l.lotNo)}">Edit</button></div>` : ''}</div>
          ${ui.stepper(LOTS.map((s) => ({ label: lotText(s) })), l.status === LOT_LAST ? LOTS.length : si, { compact: true })}
          ${modelChips(inLot)}
        </div>`;
      }).join('')}</div>`
      : `<div class="glist"><div class="gl-row"><span class="gl-main muted">${ok && adOK ? 'No batch yet. Add it when BYD allocates the cars.' : 'BYD allocates a batch after the advance is paid.'}</span></div></div>`;

    // Money: approved total, paid, due now, still to pay later
    const relAll = sum(units, (u) => relDue(po, u));
    const relPaidAmt = sum(payments(po).filter(isRel), (p) => p.amount);
    const over = Math.max(0, paid - total);
    const moneyHtml = seeMoney() ? `<div class="glist">
        ${glRow(ok ? 'Approved total' : 'Order total', esc(F.money(total)), plural(units.length, 'car'))}
        ${glRow(`Advance (${advTxt(po)})`, esc(F.money(advPaid(po))), `of ${F.money(advRequired(po))} · ${adOK ? 'paid' : ok ? 'due now' : 'after approval'}`)}
        ${glRow(`Final payments (${relTxt(po)})`, esc(F.money(relPaidAmt)), `of ${F.money(relAll)} · ${units.filter((u) => unitPaid(po, u)).length} of ${units.length} cars paid`)}
        ${glRow('Paid so far', esc(F.money(paid)))}
        ${glRow('Due now', esc(F.money(dueTotal)), due.map((d) => d.what).join(' · '), dueTotal ? 'tone-blue' : '')}
        ${glRow(ok || cancelled ? 'Still to pay later' : 'To pay once approved', esc(F.money(Math.max(0, leftOn(po) - dueTotal))))}
      </div>${over > 0.5 ? `<div class="callout callout-danger mt-12">${NA.icon('alert')}<div><b>Overpaid by ${esc(F.money(over))}.</b> This is a credit with the supplier.</div></div>` : ''}` : '';
    const detailsHtml = `<div class="glist">
        ${glRow('Supplier', esc(NA.vendorName(po.vendorId)))}
        ${glRow('Supplier quote no.', esc(po.proformaRef || '—'))}
        ${glRow('Order date', esc(F.date(po.date)))}
        ${po.createdBy ? glRow('Raised by', esc(po.createdBy)) : ''}
        ${glRow('Approved', esc(approvedText(po)))}
        ${po.notes ? `<div class="gl-row"><span class="gl-main"><b>Note</b><small>${esc(po.notes)}</small></span></div>` : ''}
      </div>`;

    const canCancel = can.manage() && !cancelled && !payments(po).length && !units.some((u) => unitHasVin(po, u));
    const banners = A ? NA.ui.approvalBanners('purchaseOrders', po.id) : '';
    root.innerHTML = ui.pageHead({
      crumbs: [{ label: 'Purchasing', href: '#/procurement?tab=pos' }, { label: po.code }],
      title: po.code,
      subtitle: `${esc(NA.vendorName(po.vendorId))} · ${esc(plural(units.length, 'car'))} · ${esc(F.date(po.date))} &nbsp;${stageBadge(po)}`,
      actions: ui.btn('Print', { icon: 'print', act: 'print' }) + (canCancel ? ui.btn('Cancel order', { kind: 'danger', act: 'cancel' }) : ''),
    }) + `
      ${banners ? `<div class="pr-block">${banners}</div>` : ''}
      <div class="card pad pr-block">${ui.stepper(steps, idx)}</div>
      ${nextStepBox(pickNext(tasks))}
      <div class="grid grid-main-side">
        <div class="pr-stack">
          <section><div class="glist-title">Cars</div><div class="card">${ui.table(carCols, units, { empty: 'No cars on this order' })}</div></section>
          <section><div class="glist-title">Shipment batches</div>${lotsHtml}</section>
        </div>
        <div class="pr-stack">
          ${moneyHtml ? `<section><div class="glist-title">Money</div>${moneyHtml}</section>` : ''}
          <section><div class="glist-title">Payments to the supplier</div>${paysList(po)}</section>
          <section><div class="glist-title">Details</div>${detailsHtml}</section>
          <section><div class="glist-title">History</div><div class="card pad">${timeline(po)}</div></section>
        </div>
      </div>`;

    const unitById = (id) => (freshPO(po).units || []).find((u) => u.id === id);
    const offs = [ui.delegate(root, 'click', '[data-act]', (el) => {
      const act = el.dataset.act;
      if (act === 'advance') payAdvance(po);
      else if (act === 'add-lot') lotModal(po, null);
      else if (act === 'edit-lot') lotModal(po, (freshPO(po).lots || []).find((l) => l.lotNo === el.dataset.lot));
      else if (act === 'lot-next') advanceLot(po, el.dataset.lot);
      else if (act === 'pay-rel') payRelease(po, el.dataset.unit ? [el.dataset.unit] : null);
      else if (act === 'vins') enterVins(po, el.dataset.unit ? [el.dataset.unit] : null);
      else if (act === 'receive') { const u = unitById(el.dataset.unit); const v = u && unitVehicle(po, u); if (v) NA.actions.receiveUnit(v.id); }
      else if (act === 'ask') askAgain(po);
      else if (act === 'print') printPO(freshPO(po));
      else if (act === 'cancel') cancelPO(po);
      else if (act === 'void') { const p = NA.get('vendorPayments', el.dataset.id); if (p) voidPayment(p); }
    })];
    return () => offs.forEach((f) => f());
  }

  /* ---------------------------------------------- emergency purchase page */
  function renderEmergencyDetail(root, po) {
    reconcile(po);
    copiesFollow([po]);
    po = freshPO(po);
    const u = (po.units || [])[0] || {};
    const o = po.orderId ? NA.get('orders', po.orderId) : null;
    const v = unitVehicle(po, u);
    const vk = v ? (S().statusOf ? S().statusOf(v) : v.status) : '';
    const k = computeStage(po);
    const cancelled = k === 'cancelled';
    const ap = approvalOf(po);
    const total = B.poTotal(po);
    const paid = paidOn(po);
    const left = Math.max(0, total - paid);
    const idx = cancelled ? -1 : k === 'received' ? EM_STEPS.length : Math.max(0, NA.stageIndex(EM_STEPS, k));
    const base = baseCost(po, u);
    const prem = u.vin && base ? (Number(u.unitCost) || 0) - base : null;
    const aRec = A ? A.find('purchaseOrders', po.id, 'emergency') : null;
    const decider = !!aRec && A.canDecide(aRec);
    const primary = (label, act, attrs) => ui.btn(label, { kind: 'primary', act, attrs });

    let ns;
    if (cancelled) ns = { tone: 'stop', icon: 'x', title: 'This emergency purchase was cancelled', desc: po.cancelled ? `${po.cancelled.reason} · ${po.cancelled.by || ''} · ${F.date(po.cancelled.at)}` : 'It is kept for the record.' };
    else if (k === 'check') ns = { icon: 'search', title: 'Confirm the VIN and price with the supplier', desc: 'Check that the exact car is there, and agree the price.', actions: can.manage() ? primary('Enter VIN and price', 'em-confirm') + ui.btn('Not available', { act: 'cancel' }) : lock('Purchasing does this') };
    else if (k === 'confirmed' && ap !== 'approved') {
      if (ap === 'pending') ns = { tone: 'wait', icon: 'stamp', title: decider ? 'Approve or decline this purchase' : 'Waiting for the Managing Director', desc: decider ? 'Use the buttons above. The supplier is paid only after approval.' : 'Accounts pays the supplier after approval.', actions: can.manage() && !decider ? ui.btn('Change VIN or price', { act: 'em-confirm' }) : '' };
      else if (ap === 'rejected') ns = { tone: 'stop', icon: 'x', title: 'The Managing Director declined this purchase', desc: approvalNote(po) || 'Agree a better price and ask again, or cancel it.', actions: can.manage() ? primary('Ask again', 'ask') + ui.btn('Change VIN or price', { act: 'em-confirm' }) : lock('Purchasing decides what happens next') };
      else ns = { icon: 'stamp', title: 'Ask the Managing Director to approve', desc: 'The supplier is paid only after approval.', actions: can.manage() ? primary('Ask for approval', 'ask') : lock('Purchasing asks for approval') };
    } else if (k === 'confirmed') ns = { icon: 'wallet', title: `Pay the supplier ${M(left)}`, desc: 'Full payment before the car is handed over. Note the supplier’s bill number.', actions: can.pay() ? primary('Pay supplier', 'em-pay') : lock('Accounts pays this') };
    else if (k === 'paid') ns = { icon: 'clipboard-check', title: 'Collect the car and check it', desc: 'VIN, keys, cable, papers, damage and battery.', actions: can.receive() ? primary('Check on arrival', 'em-receive') : lock('Purchasing does this') };
    else if (o && v && !o.vehicleId && !['delivered', 'cancelled'].includes(o.stage) && vk === 'available') {
      // Purchasing cannot read customer payments: it goes by the order's saved stage.
      const how = !seesPayments() ? 'Ready for its VIN' : B.isFullyPaid(o) ? 'Paid in full' : 'Car before full payment approved';
      const why = seesPayments() ? B.vinBlockers(o)[0] || '' : cap(paidWords(o));
      ns = orderReady(o)
        ? { icon: 'key', title: `Give the VIN to ${o.code}`, desc: `${how} — the car is kept for this order.`, actions: can.assign() && typeof NA.actions.assignVehicle === 'function' ? primary('Give VIN', 'em-assign') : lock('The Sales Manager or Accounts gives the VIN') }
        : { tone: 'wait', icon: 'wallet', title: `Kept for ${o.code} until it is ready for its VIN`, desc: why, actions: NA.canSee('sales') ? ui.btn('Open order', { href: '#/sales/' + o.id }) : '' };
    } else {
      const hold = vk === 'hold';
      ns = { tone: hold ? 'stop' : 'done', icon: hold ? 'alert' : 'check-circle', title: hold ? 'Received — on hold' : 'Received',
        desc: hold ? ((S().holdReasonOf ? S().holdReasonOf(v) : v.holdReason) || 'Not for sale until fixed')
          : o && v && o.vehicleId === v.id ? `The VIN is with ${o.code}.` : o && o.vehicleId ? `${o.code} has another car. This one stays in our stock.` : 'The car is in stock.',
        actions: v ? ui.btn('Open car', { href: '#/inventory/' + v.id }) : '' };
    }

    const req = o && o.emergencyRequest;
    const carHtml = `<div class="glist">
        <div class="gl-row"><span class="gl-main">${carLabel(u)}</span></div>
        ${glRow('VIN', u.vin ? `<span class="mono">${esc(u.vin)}</span>` : 'Not confirmed yet')}
        ${u.motorNo ? glRow('Motor no.', `<span class="mono">${esc(u.motorNo)}</span>`) : ''}
        ${u.vin && u.year ? glRow('Model year', esc(u.year)) : ''}
        ${po.eta && !v && !cancelled ? glRow('Ready to collect', esc(F.date(po.eta)), 'As the supplier said') : ''}
        ${po.availabilityNote ? `<div class="gl-row"><span class="gl-main"><b>The supplier said</b><small>${esc(po.availabilityNote)}</small></span></div>` : ''}
        ${v ? `<a class="gl-row" href="#/inventory/${esc(v.id)}"><span class="gl-main"><b>In stock</b><small>${esc(F.date(u.receivedAt || v.arrivedAt))}${v.location ? ' · ' + esc(v.location) : ''}</small></span>${S().statusBadge ? S().statusBadge(v) : ''}${NA.icon('chevron-right', 16, 'gl-chev')}</a>` : ''}
      </div>`;
    const linkOrder = o && NA.canSee('sales');
    const orderHtml = `<div class="glist">${o ? `<${linkOrder ? `a class="gl-row" href="#/sales/${esc(o.id)}"` : 'div class="gl-row"'}><span class="gl-main"><b>${esc(o.code)}${esc(custOf(o))}</b>
        <small>${esc(cap(paidWords(o)))}${o.vehicleId ? ' · VIN given' : ''}${req && req.note ? ' · “' + esc(req.note) + '”' : ''}</small></span>${linkOrder ? NA.icon('chevron-right', 16, 'gl-chev') + '</a>' : '</div>'}`
      : '<div class="gl-row"><span class="gl-main muted">Not for a customer order — a stock car.</span></div>'}</div>`;
    const m = !cancelled && ['check', 'confirmed'].includes(k) ? matching(u.modelId, u.color) : null;
    const matchHtml = m && (m.inStock || m.coming) ? `<div class="callout callout-warn pr-block">${NA.icon('info')}<div><b>The same car is in our stock or on the way:</b> ${esc(matchText(m))}. Check whether the customer can take one of these first.</div></div>` : '';
    const moneyHtml = seeMoney() ? `<div class="glist">
        ${glRow('Agreed price', u.vin ? esc(F.money(total)) : '—', u.vin ? '' : 'After the VIN is confirmed')}
        ${base ? glRow('Our BYD cost', esc(F.money(base))) : ''}
        ${prem != null && prem !== 0 ? glRow(prem > 0 ? 'Extra over the BYD cost' : 'Below the BYD cost', esc(F.money(Math.abs(prem))), '', prem > 0 ? 'tone-amber' : '') : ''}
        ${glRow('Paid', esc(F.money(paid)))}
        ${u.vin ? glRow(ap === 'approved' || cancelled ? 'Still to pay' : 'To pay once approved', esc(F.money(cancelled ? 0 : left))) : ''}
      </div>` : '';
    const detailsHtml = `<div class="glist">
        ${glRow('Supplier', esc(NA.vendorName(po.vendorId)))}
        ${glRow('Started', esc(F.date(po.date)))}
        ${po.createdBy ? glRow('Raised by', esc(po.createdBy)) : ''}
        ${glRow('Approved', esc(k === 'check' && ap === 'none' ? 'After the VIN and price' : approvedText(po)))}
        ${po.vendorBillNo ? glRow('Supplier bill', esc(po.vendorBillNo)) : ''}
      </div>`;

    const canCancel = can.manage() && !cancelled && k !== 'check' && !payments(po).length && !unitHasVin(po, u);
    const banners = A ? NA.ui.approvalBanners('purchaseOrders', po.id) : '';
    root.innerHTML = ui.pageHead({
      crumbs: [{ label: 'Purchasing', href: '#/procurement' }, { label: 'Emergency purchases', href: '#/procurement?tab=emergency' }, { label: po.code }],
      title: po.code,
      subtitle: `Emergency purchase · ${esc(NA.vendorName(po.vendorId))} · ${esc(NA.modelName(u.modelId))} ${esc(u.color || '')} &nbsp;${stageBadge(po)}`,
      actions: ui.btn('Print', { icon: 'print', act: 'print' }) + (canCancel ? ui.btn('Cancel', { kind: 'danger', act: 'cancel' }) : ''),
    }) + `
      ${banners ? `<div class="pr-block">${banners}</div>` : ''}
      <div class="card pad pr-block">${ui.stepper(EM_STEPS, idx)}</div>
      ${nextStepBox(ns)}
      ${matchHtml}
      <div class="grid grid-main-side">
        <div class="pr-stack">
          <section><div class="glist-title">The car</div>${carHtml}</section>
          <section><div class="glist-title">Customer order</div>${orderHtml}</section>
          <section><div class="glist-title">History</div><div class="card pad">${timeline(po)}</div></section>
        </div>
        <div class="pr-stack">
          ${moneyHtml ? `<section><div class="glist-title">Money</div>${moneyHtml}</section>` : ''}
          <section><div class="glist-title">Payments to the supplier</div>${paysList(po)}</section>
          <section><div class="glist-title">Details</div>${detailsHtml}</section>
        </div>
      </div>`;

    const offs = [ui.delegate(root, 'click', '[data-act]', (el) => {
      const act = el.dataset.act;
      if (act === 'em-confirm') emConfirm(po);
      else if (act === 'em-pay') emPay(po);
      else if (act === 'em-receive') emReceive(po);
      else if (act === 'em-assign' && o && v && typeof NA.actions.assignVehicle === 'function') NA.actions.assignVehicle(v.id, o.id);
      else if (act === 'ask') askAgain(po);
      else if (act === 'print') printPO(freshPO(po));
      else if (act === 'cancel') cancelPO(po);
      else if (act === 'void') { const p = NA.get('vendorPayments', el.dataset.id); if (p) voidPayment(p); }
    })];
    return () => offs.forEach((f) => f());
  }

  /* ------------------------------------------- shared with Accounts and Today */
  /* One rule for supplier money everywhere (finance.js and dashboard.js look these up when they run). */
  NA.purchasing = {
    /** Final payments due now, one row per car: (po?) → [{poId, poCode, unitId, vin, modelId, color, lotNo, amount, since}] */
    releasesDue: (po) => releasesDue(po),
    /** Still owed on a commitment: an approved order that is not cancelled; an emergency purchase once confirmed. */
    owed: (po) => outstanding(po),
    /** The stage an order's records have reached (payments, VINs, arrivals), whatever its saved stage says. */
    stageOf: (po) => computeStage(po),
    /** 'approved' | 'pending' | 'rejected' | 'none' (orders raised before approvals count as approved). */
    approvalOf: (po) => approvalOf(po),
    /** The plan per model: core's demand with "arriving" counted from approved orders only (and "suggested" to match). */
    demand: () => planRows(),
    /** The advance share agreed on an order (0..1): stored on it, else read from its advance payment, else Settings. */
    pctOf: (po) => pctOf(po),
    /** Customer orders where sales asked for an urgent car and no purchase has started yet, oldest request first. */
    urgentAsks: () => urgentAsks(),
  };
})();
