/* ==========================================================================
   How we work — the NAIL business process flowchart as a training map.
   Five flows (Leads, Sales, Purchasing, After-sales, Office) with the steps
   from the owner's flowchart and, inline between the steps, every approval
   the app now asks for (small amber markers) plus the "Accounts confirms
   the money" check before the VIN. Click a step or a marker: a card opens
   under it with what happens, who does it, what must be true first, and a
   button to the screen where it is done. Below the flows: "Who does what"
   (each role in NA.ROLES) and "Who approves what" (the live NA.policy()).
   Numbers are live and only count what this person may see.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;

  function injectCss() {
    if (typeof document === 'undefined' || !document.head || !document.getElementById || document.getElementById('css-process')) return;
    const s = document.createElement('style');
    s.id = 'css-process';
    s.textContent = `
      .pm-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; margin-bottom: 28px; }
      .pm-bar .pill-tabs { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
      .pm-bar .pill-tabs::-webkit-scrollbar { display: none; }
      .pm-bar .pill-tabs button { flex: none; white-space: nowrap; }
      .pm-bar-side { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .pm-sections { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
      .pm-sec-head { display: flex; align-items: flex-start; gap: 16px; padding: 22px 24px 2px; }
      .pm-sec-head h2, .pm-over h2, .pm-block-head h2 { font-size: 21px; font-weight: 600; letter-spacing: -.02em; line-height: 1.2; }
      .pm-sec-head p, .pm-over > p, .pm-block-head p { margin-top: 4px; font-size: 14px; color: var(--muted); }
      .pm-sec-meta { margin-left: auto; display: flex; align-items: center; gap: 10px; flex: none; font-size: 13px; color: var(--muted); }
      .pm-sec-body { padding: 18px 24px 26px; display: flex; flex-direction: column; gap: 26px; }
      .pm-lane-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
      .pm-lane-title .ico { color: var(--muted-2); }
      .pm-lane-sub { font-weight: 400; color: var(--muted); }
      .pm-lane.branch, .pm-lane.exception, .pm-lane.emergency { padding: 16px 16px 18px; border-radius: 14px; background: var(--fill-3); }
      .pm-lane.exception .pm-lane-title .ico { color: var(--red); }
      .pm-lane.emergency .pm-lane-title .ico { color: var(--amber); }
      .pm-lane-note { display: flex; gap: 6px; align-items: flex-start; margin-top: 12px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
      .pm-lane-note .ico { flex: none; margin-top: 1px; color: var(--muted-2); }
      .pm-row { display: flex; flex-wrap: wrap; align-items: stretch; row-gap: 10px; }
      .pm-row.is-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 12px; }
      .pm-opt { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .pm-opt .pm-gate { align-self: flex-start; }
      .pm-node { flex: 1 1 148px; max-width: 250px; min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 13px 14px 12px; border: 0; border-radius: 13px; background: var(--fill-3); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background .15s var(--ease), box-shadow .15s var(--ease), opacity .2s var(--ease); }
      .pm-opt .pm-node { flex: 1 1 auto; max-width: none; }
      .pm-node:hover { background: var(--fill-2); }
      .pm-lane.branch .pm-node, .pm-lane.exception .pm-node, .pm-lane.emergency .pm-node { background: var(--surface); box-shadow: var(--shadow-sm); }
      .pm-lane.branch .pm-node:hover, .pm-lane.exception .pm-node:hover, .pm-lane.emergency .pm-node:hover { box-shadow: var(--shadow); }
      .pm-lane .pm-node.sel, .pm-lane .pm-node.sel:hover { background: var(--tint-soft); box-shadow: inset 0 0 0 2px var(--tint); }
      .pm-node .pn-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
      .pm-node .pn-ico { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: none; background: var(--surface); color: var(--ink-2); box-shadow: var(--shadow-sm); }
      .pm-lane.branch .pn-ico, .pm-lane.exception .pn-ico, .pm-lane.emergency .pn-ico { background: var(--fill-2); box-shadow: none; }
      .pm-node.goal .pn-ico { color: var(--green); }
      .pm-node.decision .pn-ico { transform: rotate(45deg); border-radius: 7px; }
      .pm-node.decision .pn-ico .ico { transform: rotate(-45deg); }
      .pm-node.sel .pn-ico { color: var(--tint); }
      .pm-node .pn-num { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted-2); font-variant-numeric: tabular-nums; }
      .pm-node .pn-title { font-size: 13.5px; font-weight: 600; line-height: 1.25; letter-spacing: -.01em; }
      .pm-node .pn-tags { font-size: 12px; line-height: 1.35; color: var(--muted); }
      .pm-node .pn-who { display: flex; gap: 5px; align-items: flex-start; font-size: 12px; line-height: 1.35; color: var(--ink-2); }
      .pm-node .pn-who .ico { flex: none; margin-top: 1px; color: var(--muted-2); }
      .pm-node .pn-who.you, .pm-node .pn-who.you .ico { color: var(--tint); }
      .pm-node .pn-count { margin-top: auto; padding-top: 6px; display: flex; align-items: baseline; gap: 5px; font-size: 12px; color: var(--muted); }
      .pm-node .pn-count b { font-size: 16px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
      .pm-node .pn-count.live b { color: var(--ink); }
      .pm-arrow { flex: none; width: 26px; display: grid; place-items: center; color: var(--muted-2); }
      .pm-gates { flex: none; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 6px; }
      .pm-gate { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 11px 4px 8px; border: 0; border-radius: 999px; background: var(--amber-50); color: var(--amber); font: inherit; font-size: 12.5px; font-weight: 600; line-height: 1.2; text-align: left; cursor: pointer; transition: box-shadow .15s var(--ease), opacity .2s var(--ease); }
      .pm-gate.is-money { background: var(--green-50); color: var(--green); }
      .pm-gate:hover { box-shadow: inset 0 0 0 1px currentColor; }
      .pm-gate.sel { box-shadow: inset 0 0 0 2px currentColor; }
      .pm-gate .pg-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; background: var(--amber-solid); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; }
      .pm-gate.is-money .pg-n { background: var(--green-solid); }
      .pm-dim .pm-node:not(.hl):not(.sel), .pm-dim .pm-gate:not(.hl):not(.sel) { opacity: .32; }
      .pm-rule { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 14px; background: var(--fill-3); font-size: 13.5px; line-height: 1.45; }
      .pm-rule > .ico { flex: none; margin-top: 1px; color: var(--muted); }
      .pm-over { padding: 22px 24px 20px; margin-bottom: 24px; }
      .pm-over-rows { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
      .pm-over-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .pm-over-label { width: 92px; flex: none; font-size: 13px; font-weight: 500; color: var(--muted); }
      .pm-over-row .pm-arrow { width: 18px; }
      .pm-mini { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--fill-2); color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background .15s var(--ease); }
      .pm-mini:hover { background: var(--fill); }
      .pm-mini.meet { background: var(--tint-soft); color: var(--tint); }
      .pm-mini.is-money { background: var(--green-50); color: var(--green); }
      .pm-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; margin-top: 20px; padding-top: 16px; border-top: .5px solid var(--line-2); font-size: 12.5px; color: var(--muted); }
      .pm-legend span { display: inline-flex; align-items: center; gap: 8px; }
      .pm-legend i { display: inline-grid; place-items: center; width: 22px; height: 16px; border-radius: 5px; background: var(--fill); font-style: normal; }
      .pm-legend i.d { width: 11px; height: 11px; margin: 0 5px; border-radius: 3px; transform: rotate(45deg); }
      .pm-legend i.g { width: 28px; height: 20px; border-radius: 999px; background: var(--amber-50); color: var(--amber); }
      .pm-legend i.c { width: 28px; height: 20px; border-radius: 999px; background: var(--green-50); color: var(--green); }
      .pm-detail { margin-top: 14px; padding: 22px 24px 20px; box-shadow: var(--shadow); }
      .pm-d-head { display: flex; gap: 14px; align-items: flex-start; }
      .pm-d-ico { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--fill); color: var(--ink-2); }
      .pm-d-ico.gate { background: var(--amber-solid); color: #fff; }
      .pm-d-ico.is-money { background: var(--green-solid); color: #fff; }
      .pm-d-head h3 { margin-top: 2px; font-size: 20px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
      .pm-d-tags { margin-top: 3px; font-size: 13px; color: var(--muted); }
      .pm-d-head .icon-btn { flex: none; margin: -4px -8px 0 0; }
      .pm-d-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 0 36px; margin-top: 6px; }
      .pm-detail h4 { margin: 18px 0 8px; font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--muted); }
      .pm-d-what { font-size: 14px; line-height: 1.55; color: var(--ink-2); }
      .pm-d-fc { margin-top: 14px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
      .pm-detail .callout { margin-top: 14px; }
      .pm-who-list { display: flex; flex-wrap: wrap; gap: 8px; }
      .pm-person { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px 0 9px; border-radius: 999px; background: var(--fill-2); font-size: 13px; font-weight: 500; }
      .pm-person .ico { color: var(--muted); }
      .pm-person.you { background: var(--tint-soft); color: var(--tint); }
      .pm-person.you .ico { color: var(--tint); }
      .pm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .pm-list li { display: flex; gap: 9px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; }
      .pm-list li .ico { flex: none; margin-top: 1px; color: var(--muted-2); }
      .pm-list.ok li .ico { color: var(--green); }
      .pm-tiers { padding: 2px 14px; border-radius: 12px; background: var(--fill-3); }
      .pm-tier { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; font-size: 13.5px; }
      .pm-tier + .pm-tier { border-top: .5px solid var(--line-2); }
      .pm-tier span { color: var(--muted); }
      .pm-tier b { font-weight: 600; text-align: right; }
      .pm-d-foot { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 22px; padding-top: 16px; border-top: .5px solid var(--line-2); }
      .pm-live { display: flex; align-items: baseline; gap: 8px; }
      .pm-live b { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
      .pm-live span { font-size: 13px; color: var(--muted); }
      .pm-d-nav { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .pm-block { margin-top: 40px; }
      .pm-block-head { margin: 0 0 16px; }
      .pm-roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
      .pm-role.me { box-shadow: var(--shadow-sm), inset 0 0 0 2px var(--tint); }
      .pm-role .gl-main small, .pm-ap .gl-main small { line-height: 1.45; }
      .pm-ap .gl-main small + small { margin-top: 3px; }
      .pm-k { display: block; font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
      .pm-show { color: var(--tint); font-weight: 500; }
      @media (max-width: 900px) { .pm-roles, .pm-d-grid { grid-template-columns: 1fr; } }
      @media (max-width: 560px) {
        .pm-sec-head { flex-wrap: wrap; padding: 18px 18px 2px; }
        .pm-sec-meta { margin-left: 0; }
        .pm-sec-body { padding: 14px 18px 20px; }
        .pm-over, .pm-detail { padding: 18px; }
        .pm-over-label { width: 100%; }
        .pm-row { flex-direction: column; }
        .pm-row > .pm-node { flex: none; max-width: none; }
        .pm-row > .pm-arrow { width: 100%; height: 22px; }
        .pm-row > .pm-arrow .ico { transform: rotate(90deg); }
        .pm-row > .pm-gates { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; }
        .pm-d-nav { margin-left: 0; width: 100%; justify-content: space-between; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- who does a step ----------
     Steps name sign-in roles (keys of NA.ROLES) or one of these other parties. The Managing Director may do
     everything, so 'owner' is only listed where the step is really theirs. */
  const ACTORS = {
    system: { label: 'The app, by itself', icon: 'bolt' },
    anyone: { label: 'Anyone', icon: 'users' },
    bank: { label: 'The customer’s bank', icon: 'bank' },
    byd: { label: 'BYD', icon: 'building' },
    cgrunner: { label: 'CG Runner', icon: 'truck' },
  };
  const ROLE_ICON = { owner: 'briefcase', sales_manager: 'users', sales: 'user', accounts: 'wallet', procurement: 'cart', service_manager: 'shield', service: 'wrench', hr: 'hr' };
  const isRoleKey = (k) => !!(NA.ROLES && NA.ROLES[k]);
  const whoLabel = (k) => (isRoleKey(k) ? NA.roleLabel(k) : (ACTORS[k] || { label: k }).label);
  const whoIcon = (k) => ROLE_ICON[k] || (ACTORS[k] || {}).icon || 'user';
  const roleKeys = () => NA.ROLE_KEYS || Object.keys(NA.ROLES || {});
  const val = (x) => (typeof x === 'function' ? x() : x);
  const M = (n) => NA.fmt.money(n);
  const AP = () => NA.approvals || null;

  /* ---------- approvals: who decides, from the live rules (Settings → Approval rules) ---------- */
  const partsLimit = () => { const v = NA.policy().partsOrderLimit; return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : 100000; };
  /** Rows of [when, who decides] for one kind of approval ('money' = Accounts confirming customer money). */
  function decideRows(type, refC) {
    const p = NA.policy();
    const tier = (free, mgr, role) => [['Up to ' + M(free), 'No approval needed'], ['Up to ' + M(mgr), NA.roleLabel(role)], ['Above ' + M(mgr), NA.roleLabel('owner')]];
    if (type === 'money') return [['Every payment', 'Accounts or the Managing Director']];
    if (type === 'discount') return tier(p.discountFree, p.discountManager, 'sales_manager');
    if (type === 'expense') return tier(p.expenseFree, p.expenseAccounts, 'accounts');
    if (type === 'service_discount') return tier(p.serviceDiscountFree, p.serviceDiscountManager, 'service_manager');
    // No approval of its own: the approved purchase order covers its payments (an emergency purchase is approved on its own).
    if (type === 'vendor_payment') return [['Covered by', 'The approved purchase order'], ['Emergency purchase', NA.roleLabel('owner') + ' approves it first']];
    if (type === 'leave') return [['Every request', NA.roleLabel('hr')], [NA.roleLabel('hr') + '’s own leave', NA.roleLabel('owner')]];
    if (type === 'po' && p.poApproval === false) return [['Purchase orders', 'No approval needed (switched off)']];
    if (type === 'po' && refC === 'partOrders') return [['Up to ' + M(partsLimit()), 'No approval needed'], ['Above ' + M(partsLimit()), NA.roleLabel('owner')]];
    if (type === 'stock_adjust' && p.stockAdjustApproval === false) return [['Every change', 'No approval needed (switched off)']];
    const ap = AP();
    const roles = ap ? ap.approverRoles(type, 0).concat(ap.approverRoles(type, 1e12)).filter((r, i, a) => a.indexOf(r) === i) : ['owner'];
    return [['Every request', roles.map(NA.roleLabel).join(' or ')]];
  }
  /** One line for the "Who approves what" list. */
  function decideText(type) {
    if (type === 'po' && NA.policy().poApproval !== false) return `${NA.roleLabel('owner')} · parts orders only above ${M(partsLimit())}`;
    if (type === 'vendor_payment') return 'Covered by the approved purchase order · Accounts or the Managing Director pays';
    if (type === 'leave') return `${NA.roleLabel('hr')} (their own leave: ${NA.roleLabel('owner')})`;   // as on Approvals and Settings
    const rows = decideRows(type);
    return rows.length === 1 ? rows[0][1] : rows.map(([a, b]) => `${a}: ${/^No /.test(b) ? 'n' + b.slice(1) : b}`).join(' · ');
  }
  /** Does this role decide (or, for money, confirm) this kind? The Managing Director decides everything. */
  function decides(type, role) {
    role = role || NA.role();
    if (role === 'owner') return true;
    if (type === 'money') return NA.can('payments.verify', role);
    if (type === 'vendor_payment') return NA.can('vendor.pay', role);
    const ap = AP();
    return !!ap && (ap.approverRoles(type, 0).includes(role) || ap.approverRoles(type, 1e12).includes(role));
  }
  /** The roles that decide a kind (for 'money' and supplier payments: who confirms or pays). */
  const deciders = (type) => (type === 'money' || type === 'vendor_payment' ? ['accounts']
    : AP() ? AP().approverRoles(type, 0).concat(AP().approverRoles(type, 1e12)).filter((r, i, a) => a.indexOf(r) === i) : ['owner']);
  const decidedBy = (type) => deciders(type).map(NA.roleLabel).join(' or ');
  /** "the Sales Manager or Accounts", for use inside a sentence. */
  const people = (keys) => keys.map((k) => { const l = whoLabel(k); return /Director|Manager/.test(l) ? 'the ' + l : l; }).join(' or ');
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- live counts: the browser only holds the records this person may see ---------- */
  const B = NA.biz;
  const T = () => NA.today();
  const list = (name) => (NA.db && Array.isArray(NA.db[name]) ? NA.db[name] : []);
  const leadsAt = (...st) => list('leads').filter((l) => st.includes(l.stage)).length;
  /** Where an order really is (the saved stage can lag behind money confirmed on another screen). */
  const orderStage = (o) => (B.stageOf ? B.stageOf(o) : o.stage);
  const openOrders = () => list('orders').filter((o) => !['delivered', 'cancelled'].includes(o.stage));
  const ordersAt = (...st) => list('orders').filter((o) => st.includes(orderStage(o))).length;
  const isEm = (p) => p.type === 'emergency';
  /* Purchasing's rules live in procurement.js (NA.purchasing: stageOf, pctOf, urgentAsks, demand); it loads after this
     file, so look them up when counting. Their numbers only show to people who can open Purchasing, which needs
     procurement.js, so the plain fallbacks here never reach the screen. */
  const pur = (fn) => (NA.purchasing && typeof NA.purchasing[fn] === 'function' ? NA.purchasing[fn] : null);
  /** The stage an order's payments, VINs and arrivals have reached (the saved stage when Purchasing's rule is missing). */
  const poStage = (p) => { const f = pur('stageOf'); return f ? f(p) : p.stage; };
  const stdPO = (...st) => list('purchaseOrders').filter((p) => !isEm(p) && st.includes(poStage(p))).length;
  const emPO = (...st) => list('purchaseOrders').filter((p) => isEm(p) && st.includes(poStage(p))).length;
  const carStatus = (v) => (NA.stock && NA.stock.statusOf ? NA.stock.statusOf(v) : v.status);
  const veh = (...st) => list('vehicles').filter((v) => st.includes(carStatus(v))).length;
  const bankAt = (key) => openOrders().filter((o) => {
    if (o.channel !== 'Bank' || !o.bank) return false;
    const steps = (o.bank.steps || {});
    const k = NA.FLOW.bankSteps.findIndex((s) => !steps[s.key]);
    return k >= 0 && NA.FLOW.bankSteps[k].key === key;
  }).length;
  const bySource = (src) => list('leads').filter((l) => src.includes(l.source)).length;
  /** Models Purchasing's plan suggests ordering (its own "arriving" rule; core's demand without procurement.js). */
  const reorderModels = () => { try { const f = pur('demand'); return (f ? f() : B.demandByModel()).filter((d) => d.suggested > 0).length; } catch (e) { return 0; } };
  const jobsAt = (...st) => list('jobCards').filter((j) => st.includes(j.status)).length;
  const daysAgo = (iso) => (iso ? NA.daysBetween(String(iso).slice(0, 10), T()) : 9999);
  /** Approval requests of a kind still waiting for a decision (match: only those about one kind of record). */
  const waiting = (type, refC, match) => list('approvals').filter((a) => a.status === 'pending' && a.type === type && (!refC || a.refC === refC) && (!match || match(a))).length;
  /** The sales channel of the order an approval is about ('' when this person cannot see the order). */
  const orderChannel = (a) => ((a.refC === 'orders' && NA.get('orders', a.refId)) || {}).channel || '';
  /** Customer money handed in and not yet confirmed by Accounts. */
  const toConfirm = (fn) => list('payments').filter((p) => B.paymentPending(p) && (!fn || fn(p))).length;
  /* The advance share. Settings holds today's share; each order keeps the share it was raised with (Purchasing's pctOf). */
  const share = (x) => { const n = Number(x); return n > 0 && n < 1 ? n : 0; };
  const advShareToday = () => share(NA.db && NA.db.settings && NA.db.settings.advancePct) || 0.3;
  const pctTxt = (x) => +(Number(x) * 100).toFixed(1) + '%';
  const advShareOf = (p) => { const f = pur('pctOf'); return f ? f(p) : share(p.advancePct) || advShareToday(); };
  const isAdvPay = (v) => /^advance/i.test(v.kind || '');
  const advPays = (p) => list('vendorPayments').filter((v) => v.poId === p.id && isAdvPay(v));
  /** Approved purchase orders whose advance is not paid yet (Purchasing's "due now" rule). The approval is read as core
      and Purchasing read it (B.poApproval uses NA.purchasing.approvalOf). */
  const advanceDue = () => list('purchaseOrders').filter((p) => {
    if (isEm(p) || poStage(p) === 'cancelled' || B.poApproval(p) !== 'approved') return false;
    const need = Math.round(B.poTotal(p) * advShareOf(p));
    const paid = advPays(p).filter(B.vendorPaymentLive).reduce((s, v) => s + (Number(v.amount) || 0), 0);
    return need > 0 && paid < need - 1;
  }).length;
  /** Orders where sales asked for an emergency car and nobody has started a purchase yet: Purchasing's own list. */
  const urgentAsks = () => { const f = pur('urgentAsks'); return f ? f().length : null; };
  /* After-sales rules live in service.js (NA.service); it loads after this file, so look them up when counting. */
  const svc = (fn) => (NA.service && typeof NA.service[fn] === 'function' ? NA.service[fn] : null);
  const claimsAt = (...st) => { const f = svc('claimRows'); return f ? f().filter((r) => st.includes(r.status)).length : 0; };
  const readyJobs = () => { const ph = svc('phase'); return list('jobCards').filter((j) => (ph ? ph(j) === 'ready' : ['completed', 'invoiced'].includes(j.status))).length; };
  /** Jobs still with us: in the workshop, or ready to bill and hand back (not handed back, closed or cancelled). */
  const jobLive = (j) => { const ph = svc('phase'); return ph ? ['workshop', 'ready'].includes(ph(j)) : ['open', 'in_progress', 'completed'].includes(j.status); };
  /** Jobs not billed yet whose customer still has to agree the estimate, or agree again because the bill grew by more
      than 10% (Service's rule, NA.service.estimateState). No number without it. */
  const estimateWaiting = () => { const f = svc('estimateState'); return f ? list('jobCards').filter((j) => ['open', 'in_progress', 'completed'].includes(j.status) && ['needed', 'risen'].includes(f(j))).length : null; };
  /** Finished jobs still to bill. Service's nextStep closes our own cars' jobs ('close') instead of billing them; any
      other next step (the bill, or first asking to approve a discount or free work) still ends in a bill. */
  const toBill = () => { const ns = svc('nextStep'); return list('jobCards').filter((j) => j.status === 'completed' && (!ns || ns(j).act !== 'close')).length; };
  const SINGULAR = { leads: 'lead', 'test drives': 'test drive', 'quotes out': 'quote out', 'open orders': 'open order', 'company orders': 'company order',
    'refunds due': 'refund due', 'models to reorder': 'model to reorder', 'advances due': 'advance due', 'demo cars': 'demo car', 'free jobs': 'free job',
    'paid jobs': 'paid job', 'calls due': 'call due', 'licences due in 60 days': 'licence due in 60 days', 'payments to confirm': 'payment to confirm' };
  /** A live number and its words (none when the rule behind it is missing). */
  const c = (n, label) => (n == null ? null : { n, label: n === 1 && SINGULAR[label] ? SINGULAR[label] : label });

  /* ---------- the process, as data ----------
     A lane lists steps and approval markers in the order they happen.
     step: { id, title, icon, tags, fc (its name in the flowchart), what, who: [role keys or ACTORS], records: [...],
             needs: [...] (what must be true first), rule, tip, href, go (screen name), count: () => ({ n, label }),
             kind: 'decision' | 'goal', action / actionPerm / actionLabel (an NA.actions form that starts the step),
             doAt: { role: [href, screen name] } (where a doer who cannot open href does it, e.g. a consultant on Today) }
     gate: { id, gate: a kind of NA.APPROVALS or 'money', refC, match: (approval) => bool (counts only these), title,
             short (marker label), what, who (who asks), ask, blocks (what waits for it), href, go,
             see (the screen whose records it is about), whoHead / foot / badge (when it is not a plain approval) }
     Both: opens: () => bool (the tab behind href exists for this person: People → Leave is Admin & HR's), and
           counts: () => bool (the records behind the number reach this person). Without them, seeing the screen is enough.
     Text may be a function, so the limits always come from the live approval rules and Settings. */
  const S = {};
  const step = (o) => (S[o.id] = o);
  const gate = (o) => (S[o.id] = Object.assign({ isGate: true }, o));

  /* The bank's own steps (from NA.FLOW), with the Managing Director's "car before the bank pays" after the sanction letter. */
  const BANK_TEXT = {
    application: ['Loan application', 'file-text', 'The customer applies', 'The customer applies for a car loan at the bank. We help with the quote and the papers the bank asks for.'],
    approval: ['Bank approves', 'check-circle', 'The bank’s decision', 'The bank checks the customer and approves the loan amount.'],
    sanction: ['Sanction letter', 'mail', 'Letter from the bank', 'The bank issues its sanction letter. Record its number and the sanctioned amount on the order; the loan can’t be changed after that.'],
    documents: ['Bank documents', 'clipboard', 'Papers to the bank', 'The bank’s documents are completed and handed in: the quote, a copy of the invoice and the registration papers with the bank as co-owner.'],
    disbursement: ['Bank pays', 'wallet', 'Bank disbursement', 'The bank pays Noor Autos. Record it as a “Bank Disbursement” payment: this step only closes with that payment, and Accounts confirms it like any other money.'],
  };
  const BANK = [];
  NA.FLOW.bankSteps.forEach((b) => {
    const t = BANK_TEXT[b.key] || [b.label, 'bank', '', b.label];
    BANK.push(step({ id: 'b-' + b.key, title: t[0], icon: t[1], tags: t[2], fc: 'Bank finance path', what: t[3],
      who: b.key === 'disbursement' ? ['sales', 'accounts', 'bank'] : ['sales', 'bank'], records: ['The day this step was done'],
      href: '#/sales?channel=Bank', go: 'Orders', count: () => c(bankAt(b.key), 'waiting here') }));
    if (b.key === 'sanction') {
      BANK.push(gate({ id: 'g-credit-bank', gate: 'credit', match: (a) => orderChannel(a) === 'Bank', title: 'Car before the bank pays', short: 'Car before payment',
        what: 'Once the sanction letter is in, the consultant can ask the Managing Director to release the car before the bank’s money arrives.',
        who: ['sales'], ask: '“Release the car against the sanction letter” on the order.',
        blocks: 'Nothing else waits for it: without it, the VIN simply waits for 100% confirmed payment.', href: '#/sales?channel=Bank', go: 'Orders', see: 'sales' }));
    }
  });

  const SECTIONS = [
    {
      key: 'lead', title: 'Leads', icon: 'user-plus',
      intro: 'Stage 1. An enquiry becomes a lead, and the lead becomes a quote and then an order.',
      lanes: [
        { title: 'From the first call to the order', steps: [
          step({ id: 'l-new', title: 'New lead', icon: 'user-plus', tags: 'Name · Mobile · Source · Model', fc: 'CRM Lead Created',
            what: 'Type the customer’s name, mobile, where they heard about us and the BYD model they like. It takes under a minute. Before it is saved, the app checks the mobile across the whole company, so two consultants never chase the same person.',
            who: ['sales'], records: ['Name and mobile', 'Where they heard about us', 'Model they like', 'Consultant', 'Next follow-up date'],
            tip: () => `Call a new lead within ${NA.policy().firstContactHours} hours. After that it shows “Not contacted” in red.`,
            href: '#/leads?stage=new', go: 'Leads', action: 'newLead', actionPerm: 'leads.create', actionLabel: 'New lead', count: () => c(leadsAt('new'), 'new') }),
          step({ id: 'l-qual', title: 'Qualified', icon: 'filter', tags: 'Budget · How they pay · When', fc: 'Lead Qualification',
            what: 'Ask three questions: what is your budget, will you pay with your own money, a bank loan or through your company, and when do you want the car?',
            who: ['sales'], records: ['Budget', 'Own money, bank loan or company', 'When they want the car'],
            href: '#/leads?stage=qualified', go: 'Leads', count: () => c(leadsAt('qualified'), 'qualified') }),
          step({ id: 'l-eng', title: 'In touch', icon: 'message', tags: 'Call · WhatsApp · Email · Brochure', fc: 'Customer Engaged',
            what: 'Keep the conversation going: share brochures, prices and videos by WhatsApp or email. Log every call and message, so anyone can pick up where you left off.',
            who: ['sales'], records: ['Each call, message or email', 'Brochures sent', 'Next follow-up date'],
            rule: 'Every open lead has a next follow-up date, today or later.',
            href: '#/leads?stage=engaged', go: 'Leads', count: () => c(leadsAt('engaged'), 'in touch') }),
          step({ id: 'l-visit', title: 'Showroom visit', icon: 'store', tags: 'Date · Who met them · Models seen', fc: 'Showroom Visit',
            what: 'The customer comes to Uttara Showroom. Record the day, who looked after them and which models they saw.',
            who: ['sales'], records: ['Visit date', 'Consultant', 'Models seen'],
            href: '#/leads?stage=visit', go: 'Leads', count: () => c(leadsAt('visit'), 'visited') }),
          step({ id: 'l-td', title: 'Test drive', icon: 'steering', tags: 'Signed form · Driving licence', fc: 'Test Drive',
            what: 'Before the drive the customer signs the test-drive form and shows a driving licence. No form, no drive.',
            who: ['sales'], records: ['Form signed', 'Licence number and expiry', 'Car used'],
            needs: ['The test-drive form, signed by the customer', 'A driving licence that is valid on the day'],
            href: '#/leads?stage=testdrive', go: 'Leads', count: () => c(leadsAt('testdrive'), 'test drives') }),
          step({ id: 'l-opp', title: 'Quote given', icon: 'file-text', tags: 'Price · Discount · Validity', fc: 'Opportunity Created',
            what: 'Give the customer a numbered quote: the model’s list price, any discount, and how they will pay. The price comes from the price list; a consultant can only add a discount. Earlier versions of the quote stay on the lead.',
            who: ['sales'], records: ['Quote number (Q-…)', 'List price and discount', 'How they pay', 'Valid until'],
            tip: () => `A quote is valid for ${NA.policy().quoteValidDays} days. An expired quote can’t be printed or turned into an order; renew it at today’s price.`,
            href: '#/leads?stage=opportunity', go: 'Leads', count: () => c(leadsAt('opportunity'), 'quotes out') }),
          gate({ id: 'g-discount-q', gate: 'discount', refC: 'leads', title: 'Discount on the quote', short: 'Discount',
            what: 'A discount bigger than a consultant may give on their own needs a manager’s OK before the customer sees it.',
            who: ['sales'], ask: '“Ask for approval” on the quote. The request reaches whoever decides, in Approvals and on Today.',
            blocks: 'Printing or sending the quote, and making the order.', href: '#/leads?stage=opportunity', go: 'Leads', see: 'leads' }),
          step({ id: 'l-won', title: 'Make the order', icon: 'receipt', tags: 'The lead is won', kind: 'goal',
            what: 'When the customer says yes, “Make order” turns the quote into a sales order with the same price and the approved discount, and the lead is marked as won.',
            who: ['sales'], records: ['Sales order (SO-…)', 'Lead marked as won'],
            needs: ['The quote is still valid', 'The discount is approved, when it needed approval'],
            href: '#/leads?stage=won', go: 'Leads', count: () => c(leadsAt('won'), 'won') }),
        ] },
        { title: 'Where leads come from', sub: 'one of these', icon: 'globe', grid: true, steps: [
          step({ id: 'src-digital', title: 'Facebook and Google ads', icon: 'tag', tags: 'Messenger · Forms · Calls', what: 'People who answer an ad by Messenger, a form or a call. Pick the exact source, so the money spent on ads can be judged.', who: ['sales'], records: ['Source: Facebook Ads or Google Ads'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Facebook Ads', 'Google Ads']), 'leads') }),
          step({ id: 'src-walkin', title: 'Walk-in and WhatsApp', icon: 'store', tags: 'Showroom · Chat', what: 'People who walk into Uttara Showroom or send a WhatsApp message. Take their name and mobile before they leave.', who: ['sales'], records: ['Source: Walk-in or WhatsApp'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Walk-in', 'WhatsApp']), 'leads') }),
          step({ id: 'src-corp', title: 'Companies and referrals', icon: 'building', tags: 'Fleets · Word of mouth', what: 'Companies buying for their staff or fleet, and people sent by happy customers. Companies usually buy through the company path in Sales.', who: ['sales', 'sales_manager'], records: ['Source: Corporate or Referral', 'Company name'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Corporate', 'Referral']), 'leads') }),
          step({ id: 'src-events', title: 'Events', icon: 'star', tags: 'Test-drive days · Motor shows', what: 'Leads collected at EV test-drive days, motor shows and road shows.', who: ['sales'], records: ['Source: Event'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Event']), 'leads') }),
          step({ id: 'src-dealer', title: 'Dealers and partners', icon: 'briefcase', tags: 'Sub-dealers · Partner businesses', what: 'Customers introduced by partner businesses or sub-dealers.', who: ['sales_manager'], records: ['Source: Dealer / Partner'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Dealer / Partner']), 'leads') }),
          step({ id: 'src-web', title: 'Website', icon: 'globe', tags: 'Enquiry form · Chat', what: 'Enquiries from the website form or online chat.', who: ['sales'], records: ['Source: Website'], href: '#/leads', go: 'Leads', count: () => c(bySource(['Website']), 'leads') }),
        ] },
        { title: 'When the number is already someone else’s', kind: 'branch', icon: 'users', steps: [
          step({ id: 'l-dup', title: 'Number already taken', icon: 'search', tags: 'Checked across the company',
            what: 'If the mobile belongs to another consultant’s lead or customer, the app does not make a second one. It shows who has them and offers “Ask Sales Manager to hand over”.',
            who: ['sales'], records: ['Who already has the customer'], href: '#/leads', go: 'Leads' }),
          gate({ id: 'g-transfer', gate: 'transfer', title: 'Customer hand-over', short: 'Hand-over',
            what: 'Moving a lead or customer from one consultant to another needs the Sales Manager’s OK. Managers can open the existing record, or hand it over themselves.',
            who: ['sales'], ask: '“Ask Sales Manager to hand over”, in the warning about the number.',
            blocks: 'Making the duplicate. The customer stays with the first consultant until it is approved.', href: '#/leads', go: 'Leads', see: 'leads' }),
          step({ id: 'l-moved', title: 'Handed over', icon: 'swap', tags: 'The lead or customer moves',
            what: 'Once approved, the lead or customer moves to the consultant who asked. Orders already booked stay with the first consultant.',
            who: ['system'], records: ['Old and new consultant', 'Who approved'], href: '#/leads', go: 'Leads' }),
        ] },
        { title: 'When the customer says no', kind: 'exception', icon: 'x', steps: [
          step({ id: 'l-lost', title: 'Lost', icon: 'x', tags: 'Reason · Competitor',
            what: 'When the customer buys elsewhere or stops answering, mark the lead lost with a reason, plus the brand and model when they bought another car. Managers see the leads lost after a test drive or a quote under “Lost this week”.',
            who: ['sales'], records: ['Reason', 'Competitor brand and model'],
            href: '#/leads?stage=lost', go: 'Leads', count: () => c(list('leads').filter((l) => l.stage === 'lost' && daysAgo(l.lostAt || l.updatedAt) <= 7).length, 'lost this week') }),
        ] },
      ],
    },
    {
      key: 'sales', title: 'Sales', icon: 'receipt',
      intro: 'Stage 2. From the order to the customer driving away.',
      lanes: [
        { title: 'From the order to the handover', steps: [
          step({ id: 's-channel', title: 'How they pay', icon: 'tag', tags: 'Own money · Bank loan · Company', fc: 'Customer Channel', kind: 'decision',
            what: 'Choose how the customer buys. Retail customers pay with their own money. Bank-loan customers follow the bank path below. Companies confirm with their purchase order, award letter or letter of intent instead of booking money.',
            who: ['sales'], records: ['How they pay, on the order'], href: '#/sales', go: 'Orders', count: () => c(openOrders().length, 'open orders') }),
          step({ id: 's-booking', title: 'Booked', icon: 'receipt', tags: 'Money receipt · No car kept yet', fc: 'Booking Confirmed',
            what: 'The order is booked when the booking money is recorded and its money receipt (MR-…) is printed. A demo car may be shown for reference; it is not the customer’s car. The price is the model’s list price: a consultant can only give a discount, and a manager may raise the price but never lower it.',
            who: ['sales'], records: ['Sales order (SO-…)', 'Money receipt (MR-…)', 'List price and discount'],
            href: '#/sales?stage=booking', go: 'Orders', action: 'newOrder', actionPerm: 'orders.create', actionLabel: 'New order', count: () => c(ordersAt('booking'), 'booked') }),
          step({ id: 's-payment', title: 'Waiting for payment', icon: 'wallet', tags: 'Cash · RTGS · Cheque · Instalments', fc: 'Payment in Progress',
            what: 'Record every payment the day it arrives: cash, RTGS, cheque, pay order or the bank’s disbursement. Each one waits for Accounts to confirm it, and only confirmed money counts towards “fully paid”. Cash or a transfer that Accounts records itself counts at once.',
            who: ['sales', 'accounts'], records: ['Amount, method and reference', 'Receipt number', 'Who took the money'],
            rule: 'Consultants can enter money received in the last 3 days. A cheque or transfer number used before gets a warning.',
            tip: 'New → Customer payment works from any screen.',
            href: '#/sales?stage=payment', go: 'Orders', action: 'recordPayment', actionPerm: 'payments.record', actionLabel: 'Record a payment', count: () => c(ordersAt('payment'), 'collecting') }),
          gate({ id: 'g-money', gate: 'money', title: 'Accounts confirms the money', short: 'Money confirmed',
            what: 'Accounts checks every payment: cash handed over, cheque cleared, transfer seen in the bank. Until then it shows as “Waiting for Accounts”. A bounced cheque stops counting, and the consultant gets a follow-up to collect it again.',
            who: ['sales'], ask: 'Nothing to ask: every payment the sales team records lands in Approvals → Money to confirm. Accounts can also confirm it on the order.',
            blocks: 'The VIN. A car gets its VIN only after 100% of the money is confirmed.', href: '#/approvals?tab=money', go: 'Approvals', see: 'sales',
            count: () => c(toConfirm((p) => !!p.orderId), 'to confirm') }),
          gate({ id: 'g-discount-o', gate: 'discount', refC: 'orders', title: 'Discount on the order', short: 'Discount',
            what: 'A discount above the consultant’s limit needs a manager’s OK. A discount already approved on the quote counts. Raising it later needs a new OK.',
            who: ['sales'], ask: '“Ask for approval” on the order.', blocks: 'The VIN and the handover. Payments can go on in the meantime.', href: '#/sales', go: 'Orders', see: 'sales' }),
          step({ id: 's-vin', title: 'Give the VIN', icon: 'key', tags: '100% confirmed · The real car is linked', fc: 'Full Payment: VIN Assigned', kind: 'goal',
            what: 'When 100% is confirmed, the Sales Manager or Accounts gives the order a real car from stock, oldest paid order first. Cars on hold or that failed the arrival check are not offered. A different colour needs the customer’s agreement, which is recorded.',
            who: ['sales_manager', 'accounts'], records: ['VIN linked to the order', 'Car marked as sold', 'Who gave it'],
            needs: ['100% of the money confirmed by Accounts, or the Managing Director approved the car before full payment', 'The discount approved, when it needed approval', 'No cancellation waiting', 'For a company: its purchase order on file'],
            tip: 'No car in stock? “Ask Purchasing for an emergency car” on the order starts an emergency purchase.',
            href: '#/sales?stage=vin', go: 'Orders', count: () => c(ordersAt('vin'), 'ready for a VIN') }),
          step({ id: 's-brta', title: 'Registration', icon: 'id-card', tags: 'Customer name · Insurance · Bank as co-owner', fc: 'BRTA Registration',
            what: 'File the registration with BRTA in the customer’s name, with insurance, and with the bank as co-owner when there is a loan. Enter the registration number when BRTA issues it.',
            who: ['sales'], records: ['Filed date', 'Insurer and policy number', 'Bank as co-owner', 'Registration number'], needs: ['A VIN given to the order'],
            href: '#/sales?stage=brta', go: 'Orders', count: () => c(ordersAt('brta'), 'at BRTA') }),
          step({ id: 's-delivery', title: 'Hand over the car', icon: 'car', tags: 'Checklist · Gate pass · Signature', fc: 'Vehicle Delivery', kind: 'goal',
            what: 'Go through the handover checklist, print the numbered gate pass, show the customer the car and get the signed acknowledgement. Handing over starts the warranty, makes the invoice and books the follow-up calls, all by itself.',
            who: ['sales', 'sales_manager'], records: ['Handover form and signed acknowledgement', 'Gate pass (GP-…)', 'Handover date'],
            needs: ['A VIN given', 'Paid in full and confirmed, or released early by the Managing Director', 'The car passed its inspection and is not on hold', 'Registration number and insurance recorded'],
            href: '#/sales?stage=delivery', go: 'Orders', count: () => c(ordersAt('delivery'), 'ready to hand over') }),
        ] },
        { rule: 'A car gets its VIN only after Accounts confirms 100% of the money, or when the Managing Director approves giving it earlier.' },
        { title: 'How they pay', sub: 'one of these', icon: 'tag', grid: true, steps: [
          step({ id: 'ch-retail', title: 'Own money', icon: 'wallet', tags: 'Retail', what: 'The customer pays the booking money and the rest themselves, in one or more payments.', who: ['sales'], records: ['Booking money', 'Each payment'], href: '#/sales?channel=Retail', go: 'Orders', count: () => c(openOrders().filter((o) => o.channel === 'Retail').length, 'open') }),
          step({ id: 'ch-bank', title: 'Bank loan', icon: 'bank', tags: 'Bank finance', what: 'The customer pays their share, and the bank pays the rest after its own steps (see the bank path below).', who: ['sales'], records: ['Bank and branch', 'Sanctioned amount', 'Bank steps'], href: '#/sales?channel=Bank', go: 'Orders', count: () => c(openOrders().filter((o) => o.channel === 'Bank').length, 'open') }),
          step({ id: 'ch-corp', title: 'Company', icon: 'building', tags: 'Corporate', what: 'A company confirms the order with its purchase order, award letter or letter of intent instead of booking money. The car still needs full payment, or the Managing Director’s OK to release it earlier.', who: ['sales', 'sales_manager'], records: ['Document type and number'], href: '#/sales?channel=Corporate', go: 'Orders', count: () => c(openOrders().filter((o) => o.channel === 'Corporate').length, 'open') }),
        ] },
        { title: 'Bank loan path', kind: 'branch', icon: 'bank', note: 'If the bank turns the loan down, switch the order to own money or cancel it. A loan stuck on one step for more than 7 days shows on Today.', steps: BANK },
        { title: 'Company orders', kind: 'branch', icon: 'building', note: 'No booking money: the company’s document confirms the order.', steps: [
          step({ id: 'corp-doc', title: 'Company document', icon: 'file-text', tags: 'Purchase order · Award letter · Letter of intent', fc: 'Corporate orders',
            what: 'The company’s purchase order, award letter or letter of intent confirms the order. Record the document and its number on the order. Without it the order cannot get a VIN.',
            who: ['sales', 'sales_manager'], records: ['Document type', 'Reference number', 'Date'], href: '#/sales?channel=Corporate', go: 'Orders', count: () => c(openOrders().filter((o) => o.channel === 'Corporate').length, 'company orders') }),
          gate({ id: 'g-credit-corp', gate: 'credit', match: (a) => orderChannel(a) === 'Corporate', title: 'Car before full payment', short: 'Car before payment',
            what: 'Companies often pay after delivery. The Managing Director can approve giving the car before all the money is in.',
            who: ['sales'], ask: '“Ask to release the car before full payment” on the order, once the company’s document is on it.',
            blocks: 'Without it, the VIN and the handover wait for 100% confirmed payment.', href: '#/sales?channel=Corporate', go: 'Orders', see: 'sales' }),
          step({ id: 'corp-collect', title: 'Collect after delivery', icon: 'wallet', tags: 'What the company still owes',
            what: 'When a car went out before full payment, the balance stays on the order and in Accounts under “Customers who owe”, sorted by age, until it is collected.',
            who: ['sales', 'accounts'], records: ['Each payment', 'Days outstanding'], href: '#/sales?stage=delivered', go: 'Orders' }),
        ] },
        { title: 'If the customer cancels', kind: 'exception', icon: 'x', steps: [
          step({ id: 's-cancel', title: 'Ask to cancel', icon: 'x', tags: 'Reason · Refund proposed',
            what: 'An order with no money and no car is cancelled at once, with a reason. Once money was received or a VIN given, the consultant asks the Managing Director, with the reason and the refund proposed.',
            who: ['sales'], records: ['Reason', 'Refund proposed'], href: '#/sales', go: 'Orders' }),
          gate({ id: 'g-cancel', gate: 'cancel', title: 'Cancel and refund', short: 'Cancel',
            what: 'Cancelling releases the car and may mean paying money back, so the Managing Director decides.',
            who: ['sales'], ask: '“Ask to cancel the order”, under More on the order.', blocks: 'While it waits, payments, the VIN and the handover are paused.', href: '#/sales', go: 'Orders', see: 'sales' }),
          step({ id: 's-carback', title: 'Car back to stock', icon: 'undo', tags: 'Or on hold',
            what: 'On approval the order is cancelled and its car goes back to stock. It goes on hold instead when it is registered, has more than 50 km or has a problem. The lead is marked lost (“Order cancelled”).',
            who: ['system'], records: ['Car available or on hold', 'Lead marked lost'], href: '#/sales?stage=cancelled', go: 'Orders', count: () => c(list('orders').filter((o) => o.stage === 'cancelled').length, 'cancelled') }),
          step({ id: 's-refund', title: 'Pay the refund', icon: 'wallet', tags: 'Refund voucher',
            what: 'The refund shows as due on the order. Accounts pays it out and records it there, and the voucher is kept with the order’s documents.',
            who: ['accounts'], records: ['Refund voucher (RF-…)', 'Date and method'], href: '#/sales?stage=cancelled', go: 'Orders',
            count: () => c(list('orders').filter((o) => o.refund && o.refund.status === 'due').length, 'refunds due') }),
        ] },
      ],
    },
    {
      key: 'proc', title: 'Purchasing', icon: 'cart',
      intro: 'Getting the right BYD cars into stock: on plan from BYD, or as an emergency purchase from CG Runner.',
      lanes: [
        { title: 'Ordering from BYD', steps: [
          step({ id: 'p-plan', title: 'Plan what to order', icon: 'chart', tags: 'Sales forecast · Open leads · History', fc: 'Demand Planning',
            what: 'The plan looks at hot leads, paid orders still waiting for a car, the last 90 days of sales and the cars in stock or on the way, and suggests how many of each model to order. The Sales Manager can read Purchasing too, but only Purchasing orders.',
            who: ['procurement', 'owner'], records: ['Suggested number per model'], href: '#/procurement?tab=plan', go: 'Purchasing', count: () => c(reorderModels(), 'models to reorder') }),
          step({ id: 'p-po', title: 'Purchase order', icon: 'file-text', tags: 'Models · Colours · Supplier quote', fc: 'Purchase Order',
            what: 'Purchasing raises the order to BYD with the models, the colours and the supplier’s quote (proforma invoice). Until it is approved, its printout says “DRAFT — not approved”.',
            who: ['procurement'], records: () => ['PO number (PO-…)', 'Supplier quote number', 'Cars and colours', `Advance share (${pctTxt(advShareToday())} today)`],
            href: '#/procurement?tab=pos&stage=po', go: 'Purchasing', action: 'newPO', actionPerm: 'po.manage', actionLabel: 'New purchase order', count: () => c(stdPO('po'), 'just ordered') }),
          gate({ id: 'g-po', gate: 'po', refC: 'purchaseOrders', title: 'Purchase order approval', short: 'Purchase order',
            what: 'A purchase order commits the company to the advance, so the Managing Director approves it first. An order the Managing Director raises is approved at once.',
            who: ['procurement'], ask: 'Sent for approval by itself when the order is saved. A declined order can be changed and sent again.',
            blocks: 'The advance, shipment batches and every payment on the order.', href: '#/procurement?tab=pos&stage=approval', go: 'Purchasing', see: 'procurement' }),
          step({ id: 'p-adv', title: 'Pay the advance', icon: 'wallet', tags: () => `${pctTxt(advShareToday())} of the order`, fc: 'PO + 30% Advance',
            what: () => `Accounts pays the advance (${pctTxt(advShareToday())} today; each order keeps its own share). The amount is filled in with what is due and can’t go above it, and a bank reference already used with this supplier is refused.`,
            who: ['accounts'], records: ['Advance payment and reference', 'Who paid'], needs: ['The purchase order approved'],
            href: '#/procurement?tab=payments', go: 'Purchasing', count: () => c(advanceDue(), 'advances due') }),
          step({ id: 'p-lot', title: 'Shipment batch', icon: 'boxes', tags: 'Batch · Cars · Status', fc: 'Vendor Lot Allocation',
            what: 'BYD allocates a batch. Purchasing records it and moves it on: shipped, at Chattogram port, at our warehouse. Each car then shows as on the way with the batch’s expected date, so the sales team knows when it is coming.',
            who: ['procurement'], records: ['Batch number', 'Cars in the batch', 'Expected date and status'], needs: ['The advance paid'],
            href: '#/procurement?tab=pos&stage=allocated', go: 'Purchasing', count: () => c(stdPO('allocated'), 'in a batch') }),
          gate({ id: 'g-vpay', gate: 'vendor_payment', title: 'Supplier payment', short: 'Supplier payment',
            what: 'Money only goes to a supplier inside an approved order: the advance, the final payment for each car, or 100% for an emergency purchase. Only Accounts or the Managing Director pay; Purchasing sees “Accounts pays this”.',
            who: ['accounts'], ask: 'Nothing extra to ask: the approved purchase order covers its payments.',
            blocks: 'Paying more than the order allows, or paying twice with the same reference.', href: '#/procurement?tab=payments', go: 'Purchasing', see: 'procurement',
            whoHead: 'Who pays', badge: ['Covered by the order', 'gray'], foot: 'Nothing about it appears in Approvals: Accounts pays in Purchasing → Payments.' }),
          step({ id: 'p-release', title: 'Final payment and VINs', icon: 'key', tags: () => `${pctTxt(1 - advShareToday())} per car · VIN received`, fc: '70% Per-Unit Release',
            what: () => `Accounts pays the rest of each car’s price (${pctTxt(1 - advShareToday())} today) for the cars in a batch, and BYD releases them. Purchasing then types or scans the VINs BYD sends.`,
            who: ['accounts', 'procurement'], records: ['Final payment for each car', 'VIN of each car'],
            href: '#/procurement?tab=pos&stage=releasing', go: 'Purchasing', count: () => c(stdPO('releasing'), 'paying the balance') }),
        ] },
        { title: 'Receiving the cars', steps: [
          step({ id: 'p-pdi', title: 'Arrival check', icon: 'clipboard-check', tags: 'VIN · Keys · Cable · Damage · Battery', fc: 'PDI & Receiving',
            what: 'When a car arrives, check that its VIN matches and go through the list: two keys, charging cable, manuals, no damage, battery health. A car that fails any item goes on hold.',
            who: ['procurement', 'service'], records: ['Each item passed or failed', 'Battery health', 'Who checked'],
            href: '#/inventory?tab=arriving', go: 'Vehicles', count: () => c(veh('pdi'), 'to check') }),
          step({ id: 'p-ware', title: 'In stock', icon: 'warehouse', tags: 'Gulshan Warehouse or Uttara Showroom', fc: 'Warehoused',
            what: 'The car is parked at Gulshan Warehouse or shown at Uttara Showroom. A purchase order is complete when every car on it has passed its arrival check. Cars in stock for 60, 90 and 180 days are flagged.',
            who: ['procurement'], records: ['Location', 'Days in stock'], needs: ['The car passed every item of the arrival check'],
            // Reports → Stock age: the Managing Director, the Sales Manager, Accounts and Purchasing (as reports.js shows it).
            tip: () => (NA.canSee('reports') && NA.isRole('owner', 'sales_manager', 'accounts', 'procurement') ? 'Reports → Stock age lists every car by how long it has been in stock.' : ''),
            href: '#/inventory?tab=available', go: 'Vehicles', count: () => c(veh('available', 'allocated', 'demo'), 'in stock') }),
          step({ id: 'p-avail', title: 'Ready to sell', icon: 'check-circle', tags: 'Available for sales orders', fc: 'Available for sales orders', kind: 'goal',
            what: 'An available car can go to a fully paid order for the same model, oldest paid order first. Sales staff see what is free and when more is coming; they never see what a car cost.',
            who: ['sales_manager', 'accounts'], records: ['Status: available'], needs: ['Not on hold', 'Not kept for another customer’s order'],
            href: '#/inventory?tab=available', go: 'Vehicles', count: () => c(veh('available'), 'available') }),
        ] },
        { title: 'Looking after the cars', icon: 'car', grid: true, steps: [
          step({ id: 'p-hold', title: 'Car on hold', icon: 'alert', tags: 'Not for sale',
            what: 'A car that failed its arrival check, came back from a cancelled order, or was damaged is put on hold and can’t be sold. Only Purchasing can release it, with a note of what was done: repaired, claim filed or accepted.',
            // Vehicles shows sellers only cars they can offer: no On hold tab.
            who: ['procurement'], records: ['Why it is on hold', 'How it was resolved'], href: '#/inventory?tab=hold', go: 'Vehicles', opens: () => !NA.isRole('sales'),
            count: () => c(veh('hold'), 'on hold') }),
          step({ id: 'p-move', title: 'Move a car', icon: 'gate', tags: 'Gulshan to Uttara · Gate pass',
            what: 'To move a car between Gulshan Warehouse and Uttara Showroom, record the gate pass, the driver and the day. The car shows as moving until someone at the other site presses “Received”. A transfer note can be printed.',
            who: ['procurement'], records: ['Gate pass number', 'Driver', 'From, to and when'], href: '#/inventory?tab=all', go: 'Vehicles',
            count: () => c(list('vehicles').filter((v) => v.move && v.move.status === 'moving').length, 'moving') }),
          step({ id: 'p-demo', title: 'Demo cars', icon: 'steering', tags: 'For test drives',
            what: 'Cars kept for test drives are marked as demo cars, so they are never offered to a customer’s order by mistake.',
            who: ['procurement', 'sales_manager'], records: ['Status: demo car'], href: '#/inventory?tab=demo', go: 'Vehicles', count: () => c(veh('demo'), 'demo cars') }),
        ] },
        { title: 'Emergency purchase from CG Runner', kind: 'emergency', icon: 'bolt', note: 'Only when a paying customer is waiting and the model or colour is not in stock or on the way.', steps: [
          step({ id: 'e-ask', title: 'Sales asks for a car', icon: 'bolt', tags: 'From a paid order',
            what: 'On a paid order with no car in stock or on the way, the consultant presses “Ask Purchasing for an emergency car”. Purchasing sees the request with the customer’s order.',
            who: ['sales'], records: ['Who asked and when', 'Model and colour'], href: '#/procurement?tab=emergency', go: 'Purchasing',
            doAt: { sales: ['#/sales?stage=vin', 'Orders'] }, count: () => c(urgentAsks(), 'asked') }),
          step({ id: 'e-check', title: 'Check availability', icon: 'search', tags: 'Call CG Runner', fc: 'Availability Check',
            what: 'Purchasing calls CG Runner and confirms they really have the exact model and colour, with its VIN.',
            who: ['procurement', 'cgrunner'], records: ['What CG Runner has'], href: '#/procurement?tab=emergency&stage=check', go: 'Purchasing',
            action: 'newEmergencyPO', actionPerm: 'po.manage', actionLabel: 'Emergency purchase', count: () => c(emPO('check'), 'checking') }),
          step({ id: 'e-confirmed', title: 'VIN and price', icon: 'key', tags: 'Emergency purchase order', fc: 'VIN Confirmed',
            what: 'Purchasing enters the VIN and the agreed price. The request shows the extra paid over the BYD price, how much the customer has paid, and any matching cars we already have or have coming.',
            who: ['procurement'], records: ['Emergency purchase order', 'VIN', 'Agreed price', 'The waiting order'], href: '#/procurement?tab=emergency&stage=confirmed', go: 'Purchasing',
            count: () => c(emPO('confirmed'), 'VIN confirmed') }),
          gate({ id: 'g-emergency', gate: 'emergency', refC: 'purchaseOrders', title: 'Emergency purchase approval', short: 'Emergency purchase',
            what: 'CG Runner is paid 100% up front, usually above the BYD price, so the Managing Director approves every emergency purchase.',
            who: ['procurement'], ask: 'Sent for approval by itself when Purchasing saves the VIN and price. Changing either asks again.',
            blocks: 'The 100% payment, and collecting the car.', href: '#/procurement?tab=emergency&stage=approval', go: 'Purchasing', see: 'procurement' }),
          step({ id: 'e-paid', title: 'Paid in full', icon: 'wallet', tags: 'Supplier bill recorded at once', fc: 'Full 100% Payment',
            what: 'Accounts pays CG Runner 100% and the supplier’s bill is recorded the same day.',
            who: ['accounts'], records: ['Full payment and reference', 'Supplier bill'], needs: ['The Managing Director approved the emergency purchase'],
            href: '#/procurement?tab=emergency&stage=paid', go: 'Purchasing', count: () => c(emPO('paid'), 'paid') }),
          step({ id: 'e-received', title: 'Arrival check', icon: 'clipboard-check', tags: 'Added to stock · Kept for the order', fc: 'PDI & Receive',
            what: 'Purchasing collects the car, runs the arrival check and adds it to stock. It is kept for the waiting customer’s order, so nobody else can take it.',
            who: ['procurement'], records: ['Arrival check', 'Car kept for the order'], href: '#/procurement?tab=emergency&stage=received', go: 'Purchasing',
            count: () => c(emPO('received'), 'received') }),
        ] },
      ],
    },
    {
      key: 'after', title: 'After-sales', icon: 'wrench',
      intro: 'Keeping every BYD on the road, and every customer coming back.',
      lanes: [
        { title: 'A visit to the workshop', steps: [
          step({ id: 'a-warranty', title: 'Warranty starts', icon: 'shield', tags: 'By itself at the handover', fc: 'Warranty Activated',
            what: 'The moment a car is handed over, the app creates its warranty with the VIN, the registration number and the expiry dates for the car and its battery.',
            who: ['system'], records: ['Warranty number (WR-…)', 'Start and expiry', 'Battery expiry and km limit'],
            href: '#/service?tab=warranties', go: 'Service', count: () => c(list('warranties').filter((w) => B.warrantyActive(w)).length, 'active') }),
          step({ id: 'a-booking', title: 'Service booking', icon: 'calendar', tags: 'Phone · WhatsApp · Website', fc: 'Service Booking',
            what: 'Book the visit: an inspection, maintenance or a warranty repair, on a day and at a time. Fridays and public holidays are closed. A booking can move to another day and keeps its number.',
            who: ['service'], records: ['Customer and car', 'Type of service', 'Day and time', 'How they booked'],
            href: '#/service?tab=bookings', go: 'Service', action: 'newServiceBooking', actionPerm: 'service.manage', actionLabel: 'Book a service',
            count: () => c(list('serviceBookings').filter((b) => b.status === 'booked').length, 'booked') }),
          step({ id: 'a-job', title: 'Check-in and job card', icon: 'clipboard', tags: 'Complaint · Odometer · Technician', fc: 'Workshop Job Card',
            what: 'When the car arrives, open a job card with the customer’s complaint and the odometer reading. A car can only have one open job card; a new complaint is added to it.',
            who: ['service'], records: ['Complaint and diagnosis', 'Odometer at check-in', 'Technician'],
            rule: 'The odometer is fixed at check-in. Anyone can raise it; only the Service Manager can lower it, with a reason.',
            href: '#/service?tab=jobs', go: 'Service', action: 'newJobCard', actionPerm: 'service.manage', actionLabel: 'New job card', count: () => c(jobsAt('open', 'in_progress'), 'in the workshop') }),
          step({ id: 'a-estimate', title: 'Customer agrees the estimate', icon: 'phone', tags: 'Paid jobs only',
            what: 'On a job the customer pays for, record how and when they agreed to the estimate before work starts, and again if the bill grows by more than 10%.',
            who: ['service'], records: ['How they agreed', 'When'], href: '#/service?tab=jobs', go: 'Service', count: () => c(estimateWaiting(), 'waiting for the customer’s OK') }),
          step({ id: 'a-parts', title: 'Work and parts', icon: 'cog-parts', tags: 'Parts held · Labour hours', fc: 'Spare Parts',
            what: 'Parts added to the job are held for it, so nobody else takes them, and leave stock when the work is done. The labour rate comes from Settings; only the Service Manager can change it on a job.',
            who: ['service'], records: ['Parts and quantities', 'Labour hours'], needs: ['For a paid job: the customer agreed the estimate'],
            href: '#/service?tab=jobs', go: 'Service', count: () => c(jobsAt('in_progress'), 'being repaired') }),
          step({ id: 'a-decide', title: 'Free or paid?', icon: 'tag', tags: 'The warranty check on the job card', fc: 'Warranty or paid?', kind: 'decision',
            what: 'The app checks this car’s warranty: the dates, the km and the battery cover (the higher of the job’s odometer and the car’s own reading counts). Covered work is free for the customer; everything else is paid. Wear items such as tyres, wipers and brake pads are flagged.',
            who: ['service'], records: ['Free under warranty, or paid'], href: '#/service?tab=jobs', go: 'Service' }),
        ] },
        { title: 'Who pays', sub: 'one of these', icon: 'tag', grid: true, steps: [
          gate({ id: 'g-warranty', gate: 'warranty_job', refC: 'jobCards', title: 'Free warranty work', short: 'Warranty job',
            what: 'Free work costs the company until BYD pays the claim, so the Service Manager approves it. When the Service Manager finishes the job, that counts as their approval. If it is declined, the customer pays.',
            who: ['service'], ask: '“Ask for approval” on the job card.', blocks: '“Work is done” and the ৳0 bill.', href: '#/service?tab=jobs', go: 'Service', see: 'service' }),
          step({ id: 'a-free', title: 'Free under warranty', icon: 'shield', tags: '৳0 for the customer',
            what: 'The customer pays nothing. The value of the parts and labour is kept, so it can be claimed from BYD.',
            who: ['service'], records: ['Value of the work', 'BYD claim'], needs: ['The Service Manager approved the free work', 'The car is still covered'],
            href: '#/service?tab=jobs', go: 'Service', count: () => c(list('jobCards').filter((j) => j.billing === 'warranty' && jobLive(j)).length, 'free jobs') }),
          gate({ id: 'g-sdisc', gate: 'service_discount', refC: 'jobCards', title: 'Service discount', short: 'Discount',
            what: 'A discount on a service bill goes on its own line, with a reason. Above the free limit it needs approval, and a declined discount is taken off.',
            who: ['service'], ask: 'Saving the discount opens the request.', blocks: 'Making the bill.', href: '#/service?tab=jobs', go: 'Service', see: 'service' }),
          step({ id: 'a-paid', title: 'Paid service', icon: 'wallet', tags: 'Billed with VAT',
            what: 'Parts and labour are billed with VAT and collected before the car leaves.',
            who: ['service'], records: ['Parts and labour', 'VAT', 'Discount and its reason'],
            href: '#/service?tab=jobs', go: 'Service', count: () => c(list('jobCards').filter((j) => j.billing !== 'warranty' && j.billing !== 'internal' && jobLive(j)).length, 'paid jobs') }),
        ] },
        { title: 'Bill and hand back', steps: [
          step({ id: 'a-invoice', title: 'Make the bill', icon: 'receipt', tags: '৳0 for warranty work', fc: 'Service Invoice',
            what: 'The bill is made from the job card and printed with the seller’s and the buyer’s BIN. Free warranty work gets a ৳0 bill.',
            who: ['service'], records: ['Invoice number', 'Lines, VAT and total'], needs: ['The work is done', 'Free work or a discount approved, when it needed approval'],
            href: '#/service?tab=jobs', go: 'Service', count: () => c(toBill(), 'to bill') }),
          step({ id: 'a-collect', title: 'Customer pays', icon: 'wallet', tags: 'Receipt · To Accounts',
            what: 'Money taken at the service desk gets a receipt (MR-…) with the name of who took it, and goes to Accounts to confirm, like car payments.',
            who: ['service'], records: ['Receipt number', 'Amount and method', 'Who took it'],
            rule: 'Only the Service Manager, Accounts or the Managing Director can let a car leave unpaid.',
            href: '#/service?tab=jobs', go: 'Service', count: () => c(toConfirm((p) => !p.orderId), 'to confirm') }),
          step({ id: 'a-release', title: 'Release the car', icon: 'car', tags: 'Gate pass',
            what: 'Hand the keys back with a numbered gate pass, noting who collected the car and the odometer on the way out.',
            who: ['service'], records: ['Gate pass (GP-…)', 'Who collected it', 'Odometer out'],
            needs: ['The bill paid, or allowed to stay due by the Service Manager, Accounts or the Managing Director'],
            href: '#/service?tab=jobs', go: 'Service', count: () => c(readyJobs(), 'ready for pickup') }),
          step({ id: 'a-follow', title: 'Follow-up call', icon: 'phone', tags: 'Satisfaction · Renewals', fc: 'Customer Follow-Up', kind: 'goal',
            what: 'Call a few days later to check the customer is happy, and remind them about the next service and their insurance and registration renewals. A rating of 2 or less opens a complaint that only the Service Manager can close.',
            who: ['service', 'sales'], records: ['Outcome and rating', 'Next reminder'],
            href: '#/service?tab=followups', go: 'Service', doAt: { sales: ['#/dashboard', 'Today'] },
            count: () => c(list('followUps').filter((f) => f.status !== 'done' && f.due && f.due <= T()).length, 'calls due') }),
        ] },
        { title: 'Claiming warranty work from BYD', kind: 'branch', icon: 'file-text', steps: [
          step({ id: 'a-claim', title: 'File the claim', icon: 'file-text', tags: 'For every free job',
            what: 'Every free warranty job is claimed from BYD with its value. The BYD claims tab lists the jobs still to claim.',
            who: ['service_manager', 'service'], records: ['Claim number', 'Amount claimed', 'Date filed'], href: '#/service?tab=claims', go: 'Service', count: () => c(claimsAt('not_filed'), 'to claim') }),
          step({ id: 'a-claim-ok', title: 'BYD decides', icon: 'check-circle', tags: 'Approved or rejected',
            what: 'BYD approves the claim, sometimes for less, or rejects it. Record the answer and the approved amount.',
            who: ['service_manager', 'byd'], records: ['Approved amount', 'Or why it was rejected'], href: '#/service?tab=claims', go: 'Service', count: () => c(claimsAt('filed'), 'waiting for BYD') }),
          step({ id: 'a-claim-paid', title: 'BYD pays', icon: 'wallet', tags: 'Owed by BYD',
            what: 'When BYD pays, record the payment reference. Until then Accounts sees the amount under “Owed by BYD”.',
            who: ['service_manager'], records: ['Paid date', 'Payment reference'], href: '#/service?tab=claims', go: 'Service', count: () => c(claimsAt('approved'), 'to be paid') }),
        ] },
        { title: 'Ordering spare parts', kind: 'branch', icon: 'cog-parts', steps: [
          step({ id: 'a-low', title: 'Below reorder level', icon: 'alert', tags: 'Reorder list',
            what: 'A part whose free stock falls to its reorder level appears on the reorder list.',
            who: ['system'], records: ['Free stock', 'Reorder level'], href: '#/parts', go: 'Parts', count: () => c(list('parts').filter((p) => B.partLow(p)).length, 'low') }),
          step({ id: 'a-porder', title: 'Order parts', icon: 'cart', tags: 'Parts order (PPO-…)',
            what: 'The service desk can ask for parts; Purchasing adds the prices and sends the order. Stock only goes up by receiving a parts order.',
            who: ['service', 'procurement'], records: ['Parts and quantities', 'Supplier and prices'], href: '#/parts?tab=orders', go: 'Parts',
            count: () => c(list('partOrders').filter((o) => ['draft', 'pending'].includes(o.status)).length, 'being prepared') }),
          gate({ id: 'g-po-parts', gate: 'po', refC: 'partOrders', title: 'Parts order approval', short: 'Parts order',
            what: 'A large parts order needs the Managing Director’s OK before it is placed. Smaller ones are placed straight away.',
            who: ['procurement', 'service'], ask: 'Sent for approval by itself when a priced order above the limit is saved.',
            blocks: 'Placing the order with the supplier, and receiving it.', href: '#/parts?tab=orders', go: 'Parts', see: 'parts' }),
          step({ id: 'a-preceive', title: 'Ordered and received', icon: 'boxes', tags: 'Stock goes up',
            what: 'Purchasing marks the order placed, then receives what arrives, even part of it. Receiving raises the stock and updates the average cost.',
            who: ['procurement'], records: ['Quantities received', 'Average cost'], href: '#/parts?tab=orders', go: 'Parts',
            count: () => c(list('partOrders').filter((o) => ['approved', 'ordered'].includes(o.status)).length, 'on order') }),
        ] },
        { title: 'Counting parts', kind: 'branch', icon: 'boxes', steps: [
          step({ id: 'a-count', title: 'Count or write off', icon: 'clipboard-check', tags: 'Shelf count · Damaged parts',
            what: 'Count the shelf, or write off damaged and missing parts, with a reason. Opening stock is entered the same way.',
            who: ['service', 'procurement'], records: ['Units counted or removed', 'Reason'], href: '#/parts', go: 'Parts' }),
          gate({ id: 'g-stockadj', gate: 'stock_adjust', refC: 'parts', title: 'Stock correction', short: 'Stock correction',
            what: 'Writing stock off or correcting a count changes what the company owns, so the Managing Director approves it. Adding a car to stock without a purchase order needs the same OK.',
            who: ['service', 'procurement'], ask: 'Sent for approval by itself when the count is saved.', blocks: 'The shelf count: it only changes once approved.', href: '#/parts', go: 'Parts', see: 'parts' }),
          step({ id: 'a-count-done', title: 'Stock corrected', icon: 'check-circle', tags: 'By the difference',
            what: 'On approval the change is applied by the difference, so parts used in the meantime are not lost.',
            who: ['system'], records: ['A line in the part’s stock history'], href: '#/parts', go: 'Parts' }),
        ] },
        { title: 'If a started job is cancelled', kind: 'exception', icon: 'x', steps: [
          step({ id: 'a-jc-cancel', title: 'Ask to cancel the job', icon: 'x', tags: 'Reason · Parts returned',
            what: 'A job that has not started is cancelled at once, with a reason. Once work started or parts are on it, the Service Manager decides. Tick which parts went back on the shelf.',
            who: ['service'], records: ['Reason', 'Parts back on the shelf'], href: '#/service?tab=jobs', go: 'Service' }),
          gate({ id: 'g-jobcancel', gate: 'job_cancel', refC: 'jobCards', title: 'Cancel a started job', short: 'Cancel job',
            what: 'Work or parts are already on the job card, so the Service Manager approves cancelling it.',
            who: ['service'], ask: '“Cancel job” on the job card.', blocks: 'Finishing and billing the job while it waits.', href: '#/service?tab=jobs', go: 'Service', see: 'service' }),
          step({ id: 'a-jc-done', title: 'Job cancelled', icon: 'undo', tags: 'Parts sorted',
            what: 'Returned parts are free again, and parts already fitted leave stock. The booking ends as “Job cancelled”.',
            who: ['system'], records: ['Who approved'], href: '#/service?tab=jobs', go: 'Service' }),
        ] },
      ],
    },
    {
      key: 'support', title: 'Office', icon: 'briefcase',
      intro: 'Expenses, leave and salaries, and the back office that keeps the company legal and paid.',
      lanes: [
        { title: 'Claiming an expense', steps: [
          step({ id: 'x-claim', title: 'Claim an expense', icon: 'receipt', tags: 'What for · Amount · Paid to',
            what: 'Anyone can claim money spent for the company: what it was for, the amount, who was paid and which part of the business. A possible duplicate is flagged before saving.',
            who: ['anyone'], records: ['What for and amount', 'Paid to', 'Part of the business', 'Bill date and number'],
            href: '#/finance?tab=expenses', go: 'Accounts', action: 'newExpense', actionPerm: 'expenses.record', actionLabel: 'Claim an expense' }),
          gate({ id: 'g-expense', gate: 'expense', refC: 'expenses', title: 'Expense approval', short: 'Expense',
            what: 'Small spends need no approval. Bigger claims go to Accounts, and the biggest to the Managing Director. Nobody approves their own claim.',
            who: ['anyone'], ask: 'Sent for approval by itself when the claim is saved.', blocks: 'Paying the claim. A claim waiting for approval is not in the books.',
            href: '#/finance?tab=expenses', go: 'Accounts', see: 'finance',
            foot: 'An accountant’s own claim always waits for another accountant or the Managing Director.' }),
          step({ id: 'x-pay', title: 'Accounts pays', icon: 'wallet', tags: 'Method · Reference',
            what: 'Accounts marks the approved claim paid, with how it was paid and the reference. A mistake is voided with a reason, never deleted.',
            who: ['accounts'], records: ['Paid with', 'Reference', 'Date'], needs: () => [`The claim approved (up to ${M(NA.policy().expenseFree)} needs no approval)`],
            href: '#/finance?tab=expenses', go: 'Accounts', count: () => c(list('expenses').filter((e) => e.status === 'approved').length, 'to pay') }),
        ] },
        { title: 'Taking leave', steps: [
          step({ id: 'x-leave', title: 'Ask for leave', icon: 'calendar', tags: 'Casual · Sick · Annual · Unpaid',
            what: 'Anyone can ask for leave from New → Leave request, or from Approvals. Fridays and the public holidays in Settings are not counted.',
            who: ['anyone'], records: ['Type', 'From and to', 'Working days', 'Reason'],
            href: '#/approvals?tab=mine', go: 'Approvals', action: 'newLeave', actionPerm: 'leave.request', actionLabel: 'Request leave' }),
          gate({ id: 'g-leave', gate: 'leave', refC: 'leaves', title: 'Leave approval', short: 'Leave',
            what: 'Admin & HR approves leave and checks the days left for the year. Admin & HR’s own leave goes to the Managing Director.',
            who: ['anyone'], ask: 'Sent for approval by itself when the request is saved.', blocks: 'The leave only counts once it is approved.',
            // People → Leave, and everyone's leave, are Admin & HR's (Accounts opens People for payroll only).
            href: '#/admin?tab=leave', go: 'People', see: 'admin', opens: () => NA.can('hr.manage'),
            foot: 'Nobody approves their own leave: Admin & HR’s own leave goes to the Managing Director.' }),
          step({ id: 'x-leave-ok', title: 'On the attendance sheet', icon: 'check-circle', tags: 'Shown as leave',
            what: 'Approved leave is marked on the attendance sheet as “Leave” and counted against the person’s days for the year.',
            who: ['system'], records: ['Attendance: leave', 'Days left this year'], href: '#/admin?tab=leave', go: 'People', opens: () => NA.can('hr.manage'),
            count: () => c(list('leaves').filter((l) => l.status === 'approved' && String(l.to || '') >= T()).length, 'approved, coming up') }),
        ] },
        { title: 'Paying salaries', steps: [
          step({ id: 'x-payroll', title: 'Prepare payroll', icon: 'hr', tags: 'Draft for the month',
            what: 'Admin & HR prepares the month’s payroll from salaries and attendance. Payslips say DRAFT until it is approved.',
            who: ['hr'], records: ['Each person’s salary and deductions', 'Net total'], href: '#/admin?tab=payroll', go: 'People' }),
          gate({ id: 'g-payroll', gate: 'payroll', refC: 'payroll', title: 'Payroll approval', short: 'Payroll',
            what: 'The Managing Director approves the month’s salaries before they are paid. Once sent, the lines are locked.',
            who: ['hr'], ask: '“Send to Managing Director” on the payroll.', blocks: 'Paying the salaries.', href: '#/admin?tab=payroll', go: 'People', see: 'admin',
            counts: () => NA.isRole('hr') }),   // Accounts reads the payroll but never receives the approval itself
          step({ id: 'x-payroll-paid', title: 'Salaries paid', icon: 'wallet', tags: 'Expense recorded',
            what: 'In People → Payroll, Accounts or the Managing Director marks the approved month paid, with the method and the reference, and the salary expense is recorded by itself. Undoing it is a reversal by the Managing Director, never a delete.',
            who: ['accounts'], records: ['Method and reference', 'Salary expense'], needs: ['The Managing Director approved the payroll'], href: '#/admin?tab=payroll', go: 'People' }),
        ] },
        { title: 'Also in the back office', icon: 'briefcase', grid: true, steps: [
          step({ id: 'x-admin', title: 'Administration', icon: 'briefcase', tags: 'Staff · Attendance · Assets · Licences', fc: 'Administration',
            what: 'Staff records, daily attendance (Fridays and the public holidays in Settings are days off), company assets such as demo cars and tools, and every licence and certificate with its expiry date. Someone marked as left can no longer sign in.',
            who: ['hr'], records: ['Staff', 'Attendance', 'Assets', 'Licences and expiry dates'], href: '#/admin', go: 'People',
            count: () => c(list('compliance').filter((x) => x.expiry && NA.daysBetween(T(), x.expiry) <= 60).length, 'licences due in 60 days') }),
          step({ id: 'x-fin', title: 'Finance and accounts', icon: 'chart', tags: 'Money in · Suppliers · VAT · Profit', fc: 'Finance & Accounts',
            what: 'Money in and out, what customers and BYD owe us, what we owe suppliers, VAT returns and a monthly profit and loss.',
            who: ['accounts'], records: ['Customer ledger', 'Supplier payments', 'VAT', 'Spending by part of the business'], href: '#/finance', go: 'Accounts',
            count: () => c(toConfirm(), 'payments to confirm') }),
        ] },
      ],
    },
  ];

  // Reading order (the tour), and where each step lives.
  const ORDER = [];
  const SEC_OF = {};
  const LANE_OF = {};
  SECTIONS.forEach((sec) => sec.lanes.forEach((ln, li) => (ln.steps || []).forEach((st) => { ORDER.push(st.id); SEC_OF[st.id] = sec; LANE_OF[st.id] = sec.key + ':' + li; })));
  // Links to the earlier "Master flow" open the matching step.
  const OLD_IDS = { 'm-capture': 'l-new', 'm-qualify': 'l-qual', 'm-showroom': 'l-visit', 'm-booking': 's-booking', 'm-payment': 's-payment', 'm-vin': 's-vin', 'm-brta': 's-brta', 'm-delivery': 's-delivery',
    'm-warranty': 'a-warranty', 'm-service': 'a-job', 'm-plan': 'p-plan', 'm-po': 'p-po', 'm-lot': 'p-lot', 'm-release': 'p-release', 'm-pdi': 'p-pdi', 'm-stock': 'p-ware' };
  const TABS = [{ key: 'all', label: 'All' }].concat(SECTIONS.map((s) => ({ key: s.key, label: s.title })), [{ key: 'roles', label: 'Roles and approvals' }]);
  const stepsOf = (sec) => ORDER.filter((id) => SEC_OF[id] === sec);

  /* ---------- render ---------- */
  const safeCount = (st) => { try { return st.count ? st.count() : null; } catch (e) { return null; } };
  const sectionOfHref = (href) => { const m = /^#\/([a-z]+)/.exec(href || ''); return m ? m[1] : ''; };
  /** Can this person open the screen behind a link? (The app sends anyone else back to Today.) */
  const canOpen = (href) => { const s = sectionOfHref(href); return !s || (!!NA.pages[s] && NA.canSee(s)); };
  /** …and the part of it this step or marker points at (it.opens: a tab only some roles get). */
  const opensIt = (it) => !it.opens || !!it.opens();
  const reaches = (it, href) => canOpen(href) && opensIt(it);
  /** Live numbers only for people who receive the records they count (the screen they come from, narrowed by
      it.opens and it.counts), or who decide the approval. Nobody sees a zero that only means "not sent to you". */
  const showCount = (it) => {
    if (it.isGate && decides(it.gate)) return true;
    const sees = it.isGate ? NA.canSee(it.see || sectionOfHref(it.href)) && opensIt(it) : reaches(it, it.href);
    return sees && (!it.counts || !!it.counts());
  };
  function countOf(it) {
    if (!showCount(it)) return null;
    if (!it.isGate || it.count) return safeCount(it);
    if (it.gate === 'vendor_payment') return null;
    try { return c(waiting(it.gate, it.refC, it.match), 'waiting for a decision'); } catch (e) { return null; }
  }
  /** Is this role part of the step: doing it, asking for it, or deciding it? */
  const involves = (it, role) => !!it && !!role && ((it.who || []).some((w) => w === role || w === 'anyone') || (!!it.isGate && decides(it.gate, role)));
  const whoLine = (it) => (it.who || []).map((w) => (w === NA.role() ? 'You' : whoLabel(w))).join(' · ');
  /** The tour: every step, or only the steps of the role being shown. */
  const tourOf = (state) => (state.role ? ORDER.filter((id) => involves(S[id], state.role)) : ORDER);
  function neighbours(id, state) {
    const seq = tourOf(state);
    const at = ORDER.indexOf(id);
    let prev = null; let next = null;
    seq.forEach((x) => { const k = ORDER.indexOf(x); if (k < at) prev = x; else if (k > at && !next) next = x; });
    const i = seq.indexOf(id);
    return { prev, next, pos: i >= 0 ? i + 1 : at + 1, total: i >= 0 ? seq.length : ORDER.length };
  }

  function nodeHtml(st, n, state) {
    const cnt = countOf(st);
    const cls = ['pm-node', st.kind || '', state.step === st.id ? 'sel' : '', state.role && involves(st, state.role) ? 'hl' : ''].filter(Boolean).join(' ');
    const first = (st.who || [])[0];
    const mine = (st.who || []).includes(NA.role());
    const tags = val(st.tags);
    return `<button type="button" class="${cls}" data-step="${esc(st.id)}" aria-label="${esc(st.title)}: what happens here">
      <span class="pn-top"><span class="pn-ico">${NA.icon(st.icon, 15)}</span>${n ? `<span class="pn-num">${n}</span>` : ''}</span>
      <span class="pn-title">${esc(st.title)}</span>
      ${tags ? `<span class="pn-tags">${esc(tags)}</span>` : ''}
      ${first ? `<span class="pn-who ${mine ? 'you' : ''}">${NA.icon(first === 'system' ? 'bolt' : 'user', 12)}<span>${esc(whoLine(st))}</span></span>` : ''}
      ${cnt ? `<span class="pn-count ${cnt.n ? 'live' : ''}"><b>${esc(cnt.n)}</b>${esc(cnt.label)}</span>` : ''}
    </button>`;
  }

  /** A small marker between two steps: amber when someone must approve, green for Accounts confirming the money. */
  function gateHtml(g, state) {
    const cnt = countOf(g);
    const check = g.gate === 'money';
    const cls = ['pm-gate', check ? 'is-money' : '', state.step === g.id ? 'sel' : '', state.role && involves(g, state.role) ? 'hl' : ''].filter(Boolean).join(' ');
    // Supplier payments have no approval of their own: the approved purchase order covers them.
    const label = g.gate === 'vendor_payment' ? g.title + ': covered by the approved purchase order · Accounts pays'
      : (check ? 'Check: ' : 'Approval: ') + g.title + ' · ' + decidedBy(g.gate);
    return `<button type="button" class="${cls}" data-step="${esc(g.id)}" title="${esc(label)}" aria-label="${esc(label)}">${NA.icon(check ? 'check-circle' : 'stamp', 14)}<span>${esc(g.short || g.title)}</span>${cnt && cnt.n ? `<span class="pg-n">${esc(cnt.n)}</span>` : ''}</button>`;
  }

  function laneHtml(ln, li, sec, state) {
    if (ln.rule) return `<div class="pm-rule">${NA.icon('lock', 17)}<span><b>The key rule.</b> ${esc(ln.rule)}</span></div>`;
    const items = ln.steps || [];
    let row;
    if (ln.grid) {
      // Options side by side; an approval marker sits on top of the option it guards.
      const opts = []; let held = [];
      items.forEach((it) => { if (it.isGate) held.push(it); else { opts.push({ gates: held, st: it }); held = []; } });
      if (held.length) opts.push({ gates: held, st: null });
      row = `<div class="pm-row is-grid">${opts.map((o) => `<div class="pm-opt">${o.gates.map((g) => gateHtml(g, state)).join('')}${o.st ? nodeHtml(o.st, 0, state) : ''}</div>`).join('')}</div>`;
    } else {
      // A line of steps; markers between two steps are stacked in the gap they guard.
      const groups = [];
      items.forEach((it) => { const last = groups[groups.length - 1]; if (it.isGate) { if (last && last.gates) last.gates.push(it); else groups.push({ gates: [it] }); } else groups.push(it); });
      let n = 0;
      row = `<div class="pm-row">${groups.map((g, i) => (i ? `<span class="pm-arrow">${NA.icon('chevron-right', 16)}</span>` : '')
        + (g.gates ? `<div class="pm-gates">${g.gates.map((x) => gateHtml(x, state)).join('')}</div>` : nodeHtml(g, ++n, state))).join('')}</div>`;
    }
    const open = !!state.step && LANE_OF[state.step] === sec.key + ':' + li;
    return `<div class="${['pm-lane', ln.kind || ''].filter(Boolean).join(' ')}">
      <div class="pm-lane-title">${NA.icon(ln.icon || 'arrow-right', 14)}<span>${esc(ln.title)}</span>${ln.sub ? `<span class="pm-lane-sub">· ${esc(ln.sub)}</span>` : ''}</div>
      ${row}
      ${ln.note ? `<div class="pm-lane-note">${NA.icon('info', 14)}<span>${esc(ln.note)}</span></div>` : ''}
    </div>${open ? detailHtml(state.step, state) : ''}`;
  }

  function sectionHtml(sec, state) {
    const ids = stepsOf(sec);
    const gates = ids.filter((id) => S[id].isGate).length;
    return `<section class="card pm-sec" id="pm-sec-${esc(sec.key)}">
      <header class="pm-sec-head">
        <div class="grow"><h2>${esc(sec.title)}</h2><p>${esc(sec.intro)}</p></div>
        <div class="pm-sec-meta"><span>${ids.length - gates} steps · ${gates} ${gates === 1 ? 'check' : 'checks'}</span>${state.sec === 'all' ? `<button type="button" class="btn btn-plain btn-sm" data-act="sec" data-sec="${esc(sec.key)}">Show only this</button>` : ''}</div>
      </header>
      <div class="pm-sec-body">${sec.lanes.map((ln, li) => laneHtml(ln, li, sec, state)).join('')}</div>
    </section>`;
  }

  /* The whole picture, as in the flowchart's master flow: the customer side and the car side meet at the VIN. */
  const OVERVIEW = [
    { label: 'Customers', items: [['l-new', 'Lead'], ['l-opp', 'Quote'], ['s-booking', 'Order'], ['g-money', 'Money confirmed', 'is-money'], ['s-vin', 'VIN', 'meet'], ['s-brta', 'Registration'], ['s-delivery', 'Handover'], ['a-job', 'Service']] },
    { label: 'Cars', items: [['p-plan', 'Plan'], ['p-po', 'Order from BYD'], ['p-adv', 'Advance'], ['p-release', 'Final payment and VIN'], ['p-pdi', 'Arrival check'], ['p-ware', 'In stock'], ['s-vin', 'VIN', 'meet']] },
  ];
  function overviewHtml() {
    const gates = ORDER.filter((id) => S[id].isGate).length;
    return `<section class="card pm-over">
      <h2>The whole picture</h2>
      <p>Customers come in on one side and cars on the other. They meet at the VIN.</p>
      <div class="pm-over-rows">${OVERVIEW.map((r) => `<div class="pm-over-row"><span class="pm-over-label">${esc(r.label)}</span>${r.items.filter(([id]) => S[id]).map(([id, label, k], i) => (i ? `<span class="pm-arrow">${NA.icon('chevron-right', 14)}</span>` : '')
        + `<button type="button" class="pm-mini ${k || ''}" data-jump="${esc(id)}">${esc(label)}</button>`).join('')}</div>`).join('')}</div>
      <div class="pm-legend">
        <span><i></i>A step</span><span><i class="d"></i>A choice</span>
        <span><i class="g">${NA.icon('stamp', 12)}</i>Someone must approve</span><span><i class="c">${NA.icon('check-circle', 12)}</i>Accounts confirms the money</span>
        <span>${ORDER.length - gates} steps and ${gates} checks · the numbers are live and count only what you can see</span>
      </div>
    </section>`;
  }

  /** The one way forward from a step: open its screen or form, or say who does it when this role doesn't. */
  function goHtml(it) {
    const me = NA.role();
    const plain = (label, href) => NA.ui.btn(label, { kind: 'plain', href });
    const lock = (text) => `<span class="lock-note">${NA.icon('lock', 14)}${esc(text)}</span>`;
    const money = it.isGate && it.gate === 'money';
    const vpay = it.isGate && it.gate === 'vendor_payment';
    if (money && NA.can('payments.verify')) return NA.ui.btn('Confirm payments', { kind: 'primary', icon: 'check', href: '#/approvals?tab=money' });
    if (it.isGate && !money && !vpay && decides(it.gate)) {
      return NA.ui.btn('Open Approvals', { kind: 'primary', icon: 'inbox', href: '#/approvals' }) + (reaches(it, it.href) ? plain('Open ' + it.go, it.href) : '');
    }
    const href = money ? '#/sales?stage=payment' : it.href;
    const go = money ? 'Orders' : it.go;
    const open = reaches(it, href);
    const act = !!it.action && !!NA.actions && typeof NA.actions[it.action] === 'function' && (!it.actionPerm || NA.can(it.actionPerm));
    if (act) return NA.ui.btn(it.actionLabel || 'Start', { kind: 'primary', icon: 'plus', act: 'do', attrs: `data-action="${esc(it.action)}"` }) + (open ? plain('Open ' + go, href) : '');
    if (open) return NA.ui.btn('Open ' + go, { kind: 'primary', icon: 'arrow-right', href });
    // A doer who works on another screen (a consultant asks for an emergency car on their order, and calls from Today).
    const alt = it.doAt && it.doAt[me];
    if (alt && (it.who || []).includes(me) && canOpen(alt[0])) return NA.ui.btn('Open ' + alt[1], { kind: 'primary', icon: 'arrow-right', href: alt[0] });
    // Nothing this person can open: say who does it instead of offering a dead link.
    if (vpay) return lock('Accounts pays this in Purchasing, within the approved order.');
    if (it.isGate) return lock(sentence(`${people(deciders(it.gate))} ${money ? 'confirms' : 'decides'} this, in Approvals.`));
    // Group the other doers by where they work (doAt), so a consultant is never said to work in a screen they cannot open.
    const places = [];
    (it.who || []).filter((w) => w !== me && isRoleKey(w)).forEach((w) => {
      const [h, g] = (it.doAt && it.doAt[w]) || [href, go];
      let p = places.find((x) => x.go === g);
      if (!p) places.push((p = { href: h, go: g, who: [] }));
      p.who.push(w);
    });
    if (places.length > 1) return lock(sentence(places.map((p, i) => `${people(p.who)}${i ? ',' : ' does this,'} in ${p.go}`).join(', and ') + '.'));
    const at = places[0] || { href, go };
    const text = places.length ? sentence(`${people(at.who)} does this, in ${at.go}.`) : (it.who || []).includes('system') ? 'The app does this by itself.' : `It is done in ${go}.`;
    const why = !canOpen(at.href) ? ' Your role doesn’t use that screen.' : at.href === href ? ` Your role doesn’t see that part of ${go}.` : '';
    return lock(text + why);
  }

  /** The card that opens under a lane: what happens, who does it, what must be true first, and where to do it. */
  function detailHtml(id, state) {
    const it = S[id]; const sec = SEC_OF[id];
    if (!it || !sec) return '';
    const nb = neighbours(id, state);
    const me = NA.role();
    const check = it.gate === 'money';
    const kind = it.isGate ? (NA.APPROVALS[it.gate] || {}) : null;
    const icon = it.isGate ? (check ? 'check-circle' : kind.icon || 'stamp') : it.icon;
    const cnt = countOf(it);
    const who = (it.who || []).map((w) => `<span class="pm-person ${w === me ? 'you' : ''}">${NA.icon(whoIcon(w), 14)}${esc(whoLabel(w))}${w === me ? ' (you)' : ''}</span>`).join('');
    const listHtml = (arr, ok) => `<ul class="pm-list ${ok ? 'ok' : ''}">${arr.map((x) => `<li>${NA.icon(ok ? 'check' : 'lock', 15)}<span>${esc(x)}</span></li>`).join('')}</ul>`;
    const needs = val(it.needs) || [];
    const records = val(it.records) || [];
    const tags = val(it.tags);
    const rule = val(it.rule);
    const tip = val(it.tip);
    let left = `<h4>What happens</h4><p class="pm-d-what">${esc(val(it.what))}</p>`;
    let right = '';
    if (it.isGate) {
      const foot = val(it.foot) || (check ? 'Only confirmed money counts towards “fully paid”.' : 'Nobody approves their own request. When the person asking may decide it, it is approved at once and recorded.');
      left += `<h4>What waits for it</h4><p class="pm-d-what">${esc(val(it.blocks))}</p><h4>How to ask</h4><p class="pm-d-what">${esc(val(it.ask))}</p>`;
      right = `<h4>${check ? 'Who confirms' : 'Who decides'}</h4><div class="pm-tiers">${decideRows(it.gate, it.refC).map(([a, b]) => `<div class="pm-tier"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>`
        + (who ? `<h4>${esc(it.whoHead || (check ? 'Who takes the money' : 'Who asks'))}</h4><div class="pm-who-list">${who}</div>` : '')
        + `<p class="pm-d-fc">${esc(foot)}</p>`;
    } else {
      if (rule) left += `<div class="callout callout-warn">${NA.icon('lock', 16)}<span>${esc(rule)}</span></div>`;
      if (tip) left += `<div class="callout callout-info">${NA.icon('info', 16)}<span>${esc(tip)}</span></div>`;
      if (it.fc) left += `<p class="pm-d-fc">In the owner’s flowchart this is “${esc(it.fc)}”.</p>`;
      right = (who ? `<h4>Who does it</h4><div class="pm-who-list">${who}</div>` : '')
        + (needs.length ? `<h4>Before this step</h4>${listHtml(needs, false)}` : '')
        + (records.length ? `<h4>What the app records</h4>${listHtml(records, true)}` : '');
    }
    const badge = it.isGate ? (it.badge ? NA.ui.badge(it.badge[0], it.badge[1]) : NA.ui.badge(check ? 'Money check' : 'Approval', check ? 'green' : 'amber'))
      : it.kind === 'decision' ? NA.ui.badge('A choice', 'gray') : it.kind === 'goal' ? NA.ui.badge('Milestone', 'green') : '';
    return `<div class="card pm-detail" id="pm-detail" role="region" aria-label="${esc(it.title)}">
      <div class="pm-d-head">
        <span class="pm-d-ico ${it.isGate ? (check ? 'is-money' : 'gate') : ''}">${NA.icon(icon, 22)}</span>
        <div class="grow"><div class="eyebrow">${esc(sec.title)} · ${nb.pos} of ${nb.total}</div><h3>${esc(it.title)}</h3>${tags ? `<div class="pm-d-tags">${esc(tags)}</div>` : ''}${badge ? `<div class="mt-8">${badge}</div>` : ''}</div>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close">${NA.icon('x', 16)}</button>
      </div>
      <div class="pm-d-grid"><div>${left}</div><div>${right}</div></div>
      <div class="pm-d-foot">
        ${cnt ? `<div class="pm-live"><b>${esc(cnt.n)}</b><span>${esc(cnt.label)} right now</span></div>` : ''}
        ${goHtml(it)}
        <div class="pm-d-nav">
          ${NA.ui.btn('Previous', { kind: 'ghost', size: 'sm', icon: 'chevron-left', act: 'prev', attrs: nb.prev ? '' : 'disabled' })}
          <button type="button" class="btn btn-ghost btn-sm" data-act="next" ${nb.next ? '' : 'disabled'}>Next${NA.icon('chevron-right', 16)}</button>
        </div>
      </div>
    </div>`;
  }

  /* ---------- who does what (every role in NA.ROLES, from NA.PERMS and NA.ACCESS; the words are NA.ROLE_TEXT and
     NA.ABILITIES in access.js, shared with Settings → You) ---------- */
  const SCREENS = [['dashboard', 'Today'], ['approvals', 'Approvals'], ['leads', 'Leads'], ['customers', 'Customers'], ['sales', 'Orders'], ['inventory', 'Vehicles'],
    ['procurement', 'Purchasing'], ['service', 'Service'], ['parts', 'Parts'], ['finance', 'Accounts'], ['admin', 'People'], ['reports', 'Reports']];
  /** What a role approves, with its limit where it has one. */
  function approvesFor(role) {
    const ap = AP();
    if (!ap) return [];
    const p = NA.policy();
    const LIMIT = { discount: p.discountManager, expense: p.expenseAccounts, service_discount: p.serviceDiscountManager };
    const out = NA.can('payments.verify', role) ? ['Customer money (confirms it)'] : [];
    Object.keys(NA.APPROVALS).forEach((k) => {
      if (k === 'vendor_payment') return;
      const small = ap.approverRoles(k, 0).includes(role); const big = ap.approverRoles(k, 1e12).includes(role);
      if (!small && !big) return;
      const label = k === 'leave' && role === 'hr' ? 'Leave, except their own' : NA.APPROVALS[k].label;
      out.push(LIMIT[k] != null && small && !big ? `${label} up to ${M(LIMIT[k])}` : LIMIT[k] != null && big && !small ? `${label} above ${M(LIMIT[k])}` : label);
    });
    if (role === 'owner') out.push(NA.roleLabel('hr') + '’s own leave', 'Anything else, when needed');
    return out;
  }
  /** Which records reach this role (the office server sends nothing else). */
  function seesNote(role) {
    if (role === 'owner') return 'Everything, including what cars cost and salaries.';
    const acc = (NA.ACCESS && NA.ACCESS[role]) || {};
    const out = [];
    if (acc.leads === 'own') out.push('Only their own leads, customers, orders and payments.');
    if (acc.leads === 'own' && !NA.can('targets.set', role)) out.push('Their monthly target is set by the Sales Manager.');
    if (NA.can('see.procurement', role) && !NA.can('po.manage', role) && !NA.can('vendor.pay', role)) out.push('Reads Purchasing (what is on order and when it arrives) without changing it.');
    const hidden = [];
    if (!NA.can('costs.view', role)) hidden.push('what cars and parts cost');
    if (!NA.can('payroll.view', role)) hidden.push('salaries');
    if (hidden.length) out.push('Never sees ' + hidden.join(' or ') + '.');
    return out.join(' ');
  }
  function rolesHtml() {
    const me = NA.role();
    const line = (k, v) => `<div class="gl-row"><div class="gl-main"><span class="pm-k">${esc(k)}</span><small>${esc(v)}</small></div></div>`;
    const roleText = NA.ROLE_TEXT || {};
    const abilities = Array.isArray(NA.ABILITIES) ? NA.ABILITIES : [];
    const cards = roleKeys().map((r) => {
      const screens = SCREENS.filter(([s]) => NA.pages[s] && NA.can('see.' + s, r)).map(([, l]) => l);
      const can = r === 'owner' ? ['Everything any role can do, plus prices, approval rules and sign-ins'] : abilities.filter(([perm]) => NA.can(perm, r)).map(([, l]) => l);
      const ok = approvesFor(r);
      const sees = seesNote(r);
      const n = tourOf({ role: r }).length;
      return `<div class="glist pm-role ${r === me ? 'me' : ''}">
        <div class="gl-row has-icon"><span class="gl-icon bg-gray">${NA.icon(ROLE_ICON[r] || 'user', 17)}</span><div class="gl-main"><b>${esc(NA.roleLabel(r))} ${r === me ? NA.ui.badge('You', 'blue') : ''}</b><small>${esc(roleText[r] || '')}</small></div></div>
        ${line('Screens', screens.join(' · ') || 'Today and Approvals')}
        ${sees ? line('Records', sees) : ''}
        ${can.length ? line('Can', can.join(' · ')) : ''}
        ${ok.length ? line('Approves', ok.join(' · ')) : ''}
        ${n ? `<button type="button" class="gl-row" data-act="role" data-role="${esc(r)}"><span class="gl-main pm-show">Show their ${n} steps on the map</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>` : ''}
      </div>`;
    }).join('');
    return `<section class="pm-block" id="pm-roles">
      <div class="pm-block-head"><h2>Who does what</h2><p>Each role sees only the screens and records it needs. The Managing Director can do everything.</p></div>
      <div class="pm-roles">${cards}</div>
      <p class="glist-foot">Everyone can claim an expense, ask for leave, and open this page and their own settings. ${NA.can('staff.signins') ? 'Give each person their role in Settings → Sign-in and roles.' : 'The Managing Director gives each person their role.'} Someone marked as left in People can no longer sign in.</p>
    </section>`;
  }

  /* ---------- who approves what (live limits from NA.policy()) ---------- */
  /** What each kind holds up until it is decided. */
  const BLOCKS = {
    money: 'the VIN',
    discount: 'printing the quote and making the order; on an order, the VIN and the handover',
    credit: 'nothing else; without it the VIN waits for full payment',
    cancel: 'payments, the VIN and the handover, while it waits',
    transfer: 'the new lead or customer; no duplicate is made',
    po: 'the advance, shipment batches and every payment on the order',
    emergency: 'the 100% payment to CG Runner',
    vendor_payment: 'nothing extra; a payment above what the order allows is refused',
    expense: 'paying the claim',
    warranty_job: '“Work is done” and the ৳0 bill',
    service_discount: 'making the bill',
    job_cancel: 'finishing or billing the job',
    stock_adjust: 'the change to the stock count',
    leave: 'counting the leave',
    payroll: 'paying the salaries',
  };
  function approvalsHtml() {
    const ap = AP();
    const firstGate = (type) => ORDER.find((id) => S[id].isGate && S[id].gate === type) || '';
    const forMe = (type) => (type === 'money' ? (NA.can('payments.verify') ? toConfirm() : 0)
      : list('approvals').filter((a) => a.status === 'pending' && a.type === type && !!ap && ap.canDecide(a)).length);
    const row = (type, icon, bg, label, who) => {
      const id = firstGate(type);
      const n = forMe(type);
      const inner = `<span class="gl-icon ${bg}">${NA.icon(icon, 17)}</span>
        <div class="gl-main"><b>${esc(label)}</b><small>${esc(who)}</small>${BLOCKS[type] ? `<small>Holds up: ${esc(BLOCKS[type])}</small>` : ''}</div>
        ${n ? `<span class="gl-value">${n} ${type === 'money' ? 'to confirm' : 'for you'}</span>` : ''}`;
      return id ? `<button type="button" class="gl-row has-icon pm-ap" data-jump="${esc(id)}">${inner}${NA.icon('chevron-right', 16, 'gl-chev')}</button>`
        : `<div class="gl-row has-icon pm-ap">${inner}</div>`;
    };
    const rows = [row('money', 'wallet', 'bg-green', 'Customer money counts', 'Only once Accounts confirms it: cash handed over, cheque cleared, transfer seen in the bank')]
      .concat(Object.keys(NA.APPROVALS).map((k) => row(k, NA.APPROVALS[k].icon || 'stamp', 'bg-amber', NA.APPROVALS[k].label, decideText(k))));
    return `<section class="pm-block" id="pm-approvals">
      <div class="pm-block-head"><h2>Who approves what</h2><p>These limits come from the approval rules and apply as you work. Tap a row to see where it sits in the flow.</p></div>
      <div class="glist">${rows.join('')}</div>
      <p class="glist-foot">Nobody approves their own request. When the person asking may decide it, it is approved at once and recorded, except an accountant’s own expense claim and Admin &amp; HR’s own leave, which wait for someone else. ${NA.can('settings.policy') ? '<a class="btn-link" href="#/settings?tab=rules">Change the limits in Settings</a>' : 'The Managing Director sets these limits.'}</p>
    </section>`;
  }

  // The step already scrolled into view. When colleagues' changes re-draw this page (shared mode), the open step
  // stays open but the page must not jump back to it while someone is reading elsewhere.
  let shownStep = null;

  NA.page({
    path: 'process',
    title: 'How we work',
    icon: 'flow',
    render(root, params, query) {
      injectCss();
      const q = query || {};
      const wanted = OLD_IDS[q.step] || q.step;
      const state = {
        sec: TABS.some((t) => t.key === q.s) ? q.s : 'all',   // which flow is shown ('all', a section key, or 'roles')
        step: S[wanted] ? wanted : null,                        // the open step or marker
        role: isRoleKey(q.who) ? q.who : '',                    // highlight the steps of one role
      };
      if (state.step && state.sec !== 'all' && SEC_OF[state.step].key !== state.sec) state.sec = SEC_OF[state.step].key;

      const syncUrl = () => {
        const parts = [];
        if (state.sec !== 'all') parts.push('s=' + encodeURIComponent(state.sec));
        if (state.step) parts.push('step=' + encodeURIComponent(state.step));
        if (state.role) parts.push('who=' + encodeURIComponent(state.role));
        const h = '#/process' + (parts.length ? '?' + parts.join('&') : '');
        try { if (window.history && history.replaceState && location.hash !== h) history.replaceState(null, '', h); } catch (e) { /* file:// in some browsers */ }
      };

      const draw = () => {
        const me = NA.role();
        const flows = state.sec === 'roles' ? [] : state.sec === 'all' ? SECTIONS : SECTIONS.filter((s) => s.key === state.sec);
        const chip = state.role
          ? `<button type="button" class="chip active" data-act="role" data-role="" aria-pressed="true">${NA.icon('user', 14)}${esc(state.role === me ? 'Your steps' : 'Steps for ' + NA.roleLabel(state.role))}${NA.icon('x', 14)}</button>`
          : `<button type="button" class="chip" data-act="role" data-role="${esc(me)}" aria-pressed="false">${NA.icon('user', 14)}Only my steps</button>`;
        root.innerHTML = `
          ${NA.ui.pageHead({ title: 'How we work', subtitle: 'Every step from the first call to the after-sales service: who does it, and where someone must say yes.' })}
          <div class="pm-bar">
            <div class="pill-tabs" role="tablist" aria-label="Part of the business">${TABS.map((t) => `<button type="button" role="tab" aria-selected="${t.key === state.sec ? 'true' : 'false'}" class="${t.key === state.sec ? 'active' : ''}" data-act="sec" data-sec="${esc(t.key)}">${esc(t.label)}</button>`).join('')}</div>
            <div class="pm-bar-side">${chip}${NA.ui.btn('Take the tour', { kind: state.step ? 'ghost' : 'primary', icon: 'arrow-right', act: 'tour' })}</div>
          </div>
          ${state.sec === 'all' ? overviewHtml() : ''}
          ${flows.length ? `<div class="pm-sections ${state.role ? 'pm-dim' : ''}">${flows.map((s) => sectionHtml(s, state)).join('')}</div>` : ''}
          ${state.sec === 'all' || state.sec === 'roles' ? rolesHtml() + approvalsHtml() : ''}`;
      };

      const mainEl = () => (document.getElementById ? document.getElementById('main') : null);
      /** Keep the open step in view: its lane when we jump to it, otherwise just the card under it. */
      const reveal = (how) => {
        if (!state.step) return;
        const node = root.querySelector(`[data-step="${state.step}"]`);
        if (node && node.focus) { try { node.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
        const lane = how === 'jump' && node && node.closest ? node.closest('.pm-lane') : null;
        const el = lane || root.querySelector('#pm-detail');
        if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: lane ? 'start' : 'nearest', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); } }
      };
      const select = (id, how) => {
        const before = state.step;
        state.step = id && S[id] ? id : null;
        shownStep = state.step;
        if (state.step && (state.sec === 'roles' || (state.sec !== 'all' && SEC_OF[state.step].key !== state.sec))) state.sec = SEC_OF[state.step].key;
        draw(); syncUrl();
        reveal(how === 'step' && before && LANE_OF[before] !== LANE_OF[state.step] ? 'jump' : how);
      };

      draw();
      if (state.step && state.step !== shownStep) setTimeout(() => reveal('jump'), 60);
      shownStep = state.step;

      const offs = [
        NA.ui.delegate(root, 'click', '[data-step]', (el) => select(el.dataset.step === state.step ? null : el.dataset.step, 'click')),
        NA.ui.delegate(root, 'click', '[data-jump]', (el) => select(el.dataset.jump, 'jump')),
        NA.ui.delegate(root, 'click', '[data-act]', (el) => {
          const act = el.dataset.act;
          if (act === 'sec') {
            const fromHead = !!(el.closest && el.closest('.pm-sec-head'));
            state.sec = TABS.some((t) => t.key === el.dataset.sec) ? el.dataset.sec : 'all';
            if (state.step && (state.sec === 'roles' || (state.sec !== 'all' && SEC_OF[state.step].key !== state.sec))) state.step = null;
            draw(); syncUrl();
            const m = mainEl(); if (m && fromHead) m.scrollTop = 0;
          } else if (act === 'tour') {
            const seq = tourOf(state);
            const pool = state.sec === 'all' || state.sec === 'roles' ? seq : seq.filter((id) => SEC_OF[id].key === state.sec);
            select(pool[0] || seq[0], 'jump');
          } else if (act === 'next' || act === 'prev') {
            const nb = state.step ? neighbours(state.step, state) : null;
            const to = nb && (act === 'next' ? nb.next : nb.prev);
            if (!to) return;
            select(to, 'step');
            // Keep the keyboard on the same button, so pressing Enter again keeps going.
            const b = root.querySelector(`#pm-detail [data-act="${act}"]`);
            if (b && !b.disabled && b.focus) { try { b.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
          } else if (act === 'close') {
            const was = state.step;
            select(null);
            const n = was && root.querySelector(`[data-step="${was}"]`);
            if (n && n.focus) { try { n.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
          } else if (act === 'role') {
            const fromCard = !!(el.closest && el.closest('.pm-role'));
            state.role = isRoleKey(el.dataset.role) ? el.dataset.role : '';
            if (state.role && state.sec === 'roles') state.sec = 'all';
            draw(); syncUrl();
            const m = mainEl(); if (m && fromCard) m.scrollTop = 0;
          } else if (act === 'do') {
            const fn = NA.actions && NA.actions[el.dataset.action];
            if (typeof fn === 'function') fn();
          }
        }),
      ];
      const onKey = (e) => {
        if (!state.step || e.metaKey || e.ctrlKey || e.altKey) return;
        if (/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
        if (document.querySelector('.overlay')) return;
        const nb = neighbours(state.step, state);
        if (e.key === 'ArrowRight' && nb.next) { e.preventDefault(); select(nb.next, 'step'); }
        else if (e.key === 'ArrowLeft' && nb.prev) { e.preventDefault(); select(nb.prev, 'step'); }
        else if (e.key === 'Escape') { e.preventDefault(); select(null); }
      };
      document.addEventListener('keydown', onKey);
      return () => {
        offs.forEach((off) => off());
        document.removeEventListener('keydown', onKey);
        // Leaving the page (not a re-draw of it): the next visit scrolls to its step again.
        try { if (NA.currentRoute().section !== 'process') shownStep = null; } catch (e) { shownStep = null; }
      };
    },
  });
})();
