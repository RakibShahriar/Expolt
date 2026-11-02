/* ==========================================================================
   Parts — spare parts for the Gulshan workshop.
   A part is held for a car when it is added to a job card (service.js) and
   taken out of stock when the work is done. Stock only comes in against a
   parts order: Order parts → (Managing Director approves big orders) →
   ordered from the supplier → received, which updates the average cost.
   Counts and write-offs wait for the Managing Director and are applied
   when approved. Part costs are shown only to people who may see costs.
   Route: #/parts?tab=stock|orders&q=<search>
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const ui = NA.ui;
  const esc = NA.esc;
  const fmt = NA.fmt;
  const B = NA.biz;
  const A = NA.approvals;
  NA.actions = NA.actions || {};

  const S = { q: '', f: 'all', model: '', po: 'open' };
  let drawList = null;

  const ADJUST_REASONS = ['Physical stock count', 'Damaged / scrapped', 'Lost / missing', 'Returned to supplier', 'Found in recount', 'Data correction'];
  /** Where an order is (poKey): a draft is waiting for prices, priced but not sent (its request was withdrawn), or
      declined by the Managing Director (change it and send it again). */
  const PO = {
    draft: { label: 'Waiting for prices', tone: 'gray' }, unsent: { label: 'Not sent yet', tone: 'gray' },
    declined: { label: 'Declined, change and send again', tone: 'red' }, pending: { label: 'Waiting for approval', tone: 'amber' },
    approved: { label: 'Approved', tone: 'blue' }, ordered: { label: 'Ordered', tone: 'violet' },
    received: { label: 'Received', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'gray' },
  };
  const OPEN_PO = ['draft', 'pending', 'approved', 'ordered'];
  /** pricedBy is a name, so it is known even to people who may not see the prices themselves. */
  const hasPrices = (o) => !!o.pricedBy || (num(o.total) > 0 && (o.lines || []).every((l) => l.unitCost != null && num(l.unitCost) > 0));
  const poKey = (o) => (o.status !== 'draft' ? o.status : o.approval && o.approval.status === 'rejected' ? 'declined' : hasPrices(o) ? 'unsent' : 'draft');
  const poLabel = (o) => (PO[poKey(o)] || { label: o.status }).label;
  /** Parts orders above this total need the Managing Director's approval. */
  const poLimit = () => { const v = NA.policy().partsOrderLimit; return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : 100000; };

  /* ---------- helpers ---------- */
  const num = (x) => Number(x) || 0;
  const canCost = () => NA.can('costs.view');
  const canManage = () => NA.can('parts.manage');
  /** Receives orders and puts opening stock on the books (Procurement & Stock, Managing Director). */
  const canStock = () => NA.can('parts.adjust');
  /** Prices orders and places them with the supplier. */
  const canOrder = () => (NA.can('po.manage') || canStock()) && canCost();
  const stamp = () => ({ by: NA.me().name, byId: NA.myStaffId(), at: new Date().toISOString() });
  const shortModel = (id) => { const m = NA.model(id); return m ? String(m.name).replace(/^BYD\s+/i, '') : '—'; };
  /** Units held by job cards (lines not yet taken out of stock). */
  const heldOnJobs = (partId) => NA.db.jobCards.reduce((s, j) => s + (j.status === 'cancelled' ? 0
    : (j.parts || []).filter((l) => l.partId === partId && !l.consumed).reduce((t, l) => t + num(l.qty), 0)), 0);
  const held = (p) => Math.max(num(p.reserved), heldOnJobs(p.id));
  const free = (p) => B.partFree(p);
  const isOut = (p) => free(p) <= 0;
  /** Units already asked for or on the way (open parts orders). */
  const onOrder = (partId) => NA.db.partOrders.filter((o) => OPEN_PO.includes(o.status))
    .reduce((s, o) => s + (o.lines || []).filter((l) => l.partId === partId).reduce((t, l) => t + Math.max(0, num(l.qty) - num(l.received)), 0), 0);
  /** Order up to twice the reorder level, less what is free and what is already on order. */
  const suggestQty = (p) => Math.max(0, 2 * num(p.reorderLevel) - free(p) - onOrder(p.id));
  const stockValue = (p) => num(p.onHand) * num(p.cost);
  const margin = (p) => (num(p.price) > 0 ? (num(p.price) - num(p.cost)) / num(p.price) : 0);
  const hit = (q, ...xs) => !q || xs.some((x) => String(x || '').toLowerCase().includes(q));
  const fits = (p, modelId) => !modelId || !(p.compatible || []).length || p.compatible.includes(modelId);
  const pendingAdjust = (p) => !!A && A.isPending('parts', p.id, 'stock_adjust');
  /** Is a step the person's own call, someone else's, or not needed at all? 'ask' | 'self' | 'direct'. */
  function gate(type, amount) {
    if (A.needed(type, amount)) return 'ask';
    const roles = A.approverRoles(type, amount);
    return NA.isRole('owner') || roles.includes(NA.role()) ? 'self' : 'direct';
  }

  function statusBadge(p) {
    if (isOut(p)) return ui.badge('Out of stock', 'red');
    if (B.partLow(p)) return ui.badge('Low', 'amber');
    return ui.badge('In stock', 'green');
  }
  function compatChips(p) {
    const c = p.compatible || [];
    if (!c.length) return '<span class="badge badge-gray pt-chip">All models</span>';
    return c.map((id) => `<span class="badge badge-blue pt-chip">${esc(shortModel(id))}</span>`).join(' ');
  }
  /** Open job cards holding a reservation on this part. */
  function reservedBy(partId) {
    const out = [];
    NA.db.jobCards.forEach((j) => {
      if (['invoiced', 'cancelled', 'closed'].includes(j.status)) return;
      const qty = (j.parts || []).filter((l) => l.partId === partId && !l.consumed).reduce((s, l) => s + (Number(l.qty) || 0), 0);
      if (qty) out.push({ jc: j, qty });
    });
    return out;
  }
  /** Stock movements: our own log + consumption derived from completed job cards. */
  function movements(partId) {
    const out = [];
    NA.db.parts.forEach((p) => {
      if (partId && p.id !== partId) return;
      (p.stockLog || []).forEach((m) => out.push(Object.assign({ part: p }, m)));
    });
    NA.db.jobCards.forEach((j) => {
      (j.parts || []).forEach((l) => {
        if (!l.consumed || (partId && l.partId !== partId)) return;
        const p = NA.get('parts', l.partId); if (!p) return;
        out.push({ part: p, at: (j.completedAt || j.openedAt || '') + 'T12:00:00', date: j.completedAt || j.openedAt, kind: 'consume', qty: -(Number(l.qty) || 0), ref: j.code, reason: l.onCancelledJob ? 'Fitted on a cancelled job' : 'Used on a job card', link: '#/service/job/' + j.id, by: NA.staffName(j.technicianId) });
      });
    });
    return out.sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date)));
  }
  /** A stock movement with who did it, and its value when the cost is known. */
  function addLog(p, entry) {
    const log = (p.stockLog || []).slice();
    log.unshift(Object.assign({ at: new Date().toISOString(), date: NA.today(), by: NA.me().name, byId: NA.myStaffId() }, entry));
    if (log.length > 300) log.length = 300;
    return log;
  }

  function injectCss() {
    if (document.getElementById('css-parts')) return;
    const s = document.createElement('style');
    s.id = 'css-parts';
    s.textContent = `
      .pt-kpis{margin-bottom:32px}
      .pt-free{font-weight:600;font-size:15px;font-variant-numeric:tabular-nums}
      .pt-chip{height:20px;font-size:11.5px}
      .pt-jobs{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
      .pt-jobs a{font-size:11.5px;font-weight:500;color:var(--amber);background:var(--amber-50);border-radius:6px;padding:0 6px;line-height:18px}
      .pt-jobs a:hover{text-decoration:underline}
      .pt-big{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .pt-big div{border-radius:14px;padding:14px 16px;background:var(--fill-3)}
      .pt-big b{display:block;font-family:var(--font-display);font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
      .pt-big span{font-size:12.5px;color:var(--muted)}
      .pt-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--fill);margin:18px 0 8px}
      .pt-bar i{display:block;height:100%}
      .pt-bar .f{background:var(--green-solid)}
      .pt-bar .r{background:var(--amber-solid)}
      .pt-mv{font-weight:600;white-space:nowrap;width:48px;flex:none;font-variant-numeric:tabular-nums}
      .pt-mv.in{color:var(--green)}.pt-mv.out{color:var(--red)}
      .pt-section{margin-top:28px}
      .pt-seg{display:flex;width:100%}
      .pt-seg label{flex:1;position:relative;display:flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:7px;font-weight:500;font-size:13.5px;color:var(--ink-2);cursor:pointer;text-align:center}
      .pt-seg input{position:absolute;opacity:0;pointer-events:none}
      .pt-seg label:has(input:checked){background:var(--raised);color:var(--ink);box-shadow:var(--shadow-sm)}
      .pt-preview{margin-top:16px;font-size:15px;font-weight:500;font-variant-numeric:tabular-nums}
      .pt-num{width:84px;height:34px;border:0;border-radius:9px;background:var(--fill);text-align:right;padding:0 10px;outline:none;font-variant-numeric:tabular-nums}
      .pt-num:focus{background:var(--field-bg);box-shadow:var(--focus)}
      .pt-cost{width:132px;margin-left:auto}
      .pt-cost span{height:34px}
      .pt-cost input{height:34px;border:0;border-radius:9px;background:var(--fill);width:100%;padding:0 10px 0 26px;text-align:right;outline:none;font-variant-numeric:tabular-nums}
      .pt-total{margin-top:16px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
      .pt-order td{vertical-align:middle}
      .pt-intro{margin-bottom:16px}
      .pt-right{justify-content:flex-end}
      .pt-take{width:44px}
    `;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------------
     Page
     ------------------------------------------------------------------------ */
  NA.page({
    path: 'parts',
    title: 'Parts',
    icon: 'cog-parts',
    render(root, params, query) {
      injectCss();
      query = query || {};
      // The search box lives in ?q= (kept by replaceState while typing), so the URL is the source of truth.
      S.q = query.q != null ? String(query.q) : '';
      const tab = query.tab === 'orders' ? 'orders' : 'stock';
      const parts = NA.db.parts;
      const low = parts.filter((p) => B.partLow(p));
      const out = parts.filter(isOut);
      const toOrder = low.filter((p) => suggestQty(p) > 0);
      const reservedUnits = parts.reduce((s, p) => s + num(p.reserved), 0);
      const reservingJobs = NA.db.jobCards.filter((j) => !['invoiced', 'cancelled', 'closed'].includes(j.status) && (j.parts || []).some((l) => !l.consumed)).length;
      const openOrders = (NA.db.partOrders || []).filter((o) => OPEN_PO.includes(o.status));
      const waiting = openOrders.filter((o) => o.status === 'pending').length;
      const toPrice = openOrders.filter((o) => poKey(o) === 'draft').length;
      const declined = openOrders.filter((o) => poKey(o) === 'declined').length;
      const value = parts.reduce((s, p) => s + stockValue(p), 0);

      const orderFirst = toOrder.length > 0;
      const actions = canManage()
        ? ui.btn(toOrder.length ? `Order parts (${toOrder.length})` : 'Order parts', { kind: orderFirst ? 'primary' : 'ghost', icon: 'cart', act: 'order' })
          + ui.btn('Add part', { kind: orderFirst ? 'ghost' : 'primary', icon: 'plus', act: 'add' })
        : '';
      root.innerHTML = ui.pageHead({ title: 'Parts', subtitle: 'Workshop stock: held for job cards, used when the work is done, ordered when it runs low.', actions })
        + `<div class="grid ${canCost() ? 'grid-4' : 'grid-3'} pt-kpis">
          ${ui.kpi({ label: 'Low or out', value: low.length, sub: out.length ? `<span class="tone-red">${out.length} out of stock</span>` : low.length ? 'At or below the reorder level' : 'All above the reorder level' })}
          ${ui.kpi({ label: 'Held for jobs', value: fmt.num(reservedUnits), sub: `On ${reservingJobs} open job card${reservingJobs === 1 ? '' : 's'}`, href: NA.canSee('service') ? '#/service?tab=jobs' : undefined })}
          ${ui.kpi({ label: 'Parts orders open', value: openOrders.length, sub: waiting ? `${waiting} waiting for approval` : declined ? `${declined} declined, to change and send again` : toPrice ? `${toPrice} waiting for prices` : 'Nothing waiting', href: '#/parts?tab=orders' })}
          ${canCost() ? ui.kpi({ label: 'Stock value', value: fmt.short(value), sub: 'At average cost' }) : ''}
        </div>`
        + ui.tabs([{ key: 'stock', label: 'Stock', count: parts.length }, { key: 'orders', label: 'Orders', count: openOrders.length || null }], tab)
        + '<div data-body></div>';

      const body = root.querySelector('[data-body]');
      drawList = null;
      if (tab === 'orders') ordersTab(body); else stockTab(body);

      const unbind = [
        ui.delegate(root, 'click', '[data-tab]', (el) => NA.go(el.dataset.tab === 'orders' ? '#/parts?tab=orders' : '#/parts')),
        ui.delegate(root, 'input', '[data-q]', (el) => {
          S.q = el.value;
          try { history.replaceState(null, '', '#/parts' + (S.q ? '?q=' + encodeURIComponent(S.q) : '')); } catch (e) { /* ignore */ }
          if (drawList) drawList();
        }),
        ui.delegate(root, 'change', '[data-model]', (el) => { S.model = el.value; if (drawList) drawList(); }),
        ui.delegate(root, 'click', '[data-act]', (el, ev) => {
          const id = el.dataset.id;
          const inner = ev && ev.target.closest('a,button');
          switch (el.dataset.act) {
            case 'f': S.f = el.dataset.v; return NA.render();
            case 'po-f': S.po = el.dataset.v; return NA.render();
            case 'add': return editPart(null);
            case 'order': return orderParts();
            case 'view': if (inner && inner !== el) return null; return viewPart(id);
            case 'po-view': if (inner && inner !== el) return null; return viewOrder(id);
            default: return null;
          }
        }),
      ];
      return () => unbind.forEach((u) => u());
    },
  });

  const matchPart = (p, k) => k === 'all' || (k === 'low' ? B.partLow(p) : k === 'out' ? isOut(p) : k === 'ordered' ? onOrder(p.id) > 0 : num(p.reserved) > 0);
  function stockTab(body) {
    const parts = NA.db.parts;
    const models = NA.db.models.filter((m) => m.active !== false);
    const cnt = (k) => parts.filter((p) => matchPart(p, k)).length;
    body.innerHTML = `
      <div class="toolbar">
        <input type="search" data-q placeholder="Search part, part number, shelf" value="${esc(S.q)}"/>
        <div class="chips">${[['all', 'All'], ['low', 'Low'], ['out', 'Out of stock'], ['reserved', 'Held for jobs'], ['ordered', 'On order']].map(([k, l]) => `<button class="chip ${S.f === k ? 'active' : ''}" data-act="f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
        <select data-model aria-label="Fits model"><option value="">Every model</option>${models.map((m) => `<option value="${esc(m.id)}" ${S.model === m.id ? 'selected' : ''}>Fits ${esc(m.name.replace(/^BYD\s+/i, ''))}</option>`).join('')}</select>
      </div>
      <div class="card" data-list></div>
      <section class="pt-section"><div class="glist-title">Recent stock movements</div><div class="card"><div class="card-body" data-moves></div></div></section>`;
    const listEl = body.querySelector('[data-list]');
    const jobLink = (r) => (NA.canSee('service') ? `<a href="#/service/job/${esc(r.jc.id)}" title="${esc(r.qty + ' held on ' + r.jc.code)}">${esc(r.jc.code)}</a>` : `<span>${esc(r.jc.code)}</span>`);
    drawList = () => {
      const q = S.q.trim().toLowerCase();
      const rows = parts.filter((p) => matchPart(p, S.f)).filter((p) => fits(p, S.model))
        .filter((p) => hit(q, p.sku, p.name, p.bin, p.location, (p.compatible || []).map(shortModel).join(' ')))
        .sort((a, b) => (Number(isOut(b)) - Number(isOut(a))) || (Number(B.partLow(b)) - Number(B.partLow(a))) || String(a.name).localeCompare(String(b.name)));
      listEl.innerHTML = ui.table([
        { label: 'Part', render: (p) => `<div class="cell-main">${esc(p.name)}</div><div class="cell-sub"><span class="mono">${esc(p.sku)}</span> ${compatChips(p)}</div>` },
        { label: 'Shelf', render: (p) => `<div class="mono">${esc(p.bin || '—')}</div><div class="cell-sub">${esc(p.location || '')}</div>` },
        { label: 'Free', cls: 'right', render: (p) => { const f = free(p); const rb = reservedBy(p.id); return `<div class="pt-free ${f <= 0 ? 'tone-red' : B.partLow(p) ? 'tone-amber' : ''}">${fmt.num(f)}</div><div class="cell-sub">${fmt.num(p.onHand)} on the shelf${num(p.reserved) ? ' · ' + fmt.num(p.reserved) + ' held' : ''}</div>${rb.length ? `<div class="pt-jobs pt-right">${rb.map(jobLink).join('')}</div>` : ''}`; } },
        { label: 'Status', render: (p) => { const oo = onOrder(p.id); return statusBadge(p) + (oo ? `<div class="cell-sub">${oo} on order</div>` : '') + (pendingAdjust(p) ? '<div class="cell-sub tone-amber">Count waiting for approval</div>' : ''); } },
        { label: 'Price', cls: 'right', render: (p) => `<div class="num">${fmt.money(p.price)}</div>${canCost() ? `<div class="cell-sub">cost ${fmt.money(p.cost)}</div>` : ''}` },
      ], rows, {
        empty: parts.length ? 'No parts match these filters' : 'No parts yet. Add your first part.',
        emptyIcon: 'cog-parts',
        rowAttr: (p) => `class="clickable" data-act="view" data-id="${esc(p.id)}"`,
      });
    };
    drawList();
    const mv = movements().slice(0, 8);
    body.querySelector('[data-moves]').innerHTML = mv.length ? `<ul class="list">${mv.map(moveRow).join('')}</ul>` : ui.empty('No stock movements yet', 'layers');
  }

  const poBadge = (o) => {
    const s = PO[poKey(o)] || { label: o.status, tone: 'gray' };
    const part = o.status === 'ordered' && (o.lines || []).some((l) => num(l.received) > 0);
    return ui.badge(part ? 'Partly received' : s.label, part ? 'violet' : s.tone);
  };
  function ordersTab(body) {
    const all = (NA.db.partOrders || []).slice().sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
    const match = (o, k) => k === 'all' || (k === 'open' ? OPEN_PO.includes(o.status) : poKey(o) === k);
    const cnt = (k) => all.filter((o) => match(o, k)).length;
    const chips = [['open', 'Open'], ['draft', 'Waiting for prices'], ['unsent', 'Not sent yet'], ['declined', 'Declined'], ['pending', 'Waiting for approval'], ['approved', 'Approved'], ['ordered', 'Ordered'], ['received', 'Received'], ['cancelled', 'Cancelled'], ['all', 'All']];
    body.innerHTML = `
      <div class="toolbar"><div class="chips">${chips.filter(([k]) => ['open', 'all'].includes(k) || cnt(k)).map(([k, l]) => `<button class="chip ${S.po === k ? 'active' : ''}" data-act="po-f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div></div>
      <div class="card" data-list></div>
      <p class="glist-foot">${canOrder() ? `Orders above ${fmt.money(poLimit())} need the Managing Director’s approval. Stock comes in only when an order is received.` : 'Procurement adds the prices, places the order and receives the parts.'}</p>`;
    const listEl = body.querySelector('[data-list]');
    drawList = () => {
      const rows = all.filter((o) => match(o, S.po));
      listEl.innerHTML = ui.table([
        { label: 'Order', render: (o) => `<div class="cell-main">${esc(o.code)}</div><div class="cell-sub">${fmt.date(o.date)}${o.requestedBy ? ' · ' + esc(o.requestedBy) : ''}</div>` },
        { label: 'Supplier', render: (o) => esc(o.vendorId ? NA.vendorName(o.vendorId) : '—') },
        { label: 'Parts', render: (o) => { const L = o.lines || []; return `<div>${L.length} part${L.length === 1 ? '' : 's'} · ${fmt.num(L.reduce((s, l) => s + num(l.qty), 0))} units</div><div class="cell-sub">${esc(L.slice(0, 3).map((l) => l.name).join(', '))}${L.length > 3 ? '…' : ''}</div>`; } },
        canCost() ? { label: 'Total', cls: 'right', render: (o) => (num(o.total) ? fmt.money(o.total) : '<span class="muted">—</span>') } : null,
        { label: 'Status', render: (o) => poBadge(o) },
      ].filter(Boolean), rows, {
        empty: S.po === 'open' ? 'No open parts orders. Use “Order parts” when stock runs low.' : 'No parts orders here', emptyIcon: 'cart',
        rowAttr: (o) => `class="clickable" data-act="po-view" data-id="${esc(o.id)}"`,
      });
    };
    drawList();
  }

  /** What a received movement cost, for people who may see costs: read from its parts order (stock movements keep
      units only, since every service role receives the parts list). Older entries carry their own cost. */
  function moveCost(m) {
    if (!canCost()) return null;
    if (m.cost != null) return num(m.cost);
    const o = m.kind === 'in' && m.orderId ? NA.get('partOrders', m.orderId) : null;
    const l = o && (o.lines || []).find((x) => x.partId === m.part.id);
    return l && l.unitCost != null ? num(l.unitCost) : null;
  }
  function moveRow(m) {
    const q = num(m.qty);
    const label = { in: 'Received', opening: 'Opening stock', adjust: 'Count or write-off', consume: 'Used' }[m.kind] || m.kind;
    const ref = m.ref ? ' · ' + (m.link && NA.canSee('service') ? `<a href="${m.link}" class="strong">${esc(m.ref)}</a>` : esc(m.ref)) : '';
    const cost = moveCost(m);
    return `<li><span class="pt-mv ${q >= 0 ? 'in' : 'out'}">${q > 0 ? '+' : ''}${q}</span>
      <div class="grow"><div class="t">${esc(m.part.name)}</div><div class="s">${esc(label)}${ref}${m.reason && m.kind !== 'consume' ? ' · ' + esc(m.reason) : ''}${cost ? ' · @ ' + fmt.money(cost) : ''}${m.by ? ' · ' + esc(m.by) : ''}${m.approvedBy ? ' · approved by ' + esc(m.approvedBy) : ''}</div></div>
      <span class="small muted nowrap">${fmt.date(m.date || m.at)}</span></li>`;
  }

  /* ------------------------------------------------------------------------
     Part detail drawer
     ------------------------------------------------------------------------ */
  function viewPart(id) {
    const p = NA.get('parts', id); if (!p) return;
    const onHand = num(p.onHand); const res = num(p.reserved); const f = free(p);
    const rb = reservedBy(p.id);
    const mv = movements(p.id).slice(0, 25);
    const tot = Math.max(onHand, num(p.reorderLevel) * 2, 1);
    const oo = onOrder(p.id);
    const orders = (NA.db.partOrders || []).filter((o) => OPEN_PO.includes(o.status) && (o.lines || []).some((l) => l.partId === p.id));
    const glRow = (label, value) => `<div class="gl-row"><span class="gl-label grow">${esc(label)}</span><span class="gl-value">${value}</span></div>`;
    const jobRow = (r) => {
      const inner = `<span class="gl-main"><b>${esc(r.jc.code)} · ${esc(r.jc.customerId ? NA.customerName(r.jc.customerId) : 'Our own car')}</b><small>Opened ${fmt.date(r.jc.openedAt)}</small></span><span class="gl-value">${r.qty}</span>`;
      return NA.canSee('service') ? `<a class="gl-row" href="#/service/job/${esc(r.jc.id)}">${inner}</a>` : `<div class="gl-row">${inner}</div>`;
    };
    ui.drawer({
      title: p.name,
      subtitle: `<span class="mono">${esc(p.sku)}</span> · Shelf ${esc(p.bin || '—')} · ${esc(p.location || '')}`,
      body: `
        <div class="row wrap gap-4 pt-intro">${statusBadge(p)} ${compatChips(p)}</div>
        ${A ? NA.ui.approvalBanners('parts', p.id, ['stock_adjust']) : ''}
        <div class="pt-big mt-16">
          <div><b>${fmt.num(onHand)}</b><span>On the shelf</span></div>
          <div><b class="${res ? 'tone-amber' : ''}">${fmt.num(res)}</b><span>Held for jobs</span></div>
          <div><b class="${f <= 0 ? 'tone-red' : B.partLow(p) ? 'tone-amber' : 'tone-green'}">${fmt.num(f)}</b><span>Free to use</span></div>
        </div>
        <div class="pt-bar"><i class="f" style="width:${(Math.max(0, f) / tot) * 100}%"></i><i class="r" style="width:${(res / tot) * 100}%"></i></div>
        <div class="row-between small muted"><span><i class="dot dot-green"></i> free &nbsp; <i class="dot dot-amber"></i> held</span><span>Order more at ${fmt.num(p.reorderLevel)}${oo ? ' · ' + oo + ' on order' : ''}</span></div>
        <div class="glist-title mt-24">Details</div>
        <div class="glist">
          ${glRow('Selling price', fmt.money(p.price))}
          ${canCost() ? glRow('Average cost', fmt.money(p.cost)) + glRow('Margin', fmt.pct(margin(p))) + glRow('Stock value at cost', fmt.money(stockValue(p))) : ''}
          ${glRow('Fits', (p.compatible || []).length ? p.compatible.map((m) => esc(NA.modelName(m))).join(', ') : 'Every BYD model')}
        </div>
        <div class="glist-title mt-24">Held for job cards</div>
        ${rb.length ? `<div class="glist">${rb.map(jobRow).join('')}</div>` : '<p class="glist-foot">Not held for any job card.</p>'}
        ${orders.length ? `<div class="glist-title mt-24">On order</div><div class="glist">${orders.map((o) => `<div class="gl-row"><span class="gl-main"><b>${esc(o.code)}</b><small>${esc(poLabel(o))}</small></span><span class="gl-value">${(o.lines || []).filter((l) => l.partId === p.id).reduce((s, l) => s + Math.max(0, num(l.qty) - num(l.received)), 0)}</span></div>`).join('')}</div>` : ''}
        <div class="glist-title mt-24">Stock movements</div>
        ${mv.length ? `<div class="card"><div class="card-body"><ul class="list">${mv.map(moveRow).join('')}</ul></div></div>` : '<p class="glist-foot">No movements yet.</p>'}`,
      actions: canManage() ? [
        { label: 'Edit', onClick: () => { editPart(p.id); } },
        { label: 'Count', onClick: () => { adjustStock(p.id); } },
        { label: 'Order more', kind: 'primary', icon: 'cart', onClick: () => { orderParts([p.id]); } },
      ] : [{ label: 'Close' }],
      // job-card links navigate away — close the drawer so it is not left over the job card page
      onMount: (el) => el.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) ui.closeTop(); }),
    });
  }

  /* ------------------------------------------------------------------------
     Add / edit part
     ------------------------------------------------------------------------ */
  function editPart(id) {
    if (!canManage()) { ui.toast('Only the service and stock team change the parts list', 'error'); return; }
    const p = id ? NA.get('parts', id) : null;
    const models = NA.db.models.filter((m) => m.active !== false || (p && (p.compatible || []).includes(m.id)));
    const vals = p ? Object.assign({}, p) : { location: (NA.db.settings.locations || [])[0] || 'Gulshan Warehouse', reorderLevel: 4, onHand: 0 };
    vals.allModels = !(p && (p.compatible || []).length);
    models.forEach((m) => { vals['fit_' + m.id] = p ? (p.compatible || []).includes(m.id) : false; });
    // Cost changes through receiving (average cost). Only the Managing Director corrects it by hand.
    const costEditable = canCost() && (!p || NA.isRole('owner'));
    const opening = !p && canStock();
    const fields = [
      { name: 'name', label: 'Part name', required: true, span: 2, placeholder: 'e.g. Cabin air filter (PM2.5)' },
      { name: 'sku', label: 'Part number', required: true, placeholder: 'BYD-XX-0000' },
      { name: 'bin', label: 'Shelf', placeholder: 'R1-S2' },
      { name: 'price', label: 'Selling price', type: 'money', required: true },
      costEditable ? { name: 'cost', label: p ? 'Average cost' : 'Cost price', type: 'money', required: !p, help: p ? 'Normally set by receiving parts orders' : '' } : null,
      { name: 'reorderLevel', label: 'Order more when free stock is at', type: 'number', min: 0, required: true },
      { name: 'location', label: 'Store', type: 'select', options: NA.db.settings.locations || [], placeholder: false },
      opening ? { name: 'onHand', label: 'Opening stock (units)', type: 'number', min: 0, help: NA.isRole('owner') ? 'Units on the shelf today.' : 'Units on the shelf today. The Managing Director approves it.' } : null,
      { name: 'allModels', label: 'Fits every model', type: 'checkbox', span: 2 },
      ...models.map((m) => ({ name: 'fit_' + m.id, label: m.name.replace(/^BYD\s+/i, ''), type: 'checkbox' })),
    ].filter(Boolean);
    const el = ui.formModal({
      title: p ? 'Edit part' : 'Add a part',
      subtitle: p ? esc(p.sku) + ' · stock changes only by receiving an order or by a count.' : 'A new part number in the list. Stock comes in with a parts order.',
      size: 'lg',
      fields,
      values: vals,
      submitLabel: p ? 'Save' : 'Add part',
      onSubmit: (f) => {
        const sku = String(f.sku || '').trim().toUpperCase();
        if (!sku) { ui.toast('Enter the part number', 'error'); return false; }
        if (NA.find('parts', (x) => String(x.sku).toUpperCase() === sku && (!p || x.id !== p.id))) { ui.toast(`Part number ${sku} is already in the list`, 'error'); return false; }
        const price = Math.round(num(f.price));
        const cost = costEditable ? Math.round(num(f.cost)) : (p && p.cost != null ? num(p.cost) : null);
        if (cost != null && costEditable && price < cost) { ui.toast('The selling price is below cost — please check', 'error'); return false; }
        const compatible = f.allModels ? [] : models.filter((m) => f['fit_' + m.id]).map((m) => m.id);
        if (!f.allModels && !compatible.length) { ui.toast('Choose the models it fits, or switch on “Fits every model”', 'error'); return false; }
        const rec = { sku, name: f.name, bin: f.bin, location: f.location, price, reorderLevel: Math.max(0, Math.floor(num(f.reorderLevel))), compatible };
        if (costEditable) rec.cost = cost;
        if (p) {
          const show = (k, x) => (['price', 'cost'].includes(k) ? fmt.money(x) : x == null || x === '' ? '—' : String(x));
          // The activity feed reaches people who may not see costs: a cost change is noted without the figures.
          const changes = [['name', 'name'], ['sku', 'part number'], ['price', 'selling price'], ['cost', 'cost'], ['reorderLevel', 'order level'], ['bin', 'shelf'], ['location', 'store']]
            .filter(([k]) => k in rec && String(p[k] == null ? '' : p[k]) !== String(rec[k] == null ? '' : rec[k]))
            .map(([k, label]) => (k === 'cost' ? 'average cost corrected' : `${label} ${show(k, p[k])} → ${show(k, rec[k])}`));
          if (String((p.compatible || []).slice().sort()) !== String(compatible.slice().sort())) changes.push('models it fits');
          NA.update('parts', p.id, rec);
          if (changes.length) NA.log(`Part ${sku} changed: ${changes.join(', ')}`, { link: '#/parts?q=' + encodeURIComponent(sku), kind: rec.price !== num(p.price) ? 'warn' : 'info' });
          ui.toast('Saved');
        } else {
          const qty = opening ? Math.max(0, Math.floor(num(f.onHand))) : 0;
          const np = NA.insert('parts', Object.assign(rec, { onHand: 0, reserved: 0, stockLog: [], addedBy: NA.me().name, addedById: NA.myStaffId() }));
          NA.log(`New part ${sku} — ${rec.name}`, { link: '#/parts?q=' + encodeURIComponent(sku), kind: 'success' });
          if (qty) {
            const r = requestAdjust(np, { delta: qty, reason: 'Opening stock', notes: '' });
            ui.toast(r === 'done' ? `Part added with ${qty} on the shelf` : 'Part added — the opening stock waits for the Managing Director', r === 'done' ? 'success' : 'info');
          } else ui.toast('Part added');
        }
        NA.refresh();
      },
    });
    if (el && el.querySelector) {
      const all = el.querySelector('[name=allModels]');
      const sync = () => el.querySelectorAll('[name^=fit_]').forEach((x) => { const c = x.closest && x.closest('.check'); if (c) c.classList.toggle('hidden', !!all.checked); });
      if (all && all.addEventListener) { all.addEventListener('change', sync); sync(); }
    }
  }

  /* ------------------------------------------------------------------------
     Counts and write-offs. A change to the shelf count waits for the
     Managing Director (approval kind stock_adjust) and is applied when
     approved — by the difference, so stock used in the meantime is kept.
     ------------------------------------------------------------------------ */
  /** Apply a count or write-off now. d: { delta, reason, notes }. */
  function applyAdjust(partId, d, meta) {
    const p = NA.get('parts', partId); if (!p) return null;
    const delta = Math.round(num(d.delta)); if (!delta) return null;
    const cur = num(p.onHand);
    const next = Math.max(0, cur + delta);
    // Units only: every service role receives the parts list, and only the part's own cost is kept from them.
    const entry = { kind: d.reason === 'Opening stock' ? 'opening' : 'adjust', qty: next - cur, reason: d.reason + (d.notes ? ' — ' + d.notes : ''), balance: next,
      by: meta.by, byId: meta.byId || null, approvedBy: meta.approvedBy || null, approvalId: meta.approvalId || null };
    NA.update('parts', p.id, { onHand: next, stockLog: addLog(p, entry) });
    const short = next < held(p) ? ` · only ${next} on the shelf for ${held(p)} held on job cards` : '';
    NA.log(`${entry.kind === 'opening' ? 'Opening stock' : 'Stock count'} ${p.sku}: ${entry.qty > 0 ? '+' : ''}${entry.qty} (${d.reason}) — now ${next} on the shelf${meta.approvedBy ? ' · approved by ' + meta.approvedBy : ''}${short}`,
      { link: '#/parts?q=' + encodeURIComponent(p.sku), kind: entry.qty < 0 || short ? 'warn' : 'info' });
    return next;
  }
  /** Ask for (or, within one's own authority, record) a count. Returns 'done' or 'asked'. */
  function requestAdjust(p, d) {
    const delta = Math.round(num(d.delta));
    const value = p.cost != null ? Math.abs(delta) * num(p.cost) : 0;
    const data = { delta, reason: d.reason, notes: d.notes || '', onHandAtCount: num(p.onHand), by: NA.me().name };
    const g = gate('stock_adjust', value);
    if (g === 'direct') { applyAdjust(p.id, data, { by: NA.me().name, byId: NA.myStaffId() }); return 'done'; }
    // The value at cost is only in amount/value (the Managing Director sees it on Approvals), never in the text. People
    // who may not see costs send 0; the Managing Director's browser fills it in (NA.on('rendered') below).
    const a = A.request({ type: 'stock_adjust', ref: { c: 'parts', id: p.id, code: p.sku }, amount: value, value, data, reason: d.notes || d.reason,
      title: `${p.name}: ${delta > 0 ? '+' : ''}${delta} (${d.reason})`,
      detail: `${p.sku} · on the shelf ${num(p.onHand)} → ${num(p.onHand) + delta}${d.notes ? ' · ' + d.notes : ''}` });
    return a.status === 'approved' ? 'done' : 'asked';
  }
  /** Someone else's count for this part that is still waiting. Only its asker or the Managing Director may replace it
      (the office server refuses anyone else), so a second count is not sent. */
  const othersCount = (p) => {
    const a = A && A.find('parts', p.id, 'stock_adjust');
    return a && a.status === 'pending' && !A.isMine(a) && !NA.isRole('owner') ? a : null;
  };
  const othersCountText = (a) => `${a.requestedBy || 'Someone'}’s count of this part is already waiting for the Managing Director. Wait for that decision, or ask ${a.requestedBy || 'them'} to withdraw it.`;

  function adjustStock(id) {
    if (!canManage()) { ui.toast('Only the service and stock team count parts', 'error'); return; }
    const p = NA.get('parts', id); if (!p) return;
    const other = othersCount(p);
    if (other) { ui.toast(othersCountText(other), 'info'); return; }
    const h = held(p);
    const rb = reservedBy(p.id);
    const asks = gate('stock_adjust', 0) === 'ask';
    ui.modal({
      title: 'Count or write off', size: 'sm',
      subtitle: `${esc(p.name)} · ${num(p.onHand)} on the shelf · ${h} held · ${free(p)} free`,
      body: `<form class="modal-form" onsubmit="return false">
          <div class="seg pt-seg" role="radiogroup"><label><input type="radio" name="mode" value="count" checked/>I counted the shelf</label><label><input type="radio" name="mode" value="change"/>Add or remove units</label></div>
          <div class="form-grid mt-16">
            ${ui.field({ name: 'qty', label: 'Units on the shelf', type: 'number', required: true }, num(p.onHand))}
            ${ui.field({ name: 'reason', label: 'Reason', type: 'select', options: ADJUST_REASONS, placeholder: false }, 'Physical stock count')}
            ${ui.field({ name: 'notes', label: 'Note', span: 2, placeholder: 'Who counted, what happened' })}
          </div>
          <p class="pt-preview" data-preview></p>
          ${h ? `<p class="small muted mt-8">${h} held for ${esc(rb.map((r) => r.jc.code).join(', ') || 'job cards')}. The shelf can’t go below that.</p>` : ''}
          ${pendingAdjust(p) ? `<p class="small tone-amber mt-8">${(() => { const w = A.find('parts', p.id, 'stock_adjust'); return A.isMine(w) ? 'Your earlier count for this part is still waiting for approval; this replaces it.' : esc((w.requestedBy || 'Someone') + '’s count is waiting for your approval; saving this replaces it.'); })()}</p>` : ''}
          ${asks ? '<p class="small muted mt-8">The Managing Director approves the change before it counts.</p>' : ''}
        </form>`,
      actions: [{ label: 'Cancel' }, { label: asks ? 'Ask for approval' : 'Save', kind: 'primary', onClick: (el) => {
        const v = ui.readForm(el.querySelector('form'));
        const fresh = NA.get('parts', p.id); if (!fresh) return true;
        const other2 = othersCount(fresh);                                  // asked by someone else while this was open
        if (other2) { ui.toast(othersCountText(other2), 'info'); NA.refresh(); return true; }
        // Read the stock again now: a job may have taken parts while this was open.
        const cur = num(fresh.onHand); const hh = held(fresh);
        if (v.qty === '' || isNaN(Number(v.qty))) { ui.toast('Enter the number of units', 'error'); return false; }
        const q = Math.round(Number(v.qty));
        const next = v.mode === 'change' ? cur + q : q;
        if (next < 0) { ui.toast('Stock can’t go below zero', 'error'); return false; }
        if (next < hh) { ui.toast(`${hh} are held for job cards — take them off the job cards first`, 'error'); return false; }
        const delta = next - cur;
        if (!delta) { ui.toast('No change', 'info'); return false; }
        const r = requestAdjust(fresh, { delta, reason: v.reason || 'Physical stock count', notes: v.notes || '' });
        ui.toast(r === 'done' ? `Saved — ${fresh.name}: ${num((NA.get('parts', fresh.id) || {}).onHand)} on the shelf` : 'Sent to the Managing Director for approval', r === 'done' ? 'success' : 'info');
        NA.refresh();
        return true;
      } }],
      onMount: (el) => {
        const form = el.querySelector('form');
        const qty = el.querySelector('[name=qty]');
        const label = qty && qty.closest && qty.closest('.field') && qty.closest('.field').querySelector('label');
        let mode = 'count';
        const preview = () => {
          const box = el.querySelector('[data-preview]'); if (!box) return;
          const fresh = NA.get('parts', p.id) || p; const cur = num(fresh.onHand);
          const q = Math.round(num(qty && qty.value));
          const next = mode === 'change' ? cur + q : q;
          const d = next - cur;
          box.textContent = `On the shelf ${cur} → ${next}` + (d ? ` (${d > 0 ? '+' : ''}${d}${canCost() && fresh.cost != null ? ', ' + fmt.money(Math.abs(d) * num(fresh.cost)) : ''})` : ' (no change)');
        };
        form.addEventListener('change', (e) => {
          if (e.target.name === 'mode') {
            mode = e.target.value;
            if (label) label.textContent = mode === 'count' ? 'Units on the shelf' : 'Units to add (use minus to remove)';
            qty.value = mode === 'count' ? num((NA.get('parts', p.id) || p).onHand) : 0;
          }
          preview();
        });
        form.addEventListener('input', preview);
        preview();
      },
    });
  }

  /* ------------------------------------------------------------------------
     Parts orders: draft (asked for) → waiting for approval (big orders) →
     approved → ordered from the supplier → received (stock in).
     ------------------------------------------------------------------------ */
  const orderParts = (partIds) => orderSheet({ partIds });

  /** Order parts, or add the prices to an order someone else asked for (order). */
  function orderSheet({ order, partIds }) {
    if (!canManage()) { ui.toast('Only the service and stock team order parts', 'error'); return; }
    const priced = canCost();
    let lines;
    if (order) lines = (order.lines || []).map((l) => ({ part: NA.get('parts', l.partId), qty: num(l.qty), cost: l.unitCost != null ? l.unitCost : (NA.get('parts', l.partId) || {}).cost }));
    else {
      const list = partIds && partIds.length ? partIds.map((x) => NA.get('parts', x)).filter(Boolean) : NA.db.parts.filter((p) => B.partLow(p) && suggestQty(p) > 0);
      lines = list.map((p) => ({ part: p, qty: Math.max(1, suggestQty(p)), cost: p.cost }));
    }
    lines = lines.filter((l) => l.part);
    if (!lines.length) { ui.toast(NA.db.parts.some((p) => B.partLow(p)) ? 'Everything that is low is already on order' : 'Nothing is low. Every part is above its reorder level.', 'info'); return; }
    const vendors = NA.db.vendors || [];
    const row = (l) => `<tr data-pid="${esc(l.part.id)}">
        <td class="pt-take"><input type="checkbox" class="box" data-take checked aria-label="Order this part"/></td>
        <td><div class="cell-main">${esc(l.part.name)}</div><div class="cell-sub"><span class="mono">${esc(l.part.sku)}</span> · ${free(l.part)} free${!order && onOrder(l.part.id) ? ' · ' + onOrder(l.part.id) + ' on order' : ''}</div></td>
        <td class="right"><input class="pt-num" type="number" min="1" step="1" data-qty value="${esc(l.qty)}" aria-label="Quantity"/></td>
        ${priced ? `<td class="right"><div class="input-prefix pt-cost"><span>৳</span><input type="number" min="0" step="1" data-cost value="${esc(l.cost != null ? num(l.cost) : '')}" aria-label="Unit cost"/></div></td>` : ''}
      </tr>`;
    const readLines = (m) => [...m.querySelectorAll('tr[data-pid]')].filter((tr) => { const c = tr.querySelector('[data-take]'); return c && c.checked; })
      .map((tr) => ({ partId: tr.dataset.pid, qty: Math.floor(num((tr.querySelector('[data-qty]') || {}).value)), unitCost: priced ? num((tr.querySelector('[data-cost]') || {}).value) : null }));
    const submit = (m) => {
      const L = readLines(m).filter((l) => l.qty > 0);
      if (!L.length) { ui.toast('Tick at least one part, with a quantity', 'error'); return false; }
      const f = ui.readForm(m.querySelector('form'));
      if (priced && !f.vendorId) { ui.toast('Choose the supplier', 'error'); return false; }
      if (priced && L.some((l) => !(l.unitCost > 0))) { ui.toast('Enter the unit cost of every part', 'error'); return false; }
      const full = L.map((l) => { const p = NA.get('parts', l.partId) || {}; return { partId: l.partId, sku: p.sku || '', name: p.name || '', qty: l.qty, unitCost: priced ? l.unitCost : null, received: 0 }; });
      const total = priced ? full.reduce((s, l) => s + l.qty * num(l.unitCost), 0) : 0;
      if (order) {
        const cur = NA.get('partOrders', order.id);
        if (!cur || cur.status !== 'draft') { ui.toast('This order has already moved on', 'info'); NA.refresh(); return true; }
        NA.update('partOrders', cur.id, { lines: full, total, vendorId: f.vendorId || cur.vendorId || '', note: f.note || '', pricedBy: NA.me().name, pricedById: NA.myStaffId() });
        // Logs and the order's history are read by people who may not see costs: units, not money.
        NA.log(`Parts order ${cur.code} priced by ${NA.me().name}`, { rec: NA.get('partOrders', cur.id), link: '#/parts?tab=orders' });
        sendOrder(NA.get('partOrders', cur.id));
      } else {
        const o = NA.insert('partOrders', Object.assign({ code: NA.nextCode('PPO'), vendorId: f.vendorId || '', date: NA.today(), lines: full, total, status: 'draft', note: f.note || '',
          requestedBy: NA.me().name, requestedById: NA.myStaffId(), history: [] }, priced ? { pricedBy: NA.me().name, pricedById: NA.myStaffId() } : {}));
        NA.log(`Parts order ${o.code} — ${full.length} part${full.length === 1 ? '' : 's'}, ${fmt.num(full.reduce((s, l) => s + num(l.qty), 0))} units${priced ? '' : ', sent to Procurement for prices'}`, { rec: o, link: '#/parts?tab=orders' });
        if (priced) sendOrder(o); else ui.toast('Sent to Procurement');
      }
      NA.go('#/parts?tab=orders');
      return true;
    };
    ui.modal({
      title: order ? (poKey(order) === 'draft' ? 'Prices for ' : 'Change ') + order.code : 'Order parts', size: 'lg',
      subtitle: priced ? `Orders above ${fmt.money(poLimit())} need the Managing Director’s approval.` : 'Procurement adds the prices and places the order.',
      body: `<form class="modal-form" onsubmit="return false">
          <div class="form-grid">${priced ? ui.field({ name: 'vendorId', label: 'Supplier', type: 'select', options: vendors.map((v) => ({ value: v.id, label: v.name })), required: true }, (order && order.vendorId) || (vendors[0] || {}).id || '') : ''}
            ${ui.field({ name: 'note', label: 'Note', span: priced ? 1 : 2, placeholder: 'Optional — e.g. needed for JC-0012' }, order ? order.note : '')}</div>
          <div class="table-wrap mt-16"><table class="table pt-order"><thead><tr><th></th><th>Part</th><th class="right">Qty</th>${priced ? '<th class="right">Unit cost</th>' : ''}</tr></thead><tbody>${lines.map(row).join('')}</tbody></table></div>
          ${priced ? '<p class="pt-total" data-total></p>' : ''}
        </form>`,
      actions: [{ label: 'Cancel' }, { label: 'Print list', icon: 'print', onClick: (m) => { printReorder(readLines(m)); return false; } },
        { label: priced ? 'Send order' : 'Send to Procurement', kind: 'primary', onClick: (m) => submit(m) }],
      onMount: (m) => {
        const upd = () => { const t = m.querySelector('[data-total]'); if (t) t.textContent = 'Total ' + fmt.money(readLines(m).reduce((s, l) => s + l.qty * num(l.unitCost), 0)); };
        m.addEventListener('input', upd); m.addEventListener('change', upd); upd();
      },
    });
  }

  /** A priced order: approved straight away within the limit; above it the Managing Director decides. */
  function sendOrder(o) {
    const total = num(o.total);
    const g = total > poLimit() ? gate('po', total) : 'direct';
    if (g === 'direct') {
      NA.update('partOrders', o.id, { status: 'approved', approval: Object.assign({ status: 'approved', note: total > poLimit() ? 'No approval needed by the rules' : 'Within the limit' }, stamp()) });
      NA.log(`Parts order ${o.code} ready to order${total > poLimit() ? '' : ' (within the limit)'}`, { rec: NA.get('partOrders', o.id), link: '#/parts?tab=orders', kind: 'success' });
      ui.toast('Approved — place the order with the supplier');
      return;
    }
    NA.update('partOrders', o.id, { status: 'pending' });
    // The total is in amount/value (shown to the Managing Director on Approvals), not in the title others read.
    const units = (o.lines || []).reduce((s, l) => s + num(l.qty), 0);
    const a = A.request({ type: 'po', ref: { c: 'partOrders', id: o.id, code: o.code }, amount: total, value: total, reason: o.note || '',
      title: `Parts order ${o.code} · ${(o.lines || []).length} part${(o.lines || []).length === 1 ? '' : 's'}, ${fmt.num(units)} units`,
      detail: `${o.vendorId ? NA.vendorName(o.vendorId) + ' · ' : ''}${(o.lines || []).map((l) => l.qty + ' × ' + l.name).join(', ').slice(0, 220)}` });
    ui.toast(a.status === 'approved' ? 'Approved — place the order with the supplier' : 'Sent to the Managing Director for approval', a.status === 'approved' ? 'success' : 'info');
  }

  function viewOrder(id) {
    const o = NA.get('partOrders', id); if (!o) return;
    const L = o.lines || [];
    const priced = canCost();
    const mine = !!o.requestedById && o.requestedById === NA.myStaffId();
    const nothingIn = !L.some((l) => num(l.received) > 0);
    const rows = L.map((l) => `<div class="gl-row"><span class="gl-main"><b>${esc(l.name || (NA.get('parts', l.partId) || {}).name || 'Part')}</b><small><span class="mono">${esc(l.sku || '')}</span>${num(l.received) ? ' · ' + num(l.received) + ' received' : ''}</small></span><span class="gl-value">${num(l.qty)}${priced && l.unitCost != null ? ' × ' + fmt.money(l.unitCost) : ''}</span></div>`).join('');
    const steps = [`Asked for by ${esc(o.requestedBy || '—')} · ${fmt.date(o.date)}`];
    if (o.pricedBy) steps.push(`Priced by ${esc(o.pricedBy)}`);
    if (o.approval && o.approval.status) steps.push(`${o.approval.status === 'approved' ? 'Approved' : o.approval.status === 'rejected' ? 'Declined' : 'Request withdrawn'}${o.approval.by ? ' by ' + esc(o.approval.by) : ''}${o.approval.note ? ' · ' + esc(o.approval.note) : ''}`);
    if (o.orderedAt) steps.push(`Ordered ${fmt.date(o.orderedAt)}${o.orderedBy ? ' by ' + esc(o.orderedBy) : ''}${o.supplierRef ? ' · ' + esc(o.supplierRef) : ''}${o.eta ? ' · expected ' + fmt.date(o.eta) : ''}`);
    (o.receipts || []).forEach((r) => steps.push(`Received ${fmt.date(r.date)} by ${esc(r.by || '—')}${r.billRef ? ' · bill ' + esc(r.billRef) : ''}${priced ? ' · ' + fmt.money(r.value) : ''}`));
    if (o.cancel) steps.push(`Cancelled by ${esc(o.cancel.by || '—')} · ${esc(o.cancel.reason || '')}`);
    const key = poKey(o);
    const lock = o.status === 'draft' && !canOrder() ? (key === 'draft' ? 'Procurement adds the prices and sends it.' : 'Procurement changes it and sends it again.')
      : o.status === 'approved' && !canOrder() ? 'Procurement places the order with the supplier.'
      : o.status === 'ordered' && !canStock() ? 'Procurement receives the parts and puts them on the shelf.' : '';
    const actions = [{ label: 'Print', icon: 'print', onClick: () => { printOrder(NA.get('partOrders', o.id) || o); return false; } }];
    if (OPEN_PO.includes(o.status) && nothingIn && (mine || canOrder())) actions.push({ label: 'Cancel order', kind: 'danger', onClick: () => { cancelOrder(o); } });
    if (o.status === 'draft' && canOrder()) actions.push({ label: key === 'declined' ? 'Change and send again' : key === 'unsent' ? 'Check and send' : 'Add prices and send', kind: 'primary', onClick: () => { orderSheet({ order: o }); } });
    if (o.status === 'approved' && canOrder()) actions.push({ label: 'Order placed', kind: 'primary', onClick: () => { markOrdered(o); } });
    if (o.status === 'ordered' && canStock()) actions.push({ label: 'Receive parts', kind: 'primary', onClick: () => { receiveOrder(o); } });
    ui.drawer({
      title: 'Parts order ' + o.code,
      subtitle: `${esc(o.vendorId ? NA.vendorName(o.vendorId) : 'Supplier not chosen yet')} · ${fmt.date(o.date)}`,
      body: `<div class="row wrap gap-4 pt-intro">${poBadge(o)}</div>
        ${A ? NA.ui.approvalBanners('partOrders', o.id) : ''}
        <div class="glist-title mt-16">Parts</div><div class="glist">${rows || '<div class="gl-row muted">No parts</div>'}</div>
        ${priced && num(o.total) ? `<p class="pt-total">Total ${fmt.money(o.total)}</p>` : ''}
        ${o.note ? `<p class="small mt-12">${esc(o.note)}</p>` : ''}
        <div class="glist-title mt-24">What happened</div>
        <div class="card"><div class="card-body"><ul class="timeline">${steps.slice().reverse().map((x) => `<li>${x}</li>`).join('')}</ul></div></div>
        ${lock ? `<p class="lock-note mt-16">${NA.icon('lock', 13)}${esc(lock)}</p>` : ''}`,
      actions,
    });
  }

  function markOrdered(o) {
    if (!canOrder()) { ui.toast('Procurement places parts orders', 'error'); return; }
    ui.formModal({
      title: 'Order placed with the supplier', size: 'sm', submitLabel: 'Save',
      intro: `<p class="muted pt-intro">${esc(o.code)} · ${esc(o.vendorId ? NA.vendorName(o.vendorId) : '')}</p>`,
      fields: [
        { name: 'ref', label: 'Supplier’s order or invoice no.', span: 2, placeholder: 'e.g. BYD parts PI-25-118' },
        { name: 'eta', label: 'Expected on', type: 'date', min: NA.today() },
      ],
      onSubmit: (f) => {
        const cur = NA.get('partOrders', o.id);
        if (!cur || cur.status !== 'approved') { ui.toast('This order is not approved', 'error'); NA.refresh(); return true; }
        NA.update('partOrders', cur.id, { status: 'ordered', orderedAt: NA.today(), supplierRef: f.ref || '', eta: f.eta || '', orderedBy: NA.me().name, orderedById: NA.myStaffId() });
        NA.log(`Parts order ${cur.code} placed with ${NA.vendorName(cur.vendorId)}${f.ref ? ' (' + f.ref + ')' : ''}`, { rec: NA.get('partOrders', cur.id), link: '#/parts?tab=orders' });
        ui.toast('Marked as ordered');
        NA.refresh();
      },
    });
  }

  /** Stock in: count what arrived. On hand goes up and the average cost is updated from the order's unit cost. */
  function receiveOrder(o) {
    if (!canStock()) { ui.toast('Procurement receives parts orders', 'error'); return; }
    const cur0 = NA.get('partOrders', o.id); if (!cur0 || cur0.status !== 'ordered') return;
    const left = (l) => Math.max(0, num(l.qty) - num(l.received));
    const rows = (cur0.lines || []).map((l, i) => `<tr data-i="${i}"><td><div class="cell-main">${esc(l.name)}</div><div class="cell-sub"><span class="mono">${esc(l.sku)}</span> · ordered ${num(l.qty)}${num(l.received) ? ', ' + num(l.received) + ' already in' : ''}${canCost() ? ' · ' + fmt.money(l.unitCost) + ' each' : ''}</div></td>
        <td class="right"><input class="pt-num" type="number" min="0" max="${left(l)}" step="1" data-got value="${left(l)}" aria-label="Arrived now" ${left(l) ? '' : 'disabled'}/></td></tr>`).join('');
    ui.modal({
      title: 'Receive parts · ' + cur0.code, size: 'lg',
      subtitle: 'Count what arrived. Stock goes up and the average cost is updated.',
      body: `<form class="modal-form" onsubmit="return false"><div class="form-grid">
          ${ui.field({ name: 'date', label: 'Received on', type: 'date', required: true, max: NA.today() }, NA.today())}
          ${ui.field({ name: 'billRef', label: 'Supplier’s bill no.', placeholder: 'For Accounts' }, cur0.supplierRef || '')}</div>
        <div class="table-wrap mt-16"><table class="table pt-order"><thead><tr><th>Part</th><th class="right">Arrived now</th></tr></thead><tbody>${rows}</tbody></table></div></form>`,
      actions: [{ label: 'Cancel' }, { label: 'Receive', kind: 'primary', onClick: (m) => {
        const cur = NA.get('partOrders', o.id);
        if (!cur || cur.status !== 'ordered') { ui.toast('This order is not waiting for parts', 'info'); NA.refresh(); return true; }
        const f = ui.readForm(m.querySelector('form'));
        const date = f.date && f.date <= NA.today() ? f.date : NA.today();
        const got = {};
        m.querySelectorAll('tr[data-i]').forEach((tr) => { const x = tr.querySelector('[data-got]'); got[tr.dataset.i] = Math.max(0, Math.floor(num(x && x.value))); });
        const now = (cur.lines || []).map((l, i) => Math.min(left(l), got[i] || 0));
        if (!now.some((q) => q > 0)) { ui.toast('Enter what arrived', 'error'); return false; }
        let value = 0;
        const lines = (cur.lines || []).map((l, i) => {
          const q = now[i]; if (!q) return l;
          const p = NA.get('parts', l.partId);
          if (p) {
            const oldQ = Math.max(0, num(p.onHand)); const c = num(l.unitCost);
            const avg = oldQ + q ? Math.round((oldQ * num(p.cost) + q * c) / (oldQ + q)) : c;
            const balance = num(p.onHand) + q;
            value += q * c;
            // The movement keeps units; its cost is on the order line (and in the part's average cost).
            NA.update('parts', p.id, { onHand: balance, cost: avg, stockLog: addLog(p, { kind: 'in', qty: q, ref: cur.code + (f.billRef ? ' · ' + f.billRef : ''), reason: 'Received from ' + NA.vendorName(cur.vendorId), balance, orderId: cur.id, date }) });
          }
          return Object.assign({}, l, { received: num(l.received) + q });
        });
        const all = lines.every((l) => num(l.received) >= num(l.qty));
        NA.update('partOrders', cur.id, { lines, status: all ? 'received' : 'ordered', receivedAt: all ? date : cur.receivedAt || null, billRef: f.billRef || cur.billRef || '',
          receipts: (cur.receipts || []).concat([Object.assign({ date, billRef: f.billRef || '', value }, stamp())]) });
        NA.log(`Parts order ${cur.code}: ${fmt.num(now.reduce((s, q) => s + q, 0))} units received${all ? ' — complete' : ', more to come'}`, { rec: NA.get('partOrders', cur.id), link: '#/parts?tab=orders', kind: 'success' });
        ui.toast(all ? 'All parts received' : 'Received — the rest is still on order');
        NA.refresh();
        return true;
      } }],
    });
  }

  function cancelOrder(o) {
    const cur = NA.get('partOrders', o.id);
    if (!cur || !OPEN_PO.includes(cur.status)) return;
    if ((cur.lines || []).some((l) => num(l.received) > 0)) { ui.toast('Some parts have arrived already, so it can’t be cancelled', 'error'); return; }
    const mine = !!cur.requestedById && cur.requestedById === NA.myStaffId();
    if (!mine && !canOrder()) { ui.toast('Only the person who asked, or Procurement, can cancel it', 'error'); return; }
    ui.formModal({
      title: 'Cancel parts order', size: 'sm', submitLabel: 'Cancel order',
      intro: `<p class="muted pt-intro">${esc(cur.code)}${cur.status === 'ordered' ? ' is already ordered: tell the supplier too.' : ''}</p>`,
      fields: [{ name: 'reason', label: 'Why?', required: true, span: 2 }],
      onSubmit: (f) => {
        const fresh = NA.get('partOrders', o.id); if (!fresh || !OPEN_PO.includes(fresh.status)) return true;
        const a = A.find('partOrders', fresh.id, 'po');
        if (a && a.status === 'pending' && A.isMine(a)) A.withdraw(a);
        NA.update('partOrders', fresh.id, { status: 'cancelled', cancel: Object.assign({ reason: f.reason }, stamp()) });
        NA.log(`Parts order ${fresh.code} cancelled — ${f.reason}`, { rec: NA.get('partOrders', fresh.id), link: '#/parts?tab=orders', kind: 'warn' });
        ui.toast('Order cancelled', 'info');
        NA.refresh();
      },
    });
  }

  /* Prints (paper keeps its own colours) */
  function printOrder(o) {
    const approved = ['approved', 'ordered', 'received'].includes(o.status);
    const priced = canCost();
    ui.print('Parts order ' + o.code, `<h1>Parts order ${esc(o.code)}${approved ? '' : ' — DRAFT, not approved'}</h1>
      <div class="muted">${fmt.date(o.date)} · ${esc(o.vendorId ? NA.vendorName(o.vendorId) : 'Supplier not chosen')}${o.supplierRef ? ' · ' + esc(o.supplierRef) : ''}</div>
      <table><tr><th>Part no.</th><th>Part</th><th class="r">Qty</th>${priced ? '<th class="r">Unit cost</th><th class="r">Amount</th>' : ''}</tr>
      ${(o.lines || []).map((l) => `<tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="r">${num(l.qty)}</td>${priced ? `<td class="r">${l.unitCost != null ? fmt.money(l.unitCost) : ''}</td><td class="r">${l.unitCost != null ? fmt.money(num(l.qty) * num(l.unitCost)) : ''}</td>` : ''}</tr>`).join('')}
      ${priced ? `<tr><th colspan="4" class="r">Total</th><th class="r">${fmt.money(o.total)}</th></tr>` : ''}</table>
      <div class="sig"><div>Asked for by ${esc(o.requestedBy || '')}</div><div>${o.approval && o.approval.status === 'approved' && o.approval.by ? 'Approved by ' + esc(o.approval.by) : 'Approved by'}</div></div>`);
  }
  function printReorder(lines) {
    const priced = canCost();
    const L = lines.map((l) => ({ p: NA.get('parts', l.partId), qty: l.qty, cost: l.unitCost })).filter((x) => x.p);
    ui.print('Parts to order', `<h1>Parts to order</h1><div class="muted">${fmt.date(NA.today())} · ${L.length} line${L.length === 1 ? '' : 's'}</div>
      <table><tr><th>Part no.</th><th>Part</th><th class="r">Free</th><th class="r">Reorder at</th><th class="r">Order</th>${priced ? '<th class="r">Unit cost</th><th class="r">Amount</th>' : ''}</tr>
      ${L.map((x) => `<tr><td>${esc(x.p.sku)}</td><td>${esc(x.p.name)}</td><td class="r">${free(x.p)}</td><td class="r">${num(x.p.reorderLevel)}</td><td class="r">${x.qty}</td>${priced ? `<td class="r">${fmt.money(x.cost)}</td><td class="r">${fmt.money(x.qty * num(x.cost))}</td>` : ''}</tr>`).join('')}</table>
      <div class="sig"><div>Prepared by</div><div>Approved by</div></div>`);
  }

  /* After a decision (runs in the approver's browser) */
  if (A) {
    A.onDecide('stock_adjust', (a, decision) => {
      if (a.refC !== 'parts' || decision !== 'approved') return;
      const p = NA.get('parts', a.refId); if (!p) return;
      if ((p.stockLog || []).some((m) => m.approvalId === a.id)) return;      // already applied
      // Only the part's latest count is applied: an older one it replaced (still open when someone else could not
      // withdraw it) would count the same difference twice.
      const latest = A.find('parts', p.id, 'stock_adjust');
      if (latest && latest.id !== a.id) {
        NA.log(`Stock count ${p.sku} (${a.title || ''}) approved but not applied: a newer count replaced it`, { link: '#/parts?q=' + encodeURIComponent(p.sku), kind: 'warn' });
        return;
      }
      const d = a.data || {};
      applyAdjust(p.id, d, { by: d.by || a.requestedBy, byId: a.ownerId || null, approvedBy: a.decidedBy || NA.me().name, approvalId: a.id });
    });
    A.onDecide('po', (a, decision) => {
      if (a.refC !== 'partOrders') return;
      const o = NA.get('partOrders', a.refId);
      if (!o || o.status !== 'pending') return;
      const approval = { status: decision, by: a.decidedBy || NA.me().name, at: a.decidedAt || new Date().toISOString(), note: a.note || '', id: a.id };
      NA.update('partOrders', o.id, { status: decision === 'approved' ? 'approved' : 'draft', approval });
      NA.log(`Parts order ${o.code} ${decision === 'approved' ? 'approved' : decision === 'rejected' ? 'declined' + (a.note ? ' (' + a.note + ')' : '') + ' — back to draft' : 'request withdrawn — back to draft'}`,
        { rec: NA.get('partOrders', o.id), link: '#/parts?tab=orders', kind: decision === 'approved' ? 'success' : 'warn' });
    });
  }

  /* A count asked by someone who may not see costs (the service desk) reaches the Managing Director without its value:
     the office server keeps part costs from them. The Managing Director's browser fills it in from the part's cost, so
     Approvals and Today show what is being written off. Nothing is written once it is filled, or when the cost is unknown. */
  NA.on('rendered', () => {
    if (!A || NA.preview || !NA.isRole('owner') || !NA.db || !Array.isArray(NA.db.approvals)) return;
    let filled = 0;
    NA.db.approvals.forEach((a) => {
      if (a.type !== 'stock_adjust' || a.refC !== 'parts' || a.status !== 'pending' || num(a.amount) > 0 || !a.data) return;
      const p = NA.get('parts', a.refId);
      const value = p && p.cost != null ? Math.abs(Math.round(num(a.data.delta))) * num(p.cost) : 0;
      if (value > 0) { NA.update('approvals', a.id, { amount: value, value }); filled++; }
    });
    if (filled && typeof NA.refresh === 'function') NA.refresh();
  });

  /* Cross-module actions */
  NA.actions.newPart = () => editPart(null);
  /** Stock comes in through a parts order: receive the open order for this part, or start one. */
  NA.actions.stockInPart = (partId) => {
    const o = (NA.db.partOrders || []).find((x) => x.status === 'ordered' && (!partId || (x.lines || []).some((l) => l.partId === partId && num(l.received) < num(l.qty))));
    if (o && canStock()) return receiveOrder(o);
    if (partId) return orderParts([partId]);
    return NA.go('#/parts?tab=orders');
  };
  NA.actions.partsReorderList = () => orderParts();
  NA.actions.orderParts = (partIds) => orderParts(partIds);
})();
