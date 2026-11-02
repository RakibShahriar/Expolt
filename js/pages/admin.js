/* ==========================================================================
   People (Admin & HR) — #/admin?tab=hr|attendance|leave|payroll|assets|compliance
   Staff directory, the daily attendance register, leave with yearly balances,
   the monthly payroll (Admin & HR prepares → Managing Director approves →
   Accounts pays), company assets and licences.

   Payroll lives in NA.db.payroll = { 'yyyy-mm': { status: 'draft'|'pending'|'approved'|'paid',
     lines: { staffId: { allowance, bonus, deduct, note } }, snapshot: [line…] (frozen when sent),
     total, preparedBy, submittedAt, approvedBy, approvedAt, paidAt, paidBy, method, payRef,
     expenseIds, history: [{ at, by, text }], versions: [payments that were undone] } }.
   Looking at a month never creates it; it is created on the first change.
   Salary history sits in the same document, payroll.salaryHistory[staffId] = [{ amount,
   from: 'yyyy-mm', by, byId, at, reason }] (staff records go to every role, the payroll document
   only to Admin & HR, Accounts and the MD); payroll uses the salary valid in the month it pays.
   Attendance rows carry markedBy / markedAt, and leaveId / leaveType when approved leave marked them.
   Accounts pays: Salaries expenses with payrollMonth (one per part of the business), then stamps the
   approved month paid. The office server lets Accounts change only that on the payroll document (status
   approved → paid and the payment fields), never the lines or other months. A month with live salary
   expenses also reads as paid, and the MD's screen writes "paid" onto it if the stamp did not get through.
   Days off are Fridays and the public holidays in Settings (NA.isHoliday); office hours come from Settings.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const M = (n) => NA.fmt.money(n);
  const S = (n) => NA.fmt.short(n);
  const num = (x) => Number(x) || 0;
  const sum = (arr, fn) => arr.reduce((s, x) => s + num(fn(x)), 0);
  NA.actions = NA.actions || {};

  function injectCss() {
    if (document.getElementById('css-admin')) return;
    const st = document.createElement('style');
    st.id = 'css-admin';
    st.textContent = `
      .pp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 20px; }
      .pp-person { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; min-width: 0; padding: 26px 16px 22px; border: 0; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); color: var(--ink); text-align: center; transition: box-shadow .2s var(--ease), transform .2s var(--ease); }
      .pp-person:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
      .pp-person.is-left { opacity: .55; }
      .pp-person .avatar { margin-bottom: 10px; }
      .pp-person-name { max-width: 100%; font-size: 15px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pp-person-role { max-width: 100%; font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pp-person-status { display: flex; align-items: center; min-height: 22px; margin-top: 10px; }
      .pp-quiet { font-size: 12.5px; color: var(--muted); }
      .pp-block { margin-top: 24px; }
      .pp-section { margin-top: 36px; }
      .pp-head { margin-bottom: 14px; }
      .pp-gap-top { margin-top: 22px; }
      .pp-intro { margin-bottom: 18px; line-height: 1.5; }
      .pp-card-title { margin-bottom: 18px; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
      .pp-nav { align-items: center; }
      .pp-nav button { min-width: 40px; justify-content: center; }
      .pp-nav button:disabled { opacity: .35; cursor: default; }
      .pp-nav-mid { padding: 0 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .pp-nav-label { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
      .pp-counts { display: flex; flex-wrap: wrap; gap: 18px; font-size: 13px; color: var(--muted); }
      .pp-counts b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
      .pp-reg-row { position: relative; display: grid; grid-template-columns: minmax(190px, 1fr) auto minmax(150px, 200px); gap: 18px; align-items: center; padding: 14px 24px; }
      .pp-reg-row + .pp-reg-row::before { content: ''; position: absolute; top: 0; left: 72px; right: 0; height: .5px; background: var(--line-2); }
      .pp-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .pp-who-text { min-width: 0; }
      .pp-who-text b { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pp-who-text small { display: block; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pp-st { display: inline-flex; gap: 2px; padding: 3px; border-radius: 11px; background: var(--fill-2); }
      .pp-st button { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: none; color: var(--ink-2); font-size: 13.5px; font-weight: 500; transition: background .15s, color .15s; }
      .pp-st button .ico { color: var(--muted-2); }
      .pp-st button:hover:not(:disabled) { color: var(--ink); }
      .pp-st button:disabled { opacity: .45; cursor: default; }
      .pp-st button.is-green { background: var(--green-50); color: var(--green); }
      .pp-st button.is-amber { background: var(--amber-50); color: var(--amber); }
      .pp-st button.is-blue { background: var(--blue-50); color: var(--blue); }
      .pp-st button.is-red { background: var(--red-50); color: var(--red); }
      .pp-st button.is-green .ico, .pp-st button.is-amber .ico, .pp-st button.is-blue .ico, .pp-st button.is-red .ico { color: currentColor; }
      .pp-time-cell { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
      .pp-time { width: 112px; height: 34px; padding: 0 10px; border: 0; border-radius: 9px; background: var(--fill); color: var(--ink); font: inherit; font-variant-numeric: tabular-nums; outline: none; }
      .pp-time:focus { background: var(--field-bg); box-shadow: var(--focus), 0 0 0 1px var(--tint); }
      .pp-time:disabled { opacity: .5; }
      .pp-rate { min-width: 120px; }
      .pp-rate .progress { margin-bottom: 4px; }
      .pp-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
      .pp-cal-h { padding-bottom: 4px; font-size: 12px; color: var(--muted); text-align: center; }
      .pp-cal-d { display: grid; place-items: center; height: 42px; border: 0; border-radius: 10px; background: var(--fill-3); color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
      .pp-cal-d.is-green { background: var(--green-50); color: var(--green); }
      .pp-cal-d.is-amber { background: var(--amber-50); color: var(--amber); }
      .pp-cal-d.is-blue { background: var(--blue-50); color: var(--blue); }
      .pp-cal-d.is-red { background: var(--red-50); color: var(--red); }
      .pp-cal-d.is-off { background: none; color: var(--muted-2); }
      .pp-cal-d.is-future { background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line-2); }
      .pp-cal-d.is-today { box-shadow: inset 0 0 0 2px var(--tint); }
      .pp-cal-d:disabled { cursor: default; }
      .pp-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 18px; font-size: 12.5px; color: var(--muted); }
      .pp-legend span { display: inline-flex; align-items: center; gap: 6px; }
      .pp-list { padding: 4px 0; }
      .pp-leave { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 18px 24px; }
      .pp-leave + .pp-leave::before { content: ''; position: absolute; top: 0; left: 78px; right: 0; height: .5px; background: var(--line-2); }
      .pp-leave-head { display: flex; align-items: flex-start; gap: 14px; }
      .pp-leave-main { flex: 1; min-width: 0; }
      .pp-leave-main b { display: block; font-weight: 600; letter-spacing: -.01em; }
      .pp-leave-main small { display: block; margin-top: 2px; font-size: 13px; color: var(--muted); }
      .pp-leave-main small.tone-red { color: var(--red); }
      .pp-reason { margin-top: 8px; padding: 9px 12px; border-radius: 10px; background: var(--fill-3); color: var(--ink-2); font-size: 13.5px; }
      .pp-hero { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
      .pp-hero b { display: block; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
      .pp-hero small { display: block; margin-top: 2px; font-size: 13.5px; color: var(--muted); }
      .pp-in { width: 132px; height: 34px; padding: 0 10px; border: 0; border-radius: 9px; background: var(--fill); color: var(--ink); font: inherit; text-align: right; font-variant-numeric: tabular-nums; outline: none; }
      .pp-in:focus { background: var(--field-bg); box-shadow: var(--focus), 0 0 0 1px var(--tint); }
      .pp-in:disabled { background: none; color: var(--muted); }
      .pp-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 22px; padding-top: 16px; border-top: .5px solid var(--line-2); font-weight: 500; }
      .pp-total b { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
      .pp-more { margin-top: 20px; }
      .pp-more > summary { display: inline-flex; align-items: center; gap: 6px; color: var(--tint); font-weight: 500; cursor: pointer; list-style: none; }
      .pp-more > summary::-webkit-details-marker { display: none; }
      .pp-more > summary .ico { transition: transform .2s var(--ease); }
      .pp-more[open] > summary .ico { transform: rotate(180deg); }
      .pp-bars { display: flex; flex-direction: column; gap: 12px; }
      .pp-bar-row { display: grid; grid-template-columns: minmax(96px, 170px) minmax(0, 1fr) auto; gap: 12px; align-items: center; font-size: 13.5px; }
      .pp-bar-row > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pp-track { height: 8px; border-radius: 4px; background: var(--fill); overflow: hidden; }
      .pp-track > i { display: block; height: 100%; border-radius: 4px; background: var(--blue-solid); }
      .pp-nav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .pp-nav .seg button { height: 38px; min-width: 44px; padding: 0 10px; justify-content: center; }
      .pp-nav .seg button:disabled { opacity: .35; cursor: default; }
      .pp-hours { font-size: 13px; color: var(--muted); white-space: nowrap; }
      .pp-steps { margin: 4px 0 26px; }
      .pp-next { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
      .pp-next .lock-note { margin: 0; }
      .pp-next .next-step .btn, .pp-next .callout .btn { flex: none; }
      .pp-sheet { display: flex; flex-direction: column; gap: 24px; }
      .pp-sheet .glist-title { margin-top: 0; }
      .pp-sheet .next-step, .pp-sheet .callout { margin: 0; }
      .gl-row.pp-avrow + .gl-row.pp-avrow::before { left: 64px; }
      .pp-action { color: var(--tint); font-weight: 500; }
      .pp-action.is-danger { color: var(--red); }
      .pp-net { color: var(--ink); font-weight: 600; }
      .pp-money { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
      .pp-tag { font-family: var(--mono); font-size: 12px; letter-spacing: 0; color: var(--muted); }
      .pp-strike { text-decoration: line-through; color: var(--muted); }
      .pp-modal .modal-foot { flex-wrap: wrap; }
      .modal-body .pp-total { position: sticky; bottom: -22px; margin-bottom: -6px; padding-bottom: 12px; background: var(--raised); }
      .pp-cal-wrap { margin-top: 4px; }
      .pp-cal-d[data-act] { cursor: pointer; }
      .pp-cal-d[data-act]:hover { box-shadow: inset 0 0 0 2px var(--line); }
      .pp-cal-d.is-today[data-act]:hover { box-shadow: inset 0 0 0 2px var(--tint); }
      .pp-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 4px; background: var(--fill-3); }
      .pp-swatch.is-green { background: var(--green-solid); } .pp-swatch.is-amber { background: var(--amber-solid); }
      .pp-swatch.is-blue { background: var(--blue-solid); } .pp-swatch.is-red { background: var(--red-solid); }
      .pp-swatch.is-off { background: none; box-shadow: inset 0 0 0 1px var(--line); }
      .pp-reg-row.is-off .pp-who { opacity: .55; }
      .pp-clear { height: 30px; padding: 0 8px; }
      .pp-bal { font-variant-numeric: tabular-nums; }
      .pp-bal small { display: block; font-size: 12px; color: var(--muted); }
      .pp-bal.is-over, .pp-bal.is-over small { color: var(--red); }
      .pp-timeline { margin-top: 6px; }
      /* A register row needs about 780px on one line; narrower cards (a tablet, or a laptop window beside the sidebar)
         put the in-time under the status buttons. */
      @media (max-width: 1180px) {
        .pp-reg-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 10px; }
        .pp-reg-row .pp-who { grid-row: span 2; }
      }
      @media (max-width: 760px) {
        .pp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .pp-person { padding: 20px 10px 16px; }
        .pp-reg-row { grid-template-columns: 1fr; gap: 10px; padding: 14px 18px; }
        .pp-reg-row .pp-who { grid-row: auto; }
        .pp-reg-row + .pp-reg-row::before, .pp-leave + .pp-leave::before { left: 18px; }
        .pp-st { display: flex; }
        .pp-st button { flex: 1; justify-content: center; padding: 0 6px; }
        .pp-time-cell { justify-content: flex-start; }
        .pp-leave { padding: 16px 18px; }
        .pp-cal-d { height: 38px; }
      }
    `;
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------------- constants & helpers */
  // Route keys stay as they were (other screens link to them); the labels are what people read.
  const TABS = [
    { key: 'hr', label: 'Staff' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'leave', label: 'Leave' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'assets', label: 'Assets' },
    { key: 'compliance', label: 'Licences' },
  ];
  const TAB_ALIAS = { staff: 'hr', people: 'hr', licences: 'compliance', licenses: 'compliance' };
  const STATUSES = [
    { k: 'Present', tone: 'green', icon: 'check' },
    { k: 'Late', tone: 'amber', icon: 'clock' },
    { k: 'Leave', tone: 'blue', icon: 'calendar' },
    { k: 'Absent', tone: 'red', icon: 'x' },
  ];
  const DEPT = { 'Managing Director': 'Management', 'Sales Manager': 'Sales', 'Sales Consultant': 'Sales', 'Service Manager': 'After-sales', 'Service Advisor': 'After-sales', 'Technician': 'After-sales', 'Accounts': 'Back office', 'Procurement': 'Back office', 'Admin & HR': 'Back office', 'Driver': 'Back office' };
  /* The part of the business a salary is booked to (the names Accounts uses). */
  const CENTRE = { 'Sales Manager': 'Showroom', 'Sales Consultant': 'Showroom', 'Service Manager': 'Workshop', 'Service Advisor': 'Workshop', 'Technician': 'Workshop', 'Procurement': 'Warehouse', 'Driver': 'Warehouse' };
  const ASSET_CATS = ['Vehicle', 'Workshop equipment', 'Charging', 'IT', 'Furniture', 'Office equipment', 'Signage & display', 'Other'];
  const CONDITIONS = ['New', 'Good', 'Fair', 'Needs repair'];   // “Disposed” is set by Dispose, with a reason
  const COND_TONE = { New: 'blue', Good: 'green', Fair: 'amber', 'Needs repair': 'red', Disposed: 'gray' };
  const LEAVE_YEARLY = { Casual: 10, Sick: 14 };                  // Bangladesh Labour Act; annual leave is earned
  const PAY_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'bKash / Nagad'];

  /* Who may do what on this screen (the office server enforces the same). */
  const canHR = () => NA.can('hr.manage');                // Admin & HR, Managing Director
  const canPayView = () => NA.can('payroll.view');        // … and Accounts
  const canPay = () => NA.can('finance.manage');          // Accounts or the Managing Director record the salary payment
  const isMD = () => NA.isRole('owner');
  /** The office server lets only Admin & HR and the Managing Director change the payroll document … */
  const canWritePayroll = () => NA.isRole('owner', 'hr');
  /** … except that Accounts may stamp an approved month as paid (status and the payment fields, nothing else). */
  const canStampPaid = () => canWritePayroll() || canPay();
  const TAB_OK = {
    hr: () => NA.canSee('admin') || canPayView(),
    attendance: canHR,
    leave: canHR,
    payroll: canPayView,
    assets: () => canHR() || NA.can('finance.manage'),
    compliance: () => canHR() || NA.can('finance.manage'),
  };
  const STD_DOCS = [
    { name: 'Trade Licence', authority: 'DNCC / DSCC' },
    { name: 'TIN Certificate', authority: 'NBR' },
    { name: 'VAT Registration (BIN)', authority: 'NBR' },
    { name: 'Import Registration Certificate (IRC)', authority: 'CCI&E' },
    { name: 'Fire Licence — Showroom', authority: 'Fire Service & Civil Defence' },
    { name: 'BYD Dealership Agreement', authority: 'BYD Auto' },
    { name: 'Environmental Clearance — Workshop', authority: 'Dept. of Environment' },
    { name: 'Chamber Membership', authority: 'DCCI / FBCCI' },
    { name: 'Showroom Lease Agreement', authority: 'Landlord' },
  ];

  const pad2 = (n) => String(n).padStart(2, '0');
  const dow = (iso) => new Date(iso + 'T00:00:00').getDay();
  const isFriday = (iso) => dow(iso) === 5;
  /** Days off: Friday (the weekly holiday) and the public holidays listed in Settings. They never count as working
      days, for attendance, leave or pay. */
  const isOff = (iso) => (typeof NA.isHoliday === 'function' ? NA.isHoliday(iso) : isFriday(iso));
  /** The name Settings gives this public holiday, or ''. Entries are { date, name } or plain 'yyyy-mm-dd' strings. */
  function holidayName(iso) {
    const h = ((NA.db.settings && NA.db.settings.holidays) || []).find((x) => (typeof x === 'string' ? x : x && x.date) === iso);
    return h && typeof h === 'object' && h.name ? String(h.name) : '';
  }
  /** A day off in a few words, for a badge: “Weekly holiday”, “Eid ul-Fitr”. */
  const offShort = (iso) => (isFriday(iso) ? 'Weekly holiday' : holidayName(iso) || 'Public holiday');
  /** For a calendar day: “Friday, weekly holiday”, “Eid ul-Fitr, public holiday”. */
  const offLong = (iso) => (isFriday(iso) ? 'Friday, weekly holiday' : holidayName(iso) ? holidayName(iso) + ', public holiday' : 'Public holiday');
  /** Why a day is off, as a sentence: “Friday is the weekly holiday”, “Eid ul-Fitr is a public holiday”. */
  const offText = (iso) => (isFriday(iso) ? 'Friday is the weekly holiday' : holidayName(iso) ? holidayName(iso) + ' is a public holiday' : 'This day is a public holiday');
  const monthOf = (iso) => String(iso || NA.today()).slice(0, 7);
  const daysInMonth = (k) => { const p = k.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); };
  const monthLabel = (k) => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
  const shiftMonth = (k, n) => NA.addMonths(k + '-01', n).slice(0, 7);
  const weekday = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
  const nowTime = () => { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const monthStart = (k) => k + '-01';
  const monthEnd = (k) => k + '-' + pad2(daysInMonth(k));
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ''));
  const plural = (n, word, many) => n + ' ' + (n === 1 ? word : many || word + 's');
  /** 'HH:MM' (a time typed as '9:15' reads as '09:15', so times compare as text); '' when it is not a time. */
  const hhmm = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '').trim()); return m ? pad2(m[1]) + ':' + m[2] : ''; };
  /** Office hours from Settings, else the office’s usual hours from NA.defaultSettings(). */
  const timeSetting = (key) => hhmm(NA.db.settings && NA.db.settings[key]) || hhmm(NA.defaultSettings()[key]);
  const officeStart = () => timeSetting('officeStart');
  /** Coming in after this time is late. */
  const lateAfter = () => timeSetting('lateAfter');
  /** Changes to a day older than this ask for a reason and are recorded. */
  const isOld = (date) => date < NA.addDays(NA.today(), -2);
  /** A grouped-list row: label (and small line) on the left, value on the right. value and sub are html. */
  const glRow = (label, value, sub) => `<div class="gl-row"><div class="gl-main"><b>${esc(label)}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="gl-value">${value == null ? '' : value}</span></div>`;
  const nextStep = (icon, title, small, button) => `<div class="next-step"><span class="ns-icon">${NA.icon(icon, 20)}</span><div class="ns-text"><b>${esc(title)}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>${button || ''}</div>`;
  const lockNote = (text) => `<p class="lock-note">${NA.icon('lock', 14)}${esc(text)}</p>`;

  /* Staff. A person is on the staff from joinDate until leftOn (older records may lack either). */
  const sortStaff = (a, b) => NA.FLOW.staffRoles.indexOf(a.role) - NA.FLOW.staffRoles.indexOf(b.role) || String(a.name || '').localeCompare(String(b.name || ''));
  const leftDate = (s) => (s.active === false ? s.leftOn || String(s.updatedAt || '').slice(0, 10) || '0000-00-00' : null);
  const employedOn = (s, date) => (!s.joinDate || s.joinDate <= date) && (s.active !== false || leftDate(s) >= date);
  const employedInMonth = (s, k) => (!s.joinDate || s.joinDate <= monthEnd(k)) && (s.active !== false || leftDate(s) >= monthStart(k));
  const staffOn = (date) => NA.db.staff.filter((s) => employedOn(s, date)).sort(sortStaff);
  const staffInMonth = (k) => NA.db.staff.filter((s) => employedInMonth(s, k)).sort(sortStaff);

  /* Attendance: one mark per person per day. Two people marking at the same moment can leave a second
     row behind; the newest one counts and the next change tidies the others away. */
  const newest = (list) => list.reduce((best, a) => (!best || String(a.updatedAt || '') > String(best.updatedAt || '') ? a : best), null);
  const attAll = (sid, date) => NA.db.attendance.filter((a) => a.staffId === sid && a.date === date);
  const attNow = (sid, date) => newest(attAll(sid, date));      // always fresh — use it before changing anything
  let attIdx = null;                                             // looked up once per drawing of the screen
  function attFor(sid, date) {
    if (!attIdx) {
      attIdx = new Map();
      NA.db.attendance.forEach((a) => { const key = a.staffId + '|' + a.date; const p = attIdx.get(key); if (!p || String(a.updatedAt || '') > String(p.updatedAt || '')) attIdx.set(key, a); });
    }
    return attIdx.get(sid + '|' + date) || null;
  }
  const statusTone = (st) => (STATUSES.find((x) => x.k === st) || { tone: 'gray' }).tone;
  const lockedText = (k, st) => `${monthLabel(k)} is locked: its payroll ${st === 'pending' ? 'is waiting for the Managing Director' : st === 'approved' ? 'has been approved' : 'has been paid'}`;
  function tenure(join) {
    if (!join) return '';
    const d = NA.daysBetween(join, NA.today());
    if (d < 0) return 'starts ' + NA.fmt.date(join);
    const y = Math.floor(d / 365), m = Math.floor((d % 365) / 30);
    return y ? y + ' yr' + (y > 1 ? 's' : '') + (m ? ' ' + m + ' mo' : '') : m ? m + ' month' + (m > 1 ? 's' : '') : d + ' days';
  }
  /** One person's month: only days they were on the staff count. Fridays and public holidays are days off, so a mark
      on one is extra (shown, never deducted) and never counts as a working day. */
  function monthStats(s, k) {
    const t = NA.today();
    const n = daysInMonth(k);
    const out = { working: 0, Present: 0, Late: 0, Leave: 0, Absent: 0, unpaidLeave: 0, unmarked: 0, holidayWorked: 0, firstUnmarked: '', days: [] };
    for (let i = 1; i <= n; i++) {
      const date = k + '-' + pad2(i);
      const employed = employedOn(s, date);
      const off = isOff(date);
      const future = date > t;
      const rec = employed ? attFor(s.id, date) : null;
      // Approved leave counts even on a day nobody marked (approving it marks the days, but older leave may not be).
      const lv = employed && !rec && !off ? leaveCovering(s.id, date) : null;
      const status = rec ? rec.status : lv ? 'Leave' : '';
      out.days.push({ date, off, fri: off, future, employed, status, rec, leave: lv });   // fri: the older name of off
      if (!employed || future) continue;
      if (off) { if (rec && (rec.status === 'Present' || rec.status === 'Late')) out.holidayWorked++; continue; }
      out.working++;
      if (!status) { out.unmarked++; if (!out.firstUnmarked) out.firstUnmarked = date; continue; }
      if (out[status] != null) out[status]++;
      if (status === 'Leave' && (rec ? rec.leaveType : lv.type) === 'Unpaid') out.unpaidLeave++;
    }
    out.attended = out.Present + out.Late;
    return out;
  }

  /* Leave. Balances count approved leave requests; annual leave is earned by working. */
  const leaveTypes = () => (Array.isArray(NA.LEAVE_TYPES) && NA.LEAVE_TYPES.length ? NA.LEAVE_TYPES : [
    { value: 'Casual', label: 'Casual', icon: 'sun', hint: '10 days a year' }, { value: 'Sick', label: 'Sick', icon: 'shield', hint: '14 days a year' },
    { value: 'Annual', label: 'Annual', icon: 'calendar', hint: 'Earned leave' }, { value: 'Unpaid', label: 'Unpaid', icon: 'clock', hint: 'Without pay' }]);
  /** The days from..to (clipped to lo..hi when given), at most 800. */
  function eachDay(from, to, lo, hi, fn) {
    if (!isDate(from)) return;
    let a = from, b = isDate(to) && to >= from ? to : from;
    if (lo && a < lo) a = lo;
    if (hi && b > hi) b = hi;
    for (let d = a, i = 0; d <= b && i < 800; d = NA.addDays(d, 1), i++) fn(d);
  }
  /** Working days (not Fridays or public holidays) from..to, counting only those inside lo..hi when given. */
  function workdays(from, to, lo, hi) {
    let n = 0;
    eachDay(from, to, lo, hi, (d) => { if (!isOff(d)) n++; });
    return n;
  }
  const leaveCovering = (sid, date) => NA.db.leaves.find((l) => l.staffId === sid && l.status === 'approved' && l.from <= date && date <= (l.to || l.from)) || null;
  /** The days of a leave that count against the yearly allowance (inside lo..hi when given): its working days, except
      days the register shows the person at work or absent, so the balance and the pay always agree. Approving a leave
      marks its days as leave, but never a day they came in, nor a day in a month whose payroll is already sent; so for
      a request not decided yet an Absent day counts only in a month that is still open. */
  function leaveDaysCounted(l, lo, hi) {
    const locked = {};
    let n = 0;
    eachDay(l.from, l.to, lo, hi, (d) => {
      if (isOff(d)) return;
      const rec = attFor(l.staffId, d);
      if (!rec || rec.status === 'Leave') { n++; return; }
      if (l.status !== 'pending' || rec.status !== 'Absent') return;
      const k = monthOf(d);
      if (!(k in locked)) locked[k] = monthLocked(k);
      if (!locked[k]) n++;
    });
    return n;
  }
  function leaveUsed(sid, year) {
    const out = { Casual: 0, Sick: 0, Annual: 0, Unpaid: 0 };
    NA.db.leaves.forEach((l) => {
      if (l.staffId !== sid || l.status !== 'approved') return;
      out[l.type in out ? l.type : 'Casual'] += leaveDaysCounted(l, year + '-01-01', year + '-12-31');
    });
    return out;
  }
  /** Annual (earned) leave: one day for every 18 days worked in the year. */
  function annualEarned(sid, year) {
    let worked = 0;
    NA.db.attendance.forEach((a) => { if (a.staffId === sid && String(a.date).slice(0, 4) === year && (a.status === 'Present' || a.status === 'Late') && !isOff(a.date)) worked++; });
    return Math.floor(worked / 18);
  }
  function balances(sid, year) {
    year = String(year);
    const used = leaveUsed(sid, year);
    return {
      Casual: { used: used.Casual, allowed: LEAVE_YEARLY.Casual },
      Sick: { used: used.Sick, allowed: LEAVE_YEARLY.Sick },
      Annual: { used: used.Annual, allowed: annualEarned(sid, year) },
      Unpaid: { used: used.Unpaid, allowed: null },
    };
  }

  /* Salary. The salary history says from which month each figure applies; older records only have staff.salary.
     It lives in the payroll document (payroll.salaryHistory[staffId]), which only Admin & HR, Accounts and the
     Managing Director receive: staff records go to everyone, and the office server strips only the current salary. */
  function salaryHistory(s) {
    const P = payrollDoc();
    const list = P && P.salaryHistory && Array.isArray(P.salaryHistory[s.id]) ? P.salaryHistory[s.id] : Array.isArray(s.salaryHistory) ? s.salaryHistory : [];
    return list.filter((h) => h && isMonth(h.from)).slice().sort((a, b) => a.from.localeCompare(b.from));
  }
  function setSalaryHistory(sid, list) {
    if (!payrollDoc()) NA.db.payroll = {};
    const P = NA.db.payroll;
    P.salaryHistory = Object.assign({}, P.salaryHistory && typeof P.salaryHistory === 'object' ? P.salaryHistory : {}, { [sid]: list });
    NA.save();
  }
  /** “from October 2026”, or “from the start” for the figure recorded before the history began. */
  const fromLabel = (k) => (String(k) <= '2000-12' ? 'from the start' : 'from ' + monthLabel(k));
  function salaryFor(s, k) {
    const h = salaryHistory(s).filter((x) => x.from <= k);
    return h.length ? num(h[h.length - 1].amount) : num(s.salary);
  }
  const nextSalary = (s, k) => salaryHistory(s).find((x) => x.from > k) || null;

  /* Payroll for a month. Reading never creates anything; ensureRun() is only called when something changes. */
  const payrollDoc = () => (NA.db.payroll && typeof NA.db.payroll === 'object' && !Array.isArray(NA.db.payroll) ? NA.db.payroll : null);
  const runOf = (k) => { const P = payrollDoc(); return (P && P[k] && typeof P[k] === 'object' && P[k]) || null; };
  function ensureRun(k) {
    if (!payrollDoc()) NA.db.payroll = {};
    const P = NA.db.payroll;
    if (!P[k] || typeof P[k] !== 'object') P[k] = { status: 'draft', lines: {} };
    if (!P[k].lines || typeof P[k].lines !== 'object') P[k].lines = {};
    return P[k];
  }
  const pushHistory = (run, text, by) => { run.history = (Array.isArray(run.history) ? run.history : []).concat([{ at: new Date().toISOString(), by: by || NA.me().name, text }]).slice(-50); };
  const expLive = (e) => !['void', 'rejected'].includes(e.status);
  /** The salary expenses booked for month k (one per part of the business). */
  const payrollExpenses = (k) => NA.db.expenses.filter((e) => expLive(e) && (e.payrollMonth === k || String(e.ref || '').startsWith('PAYROLL-' + k)));
  /** Where month k stands: 'draft' | 'pending' | 'approved' | 'paid'. A booked salary expense also means "paid"
      (Accounts' own stamp on the payroll page may not have reached everyone yet). */
  function runState(k) {
    const run = runOf(k);
    const ap = NA.approvals ? NA.approvals.find('payroll', k, 'payroll') : null;
    const own = ap && (!run || !run.approvalId || run.approvalId === ap.id) ? ap : null;
    const sent = run && run.approvalId ? NA.get('approvals', run.approvalId) : null;   // null for people who cannot see it
    const paidExp = payrollExpenses(k);
    let st = run && ['draft', 'pending', 'approved', 'paid'].includes(run.status) ? run.status : 'draft';
    if (st !== 'paid' && paidExp.length) st = 'paid';
    if (st === 'pending' && own && own.status === 'approved') st = 'approved';
    if (st === 'pending' && own && own.status === 'rejected') st = 'draft';
    if (st === 'pending' && sent && sent.status === 'cancelled') st = 'draft';           // withdrawn
    // “Sent back” only when this month’s latest request was declined (not one from before an undo or re-open).
    const declined = st === 'draft' && ap && ap.status === 'rejected' && run && run.approvalId === ap.id ? ap : null;
    return { k, run, ap, st, paidExp, declined };
  }
  /** Calendar days of month k the person was on the staff. */
  function employedDays(s, k) {
    const a = s.joinDate && s.joinDate > monthStart(k) ? s.joinDate : monthStart(k);
    const left = leftDate(s);
    const b = left && left < monthEnd(k) ? left : monthEnd(k);
    return b < a ? 0 : NA.daysBetween(a, b) + 1;
  }
  /** One person's pay for month k: basic (pro-rated to the days on the staff), less absent and unpaid days
      (monthly salary ÷ 30 a day) and other deductions, plus allowance and bonus. */
  function payLine(s, k, run) {
    const st = monthStats(s, k);
    const l = (run && run.lines && run.lines[s.id]) || {};
    const monthly = salaryFor(s, k);
    const n = daysInMonth(k);
    const days = employedDays(s, k);
    const basic = days >= n ? monthly : Math.round((monthly * days) / n);
    const absentDays = st.Absent + st.unpaidLeave;
    const deduction = Math.round((monthly / 30) * absentDays);
    const allowance = num(l.allowance), bonus = num(l.bonus), otherDeduction = num(l.deduct);
    const left = leftDate(s);
    return {
      staffId: s.id, name: s.name, role: s.role, costCentre: CENTRE[s.role] || 'Administration', monthly, basic, days, monthDays: n,
      joined: s.joinDate && s.joinDate > monthStart(k) && s.joinDate <= monthEnd(k) ? s.joinDate : '',
      left: left && left <= monthEnd(k) ? left : '',
      present: st.attended, late: st.Late, leave: st.Leave, unpaidLeave: st.unpaidLeave, absent: st.Absent, absentDays,
      unmarked: st.unmarked, firstUnmarked: st.firstUnmarked, working: st.working,
      deduction, otherDeduction, allowance, bonus, note: l.note || '',
      net: Math.max(0, basic + allowance + bonus - deduction - otherDeduction),
    };
  }
  /** People paid for month k: on the staff that month with a salary (or with extras entered). */
  const liveLines = (k, run) => staffInMonth(k).filter((s) => salaryFor(s, k) > 0 || (run && run.lines && run.lines[s.id])).map((s) => payLine(s, k, run));
  /** Lines saved by the older payroll screen read the same way. */
  const normLine = (l) => Object.assign({ monthly: num(l.basic), days: 0, monthDays: 0, otherDeduction: 0, unpaidLeave: 0, absentDays: num(l.absent), note: '', costCentre: 'Administration', joined: '', left: '' }, l);
  /** Month k's lines as they stand — frozen from the moment they are sent to the Managing Director. */
  function linesOf(k, ps) {
    ps = ps || runState(k);
    if (ps.st !== 'draft' && ps.run && Array.isArray(ps.run.snapshot)) return ps.run.snapshot.map(normLine);
    return liveLines(k, ps.run);
  }
  const totalsOf = (lines) => ({
    basic: sum(lines, (l) => l.basic), deduction: sum(lines, (l) => num(l.deduction) + num(l.otherDeduction)),
    extras: sum(lines, (l) => num(l.allowance) + num(l.bonus)), net: sum(lines, (l) => l.net),
  });
  /** What the approver should notice: people who joined or left, and salary changes this month. */
  function changesIn(k, lines) {
    const joined = lines.filter((l) => l.joined).map((l) => l.name);
    const left = lines.filter((l) => l.left).map((l) => l.name);
    const raised = [];
    lines.forEach((l) => {
      const s = NA.get('staff', l.staffId); if (!s) return;
      const h = salaryHistory(s); const i = h.findIndex((x) => x.from === k);
      if (i > 0) raised.push(`${l.name} ${M(h[i - 1].amount)} → ${M(h[i].amount)}`);
    });
    return [joined.length ? 'New: ' + joined.join(', ') : '', left.length ? 'Leaving: ' + left.join(', ') : '', raised.length ? 'Salary changed: ' + raised.join(', ') : ''].filter(Boolean).join(' · ');
  }
  /** Payroll opens on last month until it is paid, then on this month. */
  function defaultPayMonth() {
    const cur = monthOf(NA.today()), prev = shiftMonth(cur, -1);
    return runState(prev).st !== 'paid' && staffInMonth(prev).some((s) => salaryFor(s, prev) > 0) ? prev : cur;
  }

  /* Licences: renewal shows from 60 days before expiry, red from 30 (the same as Today). */
  function compStatus(doc) {
    if (!doc.expiry) return { key: 'none', tone: 'gray', label: 'Does not expire', days: Infinity };
    const d = NA.daysBetween(NA.today(), doc.expiry);
    if (d < 0) return { key: 'expired', tone: 'red', label: `Expired ${plural(-d, 'day')} ago`, days: d };
    if (d <= 30) return { key: 'due30', tone: 'red', label: d === 0 ? 'Expires today' : `Expires in ${plural(d, 'day')}`, days: d };
    if (d <= 60) return { key: 'due60', tone: 'amber', label: `Expires in ${plural(d, 'day')}`, days: d };
    return { key: 'ok', tone: 'green', label: `Valid for ${plural(d, 'day')}`, days: d };
  }
  const needsRenewal = (st) => ['expired', 'due30', 'due60'].includes(st.key);

  function bars(rows) {
    if (!rows.length) return '<p class="muted small">Nothing to show yet.</p>';
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<div class="pp-bars">${rows.map((r) => `<div class="pp-bar-row"><span>${esc(r.label)}</span><span class="pp-track"><i style="width:${((r.value / max) * 100).toFixed(1)}%"></i></span><b class="num nowrap">${S(r.value)}</b></div>`).join('')}</div>`;
  }

  /* Sheets */
  /** A form sheet: the essentials, with optional fields under “More details”. */
  function sheetForm({ title, subtitle, intro, fields, more, values, submitLabel, size, onSubmit }) {
    const v = values || {};
    const open = (more || []).some((f) => v[f.name] != null && v[f.name] !== '' && v[f.name] !== false);
    return NA.ui.modal({
      title, subtitle: subtitle ? esc(subtitle) : '', size: size || 'md',
      body: `${intro || ''}<form class="modal-form" onsubmit="return false">${NA.ui.form(fields, v)}${more && more.length
        ? `<details class="pp-more"${open ? ' open' : ''}><summary>${NA.icon('chevron-down', 14)}More details</summary><div class="mt-16">${NA.ui.form(more, v)}</div></details>` : ''}</form>`,
      actions: [{ label: 'Cancel' }, { label: submitLabel || 'Save', kind: 'primary', onClick: async (el) => {
        const form = el.querySelector('form');
        if (!NA.ui.validate(form)) return false;
        const r = await onSubmit(NA.ui.readForm(form), el);
        return r === false ? false : true;
      } }],
    });
  }
  /** Ask for a short reason, then run fn(reason). Cancelling redraws the screen so nothing looks changed. */
  function askReason(title, intro, fn, opts) {
    const o = opts || {};
    let done = false;
    NA.ui.modal({
      title, size: 'sm', onClose: () => { if (!done) NA.refresh(); },
      body: `<p class="muted pp-intro">${esc(intro)}</p><form class="modal-form" onsubmit="return false">${NA.ui.field({ name: 'reason', label: o.label || 'Reason', type: 'textarea', rows: 2, required: true, placeholder: o.placeholder || 'e.g. Forgot to mark it on the day' })}</form>`,
      actions: [{ label: o.cancelLabel || 'Cancel' }, { label: o.okLabel || 'Save change', kind: o.danger ? 'danger' : 'primary', onClick: (el) => {
        const f = el.querySelector('form');
        if (!NA.ui.validate(f)) return false;
        done = true;
        fn(String(NA.ui.readForm(f).reason || '').trim());
      } }],
    });
  }

  /* ---------------------------------------------------------------- small helpers for the actions below */
  const stamp = () => { const m = NA.me(); return { by: m.name, byId: m.staffId || null, at: new Date().toISOString() }; };
  /** Open the next sheet once the current one has closed. */
  const later = (fn) => setTimeout(fn, 200);
  /** Attendance is looked up once per drawing; sheets opened later read it afresh. */
  const fresh = () => { attIdx = null; };
  /** A month whose payroll has been sent, approved or paid: its attendance and salaries are frozen. */
  const monthLocked = (k) => runState(k).st !== 'draft';
  /** The first month from..to ('yyyy-mm', up to this month) whose payroll is sent, approved or paid, or ''.
      Only months the payroll page or the salary expenses know about can be. */
  function lockedBetween(from, to) {
    const cur = monthOf(NA.today());
    const hi = to && to < cur ? to : cur;
    const months = new Set(Object.keys(payrollDoc() || {}).filter(isMonth));
    NA.db.expenses.forEach((e) => {
      const m = e.payrollMonth || (String(e.ref || '').startsWith('PAYROLL-') ? String(e.ref).slice(8, 15) : '');
      if (isMonth(m)) months.add(m);
    });
    return Array.from(months).filter((m) => m >= from && m <= hi).sort().find(monthLocked) || '';
  }
  /** Leaving on `left` (or taking that back) changes the pay of that month, unless it is the month’s last day, and of
      every month after it: the first of those whose payroll is already sent, or ''. */
  const lockedAfterLeaving = (left) => (isDate(left) ? lockedBetween(left < monthEnd(monthOf(left)) ? monthOf(left) : shiftMonth(monthOf(left), 1)) : '');
  /** How a sent month goes back to Draft, said to whoever is asking. */
  function reopenHint(k) {
    const st = runState(k).st, md = isMD();
    if (st === 'pending') return md ? 'Decline it on the Payroll tab first.' : 'Withdraw it on the Payroll tab first.';
    if (st === 'paid') return md ? 'Undo its payment on the Payroll tab first.' : 'Ask the Managing Director to undo its payment first.';
    return md ? 'Re-open it on the Payroll tab first.' : 'Ask the Managing Director to re-open it first.';
  }
  const canAssets = () => canHR() || NA.can('finance.manage');
  const canDocs = () => canHR() || NA.can('finance.manage');
  const locs = (keep) => { const l = (NA.db.settings.locations || []).slice(); if (keep && !l.includes(keep)) l.push(keep); return l; };
  const staffOpts = (keep) => NA.db.staff.filter((s) => s.active !== false || s.id === keep).sort(sortStaff).map((s) => ({ value: s.id, label: s.name + ' · ' + (s.role || '') }));
  const normName = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const yearOf = (iso) => String(iso || NA.today()).slice(0, 4);
  const dateRange = (from, to) => (to && to !== from ? NA.fmt.dateShort(from) + ' – ' + NA.fmt.date(to) : NA.fmt.date(from));
  function monthsBetween(from, to) {
    const out = [];
    const end = monthOf(to || from);
    for (let k = monthOf(from), i = 0; k <= end && i < 36; k = shiftMonth(k, 1), i++) out.push(k);
    return out;
  }
  /** A titled grouped list (rows are html); nothing at all when there are no rows. */
  const group = (title, rows, foot) => (rows ? `<section>${title ? `<div class="glist-title">${esc(title)}</div>` : ''}<div class="glist">${rows}</div>${foot ? `<p class="glist-foot">${foot}</p>` : ''}</section>` : '');
  /** A tappable row at the end of a sheet (iOS style): blue text, red for “Mark as left…” and the like. */
  const actionRow = (x, label, danger) => `<button type="button" class="gl-row pp-action${danger ? ' is-danger' : ''}" data-x="${esc(x)}">${esc(label)}</button>`;
  /** A sheet of grouped lists. actions: { name: fn } run once the sheet has closed. */
  function sheet({ title, subtitle, body, actions, size, buttons }) {
    return NA.ui.modal({
      title, subtitle: subtitle || '', size: size || 'md', body: `<div class="pp-sheet">${body}</div>`,
      actions: buttons || [{ label: 'Done', kind: 'primary' }],
      onMount: (el) => {
        el.classList.add('pp-modal');
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-appr-act]')) { NA.ui.closeTop(); return; }       // Approve / Decline are handled globally
          const b = ev.target.closest('[data-x]');
          if (!b || !actions || typeof actions[b.dataset.x] !== 'function') return;
          const fn = actions[b.dataset.x];
          NA.ui.closeTop();
          later(fn);
        });
      },
    });
  }
  /** What changed, in words: ['Job title: A → B', …]. Fields listed in `quiet` only say that they changed. */
  function changeList(before, after, labels, quiet) {
    const out = [];
    Object.keys(labels).forEach((f) => {
      if (!(f in after)) return;
      const a = before[f] == null ? '' : String(before[f]), b = after[f] == null ? '' : String(after[f]);
      if (a === b) return;
      out.push(quiet && quiet.includes(f) ? labels[f] + ' changed' : `${labels[f]}: ${a || '—'} → ${b || '—'}`);
    });
    return out;
  }
  /** Filter cards or rows as you type, without redrawing the page. */
  function filterInPlace(root, input, link) {
    const term = String(input.value || '').trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll('[data-s]').forEach((el) => { const hit = !term || String(el.dataset.s || '').includes(term); el.classList.toggle('hidden', !hit); if (hit) shown++; });
    const none = root.querySelector('[data-none]');
    if (none) none.classList.toggle('hidden', shown > 0);
    try { history.replaceState(null, '', link({ q: String(input.value || '').trim() })); } catch (e) { /* the address bar is not essential */ }
  }

  /* ---------------------------------------------------------------- people */
  /** Today in a word or two. Attendance only for Admin & HR and the Managing Director. */
  function todayStatus(s) {
    const t = NA.today();
    if (s.active === false) return NA.ui.badge('Left' + (s.leftOn ? ' ' + NA.fmt.dateShort(s.leftOn) : ''), 'gray');
    if (s.joinDate && s.joinDate > t) return NA.ui.badge('Starts ' + NA.fmt.dateShort(s.joinDate), 'blue');
    if (!canHR()) return '';
    if (isOff(t)) return `<span class="pp-quiet">${esc(offShort(t))}</span>`;
    const a = attFor(s.id, t);
    if (a) return NA.ui.badge(a.status + (a.inTime && (a.status === 'Present' || a.status === 'Late') ? ' · ' + a.inTime : ''), statusTone(a.status));
    if (leaveCovering(s.id, t)) return NA.ui.badge('On leave', 'blue');
    return '<span class="pp-quiet">Not marked yet</span>';
  }

  function staffTab(q) {
    const term = String(q.q || '').trim().toLowerCase();
    const all = NA.db.staff.slice().sort(sortStaff);
    const active = all.filter((s) => s.active !== false);
    const left = all.filter((s) => s.active === false);
    const deptOf = (s) => DEPT[s.role] || 'Back office';
    const DEPTS = ['Management', 'Sales', 'After-sales', 'Back office'];
    const dept = q.dept === 'left' || DEPTS.includes(q.dept) ? q.dept : 'all';
    const count = (d) => (d === 'all' ? active.length : d === 'left' ? left.length : active.filter((s) => deptOf(s) === d).length);
    const chips = ['all'].concat(DEPTS.filter((d) => count(d) > 0), left.length ? ['left'] : []);
    const label = { all: 'Everyone', left: 'Left' };
    const rows = dept === 'left' ? left : dept === 'all' ? active : active.filter((s) => deptOf(s) === dept);
    const key = (s) => [s.name, s.role, s.phone, s.location, s.email].filter(Boolean).join(' ').toLowerCase();
    const shown = rows.filter((s) => !term || key(s).includes(term)).length;
    const cards = rows.map((s) => `<button type="button" class="pp-person${s.active === false ? ' is-left' : ''}${term && !key(s).includes(term) ? ' hidden' : ''}" data-act="person" data-id="${esc(s.id)}" data-s="${esc(key(s))}">
        ${NA.ui.avatar(s.name, 56)}
        <span class="pp-person-name">${esc(s.name)}</span>
        <span class="pp-person-role">${esc(s.role || '—')}</span>
        <span class="pp-person-status">${todayStatus(s)}</span>
      </button>`).join('');
    return `
      <div class="toolbar">
        <div class="chips">${chips.map((d) => `<button class="chip ${dept === d ? 'active' : ''}" data-act="dept" data-k="${esc(d)}">${esc(label[d] || d)} <span class="n">${count(d)}</span></button>`).join('')}</div>
        <span class="spacer"></span>
        <input type="search" data-search placeholder="Search name, job or phone" value="${esc(q.q || '')}" aria-label="Search people"/>
      </div>
      ${rows.length ? `<div class="pp-grid">${cards}</div>` : ''}
      <div class="card${rows.length && shown ? ' hidden' : ''}" data-none>${NA.ui.empty(!NA.db.staff.length ? 'Nobody on the staff list yet. Add your team to start attendance and payroll.' : rows.length ? 'Nobody matches.' : 'Nobody here.', 'users')}</div>`;
  }

  /** One person: contact, work, pay (Admin & HR, Accounts, MD), this month, leave left, what they look after. */
  function personSheet(id) {
    fresh();
    const s = NA.get('staff', id);
    if (!s) return NA.ui.toast('This person is not on the staff list any more', 'info');
    const k = monthOf(NA.today()), yr = yearOf();
    const hr = canHR(), pay = canPayView();
    const working = s.active !== false;
    const contact = [
      glRow('Mobile', s.phone ? `<a class="btn-link" href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '—'),
      s.email ? glRow('Email', `<a class="btn-link" href="mailto:${esc(s.email)}">${esc(s.email)}</a>`) : '',
      s.emergency && (hr || pay) ? glRow('Emergency contact', esc(s.emergency)) : '',
    ].join('');
    const work = [
      working && hr ? glRow('Today', todayStatus(s)) : '',
      glRow('Job title', esc(s.role || '—')),
      glRow('Works at', esc(s.location || '—')),
      glRow('Joined', esc(NA.fmt.date(s.joinDate)), s.joinDate && working ? esc(tenure(s.joinDate)) : ''),
      !working ? glRow('Last working day', esc(NA.fmt.date(s.leftOn)), esc(s.leftReason || '')) : '',
      glRow('Uses the app as', esc(NA.roleLabel(NA.roleForTitle(s.role)))),
    ].join('');
    let payRows = '', payFoot = '';
    if (pay) {
      const now = salaryFor(s, k), next = nextSalary(s, k);
      const earlier = salaryHistory(s).filter((h) => h.from <= k).slice(0, -1).reverse().slice(0, 3);
      payRows = [
        glRow('Basic salary', now ? M(now) + ' a month' : 'Not set'),
        next ? glRow('Next change', M(next.amount) + ' a month', esc(fromLabel(next.from) + (next.reason ? ' · ' + next.reason : ''))) : '',
        s.bankName || s.bankAccount ? glRow('Bank', esc([s.bankName, s.bankAccount].filter(Boolean).join(' · '))) : '',
        s.nid ? glRow('NID', esc(s.nid)) : '',
      ].join('');
      if (earlier.length) payFoot = 'Before: ' + earlier.map((h) => esc(`${M(h.amount)} ${fromLabel(h.from)}`)).join(' · ');
    }
    let monthRow = '', leaveRows = '';
    if (hr && working) {
      const st = monthStats(s, k);
      const bits = [st.working ? `${st.attended} of ${st.working} working days at work` : 'No working days yet', st.Late ? plural(st.Late, 'late arrival') : '',
        st.Leave ? plural(st.Leave, 'day') + ' leave' : '', st.Absent ? st.Absent + ' absent' : '', st.unmarked ? st.unmarked + ' not marked' : ''].filter(Boolean).join(' · ');
      monthRow = `<button type="button" class="gl-row" data-x="calendar"><div class="gl-main"><b>${esc(monthLabel(k))}</b><small>${esc(bits)}</small></div><span class="gl-value">Calendar</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
    }
    if (hr) {
      const b = balances(s.id, yr);
      leaveRows = ['Casual', 'Sick'].map((t) => {
        const x = b[t], rest = x.allowed - x.used;
        return glRow(t, `${x.used} of ${x.allowed} used`, rest < 0 ? `<span class="tone-red">${-rest} over</span>` : rest + ' left');
      }).join('')
        + glRow('Annual', `${b.Annual.used} used`, `${b.Annual.used > b.Annual.allowed ? '<span class="tone-red">' : ''}${b.Annual.allowed} earned so far${b.Annual.used > b.Annual.allowed ? '</span>' : ''} · one day for every 18 days worked`)
        + (b.Unpaid.used ? glRow('Unpaid', plural(b.Unpaid.used, 'day')) : '');
    }
    const assets = NA.db.assets.filter((a) => a.assignedTo === s.id && a.condition !== 'Disposed');
    const assetRows = assets.map((a) => glRow(a.name, `<span class="pp-tag">${esc(a.tag || '')}</span>`, esc(a.category || ''))).join('');
    const acts = { calendar: () => calendarSheet(s.id, k) };
    let actRows = '';
    if (hr) {
      acts.edit = () => staffForm(NA.get('staff', s.id));
      actRows += actionRow('edit', 'Edit details');
      if (pay) { acts.salary = () => salarySheet(s.id); actRows += actionRow('salary', 'Change salary'); }
      if (working) { acts.left = () => leftSheet(s.id); actRows += actionRow('left', 'Mark as left…', true); }
      else { acts.back = () => rejoin(s.id); actRows += actionRow('back', 'Mark as working here again'); }
    }
    sheet({
      title: s.name, size: 'drawer', subtitle: esc([s.role, s.location].filter(Boolean).join(' · ')),
      body: `${!working ? `<div class="callout callout-info">${NA.icon('info')}<div>${esc(firstName(s.name))} left on ${esc(NA.fmt.date(s.leftOn))}. They stay in past attendance and payroll.${NA.sync && NA.sync.on ? ' ' + esc(signInWords(s)) : ''}</div></div>` : ''}
        ${group('Contact', contact)}
        ${group('Work', work)}
        ${pay ? group('Pay', payRows, payFoot) : ''}
        ${group('Attendance', monthRow)}
        ${group('Leave in ' + yr, leaveRows, hr ? 'Casual 10 and sick 14 days a year. Fridays and public holidays do not count.' : '')}
        ${group('Looks after', assetRows)}
        ${group('', actRows)}`,
      actions: acts,
    });
  }

  /** A month as a calendar (Saturday to Friday), big enough to tap; a day opens that day’s register. */
  function calendarSheet(sid, k) {
    fresh();
    const s = NA.get('staff', sid);
    if (!s) return;
    k = isMonth(k) ? k : monthOf(NA.today());
    const t = NA.today(), cur = monthOf(t);
    const st = monthStats(s, k);
    const lead = (dow(monthStart(k)) + 1) % 7;          // Saturday first
    const cells = Array.from({ length: lead }, () => '<span></span>').join('') + st.days.map((d) => {
      const friIn = d.off && d.rec && (d.rec.status === 'Present' || d.rec.status === 'Late');
      const tone = friIn ? 'is-green' : d.off || !d.employed ? 'is-off' : d.status ? 'is-' + statusTone(d.status) : d.future ? 'is-future' : '';
      const what = friIn ? 'Came in on a day off (' + offLong(d.date) + ')' : d.off ? offLong(d.date) : !d.employed ? 'Not on the staff' : d.status ? d.status + (d.rec && d.rec.inTime ? ' at ' + d.rec.inTime : '') + (d.status === 'Leave' && (d.leave || (d.rec && d.rec.leaveType)) ? ' (' + ((d.rec && d.rec.leaveType) || d.leave.type) + ')' : '') : d.future ? 'Coming up' : 'Not marked';
      const go = d.date <= t && d.employed && canHR();
      return `<button type="button" class="pp-cal-d ${tone}${d.date === t ? ' is-today' : ''}" ${go ? `data-act="day" data-date="${d.date}"` : 'disabled'} title="${esc(NA.fmt.date(d.date) + ' · ' + what)}" aria-label="${esc(NA.fmt.date(d.date) + ', ' + what)}">${Number(d.date.slice(8))}</button>`;
    }).join('');
    const sumRows = [
      glRow('At work', `${st.attended} of ${st.working}`, st.Late ? plural(st.Late, 'late arrival') : ''),
      glRow('Leave', String(st.Leave), st.unpaidLeave ? st.unpaidLeave + ' unpaid' : ''),
      glRow('Absent', String(st.Absent)),
      st.unmarked ? glRow('Not marked', `<span class="tone-amber">${st.unmarked}</span>`) : '',
      st.holidayWorked ? glRow('Came in on a day off', String(st.holidayWorked), 'Extra — never counted as a working day') : '',
    ].join('');
    const buttons = [{ label: 'Previous month', onClick: () => { later(() => calendarSheet(sid, shiftMonth(k, -1))); } }];
    if (k < cur) buttons.push({ label: 'Next month', onClick: () => { later(() => calendarSheet(sid, shiftMonth(k, 1))); } });
    buttons.push({ label: 'Done', kind: 'primary' });
    NA.ui.modal({
      title: s.name, subtitle: esc(monthLabel(k)), size: 'md', actions: buttons,
      body: `<div class="pp-sheet">
        <div class="pp-cal-wrap"><div class="pp-cal">${['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((h) => `<span class="pp-cal-h">${h}</span>`).join('')}${cells}</div>
          <div class="pp-legend">${STATUSES.map((x) => `<span><i class="pp-swatch is-${x.tone}"></i>${x.k}</span>`).join('')}<span><i class="pp-swatch"></i>Not marked</span><span><i class="pp-swatch is-off"></i>Friday or public holiday</span></div></div>
        ${group('', sumRows, canHR() ? 'Tap a day to open that day’s register.' : '')}
      </div>`,
      onMount: (el) => {
        el.classList.add('pp-modal');
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-act="day"]');
          if (!b) return;
          NA.ui.closeTop();
          NA.go('#/admin?tab=attendance&date=' + b.dataset.date);
        });
      },
    });
  }

  /** Add or edit a person: four essentials, the rest under “More details”. Salary changes have their own sheet. */
  function staffForm(s) {
    if (!canHR()) return NA.ui.toast('Admin & HR keeps the staff list', 'error');
    const isNew = !s;
    const pay = canPayView();
    const roles = NA.FLOW.staffRoles.slice();
    if (s && s.role && !roles.includes(s.role)) roles.push(s.role);
    const fields = [
      { name: 'name', label: 'Full name', required: true, span: 2 },
      { name: 'role', label: 'Job title', type: 'select', options: roles, required: true, placeholder: false },
      { name: 'location', label: 'Works at', type: 'select', options: locs(s && s.location), required: true, placeholder: false },
      { name: 'phone', label: 'Mobile', type: 'tel', placeholder: '01XXXXXXXXX' },
      { name: 'joinDate', label: 'First working day', type: 'date', required: true },
    ];
    if (isNew && pay) fields.push({ name: 'salary', label: 'Basic salary a month', type: 'money', span: 2, help: 'Used for payroll. Later changes go through “Change salary”, so earlier months keep the old figure.' });
    const more = [
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'emergency', label: 'Emergency contact', placeholder: 'Name and phone' },
    ].concat(pay ? [{ name: 'nid', label: 'NID number' }, { name: 'bankName', label: 'Bank' }, { name: 'bankAccount', label: 'Account number', span: 2 }] : []);
    sheetForm({
      title: isNew ? 'Add a person' : 'Edit ' + s.name,
      subtitle: isNew ? 'They appear in attendance, payroll and the pickers.' : '',
      fields, more,
      values: s ? Object.assign({}, s) : { joinDate: NA.today(), location: locs()[0], role: 'Sales Consultant' },
      submitLabel: isNew ? 'Add person' : 'Save',
      onSubmit: (v) => {
        v.name = String(v.name || '').trim().replace(/\s+/g, ' ');
        if (v.phone && !/^\+?[0-9 -]{8,16}$/.test(v.phone)) { NA.ui.toast('The mobile number looks wrong', 'error'); return false; }
        const twin = NA.db.staff.find((x) => (!s || x.id !== s.id) && x.active !== false && normName(x.name) === normName(v.name));
        if (twin) { NA.ui.toast(`${twin.name} is already on the staff. Add a middle name or an initial, so the two sign-ins stay apart.`, 'error'); return false; }
        if (s && s.active === false && s.leftOn && v.joinDate > s.leftOn) { NA.ui.toast('The first working day is after the day they left', 'error'); return false; }
        // A payroll already sent for a month this changes would never pay (or would overpay) those days.
        const first = firstName(v.name);
        if (isNew) {
          const k = lockedBetween(monthOf(v.joinDate));
          if (k) { NA.ui.toast(`The ${monthLabel(k)} payroll has already been sent without ${first}. ${reopenHint(k)}`, 'error'); return false; }
        } else if (isDate(v.joinDate) && v.joinDate !== (s.joinDate || '')) {
          // The months between the old and the new first working day change (no old one: every month up to the new one).
          const a = s.joinDate || '0000-01-01', b = v.joinDate;
          const k = lockedBetween(monthOf(a < b ? a : b), monthOf(a < b ? b : a));
          if (k) { NA.ui.toast(`The ${monthLabel(k)} payroll has already been sent with ${first}’s old first working day. ${reopenHint(k)}`, 'error'); return false; }
        }
        const who = stamp();
        if (isNew) {
          const salary = Math.max(0, num(v.salary));
          const rec = NA.insert('staff', Object.assign({}, v, { salary, active: true, addedBy: who.by }));
          if (salary && canWritePayroll()) setSalaryHistory(rec.id, [{ amount: salary, from: monthOf(v.joinDate), by: who.by, byId: who.byId, at: who.at, reason: 'Starting salary' }]);
          NA.log(`${rec.name} joined as ${rec.role} (${rec.location})`, { rec, link: '#/admin?tab=hr', kind: 'success' });
          NA.ui.toast(rec.name + ' added');
        } else {
          delete v.salary;
          const said = changeList(s, v, { name: 'Name', role: 'Job title', location: 'Works at', phone: 'Mobile', email: 'Email', joinDate: 'First working day',
            emergency: 'Emergency contact', nid: 'NID', bankName: 'Bank', bankAccount: 'Account number' }, ['emergency', 'nid', 'bankName', 'bankAccount']);
          if (!said.length) return;
          const titleChanged = v.role !== s.role;        // before the update: s is the stored record itself
          NA.update('staff', s.id, v);
          NA.log(`Staff record of ${v.name} updated — ${said.join('; ')}`, { rec: NA.get('staff', s.id), link: '#/admin?tab=hr' });
          // The sign-in role does not follow the job title; only the Managing Director can change it.
          if (titleChanged && NA.sync && NA.sync.on) {
            NA.ui.toast(NA.can('staff.signins') ? 'Saved. The job title changed: check their sign-in role in Settings → Sign-in and roles.'
              : 'Saved. Ask the Managing Director to change their sign-in role to match the new job title.', 'info');
          } else NA.ui.toast('Saved');
        }
        NA.refresh();
      },
    });
  }

  /** A new salary from a chosen month. Earlier months keep the old figure; months already sent cannot change. */
  function salarySheet(id) {
    const s = NA.get('staff', id);
    if (!s || !canHR() || !canPayView()) return;
    const cur = monthOf(NA.today());
    const now = salaryFor(s, cur);
    let first = cur;
    for (let i = 0; i < 24 && monthLocked(first); i++) first = shiftMonth(first, 1);
    NA.ui.formModal({
      title: 'Change salary', size: 'sm', submitLabel: 'Save new salary',
      subtitle: esc(s.name) + (now ? ' · now ' + esc(M(now)) + ' a month' : ''),
      intro: '<p class="muted pp-intro">Earlier months keep the old salary. Each month’s payroll uses the salary that applies in that month.</p>',
      fields: [
        { name: 'amount', label: 'New basic salary a month', type: 'money', required: true },
        { name: 'from', label: 'From month', type: 'month', required: true, min: first },
        { name: 'reason', label: 'Reason', span: 2, placeholder: 'e.g. Yearly increment' },
      ],
      values: { from: first },
      onSubmit: (v) => {
        if (v.amount === '' || num(v.amount) < 0) { NA.ui.toast('Enter the new salary', 'error'); return false; }
        if (!isMonth(v.from)) { NA.ui.toast('Choose the month it starts', 'error'); return false; }
        if (s.joinDate && v.from < monthOf(s.joinDate)) { NA.ui.toast('That month is before they joined', 'error'); return false; }
        const P = payrollDoc() || {};
        const sent = Object.keys(P).filter((m) => isMonth(m) && m >= v.from && monthLocked(m)).sort()[0];
        if (sent) { NA.ui.toast(`The ${monthLabel(sent)} payroll has already been sent. Choose a later month.`, 'error'); return false; }
        const amount = Math.max(0, num(v.amount));
        const w = stamp();
        let hist = salaryHistory(s).slice();
        if (!hist.length) hist.push({ amount: num(s.salary), from: s.joinDate ? monthOf(s.joinDate) : '2000-01', by: '', at: s.createdAt || '', reason: 'Salary before the history began' });
        hist = hist.filter((h) => h.from !== v.from).concat([{ amount, from: v.from, by: w.by, byId: w.byId, at: w.at, reason: v.reason || '' }]).sort((a, b) => a.from.localeCompare(b.from));
        setSalaryHistory(s.id, hist);
        const current = salaryFor(s, cur);
        if (num(s.salary) !== current) NA.update('staff', s.id, { salary: current });
        // No amounts in the activity feed: managers outside HR read it too.
        NA.log(`Salary of ${s.name} changed ${fromLabel(v.from)}`, { link: '#/admin?tab=hr' });
        NA.ui.toast('New salary saved');
        NA.refresh();
      },
    });
  }

  /** Someone leaves: last working day (on or before today), with a confirmation. */
  function leftSheet(id) {
    const s = NA.get('staff', id);
    if (!s || s.active === false || !canHR()) return;
    NA.ui.formModal({
      title: 'Mark ' + s.name + ' as left', size: 'sm', submitLabel: 'Mark as left',
      intro: '<p class="muted pp-intro">They stay in past attendance and payroll, and are paid up to their last working day. Do this on or after that day.</p>',
      fields: [
        { name: 'leftOn', label: 'Last working day', type: 'date', required: true, min: s.joinDate || '', max: NA.today() },
        { name: 'leftReason', label: 'Reason', type: 'select', options: ['Resigned', 'Contract ended', 'Dismissed', 'Retired', 'Other'], placeholder: 'Choose…' },
      ],
      values: { leftOn: NA.today() },
      onSubmit: async (v) => {
        if (!isDate(v.leftOn) || v.leftOn > NA.today()) { NA.ui.toast('Choose a day up to today', 'error'); return false; }
        if (s.joinDate && v.leftOn < s.joinDate) { NA.ui.toast('That is before they joined', 'error'); return false; }
        const k = lockedAfterLeaving(v.leftOn);
        // A month already sent paid them for the whole month; leaving before its end needs that payroll re-opened.
        if (k) { NA.ui.toast(`The ${monthLabel(k)} payroll has already been sent with ${firstName(s.name)} paid for the whole month. ${reopenHint(k)}`, 'error'); return false; }
        const ok = await NA.ui.confirm(`Mark <b>${esc(s.name)}</b> as left, with <b>${esc(NA.fmt.date(v.leftOn))}</b> as the last working day?`, { title: 'Please confirm', okLabel: 'Mark as left', danger: true });
        if (!ok) return false;
        const w = stamp();
        NA.update('staff', s.id, { active: false, leftOn: v.leftOn, leftReason: v.leftReason || '', leftMarkedBy: w.by, leftMarkedAt: w.at });
        NA.log(`${s.name} left — last working day ${NA.fmt.date(v.leftOn)}${v.leftReason ? ' (' + v.leftReason + ')' : ''}`, { rec: NA.get('staff', s.id), link: '#/admin?tab=hr', kind: 'warn' });
        if (NA.sync && NA.sync.on && signInStays(s)) later(() => signInNote(s));
        else NA.ui.toast(s.name + ' marked as left' + (NA.sync && NA.sync.on ? '. Their sign-in is turned off.' : ''));
        NA.refresh();
      },
    });
  }
  /** The office server signs out a leaver and turns their sign-in off by itself, except the Managing Director’s. */
  const signInStays = (s) => NA.roleForTitle(s.role) === 'owner';
  function signInWords(s) {
    if (!signInStays(s)) return 'Their sign-in is turned off: they were signed out and cannot sign in.';
    return 'The Managing Director’s sign-in is never turned off by itself: ' + (NA.can('staff.signins') ? 'remove it in Settings → Sign-in and roles.' : 'the Managing Director removes it in Settings → Sign-in and roles.');
  }
  /** After a Managing Director leaves: their sign-in still works until it is removed in Settings. */
  function signInNote(s) {
    const md = NA.can('staff.signins');
    NA.ui.modal({
      title: 'Remove the sign-in', size: 'sm',
      body: `<div class="callout callout-warn">${NA.icon('lock')}<div>${esc(firstName(s.name))} can still sign in: the office server turns off a leaver’s sign-in by itself, but not the Managing Director’s. ${md ? 'Remove it in Settings → Sign-in and roles.' : 'Ask the Managing Director to remove it in Settings → Sign-in and roles.'}</div></div>`,
      actions: md ? [{ label: 'Later' }, { label: 'Open Settings', kind: 'primary', onClick: () => { NA.go('#/settings?tab=access'); } }] : [{ label: 'OK', kind: 'primary' }],
    });
  }
  /** Undo a “left” that was a mistake. Someone coming back after a break is added again as a new person. */
  function rejoin(id) {
    const s = NA.get('staff', id);
    if (!s || s.active !== false || !canHR()) return;
    const left = leftDate(s), first = firstName(s.name);
    // A payroll already sent paid them only up to the day they left (and not at all in the months after).
    const k = lockedAfterLeaving(left);
    if (k) {
      const hint = reopenHint(k);
      return NA.ui.toast(k === monthOf(left) ? `The ${monthLabel(k)} payroll has already been sent with ${first} paid up to ${NA.fmt.date(left)}. ${hint}`
        : `The ${monthLabel(k)} payroll has already been sent without ${first}. Someone coming back after a break is added as a new person; if the leaving was a mistake, ${hint.charAt(0).toLowerCase() + hint.slice(1)}`, 'error');
    }
    NA.ui.confirm(`Mark <b>${esc(s.name)}</b> as working here again? Use this when they were marked as left by mistake. Someone who comes back after a break is added as a new person.`, { title: 'Working here again', okLabel: 'Mark as working' }).then((ok) => {
      if (!ok) return;
      const was = s.leftOn;                            // s is the stored record: read it before the update
      NA.update('staff', s.id, { active: true, leftOn: null, leftReason: '' });
      NA.log(`${s.name} marked as working here again (had been marked as left on ${NA.fmt.date(was)})`, { rec: NA.get('staff', s.id), link: '#/admin?tab=hr' });
      NA.ui.toast(s.name + ' is back on the staff list' + (NA.sync && NA.sync.on && !signInStays(s) ? '. A sign-in they had works again.' : ''));
      NA.refresh();
    });
  }

  /* ---------------------------------------------------------------- attendance */
  /** Why this day cannot be changed here, or ''. */
  function markBlock(date, force) {
    if (!canHR()) return 'Only Admin & HR marks attendance';
    if (!isDate(date) || date > NA.today()) return 'Attendance can only be marked for today or earlier';
    if (isOff(date) && !force) return offText(date);
    const k = monthOf(date), st = runState(k).st;
    if (st !== 'draft') return lockedText(k, st);
    return '';
  }
  /** One mark per person per day (status '' clears the day). Stores who marked it and when; tidies duplicates. */
  function setMark(sid, date, status, extra) {
    const list = attAll(sid, date);
    const cur = newest(list);
    let rec = null;
    if (!status) list.forEach((a) => NA.remove('attendance', a.id));
    else {
      const w = stamp();
      const patch = Object.assign({ status, markedBy: w.by, markedById: w.byId, markedAt: w.at }, status === 'Leave' ? {} : { leaveType: null, leaveId: null }, extra || {});
      rec = cur ? NA.update('attendance', cur.id, patch) : NA.insert('attendance', Object.assign({ staffId: sid, date, inTime: '' }, patch));
      list.forEach((a) => { if (a !== cur) NA.remove('attendance', a.id); });
    }
    fresh();
    return rec;
  }
  /** Repaint one register row after an in-time change (no redraw, so Tab moves on to the next box). */
  function paintRow(row, status) {
    if (!row) return;
    row.querySelectorAll('[data-st]').forEach((b) => {
      const x = STATUSES.find((y) => y.k === b.dataset.st) || { tone: 'gray' };
      b.classList.remove('is-green', 'is-amber', 'is-blue', 'is-red');
      if (b.dataset.st === status) b.classList.add('is-' + x.tone);
      b.setAttribute('aria-pressed', String(b.dataset.st === status));
    });
  }
  const OLD_DAY = 'This day is more than two days ago, so the change is kept with a reason.';

  function tapStatus(sid, date, status, force) {
    fresh();
    const why = markBlock(date, force);
    if (why) return NA.ui.toast(why, 'error');
    const s = NA.get('staff', sid);
    if (!s) return;
    const cur = attNow(sid, date);
    if (cur && cur.status === status) return;
    // Leave comes from a leave record (so balances stay right): mark it from approved leave, otherwise record the leave.
    const covering = status === 'Leave' ? leaveCovering(sid, date) : null;
    if (status === 'Leave' && !covering) return recordLeaveForm({ staffId: sid, from: date, to: date });
    const apply = (reason) => {
      const prev = cur && (cur.status === 'Present' || cur.status === 'Late') ? cur.inTime || '' : '';
      const nt = nowTime();
      const inTime = status === 'Present' ? (prev && prev <= lateAfter() ? prev : '')
        : status === 'Late' ? (prev && prev > lateAfter() ? prev : date === NA.today() && nt > lateAfter() ? nt : '') : '';
      setMark(sid, date, status, covering ? { inTime: '', leaveType: covering.type || 'Casual', leaveId: covering.id } : { inTime });
      if (reason) NA.log(`Attendance of ${s.name} on ${NA.fmt.date(date)}: ${cur ? cur.status : 'not marked'} → ${status} — ${reason}`, { link: '#/admin?tab=attendance&date=' + date, kind: 'warn' });
      NA.refresh();
    };
    if (isOld(date)) askReason('Change ' + NA.fmt.date(date), OLD_DAY, apply);
    else apply('');
  }
  function clearMark(sid, date, force) {
    fresh();
    const why = markBlock(date, force);
    if (why) return NA.ui.toast(why, 'error');
    const cur = attNow(sid, date);
    if (!cur) return;
    const s = NA.get('staff', sid) || { name: '' };
    const apply = (reason) => {
      setMark(sid, date, '');
      NA.log(`Attendance of ${s.name} on ${NA.fmt.date(date)} cleared (was ${cur.status})${reason ? ' — ' + reason : ''}`, { link: '#/admin?tab=attendance&date=' + date, kind: reason ? 'warn' : 'info' });
      NA.ui.toast('Mark cleared');
      NA.refresh();
    };
    if (isOld(date)) askReason('Clear ' + NA.fmt.date(date), OLD_DAY, apply);
    else apply('');
  }
  /** Everyone not marked yet: present, or on leave when an approved leave covers the day. No made-up in-times. */
  function markRest(date, force) {
    fresh();
    const why = markBlock(date, force);
    if (why) return NA.ui.toast(why, 'error');
    if (isOff(date)) return NA.ui.toast('On a holiday, mark only the people who came in', 'info');
    const people = staffOn(date).filter((s) => !attNow(s.id, date));
    if (!people.length) return NA.ui.toast('Everyone is marked', 'info');
    const apply = (reason) => {
      let p = 0, l = 0;
      people.forEach((s) => {
        const lv = leaveCovering(s.id, date);
        if (lv) { setMark(s.id, date, 'Leave', { inTime: '', leaveType: lv.type || 'Casual', leaveId: lv.id }); l++; }
        else { setMark(s.id, date, 'Present', { inTime: '' }); p++; }
      });
      NA.log(`Attendance ${NA.fmt.date(date)}: ${plural(p, 'person', 'people')} marked present${l ? ', ' + l + ' on leave' : ''}${reason ? ' — ' + reason : ''}`, { link: '#/admin?tab=attendance&date=' + date, kind: reason ? 'warn' : 'info' });
      NA.ui.toast(`${plural(p, 'person', 'people')} marked present`);
      NA.refresh();
    };
    if (isOld(date)) askReason('Mark ' + NA.fmt.date(date), OLD_DAY, apply);
    else apply('');
  }
  function setInTime(sid, date, value, input, force) {
    fresh();
    const why = markBlock(date, force);
    if (why) { NA.ui.toast(why, 'error'); NA.refresh(); return; }
    const cur = attNow(sid, date);
    if (!cur || (cur.status !== 'Present' && cur.status !== 'Late')) return;
    if ((cur.inTime || '') === (value || '')) return;
    const status = value ? (value > lateAfter() ? 'Late' : 'Present') : cur.status;
    const s = NA.get('staff', sid) || { name: '' };
    const apply = (reason) => {
      setMark(sid, date, status, { inTime: value || '' });
      if (reason) NA.log(`In-time of ${s.name} on ${NA.fmt.date(date)}: ${cur.inTime || '—'} → ${value || '—'} — ${reason}`, { link: '#/admin?tab=attendance&date=' + date, kind: 'warn' });
      paintRow(input && input.closest('[data-row]'), status);
      if (status !== cur.status) NA.ui.toast(status === 'Late' ? `After ${lateAfter()}, so marked late` : `By ${lateAfter()}, so marked present`, 'info');
    };
    if (isOld(date)) askReason('Change ' + NA.fmt.date(date), OLD_DAY, apply);
    else apply('');
  }

  function attendanceTab(date, force) {
    const t = NA.today();
    const k = monthOf(date);
    const off = isOff(date);                     // Friday or a public holiday
    const people = staffOn(date);
    const block = markBlock(date, force);
    const canMark = !block;
    const rows = people.map((s) => {
      const a = attFor(s.id, date);
      const lv = !a ? leaveCovering(s.id, date) : null;
      return { s, a, lv, status: a ? a.status : lv ? 'Leave' : '' };
    });
    const cnt = (st) => rows.filter((x) => x.status === st).length;
    const unmarked = off ? 0 : rows.filter((x) => !x.status).length;
    const clearBtn = (s) => (canMark ? `<button type="button" class="btn btn-plain btn-sm pp-clear" data-act="att-clear" data-sid="${esc(s.id)}">Clear</button>` : '');
    const register = rows.map(({ s, a, lv, status }) => {
      let cell;
      if (status === 'Present' || status === 'Late') cell = `<input type="time" class="pp-time" data-intime="${esc(s.id)}" value="${esc((a && a.inTime) || '')}" aria-label="In-time for ${esc(s.name)}" ${canMark ? '' : 'disabled'}/>${clearBtn(s)}`;
      else if (status === 'Leave') cell = `<span class="pp-quiet">${esc(((a && a.leaveType) || (lv && lv.type) || 'Paid') + ' leave')}</span>${a && !a.leaveId ? clearBtn(s) : ''}`;
      else if (status === 'Absent') cell = `<span class="pp-quiet">Not in</span>${clearBtn(s)}`;
      else cell = `<span class="pp-quiet">${off ? 'Holiday' : 'Not marked'}</span>`;
      return `<div class="pp-reg-row" data-row="${esc(s.id)}">
        <div class="pp-who">${NA.ui.avatar(s.name, 36)}<div class="pp-who-text"><b>${esc(s.name)}</b><small>${esc(s.role || '')}${s.location ? ' · ' + esc(s.location) : ''}</small></div></div>
        <div class="pp-st" role="group" aria-label="${esc('Attendance for ' + s.name)}">${STATUSES.map((x) => `<button type="button" data-act="att" data-sid="${esc(s.id)}" data-st="${x.k}" class="${status === x.k ? 'is-' + x.tone : ''}" aria-pressed="${status === x.k}" ${canMark ? '' : 'disabled'}>${NA.icon(x.icon, 15)}${x.k}</button>`).join('')}</div>
        <div class="pp-time-cell">${cell}</div>
      </div>`;
    }).join('');

    let banner = '';
    if (off && !force) banner = `<div class="callout callout-info">${NA.icon('calendar')}<div class="grow"><b>${esc(offText(date))}.</b> Nothing needs marking. If the showroom opened (a launch event, say), you can still note who came in.</div>${canHR() && !monthLocked(k) ? NA.ui.btn('Note who came in', { size: 'sm', act: 'force' }) : ''}</div>`;
    else if (block) banner = lockNote(block);
    else if (off) banner = `<div class="callout callout-info">${NA.icon('info')}<div>Marks on a holiday are extra: they never count as a working day and are never taken off anyone’s pay.</div></div>`;
    else if (unmarked && people.length) banner = nextStep('clock', `${unmarked} of ${people.length} not marked yet`, 'Tap a status for each person, or mark everyone left as present.', NA.ui.btn('Mark the rest present', { kind: 'primary', icon: 'check', act: 'att-rest' }));
    else if (people.length) banner = `<div class="callout callout-ok">${NA.icon('check-circle')}<div><b>Everyone is marked.</b> ${cnt('Present')} present, ${cnt('Late')} late, ${cnt('Leave')} on leave, ${cnt('Absent')} absent.</div></div>`;

    const month = staffInMonth(k).map((s) => Object.assign({ s }, monthStats(s, k)));
    const table = NA.ui.table([
      { label: 'Person', render: (x) => `<div class="row">${NA.ui.avatar(x.s.name, 30)}<div><div class="cell-main">${esc(x.s.name)}</div><div class="cell-sub">${esc(x.s.role || '')}${x.s.active === false ? ' · left ' + esc(NA.fmt.dateShort(x.s.leftOn)) : ''}</div></div></div>` },
      { label: 'At work', cls: 'right nowrap', render: (x) => `<b>${x.attended}</b><span class="muted"> of ${x.working}</span>` },
      { label: 'Late', cls: 'right', render: (x) => (x.Late ? `<span class="tone-amber">${x.Late}</span>` : '<span class="muted">0</span>') },
      { label: 'Leave', cls: 'right', render: (x) => (x.Leave ? `<span class="tone-blue">${x.Leave}</span>` : '<span class="muted">0</span>') },
      { label: 'Absent', cls: 'right', render: (x) => (x.Absent ? `<span class="tone-red">${x.Absent}</span>` : '<span class="muted">0</span>') },
      { label: 'Not marked', cls: 'right', render: (x) => (x.unmarked ? `<span class="tone-amber">${x.unmarked}</span>` : '<span class="muted">0</span>') },
      { label: 'Attendance', render: (x) => { const r = x.working ? x.attended / x.working : 0; return `<div class="pp-rate">${NA.ui.progress(r, r >= 0.9 ? 'green' : r >= 0.75 ? 'amber' : 'red')}<div class="cell-sub">${x.working ? NA.fmt.pct(r) : '—'}</div></div>`; } },
    ], month, { empty: 'Nobody was on the staff this month', emptyIcon: 'users', rowAttr: (x) => `class="clickable" data-act="cal" data-id="${esc(x.s.id)}" tabindex="0"` });

    const nav = `<div class="pp-nav">
        <div class="seg" role="group" aria-label="Day"><button type="button" data-act="day" data-n="-1" aria-label="Previous day">${NA.icon('chevron-left', 16)}</button><button type="button" data-act="day" data-n="1" aria-label="Next day" ${date >= t ? 'disabled' : ''}>${NA.icon('chevron-right', 16)}</button></div>
        <input type="date" data-date-pick value="${esc(date)}" max="${esc(t)}" aria-label="Day"/>
        ${date !== t ? NA.ui.btn('Today', { act: 'today', size: 'sm' }) : ''}
        <b class="pp-nav-label">${esc(weekday(date))}</b>
      </div>`;
    return `
      <div class="toolbar">${nav}<span class="spacer"></span><span class="pp-hours">Office opens ${esc(officeStart())} · late after ${esc(lateAfter())}</span></div>
      ${banner ? `<div class="pp-next">${banner}</div>` : ''}
      <section class="card">
        <header class="card-head"><h3>${esc(NA.fmt.date(date))}</h3><span class="small muted">${canMark && isOld(date) ? 'More than two days ago: changes ask for a reason' : plural(people.length, 'person', 'people')}</span></header>
        ${people.length ? `<div class="pp-list">${register}</div>` : `<div class="card-body">${NA.ui.empty('Nobody was on the staff on this day.', 'users')}</div>`}
      </section>
      <section class="pp-section">
        <div class="row-between pp-head"><h2 class="section-title">${esc(monthLabel(k))}</h2><span class="small muted">Tap a person to see their month</span></div>
        <div class="card">${table}</div>
      </section>`;
  }

  /* ---------------------------------------------------------------- leave */
  /** Approved leave marks its days as Leave in attendance: not Fridays or public holidays, not days the person came in,
      not frozen months. */
  function markLeaveDays(lv, by) {
    const out = { n: 0, skipped: 0 };
    if (!lv || !isDate(lv.from)) return out;
    const to = isDate(lv.to) && lv.to >= lv.from ? lv.to : lv.from;
    for (let d = lv.from, i = 0; d <= to && i < 400; d = NA.addDays(d, 1), i++) {
      if (isOff(d)) continue;
      if (monthLocked(monthOf(d))) { out.skipped++; continue; }
      const cur = attNow(lv.staffId, d);
      if (cur && (cur.status === 'Present' || cur.status === 'Late')) continue;
      setMark(lv.staffId, d, 'Leave', { inTime: '', leaveType: lv.type || 'Casual', leaveId: lv.id, markedBy: by || NA.me().name });
      out.n++;
    }
    return out;
  }
  /** Take a leave’s automatic marks off the register from `fromDate` on (cancelled or shortened leave). */
  function unmarkLeaveDays(lv, fromDate) {
    NA.db.attendance.filter((a) => a.leaveId === lv.id && a.status === 'Leave' && a.date >= fromDate && !monthLocked(monthOf(a.date)))
      .forEach((a) => NA.remove('attendance', a.id));
    fresh();
  }

  /** Admin & HR records leave someone asked for in person. Approved at once, except Admin & HR’s own (the MD decides). */
  function recordLeaveForm(prefill) {
    fresh();
    if (!canHR()) return NA.ui.toast('Admin & HR records leave', 'error');
    const p = prefill || {};
    const types = leaveTypes();
    NA.ui.formModal({
      title: 'Record leave', size: 'md', submitLabel: 'Save leave',
      intro: '<p class="muted pp-intro">For leave someone asked for in person or by phone. The days are marked as leave in attendance.</p>',
      fields: [
        { name: 'staffId', label: 'Who', type: 'select', options: staffOpts(p.staffId), required: true, span: 2 },
        { name: 'type', label: 'Type', type: 'radio-cards', options: types, required: true, span: 2 },
        { name: 'from', label: 'From', type: 'date', required: true },
        { name: 'to', label: 'To (last day of leave)', type: 'date', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', rows: 2, span: 2, placeholder: 'Optional' },
      ],
      values: Object.assign({ type: 'Casual', from: NA.today(), to: NA.today() }, p),
      onSubmit: async (v) => {
        fresh();                                        // the balance below reads the register as it is now
        const s = NA.get('staff', v.staffId);
        if (!s) { NA.ui.toast('Choose who is on leave', 'error'); return false; }
        if (!isDate(v.from) || !isDate(v.to) || v.to < v.from) { NA.ui.toast('The last day is before the first day', 'error'); return false; }
        const days = workdays(v.from, v.to);
        if (!days) { NA.ui.toast('Those days are all holidays', 'error'); return false; }
        if (s.joinDate && v.from < s.joinDate) { NA.ui.toast(`${firstName(s.name)} had not joined yet`, 'error'); return false; }
        const overlap = NA.db.leaves.find((l) => l.staffId === s.id && ['pending', 'approved'].includes(l.status) && l.from <= v.to && (l.to || l.from) >= v.from);
        if (overlap) { NA.ui.toast(`${firstName(s.name)} already has ${String(overlap.type || '').toLowerCase()} leave ${dateRange(overlap.from, overlap.to)}`, 'error'); return false; }
        const frozen = monthsBetween(v.from, v.to).find(monthLocked);
        if (frozen) { NA.ui.toast(lockedText(frozen, runState(frozen).st), 'error'); return false; }
        const bal = balances(s.id, yearOf(v.from))[v.type];
        if (bal && bal.allowed != null && bal.used + days > bal.allowed
          && !(await NA.ui.confirm(`This takes ${esc(firstName(s.name))}’s ${esc(String(v.type).toLowerCase())} leave to <b>${bal.used + days} of ${bal.allowed} days</b> this year. Save it anyway?`, { title: 'More than the yearly allowance', okLabel: 'Save anyway' }))) return false;
        const w = stamp();
        const lv = NA.insert('leaves', { staffId: s.id, staffName: s.name, type: v.type, from: v.from, to: v.to, days, reason: v.reason || '', status: 'pending', recordedBy: w.by, recordedById: w.byId });
        // Admin & HR approves leave, but never their own: that waits for the Managing Director.
        const own = s.id === NA.myStaffId() && !isMD();
        const a = NA.approvals.request({ type: 'leave', ref: { c: 'leaves', id: lv.id, code: '' }, amount: 0, title: `${s.name}: ${plural(days, 'day')} ${String(v.type).toLowerCase()} leave`,
          detail: dateRange(v.from, v.to), reason: v.reason || '', selfApprove: own ? false : undefined });
        if (a.status === 'approved' && (NA.get('leaves', lv.id) || {}).status !== 'approved') NA.update('leaves', lv.id, { status: 'approved', decidedBy: a.decidedBy, decidedAt: a.decidedAt });
        NA.ui.toast(a.status === 'approved' ? 'Leave saved and marked in attendance' : 'Your own leave goes to the Managing Director', a.status === 'approved' ? 'success' : 'info');
        NA.refresh();
      },
    });
  }

  /** Approved leave: cancel it (before it starts, or afterwards when it was recorded by mistake), or record that the
      person came back early. mode: 'cancel' | 'back'; without one, leave that has started offers Back early. */
  function leaveEndSheet(id, mode) {
    fresh();
    const lv = NA.get('leaves', id);
    if (!lv || lv.status !== 'approved' || !canHR()) return;
    const t = NA.today(), name = lv.staffName || NA.staffName(lv.staffId);
    const to = lv.to || lv.from;
    const canBack = lv.from <= t && t <= to && to > lv.from;     // started, not over, and more than one day
    if (!((mode ? mode === 'back' : lv.from <= t) && canBack)) {
      // Days in a month whose payroll is already sent were paid as leave: they cannot change any more.
      const frozen = monthsBetween(lv.from, to).find(monthLocked);
      if (frozen) return NA.ui.toast(`${lockedText(frozen, runState(frozen).st)}. ${reopenHint(frozen)}`, 'error');
      const started = lv.from <= t;
      askReason('Cancel this leave', `${name}: ${String(lv.type || '').toLowerCase()} leave, ${dateRange(lv.from, lv.to)}. ${started
        ? 'Use this when it was recorded by mistake. Its days come off the attendance register and the yearly allowance, so mark those days again.'
        : 'The days come off the attendance register.'}`, (reason) => {
        fresh();
        const now = NA.get('leaves', lv.id);
        if (!now || now.status !== 'approved') return;
        unmarkLeaveDays(now, now.from);
        NA.update('leaves', now.id, { status: 'cancelled', cancel: Object.assign(stamp(), { reason }) });
        NA.log(`${name}’s ${String(lv.type || '').toLowerCase()} leave ${dateRange(lv.from, lv.to)} cancelled — ${reason}`, { rec: NA.get('leaves', lv.id), link: '#/admin?tab=leave', kind: started ? 'warn' : 'info' });
        NA.ui.toast(started ? 'Leave cancelled. Mark those days on the register again.' : 'Leave cancelled');
        NA.refresh();
      }, { okLabel: 'Cancel leave', cancelLabel: 'Keep it', danger: true, placeholder: started ? 'e.g. Recorded for the wrong person' : 'e.g. Plans changed' });
      return;
    }
    NA.ui.formModal({
      title: 'Back early', size: 'sm', submitLabel: 'Save',
      subtitle: esc(`${name} · ${lv.type || ''} leave · ${dateRange(lv.from, to)}`),
      intro: '<p class="muted pp-intro">The leave ends the day before. Later days come off the register, and only the days taken count against the yearly allowance.</p>',
      fields: [{ name: 'back', label: 'Back at work on', type: 'date', required: true, min: NA.addDays(lv.from, 1), max: to }],
      values: { back: t > lv.from && t <= to ? t : to },
      onSubmit: (v) => {
        if (!isDate(v.back) || v.back <= lv.from || v.back > to) { NA.ui.toast('Choose a day after the leave started and up to its last day', 'error'); return false; }
        if (monthLocked(monthOf(v.back))) { NA.ui.toast(lockedText(monthOf(v.back), runState(monthOf(v.back)).st), 'error'); return false; }
        const end = NA.addDays(v.back, -1);
        unmarkLeaveDays(lv, v.back);
        NA.update('leaves', lv.id, { to: end, days: workdays(lv.from, end), shortened: Object.assign(stamp(), { originalTo: to }) });
        NA.log(`${name} came back from leave on ${NA.fmt.date(v.back)} (leave had been until ${NA.fmt.date(to)})`, { rec: NA.get('leaves', lv.id), link: '#/admin?tab=leave' });
        NA.ui.toast('Saved');
        NA.refresh();
      },
    });
  }

  /** For a pending leave without an approval request (older data): decide it here. */
  function decideLeaveDirect(id, ok) {
    fresh();
    const lv = NA.get('leaves', id);
    if (!lv || lv.status !== 'pending' || !canHR()) return;
    if (lv.staffId === NA.myStaffId() && !isMD()) return NA.ui.toast('The Managing Director decides your own leave', 'error');
    const name = lv.staffName || NA.staffName(lv.staffId);
    const done = (note) => {
      const w = stamp();
      NA.update('leaves', lv.id, { status: ok ? 'approved' : 'rejected', decidedBy: w.by, decidedAt: w.at, note: note || '' });
      if (ok) markLeaveDays(NA.get('leaves', lv.id), w.by);
      NA.log(`${name}’s leave ${ok ? 'approved' : 'declined'} by ${w.by}${note ? ' — ' + note : ''}`, { rec: NA.get('leaves', lv.id), link: '#/admin?tab=leave', kind: ok ? 'success' : 'warn' });
      NA.ui.toast(ok ? 'Approved' : 'Declined');
      NA.refresh();
    };
    if (ok) done('');
    else askReason('Decline leave', `${name}: ${dateRange(lv.from, lv.to)}.`, done, { okLabel: 'Decline', danger: true, label: 'Reason (they see this)', placeholder: 'e.g. Two people are already off that week' });
  }

  function leaveRow(l) {
    const t = NA.today();
    const name = l.staffName || NA.staffName(l.staffId);
    const days = num(l.days) || workdays(l.from, l.to);
    const y = yearOf(l.from);
    const b = balances(l.staffId, y)[l.type];
    let bal = '';
    if (b && b.allowed != null) {
      const total = b.used + (l.status === 'pending' ? leaveDaysCounted(l, y + '-01-01', y + '-12-31') : 0);
      const over = total > b.allowed;
      bal = `<small class="${over ? 'tone-red' : ''}">${esc(l.type)} leave in ${esc(y)}: ${l.status === 'pending' ? `${total} of ${b.allowed} days with this request` : `${b.used} of ${b.allowed} days used`}${over ? ' — more than the yearly allowance' : ''}</small>`;
    }
    // Approved leave never overrides the register: a day it shows them at work or absent does not count as leave.
    const wd = workdays(l.from, l.to);
    const counted = l.status === 'approved' ? leaveDaysCounted(l) : wd;
    if (counted < wd) bal += `<small>${plural(counted, 'day')} of ${wd} count${counted === 1 ? 's' : ''} as leave: the register shows ${esc(firstName(name))} at work or absent on the others.</small>`;
    const ap = NA.approvals ? NA.approvals.find('leaves', l.id, 'leave') : null;
    let below = '', side = '';
    if (l.status === 'pending') {
      below = ap ? NA.ui.approvalBanner(ap) : canHR()
        ? `<div class="appr"><span class="appr-ico">${NA.icon('clock', 18)}</span><div class="appr-text"><b>Waiting for a decision</b><small>Asked ${esc(NA.fmt.ago(l.createdAt))}</small></div><div class="appr-actions"><button class="btn btn-sm btn-ghost" data-act="leave-no" data-id="${esc(l.id)}">Decline</button><button class="btn btn-sm btn-primary" data-act="leave-ok" data-id="${esc(l.id)}">Approve</button></div></div>` : '';
      // Approving does not touch a month whose payroll is already sent: say so before anyone approves.
      const k = canHR() ? monthsBetween(l.from, l.to || l.from).find(monthLocked) : '';
      if (k) below += lockNote(`The ${monthLabel(k)} payroll has already been sent, so its days stay as they are marked even if this is approved. ${reopenHint(k)}`);
    } else {
      side = { approved: NA.ui.badge('Approved', 'green'), rejected: NA.ui.badge('Declined', 'red'), cancelled: NA.ui.badge('Cancelled', 'gray') }[l.status] || '';
      if (l.status === 'approved' && canHR()) {
        const to = l.to || l.from;
        if (l.from <= t && t <= to && to > l.from) side += NA.ui.btn('Back early', { size: 'sm', act: 'leave-end', attrs: `data-id="${esc(l.id)}" data-mode="back"` });
        side += NA.ui.btn('Cancel leave', { size: 'sm', act: 'leave-end', attrs: `data-id="${esc(l.id)}" data-mode="cancel"` });
      }
    }
    const said = l.status === 'rejected' && l.note ? `<div class="pp-reason">Declined: ${esc(l.note)}</div>` : l.status === 'cancelled' && l.cancel && l.cancel.reason ? `<div class="pp-reason">Cancelled: ${esc(l.cancel.reason)}</div>` : '';
    return `<div class="pp-leave">
      <div class="pp-leave-head">${NA.ui.avatar(name, 40)}
        <div class="pp-leave-main"><b>${esc(name)}</b><small>${esc(l.type || 'Leave')} leave · ${plural(days, 'day')} · ${esc(dateRange(l.from, l.to))}</small>${bal}${l.reason ? `<div class="pp-reason">“${esc(l.reason)}”</div>` : ''}${said}</div>
        ${side ? `<div class="row wrap">${side}</div>` : ''}</div>
      ${below}
    </div>`;
  }

  function leaveTab(yr) {
    const t = NA.today();
    const all = NA.db.leaves.slice();
    const pending = all.filter((l) => l.status === 'pending').sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const ahead = all.filter((l) => l.status === 'approved' && (l.to || l.from) >= t).sort((a, b) => String(a.from).localeCompare(String(b.from)));
    const since = NA.addDays(t, -45);
    const recent = all.filter((l) => l.status !== 'pending' && !ahead.includes(l) && String(l.updatedAt || l.createdAt || '').slice(0, 10) >= since)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 20);
    const people = NA.db.staff.filter((s) => (!s.joinDate || s.joinDate <= yr + '-12-31') && (s.active !== false || leftDate(s) >= yr + '-01-01')).sort(sortStaff);
    const cell = (x, kind) => {
      if (kind === 'Unpaid') return x.used ? `<span class="pp-bal">${x.used}</span>` : '<span class="muted">0</span>';
      if (kind === 'Annual') return `<span class="pp-bal${x.used > x.allowed ? ' is-over' : ''}">${x.used} used<small>${x.allowed} earned</small></span>`;
      const rest = x.allowed - x.used;
      return `<span class="pp-bal${rest < 0 ? ' is-over' : ''}">${x.used} of ${x.allowed}<small>${rest < 0 ? -rest + ' over' : rest + ' left'}</small></span>`;
    };
    const table = NA.ui.table([
      { label: 'Person', render: (x) => `<div class="row">${NA.ui.avatar(x.s.name, 30)}<div><div class="cell-main">${esc(x.s.name)}</div><div class="cell-sub">${esc(x.s.role || '')}</div></div></div>` },
      { label: 'Casual', cls: 'right', render: (x) => cell(x.b.Casual, 'Casual') },
      { label: 'Sick', cls: 'right', render: (x) => cell(x.b.Sick, 'Sick') },
      { label: 'Annual (earned)', cls: 'right', render: (x) => cell(x.b.Annual, 'Annual') },
      { label: 'Unpaid', cls: 'right', render: (x) => cell(x.b.Unpaid, 'Unpaid') },
    ], people.map((s) => ({ s, b: balances(s.id, yr) })), { empty: 'Nobody was on the staff that year', emptyIcon: 'users' });
    const list = (title, rows) => (rows.length ? `<section class="pp-block"><div class="glist-title">${esc(title)}</div><div class="card pp-list">${rows.map(leaveRow).join('')}</div></section>` : '');
    const cur = yearOf(t);
    // Every request of the year, newest first: when someone took sick leave in March is one look away.
    const inYear = all.filter((l) => yearOf(l.from) === yr || yearOf(l.to || l.from) === yr).sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')));
    const STATE = { pending: ['Waiting', 'amber'], approved: ['Approved', 'green'], rejected: ['Declined', 'red'], cancelled: ['Cancelled', 'gray'] };
    const yearTable = NA.ui.table([
      { label: 'Person', render: (l) => { const n = l.staffName || NA.staffName(l.staffId); return `<div class="row">${NA.ui.avatar(n, 30)}<div class="cell-main">${esc(n)}</div></div>`; } },
      { label: 'Leave', render: (l) => `<div class="cell-main">${esc(l.type || 'Leave')}</div><div class="cell-sub">${esc(plural(num(l.days) || workdays(l.from, l.to), 'day'))}</div>` },
      { label: 'Dates', cls: 'nowrap', render: (l) => esc(dateRange(l.from, l.to)) },
      { label: 'Status', render: (l) => { const x = STATE[l.status] || [String(l.status || '—'), 'gray']; return NA.ui.badge(x[0], x[1]); } },
    ], inYear, { empty: 'No leave in ' + yr, emptyIcon: 'calendar' });
    return `
      ${list('Waiting for a decision', pending)}
      ${list('On leave now and coming up', ahead)}
      ${!pending.length && !ahead.length ? `<div class="card">${NA.ui.empty('Nobody is waiting for an answer, and nobody is on leave.', 'calendar')}</div>` : ''}
      ${list('Recently', recent)}
      <section class="pp-section">
        <div class="row-between pp-head"><h2 class="section-title">Leave left in ${esc(yr)}</h2>
          <div class="pp-nav"><div class="seg" role="group" aria-label="Year"><button type="button" data-act="year" data-n="-1" aria-label="Previous year">${NA.icon('chevron-left', 16)}</button><button type="button" data-act="year" data-n="1" aria-label="Next year" ${yr >= cur ? 'disabled' : ''}>${NA.icon('chevron-right', 16)}</button></div></div></div>
        <div class="card">${table}</div>
        <p class="glist-foot">Casual 10 and sick 14 days a year (Bangladesh Labour Act). Annual leave is earned: one day for every 18 days worked. Fridays and public holidays do not count, nor days the register shows someone at work or absent.</p>
      </section>
      <section class="pp-section">
        <div class="row-between pp-head"><h2 class="section-title">All leave in ${esc(yr)}</h2><span class="small muted">${esc(plural(inYear.length, 'request'))}</span></div>
        <div class="card">${yearTable}</div>
      </section>`;
  }

  /* ---------------------------------------------------------------- payroll */
  /** Who approved it and when: from the payroll page, or from the approval itself. */
  function approvalOf(ps) {
    const r = ps.run || {};
    const ap = ps.ap && ps.ap.status === 'approved' ? ps.ap : null;
    return { by: r.approvedBy || (ap && ap.decidedBy) || '', at: r.approvedAt || (ap && ap.decidedAt) || '' };
  }
  function paidInfo(ps) {
    const r = ps.run || {}, e = ps.paidExp[0] || {};
    return { on: r.paidAt || e.paidOn || e.date || '', by: r.paidBy || e.paidBy || '', method: r.method || e.method || '', ref: r.payRef || e.payRef || '' };
  }
  const STEP_AT = { draft: 0, pending: 1, approved: 2, paid: 4 };
  function payrollSteps(ps) {
    const r = ps.run || {}, ok = approvalOf(ps), paid = ps.st === 'paid' ? paidInfo(ps) : null;
    const steps = [
      { label: 'Draft', hint: r.preparedBy ? 'By ' + r.preparedBy : 'Admin & HR prepares it' },
      { label: 'Waiting for approval', hint: ps.st !== 'draft' && r.submittedAt ? 'Sent ' + NA.fmt.dateShort(r.submittedAt) : 'Managing Director' },
      { label: 'Approved', hint: ['approved', 'paid'].includes(ps.st) && ok.by ? ok.by + (ok.at ? ' · ' + NA.fmt.dateShort(ok.at) : '') : 'Managing Director' },
      { label: 'Paid', hint: paid ? [paid.on ? NA.fmt.dateShort(paid.on) : '', paid.method].filter(Boolean).join(' · ') || 'Paid' : 'Accounts pays it' },
    ];
    return `<div class="pp-steps">${NA.ui.stepper(steps, STEP_AT[ps.st] != null ? STEP_AT[ps.st] : 0)}</div>`;
  }
  const monthNav = (k) => `<div class="pp-nav">
      <div class="seg" role="group" aria-label="Month"><button type="button" data-act="month" data-n="-1" aria-label="Previous month">${NA.icon('chevron-left', 16)}</button><button type="button" data-act="month" data-n="1" aria-label="Next month">${NA.icon('chevron-right', 16)}</button></div>
      <b class="pp-nav-label">${esc(monthLabel(k))}</b>
      ${k !== defaultPayMonth() ? NA.ui.btn('Back to the current payroll', { kind: 'plain', size: 'sm', act: 'month-now' }) : ''}
    </div>`;
  /** An earlier month that is sent or approved but not paid yet (salaries are paid in month order). */
  function unpaidBefore(k) {
    const P = payrollDoc();
    if (!P) return '';
    return Object.keys(P).filter((m) => isMonth(m) && m < k).sort().find((m) => ['pending', 'approved'].includes(runState(m).st)) || '';
  }
  /** Salaries are booked to the part of the business each person works in. */
  function byCentre(lines) {
    const m = new Map();
    lines.forEach((l) => {
      const c = l.costCentre || 'Administration';
      if (!m.has(c)) m.set(c, { centre: c, amount: 0, lines: [] });
      const g = m.get(c); g.amount += num(l.net); g.lines.push(l);
    });
    return Array.from(m.values()).filter((g) => g.amount > 0);
  }
  const payRow = (l) => {
    const bits = [esc(l.role || ''), l.working ? `${l.present} of ${l.working} days at work` : 'no working days yet',
      l.leave ? plural(l.leave, 'day') + ' leave' : '', num(l.absentDays) ? `<span class="tone-red">${plural(num(l.absentDays), 'day')} without pay</span>` : '',
      l.unmarked ? `<span class="tone-amber">${l.unmarked} not marked</span>` : '', l.joined ? 'joined ' + esc(NA.fmt.dateShort(l.joined)) : '', l.left ? 'left ' + esc(NA.fmt.dateShort(l.left)) : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="gl-row pp-avrow" data-act="pay-line" data-sid="${esc(l.staffId)}">${NA.ui.avatar(l.name, 34)}
      <div class="gl-main"><b>${esc(l.name)}</b><small>${bits}</small></div>
      <span class="gl-value pp-net">${M(l.net)}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
  };

  function payrollTab(k) {
    fresh();
    const cur = monthOf(NA.today());
    const ps = runState(k);
    const write = canWritePayroll(), pay = canPay(), md = isMD();
    const showLines = ps.st !== 'draft' || write;    // Accounts sees the figures once they are frozen
    const lines = showLines ? linesOf(k, ps) : [];
    const tot = totalsOf(lines);
    const gaps = sum(lines, (l) => l.unmarked);
    const firstGap = lines.map((l) => l.firstUnmarked).filter(Boolean).sort()[0] || '';
    const ended = NA.today() > monthEnd(k);
    const people = plural(lines.length, 'person', 'people');
    const ok = approvalOf(ps);
    let next = '';
    if (k > cur) next = `<div class="callout callout-info">${NA.icon('calendar')}<div>${esc(monthLabel(k))} has not started yet.</div></div>`;
    else if (ps.st === 'draft') {
      if (ps.declined) next += `<div class="callout callout-danger">${NA.icon('x')}<div><b>Sent back by ${esc(ps.declined.decidedBy || 'the Managing Director')}.</b> ${esc(ps.declined.note || '')} Make the changes, then send it again.</div></div>`;
      if (!write) next += lockNote('Admin & HR is preparing this payroll. You can pay it once the Managing Director has approved it.');
      else if (!lines.length) next += '';
      else if (!ended) next += nextStep('clock', `Send it after ${NA.fmt.date(monthEnd(k))}`, 'You can add allowances, bonuses and deductions now. The rest of the month’s attendance still counts.', '');
      else if (gaps) next += nextStep('alert', `Finish attendance first: ${plural(gaps, 'day')} not marked`, 'Every working day needs a mark before the payroll goes to the Managing Director.', NA.ui.btn('Go to the first gap', { kind: 'primary', href: '#/admin?tab=attendance&date=' + firstGap }));
      else next += nextStep('hr', `Send ${M(tot.net)} for ${people} to the Managing Director`, 'The figures are locked while they look at them.', NA.ui.btn('Send to Managing Director', { kind: 'primary', act: 'pay-send' }));
    } else if (ps.st === 'pending') {
      next = NA.ui.approvalBanners('payroll', k, ['payroll']) + lockNote('The figures are locked while the Managing Director looks at them.');
    } else if (ps.st === 'approved') {
      const earlier = unpaidBefore(k);
      const by = `Approved by ${ok.by || 'the Managing Director'}${ok.at ? ' on ' + NA.fmt.date(ok.at) : ''}.`;
      if (pay && earlier) next = lockNote(`${by} Pay ${monthLabel(earlier)} first: salaries are paid in month order.`);
      else if (pay) next = nextStep('wallet', `Pay ${M(tot.net)} to ${people}`, by + ' Pay the staff, then record how it was paid.', NA.ui.btn('Mark as paid', { kind: 'primary', act: 'pay-paid' }));
      else next = lockNote(`${by} Accounts pays the salaries and marks them paid.`);
      if (md) next += `<div>${NA.ui.btn('Re-open for changes', { kind: 'plain', size: 'sm', act: 'pay-reopen' })}</div>`;
    } else {
      const p = paidInfo(ps);
      next = `<div class="callout callout-ok">${NA.icon('check-circle')}<div class="grow"><b>Paid${p.on ? ' on ' + esc(NA.fmt.date(p.on)) : ''}.</b> ${esc([p.method, p.ref].filter(Boolean).join(' · '))}${p.by ? ' · by ' + esc(p.by) : ''}. In Accounts as salaries for ${esc(monthLabel(k))}.</div>${md ? NA.ui.btn('Undo payment', { kind: 'danger', size: 'sm', act: 'pay-undo' }) : ''}</div>`;
    }
    const ch = lines.length && (write || md) ? changesIn(k, lines) : '';
    const list = lines.length
      ? `<div class="glist">${lines.map(payRow).join('')}</div>
         <p class="glist-foot">Net pay ${M(tot.net)} · basic ${M(tot.basic)}${tot.extras ? ' · allowances and bonuses ' + M(tot.extras) : ''}${tot.deduction ? ' · deductions ' + M(tot.deduction) : ''}. A day without pay is the monthly salary ÷ 30. Leave is paid, except unpaid leave.</p>`
      : showLines && k <= cur ? `<div class="card">${NA.ui.empty('Nobody with a salary was on the staff this month.', 'users')}</div>` : '';
    const hist = ((ps.run && ps.run.history) || []).slice(-8).reverse();
    return `
      <div class="toolbar">${monthNav(k)}</div>
      ${payrollSteps(ps)}
      ${next ? `<div class="pp-next">${next}</div>` : ''}
      ${ch ? `<div class="pp-next"><div class="callout callout-info">${NA.icon('info')}<div><b>Changes this month.</b> ${esc(ch)}</div></div></div>` : ''}
      ${list ? `<section>${lines.length ? `<div class="glist-title">${esc(people)}</div>` : ''}${list}</section>` : ''}
      ${hist.length ? `<section class="pp-section"><div class="glist-title">History</div><div class="card pad"><ul class="timeline pp-timeline">${hist.map((h) => `<li>${esc(h.text)}<small>${esc(h.by || '')} · ${esc(NA.fmt.datetime(h.at))}</small></li>`).join('')}</ul></div></section>` : ''}`;
  }
  function payrollActions(k) {
    const ps = runState(k);
    const lines = ps.st !== 'draft' || canWritePayroll();
    return (lines ? NA.ui.btn('Payslips', { icon: 'print', act: 'pay-slips' }) : '')
      + (['approved', 'paid'].includes(ps.st) && canPayView() ? NA.ui.btn('Salary list', { icon: 'file-text', act: 'pay-bank' }) : '');
  }

  /** One person’s pay for the month. In a draft, Admin & HR adds allowance, bonus and other deductions with a reason. */
  function payLineSheet(k, sid) {
    fresh();
    const ps = runState(k);
    const l = linesOf(k, ps).find((x) => x.staffId === sid);
    if (!l) return NA.ui.toast('This person is not on this payroll', 'info');
    const edit = ps.st === 'draft' && canWritePayroll() && k <= monthOf(NA.today());
    const field = (name, v) => `<span class="pp-money">৳<input class="pp-in" type="number" name="${name}" min="0" step="100" value="${num(v) ? esc(v) : ''}" placeholder="0" inputmode="numeric" aria-label="${esc(name)}"/></span>`;
    const att = [
      glRow('At work', `${l.present} of ${l.working}`, l.late ? plural(l.late, 'late arrival') : ''),
      l.leave ? glRow('Leave', String(l.leave), num(l.unpaidLeave) ? l.unpaidLeave + ' unpaid' : 'Paid') : '',
      l.absent ? glRow('Absent', String(l.absent)) : '',
      l.unmarked ? glRow('Not marked', `<span class="tone-amber">${l.unmarked}</span>`) : '',
    ].join('');
    const basicSub = (l.days && l.monthDays && l.days < l.monthDays ? `${l.days} of ${l.monthDays} days · ` : '') + M(l.monthly) + ' a month';
    const earn = [
      glRow('Basic salary', M(l.basic), esc(basicSub)),
      glRow('Allowance', edit ? field('allowance', l.allowance) : M(l.allowance)),
      glRow('Bonus', edit ? field('bonus', l.bonus) : M(l.bonus), edit ? 'Festival bonus, sales incentive…' : ''),
    ].join('');
    const ded = [
      glRow('Days without pay', num(l.deduction) ? '− ' + M(l.deduction) : M(0), num(l.absentDays) ? esc(`${plural(num(l.absentDays), 'day')} × ${M(l.monthly)} ÷ 30`) : 'None this month'),
      glRow('Other deduction', edit ? field('deduct', l.otherDeduction) : (num(l.otherDeduction) ? '− ' + M(l.otherDeduction) : M(0)), edit ? 'Salary advance, loan, tax…' : ''),
    ].join('');
    const note = edit ? NA.ui.field({ name: 'note', label: 'Reason for a bonus or deduction', type: 'textarea', rows: 2, placeholder: 'The Managing Director sees this' }, l.note || '')
      : l.note ? group('Note', glRow(l.note)) : '';
    const save = (el) => {
      const v = NA.ui.readForm(el.querySelector('form'));
      const allowance = Math.max(0, num(v.allowance)), bonus = Math.max(0, num(v.bonus)), deduct = Math.max(0, num(v.deduct));
      const why = String(v.note || '').trim();
      if ((bonus || deduct) && !why) { NA.ui.toast('Write a short reason for the bonus or deduction', 'error'); const n = el.querySelector('[name=note]'); if (n) n.focus(); return false; }
      if (runState(k).st !== 'draft') { NA.ui.toast('This payroll was sent in the meantime, so the figures are locked', 'error'); return undefined; }
      const run = ensureRun(k);
      const old = run.lines[sid] || {};
      if (num(old.allowance) === allowance && num(old.bonus) === bonus && num(old.deduct) === deduct && String(old.note || '') === why) return undefined;
      const w = stamp();
      run.lines[sid] = { allowance, bonus, deduct, note: why, by: w.by, at: w.at };
      const said = [allowance ? 'allowance ' + M(allowance) : '', bonus ? 'bonus ' + M(bonus) : '', deduct ? 'deduction ' + M(deduct) : ''].filter(Boolean).join(', ');
      pushHistory(run, `${l.name}: ${said || 'no extras'}${why ? ' — ' + why : ''}`);
      NA.save();
      NA.ui.toast('Saved');
      NA.refresh();
      return undefined;
    };
    const slip = { label: 'Payslip', icon: 'print', onClick: () => { printSlips(k, [l], ps); return false; } };
    NA.ui.modal({
      title: l.name, subtitle: esc(`${l.role || ''} · ${monthLabel(k)}`), size: 'md',
      body: `<form class="modal-form pp-sheet" onsubmit="return false">
        ${group('Attendance', att)}${group('Earnings', earn)}${group('Deductions', ded)}${note}
        <div class="pp-total"><span>Net pay</span><b data-net>${M(l.net)}</b></div></form>`,
      actions: edit ? [slip, { label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: save }] : [slip, { label: 'Done', kind: 'primary' }],
      onMount: (el) => {
        el.classList.add('pp-modal');
        if (!edit) return;
        const out = el.querySelector('[data-net]');
        el.addEventListener('input', () => {
          const v = NA.ui.readForm(el.querySelector('form'));
          out.textContent = M(Math.max(0, num(l.basic) + Math.max(0, num(v.allowance)) + Math.max(0, num(v.bonus)) - num(l.deduction) - Math.max(0, num(v.deduct))));
        });
      },
    });
  }

  /** Admin & HR sends the month to the Managing Director. The lines are frozen from here on. */
  function sendSheet(k) {
    fresh();
    const ps = runState(k);
    if (ps.st !== 'draft') return NA.ui.toast('This payroll has already been sent', 'info');
    if (!canWritePayroll()) return NA.ui.toast('Admin & HR sends the payroll', 'error');
    if (NA.today() <= monthEnd(k)) return NA.ui.toast(`Send it after ${NA.fmt.date(monthEnd(k))}`, 'error');
    const lines = liveLines(k, ps.run);
    if (!lines.length) return NA.ui.toast('Nobody to pay for this month', 'error');
    const gaps = sum(lines, (l) => l.unmarked);
    if (gaps) return NA.ui.toast(`Finish attendance first: ${plural(gaps, 'day')} not marked`, 'error');
    const tot = totalsOf(lines);
    const extras = lines.filter((l) => num(l.allowance) || num(l.bonus) || num(l.otherDeduction));
    const ch = changesIn(k, lines);
    const people = plural(lines.length, 'person', 'people');
    NA.ui.modal({
      title: `Send ${monthLabel(k)} payroll`, size: 'md', subtitle: 'The Managing Director approves it, then Accounts pays it.',
      body: `<div class="pp-sheet">
        ${group('', glRow('People', String(lines.length)) + glRow('Basic salaries', M(tot.basic)) + (tot.extras ? glRow('Allowances and bonuses', M(tot.extras)) : '') + (tot.deduction ? glRow('Deductions', '− ' + M(tot.deduction)) : ''))}
        ${ch ? `<div class="callout callout-info">${NA.icon('info')}<div><b>Changes this month.</b> ${esc(ch)}</div></div>` : ''}
        ${group('Allowances, bonuses and deductions', extras.map((l) => glRow(l.name, [num(l.allowance) ? '+ ' + M(l.allowance) : '', num(l.bonus) ? '+ ' + M(l.bonus) : '', num(l.otherDeduction) ? '− ' + M(l.otherDeduction) : ''].filter(Boolean).join(' '), esc(l.note || ''))).join(''))}
        <form class="modal-form" onsubmit="return false">${NA.ui.field({ name: 'note', label: 'Note for the Managing Director', type: 'textarea', rows: 2, placeholder: 'Optional' })}</form>
        <div class="pp-total"><span>Net pay</span><b>${M(tot.net)}</b></div>
      </div>`,
      actions: [{ label: 'Cancel' }, { label: 'Send to Managing Director', kind: 'primary', onClick: (el) => {
        fresh();
        const now = runState(k);
        if (now.st !== 'draft') { NA.ui.toast('This payroll has already been sent', 'info'); return undefined; }
        const fin = liveLines(k, now.run);
        if (sum(fin, (l) => l.unmarked)) { NA.ui.toast('Some days are not marked any more — check attendance', 'error'); return undefined; }
        const total = totalsOf(fin).net;
        const note = String((el.querySelector('[name=note]') || {}).value || '').trim();
        const w = stamp();
        const run = ensureRun(k);
        Object.assign(run, { status: 'pending', snapshot: fin, total, people: fin.length, submittedAt: w.at, preparedBy: w.by, preparedById: w.byId,
          approvalId: null, approvedBy: null, approvedById: null, approvedAt: null, declined: null });
        pushHistory(run, `Sent to the Managing Director — ${M(total)} for ${plural(fin.length, 'person', 'people')}${note ? ' (' + note + ')' : ''}`);
        NA.save();
        // The title goes into the activity feed, which managers outside HR read: no amounts in it.
        const a = NA.approvals.request({ type: 'payroll', ref: { c: 'payroll', id: k, code: monthLabel(k) }, title: `${monthLabel(k)} payroll · ${plural(fin.length, 'person', 'people')}`,
          detail: changesIn(k, fin) || 'No one joined or left and no salary changed this month', amount: total, value: total, reason: note });
        run.approvalId = a.id;
        if (a.status === 'approved' && run.status !== 'approved') Object.assign(run, { status: 'approved', approvedBy: a.decidedBy, approvedById: a.decidedById || null, approvedAt: a.decidedAt });
        NA.save();
        NA.ui.toast(a.status === 'approved' ? 'Approved' : 'Sent to the Managing Director', a.status === 'approved' ? 'success' : 'info');
        NA.refresh();
        return undefined;
      } }],
      onMount: (el) => el.classList.add('pp-modal'),
    });
  }

  /** Accounts (or the MD) records the salary payment. One Salaries expense per part of the business, dated the
      month’s last day and already paid, so Accounts sees it in the books. */
  function paySheet(k) {
    fresh();
    const ps = runState(k);
    if (ps.st === 'paid') return NA.ui.toast('Already paid', 'info');
    if (ps.st !== 'approved') return NA.ui.toast('The Managing Director has not approved this payroll yet', 'error');
    if (!canPay()) return NA.ui.toast('Accounts records the salary payment', 'error');
    const earlier = unpaidBefore(k);
    if (earlier) return NA.ui.toast(`Pay ${monthLabel(earlier)} first`, 'error');
    const lines = linesOf(k, ps).filter((l) => num(l.net) > 0);
    if (!lines.length) return NA.ui.toast('Nothing to pay', 'error');
    const total = sum(lines, (l) => l.net);
    const groups = byCentre(lines);
    NA.ui.formModal({
      title: `Pay ${monthLabel(k)} salaries`, size: 'md', submitLabel: 'Mark as paid',
      subtitle: esc(`${M(total)} to ${plural(lines.length, 'person', 'people')}`),
      intro: `<p class="muted pp-intro">Pay the staff first (bank transfer, cash…), then record it here. The salaries go into Accounts for ${esc(monthLabel(k))}, one line for each part of the business.</p>
        ${group('', groups.map((g) => glRow(g.centre, M(g.amount), esc(plural(g.lines.length, 'person', 'people')))).join(''))}<div class="mt-16"></div>`,
      fields: [
        { name: 'method', label: 'Paid with', type: 'select', options: NA.FLOW.payOutMethods || PAY_METHODS, placeholder: false, required: true },
        { name: 'payRef', label: 'Reference', placeholder: 'Bank advice or cheque no.' },
        { name: 'paidOn', label: 'Date paid', type: 'date', required: true, min: monthStart(k), max: NA.today() },
      ],
      values: { method: 'Bank Transfer', paidOn: NA.today() },
      onSubmit: (v) => {
        fresh();
        const now = runState(k);
        if (now.st !== 'approved') { NA.ui.toast('This payroll changed in the meantime — open it again', 'error'); return undefined; }
        if (v.method !== 'Cash' && !v.payRef) { NA.ui.toast('Enter the bank advice or cheque number', 'error'); return false; }
        if (!isDate(v.paidOn) || v.paidOn > NA.today()) { NA.ui.toast('The date paid cannot be in the future', 'error'); return false; }
        const fin = linesOf(k, now).filter((l) => num(l.net) > 0);
        const sumAll = sum(fin, (l) => l.net);
        const r = now.run || {}, ok = approvalOf(now), w = stamp();
        const ids = byCentre(fin).map((g) => NA.insert('expenses', {
          code: NA.nextCode('EXP'), date: monthEnd(k), category: 'Salaries', costCentre: g.centre, amount: g.amount, vatPaid: 0,
          paidTo: `Staff salaries · ${plural(g.lines.length, 'person', 'people')}`, ref: 'PAYROLL-' + k, payrollMonth: k,
          note: `${monthLabel(k)} salaries — ${g.lines.map((l) => l.name).join(', ')}`,
          status: 'paid', requestedBy: r.preparedBy || '', approvedBy: ok.by || '', approvedById: r.approvedById || null, approvedAt: ok.at || null,
          paidBy: w.by, paidById: w.byId, paidOn: v.paidOn, method: v.method, payRef: v.payRef || '',
        }).id);
        // Stamp the month paid at once. Accounts may change only an approved month, and only its status and payment
        // fields (the office server refuses anything else); if that cannot be done here, the Managing Director’s
        // screen marks the month paid from these expenses (reconcilePaid).
        const run = runOf(k);
        if (run && canStampPaid() && (canWritePayroll() || run.status === 'approved')) {
          Object.assign(run, { status: 'paid', paidAt: v.paidOn, paidBy: w.by, paidById: w.byId, method: v.method, payRef: v.payRef || '', expenseIds: ids, total: sumAll });
          pushHistory(run, `Paid by ${w.by} — ${v.method}${v.payRef ? ' ' + v.payRef : ''}`);
          NA.save();
        }
        NA.log(`${monthLabel(k)} salaries paid by ${w.by} (${v.method})`, { link: '#/admin?tab=payroll&month=' + k, kind: 'money' });
        NA.ui.toast('Salaries marked as paid');
        NA.refresh();
        return undefined;
      },
    });
  }

  /** Managing Director only: undo a recorded payment. The expenses stay in Accounts, voided; the month goes back to Draft. */
  function undoSheet(k) {
    fresh();
    const ps = runState(k);
    if (ps.st !== 'paid' || !isMD()) return;
    const total = ps.paidExp.length ? sum(ps.paidExp, (e) => e.amount) : num(ps.run && ps.run.total);
    askReason('Undo the payment', `The ${M(total)} of salary expenses stay in Accounts but are voided, and ${monthLabel(k)} goes back to Draft. Admin & HR corrects it and sends it to you again. Use this only when the payment was recorded by mistake or the figures were wrong.`, (reason) => {
      fresh();
      const now = runState(k);
      if (now.st !== 'paid') return;
      const w = stamp();
      now.paidExp.forEach((e) => NA.update('expenses', e.id, { status: 'void', voidedFrom: e.status || 'paid', void: { by: w.by, byId: w.byId, at: w.at, reason: 'Salary payment undone: ' + reason } }));
      const run = ensureRun(k);
      run.versions = (Array.isArray(run.versions) ? run.versions : []).concat([{ at: w.at, by: w.by, reason, total: num(run.total) || total, paidAt: run.paidAt || '', paidBy: run.paidBy || '',
        method: run.method || '', payRef: run.payRef || '', snapshot: run.snapshot || null, expenseIds: now.paidExp.map((e) => e.id) }]).slice(-12);
      const apRec = (run.approvalId && NA.get('approvals', run.approvalId)) || now.ap;
      if (apRec && apRec.status !== 'cancelled') NA.update('approvals', apRec.id, { status: 'cancelled', note: 'Payment undone by ' + w.by + ': ' + reason });
      Object.assign(run, { status: 'draft', approvalId: null, approvedBy: null, approvedById: null, approvedAt: null, declined: null, snapshot: null,
        paidAt: null, paidBy: null, paidById: null, method: null, payRef: null, expenseIds: [], expenseId: null });
      pushHistory(run, `Payment undone — ${reason}. The salary expenses were voided.`);
      NA.save();
      NA.log(`${monthLabel(k)} salary payment undone by ${w.by} — ${reason}`, { link: '#/admin?tab=payroll&month=' + k, kind: 'warn' });
      NA.ui.toast('Payment undone — back to draft', 'info');
      NA.refresh();
    }, { okLabel: 'Undo payment', danger: true, placeholder: 'e.g. Recorded twice by mistake' });
  }

  /** Managing Director only: take back an approval before Accounts pays, so Admin & HR can change the figures. */
  function reopenSheet(k) {
    fresh();
    const ps = runState(k);
    if (ps.st !== 'approved' || !isMD()) return;
    askReason('Re-open ' + monthLabel(k), 'The approval is withdrawn and the payroll goes back to Draft, so Admin & HR can change it and send it to you again.', (reason) => {
      const run = ensureRun(k);
      const apRec = (run.approvalId && NA.get('approvals', run.approvalId)) || ps.ap;
      if (apRec && apRec.status !== 'cancelled') NA.update('approvals', apRec.id, { status: 'cancelled', note: 'Re-opened by ' + NA.me().name + ': ' + reason });
      Object.assign(run, { status: 'draft', approvalId: null, approvedBy: null, approvedById: null, approvedAt: null, declined: null });
      pushHistory(run, 'Re-opened for changes — ' + reason);
      NA.save();
      NA.log(`${monthLabel(k)} payroll re-opened for changes by ${NA.me().name}`, { link: '#/admin?tab=payroll&month=' + k, kind: 'warn' });
      NA.ui.toast('Back to draft', 'info');
      NA.refresh();
    }, { okLabel: 'Re-open', placeholder: 'e.g. A bonus is missing' });
  }

  /** A month at a glance, opened from other screens (Today): who gets what, and Mark as paid. */
  function payrollSheet(k) {
    if (!canPayView()) return NA.ui.toast('Payroll is for Admin & HR, Accounts and the Managing Director', 'error');
    fresh();
    const ps = runState(k);
    const lines = ps.st !== 'draft' || canWritePayroll() ? linesOf(k, ps) : [];
    const tot = totalsOf(lines);
    const words = { draft: 'Admin & HR is preparing it.', pending: 'Waiting for the Managing Director.', approved: 'Approved, ready to pay.', paid: 'Paid.' }[ps.st];
    const buttons = [];
    if (lines.length && ['approved', 'paid'].includes(ps.st)) buttons.push({ label: 'Salary list', icon: 'print', onClick: () => { printBankList(k, lines, ps); return false; } });
    if (ps.st === 'approved' && canPay()) buttons.push({ label: 'Mark as paid', kind: 'primary', onClick: () => { later(() => paySheet(k)); } });
    else buttons.push({ label: 'Done', kind: 'primary' });
    NA.ui.modal({
      title: monthLabel(k) + ' payroll', subtitle: esc(words), size: 'md', actions: buttons,
      body: `<div class="pp-sheet">${payrollSteps(ps)}${group(lines.length ? plural(lines.length, 'person', 'people') : '', lines.map((l) => glRow(l.name, M(l.net), esc(l.role || ''))).join(''))}${lines.length ? `<div class="pp-total"><span>Net pay</span><b>${M(tot.net)}</b></div>` : ''}</div>`,
      onMount: (el) => el.classList.add('pp-modal'),
    });
  }

  const draftTag = (ps) => (['approved', 'paid'].includes(ps.st) ? ''
    : '<p style="display:inline-block;margin:0 0 16px;padding:4px 12px;border:2px solid #d0021b;color:#d0021b;font-weight:700;letter-spacing:.08em">DRAFT — NOT APPROVED</p>');
  function printSlips(k, lines, ps) {
    if (!lines.length) return NA.ui.toast('Nobody to print', 'error');
    const ok = approvalOf(ps);
    const approved = ['approved', 'paid'].includes(ps.st);
    NA.ui.print('Payslips ' + monthLabel(k), lines.map((l, i) => `
      <div style="${i < lines.length - 1 ? 'page-break-after:always;' : ''}">
        ${draftTag(ps)}
        <h1>Payslip — ${esc(monthLabel(k))}</h1>
        <p class="muted">${esc(NA.db.settings.company || '')}</p>
        <table><tr><th style="width:30%">Employee</th><td><b>${esc(l.name)}</b></td></tr><tr><th>Designation</th><td>${esc(l.role || '')}</td></tr>
          <tr><th>Attendance</th><td>${l.present} of ${l.working} working days at work · ${l.leave} leave · ${l.absent} absent${num(l.unpaidLeave) ? ' · ' + l.unpaidLeave + ' unpaid leave' : ''}</td></tr></table>
        <table><thead><tr><th>Earnings and deductions</th><th class="r">Amount</th></tr></thead><tbody>
          <tr><td>Basic salary${l.days && l.monthDays && l.days < l.monthDays ? ` (${l.days} of ${l.monthDays} days)` : ''}</td><td class="r">${M(l.basic)}</td></tr>
          ${num(l.allowance) ? `<tr><td>Allowance</td><td class="r">${M(l.allowance)}</td></tr>` : ''}
          ${num(l.bonus) ? `<tr><td>Bonus</td><td class="r">${M(l.bonus)}</td></tr>` : ''}
          ${num(l.deduction) ? `<tr><td>Days without pay (${num(l.absentDays)} × salary ÷ 30)</td><td class="r">− ${M(l.deduction)}</td></tr>` : ''}
          ${num(l.otherDeduction) ? `<tr><td>Other deduction</td><td class="r">− ${M(l.otherDeduction)}</td></tr>` : ''}
        </tbody><tfoot><tr><th>Net pay</th><th class="r">${M(l.net)}</th></tr></tfoot></table>
        ${l.note ? `<p class="muted">Note: ${esc(l.note)}</p>` : ''}
        <div class="sig"><div>Employee</div><div>${approved && ok.by ? 'Approved by ' + esc(ok.by) : 'Managing Director'}</div></div>
      </div>`).join(''));
  }
  function printBankList(k, lines, ps) {
    const list = lines.filter((l) => num(l.net) > 0);
    if (!list.length) return NA.ui.toast('Nobody to pay', 'error');
    const total = sum(list, (l) => l.net);
    const r = ps.run || {}, ok = approvalOf(ps);
    NA.ui.print('Salaries ' + monthLabel(k), `${draftTag(ps)}
      <h1>Salaries — ${esc(monthLabel(k))}</h1><p class="muted">${esc(plural(list.length, 'person', 'people'))} · ${M(total)}</p>
      <table><thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Bank and account</th><th class="r">Net pay</th></tr></thead><tbody>
      ${list.map((l, i) => { const s = NA.get('staff', l.staffId) || {}; return `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.role || '')}</td><td>${esc([s.bankName, s.bankAccount].filter(Boolean).join(' · ') || '—')}</td><td class="r">${M(l.net)}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><th colspan="4">Total</th><th class="r">${M(total)}</th></tr></tfoot></table>
      <div class="sig"><div>Prepared by${r.preparedBy ? ' ' + esc(r.preparedBy) : ''}</div><div>Approved by${ok.by ? ' ' + esc(ok.by) : ''}</div></div>`);
  }

  /* The Managing Director decides in Approvals (or on the banner here); this keeps the payroll page in step.
     Runs in the decider’s browser: the MD approving or declining, or Admin & HR withdrawing. */
  if (NA.approvals) NA.approvals.onDecide('payroll', (a, decision) => {
    if (!a || a.refC !== 'payroll' || !isMonth(a.refId) || !canWritePayroll()) return;
    const run = runOf(a.refId);
    if (!run || (run.approvalId && run.approvalId !== a.id)) return;
    const who = a.decidedBy || NA.me().name;
    if (decision === 'approved') {
      Object.assign(run, { status: 'approved', approvedBy: who, approvedById: a.decidedById || null, approvedAt: a.decidedAt || new Date().toISOString(), declined: null });
      pushHistory(run, 'Approved by ' + who, who);
    } else if (decision === 'rejected') {
      Object.assign(run, { status: 'draft', declined: { by: who, at: a.decidedAt || new Date().toISOString(), note: a.note || '' } });
      pushHistory(run, 'Sent back by ' + who + (a.note ? ': ' + a.note : ''), who);
    } else if (decision === 'cancelled' && run.status === 'pending') {
      run.status = 'draft';
      pushHistory(run, 'Request withdrawn');
    } else return;
    NA.save();
  });

  /* Accounts records the payment as expenses and stamps the month paid. If that stamp did not get through (the month
     still read 'pending' on Accounts' screen, or the office server refused it), the Managing Director’s screen sees
     salary expenses for a month still marked approved and marks that month paid for everyone. */
  function reconcilePaid() {
    if (!NA.isRole('owner') || NA.preview) return;
    const P = payrollDoc();
    if (!P) return;
    let changed = false;
    Object.keys(P).forEach((k) => {
      const run = P[k];
      if (!isMonth(k) || !run || typeof run !== 'object' || !['approved', 'pending'].includes(run.status)) return;
      const exp = payrollExpenses(k);
      if (!exp.length) return;
      const e = exp[0];
      Object.assign(run, { status: 'paid', paidAt: e.paidOn || e.date || '', paidBy: e.paidBy || '', paidById: e.paidById || null, method: e.method || '', payRef: e.payRef || '',
        expenseIds: exp.map((x) => x.id), total: num(run.total) || sum(exp, (x) => x.amount) });
      pushHistory(run, `Paid${e.paidBy ? ' by ' + e.paidBy : ''}${e.method ? ' — ' + e.method : ''}${e.payRef ? ' ' + e.payRef : ''}`, e.paidBy || 'Accounts');
      changed = true;
    });
    if (changed) { NA.save(); if (NA.refresh) NA.refresh(); }
  }
  NA.on('rendered', () => { try { reconcilePaid(); } catch (e) { console.error(e); } });

  /* ---------------------------------------------------------------- assets */
  function assetsTab(q) {
    const term = String(q.q || '').trim().toLowerCase();
    const all = NA.db.assets.slice().sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || '')));
    const live = all.filter((a) => a.condition !== 'Disposed');
    const gone = all.filter((a) => a.condition === 'Disposed');
    const kindOf = (a) => a.category || 'Other';
    const cats = Array.from(new Set(live.map(kindOf))).sort();
    const cat = q.cat === 'disposed' || cats.includes(q.cat) ? q.cat : 'all';
    const rows = cat === 'disposed' ? gone : cat === 'all' ? live : live.filter((a) => kindOf(a) === cat);
    const key = (a) => [a.tag, a.name, a.category, a.location, a.assignedTo ? NA.staffName(a.assignedTo) : 'shared', a.serial].filter(Boolean).join(' ').toLowerCase();
    const shown = rows.filter((a) => !term || key(a).includes(term)).length;
    const repair = live.filter((a) => a.condition === 'Needs repair').length;
    const shared = live.filter((a) => !a.assignedTo).length;
    const table = rows.length ? NA.ui.table([
      { label: 'Asset', render: (a) => `<div class="cell-main">${esc(a.name)}</div><div class="cell-sub"><span class="pp-tag">${esc(a.tag || '')}</span> · ${esc(kindOf(a))}</div>` },
      { label: 'Location', render: (a) => esc(a.location || '—') },
      { label: 'Looked after by', render: (a) => (a.assignedTo ? `<span class="row">${NA.ui.avatar(NA.staffName(a.assignedTo), 24)}${esc(NA.staffName(a.assignedTo))}</span>` : '<span class="muted">Shared</span>') },
      { label: 'Condition', render: (a) => NA.ui.badge(a.condition || 'Good', COND_TONE[a.condition] || 'gray') },
      { label: 'Bought for', cls: 'right nowrap', render: (a) => (a.condition === 'Disposed' ? `<span class="pp-strike">${M(a.value)}</span>` : M(a.value)) },
    ], rows, { rowAttr: (a) => `class="clickable${term && !key(a).includes(term) ? ' hidden' : ''}" data-act="asset" data-id="${esc(a.id)}" data-s="${esc(key(a))}" tabindex="0"` }) : '';
    const byKind = {};
    live.forEach((a) => { byKind[kindOf(a)] = (byKind[kindOf(a)] || 0) + num(a.value); });
    const chipN = (c) => (c === 'all' ? live.length : c === 'disposed' ? gone.length : live.filter((a) => kindOf(a) === c).length);
    return `
      <p class="pp-counts pp-intro"><span><b>${live.length}</b> in use</span><span>bought for <b>${esc(S(sum(live, (a) => a.value)))}</b></span>${repair ? `<span><b class="tone-red">${repair}</b> need repair</span>` : ''}<span><b>${shared}</b> shared</span>${gone.length ? `<span><b>${gone.length}</b> disposed</span>` : ''}</p>
      <div class="toolbar">
        <div class="chips">${['all'].concat(cats, gone.length ? ['disposed'] : []).map((c) => `<button class="chip ${cat === c ? 'active' : ''}" data-act="cat" data-k="${esc(c)}">${esc(c === 'all' ? 'All' : c === 'disposed' ? 'Disposed' : c)} <span class="n">${chipN(c)}</span></button>`).join('')}</div>
        <span class="spacer"></span>
        <input type="search" data-search placeholder="Search tag, name or person" value="${esc(q.q || '')}" aria-label="Search assets"/>
      </div>
      ${rows.length ? `<section class="card">${table}</section>` : ''}
      <div class="card${rows.length && shown ? ' hidden' : ''}" data-none>${NA.ui.empty(!all.length ? 'Nothing registered yet. Start with the demo cars and the workshop equipment.' : rows.length ? 'Nothing matches.' : 'Nothing here.', 'tag')}</div>
      ${live.length > 1 ? `<section class="pp-section"><div class="glist-title">What it is worth, by kind</div><div class="card pad">${bars(Object.keys(byKind).map((c) => ({ label: c, value: byKind[c] })).sort((a, b) => b.value - a.value))}</div></section>` : ''}`;
  }

  function assetSheet(id) {
    const a = NA.get('assets', id);
    if (!a) return NA.ui.toast('This asset is not in the register any more', 'info');
    const gone = a.condition === 'Disposed';
    const d = a.disposal || {};
    const rows = [
      glRow('Kind', esc(a.category || 'Other')),
      glRow('Location', esc(a.location || '—')),
      glRow('Looked after by', a.assignedTo ? esc(NA.staffName(a.assignedTo)) : 'Shared'),
      glRow('Condition', NA.ui.badge(a.condition || 'Good', COND_TONE[a.condition] || 'gray')),
      glRow('Bought for', M(a.value), a.purchaseDate ? esc(NA.fmt.date(a.purchaseDate)) : ''),
      a.serial ? glRow('Serial or model no.', esc(a.serial)) : '',
      a.notes ? glRow('Notes', '', esc(a.notes)) : '',
    ].join('');
    const disp = gone ? [
      glRow('Disposed on', esc(NA.fmt.date(d.date || a.disposedAt)), esc(d.reason || '')),
      num(d.proceeds) ? glRow('Money received', M(d.proceeds)) : '',
      d.by ? glRow('Recorded by', esc(d.by)) : '',
      d.note ? glRow('Note', '', esc(d.note)) : '',
    ].join('') : '';
    const hist = (Array.isArray(a.history) ? a.history : []).slice(0, 8).map((h) => glRow(h.text, '', esc([h.by, NA.fmt.datetime(h.at)].filter(Boolean).join(' · ')))).join('');
    const acts = {};
    let actRows = '';
    if (canAssets() && !gone) {
      acts.edit = () => assetForm(NA.get('assets', a.id));
      acts.dispose = () => disposeSheet(a.id);
      actRows = actionRow('edit', 'Edit') + actionRow('dispose', 'Dispose of it…', true);
    } else if (canAssets()) {
      acts.undispose = () => undisposeAsset(a.id);
      actRows = actionRow('undispose', 'Undo disposal');
    }
    sheet({ title: a.name, subtitle: esc([a.tag, a.category].filter(Boolean).join(' · ')), body: group('', rows) + group('Disposed', disp) + group('History', hist) + group('', actRows), actions: acts });
  }

  function assetForm(a) {
    if (!canAssets()) return NA.ui.toast('Admin & HR and Accounts keep the asset register', 'error');
    const isNew = !a;
    const cats = Array.from(new Set(ASSET_CATS.concat(NA.db.assets.map((x) => x.category).filter(Boolean))));
    const named = (r) => Object.assign({}, r, { assignedTo: r.assignedTo ? NA.staffName(r.assignedTo) : '', value: r.value != null && r.value !== '' ? M(r.value) : '' });
    sheetForm({
      title: isNew ? 'Register an asset' : 'Edit ' + (a.tag || 'asset'),
      values: a ? Object.assign({}, a) : { location: locs()[0] },
      fields: [
        { name: 'name', label: 'What is it?', required: true, span: 2, placeholder: 'e.g. Office laptop — Dell Latitude' },
        { name: 'category', label: 'Kind', type: 'select', options: cats, required: true, placeholder: false },
        { name: 'location', label: 'Location', type: 'select', options: locs(a && a.location), required: true, placeholder: false },
        { name: 'value', label: 'Bought for', type: 'money', required: true },
        { name: 'assignedTo', label: 'Looked after by', type: 'select', options: staffOpts(a && a.assignedTo), placeholder: 'Nobody (shared)' },
      ],
      more: [
        { name: 'purchaseDate', label: 'Bought on', type: 'date', max: NA.today() },
        { name: 'condition', label: 'Condition', type: 'select', options: CONDITIONS, placeholder: false },
        { name: 'serial', label: 'Serial or model no.' },
        { name: 'notes', label: 'Notes', placeholder: 'Warranty, supplier…' },
      ],
      submitLabel: isNew ? 'Register' : 'Save',
      onSubmit: (v) => {
        v.value = Math.max(0, num(v.value));
        if (isNew) {
          const rec = NA.insert('assets', Object.assign({ tag: NA.nextCode('AST') }, v, { addedBy: NA.me().name }));
          NA.log(`Asset ${rec.tag} registered — ${rec.name}`, { rec, link: '#/admin?tab=assets' });
          NA.ui.toast(rec.tag + ' registered');
        } else {
          const said = changeList(named(a), named(v), { name: 'Name', category: 'Kind', location: 'Location', value: 'Value', assignedTo: 'Looked after by', condition: 'Condition', purchaseDate: 'Bought on', serial: 'Serial', notes: 'Notes' });
          if (!said.length) return;
          NA.update('assets', a.id, v);
          NA.log(`Asset ${a.tag || ''} changed — ${said.join('; ')}`, { rec: NA.get('assets', a.id), link: '#/admin?tab=assets' });
          NA.ui.toast('Saved');
        }
        NA.refresh();
      },
    });
  }

  /** Sold, scrapped, lost…: the asset stays in the register as disposed, with who, when, why and any money received. */
  function disposeSheet(id) {
    const a = NA.get('assets', id);
    if (!a || a.condition === 'Disposed' || !canAssets()) return;
    NA.ui.formModal({
      title: 'Dispose of ' + (a.tag || 'this asset'), size: 'sm', submitLabel: 'Dispose',
      intro: `<p class="muted pp-intro">${esc(a.name)} stays in the register as disposed, with the reason. It no longer counts in the totals.</p>`,
      fields: [
        { name: 'reason', label: 'What happened?', type: 'select', options: ['Sold', 'Scrapped', 'Lost or stolen', 'Given away', 'Returned to the supplier', 'Other'], required: true, placeholder: 'Choose…' },
        { name: 'date', label: 'Date', type: 'date', required: true, max: NA.today() },
        { name: 'proceeds', label: 'Money received', type: 'money', help: 'If it was sold' },
        { name: 'note', label: 'Note', type: 'textarea', rows: 2, span: 2, placeholder: 'e.g. Buyer, receipt number' },
      ],
      values: { date: NA.today() },
      onSubmit: async (v) => {
        if (!isDate(v.date) || v.date > NA.today()) { NA.ui.toast('Choose a date up to today', 'error'); return false; }
        const ok = await NA.ui.confirm(`Dispose of <b>${esc(a.name)}</b>${a.tag ? ' (' + esc(a.tag) + ')' : ''}? It leaves the totals. If this is a mistake, Undo disposal on its sheet puts it back.`, { title: 'Please confirm', okLabel: 'Dispose', danger: true });
        if (!ok) return false;
        const w = stamp();
        const proceeds = Math.max(0, num(v.proceeds));
        NA.update('assets', a.id, { condition: 'Disposed', conditionBefore: a.condition || 'Good', disposedAt: v.date,
          disposal: { date: v.date, reason: v.reason, proceeds, note: v.note || '', by: w.by, byId: w.byId, at: w.at } });
        NA.log(`Asset ${a.tag || ''} disposed — ${a.name} (${v.reason}${proceeds ? ', ' + M(proceeds) + ' received' : ''})`, { rec: NA.get('assets', a.id), link: '#/admin?tab=assets', kind: 'warn' });
        NA.ui.toast('Disposed');
        NA.refresh();
      },
    });
  }
  /** A disposal recorded by mistake: the asset is back in use in the condition it had. What was undone is kept. */
  function undisposeAsset(id) {
    const a = NA.get('assets', id);
    if (!a || a.condition !== 'Disposed' || !canAssets()) return;
    const d = a.disposal || {};
    NA.ui.confirm(`Put <b>${esc(a.name)}</b> back in use? Use this when the disposal was recorded by mistake.`, { title: 'Undo disposal', okLabel: 'Undo disposal' }).then((ok) => {
      if (!ok) return;
      const cur = NA.get('assets', id);
      if (!cur || cur.condition !== 'Disposed') return;
      NA.update('assets', id, { condition: cur.conditionBefore || 'Good', conditionBefore: null, disposedAt: null, disposal: null,
        disposalUndone: Object.assign(stamp(), { disposal: d }) });
      NA.log(`Asset ${a.tag || ''} back in use — the disposal (${[d.reason, d.date ? NA.fmt.date(d.date) : ''].filter(Boolean).join(', ') || 'no reason given'}) was undone`, { rec: NA.get('assets', id), link: '#/admin?tab=assets', kind: 'warn' });
      NA.ui.toast('Back in use');
      NA.refresh();
    });
  }

  /* ---------------------------------------------------------------- licences */
  function docChip(st) {
    if (st.key === 'none') return NA.ui.badge('No expiry', 'gray');
    return NA.ui.badge(st.days < 0 ? `Expired ${plural(-st.days, 'day')} ago` : st.days === 0 ? 'Expires today' : `${plural(st.days, 'day')} left`, st.tone);
  }
  const docRow = (d, st) => `<button type="button" class="gl-row" data-act="doc" data-id="${esc(d.id)}"><div class="gl-main"><b>${esc(d.name)}</b><small>${esc([d.authority, d.expiry ? 'expires ' + NA.fmt.date(d.expiry) : 'does not expire'].filter(Boolean).join(' · '))}</small></div>${docChip(st)}${NA.icon('chevron-right', 16, 'gl-chev')}</button>`;
  const docsDue = () => NA.db.compliance.map((d) => ({ d, st: compStatus(d) })).filter((x) => needsRenewal(x.st)).sort((a, b) => a.st.days - b.st.days);

  function complianceTab() {
    const docs = NA.db.compliance.map((d) => ({ d, st: compStatus(d) })).sort((a, b) => a.st.days - b.st.days || String(a.d.name).localeCompare(String(b.d.name)));
    const due = docs.filter((x) => needsRenewal(x.st));
    const ok = docs.filter((x) => !needsRenewal(x.st));
    const have = NA.db.compliance.map((d) => String(d.name || '').toLowerCase());
    const missing = STD_DOCS.filter((s) => !have.some((h) => h.includes(s.name.toLowerCase().split(' (')[0].split(' —')[0])));
    const urgent = due[0];
    return `
      ${urgent && canDocs() ? `<div class="pp-next">${nextStep('alert', `Renew the ${urgent.d.name}`, urgent.st.label + (due.length > 1 ? ` · ${plural(due.length - 1, 'more licence')} to renew` : ''), NA.ui.btn('Renew', { kind: 'primary', act: 'renew', attrs: `data-id="${esc(urgent.d.id)}"` }))}</div>` : ''}
      ${group(due.length ? 'Needs renewal' : '', due.map((x) => docRow(x.d, x.st)).join(''), 'Shown from 60 days before expiry, red from 30 days, the same as on Today.')}
      ${ok.length ? `<div class="${due.length ? 'pp-section' : ''}">${group('Valid', ok.map((x) => docRow(x.d, x.st)).join(''))}</div>` : ''}
      ${!docs.length ? `<div class="card">${NA.ui.empty('No licences yet. Start with the Trade Licence.', 'shield')}</div>` : ''}
      ${missing.length && canDocs() ? `<section class="pp-section"><div class="glist-title">Often needed by a car importer and dealer</div><div class="chips">${missing.map((m) => `<button class="chip" data-act="add-std" data-name="${esc(m.name)}" data-auth="${esc(m.authority)}">${NA.icon('plus', 14)}${esc(m.name)}</button>`).join('')}</div></section>` : ''}`;
  }

  function docSheet(id) {
    const d = NA.get('compliance', id);
    if (!d) return NA.ui.toast('This licence is not in the list any more', 'info');
    const st = compStatus(d);
    const rows = [
      glRow('Status', docChip(st), esc(st.label)),
      glRow('Issued by', esc(d.authority || '—')),
      glRow('Licence or reference no.', `<span class="pp-tag">${esc(d.ref || '—')}</span>`),
      glRow('Issued on', esc(NA.fmt.date(d.issued))),
      glRow('Expires on', d.expiry ? esc(NA.fmt.date(d.expiry)) : 'Does not expire'),
      d.owner ? glRow('Responsible person', esc(NA.staffName(d.owner))) : '',
      d.notes ? glRow('Notes', '', esc(d.notes)) : '',
    ].join('');
    const ren = (Array.isArray(d.renewals) ? d.renewals : []).slice().reverse().map((r) => glRow('Renewed ' + NA.fmt.date(r.renewedOn), num(r.fee) ? M(r.fee) : '',
      esc([r.newExpiry ? 'valid until ' + NA.fmt.date(r.newExpiry) : '', r.previousExpiry ? 'was ' + NA.fmt.date(r.previousExpiry) : '', r.by ? 'by ' + r.by : ''].filter(Boolean).join(' · ')))).join('');
    const acts = {};
    let actRows = '';
    if (canDocs()) {
      if (d.expiry) { acts.renew = () => renewForm(NA.get('compliance', d.id)); actRows += actionRow('renew', 'Renew'); }
      acts.edit = () => docForm(NA.get('compliance', d.id)); actRows += actionRow('edit', 'Edit');
    }
    if (NA.can('records.delete')) { acts.del = () => deleteDoc(d.id); actRows += actionRow('del', 'Delete this entry…', true); }
    sheet({ title: d.name, subtitle: esc(d.authority || ''), body: group('', rows) + group('Renewals', ren) + group('', actRows), actions: acts });
  }

  function docForm(doc, prefill) {
    if (!canDocs()) return NA.ui.toast('Admin & HR and Accounts keep the licences', 'error');
    const isNew = !doc;
    const named = (r) => Object.assign({}, r, { owner: r.owner ? NA.staffName(r.owner) : '' });
    sheetForm({
      title: isNew ? 'Add a licence' : 'Edit ' + doc.name,
      values: doc ? Object.assign({}, doc) : Object.assign({ issued: NA.today(), expiry: NA.addMonths(NA.today(), 12) }, prefill || {}),
      fields: [
        { name: 'name', label: 'Licence or document', required: true, span: 2, placeholder: 'e.g. Trade Licence' },
        { name: 'authority', label: 'Issued by', placeholder: 'e.g. DNCC' },
        { name: 'ref', label: 'Licence or reference no.' },
        { name: 'issued', label: 'Issued on', type: 'date' },
        { name: 'expiry', label: 'Expires on', type: 'date', help: 'Leave it empty if it never expires (TIN, BIN).' },
      ],
      more: [
        { name: 'owner', label: 'Responsible person', type: 'select', options: staffOpts(doc && doc.owner), placeholder: 'Nobody yet' },
        { name: 'notes', label: 'Notes', placeholder: 'Where the original is kept…' },
      ],
      submitLabel: isNew ? 'Add licence' : 'Save',
      onSubmit: (v) => {
        if (v.expiry && v.issued && v.expiry < v.issued) { NA.ui.toast('The expiry date is before the issue date', 'error'); return false; }
        if (isNew) {
          const r = NA.insert('compliance', Object.assign({}, v, { renewals: [], addedBy: NA.me().name }));
          NA.log('Licence added — ' + r.name, { rec: r, link: '#/admin?tab=compliance' });
          NA.ui.toast('Licence added');
        } else {
          const said = changeList(named(doc), named(v), { name: 'Name', authority: 'Issued by', ref: 'Reference', issued: 'Issued on', expiry: 'Expires on', owner: 'Responsible person', notes: 'Notes' });
          if (!said.length) return;
          NA.update('compliance', doc.id, v);
          NA.log(`${v.name} changed — ${said.join('; ')}`, { rec: NA.get('compliance', doc.id), link: '#/admin?tab=compliance' });
          NA.ui.toast('Saved');
        }
        NA.refresh();
      },
    });
  }

  /** Renewing keeps the old dates in renewals[]; a fee is then recorded as an expense, so it goes through Accounts. */
  function renewForm(doc) {
    if (!doc || !canDocs()) return;
    const base = doc.expiry && doc.expiry > NA.today() ? doc.expiry : NA.today();
    NA.ui.formModal({
      title: 'Renew ' + doc.name, size: 'sm', submitLabel: 'Mark as renewed',
      subtitle: doc.expiry ? 'Valid until ' + esc(NA.fmt.date(doc.expiry)) : '',
      values: { issued: NA.today(), expiry: NA.addMonths(base, 12), ref: doc.ref || '' },
      fields: [
        { name: 'issued', label: 'Renewed on', type: 'date', required: true, max: NA.today() },
        { name: 'expiry', label: 'New expiry date', type: 'date', required: true },
        { name: 'ref', label: 'New licence or receipt no.', span: 2 },
        { name: 'fee', label: 'Fee paid', type: 'money', span: 2, help: 'Optional. Next you record it as an expense, so Accounts sees it.' },
      ],
      onSubmit: (v) => {
        if (!isDate(v.issued) || v.issued > NA.today()) { NA.ui.toast('The renewal date cannot be in the future', 'error'); return false; }
        if (!isDate(v.expiry) || v.expiry <= NA.today() || v.expiry <= v.issued) { NA.ui.toast('The new expiry date must be in the future', 'error'); return false; }
        const w = stamp(), fee = Math.max(0, num(v.fee));
        const renewals = (Array.isArray(doc.renewals) ? doc.renewals : []).concat([{ renewedOn: v.issued, newExpiry: v.expiry, newRef: v.ref || doc.ref || '', fee,
          previousIssued: doc.issued || '', previousExpiry: doc.expiry || '', previousRef: doc.ref || '', by: w.by, byId: w.byId, at: w.at }]).slice(-20);
        NA.update('compliance', doc.id, { issued: v.issued, expiry: v.expiry, ref: v.ref || doc.ref || '', lastRenewed: v.issued, renewals });
        NA.log(`${doc.name} renewed — valid until ${NA.fmt.date(v.expiry)}${doc.expiry ? ' (was ' + NA.fmt.date(doc.expiry) + ')' : ''}`, { rec: NA.get('compliance', doc.id), link: '#/admin?tab=compliance', kind: 'success' });
        NA.ui.toast(doc.name + ' renewed');
        // The fee is an expense claim like any other (Accounts' own form): above the petty-cash limit it is saved as
        // waiting, with an approval request, so it is never booked as paid without someone's authority.
        if (fee > 0 && NA.actions && typeof NA.actions.newExpense === 'function') {
          later(() => NA.actions.newExpense({ category: 'Licence & government fees', amount: fee, paidTo: doc.authority || doc.name, costCentre: 'Administration', date: v.issued, ref: v.ref || '', note: doc.name + ' renewal' }));
        } else if (fee > 0) later(() => NA.ui.toast('Now claim the ' + M(fee) + ' fee as an expense, so Accounts sees it', 'info'));
        NA.refresh();
      },
    });
  }

  /** Managing Director only: remove an entry made by mistake or twice (a licence that ended is kept). */
  function deleteDoc(id) {
    const d = NA.get('compliance', id);
    if (!d || !NA.can('records.delete')) return;
    NA.ui.confirm(`Delete <b>${esc(d.name)}</b>? Use this only for an entry made by mistake or twice. A licence that ended should be kept.`, { title: 'Delete this entry', okLabel: 'Delete', danger: true }).then((ok) => {
      if (!ok) return;
      NA.remove('compliance', id);
      NA.log(`Licence entry deleted — ${d.name}${d.ref ? ' (' + d.ref + ')' : ''}`, { link: '#/admin?tab=compliance', kind: 'warn' });
      NA.ui.toast('Deleted');
      NA.refresh();
    });
  }

  /* ---------------------------------------------------------------- page */
  const SUBTITLE = {
    hr: 'Everyone who works at Noor Autos, and how to reach them.',
    attendance: 'Mark who came in each day. Friday is the weekly holiday.',
    leave: 'Leave requests, and how much leave each person has left this year.',
    payroll: 'Admin & HR prepares it, the Managing Director approves it, Accounts pays it.',
    assets: 'Company property, and who looks after it.',
    compliance: 'Licences and certificates, and when each one must be renewed.',
  };

  NA.page({
    path: 'admin', title: 'People', icon: 'briefcase',
    render(root, params, query) {
      injectCss();
      fresh();
      const q = Object.assign({}, query || {});
      const t = NA.today();
      const allowed = TABS.filter((x) => TAB_OK[x.key]());
      if (!allowed.length) {
        root.innerHTML = NA.ui.pageHead({ title: 'People' }) + NA.ui.notFound('screen', '#/dashboard', 'Back to Today');
        return null;
      }
      const want = TAB_ALIAS[q.tab] || q.tab;
      const tab = allowed.some((x) => x.key === want) ? want : allowed[0].key;
      const link = (patch) => {
        const nq = Object.assign({}, q, { tab }, patch || {});
        Object.keys(nq).forEach((key) => { if (nq[key] == null || nq[key] === '') delete nq[key]; });
        return '#/admin?' + Object.keys(nq).map((key) => key + '=' + encodeURIComponent(nq[key])).join('&');
      };
      const date = isDate(q.date) && q.date <= t ? q.date : t;
      const force = q.force === '1';
      const payK = tab === 'payroll' ? (isMonth(q.month) ? q.month : defaultPayMonth()) : null;
      const year = /^\d{4}$/.test(q.year || '') && q.year <= yearOf(t) ? q.year : yearOf(t);
      const counts = {
        hr: NA.db.staff.filter((s) => s.active !== false).length,
        leave: canHR() ? NA.db.leaves.filter((l) => l.status === 'pending').length : 0,
        compliance: docsDue().length,
      };
      const tabs = allowed.map((x) => Object.assign({}, x, counts[x.key] ? { count: counts[x.key] } : {}));

      let body = '', actions = '';
      if (tab === 'hr') { body = staffTab(q); if (canHR()) actions = NA.ui.btn('Add a person', { kind: 'primary', icon: 'user-plus', act: 'add-person' }); }
      else if (tab === 'attendance') body = attendanceTab(date, force);
      else if (tab === 'leave') { body = leaveTab(year); if (canHR()) actions = NA.ui.btn('Record leave', { kind: counts.leave ? 'ghost' : 'primary', icon: 'calendar', act: 'leave-record' }); }
      else if (tab === 'payroll') { body = payrollTab(payK); actions = payrollActions(payK); }
      else if (tab === 'assets') { body = assetsTab(q); if (canAssets()) actions = NA.ui.btn('Register an asset', { kind: 'primary', icon: 'plus', act: 'add-asset' }); }
      else { body = complianceTab(); if (canDocs()) actions = NA.ui.btn('Add a licence', { kind: docsDue().length ? 'ghost' : 'primary', icon: 'plus', act: 'add-doc' }); }

      root.innerHTML = NA.ui.pageHead({ title: 'People', subtitle: esc(SUBTITLE[tab] || ''), actions }) + NA.ui.tabs(tabs, tab) + body;

      const unbind = [];
      const on = (type, sel, fn) => unbind.push(NA.ui.delegate(root, type, sel, fn));
      on('click', '[data-tab]', (el) => NA.go('#/admin?tab=' + encodeURIComponent(el.dataset.tab)));
      on('click', '[data-act]', (el) => {
        if (el.disabled) return;
        const act = el.dataset.act, id = el.dataset.id;
        switch (act) {
          /* people */
          case 'dept': NA.go(link({ dept: el.dataset.k === 'all' ? '' : el.dataset.k })); break;
          case 'person': personSheet(id); break;
          case 'add-person': staffForm(null); break;
          /* attendance */
          case 'day': { const nd = NA.addDays(date, Number(el.dataset.n) || 0); NA.go(link({ date: nd >= t ? '' : nd, force: '' })); break; }
          case 'today': NA.go(link({ date: '', force: '' })); break;
          case 'force': NA.go(link({ force: '1' })); break;
          case 'att': tapStatus(el.dataset.sid, date, el.dataset.st, force); break;
          case 'att-clear': clearMark(el.dataset.sid, date, force); break;
          case 'att-rest': markRest(date, force); break;
          case 'cal': calendarSheet(id, monthOf(date)); break;
          /* leave */
          case 'leave-record': recordLeaveForm({}); break;
          case 'leave-end': leaveEndSheet(id, el.dataset.mode); break;
          case 'leave-ok': decideLeaveDirect(id, true); break;
          case 'leave-no': decideLeaveDirect(id, false); break;
          case 'year': NA.go(link({ year: String(Number(year) + (Number(el.dataset.n) || 0)) })); break;
          /* payroll */
          case 'month': NA.go(link({ month: shiftMonth(payK || monthOf(t), Number(el.dataset.n) || 0) })); break;
          case 'month-now': NA.go(link({ month: '' })); break;
          case 'pay-line': payLineSheet(payK, el.dataset.sid); break;
          case 'pay-send': sendSheet(payK); break;
          case 'pay-paid': paySheet(payK); break;
          case 'pay-undo': undoSheet(payK); break;
          case 'pay-reopen': reopenSheet(payK); break;
          case 'pay-slips': { fresh(); const ps = runState(payK); printSlips(payK, linesOf(payK, ps), ps); break; }
          case 'pay-bank': { fresh(); const ps = runState(payK); printBankList(payK, linesOf(payK, ps), ps); break; }
          /* assets */
          case 'cat': NA.go(link({ cat: el.dataset.k === 'all' ? '' : el.dataset.k })); break;
          case 'asset': assetSheet(id); break;
          case 'add-asset': assetForm(null); break;
          /* licences */
          case 'doc': docSheet(id); break;
          case 'add-doc': docForm(null); break;
          case 'add-std': docForm(null, { name: el.dataset.name, authority: el.dataset.auth }); break;
          case 'renew': renewForm(NA.get('compliance', id)); break;
          default: break;
        }
      });
      on('keydown', 'tr[data-act]', (el, ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } });
      on('change', '[data-date-pick]', (el) => { if (isDate(el.value)) NA.go(link({ date: el.value >= t ? '' : el.value, force: '' })); });
      on('change', '[data-intime]', (el) => setInTime(el.dataset.intime, date, el.value, el, force));
      let timer = null;
      on('input', '[data-search]', (el) => { clearTimeout(timer); timer = setTimeout(() => filterInPlace(root, el, link), 120); });
      return () => { clearTimeout(timer); unbind.forEach((u) => u()); };
    },
  });

  /* ---------------------------------------------------------------- for other screens */
  // Leave approved in Approvals (or on a banner here) is marked in attendance. approvals.js keeps the leave itself in step.
  if (NA.approvals) NA.approvals.onDecide('leave', (a, decision) => {
    if (!a || a.refC !== 'leaves' || decision !== 'approved' || !canHR()) return;
    fresh();
    const lv = NA.get('leaves', a.refId);
    if (!lv || lv.status === 'cancelled' || lv.status === 'rejected') return;
    const r = markLeaveDays(lv, a.decidedBy);
    if (r.skipped) NA.log(`${lv.staffName || NA.staffName(lv.staffId)}: ${plural(r.skipped, 'leave day')} in a month whose payroll is already sent were not marked in attendance`, { link: '#/admin?tab=leave', kind: 'warn' });
  });
  // Approvals → a payroll request opens that month. A leave request opens the Leave tab for Admin & HR and the MD;
  // everyone else (asking for their own leave) cannot open it, so they stay with their own requests.
  if (NA.approvals && NA.approvals.LINKS) {
    NA.approvals.LINKS.payroll = (id) => '#/admin?tab=payroll' + (isMonth(id) ? '&month=' + id : '');
    NA.approvals.LINKS.leaves = () => (canHR() ? '#/admin?tab=leave' : '#/approvals?tab=mine');
  }

  // These can be opened from other screens before People has been drawn, so they bring the page styles along.
  NA.actions.openPerson = (id) => { injectCss(); personSheet(id); };
  NA.actions.newStaff = () => { injectCss(); staffForm(null); };
  NA.actions.recordLeave = (prefill) => { injectCss(); recordLeaveForm(prefill || {}); };
  /** A payroll month as a sheet, for other screens (Today): the people, the total, and Mark as paid when approved. */
  NA.actions.openPayroll = (k) => { injectCss(); payrollSheet(isMonth(k) ? k : defaultPayMonth()); };
  NA.actions.payPayroll = (k) => { injectCss(); paySheet(isMonth(k) ? k : defaultPayMonth()); };
  /** Read-only answers for other screens (Today, Reports). */
  NA.people = {
    /** { month, state 'draft'|'pending'|'approved'|'paid', total, approval, declined, paidExpenses }. A draft has the
        live total (for Admin & HR and the MD; 0 for others) and, as approval, only a decline of its latest send. */
    payrollState: (k) => {
      fresh();
      const ps = runState(k);
      const draft = ps.st === 'draft';
      const snap = ps.run && Array.isArray(ps.run.snapshot) ? ps.run.snapshot : null;
      const total = draft ? (canWritePayroll() ? totalsOf(liveLines(k, ps.run)).net : 0)
        : num(ps.run && ps.run.total) || (snap ? sum(snap, (l) => l.net) : 0) || sum(ps.paidExp, (e) => e.amount);
      return { month: k, state: ps.st, total, approval: draft ? ps.declined || null : ps.ap || null, declined: ps.declined || null, paidExpenses: ps.paidExp.slice() };
    },
    salaryFor: (staffId, k) => { const s = NA.get('staff', staffId); return s ? salaryFor(s, isMonth(k) ? k : monthOf(NA.today())) : 0; },
    leaveBalances: (staffId, year) => { fresh(); return balances(staffId, year || yearOf()); },
    monthStats: (staffId, k) => { fresh(); const s = NA.get('staff', staffId); return s ? monthStats(s, isMonth(k) ? k : monthOf(NA.today())) : null; },
  };
})();
