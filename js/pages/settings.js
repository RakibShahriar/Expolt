/* ==========================================================================
   Settings — #/settings?tab=general|rules|models|locations|access|activity|data

   Everyone sees "You": appearance, their role and what it can do, their PIN.
   Only the Managing Director sees the rest (the "You" settings sit at the top of General):
     • General          company details (printed on documents), VAT, advance, labour rate, office hours, public holidays
     • Approval rules   the limits in NA.db.settings.policy + "Who approves what"
     • Models & prices  the BYD line-up, prices with history, colours, warranty
     • Locations        add, rename (updates every record), remove when unused
     • Sign-in and roles (office server only, drawn by sync.js)
     • Activity log     who changed what (the office server's permanent record)
     • Data             backup, restore, demo data, start fresh (type ERASE)
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const M = (n) => NA.fmt.money(n);
  const num = (x) => Number(x) || 0;
  const STORAGE_KEY = 'noor-autos-dms-v1';
  const QUOTA = 5 * 1024 * 1024; // typical browser localStorage limit (characters)
  const shared = () => !!(NA.sync && NA.sync.on);
  const meName = () => ((NA.me ? NA.me().name : NA.db.settings.currentUser) || 'Admin');
  /** An empty box: readForm gives '' for an empty number field (which Number() would turn into 0). */
  const blank = (v) => v === '' || v == null || (typeof v === 'number' && isNaN(v));
  const pctText = (x) => +(num(x) * 100).toFixed(2) + '%';
  const locsRead = () => (Array.isArray(NA.db.settings.locations) ? NA.db.settings.locations : []);
  const locsWrite = () => (Array.isArray(NA.db.settings.locations) ? NA.db.settings.locations : (NA.db.settings.locations = []));

  function injectCss() {
    if (document.getElementById('css-settings')) return;
    const st = document.createElement('style');
    st.id = 'css-settings';
    // Tokens only (light and dark come from css/app.css). Calm grouped lists, like System Settings.
    st.textContent = `
      .st-page { max-width: 880px; }
      .st-page.st-wide { max-width: none; }
      .st-group { margin-bottom: 32px; }
      .st-group > .glist + .glist-title { margin-top: 24px; }
      .st-row { gap: 16px; }
      .st-row > .gl-main { flex: 1 1 240px; }
      .st-ctl { flex: 0 1 320px; min-width: 0; display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
      .st-ctl.st-narrow { flex-basis: 170px; }
      .st-ctl > .field { width: 100%; }
      .st-ctl .field input, .st-ctl .field select { height: 36px; }
      .st-ctl .input-prefix span { height: 36px; }
      .st-num input { text-align: right; font-variant-numeric: tabular-nums; }
      .st-suffix { position: relative; }
      .st-suffix input { padding-right: 34px; }
      .st-suffix > span { position: absolute; right: 12px; top: 0; height: 36px; display: grid; place-items: center; color: var(--muted); font-weight: 500; pointer-events: none; }
      .st-sentence { font-weight: 500; line-height: 2.2; }
      .field.st-inline { display: inline-flex; vertical-align: middle; margin: 0 4px; gap: 0; }
      .field.st-inline .input-prefix { display: inline-block; }
      .field.st-inline input { width: 136px; height: 34px; padding: 0 10px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
      .field.st-inline.st-short input { width: 76px; }
      .field.st-inline .input-prefix span { height: 34px; left: 10px; }
      .field.st-inline .input-prefix input { padding-left: 26px; }
      label.gl-row { cursor: pointer; }
      .st-page .icon-btn:disabled { opacity: .35; cursor: default; }
      .st-page .icon-btn:disabled:hover { background: none; color: var(--muted); }
      .st-save { display: none; position: sticky; bottom: 16px; z-index: 5; margin-top: 16px; align-items: center; gap: 10px; padding: 10px 12px 10px 18px; border-radius: var(--radius); background: var(--raised); box-shadow: var(--shadow-lg); }
      .st-dirty > .st-save { display: flex; }
      .st-save-text { flex: 1; min-width: 0; color: var(--muted); font-size: 13px; }
      .st-dots { display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: -1px; }
      .st-dots .swatch, .st-chip .swatch { box-shadow: inset 0 0 0 1px var(--line); }
      .st-price { font-weight: 600; color: var(--ink); }
      .st-chips { display: flex; flex-wrap: wrap; gap: 8px; min-height: 30px; align-items: center; }
      .st-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px 0 10px; border-radius: 999px; background: var(--fill); font-size: 13px; font-weight: 500; }
      .st-chip button { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: none; color: var(--muted); }
      .st-chip button:hover { background: var(--fill-2); color: var(--ink); }
      .st-add { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
      .st-add .field { flex: 1; }
      .st-intro { margin-bottom: 16px; }
      .st-counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0 28px; padding: 12px 18px; }
      .st-counts div { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; font-size: 13px; color: var(--ink-2); }
      .st-counts b { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
      .st-advanced > summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; margin-left: 4px; border-radius: var(--radius-sm); color: var(--ink-2); font-weight: 500; }
      .st-advanced > summary::-webkit-details-marker { display: none; }
      .st-advanced > summary .ico { color: var(--muted); transition: transform .2s; }
      .st-advanced[open] > summary .ico { transform: rotate(90deg); }
      .st-advanced > summary:hover { background: var(--fill-3); }
      .st-advanced > .glist { margin-top: 10px; }
      .st-log { align-items: flex-start; }
      .st-when { flex: none; width: 116px; padding-top: 1px; color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
      .st-log .gl-main b { font-weight: 500; }
      .st-tools .st-search { flex: 1 1 220px; }
      .st-date { flex: 0 0 170px; }
      @media (max-width: 900px) {
        .st-save { bottom: calc(74px + env(safe-area-inset-bottom)); }   /* above the phone tab bar */
      }
      @media (max-width: 640px) {
        .st-row { flex-wrap: wrap; }
        .st-ctl, .st-date { flex-basis: 100%; justify-content: flex-start; }
        .st-log { flex-wrap: wrap; gap: 2px 12px; }
        .st-when { width: 100%; }
      }`;
    document.head.appendChild(st);
  }

  /* Tabs. Every company-wide setting belongs to the Managing Director (all these permissions are owner-only
     in access.js); everyone else gets the "You" tab. Keys are kept stable: other screens link to them. */
  const TABS = [
    { key: 'you', label: 'You', perm: null },
    { key: 'general', label: 'General', perm: 'settings.company' },
    { key: 'rules', label: 'Approval rules', perm: 'settings.policy' },
    { key: 'models', label: 'Models & prices', perm: 'models.edit' },
    { key: 'locations', label: 'Locations', perm: 'settings.company' },
    { key: 'access', label: 'Sign-in and roles', perm: 'staff.signins', shared: true },
    { key: 'activity', label: 'Activity log', perm: 'settings.company' },
    { key: 'data', label: 'Data', perm: 'settings.company' },
  ];
  const SUBTITLES = {
    you: 'How the app looks for you, and what your role can do.',
    general: 'Your details, the company’s details and the rates the app uses.',
    rules: 'Who may decide what, and up to how much.',
    models: 'The BYD cars you sell, with their prices, colours and warranty.',
    locations: 'The places where cars, people and parts are kept.',
    access: 'Who can sign in, and what each person sees.',
    activity: 'Who changed what, and when.',
    data: 'Backups, and starting over.',
  };
  const BODIES = ['SUV', 'Sedan', 'Hatchback', 'MPV', 'Pickup', 'Commercial'];

  /* Paint colours are product data (what the car looks like), so a swatch shows the real paint.
     The Vehicles screen owns the paint list (NA.stock.paintHex); without it the dot stays neutral. */
  const paint = (name) => (NA.stock && typeof NA.stock.paintHex === 'function' ? NA.stock.paintHex(name) : 'var(--fill)');
  const swatch = (name) => `<i class="swatch" style="background:${esc(paint(name))}" aria-hidden="true"></i>`;
  const locIcon = (l) => (NA.stock && typeof NA.stock.locIcon === 'function' ? NA.stock.locIcon(l)
    : /ware|store|godown/i.test(l || '') ? 'warehouse' : /workshop|service/i.test(l || '') ? 'wrench' : 'store');
  const storageChars = () => { try { return (localStorage.getItem(STORAGE_KEY) || JSON.stringify(NA.db)).length; } catch (e) { return JSON.stringify(NA.db).length; } };
  const kb = (n) => (n / 1024).toFixed(n < 102400 ? 1 : 0) + ' KB';

  /* ---------------------------------------------------------------- Small form pieces */
  /** One <input>. f: { name, type, value, placeholder, min, max, step, required, aria, list, disabled } */
  function inputHtml(f, v) {
    const a = [`type="${f.type || 'text'}"`, `name="${esc(f.name)}"`, `value="${esc(v == null ? '' : v)}"`, `aria-label="${esc(f.aria || f.label || f.name)}"`];
    if (f.placeholder) a.push(`placeholder="${esc(f.placeholder)}"`);
    if (f.min != null) a.push(`min="${f.min}"`);
    if (f.max != null) a.push(`max="${f.max}"`);
    if (f.step != null) a.push(`step="${f.step}"`);
    if (f.type === 'number') a.push(`inputmode="${String(f.step || '').includes('.') ? 'decimal' : 'numeric'}"`);
    if (f.list) a.push(`list="${esc(f.list)}"`);
    if (f.maxlength) a.push(`maxlength="${f.maxlength}"`);
    if (f.required) a.push('required');
    if (f.disabled) a.push('disabled');
    return `<input ${a.join(' ')}/>`;
  }
  const textCtl = (f, v) => `<div class="field">${inputHtml(f, v)}</div>`;
  const moneyCtl = (f, v) => `<div class="field st-num"><div class="input-prefix"><span>৳</span>${inputHtml(Object.assign({ type: 'number', min: 0 }, f), v)}</div></div>`;
  const pctCtl = (f, v) => `<div class="field st-num"><div class="st-suffix">${inputHtml(Object.assign({ type: 'number' }, f), v)}<span>%</span></div></div>`;
  /** A settings row: words on the left, the control on the right. */
  const settingRow = (title, help, ctl, narrow) => `<div class="gl-row st-row"><div class="gl-main"><b>${esc(title)}</b>${help ? `<small>${esc(help)}</small>` : ''}</div>
      <div class="st-ctl${narrow ? ' st-narrow' : ''}">${ctl}</div></div>`;

  /* ------------------------------------------------------------------
     Groups of settings that are saved together ("Save" appears once
     something changed). What someone typed but has not saved yet is kept
     here, so a re-draw (other people's changes arriving from the office
     server) never throws it away.
     ------------------------------------------------------------------ */
  const GROUPS = {};                 // name -> { saved(): values, save(values): false to keep editing }
  const drafts = {};                 // name -> only the fields the person changed (so a newer saved value elsewhere is never overwritten)
  const drawn = {};                  // name -> fields whose inputs were last drawn from a draft rather than from the saved value
  const one = (x) => (x == null ? '' : String(x));
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, one(o[k])]));
  /**
   * The person's changes to a group, read from its inputs. A field counts when it was edited since the page drew it
   * (value differs from defaultValue / defaultChecked) or was already a draft when the page was drawn; every other
   * field keeps what is saved now, so a newer value saved elsewhere is never written back. Matches are dropped.
   */
  function changedIn(g, sec) {
    const saved = GROUPS[g].saved(), prev = drafts[g] || {}, fromDraft = drawn[g] || [], out = {};
    sec.querySelectorAll('[name]').forEach((el) => {
      const k = el.name;
      if (!(k in saved)) return;
      const edited = el.type === 'checkbox' ? el.checked !== el.defaultChecked : String(el.value) !== String(el.defaultValue);
      if (!edited && !(k in prev) && !fromDraft.includes(k)) return;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : String(el.value).trim();
      if (one(v) !== one(saved[k])) out[k] = v;
    });
    return out;
  }
  const valuesFor = (g) => Object.assign({}, GROUPS[g].saved(), drafts[g] || {});
  const isDirty = (g) => !!drafts[g] && norm(valuesFor(g)) !== norm(GROUPS[g].saved());
  const groupOpen = (g) => {
    drawn[g] = Object.keys(drafts[g] || {});
    return `<section class="st-group${isDirty(g) ? ' st-dirty' : ''}" data-group="${g}">`;
  };
  const saveBar = (g, text) => `<div class="st-save"><span class="st-save-text">${esc(text || 'You have changes that are not saved yet.')}</span>
      ${NA.ui.btn('Undo', { size: 'sm', act: 'discard', attrs: `data-g="${g}"` })}${NA.ui.btn('Save', { kind: 'primary', size: 'sm', act: 'save', attrs: `data-g="${g}"` })}</div>`;
  /** One blue Save on a screen: the first group with changes keeps it, any other group's Save is gray. */
  function onePrimary(scope) {
    let first = true;
    (scope ? scope.querySelectorAll('[data-group]') : []).forEach((sec) => {
      const b = sec.querySelector('.st-save [data-act="save"]');
      if (!b) return;
      const lead = first && sec.classList.contains('st-dirty');
      if (lead) first = false;
      b.classList.toggle('btn-primary', lead);
      b.classList.toggle('btn-ghost', !lead);
    });
  }

  function trackGroup(el) {
    const sec = el.closest('[data-group]');
    const g = sec && sec.dataset.group;
    if (!g || !GROUPS[g]) return;
    const ch = changedIn(g, sec);
    if (Object.keys(ch).length) drafts[g] = ch; else delete drafts[g];
    sec.classList.toggle('st-dirty', !!drafts[g]);
    onePrimary(sec.parentNode);
    const fld = el.closest('.field');
    if (fld) fld.classList.remove('invalid');
  }
  async function saveGroup(g, sec) {
    if (!g || !GROUPS[g] || !sec) return;
    if (!NA.ui.validate(sec)) return;
    const ch = changedIn(g, sec);
    if (!Object.keys(ch).length) { delete drafts[g]; NA.refresh(); return; }
    drafts[g] = ch;
    const r = await GROUPS[g].save(valuesFor(g));   // what is saved now, plus this person's changes
    if (r === false) return;
    delete drafts[g];
    NA.refresh();
  }

  /* ---------------------------------------------------------------- You (everyone) */
  // What a role is and what it may do come from access.js (NA.ROLE_TEXT, NA.ABILITIES), the same words How we work uses.
  const SCREENS = [['dashboard', 'Today'], ['approvals', 'Approvals'], ['leads', 'Leads'], ['customers', 'Customers'], ['sales', 'Orders'],
    ['inventory', 'Vehicles'], ['procurement', 'Purchasing'], ['service', 'Service'], ['parts', 'Parts'], ['finance', 'Accounts'],
    ['admin', 'People'], ['reports', 'Reports'], ['process', 'How we work']];

  /* The name on this computer. While it is still the placeholder 'Admin', NA.me() shows the Managing Director's
     staff name, so the box starts from that same name. */
  const localName = () => { const c = String(NA.db.settings.currentUser || '').trim(); return c && c !== 'Admin' ? c : (NA.me().name || c); };
  GROUPS.you = {
    saved: () => ({ currentUser: localName() }),
    save: (v) => {
      const name = String(v.currentUser || '').trim().replace(/\s+/g, ' ');
      if (!name) { NA.ui.toast('Type your name', 'error'); return false; }
      const old = localName();
      if (NA.db.settings.currentUser === name) return;
      NA.db.settings.currentUser = name;
      NA.save();
      if (old !== name) NA.log(`Name on this computer changed — ${old || '—'} → ${name}`, { link: '#/settings' });
      NA.ui.toast('Saved');
    },
  };

  /** Who is using the app, appearance, PIN. The Managing Director on one computer can also set their name. */
  function youGroup() {
    const me = NA.me();
    const look = NA.theme && NA.theme.get ? NA.theme.get() : 'auto';
    // A preview pauses syncing, but it shows what that person sees when signed in to the office server.
    const local = !shared() && !NA.preview;
    const nameRow = local && NA.can('settings.company');
    const staffNames = (NA.db.staff || []).filter((s) => s.active !== false && s.name).map((s) => `<option value="${esc(s.name)}">`).join('');
    const where = NA.preview ? 'preview — nothing is saved' : local ? 'this computer' : 'signed in';
    const btn = NA.preview ? NA.ui.btn('Exit preview', { size: 'sm', act: 'end-preview' })
      : !local ? NA.ui.btn('Change PIN or sign out', { size: 'sm', act: 'person' }) : '';
    return `${nameRow ? groupOpen('you') : '<section class="st-group">'}
      <div class="glist-title">You</div>
      <div class="glist">
        <div class="gl-row st-row">${NA.ui.avatar(me.name, 44)}<div class="gl-main"><b>${esc(me.name)}</b><small>${esc(NA.roleLabel(me.role))} · ${esc(where)}</small></div>${btn}</div>
        ${settingRow('Appearance', 'Light, dark, or the same as this computer. Kept on this computer only.',
          `<div class="seg" role="group" aria-label="Appearance">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) =>
            `<button type="button" class="${look === k ? 'active' : ''}" data-act="look" data-look="${k}" aria-pressed="${look === k}">${l}</button>`).join('')}</div>`)}
        ${nameRow ? settingRow('Your name', 'Pick your name from the staff list, so your work is linked to you. It is recorded on everything done on this computer.',
          textCtl({ name: 'currentUser', required: true, aria: 'Your name', list: 'st-staff-names', maxlength: 60 }, valuesFor('you').currentUser) + `<datalist id="st-staff-names">${staffNames}</datalist>`) : ''}
      </div>
      <p class="glist-foot">${local ? 'On one computer the app runs as the Managing Director. Start the office server to give each person their own sign-in and their own view.'
        : 'Your PIN is yours alone. The Managing Director can reset it if you forget it.'}</p>
      ${nameRow ? saveBar('you') : ''}
    </section>`;
  }

  /** What this person's role lets them see, do and approve (read-only). */
  function roleGroup() {
    const me = NA.me();
    const role = me.role;
    const A = NA.approvals;
    const p = NA.policy();
    const screens = SCREENS.filter(([s]) => NA.pages[s] && NA.canSee(s)).map(([, l]) => l);
    const can = (Array.isArray(NA.ABILITIES) ? NA.ABILITIES : []).filter(([perm]) => NA.can(perm)).map(([, l]) => l);
    const LIMIT = { discount: ['Discounts on a car', p.discountManager], expense: ['Expenses', p.expenseAccounts], service_discount: ['Service discounts', p.serviceDiscountManager] };
    const decides = !A ? [] : Object.keys(NA.APPROVALS).map((k) => {
      const small = A.approverRoles(k, 0).includes(role), big = A.approverRoles(k, 1e12).includes(role);
      if (!small && !big) return '';
      return LIMIT[k] && small && !big ? `${LIMIT[k][0]} up to ${M(LIMIT[k][1])}` : NA.APPROVALS[k].label;
    }).filter(Boolean);
    return `<section class="st-group">
      <div class="glist-title">What your role can do</div>
      <div class="glist">
        <div class="gl-row"><div class="gl-main"><b>${esc(NA.roleLabel(role))}</b><small>${esc((NA.ROLE_TEXT || {})[role] || '')}</small></div></div>
        ${screens.length ? `<div class="gl-row"><div class="gl-main"><b>Your screens</b><small>${esc(screens.join(' · '))}</small></div></div>` : ''}
        ${decides.length ? `<div class="gl-row"><div class="gl-main"><b>You approve</b><small>${esc(decides.join(' · '))}</small></div></div>` : ''}
        ${can.map((l) => `<div class="gl-row"><span class="tone-green">${NA.icon('check', 17)}</span><div class="gl-main">${esc(l)}</div></div>`).join('')}
      </div>
      <p class="glist-foot">Need something else? The Managing Director sets each person’s role in Settings → Sign-in and roles.</p>
    </section>`;
  }

  /* ---------------------------------------------------------------- General (Managing Director) */
  const COMPANY_FIELDS = [
    { name: 'company', label: 'Company name', required: true, maxlength: 120 },
    { name: 'tagline', label: 'Line under the name', placeholder: 'e.g. Authorized BYD Dealership · Bangladesh', maxlength: 160 },
    { name: 'address', label: 'Head office address', placeholder: 'e.g. House 12, Sector 7, Uttara, Dhaka', maxlength: 200 },
    { name: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. 09612-000000', maxlength: 40 },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'e.g. sales@noorautos.com.bd', maxlength: 120 },
    { name: 'bin', label: 'VAT registration number (BIN)', placeholder: 'e.g. 004588127-0101', maxlength: 40 },
    { name: 'tin', label: 'Tax number (TIN)', placeholder: 'e.g. 548812004471', maxlength: 40 },
  ];
  GROUPS.company = {
    saved: () => { const s = NA.db.settings; const o = {}; COMPANY_FIELDS.forEach((f) => { o[f.name] = s[f.name] || ''; }); return o; },
    save: (v) => {
      if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { NA.ui.toast('That email address does not look right', 'error'); return false; }
      const s = NA.db.settings;
      const changed = COMPANY_FIELDS.filter((f) => String(s[f.name] || '') !== String(v[f.name] || ''));
      if (!changed.length) return;
      COMPANY_FIELDS.forEach((f) => { s[f.name] = v[f.name] || ''; });
      NA.save();
      NA.log('Company details changed — ' + changed.map((f) => f.label.replace(/ \(.*\)$/, '').toLowerCase()).join(', '), { link: '#/settings' });
      NA.ui.toast('Company details saved');
    },
  };

  /** Empty boxes are refused (an empty number box would otherwise be saved as 0). Returns an error or ''. */
  function checkMoney(v) {
    if (blank(v.vatPct) || blank(v.advancePctUi) || blank(v.labourRate)) return 'Fill in the VAT, the advance and the labour rate — an empty box is not saved';
    const vat = Number(v.vatPct), adv = Number(v.advancePctUi), lab = Number(v.labourRate);
    if (!(vat >= 0 && vat <= 50)) return 'VAT must be between 0% and 50%';
    // Purchasing treats 0% or 100% and more as "not set" and falls back to 30%, so keep it in range.
    if (!(adv >= 1 && adv <= 99)) return 'The advance must be between 1% and 99% of the purchase order';
    if (!(lab >= 0 && lab <= 100000)) return 'The labour rate must be between ৳ 0 and ৳ 1,00,000 an hour';
    return '';
  }
  GROUPS.money = {
    saved: () => { const s = NA.db.settings; return { vatPct: +(num(s.vatRate) * 100).toFixed(2), advancePctUi: +(num(s.advancePct) * 100).toFixed(1), labourRate: s.labourRate == null || s.labourRate === '' ? '' : num(s.labourRate) }; },
    save: async (v) => {
      const err = checkMoney(v);
      if (err) { NA.ui.toast(err, 'error'); return false; }
      const s = NA.db.settings;
      const vat = Math.round(Number(v.vatPct) * 100) / 10000;     // 15 -> 0.15, 7.5 -> 0.075
      const adv = Math.round(Number(v.advancePctUi) * 10) / 1000; // 30 -> 0.3
      const lab = Math.round(Number(v.labourRate));
      const vatChanged = Math.abs(vat - num(s.vatRate)) > 1e-9;
      const changes = [];
      if (vatChanged) changes.push(`VAT ${pctText(s.vatRate)} → ${pctText(vat)}`);
      if (Math.abs(adv - num(s.advancePct)) > 1e-9) changes.push(`advance to the supplier ${pctText(s.advancePct)} → ${pctText(adv)}`);
      if (lab !== num(s.labourRate) || s.labourRate == null) changes.push(`labour ${M(s.labourRate)} → ${M(lab)} an hour`);
      if (!changes.length) return;
      // Car prices include VAT (the invoice and the quotation show it inside the price); paid service bills add it on top.
      if (vatChanged && !(await NA.ui.confirm(`Car prices include VAT, so they stay the same: new car invoices, and every quotation, will show the VAT inside the price at <b>${pctText(vat)}</b> instead of ${pctText(s.vatRate)}. New paid service bills will add <b>${pctText(vat)}</b> on top. Invoices already made keep their own rate.${vat === 0 ? '<br><br><b>0% means no VAT at all</b> on new invoices and service bills.' : ''}`,
        { title: 'Change the VAT rate?', okLabel: 'Change VAT' }))) return false;
      Object.assign(s, { vatRate: vat, advancePct: adv, labourRate: lab });
      NA.save();
      NA.log('Money rules changed — ' + changes.join(', '), { link: '#/settings', kind: 'warn' });
      NA.ui.toast('Saved');
    },
  };

  /* Office hours: People → Attendance reads settings.officeStart and settings.lateAfter (09:00 and 09:15 until set). */
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  GROUPS.hours = {
    saved: () => ({ officeStart: String(NA.db.settings.officeStart || '09:00'), lateAfter: String(NA.db.settings.lateAfter || '09:15') }),
    save: (v) => {
      const start = String(v.officeStart || '').slice(0, 5), late = String(v.lateAfter || '').slice(0, 5);
      if (!HHMM.test(start) || !HHMM.test(late)) { NA.ui.toast('Enter both times, for example 09:00', 'error'); return false; }
      if (late < start) { NA.ui.toast('“Late after” cannot be earlier than the time the office opens', 'error'); return false; }
      const before = GROUPS.hours.saved();
      if (before.officeStart === start && before.lateAfter === late) return;
      Object.assign(NA.db.settings, { officeStart: start, lateAfter: late });
      NA.save();
      NA.log(`Office hours changed — opens ${before.officeStart} → ${start}, late after ${before.lateAfter} → ${late}`, { link: '#/settings' });
      NA.ui.toast('Office hours saved');
    },
  };
  const timeCtl = (f, v) => `<div class="field st-num">${inputHtml(Object.assign({ type: 'time', required: true }, f), v)}</div>`;

  /* Public holidays: NA.isHoliday reads settings.holidays (Friday is always off) and leave requests skip them.
     Saved as { date: 'yyyy-mm-dd', name }; plain date strings from earlier are read too. Managing Director only. */
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const holidayList = () => (Array.isArray(NA.db.settings.holidays) ? NA.db.settings.holidays : [])
    .map((h) => (typeof h === 'string' ? { date: h, name: '' } : h && typeof h === 'object' ? { date: String(h.date || ''), name: String(h.name || '') } : null))
    .filter((h) => h && ISO_DAY.test(h.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const canHolidays = () => NA.can('settings.company') && !NA.preview;
  const weekday = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });

  function holidaysGroup() {
    const year = NA.today().slice(0, 4);
    const all = holidayList();
    const shown = all.filter((h) => h.date >= year + '-01-01');   // earlier years stay saved for past attendance and leave
    const earlier = all.length - shown.length;
    const rows = shown.map((h) => {
      const what = (h.name || 'Public holiday') + ', ' + NA.fmt.date(h.date);
      return `<div class="gl-row st-row"><div class="gl-main"><b>${esc(h.name || 'Public holiday')}</b><small>${esc(weekday(h.date))} · ${esc(NA.fmt.date(h.date))}</small></div>
        <button type="button" class="icon-btn" data-act="del-holiday" data-date="${esc(h.date)}" title="${esc('Remove ' + what)}" aria-label="${esc('Remove ' + what)}">${NA.icon('trash', 16)}</button></div>`;
    }).join('');
    return `<section class="st-group">
        <div class="glist-title">Public holidays</div>
        <div class="glist">${rows || `<div class="gl-row"><div class="gl-main muted">No public holidays listed for ${esc(year)} yet.</div></div>`}
          <div class="gl-row st-row"><div class="field st-date"><input type="date" data-new-holiday-date aria-label="Date of the holiday"/></div>
            <div class="field grow"><input type="text" data-new-holiday-name maxlength="60" placeholder="Name, e.g. Victory Day" aria-label="Name of the holiday"/></div>
            ${NA.ui.btn('Add', { icon: 'plus', act: 'add-holiday' })}</div>
        </div>
        <p class="glist-foot">Friday is always the weekly holiday. A leave request does not count public holidays as leave days.${earlier ? ` ${NA.fmt.num(earlier)} from earlier years ${earlier === 1 ? 'is' : 'are'} kept for past attendance and leave.` : ''}</p>
      </section>`;
  }

  function addHoliday(root) {
    if (!canHolidays()) return;
    const dIn = root.querySelector('[data-new-holiday-date]'), nIn = root.querySelector('[data-new-holiday-name]');
    if (!dIn || !nIn) return;
    const date = String(dIn.value || '').trim();
    const name = String(nIn.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!ISO_DAY.test(date) || isNaN(new Date(date + 'T00:00:00'))) { dIn.focus(); NA.ui.toast('Choose the date of the holiday', 'error'); return; }
    const list = holidayList();   // read again now: the list may have changed since the page was drawn
    const same = list.find((h) => h.date === date);
    if (same) { NA.ui.toast(`${NA.fmt.date(date)} is already on the list${same.name ? ' (' + same.name + ')' : ''}`, 'error'); return; }
    NA.db.settings.holidays = list.concat({ date, name }).sort((a, b) => a.date.localeCompare(b.date));
    NA.save();
    NA.log(`Public holiday added — ${NA.fmt.date(date)}${name ? ' · ' + name : ''}`, { link: '#/settings' });
    NA.ui.toast((name || 'Holiday') + ' added');
    NA.refresh();
  }

  function removeHoliday(date) {
    if (!canHolidays() || !ISO_DAY.test(String(date || ''))) return;
    const h = holidayList().find((x) => x.date === date);
    if (!h) { NA.refresh(); return; }
    NA.ui.confirm(`Remove <b>${esc(h.name || 'Public holiday')}</b> on ${esc(NA.fmt.date(date))}? That day then counts as a working day again.`,
      { title: 'Remove holiday', okLabel: 'Remove', danger: true }).then((ok) => {
      if (!ok) return;
      const list = holidayList();
      if (!list.some((x) => x.date === date)) { NA.refresh(); return; }
      NA.db.settings.holidays = list.filter((x) => x.date !== date);
      NA.save();
      NA.log(`Public holiday removed — ${NA.fmt.date(date)}${h.name ? ' · ' + h.name : ''}`, { kind: 'warn', link: '#/settings' });
      NA.ui.toast((h.name || 'Holiday') + ' removed');
      NA.refresh();
    });
  }

  function generalTab() {
    const c = valuesFor('company'), r = valuesFor('money'), h = valuesFor('hours');
    return `${youGroup()}
      ${groupOpen('company')}
        <div class="glist-title">Company</div>
        <div class="glist">${COMPANY_FIELDS.map((f) => settingRow(f.label, '', textCtl(f, c[f.name]))).join('')}</div>
        <p class="glist-foot">Printed on quotations, invoices, receipts and gate passes.</p>
        ${saveBar('company')}
      </section>
      ${groupOpen('money')}
        <div class="glist-title">Tax and rates</div>
        <div class="glist">
          ${settingRow('VAT', 'Car prices include it: the invoice shows the VAT inside the price. Paid service bills add it on top. Bangladesh: 15%.', pctCtl({ name: 'vatPct', min: 0, max: 50, step: 0.5, required: true, aria: 'VAT in percent' }, r.vatPct), true)}
          ${settingRow('Advance to the supplier', 'Paid when a purchase order is placed. The rest is paid car by car when each VIN arrives.', pctCtl({ name: 'advancePctUi', min: 1, max: 99, step: 1, required: true, aria: 'Advance in percent' }, r.advancePctUi), true)}
          ${settingRow('Workshop labour rate', 'For one hour of work, before VAT. New job cards start with it.', moneyCtl({ name: 'labourRate', step: 50, max: 100000, required: true, aria: 'Labour rate for one hour' }, r.labourRate), true)}
        </div>
        <p class="glist-foot">New invoices, purchase orders and job cards use these; what was made before keeps its own figures. Quotations always show the VAT at today’s rate.</p>
        ${saveBar('money')}
      </section>
      ${groupOpen('hours')}
        <div class="glist-title">Office hours</div>
        <div class="glist">
          ${settingRow('Office opens', 'The start of the working day.', timeCtl({ name: 'officeStart', aria: 'Office opens at' }, h.officeStart), true)}
          ${settingRow('Late after', 'Someone who arrives after this time is marked late.', timeCtl({ name: 'lateAfter', aria: 'Late after' }, h.lateAfter), true)}
        </div>
        <p class="glist-foot">Used by People → Attendance. Friday is the weekly holiday.</p>
        ${saveBar('hours')}
      </section>
      ${holidaysGroup()}`;
  }

  /* ---------------------------------------------------------------- Approval rules (Managing Director) */
  const POLICY = [
    { section: 'Discount on a car' },
    { key: 'discountFree', type: 'money', step: 1000, short: 'consultant’s own discount limit', text: (c) => `A consultant may give up to ${c} off a car without asking.`, help: 'Above this, the Sales Manager decides.' },
    { key: 'discountManager', type: 'money', step: 1000, short: 'Sales Manager’s discount limit', text: (c) => `The Sales Manager may approve up to ${c} off a car.`, help: 'Above this, the Managing Director decides.' },
    { section: 'Expenses' },
    { key: 'expenseFree', type: 'money', step: 500, short: 'spending without approval', text: (c) => `Anyone may spend up to ${c} without asking.`, help: 'Above this, Accounts decides. Nobody approves their own claim.' },
    { key: 'expenseAccounts', type: 'money', step: 500, short: 'Accounts’ expense limit', text: (c) => `Accounts may approve expenses up to ${c}.`, help: 'Above this, the Managing Director decides.' },
    { section: 'Service bills' },
    { key: 'serviceDiscountFree', type: 'money', step: 500, short: 'service discount without approval', text: (c) => `The service desk may take up to ${c} off a bill without asking.`, help: 'Above this, the Service Manager decides.' },
    { key: 'serviceDiscountManager', type: 'money', step: 500, short: 'Service Manager’s discount limit', text: (c) => `The Service Manager may approve up to ${c} off a bill.`, help: 'Above this, the Managing Director decides.' },
    { section: 'Buying and stock' },
    { key: 'poApproval', type: 'switch', short: 'purchase orders need approval', title: 'Purchase orders need the Managing Director’s OK', help: 'Before the advance is paid. Emergency purchases always need it.' },
    // Parts reads it (NA.defaultPolicy: ৳1,00,000). Supplier payments have no switch: the approved purchase order covers them.
    { key: 'partsOrderLimit', type: 'money', step: 5000, def: 100000, short: 'parts order limit', text: (c) => `A parts order above ${c} needs the Managing Director’s OK.`, help: 'Smaller parts orders are placed without asking. When purchase orders need no approval, parts orders do not either.' },
    { key: 'stockAdjustApproval', type: 'switch', short: 'stock corrections need approval', title: 'Stock corrections need the Managing Director’s OK', help: 'Writing parts off, correcting a count, or adding a car without a purchase order. The stock changes once it is approved.' },
    { section: 'Leads and quotations' },
    { key: 'quoteValidDays', type: 'count', min: 1, max: 365, short: 'days a quotation is valid', text: (c) => `A quotation is valid for ${c} days.`, help: 'After that it must be renewed before it is printed or turned into an order.' },
    { key: 'firstContactHours', type: 'count', min: 1, max: 720, short: 'hours to contact a new lead', text: (c) => `A new lead must be contacted within ${c} hours.`, help: 'After that it shows as “Not contacted” in red.' },
  ];
  const humanise = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (x) => x.toUpperCase());
  /** Every field of NA.defaultPolicy(): the known ones in plain words, any newer ones listed generically. */
  function policyRows() {
    const known = new Set(POLICY.filter((r) => r.key).map((r) => r.key));
    const defs = NA.defaultPolicy();
    const extra = Object.keys(defs).filter((k) => !known.has(k)).map((k) => (typeof defs[k] === 'boolean'
      ? { key: k, type: 'switch', short: humanise(k).toLowerCase(), title: humanise(k), help: '' }
      : { key: k, type: 'count', min: 0, short: humanise(k).toLowerCase(), text: (c) => `${esc(humanise(k))}: ${c}`, help: '' }));
    return POLICY.concat(extra.length ? [{ section: 'Other rules' }].concat(extra) : []);
  }
  const policyFields = () => policyRows().filter((r) => r.key);
  /** The rule as it works today: saved value, else the built-in default (switches are on unless switched off). */
  const policyValue = (r, p) => {
    if (r.type === 'switch') return p[r.key] !== false;
    const x = p[r.key];
    return x == null || x === '' || isNaN(Number(x)) ? (r.def != null ? r.def : 0) : Number(x);
  };

  /** Returns an error message, or '' when the limits make sense. */
  function checkPolicy(v) {
    for (const r of policyFields()) {
      if (r.type === 'switch') continue;
      if (blank(v[r.key])) return 'Fill in every limit — an empty box is not saved';
      const n = Number(v[r.key]);
      if (!isFinite(n) || n < 0) return 'Limits cannot be below 0';
      if (r.min != null && n < r.min) return `The ${r.short} must be at least ${r.min}`;
      if (r.max != null && n > r.max) return `The ${r.short} can be at most ${r.max}`;
    }
    const pairs = [['discountFree', 'discountManager', 'The Sales Manager’s discount limit', 'what a consultant may give alone'],
      ['expenseFree', 'expenseAccounts', 'The Accounts expense limit', 'what anyone may spend alone'],
      ['serviceDiscountFree', 'serviceDiscountManager', 'The Service Manager’s discount limit', 'what the service desk may give alone']];
    for (const [lo, hi, label, other] of pairs) {
      if (lo in v && hi in v && Number(v[hi]) < Number(v[lo])) return `${label} (${M(v[hi])}) cannot be lower than ${other} (${M(v[lo])})`;
    }
    return '';
  }
  /**
   * Open work whose discount needed no approval under the old "without asking" limit but will under the lower one:
   * the discount checks (B.discountOk, quotations, job cards) read the limit as it is now, not as it was at booking.
   * Returns phrases such as ['3 open orders', '1 quotation'].
   */
  function heldByLowerLimits(before, next) {
    const A = NA.approvals;
    if (!A) return [];
    const out = [];
    const count = (n, one, many) => `${NA.fmt.num(n)} ${n === 1 ? one : many}`;
    const between = (d, lo, hi) => d > lo && d <= hi;
    const T = NA.today();
    const lo = num(next.discountFree), hi = num(before.discountFree);
    if (lo < hi) {
      const start = NA.db.settings.policyStart || T;   // orders from before the rules are not held up (see B.discountOk)
      const orders = (NA.db.orders || []).filter((o) => {
        const d = num(o.discount);
        if (!between(d, lo, hi) || ['delivered', 'cancelled'].includes(o.stage)) return false;
        if (String(o.createdAt || '').slice(0, 10) < start && !o.discountChangedAt) return false;
        return !A.isApproved('orders', o.id, 'discount', d) && !(o.leadId && A.isApproved('leads', o.leadId, 'discount', d));
      }).length;
      const quotes = (NA.db.leads || []).filter((l) => {
        const q = l.quotation;
        if (!q || !(num(q.price) > 0) || ['won', 'lost'].includes(l.stage) || (q.validUntil && q.validUntil < T) || (q.modelId && q.modelId !== l.modelId)) return false;
        const list = num(q.listPrice) || num((NA.model(q.modelId || l.modelId) || {}).price) || num(q.price);
        const conc = Math.max(0, list - num(q.price)) + num(q.discount);   // what leads.js counts as given away
        return between(conc, lo, hi) && !A.isApproved('leads', l.id, 'discount', conc);
      }).length;
      if (orders) out.push(count(orders, 'open order', 'open orders'));
      if (quotes) out.push(count(quotes, 'quotation', 'quotations'));
    }
    const slo = num(next.serviceDiscountFree), shi = num(before.serviceDiscountFree);
    if (slo < shi) {
      const jobs = (NA.db.jobCards || []).filter((jc) => {
        const d = jc.discount ? Math.max(0, num(jc.discount.amount)) : 0;
        if (!between(d, slo, shi) || ['invoiced', 'closed', 'cancelled'].includes(jc.status) || jc.billing === 'warranty' || jc.billing === 'internal' || !jc.customerId) return false;
        return !A.isApproved('jobCards', jc.id, 'service_discount', d);
      }).length;
      if (jobs) out.push(count(jobs, 'job card', 'job cards'));
    }
    return out;
  }
  const andList = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

  GROUPS.policy = {
    saved: () => { const p = NA.policy(); const o = {}; policyFields().forEach((r) => { o[r.key] = policyValue(r, p); }); return o; },
    save: async (v) => {
      const err = checkPolicy(v);
      if (err) { NA.ui.toast(err, 'error'); return false; }
      const before = NA.policy();
      const next = {};
      policyFields().forEach((r) => { next[r.key] = r.type === 'switch' ? !!v[r.key] : Math.round(Number(v[r.key])); });
      const show = (r, x) => (r.type === 'switch' ? (x ? 'on' : 'off') : r.type === 'money' ? M(x) : String(x));
      const changes = policyFields().filter((r) => policyValue(r, before) !== next[r.key])
        .map((r) => (r.type === 'switch' ? `${r.short}: ${show(r, next[r.key])}` : `${r.short} ${show(r, policyValue(r, before))} → ${show(r, next[r.key])}`));
      if (!changes.length) return;
      const held = heldByLowerLimits(before, next);
      const one = held.length === 1 && /^1 /.test(held[0]);
      if (held.length && !(await NA.ui.confirm(`<b>${esc(andList(held))}</b> ${one ? 'has' : 'have'} a discount that needed no approval under the old limit. Under the new limit ${one ? 'it needs' : 'they need'} approval too, so ${one ? 'it waits' : 'they wait'} until someone asks for it and it is given.`,
        { title: 'Lower the limit?', okLabel: 'Save the new limit' }))) return false;
      const s = NA.db.settings;
      s.policy = Object.assign({}, s.policy || {}, next);
      delete s.policy.vendorPaymentApproval;   // no longer a rule: the approved purchase order covers its supplier payments
      if (!s.policyStart) s.policyStart = NA.today();   // orders made before the rules existed are not held up
      NA.save();
      NA.log('Approval rules changed — ' + changes.join('; '), { link: '#/settings?tab=rules', kind: 'warn' });
      NA.ui.toast('Approval rules saved');
    },
  };

  function policyRow(r, v) {
    if (r.type === 'switch') {
      return `<label class="gl-row st-row"><span class="gl-main"><b>${esc(r.title)}</b>${r.help ? `<small>${esc(r.help)}</small>` : ''}</span>
        <input type="checkbox" name="${esc(r.key)}" ${v ? 'checked' : ''} aria-label="${esc(r.title)}"/></label>`;
    }
    const f = { type: 'number', name: r.key, min: r.min != null ? r.min : 0, max: r.max, step: r.step || 1, required: true, aria: humanise(r.short) };
    const ctl = r.type === 'money'
      ? `<span class="field st-inline"><span class="input-prefix"><span>৳</span>${inputHtml(f, v)}</span></span>`
      : `<span class="field st-inline st-short">${inputHtml(f, v)}</span>`;
    return `<div class="gl-row st-row"><div class="gl-main"><div class="st-sentence">${r.text(ctl)}</div>${r.help ? `<small>${esc(r.help)}</small>` : ''}</div></div>`;
  }

  /** "Who approves what", from the saved rules and the approval kinds in approvals.js. */
  function whoApprovesRows() {
    const p = NA.policy();
    const A = NA.approvals;
    const tier = (free, mgr, role) => `Up to ${M(free)} without asking · up to ${M(mgr)} ${NA.roleLabel(role)} · above that Managing Director`;
    const off = { po: 'poApproval', stock_adjust: 'stockAdjustApproval' };
    const partsLimit = policyValue(POLICY.find((r) => r.key === 'partsOrderLimit'), p);
    const rows = [];
    Object.keys(NA.APPROVALS).forEach((k) => {
      const t = NA.APPROVALS[k];
      const by = (A ? A.approverRoles(k, 0) : ['owner']).map(NA.roleLabel).join(' or ');
      let who;
      if (k === 'discount') who = tier(p.discountFree, p.discountManager, 'sales_manager');
      else if (k === 'expense') who = tier(p.expenseFree, p.expenseAccounts, 'accounts');
      else if (k === 'service_discount') who = tier(p.serviceDiscountFree, p.serviceDiscountManager, 'service_manager');
      else if (k === 'vendor_payment') who = 'Covered by the approved purchase order · Accounts pays only what it allows';
      else if (off[k] && p[off[k]] === false) who = 'No approval needed — switched off above';
      else if (k === 'po') who = `${by}, before the ${pctText(num(NA.db.settings.advancePct) > 0 && num(NA.db.settings.advancePct) < 1 ? NA.db.settings.advancePct : 0.3)} advance is paid`;
      else if (k === 'leave') who = `${by} (their own leave: ${NA.roleLabel('owner')})`;   // Admin & HR never approve their own
      else who = by;
      rows.push({ icon: t.icon || 'info', label: t.label || k, who });
      // Parts orders use the purchase-order approval, above their own limit (the Approvals page lists them the same way).
      if (k === 'po') rows.push({ icon: 'layers', label: 'Parts order', who: p.poApproval === false ? 'No approval needed — purchase orders are switched off above' : `Above ${M(partsLimit)}: ${NA.roleLabel('owner')} · smaller orders are placed without asking` });
    });
    rows.push({ icon: 'wallet', label: 'Customer money counts', who: 'Only once Accounts confirms it: cash handed over, cheque cleared, transfer seen in the bank' });
    return rows;
  }

  function rulesTab() {
    const v = valuesFor('policy');
    let html = '', open = false;
    policyRows().forEach((r) => {
      if (r.section) { html += `${open ? '</div>' : ''}<div class="glist-title">${esc(r.section)}</div><div class="glist">`; open = true; return; }
      html += policyRow(r, v[r.key]);
    });
    if (open) html += '</div>';
    return `${groupOpen('policy')}${html}
        <p class="glist-foot">New requests follow the new limits, and requests already waiting keep the approver they were sent to. A lower “without asking” discount limit also covers open orders, quotations and job cards; you are asked first when it does.</p>
        ${saveBar('policy', 'The approval rules have changed. Save them to use them.')}
      </section>
      <section class="st-group">
        <div class="glist-title">Who approves what</div>
        <div class="glist">${whoApprovesRows().map((r) => `<div class="gl-row has-icon"><span class="gl-icon bg-gray">${NA.icon(r.icon, 17)}</span><div class="gl-main"><b>${esc(r.label)}</b><small>${esc(r.who)}</small></div></div>`).join('')}</div>
        <p class="glist-foot">Nobody approves their own request. When the person asking may decide it themselves, it is approved at once and recorded.</p>
      </section>`;
  }

  /* ---------------------------------------------------------------- Models & prices (Managing Director) */
  const modelTitle = (m) => (m.name || '') + (m.variant ? ' ' + m.variant : '');
  const exVatOf = (price) => Math.round(num(price) / (1 + num(NA.db.settings.vatRate)));
  /** Prices and landed cost: the Managing Director only (also when someone else may edit the other details). */
  const canPrice = () => NA.isRole('owner') && !NA.preview;

  function modelsTab(q) {
    const show = ['active', 'inactive', 'all'].includes(q.show) ? q.show : 'active';
    const all = NA.db.models.slice().sort((a, b) => num(a.price) - num(b.price));
    const counts = { active: all.filter((m) => m.active !== false).length, inactive: all.filter((m) => m.active === false).length, all: all.length };
    const list = all.filter((m) => show === 'all' || (show === 'active' ? m.active !== false : m.active === false));
    const seeCost = NA.can('costs.view');
    const rows = list.map((m) => {
      const colors = Array.isArray(m.colors) ? m.colors : [];
      const stock = NA.where('vehicles', (v) => v.modelId === m.id && v.status === 'available').length;
      const open = NA.where('orders', (o) => o.modelId === m.id && !['delivered', 'cancelled'].includes(o.stage)).length;
      const facts = [m.body, colors.length + (colors.length === 1 ? ' colour' : ' colours'), stock + ' in stock', open ? open + (open === 1 ? ' open order' : ' open orders') : ''].filter(Boolean);
      const hasCost = seeCost && m.cost != null && m.cost !== '';
      const margin = exVatOf(m.price) - num(m.cost);
      return `<button type="button" class="gl-row st-row" data-act="edit-model" data-id="${esc(m.id)}">
        <span class="gl-main"><b>${esc(m.name)}${m.variant ? ` <span class="muted">${esc(m.variant)}</span>` : ''}</b>
          <small><span class="st-dots">${colors.slice(0, 8).map((c) => swatch(c)).join('')}</span>${esc(facts.join(' · '))}</small>
          ${hasCost ? `<small class="${margin < 0 ? 'tone-red' : ''}">${margin < 0 ? `Below cost before VAT — loses ${M(-margin)} on each car` : `Costs us ${M(m.cost)} · margin before VAT ${M(margin)}`}</small>` : ''}</span>
        ${m.active === false ? NA.ui.badge('Not selling', 'gray') : ''}
        <span class="gl-value st-price">${M(m.price)}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
    }).join('');
    return `<div class="toolbar">
        <div class="chips">${[['active', 'On sale'], ['inactive', 'Not selling'], ['all', 'All']].map(([k, l]) => `<button type="button" class="chip ${show === k ? 'active' : ''}" data-act="show" data-k="${k}">${l} <span class="n">${counts[k]}</span></button>`).join('')}</div>
        <span class="spacer"></span>${canPrice() ? NA.ui.btn('Add model', { kind: 'primary', icon: 'plus', act: 'add-model' }) : ''}
      </div>
      ${list.length ? `<div class="glist">${rows}</div>
        <p class="glist-foot">Prices include VAT. Quotations and new orders use them; orders already booked keep the price agreed with the customer. Choose a model to change its price, colours or warranty.</p>`
        : `<div class="card">${NA.ui.empty(show === 'inactive' ? 'Every model is on sale.' : all.length ? 'No model is on sale. Put one back on sale from “Not selling”.' : 'No models yet. Add the BYD cars you sell.', 'car')}</div>`}`;
  }

  /**
   * Check a model sheet and build the record to save (no data is changed here).
   * Returns { error } or { rec, exVat, priceChanged, costChanged, activeChanged, nothing, belowCost }.
   */
  function buildModel(m, v, colors, opt) {
    const isNew = !m;
    const name = String(v.name || '').trim().replace(/\s+/g, ' ');
    const variant = String(v.variant || '').trim().replace(/\s+/g, ' ');
    if (!name) return { error: 'Type the model name' };
    const same = NA.db.models.find((x) => (!m || x.id !== m.id) && String(x.name || '').toLowerCase() === name.toLowerCase() && String(x.variant || '').toLowerCase() === variant.toLowerCase());
    if (same) return { error: `${name}${variant ? ' ' + variant : ''} is already on the list` };
    if (!colors.length) return { error: 'Add at least one colour' };
    const whole = (k) => (blank(v[k]) ? null : Math.round(Number(v[k])));
    const wm = whole('warrantyMonths'), wk = whole('warrantyKm'), bm = whole('batteryWarrantyMonths');
    if (wm == null || wk == null || bm == null) return { error: 'Fill in the warranty — 0 is allowed, an empty box is not' };
    if (wm < 0 || wk < 0 || bm < 0) return { error: 'The warranty cannot be below 0' };
    const rec = {
      name, variant, body: v.body || 'SUV', colors: colors.slice(), warrantyMonths: wm, warrantyKm: wk, batteryWarrantyMonths: bm, active: !!v.active,
      // The short code (used on demo VIN references) is made from the name once and then kept.
      vinCode: (m && m.vinCode) || name.replace(/^BYD\s*/i, '').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'BYD',
    };
    const priceOk = !!opt.canPrice, costOk = !!opt.canPrice && !!opt.seeCost;
    let price = m ? num(m.price) : 0;
    let cost = m && m.cost != null && m.cost !== '' ? num(m.cost) : null;
    if (priceOk) {
      if (blank(v.price) || !(Number(v.price) > 0)) return { error: 'The price must be more than ৳ 0' };
      price = Math.round(Number(v.price));
      rec.price = price;
      if (costOk) {
        if (blank(v.cost) || !(Number(v.cost) >= 0)) return { error: 'Enter the landed cost — what one car costs us here' };
        cost = Math.round(Number(v.cost));
        rec.cost = cost;
      }
    } else if (isNew) return { error: 'Only the Managing Director adds models and sets prices' };
    const priceChanged = priceOk && (isNew || price !== num(m.price));
    const costChanged = costOk && (isNew || cost !== (m.cost != null && m.cost !== '' ? num(m.cost) : null));
    const activeChanged = !isNew && (m.active !== false) !== rec.active;
    const detail = (x) => JSON.stringify([x.name || '', x.variant || '', x.body || '', x.colors || [], x.warrantyMonths, x.warrantyKm, x.batteryWarrantyMonths].map((y) => (y == null ? '' : y)));
    const nothing = !isNew && !priceChanged && !costChanged && !activeChanged && detail(m) === detail(rec);
    const exVat = exVatOf(price);
    // Compare the landed cost with the price BEFORE VAT: that is what the business keeps.
    const belowCost = costOk && cost != null && exVat < cost && (priceChanged || costChanged);
    return { rec, exVat, priceChanged, costChanged, activeChanged, nothing, belowCost };
  }

  /* Landed cost is for cost roles only, but every role receives the models: the office server holds back only the
     top-level `cost`. So a cost never goes into a model's price history or its timeline, nor into the activity feed
     (the Service Manager reads all of it). What older versions saved there is cleaned once, by the Managing Director. */
  const COST_LINE = 'Landed cost changed — ';
  /** 'Landed cost changed — BYD Seal: ৳ 1 → ৳ 2' → 'Landed cost changed — BYD Seal'. */
  const withoutAmounts = (t) => {
    if (typeof t !== 'string' || t.indexOf(COST_LINE) !== 0) return t;
    const arrow = t.indexOf(' → ');
    const cut = arrow > 0 ? t.lastIndexOf(': ', arrow) : -1;
    return cut > 0 ? t.slice(0, cut) : t;
  };
  /** Price history without costs; neighbours left with the same price become one entry (the oldest, when it began). */
  const pricesOnly = (list) => list.filter((h) => h && typeof h === 'object').reduce((out, h) => {
    const x = Object.assign({}, h);
    delete x.cost;
    if (out.length && num(out[out.length - 1].price) === num(x.price)) out[out.length - 1] = x; else out.push(x);
    return out;
  }, []);
  let costTrailClean = false;
  function cleanCostTrail() {
    if (costTrailClean || !NA.isRole('owner') || NA.preview) return;
    costTrailClean = true;
    let n = 0;
    (NA.db.models || []).forEach((m) => {
      if (!m || typeof m !== 'object') return;
      if (Array.isArray(m.priceHistory) && m.priceHistory.some((h) => h && typeof h === 'object' && 'cost' in h)) { m.priceHistory = pricesOnly(m.priceHistory); n++; }
      (Array.isArray(m.history) ? m.history : []).forEach((h) => { if (h && withoutAmounts(h.text) !== h.text) { h.text = withoutAmounts(h.text); n++; } });
    });
    (NA.db.activity || []).forEach((a) => { if (a && withoutAmounts(a.text) !== a.text) { a.text = withoutAmounts(a.text); n++; } });
    if (n) NA.save();
  }

  /** Save a checked model: price history (from, price, by — never the cost), the record, and the log. */
  function applyModel(m, res) {
    const rec = Object.assign({}, res.rec);
    const nm = modelTitle(rec);
    if (!m || res.priceChanged) {
      const hist = m && Array.isArray(m.priceHistory) ? pricesOnly(m.priceHistory) : [];
      // A model from before price history was kept: remember the old price first.
      if (m && !hist.length) hist.push({ from: String(m.createdAt || '').slice(0, 10) || null, price: num(m.price), by: null });
      hist.unshift({ from: NA.today(), price: rec.price != null ? rec.price : num(m.price), by: meName() });
      rec.priceHistory = hist.slice(0, 60);
    } else if (m && Array.isArray(m.priceHistory) && m.priceHistory.some((h) => h && typeof h === 'object' && 'cost' in h)) {
      rec.priceHistory = pricesOnly(m.priceHistory);
    }
    const link = '#/settings?tab=models';
    if (!m) {
      const n = NA.insert('models', rec);
      NA.log(`Model added — ${nm} at ${M(rec.price)}`, { link, kind: 'success', rec: n });
      return n;
    }
    const before = { price: num(m.price) };
    const live = NA.update('models', m.id, rec);
    if (res.priceChanged) NA.log(`Price changed — ${nm}: ${M(before.price)} → ${M(rec.price)}`, { link, kind: 'warn', rec: live });
    // No amounts and not on the model's own timeline: both reach people who may not see costs.
    if (res.costChanged) NA.log(COST_LINE + nm, { link, kind: 'warn' });
    if (res.activeChanged) NA.log(`${nm} ${rec.active ? 'put back on sale' : 'taken off sale'}`, { link, rec: live });
    if (!res.priceChanged && !res.costChanged && !res.activeChanged) NA.log(`Model details changed — ${nm}`, { link, rec: live });
    return live;
  }

  function marginHtml(price, cost, seeCost) {
    if (!(price > 0)) return '';
    const ex = exVatOf(price);
    if (!seeCost || cost === '' || cost == null || isNaN(cost)) return `<span class="muted">Before VAT ${M(ex)}</span>`;
    const mg = ex - cost;
    return mg < 0
      ? `<span class="tone-red">Before VAT the price is ${M(ex)}, which is ${M(-mg)} below the landed cost. Each car sold at this price loses money.</span>`
      : `<span class="muted">Before VAT ${M(ex)} · margin ${M(mg)} on each car${ex ? ' (' + (mg / ex * 100).toFixed(1) + '%)' : ''}</span>`;
  }

  /** The sheet for adding or changing a model. */
  function modelSheet(m) {
    const isNew = !m;
    if (isNew && !canPrice()) return NA.ui.toast('Only the Managing Director adds models', 'error');
    const priceOk = canPrice(), seeCost = NA.can('costs.view');
    const v0 = m || { body: 'SUV', warrantyMonths: 72, warrantyKm: 150000, batteryWarrantyMonths: 96, active: true };
    const colors = (m ? (Array.isArray(m.colors) ? m.colors : []) : ['Ski White', 'Cosmos Black']).slice();
    const hist = m && Array.isArray(m.priceHistory) ? m.priceHistory : [];
    const fld = (f) => NA.ui.field(f, v0[f.name]);
    const priceHtml = priceOk
      ? fld({ name: 'price', label: 'Showroom price, VAT included', type: 'money', required: true, step: 1000 })
        + (seeCost ? fld({ name: 'cost', label: 'Landed cost of one car', type: 'money', required: true, step: 1000, help: 'What one car costs us here. New purchase orders start from it.' }) : '')
      : `<div class="span-2 lock-note">${NA.icon('lock', 14)}The Managing Director sets prices. Now ${M(v0.price)}.</div>`;
    const histHtml = !hist.length ? '' : `<div class="glist-title mt-24">Price history</div>
      <div class="glist">${hist.slice(0, 12).map((h) => `<div class="gl-row"><div class="gl-main"><b class="num">${M(h.price)}</b>
        <small>${h.from ? 'From ' + esc(NA.fmt.date(h.from)) : 'Earlier price'}${h.by ? ' · ' + esc(h.by) : ''}</small></div></div>`).join('')}</div>`;
    NA.ui.modal({
      title: isNew ? 'Add a model' : modelTitle(m), size: 'lg',
      subtitle: isNew ? 'A BYD car you sell. It appears in quotations and new orders while it is on sale.' : '',
      body: `<form class="modal-form" onsubmit="return false"><div class="form-grid">
          ${fld({ name: 'name', label: 'Model', required: true, placeholder: 'e.g. BYD ATTO 3' })}
          ${fld({ name: 'variant', label: 'Version', placeholder: 'e.g. Extended Range' })}
          ${NA.ui.field({ name: 'body', label: 'Body', type: 'select', options: !v0.body || BODIES.includes(v0.body) ? BODIES : BODIES.concat(v0.body), placeholder: false }, v0.body || 'SUV')}
          ${NA.ui.field({ name: 'active', label: 'On sale', type: 'checkbox', help: 'Offered in quotations and new orders' }, v0.active !== false)}
          <div class="form-section">Price</div>
          ${priceHtml}
          <div class="span-2 small" data-margin></div>
          <div class="form-section">Colours</div>
          <div class="span-2"><div class="st-chips" data-colors></div>
            <div class="st-add"><div class="field"><input type="text" data-new-color maxlength="40" placeholder="Add a colour, e.g. Surf Blue" aria-label="New colour"/></div>
              <button type="button" class="btn btn-ghost" data-add-color>${NA.icon('plus', 16)}Add</button></div></div>
          <div class="form-section">Warranty</div>
          ${fld({ name: 'warrantyMonths', label: 'Car warranty (months)', type: 'number', min: 0, step: 1, required: true })}
          ${fld({ name: 'warrantyKm', label: 'Car warranty (km)', type: 'number', min: 0, step: 1000, required: true })}
          ${fld({ name: 'batteryWarrantyMonths', label: 'Battery warranty (months)', type: 'number', min: 0, step: 1, required: true })}
        </div>${histHtml}</form>`,
      onMount: (el) => {
        const box = el.querySelector('[data-colors]');
        const inp = el.querySelector('[data-new-color]');
        const draw = () => {
          box.innerHTML = colors.length ? colors.map((c, i) => `<span class="st-chip">${swatch(c)}${esc(c)}<button type="button" data-del-color="${i}" aria-label="Remove ${esc(c)}">${NA.icon('x', 12)}</button></span>`).join('')
            : '<span class="small muted">No colours yet — add at least one.</span>';
        };
        const add = () => {
          const c = inp.value.trim().replace(/\s+/g, ' ');
          if (!c) { inp.focus(); return; }
          if (colors.some((x) => x.toLowerCase() === c.toLowerCase())) { NA.ui.toast(c + ' is already on the list', 'error'); return; }
          colors.push(c); inp.value = ''; draw(); inp.focus();
        };
        el.querySelector('[data-add-color]').onclick = add;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        box.addEventListener('click', (e) => { const b = e.target.closest('[data-del-color]'); if (b) { colors.splice(+b.dataset.delColor, 1); draw(); } });
        const mEl = el.querySelector('[data-margin]');
        const upd = () => {
          const p = el.querySelector('[name=price]'), c = el.querySelector('[name=cost]');
          const cost = c ? (c.value === '' ? '' : Number(c.value)) : (seeCost && v0.cost != null ? num(v0.cost) : '');
          mEl.innerHTML = marginHtml(p ? Number(p.value) : num(v0.price), cost, seeCost);
        };
        el.addEventListener('input', (e) => { if (e.target.matches('[name=price], [name=cost]')) upd(); });
        draw(); upd();
      },
      actions: [{ label: 'Cancel' }, { label: isNew ? 'Add model' : 'Save', kind: 'primary', onClick: async (el) => {
        const form = el.querySelector('form');
        if (!NA.ui.validate(form)) return false;
        const fresh = m ? NA.get('models', m.id) : null;   // the latest copy (someone may have changed it meanwhile)
        if (m && !fresh) { NA.ui.toast('This model is no longer on the list', 'error'); return; }
        const res = buildModel(fresh, NA.ui.readForm(form), colors, { canPrice: priceOk, seeCost });
        if (res.error) { NA.ui.toast(res.error, 'error'); return false; }
        if (res.nothing) return;
        if (res.belowCost && !(await NA.ui.confirm(`Before VAT the price is <b>${M(res.exVat)}</b>, below the landed cost of <b>${M(res.rec.cost)}</b>. Each car sold at this price loses ${M(res.rec.cost - res.exVat)}.`,
          { title: 'Price below cost', okLabel: 'Save anyway' }))) return false;
        applyModel(fresh, res);
        NA.ui.toast(isNew ? modelTitle(res.rec) + ' added' : 'Saved');
        NA.refresh();
      } }],
    });
  }

  /* ---------------------------------------------------------------- Locations (Managing Director) */
  // Words the app itself uses for cars that have left or are on their way — never a real place.
  const NOT_PLACES = ['customer', 'in transit'];
  const USE_WORDS = { vehicles: ['car', 'cars'], staff: ['person', 'people'], assets: ['asset', 'assets'], parts: ['part', 'parts'], moving: ['car on its way', 'cars on their way'] };
  /** What is at a location now (people who left, sold cars and disposed assets do not count). */
  function locationUse(name) {
    const out = {};
    const bump = (k) => { out[k] = (out[k] || 0) + 1; };
    const current = (c, r) => !((c === 'staff' && r.active === false) || (c === 'vehicles' && r.status === 'delivered')
      || (c === 'assets' && (r.disposed || r.disposedAt || r.status === 'disposed')));
    NA.COLLECTIONS.forEach((c) => (NA.db[c] || []).forEach((r) => { if (r && r.location === name && current(c, r)) bump(c); }));
    (NA.db.vehicles || []).forEach((v) => {
      if (v && v.move && v.move.status === 'moving' && v.location !== name && (v.move.to === name || v.move.from === name)) bump('moving');
    });
    return out;
  }
  const useTotal = (u) => Object.keys(u).reduce((s, k) => s + u[k], 0);
  const useText = (u) => Object.keys(u).map((k) => { const w = USE_WORDS[k] || ['record', 'records']; return u[k] + ' ' + (u[k] === 1 ? w[0] : w[1]); }).join(', ');

  /** Returns an error message for a new location name, or ''. `except` = the name being renamed. */
  function checkLocationName(name, except) {
    if (!name) return 'Type the name of the location first';
    if (name.length > 60) return 'Keep the name under 60 letters';
    if (NOT_PLACES.includes(name.toLowerCase())) return '“' + name + '” is what the app calls cars that have left or are on the way — choose another name';
    if (locsRead().some((l) => l !== except && String(l).toLowerCase() === name.toLowerCase())) return 'There is already a location called ' + name;
    return '';
  }

  /**
   * Rename a location everywhere: the list, every record kept there (cars, people, assets, parts…),
   * cars on their way to or from it, and where purchase-order cars were received.
   * Returns how many records changed (or would change, with dry), or -1 when the name is not on the list.
   */
  function renameLocation(oldName, newName, dry) {
    const list = locsRead();
    const i = list.indexOf(oldName);
    if (i < 0) return -1;
    let n = 0;
    NA.COLLECTIONS.forEach((c) => (NA.db[c] || []).slice().forEach((r) => {
      if (!r || typeof r !== 'object' || r.id == null) return;
      const patch = {};
      if (r.location === oldName) patch.location = newName;
      if (c === 'vehicles' && r.move && (r.move.from === oldName || r.move.to === oldName)) {
        patch.move = Object.assign({}, r.move, { from: r.move.from === oldName ? newName : r.move.from, to: r.move.to === oldName ? newName : r.move.to });
      }
      if (c === 'purchaseOrders' && Array.isArray(r.units) && r.units.some((u) => u && u.location === oldName)) {
        patch.units = r.units.map((u) => (u && u.location === oldName ? Object.assign({}, u, { location: newName }) : u));
      }
      if (!Object.keys(patch).length) return;
      n++;
      if (!dry) NA.update(c, r.id, patch);
    }));
    if (!dry) { list.splice(i, 1, newName); NA.save(); }
    return n;
  }

  function locationsTab() {
    const locs = locsRead();
    const rows = locs.map((l) => {
      const u = locationUse(l), n = useTotal(u);
      const why = n ? 'Still in use — rename it, or move what is there first' : locs.length < 2 ? 'At least one location is needed' : 'Remove ' + l;
      return `<div class="gl-row has-icon st-row"><span class="gl-icon bg-gray">${NA.icon(locIcon(l), 17)}</span>
        <div class="gl-main"><b>${esc(l)}</b><small>${n ? 'In use · ' + esc(useText(u)) : 'Nothing here yet'}</small></div>
        ${NA.ui.btn('Rename', { kind: 'plain', size: 'sm', act: 'rename-loc', attrs: `data-name="${esc(l)}"` })}
        <button type="button" class="icon-btn" data-act="del-loc" data-name="${esc(l)}" ${n || locs.length < 2 ? 'disabled' : ''} title="${esc(why)}" aria-label="${esc(why)}">${NA.icon('trash', 16)}</button></div>`;
    }).join('');
    return `<section class="st-group">
        <div class="glist-title">Showrooms, warehouses and workshops</div>
        <div class="glist">${rows || '<div class="gl-row"><div class="gl-main muted">No locations yet.</div></div>'}
          <div class="gl-row st-row"><div class="field grow"><input type="text" data-new-loc maxlength="60" placeholder="New location, e.g. Chattogram Showroom" aria-label="New location"/></div>
            ${NA.ui.btn('Add', { kind: 'primary', icon: 'plus', act: 'add-loc' })}</div>
        </div>
        <p class="glist-foot">Every car, person, asset and part belongs to one of these. Renaming a location changes it on every record; a location can only be removed when nothing is there.</p>
      </section>`;
  }

  function addLocation(root) {
    if (!NA.can('settings.company')) return;
    const inp = root.querySelector('[data-new-loc]');
    if (!inp) return;
    const name = String(inp.value || '').trim().replace(/\s+/g, ' ');
    const err = checkLocationName(name, null);
    if (err) { inp.focus(); NA.ui.toast(err, 'error'); return; }
    locsWrite().push(name);
    NA.save();
    NA.log('Location added — ' + name, { link: '#/settings?tab=locations' });
    NA.ui.toast(name + ' added');
    NA.refresh();
  }

  function removeLocation(name) {
    if (!NA.can('settings.company') || !name) return;
    NA.ui.confirm(`Remove <b>${esc(name)}</b> from the list of locations?`, { title: 'Remove location', okLabel: 'Remove', danger: true }).then((ok) => {
      if (!ok) return;
      // Look it up again by name: the list may have changed while the question was open.
      const list = locsWrite();
      const i = list.indexOf(name);
      if (i < 0) { NA.ui.toast(name + ' was already removed', 'info'); NA.refresh(); return; }
      const u = locationUse(name);
      if (useTotal(u)) { NA.ui.toast(`${name} is in use (${useText(u)}) — rename it, or move them first`, 'error'); NA.refresh(); return; }
      if (list.length < 2) { NA.ui.toast('At least one location is needed', 'error'); return; }
      list.splice(i, 1);
      NA.save();
      NA.log('Location removed — ' + name, { kind: 'warn', link: '#/settings?tab=locations' });
      NA.ui.toast(name + ' removed');
      NA.refresh();
    });
  }

  function renameSheet(oldName) {
    if (!NA.can('settings.company') || !locsRead().includes(oldName)) return;
    const n = renameLocation(oldName, oldName, true);
    NA.ui.formModal({
      title: 'Rename ' + oldName, size: 'sm', submitLabel: 'Rename',
      intro: `<p class="muted st-intro">${n ? `${n} record${n === 1 ? '' : 's'} kept at ${esc(oldName)} will show the new name too.` : 'Nothing is kept here yet.'}</p>`,
      fields: [{ name: 'name', label: 'New name', required: true, placeholder: 'e.g. Uttara Showroom' }],
      values: { name: oldName },
      onSubmit: (v) => {
        const name = String(v.name || '').trim().replace(/\s+/g, ' ');
        if (name === oldName) return;
        const err = checkLocationName(name, oldName);
        if (err) { NA.ui.toast(err, 'error'); return false; }
        const changed = renameLocation(oldName, name, false);
        if (changed < 0) { NA.ui.toast(oldName + ' is no longer on the list', 'error'); NA.refresh(); return; }
        NA.log(`Location renamed — ${oldName} → ${name}${changed ? ` (${changed} record${changed === 1 ? '' : 's'} updated)` : ''}`, { kind: 'warn', link: '#/settings?tab=locations' });
        NA.ui.toast('Renamed to ' + name);
        NA.refresh();
      },
    });
  }

  /* ---------------------------------------------------------------- Data (Managing Director) */
  const COUNT_LABELS = { models: 'Models', staff: 'Staff', vendors: 'Suppliers', customers: 'Customers', leads: 'Leads', orders: 'Sales orders', payments: 'Payments',
    vehicles: 'Cars', purchaseOrders: 'Purchase orders', vendorPayments: 'Supplier payments', warranties: 'Warranties', serviceBookings: 'Service bookings',
    jobCards: 'Job cards', invoices: 'Invoices', parts: 'Spare parts', followUps: 'Follow-ups', expenses: 'Expenses', attendance: 'Attendance marks', assets: 'Assets',
    compliance: 'Licences', activity: 'Activity entries', approvals: 'Approval requests', leaves: 'Leave requests', targets: 'Sales targets', partOrders: 'Parts orders',
    vatReturns: 'VAT returns', quotations: 'Quotations', testDrives: 'Test drives', transfers: 'Transfers' };
  /** Replacing all the data (restore, demo, start fresh): the Managing Director, and the office server must agree. */
  const canReplaceData = () => NA.can('settings.company') && !NA.preview && (!shared() || !!(NA.sync.me && NA.sync.me.admin));
  /** "Replace all the data" stays open across redraws (other people's changes redraw the page on the office server). */
  let advOpen = false;
  /** Real business records (not the demo month): then "Load demo data" is not offered any more. */
  const hasRealData = () => !(NA.db.meta && NA.db.meta.seeded) && ['customers', 'leads', 'orders', 'vehicles', 'invoices', 'jobCards'].some((c) => (NA.db[c] || []).length > 0);

  function dataTab() {
    const s = NA.db.settings;
    const sh = shared();
    const last = s.lastBackupAt;
    const days = last ? NA.daysBetween(String(last).slice(0, 10), NA.today()) : null;
    const stale = days == null || days > 7;
    const can = canReplaceData();
    const lock = can ? '' : `disabled title="${esc(sh ? 'Only the Managing Director, signed in as an administrator, can do this' : 'Only the Managing Director can do this')}"`;
    const lastText = last
      ? `Last backup ${esc(NA.fmt.datetime(last))}${s.lastBackupBy ? ' by ' + esc(s.lastBackupBy) : ''} — ${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'}.`
      : 'No backup has been made yet.';
    const used = sh ? 0 : storageChars();
    const ratio = used / QUOTA;
    const real = hasRealData();
    return `<div class="callout ${!sh && stale ? 'callout-warn' : 'callout-info'} st-group">${NA.icon(!sh && stale ? 'alert' : 'info')}<div>
        ${sh && NA.sync.hosted ? '<b>The data is kept in the online database and shared by everyone who signs in.</b> A copy is saved there each day the system is used (the last 30), and one just before anyone restores or starts over. Download a backup now and then and keep it somewhere else.'
          : sh ? '<b>The data is kept on the office server and shared by everyone who signs in.</b> The server also saves a copy every day (the last 30 days), and one just before anyone restores or starts over. Download a backup now and then and keep it away from the server computer.'
          : '<b>The data is kept in this browser, on this computer.</b> Nothing is sent to the internet. If the browser’s data is cleared or the computer is lost, the records are gone — unless you have a backup file.'}
        <br>${lastText}</div></div>
      <section class="st-group">
        <div class="glist-title">Backup</div>
        <div class="glist">
          <div class="gl-row st-row"><div class="gl-main"><b>Download a backup</b><small>One file with every record and setting, including salaries and ID numbers — keep it private, on a USB drive or Google Drive. Once a week is a good habit.</small></div>
            ${NA.ui.btn('Download backup', { kind: 'primary', icon: 'download', act: 'export' })}</div>
          ${sh && NA.sync.hosted ? `<div class="gl-row st-row"><div class="gl-main"><b>Copies saved online</b><small>The daily copies, and the ones saved before data was replaced. Download one, then use Restore from a backup file below.</small></div>
            ${NA.ui.btn('See copies', { act: 'server-backups', attrs: lock })}</div>` : ''}
        </div>
      </section>
      ${sh ? '' : `<section class="st-group">
        <div class="glist-title">Space in this browser</div>
        <div class="glist"><div class="gl-row"><div class="gl-main"><b>${kb(used)} used of about ${NA.fmt.num(QUOTA / 1024)} KB</b>
          <small>${ratio > 0.8 ? 'Nearly full. Download a backup, and move to the office server, which has no such limit.' : 'Plenty of room — roughly ' + NA.fmt.num(Math.max(0, Math.floor((QUOTA - used) / 1500))) + ' more orders’ worth.'}</small>
          <div class="mt-8">${NA.ui.progress(Math.min(1, ratio), ratio > 0.8 ? 'red' : ratio > 0.5 ? 'amber' : 'green')}</div></div></div></div>
      </section>`}
      <section class="st-group">
        <div class="glist-title">What is in the system</div>
        <div class="glist"><div class="st-counts">${NA.COLLECTIONS.map((c) => `<div><span>${esc(COUNT_LABELS[c] || humanise(c))}</span><b>${NA.fmt.num((NA.db[c] || []).length)}</b></div>`).join('')}</div></div>
      </section>
      <details class="st-advanced st-group" data-adv${advOpen ? ' open' : ''}>
        <summary>${NA.icon('chevron-right', 16)}Replace all the data</summary>
        <div class="glist">
          <div class="gl-row st-row"><div class="gl-main"><b>Restore from a backup file</b><small>${sh ? 'Replaces the shared data for everyone' : 'Replaces everything on this computer'} with what is in the file. Document numbers carry on from today’s, so no invoice or receipt number is ever used twice.</small></div>
            ${NA.ui.btn('Choose file…', { icon: 'upload', act: 'import', attrs: lock })}<input type="file" accept=".json,application/json" data-import class="hidden"/></div>
          ${real ? `<div class="gl-row"><div class="gl-main"><b>Demo data</b><small>Not offered, because this system holds real business records.</small></div></div>`
            : `<div class="gl-row st-row"><div class="gl-main"><b>Load demo data</b><small>A sample month of Noor Autos records, for training. Replaces everything${sh ? ' for everyone' : ''}.</small></div>
            ${NA.ui.btn('Load demo data', { kind: 'danger', act: 'reset-demo', attrs: lock })}</div>`}
          <div class="gl-row st-row"><div class="gl-main"><b>Start fresh</b><small>Removes every record — customers, orders, stock, service, staff — and keeps the company details, rules and locations. Use it once, when you begin entering your real business.</small></div>
            ${NA.ui.btn('Start fresh', { kind: 'danger', act: 'reset-empty', attrs: lock })}</div>
        </div>
        <p class="glist-foot">Each of these asks you to type ERASE first. Download a backup before you start.</p>
      </details>`;
  }

  /** The copies the online database keeps (the office server keeps its copies as files instead). */
  function showServerBackups() {
    NA.sync.api('api/backups').then((res) => {
      const rows = (res.backups || []).map((b) => `<div class="gl-row st-row"><div class="gl-main"><b>${esc(NA.fmt.datetime(b.at))}</b><small>${b.daily ? 'Daily copy' : 'Saved before data was replaced'} · ${kb(b.size)}</small></div>
        <a class="btn btn-sm" href="api/backups/download?name=${encodeURIComponent(b.name)}" download>Download</a></div>`).join('');
      NA.ui.modal({ title: 'Copies saved online', body: `<div class="glist">${rows || '<div class="gl-row"><div class="gl-main"><small>No copies yet. The first is saved the next time someone opens the system with records in it.</small></div></div>'}</div>`, actions: [{ label: 'Close' }] });
    }).catch((e) => NA.ui.toast(e.message, 'error'));
  }

  /** Ask the person to type ERASE before data is replaced. Resolves true when they did. */
  function eraseConfirm({ title, html, okLabel }) {
    return new Promise((resolve) => {
      let ok = false;
      NA.ui.modal({
        title, size: 'sm', onClose: () => resolve(ok),
        body: `${html}<form class="modal-form mt-16" onsubmit="return false"><div class="field"><label>Type ERASE to confirm</label>
          <input type="text" data-erase autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ERASE"/></div></form>`,
        actions: [{ label: 'Cancel' }, { label: okLabel, kind: 'danger', onClick: (el) => {
          const v = String(el.querySelector('[data-erase]').value || '').trim().toUpperCase();
          if (v !== 'ERASE') { NA.ui.toast('Type ERASE to confirm', 'error'); return false; }
          ok = true;
        } }],
      });
    });
  }

  /** Document numbers never go backwards: the larger of the two counters wins. */
  function maxCounters(a, b) {
    const out = {};
    [a, b].forEach((src) => {
      if (!src || typeof src !== 'object' || Array.isArray(src)) return;
      Object.keys(src).forEach((k) => { const x = Number(src[k]); if (isFinite(x) && x > (out[k] || 0)) out[k] = Math.floor(x); });
    });
    return out;
  }

  function exportBackup() {
    if (!NA.can('settings.company') || NA.preview) { NA.ui.toast('Only the Managing Director can download all the data', 'error'); return; }
    try {
      const now = new Date().toISOString();
      NA.db.settings.lastBackupAt = now;
      NA.db.settings.lastBackupBy = meName();
      const data = Object.assign({}, NA.db, { meta: Object.assign({}, NA.db.meta, { exportedAt: now, app: 'Noor Autos DMS', by: meName() }) });
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'noor-autos-backup-' + NA.today() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      NA.saveNow();
      NA.log('Full data backup downloaded', { kind: 'success', link: '#/settings?tab=data' });
      NA.ui.toast('Backup downloaded — keep it somewhere safe');
      NA.refresh();
    } catch (e) {
      console.error(e);
      NA.ui.toast('Could not create the backup: ' + e.message, 'error');
    }
  }

  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'This file is not a Noor Autos backup.';
    if (!obj.settings || typeof obj.settings !== 'object') return 'The file has no settings section — it is not a Noor Autos backup.';
    const present = NA.COLLECTIONS.filter((c) => Array.isArray(obj[c]));
    if (present.length < NA.COLLECTIONS.length / 2 || !Array.isArray(obj.customers) || !Array.isArray(obj.orders)) return 'The file is missing customers / orders data — it may be damaged or from another program.';
    const bad = NA.COLLECTIONS.find((c) => obj[c] != null && !Array.isArray(obj[c]));
    if (bad) return 'The "' + bad + '" section in the file is damaged.';
    return '';
  }

  /**
   * Make a checked backup ready to become the data set. Restoring never changes who is using this
   * computer (the file's own "current user" is ignored) and document numbers never go backwards.
   */
  function prepareRestore(obj, current) {
    NA.COLLECTIONS.forEach((c) => { if (!Array.isArray(obj[c])) obj[c] = []; });
    const me = current && current.settings && current.settings.currentUser;
    obj.settings = Object.assign(NA.defaultSettings(), obj.settings);
    if (me) obj.settings.currentUser = me; else delete obj.settings.currentUser;
    if (!obj.settings.currentUser) obj.settings.currentUser = NA.defaultSettings().currentUser;
    obj.counters = maxCounters(current && current.counters, obj.counters);
    if (obj.payroll != null && (typeof obj.payroll !== 'object' || Array.isArray(obj.payroll))) delete obj.payroll; // admin.js payroll runs
    if (!Array.isArray(obj.settings.locations) || !obj.settings.locations.length) obj.settings.locations = NA.defaultSettings().locations;
    obj.meta = Object.assign({ version: 1 }, obj.meta, { restoredAt: new Date().toISOString(), restoredBy: meName() });
    return obj;
  }

  const reloadTo = (hash, ms) => setTimeout(() => { location.hash = hash; location.reload(); }, ms);

  function importBackup(file) {
    if (!file) return;
    if (!canReplaceData()) { NA.ui.toast('Only the Managing Director can restore data', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { NA.ui.toast('That file is too large to be a backup', 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => NA.ui.toast('Could not read the file', 'error');
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { NA.ui.toast('The file is not valid JSON — choose a .json backup made by this system', 'error'); return; }
      const err = validateBackup(obj);
      if (err) { NA.ui.toast(err, 'error'); return; }
      const when = obj.meta && obj.meta.exportedAt ? NA.fmt.datetime(obj.meta.exportedAt) : 'an unknown date';
      const summary = ['customers', 'orders', 'vehicles', 'invoices', 'staff'].map((c) => `${NA.fmt.num((obj[c] || []).length)} ${COUNT_LABELS[c].toLowerCase()}`).join(', ');
      eraseConfirm({
        title: 'Restore this backup?', okLabel: 'Replace and restore',
        html: `<p><b>${esc(file.name)}</b><br><span class="muted">Made ${esc(when)}${obj.meta && obj.meta.by ? ' by ' + esc(obj.meta.by) : ''}${obj.settings.company ? ' · ' + esc(obj.settings.company) : ''}</span></p>
          <p class="mt-12">It holds ${esc(summary)}.</p>
          <p class="mt-12"><b class="tone-red">${shared() ? 'The shared data is replaced for everyone who is signed in.' : 'Everything on this computer is replaced.'}</b> Download a backup of today’s data first if you may need it.</p>`,
      }).then((ok) => {
        if (!ok || !canReplaceData()) return;
        NA.db = prepareRestore(obj, NA.db);
        NA.log('Data restored from backup ' + file.name, { kind: 'warn', link: '#/settings?tab=data' });
        NA.saveNow();
        NA.ui.toast('Backup restored — reloading…');
        reloadTo('#/dashboard', 700);
      });
    };
    reader.readAsText(file);
  }

  function loadDemo() {
    if (!canReplaceData() || !NA.seed) return;
    const me = NA.db.settings.currentUser, before = NA.db.counters;
    NA.reset(true);
    if (me) NA.db.settings.currentUser = me;
    NA.db.counters = maxCounters(before, NA.db.counters);
    NA.log('Demo data loaded — every earlier record was replaced', { kind: 'warn', link: '#/settings?tab=data' });
    NA.saveNow();
    NA.ui.toast('Demo data loaded — reloading…');
    reloadTo('#/dashboard', 600);
  }

  /** Empty every collection; keep the company details, rules and locations; numbers carry on. */
  function startFresh() {
    if (!canReplaceData()) return;
    const prev = NA.db;
    const now = new Date().toISOString();
    const db = {
      meta: { version: 1, createdAt: now, freshStartAt: now, freshStartBy: meName() },
      settings: Object.assign(NA.defaultSettings(), JSON.parse(JSON.stringify(prev.settings || {}))),
      counters: maxCounters(prev.counters, {}),
    };
    NA.COLLECTIONS.forEach((c) => { db[c] = []; });
    NA.db = db;
    NA.log('Started fresh — every record removed; company details, rules and locations kept', { kind: 'warn', link: '#/settings?tab=data' });
    NA.saveNow();
    NA.ui.toast('System emptied — start with your models, staff and suppliers');
    reloadTo('#/settings?tab=models', 700);
  }

  /* ---------------------------------------------------------------- Activity log (Managing Director) */
  const REC_WORDS = { leads: 'lead', customers: 'customer', orders: 'order', payments: 'payment', vehicles: 'car', purchaseOrders: 'purchase order',
    vendorPayments: 'supplier payment', warranties: 'warranty', serviceBookings: 'service booking', jobCards: 'job card', invoices: 'invoice', parts: 'part',
    followUps: 'follow-up', expenses: 'expense', attendance: 'attendance mark', assets: 'asset', compliance: 'licence', approvals: 'approval request',
    leaves: 'leave request', targets: 'sales target', partOrders: 'parts order', models: 'model', staff: 'staff record', vendors: 'supplier',
    quotations: 'quotation', testDrives: 'test drive', transfers: 'transfer', activity: 'activity entry', vatReturns: 'VAT return' };
  const DOC_WORDS = { settings: 'the settings', payroll: 'the payroll', meta: 'the system details' };
  const REC_LINKS = { leads: '#/leads/', customers: '#/customers/', orders: '#/sales/', purchaseOrders: '#/procurement/', vehicles: '#/inventory/', jobCards: '#/service/job/' };
  const OPS = { create: 'Added', edit: 'Changed', delete: 'Deleted' };
  const PAGE = 300;   // changes asked for (or drawn, on one computer) at a time
  /** entries: what is loaded, newest first; more: the server has older ones. */
  const audit = { entries: null, error: '', loading: false, at: 0, more: false };
  const logFilter = { q: '', who: '', op: '' };
  let feedShown = PAGE;   // one computer: how many activity entries are drawn
  let liveRoot = null;

  /** What a server log line is about, in words: { label, name, link }. find(c, id) looks the record up. */
  function recWhat(c, id, find) {
    if (c === '_doc') return { label: DOC_WORDS[id] || 'a document', name: '', link: id === 'settings' ? '#/settings' : '' };
    const r = find ? find(c, id) : NA.get(c, id);
    let name = '';
    if (r) name = r.code || r.receiptNo || r.no || r.vin || r.tag || r.sku || r.name || r.title || r.staffName || (r.staffId ? NA.staffName(r.staffId) : '') || '';
    return { label: REC_WORDS[c] || humanise(c || 'record').toLowerCase(), name: String(name), link: r && REC_LINKS[c] ? REC_LINKS[c] + encodeURIComponent(id) : '' };
  }
  const fieldWords = (s) => String(s || '').split(',').map((f) => f.trim()).filter((f) => f && !['updatedAt', 'history'].includes(f))
    .map((f) => f.replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).slice(0, 8).join(', ');

  /** Server entries carry ts (epoch seconds) and row; the server lists them by time, then row, newest first. */
  const hasKey = (e) => !!e && Number.isFinite(e.ts) && Number.isFinite(e.row);
  const newerThan = (a, b) => a.ts > b.ts || (a.ts === b.ts && a.row > b.row);
  /** The newest changes. Older pages already shown are kept: the new ones go on top (the log is never edited). */
  function loadAudit(force) {
    if (!shared() || audit.loading) return;
    if (!force && audit.entries && Date.now() - audit.at < 30000) return;
    audit.loading = true;
    NA.sync.api('api/audit?limit=' + PAGE)
      .then((r) => {
        const page = r && Array.isArray(r.entries) ? r.entries : [];
        const held = audit.entries || [];
        const top = held.length && hasKey(held[0]) && page.every(hasKey) ? held[0] : null;
        const newer = top ? page.filter((e) => newerThan(e, top)) : page;
        if (top && newer.length < page.length) audit.entries = newer.concat(held);
        else { audit.entries = page; audit.more = !!(r && r.more) && page.every(hasKey); }   // first page, or a gap
        audit.error = '';
      })
      .catch((e) => { audit.error = (e && e.message) || 'The office server did not answer'; })
      .then(() => { audit.loading = false; audit.at = Date.now(); drawLog(); });
  }
  /** The next older page: what comes after the oldest change shown (by time and row, so one save is never split). */
  function loadOlder() {
    const held = audit.entries || [];
    const last = held.length ? held[held.length - 1] : null;
    if (!shared() || audit.loading || !audit.more || !hasKey(last)) { drawLog(); return; }
    audit.loading = true;
    NA.sync.api('api/audit?limit=' + PAGE + '&before=' + encodeURIComponent(String(last.ts)) + '&beforeRow=' + encodeURIComponent(String(last.row)))
      .then((r) => {
        const page = (r && Array.isArray(r.entries) ? r.entries : []).filter(hasKey);
        audit.entries = held.concat(page);
        audit.more = !!(r && r.more) && page.length > 0;
        audit.error = '';
      })
      .catch((e) => { audit.error = (e && e.message) || 'The office server did not answer'; })
      .then(() => { audit.loading = false; drawLog(); });
  }

  /** Server log lines in words, each worked out once (records found through an id index per collection). */
  function auditItems() {
    const index = {};
    const find = (c, id) => {
      if (!index[c]) index[c] = new Map((Array.isArray(NA.db[c]) ? NA.db[c] : []).map((r) => [String(r && r.id), r]));
      return index[c].get(String(id)) || null;
    };
    return (audit.entries || []).map((e) => {
      const w = recWhat(e.c, e.id, find);
      return { e, link: w.link, text: `${OPS[e.op] || 'Changed'} ${w.label}${w.name ? ' ' + w.name : ''}`, fields: e.op === 'edit' ? fieldWords(e.fields) : '' };
    });
  }
  function logPeople() {
    const names = shared() ? (audit.entries || []).map((e) => e.name) : (NA.db.activity || []).map((a) => a.by);
    return [...new Set(names.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }
  const whoOptions = () => `<option value="">Everyone</option>${logPeople().map((n) => `<option value="${esc(n)}" ${n === logFilter.who ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
  const hasText = (parts) => !logFilter.q || parts.join(' ').toLowerCase().includes(logFilter.q.trim().toLowerCase());

  function logListHtml() {
    // Only links inside the app (an entry restored from a file could carry anything).
    const row = (when, title, link, sub) => `<div class="gl-row st-log"><span class="st-when">${esc(NA.fmt.datetime(when))}</span>
      <div class="gl-main"><b>${link && /^#\//.test(String(link)) ? `<a class="btn-link" href="${esc(link)}">${esc(title)}</a>` : esc(title)}</b><small>${esc(sub)}</small></div></div>`;
    if (shared()) {
      if (!audit.entries) return audit.error ? `<div class="callout callout-warn">${NA.icon('alert')}<div>The activity log could not be loaded: ${esc(audit.error)}</div></div>`
        : `<div class="card pad muted">Loading the activity log…</div>`;
      const list = auditItems().filter((x) => (!logFilter.op || x.e.op === logFilter.op) && (!logFilter.who || x.e.name === logFilter.who)
        && hasText([x.e.name, x.text, x.fields]));
      const older = audit.more ? ' ' + NA.ui.btn('Show older changes', { kind: 'link', act: 'log-more', attrs: audit.loading ? 'disabled' : '' }) : '';
      const total = audit.entries.length, n = NA.fmt.num(total);
      const counted = list.length < total ? `${NA.fmt.num(list.length)} of the ${audit.more ? 'latest ' : ''}${n} changes match.` : audit.more ? `The latest ${n} changes.` : `All ${n} changes.`;
      const foot = `<p class="glist-foot">${counted} The office server records every change with the person who was signed in; nobody can edit or delete this log.${audit.error ? ' Could not load: ' + esc(audit.error) + '.' : ''}${older}</p>`;
      if (!list.length) return `<div class="card">${NA.ui.empty(total ? 'Nothing matches.' : 'No changes recorded yet.', 'clock')}</div>${total ? foot : ''}`;
      // Every loaded change is drawn; older ones come a page at a time.
      return `<div class="glist">${list.map((x) => row(x.e.at, x.text, x.link, (x.e.name || '—') + (x.fields ? ' · ' + x.fields : ''))).join('')}</div>${foot}`;
    }
    const all = NA.db.activity || [];
    const feed = all.filter((a) => (!logFilter.who || a.by === logFilter.who) && hasText([a.by, a.text]));
    if (!feed.length) return `<div class="card">${NA.ui.empty(all.length ? 'Nothing matches.' : 'Nothing has been recorded yet.', 'clock')}</div>`;
    const cut = feed.length > feedShown;
    return `<div class="glist">${feed.slice(0, feedShown).map((a) => row(a.at, a.text, a.link, a.by || '—')).join('')}</div>
      <p class="glist-foot">${cut ? 'The latest ' + NA.fmt.num(feedShown) + ' of ' + NA.fmt.num(feed.length) + '. ' : ''}This computer keeps the latest 1,000 entries. With the office server, every change is kept for good, with the person who made it.${cut ? ' ' + NA.ui.btn('Show older changes', { kind: 'link', act: 'log-more' }) : ''}</p>`;
  }

  function drawLog() {
    if (!liveRoot) return;
    const box = liveRoot.querySelector('[data-log-list]');
    if (box) box.innerHTML = logListHtml();
    const sel = liveRoot.querySelector('[data-log-who]');
    if (sel && sel.options && sel.options.length !== logPeople().length + 1) sel.innerHTML = whoOptions();
    const again = liveRoot.querySelector('[data-act="log-refresh"]');
    if (again && !audit.loading) again.disabled = false;
  }

  function activityTab() {
    loadAudit(false);
    return `<div class="toolbar st-tools">
        <input type="search" class="st-search" data-log-q value="${esc(logFilter.q)}" placeholder="Search who, what or which record" aria-label="Search the activity log"/>
        <select data-log-who aria-label="Who">${whoOptions()}</select>
        ${shared() ? `<div class="chips">${[['', 'All'], ['create', 'Added'], ['edit', 'Changed'], ['delete', 'Deleted']].map(([k, l]) =>
          `<button type="button" class="chip ${logFilter.op === k ? 'active' : ''}" data-act="log-op" data-k="${k}">${l}</button>`).join('')}</div>
        <span class="spacer"></span>${NA.ui.btn('Refresh', { icon: 'refresh', size: 'sm', act: 'log-refresh' })}` : ''}
      </div>
      <div data-log-list>${logListHtml()}</div>`;
  }

  /* ---------------------------------------------------------------- Page */
  /** The tabs this person may open. The Managing Director's General tab holds the "You" settings too. */
  function visibleTabs() {
    const list = TABS.filter((t) => (!t.perm || NA.can(t.perm)) && (!t.shared || shared()));
    return list.some((t) => t.key === 'general') ? list.filter((t) => t.key !== 'you') : list;
  }
  const youTab = () => youGroup() + roleGroup();

  function askLoadDemo() {
    if (!canReplaceData() || !NA.seed) return;
    if (hasRealData()) { NA.ui.toast('Demo data is not offered once real business records are in the system', 'error'); return; }
    eraseConfirm({
      title: 'Load demo data?', okLabel: 'Replace with demo data',
      html: `<p>Every record ${shared() ? '<b>for everyone who signs in</b>' : 'on this computer'} is replaced by a sample month of Noor Autos records, for training.</p>
        <p class="mt-12">Document numbers carry on from today’s. Download a backup first if you may need what is there now.</p>`,
    }).then((ok) => { if (ok) loadDemo(); });
  }

  function askStartFresh() {
    if (!canReplaceData()) return;
    eraseConfirm({
      title: 'Start fresh?', okLabel: 'Remove every record',
      html: `<p>Every customer, lead, order, payment, car, model, purchase order, job card, part, staff record and expense is removed${shared() ? ' <b>for everyone who signs in</b>' : ''}.</p>
        <p class="mt-12">The company details, approval rules and locations stay, and document numbers carry on. Download a backup first if you may need any of it.</p>`,
    }).then((ok) => { if (ok) startFresh(); });
  }

  NA.page({
    path: 'settings', title: 'Settings', icon: 'cog',
    render(root, params, query) {
      injectCss();
      cleanCostTrail();
      const q = Object.assign({}, query || {});
      const shown = visibleTabs();
      const tab = shown.some((t) => t.key === q.tab) ? q.tab : shown[0].key;
      const BODY = {
        you: youTab, general: generalTab, rules: rulesTab, models: () => modelsTab(q), locations: locationsTab,
        access: () => NA.sync.accessTab(), activity: activityTab, data: dataTab,
      };
      const tabs = shown.map((t) => (t.key === 'models' ? Object.assign({}, t, { count: NA.db.models.filter((m) => m.active !== false).length }) : t));
      root.innerHTML = `<div class="st-page${tab === 'access' || tab === 'activity' ? ' st-wide' : ''}">
        ${NA.ui.pageHead({ title: 'Settings', subtitle: esc(SUBTITLES[tab] || '') })}
        ${shown.length > 1 ? NA.ui.tabs(tabs, tab) : ''}
        ${(BODY[tab] || youTab)()}
      </div>`;
      liveRoot = tab === 'activity' ? root : null;
      if (tab === 'access') NA.sync.wireAccessTab(root);
      onePrimary(root.querySelector('.st-page'));
      const adv = root.querySelector('[data-adv]');
      if (adv) adv.addEventListener('toggle', () => { advOpen = adv.open; });   // 'toggle' does not bubble

      const ACTS = {
        look: (el) => {
          if (NA.theme && NA.theme.set) NA.theme.set(el.dataset.look);
          root.querySelectorAll('[data-act="look"]').forEach((b) => { b.classList.toggle('active', b === el); b.setAttribute('aria-pressed', String(b === el)); });
        },
        person: () => { if (NA.personMenu) NA.personMenu(); },
        'end-preview': () => { if (NA.endPreview) NA.endPreview(); },
        save: (el) => saveGroup(el.dataset.g, root.querySelector(`[data-group="${el.dataset.g}"]`)),
        discard: (el) => { delete drafts[el.dataset.g]; NA.refresh(); },
        show: (el) => NA.go('#/settings?tab=models' + (el.dataset.k === 'active' ? '' : '&show=' + encodeURIComponent(el.dataset.k))),
        'add-model': () => modelSheet(null),
        'edit-model': (el) => { const m = NA.get('models', el.dataset.id); if (m) modelSheet(m); else NA.refresh(); },
        'add-loc': () => addLocation(root),
        'rename-loc': (el) => renameSheet(el.dataset.name),
        'del-loc': (el) => removeLocation(el.dataset.name),
        'add-holiday': () => addHoliday(root),
        'del-holiday': (el) => removeHoliday(el.dataset.date),
        export: () => exportBackup(),
        'server-backups': () => showServerBackups(),
        // Bound on the input itself: if the page is redrawn while the file dialog is open, the choice still arrives.
        import: () => { if (!canReplaceData()) return; const f = root.querySelector('[data-import]'); if (f) { f.value = ''; f.onchange = () => importBackup(f.files && f.files[0]); f.click(); } },
        'reset-demo': () => askLoadDemo(),
        'reset-empty': () => askStartFresh(),
        'log-op': (el) => { logFilter.op = el.dataset.k || ''; NA.refresh(); },
        'log-refresh': (el) => { el.disabled = true; loadAudit(true); },
        'log-more': (el) => { el.disabled = true; if (shared()) loadOlder(); else { feedShown += PAGE; drawLog(); } },
      };
      const unbind = [
        NA.ui.delegate(root, 'click', '[data-tab]', (el) => NA.go('#/settings?tab=' + encodeURIComponent(el.dataset.tab))),
        NA.ui.delegate(root, 'click', '[data-act]', (el, e) => {
          const fn = ACTS[el.dataset.act];
          if (!fn || el.disabled) return;
          e.preventDefault();
          fn(el);
        }),
        // Typing in a group shows its Save bar. Nothing is redrawn, so the cursor stays where it is.
        NA.ui.delegate(root, 'input', '[data-group] [name]', (el) => trackGroup(el)),
        NA.ui.delegate(root, 'change', '[data-group] [name]', (el) => trackGroup(el)),
        NA.ui.delegate(root, 'keydown', '[data-group] input', (el, e) => {
          if (e.key !== 'Enter' || el.type === 'checkbox' || el.getAttribute('list')) return;   // Enter also picks a suggestion
          e.preventDefault();
          trackGroup(el);
          const sec = el.closest('[data-group]');
          if (sec && isDirty(sec.dataset.group)) saveGroup(sec.dataset.group, sec);
        }),
        NA.ui.delegate(root, 'keydown', '[data-new-loc]', (el, e) => { if (e.key === 'Enter') { e.preventDefault(); addLocation(root); } }),
        NA.ui.delegate(root, 'keydown', '[data-new-holiday-date], [data-new-holiday-name]', (el, e) => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(root); } }),
        NA.ui.delegate(root, 'input', '[data-log-q]', (el) => { logFilter.q = el.value; drawLog(); }),
        NA.ui.delegate(root, 'change', '[data-log-who]', (el) => { logFilter.who = el.value; drawLog(); }),
      ];
      return () => { unbind.forEach((u) => u()); if (liveRoot === root) liveRoot = null; };
    },
  });
})();
