/* ==========================================================================
   Reports — #/reports?r=<report>&p=month|last|fy|custom&from=yyyy-mm-dd&to=yyyy-mm-dd
   Seven plain questions. Each one is a card with a few numbers, a simple
   chart and a table that exports as CSV:
     team      How is each consultant doing?       MD, Sales Manager
     sources   Where do our customers come from?   MD, Sales Manager
     lost      Why do we lose?                     MD, Sales Manager
     sells     What sells?                         MD, Sales Manager, Accounts
     stock     How old is our stock?               MD, Sales Manager, Accounts, Procurement (as of today)
     owed      Who owes us?                        MD, Sales Manager, Accounts, Service Manager (as of today)
     workshop  How busy is the workshop?           MD, Service Manager
   (Procurement sees only Stock age, and the screen opens on it.)
   Only data the person can see is used (in shared mode the office server
   already filters it). Cost, margin and stock value appear only with
   NA.can('costs.view'); salaries never appear. Managers set monthly targets
   here (collection `targets`, NA.can('targets.set')). Sales consultants see
   their own month on Today, not here.
   Also exposes NA.reports (period helper, targets) and NA.actions.setTargets.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const B = NA.biz;
  const num = (x) => Number(x) || 0;
  const sum = (arr, fn) => arr.reduce((s, x) => s + num(fn ? fn(x) : x), 0);
  const N = (n) => NA.fmt.num(n);
  const M = (n) => NA.fmt.money(n);
  const S = (n) => NA.fmt.short(n);
  const pct = (x) => (isFinite(x) ? Math.round(x * 100) : 0) + '%';
  const plural = (n, one, many) => N(n) + ' ' + (n === 1 ? one : many || one + 's');
  const list = (c) => (NA.db && Array.isArray(NA.db[c]) ? NA.db[c] : []);
  const VIEW_KEY = 'na-reports-view';
  NA.actions = NA.actions || {};

  /* ---------------------------------------------------------------- CSS (tokens only) */
  function injectCss() {
    if (document.getElementById('css-reports')) return;
    const st = document.createElement('style');
    st.id = 'css-reports';
    st.textContent = `
      .page-reports .tabs { margin-bottom: 16px; }
      .rp-period { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 24px; }
      .rp-period .seg { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
      .rp-period .seg::-webkit-scrollbar { display: none; }
      .rp-period .seg button { white-space: nowrap; }
      .rp-range { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13.5px; }
      .rp-range .ico { color: var(--muted-2); }
      .rp-dates { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .rp-dates input { height: 32px; border: 0; border-radius: 8px; padding: 0 10px; background: var(--fill); color: var(--ink); font: inherit; font-size: 13.5px; outline: none; transition: background .15s, box-shadow .15s; }
      .rp-dates input:focus { background: var(--field-bg); box-shadow: var(--focus), 0 0 0 1px var(--tint); }
      .rp-dates .btn { height: 32px; }
      .rp-card { overflow: hidden; }
      .rp-head { padding: 26px 28px 0; }
      .rp-head h2 { font-size: 22px; font-weight: 700; letter-spacing: -.022em; line-height: 1.2; }
      .rp-head p { color: var(--muted); font-size: 13.5px; margin-top: 4px; }
      .rp-figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 22px 32px; padding: 26px 28px 2px; }
      .rp-fig { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .rp-fig-l { font-size: 13px; font-weight: 500; color: var(--muted); }
      .rp-fig-v { font-family: var(--font-display); font-size: 30px; font-weight: 600; letter-spacing: -.03em; line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rp-fig-v small { font-size: 15px; font-weight: 500; color: var(--muted); letter-spacing: -.01em; margin-left: 5px; }
      .rp-fig-v.rp-word { font-size: 20px; letter-spacing: -.02em; line-height: 1.3; white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
      .rp-fig > small { font-size: 12.5px; color: var(--muted); line-height: 1.35; }
      .rp-block { padding: 30px 28px 0; }
      .rp-sub { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 14px; }
      .rp-tblock { margin-top: 30px; }
      .rp-tblock > .rp-sub { padding: 0 28px; margin-bottom: 4px; }
      .rp-tblock .table th:first-child, .rp-tblock .table td:first-child { padding-left: 28px; }
      .rp-tblock .table th:last-child, .rp-tblock .table td:last-child { padding-right: 28px; }
      .rp-total td { font-weight: 600; background: var(--fill-3); }
      .rp-foot { padding: 22px 28px 24px; font-size: 12.5px; color: var(--muted); line-height: 1.55; max-width: 920px; }
      .rp-none .empty { padding: 36px 16px 28px; }
      .rp-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .rp-who .cell-main { white-space: nowrap; }
      .rp-noone { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--fill); color: var(--muted); flex: none; }
      .rp-cell-sub { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; font-weight: 400; white-space: nowrap; }
      .rp-note { max-width: 340px; }
      .rp-tgt { min-width: 128px; }
      .rp-tgt .progress { margin-top: 6px; }
      .rp-hbars { display: flex; flex-direction: column; gap: 12px; }
      .rp-hb { display: grid; grid-template-columns: minmax(100px, 190px) minmax(0, 1fr) minmax(56px, auto); align-items: center; gap: 14px; font-size: 13.5px; }
      .rp-hb-l { color: var(--ink-2); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rp-hb-t { position: relative; height: 10px; border-radius: 5px; background: var(--fill-2); overflow: hidden; }
      .rp-hb-t i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; background: var(--tint); }
      .rp-hb-t i.rp-soft { background: var(--tint-soft-2); }
      .rp-hb-t i.rp-amber { background: var(--amber-solid); }
      .rp-hb-t i.rp-red { background: var(--red-solid); }
      .rp-hb-t i.rp-gray { background: var(--gray-solid); }
      .rp-hb-v { text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .rp-hb-v small { color: var(--muted); font-weight: 400; margin-left: 8px; font-size: 12.5px; }
      .rp-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
      .rp-legend span { display: inline-flex; align-items: center; gap: 7px; }
      .rp-legend i { width: 10px; height: 10px; border-radius: 50%; background: var(--tint); }
      .rp-legend i.rp-soft { background: var(--tint-soft-2); }
      .rp-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 36px; align-items: start; }
      .rp-split.rp-even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .rp-split .donut-wrap { gap: 26px; }
      .rp-quiet { color: var(--muted); font-size: 13.5px; }
      .rp-after { margin: 20px 4px 0; font-size: 13px; color: var(--muted); }
      .rp-tg .field { max-width: 260px; margin-bottom: 18px; }
      .rp-tg-cols { display: grid; grid-template-columns: minmax(0, 1fr) 84px 140px; gap: 12px; padding: 0 18px 6px 60px; font-size: 12.5px; color: var(--muted); text-align: right; }
      .glist .rp-tg-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 84px 140px; gap: 10px 12px; }
      .rp-tg-row input { width: 100%; height: 36px; border: 1px solid var(--line); border-radius: 9px; padding: 0 10px; background: var(--field-bg); color: var(--ink); font: inherit; text-align: right; font-variant-numeric: tabular-nums; outline: none; transition: border-color .15s, box-shadow .15s; }
      .rp-tg-row input:focus { border-color: var(--tint); box-shadow: var(--focus); }
      @media (max-width: 900px) { .rp-split, .rp-split.rp-even { grid-template-columns: 1fr; gap: 28px; } }
      @media (max-width: 640px) {
        .rp-head { padding: 22px 18px 0; }
        .rp-head h2 { font-size: 20px; }
        .rp-figs { grid-template-columns: 1fr 1fr; gap: 18px 20px; padding: 22px 18px 2px; }
        .rp-fig-v { font-size: 24px; }
        .rp-fig-v.rp-word { font-size: 17px; }
        .rp-block { padding: 26px 18px 0; }
        .rp-tblock > .rp-sub { padding: 0 18px; }
        .rp-tblock .table th:first-child, .rp-tblock .table td:first-child { padding-left: 18px; }
        .rp-tblock .table th:last-child, .rp-tblock .table td:last-child { padding-right: 18px; }
        .rp-foot { padding: 18px 18px 22px; }
        .rp-hb { grid-template-columns: minmax(76px, 110px) minmax(0, 1fr) auto; gap: 10px; }
        .rp-hb-v small { display: none; }
        .rp-tg-cols { grid-template-columns: minmax(0, 1fr) 64px 104px; padding-left: 18px; }
        .glist .rp-tg-row { grid-template-columns: minmax(0, 1fr) 64px 104px; }
        .glist .rp-tg-row .avatar { display: none; }
      }`;
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- Dates and periods */
  const pad2 = (n) => String(n).padStart(2, '0');
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  /** The local calendar day of a plain date or a saved timestamp (timestamps are UTC; Dhaka is UTC+6). */
  function dayOf(v) {
    const s = String(v || '');
    if (s.length > 10 && s.charAt(10) === 'T') { const d = new Date(s); if (!isNaN(d.getTime())) return NA.toISODate(d); }
    return s.slice(0, 10);
  }
  const ymKey = (y, m) => { while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return y + '-' + pad2(m + 1); };
  const nextMonth = (k) => ymKey(+k.slice(0, 4), +k.slice(5, 7));
  const prevMonth = (k) => ymKey(+k.slice(0, 4), +k.slice(5, 7) - 2);
  const monthEnd = (k) => k + '-' + pad2(new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate());
  const monthName = (k, year = true) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)
    .toLocaleDateString('en-GB', year ? { month: 'long', year: 'numeric' } : { month: 'long' });
  /** Bangladesh's financial year runs 1 July – 30 June. */
  const fyStart = (iso) => { const y = +iso.slice(0, 4); return +iso.slice(5, 7) >= 7 ? y : y - 1; };
  const inR = (d, r) => !!d && d >= r.from && d <= r.to;

  const PERIODS = [
    { key: 'month', label: 'This month' },
    { key: 'last', label: 'Last month' },
    { key: 'fy', label: 'Financial year', title: 'This financial year, July to June' },
    { key: 'custom', label: 'Custom' },
  ];
  function rangeLabel(from, to) {
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
    const left = a.toLocaleDateString('en-GB', a.getFullYear() === b.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    return left + ' – ' + b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  /**
   * A period: { key, from, to, label, month (yyyy-mm when it is exactly one month), prev }.
   * prev is the stretch to compare with: the same days of last month for "This month", the same
   * point last year for the financial year, the stretch just before for a custom range.
   */
  function rangeFor(key, from, to) {
    const t = NA.today();
    const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1;
    if (key === 'last') {
      const k = ymKey(y, m - 1), pk = ymKey(y, m - 2);
      return { key, from: k + '-01', to: monthEnd(k), label: monthName(k), month: k,
        prev: { from: pk + '-01', to: monthEnd(pk), label: monthName(pk, false) } };
    }
    if (key === 'fy') {
      const s = fyStart(t);
      let ly = (y - 1) + t.slice(4);
      if (ly.slice(5) === '02-29') ly = ly.slice(0, 5) + '02-28';
      return { key, from: s + '-07-01', to: (s + 1) + '-06-30', label: 'FY ' + s + '–' + String(s + 1).slice(2), sub: 'July ' + s + ' to June ' + (s + 1) + ' (FY ' + s + '–' + String(s + 1).slice(2) + ')', month: null,
        prev: { from: (s - 1) + '-07-01', to: ly, label: 'Same time last year' } };
    }
    if (key === 'custom' && isDay(from) && isDay(to)) {
      if (from > to) { const x = from; from = to; to = x; }
      const days = NA.daysBetween(from, to) + 1;
      const k = from.slice(0, 7);
      return { key, from, to, label: rangeLabel(from, to), month: from === k + '-01' && to === monthEnd(k) ? k : null,
        prev: { from: NA.addDays(from, -days), to: NA.addDays(from, -1), label: 'Previous ' + plural(days, 'day') } };
    }
    const k = ymKey(y, m), pk = ymKey(y, m - 1);
    const pEnd = Math.min(+t.slice(8, 10), +monthEnd(pk).slice(8, 10));
    return { key: 'month', from: k + '-01', to: monthEnd(k), label: monthName(k), month: k,
      prev: { from: pk + '-01', to: pk + '-' + pad2(pEnd), label: 'Same days of ' + monthName(pk, false) } };
  }
  /** Months (yyyy-mm) a period touches, up to the current month. */
  function monthsOf(r) {
    const out = [];
    const cur = NA.today().slice(0, 7);
    const end = r.to.slice(0, 7) < cur ? r.to.slice(0, 7) : cur;
    for (let k = r.from.slice(0, 7); k <= end && out.length < 240; k = nextMonth(k)) out.push(k);
    return out;
  }
  const nothingIn = (r, what) => (r.key === 'month' ? `No ${what} yet this month.` : `No ${what} in ${r.label}.`);
  /** Was the system in use in the earlier period? If not, a comparison ("September: 0") would only be noise. */
  function usedIn(p) {
    if (!p) return false;
    return list('leads').some((l) => inR(dayOf(l.createdAt), p)) || list('orders').some((o) => inR(bookedOn(o), p))
      || list('jobCards').some((j) => inR(dayOf(j.openedAt || j.createdAt), p));
  }
  /** The period to compare with, or null when there is nothing to compare. */
  const compareTo = (r) => (r && r.prev && usedIn(r.prev) ? r : null);

  /* ---------------------------------------------------------------- Shared rules */
  function context() {
    const ctx = { T: NA.today(), vat: num(NA.db.settings && NA.db.settings.vatRate), cost: NA.can('costs.view'), pol: NA.policy ? NA.policy() : { discountFree: 0 } };
    ctx.invByOrder = new Map();
    list('invoices').forEach((i) => { if (i.kind === 'vehicle' && i.refId) ctx.invByOrder.set(i.refId, i); });
    ctx.orderById = new Map(list('orders').map((o) => [o.id, o]));
    ctx.orderByLead = new Map();
    list('orders').forEach((o) => { if (o.leadId) ctx.orderByLead.set(o.leadId, o); });
    return ctx;
  }
  const bookedOn = (o) => dayOf((o.booking && o.booking.date) || o.createdAt);
  const deliveredOn = (o) => (o.stage === 'delivered' ? dayOf(o.deliveredAt || (o.delivery && o.delivery.date)) : '');
  const sellerOf = (o) => o.consultantId || o.ownerId || '';
  const listPriceOf = (o) => num(o.listPrice) || num(o.price);
  /** Everything the customer got off the list price: a lower price plus the discount. */
  const concession = (o) => Math.max(0, listPriceOf(o) - num(o.price) + num(o.discount));
  /** An order's value before VAT: the invoice once there is one, else the net price without VAT. */
  function exVat(ctx, o) {
    const inv = ctx.invByOrder.get(o.id);
    if (inv && inv.subtotal != null && inv.subtotal !== '') return num(inv.subtotal);
    return Math.round(B.orderNet(o) / (1 + ctx.vat));
  }
  /**
   * What a sold car cost us (only called with costs.view). The hand-over stores it on the invoice (costAtSale: B.deliverOrder
   * on one computer, the office server otherwise); older invoices fall back to the car's own cost, then the price list
   * (est = today's price-list cost, the car's own is unknown).
   */
  function carCost(ctx, o) {
    const inv = ctx.invByOrder.get(o.id);
    if (inv && num(inv.costAtSale)) return { cost: num(inv.costAtSale), est: false };
    const v = o.vehicleId ? NA.vehicle(o.vehicleId) : null;
    const own = v ? num(v.landedCost) || num(v.cost) || num(v.purchaseCost) : 0;
    if (own) return { cost: own, est: false };
    const m = NA.model(o.modelId);
    return { cost: m ? num(m.cost) : 0, est: true };
  }
  const leadOrder = (ctx, l) => (l.orderId && ctx.orderById.get(l.orderId)) || ctx.orderByLead.get(l.id) || null;
  function who(id) {
    if (!id) return 'No consultant yet';
    const n = NA.staffName(id);
    return n && n !== '—' ? n : 'Former staff member';
  }
  const custName = (id) => { const n = id ? NA.customerName(id) : ''; return n && n !== '—' ? n : 'Customer'; };
  const modelLabel = (id) => { const n = id ? NA.modelName(id) : ''; return n && n !== '—' ? n : 'Model not set'; };

  /* Targets: one record per consultant per month { staffId, month: 'yyyy-mm', units, value }. */
  const targetsOf = (staffId, month) => list('targets').filter((t) => t.staffId === staffId && t.month === month);
  /** The target Today shows too (the first saved for that person and month). */
  const targetOf = (staffId, month) => targetsOf(staffId, month)[0] || null;
  function targetSum(staffId, months) {
    const a = { units: 0, value: 0, set: false };
    months.forEach((k) => { const t = targetOf(staffId, k); if (t) { a.units += num(t.units); a.value += num(t.value); } });
    a.set = a.units > 0 || a.value > 0;
    return a;
  }

  /* ---------------------------------------------------------------- Building blocks */
  const barW = (x) => (x > 0 ? Math.max(1.5, Math.min(100, x * 100)) : 0).toFixed(1) + '%';
  /** Horizontal bars: rows [{label, value, part?, tone?, text?}]. `part` draws a darker share inside the bar. */
  function hbars(rows, opts = {}) {
    const max = Math.max(1, ...rows.map((x) => num(x.value)));
    return `<div class="rp-hbars">${rows.map((x) => `<div class="rp-hb">
        <span class="rp-hb-l" title="${esc(x.label)}">${esc(x.label)}</span>
        <span class="rp-hb-t">${x.part != null
          ? `<i class="rp-soft" style="width:${barW(num(x.value) / max)}"></i><i style="width:${barW(num(x.part) / max)}"></i>`
          : `<i class="${x.tone ? 'rp-' + x.tone : ''}" style="width:${barW(num(x.value) / max)}"></i>`}</span>
        <span class="rp-hb-v">${x.text != null ? x.text : esc((opts.fmt || N)(x.value))}</span>
      </div>`).join('')}</div>`
      + (opts.legend ? `<div class="rp-legend">${opts.legend.map(([cls, l]) => `<span><i class="${cls}"></i>${esc(l)}</span>`).join('')}</div>` : '');
  }
  /** A table with an optional totals row. cols: [{label, cls, html(row, isTotal)}]; opts.href(row) makes rows open a record. */
  function table(cols, rows, opts = {}) {
    const tr = (r, total) => {
      const href = !total && opts.href ? opts.href(r) : '';
      return `<tr${total ? ' class="rp-total"' : ''}${href ? ` data-href="${esc(href)}"` : ''}>${cols.map((c) => `<td class="${c.cls || ''}">${c.html(r, !!total)}</td>`).join('')}</tr>`;
    };
    return `<div class="table-wrap"><table class="table rp-table">
      <thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => tr(r, false)).join('')}${opts.total ? tr(opts.total, true) : ''}</tbody></table></div>`;
  }
  /** One headline figure. value and sub are html (already escaped). */
  const fig = (label, value, sub, tone, word) => `<div class="rp-fig"><span class="rp-fig-l">${esc(label)}</span>
    <b class="rp-fig-v${word ? ' rp-word' : ''}${tone ? ' tone-' + tone : ''}">${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const prevSub = (r, v, f) => (r && r.prev ? `${esc(r.prev.label)}: ${esc((f || N)(v))}` : '');
  const card = (o) => `<section class="card rp-card">
      <header class="rp-head"><h2>${esc(o.title)}</h2>${o.meta ? `<p>${o.meta}</p>` : ''}</header>
      ${o.figs ? `<div class="rp-figs">${o.figs}</div>` : ''}
      ${o.body || ''}
      ${o.foot ? `<p class="rp-foot">${o.foot}</p>` : ''}
    </section>`;
  const block = (title, html) => `<div class="rp-block">${title ? `<div class="rp-sub">${esc(title)}</div>` : ''}${html}</div>`;
  const tableBlock = (title, html) => `<div class="rp-tblock">${title ? `<div class="rp-sub">${esc(title)}</div>` : ''}${html}</div>`;
  function emptyBlock(msg, icon, r) {
    const act = r && r.key === 'month' ? NA.ui.btn('Show last month', { kind: 'ghost', act: 'period-last' }) : '';
    return `<div class="rp-block rp-none">${NA.ui.empty(msg, icon || 'chart', act)}</div>`;
  }
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = (base, r) => 'noor-autos-' + base + '-' + (!r ? NA.today() : r.key === 'custom' ? r.from + '-to-' + r.to : slug(r.label)) + '.csv';
  const round1 = (x) => Math.round(x * 10) / 10;
  function countBy(items, key) {
    const m = new Map();
    items.forEach((x) => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }

  /* ================================================================ 1. How is each consultant doing? */
  const TEAM_KEYS = ['leads', 'drives', 'booked', 'delivered', 'revenue', 'conc', 'list', 'over'];
  /** A test drive counts once the form is signed and the licence checked (the Leads and Today rule). */
  const driveDone = (t) => !!(t && t.date) && (!!(t.formSigned && t.licenceVerified) || t.done === true || t.status === 'done');
  const blankTeam = (id) => ({ id, leads: 0, drives: 0, booked: 0, delivered: 0, revenue: 0, conc: 0, list: 0, over: 0 });
  /** One line per consultant for a period. A consultant only ever gets their own line. */
  function teamRows(ctx, r) {
    const data = new Map();
    const row = (id) => { if (!data.has(id)) data.set(id, blankTeam(id)); return data.get(id); };
    const free = num(ctx.pol.discountFree);
    // Leads and test drives belong to the consultant on the lead ('' = nobody yet).
    list('leads').forEach((l) => {
      const id = l.consultantId || '';
      if (inR(dayOf(l.createdAt), r)) row(id).leads++;
      if (driveDone(l.testDrive) && inR(dayOf(l.testDrive.date), r)) row(id).drives++;
    });
    // Bookings, hand-overs and revenue belong to the consultant on the order. Cancelled orders don't count.
    list('orders').forEach((o) => {
      if (o.stage === 'cancelled') return;
      const id = sellerOf(o);
      if (inR(bookedOn(o), r)) {
        const x = row(id); const c = concession(o);
        x.booked++; x.conc += c; x.list += listPriceOf(o);
        if (c > free) x.over++;
      }
      if (inR(deliveredOn(o), r)) { const x = row(id); x.delivered++; x.revenue += exVat(ctx, o); }
    });
    const months = monthsOf(r);
    const staff = new Map(NA.consultants().map((s) => [s.id, s]));
    const ids = new Set();
    staff.forEach((s, id) => { if (s.role === 'Sales Consultant' || targetSum(id, months).set) ids.add(id); });
    data.forEach((x, id) => { if (x.leads || x.drives || x.booked || x.delivered) ids.add(id); });
    const mgr = NA.isManager();
    const me = NA.myStaffId();
    return [...ids].filter((id) => mgr || (!!id && id === me)).map((id) => {
      const s = staff.get(id) || (id ? NA.get('staff', id) : null);
      return Object.assign(blankTeam(id), data.get(id) || {}, { name: who(id), role: s ? s.role || '' : '', target: id ? targetSum(id, months) : { units: 0, value: 0, set: false } });
    }).sort((a, b) => (!a.id) - (!b.id) || b.delivered - a.delivered || b.booked - a.booked || b.revenue - a.revenue || b.leads - a.leads || a.name.localeCompare(b.name));
  }
  function teamTotal(rows) {
    const t = Object.assign(blankTeam(''), { name: 'Team', target: { units: 0, value: 0, set: false } });
    rows.forEach((x) => { TEAM_KEYS.forEach((k) => { t[k] += x[k]; }); t.target.units += x.target.units; t.target.value += x.target.value; });
    t.target.set = t.target.units > 0 || t.target.value > 0;
    return t;
  }
  function targetCell(x) {
    const t = x.target;
    if (!t || !t.set) return '<span class="muted">No target</span>';
    let out = '';
    if (t.units) out += `<div class="rp-tgt"><span class="num">${N(x.delivered)} of ${plural(t.units, 'car')}</span>${NA.ui.progress(x.delivered / t.units, x.delivered >= t.units ? 'green' : 'brand')}</div>`;
    if (t.value) out += `<span class="rp-cell-sub">${esc(S(x.revenue))} of ${esc(S(t.value))}</span>`;
    return out;
  }
  function teamView(ctx, r) {
    const rows = teamRows(ctx, r);
    const tot = teamTotal(rows);
    const cmp = compareTo(r);
    const prev = teamTotal(cmp ? teamRows(ctx, r.prev) : []);
    const people = rows.filter((x) => x.id).length;
    const title = 'How is each consultant doing?';
    const meta = esc(r.label) + ' · ' + plural(people, 'person', 'people');
    const tUnits = tot.target.units;
    const figs = fig('Leads in', N(tot.leads), prevSub(cmp, prev.leads))
      + fig('Bookings', N(tot.booked), prevSub(cmp, prev.booked))
      + fig('Cars handed over', N(tot.delivered) + (tUnits ? `<small>of ${N(tUnits)}</small>` : ''),
        [tUnits ? pct(tot.delivered / tUnits) + ' of the target' : '', prevSub(cmp, prev.delivered)].filter(Boolean).join(' · '))
      + fig('Revenue before VAT', esc(S(tot.revenue)), prevSub(cmp, prev.revenue, S));
    const busy = tot.leads + tot.drives + tot.booked + tot.delivered > 0;
    const funnel = [['Leads in', tot.leads], ['Test drives', tot.drives], ['Bookings', tot.booked], ['Handed over', tot.delivered]]
      // Each step counts what happened in the period, so older leads can push it past the new leads: no share then.
      .map(([label, value], i) => ({ label, value, text: N(value) + (i && value && value <= tot.leads ? `<small>${pct(value / tot.leads)} of leads</small>` : '') }));
    const cols = [
      { label: 'Consultant', html: (x, total) => (total ? 'Team'
        : `<div class="rp-who">${x.id ? NA.ui.avatar(x.name, 30) : `<span class="rp-noone">${NA.icon('user', 16)}</span>`}<div><div class="cell-main">${esc(x.name)}</div>${x.role ? `<div class="cell-sub">${esc(x.role)}</div>` : ''}</div></div>`) },
      { label: 'Leads', cls: 'right num', html: (x) => N(x.leads) },
      { label: 'Test drives', cls: 'right num', html: (x) => N(x.drives) },
      { label: 'Bookings', cls: 'right num', html: (x) => N(x.booked) + (x.booked && x.booked <= x.leads ? `<span class="rp-cell-sub">${pct(x.booked / x.leads)} of leads</span>` : '') },
      { label: 'Handed over', cls: 'right num', html: (x) => N(x.delivered) },
      { label: 'Revenue', cls: 'right num', html: (x) => (x.revenue ? M(x.revenue) : '—') },
      { label: 'Average discount', cls: 'right num', html: (x) => (!x.booked ? '—' : !x.conc ? 'None'
        : M(x.conc / x.booked) + `<span class="rp-cell-sub">${[x.list ? round1((x.conc / x.list) * 100) + '% of list price' : '', x.over ? x.over + ' over the limit' : ''].filter(Boolean).join(' · ')}</span>`) },
      { label: 'Target', html: (x) => targetCell(x) },
    ];
    const body = (busy ? block('From lead to hand-over', hbars(funnel)) : emptyBlock(nothingIn(r, 'leads, bookings or hand-overs'), 'users', r))
      + (rows.length ? tableBlock('By consultant', table(cols, rows, { total: rows.length > 1 ? tot : null }))
        : emptyBlock('No sales consultants yet. Add them in People.', 'users'));
    const foot = [
      'Leads and test drives count for the consultant on the lead (a test drive once the form is signed and the licence checked); bookings, hand-overs and revenue for the consultant on the order. Cancelled orders are left out.',
      'Revenue is the invoice value before VAT, counted when the car is handed over. Discount is everything off the list price (a lower price plus the discount); “over the limit” means more than ' + esc(M(ctx.pol.discountFree)) + ', which needs a manager’s approval.',
      monthsOf(r).length > 1 ? 'Targets add up the months of this period so far.' : '',
      NA.can('targets.set') ? '' : 'The Sales Manager sets the monthly targets.',
    ].filter(Boolean).join(' ');
    const csv = [['Consultant', 'Leads in', 'Test drives', 'Bookings', 'Bookings as % of leads', 'Cars handed over', 'Revenue before VAT', 'Average discount', 'Total discount', 'Bookings over the discount limit', 'Target cars', 'Target sales value']]
      .concat(rows.concat(rows.length > 1 ? [tot] : []).map((x) => [x.name, x.leads, x.drives, x.booked, x.leads && x.booked <= x.leads ? round1((x.booked / x.leads) * 100) : '',
        x.delivered, Math.round(x.revenue), x.booked ? Math.round(x.conc / x.booked) : 0, Math.round(x.conc), x.over, x.target.units || '', x.target.value || '']));
    return { html: card({ title, meta, figs, body, foot }), csv: { name: fileName('consultants', r), rows: csv } };
  }

  /* ================================================================ 2. Where do our customers come from? */
  /** The leads that came in during the period, by source, and what has happened to them since. */
  function sourceRows(ctx, r) {
    const rows = new Map();
    list('leads').forEach((l) => {
      if (!inR(dayOf(l.createdAt), r)) return;
      const k = String(l.source || '').trim() || 'Not recorded';
      if (!rows.has(k)) rows.set(k, { source: k, leads: 0, won: 0, lost: 0, open: 0, value: 0 });
      const x = rows.get(k);
      x.leads++;
      const o = l.stage === 'won' ? leadOrder(ctx, l) : null;
      if (l.stage === 'won' && !(o && o.stage === 'cancelled')) { x.won++; if (o) x.value += exVat(ctx, o); }
      else if (l.stage === 'lost' || l.stage === 'won') x.lost++;
      else x.open++;
    });
    return [...rows.values()].sort((a, b) => b.leads - a.leads || b.won - a.won || a.source.localeCompare(b.source));
  }
  const totalsOf = (rows, keys, base) => { const t = Object.assign({}, base); keys.forEach((k) => { t[k] = sum(rows, (x) => x[k]); }); return t; };
  function sourcesView(ctx, r) {
    const rows = sourceRows(ctx, r);
    const keys = ['leads', 'won', 'lost', 'open', 'value'];
    const tot = totalsOf(rows, keys, { source: 'All sources' });
    const cmp = compareTo(r);
    const prev = totalsOf(cmp ? sourceRows(ctx, r.prev) : [], keys);
    const title = 'Where do our customers come from?';
    if (!rows.length) {
      return { html: card({ title, meta: esc(r.label), figs: fig('Leads in', '0', prevSub(cmp, prev.leads)), body: emptyBlock(nothingIn(r, 'new leads'), 'user-plus', r) }), csv: null };
    }
    const best = rows.slice().sort((a, b) => b.won - a.won || b.leads - a.leads)[0];
    const figs = fig('Leads in', N(tot.leads), prevSub(cmp, prev.leads))
      + fig('Bought', N(tot.won), prevSub(cmp, prev.won))
      + fig('Conversion', pct(tot.won / tot.leads), 'of these leads bought a car')
      + fig(best.won ? 'Most buyers from' : 'Most leads from', esc(best.source),
        best.won ? `${plural(best.won, 'buyer')} · ${pct(best.won / best.leads)} of its leads` : plural(best.leads, 'lead'), null, true);
    const chart = block('Leads and buyers by source', hbars(rows.map((x) => ({ label: x.source, value: x.leads, part: x.won, text: `${N(x.leads)}<small>${N(x.won)} bought</small>` })),
      { legend: [['rp-soft', 'Leads'], ['', 'Bought']] }));
    const cols = [
      { label: 'Source', html: (x) => `<span class="cell-main">${esc(x.source)}</span>` },
      { label: 'Leads', cls: 'right num', html: (x) => N(x.leads) },
      { label: 'Bought', cls: 'right num', html: (x) => N(x.won) },
      { label: 'Conversion', cls: 'right num', html: (x) => (x.leads ? pct(x.won / x.leads) : '—') },
      { label: 'Lost', cls: 'right num', html: (x) => N(x.lost) },
      { label: 'Still open', cls: 'right num', html: (x) => N(x.open) },
      { label: 'Value of orders', cls: 'right num', html: (x) => (x.value ? M(x.value) : '—') },
    ];
    const foot = `Counts the leads that came in during ${esc(r.label)} and what has happened to them since: bought (their order is not cancelled), lost, or still being worked. Value of orders is before VAT. Orders booked without a lead are not counted.`;
    const csv = [['Source', 'Leads in', 'Bought', 'Conversion %', 'Lost', 'Still open', 'Value of orders before VAT']]
      .concat(rows.concat(rows.length > 1 ? [tot] : []).map((x) => [x.source, x.leads, x.won, x.leads ? round1((x.won / x.leads) * 100) : '', x.lost, x.open, Math.round(x.value)]));
    return {
      html: card({ title, meta: esc(r.label) + ' · ' + plural(rows.length, 'source'), figs, body: chart + tableBlock('By source', table(cols, rows, { total: rows.length > 1 ? tot : null })), foot }),
      csv: { name: fileName('lead-sources', r), rows: csv },
    };
  }

  /* ================================================================ 3. Why do we lose? */
  const REASONS = ['Budget / price too high', 'Chose a competitor brand', 'Bought a petrol / hybrid car', 'No response', 'Postponed purchase', 'Financing not approved', 'Order cancelled', 'Other'];
  // The lead steps in the words Leads and Today use (NA.FLOW.leadStages), plus a lead lost after it was booked.
  const LOST_AT = {};
  NA.FLOW.leadStages.forEach((s) => { LOST_AT[s.key] = s.key === 'new' ? 'New lead' : s.label; });
  LOST_AT.booking = 'After booking';
  const STEP_ORDER = Object.keys(LOST_AT);
  const HOT = ['testdrive', 'opportunity', 'booking'];
  /** The reason as one of the standard answers (older leads have free text such as "Budget — chose a cheaper car"). */
  function reasonOf(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'No reason given';
    const head = s.split(' — ')[0].trim();
    const known = REASONS.find((k) => k.toLowerCase() === head.toLowerCase());
    if (known) return known;
    if (/budget|price|expensive|afford|cheaper/i.test(head)) return 'Budget / price too high';
    if (/competitor|another brand|other brand/i.test(head)) return 'Chose a competitor brand';
    if (/petrol|hybrid|diesel|\bice\b/i.test(head)) return 'Bought a petrol / hybrid car';
    if (/no response|no answer|not reachable|unreachable/i.test(head)) return 'No response';
    if (/postpone|later|next year|not now/i.test(head)) return 'Postponed purchase';
    if (/financ|loan/i.test(head)) return 'Financing not approved';
    if (/cancel/i.test(head)) return 'Order cancelled';
    return head.length <= 40 ? head : 'Other';
  }
  function splitBrand(s) {
    s = String(s || '').trim();
    if (!s) return null;
    const i = s.indexOf(' ');
    return i < 0 ? { brand: s, model: '' } : { brand: s.slice(0, i), model: s.slice(i + 1).trim() };
  }
  /** The brands the "Mark as lost" form suggests (leads.js). The brand is typed, so "toyota" must still count as Toyota. */
  const BRANDS = ['Toyota', 'Honda', 'Nissan', 'Mitsubishi', 'Hyundai', 'Kia', 'MG', 'Suzuki', 'Tata', 'Tesla', 'Haval', 'Chery', 'Mercedes-Benz', 'BMW'];
  const tidy = (s) => String(s || '').trim().replace(/\s+/g, ' ');
  /** Leads lost in the period, plus orders cancelled after booking (older ones left the lead as 'won'). */
  function lostRows(ctx, r) {
    const out = [];
    // One spelling per brand, whatever the case: the list's spelling, else one with capitals over one without.
    const spelling = new Map();
    const noteBrand = (s) => {
      s = tidy(s);
      const k = s.toLowerCase(), was = spelling.get(k);
      if (s && (!was || (was === k && s !== k))) spelling.set(k, BRANDS.find((b) => b.toLowerCase() === k) || s);
      return s;
    };
    list('leads').forEach((l) => {
      let date = '', raw = '', note = '', from = l.lostFrom || '';
      if (l.stage === 'lost') {
        date = dayOf(l.lostAt || l.stageAt || l.updatedAt);
        raw = String(l.lostReason || '').trim();
        const i = raw.indexOf(' — ');
        note = l.lostNote || (i >= 0 ? raw.slice(i + 3).trim() : '');
        if (/^order cancelled/i.test(raw)) from = 'booking';
      } else if (l.stage === 'won') {
        const o = leadOrder(ctx, l);
        if (!o || o.stage !== 'cancelled') return;
        date = dayOf((o.cancel && o.cancel.date) || o.cancelledAt || o.updatedAt);
        raw = 'Order cancelled'; note = (o.cancel && o.cancel.reason) || ''; from = 'booking';
      } else return;
      if (!inR(date, r)) return;
      const comp = l.lostCompetitor && l.lostCompetitor.brand
        ? { brand: String(l.lostCompetitor.brand).trim(), model: String(l.lostCompetitor.model || '').trim() } : splitBrand(l.lostTo);
      out.push({ l, date, reason: reasonOf(raw), note, from, brand: comp ? noteBrand(comp.brand) : '', model: comp ? tidy(comp.model) : '' });
    });
    out.forEach((x) => { if (x.brand) x.brand = spelling.get(x.brand.toLowerCase()) || x.brand; });
    return out.sort((a, b) => b.date.localeCompare(a.date) || String(a.l.name || '').localeCompare(String(b.l.name || '')));
  }
  function lostView(ctx, r) {
    const rows = lostRows(ctx, r);
    const cmp = compareTo(r);
    const prevN = cmp ? lostRows(ctx, r.prev).length : 0;
    const title = 'Why do we lose?';
    if (!rows.length) {
      return { html: card({ title, meta: esc(r.label), figs: fig('Leads lost', '0', prevSub(cmp, prevN)),
        body: emptyBlock(r.key === 'month' ? 'No leads lost yet this month.' : `No leads were lost in ${r.label}.`, 'check-circle', r) }), csv: null };
    }
    let reasons = countBy(rows, (x) => x.reason);
    if (reasons.length > 8) reasons = reasons.slice(0, 7).concat([{ label: 'Other reasons', n: sum(reasons.slice(7), (x) => x.n) }]);
    const brands = countBy(rows, (x) => x.brand);
    const steps = countBy(rows, (x) => LOST_AT[x.from] || 'Not recorded')
      .sort((a, b) => { const ia = STEP_ORDER.findIndex((k) => LOST_AT[k] === a.label), ib = STEP_ORDER.findIndex((k) => LOST_AT[k] === b.label); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    const hot = rows.filter((x) => HOT.includes(x.from)).length;
    const toBrands = rows.filter((x) => x.brand).length;
    const top = reasons[0];
    const share = (n) => `<small>${pct(n / rows.length)}</small>`;
    const figs = fig('Leads lost', N(rows.length), prevSub(cmp, prevN))
      + fig('Most common reason', esc(top.label), `${plural(top.n, 'lead')} · ${pct(top.n / rows.length)}`, null, true)
      + fig('Went to another brand', N(toBrands), brands.length ? `Mostly ${esc(brands[0].label)} (${N(brands[0].n)})` : 'None recorded')
      + fig('Lost close to buying', N(hot), hot ? 'After a test drive, a quote or a booking' : 'None');
    const body = block('Reasons', hbars(reasons.map((x) => ({ label: x.label, value: x.n, text: N(x.n) + share(x.n) }))))
      + block('', `<div class="rp-split rp-even">
          <div><div class="rp-sub">Brands they bought instead</div>${brands.length ? hbars(brands.slice(0, 8).map((x) => ({ label: x.label, value: x.n, tone: 'gray' }))) : '<p class="rp-quiet">No other brand recorded.</p>'}</div>
          <div><div class="rp-sub">Where in the process</div>${hbars(steps.map((x) => ({ label: x.label, value: x.n, tone: 'gray' })))}</div>
        </div>`)
      + tableBlock('Each lost lead', table([
        { label: 'Lost on', cls: 'nowrap', html: (x) => esc(NA.fmt.dateShort(x.date)) },
        { label: 'Lead', html: (x) => `<div class="cell-main">${esc(x.l.name || '—')}</div><div class="cell-sub">${esc(modelLabel(x.l.modelId))}</div>` },
        { label: 'Consultant', html: (x) => esc(who(x.l.consultantId)) },
        { label: 'Lost at', html: (x) => esc(LOST_AT[x.from] || '—') },
        { label: 'Reason', html: (x) => `${esc(x.reason)}${x.note ? `<div class="cell-sub rp-note">${esc(x.note)}</div>` : ''}` },
        { label: 'Bought instead', html: (x) => (x.brand ? esc([x.brand, x.model].filter(Boolean).join(' ')) : '—') },
      ], rows, { href: (x) => (NA.canSee('leads') ? '#/leads/' + x.l.id : '') }));
    const foot = `Leads marked as lost in ${esc(r.label)}, and orders cancelled after booking. The reason comes from the “Mark as lost” form; anything written after it shows as a note.`;
    const csv = [['Lost on', 'Lead', 'Lead number', 'Model', 'Consultant', 'Lost at', 'Reason', 'Note', 'Bought instead (brand)', 'Bought instead (model)']]
      .concat(rows.map((x) => [x.date, x.l.name || '', x.l.code || '', modelLabel(x.l.modelId), who(x.l.consultantId), LOST_AT[x.from] || '', x.reason, x.note, x.brand, x.model]));
    return { html: card({ title, meta: esc(r.label) + ' · ' + plural(rows.length, 'lead'), figs, body, foot }), csv: { name: fileName('lost-leads', r), rows: csv } };
  }

  /* ================================================================ 4. What sells? */
  function sellsData(ctx, r) {
    const models = new Map(), colours = new Map();
    const get = (map, k, base) => { if (!map.has(k)) map.set(k, Object.assign({ booked: 0, delivered: 0, revenue: 0, cost: 0, est: 0 }, base)); return map.get(k); };
    list('orders').forEach((o) => {
      if (o.stage === 'cancelled') return;
      const booked = inR(bookedOn(o), r), handed = inR(deliveredOn(o), r);
      if (!booked && !handed) return;
      const mk = o.modelId || '';
      const m = get(models, mk, { modelId: mk, name: modelLabel(mk) });
      const c = get(colours, mk + '|' + (o.color || ''), { modelId: mk, name: m.name, color: o.color || '' });
      if (booked) { m.booked++; c.booked++; }
      if (handed) {
        const rev = exVat(ctx, o);
        m.delivered++; c.delivered++; m.revenue += rev; c.revenue += rev;
        if (ctx.cost) { const cc = carCost(ctx, o); m.cost += cc.cost; c.cost += cc.cost; if (cc.est) { m.est++; c.est++; } }
      }
    });
    const order = (a, b) => b.booked - a.booked || b.delivered - a.delivered || b.revenue - a.revenue || a.name.localeCompare(b.name) || String(a.color || '').localeCompare(String(b.color || ''));
    return { models: [...models.values()].sort(order), colours: [...colours.values()].sort(order) };
  }
  function sellsView(ctx, r) {
    const d = sellsData(ctx, r);
    const cmp = compareTo(r);
    const keys = ['booked', 'delivered', 'revenue', 'cost', 'est'];
    const tot = totalsOf(d.models, keys, { name: 'All models', color: '' });
    const prev = totalsOf(cmp ? sellsData(ctx, r.prev).models : [], keys);
    const title = 'What sells?';
    if (!d.models.length) {
      return { html: card({ title, meta: esc(r.label), figs: fig('Cars booked', '0', prevSub(cmp, prev.booked)) + fig('Cars handed over', '0', prevSub(cmp, prev.delivered)),
        body: emptyBlock(nothingIn(r, 'cars booked or handed over'), 'car', r) }), csv: null };
    }
    const best = d.models.slice().sort((a, b) => b.booked - a.booked || b.delivered - a.delivered)[0];
    const margin = (x) => x.revenue - x.cost;
    const marginHtml = (x) => (x.revenue ? `<span class="${margin(x) < 0 ? 'tone-red' : ''}">${M(margin(x))}</span><span class="rp-cell-sub">${pct(margin(x) / x.revenue)}</span>` : '—');
    let figs = fig('Cars booked', N(tot.booked), prevSub(cmp, prev.booked))
      + fig('Cars handed over', N(tot.delivered), prevSub(cmp, prev.delivered))
      + fig('Revenue before VAT', esc(S(tot.revenue)), prevSub(cmp, prev.revenue, S))
      + fig(best.booked ? 'Most booked' : 'Most handed over', esc(best.name), best.booked ? plural(best.booked, 'booking') : plural(best.delivered, 'car'), null, true);
    if (ctx.cost && tot.revenue) figs += fig('Margin on cars handed over', `<span class="${margin(tot) < 0 ? 'tone-red' : ''}">${esc(S(margin(tot)))}</span>`, pct(margin(tot) / tot.revenue) + ' of revenue' + (tot.est ? ' · partly estimated' : ''));
    const byBooked = tot.booked > 0;
    const chart = block(byBooked ? 'Cars booked by model' : 'Cars handed over by model', hbars(d.models.filter((x) => (byBooked ? x.booked : x.delivered))
      .map((x) => ({ label: x.name, value: byBooked ? x.booked : x.delivered, text: N(byBooked ? x.booked : x.delivered) + (byBooked && x.delivered ? `<small>${N(x.delivered)} handed over</small>` : '') }))));
    const stockLink = (x, color) => (NA.canSee('inventory') && x.modelId ? '#/inventory?tab=available&model=' + encodeURIComponent(x.modelId) + (color ? '&color=' + encodeURIComponent(color) : '') : '');
    const costCols = ctx.cost ? [
      { label: 'Car cost', cls: 'right num', html: (x) => (x.cost ? (x.est ? '≈ ' : '') + M(x.cost) : '—') },
      { label: 'Margin', cls: 'right num', html: marginHtml },
    ] : [];
    const modelCols = [
      { label: 'Model', html: (x) => `<span class="cell-main">${esc(x.name)}</span>` },
      { label: 'Booked', cls: 'right num', html: (x) => N(x.booked) },
      { label: 'Handed over', cls: 'right num', html: (x) => N(x.delivered) },
      { label: 'Revenue', cls: 'right num', html: (x) => (x.revenue ? M(x.revenue) : '—') },
      { label: 'Share of revenue', cls: 'right num', html: (x) => (tot.revenue ? pct(x.revenue / tot.revenue) : '—') },
    ].concat(costCols);
    const colourCols = [
      { label: 'Model', html: (x, total) => (total ? 'All' : `<span class="cell-main">${esc(x.name)}</span>`) },
      { label: 'Colour', html: (x, total) => (total ? '' : esc(x.color || 'Not chosen')) },
      { label: 'Booked', cls: 'right num', html: (x) => N(x.booked) },
      { label: 'Handed over', cls: 'right num', html: (x) => N(x.delivered) },
      { label: 'Revenue', cls: 'right num', html: (x) => (x.revenue ? M(x.revenue) : '—') },
    ];
    const body = chart
      + tableBlock('By model', table(modelCols, d.models, { total: d.models.length > 1 ? tot : null, href: (x) => stockLink(x) }))
      + tableBlock('By model and colour', table(colourCols, d.colours, { total: d.colours.length > 1 ? tot : null, href: (x) => stockLink(x, x.color) }));
    const foot = `Booked counts orders taken in ${esc(r.label)}; handed over and revenue count cars handed over in ${esc(r.label)} (revenue before VAT). Cancelled orders are left out. Tap a model to see the cars available.`
      + (ctx.cost ? ' Margin is revenue before VAT minus what the car cost us' + (tot.est ? '; ≈ marks a cost taken from today’s price list because the car’s own cost was not recorded.' : '.') : '');
    const csv = [['Model', 'Colour', 'Booked', 'Handed over', 'Revenue before VAT'].concat(ctx.cost ? ['Car cost', 'Margin', 'Cost estimated'] : [])]
      .concat(d.colours.map((x) => [x.name, x.color, x.booked, x.delivered, Math.round(x.revenue)].concat(ctx.cost ? [Math.round(x.cost), Math.round(margin(x)), x.est ? 'yes' : ''] : [])));
    return { html: card({ title, meta: esc(r.label) + ' · ' + plural(d.models.length, 'model'), figs, body, foot }), csv: { name: fileName('models', r), rows: csv } };
  }

  /* ================================================================ 5. How old is our stock? */
  // The Vehicles screen's cut-offs (NA.stock.ageBadge): amber from 60 days, red from 90, "Over 6 months" from 180.
  const OLD_DAYS = 90;
  const STOCK_AGES = [
    { label: 'Under 30', below: 30, tone: 'brand' }, { label: '30–59', below: 60, tone: 'brand' }, { label: '60–89', below: 90, tone: 'amber' },
    { label: '90–179', below: 180, tone: 'red' }, { label: '180+', below: Infinity, tone: 'red' },
  ];
  const stockTone = (d) => (d >= OLD_DAYS ? 'tone-red' : d >= 60 ? 'tone-amber' : '');
  const AGEING = ['pdi', 'available', 'hold', 'demo'];
  const stockApi = (fn) => (NA.stock && typeof NA.stock[fn] === 'function' ? NA.stock[fn] : null);
  /** The Vehicles screen's status (older damaged cars waited in 'pdi' with a flag; that is 'hold' now). */
  function statusOf(v) {
    const f = stockApi('statusOf');
    if (f) { try { return f(v); } catch (e) { /* fall back */ } }
    return v.status === 'pdi' && v.pdi && v.pdi.flagged ? 'hold' : v.status || 'available';
  }
  function ageOf(v) {
    const f = stockApi('ageDays');
    if (f) { try { const d = f(v); if (d != null) return num(d); } catch (e) { /* fall back */ } }
    const from = dayOf(v.arrivedAt || v.createdAt);
    return isDay(from) ? Math.max(0, NA.daysBetween(from, NA.today())) : 0;
  }
  function statusBadge(v, k) {
    const f = stockApi('statusBadge');
    if (f) { try { return f(v); } catch (e) { /* fall back */ } }
    return NA.ui.vehicleStatusBadge(k);
  }
  function statusText(k) {
    const f = stockApi('statusLabel');
    if (f) { try { return f(k); } catch (e) { /* fall back */ } }
    return NA.stageLabel(NA.FLOW.vehicleStatuses, k);
  }
  function stockCost(v) {
    const own = num(v.landedCost) || num(v.cost) || num(v.purchaseCost);
    if (own) return { cost: own, est: false };
    const m = NA.model(v.modelId);
    return { cost: m ? num(m.cost) : 0, est: true };
  }
  const whereIs = (v) => (v.move && v.move.status === 'moving' ? (v.move.from || '—') + ' → ' + (v.move.to || '—') : v.location || '—');
  function stockView(ctx) {
    const all = list('vehicles');
    const title = 'How old is our stock?';
    const cars = all.filter((v) => AGEING.includes(statusOf(v))).map((v) => {
      const c = ctx.cost ? stockCost(v) : { cost: 0, est: false };
      return { v, status: statusOf(v), days: ageOf(v), cost: c.cost, est: c.est };
    }).sort((a, b) => b.days - a.days || String(a.v.vin || '').localeCompare(String(b.v.vin || '')));
    const sold = all.filter((v) => statusOf(v) === 'allocated').length;
    const coming = all.filter((v) => statusOf(v) === 'in_transit').length;
    const notCounted = [sold ? plural(sold, 'car') + ' sold and waiting to be handed over' : '', coming ? plural(coming, 'car') + ' on the way' : ''].filter(Boolean).join(' and ');
    const foot = 'Counts cars that have arrived and are not sold: available, waiting for the arrival check, on hold, and demo cars. Days count from the day the car arrived; as on the Vehicles screen, amber from 60 days and red from 90.'
      + (notCounted ? ' Not counted: ' + esc(notCounted) + '.' : '')
      + (ctx.cost ? ' Value is what each car cost us' + (cars.some((x) => x.est) ? '; ≈ marks a cost taken from today’s price list.' : '.') : '');
    const meta = 'As of ' + esc(NA.fmt.date(ctx.T));
    if (!cars.length) return { html: card({ title, meta, body: emptyBlock('No cars in stock right now.', 'car'), foot }), csv: null };
    const ages = STOCK_AGES.map((b) => ({ label: b.label, tone: b.tone, n: 0, cost: 0 }));
    cars.forEach((x) => { const i = STOCK_AGES.findIndex((b) => x.days < b.below); ages[i].n++; ages[i].cost += x.cost; });
    const count = (k) => cars.filter((x) => x.status === k).length;
    const old = cars.filter((x) => x.days >= OLD_DAYS);
    const value = sum(cars, (x) => x.cost);
    const avg = sum(cars, (x) => x.days) / cars.length;
    const parts = [[count('available'), 'available'], [count('pdi'), 'to inspect'], [count('hold'), 'on hold'], [count('demo'), 'demo']].filter(([n]) => n).map(([n, w]) => N(n) + ' ' + w);
    let figs = fig('Cars in stock', N(cars.length), esc(parts.join(' · ')))
      + fig('Average days in stock', N(Math.round(avg)), 'Oldest: ' + plural(cars[0].days, 'day'))
      + fig('90 days or more', N(old.length), old.length ? (ctx.cost ? esc(S(sum(old, (x) => x.cost))) + ' at cost · move these first' : 'Move these first') : 'None', old.length ? 'red' : null);
    if (ctx.cost) figs += fig('Value at cost', esc(S(value)), cars.some((x) => x.est) ? 'Partly from the price list' : 'What these cars cost us');
    // By model: which models are getting old.
    const byModel = new Map();
    cars.forEach((x) => {
      const k = x.v.modelId || '';
      if (!byModel.has(k)) byModel.set(k, { modelId: k, name: modelLabel(k), n: 0, days: 0, old: 0, oldest: 0, cost: 0, est: false });
      const m = byModel.get(k);
      m.n++; m.days += x.days; m.cost += x.cost; m.est = m.est || x.est; m.oldest = Math.max(m.oldest, x.days); if (x.days >= OLD_DAYS) m.old++;
    });
    const models = [...byModel.values()].sort((a, b) => b.oldest - a.oldest || b.n - a.n);
    const modelCols = [
      { label: 'Model', html: (x) => `<span class="cell-main">${esc(x.name)}</span>` },
      { label: 'Cars', cls: 'right num', html: (x) => N(x.n) },
      { label: 'Average days', cls: 'right num', html: (x) => N(Math.round(x.days / x.n)) },
      { label: 'Oldest', cls: 'right num', html: (x) => `<span class="${stockTone(x.oldest)}">${plural(x.oldest, 'day')}</span>` },
      { label: '90 days or more', cls: 'right num', html: (x) => (x.old ? `<span class="tone-red">${N(x.old)}</span>` : '0') },
    ].concat(ctx.cost ? [{ label: 'Value at cost', cls: 'right num', html: (x) => (x.est ? '≈ ' : '') + M(x.cost) }] : []);
    const carCols = [
      { label: 'Car', html: (x) => `<div class="cell-main">${esc(modelLabel(x.v.modelId))}</div><div class="cell-sub mono">${esc(x.v.vin || '—')}</div>` },
      { label: 'Colour', html: (x) => esc(x.v.color || '—') },
      { label: 'Status', html: (x) => statusBadge(x.v, x.status) },
      { label: 'Where', html: (x) => esc(whereIs(x.v)) },
      { label: 'Arrived', cls: 'nowrap', html: (x) => esc(NA.fmt.date(x.v.arrivedAt)) },
      { label: 'Days', cls: 'right num', html: (x) => `<span class="${stockTone(x.days)}">${N(x.days)}</span>` },
    ].concat(ctx.cost ? [{ label: 'Cost', cls: 'right num', html: (x) => (x.cost ? (x.est ? '≈ ' : '') + M(x.cost) : '—') }] : []);
    const canOpen = NA.canSee('inventory');
    const body = block('Cars by days in stock', NA.ui.bars(ages.map((b) => ({ label: b.label, value: b.n, tone: b.tone })), { height: 160 }))
      + tableBlock('By model', table(modelCols, models, { href: (x) => (canOpen && x.modelId ? '#/inventory?tab=all&model=' + encodeURIComponent(x.modelId) : '') }))
      + tableBlock('Oldest first', table(carCols, cars, { href: (x) => (canOpen ? '#/inventory/' + x.v.id : '') }));
    const csv = [['VIN', 'Model', 'Colour', 'Status', 'Where', 'Arrived', 'Days in stock'].concat(ctx.cost ? ['Cost', 'Cost from price list'] : [])]
      .concat(cars.map((x) => [x.v.vin || '', modelLabel(x.v.modelId), x.v.color || '', statusText(x.status), whereIs(x.v), dayOf(x.v.arrivedAt), x.days]
        .concat(ctx.cost ? [Math.round(x.cost), x.est ? 'yes' : ''] : [])));
    return { html: card({ title, meta: meta + ' · ' + plural(cars.length, 'car'), figs, body, foot }), csv: { name: fileName('stock-age', null), rows: csv } };
  }

  /* ================================================================ 6. Who owes us? */
  const OWED_AGES = [{ label: '0–30 days', max: 30, tone: 'brand' }, { label: '31–60 days', max: 60, tone: 'amber' }, { label: '61–90 days', max: 90, tone: 'red' }, { label: 'Over 90 days', max: Infinity, tone: 'red' }];
  /** Same rules as Accounts → Customers who owe (used when Accounts' figures are not loaded). */
  function receivablesLocal() {
    const after = [], before = [];
    const T = NA.today();
    list('orders').forEach((o) => {
      if (o.stage === 'cancelled') return;
      const bal = B.orderBalance(o);
      if (bal <= 0.5) return;
      const base = { kind: 'car', o, id: o.id, customerId: o.customerId, amount: bal, waiting: B.orderPending(o), ref: o.code, what: NA.modelName(o.modelId) };
      const since = o.stage === 'delivered' ? deliveredOn(o) || bookedOn(o) : bookedOn(o);
      (o.stage === 'delivered' ? after : before).push(Object.assign(base, { since, days: Math.max(0, NA.daysBetween(since || T, T)) }));
    });
    list('invoices').forEach((i) => {
      if (i.kind === 'vehicle' || i.billing === 'warranty' || num(i.total) <= 0) return;
      const due = num(i.total) - Math.min(num(i.total), num(i.paid));
      if (due <= 0.5) return;
      const since = dayOf(i.date) || T;
      after.push({ kind: 'service', inv: i, id: i.id, customerId: i.customerId, amount: due, waiting: 0, since, days: Math.max(0, NA.daysBetween(since, T)), ref: i.no, what: 'Service' });
    });
    after.sort((a, b) => b.days - a.days || b.amount - a.amount);
    return { after, before };
  }
  function owedView(ctx) {
    const cars = NA.canSee('sales');
    const svc = NA.canSee('service') || NA.canSee('finance');
    const title = 'Who owes us?';
    let rec = null;
    if (NA.finance && typeof NA.finance.receivables === 'function') {
      try { rec = NA.finance.receivables(); } catch (e) { console.error(e); rec = null; }
    }
    if (!rec || !Array.isArray(rec.after)) rec = receivablesLocal();
    const after = rec.after.filter((x) => (x.kind === 'car' ? cars : svc)).map((x) => {
      const o = x.kind === 'car' ? x.o || NA.get('orders', x.id) : null;
      const inv = x.kind === 'car' ? null : x.inv || NA.get('invoices', x.id);
      const bounced = o ? B.orderPayments(o).some(B.paymentBounced) : !!inv && list('payments').some((p) => p.invoiceId === inv.id && B.paymentBounced(p));
      return Object.assign({}, x, { o, inv, bounced });
    });
    const before = cars ? (rec.before || []).filter((x) => x.kind === 'car') : [];
    const live = (p) => !p.void && p.status !== 'void';
    const waitingPays = B.paymentsToVerify().filter((p) => live(p) && num(p.amount) > 0 && (p.orderId ? cars : svc));
    const owed = sum(after, (x) => x.amount);
    const late = after.filter((x) => x.days > 60);
    const waiting = sum(waitingPays, (p) => p.amount);
    const toCollect = sum(before, (x) => x.amount);
    const meta = 'As of ' + esc(NA.fmt.date(ctx.T)) + (cars && svc ? '' : cars ? ' · car sales' : ' · workshop bills');
    const foot = [
      cars && svc ? 'Money a customer still owes after taking the car home or after a service bill, counted from the hand-over or bill date.'
        : cars ? 'Money a customer still owes after taking the car home, counted from the hand-over date.'
          : 'Money a customer still owes on a service bill, counted from the bill date.',
      cars ? 'For cars, only money Accounts has confirmed counts as paid; money handed in but not yet confirmed shows beside it. Orders not handed over yet are not debts: their balance is collected before the car goes.' : '',
      NA.canSee('finance') ? 'Refunds we owe customers are in Accounts.' : '',
    ].filter(Boolean).join(' ');
    if (!after.length && !waitingPays.length && !before.length) {
      return { html: card({ title, meta, body: emptyBlock('Nobody owes us money right now.', 'check-circle'), foot }), csv: null };
    }
    const ages = OWED_AGES.map((b) => ({ label: b.label, tone: b.tone, amount: 0, n: 0 }));
    after.forEach((x) => { const i = OWED_AGES.findIndex((b) => x.days <= b.max); ages[i].amount += x.amount; ages[i].n++; });
    const verify = NA.can('payments.verify');
    let figs = fig(cars ? 'Owed after hand-over' : 'Owed on service bills', esc(S(owed)), owed ? plural(new Set(after.map((x) => x.customerId)).size, 'customer') : 'All paid')
      + fig('Over 60 days', esc(S(sum(late, (x) => x.amount))), late.length ? plural(late.length, 'bill') + ' to chase' : 'None', late.length ? 'red' : null)
      + fig('Waiting for Accounts', esc(S(waiting)), waitingPays.length
        ? (verify ? `<a class="btn-link" href="#/approvals?tab=money">${plural(waitingPays.length, 'payment')} to confirm</a>` : plural(waitingPays.length, 'payment') + ' being checked')
        : 'Nothing waiting');
    if (cars) figs += fig('To collect before hand-over', esc(S(toCollect)), plural(before.length, 'open order'));
    const dayTone = (d) => (d > 60 ? 'tone-red' : d > 30 ? 'tone-amber' : '');
    // The totals row only fills the money columns.
    const cols = [
      { label: 'Customer', html: (x, total) => (total ? 'Total'
        : `<div class="cell-main">${esc(custName(x.customerId))}</div>${x.bounced ? '<span class="rp-cell-sub tone-red">A payment bounced</span>' : ''}`) },
      { label: 'For', html: (x, total) => (total ? '' : `${esc(x.ref || '—')}<span class="rp-cell-sub">${esc(x.kind === 'car' ? x.what || '' : 'Service bill')}</span>`) },
    ].concat(cars ? [{ label: 'Consultant', html: (x, total) => (total ? '' : x.o ? esc(who(x.o.consultantId)) : '—') }] : []).concat([
      { label: 'Since', cls: 'nowrap', html: (x, total) => (total ? '' : esc(NA.fmt.date(x.since))) },
      { label: 'Days', cls: 'right num', html: (x, total) => (total ? '' : `<span class="${dayTone(x.days)}">${N(x.days)}</span>`) },
      { label: 'Owed', cls: 'right num', html: (x) => M(x.amount) },
      { label: 'Waiting for Accounts', cls: 'right num', html: (x) => (x.waiting ? M(x.waiting) : '—') },
    ]);
    const href = (x) => {
      if (x.kind === 'car') return x.o && NA.canSee('sales') ? '#/sales/' + x.o.id : '';
      if (x.inv && x.inv.refId && NA.canSee('service')) return '#/service/job/' + x.inv.refId;
      return NA.canSee('finance') ? '#/finance?tab=ledger' : '';
    };
    const totalRow = after.length > 1 ? { amount: owed, waiting: sum(after, (x) => x.waiting) } : null;
    const allPaid = cars && svc ? 'Every customer who has their car has paid in full, and every service bill is paid.'
      : cars ? 'Every customer who has their car has paid in full.' : 'Every service bill is paid.';
    const body = (owed ? block('Owed, by how long it has been waiting', NA.ui.bars(ages.map((b) => ({ label: b.label, value: Math.round(b.amount), tone: b.tone })), { height: 160, money: true }))
      : emptyBlock(allPaid, 'check-circle'))
      + (after.length ? tableBlock('Oldest first', table(cols, after, { href, total: totalRow })) : '');
    const csv = [['Customer', 'Kind', 'Reference', 'For', 'Consultant', 'Since', 'Days', 'Owed', 'Waiting for Accounts', 'Payment bounced']]
      .concat(after.map((x) => [custName(x.customerId), x.kind === 'car' ? 'Car' : 'Service', x.ref || '', x.kind === 'car' ? x.what || '' : 'Service bill', x.o ? who(x.o.consultantId) : '', x.since || '', x.days, Math.round(x.amount), Math.round(x.waiting || 0), x.bounced ? 'yes' : '']));
    return { html: card({ title, meta, figs, body, foot }), csv: { name: fileName('money-owed', null), rows: csv } };
  }

  /* ================================================================ 7. How busy is the workshop? */
  const wsKind = (j) => (j.billing === 'warranty' ? 'warranty' : j.billing === 'internal' || !j.customerId ? 'internal' : 'paid');
  const wsOpened = (j) => dayOf(j.openedAt || j.createdAt);
  const wsDone = (j) => ['completed', 'invoiced', 'closed'].includes(j.status);
  const wsDoneOn = (j) => dayOf(j.completedAt || j.closedAt || (j.internal && j.internal.closedAt) || j.invoicedAt || j.updatedAt);
  const jobInvoice = (j) => { const inv = j.invoiceId ? NA.get('invoices', j.invoiceId) : null; return inv && inv.kind !== 'vehicle' ? inv : null; };
  function jobTotals(j) {
    const s = NA.service;
    if (s && typeof s.totals === 'function') { try { return s.totals(j); } catch (e) { /* fall back */ } }
    const t = B.jobTotals(j);
    return { net: t.net, internalCost: t.internalCost };   // net is after the discount, like the service screen's
  }
  /** What a paid job was billed, before VAT and after any discount. */
  function jobBilled(j) {
    const inv = jobInvoice(j);
    if (inv && inv.subtotal != null && inv.subtotal !== '') return num(inv.subtotal);
    return num(jobTotals(j).net);
  }
  /** The value of the work on a warranty or own-car job (parts at selling price plus labour). */
  function jobWork(j) {
    const inv = jobInvoice(j);
    return (inv ? num(inv.internalCost) || num(inv.subtotal) : 0) || num(jobTotals(j).internalCost);
  }
  function wsMeasure(r) {
    const jobs = list('jobCards').filter((j) => j.status !== 'cancelled' && inR(wsOpened(j), r));
    const done = list('jobCards').filter((j) => j.status !== 'cancelled' && wsDone(j) && inR(wsDoneOn(j), r));
    const paidDone = done.filter((j) => wsKind(j) === 'paid');
    const billed = sum(paidDone, jobBilled);
    const n = (k) => jobs.filter((j) => wsKind(j) === k).length;
    return {
      jobs, done, paidDone, billed, count: jobs.length, paid: n('paid'), warranty: n('warranty'), internal: n('internal'),
      avg: paidDone.length ? billed / paidDone.length : 0,
      warrantyWork: sum(done.filter((j) => wsKind(j) === 'warranty'), jobWork),
      cancelled: list('jobCards').filter((j) => j.status === 'cancelled' && inR(wsOpened(j), r)).length,
    };
  }
  /** Seven-day stretches from the first day for up to three months, calendar months for longer periods; never past today. */
  function wsBuckets(r) {
    const T = NA.today();
    const end = r.to < T ? r.to : T;
    if (end < r.from) return { unit: 'week', list: [] };
    if (NA.daysBetween(r.from, end) + 1 <= 92) {
      const out = [];
      for (let s = r.from; s <= end && out.length < 20; s = NA.addDays(s, 7)) {
        const e = NA.addDays(s, 6);
        out.push({ from: s, to: e > end ? end : e, label: NA.fmt.dateShort(s), key: s });
      }
      return { unit: 'week', list: out };
    }
    const twoYears = r.from.slice(0, 4) !== end.slice(0, 4);
    return { unit: 'month', list: monthsOf({ from: r.from, to: end }).map((k) => ({
      from: k + '-01' < r.from ? r.from : k + '-01', to: monthEnd(k) > end ? end : monthEnd(k), key: k,
      label: new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString('en-GB', twoYears ? { month: 'short', year: '2-digit' } : { month: 'short' }),
    })) };
  }
  function workshopView(ctx, r) {
    const m = wsMeasure(r);
    const cmp = compareTo(r);
    const p = cmp ? wsMeasure(r.prev) : { count: 0, avg: 0, billed: 0 };
    const title = 'How busy is the workshop?';
    const meta = esc(r.label) + ' · ' + plural(m.count, 'car') + ' in';
    const foot = `Cars in counts job cards opened in ${esc(r.label)}${m.cancelled ? ` (${plural(m.cancelled, 'cancelled job')} left out)` : ''}. Finished jobs and money are counted on the day the work was finished. `
      + 'Paid work is before VAT and after any discount. Warranty work is the value of free repairs, which we claim from BYD.';
    if (!m.count && !m.done.length) {
      return { html: card({ title, meta: esc(r.label), figs: fig('Cars in', '0', prevSub(cmp, p.count)), body: emptyBlock(nothingIn(r, 'cars in the workshop'), 'wrench', r), foot }), csv: null };
    }
    const figs = fig('Cars in', N(m.count), prevSub(cmp, p.count))
      + fig('Finished', N(m.done.length), plural(m.paidDone.length, 'paid job'))
      + fig('Average paid job', esc(S(m.avg)), m.paidDone.length ? ['Before VAT', prevSub(cmp, p.avg, S)].filter(Boolean).join(' · ') : 'No paid job finished')
      + fig('Paid work billed', esc(S(m.billed)), prevSub(cmp, p.billed, S))
      + fig('Warranty work', esc(S(m.warrantyWork)), 'Free to the customer');
    const bk = wsBuckets(r);
    const rows = bk.list.map((b) => {
      const inB = (d) => !!d && d >= b.from && d <= b.to;
      const opened = m.jobs.filter((j) => inB(wsOpened(j)));
      const done = m.done.filter((j) => inB(wsDoneOn(j)));
      return { label: b.label, key: b.key, from: b.from, jobs: opened.length, paid: opened.filter((j) => wsKind(j) === 'paid').length,
        warranty: opened.filter((j) => wsKind(j) === 'warranty').length, internal: opened.filter((j) => wsKind(j) === 'internal').length,
        done: done.length, billed: sum(done.filter((j) => wsKind(j) === 'paid'), jobBilled) };
    });
    const per = bk.unit === 'week' ? 'week' : 'month';
    const split = [
      { label: 'Paid by the customer', value: m.paid, color: 'var(--blue-solid)' },
      { label: 'Warranty (free)', value: m.warranty, color: 'var(--teal-solid)' },
      { label: 'Our own cars', value: m.internal, color: 'var(--gray-solid)' },
    ].filter((x) => x.value);
    const chart = `<div class="rp-block"><div class="rp-split">
        <div><div class="rp-sub">Cars in per ${per}</div>${rows.length ? NA.ui.bars(rows.map((x) => ({ label: x.label, value: x.jobs })), { height: 170 }) : '<p class="rp-quiet">Nothing to show yet.</p>'}</div>
        <div><div class="rp-sub">Paid and warranty</div>${split.length ? NA.ui.donut(split, { size: 132, center: N(m.count) }) : '<p class="rp-quiet">No cars came in.</p>'}</div>
      </div></div>`;
    const totalRow = { label: 'Total', jobs: m.count, paid: m.paid, warranty: m.warranty, internal: m.internal, done: m.done.length, billed: m.billed };
    const cols = [
      { label: per === 'week' ? 'Week starting' : 'Month', cls: 'nowrap', html: (x) => esc(x.label) },
      { label: 'Cars in', cls: 'right num', html: (x) => N(x.jobs) },
      { label: 'Paid', cls: 'right num', html: (x) => N(x.paid) },
      { label: 'Warranty', cls: 'right num', html: (x) => N(x.warranty) },
      { label: 'Our own cars', cls: 'right num', html: (x) => N(x.internal) },
      { label: 'Finished', cls: 'right num', html: (x) => N(x.done) },
      { label: 'Paid work billed', cls: 'right num', html: (x) => (x.billed ? M(x.billed) : '—') },
    ];
    // By type of work (from the job card, else its booking).
    const bookingOf = new Map();
    list('serviceBookings').forEach((b) => { if (b.jobCardId) bookingOf.set(b.jobCardId, b); });
    const typeOf = (j) => j.type || (bookingOf.get(j.id) || {}).type || (wsKind(j) === 'warranty' ? 'Warranty Repair' : 'Not recorded');
    const types = new Map();
    m.jobs.forEach((j) => {
      const k = typeOf(j);
      if (!types.has(k)) types.set(k, { type: k, jobs: 0, paid: 0, warranty: 0, internal: 0 });
      const t = types.get(k); t.jobs++; t[wsKind(j)]++;
    });
    const typeRows = [...types.values()].sort((a, b) => b.jobs - a.jobs || a.type.localeCompare(b.type));
    const typeCols = [
      { label: 'Type of work', html: (x) => `<span class="cell-main">${esc(x.type)}</span>` },
      { label: 'Cars in', cls: 'right num', html: (x) => N(x.jobs) },
      { label: 'Paid', cls: 'right num', html: (x) => N(x.paid) },
      { label: 'Warranty', cls: 'right num', html: (x) => N(x.warranty) },
      { label: 'Our own cars', cls: 'right num', html: (x) => N(x.internal) },
    ];
    const body = chart
      + (rows.length ? tableBlock(per === 'week' ? 'Week by week' : 'Month by month', table(cols, rows, { total: rows.length > 1 ? totalRow : null })) : '')
      + (typeRows.length ? tableBlock('By type of work', table(typeCols, typeRows)) : '');
    const csv = [[per === 'week' ? 'Week starting' : 'Month', 'Cars in', 'Paid', 'Warranty', 'Our own cars', 'Finished', 'Paid work billed before VAT']]
      .concat(rows.map((x) => [per === 'week' ? x.key : x.key, x.jobs, x.paid, x.warranty, x.internal, x.done, Math.round(x.billed)]))
      .concat(rows.length > 1 ? [['Total', m.count, m.paid, m.warranty, m.internal, m.done.length, Math.round(m.billed)]] : []);
    return { html: card({ title, meta, figs, body, foot }), csv: { name: fileName('workshop', r), rows: csv } };
  }

  /* ---------------------------------------------------------------- Targets (Sales Manager and MD) */
  /** Save targets for a month. values: { staffId: { units, value } }. Returns the names whose target changed. */
  function setTargets(month, values) {
    if (!NA.can('targets.set') || !/^\d{4}-\d{2}$/.test(String(month || ''))) return [];
    const me = NA.me();
    const changed = [];
    Object.keys(values || {}).forEach((staffId) => {
      const v = values[staffId] || {};
      const units = Math.max(0, Math.round(num(v.units)));
      const value = Math.max(0, Math.round(num(v.value)));
      const stamp = { setBy: me.name, setById: NA.myStaffId(), setAt: new Date().toISOString() };
      const found = targetsOf(staffId, month);
      if (!found.length) {
        if (!units && !value) return;
        NA.insert('targets', Object.assign({ staffId, month, units, value }, stamp));
        changed.push({ staffId, units, value });
        return;
      }
      // Keep every copy equal (two managers saving at once could have made two) so Today and Reports agree.
      let diff = false;
      found.forEach((t) => { if (num(t.units) !== units || num(t.value) !== value) { NA.update('targets', t.id, Object.assign({ units, value }, stamp)); diff = true; } });
      if (diff) changed.push({ staffId, units, value });
    });
    if (changed.length) {
      const what = changed.map((c) => `${NA.staffName(c.staffId)} ${c.units ? plural(c.units, 'car') : 'no target'}${c.value ? ' / ' + S(c.value) : ''}`).join(', ');
      NA.log(`Sales targets for ${monthName(month)} set by ${me.name}: ${what}`, { link: '#/reports?r=team', kind: 'info' });
    }
    return changed;
  }
  function targetsSheet(month0) {
    if (!NA.can('targets.set')) { NA.ui.toast('The Sales Manager sets the monthly targets', 'error'); return; }
    const people = NA.consultants().slice().sort((a, b) => (a.role === 'Sales Manager') - (b.role === 'Sales Manager') || String(a.name).localeCompare(String(b.name)));
    if (!people.length) { NA.ui.toast('Add sales consultants in People first', 'error'); return; }
    const T = NA.today();
    const y = +T.slice(0, 4), m = +T.slice(5, 7) - 1;
    const months = [-2, -1, 0, 1, 2, 3].map((d) => ymKey(y, m + d));
    let cur = /^\d{4}-\d{2}$/.test(String(month0 || '')) ? month0 : T.slice(0, 7);
    if (!months.includes(cur)) { months.push(cur); months.sort(); }
    const drafts = {};
    const stored = (k) => { const o = {}; people.forEach((s) => { const t = targetOf(s.id, k); o[s.id] = { units: t ? num(t.units) : 0, value: t ? num(t.value) : 0 }; }); return o; };
    // What each month showed when first opened. Saving sends only the boxes changed since, so a target someone else
    // saved meanwhile from another computer is not quietly put back.
    const shown = {};
    const firstSeen = (k) => shown[k] || (shown[k] = stored(k));
    let read = () => drafts[cur] || firstSeen(cur);
    NA.ui.modal({
      title: 'Monthly targets', size: 'md',
      subtitle: esc('How many cars each consultant should hand over in the month.'),
      body: `<div class="rp-tg">
          <div class="field"><label for="rp-tg-month">Month</label><select id="rp-tg-month" data-tg-month>${months.map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(monthName(k))}</option>`).join('')}</select></div>
          <div class="rp-tg-cols" aria-hidden="true"><span></span><span>Cars</span><span>Sales value (৳)</span></div>
          <div class="glist">${people.map((s) => `<div class="gl-row rp-tg-row">
              ${NA.ui.avatar(s.name, 30)}
              <div class="gl-main"><b>${esc(s.name)}</b><small>${esc(s.role || '')}</small></div>
              <input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-tg-units="${esc(s.id)}" aria-label="Cars for ${esc(s.name)}"/>
              <input type="number" min="0" step="1" inputmode="numeric" placeholder="Optional" data-tg-value="${esc(s.id)}" aria-label="Sales value for ${esc(s.name)}, in taka"/>
            </div>`).join('')}</div>
          <p class="glist-foot">Cars counts cars handed over in the month. Sales value is optional, before VAT. Leave a box empty for no target.
            <button type="button" class="btn-link" data-tg-copy>Copy from ${esc(monthName(prevMonth(cur), false))}</button></p>
        </div>`,
      onMount: (el) => {
        const inputs = (attr) => { const out = new Map(); el.querySelectorAll('[' + attr + ']').forEach((i) => out.set(i.getAttribute(attr), i)); return out; };
        const unitsIn = inputs('data-tg-units'), valueIn = inputs('data-tg-value');
        const sel = el.querySelector('[data-tg-month]');
        const copy = el.querySelector('[data-tg-copy]');
        const fill = (vals) => people.forEach((s) => {
          const v = vals[s.id] || { units: 0, value: 0 };
          const u = unitsIn.get(s.id), w = valueIn.get(s.id);
          if (u) u.value = v.units ? String(v.units) : '';
          if (w) w.value = v.value ? String(v.value) : '';
        });
        read = () => {
          const o = {};
          people.forEach((s) => {
            const u = unitsIn.get(s.id), w = valueIn.get(s.id);
            o[s.id] = { units: Math.max(0, Math.round(num(u && u.value))), value: Math.max(0, Math.round(num(w && w.value))) };
          });
          return o;
        };
        fill(firstSeen(cur));
        if (sel) sel.addEventListener('change', () => {
          drafts[cur] = read();                      // keep what was typed for the month being left
          cur = sel.value;
          fill(drafts[cur] || firstSeen(cur));
          if (copy) copy.textContent = 'Copy from ' + monthName(prevMonth(cur), false);
        });
        if (copy) copy.addEventListener('click', () => { const k = prevMonth(cur); fill(drafts[k] || stored(k)); });
      },
      actions: [{ label: 'Cancel' }, { label: 'Save targets', kind: 'primary', onClick: () => {
        drafts[cur] = read();
        let n = 0;
        Object.keys(drafts).sort().forEach((k) => {
          const was = shown[k] || stored(k), edited = {};
          Object.keys(drafts[k]).forEach((id) => {
            const a = drafts[k][id], b = was[id] || { units: 0, value: 0 };
            if (a.units !== b.units || a.value !== b.value) edited[id] = a;
          });
          n += setTargets(k, edited).length;
        });
        NA.ui.toast(n ? 'Targets saved' : 'Nothing changed', n ? 'success' : 'info');
        if (n) NA.refresh();
      } }],
    });
  }
  NA.reports = {
    /** A period as the Reports screen uses it: range('month' | 'last' | 'fy' | 'custom', from, to). */
    range: rangeFor,
    /** One person's target for a month (yyyy-mm): { units, value } or null. */
    target: (staffId, month) => { const t = targetOf(staffId, month); return t ? { units: num(t.units), value: num(t.value) } : null; },
    setTargets,
  };
  /** Open the monthly targets sheet (Sales Manager and MD). */
  NA.actions.setTargets = (month) => targetsSheet(month);

  /* ---------------------------------------------------------------- CSV */
  function downloadCsv(name, rows) {
    const cell = (v) => {
      if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 100) / 100) : '';
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // a spreadsheet must never run a name as a formula
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      NA.ui.toast('Saved ' + name);
    } catch (e) { NA.ui.toast('Could not create the file in this browser', 'error'); }
  }

  /* ---------------------------------------------------------------- The screen */
  const REPORTS = [
    { key: 'team', tab: 'Consultants', show: () => NA.isManager(), view: teamView },
    { key: 'sources', tab: 'Lead sources', show: () => NA.isManager(), view: sourcesView },
    { key: 'lost', tab: 'Lost leads', show: () => NA.isManager(), view: lostView },
    { key: 'sells', tab: 'Models', show: () => NA.isManager() || NA.isRole('accounts'), view: sellsView },
    { key: 'stock', tab: 'Stock age', snapshot: true, sub: 'Where our stock stands today.', show: () => NA.isManager() || NA.isRole('accounts', 'procurement'), view: stockView },
    { key: 'owed', tab: 'Money owed', snapshot: true, sub: 'Who owes us money today.', show: () => NA.isManager() || NA.isRole('accounts', 'service_manager'), view: owedView },
    { key: 'workshop', tab: 'Workshop', show: () => NA.isRole('owner', 'service_manager'), view: workshopView },
  ];
  const FIRST_FOR = { accounts: 'owed', service_manager: 'workshop', procurement: 'stock' };
  function loadView() {
    try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function saveView(v) { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch (e) { /* private window */ } }
  /** onlyToday: every report this person has is "as of today", and the page subtitle already says so. */
  function periodBar(rep, r, onlyToday) {
    if (rep.snapshot) return onlyToday ? '' : `<div class="rp-period"><span class="rp-range">${NA.icon('clock', 15)}Where things stand today, so there is no period to choose.</span></div>`;
    // Custom dates apply on "Show" (or Enter): a date box changes with every part typed, which must not redraw the page.
    return `<div class="rp-period">
      <div class="seg" role="group" aria-label="Period">${PERIODS.map((p) => `<button type="button" data-period="${p.key}" class="${p.key === r.key ? 'active' : ''}" aria-pressed="${p.key === r.key}"${p.title ? ` title="${esc(p.title)}"` : ''}>${esc(p.label)}</button>`).join('')}</div>
      ${r.key === 'custom'
        ? `<div class="rp-dates"><label class="sr-only" for="rp-from">From</label><input id="rp-from" type="date" data-range="from" value="${esc(r.from)}"/><span class="muted">to</span><label class="sr-only" for="rp-to">To</label><input id="rp-to" type="date" data-range="to" value="${esc(r.to)}"/>${NA.ui.btn('Show', { kind: 'plain', size: 'sm', act: 'range-show', attrs: 'type="button"' })}</div>`
        : `<span class="rp-range">${esc(r.sub || r.label)}</span>`}
    </div>`;
  }

  NA.page({
    path: 'reports', title: 'Reports', icon: 'pie',
    render(root, params, query) {
      injectCss();
      query = query || {};
      const tabs = NA.canSee('reports') ? REPORTS.filter((x) => x.show()) : [];
      // The subtitle fits what this person sees (Procurement has only Stock age, which is as of today).
      const onlyToday = !!tabs.length && tabs.every((x) => x.snapshot);
      const subtitle = tabs.length === 1 && tabs[0].sub ? tabs[0].sub
        : onlyToday ? 'Where things stand today.' : 'Plain answers to the questions that matter, for any period.';
      const head = (actions) => NA.ui.pageHead({ title: 'Reports', subtitle, actions: actions || '' });
      if (!tabs.length) {
        root.innerHTML = head() + `<div class="card pad">${NA.ui.empty(NA.isRole('sales')
          ? 'Your own month — cars handed over against your target, bookings and money collected — is on Today.'
          : 'Reports are for the Managing Director, the Sales Manager, Accounts, Procurement and the Service Manager.', 'pie',
          NA.ui.btn('Go to Today', { kind: 'ghost', href: '#/dashboard' }))}</div>`;
        return null;
      }
      const saved = loadView();
      const pick = (k) => tabs.some((x) => x.key === k);
      const rk = pick(query.r) ? query.r : pick(saved.r) ? saved.r : (tabs.find((x) => x.key === FIRST_FOR[NA.role()]) || tabs[0]).key;
      const rep = tabs.find((x) => x.key === rk);
      const okP = (k) => PERIODS.some((p) => p.key === k);
      const fromUrl = okP(query.p);
      const range = rangeFor(fromUrl ? query.p : okP(saved.p) ? saved.p : 'month', fromUrl ? query.from : saved.from, fromUrl ? query.to : saved.to);
      saveView({ r: rk, p: range.key, from: range.key === 'custom' ? range.from : '', to: range.key === 'custom' ? range.to : '' });

      let out;
      try { out = rep.view(context(), range); }
      catch (e) {
        console.error(e);
        out = { html: `<div class="card pad">${NA.ui.empty('This report could not be worked out: ' + e.message, 'alert')}</div>`, csv: null };
      }
      // No table, nothing to export: the button is left out (the card already says there is nothing to show).
      const hasRows = !!(out.csv && out.csv.rows && out.csv.rows.length > 1);
      const actions = (hasRows ? NA.ui.btn('Export CSV', { kind: 'ghost', icon: 'download', act: 'export' }) : '')
        + (rk === 'team' && NA.can('targets.set') ? NA.ui.btn('Set targets', { kind: 'primary', icon: 'target', act: 'targets' }) : '');
      root.innerHTML = `${head(actions)}
        ${tabs.length > 1 ? NA.ui.tabs(tabs.map((x) => ({ key: x.key, label: x.tab })), rk, 'data-report') : ''}
        ${periodBar(rep, range, onlyToday)}
        ${out.html}
        ${NA.canSee('finance') ? '<p class="rp-after">Money in and out, profit and loss, and VAT are in <a class="btn-link" href="#/finance">Accounts</a>.</p>' : ''}`;

      const state = { r: rk, p: range.key, from: range.from, to: range.to };
      const go = (patch) => {
        const s = Object.assign({}, state, patch);
        NA.go('#/reports?r=' + encodeURIComponent(s.r) + '&p=' + s.p + (s.p === 'custom' ? '&from=' + s.from + '&to=' + s.to : ''));
      };
      // Both dates are read when the person asks for them, never while they are still typing.
      const showRange = () => {
        const f = root.querySelector('[data-range="from"]'), t = root.querySelector('[data-range="to"]');
        if (!f || !t || !isDay(f.value) || !isDay(t.value)) { NA.ui.toast('Choose both dates first', 'error'); return; }
        let from = f.value, to = t.value;
        if (from > to) { const x = from; from = to; to = x; NA.ui.toast('The dates were the wrong way round, so they have been swapped', 'info'); }
        go({ p: 'custom', from, to });
      };
      const unbind = [
        NA.ui.delegate(root, 'click', '[data-report]', (el) => go({ r: el.dataset.report })),
        // "Custom" starts from the period on screen, so only the dates that differ need changing.
        NA.ui.delegate(root, 'click', '[data-period]', (el) => go({ p: el.dataset.period })),
        NA.ui.delegate(root, 'click', '[data-act="range-show"]', showRange),
        NA.ui.delegate(root, 'keydown', '[data-range]', (el, ev) => { if (ev.key === 'Enter') { ev.preventDefault(); showRange(); } }),
        NA.ui.delegate(root, 'click', '[data-act="period-last"]', () => go({ p: 'last' })),
        NA.ui.delegate(root, 'click', '[data-act="export"]', () => { if (hasRows) downloadCsv(out.csv.name, out.csv.rows); }),
        NA.ui.delegate(root, 'click', '[data-act="targets"]', () => targetsSheet(range.month || NA.today().slice(0, 7))),
        NA.ui.delegate(root, 'click', 'tr[data-href]', (el, ev) => { if (!ev.target.closest('a, button')) NA.go(el.dataset.href); }),
      ];
      return () => unbind.forEach((u) => u());
    },
  });
})();
