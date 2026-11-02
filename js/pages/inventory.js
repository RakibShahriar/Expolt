/* ==========================================================================
   Vehicles — every car we own, one VIN at a time.

   On the way → arrival check → available → sold (VIN given to a fully paid
   order) → delivered. A car that fails the arrival check, or comes back from a
   cancelled order, is put on hold until Purchasing releases it with a note.
   Cars move between Gulshan Warehouse and Uttara Showroom with a gate pass and
   are confirmed at the other end before the location changes.

   Sales consultants get a simple availability view (model, colour, where it
   is, whether it can be sold, when it arrives). Costs only for people who may
   see them. VINs are given to customers only by the Sales Manager, Accounts or
   the Managing Director, oldest fully-paid order first.

   Routes:  #/inventory[?tab=available|arriving|hold|demo|sold|delivered|all][&model=][&color=][&loc=]
            #/inventory/<vehicleId>
   Actions: NA.actions.pdiModal(opts), NA.actions.recordPDI(vehicleId, opts),
            NA.actions.transferVehicle(vehicleId), NA.actions.assignVehicle(vehicleId, orderId),
            NA.actions.addVehicle()
   Shared:  NA.stock — status words, paint swatches, the car drawing, VIN rules.
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
  if (A && A.LINKS) A.LINKS.vehicles = (id) => '#/inventory/' + id;

  /* ------------------------------------------------------------------ CSS */
  function injectCss() {
    if (typeof document === 'undefined' || !document.head || document.getElementById('css-inventory')) return;
    const s = document.createElement('style');
    s.id = 'css-inventory';
    s.textContent = `
      .page-inventory .tabs { margin-bottom: 0; }
      .iv-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
      .iv-bar .toolbar { margin-bottom: 0; }
      .iv-search { flex: 1; min-width: 200px; max-width: 360px; }
      .iv-tokens { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
      .iv-token { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 12px; border: 0; border-radius: 999px; background: var(--tint-soft); color: var(--tint); font-size: 13px; font-weight: 500; cursor: pointer; }
      .iv-token .ico { width: 14px; height: 14px; }
      .iv-count { color: var(--muted); font-size: 13px; margin-bottom: 12px; }
      .iv-todo { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-bottom: 28px; }
      .iv-todo .alert-row { margin: 0; background: var(--surface); box-shadow: var(--shadow-sm); }
      .iv-todo .alert-row:hover { background: var(--surface-2); }
      .iv-todo .alert-row b { display: block; font-weight: 600; letter-spacing: -.01em; }
      .iv-todo .alert-row small { display: block; color: var(--muted); font-size: 12.5px; }
      .iv-ar-ico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none; color: #fff; }
      .iv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
      .iv-card { display: flex; flex-direction: column; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden; transition: box-shadow .2s var(--ease), transform .2s var(--ease); min-width: 0; }
      .iv-card:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
      .iv-art { position: relative; height: 116px; background: var(--fill-3); display: grid; place-items: center; }
      .iv-art .iv-tl { position: absolute; top: 12px; left: 12px; }
      .iv-art .iv-tr { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 70%; }
      .iv-card-body { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
      .iv-card-title { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 15px; letter-spacing: -.01em; }
      .iv-card-title span { color: var(--muted); font-weight: 400; font-size: 13px; }
      .iv-card-sub { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
      .iv-vin { font-family: var(--mono); font-size: 12px; letter-spacing: .04em; color: var(--ink-2); overflow-wrap: anywhere; margin-top: 2px; }
      .iv-card-foot { margin-top: auto; padding-top: 12px; font-size: 13px; color: var(--muted); display: flex; justify-content: space-between; gap: 8px; }
      .iv-card-foot b { color: var(--ink); font-weight: 500; }
      .iv-sw { display: inline-block; width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--line); vertical-align: -1px; flex: none; }
      .iv-sw-lg { width: 16px; height: 16px; }
      .iv-svg { display: block; max-width: 100%; height: auto; }
      .iv-svg .iv-s { fill: var(--fill); }
      .iv-svg .iv-b { stroke: var(--line); stroke-width: 1; }
      .iv-svg .iv-g { fill: var(--surface-3); opacity: .92; }
      .iv-svg .iv-t { fill: var(--ink-2); }
      .iv-svg .iv-h { fill: var(--surface); }
      .iv-hero { display: flex; gap: 28px; align-items: center; padding: 24px; flex-wrap: wrap; }
      .iv-hero .iv-art { width: 280px; height: 140px; border-radius: 14px; flex: none; }
      .iv-facts { flex: 1; min-width: 220px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
      .iv-facts small { display: block; color: var(--muted); font-size: 12.5px; }
      .iv-facts b { display: block; font-size: 17px; font-weight: 600; letter-spacing: -.015em; margin-top: 3px; overflow-wrap: anywhere; }
      .iv-stack { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
      .iv-block { margin-bottom: 24px; }
      .iv-ns-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .page-inventory .next-step.iv-done { background: var(--green-50); }
      .page-inventory .next-step.iv-done .ns-icon { background: var(--green-solid); }
      .page-inventory .next-step.iv-stop { background: var(--red-50); }
      .page-inventory .next-step.iv-stop .ns-icon { background: var(--red-solid); }
      .page-inventory .next-step.iv-wait { background: var(--amber-50); }
      .page-inventory .next-step.iv-wait .ns-icon { background: var(--amber-solid); }
      .iv-also { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
      .iv-ok { color: var(--green); } .iv-bad { color: var(--red); }
      .iv-overview { margin-top: 36px; }
      .iv-overview > summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 15px; color: var(--ink-2); }
      .iv-overview > summary::-webkit-details-marker { display: none; }
      .iv-overview > summary .ico { transition: transform .2s var(--ease); color: var(--muted); }
      .iv-overview[open] > summary .ico { transform: rotate(180deg); }
      .iv-loc-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--fill); margin-top: 8px; }
      .iv-loc-bar i { display: block; height: 100%; }
      .iv-q-row .gl-main small { white-space: normal; }
      .iv-mb { margin-bottom: 16px; }
      .iv-vin-check { padding: 16px 18px; border-radius: 14px; background: var(--fill-3); margin-bottom: 20px; }
      .iv-vin-big { font-family: var(--mono); font-size: 19px; letter-spacing: .08em; font-weight: 600; margin-top: 4px; overflow-wrap: anywhere; }
      .iv-checks { border-radius: 14px; background: var(--fill-3); }
      .iv-check { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; min-height: 54px; position: relative; }
      .iv-check + .iv-check::before { content: ''; position: absolute; top: 0; left: 14px; right: 0; height: .5px; background: var(--line-2); }
      .iv-check.invalid { box-shadow: inset 3px 0 0 var(--red-solid); }
      .iv-check-label { min-width: 0; }
      .iv-check-label b { display: block; font-weight: 500; }
      .iv-check-label small { display: block; color: var(--muted); font-size: 12.5px; }
      .iv-pf { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--fill-2); flex: none; }
      .iv-pf label { position: relative; }
      .iv-pf input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
      .iv-pf span { display: inline-flex; align-items: center; height: 32px; padding: 0 16px; border-radius: 7px; font-size: 13.5px; font-weight: 500; color: var(--ink-2); cursor: pointer; user-select: none; }
      .iv-pf input:checked + span { background: var(--raised); box-shadow: var(--shadow-sm); }
      .iv-pf input[value="pass"]:checked + span { color: var(--green); }
      .iv-pf input[value="fail"]:checked + span { color: var(--red); }
      .iv-pf input:focus-visible + span { outline: 2px solid var(--tint); outline-offset: 1px; }
      .iv-gap { margin-top: 20px; }
      .iv-vin-input { font-family: var(--mono); letter-spacing: .06em; text-transform: uppercase; }
      @media (max-width: 900px) {
        .iv-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px) {
        .iv-grid { grid-template-columns: 1fr; }
        .iv-hero { padding: 18px; gap: 18px; }
        .iv-hero .iv-art { width: 100%; }
        .page-inventory .next-step { flex-wrap: wrap; }
        .iv-ns-actions { width: 100%; }
        .iv-search { max-width: none; }
      }`;
    document.head.appendChild(s);
  }

  /* -------------------------------------------------------- who may do what */
  const can = {
    money: () => NA.can('costs.view'),
    stock: () => NA.can('stock.edit'),
    inspect: () => NA.can('stock.edit') || NA.can('service.manage'),
    assign: () => NA.can('vin.assign'),
    demo: () => NA.can('stock.edit') || NA.isRole('sales_manager'),
    confirmMove: () => NA.can('stock.edit') || NA.isRole('sales_manager', 'service', 'service_manager'),
    buying: () => NA.canSee('procurement'),
    service: () => NA.can('service.manage'),
    seller: () => NA.isRole('sales'),
    owner: () => NA.isRole('owner'),
  };
  /** Mirrors the office server: may this person change records of this kind? */
  function canWrite(c) {
    const role = NA.role();
    if (role === 'owner') return true;
    const t = NA.ACCESS && NA.ACCESS[role];
    return t ? t[c] === 'all' : true;
  }
  const stamp = () => ({ by: NA.me().name, byId: NA.myStaffId(), at: new Date().toISOString() });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* --------------------------------------------------------------- statuses */
  // The words come from NA.FLOW.vehicleStatuses, so a car reads the same here as on its order.
  const STATUS = {};
  NA.FLOW.vehicleStatuses.forEach((s) => { STATUS[s.key] = { label: s.label, tone: s.tone, icon: s.icon || 'car' }; });
  /** Older records kept damaged cars in 'pdi' with a flag; today that is 'hold'. */
  const statusOf = (v) => (v.status === 'pdi' && v.pdi && v.pdi.flagged ? 'hold' : v.status || 'available');
  const statusLabel = (k) => (STATUS[k] || { label: k || '—' }).label;
  const holdReasonOf = (v) => v.holdReason || (v.pdi && v.pdi.flagged ? v.pdi.notes || 'Problem found at the arrival check' : '');
  const moving = (v) => !!(v.move && v.move.status === 'moving');
  function statusBadge(v) {
    const k = statusOf(v);
    const s = STATUS[k] || { label: k, tone: 'gray' };
    return ui.badge(s.label, s.tone) + (moving(v) ? ' ' + ui.badge('Moving', 'blue', 'truck') : '')
      + (k === 'available' && v.reservedFor ? ' ' + ui.badge('Reserved', 'indigo') : '');
  }

  /* ----------------------------------------------------------- paint & art */
  // Paint colours are product data (what the car looks like), not interface colours.
  const PAINT = {
    'ski white': '#f4f5f2', 'crystal white': '#f7f7f4', 'aurora white': '#eef0f2', 'arctic white': '#f3f5f7',
    'cosmos black': '#1b1c1f', 'climbing grey': '#8a8f93', 'urban grey': '#6e7378', 'boulder grey': '#8d9094',
    'shark grey': '#5c6166', 'atlantis grey': '#4a5560', 'space blue': '#2c4a73', 'surf blue': '#4c86b8',
    'quartz blue': '#3d5a80', 'arctic blue': '#9cc3dc', 'coral pink': '#f0a39c', 'parkour red': '#b3242b',
    'shadow green': '#3c5246',
  };
  function paintHex(name) {
    const n = String(name || '').toLowerCase().trim();
    if (PAINT[n]) return PAINT[n];
    const guess = [[/white/, '#f4f5f2'], [/black/, '#1b1c1f'], [/silver/, '#c4c8cc'], [/gr[ae]y/, '#7d8287'], [/blue/, '#3f6fa3'],
      [/red/, '#b3242b'], [/pink/, '#f0a39c'], [/green/, '#3c5246'], [/yellow|gold/, '#d9b13b']].find(([re]) => re.test(n));
    return guess ? guess[1] : '#c8ced3';
  }
  const swatch = (c, lg) => `<span class="iv-sw ${lg ? 'iv-sw-lg' : ''}" style="background:${paintHex(c)}" aria-hidden="true"></span>`;
  /** Side view of a car in its paint colour. */
  function carArt(color, w = 132) {
    const h = Math.round(w * 50 / 120);
    return `<svg class="iv-svg" viewBox="0 0 120 50" width="${w}" height="${h}" aria-hidden="true">
      <ellipse class="iv-s" cx="60" cy="45.6" rx="52" ry="2.4"/>
      <path class="iv-b" style="fill:${paintHex(color)}" d="M6 38V31c0-3 2-5 6-6l16-3 14-9c3-2 6-3 10-3h22c5 0 9 2 12 5l8 7 12 2c4 1 7 3 7 7v7z"/>
      <path class="iv-g" d="M45 15c2-1.5 4-2 7-2h9v9H34z"/><path class="iv-g" d="M65 13h9c4 0 7 1.5 9.5 4l5 5H65z"/>
      <circle class="iv-t" cx="30" cy="38" r="7.5"/><circle class="iv-h" cx="30" cy="38" r="3"/>
      <circle class="iv-t" cx="92" cy="38" r="7.5"/><circle class="iv-h" cx="92" cy="38" r="3"/>
    </svg>`;
  }

  /* ------------------------------------------------------ places and ageing */
  const locations = () => (NA.db.settings.locations && NA.db.settings.locations.length ? NA.db.settings.locations : ['Gulshan Warehouse', 'Uttara Showroom']);
  const locIcon = (l) => (/ware/i.test(l || '') ? 'warehouse' : /show/i.test(l || '') ? 'store' : /transit/i.test(l || '') ? 'truck' : /customer/i.test(l || '') ? 'user' : 'map-pin');
  const AGEING = ['pdi', 'available', 'hold', 'demo'];
  function ageDays(v) {
    if (!AGEING.includes(statusOf(v))) return null;
    const from = v.arrivedAt || String(v.createdAt || '').slice(0, 10);
    return from ? Math.max(0, NA.daysBetween(from, NA.today())) : null;
  }
  function ageBadge(v) {
    const d = ageDays(v);
    if (d == null) return '';
    if (d >= 180) return ui.badge('Over 6 months', 'red', 'alert');
    if (d >= 90) return ui.badge(d + ' days', 'red', 'clock');
    if (d >= 60) return ui.badge(d + ' days', 'amber', 'clock');
    return ui.badge(d === 1 ? '1 day' : d + ' days', 'gray');
  }
  function etaOf(v) {
    if (v.eta) return v.eta;
    const po = v.poId ? NA.get('purchaseOrders', v.poId) : null;
    const lot = po && v.lotNo ? (po.lots || []).find((l) => l.lotNo === v.lotNo) : null;
    return (lot && lot.eta) || '';
  }
  function etaText(eta) {
    if (!eta) return 'Arrival date not known yet';
    const d = NA.daysBetween(NA.today(), eta);
    if (d === 0) return 'Arrives today';
    return d > 0 ? `Arrives ${F.dateShort(eta)} · in ${plural(d, 'day')}` : `Was due ${F.dateShort(eta)} · ${plural(-d, 'day')} late`;
  }
  const whereText = (v) => (moving(v) ? `${v.move.from || '—'} → ${v.move.to}` : statusOf(v) === 'in_transit' ? 'On the way' : v.location || '—');

  /* -------------------------------------------------------------- VIN rules */
  const cleanVin = (raw) => String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  /** Why this VIN cannot be used (null when it is fine). opts: {exceptVehicleId, exceptUnitId, taken: Set} */
  function vinProblem(raw, opts) {
    opts = opts || {};
    const vin = cleanVin(raw);
    if (!vin) return 'Enter the VIN';
    if (!/^[A-Z0-9]+$/.test(vin)) return 'Use letters and numbers only';
    if (vin.length !== 17) return `A VIN has 17 characters — this one has ${vin.length}`;
    if (/[IOQ]/.test(vin)) return 'A VIN never has the letters I, O or Q — check for 1 (one) or 0 (zero)';
    if (opts.taken && opts.taken.has(vin)) return 'This VIN is typed twice';
    const v = NA.vehicleByVin(vin);
    if (v && v.id !== opts.exceptVehicleId) {
      const k = statusOf(v);
      if (k === 'delivered') return 'This VIN belongs to a car already delivered to a customer';
      if (k === 'in_transit') return `This VIN is already on its way to us (${NA.modelName(v.modelId)})`;
      return `This VIN is already in stock (${NA.modelName(v.modelId)} · ${statusLabel(k).toLowerCase()})`;
    }
    for (const po of NA.db.purchaseOrders || []) {
      for (const u of po.units || []) {
        if (u.id === opts.exceptUnitId || (opts.exceptVehicleId && u.vehicleId === opts.exceptVehicleId)) continue;
        if (u.vin && cleanVin(u.vin) === vin) return 'This VIN is already used on ' + po.code;
      }
    }
    return null;
  }
  /** Live feedback under a VIN input: count and whether it looks right. */
  function wireVin(input, opts) {
    if (!input || !input.addEventListener) return;
    const help = input.parentNode && input.parentNode.querySelector ? input.parentNode.querySelector('.help') : null;
    const base = help ? help.textContent : '';
    const upd = () => {
      const c = cleanVin(input.value);
      if (!help) return;
      if (!c) { help.textContent = base; help.className = 'help'; return; }
      const p = vinProblem(c, typeof opts === 'function' ? opts() : opts);
      help.textContent = `${c.length}/17 · ${p || 'Looks right'}`;
      help.className = 'help ' + (p ? (c.length < 17 ? '' : 'iv-bad') : 'iv-ok');
    };
    input.addEventListener('input', upd);
    upd();
  }
  const vinField = (name, label, value, help) => `<div class="field span-2"><label>${esc(label)} <i class="req">*</i></label>
      <input name="${name}" class="iv-vin-input" maxlength="17" autocomplete="off" spellcheck="false" value="${esc(value || '')}" placeholder="17 letters and numbers"/>
      <small class="help">${esc(help || 'Exactly 17 characters — never I, O or Q')}</small></div>`;

  function markBad(el, name, msg) {
    const f = el.querySelector(`[name="${name}"]`);
    if (f && f.closest) { const box = f.closest('.field') || f.closest('.check'); if (box) box.classList.add('invalid'); try { f.focus(); } catch (e) { /* ignore */ } }
    ui.toast(msg, 'error');
    return false;
  }

  /* ========================================================= ARRIVAL CHECK */
  const PDI_ITEMS = [
    { key: 'vin', label: 'VIN on the car matches the papers', hint: 'Chassis plate and windscreen' },
    { key: 'keys', label: 'Two keys', missing: 'second key' },
    { key: 'cable', label: 'Charging cable', missing: 'charging cable' },
    { key: 'manuals', label: 'Manuals and papers', missing: 'manuals or papers' },
    { key: 'body', label: 'Body and paint', hint: 'No scratches, dents or chips', damage: true },
    { key: 'interior', label: 'Interior', hint: 'Seats, trim and carpets clean and undamaged', damage: true },
    { key: 'works', label: 'Lights, screen and 12V battery work' },
  ];
  // Checklist of the older form (kept to show inspections done before the change).
  const OLD_CHECKS = ['Exterior & paint', 'Interior & seats', 'Tyres & wheels', 'Lights & indicators', 'Charging port & cable', '12V battery', 'Infotainment & software', 'Keys × 2 & manuals'];

  function inspectorOptions() {
    const myId = NA.myStaffId();
    const out = [{ value: myId || '', label: NA.me().name + ' (you)' }];
    NA.staffBy(['Technician', 'Service Advisor', 'Service Manager', 'Procurement']).forEach((s) => { if (s.id !== myId) out.push({ value: s.id, label: s.name }); });
    return out;
  }
  const pfRow = (it) => `<div class="iv-check" data-pf="${it.key}">
      <div class="iv-check-label"><b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</div>
      <div class="iv-pf" role="radiogroup" aria-label="${esc(it.label)}">
        <label><input type="radio" name="pf_${it.key}" value="pass"/><span>Pass</span></label>
        <label><input type="radio" name="pf_${it.key}" value="fail"/><span>Fail</span></label>
      </div></div>`;

  /** The arrival check (pre-delivery inspection) form. Writes nothing itself.
      opts: {title, subtitle, vin, arrival (ask date + place), values:{arrivalDate, location, odometer}, onSave(res) -> false keeps it open}
      res:  {status: 'available'|'hold', holdReason, arrivalDate, location, odometer, pdi:{…}} */
  NA.actions.pdiModal = function (opts) {
    opts = opts || {};
    injectCss();   // the form may open from Purchasing before this page was ever shown
    const locs = locations();
    const vals = Object.assign({ arrivalDate: NA.today(), location: locs[0], odometer: 0 }, opts.values || {});
    if (!locs.includes(vals.location)) vals.location = locs[0];
    const staff = inspectorOptions();
    const body = `<form class="modal-form" onsubmit="return false">
      ${opts.vin ? `<div class="iv-vin-check"><span class="eyebrow">Check this VIN on the car</span><div class="iv-vin-big">${esc(opts.vin)}</div></div>` : ''}
      ${opts.arrival ? `<div class="form-grid iv-mb">
        ${ui.field({ name: 'arrivalDate', label: 'Arrived on', type: 'date', required: true, max: NA.today() }, vals.arrivalDate)}
        ${ui.field({ name: 'odometer', label: 'Odometer (km)', type: 'number', min: 0, step: 1 }, vals.odometer)}
        ${ui.field({ name: 'location', label: 'Parked at', type: 'radio-cards', required: true, span: 2, options: locs.map((l) => ({ value: l, label: l, icon: locIcon(l) })) }, vals.location)}
      </div>` : ''}
      <div class="glist-title">Checklist — mark every item</div>
      <div class="iv-checks">${PDI_ITEMS.map(pfRow).join('')}</div>
      <div class="hidden iv-gap" data-severity>${ui.field({ name: 'severity', label: 'How bad is the damage?', type: 'radio-cards', options: [
        { value: 'Minor', label: 'Minor', hint: 'A small scratch or dent' },
        { value: 'Major', label: 'Major', hint: 'Needs a body shop or a claim' },
      ] })}</div>
      <div class="form-grid iv-gap">
        ${ui.field({ name: 'batterySoh', label: 'Battery health (%)', type: 'number', min: 0, max: 100, step: 1, required: true, placeholder: 'e.g. 100' }, vals.batterySoh)}
        ${opts.arrival ? '' : ui.field({ name: 'odometer', label: 'Odometer (km)', type: 'number', min: 0, step: 1 }, vals.odometer)}
        ${ui.field({ name: 'notes', label: 'Notes', type: 'textarea', rows: 2, span: 2, placeholder: 'What is wrong or missing? Needed when anything fails.' }, vals.notes)}
        ${ui.field({ name: 'by', label: 'Inspected by', type: 'select', span: 2, placeholder: false, options: staff }, NA.myStaffId() || '')}
      </div>
      <p class="help mt-12">Any failed item or battery health under 90% puts the car on hold. Purchasing releases it once it is fixed.</p>
    </form>`;
    return ui.modal({
      title: opts.title || 'Arrival check', subtitle: esc(opts.subtitle || ''), size: 'lg', body,
      onMount: (el) => {
        const sev = el.querySelector('[data-severity]');
        const syncSev = () => {
          const dmg = PDI_ITEMS.some((it) => it.damage && el.querySelector(`[name="pf_${it.key}"][value="fail"]`) && el.querySelector(`[name="pf_${it.key}"][value="fail"]`).checked);
          if (sev && sev.classList) sev.classList.toggle('hidden', !dmg);
        };
        el.addEventListener('change', (e) => {
          const row = e.target && e.target.closest ? e.target.closest('.iv-check') : null;
          if (row) row.classList.remove('invalid');
          const f = e.target && e.target.closest ? e.target.closest('.field') : null;
          if (f) f.classList.remove('invalid');
          syncSev();
        });
        el.addEventListener('input', (e) => { const f = e.target && e.target.closest ? e.target.closest('.field') : null; if (f) f.classList.remove('invalid'); });
      },
      actions: [{ label: 'Cancel' }, {
        label: 'Save check', kind: 'primary', onClick: (el) => {
          const form = el.querySelector('form');
          const v = ui.readForm(form);
          const open = PDI_ITEMS.filter((it) => !v['pf_' + it.key]);
          if (open.length) {
            open.forEach((it) => { const row = form.querySelector(`[data-pf="${it.key}"]`); if (row) row.classList.add('invalid'); });
            ui.toast(`Mark every item as pass or fail — ${plural(open.length, 'item')} left`, 'error');
            return false;
          }
          if (!ui.validate(form)) return false;
          const soh = Number(v.batterySoh);
          if (v.batterySoh === '' || !(soh >= 0 && soh <= 100)) return markBad(form, 'batterySoh', 'Battery health is a number from 0 to 100');
          if (opts.arrival && v.arrivalDate > NA.today()) return markBad(form, 'arrivalDate', 'The arrival date is in the future');
          const failed = PDI_ITEMS.filter((it) => v['pf_' + it.key] === 'fail');
          const damage = failed.some((it) => it.damage);
          if (damage && !v.severity) { ui.toast('Choose how bad the damage is', 'error'); return false; }
          const problem = failed.length > 0 || soh < 90;
          if (problem && !v.notes) return markBad(form, 'notes', 'Describe what is wrong or missing');
          const reasons = [];
          if (failed.some((it) => it.key === 'vin')) reasons.push('VIN does not match the papers');
          const missing = failed.filter((it) => it.missing).map((it) => it.missing);
          if (missing.length) reasons.push('Missing ' + missing.join(', '));
          if (damage) reasons.push(v.severity + ' damage');
          if (failed.some((it) => it.key === 'works')) reasons.push('Something does not work');
          if (soh < 90) reasons.push('Battery health ' + soh + '%');
          const by = staff.find((s) => s.value === v.by) || staff[0];
          const items = {};
          PDI_ITEMS.forEach((it) => { items[it.key] = v['pf_' + it.key]; });
          const res = {
            status: problem ? 'hold' : 'available',
            holdReason: problem ? reasons.join(' · ') + (v.notes ? ' — ' + v.notes : '') : '',
            arrivalDate: v.arrivalDate || NA.today(), location: v.location || null, odometer: Number(v.odometer) || 0,
            pdi: {
              date: opts.arrival ? (v.arrivalDate || NA.today()) : NA.today(), vinVerified: !failed.some((it) => it.key === 'vin'),
              damageCheck: damage ? v.severity : 'OK', notes: v.notes || (problem ? '' : 'All OK'), batterySoh: soh, odometer: Number(v.odometer) || 0,
              by: v.by || '', byName: by ? by.label.replace(/ \(you\)$/, '') : NA.me().name,
              checks: PDI_ITEMS.filter((it) => items[it.key] === 'pass').map((it) => it.label), failed: failed.map((it) => it.label),
              items, flagged: problem, at: new Date().toISOString(),
            },
          };
          const r = opts.onSave ? opts.onSave(res) : true;
          return r !== false;
        },
      }],
    });
  };

  /** Write an arrival check onto the car and decide its status. Returns a short result for the toast. */
  function applyPdi(v, res, arrival) {
    const cur = statusOf(v);
    const patch = { pdi: res.pdi, km: Math.max(Number(v.km) || 0, res.odometer || 0) };
    if (arrival) { patch.arrivedAt = res.arrivalDate; patch.location = res.location; patch.eta = ''; }
    let out;
    if (cur === 'allocated') {
      // A sold car keeps a recorded hold until Purchasing releases it with a note: a passing check does not lift it.
      if (res.status === 'hold') Object.assign(patch, { holdReason: res.holdReason, hold: Object.assign({ from: 'inspection' }, stamp()) });
      else patch.holdReason = v.holdReason || '';
      out = res.status === 'hold' ? 'Saved — the handover is blocked until this is fixed'
        : v.holdReason ? (can.stock() ? 'Passed — release the hold with a note when the car is ready' : 'Passed — Purchasing can now release the hold') : 'Check saved';
    } else if (res.status === 'hold') {
      Object.assign(patch, { status: 'hold', holdReason: res.holdReason, hold: Object.assign({ from: 'inspection' }, stamp()) });
      out = 'Saved — the car is on hold';
    } else if (cur === 'hold') {
      // Passing a check never lifts a hold by itself: someone with stock rights releases it with a note.
      Object.assign(patch, { status: 'hold', holdReason: holdReasonOf(v) });
      out = v.addApproval && v.addApproval.status !== 'approved' ? 'Passed — the car stays on hold until the Managing Director approves adding it'
        : can.stock() ? 'Passed — release the hold with a note when the car is ready' : 'Passed — Purchasing can now release the hold';
    } else if (cur === 'demo') {
      out = 'Check saved';
    } else {
      Object.assign(patch, { status: 'available', holdReason: '' });
      out = 'Passed — the car is ready to sell';
    }
    NA.update('vehicles', v.id, patch);
    NA.log(`${arrival ? 'Arrival check' : 'Inspection'} for VIN ${v.vin}${arrival ? ' at ' + res.location : ''} — ${res.status === 'hold' ? 'on hold: ' + res.holdReason : 'passed'}`,
      { rec: v, link: '#/inventory/' + v.id, kind: res.status === 'hold' ? 'warn' : 'success' });
    return out;
  }

  /** Inspect a car (on arrival, or again later). opts: {arrival, title, onSaved(vehicle, res), direct}
      A car on a purchase order goes through Purchasing's receiveUnit first (unless direct), so whoever checks it —
      from Vehicles, Today or Purchasing — its order's car is marked received at the same time. */
  NA.actions.recordPDI = function (vehicleId, opts) {
    opts = opts || {};
    const v = NA.vehicle(vehicleId);
    if (!v) { ui.toast('This car is not in the list', 'error'); return null; }
    if (!can.inspect()) { ui.toast('Arrival checks are done by Purchasing or the workshop', 'info'); return null; }
    if (v.status === 'delivered') { ui.toast('This car is with the customer — open a service job card instead', 'info'); return null; }
    if (moving(v)) { ui.toast('The car is being moved — confirm it arrived first', 'info'); return null; }
    if (v.poId && !opts.direct && !opts.onSaved && typeof NA.actions.receiveUnit === 'function') return NA.actions.receiveUnit(vehicleId, opts);
    const arrival = opts.arrival != null ? opts.arrival : (v.status === 'in_transit' || !v.arrivedAt);
    return NA.actions.pdiModal({
      title: opts.title || (arrival ? 'Check on arrival' : 'Inspect the car'),
      subtitle: `${NA.modelName(v.modelId)} · ${v.color || ''}`,
      vin: v.vin, arrival,
      values: { arrivalDate: NA.today(), location: v.location, odometer: v.km || 0 },
      onSave: (res) => {
        const msg = applyPdi(v, res, arrival);
        ui.toast(msg, res.status === 'hold' ? 'info' : 'success');
        if (typeof opts.onSaved === 'function') { try { opts.onSaved(NA.vehicle(v.id), res); } catch (e) { console.error(e); } }
        NA.refresh();
        return true;
      },
    });
  };

  /* -------------------------------------------------------------- holds */
  /** Was this check done after the car was put on hold? */
  const checkedAfter = (p, h) => !!p && !!h && (p.at ? String(p.at) >= String(h.at || '') : String(p.date || '') >= String(h.at || '').slice(0, 10));
  /** A car back from a cancelled order is checked again before it is sold (unless that was done after it came back). */
  const freshCheck = (v) => !!v.pdi && !(v.hold && v.hold.from === 'cancellation' && !checkedAfter(v.pdi, v.hold));
  function releaseHoldOp(v, { how, note }) {
    const cur = statusOf(v);
    const resolved = Object.assign({ how, note, reason: holdReasonOf(v) }, stamp());
    const patch = { holdReason: '', holdResolved: resolved, hold: null };
    // Only the Managing Director gets here with a car whose adding was declined or withdrawn: releasing it is their approval.
    if (addRefused(v)) patch.addApproval = Object.assign({}, v.addApproval, { status: 'approved', note: 'Released from hold' }, stamp());
    if (cur !== 'allocated') patch.status = freshCheck(v) ? 'available' : 'pdi';
    if (v.pdi && (v.pdi.flagged || v.pdi.damageCheck !== 'OK')) patch.pdi = Object.assign({}, v.pdi, { damageCheck: 'OK', flagged: false, resolved });
    NA.update('vehicles', v.id, patch);
    NA.log(`VIN ${v.vin} released from hold — ${how}: ${note}`, { rec: v, link: '#/inventory/' + v.id, kind: 'success' });
    return patch.status || cur;
  }
  /** A car added without a purchase order that the Managing Director has not approved: declined, or the request was
      withdrawn. It stays on hold; only the Managing Director may release it (or Purchasing asks again). */
  const addRefused = (v) => !!v.addApproval && !['approved', 'pending'].includes(v.addApproval.status);
  function releaseHold(v) {
    if (!can.stock()) return ui.toast('Purchasing releases cars from hold', 'info');
    if (v.addApproval && v.addApproval.status === 'pending') return ui.toast('Waiting for the Managing Director to approve this car', 'info');
    if (addRefused(v) && !can.owner()) return ui.toast('The Managing Director has not approved adding this car — ask again', 'info');
    const options = [
      { value: 'Repaired', label: 'Repaired', icon: 'wrench', hint: 'Fixed in the workshop or a body shop' },
      { value: 'Claim filed', label: 'Claim filed', icon: 'file-text', hint: 'Claimed from BYD or the insurer — fit to sell' },
      { value: 'Missing item found', label: 'Missing item found', icon: 'key', hint: 'Key, cable or papers are with the car now' },
    ];
    if (can.owner()) options.push({ value: 'Accepted as it is', label: 'Accepted as it is', icon: 'check-circle', hint: 'Sold as it is, with your agreement' });
    ui.formModal({
      title: 'Release from hold', subtitle: esc(`${NA.modelName(v.modelId)} · ${v.vin}`), submitLabel: freshCheck(v) || statusOf(v) === 'allocated' ? 'Release to stock' : 'Release — inspect next',
      intro: `<div class="callout callout-warn iv-mb">${NA.icon('alert')}<div><b>On hold:</b> ${esc(holdReasonOf(v) || 'No reason recorded')}</div></div>`,
      fields: [
        { name: 'how', label: 'What was done?', type: 'radio-cards', required: true, span: 2, options },
        { name: 'note', label: 'Note', type: 'textarea', rows: 2, span: 2, required: true, placeholder: 'e.g. Rear bumper resprayed, job card JC-0142' },
      ],
      onSubmit: (val) => {
        const st = releaseHoldOp(v, val);
        ui.toast(st === 'pdi' ? 'Released — inspect the car before it is sold' : 'Released — the car can be sold');
        NA.refresh();
      },
    });
  }
  /** Send a car added without a purchase order to the Managing Director again (after a decline or a withdrawal). */
  function askAddAgain(v) {
    if (!can.stock() || !A || !NA.ui.requestApproval) return;
    NA.ui.requestApproval({
      type: 'stock_adjust', ref: { c: 'vehicles', id: v.id, code: v.vin }, sheetTitle: 'Ask the Managing Director', amount: 0,
      title: `Add ${[NA.modelName(v.modelId), v.color].filter(Boolean).join(' ')} to stock (${v.source || 'no purchase order'})`,
      detail: `VIN ${v.vin} · ${v.location || '—'}${v.sourceNote ? ' · ' + v.sourceNote : ''}`,
      placeholder: 'e.g. Opening stock — the car has been in the Gulshan yard since before we started',
    }).then((a) => {
      if (!a) return;
      // A pending request keeps the car on hold; one approved at once was already applied by the decision handler.
      if (a.status === 'pending') NA.update('vehicles', v.id, { addApproval: { status: 'pending', id: a.id }, holdReason: 'Waiting for the Managing Director to approve adding this car' });
      NA.refresh();
    });
  }
  function putOnHold(v) {
    if (!can.stock()) return ui.toast('Purchasing puts cars on hold', 'info');
    ui.formModal({
      title: 'Put on hold', subtitle: esc(`${NA.modelName(v.modelId)} · ${v.vin}`), submitLabel: 'Put on hold',
      intro: `<p class="muted iv-mb">The car cannot be sold or given to a customer until it is released.</p>`,
      fields: [{ name: 'reason', label: 'Why?', type: 'textarea', rows: 2, span: 2, required: true, placeholder: 'e.g. Scratch found on the bonnet' }],
      onSubmit: (val) => {
        const patch = { holdReason: val.reason, hold: Object.assign({ from: 'manual' }, stamp()) };
        if (statusOf(v) !== 'allocated') patch.status = 'hold';
        NA.update('vehicles', v.id, patch);
        NA.log(`VIN ${v.vin} put on hold — ${val.reason}`, { rec: v, link: '#/inventory/' + v.id, kind: 'warn' });
        ui.toast('The car is on hold', 'info');
        NA.refresh();
      },
    });
  }

  /* -------------------------------------------------------------- moves */
  /** Drivers first, then you. Everyone else only when the staff list has no driver. */
  function driverOptions() {
    const myId = NA.myStaffId();
    const out = NA.staffBy('Driver').map((s) => ({ value: s.id, label: s.name }));
    const hasDriver = out.length > 0;
    if (myId && !out.some((o) => o.value === myId)) out.push({ value: myId, label: NA.me().name + ' (you)' });
    if (!hasDriver) NA.staffBy(NA.FLOW.staffRoles).forEach((s) => { if (s.id !== myId) out.push({ value: s.id, label: s.name }); });
    return out;
  }
  function dispatchOp(v, { to, driver, date, kmOut, note }) {
    if (moving(v)) return 'This car is already being moved';
    if (!to || to === v.location) return 'Choose where the car goes';
    const km = Number(kmOut) || 0;
    const move = Object.assign({ status: 'moving', from: v.location || '', to, gatePass: NA.nextCode('GP'), driverId: driver || '', driverName: driver ? NA.staffName(driver) : '',
      date: date || NA.today(), kmOut: km || Number(v.km) || 0, note: note || '' }, stamp());
    NA.update('vehicles', v.id, { move, km: Math.max(Number(v.km) || 0, km) });
    NA.log(`Gate pass ${move.gatePass}: VIN ${v.vin} leaving ${move.from || '—'} for ${to}${move.driverName ? ' with ' + move.driverName : ''}`, { rec: v, link: '#/inventory/' + v.id, kind: 'info' });
    return null;
  }
  function receiveMoveOp(v, { kmIn, note }) {
    const m = v.move;
    if (!m || m.status !== 'moving') return 'This car is not being moved';
    const me = stamp();
    const t = { date: NA.today(), from: m.from, to: m.to, by: m.driverId || '', note: m.note || '', at: me.at, gatePass: m.gatePass, driverName: m.driverName,
      issuedBy: m.by, kmOut: m.kmOut, kmIn: Number(kmIn) || null, receivedBy: me.by, receivedById: me.byId, receivedNote: note || '' };
    NA.update('vehicles', v.id, { location: m.to, move: null, km: Math.max(Number(v.km) || 0, Number(kmIn) || 0), transfers: [t].concat(v.transfers || []) });
    NA.log(`VIN ${v.vin} arrived at ${m.to} (gate pass ${m.gatePass}) — received by ${me.by}`, { rec: v, link: '#/inventory/' + v.id, kind: 'success' });
    return null;
  }
  NA.actions.transferVehicle = function (vehicleId) {
    const v = NA.vehicle(vehicleId);
    if (!v) return;
    injectCss();
    if (!can.stock()) return ui.toast('Gate passes are issued by Purchasing', 'info');
    const k = statusOf(v);
    if (k === 'in_transit') return ui.toast('The car has not arrived yet', 'info');
    if (k === 'delivered') return ui.toast('This car is with the customer', 'info');
    if (moving(v)) return ui.toast('This car is already being moved', 'info');
    const to = locations().filter((l) => l !== v.location);
    if (!to.length) return ui.toast('Add a second location in Settings first', 'error');
    const drivers = driverOptions();
    ui.formModal({
      title: 'Move car', subtitle: esc(`${NA.modelName(v.modelId)} · ${v.color || ''} · now at ${v.location || '—'}`), submitLabel: 'Issue gate pass',
      intro: `<p class="muted iv-mb">The driver takes a gate pass. The car shows as moving until someone at the other end confirms it arrived.</p>`,
      fields: [
        { name: 'to', label: 'Move to', type: 'radio-cards', required: true, span: 2, options: to.map((l) => ({ value: l, label: l, icon: locIcon(l) })) },
        { name: 'driver', label: 'Driver', type: 'select', required: true, options: drivers, placeholder: 'Choose the driver' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'kmOut', label: 'Odometer now (km)', type: 'number', min: 0, step: 1 },
        { name: 'note', label: 'Why (optional)', placeholder: 'e.g. For display this weekend' },
      ],
      values: { to: to[0], driver: drivers[0] ? drivers[0].value : '', date: NA.today(), kmOut: v.km || 0 },
      onSubmit: (val) => {
        const err = dispatchOp(v, val);
        if (err) { ui.toast(err, 'error'); return false; }
        ui.toast(`Gate pass ${NA.vehicle(v.id).move.gatePass} issued`);
        NA.refresh();
      },
    });
  };
  function receiveMove(v) {
    if (!can.confirmMove()) return ui.toast('Someone at ' + ((v.move && v.move.to) || 'the other location') + ' confirms the car arrived', 'info');
    const m = v.move;
    ui.formModal({
      title: `Received at ${m.to}`, subtitle: esc(`${NA.modelName(v.modelId)} · ${v.vin} · gate pass ${m.gatePass}`), submitLabel: 'Car arrived', size: 'sm',
      fields: [
        { name: 'kmIn', label: 'Odometer on arrival (km)', type: 'number', min: 0, step: 1 },
        { name: 'note', label: 'Anything wrong? (optional)', type: 'textarea', rows: 2 },
      ],
      values: { kmIn: m.kmOut || v.km || 0 },
      onSubmit: (val) => {
        const err = receiveMoveOp(v, val);
        if (err) { ui.toast(err, 'error'); return false; }
        ui.toast('The car is now at ' + m.to);
        NA.refresh();
      },
    });
  }
  function cancelMove(v) {
    if (!can.stock()) return;
    ui.formModal({
      title: 'Cancel the move', size: 'sm', submitLabel: 'Cancel move',
      fields: [{ name: 'reason', label: 'Why?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Issued by mistake — the car never left' }],
      onSubmit: (val) => {
        const g = v.move && v.move.gatePass;
        NA.update('vehicles', v.id, { move: null });
        NA.log(`Gate pass ${g || ''} cancelled for VIN ${v.vin} — ${val.reason}`, { rec: v, link: '#/inventory/' + v.id, kind: 'warn' });
        ui.toast('Move cancelled', 'info');
        NA.refresh();
      },
    });
  }
  function printGatePass(v) {
    const m = v.move || (v.transfers || [])[0];
    if (!m) return;
    const row = (k, val) => `<tr><th>${esc(k)}</th><td>${esc(val == null || val === '' ? '—' : val)}</td></tr>`;
    ui.print('Gate pass ' + (m.gatePass || ''), `<h1>Gate pass ${esc(m.gatePass || '')}</h1><p class="muted">Vehicle transfer note · ${esc(F.date(m.date))}</p>
      <table>${row('From', m.from)}${row('To', m.to)}${row('Vehicle', NA.modelName(v.modelId) + ' · ' + (v.color || '') + (v.year ? ' · ' + v.year : ''))}
      ${row('VIN', v.vin)}${row('Motor no.', v.motorNo)}${row('Odometer out (km)', m.kmOut)}${row('Driver', m.driverName)}${row('Issued by', m.by || m.issuedBy)}${row('Reason', m.note)}</table>
      <div class="sig"><div>Issued by (store in-charge)</div><div>Driver</div></div>
      <div class="sig"><div>Received by (${esc(m.to || '')})</div><div>Date and time received</div></div>`);
  }

  /* ---------------------------------------------- giving a VIN to a customer */
  /** The date an order became fully paid (first come, first served). */
  function paidUpOn(o) {
    const net = B.orderNet(o);
    const pays = B.orderPayments(o).filter(B.paymentCleared).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let s = 0;
    for (const p of pays) { s += Number(p.amount) || 0; if (net > 0 && s >= net - 0.5) return p.date || ''; }
    return String(o.createdAt || '').slice(0, 10) || NA.today();
  }
  /** Can this person read customer payments? Purchasing cannot: it goes by the order's saved stage instead. */
  const seesPayments = () => NA.isRole('owner') || !!(NA.ACCESS && NA.ACCESS[NA.role()] && NA.ACCESS[NA.role()].payments);
  /** Ready for its VIN (paid in full, or the car before full payment approved, and nothing else in the way). */
  const readyFor = (o) => (seesPayments() ? B.canAssignVin(o) : o.stage === 'vin') && !(o.channel === 'Corporate' && !(o.corporate && o.corporate.docRef));
  /** How far an order is paid, in words that are true for whoever reads them. */
  function paidLine(o, ready) {
    if (!seesPayments()) return o.stage === 'vin' ? 'Ready for its VIN' : o.stage === 'payment' ? 'Part paid · not ready yet' : 'Booked · nothing paid yet';
    if (ready) return B.isFullyPaid(o) ? 'Paid in full on ' + F.date(paidUpOn(o)) : 'Car before full payment approved';
    return Math.round(B.orderPaidPct(o) * 100) + '% paid · not ready';
  }
  /** The customer's name, or '' when this person cannot see customers. */
  const custName = (o) => { const n = NA.customerName(o.customerId); return n === '—' ? '' : n; };
  /** Can this order still take a car? (Not when it already has one, or is past the VIN step.) */
  const canTakeCar = (o) => !!o && !o.vehicleId && ['booking', 'payment', 'vin'].includes(o.stage);
  /** The order a car is kept for has moved on: it has another car, or it is cancelled or delivered. */
  const staleReservation = (v) => { const r = v.reservedFor ? NA.get('orders', v.reservedFor) : null; return !!r && !canTakeCar(r) && r.vehicleId !== v.id; };
  function blockersFor(o) {
    const out = B.vinBlockers(o).slice();
    if (o.channel === 'Corporate' && !(o.corporate && o.corporate.docRef)) out.push('The corporate purchase order or award letter is not on the order yet');
    return out;
  }
  /** Open orders that could take this car: reserved one first, then fully paid (oldest first, matching colour first). */
  function queueFor(v) {
    if (statusOf(v) !== 'available') return [];
    return NA.where('orders', (o) => !o.vehicleId && o.modelId === v.modelId && ['booking', 'payment', 'vin'].includes(o.stage))
      .map((o) => ({ o, ready: readyFor(o), on: paidUpOn(o), colourOk: !o.color || !v.color || o.color === v.color, reserved: v.reservedFor === o.id }))
      .sort((a, b) => (b.reserved - a.reserved) || (b.ready - a.ready) || (b.colourOk - a.colourOk) || String(a.on).localeCompare(String(b.on)));
  }
  /** Give the car to the order. Stores who did it (as the order page does), clears the emergency request and any
      other car kept for this order, so one order never holds two cars. Returns an error message or null. */
  function assignOp(v, o, opts) {
    opts = opts || {};
    try {
      const cur = NA.get('orders', o.id) || o;
      if (!canTakeCar(cur)) return cur.vehicleId ? `${cur.code} already has a car` : `${cur.code} cannot take a car now`;
      const from = cur.color;
      const colour = !!(from && v.color && from !== v.color);
      B.assignVin(cur, v.id);
      const me = stamp();
      const patch = { vinBy: me.by, vinById: me.byId };
      if (cur.emergencyRequest) patch.emergencyRequest = null;
      if (colour) patch.color = v.color;
      NA.update('orders', o.id, patch);
      const ord = NA.get('orders', o.id);
      if (colour) NA.log(`${o.code}: colour changed from ${from} to ${v.color} — the customer agreed`, { rec: ord, link: '#/sales/' + o.id, kind: 'warn' });
      if (v.reservedFor) NA.update('vehicles', v.id, { reservedFor: null });
      NA.where('vehicles', (x) => x.id !== v.id && x.reservedFor === o.id).forEach((x) => {
        NA.update('vehicles', x.id, { reservedFor: null });
        NA.log(`Reservation of VIN ${x.vin} for ${o.code} cleared — the order got VIN ${v.vin}`, { rec: x, link: '#/inventory/' + x.id, kind: 'info' });
      });
      NA.log(`VIN ${v.vin} given to ${o.code}${opts.reason ? ' ahead of an earlier paid order — ' + opts.reason : ''}`, { rec: NA.vehicle(v.id), link: '#/inventory/' + v.id, kind: 'success' });
      return null;
    } catch (e) { return e.message; }
  }
  function assignSheet(v, o) {
    if (!can.assign()) return ui.toast('The Sales Manager or Accounts gives VINs to customers', 'info');
    if (statusOf(v) !== 'available') return ui.toast('Only an available car can be given to a customer', 'error');
    if (!canTakeCar(o)) return ui.toast(o.vehicleId ? `${o.code} already has a car` : `${o.code} cannot take a car now`, 'error');
    if (v.reservedFor && v.reservedFor !== o.id) {
      const r = NA.get('orders', v.reservedFor);
      return ui.toast(`This car is reserved for ${r ? r.code : 'another order'} — clear the reservation first`, 'error');
    }
    if (!readyFor(o)) return ui.toast(blockersFor(o)[0] || 'The order is not ready for a VIN', 'error');
    const q = queueFor(v);
    const mine = q.find((r) => r.o.id === o.id);
    const first = q.find((r) => r.ready && r.colourOk);
    const skipping = !!first && first.o.id !== o.id && !(mine && mine.reserved) && String(first.on) < String(mine ? mine.on : NA.today());
    const colourDiff = !!(o.color && v.color && o.color !== v.color);
    const fields = [];
    if (colourDiff) fields.push({ name: 'agreed', type: 'checkbox', span: 2, label: `The customer agreed to ${v.color} instead of ${o.color}` });
    if (skipping) fields.push({ name: 'reason', label: `${first.o.code} was paid in full earlier (${F.date(first.on)}). Why does ${o.code} get this car first?`, type: 'textarea', rows: 2, span: 2, required: true });
    ui.formModal({
      title: 'Give VIN to customer', size: 'md', submitLabel: 'Give VIN',
      intro: `<div class="glist iv-mb">
          <div class="gl-row"><span class="gl-main"><b>${esc(NA.modelName(v.modelId))} · ${esc(v.color || '')}</b><small class="mono">${esc(v.vin)}</small></span>${swatch(v.color, true)}</div>
          <div class="gl-row"><span class="gl-main"><b>${esc(o.code)}${custName(o) ? ' · ' + esc(custName(o)) : ''}</b><small>${esc(paidLine(o, true))}${o.color ? ' · ordered ' + esc(o.color) : ''}</small></span></div>
        </div>${fields.length ? '' : '<p class="muted">The order moves on to registration (BRTA).</p>'}`,
      fields,
      onSubmit: (val, el) => {
        if (colourDiff && !val.agreed) return markBad(el, 'agreed', 'Confirm the customer agreed to the different colour');
        const err = assignOp(v, o, { reason: val.reason });
        if (err) { ui.toast(err, 'error'); return false; }
        ui.toast(`VIN given to ${o.code} — next: registration`);
        NA.refresh();
      },
    });
  }
  NA.actions.assignVehicle = function (vehicleId, orderId) {
    const v = NA.vehicle(vehicleId), o = NA.get('orders', orderId);
    injectCss();
    if (v && o) assignSheet(v, o);
  };
  function clearReservation(v) {
    if (!(can.assign() || can.stock())) return;
    const r = v.reservedFor && NA.get('orders', v.reservedFor);
    ui.formModal({
      title: 'Clear the reservation', size: 'sm', submitLabel: 'Clear reservation',
      intro: `<p class="muted iv-mb">${esc(r ? r.code + ' will no longer have this car kept for it.' : 'The car becomes free for any order.')}</p>`,
      fields: [{ name: 'reason', label: 'Why?', type: 'textarea', rows: 2, required: true }],
      onSubmit: (val) => {
        NA.update('vehicles', v.id, { reservedFor: null });
        NA.log(`Reservation of VIN ${v.vin}${r ? ' for ' + r.code : ''} cleared — ${val.reason}`, { rec: v, link: '#/inventory/' + v.id, kind: 'warn' });
        ui.toast('Reservation cleared', 'info');
        NA.refresh();
      },
    });
  }

  /* ----------------------------------------------------- demo cars, typos */
  function demoOn(v) {
    ui.formModal({
      title: 'Use as demo car', size: 'sm', submitLabel: 'Make demo car',
      intro: `<p class="muted iv-mb">Demo cars are used for test drives and events and are not offered for sale until they go back to stock.</p>`,
      fields: [{ name: 'note', label: 'Note (optional)', placeholder: 'e.g. Test drives at Uttara Showroom' }],
      onSubmit: (val) => {
        NA.update('vehicles', v.id, { status: 'demo', demo: Object.assign({ since: NA.today(), note: val.note || '' }, stamp()) });
        NA.log(`VIN ${v.vin} is now a demo car${val.note ? ' — ' + val.note : ''}`, { rec: v, link: '#/inventory/' + v.id, kind: 'info' });
        ui.toast('Now a demo car');
        NA.refresh();
      },
    });
  }
  async function demoOff(v) {
    const ok = await ui.confirm(`Put this ${esc(NA.modelName(v.modelId))} back on sale? It will be marked as an ex-demo car.`, { title: 'Back to stock', okLabel: 'Back to stock' });
    if (!ok) return;
    NA.update('vehicles', v.id, { status: 'available', demo: null, wasDemo: true });
    NA.log(`VIN ${v.vin} back in stock after demo use (${F.num(v.km || 0)} km)`, { rec: v, link: '#/inventory/' + v.id, kind: 'info' });
    ui.toast('Back in stock');
    NA.refresh();
  }
  const canFix = (v) => can.owner() || (can.stock() && !v.pdi && ['in_transit', 'pdi'].includes(v.status));
  function fixDetails(v) {
    if (!canFix(v)) return ui.toast('After the arrival check only the Managing Director can change these details', 'info');
    const colors = ui.opts.colors(v.modelId).slice();
    if (v.color && !colors.includes(v.color)) colors.unshift(v.color);
    ui.modal({
      title: 'Fix the car details', subtitle: esc(NA.modelName(v.modelId)), size: 'md',
      body: `<p class="muted iv-mb">For typing mistakes. Every change is kept in the car's history.</p>
        <form class="modal-form" onsubmit="return false"><div class="form-grid">
        ${vinField('vin', 'VIN', v.vin)}
        ${ui.field({ name: 'motorNo', label: 'Motor no.' }, v.motorNo)}
        ${ui.field({ name: 'year', label: 'Model year', type: 'number', min: 2015, max: 2100 }, v.year)}
        ${ui.field({ name: 'color', label: 'Colour', type: 'select', placeholder: false, options: colors, span: 2 }, v.color)}
        ${ui.field({ name: 'reason', label: 'What was wrong?', type: 'textarea', rows: 2, span: 2, required: true, placeholder: 'e.g. VIN typed with a 0 instead of a D' })}
        </div></form>`,
      onMount: (el) => wireVin(el.querySelector('[name="vin"]'), { exceptVehicleId: v.id }),
      actions: [{ label: 'Cancel' }, { label: 'Save changes', kind: 'primary', onClick: (el) => {
        const form = el.querySelector('form');
        if (!ui.validate(form)) return false;
        const val = ui.readForm(form);
        const vin = cleanVin(val.vin);
        const changes = [];
        if (vin !== cleanVin(v.vin)) { const p = vinProblem(vin, { exceptVehicleId: v.id }); if (p) return markBad(form, 'vin', p); changes.push(`VIN ${v.vin} → ${vin}`); }
        if ((val.motorNo || '') !== (v.motorNo || '')) changes.push(`motor no. ${v.motorNo || '—'} → ${val.motorNo || '—'}`);
        if (Number(val.year) && Number(val.year) !== Number(v.year)) changes.push(`year ${v.year || '—'} → ${val.year}`);
        if (val.color && val.color !== v.color) changes.push(`colour ${v.color || '—'} → ${val.color}`);
        if (!changes.length) { ui.toast('Nothing was changed', 'info'); return false; }
        const patch = { vin, motorNo: val.motorNo || '', year: Number(val.year) || v.year, color: val.color || v.color };
        NA.update('vehicles', v.id, patch);
        const po = v.poId && NA.get('purchaseOrders', v.poId);
        const u = po && (po.units || []).find((x) => x.vehicleId === v.id || (v.unitId && x.id === v.unitId));
        if (u && canWrite('purchaseOrders')) { Object.assign(u, { vin, motorNo: patch.motorNo, color: patch.color }); NA.update('purchaseOrders', po.id, { units: po.units }); }
        NA.log(`Details corrected: ${changes.join(', ')} — ${val.reason}`, { rec: NA.vehicle(v.id), link: '#/inventory/' + v.id, kind: 'warn' });
        ui.toast('Details saved');
        NA.refresh();
        return true;
      } }],
    });
  }

  /* ------------------------------------------ a car without a purchase order */
  NA.actions.addVehicle = function () {
    if (!(can.owner() || can.stock())) return ui.toast('Purchasing adds cars to stock', 'info');
    injectCss();
    const models = NA.db.models.filter((m) => m.active !== false);
    if (!models.length) return ui.toast('Add the car models in Settings first', 'error');
    const needsOk = !!A && A.needed('stock_adjust', 0);
    const m0 = models[0];
    ui.modal({
      title: 'Add a car', subtitle: 'For cars already in the yard, or a car that came back to us', size: 'md',
      body: `${needsOk ? `<div class="callout callout-info iv-mb">${NA.icon('info')}<div>The Managing Director approves cars added this way. Until then the car stays on hold.</div></div>` : ''}
        <form class="modal-form" onsubmit="return false"><div class="form-grid">
        ${vinField('vin', 'VIN', '')}
        ${ui.field({ name: 'modelId', label: 'Model', type: 'select', required: true, placeholder: false, options: ui.opts.models() }, m0.id)}
        ${ui.field({ name: 'color', label: 'Colour', type: 'select', placeholder: false, options: ui.opts.colors(m0.id) })}
        ${ui.field({ name: 'year', label: 'Model year', type: 'number', min: 2015, max: 2100 }, new Date().getFullYear())}
        ${ui.field({ name: 'motorNo', label: 'Motor no.' })}
        ${ui.field({ name: 'location', label: 'Where is it?', type: 'select', placeholder: false, options: locations() })}
        ${ui.field({ name: 'km', label: 'Odometer (km)', type: 'number', min: 0, step: 1 }, 0)}
        ${can.money() ? ui.field({ name: 'cost', label: 'Landed cost', type: 'money', required: true, help: 'What the car cost us, all in' }, m0.cost || '') : ''}
        ${ui.field({ name: 'source', label: 'Where did it come from?', type: 'radio-cards', required: true, span: 2, options: [
          { value: 'Opening stock', label: 'Opening stock', icon: 'warehouse', hint: 'Already here when we started' },
          { value: 'Returned car', label: 'Returned car', icon: 'undo', hint: 'Came back from a customer' },
          { value: 'Other', label: 'Other', icon: 'info', hint: 'Explain in the note' },
        ] }, 'Opening stock')}
        ${ui.field({ name: 'note', label: 'Note', type: 'textarea', rows: 2, span: 2, placeholder: 'Optional' })}
        </div></form>`,
      onMount: (el) => {
        wireVin(el.querySelector('[name="vin"]'), {});
        const mSel = el.querySelector('[name="modelId"]'); const cSel = el.querySelector('[name="color"]');
        if (mSel && mSel.addEventListener) mSel.addEventListener('change', () => { cSel.innerHTML = ui.opts.colors(mSel.value).map((c) => `<option>${esc(c)}</option>`).join(''); });
      },
      actions: [{ label: 'Cancel' }, { label: needsOk ? 'Add and ask for approval' : 'Add car', kind: 'primary', onClick: (el) => {
        const form = el.querySelector('form');
        if (!ui.validate(form)) return false;
        const val = ui.readForm(form);
        const vin = cleanVin(val.vin);
        const p = vinProblem(vin);
        if (p) return markBad(form, 'vin', p);
        if (val.source === 'Other' && !val.note) return markBad(form, 'note', 'Say where the car came from');
        const v = NA.insert('vehicles', {
          vin, motorNo: val.motorNo || '', modelId: val.modelId, color: val.color, year: Number(val.year) || new Date().getFullYear(),
          status: needsOk ? 'hold' : 'pdi', holdReason: needsOk ? 'Waiting for the Managing Director to approve adding this car' : '',
          location: val.location, cost: can.money() ? Number(val.cost) || 0 : 0, poId: null, lotNo: '', source: val.source, sourceNote: val.note || '',
          arrivedAt: NA.today(), pdi: null, km: Number(val.km) || 0, history: [], addedBy: NA.me().name, addedById: NA.myStaffId(),
          addApproval: needsOk ? { status: 'pending' } : null,
        });
        NA.log(`VIN ${vin} added to stock (${val.source})${val.note ? ' — ' + val.note : ''}`, { rec: v, link: '#/inventory/' + v.id, kind: 'info' });
        if (needsOk) {
          const a = A.request({ type: 'stock_adjust', ref: { c: 'vehicles', id: v.id, code: vin }, title: `Add ${NA.modelName(val.modelId)} ${val.color || ''} to stock (${val.source})`,
            detail: `VIN ${vin} · ${val.location}${val.note ? ' · ' + val.note : ''}`, amount: 0, reason: val.note || '' });
          NA.update('vehicles', v.id, { addApproval: { status: a.status, id: a.id } });
          ui.toast('Added — waiting for the Managing Director', 'info');
        } else ui.toast('Added — do the arrival check next');
        NA.go('#/inventory/' + v.id);
        return true;
      } }],
    });
  };
  // Keep the car in step with the decision (runs in the approver's browser).
  if (A) A.onDecide('stock_adjust', (a, decision) => {
    if (a.refC !== 'vehicles') return;
    const v = NA.get('vehicles', a.refId);
    if (!v || !v.addApproval) return;
    const d = Object.assign({ id: a.id, status: decision, note: a.note || '' }, stamp());
    // A car that failed its check while waiting stays on hold (its hold reason is the problem found).
    if (decision === 'approved' && v.pdi && v.pdi.flagged) NA.update('vehicles', v.id, { addApproval: d });
    else if (decision === 'approved') NA.update('vehicles', v.id, { status: v.pdi ? 'available' : 'pdi', holdReason: '', addApproval: d });
    else NA.update('vehicles', v.id, { addApproval: d, holdReason: decision === 'rejected' ? 'Not approved' + (a.note ? ': ' + a.note : '') : 'The request was withdrawn' });
  });

  /* --------------------------------------------------------------- prints */
  function printSheet(v) {
    const m = NA.model(v.modelId) || {};
    const o = v.orderId ? NA.get('orders', v.orderId) : null;
    const row = (k, val) => `<tr><th>${esc(k)}</th><td>${esc(val == null || val === '' ? '—' : val)}</td></tr>`;
    const p = v.pdi;
    ui.print('Stock sheet ' + v.vin, `<h1>Vehicle stock sheet</h1><p class="muted">Printed ${esc(F.date(NA.today()))}</p>
      <table>${row('VIN', v.vin)}${row('Motor no.', v.motorNo)}${row('Model', NA.modelName(v.modelId))}${row('Body', m.body)}${row('Colour', v.color)}${row('Model year', v.year)}
      ${row('Status', statusLabel(statusOf(v)))}${row('Location', v.location)}${row('Arrived', v.arrivedAt ? F.date(v.arrivedAt) : '')}${row('Days in stock', ageDays(v))}
      ${row('Odometer (km)', v.km)}${row('Shipment batch', v.lotNo)}${row('Sales order', o ? o.code : '')}${row('Registration no.', v.regNo)}${holdReasonOf(v) ? row('On hold', holdReasonOf(v)) : ''}</table>
      <h3>Arrival check</h3>
      ${p ? `<table>${row('Date', F.date(p.date))}${p.items ? PDI_ITEMS.map((it) => row(it.label, p.items[it.key] === 'pass' ? 'Pass' : p.items[it.key] === 'fail' ? 'Fail' : '—')).join('') : row('Checklist', (p.checks || []).join(', '))}
        ${row('Damage', p.damageCheck)}${row('Battery health', p.batterySoh + '%')}${row('Inspected by', p.byName || NA.staffName(p.by))}${row('Notes', p.notes)}</table>` : '<p>Not checked yet.</p>'}
      <div class="sig"><div>Inspected by</div><div>Store in-charge</div></div>`);
  }
  function printList(list, title) {
    ui.print('Stock list', `<h1>${esc(title || 'Vehicle stock list')}</h1><p class="muted">${plural(list.length, 'car')} · printed ${esc(F.date(NA.today()))}</p>
      <table><thead><tr><th>#</th><th>VIN</th><th>Model</th><th>Colour</th><th>Status</th><th>Where</th><th class="r">Days</th><th>Checked</th></tr></thead><tbody>
      ${list.map((v, i) => { const d = ageDays(v); return `<tr><td>${i + 1}</td><td>${esc(v.vin)}</td><td>${esc(NA.modelName(v.modelId))}</td><td>${esc(v.color || '')}</td><td>${esc(statusLabel(statusOf(v)))}</td><td>${esc(whereText(v))}</td><td class="r">${d == null ? '' : d}</td><td></td></tr>`; }).join('')}
      </tbody></table><div class="sig"><div>Counted by</div><div>Store in-charge</div></div>`);
  }

  /* ================================================================ PAGE */
  const st = { q: '', view: 'grid' };
  try { const sv = localStorage.getItem('na-inv-view'); if (sv === 'table' || sv === 'grid') st.view = sv; } catch (e) { /* private window */ }

  NA.page({
    path: 'inventory', title: 'Vehicles', icon: 'car',
    render(root, params, query) {
      injectCss();
      query = query || {};
      if (params && params[0]) {
        const v = NA.vehicle(params[0]);
        if (!v) {
          root.innerHTML = ui.pageHead({ title: 'Car not found', crumbs: [{ label: 'Vehicles', href: '#/inventory' }] })
            + (ui.notFound ? ui.notFound('car', '#/inventory', 'All vehicles') : `<div class="card pad">${ui.empty('This car is not in the list.', 'car')}</div>`);
          return null;
        }
        return renderDetail(root, v);
      }
      return renderList(root, query);
    },
  });

  /* ------------------------------------------------------------------ list */
  const TABS = [
    { key: 'available', label: 'Available', test: (k) => k === 'available' },
    { key: 'arriving', label: 'On the way', test: (k) => k === 'in_transit' || k === 'pdi' },
    { key: 'hold', label: 'On hold', test: (k) => k === 'hold' },
    { key: 'demo', label: 'Demo cars', test: (k) => k === 'demo' },
    { key: 'sold', label: 'Sold', test: (k) => k === 'allocated' },
    { key: 'delivered', label: 'Delivered', test: (k) => k === 'delivered' },
    { key: 'all', label: 'All', test: () => true },
  ];
  const OLD_STATUS = { in_transit: 'arriving', pdi: 'arriving', available: 'available', allocated: 'sold', hold: 'hold', demo: 'demo', delivered: 'delivered', stock: 'available', all: 'all' };

  function orderCell(v) {
    const o = v.orderId ? NA.get('orders', v.orderId) : null;
    const r = v.reservedFor ? NA.get('orders', v.reservedFor) : null;
    const k = statusOf(v);
    if (o) return { main: o.code, sub: NA.customerName(o.customerId) === '—' ? '' : NA.customerName(o.customerId) };
    if (k === 'available' && v.reservedFor) return { main: 'Reserved', sub: r ? r.code : 'for a customer order' };
    if (v.customerId && NA.customerName(v.customerId) !== '—') return { main: NA.customerName(v.customerId), sub: '' };
    if (k === 'allocated' || k === 'delivered') return { main: k === 'allocated' ? 'Sold' : 'Delivered', sub: '' };
    return null;
  }
  function footText(v) {
    const k = statusOf(v);
    if (moving(v)) return `<span>Moving to <b>${esc(v.move.to)}</b></span>`;
    if (k === 'in_transit') return `<span>${esc(etaText(etaOf(v)))}</span>`;
    if (k === 'pdi') return '<span>Arrived — to be inspected</span>';
    if (k === 'hold') return `<span class="tone-red">${esc(holdReasonOf(v) || 'On hold')}</span>`;
    if (k === 'demo') return '<span>Used for test drives</span>';
    const oc = orderCell(v);
    if (oc) return `<span><b>${esc(oc.main)}</b></span><span>${esc(oc.sub)}</span>`;
    return k === 'available' ? `<span class="tone-green">Free to sell</span>${v.wasDemo ? '<span>Ex-demo</span>' : ''}` : '';
  }
  function cardsHtml(list) {
    return `<div class="iv-grid">${list.map((v) => `<a class="iv-card" href="#/inventory/${esc(v.id)}">
        <div class="iv-art">${carArt(v.color, 148)}<span class="iv-tl">${ageBadge(v)}</span><span class="iv-tr">${statusBadge(v)}</span></div>
        <div class="iv-card-body">
          <div class="iv-card-title">${esc(NA.modelName(v.modelId))}<span>${esc(v.year || '')}</span></div>
          <div class="iv-card-sub">${swatch(v.color)} ${esc(v.color || '—')} · ${NA.icon(locIcon(v.location), 13)} ${esc(whereText(v))}</div>
          <div class="iv-vin">${esc(v.vin || '')}</div>
          <div class="iv-card-foot">${footText(v)}</div>
        </div></a>`).join('')}</div>`;
  }
  function tableHtml(list) {
    const cols = [
      { label: 'Car', render: (v) => `<div class="row">${swatch(v.color, true)}<div><div class="cell-main">${esc(NA.modelName(v.modelId))}</div><div class="cell-sub">${esc(v.color || '')}${v.year ? ' · ' + esc(v.year) : ''}</div></div></div>` },
      { label: 'VIN', render: (v) => `<span class="mono">${esc(v.vin || '')}</span>` },
      { label: 'Status', render: (v) => statusBadge(v) },
      { label: 'Where', render: (v) => `<span class="small">${esc(statusOf(v) === 'in_transit' ? etaText(etaOf(v)) : whereText(v))}</span>` },
      { label: 'In stock', render: (v) => ageBadge(v) || '<span class="muted">—</span>' },
    ];
    if (!can.seller()) cols.push({ label: 'Order', render: (v) => { const oc = orderCell(v); return oc ? `<span class="cell-main">${esc(oc.main)}</span>${oc.sub ? `<div class="cell-sub">${esc(oc.sub)}</div>` : ''}` : '<span class="muted">—</span>'; } });
    if (can.money()) cols.push({ label: 'Cost', cls: 'right', render: (v) => `<span class="num nowrap">${v.cost ? esc(F.short(v.cost)) : '—'}</span>` });
    return `<div class="card">${ui.table(cols, list, { rowAttr: (v) => `data-href="#/inventory/${esc(v.id)}"` })}</div>`;
  }

  function todoRows(all) {
    const out = [];
    const toInspect = all.filter((v) => statusOf(v) === 'pdi');
    const late = all.filter((v) => statusOf(v) === 'in_transit' && etaOf(v) && etaOf(v) < NA.today());
    const held = all.filter((v) => statusOf(v) === 'hold');
    const moves = all.filter(moving);
    if (can.inspect() && toInspect.length) out.push({ icon: 'clipboard-check', bg: 'bg-amber', title: `${plural(toInspect.length, 'car')} to inspect`, sub: 'Arrived and waiting for the arrival check', href: '#/inventory?tab=arriving' });
    if (can.inspect() && late.length) out.push({ icon: 'truck', bg: 'bg-tint', title: `${plural(late.length, 'car')} should have arrived`, sub: 'The expected date has passed — check when they come in', href: '#/inventory?tab=arriving' });
    if (held.length && !can.seller()) out.push({ icon: 'alert', bg: 'bg-red', title: `${plural(held.length, 'car')} on hold`, sub: can.stock() ? 'Release them once they are fixed' : 'Not for sale until Purchasing releases them', href: '#/inventory?tab=hold' });
    if (moves.length && !can.seller()) out.push({ icon: 'gate', bg: 'bg-tint', title: `${plural(moves.length, 'car')} being moved`, sub: moves.map((v) => v.move.to).filter((x, i, a) => a.indexOf(x) === i).join(' · '), href: '#/inventory?tab=all' });
    if (can.assign()) {
      const free = all.filter((v) => statusOf(v) === 'available' && queueFor(v).some((r) => r.ready && (r.reserved || !v.reservedFor)));
      if (free.length) out.push({ icon: 'key', bg: 'bg-green', title: `${plural(free.length, 'car')} can go to a paid customer`, sub: 'Open the car to give its VIN — oldest paid order first', href: '#/inventory?tab=available' });
    }
    return out.slice(0, 4);
  }

  function renderList(root, query) {
    const seller = can.seller();
    const all = NA.db.vehicles;
    const f = { model: query.model || '', color: query.color || '', loc: query.loc || query.location || '' };
    if (query.q != null) st.q = query.q;
    let tab = query.tab || OLD_STATUS[query.status] || 'available';
    const keys = seller ? ['available', 'arriving', 'demo', 'all'] : TABS.map((t) => t.key);
    const sellerAll = (k) => k !== 'delivered' && k !== 'hold';
    const count = (t) => all.filter((v) => t.test(statusOf(v)) && (!seller || t.key !== 'all' || sellerAll(statusOf(v)))).length;
    const tabs = TABS.filter((t) => keys.includes(t.key)).map((t) => ({ key: t.key, label: t.label, count: count(t), def: t }))
      .filter((t) => ['available', 'arriving', 'all'].includes(t.key) || t.count > 0 || t.key === tab);
    if (!tabs.some((t) => t.key === tab)) tab = 'available';
    const def = TABS.find((t) => t.key === tab);

    const filtered = () => {
      const q = st.q.trim().toLowerCase();
      return all.filter((v) => {
        const k = statusOf(v);
        if (!def.test(k)) return false;
        if (seller && tab === 'all' && !sellerAll(k)) return false;
        if (f.model && v.modelId !== f.model) return false;
        if (f.color && v.color !== f.color) return false;
        if (f.loc && (f.loc === 'In transit' ? k !== 'in_transit' : (v.location || '') !== f.loc)) return false;
        if (q) {
          const oc = orderCell(v);
          const hay = [v.vin, v.motorNo, v.regNo, NA.modelName(v.modelId), v.color, v.location, v.lotNo, oc && oc.main, oc && oc.sub].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).sort((a, b) => {
        if (tab === 'arriving') return String(etaOf(a) || '9999').localeCompare(String(etaOf(b) || '9999'));
        return (ageDays(b) || 0) - (ageDays(a) || 0) || String(a.vin).localeCompare(String(b.vin));
      });
    };
    const list = filtered();

    const href = (ch) => {
      const p = Object.assign({ tab, model: f.model, color: f.color, loc: f.loc }, ch);
      const qs = Object.keys(p).filter((k) => p[k] && !(k === 'tab' && p[k] === 'available')).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
      return '#/inventory' + (qs ? '?' + qs : '');
    };
    const colors = [...new Set(all.map((v) => v.color).filter(Boolean))].sort();
    const locs = locations().concat(['In transit']);
    const tokens = [
      f.model ? { k: 'model', label: NA.modelName(f.model) } : null,
      f.color ? { k: 'color', label: f.color } : null,
      f.loc ? { k: 'loc', label: f.loc } : null,
    ].filter(Boolean);
    const todo = seller ? [] : todoRows(all);
    const listHtml = list.length ? (st.view === 'table' ? tableHtml(list) : cardsHtml(list))
      : `<div class="card">${ui.empty(tokens.length || st.q ? 'No cars match these filters.' : tab === 'available' ? 'No cars are available right now.' : 'Nothing here.', 'car',
        tokens.length || st.q ? ui.btn('Clear filters', { act: 'clear' }) : '')}</div>`;

    const actions = ui.btn('Print list', { icon: 'print', act: 'print' }) + (can.owner() || can.stock() ? ui.btn('Add a car', { icon: 'plus', act: 'add' }) : '')
      + (NA.can('po.manage') && typeof NA.actions.newPO === 'function' ? ui.btn('Order cars', { icon: 'cart', act: 'po' }) : '');
    root.innerHTML = ui.pageHead({
      title: 'Vehicles',
      subtitle: seller ? 'Cars you can offer customers today, and what is on the way.' : 'Every car we own — where it is and whether it can be sold.',
      actions,
    }) + `
      ${todo.length ? `<div class="iv-todo">${todo.map((t) => `<a class="alert-row" href="${t.href}"><span class="iv-ar-ico ${t.bg}">${NA.icon(t.icon, 17)}</span><div class="grow"><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></div>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`).join('')}</div>` : ''}
      <div class="iv-bar">${ui.tabs(tabs, tab)}
        <div class="seg" role="group" aria-label="View"><button class="${st.view === 'grid' ? 'active' : ''}" data-view="grid">${NA.icon('dashboard', 15)}Cards</button><button class="${st.view === 'table' ? 'active' : ''}" data-view="table">${NA.icon('menu', 15)}List</button></div>
      </div>
      <div class="toolbar">
        <input type="search" class="iv-search" placeholder="Search VIN, model or colour" value="${esc(st.q)}" data-q aria-label="Search cars"/>
        <select data-f="model" aria-label="Model"><option value="">All models</option>${NA.db.models.map((m) => `<option value="${esc(m.id)}" ${f.model === m.id ? 'selected' : ''}>${esc(NA.modelName(m.id))}</option>`).join('')}</select>
        <select data-f="color" aria-label="Colour"><option value="">All colours</option>${colors.map((c) => `<option ${f.color === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-f="loc" aria-label="Location"><option value="">Everywhere</option>${locs.map((l) => `<option ${f.loc === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      </div>
      ${tokens.length ? `<div class="iv-tokens">${tokens.map((t) => `<button class="iv-token" data-token="${t.k}">${esc(t.label)}${NA.icon('x', 14)}</button>`).join('')}</div>` : ''}
      <div class="iv-count" data-count>${plural(list.length, 'car')}</div>
      <div data-list>${listHtml}</div>
      ${seller ? '' : overviewHtml(all)}`;

    const redraw = () => {
      const l = filtered();
      const box = root.querySelector('[data-list]');
      if (box) box.innerHTML = l.length ? (st.view === 'table' ? tableHtml(l) : cardsHtml(l)) : `<div class="card">${ui.empty('No cars match this search.', 'search')}</div>`;
      const c = root.querySelector('[data-count]');
      if (c) c.textContent = plural(l.length, 'car');
    };
    const offs = [
      ui.delegate(root, 'click', '[data-tab]', (el) => NA.go(href({ tab: el.dataset.tab }))),
      ui.delegate(root, 'click', '[data-view]', (el) => { st.view = el.dataset.view; try { localStorage.setItem('na-inv-view', st.view); } catch (e) { /* ignore */ } NA.render(); }),
      ui.delegate(root, 'click', '[data-token]', (el) => NA.go(href({ [el.dataset.token]: '' }))),
      ui.delegate(root, 'click', 'tr[data-href]', (el) => NA.go(el.dataset.href)),
      ui.delegate(root, 'click', '[data-loc-pick]', (el) => NA.go(href({ loc: el.dataset.locPick, tab: 'all' }))),
      ui.delegate(root, 'click', '[data-model-pick]', (el) => NA.go(href({ model: el.dataset.modelPick, tab: 'all' }))),
      ui.delegate(root, 'click', '[data-act]', (el) => {
        const act = el.dataset.act;
        if (act === 'clear') { st.q = ''; NA.go(href({ model: '', color: '', loc: '' })); }
        else if (act === 'print') printList(filtered(), 'Vehicles · ' + def.label + (f.loc ? ' · ' + f.loc : ''));
        else if (act === 'add') NA.actions.addVehicle();
        else if (act === 'po' && typeof NA.actions.newPO === 'function') NA.actions.newPO();
      }),
      ui.delegate(root, 'input', '[data-q]', (el) => { st.q = el.value; redraw(); }),
      ui.delegate(root, 'change', 'select[data-f]', (el) => NA.go(href({ [el.dataset.f]: el.value }))),
    ];
    return () => offs.forEach((fn) => fn());
  }

  function overviewHtml(all) {
    const inStock = all.filter((v) => !['delivered'].includes(statusOf(v)));
    const keys = ['available', 'allocated', 'pdi', 'hold', 'demo'];
    const toneVar = { available: 'green', allocated: 'violet', pdi: 'amber', hold: 'red', demo: 'teal' };
    const locRows = locations().map((l) => {
      const here = inStock.filter((v) => (v.location || '') === l && statusOf(v) !== 'in_transit');
      const parts = keys.map((k) => ({ k, n: here.filter((v) => statusOf(v) === k).length })).filter((x) => x.n);
      return `<button class="gl-row link" data-loc-pick="${esc(l)}"><span class="gl-icon bg-gray">${NA.icon(locIcon(l), 17)}</span>
        <span class="gl-main"><b>${esc(l)}</b><small>${parts.length ? parts.map((x) => `${x.n} ${esc(statusLabel(x.k).toLowerCase())}`).join(' · ') : 'Empty'}</small>
          ${here.length ? `<span class="iv-loc-bar">${parts.map((x) => `<i class="bg-${toneVar[x.k]}" style="width:${((x.n / here.length) * 100).toFixed(1)}%"></i>`).join('')}</span>` : ''}</span>
        <span class="gl-value num">${here.length}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
    }).join('');
    const way = inStock.filter((v) => statusOf(v) === 'in_transit').length;
    const models = NA.db.models.filter((m) => m.active !== false || all.some((v) => v.modelId === m.id));
    const modelRows = models.map((m) => {
      const mv = inStock.filter((v) => v.modelId === m.id);
      const av = mv.filter((v) => statusOf(v) === 'available').length;
      const wy = mv.filter((v) => ['in_transit', 'pdi'].includes(statusOf(v))).length;
      const sold = mv.filter((v) => statusOf(v) === 'allocated').length;
      return `<button class="gl-row link" data-model-pick="${esc(m.id)}"><span class="gl-main"><b>${esc(NA.modelName(m.id))}</b><small>${av} available · ${wy} on the way · ${sold} sold</small></span><span class="gl-value num">${mv.length}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
    }).join('');
    return `<details class="iv-overview"><summary>Overview by place and model ${NA.icon('chevron-down', 16)}</summary>
      <div class="grid grid-2 mt-16">
        <div><div class="glist-title">Where the cars are</div><div class="glist">${locRows}
          <button class="gl-row link" data-loc-pick="In transit"><span class="gl-icon bg-tint">${NA.icon('truck', 17)}</span><span class="gl-main"><b>On the way</b><small>Paid and shipped, not here yet</small></span><span class="gl-value num">${way}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button></div></div>
        <div><div class="glist-title">By model</div><div class="glist">${modelRows || '<div class="gl-row"><span class="gl-main muted">No models yet</span></div>'}</div></div>
      </div></details>`;
  }

  /* ---------------------------------------------------------------- detail */
  function nextStepFor(v, ctx) {
    const k = statusOf(v);
    const btn = (label, act, attrs) => ui.btn(label, { kind: 'primary', act, attrs });
    const lock = (t) => `<span class="lock-note">${NA.icon('lock', 14)}${esc(t)}</span>`;
    if (moving(v)) {
      return { tone: 'wait', icon: 'gate', title: `On the way to ${v.move.to}`, desc: `Gate pass ${v.move.gatePass}${v.move.driverName ? ' · driver ' + v.move.driverName : ''} · left ${F.date(v.move.date)}`,
        actions: (can.confirmMove() ? btn('Received at ' + v.move.to, 'move-in') : lock('Confirmed at ' + v.move.to)) + ui.btn('Print gate pass', { act: 'gatepass' }) };
    }
    if (v.addApproval && v.addApproval.status === 'pending') return { tone: 'wait', icon: 'stamp', title: 'Waiting for the Managing Director', desc: 'This car was added without a purchase order. It stays on hold until it is approved.', actions: '' };
    if (k === 'in_transit') return { icon: 'truck', title: 'Check the car when it arrives', desc: etaText(etaOf(v)) + (v.lotNo ? ' · batch ' + v.lotNo : ''), actions: can.inspect() ? btn('Check on arrival', 'inspect') : lock('Purchasing or the workshop does this') };
    if (k === 'pdi') return { icon: 'clipboard-check', title: 'Inspect the car', desc: 'Go through the checklist before it can be sold.', actions: can.inspect() ? btn('Inspect', 'inspect') : lock('Purchasing or the workshop does this') };
    if (k === 'hold' && addRefused(v) && !can.owner()) {
      // Declined or withdrawn: only the Managing Director's approval takes this car off hold.
      const no = v.addApproval.status === 'rejected';
      return { tone: 'stop', icon: 'stamp', title: no ? 'The Managing Director did not approve this car' : 'Not approved — the request was withdrawn',
        desc: (no ? holdReasonOf(v) + ' · ' : '') + 'It stays on hold until the Managing Director approves adding it.',
        actions: can.stock() && A ? btn('Ask again', 'ask-add') : lock('Purchasing asks the Managing Director') };
    }
    if (k === 'hold') {
      const passed = v.pdi && !v.pdi.flagged && (!v.hold || checkedAfter(v.pdi, v.hold));
      return { tone: 'stop', icon: 'alert', title: 'On hold — not for sale', desc: holdReasonOf(v) + (passed ? ' · Inspected again and passed' : ''),
        actions: (can.stock() ? btn('Release from hold', 'release') : lock('Purchasing releases holds')) + (can.inspect() ? ui.btn('Inspect again', { act: 'reinspect' }) : '')
          + (can.service() && NA.actions.newJobCard ? ui.btn('Job card', { act: 'job' }) : '') };
    }
    if (k === 'available') {
      if (v.reservedFor) {
        const r = NA.get('orders', v.reservedFor);
        // The order moved on (it got another car, or it was cancelled or delivered): the reservation is stale.
        if (r && staleReservation(v)) {
          return { tone: 'wait', icon: 'undo', title: `Was kept for ${r.code}`, desc: `${r.stage === 'cancelled' ? r.code + ' was cancelled.' : r.code + ' has another car now.'} Clear the reservation so this car can be sold.`,
            actions: can.assign() || can.stock() ? btn('Clear the reservation', 'unreserve') : lock('The Sales Manager, Accounts or Purchasing clears this') };
        }
        const ok = r && readyFor(r);
        const who = r ? custName(r) || r.code : '';
        return { tone: 'wait', icon: 'key', title: `Reserved for ${r ? r.code : 'a customer order'}`, desc: r ? (ok ? `${who} · ${paidLine(r, true)} — give the VIN.` : `Kept for ${who} until the order is ready for its VIN.`) : 'Kept for the customer the car was bought for.',
          actions: r && ok && can.assign() ? btn('Give VIN', 'assign', `data-order="${esc(r.id)}"`) : r && ok ? lock('The Sales Manager or Accounts gives the VIN') : '' };
      }
      const first = ctx.queue.find((r) => r.ready);
      if (first) {
        return { icon: 'key', title: `Give this car to ${first.o.code}`, desc: `${custName(first.o) ? custName(first.o) + ' · ' : ''}${paidLine(first.o, true)}${first.colourOk ? '' : ' · ordered ' + first.o.color}`,
          actions: can.assign() ? btn('Give VIN', 'assign', `data-order="${esc(first.o.id)}"`) : lock('The Sales Manager or Accounts gives the VIN') };
      }
      const newOrder = can.seller() && NA.can('orders.create') && typeof NA.actions.newOrder === 'function';
      return { tone: 'done', icon: 'check-circle', title: 'Ready to sell', desc: ctx.queue.length ? `${plural(ctx.queue.length, 'open order')} for this model — the VIN is given once one is paid in full.` : 'No open order is waiting for this model.',
        actions: newOrder ? btn('Start an order', 'new-order') : '' };
    }
    if (k === 'demo') return { icon: 'steering', title: 'Demo car', desc: `Since ${F.date(v.demo && v.demo.since)}${v.demo && v.demo.note ? ' · ' + v.demo.note : ''} · ${F.num(v.km || 0)} km`, actions: can.demo() ? btn('Back to stock', 'demo-off') : '' };
    if (k === 'allocated') {
      const o = ctx.order;
      if (holdReasonOf(v)) {
        const passed = v.hold && v.pdi && !v.pdi.flagged && checkedAfter(v.pdi, v.hold);
        return { tone: 'stop', icon: 'alert', title: 'Handover blocked', desc: holdReasonOf(v) + (passed ? ' · Inspected again and passed' : ''), actions: can.stock() ? btn('Release', 'release') : lock('Purchasing clears this') };
      }
      return { icon: 'id-card', title: o ? `Sold — ${o.code} goes to registration and handover` : 'Sold to a customer', desc: o ? NA.stageLabel(NA.FLOW.orderStages, o.stage) : '', actions: o && NA.canSee('sales') ? btn('Open order', 'open-order') : '' };
    }
    const w = ctx.warranty;
    return { tone: 'done', icon: 'check-circle', title: 'With the customer', desc: w ? `Warranty ${w.code} until ${F.date(w.expiry)}` : 'Delivered.', actions: can.service() && NA.actions.newServiceBooking ? btn('Book a service', 'book') : '' };
  }

  function renderDetail(root, v) {
    const k = statusOf(v);
    const m = NA.model(v.modelId) || {};
    const order = v.orderId ? NA.get('orders', v.orderId) : null;
    const po = v.poId ? NA.get('purchaseOrders', v.poId) : null;
    const lot = po && v.lotNo ? (po.lots || []).find((l) => l.lotNo === v.lotNo) : null;
    const warranty = B.warrantyFor(v.id);
    const queue = can.seller() ? [] : queueFor(v);
    const days = ageDays(v);
    const seller = can.seller();
    const ns = nextStepFor(v, { order, warranty, queue });

    // Facts (grouped list)
    const fact = (label, value, cls) => `<div class="gl-row"><span class="gl-label grow">${esc(label)}</span><span class="gl-value ${cls || ''}">${value}</span></div>`;
    const facts = [
      fact('VIN', `<span class="mono">${esc(v.vin || '—')}</span>`),
      v.motorNo ? fact('Motor no.', `<span class="mono">${esc(v.motorNo)}</span>`) : '',
      fact('Colour', `${swatch(v.color)} ${esc(v.color || '—')}`),
      fact('Model year', esc(v.year || '—')),
      fact('Odometer', esc(F.num(v.km || 0)) + ' km'),
      v.regNo ? fact('Registration', esc(v.regNo)) : '',
      v.lotNo && !seller ? fact('Shipment batch', esc(v.lotNo)) : '',
      v.source && !po ? fact('Came from', esc(v.source)) : '',
      m.price ? fact('List price', esc(F.money(m.price)), 'num') : '',
      can.money() && v.cost ? fact('Landed cost', esc(F.money(v.cost)), 'num') : '',
      can.money() && v.cost && m.price ? fact('Margin before VAT', esc(F.money(Math.round(m.price / (1 + (NA.db.settings.vatRate || 0)) - v.cost))), 'num') : '',
    ].join('');

    // Arrival check
    const p = v.pdi;
    const pdiHtml = p ? `<div class="glist">
        ${p.items ? PDI_ITEMS.map((it) => { const r = p.items[it.key]; return `<div class="gl-row"><span class="gl-label grow">${esc(it.label)}</span><span class="gl-value ${r === 'fail' ? 'tone-red' : r === 'pass' ? 'tone-green' : ''}">${r === 'fail' ? 'Failed' : r === 'pass' ? 'Passed' : '—'}</span></div>`; }).join('')
          : `<div class="gl-row"><span class="gl-main"><b>Checked</b><small>${esc((p.checks || []).join(' · ') || 'No checklist recorded')}</small></span></div>
             ${OLD_CHECKS.filter((c) => !(p.checks || []).includes(c)).length && (p.checks || []).length ? `<div class="gl-row"><span class="gl-main"><b>Not ticked</b><small>${esc(OLD_CHECKS.filter((c) => !(p.checks || []).includes(c)).join(' · '))}</small></span></div>` : ''}`}
        ${fact('Damage', esc(p.damageCheck === 'OK' ? 'None' : p.damageCheck || '—'), p.damageCheck && p.damageCheck !== 'OK' ? 'tone-red' : '')}
        ${fact('Battery health', esc((p.batterySoh != null ? p.batterySoh : '—') + '%'), Number(p.batterySoh) < 90 ? 'tone-red' : '')}
        ${p.notes ? `<div class="gl-row"><span class="gl-main"><b>Notes</b><small>${esc(p.notes)}</small></span></div>` : ''}
        ${p.resolved ? `<div class="gl-row"><span class="gl-main"><b>Released from hold · ${esc(p.resolved.how)}</b><small>${esc(p.resolved.note || '')} · ${esc(p.resolved.by || '')} ${esc(F.date(p.resolved.at))}</small></span></div>` : ''}
      </div><p class="glist-foot">${esc(F.date(p.date))} · ${esc(p.byName || NA.staffName(p.by))}</p>`
      : `<div class="glist"><div class="gl-row"><span class="gl-main muted">${k === 'in_transit' ? 'Done when the car arrives.' : 'Not checked yet.'}</span></div></div>`;

    // Customer
    let custHtml = '';
    if (order) {
      const link = NA.canSee('sales');
      custHtml = `<div class="glist"><${link ? `a class="gl-row" href="#/sales/${esc(order.id)}"` : 'div class="gl-row"'}>${ui.avatar(NA.customerName(order.customerId), 32)}
        <span class="gl-main"><b>${esc(NA.customerName(order.customerId))}</b><small>${esc(order.code)} · ${esc(NA.stageLabel(NA.FLOW.orderStages, order.stage))}</small></span>${link ? NA.icon('chevron-right', 16, 'gl-chev') + '</a>' : '</div>'}</div>`;
    } else if (k === 'allocated' || k === 'delivered') {
      custHtml = `<div class="glist"><div class="gl-row"><span class="gl-main muted">${v.customerId && NA.customerName(v.customerId) !== '—' ? esc(NA.customerName(v.customerId)) : 'Sold to a customer of another consultant.'}</span></div></div>`;
    } else if (k === 'available' && !seller) {
      custHtml = queue.length ? `<div class="glist">${queue.slice(0, 6).map((r) => `<div class="gl-row iv-q-row">
          <span class="gl-main"><b>${esc(r.o.code)}${custName(r.o) ? ' · ' + esc(custName(r.o)) : ''}</b><small>${esc(paidLine(r.o, r.ready))}${r.colourOk ? '' : ' · wants ' + esc(r.o.color)}${r.reserved ? ' · reserved' : ''}</small></span>
          ${r.ready && can.assign() && (!v.reservedFor || r.reserved) ? `<button class="btn btn-plain btn-sm" data-act="assign" data-order="${esc(r.o.id)}">Give VIN</button>` : ''}</div>`).join('')}</div>
          <p class="glist-foot">Oldest fully paid order first. Giving the car to a later order asks for a reason.</p>`
        : `<div class="glist"><div class="gl-row"><span class="gl-main muted">No open order for this model yet.</span></div></div>`;
    }

    // Origin
    const originHtml = !seller && (po || v.source) ? `<div class="glist">
        ${po ? `${can.buying() ? `<a class="gl-row" href="#/procurement/${esc(po.id)}">` : '<div class="gl-row">'}<span class="gl-main"><b>${esc(po.code)}${po.type === 'emergency' ? ' · emergency purchase' : ''}</b><small>${esc(NA.vendorName(po.vendorId))}${lot ? ' · batch ' + esc(lot.lotNo) : ''}</small></span>${can.buying() ? NA.icon('chevron-right', 16, 'gl-chev') + '</a>' : '</div>'}` : ''}
        ${!po && v.source ? `<div class="gl-row"><span class="gl-main"><b>${esc(v.source)}</b><small>${esc(v.sourceNote || 'Added without a purchase order')}${v.addedBy ? ' · by ' + esc(v.addedBy) : ''}</small></span></div>` : ''}
        ${v.arrivedAt ? fact('Arrived', `${esc(F.date(v.arrivedAt))}${days != null ? ' · ' + plural(days, 'day') + ' ago' : ''}`) : fact('Expected', esc(etaText(etaOf(v))))}
      </div>` : '';

    // Location and moves
    const transfers = v.transfers || [];
    const movesHtml = `<div class="glist">
        <div class="gl-row has-icon"><span class="gl-icon bg-gray">${NA.icon(locIcon(v.location), 17)}</span><span class="gl-main"><b>${esc(moving(v) ? 'Moving: ' + v.move.from + ' → ' + v.move.to : k === 'in_transit' ? 'On the way' : v.location || '—')}</b><small>${v.arrivedAt ? 'Arrived ' + esc(F.date(v.arrivedAt)) : esc(etaText(etaOf(v)))}</small></span></div>
        ${transfers.slice(0, 6).map((t) => `<div class="gl-row"><span class="gl-main"><b>${esc(t.from || '—')} → ${esc(t.to)}</b><small>${esc(F.date(t.date))}${t.gatePass ? ' · ' + esc(t.gatePass) : ''}${t.driverName || t.by ? ' · ' + esc(t.driverName || NA.staffName(t.by)) : ''}${t.receivedBy ? ' · received by ' + esc(t.receivedBy) : ''}${t.note ? ' · ' + esc(t.note) : ''}</small></span></div>`).join('')}
      </div>`;

    // Warranty and service
    const jobs = NA.where('jobCards', (j) => j.vehicleId === v.id).sort((a, b) => String(b.openedAt || b.createdAt).localeCompare(String(a.openedAt || a.createdAt)));
    const afterHtml = (k === 'delivered' || warranty || jobs.length) && !seller ? `<div class="glist">
        ${warranty ? `<div class="gl-row has-icon"><span class="gl-icon ${B.warrantyActive(warranty) ? 'bg-green' : 'bg-gray'}">${NA.icon('shield', 17)}</span><span class="gl-main"><b>Warranty ${esc(warranty.code)}</b><small>Until ${esc(F.date(warranty.expiry))} or ${esc(F.num(warranty.kmLimit))} km · battery until ${esc(F.date(warranty.batteryExpiry))}</small></span>${ui.badge(B.warrantyActive(warranty) ? 'Active' : warranty.status === 'void' ? 'Void' : 'Expired', B.warrantyActive(warranty) ? 'green' : 'gray')}</div>` : ''}
        ${jobs.slice(0, 5).map((j) => {
          const inner = `<span class="gl-main"><b>${esc(j.code)} · ${esc(j.complaint || 'Service')}</b><small>${esc(F.date(j.openedAt))} · ${esc(j.billing === 'warranty' ? 'Warranty' : 'Paid')}</small></span>`;
          // Only people who can open Service get a link (others would be sent back to Today).
          return NA.canSee('service') ? `<a class="gl-row" href="#/service/job/${esc(j.id)}">${inner}${NA.icon('chevron-right', 16, 'gl-chev')}</a>` : `<div class="gl-row">${inner}</div>`;
        }).join('')}
        ${!warranty && !jobs.length ? '<div class="gl-row"><span class="gl-main muted">No warranty or service visits yet.</span></div>' : ''}
      </div>` : '';

    // Other things one can do here
    const manage = [];
    const row = (label, act, icon, cls) => manage.push(`<button class="gl-row link has-icon" data-act="${act}"><span class="gl-icon ${cls || 'bg-gray'}">${NA.icon(icon, 17)}</span><span class="gl-main"><b>${esc(label)}</b></span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`);
    if (can.stock() && !moving(v) && !['in_transit', 'delivered'].includes(k)) row('Move to another place', 'move', 'truck', 'bg-tint');
    if (can.stock() && moving(v)) row('Cancel this move', 'move-cancel', 'x');
    if (can.demo() && k === 'available' && !v.reservedFor && !moving(v)) row('Use as demo car', 'demo-on', 'steering', 'bg-teal');
    if (can.stock() && ['available', 'pdi', 'demo', 'allocated'].includes(k) && !holdReasonOf(v)) row('Put on hold', 'hold', 'alert', 'bg-red');
    if (k === 'available' && v.reservedFor && !staleReservation(v) && (can.assign() || can.stock())) row('Clear the reservation', 'unreserve', 'undo');   // a stale one is the next step
    if (can.inspect() && ['available', 'demo', 'allocated'].includes(k) && !moving(v)) row('Inspect again', 'reinspect', 'clipboard-check', 'bg-amber');
    if (canFix(v)) row('Fix a typo in the details', 'fix', 'edit');
    row('Print stock sheet', 'print', 'print');

    const toneCls = ns.tone ? 'iv-' + ns.tone : '';
    root.innerHTML = ui.pageHead({
      crumbs: [{ label: 'Vehicles', href: '#/inventory' }, { label: v.vin || 'Car' }],
      title: NA.modelName(v.modelId),
      subtitle: `${esc(v.color || '')}${v.year ? ' · ' + esc(v.year) : ''} · ${statusBadge(v)}`,
    }) + `
      ${NA.ui.approvalBanners ? `<div class="iv-block">${NA.ui.approvalBanners('vehicles', v.id)}</div>` : ''}
      <div class="card iv-block"><div class="iv-hero">
        <div class="iv-art">${carArt(v.color, 230)}</div>
        <div class="iv-facts">
          <div><small>Status</small><b>${esc(statusLabel(k))}</b></div>
          <div><small>${k === 'in_transit' ? 'Expected' : 'Where'}</small><b>${esc(k === 'in_transit' ? (etaOf(v) ? F.date(etaOf(v)) : 'Not known yet') : whereText(v))}</b></div>
          <div><small>In stock</small><b class="${days >= 90 ? 'tone-red' : days >= 60 ? 'tone-amber' : ''}">${days == null ? '—' : plural(days, 'day')}</b></div>
        </div></div></div>
      <div class="next-step iv-block ${toneCls}"><span class="ns-icon">${NA.icon(ns.icon || 'arrow-right', 20)}</span>
        <div class="ns-text"><b>${esc(ns.title)}</b><small>${esc(ns.desc || '')}</small></div>
        <div class="iv-ns-actions">${ns.actions || ''}</div></div>
      <div class="grid grid-main-side">
        <div class="iv-stack">
          <section><div class="glist-title">The car</div><div class="glist">${facts}</div></section>
          <section><div class="glist-title">Arrival check</div>${pdiHtml}</section>
          ${afterHtml ? `<section><div class="glist-title">Warranty and service</div>${afterHtml}</section>` : ''}
        </div>
        <div class="iv-stack">
          ${custHtml ? `<section><div class="glist-title">${order || k === 'allocated' || k === 'delivered' ? 'Customer' : 'Waiting for this model'}</div>${custHtml}</section>` : ''}
          ${originHtml ? `<section><div class="glist-title">Where it came from</div>${originHtml}</section>` : ''}
          <section><div class="glist-title">Location</div>${movesHtml}</section>
          ${manage.length ? `<section><div class="glist-title">More</div><div class="glist">${manage.join('')}</div></section>` : ''}
          ${seller ? '' : `<section><div class="glist-title">History</div><div class="card pad">${(v.history || []).length ? `<ul class="timeline">${v.history.slice(0, 25).map((x) => `<li>${esc(x.text)}<small>${esc(F.datetime(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</small></li>`).join('')}</ul>` : `<ul class="timeline"><li>Added to stock<small>${esc(F.datetime(v.createdAt))}</small></li></ul>`}</div></section>`}
        </div>
      </div>`;

    const offs = [ui.delegate(root, 'click', '[data-act]', (el) => {
      const act = el.dataset.act;
      if (act === 'inspect') { if (v.poId && NA.actions.receiveUnit) NA.actions.receiveUnit(v.id); else NA.actions.recordPDI(v.id); }
      else if (act === 'reinspect') NA.actions.recordPDI(v.id, { arrival: false });
      else if (act === 'release') releaseHold(v);
      else if (act === 'ask-add') askAddAgain(v);
      else if (act === 'hold') putOnHold(v);
      else if (act === 'move') NA.actions.transferVehicle(v.id);
      else if (act === 'move-in') receiveMove(v);
      else if (act === 'move-cancel') cancelMove(v);
      else if (act === 'gatepass') printGatePass(v);
      else if (act === 'assign') { const o = NA.get('orders', el.dataset.order); if (o) assignSheet(v, o); }
      else if (act === 'unreserve') clearReservation(v);
      else if (act === 'demo-on') demoOn(v);
      else if (act === 'demo-off') demoOff(v);
      else if (act === 'fix') fixDetails(v);
      else if (act === 'print') printSheet(v);
      else if (act === 'open-order' && order) NA.go('#/sales/' + order.id);
      else if (act === 'new-order' && NA.actions.newOrder) NA.actions.newOrder({ modelId: v.modelId, color: v.color });
      else if (act === 'book' && NA.actions.newServiceBooking) NA.actions.newServiceBooking({ customerId: v.customerId, vehicleId: v.id });
      else if (act === 'job' && NA.actions.newJobCard) NA.actions.newJobCard({ vehicleId: v.id, customerId: v.customerId || null });
    })];
    return () => offs.forEach((fn) => fn());
  }

  /* ----------------------------------------------- shared with Purchasing */
  NA.stock = {
    STATUS, statusOf, statusLabel, statusBadge, holdReasonOf, moving, paintHex, swatch, carArt, ageDays, ageBadge, etaOf, etaText,
    cleanVin, vinProblem, wireVin, vinField, locations, locIcon, canInspect: can.inspect, queueFor, paidUpOn, readyFor, ensureCss: injectCss,
    // business steps without the forms (also used by tests)
    applyPdi, releaseHoldOp, dispatchOp, receiveMoveOp, assignOp, PDI_ITEMS,
  };
})();
