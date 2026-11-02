/* ==========================================================================
   Today (#/dashboard) — the first screen everyone sees.
   It answers "What do I need to do now?" for the person's role, in plain
   words, with one tap to act:
     • everyone: what is waiting for their OK, and their own requests
     • Sales Consultant: calls, new leads, test drives, quotes, orders, my month
     • Sales Manager: team numbers, what needs a manager, pipeline, leaderboard
     • Managing Director: the business at a glance, attention list, live strip
     • Accounts, Procurement, Service, Admin & HR: the day's work for them
   Everything is computed once per render from what this person can see (in
   shared mode the office server only sends a person their own records).
   Order, stock and money figures follow the same rules as the screens they
   open (Orders, Vehicles, Accounts), so a number on Today is always the
   number in the list behind it.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const B = NA.biz;
  const A = NA.approvals;

  /* ---------- page styles (design tokens only, so dark mode just works) ---------- */
  function injectCss() {
    if (!document.head || document.getElementById('css-dashboard')) return;
    const s = document.createElement('style');
    s.id = 'css-dashboard';
    s.textContent = `
      .td-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin: 0 0 36px; }
      .td-stats .kpi-value small { font-size: 16px; font-weight: 500; color: var(--muted); letter-spacing: -.01em; margin-left: 5px; }
      .td-stats .kpi-sub { margin-top: 4px; font-size: 13px; }
      .td-lost { margin: -8px 0 28px; }
      .td-cols { display: grid; grid-template-columns: minmax(0, 1fr) 344px; gap: 32px; align-items: start; }
      .td-col { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
      .td-sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 6px 10px; min-height: 26px; }
      .td-sec-head h2 { font-size: 19px; font-weight: 600; letter-spacing: -.016em; }
      .td-n { margin-left: 8px; font-size: 15px; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
      .td-sec-head .btn-link { font-size: 13.5px; font-weight: 500; }
      .td-sec-head .small { font-size: 13px; }
      .glist .td-row { gap: 14px; min-height: 62px; padding: 12px 18px; }
      .glist .td-row + .td-row::before { left: 66px; }
      .glist .td-row.td-plain::before { left: 18px; }
      .td-ico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--fill-2); color: var(--ink-2); }
      .td-ico.red { background: var(--red-50); color: var(--red); }
      .td-ico.amber { background: var(--amber-50); color: var(--amber); }
      .td-ico.green { background: var(--green-50); color: var(--green); }
      .td-ico.blue { background: var(--blue-50); color: var(--blue); }
      .td-main { flex: 1; min-width: 0; }
      .td-main > b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -.012em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .td-wraps .td-main > b { white-space: normal; }
      .td-main > small { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
      .td-q { display: block; margin-top: 8px; padding: 8px 11px; border-radius: 10px; background: var(--fill-3); color: var(--ink-2); font-size: 13px; line-height: 1.4; }
      .td-right { display: flex; align-items: center; gap: 8px; flex: none; }
      .td-amt { font-size: 15px; font-weight: 600; letter-spacing: -.012em; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .td-amt.muted { color: var(--muted-2); }
      .td-amt small { font-size: 13px; font-weight: 500; color: var(--muted); margin-left: 3px; }
      .td-round { width: 34px; height: 34px; border-radius: 50%; border: 0; padding: 0; display: inline-grid; place-items: center; flex: none; background: var(--fill-2); color: var(--tint); transition: background .12s; }
      .td-round:hover { background: var(--fill); }
      .td-time { width: 50px; flex: none; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .glist .td-more { justify-content: center; min-height: 46px; color: var(--tint); font-weight: 500; }
      .glist .td-none { min-height: 54px; color: var(--muted); }
      .glist .td-feed { min-height: 0; padding: 12px 18px; gap: 14px; align-items: flex-start; }
      .glist .td-feed + .td-feed::before { left: 40px; }
      .td-feed .dot { margin-top: 7px; }
      .td-feed .td-main > span { display: block; font-size: 13.5px; line-height: 1.4; }
      .td-bar { margin-top: 8px; max-width: 280px; }
      .td-bar .progress { height: 5px; }
      .td-card { padding: 22px 24px 24px; }
      .td-label { display: block; font-size: 13px; font-weight: 500; color: var(--muted); }
      .td-big { display: block; font-family: var(--font-display); font-size: 44px; font-weight: 700; letter-spacing: -.035em; line-height: 1.08; margin-top: 4px; font-variant-numeric: tabular-nums; }
      .td-big small { font-size: 18px; font-weight: 500; color: var(--muted); letter-spacing: -.01em; margin-left: 6px; }
      a.td-hero { display: block; }
      a.td-hero:hover .td-big { color: var(--tint); }
      .td-card .progress { margin-top: 14px; height: 8px; border-radius: 8px; }
      .td-note { margin-top: 10px; font-size: 13px; color: var(--muted); }
      .td-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 10px; margin-top: 18px; }
      .td-mini > a, .td-mini > div { display: block; padding: 12px 14px; border-radius: 12px; background: var(--fill-3); transition: background .12s; }
      .td-mini > a:hover { background: var(--fill-2); }
      .td-mini b { display: block; font-size: 20px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .td-mini span { display: block; font-size: 13px; color: var(--muted); margin-top: 1px; line-height: 1.35; }
      .td-mini.flush { margin-top: 0; }
      .td-mini .warn b { color: var(--red); }
      .td-strip-label { font-size: 13px; font-weight: 500; color: var(--muted); padding: 16px 20px 0; }
      /* The steps wrap onto another row when the column is narrow: nothing hides behind a scrollbar. */
      .td-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); padding: 4px 4px 8px; }
      .td-strip + .td-strip-label { border-top: .5px solid var(--line-2); margin-top: 4px; }
      .td-step { min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px 14px 12px; border-radius: 12px; }
      a.td-step { transition: background .12s; }
      a.td-step:hover { background: var(--fill-3); }
      .td-step .n { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -.03em; line-height: 1.15; font-variant-numeric: tabular-nums; }
      .td-step .l { font-size: 13px; color: var(--muted); line-height: 1.3; }
      .td-step.zero .n { color: var(--muted-2); }
      .td-step.hot .n { color: var(--tint); }
      .td-chart { padding: 6px 24px 8px; }
      .td-chart .bar-gray { background: var(--muted-2); }
      .td-chart .bars { padding-bottom: 30px; }
      .td-caught { text-align: center; padding: 56px 20px; }
      .td-ok { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 16px; background: var(--green-50); color: var(--green); }
      .td-caught h3 { font-size: 20px; font-weight: 600; }
      .td-caught p { color: var(--muted); margin-top: 6px; }
      .td-foot-acts { display: flex; gap: 18px; flex-wrap: wrap; margin: 12px 16px 0; }
      .td-intro { color: var(--muted); margin-bottom: 16px; }
      @media (max-width: 1100px) { .td-cols { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 600px) {
        .td-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
        .td-cols, .td-col { gap: 28px; }
        .glist .td-row { padding: 12px 16px; }
        .glist .td-row + .td-row::before { left: 16px; }
        .glist .td-row.td-wraps { flex-wrap: wrap; }
        .td-main > b { white-space: normal; }
        .td-right.td-wrap { width: 100%; justify-content: flex-end; padding-left: 48px; }
        .td-card { padding: 18px; }
        .td-big { font-size: 38px; }
        .td-step { padding: 10px 12px 12px; }
      }`;
    document.head.appendChild(s);
  }

  /* ---------- small helpers ---------- */
  const OPEN_LEAD = ['new', 'qualified', 'engaged', 'visit', 'testdrive', 'opportunity'];
  /** Unsold cars we hold, as Reports values stock: arrived and not sold (available, waiting for the arrival check, on hold, demo). */
  const HELD = ['pdi', 'available', 'hold', 'demo'];
  /** A lead stage in the CRM's own words (core's list, the one Leads uses: In touch, Quote given…). */
  const leadWord = (k) => (k ? NA.stageLabel(NA.FLOW.leadStages.concat(NA.FLOW.leadClosed || []), k) : '');
  const ROLE_TITLE = { owner: 'Managing Director', sales_manager: 'Sales Manager', sales: 'Sales Consultant', accounts: 'Accounts', procurement: 'Procurement', service_manager: 'Service Manager', service: 'Service Advisor', hr: 'Admin & HR' };

  const num = (n) => Number(n) || 0;
  /** The local calendar day of a plain date or a timestamp. Timestamps are saved in UTC, so a lead made at
      2 am in Dhaka (UTC+6) belongs to today, not to yesterday. */
  function dayOf(iso) {
    const s = String(iso || '');
    if (s.length > 10 && s.charAt(10) === 'T') { const d = new Date(s); if (!isNaN(d.getTime())) return NA.toISODate(d); }
    return s.slice(0, 10);
  }
  const ym = (iso) => dayOf(iso).slice(0, 7);
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const plural = (n, one, many) => NA.fmt.num(n) + ' ' + (n === 1 ? one : (many || one + 's'));
  const money = (n) => NA.fmt.money(n);
  const short = (n) => NA.fmt.short(n);
  const sum = (list, f) => list.reduce((s, x) => s + num(f ? f(x) : x), 0);
  const daysSince = (iso) => (isDay(dayOf(iso)) ? NA.daysBetween(dayOf(iso), NA.today()) : 0);
  const daysUntil = (iso) => (isDay(dayOf(iso)) ? NA.daysBetween(NA.today(), dayOf(iso)) : 0);
  const dueBy = (iso, T) => isDay(dayOf(iso)) && dayOf(iso) <= T;
  const hoursSince = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / 3600000); };
  const waitText = (h) => (h < 1 ? 'under an hour' : h < 48 ? Math.floor(h) + 'h' : Math.floor(h / 24) + ' days');
  const bookDate = (o) => (o.booking && o.booking.date) || o.createdAt;
  const has = (name) => !!(NA.actions && typeof NA.actions[name] === 'function');
  const callAction = (name, arg, fallback) => { if (has(name)) NA.actions[name](arg); else if (fallback) NA.go(fallback); };
  /** Records made before the approval rules started count as approved. */
  const legacy = (rec) => { const s = NA.db.settings && NA.db.settings.policyStart; return !!s && !!rec && dayOf(rec.createdAt) < s; };
  /* The Orders screen's rules live in core.js (NA.biz), so Today never disagrees with the order page. */
  /** Car before full payment: approved by the Managing Director (the old on/off switch counts too). */
  const creditOk = (o) => B.creditApproved(o);
  const corpDocMissing = (o) => B.corpDocMissing(o);
  /** What stops a car being sold or handed over ('' = nothing): on hold, or a problem found at the inspection. */
  const carProblem = (v) => B.carProblem(v);
  /** A call a manager makes: the call-back after a low rating. */
  const managerCall = (f) => !!f.escalated || f.type === 'Manager call-back';
  /* Follow-ups are routed and closed by the Service screen's rules (NA.service), as on Service and Customers.
     The small local copies below are used only when that screen is not loaded. */
  const SV = () => NA.service || {};
  /** The sales team's calls: chasing car payments, the call after a car is handed over, the Sales Manager's call-backs. */
  const salesCall = (f) => f.type === 'Payment Follow-up' || managerCall(f) || (f.type === 'Satisfaction Call' && !!f.orderId && !f.jobCardId);
  /** Calls the service desk makes: about a job, or with no consultant and not a sales call. */
  const isServiceCall = (f) => (typeof SV().isServiceCall === 'function' ? !!SV().isServiceCall(f)
    : (!!f.jobCardId && !managerCall(f)) || (!f.consultantId && !salesCall(f)));
  /** Who closes this follow-up when this person may not ('' = they may): call-backs are the Sales Manager's,
      complaints the Service Manager's. */
  const closerOf = (f) => (typeof SV().followUpCloser === 'function' ? SV().followUpCloser(f) || ''
    : managerCall(f) && !NA.isManager() ? 'the Sales Manager' : f.type === 'Complaint' && !NA.can('service.approve') ? 'the Service Manager' : '');
  /** Not called yet: a new lead with no call, message or meeting logged — the Leads screen's "not contacted" rule before
      its time limit, so Today lists a new lead from the start and it is called in time. */
  const isFresh = (l) => l.stage === 'new' && !(l.engagements || []).length;
  /** Hours a lead has waited past the first-call limit (0 = contacted, or still in time): the Leads screen's own rule
      (NA.leadUtils.notContacted), so a count on Today is the "Not contacted" list it opens. */
  function notContacted(l) {
    const LU = NA.leadUtils;
    if (LU && typeof LU.notContacted === 'function') { try { return num(LU.notContacted(l)); } catch (e) { console.error(e); } }
    if (!isFresh(l)) return 0;
    const h = hoursSince(l.createdAt);
    return h >= (num(NA.policy().firstContactHours) || 24) ? h : 0;
  }
  /** The test-drive step is done: signed form and a licence valid on the day, or no drive wanted (the Leads screen's rule). */
  function testDriveDone(l) {
    const LU = NA.leadUtils;
    if (LU && typeof LU.complete === 'function') { try { return !!LU.complete(l, 'testdrive'); } catch (e) { console.error(e); } }
    const t = l.testDrive || {};
    if (t.skipped) return true;
    const legacyLicence = !!t.licenceVerified && !('licenceExpiry' in t);
    return !!t.formSigned && !!t.licenceNo && (legacyLicence || (!!t.licenceExpiry && t.licenceExpiry >= (t.date || NA.today())));
  }
  const isLive = (p) => !p.void && p.status !== 'void';
  /** A customer's name, or '' when this person's screens do not include customers (Purchasing, for example). */
  const custName = (id) => { const n = id ? NA.customerName(id) : ''; return n === '—' ? '' : n; };

  /** On hold the way the Vehicles screen counts it (a car that failed its arrival check is on hold too). */
  const onHold = (v) => v.status === 'hold' || (v.status === 'pdi' && !!(v.pdi && v.pdi.flagged));
  const toInspect = (v) => v.status === 'pdi' && !onHold(v);

  /** A link only when this person may open that screen (otherwise the row is plain text). */
  function gate(href) {
    if (!href) return null;
    const s = String(href).replace(/^#\//, '').split(/[/?]/)[0];
    return s === 'approvals' || s === 'dashboard' || NA.canSee(s) ? href : null;
  }

  const TITLES = /^(md\.?|mohd\.?|mohammad|mohammed|muhammad|mr\.?|mrs\.?|ms\.?|dr\.?|engr\.?)$/i;
  function firstName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.find((w) => !TITLES.test(w)) || parts[0] || 'there';
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  const GENERIC = /^(admin|administrator|user|test|owner)$/i;
  /** "Good morning, Nusrat". On one computer the sign-in name may still be the default "Admin": then the linked
      staff record gives the real name, and without one the greeting has no name rather than a wrong one. */
  function greetingFor(me) {
    let name = String((me && me.name) || '').trim();
    const st = me && me.staffId ? NA.get('staff', me.staffId) : null;
    if ((!name || GENERIC.test(name)) && st && st.name) name = st.name;
    return !name || GENERIC.test(name) ? greeting() : greeting() + ', ' + firstName(name);
  }
  const monthName = (k) => new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long' });

  /* Phone and WhatsApp (Bangladeshi numbers: 01XXXXXXXXX → 8801XXXXXXXXX). */
  const digits = (m) => String(m || '').replace(/\D/g, '');
  function waHref(m, text) {
    let d = digits(m);
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '88' + d;
    else if (d.length === 10 && d[0] === '1') d = '880' + d;
    return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function contactButtons(mobile, name) {
    if (!digits(mobile)) return '';
    const tel = 'tel:' + (String(mobile).trim().startsWith('+') ? '+' : '') + digits(mobile);
    return `<a class="td-round" href="${esc(tel)}" aria-label="Call ${esc(name)}" title="Call">${NA.icon('phone', 16)}</a>`
      + `<a class="td-round" href="${esc(waHref(mobile))}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(name)}" title="WhatsApp">${NA.icon('whatsapp', 17)}</a>`;
  }

  /* ---------- building blocks ---------- */
  const ico = (name, tone) => `<span class="td-ico ${tone || ''}">${NA.icon(name, 17)}</span>`;
  /** The one blue button of the screen goes to the first thing that needs doing. */
  const primary = (ctx) => { if (ctx.primaryUsed) return 'btn-ghost'; ctx.primaryUsed = true; return 'btn-primary'; };

  /**
   * One row of a grouped list. r: { icon, tone, lead (html instead of the icon), title (text),
   * sub (html or [html]), quote (text), href, right (html), wrap (actions drop below on phones) }.
   * A row without buttons of its own is one real link (one tap target, keyboard focus). A row with buttons
   * (call, approve…) opens its record from anywhere outside those buttons, and its title is the link.
   */
  function row(r) {
    const href = gate(r.href);
    const subs = [].concat(r.sub || []).filter(Boolean);
    const controls = /<(a|button)\b/i.test(String(r.right || '') + String(r.extra || ''));
    const whole = !!href && !controls;
    const cls = ['gl-row', 'td-row', href && !whole ? 'link' : '', r.lead === '' ? 'td-plain' : '', r.wrap ? 'td-wraps' : '', r.cls || ''].filter(Boolean).join(' ');
    const inner = `${r.lead != null ? r.lead : ico(r.icon || 'info', r.tone)}
      <div class="td-main"><b>${href && !whole ? `<a href="${esc(href)}">${esc(r.title)}</a>` : esc(r.title)}</b>${subs.map((x) => `<small>${x}</small>`).join('')}${r.quote ? `<span class="td-q">“${esc(r.quote)}”</span>` : ''}${r.extra || ''}</div>
      ${r.right ? `<div class="td-right${r.wrap ? ' td-wrap' : ''}">${r.right}</div>` : ''}${whole ? NA.icon('chevron-right', 16, 'gl-chev') : ''}`;
    return whole ? `<a class="${cls}" href="${esc(href)}">${inner}</a>` : `<div class="${cls}"${href ? ` data-href="${esc(href)}"` : ''}>${inner}</div>`;
  }
  /** The last row of a shortened list: "12 more" opens the full list. */
  const moreRow = (n, href, label) => (n > 0 && gate(href) ? `<a class="gl-row td-more" href="${esc(gate(href))}">${esc(label || NA.fmt.num(n) + ' more')}</a>` : '');

  function sectionHead(o, count) {
    const link = o.link && gate(o.link.href);
    return `<div class="td-sec-head"><h2>${esc(o.title)}${count ? `<span class="td-n">${NA.fmt.num(count)}</span>` : ''}</h2>${o.side || (link ? `<a class="btn-link" href="${esc(link)}">${esc(o.link.label || 'See all')}</a>` : '')}</div>`;
  }

  /** Lists opened with "Show all" (kept while the app is open; a fresh visit starts short again). */
  const opened = new Set();
  /**
   * A titled grouped list. Hidden when empty unless o.empty is given. A long list ends in "N more", which opens
   * the full list on its own screen (o.link), or shows the rest right here. Nothing is ever cut off silently.
   */
  function section(o) {
    const rows = (o.rows || []).filter(Boolean);
    if (!rows.length && !o.empty) return '';
    const link = o.link && gate(o.link.href);
    const key = o.key || o.title;
    const max = o.limit || (link ? 5 : 8);
    const open = !link && opened.has(key);
    const shown = open ? rows : rows.slice(0, max);
    const more = rows.length - shown.length;
    const count = o.count === false ? 0 : o.count != null ? o.count : rows.length;
    let tail = '';
    if (more > 0) tail = link ? moreRow(more, link) : `<button type="button" class="gl-row td-more" data-act="more" data-sec="${esc(key)}">Show ${NA.fmt.num(more)} more</button>`;
    else if (open && rows.length > max) tail = `<button type="button" class="gl-row td-more" data-act="less" data-sec="${esc(key)}">Show fewer</button>`;
    const body = rows.length
      ? `<div class="glist">${shown.join('')}${tail}</div>`
      : `<div class="glist"><div class="gl-row td-none">${esc(o.empty)}</div></div>`;
    return `<section class="td-sec">${sectionHead(o, count)}${body}${o.foot ? `<div class="glist-foot">${o.foot}</div>` : ''}${o.tail || ''}</section>`;
  }

  /** A titled card for things that are not a list (my month, charts, the process strip). */
  const card = (o) => `<section class="td-sec">${sectionHead(o, 0)}<div class="card ${o.cls || ''}">${o.body}</div>${o.foot ? `<div class="glist-foot">${o.foot}</div>` : ''}</section>`;

  const statRow = (tiles) => `<div class="td-stats">${tiles.filter(Boolean).map((t) => NA.ui.kpi({ label: t.label, value: t.value, sub: t.sub, href: gate(t.href) || undefined })).join('')}</div>`;

  function strip(label, steps) {
    return `${label ? `<div class="td-strip-label">${esc(label)}</div>` : ''}<div class="td-strip">${steps.map((s) => {
      const href = gate(s.href);
      const cls = `td-step${s.n ? '' : ' zero'}${s.hot ? ' hot' : ''}`;
      const inner = `<span class="n">${NA.fmt.num(s.n)}</span><span class="l">${esc(s.label)}</span>`;
      return href ? `<a class="${cls}" href="${esc(href)}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
    }).join('')}</div>`;
  }

  const caughtUp = () => `<div class="card td-caught"><div class="td-ok">${NA.icon('check', 30)}</div><h3>You’re all caught up</h3><p>Nothing needs you right now.</p></div>`;

  /* ---------- the facts, computed once per render ---------- */
  function context() {
    const db = NA.db;
    const list = (c) => (Array.isArray(db[c]) ? db[c] : []);
    const T = NA.today();
    const ctx = { T, M: T.slice(0, 7), me: NA.me(), sid: NA.myStaffId(), role: NA.role(), pol: NA.policy(), list, primaryUsed: false, memo: {} };
    // Customer money per order, once: confirmed (what counts, as B.orderPaid), and handed over but waiting for Accounts.
    const paid = new Map(), pend = new Map(), pays = new Map();
    list('payments').forEach((p) => {
      if (!p.orderId) return;
      if (!pays.has(p.orderId)) pays.set(p.orderId, []);
      pays.get(p.orderId).push(p);
      const m = B.paymentCleared(p) ? paid : B.paymentPending(p) ? pend : null;
      if (m) m.set(p.orderId, (m.get(p.orderId) || 0) + num(p.amount));
    });
    ctx.paysOf = (o) => pays.get(o.id) || [];
    ctx.paid = (o) => paid.get(o.id) || 0;
    ctx.pending = (o) => pend.get(o.id) || 0;
    ctx.balance = (o) => Math.max(0, B.orderNet(o) - ctx.paid(o));
    ctx.toCollect = (o) => Math.max(0, B.orderNet(o) - ctx.paid(o) - ctx.pending(o));
    ctx.paidPct = (o) => { const n = B.orderNet(o); return n ? Math.min(1, ctx.paid(o) / n) : 0; };
    ctx.fullyPaid = (o) => B.orderNet(o) > 0 && ctx.balance(o) <= 0.5;
    // Purchasing (and anyone else the office server sends no customer payments) cannot see the money. For them an
    // order is ready for its VIN by the stage the Orders screen saved (B.syncStage keeps it up to date) or by an
    // approved car before full payment, and it is booked for real once it reached the payment stage.
    const access = NA.ACCESS && NA.ACCESS[ctx.role];
    ctx.seesMoney = !NA.ACCESS || ctx.role === 'owner' || !!(access && access.payments);
    /** Booked for real: corporate orders by their purchase order or award letter, the others by money handed in. */
    ctx.confirmed = (o) => (o.channel === 'Corporate' ? !corpDocMissing(o)
      : ctx.seesMoney ? ctx.paid(o) + ctx.pending(o) > 0 : ['payment', 'vin'].includes(o.stage));
    const vinMemo = new Map(), handMemo = new Map();      // asked several times per order in one render
    /** Why the order cannot get its VIN yet — the order page's list (empty = it can). */
    ctx.vinBlockers = (o) => { if (!vinMemo.has(o.id)) vinMemo.set(o.id, B.vinBlockers(o)); return vinMemo.get(o.id); };
    ctx.vinReady = (o) => {
      if (o.vehicleId) return false;
      if (ctx.seesMoney) return !ctx.vinBlockers(o).length;
      if (['delivered', 'cancelled'].includes(o.stage) || !B.discountOk(o) || B.cancelPending(o) || corpDocMissing(o)) return false;
      return o.stage === 'vin' || creditOk(o);
    };
    /** Why the car cannot be handed over yet — the order page's list (empty = it can go). */
    ctx.handOverBlockers = (o) => { if (!handMemo.has(o.id)) handMemo.set(o.id, B.deliveryBlockers(o)); return handMemo.get(o.id); };
    ctx.readyToHandOver = (o) => !!o.vehicleId && !['delivered', 'cancelled'].includes(o.stage) && !ctx.handOverBlockers(o).length;
    /** Where the order really is, as the Orders screen files it (its ?stage= lists use the same rule). */
    ctx.stageOf = (o) => B.stageOf(o);
    /** Where a purchase order really is, as Purchasing files it (its payments, VINs and arrivals; NA.purchasing.stageOf),
        whatever its saved stage says. Without Purchasing's screen: the saved stage. */
    const poMemo = new Map();
    ctx.poStage = (po) => {
      if (!poMemo.has(po.id)) {
        const P = NA.purchasing;
        let k = po.stage;
        if (P && typeof P.stageOf === 'function') { try { k = P.stageOf(po) || po.stage; } catch (e) { console.error(e); } }
        poMemo.set(po.id, k);
      }
      return poMemo.get(po.id);
    };
    ctx.ownerOf = (r) => r.ownerId || r.consultantId || null;
    ctx.mine = (r) => !!ctx.sid && !!r && (r.ownerId === ctx.sid || r.consultantId === ctx.sid);
    ctx.openOrders = list('orders').filter((o) => !['delivered', 'cancelled'].includes(o.stage));
    ctx.openLeads = list('leads').filter((l) => OPEN_LEAD.includes(l.stage));
    ctx.target = (staffId) => list('targets').find((t) => t.staffId === staffId && t.month === ctx.M) || null;
    return ctx;
  }

  /** Confirmed orders that still need a car: is there one for them? First come, first served — orders that can
      take their VIN now go first, then by booking date (same model; same colour when both are set).
      Only supply that is certain counts as "on the way": cars arriving or being inspected, lots BYD has allocated
      on an approved purchase order, and emergency cars CG Runner has confirmed. A purchase still at the enquiry
      stage does not hide a customer who has paid and has no car. */
  /** Purchasing's copy of an emergency purchase on the order (o.emergencyPO), for people who receive no purchase orders
      (consultants): the purchase itself when it is under way and its purchase order is not visible here, else null. */
  const emCopy = (ctx, o) => {
    const c = o.emergencyPO;
    if (!c || ['cancelled', 'received'].includes(c.stage)) return null;
    return c.id && ctx.list('purchaseOrders').some((p) => p.id === c.id) ? null : Object.assign({ type: 'emergency', copy: true }, c);
  };
  function stockCheck(ctx) {
    if (ctx.memo.stock) return ctx.memo.stock;
    const colorOk = (o, c) => !o.color || !c || c === o.color;
    const pool = (items) => items.map((x) => ({ modelId: x.modelId, color: x.color, used: false }));
    const vehicles = ctx.list('vehicles');
    const pos = ctx.list('purchaseOrders');
    const sure = (p) => { const k = ctx.poStage(p); return p.type === 'emergency'
      ? k === 'paid' || (k === 'confirmed' && poState(p) === 'approved')
      : ['allocated', 'releasing', 'receiving'].includes(k) && poState(p) === 'approved'; };
    const units = (list) => list.reduce((arr, p) => arr.concat((p.units || []).filter((u) => !u.vehicleId)), []);
    const free = pool(vehicles.filter((v) => v.status === 'available' && !v.reservedFor && !carProblem(v)));
    // Emergency cars bought for one order are kept for it; the rest of the supply is shared out in queue order.
    const incoming = pool(vehicles.filter((v) => ['in_transit', 'pdi'].includes(v.status) && !v.orderId && !v.reservedFor && !carProblem(v)))
      .concat(pool(units(pos.filter((p) => sure(p) && !(p.type === 'emergency' && p.orderId)))));
    const earmarked = new Set(pos.filter((p) => sure(p) && p.type === 'emergency' && p.orderId && units([p]).length).map((p) => p.orderId));
    const take = (pl, o) => { const v = pl.find((x) => !x.used && x.modelId === o.modelId && colorOk(o, x.color)); if (v) v.used = true; return !!v; };
    const waiting = ctx.openOrders.filter((o) => !o.vehicleId && (ctx.confirmed(o) || ctx.vinReady(o)))
      .map((o) => ({ o, ready: ctx.vinReady(o), since: dayOf(bookDate(o)) }))
      .sort((a, b) => (b.ready - a.ready) || a.since.localeCompare(b.since));
    ctx.memo.stock = waiting.map(({ o, ready }) => {
      const held = vehicles.find((v) => v.reservedFor === o.id && ['available', 'pdi', 'in_transit'].includes(v.status) && !carProblem(v));
      const hasStock = held ? held.status === 'available' : take(free, o);
      const onTheWay = !hasStock && (!!held || earmarked.has(o.id) || take(incoming, o));
      const emergency = pos.find((p) => p.type === 'emergency' && !['received', 'cancelled'].includes(ctx.poStage(p))
        && (p.orderId === o.id || (!p.orderId && (p.units || []).some((u) => u.modelId === o.modelId && colorOk(o, u.color))))) || emCopy(ctx, o);
      return { o, ready, hasStock, onTheWay, emergency };
    });
    return ctx.memo.stock;
  }
  const stockFor = (ctx, o) => stockCheck(ctx).find((x) => x.o.id === o.id) || null;

  /** A bank loan that has not moved to its next step. */
  function bankStuck(o) {
    if (o.channel !== 'Bank' || !o.bank) return null;
    const steps = NA.FLOW.bankSteps;
    const st = o.bank.steps || {};
    const k = steps.findIndex((s) => !st[s.key]);
    if (k < 0) return null;
    const since = k > 0 ? st[steps[k - 1].key] : bookDate(o);
    return { step: steps[k], days: daysSince(since) };
  }
  /** Registration (BRTA) applied but no number yet. */
  function brtaWait(o) {
    if (!o.vehicleId || (o.brta && o.brta.regNo)) return null;
    const since = (o.brta && o.brta.appliedDate) || o.vinAssignedAt;
    return { applied: !!(o.brta && o.brta.appliedDate), days: since ? daysSince(since) : 0 };
  }

  /** What an order needs next, from the consultant's side (null = nothing). sev 0 = urgent. A car handed over before
      it was paid for in full stays here until the money is in (the order page asks the consultant to collect it). */
  function orderNeed(ctx, o) {
    const delivered = o.stage === 'delivered';
    if (o.stage === 'cancelled' || (delivered && ctx.balance(o) <= 0.5)) return null;
    if (B.cancelPending(o)) return { sev: 3, icon: 'clock', text: 'Cancellation waiting for the Managing Director' };
    const toCollect = ctx.toCollect(o);
    // A bounced cheque matters until the money has been collected again.
    const bounce = toCollect > 0 && ctx.paysOf(o).find((p) => B.paymentBounced(p) && daysSince(p.verifiedAt || p.date) <= 14);
    if (bounce) return { sev: 0, tone: 'red', icon: 'alert', text: `${money(bounce.amount)} ${/cheque|pay order/i.test(bounce.method || '') ? 'cheque bounced' : 'not received'} — collect it again`, pay: true };
    if (delivered) {
      if (toCollect <= 0.5) return { sev: 3, icon: 'clock', text: `${money(ctx.pending(o))} waiting for Accounts to confirm` };
      const late = daysSince(o.deliveredAt || (o.delivery && o.delivery.date)) > 30;
      return { sev: late ? 1 : 2, tone: late ? 'red' : 'amber', icon: 'wallet', text: `Collect ${money(toCollect)} — car released before full payment`, pay: true };
    }
    if (!B.discountOk(o)) {
      const d = num(o.discount);
      const st = A.state('orders', o.id, 'discount', d);
      if (st === 'pending' || (!!o.leadId && A.isPending('leads', o.leadId, 'discount'))) return { sev: 3, icon: 'clock', text: 'Discount waiting for approval' };
      if (st === 'rejected') return { sev: 0, tone: 'red', icon: 'x', text: 'Discount declined — change it on the order' };
      return { sev: 1, tone: 'amber', icon: 'tag', text: 'Discount needs approval — ask on the order' };
    }
    if (corpDocMissing(o)) return { sev: 1, tone: 'amber', icon: 'file-text', text: 'Add the company’s purchase order or award letter' };
    if (ctx.readyToHandOver(o)) return { sev: 1, tone: 'green', icon: 'car', text: 'Ready to hand over' };
    const loan = bankStuck(o);
    if (loan && toCollect > 0) return { sev: loan.days > 7 ? 1 : 3, tone: loan.days > 7 ? 'amber' : '', icon: 'bank', text: `Bank loan at “${loan.step.label}”${loan.days ? ' for ' + plural(loan.days, 'day') : ''}` };
    const credit = creditOk(o);
    if (!credit && toCollect > 0) return { sev: 2, tone: 'blue', icon: 'wallet', text: `Collect ${money(toCollect)}`, pay: true };
    if (ctx.pending(o) > 0 && !credit && ctx.balance(o) > 0) return { sev: 3, icon: 'clock', text: `${money(ctx.pending(o))} waiting for Accounts to confirm` };
    if (ctx.vinReady(o)) {
      const s = stockFor(ctx, o);
      const why = ctx.fullyPaid(o) ? 'Paid in full' : 'Car approved before full payment';
      if (s && !s.hasStock && !s.onTheWay) {
        return o.emergencyRequest || s.emergency
          ? { sev: 3, icon: 'bolt', text: `${why} — Purchasing is finding a car` }
          : { sev: 0, tone: 'red', icon: 'car', text: `${why} — no car in stock. Ask Purchasing for an emergency car` };
      }
      if (s && !s.hasStock) return { sev: 3, icon: 'truck', text: `${why} — a car is on the way` };
      return { sev: 2, tone: 'green', icon: 'key', text: `${why} — ${NA.can('vin.assign') ? 'give the VIN' : 'waiting for its VIN'}` };
    }
    const reg = brtaWait(o);
    if (reg) {
      return reg.applied
        ? { sev: reg.days > 10 ? 1 : 3, tone: reg.days > 10 ? 'amber' : '', icon: 'id-card', text: `Registration applied ${reg.days ? plural(reg.days, 'day') + ' ago' : 'today'}` }
        : { sev: 2, tone: 'blue', icon: 'id-card', text: 'Apply for registration (BRTA)' };
    }
    const block = o.vehicleId ? ctx.handOverBlockers(o)[0] : null;
    return block ? { sev: 3, icon: 'info', text: block } : null;
  }

  /** A purchase order's approval, 'approved' | 'pending' | 'rejected' | 'none': the shared rule (B.poApproval, which is
      Purchasing's when that screen is loaded). The copy below is used only without it. */
  function poState(po) {
    if (typeof B.poApproval === 'function') { try { return B.poApproval(po); } catch (e) { console.error(e); } }
    const kind = po.type === 'emergency' ? 'emergency' : 'po';
    if (kind === 'po' && NA.policy().poApproval === false) return 'approved';
    const st = A.state('purchaseOrders', po.id, kind);
    if (st !== 'none') return st;
    if (po.approval && po.approval.status && po.approval.status !== 'cancelled') return po.approval.status;
    if (po.approvedAt || po.approvedBy) return 'approved';
    return legacy(po) ? 'approved' : 'none';
  }
  /** Final payments due on an approved purchase order, one per car: Purchasing's own list when it offers one, otherwise
      the per-car rule — the car is in a shipment batch, the advance is paid and the car has no live final payment yet.
      pays = every payment on the order, voided ones too (a voided final payment leaves the car unpaid). */
  function releasesDue(po, pct, pays) {
    const P = NA.purchasing;
    if (P && typeof P.releasesDue === 'function') {
      try {
        const r = P.releasesDue(po);
        let list = Array.isArray(r) ? r : r && Array.isArray(r.units) ? r.units : null;
        if (list) {
          const units = po.units || [];
          // One row per car, or one row per order carrying its cars (units).
          list = list.reduce((out, x) => out.concat(x && !x.unit && !x.unitId && Array.isArray(x.units)
            ? x.units.map((u) => ({ unit: u, poId: x.poId || (x.po && x.po.id) })) : [x]), []);
          return list.map((x) => {
            const u = (x && (x.unit || (x.unitId ? units.find((y) => y.id === x.unitId) : null) || (x.unitCost != null ? x : null))) || null;
            const poId = x && (x.poId || (x.po && x.po.id) || (u && units.some((y) => y === u || y.id === u.id) ? po.id : null));
            return poId === po.id && u ? { unit: u, amount: num(x.amount) || Math.round(num(u.unitCost) * (1 - pct)) } : null;
          }).filter(Boolean);
        }
      } catch (e) { console.error(e); }
    }
    const advNeeded = Math.round(B.poTotal(po) * pct);
    const advPaid = sum(pays.filter((p) => isLive(p) && /advance/i.test(p.kind || '')), (p) => p.amount);
    if (!(advNeeded > 0 && advPaid >= advNeeded - 1)) return [];
    const vin = (v) => String(v || '').trim().toUpperCase().replace(/[\s-]+/g, '');
    const carPaid = (u) => {
      const ps = pays.filter((p) => /release|^(final|full)/i.test(p.kind || '') && (p.unitId ? p.unitId === u.id : !!u.vin && !!p.vin && vin(p.vin) === vin(u.vin)));
      return ps.length ? ps.some(isLive) : !!u.releasePaidAt;
    };
    return (po.units || []).filter((u) => u.lotNo && !carPaid(u)).map((u) => ({ unit: u, amount: Math.round(num(u.unitCost) * (1 - pct)) }));
  }
  /** Parts bills to pay: parts orders the workshop received, less what Accounts has paid on them — Accounts' own list
      (NA.finance.partBills, paid under Suppliers). Without Accounts' screen: the same rule here. */
  function partBillsDue(ctx) {
    const F = NA.finance;
    if (F && typeof F.partBills === 'function') {
      try { return (F.partBills() || []).filter((b) => b && b.o && num(b.owed) > 0.5); } catch (e) { console.error(e); }
    }
    const paid = new Map();
    ctx.list('vendorPayments').forEach((p) => { if (p.partOrderId && isLive(p)) paid.set(p.partOrderId, (paid.get(p.partOrderId) || 0) + num(p.amount)); });
    return ctx.list('partOrders').filter((o) => o.status === 'received').map((o) => {
      const value = sum(Array.isArray(o.receipts) ? o.receipts : [], (x) => x.value) || num(o.total);
      return { o, vendorId: o.vendorId, owed: Math.max(0, value - (paid.get(o.id) || 0)) };
    }).filter((b) => b.owed > 0.5);
  }
  /** What we owe suppliers and what is due to pay now, as Accounts' Suppliers screen counts it: approved purchase orders
      (and emergency cars once confirmed), plus parts bills. rows: one per payment to make, with where to make it. */
  function supplierMoney(ctx) {
    if (ctx.memo.sup) return ctx.memo.sup;
    const all = ctx.list('vendorPayments');
    const vps = all.filter(isLive);
    const paidBy = new Map(), advBy = new Map(), paysOf = new Map();
    all.forEach((p) => { if (!paysOf.has(p.poId)) paysOf.set(p.poId, []); paysOf.get(p.poId).push(p); });
    vps.forEach((p) => {
      paidBy.set(p.poId, (paidBy.get(p.poId) || 0) + num(p.amount));
      if (/advance/i.test(p.kind || '')) advBy.set(p.poId, (advBy.get(p.poId) || 0) + num(p.amount));
    });
    let owed = 0, due = 0;
    const rows = [];
    const poRow = (po, amount, what) => rows.push({ po, amount, what, code: po.code || '', vendorId: po.vendorId, href: '#/procurement/' + po.id, icon: 'cart' });
    const duePOs = new Set();
    ctx.list('purchaseOrders').forEach((po) => {
      const k = ctx.poStage(po);
      if (k === 'cancelled' || po.status === 'cancelled') return;
      // Only a commitment counts: an approved purchase order, or an emergency car CG Runner has confirmed.
      if (poState(po) !== 'approved') return;
      if (po.type === 'emergency' && !['confirmed', 'paid', 'received'].includes(k)) return;
      const total = B.poTotal(po);
      const left = total - (paidBy.get(po.id) || 0);
      if (left < 100) return;                       // paid (rounding leaves a few taka)
      owed += left;
      if (po.type === 'emergency') {          // CG Runner is paid 100% once the car is confirmed
        due += left; poRow(po, left, 'Full payment (emergency)'); duePOs.add(po.id);
        return;
      }
      let pct = num(po.advancePct) || num(NA.db.settings.advancePct) || 0.3;
      if (pct > 1) pct /= 100;                      // stored as 30 rather than 0.3
      const adv = Math.round(total * pct) - (advBy.get(po.id) || 0);
      if (adv >= 100) { due += adv; poRow(po, adv, Math.round(pct * 100) + '% advance'); duePOs.add(po.id); }
      const cars = releasesDue(po, pct, paysOf.get(po.id) || []);
      const rel = Math.min(left, sum(cars, (x) => x.amount));
      if (rel >= 100) { due += rel; poRow(po, rel, `Final ${Math.round((1 - pct) * 100)}% for ${plural(cars.length, 'car')} in a shipment batch`); duePOs.add(po.id); }
    });
    // Parts the workshop received are a bill to pay now (Accounts pays it under Suppliers).
    const bills = partBillsDue(ctx);
    bills.forEach((b) => {
      const amount = num(b.owed);
      owed += amount; due += amount;
      rows.push({ bill: b.o, amount, what: 'Parts bill', code: b.o.code || '', vendorId: b.vendorId || b.o.vendorId, href: '#/finance?tab=vendors', icon: 'cog-parts' });
    });
    // "2 purchase orders · 1 parts bill", the words Accounts' Suppliers screen uses for the same money.
    const count = [duePOs.size ? plural(duePOs.size, 'purchase order') : '', bills.length ? plural(bills.length, 'parts bill') : ''].filter(Boolean).join(' · ');
    ctx.memo.sup = { owed, due, rows, count };
    return ctx.memo.sup;
  }

  /** Workshop money collected in a month, counted the way Accounts counts it: read from the service invoices (so
      nothing is counted twice), and when the workshop also recorded the receipt for Accounts, only once it is confirmed. */
  function serviceCollected(ctx, month) {
    const recorded = new Map();
    ctx.list('payments').forEach((p) => { if (p.invoiceId && !p.orderId) recorded.set(p.invoiceId, (recorded.get(p.invoiceId) || []).concat(p)); });
    let total = 0;
    ctx.list('invoices').forEach((i) => {
      if (i.kind === 'vehicle' || i.billing === 'warranty' || !(num(i.total) > 0)) return;
      const rc = Array.isArray(i.receipts) ? i.receipts.filter((x) => num(x.amount) > 0) : [];
      const got = rc.length ? rc.map((x) => ({ date: x.date || i.date, amount: num(x.amount) }))
        : num(i.paid) > 0 ? [{ date: i.date, amount: Math.min(num(i.total), num(i.paid)) }] : [];
      const pool = (recorded.get(i.id) || []).slice();
      got.forEach((x) => {
        let k = pool.findIndex((p) => Math.abs(num(p.amount) - x.amount) < 0.5 && dayOf(p.date) === dayOf(x.date));
        if (k < 0) k = pool.findIndex((p) => Math.abs(num(p.amount) - x.amount) < 0.5);
        const p = k >= 0 ? pool.splice(k, 1)[0] : null;
        if ((!p || (isLive(p) && B.paymentCleared(p))) && ym(x.date) === month) total += x.amount;
      });
    });
    return total;
  }
  /** Customer money in during a month: confirmed car receipts (refunds are money out) plus confirmed workshop money. */
  function moneyIn(ctx, month) {
    const cars = sum(ctx.list('payments').filter((p) => p.orderId && isLive(p) && num(p.amount) > 0 && B.paymentCleared(p) && ym(p.date) === month), (p) => p.amount);
    return cars + serviceCollected(ctx, month);
  }
  /** This month's money in and out, read from Accounts (NA.finance) so Today shows Accounts' own figures. Without
      Accounts' screen loaded, money in is counted here by the same rules and money out is left out (null). */
  function moneyThisMonth(ctx) {
    const F = NA.finance;
    if (F && typeof F.moneyIn === 'function') {
      const from = ctx.M + '-01', to = NA.addDays(NA.addMonths(from, 1), -1);
      try {
        const got = num((F.moneyIn(from, to) || {}).total);
        let out = null;
        if (typeof F.moneyOut === 'function') { try { out = num((F.moneyOut(from, to) || {}).total); } catch (e) { console.error(e); } }
        return { in: got, out };
      } catch (e) { console.error(e); }
    }
    return { in: moneyIn(ctx, ctx.M), out: null };
  }
  /** A vehicle invoice before VAT (sales figures are shown without the VAT the company passes on). */
  const exVat = (i) => {
    if (i.subtotal != null && i.subtotal !== '') return num(i.subtotal);
    const rate = i.vatRate != null ? num(i.vatRate) : num(NA.db.settings && NA.db.settings.vatRate);
    return Math.round(num(i.total) / (1 + rate));
  };

  const bouncedRecently = (ctx) => ctx.list('payments').filter((p) => B.paymentBounced(p) && daysSince(p.verifiedAt || p.date) <= 30);
  /** Bounced money from the last 30 days that has not been collected again yet. */
  const openBounces = (ctx) => bouncedRecently(ctx).filter((p) => {
    const o = p.orderId ? NA.get('orders', p.orderId) : null;
    return !o || (o.stage !== 'cancelled' && ctx.toCollect(o) > 0);
  });
  /** Cars handed over with money still due (credit sales), oldest first. */
  const owing = (ctx) => ctx.list('orders').filter((o) => o.stage === 'delivered' && ctx.balance(o) > 0.5)
    .map((o) => ({ o, bal: ctx.balance(o), days: daysSince(o.deliveredAt || (o.delivery && o.delivery.date)) })).sort((a, b) => b.days - a.days);
  /** A service bill's money as Accounts counts it: { paid: confirmed money only, waiting: handed in, not confirmed yet }
      (NA.finance.serviceBillPaid). inv.paid is what the desk took, cheques still waiting included. Without Accounts'
      screen: the bill's money less the receipts Accounts has not confirmed. */
  function serviceBillMoney(inv) {
    const F = NA.finance;
    if (F && typeof F.serviceBillPaid === 'function') {
      try { const m = F.serviceBillPaid(inv) || {}; return { paid: num(m.paid), waiting: num(m.waiting) }; } catch (e) { console.error(e); }
    }
    let waiting = 0, notIn = 0;
    (Array.isArray(inv.receipts) ? inv.receipts : []).forEach((r) => {
      const p = !r.bounced && r.paymentId ? NA.get('payments', r.paymentId) : null;   // a bounce on the bill is off inv.paid already
      if (!p || (isLive(p) && B.paymentCleared(p))) return;
      notIn += num(r.amount);
      if (isLive(p) && B.paymentPending(p)) waiting += num(r.amount);
    });
    return { paid: Math.max(0, Math.min(num(inv.total), num(inv.paid) - notIn)), waiting };
  }
  /** Workshop bills not fully paid in confirmed money, oldest first: Accounts' "Customers who owe" counts them the same. */
  function serviceOwing(ctx) {
    if (ctx.memo.svcOwing) return ctx.memo.svcOwing;
    // A bill paid in full with every receipt confirmed is settled at once; only the others are worked out by Accounts' rule.
    const byId = new Map(ctx.list('payments').map((p) => [p.id, p]));
    const settled = (i) => num(i.paid) >= num(i.total) - 0.5 && (Array.isArray(i.receipts) ? i.receipts : []).every((r) => {
      if (r.bounced) return true;                         // already off inv.paid
      const p = r.paymentId ? byId.get(r.paymentId) : null;
      return !!p && isLive(p) && B.paymentCleared(p);
    });
    ctx.memo.svcOwing = ctx.list('invoices').filter((i) => i.kind !== 'vehicle' && i.billing !== 'warranty' && num(i.total) > 0 && !settled(i))
      .map((i) => { const m = serviceBillMoney(i); return { i, due: num(i.total) - Math.min(num(i.total), m.paid), waiting: m.waiting, days: daysSince(i.date) }; })
      .filter((x) => x.due > 0.5).sort((a, b) => b.days - a.days);
    return ctx.memo.svcOwing;
  }
  /** One row for parts at or below their reorder level, with "Reorder" for the people who order parts. */
  function partsRow(ctx, what) {
    const low = ctx.list('parts').filter((p) => B.partLow(p));
    if (!low.length) return '';
    const btn = NA.can('parts.manage') && has('partsReorderList') ? '<button class="btn btn-ghost btn-sm" data-act="reorder">Reorder</button>' : '';
    return row({ icon: 'cog-parts', tone: 'amber', title: `${plural(low.length, 'part')} ${what}`, href: '#/parts',
      sub: esc(low.slice(0, 4).map((p) => p.name).join(', ') + (low.length > 4 ? ` and ${low.length - 4} more` : '')), right: btn });
  }
  const refundsDue = (ctx) => ctx.list('orders').filter((o) => o.refund && o.refund.status === 'due' && num(o.refund.amount) > 0);
  const licences = (ctx) => ctx.list('compliance').filter((c) => isDay(dayOf(c.expiry)) && daysUntil(c.expiry) <= 60)
    .map((c) => ({ c, d: daysUntil(c.expiry) })).sort((a, b) => a.d - b.d);
  const hasEmergencyPO = (ctx, o) => ctx.list('purchaseOrders').some((p) => p.type === 'emergency' && p.orderId === o.id && ctx.poStage(p) !== 'cancelled')
    || !!(o.emergencyPO && o.emergencyPO.stage !== 'cancelled' && !(o.emergencyPO.id && ctx.list('purchaseOrders').some((p) => p.id === o.emergencyPO.id)));

  /* ---------- rows used by several roles ---------- */
  function dueText(iso) {
    if (!isDay(dayOf(iso))) return '<span class="tone-amber">No follow-up date</span>';
    const late = daysSince(iso);
    return late > 0 ? `<span class="tone-red">Overdue ${plural(late, 'day')}</span>` : 'Today';
  }
  function slaText(ctx, l) {
    const h = hoursSince(l.createdAt);
    const t = `Not contacted · ${h < 1 ? 'just now' : waitText(h)}`;
    return notContacted(l) > 0 ? `<span class="tone-red">${t}</span>` : t;
  }
  const canLog = (ctx, l) => ctx.mine(l) || NA.isManager();

  function leadRow(ctx, l, when, opts) {
    opts = opts || {};
    const bits = [when, esc(NA.modelName(l.modelId)), esc(leadWord(l.stage))];
    if (opts.who) bits.push(esc(l.consultantId ? NA.staffName(l.consultantId) : 'No consultant yet'));
    const log = canLog(ctx, l) ? `<button class="td-round" data-act="log" data-id="${esc(l.id)}" aria-label="Write down the call with ${esc(l.name)}" title="Write down the call">${NA.icon('edit', 16)}</button>` : '';
    return row({ lead: NA.ui.avatar(l.name, 34), title: l.name || '—', sub: bits.filter(Boolean).join(' · '), href: '#/leads/' + l.id, right: contactButtons(l.mobile, l.name) + log });
  }

  function orderRow(ctx, o, need) {
    const pay = need.pay && NA.can('payments.record') && has('recordPayment')
      ? `<button class="btn btn-ghost btn-sm" data-act="pay" data-id="${esc(o.id)}">Record payment</button>` : '';
    return row({ icon: need.icon, tone: need.tone, title: need.text, sub: `${esc(NA.customerName(o.customerId))} · ${esc(o.code || '')} · ${esc(NA.modelName(o.modelId))}${o.color ? ' · ' + esc(o.color) : ''}`, href: '#/sales/' + o.id, right: pay, wrap: !!pay });
  }

  /** "Done" closes a follow-up in one tap (the shared completion sheet), only for someone who may close it — the Service
      screen's rule: a call-back after a low rating is a manager's, a complaint the Service Manager's. */
  function doneButton(f) {
    if (!has('completeFollowUp') || closerOf(f)) return '';
    return `<button class="btn btn-ghost btn-sm" data-act="fu-done" data-id="${esc(f.id)}">Done</button>`;
  }

  function followUpRow(ctx, f, href) {
    const c = NA.customer(f.customerId) || {};
    const bits = [dueText(f.due), esc(f.type || 'Follow-up'), f.notes ? esc(f.notes) : ''];
    const done = doneButton(f);
    return row({ lead: NA.ui.avatar(c.name || '?', 34), title: c.name || NA.customerName(f.customerId), sub: bits.filter(Boolean).join(' · '), href, right: contactButtons(c.mobile, c.name || '') + done, wrap: !!done });
  }

  /** A seller's own customer calls due today or overdue: a bounced payment, the call after delivery, calls planned on the
      customer page. They are not on the Leads screen, so they get their own list. The workshop's calls are the service
      desk's (they are on its Today and Service lists). */
  function customerCalls(ctx, skip) {
    return ctx.list('followUps').filter((f) => !!ctx.sid && f.status !== 'done' && dueBy(f.due, ctx.T) && !(skip && skip(f)) && !isServiceCall(f)
      && (f.consultantId === ctx.sid || (f.ownerId === ctx.sid && !f.jobCardId && ['Satisfaction Call', 'Payment Follow-up'].includes(f.type))))
      .sort((a, b) => dayOf(a.due).localeCompare(dayOf(b.due)));
  }
  const customerCallRow = (ctx, f) => followUpRow(ctx, f, f.orderId ? '#/sales/' + f.orderId : '#/customers/' + f.customerId);

  /** New leads to call first, then follow-ups due today or overdue — and, as on the Leads screen, open leads that
      have no next follow-up date at all (every open lead needs one). */
  function callList(ctx, leads) {
    const fresh = leads.filter(isFresh).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const freshIds = new Set(fresh.map((l) => l.id));
    const when = (l) => (isDay(dayOf(l.nextFollowUp)) ? dayOf(l.nextFollowUp) : '9999');
    const calls = leads.filter((l) => !freshIds.has(l.id) && (!isDay(dayOf(l.nextFollowUp)) || dueBy(l.nextFollowUp, ctx.T)))
      .sort((a, b) => when(a).localeCompare(when(b)));
    return { fresh, calls };
  }

  /** Today's test drives: one recorded for today, and one booked for today (testDrive.plannedFor) until the drive is
      recorded in full (the Leads screen's test-drive checklist). Earliest first. { l, time, car, done } */
  function testDrivesToday(ctx, leads) {
    const out = [], seen = new Set();
    leads.forEach((l) => {
      const t = l.testDrive || {};
      const p = t.plannedFor || {};
      const booked = dayOf(p.date) === ctx.T;
      const done = testDriveDone(l);
      if (dayOf(t.date) !== ctx.T && !(booked && !done)) return;
      out.push({ l, time: t.time || (booked ? p.time : '') || '', car: t.vehicle || '', done });
      seen.add(l.id);
    });
    // Older test-drive records kept apart from the lead.
    ctx.list('testDrives').forEach((t) => {
      const l = NA.get('leads', t.leadId);
      if (!l || seen.has(l.id) || !ctx.mine(l) || dayOf(t.date || t.slot) !== ctx.T) return;
      const time = t.time || (String(t.slot || '').indexOf('T') > 0 ? String(t.slot).slice(11, 16) : '');
      out.push({ l, time, car: t.vehicle || '', done: !!(t.formSigned && t.licenceVerified) || t.done === true || t.status === 'done' });
      seen.add(l.id);
    });
    return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  }

  function quotesEnding(ctx, leads) {
    return leads.map((l) => ({ l, q: l.quotation || (Array.isArray(l.quotes) && l.quotes.length ? l.quotes[l.quotes.length - 1] : null) }))
      .filter((x) => x.q && isDay(dayOf(x.q.validUntil)))
      .map((x) => Object.assign(x, { d: daysUntil(x.q.validUntil) }))
      .filter((x) => x.d <= 3 && x.d >= -7)
      .sort((a, b) => a.d - b.d);
  }

  function licenceItem(x) {
    const { c, d } = x;
    const when = d < 0 ? `Expired ${plural(-d, 'day')} ago` : d === 0 ? 'Expires today' : `Expires in ${plural(d, 'day')}`;
    return { icon: 'file-text', tone: d <= 30 ? 'red' : 'amber', title: c.name || 'Licence', sub: `${when} · ${esc(NA.fmt.date(c.expiry))}${c.authority ? ' · ' + esc(c.authority) : ''}`, href: '#/admin?tab=compliance' };
  }
  const licenceRow = (x) => row(licenceItem(x));

  /* ---------- everyone: waiting for you, your requests, recent activity ---------- */
  function approvalRow(ctx, a, forOthers) {
    const k = NA.APPROVALS[a.type] || { label: a.type, icon: 'info' };
    const h = hoursSince(a.createdAt);
    const late = h >= 24;
    const age = late ? `<span class="tone-red">waiting ${esc(waitText(h))}</span>` : esc(NA.fmt.ago(a.createdAt));
    const meta = `${esc(k.label)} · ${esc(a.requestedBy || '—')} · ${age}${forOthers ? ' · for ' + esc(A.approverText(a)) : ''}`;
    const right = `${num(a.amount) ? `<span class="td-amt">${money(a.amount)}</span>` : ''}`
      + `<button class="btn btn-plain btn-sm" data-appr-act="reject" data-id="${esc(a.id)}">Decline</button>`
      + `<button class="btn ${primary(ctx)} btn-sm" data-appr-act="approve" data-id="${esc(a.id)}">Approve</button>`;
    return row({ icon: k.icon, tone: late ? 'red' : 'amber', title: a.title || k.label, sub: [a.detail ? esc(a.detail) : '', meta], quote: a.reason, href: A.link(a), right, wrap: true });
  }

  function paymentRow(ctx, p) {
    const o = p.orderId ? NA.get('orders', p.orderId) : null;
    const jc = !o && p.jobCardId ? NA.get('jobCards', p.jobCardId) : null;
    const q = /cheque|pay order/i.test(p.method || '') ? 'Has it cleared?' : p.method === 'Cash' ? 'Cash handed over?' : 'In the bank?';
    const what = o ? `${o.code} · ${NA.modelName(o.modelId)}` : jc ? `Service ${jc.code}` : (p.receiptNo || '');
    const right = `<span class="td-amt">${money(p.amount)}</span>`
      + `<button class="btn btn-plain btn-sm" data-act="bounce" data-id="${esc(p.id)}">Not received</button>`
      + `<button class="btn ${primary(ctx)} btn-sm" data-act="clear" data-id="${esc(p.id)}">Confirm</button>`;
    // The same cheque or transfer number on another receipt (the hint the order page shows Accounts too).
    const dup = NA.can('payments.verify') && B.sameRefPayment ? B.sameRefPayment(p) : null;
    return row({ icon: 'wallet', tone: daysSince(p.date) > 3 ? 'red' : '', title: custName(p.customerId) || p.receiptNo || 'Customer payment',
      sub: [`${esc(p.method || 'Payment')}${p.ref ? ' · ' + esc(p.ref) : ''} · ${esc(what)}${dup ? ` · <span class="tone-amber">same reference as ${esc(dup.receiptNo || 'another receipt')}</span>` : ''}`, `Received ${esc(NA.fmt.dateShort(p.date))}${p.receivedBy ? ' by ' + esc(p.receivedBy) : ''} · ${esc(q)}`],
      href: o ? '#/sales/' + o.id : jc && NA.canSee('service') ? '#/service/job/' + jc.id : null, right, wrap: true });
  }

  /** Staff, other than the person who asked, who hold one of the roles that decide this request. */
  const otherDeciders = (a) => (NA.db.staff || []).filter((s) => s.active !== false && s.id !== a.ownerId && (a.approverRoles || []).includes(NA.roleForTitle(s.role)));
  /** Only the Managing Director can decide it: nobody else holds the deciding role (Accounts' only person claimed
      an expense, Admin & HR asked for their own leave). */
  const mdOnly = (a) => { const r = a.approverRoles || []; return r.length > 0 && !r.includes('owner') && !otherDeciders(a).length; };

  function waitingSection(ctx) {
    const forMe = A.pendingForMe();
    let direct = forMe, late = [], others = [];
    if (ctx.role === 'owner') {
      // The MD can decide anything; show what is addressed to them (or what only they can decide), plus what others
      // have left for over a day.
      direct = forMe.filter((a) => !(a.approverRoles || []).length || a.approverRoles.includes('owner') || mdOnly(a));
      const rest = forMe.filter((a) => direct.indexOf(a) < 0);
      late = rest.filter((a) => hoursSince(a.createdAt) >= 24);
      others = rest.filter((a) => late.indexOf(a) < 0);
    }
    // Accounts: customer money to confirm before it counts (cash handed over, cheque cleared, transfer in the bank).
    const pay = ctx.role !== 'owner' && NA.can('payments.verify') ? B.paymentsToVerify() : [];
    const asks = direct.concat(late);
    const rows = asks.slice(0, 5).map((a) => approvalRow(ctx, a, late.indexOf(a) >= 0));
    if (asks.length > 5) rows.push(moreRow(asks.length - 5, '#/approvals', `${plural(asks.length - 5, 'more request')} in Approvals`));
    pay.slice(0, 4).forEach((p) => rows.push(paymentRow(ctx, p)));
    if (pay.length > 4) rows.push(moreRow(pay.length - 4, '#/approvals?tab=money', `${plural(pay.length - 4, 'more payment')} to confirm · ${money(sum(pay.slice(4), (p) => p.amount))}`));
    if (others.length) {
      const who = [...new Set(others.map((a) => A.approverText(a)))].join(', ');
      rows.push(row({ icon: 'inbox', title: `${plural(others.length, 'more request')} for ${who}`, sub: 'They decide these. You can too.', href: '#/approvals' }));
    }
    ctx.waitingCount = asks.length + pay.length;
    ctx.bits.push(ctx.waitingCount ? `${NA.fmt.num(ctx.waitingCount)} waiting for your OK` : '');
    return section({ title: 'Waiting for you', count: ctx.waitingCount, rows, limit: 99,
      link: { href: pay.length && !asks.length ? '#/approvals?tab=money' : '#/approvals', label: 'Open Approvals' } });
  }

  function approverContact(a, md) {
    const titles = md ? ['Managing Director'] : (a.approverRoles || []).map((r) => ROLE_TITLE[r]).filter(Boolean);
    return (NA.db.staff || []).find((s) => s.active !== false && titles.indexOf(s.role) >= 0 && digits(s.phone) && s.id !== NA.myStaffId()) || null;
  }

  function requestsSection(ctx) {
    // Requests the person approved themselves are not news.
    const selfDecided = (a) => a.status !== 'pending' && ((a.decidedById && a.decidedById === a.ownerId) || (!a.decidedById && !!a.decidedBy && a.decidedBy === a.requestedBy));
    const list = A.mine().filter((a) => a.status !== 'cancelled' && !selfDecided(a) && (a.status === 'pending' || daysSince(a.decidedAt || a.updatedAt) <= 7))
      .sort((x, y) => String(y.decidedAt || y.createdAt).localeCompare(String(x.decidedAt || x.createdAt)));
    const rows = list.map((a) => {
      const k = NA.APPROVALS[a.type] || { label: a.type, icon: 'info' };
      if (a.status === 'pending') {
        const h = hoursSince(a.createdAt);
        // Nobody else in the deciding role (you are the only one): the Managing Director decides it.
        const md = mdOnly(a);
        const who = md || A.approverText(a) === 'Managing Director' ? 'the Managing Director' : A.approverText(a);
        const s = h >= 1 ? approverContact(a, md) : null;
        const remind = s ? `<a class="td-round" href="${esc(waHref(s.phone, `Hello ${firstName(s.name)}, could you look at my request in Noor Autos DMS? ${a.title || k.label}`))}" target="_blank" rel="noopener" aria-label="Remind ${esc(s.name)} on WhatsApp" title="Remind on WhatsApp">${NA.icon('whatsapp', 17)}</a>` : '';
        return row({ icon: 'clock', tone: 'amber', title: a.title || k.label, sub: `Waiting for ${esc(who)} · ${esc(waitText(h))}`, href: A.link(a), right: remind });
      }
      const ok = a.status === 'approved';
      return row({ icon: ok ? 'check' : 'x', tone: ok ? 'green' : 'red', title: a.title || k.label,
        sub: `${ok ? 'Approved' : 'Declined'} by ${esc(a.decidedBy || '—')} · ${esc(NA.fmt.ago(a.decidedAt))}`, quote: ok ? '' : a.note, href: A.link(a) });
    });
    const asks = [];
    if (NA.can('leave.request') && ctx.sid) asks.push(`<button class="btn btn-link" data-act="new-leave">Request leave</button>`);
    if (NA.can('expenses.record') && has('newExpense')) asks.push(`<button class="btn btn-link" data-act="new-expense">Claim an expense</button>`);
    return section({ title: 'Your requests', rows, limit: 4, link: { href: '#/approvals?tab=mine' }, empty: 'Nothing waiting on anyone else.',
      tail: asks.length ? `<div class="td-foot-acts">${asks.join('')}</div>` : '' });
  }

  function activitySection(ctx) {
    // The company-wide feed carries purchase prices and supplier payments, so only people who may see costs get it.
    // The Service Manager sees the workshop's entries; everyone else their own.
    const wide = ['owner', 'sales_manager', 'accounts'].includes(ctx.role);
    const own = (x) => !!ctx.sid && (x.byStaffId === ctx.sid || x.ownerId === ctx.sid);
    const workshop = (x) => ctx.role === 'service_manager' && /^#\/service(?:[/?]|$)/.test(String(x.link || ''));
    const items = ctx.list('activity').filter((x) => wide || own(x) || workshop(x)).slice(0, 6);
    const dot = { money: 'dot-green', success: 'dot-green', warn: 'dot-amber' };
    const rows = items.map((x) => {
      const href = gate(x.link);
      const inner = `<span class="dot ${dot[x.kind] || ''}"></span>
        <div class="td-main"><span>${esc(x.text)}</span><small>${esc(NA.fmt.ago(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</small></div>`;
      return href ? `<a class="gl-row td-feed" href="${esc(href)}">${inner}</a>` : `<div class="gl-row td-feed">${inner}</div>`;
    });
    return section({ title: 'Recent activity', rows, count: false, limit: 6 });
  }

  /* ---------- shared cards: stock by model, the live strip, the 6-month chart ---------- */
  function stockSection(ctx) {
    const vs = ctx.list('vehicles');
    const rows = NA.db.models.filter((m) => m.active !== false).map((m) => {
      const mv = vs.filter((v) => v.modelId === m.id);
      const avail = mv.filter((v) => v.status === 'available').length;
      const sold = mv.filter((v) => v.status === 'allocated').length;
      const coming = mv.filter((v) => ['in_transit', 'pdi'].includes(v.status)).length;
      const sub = [coming ? `${coming} coming` : '', sold ? `${sold} sold, not delivered` : ''].filter(Boolean).join(' · ') || (avail ? 'Ready to sell' : 'None in stock');
      return row({ lead: '', title: NA.modelName(m.id), sub: esc(sub), href: '#/inventory?model=' + encodeURIComponent(m.id), right: `<span class="td-amt${avail ? '' : ' muted'}">${avail}</span>` });
    });
    return section({ title: 'Cars in stock', rows, count: false, limit: 8, link: { href: '#/inventory' } });
  }

  /** The live process strip. Each number is exactly the list it opens: orders are filed by where they really are
      (the Orders screen's rule), cars as the Vehicles screen files them. */
  function stripSection(ctx, opts) {
    const L = ctx.list('leads'), V = ctx.list('vehicles');
    const lc = (k) => L.filter((l) => l.stage === k).length;
    const at = new Map();
    ctx.openOrders.forEach((o) => { const k = ctx.stageOf(o); at.set(k, (at.get(k) || 0) + 1); });
    const oc = (k) => at.get(k) || 0;
    const delivered = ctx.list('orders').filter((o) => o.stage === 'delivered' && ym(o.deliveredAt) === ctx.M).length;
    const orders = [
      { label: 'Booked', n: oc('booking'), href: '#/sales?stage=booking' },
      { label: 'Paying', n: oc('payment'), href: '#/sales?stage=payment' },
      { label: 'Ready for VIN', n: oc('vin'), href: '#/sales?stage=vin', hot: oc('vin') > 0 },
      { label: 'Registration', n: oc('brta'), href: '#/sales?stage=brta' },
      { label: 'To hand over', n: oc('delivery'), href: '#/sales?stage=delivery', hot: oc('delivery') > 0 },
      { label: 'Delivered in ' + monthName(ctx.M), n: delivered, href: '#/sales?stage=delivered' },
    ];
    let body;
    if (opts.leads) {
      body = strip('Leads', OPEN_LEAD.map((k) => ({ label: leadWord(k), n: lc(k), href: '#/leads?stage=' + k, hot: k === 'new' && L.some(isFresh) })))
        + strip('Orders', orders);
    } else {
      body = strip('Sales', [{ label: 'Open leads', n: ctx.openLeads.length, href: '#/leads' }].concat(orders));
    }
    if (opts.supply) {
      let demand = [];
      try { demand = B.demandByModel(); } catch (e) { demand = []; }
      const std = ctx.list('purchaseOrders').filter((p) => p.type !== 'emergency');
      const pc = (k) => std.filter((p) => ctx.poStage(p) === k).length;    // Purchasing's ?stage= lists use the same rule
      const reorder = demand.filter((d) => d.suggested > 0).length;
      const arriving = V.filter((v) => v.status === 'in_transit' || toInspect(v)).length;
      body += strip('Buying', [
        { label: 'Models to reorder', n: reorder, href: '#/procurement?tab=demand', hot: reorder > 0 },
        { label: 'Ordered from BYD', n: pc('po'), href: '#/procurement?tab=pos&stage=po' },
        { label: 'Allocated by BYD', n: pc('allocated'), href: '#/procurement?tab=pos&stage=allocated' },
        { label: 'Paying the balance', n: pc('releasing'), href: '#/procurement?tab=pos&stage=releasing' },
        { label: 'Arriving', n: arriving, href: '#/inventory?tab=arriving', hot: V.some(toInspect) },
        { label: 'In stock', n: V.filter((v) => v.status === 'available').length, href: '#/inventory' },
      ]);
    }
    const how = gate('#/process');
    return card({ title: 'Right now', body, cls: 'td-strips',
      side: how ? `<a class="btn-link" href="${how}">How we work</a>` : '',
      foot: 'A car gets its VIN only after Accounts confirms 100% of the money.' });
  }

  let chartMode = 'units';
  function chartSection(ctx) {
    const first = ctx.M + '-01';
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(NA.addMonths(first, -i));
    const inv = ctx.list('invoices').filter((x) => x.kind === 'vehicle');
    const delivered = ctx.list('orders').filter((o) => o.stage === 'delivered');
    const data = months.map((m, i) => {
      const k = ym(m);
      const revenue = sum(inv.filter((x) => ym(x.date) === k), exVat);
      const units = delivered.filter((o) => ym(o.deliveredAt) === k).length;
      // This month in the strongest neutral, earlier months in grey: colour stays for meaning only.
      return { label: new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' }), value: chartMode === 'revenue' ? revenue : units, tone: i === 5 ? 'dark' : 'gray', revenue, units };
    });
    const totalUnits = sum(data, (d) => d.units), totalRev = sum(data, (d) => d.revenue);
    const seg = `<div class="seg"><button class="${chartMode === 'units' ? 'active' : ''}" data-act="chart" data-mode="units">Cars</button><button class="${chartMode === 'revenue' ? 'active' : ''}" data-act="chart" data-mode="revenue">Sales</button></div>`;
    return card({ title: 'Last 6 months', side: seg, cls: 'td-chart',
      body: totalUnits || totalRev ? NA.ui.bars(data, { height: 150, money: chartMode === 'revenue' }) : NA.ui.empty('No deliveries in the last 6 months yet', 'chart'),
      foot: `${plural(totalUnits, 'car')} delivered · ${short(totalRev)} in car sales before VAT` });
  }

  /* ---------- Sales Consultant ---------- */
  function consultantView(ctx) {
    const leads = ctx.openLeads.filter(ctx.mine);
    const { fresh, calls } = callList(ctx, leads);
    const fus = customerCalls(ctx);
    const tds = testDrivesToday(ctx, leads);
    const quotes = quotesEnding(ctx, leads);
    // Open orders, and cars handed over before they were paid for in full.
    const orders = ctx.list('orders').filter(ctx.mine).map((o) => ({ o, need: orderNeed(ctx, o) })).filter((x) => x.need).sort((a, b) => a.need.sev - b.need.sev);
    const callRows = calls.map((l) => leadRow(ctx, l, dueText(l.nextFollowUp)));
    const fuRows = fus.map((f) => customerCallRow(ctx, f));
    const allCalls = callRows.length + fuRows.length;
    const overdue = calls.filter((l) => daysSince(l.nextFollowUp) > 0).length + fus.filter((f) => daysSince(f.due) > 0).length;
    const urgent = orders.filter((x) => x.need.sev <= 1).length;

    const tdRows = tds.map(({ l, time, car, done }) => row({ lead: NA.ui.avatar(l.name, 34), title: l.name, href: '#/leads/' + l.id, right: contactButtons(l.mobile, l.name),
      sub: [esc(time), esc(car || NA.modelName(l.modelId)), done ? '<span class="tone-green">Done</span>' : 'Check the licence and get the form signed'].filter(Boolean).join(' · ') }));
    const quoteRows = quotes.map(({ l, q, d }) => {
      const when = d < 0 ? `<span class="tone-red">Expired ${plural(-d, 'day')} ago — renew it</span>` : `<span class="tone-amber">${d === 0 ? 'Ends today' : 'Ends in ' + plural(d, 'day')}</span>`;
      return row({ lead: NA.ui.avatar(l.name, 34), title: l.name, href: '#/leads/' + l.id, right: contactButtons(l.mobile, l.name),
        sub: `${when} · ${esc(NA.modelName(l.modelId))} · ${money(num(q.price) - num(q.discount))}` });
    });

    return {
      stats: [
        { label: 'Calls to make', value: NA.fmt.num(allCalls), sub: overdue ? `<span class="tone-red">${NA.fmt.num(overdue)} overdue</span>` : 'All on time', href: '#/leads?show=due' },
        { label: 'New leads to call', value: NA.fmt.num(fresh.length), sub: fresh.length ? 'Not contacted yet' : 'All contacted', href: '#/leads?stage=new' },
        { label: 'Test drives today', value: NA.fmt.num(tds.length), sub: tds.length ? `${NA.fmt.num(tds.filter((x) => x.done).length)} done` : 'None booked', href: '#/leads?show=drives' },
        { label: 'Orders to act on', value: NA.fmt.num(orders.length), sub: urgent ? `<span class="tone-red">${NA.fmt.num(urgent)} ${urgent === 1 ? 'needs' : 'need'} you now</span>` : 'Nothing urgent', href: '#/sales' },
      ],
      main: [
        section({ title: 'Calls to make', rows: callRows, link: { href: '#/leads?show=due' } }),
        section({ title: 'Customers to call', rows: fuRows }),
        section({ title: 'New leads to call', rows: fresh.map((l) => leadRow(ctx, l, slaText(ctx, l))), link: { href: '#/leads?stage=new' },
          foot: `Call every new lead within ${plural(num(ctx.pol.firstContactHours) || 24, 'hour')}.` }),
        section({ title: 'Test drives today', rows: tdRows, link: { href: '#/leads?show=drives' } }),
        section({ title: 'Quotes ending soon', rows: quoteRows, link: { href: '#/leads?stage=opportunity' } }),
        section({ title: 'Your orders', rows: orders.map((x) => orderRow(ctx, x.o, x.need)), link: { href: '#/sales' } }),
      ],
      side: [monthCard(ctx)],
      bits: [allCalls ? plural(allCalls, 'call') + ' to make' : '', fresh.length ? plural(fresh.length, 'new lead') + ' to call' : ''],
      actions: [
        NA.can('leads.create') && { label: 'New lead', icon: 'user-plus', act: 'new-lead' },
        NA.can('orders.create') && { label: 'New order', icon: 'receipt', act: 'new-order' },
      ],
    };
  }

  function monthCard(ctx) {
    const mine = ctx.list('orders').filter(ctx.mine);
    const delivered = mine.filter((o) => o.stage === 'delivered' && ym(o.deliveredAt) === ctx.M).length;
    const booked = mine.filter((o) => o.stage !== 'cancelled' && ym(bookDate(o)) === ctx.M).length;
    const ids = new Set(mine.map((o) => o.id));
    const collected = sum(ctx.list('payments').filter((p) => ids.has(p.orderId) && isLive(p) && B.paymentCleared(p) && num(p.amount) > 0 && ym(p.date) === ctx.M), (p) => p.amount);
    const waiting = sum(ctx.list('payments').filter((p) => ids.has(p.orderId) && B.paymentPending(p)), (p) => p.amount);
    const t = ctx.target(ctx.sid);
    const units = t ? num(t.units) : 0;
    const left = Math.max(0, units - delivered);
    const link = (h) => gate(h) || '#/dashboard';
    const body = `<a class="td-hero" href="${link('#/sales?stage=delivered')}"><span class="td-label">Cars delivered</span>
        <span class="td-big">${NA.fmt.num(delivered)}${units ? `<small>of ${NA.fmt.num(units)}</small>` : ''}</span></a>
      ${units ? NA.ui.progress(delivered / units, delivered >= units ? 'green' : 'brand') : ''}
      <p class="td-note">${units ? (left ? `${plural(left, 'more car')} to reach your target.` : 'Target reached.') : `No target set for ${esc(monthName(ctx.M))} yet.`}</p>
      <div class="td-mini">
        <a href="${link('#/sales')}"><b>${NA.fmt.num(booked)}</b><span>Booked</span></a>
        <a href="${link('#/sales')}"><b>${esc(short(collected))}</b><span>Collected${waiting ? ' · ' + esc(short(waiting)) + ' waiting for Accounts' : ''}</span></a>
      </div>`;
    return card({ title: 'My month', side: `<span class="muted small">${esc(monthName(ctx.M))}</span>`, body, cls: 'td-card' });
  }

  /* ---------- Sales Manager ---------- */
  function managerView(ctx) {
    const T = ctx.T;
    const all = ctx.list('orders');
    const booked = all.filter((o) => o.stage !== 'cancelled' && ym(bookDate(o)) === ctx.M);
    const delivered = all.filter((o) => o.stage === 'delivered' && ym(o.deliveredAt) === ctx.M);
    const teamTarget = sum(ctx.list('targets').filter((t) => t.month === ctx.M), (t) => t.units);
    const newToday = ctx.list('leads').filter((l) => dayOf(l.createdAt) === T).length;
    const sc = stockCheck(ctx);
    const vinReady = sc.filter((x) => x.ready);
    const handOver = ctx.openOrders.filter(ctx.readyToHandOver);
    const hours = num(ctx.pol.firstContactHours) || 24;

    const needs = [];
    const add = (sev, r) => needs.push({ sev, html: row(r) });
    const listed = new Set();     // orders already on this list (the manager's own "Your orders" leaves them out)
    // A few leads are listed by name; more than that become one row that opens the filtered Leads list.
    const unassigned = ctx.openLeads.filter((l) => !l.consultantId);
    if (unassigned.length > 3) add(1, { icon: 'users', tone: 'amber', title: `${plural(unassigned.length, 'lead')} with no consultant`, sub: 'Give each one to a consultant so someone calls them', href: '#/leads?show=unassigned' });
    else unassigned.forEach((l) => add(1, { lead: NA.ui.avatar(l.name, 34), title: l.name, href: '#/leads/' + l.id,
      sub: `No consultant yet · ${esc(NA.modelName(l.modelId))}${l.source ? ' · ' + esc(l.source) : ''} · ${esc(NA.fmt.ago(l.createdAt))}` }));
    // Not called within the limit, by the Leads screen's rule (its "Not contacted" list is what the summary row opens).
    const cold = ctx.openLeads.filter((l) => l.consultantId && l.consultantId !== ctx.sid && notContacted(l) > 0);
    if (cold.length > 3) {
      const by = new Map();
      cold.forEach((l) => by.set(l.consultantId, (by.get(l.consultantId) || 0) + 1));
      add(0, { icon: 'clock', tone: 'red', title: `${plural(cold.length, 'lead')} not called within ${plural(hours, 'hour')}`, href: '#/leads?show=cold',
        sub: esc([...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${NA.staffName(id)} ${n}`).join(' · ')) });
    } else cold.forEach((l) => needs.push({ sev: 0, html: leadRow(ctx, l, slaText(ctx, l), { who: true }) }));
    // Unhappy customers: a low rating on a follow-up call asks a manager to call back.
    ctx.list('followUps').filter((f) => f.status !== 'done' && (f.type === 'Manager call-back' || f.escalated) && (!isDay(dayOf(f.due)) || dueBy(f.due, T)))
      .forEach((f) => {
        const c = NA.customer(f.customerId) || {};
        const done = doneButton(f);
        add(0, { lead: NA.ui.avatar(c.name || '?', 34), title: `Call back ${c.name || NA.customerName(f.customerId)}`, href: '#/customers/' + f.customerId,
          sub: [dueText(f.due), esc(f.notes || 'Unhappy with the last call')].join(' · '), right: contactButtons(c.mobile, c.name || '') + done, wrap: !!done });
      });
    vinReady.forEach((x) => {
      const o = x.o;
      listed.add(o.id);
      const why = ctx.fullyPaid(o) ? 'Paid in full' : 'Approved before full payment';
      const sub = `${esc(NA.customerName(o.customerId))} · ${esc(o.code)} · ${esc(NA.modelName(o.modelId))}${o.color ? ' · ' + esc(o.color) : ''}`;
      if (x.hasStock) add(1, { icon: 'key', tone: 'green', title: `${why} — give the VIN`, sub, href: '#/sales/' + o.id,
        right: NA.can('vin.assign') ? `<a class="btn btn-ghost btn-sm" href="#/sales/${esc(o.id)}">Give VIN</a>` : '' });
      else if (x.onTheWay) add(3, { icon: 'truck', title: `${why} — a car is on the way`, sub, href: '#/sales/' + o.id });
      else add(0, { icon: 'car', tone: 'red', title: `${why} — no car in stock`, href: '#/sales/' + o.id,
        sub: sub + (x.emergency || o.emergencyRequest ? ' · Purchasing is finding one' : ' · ask Purchasing for an emergency car') });
    });
    handOver.forEach((o) => { listed.add(o.id); add(1, { icon: 'car', tone: 'green', title: 'Ready to hand over', href: '#/sales/' + o.id, sub: `${esc(NA.customerName(o.customerId))} · ${esc(o.code)} · ${esc(NA.staffName(o.consultantId))}` }); });
    ctx.openOrders.forEach((o) => {
      const loan = bankStuck(o);
      if (loan && loan.days > 7) {
        listed.add(o.id);
        add(2, { icon: 'bank', tone: 'amber', title: `Bank loan stuck at “${loan.step.label}” for ${plural(loan.days, 'day')}`, href: '#/sales/' + o.id,
          sub: `${esc(o.code)} · ${esc(NA.customerName(o.customerId))} · ${esc((o.bank && o.bank.bankName) || 'Bank')}` });
      }
      const reg = brtaWait(o);
      if (reg && reg.applied && reg.days > 10) {
        listed.add(o.id);
        add(2, { icon: 'id-card', tone: 'amber', title: `Registration waiting ${plural(reg.days, 'day')}`, href: '#/sales/' + o.id,
          sub: `${esc(o.code)} · ${esc(NA.customerName(o.customerId))} · ${esc(NA.staffName(o.consultantId))}` });
      }
    });
    needs.sort((a, b) => a.sev - b.sev);

    // The Leads screen's list: hot leads (lost after a test drive or a quote) in the last 7 days.
    const lostOn = (l) => dayOf(l.lostAt || l.stageAt);
    const lost = ctx.list('leads').filter((l) => l.stage === 'lost' && ['testdrive', 'opportunity'].includes(l.lostFrom) && isDay(lostOn(l)) && daysSince(lostOn(l)) <= 7)
      .sort((a, b) => lostOn(b).localeCompare(lostOn(a)));
    const lostRows = lost.map((l) => row({ lead: NA.ui.avatar(l.name, 34), title: l.name, href: '#/leads/' + l.id, quote: l.lostReason || '',
      sub: `Lost${l.lostFrom ? ' at ' + esc(leadWord(l.lostFrom)) : ''} · ${esc(NA.modelName(l.modelId))} · ${esc(l.consultantId ? NA.staffName(l.consultantId) : 'No consultant')}${l.lostTo ? ' · went to ' + esc(l.lostTo) : ''}` }));

    // The manager also sells: their own calls, customers to call (call-backs are on the list above) and their own
    // orders that need something and are not on the list above already.
    const own = callList(ctx, ctx.openLeads.filter((l) => !!l.consultantId && ctx.mine(l)));
    const ownRows = own.calls.map((l) => leadRow(ctx, l, dueText(l.nextFollowUp))).concat(own.fresh.map((l) => leadRow(ctx, l, slaText(ctx, l))));
    const ownCalls = customerCalls(ctx, managerCall).map((f) => customerCallRow(ctx, f));
    const ownOrders = all.filter((o) => !!ctx.sid && o.consultantId === ctx.sid && !listed.has(o.id)).map((o) => ({ o, need: orderNeed(ctx, o) }))
      .filter((x) => x.need).sort((a, b) => a.need.sev - b.need.sev).map((x) => orderRow(ctx, x.o, x.need));
    const teamOverdue = ctx.openLeads.filter((l) => daysSince(l.nextFollowUp) > 0 && isDay(dayOf(l.nextFollowUp))).length;

    return {
      stats: [
        { label: 'Open leads', value: NA.fmt.num(ctx.openLeads.length), sub: newToday ? `+${NA.fmt.num(newToday)} today` : (teamOverdue ? `<span class="tone-red">${NA.fmt.num(teamOverdue)} follow-ups overdue</span>` : 'No new leads today'), href: '#/leads' },
        { label: 'Booked in ' + monthName(ctx.M), value: NA.fmt.num(booked.length), sub: esc(short(sum(booked, B.orderNet))) + ' in orders', href: '#/sales' },
        { label: 'Delivered in ' + monthName(ctx.M), value: NA.fmt.num(delivered.length) + (teamTarget ? `<small>of ${NA.fmt.num(teamTarget)}</small>` : ''), sub: teamTarget ? NA.fmt.pct(delivered.length / teamTarget) + ' of the team target' : 'No team target set', href: '#/sales?stage=delivered' },
        { label: 'Ready for VIN', value: NA.fmt.num(vinReady.length), sub: `${NA.fmt.num(handOver.length)} ready to hand over`, href: '#/sales?stage=vin' },
      ],
      main: [
        section({ title: 'Needs a manager', rows: needs.map((x) => x.html), limit: 8 }),
        stripSection(ctx, { leads: true }),
        section({ title: 'Lost this week', rows: lostRows, link: { href: '#/leads?stage=lost' } }),
        section({ title: 'Your calls', rows: ownRows, link: { href: '#/leads' } }),
        section({ title: 'Customers to call', rows: ownCalls }),
        section({ title: 'Your orders', rows: ownOrders, link: { href: '#/sales' } }),
        chartSection(ctx),
      ],
      side: [leaderboard(ctx), stockSection(ctx)],
      bits: [needs.length ? plural(needs.length, 'thing') + ' for a manager' : ''],
      actions: [
        NA.can('leads.create') && { label: 'New lead', icon: 'user-plus', act: 'new-lead' },
        NA.can('orders.create') && { label: 'New order', icon: 'receipt', act: 'new-order' },
      ],
    };
  }

  function leaderboard(ctx) {
    const orders = ctx.list('orders');
    const people = NA.consultants().map((s) => {
      const own = orders.filter((o) => ctx.ownerOf(o) === s.id);
      const t = ctx.target(s.id);
      return {
        s, units: t ? num(t.units) : 0,
        delivered: own.filter((o) => o.stage === 'delivered' && ym(o.deliveredAt) === ctx.M).length,
        booked: own.filter((o) => o.stage !== 'cancelled' && ym(bookDate(o)) === ctx.M).length,
      };
    }).filter((p) => p.s.role === 'Sales Consultant' || p.delivered || p.booked || p.units)
      .sort((a, b) => b.delivered - a.delivered || b.booked - a.booked || String(a.s.name).localeCompare(String(b.s.name)));
    const team = '#/reports?r=team&p=month';     // Reports → Consultants, this month
    const rows = people.map((p) => row({ lead: NA.ui.avatar(p.s.name, 34), title: p.s.name, href: team,
      sub: `${plural(p.booked, 'booking')} this month${p.units ? '' : ' · no target'}`,
      extra: p.units ? `<div class="td-bar">${NA.ui.progress(p.delivered / p.units, p.delivered >= p.units ? 'green' : 'brand')}</div>` : '',
      right: `<span class="td-amt">${NA.fmt.num(p.delivered)}${p.units ? `<small>of ${NA.fmt.num(p.units)}</small>` : ''}</span>` }));
    // A consultant without a target for the month: the manager sets the targets from here (Reports' targets sheet).
    const missing = people.filter((p) => !p.units && p.s.role === 'Sales Consultant').length;
    const setBtn = missing && NA.can('targets.set')
      ? (has('setTargets') ? `<button class="btn btn-link" data-act="targets" data-month="${esc(ctx.M)}">Set targets for ${esc(monthName(ctx.M))}</button>`
        : gate(team) ? `<a class="btn btn-link" href="${esc(team)}">Set targets for ${esc(monthName(ctx.M))}</a>` : '')
      : '';
    return section({ title: 'Delivered by consultant', rows, count: false, limit: 8, empty: 'No consultants yet.', link: { href: team, label: 'Reports' },
      tail: setBtn ? `<div class="td-foot-acts">${setBtn}</div>` : '' });
  }

  /* ---------- Managing Director ---------- */
  function ownerView(ctx) {
    const orders = ctx.list('orders');
    const booked = orders.filter((o) => o.stage !== 'cancelled' && ym(bookDate(o)) === ctx.M);
    const delivered = orders.filter((o) => o.stage === 'delivered' && ym(o.deliveredAt) === ctx.M);
    const revenue = sum(ctx.list('invoices').filter((i) => i.kind === 'vehicle' && ym(i.date) === ctx.M), exVat);
    const cash = moneyThisMonth(ctx);
    const waitingMoney = B.paymentsToVerify();
    const waitSum = sum(waitingMoney, (p) => p.amount);
    // Stock: the unsold cars we hold, valued at what each cost us (Reports' "How old is our stock?"). Sold cars waiting
    // to be handed over are not stock; cars on the way are only counted as coming.
    const vehicles = ctx.list('vehicles');
    const stock = vehicles.filter((v) => HELD.includes(v.status));
    const stockValue = sum(stock, (v) => num(v.landedCost) || num(v.cost) || num(v.purchaseCost) || num((NA.model(v.modelId) || {}).cost));
    const coming = vehicles.filter((v) => v.status === 'in_transit').length;
    const sup = supplierMoney(ctx);
    const attention = attentionRows(ctx, waitingMoney);
    const urgent = attention.filter((x) => x.sev === 0).length;
    const canCost = NA.can('costs.view');
    return {
      stats: [
        { label: 'Booked in ' + monthName(ctx.M), value: NA.fmt.num(booked.length), sub: esc(short(sum(booked, B.orderNet))) + ' in orders', href: '#/sales' },
        { label: 'Delivered in ' + monthName(ctx.M), value: NA.fmt.num(delivered.length), sub: esc(short(revenue)) + ' sales before VAT', href: '#/sales?stage=delivered' },
        { label: 'Money in this month', value: esc(short(cash.in)), href: '#/finance?tab=money',
          sub: [cash.out ? esc(short(cash.out)) + ' paid out' : '', waitingMoney.length ? esc(short(waitSum)) + ' waiting for Accounts' : ''].filter(Boolean).join(' · ') || 'Confirmed money only' },
        canCost
          ? { label: 'Stock value', value: esc(short(stockValue)), sub: `${plural(stock.length, 'car')} · ${NA.fmt.num(coming)} coming`, href: gate('#/reports?r=stock') || '#/inventory' }
          : { label: 'Cars in stock', value: NA.fmt.num(stock.length), sub: `${NA.fmt.num(coming)} coming`, href: '#/inventory' },
        { label: 'Owed to suppliers', value: esc(short(sup.owed)), sub: sup.due ? `${esc(short(sup.due))} due now` : 'Nothing due now', href: '#/finance?tab=vendors' },
      ],
      main: [
        section({ title: 'Needs attention', rows: attention.map((x) => x.html), limit: 6 }),
        stripSection(ctx, { supply: true }),
        chartSection(ctx),
      ],
      side: [stockSection(ctx)],
      bits: [urgent ? plural(urgent, 'urgent thing') : ''],
      actions: [gate('#/reports') && { label: 'Reports', icon: 'pie', href: '#/reports' }],
    };
  }

  /** The MD's attention list. Three or more of a kind become one summary row, so it stays short. */
  function attentionRows(ctx, waitingMoney) {
    const items = [];
    const add = (sev, r) => items.push({ sev, html: row(r) });
    const group = (list, sev, single, summary) => {
      if (!list.length) return;
      if (list.length <= 2) list.forEach((x) => add(sev, single(x)));
      else add(sev, summary(list));
    };
    group(refundsDue(ctx), 0,
      (o) => ({ icon: 'undo', tone: 'red', title: `Refund ${money(o.refund.amount)} to ${NA.customerName(o.customerId)}`, sub: `${esc(o.code)} · Accounts pays it`, href: '#/sales/' + o.id }),
      (l) => ({ icon: 'undo', tone: 'red', title: `${plural(l.length, 'refund')} to pay · ${money(sum(l, (o) => o.refund.amount))}`, sub: 'Approved cancellations waiting for Accounts', href: '#/finance?tab=ledger&view=refunds' }));
    group(openBounces(ctx), 0,
      (p) => ({ icon: 'alert', tone: 'red', title: `${money(p.amount)} ${/cheque|pay order/i.test(p.method || '') ? 'cheque bounced' : 'not received'}`, sub: `${esc(NA.customerName(p.customerId))} · ${esc(p.receiptNo || '')} · ${esc(NA.fmt.ago(p.verifiedAt || p.date))}`, href: p.orderId ? '#/sales/' + p.orderId : '#/finance?tab=money' }),
      (l) => ({ icon: 'alert', tone: 'red', title: `${plural(l.length, 'payment')} bounced in the last 30 days`, sub: money(sum(l, (p) => p.amount)) + ' to collect again', href: '#/finance?tab=money&view=cheques' }));
    const noCar = stockCheck(ctx).filter((x) => x.ready && !x.hasStock && !x.onTheWay);
    group(noCar, 0,
      (x) => ({ icon: 'car', tone: 'red', title: `${ctx.fullyPaid(x.o) ? 'Paid in full' : 'Approved before full payment'} — no ${NA.modelName(x.o.modelId)} in stock`, href: '#/sales/' + x.o.id,
        sub: `${esc(x.o.code)} · ${esc(NA.customerName(x.o.customerId))}${x.o.color ? ' · ' + esc(x.o.color) : ''}${x.emergency ? ' · emergency purchase started' : x.o.emergencyRequest ? ' · Purchasing has been asked' : ''}`,
        right: !x.emergency && NA.can('po.manage') && has('newEmergencyPO') ? `<button class="btn btn-ghost btn-sm" data-act="emergency" data-order="${esc(x.o.id)}" data-model="${esc(x.o.modelId)}" data-color="${esc(x.o.color || '')}">Emergency purchase</button>` : '',
        wrap: true }),
      (l) => ({ icon: 'car', tone: 'red', title: `${plural(l.length, 'paid order')} with no car in stock`, sub: 'Customers have paid and are waiting for a car', href: '#/sales?stage=vin' }));
    const late = owing(ctx).filter((x) => x.days > 30);
    if (late.length) add(1, { icon: 'wallet', tone: 'amber', title: `${plural(late.length, 'customer')} ${late.length === 1 ? 'owes' : 'owe'} ${money(sum(late, (x) => x.bal))} after delivery`, sub: `Oldest ${plural(late[0].days, 'day')} · ${esc(NA.customerName(late[0].o.customerId))}`, href: '#/finance?tab=ledger' });
    const bills = serviceOwing(ctx).filter((x) => x.days > 7);
    if (bills.length) add(2, { icon: 'wrench', tone: 'amber', title: `${plural(bills.length, 'service bill')} not fully paid · ${money(sum(bills, (x) => x.due))}`, sub: `Oldest ${plural(bills[0].days, 'day')} · ${esc(NA.customerName(bills[0].i.customerId))}`, href: '#/finance?tab=ledger' });
    const hold = ctx.list('vehicles').filter(onHold);
    group(hold, 1,
      (v) => ({ icon: 'alert', tone: 'amber', title: `${NA.modelName(v.modelId)} on hold`, sub: `${esc(carProblem(v) || 'No reason given')}${v.vin ? ' · ' + esc(v.vin) : ''}`, href: '#/inventory/' + v.id }),
      (l) => ({ icon: 'alert', tone: 'amber', title: `${plural(l.length, 'car')} on hold`, sub: 'Damaged or returned — not for sale until sorted', href: '#/inventory?tab=hold' }));
    const pdi = ctx.list('vehicles').filter((v) => toInspect(v) && daysSince(v.arrivedAt) > 2);
    if (pdi.length) add(1, { icon: 'pdi', tone: 'amber', title: `${plural(pdi.length, 'car')} waiting for PDI over 2 days`, sub: esc(pdi.slice(0, 3).map((v) => NA.modelName(v.modelId)).join(', ')), href: '#/inventory?tab=arriving' });
    group(ctx.openOrders.filter((o) => o.emergencyRequest && !hasEmergencyPO(ctx, o)), 1,
      (o) => ({ icon: 'bolt', tone: 'amber', title: `Emergency car asked for ${o.code}`, sub: `${esc(NA.customerName(o.customerId))} · ${esc(NA.modelName(o.modelId))} · Purchasing has not started it`, href: '#/sales/' + o.id }),
      (l) => ({ icon: 'bolt', tone: 'amber', title: `${plural(l.length, 'emergency car')} asked for`, sub: 'Purchasing has not started them yet', href: '#/procurement?tab=emergency' }));
    group(ctx.list('followUps').filter((f) => f.status !== 'done' && (f.type === 'Manager call-back' || f.escalated)), 2,
      (f) => { const c = NA.customer(f.customerId) || {}; return { lead: NA.ui.avatar(c.name || '?', 34), title: `Unhappy customer: ${c.name || NA.customerName(f.customerId)}`, sub: esc(f.notes || 'Asked for a call back'), href: '#/customers/' + f.customerId, right: contactButtons(c.mobile, c.name || '') }; },
      (l) => ({ icon: 'users', tone: 'amber', title: `${plural(l.length, 'unhappy customer')} to call back`, sub: 'Low ratings on follow-up calls — the Sales Manager calls them', href: '#/customers' }));
    const stuck = ctx.openOrders.map((o) => ({ o, s: bankStuck(o) })).filter((x) => x.s && x.s.days > 7);
    group(stuck, 2,
      (x) => ({ icon: 'bank', tone: 'amber', title: `Bank loan stuck at “${x.s.step.label}” for ${plural(x.s.days, 'day')}`, sub: `${esc(x.o.code)} · ${esc(NA.customerName(x.o.customerId))}`, href: '#/sales/' + x.o.id }),
      (l) => ({ icon: 'bank', tone: 'amber', title: `${plural(l.length, 'bank loan')} stuck for over a week`, sub: 'Chase the banks', href: '#/sales' }));
    const lic = licences(ctx);
    group(lic, lic.length && lic[0].d <= 30 ? 1 : 2, licenceItem,
      (l) => ({ icon: 'file-text', tone: l[0].d <= 30 ? 'red' : 'amber', title: `${plural(l.length, 'licence')} to renew`, sub: esc(l.map((x) => x.c.name).slice(0, 3).join(', ')), href: '#/admin?tab=compliance' }));
    if (waitingMoney.length) add(2, { icon: 'clock', title: `${plural(waitingMoney.length, 'payment')} waiting for Accounts`, sub: money(sum(waitingMoney, (p) => p.amount)) + ' not counted until confirmed', href: '#/approvals?tab=money' });
    const old = ctx.list('vehicles').filter((v) => v.status === 'available' && daysSince(v.arrivedAt) > 90);
    if (old.length) add(3, { icon: 'clock', title: `${plural(old.length, 'car')} in stock over 90 days`, sub: esc(old.slice(0, 3).map((v) => NA.modelName(v.modelId)).join(', ')), href: '#/inventory' });
    const low = partsRow(ctx, 'to reorder');
    if (low) items.push({ sev: 3, html: low });
    return items.sort((a, b) => a.sev - b.sev);
  }

  /* ---------- Accounts ---------- */
  function accountsView(ctx) {
    const refunds = refundsDue(ctx);
    const sup = supplierMoney(ctx);
    const money2confirm = NA.can('payments.verify') ? B.paymentsToVerify() : [];
    const expenses = ctx.list('expenses').filter((e) => e.status === 'approved');
    const owe = owing(ctx);
    const bills = serviceOwing(ctx);
    const bounced = openBounces(ctx);
    const pay = payrollRuns(ctx);
    const salaries = [pay.prev, pay.cur].filter((r) => r.st === 'approved');
    const payBits = refunds.length + sup.rows.length + expenses.length + salaries.length;
    const canPay = NA.can('finance.manage');
    const refundBtn = (o) => (canPay && has('payRefund') ? `<button class="btn btn-ghost btn-sm" data-act="refund" data-id="${esc(o.id)}">Pay refund</button>` : '');
    const expenseBtn = (e) => (canPay && has('openExpense') ? `<button class="btn btn-ghost btn-sm" data-act="expense" data-id="${esc(e.id)}">Pay</button>` : '');
    // Salaries: the payment sheet from People → Payroll, opened here (it books the salaries for Accounts).
    const payrollBtn = canPay && has('payPayroll');
    const claimant = (e) => e.requestedBy || (e.ownerId ? NA.staffName(e.ownerId) : '') || '—';
    // Owed in confirmed money, as in Accounts' list; money handed in but not confirmed yet is shown beside it.
    const waitingNote = (n) => (n > 0.5 ? ` · ${money(n)} waiting for Accounts` : '');
    const oweRows = owe.map((x) => ({ days: x.days, html: row({ icon: 'wallet', tone: x.days > 30 ? 'red' : 'amber', title: `${NA.customerName(x.o.customerId)} owes ${money(x.bal)}`, href: '#/sales/' + x.o.id,
      sub: `${esc(x.o.code)} · car handed over ${x.days ? plural(x.days, 'day') + ' ago' : 'today'}${waitingNote(ctx.pending(x.o))}` }) }))
      .concat(bills.map((x) => ({ days: x.days, html: row({ icon: 'wrench', tone: x.days > 30 ? 'red' : 'amber', title: `${NA.customerName(x.i.customerId)} owes ${money(x.due)}`,
      // The job card only for people who can open Service; Accounts follows it up in the ledger.
      href: x.i.refId && NA.canSee('service') ? '#/service/job/' + x.i.refId : '#/finance?tab=ledger',
      sub: `Service bill ${esc(x.i.no || '')} · ${x.days ? plural(x.days, 'day') + ' ago' : 'today'}${waitingNote(x.waiting)}` }) })))
      .sort((a, b) => b.days - a.days).map((x) => x.html);
    return {
      stats: [
        { label: 'Money to confirm', value: NA.fmt.num(money2confirm.length), sub: money2confirm.length ? esc(short(sum(money2confirm, (p) => p.amount))) + ' waiting' : 'All confirmed', href: '#/approvals?tab=money' },
        { label: 'Refunds to pay', value: esc(short(sum(refunds, (o) => o.refund.amount))), sub: refunds.length ? plural(refunds.length, 'order') : 'None', href: '#/finance?tab=ledger&view=refunds' },
        { label: 'Supplier payments due', value: esc(short(sup.due)), sub: sup.count || 'Nothing due', href: '#/finance?tab=vendors' },
        { label: 'Customers owe us', value: esc(short(sum(owe, (x) => x.bal) + sum(bills, (x) => x.due))), sub: owe.length || bills.length ? [owe.length ? plural(owe.length, 'car') : '', bills.length ? plural(bills.length, 'service bill') : ''].filter(Boolean).join(' · ') : 'Nobody', href: '#/finance?tab=ledger' },
      ],
      main: [
        section({ title: 'Refunds to pay', rows: refunds.map((o) => row({ icon: 'undo', tone: 'red', title: `Pay refund · ${money(o.refund.amount)}`, href: '#/sales/' + o.id, right: refundBtn(o),
          sub: `${esc(NA.customerName(o.customerId))} · ${esc(o.code)}${o.refund.approvedBy ? ' · approved by ' + esc(o.refund.approvedBy) : ''}` })), link: { href: '#/finance?tab=ledger&view=refunds' } }),
        section({ title: 'Supplier payments due', rows: sup.rows.map((r) => row({ icon: r.icon || 'cart', title: `Pay ${money(r.amount)}`, href: r.href,
          sub: [esc(r.what), esc(r.code), esc(NA.vendorName(r.vendorId))].filter(Boolean).join(' · ') })), link: { href: '#/finance?tab=vendors' } }),
        section({ title: 'Expenses to pay', rows: expenses.map((e) => row({ icon: 'receipt', title: `Pay ${money(e.amount)} · ${e.category || 'Expense'}`, href: '#/finance?tab=expenses', right: expenseBtn(e),
          sub: `${e.paidTo ? 'To ' + esc(e.paidTo) + ' · ' : ''}claimed by ${esc(claimant(e))} · ${esc(NA.fmt.dateShort(e.date))}` })), link: { href: '#/finance?tab=expenses' } }),
        section({ title: 'Salaries to pay', rows: salaries.map((r) => row({ icon: 'hr', tone: 'green', title: `${pay.label(r.k)} payroll approved${r.amount ? ' · ' + money(r.amount) : ''}`,
          sub: payrollBtn ? 'Pay the staff, then record it here' : 'Pay the staff, then mark it paid in People → Payroll', href: '#/admin?tab=payroll&month=' + r.k,
          right: payrollBtn ? `<button class="btn btn-ghost btn-sm" data-act="payroll-pay" data-id="${esc(r.k)}">Pay</button>` : '' })) }),
        section({ title: 'Customers who owe us', rows: oweRows, link: { href: '#/finance?tab=ledger' } }),
        section({ title: 'Bounced, not collected again', rows: bounced.map((p) => row({ icon: 'alert', tone: 'red', title: `${money(p.amount)} · ${NA.customerName(p.customerId)}`, href: p.orderId ? '#/sales/' + p.orderId : null,
          sub: `${esc(p.method || '')}${p.ref ? ' · ' + esc(p.ref) : ''} · ${esc(p.verifyNote || 'Not received')}` })), link: { href: '#/finance?tab=money&view=cheques' } }),
      ],
      side: [],
      bits: [payBits ? plural(payBits, 'payment') + ' to make' : ''],
      actions: [
        NA.can('payments.record') && has('recordPayment') && { label: 'Record payment', icon: 'wallet', act: 'pay' },
        NA.can('expenses.record') && has('newExpense') && { label: 'New expense', icon: 'receipt', act: 'new-expense' },
      ],
    };
  }

  function payrollRuns(ctx) {
    const P = NA.db.payroll && typeof NA.db.payroll === 'object' ? NA.db.payroll : {};
    const people = NA.people && typeof NA.people.payrollState === 'function' ? NA.people : null;
    // Accounts pays by booking the month's salary expenses; only Admin & HR or the MD may change the payroll page itself,
    // so it can still say "approved" after the staff were paid. A booked salary expense means the month is paid.
    const booked = (k) => ctx.list('expenses').some((e) => !['void', 'rejected'].includes(e.status) && (e.payrollMonth === k || String(e.ref || '').startsWith('PAYROLL-' + k)));
    const state = (k) => {
      const run = P[k] || null;
      const ap = A.find('payroll', k, 'payroll');
      let amount = (ap && num(ap.amount)) || (run && num(run.total)) || 0;
      let st = run ? 'draft' : 'none';
      if (ap && ap.status === 'rejected') st = 'rejected';
      if ((ap && ap.status === 'pending') || (run && ['pending', 'submitted', 'sent'].includes(run.status))) st = 'pending';
      if ((ap && ap.status === 'approved') || (run && run.status === 'approved')) st = 'approved';
      if ((run && run.status === 'paid') || booked(k)) st = 'paid';
      let declined = st === 'rejected' ? ap : null;
      // People → Payroll decides where a month stands when it is loaded (it reads the booked salaries the same way), and
      // its total is the month's figure: a draft's live total for Admin & HR, the approved figure once sent.
      // "Sent back" only when the month's latest request was declined (ps.declined), not one from before a re-open.
      if (people) {
        try {
          const ps = people.payrollState(k);
          if (ps && ['draft', 'pending', 'approved', 'paid'].includes(ps.state)) {
            declined = ps.state === 'draft' && ps.declined ? ps.declined : null;
            st = ps.state !== 'draft' ? ps.state : declined ? 'rejected' : run ? 'draft' : 'none';
            amount = num(ps.total);
          }
        } catch (e) { console.error(e); }
      }
      return { k, run, ap, st, amount, declined };
    };
    return { prev: state(NA.addMonths(ctx.M + '-01', -1).slice(0, 7)), cur: state(ctx.M), label: (k) => new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }

  /* ---------- Procurement ---------- */
  /** Where a customer waiting for a car stands. Purchasing does not receive payments, so it gets the order's stage, never a
      "0% paid" it cannot know. */
  function carWait(ctx, x) {
    if (x.ready) {
      const credit = ctx.seesMoney ? !ctx.fullyPaid(x.o) : creditOk(x.o);
      return credit ? 'approved to get the car before full payment' : 'paid in full and waiting';
    }
    return ctx.seesMoney ? NA.fmt.pct(ctx.paidPct(x.o)) + ' paid' : 'not ready for its VIN yet';
  }
  function procurementView(ctx) {
    const pos = ctx.list('purchaseOrders');
    const vehicles = ctx.list('vehicles');
    const sup = supplierMoney(ctx);
    const canEm = NA.can('po.manage') && has('newEmergencyPO');
    const emBtn = (o) => canEm ? `<button class="btn btn-ghost btn-sm" data-act="emergency" data-order="${esc(o.id)}" data-model="${esc(o.modelId)}" data-color="${esc(o.color || '')}">Start purchase</button>` : '';

    // Customers waiting for a car: asked for an emergency car, or confirmed with no car anywhere.
    const asked = ctx.openOrders.filter((o) => o.emergencyRequest && !hasEmergencyPO(ctx, o));
    const askedIds = new Set(asked.map((o) => o.id));
    const noCar = stockCheck(ctx).filter((x) => !x.hasStock && !x.onTheWay && !x.emergency && !askedIds.has(x.o.id));
    const waitRows = asked.map((o) => {
      const r = o.emergencyRequest || {};
      const name = custName(o.customerId);
      return row({ icon: 'bolt', tone: 'red', title: `Emergency car for ${name || o.code}`, href: gate('#/sales/' + o.id), quote: r.note || '', right: emBtn(o), wrap: true,
        sub: [name ? esc(o.code) : '', esc(NA.modelName(o.modelId)) + (o.color ? ' · ' + esc(o.color) : ''), r.by ? 'asked by ' + esc(r.by) + (r.at ? ' ' + esc(NA.fmt.ago(r.at)) : '') : ''].filter(Boolean).join(' · ') });
    }).concat(noCar.map((x) => row({ icon: 'car', tone: x.ready ? 'red' : 'amber', title: `No ${NA.modelName(x.o.modelId)}${x.o.color ? ' (' + x.o.color + ')' : ''} for ${x.o.code}`, href: gate('#/sales/' + x.o.id), right: emBtn(x.o), wrap: true,
      sub: [esc(custName(x.o.customerId)), carWait(ctx, x), 'nothing on order'].filter(Boolean).join(' · ') })));

    // Purchase orders that are waiting on someone.
    const dueBy = new Map();
    sup.rows.forEach((r) => { if (r.po) dueBy.set(r.po.id, (dueBy.get(r.po.id) || []).concat(r)); });   // parts bills are the workshop's
    const poItems = [];
    pos.forEach((po) => {
      const k = ctx.poStage(po);
      if (['cancelled', 'closed', 'received'].includes(k)) return;
      const st = poState(po);
      const what = `${esc(po.code || '')} · ${esc(NA.vendorName(po.vendorId))} · ${money(B.poTotal(po))}`;
      const href = '#/procurement/' + po.id;
      if (st === 'pending') poItems.push({ sev: 1, html: row({ icon: 'clock', tone: 'amber', title: 'Waiting for the Managing Director', sub: what, href }) });
      else if (st === 'rejected') poItems.push({ sev: 0, html: row({ icon: 'x', tone: 'red', title: 'Declined — change it or cancel it', sub: what, href }) });
      else if (st === 'none') {
        poItems.push({ sev: 1, html: row({ icon: 'stamp', tone: 'amber', href, sub: what,
          title: po.type === 'emergency' && k === 'check' ? 'Confirm the car with CG Runner, then ask for approval' : 'Not approved yet — ask the Managing Director' }) });
      } else (dueBy.get(po.id) || []).forEach((d) => poItems.push({ sev: 3, html: row({ icon: 'wallet', title: `Waiting for Accounts to pay ${money(d.amount)}`, sub: `${esc(d.what)} · ${esc(po.code || '')} · ${esc(NA.vendorName(po.vendorId))}`, href }) }));
      if (po.type === 'emergency' && k === 'paid') poItems.push({ sev: 1, html: row({ icon: 'clipboard-check', tone: 'blue', title: 'Paid — receive the car and do the PDI', sub: what, href }) });
    });
    poItems.sort((a, b) => a.sev - b.sev);
    const waitingApproval = pos.filter((po) => !['cancelled', 'closed', 'received'].includes(ctx.poStage(po)) && poState(po) === 'pending').length;

    // Cars on the way: lots not yet at the warehouse, and cars moving between branches.
    const lots = [];
    pos.filter((p) => !['cancelled', 'closed'].includes(ctx.poStage(p))).forEach((po) => (po.lots || []).forEach((lot) => { if (lot.status !== 'Delivered to Warehouse') lots.push({ po, lot }); }));
    lots.sort((a, b) => String(a.lot.eta || '9999').localeCompare(String(b.lot.eta || '9999')));
    const moving = vehicles.filter((v) => v.move && v.move.status === 'moving');
    const arriveRows = lots.map(({ po, lot }) => {
      const late = isDay(dayOf(lot.eta)) && daysUntil(lot.eta) < 0;
      const eta = isDay(dayOf(lot.eta)) ? (late ? `<span class="tone-red">ETA passed ${plural(-daysUntil(lot.eta), 'day')} ago</span>` : 'Arrives ' + esc(NA.fmt.dateShort(lot.eta))) : 'No ETA yet';
      return row({ icon: 'truck', tone: late ? 'red' : '', title: `${lot.lotNo || po.code} · ${plural(num(lot.qty) || (po.units || []).length, 'car')}`, href: '#/procurement/' + po.id,
        sub: `${esc(lot.status || 'On the way')} · ${eta}${lot.shipment ? ' · ' + esc(lot.shipment) : ''}` });
    }).concat(moving.map((v) => row({ icon: 'swap', title: `${NA.modelName(v.modelId)} moving to ${v.move.to || '—'}`, href: '#/inventory/' + v.id,
      sub: `${esc(v.vin || '')}${v.move.gatePass ? ' · gate pass ' + esc(v.move.gatePass) : ''}${v.move.at ? ' · left ' + esc(NA.fmt.dateShort(v.move.at)) : ''}` })));

    const pdi = vehicles.filter(toInspect).sort((a, b) => String(a.arrivedAt || '').localeCompare(String(b.arrivedAt || '')));
    const canPdi = NA.can('stock.edit') && has('recordPDI');
    const pdiRows = pdi.map((v) => {
      const d = daysSince(v.arrivedAt);
      return row({ icon: 'pdi', tone: d > 2 ? 'red' : 'amber', title: `${NA.modelName(v.modelId)}${v.color ? ' · ' + v.color : ''}`, href: '#/inventory/' + v.id,
        sub: `${esc(v.vin || '')} · ${esc(v.location || 'Warehouse')} · ${v.arrivedAt ? (d ? 'arrived ' + plural(d, 'day') + ' ago' : 'arrived today') : 'just arrived'}`,
        right: canPdi ? `<button class="btn btn-ghost btn-sm" data-act="pdi" data-id="${esc(v.id)}">Do PDI</button>` : '' });
    });
    const hold = vehicles.filter(onHold);
    const holdRows = hold.map((v) => row({ icon: 'alert', tone: 'amber', title: `${NA.modelName(v.modelId)}${v.color ? ' · ' + v.color : ''}`, href: '#/inventory/' + v.id,
      sub: [esc(carProblem(v) || 'No reason given'), esc(v.vin || ''), esc(v.location || '')].filter(Boolean).join(' · ') }));
    const lowRow = partsRow(ctx, 'at or below the reorder level');
    const arriving = vehicles.filter((v) => v.status === 'in_transit').length + pdi.length;
    return {
      stats: [
        { label: 'Waiting for approval', value: NA.fmt.num(waitingApproval), sub: waitingApproval ? 'Purchase orders with the MD' : 'None', href: '#/procurement?tab=pos' },
        // The Vehicles screen's "On the way" list holds cars in transit and cars waiting for their arrival check.
        { label: 'Cars arriving', value: NA.fmt.num(arriving), sub: pdi.length ? `<span class="tone-amber">${plural(pdi.length, 'car')} to inspect</span>` : lots.length ? plural(lots.length, 'lot') + ' on the way' : 'Nothing to inspect', href: '#/inventory?tab=arriving' },
        { label: 'On hold', value: NA.fmt.num(hold.length), sub: hold.length ? 'Not for sale until sorted' : 'None', href: '#/inventory?tab=hold' },
        { label: 'Cars in stock', value: NA.fmt.num(vehicles.filter((v) => v.status === 'available').length), sub: 'Ready to sell', href: '#/inventory' },
      ],
      main: [
        section({ title: 'Customers waiting for a car', rows: waitRows, link: { href: '#/procurement?tab=emergency' } }),
        section({ title: 'Purchase orders', rows: poItems.map((x) => x.html), link: { href: '#/procurement?tab=pos' } }),
        section({ title: 'On the way', rows: arriveRows, link: { href: '#/procurement?tab=pos' } }),
        section({ title: 'PDI to do', rows: pdiRows, link: { href: '#/inventory?tab=arriving' } }),
        section({ title: 'On hold', rows: holdRows, link: { href: '#/inventory?tab=hold' } }),
        section({ title: 'Parts', rows: [lowRow], count: false }),
      ],
      side: [stockSection(ctx)],
      bits: [waitRows.length ? plural(waitRows.length, 'customer') + ' waiting for a car' : '', pdi.length ? plural(pdi.length, 'car') + ' for PDI' : ''],
      actions: [
        NA.can('po.manage') && has('newPO') && { label: 'New purchase order', icon: 'cart', act: 'new-po' },
        canEm && { label: 'Emergency purchase', icon: 'bolt', act: 'emergency' },
      ],
    };
  }

  /* ---------- Service and Service Manager ---------- */
  /** What is still to pay on a service bill (the Service screen's figure: money Accounts marked as not received is owed again). */
  function billDue(inv) {
    const S = NA.service;
    if (S && typeof S.invDue === 'function') { try { return num(S.invDue(inv)); } catch (e) { console.error(e); } }
    return inv ? Math.max(0, num(inv.total) - num(inv.paid)) : 0;
  }
  /** Ready for pickup as the Service screen counts it: the work is done and the car has not been handed back. Bills from
      before the hand-back step count as handed back once they are paid. */
  function readyForPickup(j) {
    const S = NA.service;
    if (S && typeof S.phase === 'function') { try { return S.phase(j) === 'ready'; } catch (e) { console.error(e); } }
    if (['open', 'in_progress', 'cancelled', 'closed'].includes(j.status)) return false;
    if (j.status !== 'invoiced') return true;
    if (j.release || j.releasedAt) return false;
    const start = NA.db.settings && NA.db.settings.policyStart;
    const billed = dayOf(j.invoicedAt || j.completedAt || j.openedAt);
    return !(start && isDay(billed) && billed < start && billDue(j.invoiceId ? NA.get('invoices', j.invoiceId) : null) <= 0);
  }
  function serviceView(ctx) {
    const T = ctx.T;
    const bookings = ctx.list('serviceBookings').filter((b) => dayOf(b.date) === T && b.status !== 'cancelled')
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const missed = ctx.list('serviceBookings').filter((b) => b.status === 'booked' && isDay(dayOf(b.date)) && dayOf(b.date) < T && daysSince(b.date) <= 3);
    const jobs = ctx.list('jobCards');
    const inShop = jobs.filter((j) => ['open', 'in_progress'].includes(j.status)).sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));
    // Work finished but the car is still here: to bill, to collect, or to release (as long as it takes).
    const ready = jobs.filter(readyForPickup);
    // The workshop's calls, as the Service screen lists them (calls about a job, reminders and renewals). Sales calls
    // (payments, the after-delivery call, unhappy customers a manager calls back) belong to the consultant or the Sales Manager.
    const fus = ctx.list('followUps').filter((f) => f.status !== 'done' && dueBy(f.due, T) && isServiceCall(f))
      .sort((a, b) => dayOf(a.due).localeCompare(dayOf(b.due)));
    const warr = ctx.list('warranties').filter((w) => w.status !== 'void' && isDay(dayOf(w.expiry)) && daysUntil(w.expiry) >= 0 && daysUntil(w.expiry) <= 30);
    const toApprove = NA.can('service.approve') ? A.pendingForMe().filter((a) => ['warranty_job', 'service_discount', 'job_cancel'].includes(a.type)) : [];
    const canCheckIn = NA.can('service.manage') && has('newJobCard');
    const car = (vid) => { const v = NA.vehicle(vid); return v ? NA.modelName(v.modelId) + (v.regNo ? ' · ' + v.regNo : '') : ''; };
    const cust = (cid) => (cid ? NA.customerName(cid) : 'Stock car');

    const bookingRows = bookings.map((b) => {
      const st = b.status === 'in_workshop' ? NA.ui.badge('In workshop', 'blue') : b.status === 'completed' ? NA.ui.badge('Done', 'green')
        : canCheckIn ? `<button class="btn btn-ghost btn-sm" data-act="check-in" data-id="${esc(b.id)}">Check in</button>` : NA.ui.badge('Booked', 'gray');
      return row({ lead: `<span class="td-time">${esc(b.time || '—')}</span>`, title: cust(b.customerId), href: b.jobCardId ? '#/service/job/' + b.jobCardId : '#/service?tab=bookings',
        sub: `${esc(b.type || 'Service')}${car(b.vehicleId) ? ' · ' + esc(car(b.vehicleId)) : ''}${b.notes ? ' · ' + esc(b.notes) : ''}`, right: st });
    }).concat(missed.map((b) => {
      const c = NA.customer(b.customerId) || {};
      return row({ icon: 'calendar', tone: 'amber', title: `${cust(b.customerId)} did not come in`, href: '#/service?tab=bookings', right: contactButtons(c.mobile, c.name || ''),
        sub: `Booked ${esc(NA.fmt.dateShort(b.date))}${b.time ? ' ' + esc(b.time) : ''} · ${esc(b.type || 'Service')} · call to rebook` });
    }));

    const jobRows = inShop.map((j) => {
      const d = daysSince(j.openedAt);
      const warrantyWait = A.isPending('jobCards', j.id, 'warranty_job');
      const bits = [esc(j.code || ''), j.status === 'in_progress' ? 'Being worked on' : 'Waiting to start', j.technicianId ? esc(NA.staffName(j.technicianId)) : 'No technician yet',
        d ? `in for ${plural(d, 'day')}` : 'came in today', warrantyWait ? '<span class="tone-amber">warranty waiting for the Service Manager</span>' : ''];
      return row({ icon: 'wrench', tone: d > 3 ? 'amber' : '', title: `${cust(j.customerId)}${car(j.vehicleId) ? ' · ' + car(j.vehicleId) : ''}`, href: '#/service/job/' + j.id, sub: bits.filter(Boolean).join(' · ') });
    });

    const readyRows = ready.map((j) => {
      let what;
      if (j.status === 'invoiced') {
        const inv = j.invoiceId ? NA.get('invoices', j.invoiceId) : null;
        const due = billDue(inv);
        what = due > 0 ? `<span class="tone-amber">${money(due)} to collect before the car goes</span>` : 'Paid — release the car';
      } else {
        what = j.billing === 'warranty' ? 'Work done — warranty, no charge' : !j.customerId ? 'Work done — internal job' : `Work done — bill ${money(B.jobTotals(j).total)}`;
      }
      return row({ icon: 'check-circle', tone: 'green', title: `${cust(j.customerId)}${car(j.vehicleId) ? ' · ' + car(j.vehicleId) : ''}`, href: '#/service/job/' + j.id, sub: `${esc(j.code || '')} · ${what}` });
    });

    const fuRows = fus.map((f) => followUpRow(ctx, f, '#/service?tab=followups'));
    const warrRows = warr.map((w) => row({ icon: 'shield', tone: 'blue', title: `${NA.customerName(w.customerId)} · warranty ends in ${plural(daysUntil(w.expiry), 'day')}`, href: '#/service?tab=warranties',
      sub: `${esc(w.code || '')} · ${esc(NA.modelName(w.modelId))} · offer an extended warranty or service plan` }));
    const overdue = fus.filter((f) => daysSince(f.due) > 0).length;
    const warrantyAsks = toApprove.filter((a) => a.type === 'warranty_job').length;
    return {
      stats: [
        { label: 'Booked today', value: NA.fmt.num(bookings.length), sub: missed.length ? `<span class="tone-red">${NA.fmt.num(missed.length)} did not come in</span>` : `${NA.fmt.num(bookings.filter((b) => b.status !== 'booked').length)} checked in`, href: '#/service?tab=bookings' },
        { label: 'In the workshop', value: NA.fmt.num(inShop.length), sub: `${NA.fmt.num(inShop.filter((j) => j.status === 'in_progress').length)} being worked on`, href: '#/service?tab=jobs' },
        { label: 'Ready for pickup', value: NA.fmt.num(ready.length), sub: ready.length ? 'Bill, collect, hand back' : 'None waiting', href: '#/service?tab=jobs' },
        NA.can('service.approve')
          ? { label: 'To approve', value: NA.fmt.num(toApprove.length), sub: toApprove.length ? (warrantyAsks ? plural(warrantyAsks, 'warranty job') : 'Discounts and cancellations') : 'Nothing waiting', href: '#/approvals' }
          : null,
        { label: 'Calls to make', value: NA.fmt.num(fus.length), sub: overdue ? `<span class="tone-red">${NA.fmt.num(overdue)} overdue</span>` : 'All on time', href: '#/service?tab=followups' },
      ],
      main: [
        section({ title: 'Today’s bookings', rows: bookingRows, link: { href: '#/service?tab=bookings' } }),
        section({ title: 'In the workshop', rows: jobRows, link: { href: '#/service?tab=jobs' } }),
        section({ title: 'Ready for pickup', rows: readyRows, link: { href: '#/service?tab=jobs' } }),
        section({ title: 'Calls to make', rows: fuRows, link: { href: '#/service?tab=followups' } }),
        section({ title: 'Warranties ending soon', rows: warrRows, link: { href: '#/service?tab=warranties' } }),
        section({ title: 'Parts', rows: [partsRow(ctx, 'running low')], count: false }),
      ],
      side: [],
      bits: [bookings.length ? plural(bookings.length, 'booking') + ' today' : '', ready.length ? plural(ready.length, 'car') + ' ready for pickup' : ''],
      actions: [
        NA.can('service.manage') && has('newServiceBooking') && { label: 'Book a service', icon: 'calendar', act: 'book-service' },
        NA.can('service.manage') && has('newJobCard') && { label: 'New job card', icon: 'wrench', act: 'new-job' },
      ],
    };
  }

  /* ---------- Admin & HR ---------- */
  function hrView(ctx) {
    const T = ctx.T;
    const staff = ctx.list('staff').filter((s) => s.active !== false);
    // A day off: Friday, or a public holiday from Settings (NA.isHoliday) — the People → Attendance rule.
    const friday = new Date(T + 'T00:00:00').getDay() === 5;
    const off = typeof NA.isHoliday === 'function' ? !!NA.isHoliday(T) : friday;
    const hol = ((NA.db.settings && NA.db.settings.holidays) || []).find((h) => (typeof h === 'string' ? h : h && h.date) === T);
    const holName = hol && typeof hol === 'object' && hol.name ? String(hol.name) : '';
    const offWhy = friday ? 'Friday is the weekly holiday' : holName ? holName + ' is a public holiday' : 'Today is a public holiday';
    const offShort = friday ? 'Weekly holiday' : holName || 'Public holiday';
    const att = ctx.list('attendance').filter((a) => a.date === T);
    const marked = new Set(att.map((a) => a.staffId));
    const count = (st) => att.filter((a) => a.status === st).length;
    const onLeave = ctx.list('leaves').filter((l) => l.status === 'approved' && l.from <= T && T <= (l.to || l.from));
    // People on approved leave are not "not marked"; they count once as on leave.
    const leaveIds = new Set(onLeave.map((l) => l.staffId).concat(att.filter((a) => a.status === 'Leave').map((a) => a.staffId)));
    const notMarked = staff.filter((s) => !marked.has(s.id) && !leaveIds.has(s.id));
    const pending = ctx.list('leaves').filter((l) => l.status === 'pending');
    const lic = licences(ctx);
    const attHref = gate('#/admin?tab=attendance') || '#/dashboard';
    const tile = (n, label, warn) => `<a href="${attHref}"${warn ? ' class="warn"' : ''}><b>${NA.fmt.num(n)}</b><span>${esc(label)}</span></a>`;
    const attendance = off
      ? card({ title: 'Attendance today', body: `<p class="muted">${esc(offWhy)}. Nothing needs marking.</p>`, cls: 'td-card' })
      : card({ title: 'Attendance today', cls: 'td-card', side: `<a class="btn-link" href="${attHref}">Mark attendance</a>`,
        body: `<div class="td-mini flush">${tile(count('Present'), 'Present')}${tile(count('Late'), 'Late')}${tile(leaveIds.size, 'On leave')}${tile(count('Absent'), 'Absent', count('Absent') > 0)}${tile(notMarked.length, 'Not marked', notMarked.length > 0)}</div>
          ${notMarked.length ? `<p class="td-note">Not marked yet: ${esc(notMarked.slice(0, 8).map((s) => s.name).join(', '))}${notMarked.length > 8 ? ` and ${NA.fmt.num(notMarked.length - 8)} more` : ''}.</p>` : ''}` });
    const leaveRows = onLeave.map((l) => row({ lead: NA.ui.avatar(l.staffName || NA.staffName(l.staffId), 34), title: l.staffName || NA.staffName(l.staffId), href: '#/admin?tab=leave',
      sub: `${esc(l.type || 'Leave')} · back after ${esc(NA.fmt.dateShort(l.to || l.from))}` }));
    const pay = payrollRuns(ctx);
    const run = pay.prev.st !== 'paid' && staff.length ? pay.prev : pay.cur;
    const PAY = {
      none: { icon: 'hr', tone: run === pay.prev ? 'amber' : '', text: 'Not started' },
      draft: { icon: 'hr', tone: run === pay.prev ? 'amber' : '', text: 'Draft — send it to the Managing Director' },
      pending: { icon: 'clock', tone: 'amber', text: 'Waiting for the Managing Director' },
      rejected: { icon: 'x', tone: 'red', text: 'Sent back by the Managing Director' },
      approved: { icon: 'check', tone: 'green', text: 'Approved — Accounts pays it' },
      paid: { icon: 'check', tone: 'green', text: 'Paid' + (run.run && run.run.paidAt ? ' ' + NA.fmt.dateShort(run.run.paidAt) : '') },
    }[run.st];
    const payRow = row({ icon: PAY.icon, tone: PAY.tone, title: `${pay.label(run.k)} payroll`, sub: esc(PAY.text) + (run.amount ? ' · ' + money(run.amount) : ''),
      quote: run.st === 'rejected' && run.declined ? run.declined.note : '', href: '#/admin?tab=payroll&month=' + run.k });
    return {
      stats: [
        { label: 'At work today', value: off ? '—' : NA.fmt.num(count('Present') + count('Late')) + `<small>of ${NA.fmt.num(staff.length)}</small>`, sub: off ? esc(offShort) : notMarked.length ? `<span class="tone-red">${NA.fmt.num(notMarked.length)} not marked</span>` : 'Everyone marked', href: '#/admin?tab=attendance' },
        { label: 'On leave today', value: NA.fmt.num(onLeave.length), sub: onLeave.length ? esc(onLeave.slice(0, 2).map((l) => firstName(l.staffName || NA.staffName(l.staffId))).join(', ')) : 'Nobody', href: '#/admin?tab=leave' },
        { label: 'Leave requests', value: NA.fmt.num(pending.length), sub: pending.length ? 'Waiting for a decision' : 'None waiting', href: '#/approvals' },
        { label: 'Licences to renew', value: NA.fmt.num(lic.length), sub: lic.length ? (lic[0].d < 0 ? '<span class="tone-red">One has expired</span>' : `Next in ${plural(lic[0].d, 'day')}`) : 'All valid', href: '#/admin?tab=compliance' },
      ],
      main: [
        attendance,
        section({ title: 'On leave today', rows: leaveRows, link: { href: '#/admin?tab=leave' } }),
        section({ title: 'Licences to renew', rows: lic.map(licenceRow), link: { href: '#/admin?tab=compliance' } }),
        section({ title: 'Payroll', rows: [payRow], count: false, link: { href: '#/admin?tab=payroll' } }),
      ],
      side: [],
      bits: [!off && notMarked.length ? `attendance not marked for ${plural(notMarked.length, 'person', 'people')}` : '', lic.length ? plural(lic.length, 'licence') + ' to renew' : ''],
      actions: [gate('#/admin?tab=attendance') && { label: 'Mark attendance', icon: 'clipboard-check', href: '#/admin?tab=attendance' }],
    };
  }

  const VIEWS = {
    owner: ownerView, sales_manager: managerView, sales: consultantView, accounts: accountsView,
    procurement: procurementView, service: serviceView, service_manager: serviceView, hr: hrView,
  };

  /* ---------- the page ---------- */
  function build(missing) {
    const ctx = context();
    ctx.bits = [];
    const waiting = waitingSection(ctx);                 // first, so its first button is the blue one
    const view = (VIEWS[ctx.role] || (() => ({})))(ctx);
    const main = [waiting].concat(view.main || []).filter(Boolean);
    const side = (view.side || []).concat([requestsSection(ctx), activitySection(ctx)]).filter(Boolean);
    const actions = (view.actions || []).filter(Boolean).map((b, i) => {
      const kind = i === 0 && !ctx.primaryUsed ? 'primary' : 'ghost';
      return b.href ? NA.ui.btn(b.label, { kind, icon: b.icon, href: b.href }) : NA.ui.btn(b.label, { kind, icon: b.icon, act: b.act });
    }).join('');
    const bits = ctx.bits.concat(view.bits || []).filter(Boolean).slice(0, 2);
    const date = new Date(ctx.T + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    // A mistyped or old link lands here: say so, instead of silently showing Today.
    const lost = missing ? `<div class="callout callout-info td-lost">${NA.icon('info')}<div>There is no “${esc(missing)}” screen. Here is your Today screen instead.</div></div>` : '';
    return `${NA.ui.pageHead({ title: greetingFor(ctx.me), subtitle: esc(date + ' · ' + (bits.length ? bits.join(' · ') : 'Nothing urgent today')), actions })}
      ${lost}
      ${view.stats && view.stats.filter(Boolean).length ? statRow(view.stats) : ''}
      <div class="td-cols">
        <div class="td-col">${main.length ? main.join('') : caughtUp()}</div>
        <div class="td-col">${side.join('')}</div>
      </div>`;
  }

  /** Log a call or WhatsApp with a lead and set the next follow-up, without leaving Today. */
  function logContact(l) {
    if (has('logEngagement')) return NA.actions.logEngagement(l.id);
    let saved = false;
    NA.ui.formModal({
      title: 'Log a call', size: 'sm', submitLabel: 'Save',
      intro: `<p class="td-intro">${esc(l.name)} · ${esc(NA.modelName(l.modelId))}</p>`,
      fields: [
        { name: 'type', label: 'How did you reach them?', type: 'radio-cards', required: true, span: 2,
          options: [{ value: 'Call', label: 'Call', icon: 'phone' }, { value: 'WhatsApp', label: 'WhatsApp', icon: 'whatsapp' }] },
        { name: 'note', label: 'What did they say?', type: 'textarea', rows: 2, span: 2, placeholder: 'e.g. Wants a test drive on Saturday' },
        { name: 'next', label: 'Next follow-up', type: 'date', required: true, min: NA.today(), span: 2 },
      ],
      values: { type: 'Call', next: NA.addDays(NA.today(), 2) },
      onSubmit: (v) => {
        if (saved) return;                                   // a double click saves once
        const fresh = NA.get('leads', l.id);
        if (!fresh) { NA.ui.toast('This lead is no longer available', 'error'); return; }
        if (v.next < NA.today()) { NA.ui.toast('The next follow-up can’t be in the past', 'error'); return false; }
        saved = true;
        const eng = { date: NA.today(), type: v.type || 'Call', note: v.note || '', by: NA.me().name };
        NA.update('leads', fresh.id, { engagements: [eng].concat(fresh.engagements || []), nextFollowUp: v.next });
        NA.log(`${eng.type} with ${fresh.name}${eng.note ? ': ' + eng.note : ''}`, { rec: fresh, link: '#/leads/' + fresh.id });
        NA.ui.toast('Saved · next follow-up ' + NA.fmt.dateShort(v.next));
        NA.refresh();
      },
    });
  }

  /** Accounts confirms a payment (it starts counting) or marks it as not received. */
  function verify(id, ok) {
    const p = NA.get('payments', id);
    // Re-read each time: a second click, or Accounts on another screen, may have settled it already.
    if (!p || !B.paymentPending(p) || !NA.can('payments.verify')) return;
    if (ok) { B.verifyPayment(p, true); NA.ui.toast('Confirmed · ' + money(p.amount)); NA.refresh(); return; }
    // What happens next, as it really happens: on a car payment the consultant gets a call to collect it again
    // (B.verifyPayment; none on a cancelled order); a workshop receipt is marked on its bill, which shows as owed again,
    // and the service desk gets a call to collect it (service.js).
    const o = p.orderId ? NA.get('orders', p.orderId) : null;
    const next = o ? (o.stage !== 'cancelled' ? ' It stops counting, and the consultant gets a call to collect it again.' : ' It stops counting.')
      : p.invoiceId ? ' It stops counting. The bill shows as owed again, and the service desk gets a call to collect it.' : ' It stops counting.';
    NA.ui.formModal({
      title: 'Payment not received', size: 'sm', submitLabel: 'Mark as not received',
      intro: `<p class="td-intro">${esc(p.receiptNo || '')} · ${money(p.amount)} · ${esc(NA.customerName(p.customerId))}.${next}</p>`,
      fields: [{ name: 'note', label: 'What happened?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Cheque bounced — insufficient funds' }],
      onSubmit: (v) => {
        const cur = NA.get('payments', id);
        if (!cur || !B.paymentPending(cur)) { NA.refresh(); return; }
        B.verifyPayment(cur, false, v.note); NA.ui.toast('Marked as not received', 'info'); NA.refresh();
      },
    });
  }

  function onAct(el, redraw) {
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'new-lead': return callAction('newLead', undefined, '#/leads');
      case 'new-order': return callAction('newOrder', undefined, '#/sales');
      case 'pay': return callAction('recordPayment', id || undefined, id ? '#/sales/' + id : '#/sales');
      case 'book-service': return callAction('newServiceBooking', undefined, '#/service?tab=bookings');
      case 'new-job': return callAction('newJobCard', undefined, '#/service?tab=jobs');
      case 'check-in': return callAction('newJobCard', { bookingId: id }, '#/service?tab=bookings');
      case 'new-po': return callAction('newPO', undefined, '#/procurement');
      case 'emergency': return callAction('newEmergencyPO', el.dataset.order ? { modelId: el.dataset.model || '', color: el.dataset.color || '', orderId: el.dataset.order } : undefined, '#/procurement');
      case 'pdi': return callAction('recordPDI', id, '#/inventory/' + id);
      case 'reorder': return callAction('partsReorderList', undefined, '#/parts');
      case 'refund': return callAction('payRefund', id, '#/sales/' + id);
      case 'fu-done': return callAction('completeFollowUp', id);
      case 'payroll-pay': return callAction('payPayroll', id, '#/admin?tab=payroll&month=' + id);
      case 'targets': return callAction('setTargets', el.dataset.month || undefined, '#/reports?r=team&p=month');
      case 'expense': return callAction('openExpense', id, '#/finance?tab=expenses');
      case 'new-expense': return callAction('newExpense', undefined, '#/finance?tab=expenses');
      case 'new-leave': return callAction('newLeave', undefined, '#/approvals');
      case 'log': { const l = NA.get('leads', id); if (l) logContact(l); return; }
      case 'clear': return verify(id, true);
      case 'bounce': return verify(id, false);
      case 'chart': chartMode = el.dataset.mode === 'revenue' ? 'revenue' : 'units'; return redraw();
      case 'more': opened.add(el.dataset.sec); return redraw();
      case 'less': opened.delete(el.dataset.sec); return redraw();
      default: return;
    }
  }

  NA.page({
    path: 'dashboard',
    title: 'Today',
    icon: 'home',
    render(root) {
      injectCss();
      // The router shows Today for any address it does not know (an old bookmark, a screen not loaded).
      const section = NA.currentRoute ? NA.currentRoute().section : 'dashboard';
      const missing = section && section !== 'dashboard' && !NA.pages[section] ? section : '';
      const draw = () => { root.innerHTML = build(missing); };
      draw();
      const offs = [
        NA.ui.delegate(root, 'click', '[data-act]', (el, ev) => { ev.preventDefault(); onAct(el, draw); }),
        // The whole row opens its record; buttons, links and approval buttons inside it keep their own job.
        NA.ui.delegate(root, 'click', '[data-href]', (el, ev) => {
          if (ev.target.closest('a, button, input, select, textarea, label, [data-act], [data-appr-act]')) return;
          NA.go(el.dataset.href);
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
})();
