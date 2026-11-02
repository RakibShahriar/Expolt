/* ==========================================================================
   Accounts — #/finance?tab=…&period=month|last|quarter|fy|lastfy|year|all
     overview  What came in, what went out, what we owe and are owed
     money     Money in: customer receipts (cars and service), refunds, the cheque register
     ledger    Customers who owe: after delivery (with ageing), before delivery, refunds due
     revenue   Invoices: cars, service and warranty work (BDT 0)
     expenses  Spending: expense claims, waiting → approved → paid (void, never deleted)
     vendors   Suppliers: what is due now on approved purchase orders, what was paid
     vat       VAT by month and the next return
     pnl       Profit & loss by month (financial year July–June), CSV export
   Accounts and the Managing Director use this screen. Everyone can claim an
   expense: NA.actions.newExpense(prefill) works for every role.
   Also exposes NA.actions.openExpense(id) and NA.finance (the same money figures
   for other screens).
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const B = NA.biz;
  const A = NA.approvals;
  const M = (n) => NA.fmt.money(n);
  const S = (n) => NA.fmt.short(n);
  const num = (x) => Number(x) || 0;
  const sum = (arr, fn) => arr.reduce((s, x) => s + num(fn ? fn(x) : x), 0);
  const day = (d) => String(d || '').slice(0, 10);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const canManage = () => NA.can('finance.manage');   // Accounts and the Managing Director
  const canCost = () => NA.can('costs.view');
  NA.actions = NA.actions || {};

  /* ---------------------------------------------------------------- CSS */
  function injectCss() {
    if (document.getElementById('css-finance')) return;
    const st = document.createElement('style');
    st.id = 'css-finance';
    // Tokens only (light and dark come from app.css). Colour is used for meaning, never for decoration.
    st.textContent = `
      .fx-period { position: relative; display: inline-flex; align-items: center; }
      .fx-period select { -webkit-appearance: none; appearance: none; height: 36px; border: 0; border-radius: 10px; background: var(--fill); color: var(--ink); padding: 0 34px 0 14px; font: inherit; font-weight: 500; cursor: pointer; outline: none; transition: background .15s; }
      .fx-period select:hover { background: var(--fill-2); }
      .fx-period select:focus-visible { box-shadow: var(--focus); }
      .fx-period > .ico { position: absolute; right: 12px; color: var(--muted); pointer-events: none; }
      .fx-sec { margin-top: 36px; }
      .fx-q { margin: 0 0 12px 16px; }
      .fx-q h2 { font-size: 19px; font-weight: 600; letter-spacing: -.015em; }
      .fx-q p { color: var(--muted); font-size: 13px; margin-top: 2px; }
      .fx-cols3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: start; }
      .fx-cols3 .glist-title { margin-top: 22px; }
      .fx-cols3 .fx-q + .glist-title { margin-top: 0; }
      .fx-cols3 .fx-age { margin-top: 12px; }
      .fx-agelegend { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
      .fx-agelegend > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .fx-agelbl { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; }
      .fx-agelegend b { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .fx-agelegend small { color: var(--muted); font-size: 12px; }
      .fx-v { color: var(--ink); font-weight: 500; }
      .fx-v.neg { color: var(--red); }
      .fx-v.pos { color: var(--green); }
      .fx-vsub { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
      .fx-net { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 20px; padding: 16px 20px; border-radius: var(--radius); background: var(--fill-3); }
      .fx-net span { color: var(--muted); }
      .fx-net b { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .fx-chart { display: flex; align-items: stretch; gap: 10px; height: 210px; padding: 30px 4px 30px; }
      .fx-col { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; border-radius: 8px; outline: none; }
      .fx-col-pos, .fx-col-neg { display: flex; justify-content: center; }
      .fx-col-pos { align-items: flex-end; }
      .fx-col-neg { align-items: flex-start; }
      .fx-col i { display: block; width: 100%; max-width: 38px; min-height: 2px; border-radius: 6px 6px 2px 2px; background: var(--fill); transition: background .15s; }
      .fx-col-neg i { border-radius: 2px 2px 6px 6px; }
      .fx-col.hi i { background: var(--tint); }
      .fx-col.neg i { background: var(--red-50); }
      .fx-col.neg.hi i { background: var(--red-solid); }
      .fx-col:hover i, .fx-col:focus-visible i { background: var(--tint-soft-2); }
      .fx-col.hi:hover i { background: var(--tint); }
      .fx-col-val { position: absolute; top: -24px; left: 50%; transform: translateX(-50%); font-size: 12px; font-weight: 600; color: var(--ink); white-space: nowrap; font-variant-numeric: tabular-nums; opacity: 0; transition: opacity .15s; pointer-events: none; }
      .fx-col.hi .fx-col-val, .fx-col:hover .fx-col-val, .fx-col:focus .fx-col-val { opacity: 1; }
      .fx-col-lbl { position: absolute; bottom: -24px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .fx-age { display: flex; gap: 2px; height: 10px; border-radius: 5px; overflow: hidden; background: var(--fill-2); }
      .fx-age span { display: block; height: 100%; }
      .fx-a0 { background: var(--gray-solid); } .fx-a1 { background: var(--amber-solid); } .fx-a2 { background: var(--red-solid); opacity: .6; } .fx-a3 { background: var(--red-solid); }
      .fx-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
      .fx-hb { display: flex; flex-direction: column; gap: 12px; }
      .fx-hb-row { display: grid; grid-template-columns: minmax(96px, 180px) minmax(0, 1fr) auto; align-items: center; gap: 12px; font-size: 13.5px; }
      .fx-hb-row > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fx-hb-track { height: 8px; border-radius: 4px; background: var(--fill-2); overflow: hidden; }
      .fx-hb-track span { display: block; height: 100%; border-radius: 4px; background: var(--tint); }
      .fx-hb-row b { font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .fx-totals { display: flex; flex-wrap: wrap; gap: 8px 22px; padding: 14px 24px; border-top: .5px solid var(--line-2); font-size: 13px; color: var(--muted); }
      .fx-totals b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
      .fx-nomatch { padding: 28px 24px; text-align: center; color: var(--muted); }
      .fx-void td, .fx-muted td { color: var(--muted); }
      .fx-void .fx-amt, .fx-strike { text-decoration: line-through; }
      .fx-alerts { display: flex; flex-direction: column; }
      .fx-alerts .alert-row b { display: block; font-weight: 600; letter-spacing: -.01em; }
      .fx-alerts .alert-row small { display: block; color: var(--muted); font-size: 12.5px; margin-top: 1px; }
      .fx-alerts .alert-row > .ico { color: var(--muted-2); }
      .fx-ar-amber { background: var(--amber-50); color: var(--amber); } .fx-ar-red { background: var(--red-50); color: var(--red); }
      .fx-ar-blue { background: var(--blue-50); color: var(--blue); } .fx-ar-gray { background: var(--gray-50); color: var(--ink-2); } .fx-ar-green { background: var(--green-50); color: var(--green); }
      .fx-steps { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 20px; border-radius: var(--radius); background: var(--fill-3); font-size: 13.5px; color: var(--ink-2); }
      .fx-step { display: flex; align-items: center; gap: 10px; }
      .fx-step b { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 600; box-shadow: var(--shadow-sm); flex: none; }
      .fx-steps > .ico { color: var(--muted-2); }
      .fx-mini .kpi { padding: 14px 16px; }
      .fx-mini .kpi-value { font-size: 22px; margin-top: 4px; }
      .fx-more, .fx-learn { margin-top: 18px; }
      .fx-more > summary, .fx-learn > summary { cursor: pointer; color: var(--tint); font-weight: 500; list-style: none; display: inline-flex; align-items: center; gap: 6px; }
      .fx-more > summary::-webkit-details-marker, .fx-learn > summary::-webkit-details-marker { display: none; }
      .fx-learn > div { margin-top: 12px; color: var(--ink-2); line-height: 1.55; max-width: 760px; }
      .fx-learn ul { margin: 0; padding-left: 18px; }
      .fx-learn li + li { margin-top: 6px; }
      .fx-route { margin-top: 14px; font-size: 13px; color: var(--muted); min-height: 18px; }
      .fx-paidnow { margin-top: 16px; }
      .fx-intro { margin-bottom: 16px; color: var(--muted); }
      .fx-amount { font-family: var(--font-display); font-size: 30px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .fx-sheet > * + * { margin-top: 20px; }
      .fx-sheet .glist-title { margin-bottom: 8px; }
      .fx-ledger td.r, .fx-ledger th.r, .fx-pnl td.r, .fx-pnl th.r { text-align: right; }
      .fx-ledger tr[data-ledger-rcpt] { cursor: pointer; }
      .fx-sum td { font-weight: 600; background: var(--fill-3); }
      .fx-pnl tr.fx-strong td { font-weight: 600; }
      .fx-tb input[type=search] { min-width: 220px; }
      .fx-sm-only { display: none; }
      @media (max-width: 1100px) { .fx-cols3 { grid-template-columns: 1fr; } }
      @media (max-width: 640px) {
        .fx-sm-hide { display: none; }
        .fx-sm-only { display: inline-flex; }
        .gl-row.fx-wrap { flex-wrap: wrap; }
        .gl-row.fx-wrap > .gl-main { min-width: 60%; }
        .gl-row.fx-wrap > .fx-letgo { margin-left: auto; }
        .fx-chart { gap: 6px; } .fx-col-lbl { font-size: 11px; }
        .fx-totals { padding: 12px 18px; }
        .fx-hb-row { grid-template-columns: minmax(80px, 120px) minmax(0, 1fr) auto; }
        .fx-tb input[type=search] { min-width: 0; flex: 1 1 100%; }
        .fx-agelegend { grid-template-columns: 1fr 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- Periods and tabs */
  const PERIODS = [
    { key: 'month', label: 'This month' },
    { key: 'last', label: 'Last month' },
    { key: 'quarter', label: 'This quarter' },
    { key: 'fy', label: 'This financial year' },
    { key: 'lastfy', label: 'Last financial year' },
    { key: 'year', label: 'This calendar year' },
    { key: 'all', label: 'All time' },
  ];
  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'money', label: 'Money in' },
    { key: 'ledger', label: 'Customers who owe' },
    { key: 'revenue', label: 'Invoices' },
    { key: 'expenses', label: 'Spending' },
    { key: 'vendors', label: 'Suppliers' },
    { key: 'vat', label: 'VAT' },
    { key: 'pnl', label: 'Profit & loss' },
  ];
  // Names used by older links and by other screens.
  const TAB_ALIAS = { costs: 'expenses', spending: 'expenses', invoices: 'revenue', customers: 'ledger', owed: 'ledger',
    suppliers: 'vendors', receipts: 'money', payments: 'money', cheques: 'money', profit: 'pnl' };
  const CC_ICONS = { Showroom: 'store', Warehouse: 'warehouse', Workshop: 'wrench', Administration: 'briefcase', Marketing: 'globe' };
  const DEFAULT_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Marketing — Facebook/Google Ads', 'Port & clearing (C&F)', 'Transport & logistics',
    'Workshop tools & consumables', 'Office supplies', 'Fuel & vehicle running', 'Insurance', 'Bank charges', 'Repairs & maintenance',
    'Event — EV test-drive day', 'Licence & government fees', 'Professional fees', 'Entertainment', 'Miscellaneous'];
  // Money going out uses the app's one list (customer receipts use NA.FLOW.paymentMethods).
  const PAY_METHODS = (NA.FLOW && NA.FLOW.payOutMethods) || ['Cash', 'Bank Transfer', 'Cheque', 'Pay Order', 'RTGS', 'Card', 'bKash / Nagad'];
  const ROLE_CENTRE = { sales: 'Showroom', sales_manager: 'Showroom', service: 'Workshop', service_manager: 'Workshop', procurement: 'Warehouse' };

  const pad2 = (n) => String(n).padStart(2, '0');
  const ymKey = (y, m) => { while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return y + '-' + pad2(m + 1); };
  const monthEnd = (k) => { const p = k.split('-').map(Number); return k + '-' + pad2(new Date(p[0], p[1], 0).getDate()); };
  const monthLabel = (k, long) => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' }); };
  const monthRange = (k) => ({ key: 'm', from: k + '-01', to: monthEnd(k), label: monthLabel(k, true) });
  /** Bangladesh's financial year runs 1 July – 30 June. */
  const fyStart = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 7 ? y : y - 1; };
  const fyLabel = (y) => 'FY ' + y + '–' + String(y + 1).slice(2);

  function periodRange(key) {
    const t = NA.today(); const y = +t.slice(0, 4); const m = +t.slice(5, 7) - 1;
    if (key === 'last') { const k = ymKey(y, m - 1); return { key, from: k + '-01', to: monthEnd(k), label: monthLabel(k, true) }; }
    if (key === 'quarter') { const qs = Math.floor(m / 3) * 3; const a = ymKey(y, qs), b = ymKey(y, qs + 2); return { key, from: a + '-01', to: monthEnd(b), label: monthLabel(a) + ' – ' + monthLabel(b) + ' ' + y }; }
    if (key === 'fy' || key === 'lastfy') { const s = fyStart(t) - (key === 'lastfy' ? 1 : 0); return { key, from: s + '-07-01', to: (s + 1) + '-06-30', label: fyLabel(s) }; }
    if (key === 'year') return { key, from: y + '-01-01', to: y + '-12-31', label: String(y) };
    if (key === 'all') return { key, from: '0000-00-00', to: '9999-12-31', label: 'All time' };
    const k = ymKey(y, m); return { key: 'month', from: k + '-01', to: monthEnd(k), label: monthLabel(k, true) };
  }
  const inP = (d, r) => !!d && String(d).slice(0, 10) >= r.from && String(d).slice(0, 10) <= r.to;
  /** Months (yyyy-mm) covered by a range, never past the current month; "all" = every month since the first record. */
  function monthsIn(r) {
    const cur = NA.today().slice(0, 7);
    let start = r.from.slice(0, 7);
    if (r.key === 'all') {
      const dates = [].concat(NA.db.invoices.map((i) => i.date), NA.db.expenses.map((e) => e.date), NA.db.payments.map((p) => p.date), NA.db.vendorPayments.map((p) => p.date))
        .map(day).filter((d) => /^\d{4}-\d\d/.test(d)).sort();
      start = dates.length ? dates[0].slice(0, 7) : cur;
    }
    const end = r.to.slice(0, 7) < cur ? r.to.slice(0, 7) : cur;
    const out = []; const y = +start.slice(0, 4); let m = +start.slice(5, 7) - 1;
    for (let k = ymKey(y, m); k <= end && out.length < 600; m++, k = ymKey(y, m)) out.push(k);
    return out;
  }
  const lastMonths = (n) => { const t = NA.today(); const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1; const out = []; for (let i = n - 1; i >= 0; i--) out.push(ymKey(y, m - i)); return out; };

  /* ---------------------------------------------------------------- Money rules */
  const billable = (inv) => num(inv.total) > 0 && inv.billing !== 'warranty';
  const payLive = (p) => !p.void && p.status !== 'void';
  const vpLive = (p) => !p.void && p.status !== 'void';
  /** 'cleared' | 'pending' | 'bounced' | 'void'. Payments from before confirmation existed have no status: they count. */
  const payState = (p) => (!payLive(p) ? 'void' : B.paymentBounced(p) ? 'bounced' : B.paymentPending(p) ? 'pending' : 'cleared');
  const isCheque = (p) => /cheque|pay order/i.test(p.method || '');
  /** A payment marked "Not received" in the last 30 days (any way of paying). */
  const bouncedLately = (p) => num(p.amount) > 0 && payState(p) === 'bounced' && NA.daysBetween(day(p.verifiedAt || p.date) || NA.today(), NA.today()) <= 30;
  const bookingDate = (o) => day((o.booking && o.booking.date) || o.createdAt) || NA.today();
  const deliveredOn = (o) => day(o.deliveredAt || (o.delivery && o.delivery.date));
  /** A link to a job card only for people who can open Service (Accounts collects nothing there). */
  const jobHref = (id) => (id && NA.canSee('service') ? '#/service/job/' + id : '');
  /* Letting a car go before its service bill is paid: the Service Manager's, Accounts' or the Managing Director's call.
     service.js does it (NA.actions.allowServiceCredit) and keeps it on the bill as inv.credit. Offered only while the
     car is still at the workshop and Service still counts money as due, so the sheet it opens never refuses. */
  const CREDIT_WORDS = 'Let the car go before it is paid';   // the same words as on the job card
  const svcDue = (inv) => (NA.service && typeof NA.service.invDue === 'function' ? num(NA.service.invDue(inv)) : Math.max(0, num(inv.total) - num(inv.paid)));
  function carAtWorkshop(inv) {
    const jc = inv && inv.refId ? NA.get('jobCards', inv.refId) : null;
    if (!jc || jc.status !== 'invoiced') return false;
    return !(NA.service && typeof NA.service.isReleased === 'function' ? NA.service.isReleased(jc) : jc.release || jc.releasedAt);
  }
  const canLetGo = (inv) => !!inv && inv.kind !== 'vehicle' && billable(inv) && !inv.credit && typeof NA.actions.allowServiceCredit === 'function'
    && (NA.isRole('accounts') || NA.can('service.approve')) && svcDue(inv) > 0.5 && carAtWorkshop(inv);
  const letGo = (id) => { if (typeof NA.actions.allowServiceCredit === 'function') NA.actions.allowServiceCredit(id); };
  const letGoBtn = (attrs) => `<button class="btn btn-ghost btn-sm fx-letgo" ${attrs}>${esc(CREDIT_WORDS)}</button>`;
  /** Who let the car go before the bill was paid, for the lines that show the debt. */
  const creditText = (inv) => (inv && inv.credit ? 'car let go before it was paid' + (inv.credit.by ? ' by ' + inv.credit.by : '') : '');
  const ratePct = (r) => NA.fmt.pct(r, Math.round(r * 1000) % 10 ? 1 : 0);
  const vatRate = () => num(NA.db.settings.vatRate);
  /** The VAT contained in an amount that includes VAT. */
  const vatInside = (amount, rate) => { rate = rate == null ? vatRate() : rate; return Math.round(num(amount) * rate / (1 + rate)); };
  /** Workshop receipts recorded for Accounts to confirm (payments with an invoiceId and no order), by invoice. */
  function svcPayIndex() {
    const m = new Map();
    NA.db.payments.forEach((p) => { if (p.invoiceId && !p.orderId) { const l = m.get(p.invoiceId) || []; l.push(p); m.set(p.invoiceId, l); } });
    return m;
  }
  /** Money taken on a service bill, one line per receipt with the payment Accounts confirms (by paymentId; older
      receipts by amount and date) and its status. service.js keeps inv.paid as the amount taken less the receipts
      marked bounced on the bill, so money on the bill without a receipt (older bills) is the only part counted from
      inv.paid — as confirmed, on the bill date. */
  function svcLines(inv, idx) {
    const pool = ((idx instanceof Map ? idx : svcPayIndex()).get(inv.id) || []).slice();
    const take = (p) => { const k = p ? pool.indexOf(p) : -1; if (k >= 0) pool.splice(k, 1); return p || null; };
    const rc = Array.isArray(inv.receipts) ? inv.receipts.filter((x) => num(x.amount) > 0) : [];
    // Receipts that name their payment first, so an older receipt matched by amount never takes someone else's.
    const pays = rc.map((x) => (x.paymentId ? take(pool.find((y) => y.id === x.paymentId)) || NA.get('payments', x.paymentId) : undefined));
    rc.forEach((x, i) => {
      if (pays[i] !== undefined) return;
      const amt = num(x.amount), d = day(x.date || inv.date);
      pays[i] = take(pool.find((y) => Math.abs(num(y.amount) - amt) < 0.5 && day(y.date) === d) || pool.find((y) => Math.abs(num(y.amount) - amt) < 0.5));
    });
    const out = rc.map((x, i) => {
      const p = pays[i];
      // A receipt marked bounced on the bill (service.js syncBounce) stays bounced even when its payment is not found.
      return { date: day(x.date || inv.date), amount: num(x.amount), method: x.method || (p && p.method) || '', ref: x.ref || (p && p.ref) || '', p, status: p ? payState(p) : x.bounced ? 'bounced' : 'cleared' };
    });
    // inv.paid already leaves out the receipts marked bounced on the bill, so only the others are taken off it.
    const legacy = Math.min(num(inv.paid), num(inv.total)) - sum(rc.filter((x) => !x.bounced), (x) => x.amount);
    if (legacy > 0.5) out.push({ date: day(inv.date), amount: legacy, method: '', ref: '', p: null, status: 'cleared' });
    return out;
  }
  /** What a service bill has been paid: confirmed money only, and what is waiting for Accounts (bounced money is owed again). */
  function svcMoney(inv, idx) {
    const L = svcLines(inv, idx);
    return { paid: Math.min(num(inv.total), sum(L.filter((x) => x.status === 'cleared'), (x) => x.amount)), waiting: sum(L.filter((x) => x.status === 'pending'), (x) => x.amount) };
  }
  /** Confirmed money on an invoice: the order's confirmed payments for a car, the confirmed receipts for service. */
  function invPaid(inv, idx) {
    if (inv.kind === 'vehicle') { const o = NA.get('orders', inv.refId); return Math.min(num(inv.total), o ? B.orderPaid(o) : num(inv.paid)); }
    return svcMoney(inv, idx).paid;
  }
  /** Money handed in on an invoice that Accounts has not confirmed yet. */
  function invWaiting(inv, idx) {
    if (inv.kind === 'vehicle') { const o = NA.get('orders', inv.refId); return o ? B.orderPending(o) : 0; }
    return svcMoney(inv, idx).waiting;
  }
  /** Service money collected inside a period, read from the service invoices (so it is never counted twice; a due
      invoice collected later counts when collected). Only confirmed money counts as money in. */
  function svcReceipts(r) {
    const idx = svcPayIndex();
    const out = [];
    NA.db.invoices.forEach((i) => {
      if (i.kind === 'vehicle' || !billable(i)) return;
      svcLines(i, idx).forEach((x) => {
        if (!inP(x.date, r)) return;
        out.push({ kind: 'service', inv: i, p: x.p, date: x.date, no: (x.p && x.p.receiptNo) || i.no, customerId: i.customerId, status: x.status, method: x.method, ref: x.ref, amount: x.amount });
      });
    });
    return out;
  }
  const ALL_TIME = { key: 'all', from: '0000-00-00', to: '9999-12-31', label: 'All time' };
  /** Cost of a car sold: the cost stored when it was sold or the car's own landed cost. Older cars without either use
      today's catalogue cost — flagged as an estimate so a catalogue change never silently rewrites past margins. */
  function carCost(inv) {
    if (num(inv.costAtSale)) return { cost: num(inv.costAtSale), est: false };
    const o = NA.get('orders', inv.refId);
    const v = o && NA.vehicle(o.vehicleId);
    const own = v ? num(v.landedCost) || num(v.cost) || num(v.purchaseCost) : 0;
    if (own) return { cost: own, est: false };
    const m = o && NA.model(o.modelId);
    return { cost: m ? num(m.cost) : 0, est: true };
  }
  function vpKind(p) {
    const k = String(p.kind || '');
    if (/advance/i.test(k)) return 'advance';
    if (/release/i.test(k)) return 'release';
    return 'other';
  }
  /** The VAT rate an invoice was issued at: stored on new invoices; older ones worked out from their own figures. */
  function invRate(inv) {
    if (inv.vatRate != null && inv.vatRate !== '' && !isNaN(Number(inv.vatRate))) return Number(inv.vatRate);
    if (num(inv.subtotal) > 0 && num(inv.vat) > 0) return Math.round((num(inv.vat) / num(inv.subtotal)) * 200) / 200;
    return vatRate();
  }

  /* Expenses: a claim waits for approval → approved → paid. Older expenses have no status: they were paid.
     Only approved and paid expenses are in the books; money has gone out only when paid. */
  const expStatus = (e) => e.status || 'paid';
  const expCounts = (e) => ['approved', 'paid'].includes(expStatus(e));
  const expIsPaid = (e) => expStatus(e) === 'paid';
  const expPaidOn = (e) => day(e.paidOn || e.date);
  const OLD_METHODS = Array.from(new Set(PAY_METHODS.concat((NA.FLOW && NA.FLOW.paymentMethods) || [], ['TT'])));
  const expMethod = (e) => e.method || (OLD_METHODS.includes(e.paidBy) ? e.paidBy : '');   // older records kept the method in paidBy
  const expPayer = (e) => (e.paidBy && !OLD_METHODS.includes(e.paidBy) ? e.paidBy : '');
  const expClaimant = (e) => { const n = e.requestedBy || (e.ownerId ? NA.staffName(e.ownerId) : ''); return n && n !== '—' ? n : ''; };
  /** VAT on a bill that can be claimed back: it needs the Mushak 6.3 number (older records without a status count). */
  const vatClaim = (e) => (!e.status || e.mushak ? num(e.vatPaid) : 0);
  const expCost = (e) => num(e.amount) - vatClaim(e);   // claimable input VAT is not a cost; VAT that cannot be claimed is
  /** The payroll month an expense pays, if it is a salary payment from People → Payroll. */
  function payrollMonth(e) {
    if (e.payrollMonth) return e.payrollMonth;
    const m = /^PAYROLL-(\d{4}-\d{2})/.exec(e.ref || '');
    if (m) return m[1];
    const P = NA.db.payroll && typeof NA.db.payroll === 'object' ? NA.db.payroll : {};
    return Object.keys(P).find((k) => P[k] && P[k].expenseId === e.id) || null;
  }

  /** Work the workshop did on our own cars (closed internal job cards): a workshop cost, never billed to anyone. */
  const ownWorkDate = (jc) => day(jc.closedAt || jc.completedAt || jc.updatedAt);
  const ownWorkValue = (jc) => (jc.internal && jc.internal.value != null && jc.internal.value !== '' ? num(jc.internal.value)
    : typeof B.jobTotals === 'function' ? num(B.jobTotals(jc).internalCost) : 0);
  const ownWork = (r) => NA.db.jobCards.filter((jc) => jc.status === 'closed' && (jc.billing === 'internal' || !jc.customerId) && inP(ownWorkDate(jc), r));

  /** Money in, money out and the books for a period. One definition, used by every tile and its drill-down. */
  function summary(r) {
    const inv = NA.db.invoices.filter((i) => inP(i.date, r));
    const rev = inv.filter(billable);
    const veh = rev.filter((i) => i.kind === 'vehicle');
    const svc = rev.filter((i) => i.kind !== 'vehicle');
    const warranty = inv.filter((i) => i.billing === 'warranty');
    // Car receipts are payments against an order; service money comes from the service invoices (never counted twice).
    const carPays = NA.db.payments.filter((p) => p.orderId && num(p.amount) > 0 && inP(p.date, r));
    const carIn = sum(carPays.filter((p) => payState(p) === 'cleared'), (p) => p.amount);
    const svcRows = svcReceipts(r);
    const svcIn = sum(svcRows.filter((x) => x.status === 'cleared'), (x) => x.amount);
    // BYD pays warranty claims to us: the workshop records the amount and the date it arrived.
    const byd = claims().filter((c) => c.status === 'paid' && inP(c.paidAt, r));
    const bydIn = sum(byd, (c) => c.paid);
    const own = ownWork(r);
    const ownCost = sum(own, ownWorkValue);
    const refunds = NA.db.payments.filter((p) => num(p.amount) < 0 && payState(p) === 'cleared' && inP(p.date, r));
    const booked = NA.db.expenses.filter((e) => expCounts(e) && inP(e.date, r));
    const paidExp = NA.db.expenses.filter((e) => expIsPaid(e) && inP(expPaidOn(e), r));
    const vps = NA.db.vendorPayments.filter((p) => vpLive(p) && inP(p.date, r));
    const costs = veh.map(carCost);
    const vehEx = sum(veh, (i) => i.subtotal), svcEx = sum(svc, (i) => i.subtotal);
    const cogs = sum(costs, (c) => c.cost);
    const spend = sum(booked, expCost);
    const out = { suppliers: sum(vps, (p) => p.amount), spending: sum(paidExp, (e) => e.amount), refunds: sum(refunds, (p) => -num(p.amount)) };
    const vatOut = sum(rev, (i) => i.vat), vatIn = sum(booked, vatClaim);
    return {
      r, inv, rev, veh, svc, warranty, carPays, svcRows, refunds, booked, paidExp, vps, byd, own,
      carIn, svcIn, bydIn, moneyIn: carIn + svcIn + bydIn,
      bounced: sum(carPays.filter((p) => payState(p) === 'bounced'), (p) => p.amount) + sum(svcRows.filter((x) => x.status === 'bounced'), (x) => x.amount),
      out, moneyOut: out.suppliers + out.spending + out.refunds,
      vehEx, svcEx, salesEx: vehEx + svcEx, cogs, costEstimates: costs.filter((c) => c.est).length,
      gross: vehEx + svcEx - cogs, spend, ownCost, net: vehEx + svcEx - cogs - spend - ownCost,
      vatOut, vatIn, vatNet: vatOut - vatIn, warrantyCost: sum(warranty, (i) => num(i.internalCost) || num(i.subtotal)),
    };
  }

  /* ---------------------------------------------------------------- Who owes what */
  /** Customers' debts. After delivery = real debts (aged from the delivery or invoice date); before delivery = the
      balance to collect before the car goes. Confirmed money only; money waiting for Accounts is shown beside it. */
  function receivables() {
    const after = [], before = [];
    const today = NA.today();
    NA.db.orders.forEach((o) => {
      if (o.stage === 'cancelled') return;
      const bal = B.orderBalance(o);
      if (bal <= 0.5) return;
      const base = { kind: 'car', o, id: o.id, customerId: o.customerId, amount: bal, waiting: B.orderPending(o), ref: o.code, what: NA.modelName(o.modelId), href: '#/sales/' + o.id };
      if (o.stage === 'delivered') {
        const since = deliveredOn(o) || bookingDate(o);
        after.push(Object.assign(base, { since, days: Math.max(0, NA.daysBetween(since, today)) }));
      } else before.push(Object.assign(base, { since: bookingDate(o), days: Math.max(0, NA.daysBetween(bookingDate(o), today)) }));
    });
    const idx = svcPayIndex();
    NA.db.invoices.forEach((i) => {
      if (i.kind === 'vehicle' || !billable(i)) return;
      const m = svcMoney(i, idx);
      const due = num(i.total) - m.paid;
      if (due <= 0.5) return;
      const since = day(i.date) || today;
      after.push({ kind: 'service', inv: i, id: i.id, customerId: i.customerId, amount: due, waiting: m.waiting, since, days: Math.max(0, NA.daysBetween(since, today)), ref: i.no, what: 'Service', href: jobHref(i.refId) });
    });
    after.sort((a, b) => b.days - a.days || b.amount - a.amount);
    before.sort((a, b) => b.amount - a.amount);
    return { after, before };
  }
  const AGE = [{ label: '0–30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }, { label: 'Over 90 days', max: Infinity }];
  function ageing(items) {
    const b = AGE.map((x) => ({ label: x.label, amount: 0, n: 0 }));
    items.forEach((it) => { const k = AGE.findIndex((x) => it.days <= x.max); b[k].amount += it.amount; b[k].n++; });
    return b;
  }
  /** Approved cancellations whose refund Accounts has not paid yet. */
  const refundsDue = () => NA.db.orders.filter((o) => o.refund && o.refund.status === 'due' && num(o.refund.amount) > 0);

  /** Warranty work claimed from BYD: from the job card's claim (Service), else from the BDT 0 warranty invoice. */
  const CLAIM = { not_filed: ['Not claimed yet', 'amber', 'clock'], filed: ['Claimed from BYD', 'blue', 'file-text'], approved: ['Approved by BYD', 'blue', 'check'], paid: ['Paid by BYD', 'green', 'check'], rejected: ['Rejected by BYD', 'red', 'x'] };
  function claimRow(jc, inv) {
    const c = (jc && jc.claim) || {};
    const cost = num(inv && (inv.internalCost || inv.subtotal)) || num(c.amount);
    const status = CLAIM[c.status] ? c.status : (inv && inv.claimRef ? 'filed' : 'not_filed');
    const amount = num(c.amount) || cost;
    const owed = status === 'filed' ? amount : status === 'approved' ? (num(c.approvedAmount) || amount) : 0;
    return { jc, inv, status, no: c.no || (inv && inv.claimRef) || '', amount, owed, date: day((inv && inv.date) || c.filedAt || (jc && jc.completedAt)), customerId: (inv && inv.customerId) || (jc && jc.customerId),
      // What BYD paid and when it arrived (recorded by the workshop under BYD claims).
      paid: status === 'paid' ? num(c.paidAmount) || num(c.approvedAmount) || amount : 0, paidAt: status === 'paid' ? day(c.paidAt) : '', payRef: c.ref || '' };
  }
  function claims() {
    const byJob = new Map();
    NA.db.invoices.forEach((i) => { if (i.kind !== 'vehicle' && i.billing === 'warranty' && i.refId) byJob.set(i.refId, i); });
    const out = [], seen = new Set();
    NA.db.jobCards.forEach((jc) => {
      const inv = byJob.get(jc.id);
      const hasClaim = !!(jc.claim && jc.claim.status);
      if (!inv && !hasClaim) return;                 // warranty work not finished yet
      seen.add(jc.id);
      out.push(claimRow(jc, inv));
    });
    byJob.forEach((inv, jid) => { if (!seen.has(jid)) out.push(claimRow(null, inv)); });
    return out;
  }

  /* Suppliers. Mirrors Purchasing: a cancelled PO, or an emergency PO that CG Runner has not confirmed yet, owes
     nothing. Only a commitment is owed, and money is due now, once the Managing Director approved the PO. */
  function poApproval(po) {
    if (typeof B.poApproval === 'function') return B.poApproval(po);   // the shared rule (Purchasing's when loaded)
    const kind = po.type === 'emergency' ? 'emergency' : 'po';
    if (kind === 'po' && NA.policy().poApproval === false) return 'approved';
    const st = A ? A.state('purchaseOrders', po.id, kind) : 'none';
    if (st !== 'none') return st;
    if (po.approval && po.approval.status && po.approval.status !== 'cancelled') return po.approval.status;
    if (po.approvedAt || po.approvedBy) return 'approved';
    const start = NA.db.settings.policyStart;
    return start && day(po.createdAt) < start ? 'approved' : 'none';   // raised before approvals existed
  }
  const advPct = (po) => num(po && po.advancePct) || num(NA.db.settings.advancePct) || 0.3;
  const pctTxt = (x) => Math.round(x * 100) + '%';
  const cleanVin = (v) => String(v || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  /** Has this car's final (or full) payment been made? A live payment for the car decides; older cars without one
      count when the order marks them paid. Mirrors Purchasing. */
  function unitPaid(po, u, all) {
    const ps = all.filter((p) => (vpKind(p) === 'release' || /^(final|full)/i.test(p.kind || '')) && (p.unitId ? p.unitId === u.id : !!u.vin && !!p.vin && cleanVin(p.vin) === cleanVin(u.vin)));
    return ps.length ? ps.some(vpLive) : !!u.releasePaidAt;
  }
  /** Final payments due now, one per car: the car is in a shipment batch, the advance is paid, the order is approved
      and the car has no live final payment yet. Purchasing's own list is used when it offers one. */
  function releasesDue(po, ctx) {
    const P = NA.purchasing;
    if (P && typeof P.releasesDue === 'function') {
      try {
        const r = P.releasesDue(po);
        const list = Array.isArray(r) ? r : r && Array.isArray(r.units) ? r.units : null;
        if (list) {
          const units = po.units || [];
          return list.map((x) => {
            const unit = x.unit || (x.unitId ? units.find((u) => u.id === x.unitId) : null) || (x.unitCost != null ? x : null);
            const poId = x.poId || (x.po && x.po.id) || (unit && units.some((u) => u === unit || u.id === unit.id) ? po.id : null);
            return poId === po.id && unit ? { unit, amount: num(x.amount) || Math.round(num(unit.unitCost) * (1 - ctx.pct)) } : null;
          }).filter(Boolean);
        }
      } catch (e) { console.error(e); }
    }
    if (!(ctx.advNeeded > 0 && ctx.adv >= ctx.advNeeded - 1)) return [];
    return (po.units || []).filter((u) => u.lotNo && !unitPaid(po, u, ctx.all)).map((u) => ({ unit: u, amount: Math.round(num(u.unitCost) * (1 - ctx.pct)) }));
  }
  /** Still owed to the supplier: only a commitment counts. Purchasing's rule (NA.purchasing.owed, the one Today uses)
      when it is loaded; otherwise what is left on an approved order. Waiting, declined or never sent: nothing is owed. */
  function poOwed(po, approval, left) {
    const P = NA.purchasing;
    if (P && typeof P.owed === 'function') {
      try { const v = Number(P.owed(po)); if (isFinite(v)) return Math.max(0, v); } catch (e) { console.error(e); }
    }
    return approval === 'approved' ? left : 0;
  }
  function poStats(po) {
    const all = NA.db.vendorPayments.filter((p) => p.poId === po.id);
    const pays = all.filter(vpLive);
    const total = B.poTotal(po);
    const pct = advPct(po);
    const adv = sum(pays.filter((p) => vpKind(p) === 'advance'), (p) => p.amount);
    const rel = sum(pays.filter((p) => vpKind(p) === 'release'), (p) => p.amount);
    const other = sum(pays.filter((p) => vpKind(p) === 'other'), (p) => p.amount);
    const paid = adv + rel + other;
    const cancelled = po.stage === 'cancelled' || po.status === 'cancelled';
    const unconfirmed = po.type === 'emergency' && po.stage === 'check';
    const live = !cancelled && !unconfirmed;
    const approval = poApproval(po);
    const left = live ? Math.max(0, total - paid) : 0;            // left to pay on the order, approved or not
    const outstanding = live ? poOwed(po, approval, left) : 0;    // owed: commitments only
    const overpaid = total > 0 && paid - total > 0.5 ? paid - total : 0;
    const advNeeded = po.type === 'emergency' ? 0 : Math.round(total * pct);
    const due = [];
    if (live && approval === 'approved' && outstanding >= 100) {
      if (po.type === 'emergency') { if (['confirmed', 'paid'].includes(po.stage)) due.push({ what: 'Full payment', amount: outstanding }); }
      else {
        const advLeft = advNeeded - adv;
        if (advLeft >= 100) due.push({ what: pctTxt(pct) + ' advance', amount: advLeft });
        const cars = releasesDue(po, { pct, adv, advNeeded, all });
        const relLeft = sum(cars, (x) => x.amount);
        if (relLeft >= 100) due.push({ what: pctTxt(1 - pct) + ' for ' + plural(cars.length, 'car') + ' in a shipment batch', amount: relLeft });
      }
    }
    const dueNow = Math.min(outstanding, sum(due, (d) => d.amount));
    return { po, total, pct, adv, rel, other, paid, left, outstanding, overpaid, cancelled, unconfirmed, live, approval, due, dueNow,
      released: (po.units || []).filter((u) => unitPaid(po, u, all)).length, units: (po.units || []).length, advNeeded };
  }

  /** Parts bills: a parts order the workshop has received in full is a bill to pay its supplier. Accounts records the
      payment here (a supplier payment with the parts order's id). */
  function partBills() {
    const paidOn = new Map();
    NA.db.vendorPayments.forEach((p) => { if (p.partOrderId && vpLive(p)) paidOn.set(p.partOrderId, (paidOn.get(p.partOrderId) || 0) + num(p.amount)); });
    return (NA.db.partOrders || []).filter((o) => o.status === 'received').map((o) => {
      const rc = Array.isArray(o.receipts) ? o.receipts : [];
      const value = sum(rc, (x) => x.value) || num(o.total);
      const paid = paidOn.get(o.id) || 0;
      const bills = Array.from(new Set(rc.map((x) => x.billRef).concat([o.billRef]).filter(Boolean)));
      return { o, vendorId: o.vendorId, value, paid, owed: Math.max(0, value - paid), bills, date: day(o.receivedAt || (rc.length ? rc[rc.length - 1].date : o.date)) };
    });
  }

  /* ---------------------------------------------------------------- Customer statements */
  /** Orders, receipts and service invoices grouped by customer once (so the list is not customers × records). */
  function byCustomer() {
    const idx = new Map();
    const get = (cid) => { let x = idx.get(cid); if (!x) idx.set(cid, (x = { orders: [], payments: [], invoices: [], svc: [] })); return x; };
    NA.db.orders.forEach((o) => { if (o.customerId) get(o.customerId).orders.push(o); });
    NA.db.payments.forEach((p) => { if (p.customerId && p.orderId) get(p.customerId).payments.push(p); });
    NA.db.invoices.forEach((i) => { if (i.customerId && i.kind !== 'vehicle' && num(i.total) > 0) get(i.customerId).invoices.push(i); });
    svcReceipts(ALL_TIME).forEach((x) => { if (x.customerId) get(x.customerId).svc.push(x); });
    return idx;
  }
  /** A customer's statement: what was charged, what was paid (confirmed money only) and the running balance.
      Cancelled orders charge nothing; money kept as a cancellation charge and refunds paid are shown as lines. */
  function ledgerFor(cid, idx) {
    const g = (idx || byCustomer()).get(cid) || { orders: [], payments: [], invoices: [], svc: [] };
    const rows = [];
    g.orders.forEach((o) => {
      if (o.stage !== 'cancelled') {
        rows.push({ date: bookingDate(o), kind: 'order', ref: o.code, href: '#/sales/' + o.id, charged: B.orderNet(o), paid: 0,
          text: 'Car · ' + NA.modelName(o.modelId) + (num(o.discount) ? ' (after ' + M(o.discount) + ' off)' : '') });
      } else {
        // Confirmed money on a cancelled order that is not refunded is kept. No refund on the order means ৳0 was
        // approved (the booking was forfeited); older orders without one count the refunds actually paid.
        const mine = g.payments.filter((p) => p.orderId === o.id && payState(p) === 'cleared');
        const refunded = o.refund ? num(o.refund.amount) : sum(mine.filter((p) => num(p.amount) < 0), (p) => -num(p.amount));
        const kept = sum(mine.filter((p) => num(p.amount) > 0), (p) => p.amount) - refunded;
        if (kept > 0.5) rows.push({ date: day((o.cancel && o.cancel.date) || o.cancelledAt || o.updatedAt) || bookingDate(o), kind: 'charge', ref: o.code, href: '#/sales/' + o.id, charged: kept, paid: 0, text: 'Order cancelled · kept as cancellation charge' });
      }
    });
    g.payments.forEach((p) => {
      const o = NA.get('orders', p.orderId);
      const st = payState(p), amt = num(p.amount), refund = amt < 0;
      rows.push({ date: day(p.date), kind: refund ? 'refund' : 'payment', status: st, ref: p.receiptNo || '', href: o ? '#/sales/' + o.id : '', payId: p.id, amount: Math.abs(amt),
        text: (refund ? 'Refund paid' : 'Paid') + (p.method ? ' · ' + p.method : '') + (o ? ' · ' + o.code : '') + (p.ref ? ' · ' + p.ref : ''),
        charged: st === 'cleared' && refund ? -amt : 0, paid: st === 'cleared' && !refund ? amt : 0 });
    });
    g.invoices.forEach((i) => {
      rows.push({ date: day(i.date), kind: 'invoice', ref: i.no, href: jobHref(i.refId), invId: i.id, text: 'Service', charged: num(i.total), paid: 0 });
    });
    g.svc.forEach((x) => rows.push({ date: x.date, kind: 'svcpay', status: x.status, ref: x.no, href: jobHref(x.inv.refId), invId: x.inv.id, payId: x.p ? x.p.id : null,
      amount: x.amount, charged: 0, paid: x.status === 'cleared' ? x.amount : 0, text: 'Service paid' + (x.method ? ' · ' + x.method : '') + (x.ref ? ' · ' + x.ref : '') }));
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (b.charged - a.charged));
    let bal = 0;
    rows.forEach((x) => { bal += x.charged - x.paid; x.balance = bal; });
    return { rows, charged: sum(rows, (x) => x.charged), paid: sum(rows, (x) => x.paid), balance: bal, waiting: sum(rows.filter((x) => x.status === 'pending'), (x) => x.amount) };
  }
  function customerBalances(idx) {
    idx = idx || byCustomer();
    return NA.db.customers.filter((c) => idx.has(c.id)).map((c) => Object.assign({ c }, ledgerFor(c.id, idx))).filter((x) => x.rows.length);
  }

  /* ---------------------------------------------------------------- VAT */
  function vatMonth(k) {
    const mr = monthRange(k);
    const rev = NA.db.invoices.filter((i) => inP(i.date, mr) && billable(i));
    const exps = NA.db.expenses.filter((e) => expCounts(e) && inP(e.date, mr));
    const outV = sum(rev.filter((i) => i.kind === 'vehicle'), (i) => i.vat), outS = sum(rev.filter((i) => i.kind !== 'vehicle'), (i) => i.vat);
    const inV = sum(exps, vatClaim);   // a bill without its Mushak 6.3 number cannot be claimed yet
    return { key: k, label: monthLabel(k), long: monthLabel(k, true), outV, outS, out: outV + outS, in: inV, net: outV + outS - inV,
      sales: sum(rev, (i) => i.subtotal), due: NA.addMonths(k + '-15', 1), noMushak: exps.filter((e) => e.status && num(e.vatPaid) > 0 && !e.mushak).length,
      ended: k < NA.today().slice(0, 7), filed: vatReturnFor(k) };
  }
  /** The Mushak 9.1 return Accounts marked as filed for a month (yyyy-mm), if any. Filing never locks the month. */
  const vatReturnFor = (k) => (NA.db.vatReturns || []).filter((x) => x.month === k && !x.void)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  /** The next Mushak 9.1 return: last month's until it is marked filed (overdue after the 15th); then this month's so far. */
  function nextVatReturn() {
    const t = NA.today(); const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1;
    const busy = (v) => v.out > 0 || v.in > 0;
    const last = vatMonth(ymKey(y, m - 1));
    const v = busy(last) && !last.filed ? Object.assign(last, { partial: false }) : Object.assign(vatMonth(ymKey(y, m)), { partial: true });
    return Object.assign(v, { active: busy(v) && !v.filed, daysLeft: NA.daysBetween(t, v.due) });
  }

  /* ---------------------------------------------------------------- Small UI pieces */
  /** One chart for the whole screen: a column per month, the latest highlighted, the value on hover or tap. */
  function colChart(data, label) {
    if (!data.length || data.every((d) => !num(d.value))) return NA.ui.empty('Nothing to show for these months yet', 'chart');
    const maxPos = Math.max(0, ...data.map((d) => num(d.value)));
    const maxNeg = Math.max(0, ...data.map((d) => -num(d.value)));
    const posPct = (maxPos / ((maxPos + maxNeg) || 1)) * 100;
    return `<div class="fx-chart" role="img" aria-label="${esc(label)}">${data.map((d, i) => {
      const v = num(d.value), neg = v < 0;
      const h = neg ? (-v / (maxNeg || 1)) * 100 : (v / (maxPos || 1)) * 100;
      return `<div class="fx-col${i === data.length - 1 ? ' hi' : ''}${neg ? ' neg' : ''}" tabindex="0" title="${esc(d.label)}: ${esc(M(v))}">
        <span class="fx-col-val">${neg ? '−' : ''}${esc(S(Math.abs(v)))}</span>
        <div class="fx-col-pos" style="height:${posPct.toFixed(2)}%">${neg ? '' : `<i style="height:${h.toFixed(2)}%"></i>`}</div>
        <div class="fx-col-neg" style="height:${(100 - posPct).toFixed(2)}%">${neg ? `<i style="height:${h.toFixed(2)}%"></i>` : ''}</div>
        <span class="fx-col-lbl">${esc(d.label)}</span></div>`;
    }).join('')}</div>`;
  }
  /** Simple ranked bars (spending by category). */
  function hbars(rows) {
    if (!rows.length) return NA.ui.empty('Nothing recorded in this period', 'chart');
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
    return `<div class="fx-hb">${rows.map((r) => `<div class="fx-hb-row">
      <span>${esc(r.label)}</span>
      <div class="fx-hb-track"><span style="width:${((Math.abs(r.value) / max) * 100).toFixed(2)}%"></span></div>
      <b>${M(r.value)}</b></div>`).join('')}</div>`;
  }
  /** Receivables by age: a stacked bar and one row per bucket. */
  function ageBar(b) {
    const total = sum(b, (x) => x.amount);
    if (!total) return '';
    return `<div class="fx-age" role="img" aria-label="Owed after delivery by age">${b.map((x, i) => (x.amount > 0 ? `<span class="fx-a${i}" style="width:${((x.amount / total) * 100).toFixed(2)}%" title="${esc(x.label)}: ${esc(M(x.amount))}"></span>` : '')).join('')}</div>`;
  }
  const ageLegend = (b) => `<div class="fx-agelegend">${b.map((x, i) => `<div><span class="fx-agelbl"><span class="fx-dot fx-a${i}"></span>${esc(x.label)}</span><b class="${i >= 2 && x.amount > 0 ? 'tone-red' : ''}">${M(x.amount)}</b><small>${x.n ? esc(plural(x.n, 'item')) : 'Nothing'}</small></div>`).join('')}</div>`;
  const card = (title, icon, body, right = '', cls = '') => `<section class="card ${cls}"><header class="card-head"><h3>${icon ? NA.icon(icon, 17) : ''}${esc(title)}</h3><div class="row wrap">${right}</div></header>${body}</section>`;
  /** One row of a grouped list. sub, value and right are html; title is text. */
  function glRow(o) {
    const tag = o.href ? 'a' : o.act ? 'button' : 'div';
    const attrs = o.href ? `href="${esc(o.href)}"` : o.act ? `type="button" data-act="${esc(o.act)}"${o.id ? ` data-id="${esc(o.id)}"` : ''}` : '';
    return `<${tag} class="gl-row${o.icon ? ' has-icon' : ''}${o.cls ? ' ' + esc(o.cls) : ''}" ${attrs}>
      ${o.icon ? `<span class="gl-icon bg-gray">${NA.icon(o.icon, 17)}</span>` : ''}${o.dot != null ? `<span class="fx-dot fx-a${o.dot}"></span>` : ''}
      <div class="gl-main"><b>${esc(o.title)}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</div>
      ${o.value != null ? `<span class="gl-value"><span class="fx-v${o.tone ? ' ' + o.tone : ''}">${o.value}</span>${o.valueSub ? `<span class="fx-vsub">${o.valueSub}</span>` : ''}</span>` : ''}
      ${o.right || ''}${o.href || o.act ? NA.icon('chevron-right', 16, 'gl-chev') : ''}</${tag}>`;
  }
  const group = (title, rows, foot) => (rows ? `${title ? `<div class="glist-title">${esc(title)}</div>` : ''}<div class="glist">${rows}</div>${foot ? `<p class="glist-foot">${foot}</p>` : ''}` : '');
  const lockNote = (text) => `<div class="lock-note">${NA.icon('lock', 14)}<span>${esc(text)}</span></div>`;
  const nextStep = (icon, title, sub, action) => `<div class="next-step"><span class="ns-icon">${NA.icon(icon, 20)}</span><div class="ns-text"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${action || ''}</div>`;
  const chip = (href, label, n, active) => `<a class="chip${active ? ' active' : ''}" href="${esc(href)}">${esc(label)}${n != null ? ` <span class="n">${n}</span>` : ''}</a>`;
  const searchBox = (key, value, placeholder) => `<input type="search" data-search="${esc(key)}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"/>`;
  const rowKeys = (...xs) => xs.filter(Boolean).join(' ').toLowerCase();

  const INV_STATE = { paid: ['Paid', 'green', 'check'], waiting: ['Waiting for Accounts', 'amber', 'clock'], part: ['Part-paid', 'amber', 'clock'], unpaid: ['Unpaid', 'red', 'alert'], warranty: ['Warranty · ৳0', 'gray', 'shield'] };
  function invState(inv) {
    if (!billable(inv)) return 'warranty';
    const p = invPaid(inv), t = num(inv.total);
    if (p >= t - 0.5) return 'paid';
    if (p + invWaiting(inv) >= t - 0.5) return 'waiting';   // the rest is handed in, not confirmed yet
    return p > 0.5 ? 'part' : 'unpaid';
  }
  const invStateText = (inv) => { const s = invState(inv); return s === 'unpaid' && inv.kind === 'vehicle' ? 'On credit' : INV_STATE[s][0]; };
  const invBadge = (inv) => { const s = INV_STATE[invState(inv)]; return NA.ui.badge(invStateText(inv), s[1], s[2]); };
  const PAY_STATE = { cleared: ['Confirmed', 'green', 'check'], pending: ['Waiting for Accounts', 'amber', 'clock'], bounced: ['Bounced', 'red', 'x'], void: ['Void', 'gray', 'x'] };
  const payBadge = (st) => { const s = PAY_STATE[st] || PAY_STATE.cleared; return NA.ui.badge(s[0], s[1], s[2]); };
  const EXP_STATE = { pending: ['Waiting for approval', 'amber', 'clock'], approved: ['Approved · to pay', 'blue', 'check'], paid: ['Paid', 'gray', 'check'], rejected: ['Declined', 'red', 'x'], void: ['Void', 'gray', 'x'] };
  const expBadge = (e) => { const s = EXP_STATE[expStatus(e)] || EXP_STATE.paid; return NA.ui.badge(s[0], s[1], s[2]); };
  const claimBadge = (c) => { const s = CLAIM[(c && c.status) || 'not_filed']; return NA.ui.badge(s[0], s[1], s[2]); };
  const normMobile = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('880')) d = d.slice(2); if (d.length === 10 && d[0] === '1') d = '0' + d; return d; };
  const waLink = (mobile, text) => 'https://wa.me/88' + normMobile(mobile) + (text ? '?text=' + encodeURIComponent(text) : '');

  /* ---------------------------------------------------------------- Printed documents */
  const settings = () => NA.db.settings || {};
  const printedBy = () => `printed ${esc(NA.fmt.datetime(new Date().toISOString()))} by ${esc(NA.me().name)}`;
  /** Seller details for tax documents: address, phone, BIN and TIN when they are set in Settings. */
  const sellerLine = () => { const s = settings(); return [s.address, s.phone, s.bin ? 'BIN ' + s.bin : '', s.tin ? 'TIN ' + s.tin : ''].filter(Boolean).map(esc).join(' · '); };
  // Customers keep a company's tax number in tin, labelled "TIN / BIN" (a separate bin is printed when one exists).
  const buyerBlock = (c) => `<b>${esc(c.name || '—')}</b>${c.company && c.company !== c.name ? '<br>' + esc(c.company) : ''}${c.address ? '<br>' + esc(c.address) : ''}${c.mobile ? '<br>' + esc(c.mobile) : ''}${c.bin ? '<br>BIN ' + esc(c.bin) : ''}${c.tin ? '<br>' + (c.bin ? 'TIN ' : 'TIN / BIN ') + esc(c.tin) : ''}`;

  /** Amount in words, Bangladeshi style (crore, lakh, thousand) — the same wording as the Sales receipt. */
  function inWords(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (!n) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
    const out = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(inWords(crore) + ' Crore');
    if (lakh) out.push(two(lakh) + ' Lakh');
    if (th) out.push(two(th) + ' Thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }

  /** Tax invoice (or warranty service note) at the rate it was issued at, with seller and buyer BIN when known. */
  function printInvoice(inv) {
    const c = NA.customer(inv.customerId) || {};
    const w = !billable(inv);
    const paid = invPaid(inv), waiting = w ? 0 : Math.min(invWaiting(inv), Math.max(0, num(inv.total) - paid));
    const rate = invRate(inv);
    const o = inv.kind === 'vehicle' ? NA.get('orders', inv.refId) : null;
    const jc = inv.kind !== 'vehicle' ? NA.get('jobCards', inv.refId) : null;
    const work = num(inv.internalCost) || num(inv.subtotal);
    const lines = (inv.lines || []).map((l) => `<tr><td>${esc(l.desc)}</td><td class="r">${esc(l.qty)}</td><td class="r">${M(l.rate)}</td><td class="r">${M(num(l.qty) * num(l.rate))}</td></tr>`).join('');
    const foot = w
      ? `<tr><td colspan="3" class="r">Value of the work</td><td class="r">${M(work)}</td></tr>
         <tr><td colspan="3" class="r">Covered by the BYD warranty</td><td class="r">− ${M(work)}</td></tr>
         <tr><th colspan="3" class="r">Amount payable by the customer</th><th class="r">${M(0)}</th></tr>`
      : `<tr><td colspan="3" class="r">Total before VAT</td><td class="r">${M(inv.subtotal)}</td></tr>
         <tr><td colspan="3" class="r">VAT ${esc(ratePct(rate))}</td><td class="r">${M(inv.vat)}</td></tr>
         <tr><th colspan="3" class="r">Total</th><th class="r">${M(inv.total)}</th></tr>
         <tr><td colspan="3" class="r">Paid</td><td class="r">${M(paid)}</td></tr>
         ${waiting > 0.5 ? `<tr><td colspan="3" class="r">Payment waiting to clear</td><td class="r">${M(waiting)}</td></tr>` : ''}
         <tr><th colspan="3" class="r">Balance due</th><th class="r">${M(Math.max(0, num(inv.total) - paid - waiting))}</th></tr>`;
    NA.ui.print('Invoice ' + inv.no, `
      <h1>${w ? 'Warranty service note' : 'Tax invoice'} ${esc(inv.no)}</h1>
      <p class="muted">Date ${NA.fmt.date(inv.date)} · ${inv.kind === 'vehicle' ? 'Vehicle sale' + (o ? ' · order ' + esc(o.code) : '') : 'After-sales service' + (jc ? ' · job card ' + esc(jc.code) : '')}</p>
      <table>
        <tr><th style="width:30%">Seller</th><td><b>${esc(settings().company || '')}</b>${sellerLine() ? '<br>' + sellerLine() : ''}</td></tr>
        <tr><th>Bill to</th><td>${buyerBlock(c)}</td></tr>
      </table>
      <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody><tfoot>${foot}</tfoot></table>
      ${w ? '<p><b>Covered under the BYD manufacturer warranty — no charge to the customer.</b></p>' : ''}
      <p class="muted">Copy — ${printedBy()}</p>
      <div class="sig"><div>Customer signature</div><div>For ${esc(settings().company || '')}</div></div>`);
  }

  /** Money receipt: one layout for the whole app. Car receipts use the Sales printer (NA.actions.printReceipt), which
      marks the first print "Original" and every later one "Duplicate — printed … by …". Other receipts (and the case
      where Sales is not loaded) use the same layout here: paid to date as at this receipt, amount in words. */
  function printReceipt(p) {
    if (p.orderId && typeof NA.actions.printReceipt === 'function') return NA.actions.printReceipt(p.id);
    const o = NA.get('orders', p.orderId);
    const inv = p.invoiceId ? NA.get('invoices', p.invoiceId) : null;
    const c = NA.customer(p.customerId || (o && o.customerId)) || {};
    const st = payState(p);
    const refund = num(p.amount) < 0;
    const amt = Math.abs(num(p.amount));
    let orderRows = '';
    if (o) {
      const list = NA.where('payments', (x) => x.orderId === o.id)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.receiptNo).localeCompare(String(b.receiptNo)));
      const upTo = list.slice(0, list.findIndex((x) => x.id === p.id) + 1).filter((x) => !['bounced', 'void'].includes(payState(x)));
      const toDate = sum(upTo, (x) => x.amount);
      const net = B.orderNet(o);
      orderRows = `<tr><th>${refund ? 'Against cancelled order' : 'Against sales order'}</th><td>${esc(o.code)} — ${esc(NA.modelName(o.modelId))}${o.color ? ', ' + esc(o.color) : ''}</td></tr>
        ${refund ? '' : `<tr><th>Order value (net)</th><td>${M(net)}</td></tr>
        <tr><th>Total received to date</th><td>${M(toDate)}</td></tr>
        <tr><th>Balance due</th><td><b>${M(Math.max(0, net - toDate))}</b></td></tr>`}`;
    } else if (inv) orderRows = `<tr><th>Against service invoice</th><td>${esc(inv.no)}</td></tr>`;
    const first = !p.printedAt;
    const w = NA.ui.print((refund ? 'Refund voucher ' : 'Money receipt ') + p.receiptNo, `
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div><h1>${refund ? 'Refund voucher' : 'Money receipt'}</h1><div class="muted">${first ? 'Original — customer copy' : '<b>Duplicate</b> — ' + printedBy()}</div></div>
        <div style="text-align:right"><div>${refund ? 'Voucher' : 'Receipt'} No. <b>${esc(p.receiptNo || '')}</b></div><div>Date: <b>${NA.fmt.date(p.date)}</b></div></div>
      </div>
      <table>
        <tr><th style="width:34%">${refund ? 'Paid to' : 'Received with thanks from'}</th><td><b>${esc(c.name || '—')}</b>${c.mobile ? ' · ' + esc(c.mobile) : ''}${c.address ? '<br><span class="muted">' + esc(c.address) + '</span>' : ''}</td></tr>
        <tr><th>Amount</th><td><b style="font-size:16px">${M(amt)}</b></td></tr>
        <tr><th>In words</th><td>Taka ${esc(inWords(amt))} only</td></tr>
        <tr><th>${refund ? 'Paid with' : 'Payment method'}</th><td>${esc(p.method || '')}${p.ref ? ' — Ref: ' + esc(p.ref) : ''}</td></tr>
        ${orderRows}
        ${p.note ? `<tr><th>Note</th><td>${esc(p.note)}</td></tr>` : ''}
      </table>
      ${st === 'bounced' ? `<p><b>This payment was not received (cheque bounced${p.verifyNote ? ': ' + esc(p.verifyNote) : ''}). This receipt is cancelled.</b></p>` : ''}
      ${st === 'void' ? '<p><b>This receipt was voided.</b></p>' : ''}
      ${!refund && o && o.booking && o.booking.demoVin && !o.vehicleId ? `<p class="muted">Demo VIN ${esc(o.booking.demoVin)} is for reference only. The actual VIN is assigned to the customer after 100% payment.</p>` : ''}
      ${refund ? '' : '<p class="muted">Cheque / pay order payments are subject to realisation.</p>'}
      <div class="sig"><div>${refund ? 'Received by (customer)' : 'Customer signature'}</div><div>For ${esc(settings().company || '')}<br><span class="muted">Accounts / Authorized signatory</span></div></div>`);
    // Count prints (the same fields as the Sales receipt) so a duplicate can be told from the original — only when
    // something was printed (pop-ups blocked: nothing printed, so the next print is still the original).
    if (!w) return;
    const who = NA.me().name;
    if (first) NA.update('payments', p.id, { printedAt: new Date().toISOString(), printedBy: who, printCount: 1 });
    else {
      NA.update('payments', p.id, { printCount: (num(p.printCount) || 1) + 1 });
      NA.log(`Duplicate of ${refund ? 'refund voucher' : 'receipt'} ${p.receiptNo} printed by ${who}`, { kind: 'info', link: '#/finance?tab=money' });
    }
  }

  function printStatement(c) {
    const L = ledgerFor(c.id);
    NA.ui.print('Statement ' + c.name, `
      <h1>Customer statement</h1>
      <p class="muted">${esc(c.name)} · ${esc(c.mobile || '')} · as of ${NA.fmt.date(NA.today())}</p>
      <table><thead><tr><th>Date</th><th>Ref</th><th>What</th><th class="r">Charged</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
      <tbody>${L.rows.map((r) => `<tr><td>${NA.fmt.date(r.date)}</td><td>${esc(r.ref)}</td><td>${esc(r.text)}${r.status && r.status !== 'cleared' ? ' (' + esc(PAY_STATE[r.status][0].toLowerCase()) + ', not counted)' : ''}</td><td class="r">${r.charged ? M(r.charged) : ''}</td><td class="r">${r.paid ? M(r.paid) : ''}</td><td class="r">${M(r.balance)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3">Totals</th><th class="r">${M(L.charged)}</th><th class="r">${M(L.paid)}</th><th class="r">${M(L.balance)}</th></tr></tfoot></table>
      ${L.balance < -0.5 ? `<p><b>We owe the customer ${M(-L.balance)}.</b></p>` : ''}`);
  }
  function printTable(title, cols, rows, foot) {
    NA.ui.print(title, `<h1>${esc(title)}</h1><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r' : ''}">${c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody>${foot || ''}</table>
      <p class="muted">${rows.length} rows · ${printedBy()}</p>`);
  }
  /** Download rows as a CSV file Excel opens directly. */
  function downloadCsv(filename, rows) {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      NA.ui.toast('Saved ' + filename);
    } catch (e) { NA.ui.toast('Could not create the file in this browser', 'error'); }
  }

  /* ---------------------------------------------------------------- Expense claims (every role) */
  const categories = () => Array.from(new Set(DEFAULT_CATEGORIES.concat(NA.db.expenses.map((e) => e.category).filter(Boolean)))).sort((a, b) => a.localeCompare(b));
  /** Who must approve a claim of this amount if the current person makes it. Nobody approves their own claim:
      when the claimant could approve it themselves (Accounts), it goes to another person who can. */
  function claimRoute(amount) {
    amount = num(amount);
    const p = NA.policy();
    if (NA.isRole('owner')) return { need: false, text: 'No approval needed' };
    if (amount <= num(p.expenseFree)) return { need: false, text: 'No approval needed up to ' + M(p.expenseFree) };
    const roles = A ? A.approverRoles('expense', amount) : ['owner'];
    const self = roles.includes(NA.role());
    return { need: true, self, roles, text: self
      ? 'Goes to another person in ' + NA.roleLabel(NA.role()) + ' or the Managing Director for approval — nobody approves their own claim'
      : 'Goes to ' + roles.map(NA.roleLabel).join(' or ') + ' for approval' };
  }
  /** Ask for approval of a claim (or of a changed amount). It always waits for someone else: an accountant's own
      claim goes to another accountant or the Managing Director (selfApprove: false). */
  function requestClaimApproval(e) {
    if (!A) return null;
    return A.request({ type: 'expense', ref: { c: 'expenses', id: e.id, code: e.code || '' }, amount: num(e.amount), value: num(e.amount),
      title: `${M(e.amount)} · ${e.category}${e.paidTo ? ' · ' + e.paidTo : ''}`,
      detail: `${e.costCentre} · bill dated ${NA.fmt.date(e.date)}${e.ref ? ' · ' + e.ref : ''}${expClaimant(e) ? ' · claimed by ' + expClaimant(e) : ''}`, reason: e.note || '', selfApprove: false });
  }
  function findDuplicate(v, exceptId) {
    const pt = String(v.paidTo || '').trim().toLowerCase(), cat = String(v.category || '').trim().toLowerCase();
    return NA.db.expenses.find((x) => x.id !== exceptId && !['void', 'rejected'].includes(expStatus(x)) && Math.abs(num(x.amount) - num(v.amount)) < 0.5
      && Math.abs(NA.daysBetween(day(x.date) || NA.today(), v.date || NA.today())) <= 3
      && ((pt && String(x.paidTo || '').trim().toLowerCase() === pt) || String(x.category || '').trim().toLowerCase() === cat)) || null;
  }

  /** The claim form: what for, amount, paid to, part of the business, date — the rest under "More details". */
  function claimForm(v, opts) {
    const locked = !!opts.moneyLocked;                // paid: the amount, date and VAT stay as paid
    const fixed = locked || !!opts.amountLocked;       // someone else's claim: its amount and date are the claimant's
    const listId = 'fx-cats-' + Math.random().toString(36).slice(2, 7);
    const lockHelp = locked ? 'Locked after payment — void and enter again to change it' : 'Only the person who claimed it can change this';
    const field = (f, val) => ((locked && f.money) || (fixed && f.claimant) ? NA.ui.field(Object.assign({}, f, { help: lockHelp }), val).replace(/<(input|select)/, '<$1 disabled') : NA.ui.field(f, val));
    const vatOn = !!(v.vatBill || num(v.vatPaid) > 0);
    const html = `<form class="modal-form" onsubmit="return false">
      <div class="form-grid">
        ${NA.ui.field({ name: 'category', label: 'What was it for?', required: true, span: 2, placeholder: 'Type or pick, e.g. Utilities' }, v.category)}
        ${field({ name: 'amount', label: 'Amount', type: 'money', required: true, min: 1, money: true, claimant: true }, v.amount)}
        ${NA.ui.field({ name: 'paidTo', label: 'Paid to', required: true, placeholder: 'Shop, person or company' }, v.paidTo)}
        ${NA.ui.field({ name: 'costCentre', label: 'Part of the business', type: 'select', options: NA.FLOW.costCentres, placeholder: false }, v.costCentre)}
        ${field({ name: 'date', label: 'Date of the bill', type: 'date', required: true, money: true, claimant: true }, v.date)}
      </div>
      ${fixed ? '' : '<p class="fx-route" data-route></p>'}
      ${opts.paidNow ? `<div class="fx-paidnow">${NA.ui.field({ name: 'paidNow', label: 'Already paid', type: 'checkbox', help: 'Tick when the money has already gone out. Only when no approval is needed.' }, false)}
        <div class="form-grid mt-12 hidden" data-paidnow>${NA.ui.field({ name: 'method', label: 'Paid with', type: 'select', options: PAY_METHODS, placeholder: false }, 'Cash')}${NA.ui.field({ name: 'payRef', label: 'Reference', placeholder: 'Cheque or transfer no.' }, '')}</div></div>` : ''}
      <details class="fx-more"${vatOn || v.ref || v.note ? ' open' : ''}><summary>${NA.icon('chevron-down', 14)}More details</summary>
        <div class="form-grid mt-12">
          ${NA.ui.field({ name: 'ref', label: 'Bill or voucher no.', placeholder: 'e.g. Bill 4471' }, v.ref)}
          ${locked ? '' : NA.ui.field({ name: 'vatBill', label: 'VAT bill (Mushak 6.3)', type: 'checkbox' }, vatOn)}
          <div class="span-2 form-grid${vatOn ? '' : ' hidden'}" data-vat>
            ${field({ name: 'vatPaid', label: 'VAT on the bill', type: 'money', money: true }, v.vatPaid)}
            ${NA.ui.field({ name: 'mushak', label: 'Mushak 6.3 no.' }, v.mushak)}
            ${NA.ui.field({ name: 'supplierBin', label: 'Supplier BIN', span: 2 }, v.supplierBin)}
          </div>
          ${NA.ui.field({ name: 'note', label: 'Note for Accounts', type: 'textarea', rows: 2, span: 2, placeholder: 'Optional' }, v.note)}
        </div>
      </details>
      <datalist id="${listId}">${categories().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    </form>`;
    const wire = (el) => {
      const f = el.querySelector('form');
      if (!f) return;
      const cat = f.querySelector('[name=category]'); if (cat) cat.setAttribute('list', listId);
      const amt = f.querySelector('[name=amount]'), route = f.querySelector('[data-route]');
      const vat = f.querySelector('[name=vatBill]'), vatBox = f.querySelector('[data-vat]');
      const pn = f.querySelector('[name=paidNow]'), pnBox = f.querySelector('[data-paidnow]');
      const sync = () => {
        const r = claimRoute(amt && amt.value);
        if (route) route.textContent = num(amt && amt.value) > 0 ? r.text : '';
        if (vat && vatBox) vatBox.classList.toggle('hidden', !vat.checked);
        if (pn) { pn.disabled = r.need; if (r.need) pn.checked = false; }
        if (pn && pnBox) pnBox.classList.toggle('hidden', !pn.checked);
      };
      [amt, vat, pn].forEach((x) => { if (x) { x.addEventListener('input', sync); x.addEventListener('change', sync); } });
      sync();
    };
    return { html, wire };
  }
  /** Read and check the claim form. Returns the values, or null (with a message) when something is missing.
      opts.locked: a paid expense (its money stays as paid); opts.vatPaid: its VAT, which still needs the Mushak and BIN. */
  function readClaim(el, opts) {
    opts = opts || {};
    const f = el.querySelector('form');
    if (!NA.ui.validate(f)) return null;
    const v = NA.ui.readForm(f);
    const err = (m) => { NA.ui.toast(m, 'error'); return null; };
    v.category = String(v.category || '').trim();
    v.paidTo = String(v.paidTo || '').trim();
    if (opts.locked) {
      if (num(opts.vatPaid) > 0 && !String(v.mushak || '').trim()) return err('A VAT bill keeps its Mushak 6.3 number — enter it from the bill');
      if (num(opts.vatPaid) > 0 && !String(v.supplierBin || '').trim()) return err('A VAT bill keeps the supplier’s BIN — enter it from the bill');
      return v;
    }
    v.amount = num(v.amount);
    if (!(v.amount > 0)) return err('Enter an amount above 0');
    v.vatPaid = v.vatBill ? num(v.vatPaid) : 0;
    if (v.vatBill) {
      const max = vatInside(v.amount);
      if (!(v.vatPaid > 0)) return err('Enter the VAT on the bill, or switch off “VAT bill”');
      if (v.vatPaid > max + 1) return err(`The VAT on a ${M(v.amount)} bill can be at most ${M(max)} at ${ratePct(vatRate())}`);
      if (!v.mushak) return err('Enter the Mushak 6.3 number from the bill');
      if (!v.supplierBin) return err('Enter the supplier’s BIN from the bill');
    } else { v.mushak = ''; v.supplierBin = ''; }
    return v;
  }

  /** Where an expense opens: in Accounts for the people who use it; for everyone else (the claimant) in Approvals →
      Your requests, with the expense sheet on top (see the 'rendered' hook below). */
  const expLink = (id) => (NA.canSee('finance') ? '#/finance?tab=expenses' : '#/approvals?tab=mine') + (id ? '&exp=' + encodeURIComponent(id) : '');

  /** Claim an expense — any role. Small amounts need no approval; above the limit it goes to Accounts or the MD. */
  NA.actions.newExpense = function (prefill) {
    prefill = prefill || {};
    const who = NA.me();
    if (!who.staffId && !NA.isRole('owner')) return NA.ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error');
    const manage = canManage();
    const form = claimForm(Object.assign({ date: NA.today(), costCentre: ROLE_CENTRE[NA.role()] || 'Administration' }, prefill), { paidNow: manage });
    // People without the Accounts screen reach their own claims here (to check, change or cancel one).
    const openMine = !NA.canSee('finance') && who.staffId ? NA.db.expenses.filter((x) => x.ownerId === who.staffId && ['pending', 'approved'].includes(expStatus(x)))
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date))) : [];
    const mineHtml = openMine.length ? `<details class="fx-more"><summary>${NA.icon('chevron-down', 14)}Your open claims · ${openMine.length}</summary>
      <div class="glist mt-12">${openMine.slice(0, 8).map((x) => glRow({ title: `${M(x.amount)} · ${x.category || 'Expense'}`, act: 'fx-open-exp', id: x.id,
        sub: esc([x.code, (EXP_STATE[expStatus(x)] || EXP_STATE.paid)[0], NA.fmt.date(x.date)].filter(Boolean).join(' · ')) })).join('')}</div></details>` : '';
    NA.ui.modal({
      title: manage ? 'Record an expense' : 'Claim an expense', size: 'md',
      subtitle: manage ? 'Bills the business pays. Above the petty-cash limit someone else approves it first.' : 'Accounts pays it once it is approved. Above ' + M(NA.policy().expenseFree) + ' you can follow it in Approvals → Your requests.',
      body: form.html + mineHtml,
      onMount: (el) => {
        form.wire(el);
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest && ev.target.closest('[data-act="fx-open-exp"]');
          if (b) { NA.ui.closeTop(); setTimeout(() => NA.actions.openExpense(b.dataset.id), 180); }
        });
      },
      actions: [{ label: 'Cancel' }, { label: manage ? 'Save' : 'Send claim', kind: 'primary', onClick: async (el) => {
        const v = readClaim(el);
        if (!v) return false;
        const route = claimRoute(v.amount);
        const paidNow = !!v.paidNow && manage && !route.need;
        if (paidNow && v.method !== 'Cash' && !v.payRef) { NA.ui.toast('Enter the cheque or transfer reference', 'error'); return false; }
        const dup = findDuplicate(v);
        if (dup && !(await NA.ui.confirm(`This looks like <b>${esc(dup.code || 'an expense')}</b> — ${esc(dup.category)}, ${M(dup.amount)}${dup.paidTo ? ' to ' + esc(dup.paidTo) : ''} on ${NA.fmt.date(dup.date)}. Save it anyway?`, { title: 'Possible duplicate', okLabel: 'Save anyway' }))) return false;
        const me2 = NA.me(), now = new Date().toISOString(), owner = NA.isRole('owner');
        const status = route.need ? 'pending' : paidNow ? 'paid' : 'approved';
        const rec = { code: NA.nextCode('EXP'), date: v.date || NA.today(), category: v.category, costCentre: v.costCentre || 'Administration',
          amount: v.amount, vatPaid: v.vatPaid, mushak: v.mushak || '', supplierBin: v.supplierBin || '', paidTo: v.paidTo, ref: v.ref || '', note: v.note || '',
          status, requestedBy: me2.name };
        if (status !== 'pending') Object.assign(rec, { approvedBy: owner ? me2.name : '', approvedById: owner ? me2.staffId || null : null, approvedAt: now, approvalNote: owner ? '' : 'Within the petty-cash limit' });
        if (status === 'paid') Object.assign(rec, { paidBy: me2.name, paidById: me2.staffId || null, paidOn: rec.date, method: v.method || 'Cash', payRef: v.payRef || '' });
        const e = NA.insert('expenses', rec);
        if (route.need) requestClaimApproval(e);
        NA.log(`Expense ${e.code}: ${M(e.amount)} — ${e.category}${e.paidTo ? ' to ' + e.paidTo : ''} (${e.costCentre})${status === 'pending' ? ' · waiting for approval' : status === 'paid' ? ' · paid' : ''}`, { rec: e, link: expLink(e.id), kind: 'money' });
        NA.ui.toast(status === 'pending' ? (route.self ? 'Sent for approval — someone else will decide' : 'Sent to ' + route.roles.map(NA.roleLabel).join(' or ') + ' for approval')
          : status === 'paid' ? 'Expense saved as paid' : manage ? 'Expense saved — ready to pay' : 'Expense saved — Accounts will pay it', status === 'pending' ? 'info' : 'success');
        if (NA.refresh) NA.refresh();
      } }],
    });
  };

  /** Pay an approved claim (Accounts / MD): how and when it was paid. */
  function markPaid(e) {
    NA.ui.formModal({
      title: 'Mark as paid', size: 'sm', submitLabel: 'Mark as paid',
      subtitle: `${esc(e.code || '')} · ${esc(M(e.amount))}${e.paidTo ? ' to ' + esc(e.paidTo) : ''}`,
      fields: [
        { name: 'method', label: 'Paid with', type: 'select', options: PAY_METHODS, placeholder: false, required: true },
        { name: 'payRef', label: 'Reference', placeholder: 'Cheque or transfer no.' },
        { name: 'paidOn', label: 'Date paid', type: 'date', required: true, max: NA.today() },
      ],
      values: { method: 'Cash', paidOn: NA.today() },
      onSubmit: (v) => {
        const cur = NA.get('expenses', e.id);
        if (!cur || expStatus(cur) !== 'approved') { NA.ui.toast('This expense is no longer waiting to be paid', 'error'); return; }
        if (v.method !== 'Cash' && !v.payRef) { NA.ui.toast('Enter the cheque or transfer reference', 'error'); return false; }
        const who = NA.me();
        NA.update('expenses', cur.id, { status: 'paid', paidBy: who.name, paidById: who.staffId || null, paidOn: v.paidOn || NA.today(), method: v.method, payRef: v.payRef || '' });
        NA.log(`Expense ${cur.code || ''} paid — ${M(cur.amount)}${cur.paidTo ? ' to ' + cur.paidTo : ''} (${v.method}${v.payRef ? ' ' + v.payRef : ''})`, { rec: cur, kind: 'money', link: '#/finance?tab=expenses' });
        NA.ui.toast('Marked as paid'); NA.refresh();
      },
    });
  }

  /** Void instead of delete: the record stays (struck through), stops counting, and keeps who and why. */
  function voidExpense(e, reason, extra) {
    const who = NA.me();
    const ap = A ? A.find('expenses', e.id, 'expense') : null;
    if (ap && ap.status === 'pending' && !(ap.data && ap.data.action === 'void')) NA.update('approvals', ap.id, { status: 'cancelled', note: 'Expense voided: ' + reason });
    NA.update('expenses', e.id, { status: 'void', voidedFrom: expStatus(e), void: Object.assign({ by: who.name, byId: who.staffId || null, at: new Date().toISOString(), reason }, extra || {}) });
    NA.log(`Expense ${e.code || ''} voided — ${e.category} ${M(e.amount)}: ${reason}`, { rec: e, kind: 'warn', link: '#/finance?tab=expenses' });
  }
  /** mode: 'cancel' (the claimant takes it back), 'void' (immediately), 'ask' (a paid expense: someone else approves). */
  function voidSheet(e, mode) {
    const titles = { cancel: 'Cancel this claim', void: 'Void this expense', ask: 'Ask to void this expense' };
    const intro = mode === 'ask' ? 'The money has already been paid, so another person approves the void. Until then it keeps counting.'
      : mode === 'cancel' ? 'The claim is kept in the records as cancelled.' : 'The expense stays in the records, struck through, and stops counting in every total.';
    NA.ui.modal({
      title: titles[mode], size: 'sm', subtitle: `${esc(e.code || '')} · ${esc(e.category)} · ${esc(M(e.amount))}`,
      body: `<p class="fx-intro">${esc(intro)}</p><form class="modal-form" onsubmit="return false">${NA.ui.field({ name: 'reason', label: 'Reason', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Entered twice by mistake' })}</form>`,
      actions: [{ label: 'Keep it' }, { label: mode === 'ask' ? 'Send for approval' : titles[mode].replace(' this', ''), kind: 'danger', onClick: (el) => {
        const f = el.querySelector('form');
        if (!NA.ui.validate(f)) return false;
        const reason = NA.ui.readForm(f).reason;
        const cur = NA.get('expenses', e.id);
        if (!cur || ['void', 'rejected'].includes(expStatus(cur))) { NA.ui.toast('This expense is already closed', 'info'); return; }
        if (mode === 'ask') {
          A.request({ type: 'expense', ref: { c: 'expenses', id: cur.id, code: cur.code || '' }, amount: num(cur.amount), value: num(cur.amount),
            title: `Void ${cur.code || 'expense'} · ${M(cur.amount)} · ${cur.category}`,
            detail: `Paid ${NA.fmt.date(expPaidOn(cur))}${cur.paidTo ? ' to ' + cur.paidTo : ''} — it stops counting once approved`, reason, data: { action: 'void', reason }, selfApprove: false });
          NA.ui.toast('Sent for approval', 'info');
        } else { voidExpense(cur, reason); NA.ui.toast(mode === 'cancel' ? 'Claim cancelled' : 'Expense voided'); }
        NA.refresh();
      } }],
    });
  }

  /** Edit a claim. Before payment everything can change (a bigger amount asks for approval again); after payment only
      the description can, and every change is written to the record's history. The amount and date of someone else's
      claim are theirs to change (or the Managing Director's): Accounts declines it with a note instead, so the request
      always stays the claimant's own. */
  function editExpense(e) {
    const paid = expIsPaid(e);
    const who = NA.me();
    const fixed = !paid && !(!!who.staffId && e.ownerId === who.staffId) && !NA.isRole('owner');
    const v0 = Object.assign({}, e, { vatBill: num(e.vatPaid) > 0 });
    const form = claimForm(v0, { moneyLocked: paid, amountLocked: fixed });
    NA.ui.modal({
      title: 'Edit expense', size: 'md', subtitle: `${esc(e.code || '')} · ${esc(EXP_STATE[expStatus(e)][0])}`, body: form.html, onMount: form.wire,
      actions: [{ label: 'Cancel' }, { label: 'Save changes', kind: 'primary', onClick: (el) => {
        const v = readClaim(el, { locked: paid, vatPaid: e.vatPaid });
        if (!v) return false;
        const cur = NA.get('expenses', e.id);
        if (!cur || ['void', 'rejected'].includes(expStatus(cur)) || expIsPaid(cur) !== paid) { NA.ui.toast('This expense changed in the meantime — open it again', 'error'); return; }
        const fields = paid ? ['category', 'paidTo', 'costCentre', 'ref', 'note', 'mushak', 'supplierBin']
          : ['category', 'amount', 'paidTo', 'costCentre', 'date', 'ref', 'note', 'vatPaid', 'mushak', 'supplierBin'].filter((k) => !fixed || !['amount', 'date'].includes(k));
        if (paid && !num(cur.vatPaid)) { delete v.mushak; delete v.supplierBin; }
        const patch = {}, said = [];
        const show = (k, x) => (['amount', 'vatPaid'].includes(k) ? M(x) : k === 'date' ? NA.fmt.date(x) : String(x || '—'));
        const LABEL = { category: 'what for', amount: 'amount', paidTo: 'paid to', costCentre: 'part of the business', date: 'date', ref: 'bill no.', note: 'note', vatPaid: 'VAT', mushak: 'Mushak no.', supplierBin: 'supplier BIN' };
        fields.forEach((k) => {
          if (!(k in v)) return;
          const a = ['amount', 'vatPaid'].includes(k) ? num(cur[k]) : String(cur[k] || ''), b = ['amount', 'vatPaid'].includes(k) ? num(v[k]) : String(v[k] || '');
          if (a !== b) { patch[k] = b; said.push(`${LABEL[k]} ${show(k, a)} → ${show(k, b)}`); }
        });
        if (!said.length) { NA.ui.toast('Nothing changed', 'info'); return; }
        let again = false;
        if ('amount' in patch) {
          const ap = A ? A.find('expenses', cur.id, 'expense') : null;
          const route = claimRoute(patch.amount);
          const was = expStatus(cur);
          const free = patch.amount <= num(NA.policy().expenseFree);
          if (was === 'approved' && (patch.amount <= num(cur.amount) + 0.5 || free)) { /* still covered: by the approval, or within petty cash */ }
          else if (route.need) { Object.assign(patch, { status: 'pending', approvedBy: '', approvedById: null, approvedAt: null, approvalNote: '' }); again = true; }
          else {
            // No approval needed: within petty cash, or the Managing Director's own authority.
            const now = new Date().toISOString();
            Object.assign(patch, free ? { status: 'approved', approvedBy: '', approvedById: null, approvedAt: now, approvalNote: 'Within the petty-cash limit' }
              : { status: 'approved', approvedBy: who.name, approvedById: who.staffId || null, approvedAt: now, approvalNote: '' });
            if (ap && ap.status === 'pending') NA.update('approvals', ap.id, { status: 'cancelled', note: free ? 'Amount lowered — no approval needed' : 'Amount changed and approved by ' + who.name });
          }
        }
        NA.update('expenses', cur.id, patch);
        NA.log(`Expense ${cur.code || ''} edited: ${said.join('; ')}${again ? ' · needs approval again' : ''}`, { rec: cur, kind: 'info', link: expLink(cur.id) });
        if (again) requestClaimApproval(NA.get('expenses', cur.id));
        NA.ui.toast(again ? 'Saved — sent for approval again' : 'Saved');
        NA.refresh();
      } }],
    });
  }

  /** The expense sheet: details, approval banner, what happens next, and the actions this person may take. */
  NA.actions.openExpense = function (id) {
    const e = NA.get('expenses', id);
    if (!e) return NA.ui.toast('This expense isn’t available to you', 'info');
    const st = expStatus(e);
    const who = NA.me();
    const mine = !!who.staffId && e.ownerId === who.staffId;
    const manage = canManage(), owner = NA.isRole('owner');
    const pm = payrollMonth(e);
    const ap = A ? A.find('expenses', e.id, 'expense') : null;
    const voidAsk = ap && ap.status === 'pending' && ap.data && ap.data.action === 'void' ? ap : null;
    const method = expMethod(e), payer = expPayer(e);
    const rows = [
      glRow({ title: 'Paid to', value: esc(e.paidTo || '—') }),
      glRow({ title: 'Part of the business', value: esc(e.costCentre || '—') }),
      glRow({ title: 'Date of the bill', value: esc(NA.fmt.date(e.date)) }),
      e.ref ? glRow({ title: 'Bill or voucher no.', value: esc(e.ref) }) : '',
      num(e.vatPaid) ? glRow({ title: 'VAT on the bill', sub: esc([e.mushak ? 'Mushak 6.3 ' + e.mushak : 'No Mushak 6.3 number', e.supplierBin ? 'supplier BIN ' + e.supplierBin : ''].filter(Boolean).join(' · ')), value: M(e.vatPaid) }) : '',
      expClaimant(e) ? glRow({ title: 'Claimed by', value: esc(expClaimant(e)), valueSub: e.createdAt ? esc(NA.fmt.date(e.createdAt)) : '' }) : '',
      e.approvedAt || e.approvedBy ? glRow({ title: 'Approved', value: esc(e.approvedBy || e.approvalNote || 'Yes'), valueSub: e.approvedAt ? esc(NA.fmt.date(e.approvedAt)) : '' }) : '',
      st === 'paid' ? glRow({ title: 'Paid', sub: esc([method, e.payRef].filter(Boolean).join(' · ')), value: esc(NA.fmt.date(expPaidOn(e))), valueSub: payer ? 'by ' + esc(payer) : '' }) : '',
      st === 'rejected' ? glRow({ title: 'Declined', sub: esc(e.rejectNote || ''), value: esc(e.rejectedBy || '—') }) : '',
      st === 'void' && e.void ? glRow({ title: 'Void', sub: esc(e.void.reason || ''), value: esc(e.void.by || '—'), valueSub: e.void.at ? esc(NA.fmt.date(e.void.at)) : '' }) : '',
      e.note ? glRow({ title: 'Note', sub: esc(e.note) }) : '',
      pm ? glRow({ title: 'Payroll', sub: 'Salaries for ' + esc(monthLabel(pm, true)), value: '' }) : '',
    ].join('');
    let next = '';
    if (st === 'pending') next = lockNote('Waiting for approval from ' + (ap && ap.status === 'pending' ? A.approverText(ap) : 'a manager') + '. Nothing is paid until then.');
    else if (st === 'approved') next = manage ? nextStep('wallet', `Pay ${M(e.amount)}${e.paidTo ? ' to ' + e.paidTo : ''}`, 'Then record how it was paid.', `<button class="btn btn-primary" data-x="pay">Mark as paid</button>`) : lockNote('Approved — Accounts will pay it.');
    else if (pm) next = lockNote('Salary payments are undone in People → Payroll by the Managing Director.');
    const canEdit = !pm && !voidAsk && ((['pending', 'approved'].includes(st) && (mine || manage)) || (st === 'paid' && manage));
    let voidMode = null;
    if (!pm && !voidAsk) {
      if (st === 'pending' && (mine || owner)) voidMode = mine ? 'cancel' : 'void';
      else if (st === 'approved' && (mine || manage)) voidMode = mine && !manage ? 'cancel' : 'void';
      else if (st === 'paid' && manage) voidMode = owner ? 'void' : 'ask';
    }
    const actions = [];
    if (voidMode) actions.push({ label: { cancel: 'Cancel claim', void: 'Void', ask: 'Ask to void' }[voidMode], kind: 'danger', onClick: () => { setTimeout(() => voidSheet(NA.get('expenses', e.id) || e, voidMode), 180); } });
    if (canEdit) actions.push({ label: 'Edit', onClick: () => { setTimeout(() => editExpense(NA.get('expenses', e.id) || e), 180); } });
    // One blue button: "Mark as paid" or the banner's Approve, when either is there.
    actions.push({ label: 'Done', kind: (st === 'approved' && manage) || (ap && A.canDecide(ap)) ? 'ghost' : 'primary' });
    NA.ui.modal({
      title: e.category || 'Expense', size: 'md', subtitle: `${esc(e.code || 'Expense')} · ${esc(EXP_STATE[st] ? EXP_STATE[st][0] : st)}`,
      body: `<div class="fx-sheet">
        <div class="row-between"><span class="fx-amount ${st === 'void' ? 'fx-strike' : ''}">${M(e.amount)}</span>${expBadge(e)}</div>
        ${A ? NA.ui.approvalBanners('expenses', e.id) : ''}
        ${next}
        <div class="glist">${rows}</div>
      </div>`,
      actions,
      onMount: (el) => {
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-appr-act]')) { NA.ui.closeTop(); return; }   // the approval buttons are handled globally
          if (ev.target.closest('[data-x="pay"]')) { NA.ui.closeTop(); setTimeout(() => markPaid(NA.get('expenses', e.id) || e), 180); }
        });
      },
    });
  };

  if (A) {
    // Expenses open in Accounts for the people who use it; the claimant opens theirs from Approvals → Your requests.
    if (A.LINKS) A.LINKS.expenses = (id) => expLink(id);
    // Keep the expense in step with the decision (runs in the browser of whoever decides).
    A.onDecide('expense', (a, decision) => {
      if (a.refC !== 'expenses') return;
      const e = NA.get('expenses', a.refId);
      if (!e) return;
      // A decision on an older request (one replaced by a newer request for this expense) changes nothing.
      if (A.forRecord('expenses', e.id).some((x) => x.type === 'expense' && x.id !== a.id && String(x.createdAt) > String(a.createdAt))) return;
      const who = NA.me(), now = new Date().toISOString();
      if (a.data && a.data.action === 'void') {
        if (decision === 'approved' && !['void', 'rejected'].includes(expStatus(e))) voidExpense(e, a.data.reason || a.reason || 'Void approved', { approvedBy: a.decidedBy || who.name });
        return;
      }
      if (['void', 'paid', 'rejected'].includes(expStatus(e))) return;
      // An approval covers the amount it was asked for; a claim raised since then waits for its own request.
      if (decision === 'approved' && num(a.value != null ? a.value : a.amount) + 0.5 < num(e.amount)) return;
      if (decision === 'approved') NA.update('expenses', e.id, { status: 'approved', approvedBy: a.decidedBy || who.name, approvedById: a.decidedById || who.staffId || null, approvedAt: a.decidedAt || now });
      else if (decision === 'rejected') NA.update('expenses', e.id, { status: 'rejected', rejectedBy: who.name, rejectedAt: now, rejectNote: a.note || '' });
      else if (decision === 'cancelled') NA.update('expenses', e.id, { status: 'void', voidedFrom: 'pending', void: { by: who.name, byId: who.staffId || null, at: now, reason: 'Request withdrawn' } });
    });
    // The claimant's way in: a link with ?exp=<id> on any screen they can see (Approvals → Your requests) opens the
    // expense sheet once. Accounts handles its own links in the page below.
    let opened = '';
    NA.on('rendered', ({ section }) => {
      const q = (NA.currentRoute && NA.currentRoute().query) || {};
      if (!q.exp) { opened = ''; return; }
      if (section === 'finance' || q.exp === opened) return;
      const id = (opened = q.exp);
      try { history.replaceState(null, '', location.hash.replace(/([?&])exp=[^&]*&?/, '$1').replace(/[?&]$/, '')); } catch (e) { /* the address keeps it; opened stops a second sheet */ }
      setTimeout(() => NA.actions.openExpense(id), 60);
    });
  }

  /* ---------------------------------------------------------------- Tabs */
  // What the screen shows now (set at the start of every render). Links keep the period the person chose.
  const VIEW = { tab: 'overview', period: 'month', explicit: false, q: {} };
  const LAST = {};   // the rows on screen, for "Print list" and CSV
  function fhref(patch) {
    patch = patch || {};
    const tab = patch.tab || VIEW.tab;
    const nq = { tab };
    if (patch.period) nq.period = patch.period; else if (VIEW.explicit) nq.period = VIEW.period;
    if (tab === VIEW.tab) ['view', 'kind', 'cc', 'q'].forEach((k) => { if (VIEW.q[k] && !(k in patch)) nq[k] = VIEW.q[k]; });
    Object.keys(patch).forEach((k) => { if (k !== 'tab' && k !== 'period') nq[k] = patch[k]; });
    Object.keys(nq).forEach((k) => { if (nq[k] == null || nq[k] === '') delete nq[k]; });
    return '#/finance?' + Object.keys(nq).map((k) => k + '=' + encodeURIComponent(nq[k])).join('&');
  }
  const alertList = (items, emptyText) => (items.length
    ? `<div class="fx-alerts">${items.map((a) => `<a class="alert-row" href="${esc(a.href)}"><span class="ar-icon fx-ar-${a.tone}">${NA.icon(a.icon, 17)}</span><div class="grow"><b>${esc(a.t)}</b><small>${a.s || ''}</small></div>${NA.icon('chevron-right', 16)}</a>`).join('')}</div>`
    : NA.ui.empty(emptyText, 'check-circle'));

  /** Overview: three questions — what came in, what went out, what do we owe and are owed — and what needs doing. */
  function overviewTab(r, Sm) {
    const rc = receivables();
    const owedAfter = sum(rc.after, (x) => x.amount), owedBefore = sum(rc.before, (x) => x.amount);
    const late = rc.after.filter((x) => x.days > 30);
    const waiting = B.paymentsToVerify();
    const waitSum = sum(waiting, (p) => p.amount);
    const verify = NA.can('payments.verify');
    const refunds = refundsDue();
    const refundSum = sum(refunds, (o) => o.refund.amount);
    const sup = NA.db.purchaseOrders.map(poStats).filter((x) => x.live);
    const parts = partBills().filter((x) => x.owed > 0.5);   // parts received: due now
    const partsOwed = sum(parts, (x) => x.owed);
    const supDue = sum(sup, (x) => x.dueNow) + partsOwed, supOwed = sum(sup, (x) => x.outstanding) + partsOwed;
    const toPay = NA.db.expenses.filter((e) => expStatus(e) === 'approved');
    const toPaySum = sum(toPay, (e) => e.amount);
    const cl = claims();
    const byd = sum(cl, (c) => c.owed);
    const unclaimed = cl.filter((c) => c.status === 'not_filed');
    const net = Sm.moneyIn - Sm.moneyOut;

    // Needs attention: only things someone can act on, each with a count, an amount or a date.
    const items = [];
    if (verify && waiting.length) items.push({ icon: 'clock', tone: 'amber', t: `Confirm ${plural(waiting.length, 'payment')} · ${M(waitSum)}`, s: 'Customer money counts only after you confirm it', href: '#/approvals?tab=money' });
    const forMe = A ? A.pendingForMe().filter((a) => a.type === 'expense') : [];
    if (forMe.length) items.push({ icon: 'receipt', tone: 'amber', t: `Decide ${plural(forMe.length, 'expense request')}`, s: esc(M(sum(forMe, (a) => a.amount))) + ' waiting for you', href: '#/approvals?tab=for' });
    if (refunds.length) items.push({ icon: 'undo', tone: 'red', t: `Pay ${plural(refunds.length, 'refund')} · ${M(refundSum)}`, s: 'Cancellations the Managing Director approved', href: refunds.length === 1 ? '#/sales/' + refunds[0].id : fhref({ tab: 'ledger', view: 'refunds' }) });
    if (canManage() && toPay.length) items.push({ icon: 'wallet', tone: 'blue', t: `Pay ${plural(toPay.length, 'approved expense')} · ${M(toPaySum)}`, s: 'Oldest bill ' + esc(NA.fmt.date(toPay.map((e) => day(e.date)).sort()[0])), href: fhref({ tab: 'expenses', view: 'topay' }) });
    const supN = sup.filter((x) => x.dueNow >= 100).length;
    if (supDue >= 100) items.push({ icon: 'cart', tone: 'blue', t: `Supplier payments due · ${M(supDue)}`, s: esc([supN ? plural(supN, 'approved purchase order') : '', parts.length ? plural(parts.length, 'parts bill') : ''].filter(Boolean).join(' and ')) + ' ready to pay', href: fhref({ tab: 'vendors' }) });
    if (late.length) items.push({ icon: 'alert', tone: 'red', t: `${M(sum(late, (x) => x.amount))} owed for more than 30 days`, s: `${esc(plural(late.length, 'item'))} after delivery · oldest ${esc(plural(late[0].days, 'day'))}`, href: fhref({ tab: 'ledger' }) });
    const bounced = NA.db.payments.filter(bouncedLately);
    if (bounced.length) items.push({ icon: 'x', tone: 'red', t: `${plural(bounced.length, 'payment')} bounced in the last 30 days`, s: esc(M(sum(bounced, (p) => p.amount))) + ' to collect again', href: fhref({ tab: 'money', view: 'bounced' }) });
    if (unclaimed.length) items.push({ icon: 'shield', tone: 'amber', t: `Claim ${plural(unclaimed.length, 'warranty job')} from BYD`, s: esc(M(sum(unclaimed, (c) => c.amount))) + ' of free work not claimed yet', href: fhref({ tab: 'revenue', kind: 'warranty' }) });
    const invoiced = new Set(NA.db.invoices.filter((i) => i.kind === 'vehicle').map((i) => i.refId));
    const noInvoice = NA.db.orders.filter((o) => o.stage === 'delivered' && !invoiced.has(o.id));
    if (noInvoice.length) items.push({ icon: 'receipt', tone: 'amber', t: `${plural(noInvoice.length, 'delivered car')} without an invoice`, s: esc(noInvoice.slice(0, 3).map((o) => o.code).join(', ')), href: '#/sales/' + noInvoice[0].id });
    const vr = nextVatReturn();
    const vrMoney = vr.net >= 0 ? esc(M(vr.net)) + ' to pay' + (vr.partial ? ' so far' : '') : esc(M(-vr.net)) + ' credit to carry forward';
    if (vr.active) items.push(vr.daysLeft < 0
      ? { icon: 'file-text', tone: 'red', t: `VAT return for ${vr.long} is overdue`, s: 'Due ' + esc(NA.fmt.date(vr.due)) + ' · ' + vrMoney + ' · not marked as filed', href: fhref({ tab: 'vat' }) }
      : { icon: 'file-text', tone: vr.daysLeft <= 5 ? 'amber' : 'gray', t: `VAT return for ${vr.long} due ${NA.fmt.date(vr.due)}`, s: vrMoney, href: fhref({ tab: 'vat' }) });

    const came = group('', [
      glRow({ title: 'Cars', sub: esc(plural(Sm.carPays.filter((p) => payState(p) === 'cleared').length, 'confirmed receipt')), value: M(Sm.carIn), href: fhref({ tab: 'money', view: 'cars' }) }),
      glRow({ title: 'Service', sub: 'Collected at the workshop', value: M(Sm.svcIn), href: fhref({ tab: 'money', view: 'service' }) }),
      Sm.byd.length ? glRow({ title: 'BYD warranty claims', sub: esc(plural(Sm.byd.length, 'claim')) + ' paid to us', value: M(Sm.bydIn), href: fhref({ tab: 'money', view: 'byd' }) }) : '',
      waiting.length ? glRow({ title: 'Waiting for Accounts', sub: esc(plural(waiting.length, 'payment')) + ' · not counted yet', value: M(waitSum), href: verify ? '#/approvals?tab=money' : fhref({ tab: 'money' }) }) : '',
      Sm.bounced ? glRow({ title: 'Bounced', sub: 'Not received', value: M(Sm.bounced), tone: 'neg', href: fhref({ tab: 'money', view: 'bounced' }) }) : '',
    ].join(''));
    const went = group('', [
      glRow({ title: 'Suppliers', sub: esc(plural(Sm.vps.length, 'payment')), value: M(Sm.out.suppliers), href: fhref({ tab: 'vendors' }) }),
      glRow({ title: 'Spending', sub: esc(plural(Sm.paidExp.length, 'expense')) + ' paid', value: M(Sm.out.spending), href: fhref({ tab: 'expenses', view: 'paid' }) }),
      glRow({ title: 'Refunds', sub: esc(plural(Sm.refunds.length, 'refund')) + ' paid', value: M(Sm.out.refunds), href: fhref({ tab: 'money', view: 'refunds' }) }),
    ].join(''));
    const owedUs = group('Owed to us', [
      glRow({ title: 'After delivery', sub: rc.after.length ? esc(plural(rc.after.length, 'item')) + (late.length ? ` · <span class="tone-red">${esc(plural(late.length, 'item'))} over 30 days</span>` : '') : 'Nobody', value: M(owedAfter), href: fhref({ tab: 'ledger' }) }),
      glRow({ title: 'Before delivery', sub: 'To collect before the car goes', value: M(owedBefore), href: fhref({ tab: 'ledger', view: 'before' }) }),
      glRow({ title: 'By BYD', sub: esc(plural(cl.filter((c) => c.owed > 0).length, 'warranty claim')) + ' open', value: M(byd), href: fhref({ tab: 'revenue', kind: 'warranty' }) }),
    ].join(''));
    const weOwe = group('We owe', [
      glRow({ title: 'Suppliers, due now', sub: esc(M(supOwed)) + ' still owed on open orders', value: M(supDue), href: fhref({ tab: 'vendors' }) }),
      glRow({ title: 'Refunds to pay', sub: esc(plural(refunds.length, 'order')), value: M(refundSum), href: fhref({ tab: 'ledger', view: 'refunds' }) }),
      glRow({ title: 'Approved expenses', sub: esc(plural(toPay.length, 'claim')) + ' to pay', value: M(toPaySum), href: fhref({ tab: 'expenses', view: 'topay' }) }),
    ].join(''));
    const chart = colChart(lastMonths(6).map((k) => { const s = summary(monthRange(k)); return { label: monthLabel(k), value: s.moneyIn - s.moneyOut }; }), 'Money in minus money out by month');

    return `
      <div class="grid grid-3">
        ${NA.ui.kpi({ label: 'Money in · ' + r.label, value: S(Sm.moneyIn), sub: `Cars ${esc(S(Sm.carIn))} · Service ${esc(S(Sm.svcIn))}${Sm.bydIn ? ' · BYD ' + esc(S(Sm.bydIn)) : ''}`, href: fhref({ tab: 'money' }) })}
        ${NA.ui.kpi({ label: 'Money out · ' + r.label, value: S(Sm.moneyOut), sub: `Suppliers ${esc(S(Sm.out.suppliers))} · Spending ${esc(S(Sm.out.spending))}${Sm.out.refunds ? ' · Refunds ' + esc(S(Sm.out.refunds)) : ''}` })}
        ${NA.ui.kpi({ label: 'Owed to us · today', value: S(owedAfter), sub: rc.after.length ? `After delivery · ${esc(S(owedBefore))} more before delivery` : 'Nothing owed after delivery', href: fhref({ tab: 'ledger' }) })}
      </div>
      <div class="fx-net"><span>Money in minus money out · ${esc(r.label)}</span><b>${net < -0.5 ? '− ' : net > 0.5 ? '+ ' : ''}${M(Math.abs(net))}</b></div>
      <div class="grid grid-main-side fx-sec">
        ${card('Needs your attention', '', `<div class="card-body">${alertList(items, 'Nothing needs you right now')}</div>`)}
        ${card('Money in minus money out', '', `<div class="card-body">${chart}<p class="small muted">The last six months. Point at a month to see its figure.</p></div>`)}
      </div>
      <div class="fx-sec fx-cols3">
        <div><div class="fx-q"><h2>What came in?</h2><p>${esc(r.label)} · confirmed money only</p></div>${came}</div>
        <div><div class="fx-q"><h2>What went out?</h2><p>${esc(r.label)}</p></div>${went}</div>
        <div><div class="fx-q"><h2>What do we owe and are owed?</h2><p>As of today</p></div>${owedUs}${ageBar(ageing(rc.after))}${weOwe}</div>
      </div>`;
  }

  /** Money in: receipts for cars and service, refunds paid out, and the cheque register. */
  function moneyRows(r, Sm) {
    const toRow = (p) => ({ kind: num(p.amount) < 0 ? 'refund' : p.orderId ? 'car' : 'service', p, date: day(p.date), no: p.receiptNo || '', customerId: p.customerId, status: payState(p),
      method: p.method || '', ref: p.ref || '', amount: Math.abs(num(p.amount)), o: NA.get('orders', p.orderId), inv: p.invoiceId ? NA.get('invoices', p.invoiceId) : null });
    return {
      cars: Sm.carPays.map(toRow),
      service: Sm.svcRows,
      // Warranty claims BYD paid us (no receipt: the workshop records the amount and date under BYD claims).
      byd: Sm.byd.map((c) => ({ kind: 'byd', c, p: null, o: null, inv: c.inv || null, jc: c.jc || null, date: c.paidAt, no: c.no ? 'Claim ' + c.no : '', customerId: null, from: 'BYD',
        status: 'cleared', method: 'BYD', ref: c.payRef || '', amount: c.paid })),
      refunds: NA.db.payments.filter((p) => num(p.amount) < 0 && inP(p.date, r)).map(toRow),
      // Every cheque or pay order still waiting to clear (any date), and those settled in the period.
      cheques: NA.db.payments.filter((p) => isCheque(p) && num(p.amount) > 0 && (payState(p) === 'pending' || inP(p.date, r))).map(toRow),
      // Money marked "Not received", any way of paying: dated in the period, or marked in the last 30 days.
      bounced: NA.db.payments.filter((p) => num(p.amount) > 0 && payState(p) === 'bounced' && (inP(p.date, r) || bouncedLately(p))).map(toRow),
    };
  }
  const MONEY_VIEWS = { all: 'Money in', cars: 'Car receipts', service: 'Service receipts', byd: 'BYD warranty claims paid', cheques: 'Cheques and pay orders', bounced: 'Bounced payments', refunds: 'Refunds paid' };
  const moneyFor = (x) => (x.kind === 'byd' ? 'Warranty claim' + (x.jc && x.jc.code ? ' · ' + x.jc.code : '') : x.o ? x.o.code : x.inv ? x.inv.no + ' · service' : x.p && x.p.jobCardId ? 'Service' : '');
  const moneyFrom = (x) => x.from || NA.customerName(x.customerId);
  function moneyTab(r, Sm, q) {
    const view = MONEY_VIEWS[q.view] && q.view !== 'all' ? q.view : 'all';
    const R = moneyRows(r, Sm);
    const lists = { all: R.cars.concat(R.service, R.byd), cars: R.cars, service: R.service, byd: R.byd, cheques: R.cheques, bounced: R.bounced, refunds: R.refunds };
    const rows = lists[view].slice();
    const pend = (x) => (x.status === 'pending' ? 0 : 1);
    if (view === 'cheques') rows.sort((a, b) => pend(a) - pend(b) || (pend(a) ? String(b.date).localeCompare(String(a.date)) : String(a.date).localeCompare(String(b.date))));
    else rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
    const verify = NA.can('payments.verify');
    const waiting = B.paymentsToVerify();
    rows.forEach((x) => { x.key = rowKeys(moneyFrom(x), x.no, moneyFor(x), x.ref, x.method); });
    LAST.money = { rows, view, r };
    const okLabel = view === 'refunds' ? 'Paid out' : view === 'bounced' ? 'Bounced' : 'Confirmed';
    const okOf = (x) => (x.status === (view === 'bounced' ? 'bounced' : 'cleared') ? x.amount : 0);
    const chips = [['all', 'All'], ['cars', 'Cars'], ['service', 'Service'], ['byd', 'BYD'], ['cheques', 'Cheques'], ['bounced', 'Bounced'], ['refunds', 'Refunds']]
      .filter(([k]) => !['byd', 'bounced'].includes(k) || lists[k].length || view === k)
      .map(([k, l]) => chip(fhref({ view: k === 'all' ? '' : k }), l, lists[k].length, view === k)).join('');
    const opens = (x) => (x.p ? ['rcpt', x.p.id] : x.inv ? ['inv', x.inv.id] : null);
    const table = NA.ui.table([
      { label: view === 'refunds' ? 'Paid to' : 'Received from', render: (x) => `<div class="cell-main">${esc(moneyFrom(x))}</div><div class="cell-sub">${esc([x.no, moneyFor(x)].filter(Boolean).join(' · '))}</div>` },
      { label: 'Date', cls: 'nowrap fx-sm-hide', render: (x) => esc(NA.fmt.date(x.date)) + (x.status === 'pending' ? `<div class="cell-sub">${esc(plural(Math.max(0, NA.daysBetween(x.date, NA.today())), 'day'))} waiting</div>` : '') },
      { label: 'Paid with', cls: 'fx-sm-hide', render: (x) => {
        const dup = x.status === 'pending' && x.p && B.sameRefPayment ? B.sameRefPayment(x.p) : null;
        return `${esc(x.method || '—')}${x.ref ? `<div class="cell-sub">${esc(x.ref)}</div>` : ''}${dup ? `<div class="cell-sub tone-amber">Same reference as ${esc(dup.receiptNo || 'another receipt')}</div>` : ''}`;
      } },
      { label: 'Status', render: (x) => payBadge(x.status) },
      { label: 'Amount', cls: 'right nowrap', render: (x) => `<b class="fx-amt">${M(x.amount)}</b>` },
      { label: '', cls: 'right nowrap', render: (x) => (verify && x.status === 'pending' && x.p
        ? `<div class="row nowrap"><button class="btn btn-ghost btn-sm" data-act="bounce" data-id="${esc(x.p.id)}">Not received</button><button class="btn btn-ghost btn-sm" data-act="clear" data-id="${esc(x.p.id)}">${isCheque(x.p) ? 'Cleared' : 'Confirm'}</button></div>`
        : opens(x) ? NA.icon('chevron-right', 16, 'gl-chev') : '') },
    ], rows, { empty: { cheques: 'No cheques or pay orders waiting, and none settled in ' + r.label + '.', bounced: 'No payments bounced in ' + r.label + ' or the last 30 days.',
      byd: 'BYD paid no warranty claims in ' + r.label + '.', refunds: 'No refunds paid in ' + r.label + '.' }[view] || 'Nothing received in ' + r.label + '.', emptyIcon: 'wallet',
      rowAttr: (x) => { const o = opens(x); return `class="${o ? 'clickable' : ''}${['void', 'bounced'].includes(x.status) && view !== 'bounced' ? ' fx-void' : ''}"${o ? ` tabindex="0" data-act="${o[0]}" data-id="${esc(o[1])}"` : ''}`
        + ` data-s="${esc(x.key)}" data-ok="${okOf(x)}" data-wait="${x.status === 'pending' ? x.amount : 0}"`; } });
    const okSum = sum(rows, okOf), waitRows = sum(rows.filter((x) => x.status === 'pending'), (x) => x.amount);
    return `
      <div class="grid grid-3 fx-mini">
        ${NA.ui.kpi({ label: 'Money in · ' + r.label, value: S(Sm.moneyIn), sub: Sm.bydIn ? 'Confirmed car receipts, service and BYD claims' : 'Confirmed car receipts and service' })}
        ${NA.ui.kpi({ label: 'Waiting for Accounts', value: S(sum(waiting, (p) => p.amount)), sub: waiting.length ? esc(plural(waiting.length, 'payment')) + ' · any date' : 'All confirmed', href: verify && waiting.length ? '#/approvals?tab=money' : '' })}
        ${NA.ui.kpi({ label: 'Bounced · ' + r.label, value: S(Sm.bounced), sub: Sm.bounced ? 'Collect it again' : 'None', href: lists.bounced.length && view !== 'bounced' ? fhref({ view: 'bounced' }) : '' })}
      </div>
      <div class="toolbar fx-tb mt-24"><div class="chips">${chips}</div><span class="spacer"></span>${searchBox('money', q.q, 'Search name, receipt or cheque')}${NA.ui.btn('Print list', { icon: 'print', act: 'print-money' })}</div>
      <section class="card" data-sfor="money">${table}<p class="fx-nomatch hidden" data-nomatch>No receipts match your search.</p>
        ${rows.length ? `<div class="fx-totals"><span>Shown <b data-sum="count">${rows.length}</b></span><span>${okLabel} <b data-sum="ok">${M(okSum)}</b></span>${view === 'bounced' ? '' : `<span>Waiting <b data-sum="wait">${M(waitRows)}</b></span>`}</div>` : ''}
      </section>
      ${view === 'cheques' ? '<p class="glist-foot">Cheques and pay orders count only once they clear. Mark one “Not received” when it bounces: it stops counting and is owed again.</p>'
        : view === 'bounced' ? '<p class="glist-foot">A bounced car payment gives the consultant a call to collect it again. A bounced service payment shows the bill as owed again and gives the service desk a call.</p>' : ''}`;
  }

  /** Invoices: five columns, details and Print in a sheet. Warranty work is BDT 0 and never counted as sales. */
  const invFor = (i) => { if (i.kind === 'vehicle') { const o = NA.get('orders', i.refId); return o ? 'Car · ' + o.code : 'Car'; } const j = NA.get('jobCards', i.refId); return j ? 'Service · ' + j.code : 'Service'; };
  const INV_PICK = {
    all: () => true,
    vehicle: (i) => i.kind === 'vehicle',
    service: (i) => i.kind !== 'vehicle' && billable(i),
    warranty: (i) => !billable(i),
    unpaid: (i) => billable(i) && invPaid(i) < num(i.total) - 0.5,
  };
  function revenueTab(r, Sm, q) {
    const kind = INV_PICK[q.kind] ? q.kind : 'all';
    const all = Sm.inv.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
    const rows = all.filter(INV_PICK[kind]);
    LAST.invoices = { rows, kind, r };
    const claimOf = new Map(claims().filter((c) => c.inv).map((c) => [c.inv.id, c]));
    const chips = [['all', 'All'], ['vehicle', 'Cars'], ['service', 'Service'], ['warranty', 'Warranty'], ['unpaid', 'Not fully paid']]
      .map(([k, l]) => chip(fhref({ kind: k === 'all' ? '' : k }), l, all.filter(INV_PICK[k]).length, kind === k)).join('');
    const owed = (i) => (billable(i) ? Math.max(0, num(i.total) - invPaid(i)) : 0);
    const waitOn = (i) => (billable(i) && owed(i) > 0.5 ? Math.min(owed(i), invWaiting(i)) : 0);
    const table = NA.ui.table([
      { label: 'Invoice', render: (i) => `<div class="cell-main">${esc(NA.customerName(i.customerId))}</div><div class="cell-sub"><span class="mono">${esc(i.no)}</span> · ${esc(invFor(i))}</div>` },
      { label: 'Date', cls: 'nowrap fx-sm-hide', render: (i) => esc(NA.fmt.date(i.date)) },
      { label: 'Status', render: (i) => (billable(i) ? invBadge(i) : claimBadge(claimOf.get(i.id))) },
      { label: 'Amount', cls: 'right nowrap', render: (i) => (billable(i)
        ? `<b>${M(i.total)}</b>${owed(i) > 0.5 ? `<div class="cell-sub"><span class="tone-red">${M(owed(i))} owed</span>${waitOn(i) > 0.5 ? ' · ' + M(waitOn(i)) + ' waiting' : ''}</div>` : ''}`
        : `<span class="muted">${M(0)}</span><div class="cell-sub">Work ${M(num(i.internalCost) || num(i.subtotal))}</div>`) },
      { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
    ], rows, { empty: 'No invoices in ' + r.label + '. They are created when a car is handed over or a job card is invoiced.', emptyIcon: 'receipt',
      rowAttr: (i) => { const b = billable(i); return `class="clickable" tabindex="0" data-act="inv" data-id="${esc(i.id)}" data-s="${esc(rowKeys(i.no, NA.customerName(i.customerId), invFor(i)))}"`
        + ` data-sub="${b ? num(i.subtotal) : 0}" data-vat="${b ? num(i.vat) : 0}" data-total="${b ? num(i.total) : 0}" data-paid="${b ? invPaid(i) : 0}" data-owed="${owed(i)}"`; } });
    const bill = rows.filter(billable);
    const war = rows.filter((i) => !billable(i));
    return `
      <div class="toolbar fx-tb"><div class="chips">${chips}</div><span class="spacer"></span>${searchBox('inv', q.q, 'Search invoice or customer')}</div>
      <section class="card" data-sfor="inv">${table}<p class="fx-nomatch hidden" data-nomatch>No invoices match your search.</p>
        ${bill.length ? `<div class="fx-totals"><span>Invoices <b data-sum="count">${rows.length}</b></span><span>Before VAT <b data-sum="sub">${M(sum(bill, (i) => i.subtotal))}</b></span><span>VAT <b data-sum="vat">${M(sum(bill, (i) => i.vat))}</b></span><span>Total <b data-sum="total">${M(sum(bill, (i) => i.total))}</b></span><span>Paid <b data-sum="paid">${M(sum(bill, invPaid))}</b></span><span>Owed <b data-sum="owed">${M(sum(bill, owed))}</b></span></div>` : ''}
      </section>
      ${war.length ? `<p class="glist-foot">Warranty work is free to the customer: ${esc(plural(war.length, 'job'))} worth ${M(sum(war, (i) => num(i.internalCost) || num(i.subtotal)))} at cost — claimed from BYD, not counted as sales.</p>` : ''}`;
  }

  /** Invoice sheet: the figures at the rate the invoice was issued at, and Print. */
  function openInvoice(id) {
    const inv = NA.get('invoices', id);
    if (!inv) return NA.ui.toast('This invoice isn’t available to you', 'info');
    const c = NA.customer(inv.customerId) || {};
    const b = billable(inv);
    const paid = invPaid(inv), owed = b ? Math.max(0, num(inv.total) - paid) : 0;
    const waiting = b ? Math.min(owed, invWaiting(inv)) : 0;
    const o = inv.kind === 'vehicle' ? NA.get('orders', inv.refId) : null;
    const jc = inv.kind !== 'vehicle' ? NA.get('jobCards', inv.refId) : null;
    const cl = !b ? claims().find((x) => x.inv && x.inv.id === inv.id) : null;
    const work = num(inv.internalCost) || num(inv.subtotal);
    const rows = [
      glRow({ title: 'Customer', value: esc(c.name || NA.customerName(inv.customerId)), href: inv.customerId && NA.canSee('customers') && NA.customer(inv.customerId) ? '#/customers/' + inv.customerId : '' }),
      glRow({ title: 'Date', value: esc(NA.fmt.date(inv.date)) }),
      o ? glRow({ title: 'Sales order', value: esc(o.code + ' · ' + NA.modelName(o.modelId)), href: '#/sales/' + o.id })
        : jc ? glRow({ title: 'Job card', value: esc(jc.code || 'Open'), href: jobHref(jc.id) }) : '',
    ].join('');
    const money = b ? [
      glRow({ title: 'Total before VAT', value: M(inv.subtotal) }),
      glRow({ title: 'VAT ' + ratePct(invRate(inv)), value: M(inv.vat) }),
      glRow({ title: 'Total', value: `<b>${M(inv.total)}</b>` }),
      glRow({ title: 'Paid', sub: 'Confirmed by Accounts', value: M(paid) }),
      waiting > 0.5 ? glRow({ title: 'Waiting for Accounts', sub: 'Handed in, not confirmed yet', value: M(waiting) }) : '',
      glRow({ title: 'Still owed', value: M(owed), tone: owed > 0.5 ? 'neg' : '' }),
      canLetGo(inv) ? glRow({ title: 'Car still at the workshop', sub: 'It leaves once the bill is paid', right: letGoBtn(`data-inv-credit="${esc(inv.id)}"`), cls: 'fx-wrap' }) : '',
      inv.credit ? glRow({ title: 'Car let go before it was paid', sub: esc(inv.credit.note || ''), value: esc(inv.credit.by || '—'), valueSub: inv.credit.at ? esc(NA.fmt.date(inv.credit.at)) : '' }) : '',
    ].join('') : [
      glRow({ title: 'Value of the work', sub: 'Parts and labour at cost', value: M(work) }),
      glRow({ title: 'Customer pays', value: M(0) }),
      glRow({ title: 'BYD claim', sub: cl && cl.no ? 'Claim ' + esc(cl.no) : 'No claim number yet', right: claimBadge(cl) }),
    ].join('');
    const el = NA.ui.modal({
      title: (b ? 'Invoice ' : 'Warranty note ') + inv.no, size: 'md', subtitle: esc(inv.kind === 'vehicle' ? 'Vehicle sale' : 'After-sales service'),
      body: `<div class="fx-sheet"><div class="row-between"><span class="fx-amount">${M(b ? inv.total : 0)}</span>${b ? invBadge(inv) : claimBadge(cl)}</div>
        <div class="glist">${rows}</div><div class="glist">${money}</div></div>`,
      actions: [{ label: 'Close' }, { label: 'Print', kind: 'primary', icon: 'print', onClick: () => { printInvoice(inv); return false; } }],
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('a[href^="#/"]')) { NA.ui.closeTop(); return; }
      const cr = e.target.closest('[data-inv-credit]');
      if (cr) { NA.ui.closeTop(); setTimeout(() => letGo(cr.dataset.invCredit), 180); }
    });
  }

  /** Suppliers: what is due now on approved purchase orders and parts bills, what each supplier is owed, what was paid.
      Purchasing raises the car orders and Accounts pays them from the purchase order; parts bills are paid here. */
  function vendorsTab(r) {
    const all = NA.db.purchaseOrders.map(poStats);
    const live = all.filter((x) => x.live);
    const due = live.filter((x) => x.dueNow >= 100).sort((a, b) => String(a.po.date).localeCompare(String(b.po.date)));
    const bills = partBills().filter((x) => x.owed > 0.5).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const billsOwed = sum(bills, (x) => x.owed);
    // Left on orders still waiting for (or never sent for) approval: not owed yet.
    const waitLeft = sum(live.filter((x) => x.outstanding <= 0.5 && !['approved', 'rejected'].includes(x.approval)), (x) => x.left);
    const shown = all.filter((x) => !x.cancelled && (x.outstanding > 0.5 || x.overpaid || inP(x.po.date, r) || !['closed', 'received'].includes(x.po.stage)))
      .sort((a, b) => String(b.po.date).localeCompare(String(a.po.date)));
    const cancelledN = all.filter((x) => x.cancelled && inP(x.po.date, r)).length;
    const vps = NA.db.vendorPayments.filter((p) => inP(p.date, r)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const paidP = sum(vps.filter(vpLive), (p) => p.amount);
    const pay = NA.can('vendor.pay');
    const pct = num(NA.db.settings.advancePct) || 0.3;
    const stageLbl = (po) => (po.type === 'emergency' ? NA.stageLabel(NA.FLOW.emergencyStages, po.stage) : NA.stageLabel(NA.FLOW.poStages, po.stage));
    const approvalBadge = (x) => (x.approval === 'approved' ? '' : x.approval === 'pending' ? NA.ui.badge('Waiting for approval', 'amber', 'clock') : x.approval === 'rejected' ? NA.ui.badge('Declined', 'red', 'x') : NA.ui.badge('Not approved yet', 'gray', 'lock'));
    // Only a commitment is owed. An order waiting for approval shows what is left on it; a declined one owes nothing.
    const owedCell = (x) => {
      if (x.overpaid) return `<b class="tone-red">Overpaid ${M(x.overpaid)}</b>`;
      if (x.unconfirmed) return '<span class="muted">Not confirmed yet</span>';
      if (x.outstanding > 0.5) return `<b>${M(x.outstanding)}</b>`;
      if (x.left <= 0.5) return NA.ui.badge('Settled', 'gray', 'check');
      if (x.approval === 'rejected') return '<span class="muted">Not owed</span><div class="cell-sub">Declined</div>';
      return `<span class="muted">${M(x.left)}</span><div class="cell-sub">${x.approval === 'approved' ? 'Not owed yet' : 'Owed once approved'}</div>`;
    };
    const dueRows = due.map((x) => glRow({ title: `${x.po.code} · ${NA.vendorName(x.po.vendorId)}`, sub: esc(x.due.map((d) => d.what).join(' · ')), value: M(x.dueNow),
      href: '#/procurement/' + x.po.id, right: `<span class="btn btn-plain btn-sm">${pay ? 'Pay' : 'Open'}</span>` })).join('')
      + bills.map((x) => glRow({ title: `${x.o.code} · ${NA.vendorName(x.vendorId)}`, value: M(x.owed), act: pay ? 'part-pay' : '', id: x.o.id, right: pay ? '<span class="btn btn-plain btn-sm">Pay</span>' : '',
        sub: esc(['Parts received ' + NA.fmt.date(x.date), x.bills.length ? 'bill ' + x.bills.join(', ') : '', x.paid > 0.5 ? M(x.paid) + ' paid' : ''].filter(Boolean).join(' · ')) })).join('');
    const counts = (n1, n2) => [n1 ? plural(n1, 'purchase order') : '', n2 ? plural(n2, 'parts bill') : ''].filter(Boolean).join(' · ');
    const poTable = NA.ui.table([
      { label: 'Purchase order', render: (x) => `<div class="cell-main">${esc(NA.vendorName(x.po.vendorId))}</div><div class="cell-sub"><span class="mono">${esc(x.po.code)}</span> · ${esc(NA.fmt.date(x.po.date))} · ${x.po.type === 'emergency' ? 'Emergency, 100%' : esc(pctTxt(x.pct) + ' advance, ' + pctTxt(1 - x.pct) + ' per car')}</div>` },
      { label: 'Stage', cls: 'fx-sm-hide', render: (x) => `${esc(stageLbl(x.po))}${x.units ? `<div class="cell-sub">${esc(x.released + ' of ' + x.units)} ${x.po.type === 'emergency' ? 'paid in full' : 'released'}</div>` : ''}${approvalBadge(x) ? `<div class="mt-4">${approvalBadge(x)}</div>` : ''}` },
      { label: 'Total', cls: 'right nowrap fx-sm-hide', render: (x) => M(x.total) },
      { label: 'Paid', render: (x) => `${NA.ui.progress(x.total ? Math.min(1, x.paid / x.total) : 0, x.left > 0.5 ? 'amber' : 'green')}<div class="cell-sub">${esc(NA.fmt.pct(x.total ? Math.min(1, x.paid / x.total) : 0))} · ${M(x.paid)}${x.po.type !== 'emergency' && x.advNeeded ? ` · advance ${x.adv >= x.advNeeded - 1 ? 'paid' : 'not paid'}` : ''}</div>` },
      { label: 'Still owed', cls: 'right nowrap', render: owedCell },
      { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
    ], shown, { empty: 'No purchase orders in ' + r.label, emptyIcon: 'cart', rowAttr: (x) => `class="clickable" tabindex="0" data-href="#/procurement/${esc(x.po.id)}"` });
    const vendorRows = NA.db.vendors.map((v) => {
      const mine = live.filter((x) => x.po.vendorId === v.id), pb = bills.filter((x) => x.vendorId === v.id);
      const owed = sum(mine, (x) => x.outstanding) + sum(pb, (x) => x.owed), paidV = sum(vps.filter((p) => vpLive(p) && p.vendorId === v.id), (p) => p.amount);
      if (!mine.length && !pb.length && !paidV) return '';
      return glRow({ title: v.name, sub: esc([v.terms, mine.length || !pb.length ? plural(mine.filter((x) => x.outstanding > 0.5).length, 'open order') : '', pb.length ? plural(pb.length, 'parts bill') + ' to pay' : ''].filter(Boolean).join(' · ')) + (paidV ? ' · paid ' + esc(M(paidV)) + ' in ' + esc(r.label) : ''), value: M(owed), valueSub: 'still owed' });
    }).join('');
    const payTable = NA.ui.table([
      { label: 'Paid to', render: (p) => { const po = NA.get('purchaseOrders', p.poId), pt = !po && p.partOrderId ? NA.get('partOrders', p.partOrderId) : null; const code = po ? po.code : pt ? pt.code : '';
        return `<div class="cell-main">${esc(NA.vendorName(p.vendorId))}</div><div class="cell-sub">${code ? `<span class="mono">${esc(code)}</span> · ` : ''}${esc(p.kind || 'Payment')}${p.vin ? ' · VIN ' + esc(p.vin) : ''}</div>`; } },
      { label: 'Date', cls: 'nowrap fx-sm-hide', render: (p) => esc(NA.fmt.date(p.date)) },
      { label: 'Paid with', cls: 'fx-sm-hide', render: (p) => `${esc(p.method || '—')}${p.ref ? `<div class="cell-sub">${esc(p.ref)}</div>` : ''}` },
      { label: 'Amount', cls: 'right nowrap', render: (p) => `<b class="fx-amt">${M(p.amount)}</b>${vpLive(p) ? '' : `<div class="cell-sub">Void${p.void && p.void.reason ? ' · ' + esc(p.void.reason) : ''}</div>`}` },
    ], vps, { empty: 'No supplier payments in ' + r.label, emptyIcon: 'wallet', rowAttr: (p) => (vpLive(p) ? '' : 'class="fx-void"') });
    return `
      <div class="grid grid-3">
        ${NA.ui.kpi({ label: 'Due to pay now', value: S(sum(due, (x) => x.dueNow) + billsOwed), sub: due.length || bills.length ? esc(counts(due.length, bills.length)) : 'Nothing due' })}
        ${NA.ui.kpi({ label: 'Still owed on open orders', value: S(sum(live, (x) => x.outstanding) + billsOwed), sub: esc([counts(live.filter((x) => x.outstanding > 0.5).length, bills.length) || 'Nothing owed', waitLeft > 0.5 ? S(waitLeft) + ' more once approved' : ''].filter(Boolean).join(' · ')) })}
        ${NA.ui.kpi({ label: 'Paid · ' + r.label, value: S(paidP), sub: esc(plural(vps.filter(vpLive).length, 'payment')) })}
      </div>
      <div class="fx-steps fx-sec" aria-label="How BYD orders are paid">
        <span class="fx-step"><b>1</b>${esc(pctTxt(pct))} advance with the purchase order</span>${NA.icon('chevron-right', 16)}
        <span class="fx-step"><b>2</b>${esc(pctTxt(1 - pct))} per car once it is in a shipment batch</span>${NA.icon('chevron-right', 16)}
        <span class="fx-step"><b>3</b>BYD sends the VIN · car received into stock</span>
        <span class="spacer"></span><span class="small muted">CG Runner emergency cars: 100% once the VIN is confirmed</span>
      </div>
      <div class="fx-sec">${group('Due to pay now', dueRows || glRow({ title: 'Nothing is due', sub: 'Money is due on purchase orders the Managing Director approved, and on parts the workshop received' }),
        pay ? 'Car orders are paid on the purchase order, with the bank reference. Parts bills are paid here.' : 'Accounts pays these.')}</div>
      <div class="fx-sec">${card('Purchase orders', '', poTable, cancelledN ? `<span class="small muted">${esc(plural(cancelledN, 'cancelled order'))} not counted</span>` : '')}</div>
      ${vendorRows ? `<div class="fx-sec">${group('By supplier', vendorRows)}</div>` : ''}
      <div class="fx-sec">${card('Payments · ' + r.label, '', payTable, `<b>${M(paidP)}</b>`)}</div>`;
  }

  /** Accounts pays a parts bill: a supplier payment carrying the parts order's id (Purchasing lists it with the rest). */
  function payPartBill(id) {
    const x = partBills().find((b) => b.o.id === id);
    if (!x || x.owed <= 0.5) return NA.ui.toast('This parts bill is already paid', 'info');
    if (!NA.can('vendor.pay')) return NA.ui.toast('Accounts pays suppliers', 'info');
    NA.ui.formModal({
      title: 'Pay parts bill', size: 'sm', submitLabel: 'Record payment',
      subtitle: esc(`${x.o.code} · ${NA.vendorName(x.vendorId)}${x.bills.length ? ' · bill ' + x.bills.join(', ') : ''}`),
      intro: `<p class="fx-intro">Parts worth ${esc(M(x.value))} arrived${x.date ? ' on ' + esc(NA.fmt.date(x.date)) : ''}${x.paid > 0.5 ? '. ' + esc(M(x.paid)) + ' is paid already' : ''}.</p>`,
      fields: [
        { name: 'amount', label: 'Amount paid', type: 'money', required: true, min: 1 },
        { name: 'date', label: 'Paid on', type: 'date', required: true, max: NA.today() },
        { name: 'method', label: 'Paid with', type: 'select', options: PAY_METHODS, placeholder: false },
        { name: 'ref', label: 'Reference', placeholder: 'Cheque or transfer no.' },
      ],
      values: { amount: Math.round(x.owed), date: NA.today(), method: PAY_METHODS.includes('Bank Transfer') ? 'Bank Transfer' : PAY_METHODS[0] },
      onSubmit: (v) => {
        const cur = partBills().find((b) => b.o.id === id);
        if (!cur || cur.owed <= 0.5) { NA.ui.toast('This parts bill was paid in the meantime', 'info'); NA.refresh(); return; }
        const amount = Math.round(num(v.amount)), ref = String(v.ref || '').trim();
        if (!(amount > 0)) { NA.ui.toast('Enter the amount paid', 'error'); return false; }
        if (amount > cur.owed + 0.5) { NA.ui.toast(`That is more than the ${M(cur.owed)} still owed`, 'error'); return false; }
        if (!v.date || v.date > NA.today()) { NA.ui.toast('The date cannot be in the future', 'error'); return false; }
        if (v.method !== 'Cash' && !ref) { NA.ui.toast('Enter the cheque or transfer reference', 'error'); return false; }
        const used = ref && NA.db.vendorPayments.find((q) => vpLive(q) && q.vendorId === cur.vendorId && String(q.ref || '').trim().toLowerCase() === ref.toLowerCase());
        if (used) { NA.ui.toast(`Reference ${ref} is already on another payment to this supplier (${NA.fmt.date(used.date)})`, 'error'); return false; }
        const who = NA.me();
        NA.insert('vendorPayments', { partOrderId: cur.o.id, vendorId: cur.vendorId || '', date: v.date, amount, kind: 'Parts bill', method: v.method, ref: v.method === 'Cash' ? '' : ref,
          vendorBillNo: cur.bills.join(', '), status: 'paid', paidBy: who.name, paidById: who.staffId || null, paidAt: new Date().toISOString(), void: null });
        NA.log(`Parts bill ${cur.o.code} paid — ${M(amount)} to ${NA.vendorName(cur.vendorId)} (${v.method}${ref && v.method !== 'Cash' ? ' ' + ref : ''})`, { rec: NA.get('partOrders', cur.o.id), kind: 'money', link: '#/finance?tab=vendors' });
        NA.ui.toast('Payment recorded');
        NA.refresh();
      },
    });
  }

  /** VAT: what was charged on sales, what can be claimed back on bills, the net for each month and the next return. */
  function vatTab(r) {
    const rate = vatRate();
    const months = monthsIn(r).map(vatMonth).reverse();
    LAST.vat = { months, r };
    const tot = { out: sum(months, (m) => m.out), in: sum(months, (m) => m.in), net: sum(months, (m) => m.net), sales: sum(months, (m) => m.sales) };
    const t = NA.today();
    const vr = nextVatReturn();
    // VAT inside money already received for cars not invoiced yet (booking and part payments): due once invoiced.
    const invoiced = new Set(NA.db.invoices.filter((i) => i.kind === 'vehicle').map((i) => i.refId));
    const adv = NA.db.payments.filter((p) => p.orderId && num(p.amount) > 0 && payState(p) === 'cleared' && !invoiced.has(p.orderId) && ((NA.get('orders', p.orderId) || {}).stage || 'cancelled') !== 'cancelled');
    const advSum = sum(adv, (p) => p.amount);
    const noMushak = sum(months, (m) => m.noMushak);
    const table = NA.ui.table([
      { label: 'Month', render: (m) => `<div class="cell-main">${esc(m.long)}${m.key === t.slice(0, 7) ? ' ' + NA.ui.badge('So far', 'gray') : ''}</div><div class="cell-sub">Return due ${esc(NA.fmt.date(m.due))}</div>` },
      { label: 'Sales before VAT', cls: 'right nowrap fx-sm-hide', render: (m) => M(m.sales) },
      { label: 'VAT on sales', cls: 'right nowrap', render: (m) => M(m.out) },
      { label: 'VAT on bills', cls: 'right nowrap fx-sm-hide', render: (m) => M(m.in) },
      { label: 'To pay', cls: 'right nowrap', render: (m) => (m.net >= 0 ? `<b>${M(m.net)}</b>` : `<b>${M(-m.net)}</b><div class="cell-sub">credit</div>`) },
      { label: 'Return', cls: 'nowrap', render: returnCell },
      { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
    ], months, { empty: 'No VAT activity in ' + r.label, emptyIcon: 'file-text', rowAttr: (m) => `class="clickable" tabindex="0" data-act="vat-month" data-id="${esc(m.key)}"` });
    const chart = colChart(months.slice(0, 12).reverse().map((m) => ({ label: m.label, value: m.net })), 'VAT to pay by month');
    const fileBtn = canManage() && vr.active && !vr.partial ? `<button class="btn btn-primary" data-act="vat-file" data-id="${esc(vr.key)}">Mark as filed</button>` : '';
    return `
      <div class="grid grid-3">
        ${NA.ui.kpi({ label: 'VAT on sales · ' + r.label, value: S(tot.out), sub: 'On ' + esc(M(tot.sales)) + ' of sales before VAT' })}
        ${NA.ui.kpi({ label: 'VAT on bills · ' + r.label, value: S(tot.in), sub: 'Claimed back with Mushak 6.3' })}
        ${NA.ui.kpi({ label: tot.net >= 0 ? 'VAT to pay · ' + r.label : 'VAT credit · ' + r.label, value: S(Math.abs(tot.net)), sub: tot.net >= 0 ? 'Paid to NBR with the monthly return' : 'Carried forward to the next return' })}
      </div>
      ${vr.active ? `<div class="fx-sec">${nextStep('file-text', `Return for ${vr.long}${vr.partial ? ' (so far)' : ''} ${vr.daysLeft < 0 ? 'was due on' : 'is due by'} ${NA.fmt.date(vr.due)}`,
        (vr.net >= 0 ? M(vr.net) + ' to pay' : M(-vr.net) + ' credit to carry forward') + ' · Mushak 9.1 · ' + (vr.daysLeft >= 0 ? plural(vr.daysLeft, 'day') + ' left' : 'overdue, not marked as filed'), fileBtn)}</div>` : ''}
      <div class="grid grid-main-side fx-sec">
        ${card('By month', '', table)}
        <div class="stack gap-24">
          ${card('VAT to pay by month', '', `<div class="card-body">${chart}</div>`)}
          ${group('Also good to know', [
            glRow({ title: 'VAT inside advances', sub: `On ${esc(M(advSum))} received for cars not invoiced yet`, value: M(vatInside(advSum, rate)) }),
            glRow({ title: 'Standard rate', sub: 'Set by the Managing Director in Settings', value: esc(ratePct(rate)) }),
            noMushak ? glRow({ title: 'Bills without a Mushak 6.3 number', sub: 'Their VAT can’t be claimed until the number is added', value: esc(String(noMushak)), tone: 'neg', href: fhref({ tab: 'expenses', view: 'books' }) }) : '',
          ].join(''))}
        </div>
      </div>
      <details class="fx-learn"><summary>${NA.icon('info', 15)}How VAT works here</summary><div><ul>
        <li>VAT on sales is the VAT inside car invoices and paid service invoices. Warranty work is free to the customer, so it carries no VAT.</li>
        <li>VAT on bills is the VAT on approved expenses with a Mushak 6.3 number and the supplier’s BIN. It is claimed back, so spending is counted before VAT.</li>
        <li>The difference is paid to NBR with the Mushak 9.1 return by the 15th of the next month. A negative month is a credit carried forward.</li>
        <li>Once the return is in, Accounts marks the month as filed with the return number. The month is not locked: if its invoices or bills change later, its sheet shows the difference.</li>
        <li>Each invoice keeps the rate it was issued at, so a change of rate never alters old invoices.</li>
      </ul></div></details>`;
  }
  /** The Return column: filed (when and the return number), or not filed yet. */
  function returnCell(m) {
    if (m.filed) return `${NA.ui.badge('Filed', 'green', 'check')}<div class="cell-sub">${esc(NA.fmt.date(m.filed.filedOn))}${m.filed.ref ? ' · ' + esc(m.filed.ref) : ''}</div>`;
    if (!m.ended) return '<span class="muted">Not due yet</span>';
    return m.due < NA.today() ? NA.ui.badge('Not filed', 'amber', 'alert') : `${NA.ui.badge('Not filed yet', 'gray', 'clock')}<div class="cell-sub">Due ${esc(NA.fmt.date(m.due))}</div>`;
  }
  /** One month's VAT: the figures, whether its return is filed, and (Accounts) mark it filed, change or undo that. */
  function openVatMonth(k) {
    if (!/^\d{4}-\d{2}$/.test(String(k || ''))) return;
    const m = vatMonth(k), f = m.filed, can = canManage() && m.ended;
    const changed = f && f.computedNet != null && Math.abs(num(f.computedNet) - m.net) > 0.5;
    const rows = [
      glRow({ title: 'VAT on car sales', value: M(m.outV) }),
      glRow({ title: 'VAT on paid service', value: M(m.outS) }),
      glRow({ title: 'VAT on bills', sub: 'Claimed back with Mushak 6.3', value: '− ' + M(m.in) }),
      glRow({ title: m.net >= 0 ? 'To pay' : 'Credit to carry forward', value: `<b>${M(Math.abs(m.net))}</b>` }),
      glRow({ title: 'Return due', value: esc(NA.fmt.date(m.due)) }),
    ].join('');
    const filedRows = f ? [
      glRow({ title: 'Filed on', value: esc(NA.fmt.date(f.filedOn)), valueSub: f.filedBy ? 'by ' + esc(f.filedBy) : '' }),
      f.ref ? glRow({ title: 'Return no.', value: esc(f.ref) }) : '',
      glRow({ title: 'VAT paid with the return', value: M(f.vatPayable) }),
      f.note ? glRow({ title: 'Note', sub: esc(f.note) }) : '',
    ].join('') : '';
    const status = f ? NA.ui.badge('Filed', 'green', 'check') : !m.ended ? NA.ui.badge('Not due yet', 'gray', 'clock') : m.due < NA.today() ? NA.ui.badge('Not filed', 'amber', 'alert') : NA.ui.badge('Not filed yet', 'gray', 'clock');
    const actions = [{ label: 'Close' }];
    if (can && f) {
      actions.push({ label: 'Undo filing', kind: 'danger', onClick: async () => {
        if (!(await NA.ui.confirm(`Mark the return for <b>${esc(m.long)}</b> as not filed?`, { title: 'Undo filing', okLabel: 'Undo filing', danger: true }))) return false;
        const cur = vatReturnFor(k); if (!cur) return;
        const who = NA.me();
        NA.update('vatReturns', cur.id, { void: { by: who.name, byId: who.staffId || null, at: new Date().toISOString() } });
        NA.log(`VAT return for ${m.long} marked as not filed by ${who.name}`, { kind: 'warn', link: '#/finance?tab=vat' });
        NA.ui.toast('Marked as not filed', 'info'); NA.refresh();
      } });
      actions.push({ label: 'Change', onClick: () => { setTimeout(() => vatFileSheet(k), 180); } });
    } else if (can) actions.push({ label: 'Mark as filed', kind: 'primary', onClick: () => { setTimeout(() => vatFileSheet(k), 180); } });
    NA.ui.modal({
      title: 'VAT · ' + m.long, size: 'md', subtitle: 'Mushak 9.1 return',
      body: `<div class="fx-sheet"><div class="row-between"><span class="fx-amount">${M(Math.abs(m.net))}</span>${status}</div>
        ${changed ? `<div class="callout callout-warn">${NA.icon('alert', 16)}<div>The figures changed after the return was filed: ${esc(M(f.computedNet))} then, ${esc(M(m.net))} now. Check this month’s invoices and bills.</div></div>` : ''}
        <div class="glist">${rows}</div>${filedRows ? `<div><div class="glist-title">The return</div><div class="glist">${filedRows}</div></div>` : ''}</div>`,
      actions,
    });
  }
  /** Mark a month's VAT return filed (or change the filing). The month stays open. */
  function vatFileSheet(k) {
    if (!canManage()) return NA.ui.toast('Accounts files the VAT return', 'info');
    const m = vatMonth(k), cur = m.filed;
    if (!m.ended) return NA.ui.toast(m.long + ' is not over yet', 'info');
    NA.ui.formModal({
      title: cur ? 'Change the filing' : 'Mark VAT return filed', size: 'sm', submitLabel: cur ? 'Save' : 'Mark as filed',
      subtitle: esc('Mushak 9.1 · ' + m.long),
      intro: `<p class="fx-intro">Worked out here: ${m.net >= 0 ? esc(M(m.net)) + ' to pay' : esc(M(-m.net)) + ' credit to carry forward'}. Filing does not lock the month.</p>`,
      fields: [
        { name: 'filedOn', label: 'Filed on', type: 'date', required: true, max: NA.today() },
        { name: 'ref', label: 'Return or submission no.', required: true, placeholder: 'From the NBR VAT portal' },
        { name: 'vatPayable', label: 'VAT paid with the return', type: 'money', min: 0 },
        { name: 'note', label: 'Note', type: 'textarea', rows: 2, span: 2, placeholder: 'Optional' },
      ],
      values: cur ? { filedOn: cur.filedOn, ref: cur.ref, vatPayable: cur.vatPayable, note: cur.note } : { filedOn: NA.today(), vatPayable: Math.max(0, Math.round(m.net)) },
      onSubmit: (v) => {
        if (!v.filedOn || v.filedOn > NA.today()) { NA.ui.toast('The filing date cannot be in the future', 'error'); return false; }
        if (v.filedOn < k + '-01') { NA.ui.toast('The return cannot be filed before ' + m.long + ' started', 'error'); return false; }
        const ref = String(v.ref || '').trim();
        if (!ref) { NA.ui.toast('Enter the return number', 'error'); return false; }
        const data = { filedOn: v.filedOn, ref, vatPayable: Math.max(0, Math.round(num(v.vatPayable))), note: String(v.note || '').trim() };
        const who = NA.me(), now = vatReturnFor(k);
        if (!cur && now) { NA.ui.toast('Someone marked it filed in the meantime', 'info'); NA.refresh(); return; }
        if (now) {
          NA.update('vatReturns', now.id, data);
          NA.log(`VAT return for ${m.long} changed: filed ${NA.fmt.date(data.filedOn)}, return ${ref}, ${M(data.vatPayable)}`, { kind: 'info', link: '#/finance?tab=vat' });
        } else {
          NA.insert('vatReturns', Object.assign({ month: k, filedBy: who.name, filedById: who.staffId || null, computedNet: Math.round(m.net) }, data));
          NA.log(`VAT return for ${m.long} filed — return ${ref}, ${M(data.vatPayable)} paid`, { kind: 'success', link: '#/finance?tab=vat' });
        }
        NA.ui.toast(cur ? 'Filing saved' : 'Marked as filed');
        NA.refresh();
      },
    });
  }

  /** Spending: claims to approve and to pay, what is in the books for the period by part of the business, and every
      expense with its status. A row opens the expense sheet (edit, pay, void — never delete). */
  function expensesTab(r, Sm, q) {
    const allE = NA.db.expenses;
    const lists = {
      books: Sm.booked,
      pending: allE.filter((e) => expStatus(e) === 'pending'),
      topay: allE.filter((e) => expStatus(e) === 'approved'),
      paid: Sm.paidExp,
      closed: allE.filter((e) => ['void', 'rejected'].includes(expStatus(e)) && inP(e.date, r)),
    };
    const view = lists[q.view] ? q.view : (canManage() && lists.topay.length ? 'topay' : 'books');
    const cc = NA.FLOW.costCentres.includes(q.cc) || q.cc === 'Other' ? q.cc : '';
    const inCc = (e) => !cc || (cc === 'Other' ? !NA.FLOW.costCentres.includes(e.costCentre) : e.costCentre === cc);
    const queue = view === 'pending' || view === 'topay';
    const rows = lists[view].filter(inCc).slice().sort((a, b) => (queue ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date))));
    // By part of the business (in the books, before claimable VAT). The showroom and workshop earn; the rest support them.
    // The workshop also carries the work it did on our own cars (closed job cards with no customer to bill).
    const centres = NA.FLOW.costCentres.concat(Sm.booked.some((e) => !NA.FLOW.costCentres.includes(e.costCentre)) ? ['Other'] : []).map((c) => {
      const spend = sum(Sm.booked.filter((e) => (c === 'Other' ? !NA.FLOW.costCentres.includes(e.costCentre) : e.costCentre === c)), expCost);
      const sales = c === 'Showroom' ? Sm.vehEx : c === 'Workshop' ? Sm.svcEx : 0;
      const cogs = c === 'Showroom' && canCost() ? Sm.cogs : 0;
      const own = c === 'Workshop' ? Sm.ownCost : 0;
      return { c, spend, own, sales, cogs, profit: sales - cogs - spend - own };
    });
    const ccRows = centres.map((x) => glRow({ icon: CC_ICONS[x.c] || 'tag', title: x.c,
      sub: x.sales ? esc(`Sales ${S(x.sales)}${x.cogs ? ' − cost of cars ' + S(x.cogs) : ''} − spending ${S(x.spend)}${x.own ? ' − our own cars ' + S(x.own) : ''}`)
        : x.own ? esc(`Spending ${S(x.spend)} + work on our own cars ${S(x.own)}`) : 'Spending',
      value: x.sales ? `${x.profit < 0 ? '−' : ''}${M(Math.abs(x.profit))}` : M(x.spend + x.own), tone: x.sales && x.profit < 0 ? 'neg' : '', valueSub: x.sales ? 'profit' : '',
      href: fhref({ view: 'books', cc: cc === x.c ? '' : x.c }), right: cc === x.c ? `<span class="tone-blue">${NA.icon('check', 16)}</span>` : '' })).join('');
    const byCat = {};
    Sm.booked.filter(inCc).forEach((e) => { const k = e.category || 'Other'; byCat[k] = (byCat[k] || 0) + expCost(e); });
    const catRows = Object.keys(byCat).map((k) => ({ label: k, value: byCat[k] })).sort((a, b) => b.value - a.value).slice(0, 8);
    const chips = [['books', 'In the books'], ['pending', 'Waiting for approval'], ['topay', 'To pay'], ['paid', 'Paid'], ['closed', 'Void and declined']]
      .map(([k, l]) => chip(fhref({ view: k }), l, lists[k].filter(inCc).length, view === k)).join('');
    const table = NA.ui.table([
      { label: 'What for', render: (e) => `<div class="cell-main">${esc(e.category || 'Expense')}</div><div class="cell-sub">${esc([e.paidTo ? 'To ' + e.paidTo : '', expClaimant(e) ? 'claimed by ' + expClaimant(e) : '', e.code].filter(Boolean).join(' · '))}</div>` },
      { label: 'Date', cls: 'nowrap fx-sm-hide', render: (e) => esc(NA.fmt.date(view === 'paid' ? expPaidOn(e) : e.date)) },
      { label: 'Part of the business', cls: 'fx-sm-hide', render: (e) => esc(e.costCentre || '—') },
      { label: 'Status', render: (e) => { const ap = expStatus(e) === 'pending' && A ? A.find('expenses', e.id, 'expense') : null; return ap && A.canDecide(ap) ? NA.ui.badge('Waiting for you', 'amber', 'clock') : expBadge(e); } },
      { label: 'Amount', cls: 'right nowrap', render: (e) => `<b class="fx-amt">${M(e.amount)}</b>${num(e.vatPaid) ? `<div class="cell-sub">VAT ${M(e.vatPaid)}</div>` : ''}` },
      { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
    ], rows, { empty: { books: 'Nothing in the books for ' + r.label + (cc ? ' at ' + cc : '') + '.', pending: 'No claims are waiting for approval.', topay: 'Nothing approved is waiting to be paid.', paid: 'Nothing paid in ' + r.label + '.', closed: 'Nothing voided or declined in ' + r.label + '.' }[view], emptyIcon: 'receipt',
      rowAttr: (e) => `class="clickable${['void', 'rejected'].includes(expStatus(e)) ? ' fx-void' : ''}" tabindex="0" data-act="exp" data-id="${esc(e.id)}" data-s="${esc(rowKeys(e.category, e.paidTo, expClaimant(e), e.code, e.ref, e.costCentre))}" data-total="${['void', 'rejected'].includes(expStatus(e)) ? 0 : num(e.amount)}" data-vat="${['void', 'rejected'].includes(expStatus(e)) ? 0 : num(e.vatPaid)}"` });
    const live = rows.filter((e) => !['void', 'rejected'].includes(expStatus(e)));
    return `
      <div class="grid grid-3">
        ${view === 'paid'
          ? NA.ui.kpi({ label: 'Paid out · ' + r.label, value: S(Sm.out.spending), sub: 'Expenses paid, VAT included' })
          : NA.ui.kpi({ label: 'In the books · ' + r.label, value: S(Sm.spend), sub: 'Approved and paid, before claimable VAT', href: view === 'books' && !cc ? '' : fhref({ view: 'books', cc: '' }) })}
        ${NA.ui.kpi({ label: 'Approved, to pay', value: S(sum(lists.topay, (e) => e.amount)), sub: lists.topay.length ? esc(plural(lists.topay.length, 'claim')) : 'Nothing to pay', href: fhref({ view: 'topay', cc: '' }) })}
        ${NA.ui.kpi({ label: 'Waiting for approval', value: S(sum(lists.pending, (e) => e.amount)), sub: lists.pending.length ? esc(plural(lists.pending.length, 'claim')) : 'None', href: fhref({ view: 'pending', cc: '' }) })}
      </div>
      <div class="grid grid-2 fx-sec">
        <div>${group('By part of the business · ' + r.label, ccRows, (cc ? 'Showing ' + esc(cc) + ' only — tap it again to see everything.' : 'Tap one to see only its spending. Sales and cost of cars are before VAT.')
          + (Sm.ownCost ? ' Work on our own cars is the value of the workshop’s closed job cards on cars nobody is billed for.' : ''))}</div>
        ${card('Biggest spending' + (cc ? ' · ' + cc : ''), '', `<div class="card-body">${hbars(catRows)}</div>`)}
      </div>
      <div class="toolbar fx-tb fx-sec"><div class="chips">${chips}</div><span class="spacer"></span>${searchBox('exp', q.q, 'Search what for, paid to or who claimed')}</div>
      <section class="card" data-sfor="exp">${table}<p class="fx-nomatch hidden" data-nomatch>No expenses match your search.</p>
        ${rows.length ? `<div class="fx-totals"><span>Expenses <b data-sum="count">${rows.length}</b></span><span>Total <b data-sum="total">${M(sum(live, (e) => e.amount))}</b></span><span>VAT on the bills <b data-sum="vat">${M(sum(live, (e) => e.vatPaid))}</b></span></div>` : ''}
      </section>
      <p class="glist-foot">Small spends up to ${M(NA.policy().expenseFree)} need no approval. Above that, Accounts approves up to ${M(NA.policy().expenseAccounts)} and the Managing Director above. Nobody approves their own claim.</p>`;
  }

  /** Customers who owe: after delivery (real debts, with ageing), before delivery, refunds we owe, or everyone. As of today. */
  function ledgerTab(q) {
    const view = ['before', 'refunds', 'all'].includes(q.view) ? q.view : 'after';
    const rc = receivables();
    const refunds = refundsDue();
    const ages = ageing(rc.after);
    const owedAfter = sum(rc.after, (x) => x.amount), owedBefore = sum(rc.before, (x) => x.amount), refundSum = sum(refunds, (o) => o.refund.amount);
    const late = rc.after.filter((x) => x.days > 30);
    const canPay = NA.can('payments.record') && typeof NA.actions.recordPayment === 'function';
    const custKeys = (cid) => { const c = NA.customer(cid) || {}; return [c.name, c.mobile, c.company]; };
    const who = (cid) => { const c = NA.customer(cid) || {}; return `<div class="cell-main">${esc(c.name || NA.customerName(cid))}</div><div class="cell-sub">${esc([c.mobile, c.type === 'Corporate' ? 'Corporate' : ''].filter(Boolean).join(' · '))}</div>`; };
    const ageTone = (d) => (d > 60 ? 'red' : d > 30 ? 'amber' : 'gray');
    const rowAttr = (cid, keys) => `class="clickable" tabindex="0" data-act="ledger" data-id="${esc(cid)}" data-s="${esc(rowKeys(...keys))}"`;
    let table = '';
    if (view === 'after') {
      table = NA.ui.table([
        { label: 'Customer', render: (x) => who(x.customerId) },
        { label: 'For', render: (x) => `<div>${esc(x.ref)} · ${esc(x.what)}</div><div class="cell-sub">${esc(x.kind === 'car' ? 'Delivered ' + NA.fmt.date(x.since) : 'Invoiced ' + NA.fmt.date(x.since))}${x.waiting ? ' · ' + esc(M(x.waiting)) + ' waiting for Accounts' : ''}${x.kind === 'service' ? esc(creditText(x.inv) ? ' · ' + creditText(x.inv) : carAtWorkshop(x.inv) ? ' · car still at the workshop' : '') : ''}</div>` },
        { label: 'Age', cls: 'nowrap', render: (x) => NA.ui.badge(plural(x.days, 'day'), ageTone(x.days), x.days > 30 ? 'alert' : 'clock') },
        { label: 'Owed', cls: 'right nowrap', render: (x) => `<b>${M(x.amount)}</b>` },
        // On phones the row opens the statement, which has the same button.
        { label: '', cls: 'right nowrap', render: (x) => (x.kind === 'service' && canLetGo(x.inv)
          ? `<span class="fx-sm-hide">${letGoBtn(`data-act="svc-credit" data-id="${esc(x.inv.id)}"`)}</span><span class="fx-sm-only">${NA.icon('chevron-right', 16, 'gl-chev')}</span>`
          : NA.icon('chevron-right', 16, 'gl-chev')) },
      ], rc.after, { empty: 'Nobody owes money after delivery.', emptyIcon: 'check-circle', rowAttr: (x) => rowAttr(x.customerId, custKeys(x.customerId).concat([x.ref])) + ` data-total="${x.amount}"` });
    } else if (view === 'before') {
      table = NA.ui.table([
        { label: 'Customer', render: (x) => who(x.customerId) },
        { label: 'Order', render: (x) => `<div>${esc(x.ref)} · ${esc(x.what)}</div><div class="cell-sub">${esc(NA.stageLabel(NA.FLOW.orderStages, x.o.stage))}${x.waiting ? ' · ' + esc(M(x.waiting)) + ' waiting for Accounts' : ''}</div>` },
        { label: 'Paid so far', cls: 'fx-sm-hide', render: (x) => `${NA.ui.progress(B.orderPaidPct(x.o), 'brand')}<div class="cell-sub">${esc(NA.fmt.pct(B.orderPaidPct(x.o)))} of ${M(B.orderNet(x.o))}</div>` },
        { label: 'To collect', cls: 'right nowrap', render: (x) => `<b>${M(x.amount)}</b>` },
        { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
      ], rc.before, { empty: 'No open orders have money left to collect.', emptyIcon: 'check-circle', rowAttr: (x) => rowAttr(x.customerId, custKeys(x.customerId).concat([x.ref])) + ` data-total="${x.amount}"` });
    } else if (view === 'refunds') {
      const payRefund = typeof NA.actions.payRefund === 'function' && canManage();
      table = NA.ui.table([
        { label: 'Customer', render: (o) => who(o.customerId) },
        { label: 'Cancelled order', render: (o) => `<div>${esc(o.code)} · ${esc(NA.modelName(o.modelId))}</div><div class="cell-sub">${esc(o.refund.approvedBy ? 'Approved by ' + o.refund.approvedBy : 'Approved')}</div>` },
        { label: 'Refund', cls: 'right nowrap', render: (o) => `<b>${M(o.refund.amount)}</b>` },
        { label: '', cls: 'right nowrap', render: (o) => (payRefund ? `<button class="btn btn-ghost btn-sm" data-act="refund" data-id="${esc(o.id)}">Pay refund</button>` : `<a class="btn btn-plain btn-sm" href="#/sales/${esc(o.id)}">Open order</a>`) },
      ], refunds, { empty: 'No refunds are waiting to be paid.', emptyIcon: 'check-circle', rowAttr: (o) => rowAttr(o.customerId, custKeys(o.customerId).concat([o.code])) + ` data-total="${num(o.refund.amount)}"` });
    } else {
      const all = customerBalances().sort((a, b) => b.balance - a.balance || String(a.c.name).localeCompare(String(b.c.name)));
      table = NA.ui.table([
        { label: 'Customer', render: (x) => who(x.c.id) },
        { label: 'Charged', cls: 'right nowrap fx-sm-hide', render: (x) => M(x.charged) },
        { label: 'Paid', cls: 'right nowrap fx-sm-hide', render: (x) => M(x.paid) + (x.waiting ? `<div class="cell-sub">${M(x.waiting)} waiting</div>` : '') },
        { label: 'Balance', cls: 'right nowrap', render: (x) => (x.balance > 0.5 ? `<b>${M(x.balance)}</b><div class="cell-sub">owes us</div>` : x.balance < -0.5 ? `<b>${M(-x.balance)}</b><div class="cell-sub">we owe them</div>` : NA.ui.badge('Clear', 'gray', 'check')) },
        { label: '', cls: 'right', render: () => NA.icon('chevron-right', 16, 'gl-chev') },
      ], all, { empty: 'No customer money yet.', emptyIcon: 'users', rowAttr: (x) => rowAttr(x.c.id, [x.c.name, x.c.mobile, x.c.company]) + ` data-total="${Math.max(0, x.balance)}"` });
    }
    const chips = [['after', 'After delivery', rc.after.length], ['before', 'Before delivery', rc.before.length], ['refunds', 'Refunds to pay', refunds.length], ['all', 'All customers', null]]
      .map(([k, l, n]) => chip(fhref({ view: k === 'after' ? '' : k }), l, n, view === k)).join('');
    return `
      <div class="grid grid-3">
        ${NA.ui.kpi({ label: 'Owed after delivery', value: S(owedAfter), sub: rc.after.length ? esc(plural(rc.after.length, 'item')) + (late.length ? ' · ' + esc(M(sum(late, (x) => x.amount))) + ' over 30 days' : '') : 'Nobody', href: fhref({ view: '' }) })}
        ${NA.ui.kpi({ label: 'To collect before delivery', value: S(owedBefore), sub: esc(plural(rc.before.length, 'open order')), href: fhref({ view: 'before' }) })}
        ${NA.ui.kpi({ label: 'Refunds to pay', value: S(refundSum), sub: refunds.length ? esc(plural(refunds.length, 'order')) : 'None', href: fhref({ view: 'refunds' }) })}
      </div>
      ${owedAfter ? `<section class="card pad fx-sec"><div class="row-between"><b>Owed after delivery, by age</b><span class="small muted">From the delivery or invoice date</span></div><div class="mt-12">${ageBar(ages)}</div>${ageLegend(ages)}</section>` : ''}
      <div class="toolbar fx-tb fx-sec"><div class="chips">${chips}</div><span class="spacer"></span>${searchBox('owe', q.q, 'Search customer, phone or order')}</div>
      <section class="card" data-sfor="owe">${table}<p class="fx-nomatch hidden" data-nomatch>No customers match your search.</p>
        ${view !== 'all' && (view === 'refunds' ? refunds : view === 'after' ? rc.after : rc.before).length ? `<div class="fx-totals"><span>Shown <b data-sum="count">${(view === 'refunds' ? refunds : view === 'after' ? rc.after : rc.before).length}</b></span><span>Total <b data-sum="total">${M(view === 'refunds' ? refundSum : view === 'after' ? owedAfter : owedBefore)}</b></span></div>` : ''}
      </section>
      <p class="glist-foot">${canPay ? 'Open a customer to see their statement and collect each item.' : 'Open a customer to see their statement.'} Only money Accounts has confirmed counts as paid.</p>`;
  }

  /** Pay an approved refund: Sales owns the refund payout on the order; without it, open the order. */
  function payRefund(orderId) {
    if (typeof NA.actions.payRefund === 'function' && canManage()) NA.actions.payRefund(orderId);
    else NA.go('#/sales/' + orderId);
  }

  /** The customer's statement: every open item with its own Collect button, then Charged / Paid / Balance by date. */
  function openLedger(cid) {
    const c = NA.customer(cid);
    if (!c) return NA.ui.toast('This customer isn’t available to you', 'info');
    const idx = byCustomer();
    const L = ledgerFor(cid, idx);
    const g = idx.get(cid) || { orders: [], invoices: [] };
    const canPay = NA.can('payments.record') && typeof NA.actions.recordPayment === 'function';
    const open = [];
    g.orders.forEach((o) => {
      if (o.stage === 'cancelled') { if (o.refund && o.refund.status === 'due' && num(o.refund.amount) > 0) open.push({ kind: 'refund', o, amount: num(o.refund.amount) }); return; }
      const bal = B.orderBalance(o);
      if (bal > 0.5) open.push({ kind: 'car', o, amount: bal, left: B.orderToCollect(o), waiting: B.orderPending(o), paused: B.cancelPending(o), after: o.stage === 'delivered' });
    });
    const sidx = svcPayIndex();
    g.invoices.forEach((i) => {
      if (!billable(i)) return;
      const m = svcMoney(i, sidx), due = num(i.total) - m.paid;
      if (due > 0.5) open.push({ kind: 'service', inv: i, amount: due, waiting: Math.min(due, m.waiting), left: Math.max(0, due - m.waiting) });
    });
    let first = true;
    const btn = (label, attrs) => { const k = first ? 'primary' : 'ghost'; first = false; return `<button class="btn btn-${k} btn-sm" ${attrs}>${esc(label)}</button>`; };
    // Money already handed in is not collected again: it waits for Accounts to confirm it.
    const confirmLink = NA.can('payments.verify') ? '<a class="btn btn-plain btn-sm" href="#/approvals?tab=money">Confirm money</a>' : '';
    const items = open.map((x) => {
      if (x.kind === 'car') {
        const sub = esc([NA.modelName(x.o.modelId), x.after ? 'delivered ' + NA.fmt.date(deliveredOn(x.o)) : NA.stageLabel(NA.FLOW.orderStages, x.o.stage),
          x.waiting > 0.5 ? M(x.waiting) + ' waiting for Accounts' : '', x.paused ? 'a cancellation is waiting for a decision' : ''].filter(Boolean).join(' · '));
        const orderLink = `<a class="btn btn-plain btn-sm" href="#/sales/${esc(x.o.id)}">Open order</a>`;
        if (x.paused) return glRow({ title: `${M(x.amount)} owed · ${x.o.code}`, sub, right: orderLink });
        if (x.left <= 0.5) return glRow({ title: `${M(x.amount)} waiting for Accounts · ${x.o.code}`, sub, right: confirmLink || orderLink });
        return glRow({ title: `Collect ${M(x.left)} · ${x.o.code}`, sub, right: canPay ? btn('Collect', `data-ledger-pay="${esc(x.o.id)}"`) : orderLink });
      }
      if (x.kind === 'service') {
        const job = jobHref(x.inv.refId) ? `<a class="btn btn-plain btn-sm" href="${esc(jobHref(x.inv.refId))}">Open job card</a>` : '';
        if (x.left <= 0.5) return glRow({ title: `${M(x.amount)} waiting for Accounts · service ${x.inv.no}`, sub: 'Handed in at the workshop', right: confirmLink || job });
        const letGoHere = canLetGo(x.inv) ? letGoBtn(`data-ledger-credit="${esc(x.inv.id)}"`) : '';
        return glRow({ title: `Collect ${M(x.left)} · service ${x.inv.no}`, right: letGoHere + job, cls: letGoHere ? 'fx-wrap' : '',
          sub: esc([job ? 'Collected on the job card' : 'The workshop collects it on the job card', creditText(x.inv) || (carAtWorkshop(x.inv) ? 'car still at the workshop' : ''), x.waiting > 0.5 ? M(x.waiting) + ' waiting for Accounts' : ''].filter(Boolean).join(' · ')) });
      }
      return glRow({ title: `Refund ${M(x.amount)} to pay · ${x.o.code}`, sub: esc(x.o.refund.approvedBy ? 'Approved by ' + x.o.refund.approvedBy : 'Cancellation approved'),
        right: typeof NA.actions.payRefund === 'function' && canManage() ? btn('Pay refund', `data-ledger-refund="${esc(x.o.id)}"`) : `<a class="btn btn-plain btn-sm" href="#/sales/${esc(x.o.id)}">Open order</a>` });
    }).join('');
    const statusTag = (x) => (x.status && x.status !== 'cleared' ? ' ' + payBadge(x.status) : '');
    const body = `<div class="fx-sheet">
      <div class="row gap-12">${NA.ui.avatar(c.name, 44)}<div class="grow"><b>${esc(c.name)}</b><div class="small muted">${esc([c.mobile, c.email, c.address].filter(Boolean).join(' · '))}</div></div></div>
      <div class="grid grid-3 fx-mini">
        ${NA.ui.kpi({ label: 'Charged', value: S(L.charged) })}
        ${NA.ui.kpi({ label: 'Paid', value: S(L.paid), sub: L.waiting ? esc(M(L.waiting)) + ' waiting' : '' })}
        ${NA.ui.kpi({ label: L.balance < -0.5 ? 'We owe them' : 'Still owed', value: S(Math.abs(L.balance)) })}
      </div>
      ${items ? group('To do', items) : ''}
      ${L.rows.length ? `<div><div class="glist-title">Statement</div><div class="card"><div class="table-wrap"><table class="table fx-ledger">
        <thead><tr><th>Date</th><th>What</th><th class="r">Charged</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
        <tbody>${L.rows.map((x) => `<tr class="${x.status && x.status !== 'cleared' ? 'fx-muted' : ''}"${x.payId ? ` data-ledger-rcpt="${esc(x.payId)}" tabindex="0" title="Open the receipt"` : ''}>
          <td class="nowrap">${esc(NA.fmt.date(x.date))}</td>
          <td><div>${esc(x.text)}${statusTag(x)}</div><div class="cell-sub">${x.href ? `<a class="btn-link" href="${esc(x.href)}">${esc(x.ref)}</a>` : esc(x.ref)}</div></td>
          <td class="r nowrap">${x.charged ? M(x.charged) : ''}</td><td class="r nowrap">${x.paid ? M(x.paid) : x.status && x.status !== 'cleared' ? `<span class="fx-strike">${M(x.amount)}</span>` : ''}</td>
          <td class="r nowrap">${M(x.balance)}</td></tr>`).join('')}
          <tr class="fx-sum"><td colspan="2">Totals</td><td class="r nowrap">${M(L.charged)}</td><td class="r nowrap">${M(L.paid)}</td><td class="r nowrap">${M(L.balance)}</td></tr>
        </tbody></table></div></div>
        <p class="glist-foot">Tap a payment to see or reprint its receipt. Money waiting for Accounts or bounced is not counted.</p></div>`
        : NA.ui.empty('No money for this customer yet', 'receipt')}
    </div>`;
    const el = NA.ui.drawer({
      title: 'Customer statement', subtitle: 'As of ' + esc(NA.fmt.date(NA.today())), body,
      actions: [
        { label: 'Print statement', icon: 'print', onClick: () => { printStatement(c); return false; } },
        NA.canSee('customers') ? { label: 'Open customer', icon: 'user', onClick: () => { NA.go('#/customers/' + c.id); } } : { label: 'Done' },
      ],
    });
    el.addEventListener('click', (e) => {
      // links to orders / job cards navigate away — close the drawer so it does not sit over the new page
      if (e.target.closest('a[href^="#/"]')) { NA.ui.closeTop(); return; }
      const pay = e.target.closest('[data-ledger-pay]');
      if (pay) { NA.ui.closeTop(); setTimeout(() => NA.actions.recordPayment(pay.dataset.ledgerPay), 180); return; }
      const rf = e.target.closest('[data-ledger-refund]');
      if (rf) { NA.ui.closeTop(); setTimeout(() => payRefund(rf.dataset.ledgerRefund), 180); return; }
      const cr = e.target.closest('[data-ledger-credit]');
      if (cr) { NA.ui.closeTop(); setTimeout(() => letGo(cr.dataset.ledgerCredit), 180); return; }
      const rc = e.target.closest('[data-ledger-rcpt]');
      if (rc) openReceipt(rc.dataset.ledgerRcpt);
    });
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ledger-rcpt]')) { e.preventDefault(); openReceipt(e.target.dataset.ledgerRcpt); } });
  }

  /** A receipt: who paid, how, its status, and Print duplicate / Share on WhatsApp. */
  function openReceipt(id) {
    const p = NA.get('payments', id);
    if (!p) return NA.ui.toast('This receipt isn’t available to you', 'info');
    const o = NA.get('orders', p.orderId);
    const inv = p.invoiceId ? NA.get('invoices', p.invoiceId) : null;
    const c = NA.customer(p.customerId || (o && o.customerId)) || {};
    const st = payState(p);
    const refund = num(p.amount) < 0;
    const amt = Math.abs(num(p.amount));
    const stText = st === 'cleared' ? (p.verifiedBy ? 'Confirmed by ' + p.verifiedBy + (p.verifiedAt ? ' · ' + NA.fmt.date(p.verifiedAt) : '') : 'Counted')
      : st === 'pending' ? 'Waiting for Accounts to confirm' : st === 'bounced' ? 'Not received' + (p.verifyNote ? ' · ' + p.verifyNote : '') : 'Voided';
    const rows = [
      glRow({ title: refund ? 'Paid to' : 'Received from', value: esc(c.name || NA.customerName(p.customerId)), href: c.id && NA.canSee('customers') ? '#/customers/' + c.id : '' }),
      glRow({ title: 'Date', value: esc(NA.fmt.date(p.date)) }),
      glRow({ title: 'Paid with', value: esc(p.method || '—'), valueSub: p.ref ? esc(p.ref) : '' }),
      glRow({ title: 'Status', sub: esc(stText), right: payBadge(st) }),
      o ? glRow({ title: refund ? 'Cancelled order' : 'Sales order', value: esc(o.code + ' · ' + NA.modelName(o.modelId)), href: '#/sales/' + o.id }) : '',
      inv ? glRow({ title: 'Service invoice', value: esc(inv.no) }) : '',
      p.receivedBy ? glRow({ title: refund ? 'Paid out by' : 'Received by', value: esc(p.receivedBy) }) : '',
      p.printedAt ? glRow({ title: 'Printed', value: esc(plural(num(p.printCount) || 1, 'time')), valueSub: 'first by ' + esc(p.printedBy || '—') }) : '',
    ].join('');
    const msg = `${settings().company || 'Noor Autos'} — ${refund ? 'refund' : 'money receipt'} ${p.receiptNo || ''}: ${M(amt)} ${refund ? 'paid to you' : 'received'} on ${NA.fmt.date(p.date)}${o ? ' for ' + o.code : ''}. Thank you.`;
    const wa = c.mobile ? `<a class="btn btn-ghost" href="${esc(waLink(c.mobile, msg))}" target="_blank" rel="noopener">${NA.icon('whatsapp', 16)}Share on WhatsApp</a>` : '';
    const el = NA.ui.modal({
      title: (refund ? 'Refund voucher ' : 'Money receipt ') + (p.receiptNo || ''), size: 'sm', subtitle: esc(refund ? 'Money paid back to the customer' : 'Customer payment'),
      body: `<div class="fx-sheet"><div class="row-between"><span class="fx-amount${['bounced', 'void'].includes(st) ? ' fx-strike' : ''}">${M(amt)}</span>${payBadge(st)}</div><div class="glist">${rows}</div>${wa}</div>`,
      actions: [{ label: 'Close' }, { label: refund ? 'Print voucher' : p.printedAt ? 'Print duplicate' : 'Print receipt', kind: 'primary', icon: 'print', onClick: () => { printReceipt(NA.get('payments', p.id) || p); return false; } }],
    });
    el.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) NA.ui.closeTop(); });
  }

  /** Profit & loss by month (default: this financial year): sales before VAT, cost of cars, gross profit, spending
      by category (approved and paid, before the VAT claimed back) and the net. Exported as CSV for Excel. */
  function pnlTab(r) {
    const cost = canCost();
    const cols = monthsIn(r).map((k) => ({ k, label: monthLabel(k), long: monthLabel(k, true), s: summary(monthRange(k)) }));
    const cats = {};
    cols.forEach((c) => c.s.booked.forEach((e) => { const k = e.category || 'Other'; const m = cats[k] || (cats[k] = {}); m[c.k] = (m[c.k] || 0) + expCost(e); }));
    const catTotal = (k) => sum(Object.keys(cats[k]), (m) => cats[k][m]);
    const catNames = Object.keys(cats).sort((a, b) => catTotal(b) - catTotal(a));
    const T = (fn) => sum(cols, fn);
    const gross = (c) => c.s.salesEx - (cost ? c.s.cogs : 0);
    const spendAll = (c) => c.s.spend + c.s.ownCost;   // expenses, plus the workshop's work on our own cars
    const tot = { cars: T((c) => c.s.vehEx), svc: T((c) => c.s.svcEx), cogs: T((c) => c.s.cogs), spend: T((c) => c.s.spend), own: T((c) => c.s.ownCost) };
    tot.sales = tot.cars + tot.svc; tot.gross = tot.sales - (cost ? tot.cogs : 0); tot.net = tot.gross - tot.spend - tot.own;
    const est = T((c) => c.s.costEstimates);
    LAST.pnl = { cols, cats, catNames, r, cost, gross, spendAll };
    const signed = (v) => (v < 0 ? '−' : '') + M(Math.abs(v));
    const top = catNames.slice(0, 8), rest = catNames.slice(8);
    const statement = group('Profit & loss · ' + r.label, [
      glRow({ title: 'Sales of cars', sub: 'Before VAT', value: M(tot.cars) }),
      glRow({ title: 'Paid service', sub: 'Before VAT', value: M(tot.svc) }),
      cost ? glRow({ title: 'Cost of cars sold', value: '− ' + M(tot.cogs) }) : '',
      glRow({ title: 'Gross profit', sub: tot.sales ? esc(NA.fmt.pct(tot.gross / tot.sales, 1)) + ' of sales' : '', value: `<b>${signed(tot.gross)}</b>`, tone: tot.gross < 0 ? 'neg' : '' }),
      top.map((k) => glRow({ title: k, sub: 'Spending', value: '− ' + M(catTotal(k)) })).join(''),
      rest.length ? glRow({ title: 'Other spending', sub: esc(plural(rest.length, 'category')), value: '− ' + M(sum(rest, catTotal)) }) : '',
      tot.own ? glRow({ title: 'Work on our own cars', sub: 'Workshop · closed job cards nobody is billed for', value: '− ' + M(tot.own) }) : '',
      glRow({ title: 'Net profit', value: `<b>${signed(tot.net)}</b>`, tone: tot.net < 0 ? 'neg' : '' }),
    ].join(''), 'Spending counts once approved, before the VAT claimed back. Warranty work is free to the customer and is not a sale.'
      + (est ? ` ${esc(plural(est, 'car'))} use today’s catalogue cost because the car’s own cost was not recorded.` : ''));
    const head = `<tr><th>Month</th><th class="r">Sales before VAT</th>${cost ? '<th class="r fx-sm-hide">Cost of cars</th><th class="r">Gross profit</th>' : ''}<th class="r fx-sm-hide">Spending</th><th class="r">Net profit</th></tr>`;
    const line = (label, c, strong) => `<tr class="${strong ? 'fx-sum' : ''}"><td class="nowrap">${esc(label)}</td><td class="r nowrap">${M(c.sales)}</td>${cost ? `<td class="r nowrap fx-sm-hide">${M(c.cogs)}</td><td class="r nowrap">${signed(c.gross)}</td>` : ''}<td class="r nowrap fx-sm-hide">${M(c.spend)}</td><td class="r nowrap"><b class="${c.net < 0 ? 'tone-red' : ''}">${signed(c.net)}</b></td></tr>`;
    const months = cols.slice().reverse().map((c) => line(c.long + (c.k === NA.today().slice(0, 7) ? ' (so far)' : ''), { sales: c.s.salesEx, cogs: c.s.cogs, gross: gross(c), spend: spendAll(c), net: gross(c) - spendAll(c) })).join('');
    const table = cols.length ? `<div class="table-wrap"><table class="table fx-pnl"><thead>${head}</thead><tbody>${months}${line('Total', { sales: tot.sales, cogs: tot.cogs, gross: tot.gross, spend: tot.spend + tot.own, net: tot.net }, true)}</tbody></table></div>`
      : NA.ui.empty('Nothing to show for ' + r.label + ' yet', 'chart');
    return `
      <div class="grid grid-3">
        ${NA.ui.kpi({ label: 'Sales before VAT · ' + r.label, value: S(tot.sales), sub: `Cars ${esc(S(tot.cars))} · Service ${esc(S(tot.svc))}` })}
        ${cost ? NA.ui.kpi({ label: 'Gross profit', value: (tot.gross < 0 ? '−' : '') + S(Math.abs(tot.gross)), sub: tot.sales ? esc(NA.fmt.pct(tot.gross / tot.sales, 1)) + ' of sales, after the cost of cars' : 'No sales yet' })
          : NA.ui.kpi({ label: 'Spending', value: S(tot.spend + tot.own), sub: 'Approved and paid, before VAT claimed back' })}
        ${NA.ui.kpi({ label: 'Net profit', value: (tot.net < 0 ? '−' : '') + S(Math.abs(tot.net)), sub: cost ? 'After the cost of cars and all spending' : 'Sales minus spending (costs are not shown to you)' })}
      </div>
      <div class="grid grid-main-side fx-sec">
        <div class="stack gap-24">${card('Net profit by month', '', `<div class="card-body">${colChart(cols.slice(-12).map((c) => ({ label: c.label, value: gross(c) - spendAll(c) })), 'Net profit by month')}</div>`)}${card('By month', '', table)}</div>
        <div>${statement}</div>
      </div>`;
  }
  function pnlCsv() {
    const P = LAST.pnl;
    if (!P || !P.cols.length) return NA.ui.toast('Nothing to export for this period', 'info');
    const line = (label, fn) => [label].concat(P.cols.map((c) => Math.round(fn(c))), [Math.round(sum(P.cols, fn))]);
    const rows = [['Profit & loss', P.r.label].concat(P.cols.map(() => '')), ['Line'].concat(P.cols.map((c) => c.k), ['Total']),
      line('Sales of cars (before VAT)', (c) => c.s.vehEx), line('Paid service (before VAT)', (c) => c.s.svcEx)];
    if (P.cost) rows.push(line('Cost of cars sold', (c) => -c.s.cogs));
    rows.push(line('Gross profit', P.gross));
    P.catNames.forEach((k) => rows.push(line('Spending: ' + k, (c) => -((P.cats[k] || {})[c.k] || 0))));
    if (P.cols.some((c) => c.s.ownCost)) rows.push(line('Work on our own cars (workshop)', (c) => -c.s.ownCost));
    rows.push(line('Total spending', (c) => -P.spendAll(c)), line('Net profit', (c) => P.gross(c) - P.spendAll(c)));
    downloadCsv('profit-and-loss-' + String(P.r.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv', rows);
  }

  /* ---------------------------------------------------------------- Lists: search, print, confirm */
  /** Filter the rows on screen as the person types — no redraw of the page, and the totals under them kept in step. */
  function applySearch(root, el) {
    const term = String(el.value || '').trim().toLowerCase();
    const scope = root.querySelector(`[data-sfor="${el.dataset.search}"]`);
    if (!scope) return;
    const rows = Array.from(scope.querySelectorAll('[data-s]'));
    rows.forEach((row) => row.classList.toggle('hidden', !!term && !String(row.dataset.s || '').includes(term)));
    const vis = rows.filter((row) => !row.classList.contains('hidden'));
    const none = scope.querySelector('[data-nomatch]');
    if (none) none.classList.toggle('hidden', vis.length > 0 || !rows.length);
    scope.querySelectorAll('[data-sum]').forEach((s) => { const k = s.dataset.sum; s.textContent = k === 'count' ? String(vis.length) : M(vis.reduce((t, row) => t + num(row.dataset[k]), 0)); });
  }
  const searchTerm = (root, key) => { const el = root.querySelector(`[data-search="${key}"]`); return el ? String(el.value || '').trim().toLowerCase() : ''; };
  function printInvoices(root) {
    const L = LAST.invoices; if (!L) return;
    const term = searchTerm(root, 'inv');
    const rows = L.rows.filter((i) => !term || rowKeys(i.no, NA.customerName(i.customerId), invFor(i)).includes(term)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.no).localeCompare(String(b.no)));
    const bill = rows.filter(billable);
    const owed = (i) => (billable(i) ? Math.max(0, num(i.total) - invPaid(i)) : 0);
    const KIND = { all: '', vehicle: ' · cars', service: ' · service', warranty: ' · warranty', unpaid: ' · not fully paid' };
    const dash = (i, v) => (billable(i) ? M(v) : '—');
    printTable('Invoices — ' + L.r.label + KIND[L.kind] + (term ? ' · “' + term + '”' : ''), [
      { label: 'Invoice', v: (i) => esc(i.no) }, { label: 'Date', v: (i) => esc(NA.fmt.date(i.date)) }, { label: 'Customer', v: (i) => esc(NA.customerName(i.customerId)) },
      { label: 'For', v: (i) => esc(invFor(i)) }, { label: 'Status', v: (i) => esc(billable(i) ? invStateText(i) : 'Warranty, free (work ' + M(num(i.internalCost) || num(i.subtotal)) + ')') },
      { label: 'Before VAT', r: 1, v: (i) => dash(i, i.subtotal) }, { label: 'VAT', r: 1, v: (i) => dash(i, i.vat) }, { label: 'Total', r: 1, v: (i) => dash(i, i.total) },
      { label: 'Paid', r: 1, v: (i) => dash(i, invPaid(i)) }, { label: 'Owed', r: 1, v: (i) => dash(i, owed(i)) }], rows,
      `<tfoot><tr><th colspan="5">Totals · ${bill.length} invoices${rows.length > bill.length ? ' (warranty work not included)' : ''}</th><th class="r">${M(sum(bill, (i) => i.subtotal))}</th><th class="r">${M(sum(bill, (i) => i.vat))}</th><th class="r">${M(sum(bill, (i) => i.total))}</th><th class="r">${M(sum(bill, invPaid))}</th><th class="r">${M(sum(bill, owed))}</th></tr></tfoot>`);
  }
  function printMoney(root) {
    const L = LAST.money; if (!L) return;
    const term = searchTerm(root, 'money');
    const rows = L.rows.filter((x) => !term || String(x.key || '').includes(term)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const counted = L.view === 'bounced' ? 'bounced' : 'cleared';
    printTable(MONEY_VIEWS[L.view] + ' — ' + L.r.label + (term ? ' · “' + term + '”' : ''), [
      { label: 'Receipt', v: (x) => esc(x.no) }, { label: 'Date', v: (x) => esc(NA.fmt.date(x.date)) }, { label: L.view === 'refunds' ? 'Paid to' : 'Received from', v: (x) => esc(moneyFrom(x)) },
      { label: 'For', v: (x) => esc(x.kind === 'byd' ? moneyFor(x) : x.o ? x.o.code : x.inv ? x.inv.no : '') }, { label: 'Paid with', v: (x) => esc([x.method, x.ref].filter(Boolean).join(' · ')) },
      { label: 'Status', v: (x) => esc(PAY_STATE[x.status] ? PAY_STATE[x.status][0] : '') }, { label: 'Amount', r: 1, v: (x) => M(x.amount) }], rows,
      `<tfoot><tr><th colspan="6">${L.view === 'refunds' ? 'Paid out' : L.view === 'bounced' ? 'Bounced' : 'Confirmed'}</th><th class="r">${M(sum(rows.filter((x) => x.status === counted), (x) => x.amount))}</th></tr></tfoot>`);
  }
  function printVat() {
    const L = LAST.vat; if (!L) return;
    const rows = L.months.slice().reverse();
    printTable('VAT by month — ' + L.r.label, [
      { label: 'Month', v: (m) => esc(m.long) }, { label: 'Return due', v: (m) => esc(NA.fmt.date(m.due)) }, { label: 'Sales before VAT', r: 1, v: (m) => M(m.sales) },
      { label: 'VAT on sales', r: 1, v: (m) => M(m.out) }, { label: 'VAT on bills', r: 1, v: (m) => M(m.in) }, { label: 'To pay (credit)', r: 1, v: (m) => (m.net < 0 ? '(' + M(-m.net) + ')' : M(m.net)) },
      { label: 'Return', v: (m) => (m.filed ? 'Filed ' + esc(NA.fmt.date(m.filed.filedOn)) + (m.filed.ref ? ' · ' + esc(m.filed.ref) : '') : m.ended ? 'Not filed' : 'Not due yet') }], rows,
      `<tfoot><tr><th colspan="2">Total</th><th class="r">${M(sum(rows, (m) => m.sales))}</th><th class="r">${M(sum(rows, (m) => m.out))}</th><th class="r">${M(sum(rows, (m) => m.in))}</th><th class="r">${M(sum(rows, (m) => m.net))}</th><th></th></tr></tfoot>`);
  }
  /** Accounts confirms a payment from the cheque register (the same rule as Approvals → Money to confirm). */
  function verifyPayment(id, ok) {
    const p = NA.get('payments', id);
    if (!p || payState(p) !== 'pending') return NA.ui.toast('This payment is no longer waiting', 'info');
    if (!NA.can('payments.verify')) return NA.ui.toast('Only Accounts confirms money', 'error');
    if (ok) { B.verifyPayment(p, true); NA.ui.toast('Confirmed — ' + M(p.amount)); NA.refresh(); return; }
    // The same sentences as Today and Approvals. A car payment gives the consultant a call (B.verifyPayment); a workshop
    // receipt gives the service desk one (service.js syncBounce).
    const order = p.orderId ? NA.get('orders', p.orderId) : null;
    const after = order ? (order.stage === 'cancelled' ? 'It stops counting.' : 'It stops counting, and the consultant gets a call to collect it again.')
      : p.invoiceId || p.jobCardId ? 'It stops counting. The bill shows as owed again, and the service desk gets a call to collect it.' : 'It stops counting.';
    NA.ui.formModal({
      title: 'Payment not received', size: 'sm', submitLabel: 'Mark as not received',
      intro: `<p class="fx-intro">${esc(p.receiptNo || '')} · ${esc(M(p.amount))} · ${esc(NA.customerName(p.customerId))}. ${esc(after)}</p>`,
      fields: [{ name: 'note', label: 'What happened?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Cheque bounced — insufficient funds' }],
      onSubmit: (v) => { B.verifyPayment(p, false, v.note); NA.ui.toast('Marked as not received', 'info'); NA.refresh(); },
    });
  }
  const periodSelect = (period) => `<label class="fx-period"><span class="sr-only">Period</span><select data-period aria-label="Period">${PERIODS.map((p) => `<option value="${p.key}"${p.key === period ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>${NA.icon('chevron-down', 14)}</label>`;

  /* ---------------------------------------------------------------- Page */
  NA.page({
    path: 'finance', title: 'Accounts', icon: 'chart',
    render(root, params, query) {
      injectCss();
      if (!NA.canSee('finance')) {
        root.innerHTML = `<div class="card pad">${NA.ui.empty('Accounts is used by the Accounts team and the Managing Director. You can still claim an expense from New → Expense.', 'lock',
          `<a class="btn btn-ghost mt-8" href="#/dashboard">Back to Today</a>`)}</div>`;
        return null;
      }
      const q = Object.assign({}, query || {});
      let tab = TAB_ALIAS[q.tab] || q.tab;
      if (q.tab === 'cheques' && !q.view) q.view = 'cheques';
      if (!TABS.some((t) => t.key === tab)) tab = 'overview';
      const explicit = PERIODS.some((p) => p.key === q.period);
      const period = explicit ? q.period : tab === 'pnl' ? 'fy' : 'month';
      Object.assign(VIEW, { tab, period, explicit, q: { view: q.view, kind: q.kind, cc: q.cc, q: q.q } });
      const r = periodRange(period);
      const Sm = tab === 'ledger' ? null : summary(r);
      let body;
      if (tab === 'overview') body = overviewTab(r, Sm);
      else if (tab === 'money') body = moneyTab(r, Sm, q);
      else if (tab === 'ledger') body = ledgerTab(q);
      else if (tab === 'revenue') body = revenueTab(r, Sm, q);
      else if (tab === 'expenses') body = expensesTab(r, Sm, q);
      else if (tab === 'vendors') body = vendorsTab(r);
      else if (tab === 'vat') body = vatTab(r);
      else body = pnlTab(r);

      // One primary action per tab: the next thing Accounts does here.
      const canRecordPay = NA.can('payments.record') && typeof NA.actions.recordPayment === 'function';
      const waitingN = NA.can('payments.verify') ? B.paymentsToVerify().length : 0;
      const recordPay = canRecordPay ? NA.ui.btn('Record payment', { kind: 'primary', icon: 'plus', act: 'pay' }) : '';
      const primary = {
        overview: waitingN ? NA.ui.btn('Confirm money · ' + waitingN, { kind: 'primary', icon: 'check', href: '#/approvals?tab=money' }) : NA.ui.btn('Record expense', { kind: 'primary', icon: 'plus', act: 'new-exp' }),
        money: recordPay, ledger: recordPay,
        revenue: NA.ui.btn('Print list', { icon: 'print', act: 'print-revenue' }),
        expenses: NA.ui.btn('Record expense', { kind: 'primary', icon: 'plus', act: 'new-exp' }),
        vendors: '',
        vat: NA.ui.btn('Print', { icon: 'print', act: 'print-vat' }),
        pnl: NA.ui.btn('Export CSV', { kind: 'primary', icon: 'download', act: 'csv-pnl' }),
      }[tab];
      const range = ['fy', 'lastfy', 'year', 'quarter'].includes(r.key) ? ' · ' + NA.fmt.date(r.from) + ' – ' + NA.fmt.date(r.to) : '';
      root.innerHTML = NA.ui.pageHead({
        title: 'Accounts',
        subtitle: tab === 'ledger' ? 'Who owes money, as of today' : esc(r.label + range),
        actions: (tab === 'ledger' ? '' : periodSelect(period)) + (primary || ''),
      }) + NA.ui.tabs(TABS, tab) + body;

      const off = [];
      off.push(NA.ui.delegate(root, 'click', '[data-tab]', (el) => NA.go(fhref({ tab: el.dataset.tab }))));
      off.push(NA.ui.delegate(root, 'change', '[data-period]', (el) => NA.go(fhref({ period: el.value }))));
      off.push(NA.ui.delegate(root, 'click', '[data-href]', (el, ev) => { if (!ev.target.closest('a, button')) NA.go(el.dataset.href); }));
      // Filter chips keep whatever is typed in the search box.
      off.push(NA.ui.delegate(root, 'click', 'a.chip', (el, ev) => {
        const s = root.querySelector('[data-search]');
        const term = s ? String(s.value || '').trim() : '';
        let href = String(el.getAttribute('href') || '').replace(/([?&])q=[^&]*/, '$1').replace(/&&+/g, '&').replace(/[?&]+$/, '');
        if (term) href += (href.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(term);
        ev.preventDefault(); NA.go(href);
      }));
      off.push(NA.ui.delegate(root, 'click', '[data-act]', (el, ev) => {
        // A link inside a row (e.g. "Open order") goes where it points; the row's own action does not run as well.
        const link = ev && ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (link && link !== el && el.contains(link)) return;
        const act = el.dataset.act, id = el.dataset.id;
        if (act === 'new-exp') NA.actions.newExpense();
        else if (act === 'pay') NA.actions.recordPayment();
        else if (act === 'exp') NA.actions.openExpense(id);
        else if (act === 'inv') openInvoice(id);
        else if (act === 'rcpt') openReceipt(id);
        else if (act === 'ledger') openLedger(id);
        else if (act === 'refund') payRefund(id);
        else if (act === 'svc-credit') letGo(id);
        else if (act === 'part-pay') payPartBill(id);
        else if (act === 'vat-month') openVatMonth(id);
        else if (act === 'vat-file') vatFileSheet(id);
        else if (act === 'clear' || act === 'bounce') verifyPayment(id, act === 'clear');
        else if (act === 'print-revenue') printInvoices(root);
        else if (act === 'print-money') printMoney(root);
        else if (act === 'print-vat') printVat();
        else if (act === 'csv-pnl') pnlCsv();
      }));
      // Rows that open something also work from the keyboard.
      off.push(NA.ui.delegate(root, 'keydown', 'tr[tabindex]', (el, ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === el) { ev.preventDefault(); el.click(); }
      }));
      let timer = null;
      off.push(NA.ui.delegate(root, 'input', '[data-search]', (el) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          applySearch(root, el);
          VIEW.q.q = String(el.value || '').trim();
          try { history.replaceState(null, '', fhref({ q: VIEW.q.q })); } catch (e) { /* the address keeps the old search */ }
        }, 120);
      }));
      root.querySelectorAll('[data-search]').forEach((el) => { if (el.value) applySearch(root, el); });
      // From Approvals: open that expense once, and drop it from the address so a refresh does not open it again.
      if (q.exp) {
        const id = q.exp;
        try { history.replaceState(null, '', fhref({ exp: '' })); } catch (e) { /* ignore */ }
        setTimeout(() => NA.actions.openExpense(id), 60);
      }
      return () => { clearTimeout(timer); off.forEach((u) => u()); };
    },
  });

  /* The same money figures for other screens (Today, Reports). */
  NA.finance = {
    /** Money in for a date range: confirmed car receipts, service collections and BYD claim payments — the Overview and Money in figure. */
    moneyIn: (from, to) => { const s = summary({ key: 'x', from, to, label: '' }); return { cars: s.carIn, service: s.svcIn, byd: s.bydIn, total: s.moneyIn }; },
    /** Money out for a date range: supplier payments, paid expenses and refunds paid. */
    moneyOut: (from, to) => { const s = summary({ key: 'x', from, to, label: '' }); return Object.assign({ total: s.moneyOut }, s.out); },
    /** A service bill's confirmed money and the money waiting for Accounts ({paid, waiting}). */
    serviceBillPaid: (inv) => svcMoney(inv),
    receivables, ageing, claims, refundsDue, poStats, partBills, expStatus, expCounts,
  };
})();
