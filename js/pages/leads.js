/* ==========================================================================
   Leads — stage 1 of the sales flow, from the first call to the quote.
   New → Qualified → In touch → Showroom visit → Test drive → Quote given
   → the sales order (sales.js).
   Routes: #/leads (board or list; ?stage=, ?show=due|cold|hot|new|unassigned,
           ?q=) and #/leads/<id> (one lead).
   A Sales Consultant sees and works only their own leads ("My leads"); the
   Sales Manager and the Managing Director see everyone's and hand them out.
   Approvals used here: 'discount' (a quote that gives more off than a
   consultant may) and 'transfer' (a number that is already with someone else).
   Exposes NA.actions.newLead(prefill), NA.actions.logEngagement(leadId) and
   NA.leadUtils.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const ui = NA.ui;
  const esc = NA.esc;
  const A = NA.approvals;

  /* The stages with their plain words, hints and colours come from core (search and other screens use the same words).
     The stored keys never change. */
  const STAGES = NA.FLOW.leadStages;
  const KEYS = STAGES.map((s) => s.key);
  const ALL_STAGES = STAGES.concat(NA.FLOW.leadClosed);

  /* ---------------- Reference data ---------------- */
  const SOURCE_ICON = {
    'Facebook Ads': 'tag', 'Google Ads': 'search', 'Walk-in': 'store', 'WhatsApp': 'whatsapp', 'Corporate': 'building',
    'Referral': 'users', 'Event': 'star', 'Dealer / Partner': 'briefcase', 'Website': 'globe',
  };
  const srcMeta = (s) => ({ icon: SOURCE_ICON[s] || 'info', tone: 'gray' });
  const srcBadge = (s) => (s ? ui.badge(s, 'gray', srcMeta(s).icon) : '');

  const FIN = [
    { value: 'Self', label: 'Own money', icon: 'wallet', hint: 'Cash or their savings' },
    { value: 'Bank', label: 'Bank loan', icon: 'bank', hint: 'A car loan' },
    { value: 'Corporate', label: 'Company', icon: 'building', hint: 'The company buys it' },
  ];
  const finMeta = (v) => FIN.find((f) => f.value === v) || null;
  const TIMELINES = [
    { value: 'Within 2 weeks', label: 'Within 2 weeks', icon: 'bolt', hint: 'Hot — ready to buy' },
    { value: 'This month', label: 'This month', icon: 'calendar' },
    { value: '1–3 months', label: '1–3 months', icon: 'clock' },
    { value: '3+ months', label: '3+ months', icon: 'clock', hint: 'Just exploring' },
  ];
  const ENG_TYPES = [
    { value: 'Call', label: 'Call', icon: 'phone' },
    { value: 'WhatsApp', label: 'WhatsApp', icon: 'whatsapp' },
    // A walk-in is met face to face: that is the first contact too.
    { value: 'Met in person', label: 'Met in person', icon: 'users' },
    { value: 'Email', label: 'Email', icon: 'mail' },
    { value: 'Brochure', label: 'Brochure sent', icon: 'file-text' },
  ];
  const engIcon = (t) => (ENG_TYPES.find((e) => e.value === t) || { icon: 'message' }).icon;
  const LOST_REASONS = ['Budget / price too high', 'Chose a competitor brand', 'Bought a petrol / hybrid car', 'No response', 'Postponed purchase', 'Financing not approved', 'Other'];
  /** Reasons where we want to know which car they bought instead. */
  const COMPETITOR_REASONS = ['Chose a competitor brand', 'Bought a petrol / hybrid car'];
  const BRANDS = ['Toyota', 'Honda', 'Nissan', 'Mitsubishi', 'Hyundai', 'Kia', 'MG', 'Suzuki', 'Tata', 'Tesla', 'Haval', 'Chery', 'Mercedes-Benz', 'BMW'];
  /** The button on a card: what to do next, in plain words. */
  const NEXT_VERB = { new: 'Qualify', qualified: 'Log contact', engaged: 'Add visit', visit: 'Add test drive', testdrive: 'Make quote', opportunity: 'Make order' };
  const NEXT_TITLE = {
    qualified: 'Ask about budget and timing', engaged: 'Get in touch', visit: 'Record the showroom visit',
    testdrive: 'Record the test drive', opportunity: 'Give a quote',
  };
  const NEXT_BTN = { qualified: 'Add budget', engaged: 'Log a call or message', visit: 'Add visit', testdrive: 'Add test drive', opportunity: 'Make quote' };
  /** Where an order is, in the Orders screen's words (the core list, so the two screens never drift). */
  const ORDER_STAGES = NA.FLOW.orderStages.concat(NA.FLOW.orderCancelled ? [NA.FLOW.orderCancelled] : []);
  const orderStageWord = (o) => NA.stageLabel(ORDER_STAGES, NA.biz.stageOf ? NA.biz.stageOf(o) : o.stage);

  /* ---------------- Small helpers ---------------- */
  const refresh = () => (NA.refresh ? NA.refresh() : NA.render());
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const stageLabel = (k) => NA.stageLabel(ALL_STAGES, k);
  // Colour only for meaning (core): hot stages blue, won green, the rest neutral.
  const stageTone = (k) => NA.stageTone(ALL_STAGES, k);
  const stageBadge = (k) => ui.badge(stageLabel(k), stageTone(k));
  const pol = () => NA.policy();
  const myId = () => NA.myStaffId();
  /** Owner or Sales Manager: sees everyone's leads and hands them out. */
  const isManager = () => NA.isManager();
  const canAssign = () => NA.can('leads.assign');
  const seller = (staffId) => { const s = staffId && NA.get('staff', staffId); return !!s && ['Sales Consultant', 'Sales Manager'].includes(s.role); };
  const validEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());
  const hoursSince = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / 3600000); };
  const createdDay = (l) => String(l.createdAt || NA.today()).slice(0, 10);

  /** Show a message under a form field (instead of a toast in the corner). Returns false. */
  function fieldError(scope, name, msg) {
    const input = scope.querySelector(`[name="${name}"]`);
    const field = input ? input.closest('.field') || input.closest('.check') || input.parentElement : null;
    if (field) {
      field.classList.add('invalid');
      let m = field.querySelector('.ld-err');
      if (!m) { m = document.createElement('small'); m.className = 'ld-err'; field.appendChild(m); }
      m.textContent = msg;
      try { input.focus(); } catch (e) { /* ignore */ }
    } else ui.toast(msg, 'error');
    return false;
  }
  function clearErrors(scope) {
    scope.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    scope.querySelectorAll('.ld-err').forEach((x) => x.remove());
  }

  /** Normalise any Bangladeshi mobile (+880 / 880 / spaces / dashes) to 01XXXXXXXXX. */
  function normMobile(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('880')) d = d.slice(2);
    if (d.length === 10 && d[0] === '1') d = '0' + d;
    return d;
  }
  const validMobile = (v) => /^01[3-9]\d{8}$/.test(normMobile(v));
  const prettyMobile = (v) => { const d = normMobile(v); return d.length === 11 ? d.slice(0, 5) + '-' + d.slice(5) : (v || '—'); };
  const telHref = (v) => 'tel:+88' + normMobile(v);
  const waHref = (v, text) => 'https://wa.me/88' + normMobile(v) + (text ? '?text=' + encodeURIComponent(text) : '');

  /* ---------------- Who already has this number? ----------------
     NA.lookupMobile asks the office server, so it also finds leads and customers
     this person cannot see. Closed leads (won / lost) never block anything. */
  async function whoHas(mobile, except) {
    const m = normMobile(mobile);
    if (!validMobile(m)) return [];
    let list = [];
    try { list = (await NA.lookupMobile(m)) || []; } catch (e) { list = []; }
    return list.filter((x) => !(except && x.id && x.id === except.id && x.kind === except.kind))
      .filter((x) => x.kind === 'customer' || !['won', 'lost'].includes(x.stage))
      .map((x) => Object.assign({}, x, { who: x.mine ? 'mine' : seller(x.ownerId) ? 'other' : 'free' }));
  }
  /** Does this match stop a new record? A new lead: any open lead, or another salesperson's customer.
      A new customer: any customer, or (for a consultant) another salesperson's open lead. */
  const blocks = (x, forWhat) => (forWhat === 'customer'
    ? x.kind === 'customer' || (x.who === 'other' && NA.isRole('sales'))
    : x.kind === 'lead' || x.who === 'other');

  function dupHtml(hits, forWhat) {
    if (!hits.length) return '';
    const block = hits.filter((x) => blocks(x, forWhat));
    const first = block[0] || hits[0];
    const title = !block.length ? (first.kind === 'customer' ? `Already a customer${first.name ? ': ' + first.name : ''}` : 'A lead has this number too')
      : first.mine ? 'You already have this number'
        : first.who === 'other' ? `This number is already with ${first.ownerName}` : 'This number is already in the system';
    const sub = !block.length ? (first.kind === 'customer' ? 'The new lead will be linked to this customer.' : 'You can link the lead from the customer’s page after saving.')
      : isManager() ? 'Open the existing record, or create a separate one if this really is a different person.'
        : first.mine ? 'Open it and carry on there.' : 'Ask the Sales Manager to hand it over to you — nothing is created twice.';
    const rows = hits.map((x, i) => {
      const href = x.id && NA.canSee(x.kind === 'lead' ? 'leads' : 'customers') ? (x.kind === 'lead' ? '#/leads/' : '#/customers/') + x.id : '';
      const where = x.mine ? 'Yours' : x.who === 'other' ? 'With ' + x.ownerName : 'Not with a salesperson';
      // Only consultants ask for a hand-over; managers open the record or create anyway. Any match that stops
      // the save and is not theirs gets the button — also one held by a manager, Accounts or nobody.
      const btn = href ? `<a class="btn btn-sm btn-ghost" href="${esc(href)}" data-dup-link>Open it</a>`
        : x.who !== 'mine' && blocks(x, forWhat) && NA.isRole('sales') && NA.myStaffId() ? `<button type="button" class="btn btn-sm btn-primary" data-dup-transfer="${i}">Ask Sales Manager to hand over</button>` : '';
      return `<div class="ld-dup-row"><span class="grow"><b>${x.kind === 'lead' ? 'Lead' : 'Customer'}${x.name ? ' · ' + esc(x.name) : ''}</b>
        <small>${esc(where)}${x.kind === 'lead' && x.stage ? ' · ' + esc(stageLabel(x.stage)) : ''}</small></span>${btn}</div>`;
    });
    return `<div class="callout ${block.length ? 'callout-warn' : 'callout-info'} ld-dup">${NA.icon(block.length ? 'alert' : 'info', 16)}<div class="grow">
      <b>${esc(title)}</b><small class="ld-dup-sub">${esc(sub)}</small><div class="ld-dup-list">${rows.join('')}</div>
      ${block.length && isManager() ? '<button type="button" class="btn btn-plain btn-sm" data-dup-override>Create anyway</button>' : ''}</div></div>`;
  }

  const closeModal = (el) => { const w = el && el.closest && el.closest('.overlay'); if (w && w._close) w._close(); else ui.closeTop(); };

  /** Live duplicate check inside a form modal: a box above the fields, and the main button off while blocked. */
  function wireDup(el, forWhat, except, original) {
    const input = el.querySelector('[name=mobile]');
    const box = el.querySelector('[data-dup]');
    if (!input || !box) return;
    const submit = el.querySelector('.modal-foot .btn-primary');
    let seq = 0, timer = null;
    el._dup = [];
    el._dupCheck = async () => {
      const n = ++seq;
      const v = input.value;
      const same = original && normMobile(v) === normMobile(original);
      const hits = !same && validMobile(v) ? await whoHas(v, except) : [];
      if (n !== seq) return hits;   // a newer check is on its way
      el._dup = hits;
      box.innerHTML = dupHtml(hits, forWhat);
      if (submit) submit.disabled = !isManager() && hits.some((x) => blocks(x, forWhat));
      return hits;
    };
    input.addEventListener('input', () => { el._override = false; clearTimeout(timer); timer = setTimeout(el._dupCheck, 250); });
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-dup-link]')) { closeModal(el); return; }
      const tr = e.target.closest('[data-dup-transfer]');
      if (tr) { const x = el._dup[Number(tr.dataset.dupTransfer)]; if (x) requestTransfer(x, input.value, () => closeModal(el)); return; }
      if (e.target.closest('[data-dup-override]') && submit) { el._override = true; submit.disabled = false; submit.click(); }
    });
    if (input.value) el._dupCheck();
  }

  /** Final check when saving: true = go ahead; false = blocked (the box explains why). */
  async function dupOk(el, forWhat, mobile, except) {
    const hits = await whoHas(mobile, except);
    el._dup = hits;
    const box = el.querySelector('[data-dup]');
    if (!hits.some((x) => blocks(x, forWhat)) || (isManager() && el._override)) return hits;
    if (box) box.innerHTML = dupHtml(hits, forWhat);
    const submit = el.querySelector('.modal-foot .btn-primary');
    if (submit && !isManager()) submit.disabled = true;
    return false;
  }

  /** A consultant asks the Sales Manager for a lead or customer that is with someone else. */
  function requestTransfer(x, mobile, onSent) {
    const me = NA.me();
    if (!me.staffId) { ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error'); return; }
    const m = normMobile(mobile);
    const c = x.kind === 'customer' ? 'customers' : 'leads';
    // Without a record id (the consultant cannot see it) approvals.js matches the request by the number (data.mobile).
    const id = x.id || '';
    ui.requestApproval({
      type: 'transfer', ref: { c, id, code: m }, amount: 0, value: 0,
      title: `Hand ${prettyMobile(m)} over to ${me.name}`,
      detail: `${x.kind === 'customer' ? 'Customer' : 'Lead'}${x.name ? ' ' + x.name : ''} · now with ${x.ownerName || 'nobody'}`,
      data: { mobile: m, kind: x.kind, ownerId: x.ownerId || null, toStaffId: me.staffId, toName: me.name },
      placeholder: 'e.g. The customer called me directly and wants to buy from me',
    }).then((a) => { if (a) { if (onSent) onSent(a); refresh(); } });
  }

  /** Who a new lead belongs to: a consultant's own; a manager picks one or leaves it unassigned. */
  const defaultConsultant = () => (canAssign() ? '' : NA.defaultConsultant() || myId() || '');
  /** Active consultants, plus the current one when they are not in the list (left the company), so opening and
      saving a form never quietly changes the consultant. */
  const withCurrent = (opts, cur) => {
    if (!cur || opts.some((o) => o.value === cur)) return opts;
    const s = NA.get('staff', cur);
    return opts.concat([{ value: cur, label: (s ? s.name : 'Former consultant') + (!s || s.active === false ? ' (left)' : '') }]);
  };
  const consultantOpts = (cur) => withCurrent([{ value: '', label: 'Unassigned' }].concat(ui.opts.consultants()), cur);

  const isClosed = (l) => l.stage === 'won' || l.stage === 'lost';
  const stageIdx = (l) => KEYS.indexOf(l.stage);
  const sinceIso = (l) => String(l.stageAt || l.createdAt || NA.today()).slice(0, 10);
  const daysInStage = (l) => Math.max(0, NA.daysBetween(sinceIso(l), NA.today()));
  /** overdue | today | later | none (an open lead without a date) | null (closed). */
  function fuState(l) {
    if (isClosed(l)) return null;
    if (!l.nextFollowUp) return 'none';
    const d = NA.daysBetween(NA.today(), l.nextFollowUp);
    return d < 0 ? 'overdue' : d === 0 ? 'today' : 'later';
  }
  function fuText(l) {
    const s = fuState(l);
    if (!s) return '—';
    if (s === 'none') return 'No follow-up date';
    if (s === 'overdue') return 'Overdue · ' + NA.fmt.dateShort(l.nextFollowUp);
    if (s === 'today') return 'Today';
    const d = NA.daysBetween(NA.today(), l.nextFollowUp);
    return d === 1 ? 'Tomorrow' : NA.fmt.dateShort(l.nextFollowUp);
  }
  const fuTone = (f) => (f === 'overdue' ? 'tone-red strong' : f === 'today' || f === 'none' ? 'tone-amber strong' : '');
  const chanFromFin = (f) => (f === 'Bank' ? 'Bank' : f === 'Corporate' ? 'Corporate' : 'Retail');

  const orderOf = (l) => (l.orderId ? NA.get('orders', l.orderId) : null);
  /** A won lead whose order was cancelled afterwards: the buyer can be worked again. */
  const orderCancelled = (l) => { const o = l.stage === 'won' ? orderOf(l) : null; return !!o && o.stage === 'cancelled'; };
  /** Hours a lead has waited for its first call (0 = contacted, closed or still within the limit).
      A lead counts as contacted once a call, message or meeting is logged, or once it has moved past New
      (budget and timing are asked on that first call). */
  function notContacted(l) {
    if (isClosed(l) || l.stage !== 'new' || (l.engagements || []).length) return 0;
    const h = hoursSince(l.createdAt);
    return h >= (Number(pol().firstContactHours) || 24) ? h : 0;
  }
  const waitText = (h) => (h < 48 ? Math.floor(h) + 'h' : Math.floor(h / 24) + ' days');
  const coldBadge = (l) => { const h = notContacted(l); return h ? ui.badge('Not contacted · ' + waitText(h), 'red', 'clock') : ''; };

  /* ---------------- Quotes and their approval ---------------- */
  /** List price for a quote: stored on new quotes; older ones fall back to today's list price. */
  const listPriceOf = (l, q) => Number(q && q.listPrice) || Number((NA.model((q && q.modelId) || l.modelId) || {}).price) || Number(q && q.price) || 0;
  /** Everything given away on a quote: the discount plus any cut below the list price. */
  const concessionOf = (l, q) => (q ? Math.max(0, listPriceOf(l, q) - (Number(q.price) || 0)) + (Number(q.discount) || 0) : 0);
  /** key: none | ok | ask (needs approval, not asked yet) | pending | rejected | expired | stale (the model changed). */
  function quoteState(l) {
    const q = l.quotation;
    if (!q || !(Number(q.price) > 0)) return { key: 'none', q: null, conc: 0, needs: false, appr: null };
    const conc = concessionOf(l, q);
    const needs = conc > (Number(pol().discountFree) || 0);
    const appr = needs ? A.find('leads', l.id, 'discount') : null;
    const st = needs ? A.state('leads', l.id, 'discount', conc) : 'approved';
    let key = st === 'approved' ? 'ok' : st === 'pending' ? 'pending' : st === 'rejected' ? 'rejected' : 'ask';
    // A request or a decline only speaks for the amount it was about: a new version with a different amount is asked afresh.
    if ((key === 'pending' || key === 'rejected') && appr && Math.abs((Number(appr.value) || 0) - conc) > 0.5) key = 'ask';
    if (q.modelId && q.modelId !== l.modelId) key = 'stale';
    else if (q.validUntil && q.validUntil < NA.today()) key = 'expired';
    return { key, q, conc, needs, appr };
  }
  const QUOTE_WORD = { ok: 'Ready', ask: 'Needs approval', pending: 'Waiting for approval', rejected: 'Discount declined', expired: 'Expired', stale: 'For another model' };
  const QUOTE_TONE = { ok: 'green', ask: 'amber', pending: 'amber', rejected: 'red', expired: 'red', stale: 'red' };
  const quoteBadge = (s) => (s.key === 'none' ? '' : ui.badge(QUOTE_WORD[s.key], QUOTE_TONE[s.key]));
  /** Why a quote cannot be printed or turned into an order yet ('' = it can). */
  function quoteBlock(s) {
    if (s.key === 'ok') return '';
    if (s.key === 'none') return 'Make a quote first';
    if (s.key === 'expired') return `The quote expired on ${NA.fmt.date(s.q.validUntil)} — renew it first`;
    if (s.key === 'stale') return 'The quote is for a different model — make a new one';
    if (s.key === 'pending') return `Waiting for approval from ${s.appr ? A.approverText(s.appr) : 'the Sales Manager'}`;
    if (s.key === 'rejected') return `The discount was declined${s.appr && s.appr.decidedBy ? ' by ' + s.appr.decidedBy : ''} — change the quote`;
    return `${NA.fmt.money(s.conc)} off needs approval first`;
  }

  function quoteCalc(q) {
    const net = Math.max(0, (Number(q.price) || 0) - (Number(q.discount) || 0));
    const vr = NA.db.settings.vatRate != null ? Number(NA.db.settings.vatRate) : 0.15;
    const base = Math.round(net / (1 + vr));
    return { net, base, vat: net - base, vr };
  }

  /** Bangladeshi amount in words (crore / lakh / thousand). */
  function takaWords(n) {
    n = Math.round(Number(n) || 0);
    if (!n) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : ''));
    const three = (x) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
    const out = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(takaWords(crore) + ' Crore');
    if (lakh) out.push(two(lakh) + ' Lakh');
    if (th) out.push(two(th) + ' Thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }

  /* ---------------- Stage requirements (the flowchart's rules) ---------------- */
  function reqs(l, key) {
    const v = l.visit || {}; const t = l.testDrive || {}; const q = l.quotation || {};
    switch (key) {
      case 'new': return [
        { label: 'Name', ok: !!l.name }, { label: 'Mobile number (11 digits)', ok: validMobile(l.mobile) },
        { label: 'Where the lead came from', ok: !!l.source }, { label: 'Model they want', ok: !!l.modelId }];
      case 'qualified': return [
        { label: 'Budget', ok: Number(l.budget) > 0 }, { label: 'How they will pay', ok: !!l.financing }, { label: 'When they plan to buy', ok: !!l.timeline }];
      case 'engaged': return [{ label: 'At least one call, message, meeting, email or brochure', ok: (l.engagements || []).length > 0 }];
      case 'visit': return [
        { label: 'Visit date', ok: !!v.date }, { label: 'Who met them', ok: !!v.consultantId }, { label: 'Models they looked at', ok: (v.modelsViewed || []).length > 0 }];
      case 'testdrive': {
        // The customer did not want one (a fleet buyer, a repeat buyer): the recorded reason completes the step.
        if (t.skipped) return [{ label: 'No test drive: ' + String(t.skipped.reason || 'reason given').split(' — ')[0], ok: true }];
        // Older records were ticked "licence verified" before the expiry date was asked for.
        const legacyLicence = !!t.licenceVerified && !('licenceExpiry' in t);
        return [
          { label: 'Test-drive form signed', ok: !!t.formSigned }, { label: 'Driving licence number', ok: !!t.licenceNo },
          { label: 'Licence valid on the day', ok: legacyLicence || (!!t.licenceExpiry && t.licenceExpiry >= (t.date || NA.today())) }];
      }
      case 'opportunity': {
        const s = quoteState(l);
        const out = [
          { label: 'Quote with a price', ok: Number(q.price) > 0 }, { label: 'How they will pay', ok: !!q.channel }, { label: 'Valid until date', ok: !!q.validUntil }];
        // Shown on the checklist, but they do not stop the lead reaching this stage.
        if (s.key !== 'none') out.push({ label: 'Quote still valid', ok: s.key !== 'expired', soft: true });
        if (s.needs) out.push({ label: `${NA.fmt.money(s.conc)} off approved`, ok: s.key === 'ok' || (s.key === 'expired' && A.isApproved('leads', l.id, 'discount', s.conc)), soft: true });
        return out;
      }
      default: return [];
    }
  }
  const complete = (l, key) => reqs(l, key).filter((r) => !r.soft).every((r) => r.ok);
  /** Stage a lost lead returns to: the recorded lostFrom, else the furthest stage whose data is complete. */
  function reopenStage(l) {
    if (KEYS.includes(l.lostFrom)) return l.lostFrom;
    let k = 0;
    while (k + 1 < KEYS.length && complete(l, KEYS[k + 1])) k++;
    return KEYS[k];
  }
  const missing = (l, key) => reqs(l, key).filter((r) => !r.ok && !r.soft).map((r) => r.label);
  const checklistHtml = (l, key) => `<ul class="checklist">${reqs(l, key).map((r) => `<li class="${r.ok ? 'ok' : ''}">${NA.icon(r.ok ? 'check-circle' : 'clock', 16)}${esc(r.label)}</li>`).join('')}</ul>`;

  /* ---------------- Mutations ---------------- */
  function setStage(l, key, verb) {
    const from = l.stage;
    const back = KEYS.indexOf(key) < KEYS.indexOf(from);
    // "Days in stage" restarts only on a forward move, so moving a card back and forth cannot hide a stale lead.
    NA.update('leads', l.id, back ? { stage: key } : { stage: key, stageAt: NA.today() });
    NA.log(`${l.name} (${l.code}) ${verb || (back ? 'moved back to' : 'moved to')} ${stageLabel(key)}`, { rec: l, link: '#/leads/' + l.id, kind: back ? 'info' : 'success' });
    ui.toast(`${l.name} → ${stageLabel(key)}`);
    refresh();
  }

  /** Move a lead to any lane. Forward moves must satisfy every stage in between;
      the first missing stage's form is opened, then the move continues. */
  function moveTo(l, target) {
    if (!l || target === l.stage) return;
    if (l.stage === 'won' && !orderCancelled(l)) { ui.toast(`${l.name} already has an order`, 'info'); return; }
    if (target === 'won') return convertLead(l);
    if (target === 'lost') return l.stage === 'lost' ? undefined : markLost(l);
    if (l.stage === 'lost' || l.stage === 'won') {
      const why = l.stage === 'won' ? 'Their order was cancelled.' : 'It was marked as lost.';
      ui.confirm(`Open <b>${esc(l.name)}</b> again? ${why}`, { title: 'Reopen lead', okLabel: 'Reopen' }).then((ok) => {
        if (!ok) return;
        reopen(l, true);
        moveTo(l, target);
      });
      return;
    }
    const cur = stageIdx(l); const tgt = KEYS.indexOf(target);
    if (tgt < 0) return;
    if (tgt < cur) { setStage(l, target); return; }
    for (let i = cur + 1; i <= tgt; i++) {
      const k = KEYS[i];
      if (!complete(l, k)) {
        if (i - 1 > cur) setStage(l, KEYS[i - 1]);
        openStageForm(l, k, {
          intro: `To move <b>${esc(l.name)}</b> to <b>${esc(stageLabel(k))}</b>, please capture: ${esc(missing(l, k).join(' · '))}.`,
          after: () => {
            if (complete(l, k)) moveTo(l, target);
            else ui.toast(`Saved. ${stageLabel(k)} still needs: ${missing(l, k).join(', ')}`, 'info');
          },
        });
        return;
      }
    }
    setStage(l, target);
  }

  function advanceLead(l) {
    if (l.stage === 'opportunity') return convertLead(l);
    if (l.stage === 'lost' || orderCancelled(l)) return reopen(l);
    const i = stageIdx(l);
    if (i >= 0 && i < KEYS.length - 1) moveTo(l, KEYS[i + 1]);
  }

  /** Send the quote's discount for approval — or approve it at once when this person may. */
  function askDiscount(l) {
    const s = quoteState(l);
    if (!s.q || !s.needs || s.key === 'ok') return Promise.resolve(null);
    const q = s.q;
    const opts = {
      type: 'discount', ref: { c: 'leads', id: l.id, code: q.no || l.code }, amount: s.conc, value: s.conc,
      data: { modelId: q.modelId || l.modelId || '', quoteNo: q.no || '' },
      title: `${NA.fmt.money(s.conc)} off ${NA.modelName(q.modelId || l.modelId)} for ${l.name}`,
      detail: `Quote ${q.no || l.code} · list price ${NA.fmt.money(listPriceOf(l, q))} · customer pays ${NA.fmt.money(quoteCalc(q).net)}`,
      placeholder: 'e.g. Matching a competitor offer, repeat customer',
    };
    if (!A.needed('discount', s.conc)) { const a = A.request(opts); ui.toast('Discount approved'); refresh(); return Promise.resolve(a); }
    return ui.requestApproval(opts).then((a) => { refresh(); return a; });
  }

  /** The number already belongs to another salesperson's customer: hand-over first, then the order. */
  function customerElsewhere(l, x) {
    ui.modal({
      title: 'This customer is with someone else', size: 'sm',
      body: `<p>${esc(prettyMobile(l.mobile))} is already a customer of <b>${esc(x.ownerName)}</b>. Ask the Sales Manager to hand the customer over to you before you make the order, so nothing is entered twice.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Ask Sales Manager', kind: 'primary', onClick: () => { requestTransfer(x, l.mobile); } }],
    });
  }

  /** Leads whose order sheet is being opened (the server check takes a moment): a second click does nothing. */
  const converting = new Set();
  async function convertLead(l) {
    if (converting.has(l.id)) return;
    converting.add(l.id);
    try { await openOrderFor(l); } finally { converting.delete(l.id); }
  }
  async function openOrderFor(l) {
    if (l.stage === 'won' && !orderCancelled(l)) { if (l.orderId) NA.go('#/sales/' + l.orderId); return; }
    if (!NA.can('orders.create')) { ui.toast('Orders are made by the sales team', 'info'); return; }
    if (l.stage !== 'opportunity') {
      ui.toast('Finish the earlier steps and give a quote first', 'info');
      if (!isClosed(l)) moveTo(l, 'opportunity');
      return;
    }
    if (!complete(l, 'opportunity')) { openStageForm(l, 'opportunity', { intro: 'Finish the quote first — then you can make the order.' }); return; }
    const s = quoteState(l);
    if (s.key === 'expired' || s.key === 'stale') { ui.toast(quoteBlock(s), 'info'); openStageForm(l, 'opportunity'); return; }
    if (s.key === 'ask') { askDiscount(l); return; }
    if (s.key !== 'ok') { ui.toast(quoteBlock(s), 'info'); return; }
    if (!NA.actions || typeof NA.actions.newOrder !== 'function') { ui.toast('The Orders screen is not available — the order cannot be made here', 'error'); return; }
    // The customer: the one linked to this lead; otherwise one with the same number (checked across the whole
    // company, so a customer of another salesperson is never entered twice). Nothing is written until the order is saved.
    let customerId = l.customerId && NA.customer(l.customerId) ? l.customerId : '';
    if (!customerId) {
      const hits = (await whoHas(l.mobile)).filter((x) => x.kind === 'customer');
      const seen = hits.find((x) => x.id && NA.customer(x.id));
      const hidden = hits.find((x) => !x.id && x.who === 'other');
      if (seen) customerId = seen.id;
      else if (hidden && !isManager()) { customerElsewhere(l, hidden); return; }
    }
    // The lead may have changed while the server was asked (an order made on another screen, a new quote).
    const fresh = NA.get('leads', l.id) || l;
    if (fresh.stage === 'won' && !orderCancelled(fresh)) { if (fresh.orderId) NA.go('#/sales/' + fresh.orderId); return; }
    if (quoteState(fresh).key !== 'ok') { ui.toast(quoteBlock(quoteState(fresh)), 'info'); return; }
    const q = fresh.quotation;
    // The Orders screen books today's list price less one discount, so everything given on the quote (a price cut
    // as well as the discount) travels as that discount; it equals the value approved on the lead.
    const lp = listPriceOf(fresh, q);
    const prefill = {
      leadId: fresh.id, modelId: q.modelId || fresh.modelId, color: q.color || '', channel: q.channel || chanFromFin(fresh.financing),
      price: lp, discount: concessionOf(fresh, q), listPrice: lp, quoteNo: q.no || '', consultantId: fresh.consultantId || '',
    };
    if (customerId) prefill.customerId = customerId;
    NA.actions.newOrder(prefill);
  }

  function markLost(l) {
    const m = ui.formModal({
      title: 'Mark as lost', subtitle: esc(l.name) + ' · ' + esc(l.code), submitLabel: 'Mark as lost', size: 'md',
      fields: [
        { name: 'reason', label: 'Why did we lose this lead?', type: 'radio-cards', options: LOST_REASONS, required: true, span: 2 },
        { name: 'brand', label: 'Which brand did they buy?', placeholder: 'e.g. Toyota' },
        { name: 'model', label: 'Which model?', placeholder: 'e.g. Corolla Cross hybrid' },
        { name: 'note', label: 'Anything else? (optional)', type: 'textarea', span: 2, rows: 2, placeholder: 'e.g. They were offered ৳ 2 lakh more off elsewhere' },
      ],
      onSubmit: (v, el) => {
        clearErrors(el);
        const comp = COMPETITOR_REASONS.includes(v.reason);
        // Reports ask "why do we lose?": when they bought another car, both the brand and the model are needed.
        if (comp && !v.brand) return fieldError(el, 'brand', 'Which brand did they buy instead?');
        if (comp && !v.model) return fieldError(el, 'model', 'Which model did they buy?');
        const lostTo = comp ? [v.brand, v.model].filter(Boolean).join(' ') : '';
        const reason = v.reason + (v.note ? ' — ' + v.note : '');
        NA.update('leads', l.id, {
          stage: 'lost', lostFrom: KEYS.includes(l.stage) ? l.stage : l.stage === 'won' ? 'opportunity' : 'new', lostReason: reason, lostAt: NA.today(), stageAt: NA.today(),
          lostTo, lostCompetitor: comp ? { brand: v.brand, model: v.model } : null, nextFollowUp: '',
        });
        NA.log(`Lead ${l.name} (${l.code}) marked lost: ${reason}${lostTo ? ' · went to ' + lostTo : ''}`, { rec: l, link: '#/leads/' + l.id, kind: 'warn' });
        ui.toast('Marked as lost', 'info');
        refresh();
      },
    });
    m.classList.add('ld-modal');
    // Brand and model only matter when the customer bought something else.
    const brand = m.querySelector('[name=brand]');
    if (brand) { brand.setAttribute('list', 'ld-brands'); brand.insertAdjacentHTML('afterend', `<datalist id="ld-brands">${BRANDS.map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist>`); }
    const toggle = () => {
      const r = (m.querySelector('[name=reason]:checked') || {}).value;
      ['brand', 'model'].forEach((n) => { const f = m.querySelector(`[name=${n}]`); const box = f && f.closest('.field'); if (box) box.classList.toggle('hidden', !COMPETITOR_REASONS.includes(r)); });
    };
    m.addEventListener('change', toggle);
    toggle();
  }

  function reopen(l, silent) {
    const to = reopenStage(l);
    const patch = { stage: to, stageAt: NA.today(), lostReason: '', lostTo: '', lostCompetitor: null };
    // A lead whose order was cancelled starts again without it (the order stays in its history).
    if (l.orderId) {
      const o = orderOf(l);
      if (!o || o.stage === 'cancelled') Object.assign(patch, { orderId: null, wonAt: null, pastOrderIds: (l.pastOrderIds || []).concat([l.orderId]) });
    }
    if (!l.nextFollowUp || l.nextFollowUp < NA.today()) patch.nextFollowUp = NA.today();
    NA.update('leads', l.id, patch);
    NA.log(`Lead ${l.name} (${l.code}) reopened at ${stageLabel(to)}`, { rec: l, link: '#/leads/' + l.id });
    if (!silent) { ui.toast('Lead reopened'); refresh(); }
  }

  /** Every open lead keeps a next follow-up date (today or later). */
  function setFollowUp(l, date) {
    if (!date) { ui.toast('Every open lead needs a next follow-up date', 'info'); return; }
    if (date < NA.today()) { ui.toast('Pick today or a later day', 'error'); refresh(); return; }
    NA.update('leads', l.id, { nextFollowUp: date });
    NA.log(`Next follow-up for ${l.name} set to ${NA.fmt.date(date)}`, { rec: l, link: '#/leads/' + l.id });
    ui.toast('Follow-up set for ' + NA.fmt.date(date));
    refresh();
  }

  /* ---------------- Forms ---------------- */
  function introBox(html) { return html ? `<div class="callout callout-info ld-intro">${NA.icon('info', 16)}<div>${html}</div></div>` : ''; }

  function openStageForm(l, key, opts = {}) {
    if (key === 'new') return editContact(l);
    const cur = () => NA.get('leads', l.id) || l;
    const model = NA.model(l.modelId) || {};
    const minDay = createdDay(l);
    // Evidence dates: not in the future, not before the lead came in.
    const dayCheck = (el, name, v, what) => (v > NA.today() ? fieldError(el, name, `${what} can’t be in the future`)
      : v < minDay ? fieldError(el, name, `This is before the lead came in (${NA.fmt.date(minDay)})`) : true);
    const save = (patch, text, kind) => {
      NA.update('leads', l.id, patch);
      NA.log(text, { rec: cur(), link: '#/leads/' + l.id, kind: kind || 'info' });
      if (opts.after) opts.after(); else ui.toast('Saved');
      refresh();
    };
    let cfg;
    switch (key) {
      case 'qualified':
        cfg = {
          title: 'Budget and timing', submitLabel: 'Save',
          fields: [
            { name: 'budget', label: 'Their budget (with VAT)', type: 'money', required: true, placeholder: 'Ask the customer', help: model.price ? `${NA.modelName(model.id)} costs ${NA.fmt.money(model.price)}` : '' },
            { name: 'company', label: 'Company (if a company is buying)', placeholder: 'Optional' },
            { name: 'financing', label: 'How will they pay?', type: 'radio-cards', options: FIN, required: true, span: 2 },
            { name: 'timeline', label: 'When do they plan to buy?', type: 'radio-cards', options: TIMELINES, required: true, span: 2 },
          ],
          // The budget starts empty so an entered figure is never confused with the list price.
          values: { budget: l.budget || '', financing: l.financing || '', timeline: l.timeline || '', company: l.company || '' },
          onSubmit: (v, el) => {
            clearErrors(el);
            if (!(Number(v.budget) > 0)) return fieldError(el, 'budget', 'Enter the budget the customer told you');
            save({ budget: Number(v.budget), financing: v.financing, timeline: v.timeline, company: v.company },
              `Qualified ${l.name}: budget ${NA.fmt.money(v.budget)} · ${v.financing} · ${v.timeline}`);
          },
        };
        break;
      case 'engaged': {
        const open = !isClosed(l);
        cfg = {
          title: 'Log a call or message', submitLabel: 'Save',
          fields: [
            { name: 'type', label: 'How did you reach them?', type: 'radio-cards', options: ENG_TYPES, required: true, span: 2 },
            { name: 'date', label: 'When', type: 'date', required: true, max: NA.today(), min: minDay },
            { name: 'nextFollowUp', label: 'Next follow-up', type: 'date', required: open, min: NA.today(), help: 'When to contact them again' },
            { name: 'note', label: 'What did you talk about?', type: 'textarea', span: 2, placeholder: 'e.g. Sent the price list, wants a test drive on Saturday' },
          ],
          // A walk-in's first contact was face to face.
          values: { type: opts.type || (l.source === 'Walk-in' && !(l.engagements || []).length ? 'Met in person' : ''), date: NA.today(), nextFollowUp: l.nextFollowUp && l.nextFollowUp > NA.today() ? l.nextFollowUp : NA.addDays(NA.today(), 2) },
          onSubmit: (v, el) => {
            clearErrors(el);
            if (dayCheck(el, 'date', v.date, 'This') === false) return false;
            if (open && v.nextFollowUp < NA.today()) return fieldError(el, 'nextFollowUp', 'Pick today or a later day');
            const f = cur();
            const eng = { date: v.date, type: v.type, note: v.note || '', by: NA.me().name, byId: myId() };
            save({ engagements: [eng].concat(f.engagements || []), nextFollowUp: v.nextFollowUp || f.nextFollowUp || '' },
              `${v.type} with ${l.name}${v.note ? ': ' + v.note : ''}`);
          },
        };
        break;
      }
      case 'visit': {
        const v0 = l.visit || {};
        const viewed = v0.modelsViewed && v0.modelsViewed.length ? v0.modelsViewed : [l.modelId];
        // Models on sale, plus any recorded earlier that are no longer on sale (they must not vanish when saved again).
        const models = NA.db.models.filter((m) => m.active !== false || viewed.includes(m.id));
        cfg = {
          title: 'Showroom visit', submitLabel: 'Save visit',
          fields: [
            { name: 'date', label: 'Visit date', type: 'date', required: true, max: NA.today(), min: minDay },
            { name: 'consultantId', label: 'Who met them', type: 'select', options: withCurrent(ui.opts.consultants(), v0.consultantId), required: true },
          ],
          values: { date: v0.date || '', consultantId: v0.consultantId || l.consultantId || myId() || '' },
          onMount: (el) => {
            const grid = el.querySelector('form .form-grid');
            if (grid) grid.insertAdjacentHTML('beforeend', `<div class="field span-2"><label>Models they looked at <i class="req">*</i></label>
              <div class="ld-pick">${models.map((m) => `<label class="ld-pick-chip"><input type="checkbox" class="box" name="mv_${esc(m.id)}" ${viewed.includes(m.id) ? 'checked' : ''}/><span>${esc(NA.modelName(m.id))}</span></label>`).join('')}</div></div>`);
          },
          onSubmit: (v, el) => {
            clearErrors(el);
            if (dayCheck(el, 'date', v.date, 'A visit') === false) return false;
            const ids = Object.keys(v).filter((k) => k.startsWith('mv_') && v[k]).map((k) => k.slice(3));
            if (!ids.length) return fieldError(el, 'mv_' + (models[0] || {}).id, 'Tick at least one model they looked at');
            save({ visit: { date: v.date, consultantId: v.consultantId, modelsViewed: ids } },
              `Showroom visit on ${NA.fmt.date(v.date)} with ${NA.staffName(v.consultantId)} — looked at ${ids.map(NA.modelName).join(', ')}`);
          },
        };
        break;
      }
      case 'testdrive': {
        const t0 = l.testDrive || {};
        // Real cars only: demo cars from stock first, then company vehicles still in use (not sold or scrapped). The record keeps which one.
        const cars = NA.where('vehicles', (v) => v.status === 'demo')
          .map((v) => ({ value: 'v:' + v.id, label: NA.modelName(v.modelId) + (v.regNo ? ' · ' + v.regNo : v.vin ? ' · ' + String(v.vin).slice(-6) : '') }))
          .concat(NA.where('assets', (a) => a.category === 'Vehicle' && a.condition !== 'Disposed' && !a.disposedAt).map((a) => ({ value: 'a:' + a.id, label: a.name })));
        if (!cars.length) cars.push({ value: 'x:', label: NA.modelName(l.modelId) + ' demo car' });
        const was = t0.vehicleId ? 'v:' + t0.vehicleId : t0.assetId ? 'a:' + t0.assetId : t0.vehicle ? 'x:' + t0.vehicle : '';
        if (was && !cars.some((o) => o.value === was)) cars.unshift({ value: was, label: t0.vehicle || 'Car used earlier' });
        const booked = t0.plannedFor && t0.plannedFor.date && t0.plannedFor.date <= NA.today() ? t0.plannedFor.date : '';
        cfg = {
          title: 'Test drive', submitLabel: 'Save test drive',
          intro: `<p class="ld-lede">The test drive counts once the customer has signed the form and you have seen a driving licence that is valid on the day.${isClosed(l) ? ''
            : ' <button type="button" class="btn btn-link" data-skip-td>No test drive wanted?</button>'}</p>`,
          onMount: (el) => {
            const b = el.querySelector('[data-skip-td]');
            if (b) b.addEventListener('click', () => { closeModal(el); skipTestDrive(cur(), opts); });
          },
          fields: [
            { name: 'date', label: 'Test-drive date', type: 'date', required: true, max: NA.today(), min: minDay },
            { name: 'car', label: 'Car used', type: 'select', options: cars, placeholder: false },
            { name: 'licenceNo', label: 'Driving licence number', placeholder: 'e.g. DK0123456' },
            { name: 'licenceExpiry', label: 'Licence valid until', type: 'date' },
            { name: 'formSigned', label: 'The customer signed the test-drive form', type: 'checkbox', span: 2 },
          ],
          values: { date: t0.date || booked, car: was || cars[0].value, licenceNo: t0.licenceNo || '', licenceExpiry: t0.licenceExpiry || '', formSigned: !!t0.formSigned },
          onSubmit: (v, el) => {
            clearErrors(el);
            if (dayCheck(el, 'date', v.date, 'A test drive') === false) return false;
            if (v.licenceExpiry && !v.licenceNo) return fieldError(el, 'licenceNo', 'Enter the licence number too');
            if (v.licenceExpiry && v.licenceExpiry < v.date) return fieldError(el, 'licenceExpiry', 'This licence had already expired on the test-drive day');
            const car = cars.find((o) => o.value === v.car) || cars[0];
            const kind = String(car.value).slice(0, 2);
            const td = {
              date: v.date, vehicle: car.label, vehicleId: kind === 'v:' ? car.value.slice(2) : null, assetId: kind === 'a:' ? car.value.slice(2) : null,
              licenceNo: v.licenceNo || '', licenceExpiry: v.licenceExpiry || '', licenceVerified: !!(v.licenceNo && v.licenceExpiry && v.licenceExpiry >= v.date),
              formSigned: !!v.formSigned, by: NA.me().name, byId: myId(),
            };
            const ok = td.formSigned && td.licenceVerified;
            save({ testDrive: td }, ok ? `Test drive done by ${l.name} (${car.label})` : `Test drive details saved for ${l.name} — form or licence still missing`, ok ? 'success' : 'info');
          },
        };
        break;
      }
      case 'opportunity': {
        const q0 = l.quotation || {};
        const same = !q0.modelId || q0.modelId === l.modelId;
        const p = pol();
        const lp = Number(model.price) || 0;
        // The price is the model's list price. Only a manager may change it; consultants give a discount.
        const priceEditable = isManager();
        const maxValid = NA.addDays(NA.today(), Number(p.quoteValidDays) || 7);
        const money = NA.fmt.money;
        cfg = {
          title: q0.price ? 'New version of the quote' : 'Make a quote', submitLabel: 'Save quote', size: 'lg',
          intro: q0.price ? `<p class="ld-lede">The earlier version${q0.no ? ' (' + esc(q0.no) + ')' : ''} is kept on the lead. This one starts at today’s list price.</p>` : '',
          fields: [
            priceEditable ? { name: 'price', label: 'Price (with VAT)', type: 'money', required: true, help: 'List price ' + money(lp) } : null,
            { name: 'discount', label: 'Discount', type: 'money', help: `Up to ${money(p.discountFree)} without asking — more needs approval` },
            { name: 'color', label: 'Colour', type: 'select', options: ui.opts.colors(l.modelId), placeholder: 'Not decided yet' },
            { name: 'validUntil', label: 'Valid until', type: 'date', required: true, min: NA.today(), max: priceEditable ? null : maxValid },
            { name: 'channel', label: 'How will they pay?', type: 'radio-cards', required: true, span: 2,
              options: NA.FLOW.channels.map((c) => ({ value: c.key, label: c.label, icon: c.icon, hint: c.key === 'Corporate' ? 'A purchase order confirms it' : c.key === 'Bank' ? 'Loan plus their own money' : 'Booking money' })) },
            { name: 'notes', label: 'What is included (optional)', type: 'textarea', span: 2, rows: 2, placeholder: 'e.g. Free first-year service and a wall charger' },
          ].filter(Boolean),
          values: {
            price: same && Number(q0.price) && q0.listPrice === lp ? q0.price : lp, discount: same ? q0.discount || '' : '', color: same ? q0.color || '' : '',
            channel: q0.channel || chanFromFin(l.financing), validUntil: maxValid, notes: q0.notes || '',
          },
          onMount: (el) => {
            el.querySelector('.modal-body').insertAdjacentHTML('beforeend', '<div class="ld-qprev" data-qprev></div>');
            const draw = () => {
              const f = ui.readForm(el.querySelector('form'));
              const q = { modelId: l.modelId, listPrice: lp, price: priceEditable ? Number(f.price) || 0 : lp, discount: Number(f.discount) || 0 };
              const c = quoteCalc(q);
              const conc = concessionOf(l, q);
              const needs = conc > (Number(p.discountFree) || 0);
              const self = needs && !A.needed('discount', conc);
              const who = A.approverRoles('discount', conc).map(NA.roleLabel).join(' or ');
              el.querySelector('[data-qprev]').innerHTML = `<div class="ld-qprev-grid">
                  <div><small>Customer pays (with VAT)</small><b class="num">${money(c.net)}</b></div>
                  <div><small>Price without VAT</small><span class="num">${money(c.base)}</span></div>
                  <div><small>VAT ${Math.round(c.vr * 100)}% included</small><span class="num">${money(c.vat)}</span></div></div>
                ${needs ? `<p class="ld-qprev-note">${NA.icon('info', 14)}<span>${self ? `${money(conc)} off is within your own limit — it is approved when you save.`
                  : `${money(conc)} off needs approval from the ${esc(who)}. You can send it straight after saving; printing and the order wait until it is approved.`}</span></p>` : ''}`;
            };
            el.addEventListener('input', draw); el.addEventListener('change', draw); draw();
          },
          onSubmit: (v, el) => {
            clearErrors(el);
            const price = priceEditable ? Number(v.price) || 0 : lp;
            const discount = Number(v.discount) || 0;
            if (price <= 0) {
              if (priceEditable) return fieldError(el, 'price', 'Enter the price');
              ui.toast('This model has no list price yet — the Managing Director sets it in Settings', 'error'); return false;
            }
            if (discount < 0 || discount >= price) return fieldError(el, 'discount', 'The discount must be less than the price');
            if (!v.validUntil || v.validUntil < NA.today()) return fieldError(el, 'validUntil', 'Pick today or a later day');
            if (!priceEditable && v.validUntil > maxValid) return fieldError(el, 'validUntil', `A quote is valid for up to ${p.quoteValidDays} days`);
            const f = cur();
            const prev = f.quotation && Number(f.quotation.price) > 0 ? f.quotation : null;
            // One number per lead, a revision suffix per new version: Q-0007, Q-0007-R2 …
            const base = f.quoteNo || (prev && prev.no ? String(prev.no).replace(/-R\d+$/, '') : '') || NA.nextCode('Q');
            const rev = 1 + (f.quotes || []).length + (prev ? 1 : 0);
            const q = {
              no: base + (rev > 1 ? '-R' + rev : ''), rev, date: NA.today(), modelId: f.modelId, listPrice: lp, price, discount,
              color: v.color || '', channel: v.channel, validUntil: v.validUntil, notes: v.notes || '', by: NA.me().name, byId: myId(), at: new Date().toISOString(),
            };
            const quotes = prev ? (f.quotes || []).concat([Object.assign({}, prev, { status: 'replaced', replacedAt: NA.today() })]) : (f.quotes || []);
            NA.update('leads', l.id, { quotation: q, quoteNo: base, quotes });
            NA.log(`Quote ${q.no} for ${l.name}: ${money(price - discount)}${discount ? ' (' + money(discount) + ' off)' : ''} · ${v.channel}`, { rec: cur(), link: '#/leads/' + l.id, kind: 'money' });
            ui.toast('Quote ' + q.no + ' saved');
            // More off than a consultant may give: ask for approval now (approved at once when this person may).
            const conc = concessionOf(f, q);
            if (conc > (Number(p.discountFree) || 0) && !A.isApproved('leads', l.id, 'discount', conc)) askDiscount(cur());
            if (opts.after) opts.after();
            refresh();
          },
        };
        break;
      }
      default: return;
    }
    const m = ui.formModal({
      title: cfg.title, subtitle: esc(l.name) + ' · ' + esc(l.code) + ' · ' + esc(NA.modelName(l.modelId)), fields: cfg.fields, values: cfg.values,
      submitLabel: cfg.submitLabel, size: cfg.size || 'md', intro: introBox(opts.intro) + (cfg.intro || ''), onSubmit: cfg.onSubmit,
    });
    m.classList.add('ld-modal');
    if (cfg.onMount) cfg.onMount(m);
  }

  /* ---------------- Test drive: booked ahead, or not wanted ---------------- */
  const SKIP_REASONS = ['Company or fleet purchase', 'Has driven this model before', 'The customer does not want one', 'Other'];

  /** Book a drive ahead (the drive itself is recorded after it happens). The booked day is also the next follow-up. */
  function bookTestDrive(l) {
    const p0 = (l.testDrive || {}).plannedFor || {};
    const m = ui.formModal({
      title: p0.date ? 'Change the test-drive booking' : 'Book a test drive', subtitle: esc(l.name) + ' · ' + esc(l.code), size: 'sm', submitLabel: 'Book',
      fields: [
        { name: 'date', label: 'Day', type: 'date', required: true, min: NA.today() },
        { name: 'time', label: 'Time (optional)', type: 'time' },
      ],
      values: { date: p0.date && p0.date >= NA.today() ? p0.date : NA.addDays(NA.today(), 1), time: p0.time || '' },
      onSubmit: (v, el) => {
        clearErrors(el);
        if (!v.date || v.date < NA.today()) return fieldError(el, 'date', 'Pick today or a later day');
        const f = NA.get('leads', l.id) || l;
        const me = NA.me();
        const patch = { testDrive: Object.assign({}, f.testDrive || {}, { plannedFor: { date: v.date, time: v.time || '', by: me.name, byId: me.staffId || null, at: new Date().toISOString() } }) };
        // An earlier follow-up date already set is kept.
        if (!f.nextFollowUp || f.nextFollowUp < NA.today() || f.nextFollowUp > v.date) patch.nextFollowUp = v.date;
        NA.update('leads', l.id, patch);
        NA.log(`Test drive booked for ${f.name} (${f.code}) on ${NA.fmt.date(v.date)}${v.time ? ' at ' + v.time : ''}`, { rec: f, link: '#/leads/' + l.id });
        ui.toast('Test drive booked for ' + NA.fmt.date(v.date));
        refresh();
      },
    });
    m.classList.add('ld-modal');
  }

  /** The customer will not drive (a fleet buyer, a repeat buyer): the step is done with a reason that managers can see. */
  function skipTestDrive(l, opts = {}) {
    const m = ui.formModal({
      title: 'No test drive', subtitle: esc(l.name) + ' · ' + esc(l.code), size: 'sm', submitLabel: 'Save',
      intro: '<p class="ld-lede">The test-drive step is marked as not needed. The reason shows on the lead and in the activity feed.</p>',
      fields: [
        { name: 'reason', label: 'Why not?', type: 'radio-cards', options: SKIP_REASONS, required: true, span: 2 },
        { name: 'note', label: 'Anything else?', type: 'textarea', rows: 2, span: 2, placeholder: 'e.g. Buying three cars for the head office' },
      ],
      onSubmit: (v, el) => {
        clearErrors(el);
        if (v.reason === 'Other' && !v.note) return fieldError(el, 'note', 'Say why there is no test drive');
        const f = NA.get('leads', l.id) || l;
        const me = NA.me();
        const reason = v.reason + (v.note ? ' — ' + v.note : '');
        NA.update('leads', l.id, { testDrive: { skipped: { reason, by: me.name, byId: me.staffId || null, at: new Date().toISOString() } } });
        NA.log(`No test drive for ${f.name} (${f.code}): ${reason}`, { rec: f, link: '#/leads/' + l.id, kind: 'warn' });
        if (opts.after) opts.after(); else ui.toast('Saved — no test drive');
        refresh();
      },
    });
    m.classList.add('ld-modal');
  }

  /** Who may change a lead's consultant: managers; after the sale only the Managing Director. */
  const mayAssign = (l) => canAssign() && (!l || l.stage !== 'won' || NA.isRole('owner'));

  function contactFields(mode, l) {
    const models = ui.opts.models();
    if (l && l.modelId && !models.some((o) => o.value === l.modelId)) models.push({ value: l.modelId, label: NA.modelName(l.modelId) + ' (no longer sold)' });
    const f = [
      { name: 'name', label: 'Customer name', required: true, placeholder: 'Full name' },
      { name: 'mobile', label: 'Mobile number', type: 'tel', required: true, placeholder: '01XXXXXXXXX', help: '11 digits' },
      { name: 'source', label: 'Where did the lead come from?', type: 'radio-cards', required: true, span: 2,
        options: NA.FLOW.leadSources.map((s) => ({ value: s, label: s, icon: srcMeta(s).icon })) },
      { name: 'modelId', label: 'Model they want', type: 'select', options: models, required: true },
    ];
    // Consultants keep their own leads; managers pick someone or leave it unassigned.
    if (mayAssign(l)) f.push({ name: 'consultantId', label: 'Consultant', type: 'select', options: consultantOpts(l && l.consultantId), placeholder: false });
    if (mode === 'new') f.push({ name: 'note', label: 'Note (optional)', type: 'textarea', span: 2, rows: 2, placeholder: 'e.g. Wants white, best called after 6 pm' });
    else f.push({ name: 'email', label: 'Email', type: 'email', placeholder: 'Optional' }, { name: 'company', label: 'Company', placeholder: 'Optional' });
    return f;
  }

  /** NA.actions.newLead(prefill) — the 20-second lead form. */
  function newLead(prefill = {}) {
    if (!NA.can('leads.create')) { ui.toast('Leads are added by the sales team', 'info'); return; }
    if (!canAssign() && !myId()) { ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error'); return; }
    const values = Object.assign({ consultantId: defaultConsultant(), source: lsGet('na-last-source') || '' }, prefill);
    const el = ui.formModal({
      title: 'New lead', subtitle: 'Takes about 20 seconds — add the rest later.', submitLabel: 'Add lead', size: 'md',
      intro: '<div data-dup></div>', fields: contactFields('new'), values,
      onSubmit: async (v, modal) => {
        clearErrors(modal);
        if (!validMobile(v.mobile)) return fieldError(modal, 'mobile', 'Enter 11 digits starting with 01, e.g. 01712345678');
        const hits = await dupOk(modal, 'lead', v.mobile);
        if (hits === false) return false;
        // A customer of yours (or nobody's) with this number: the new lead is linked to them.
        const linked = hits.find((x) => x.kind === 'customer' && x.id && NA.customer(x.id) && (x.who !== 'other' || isManager()));
        const consultantId = canAssign() ? v.consultantId || '' : myId() || '';
        const me = NA.me();
        const rec = NA.insert('leads', {
          code: NA.nextCode('LD'), name: v.name, mobile: normMobile(v.mobile), email: '', source: v.source, modelId: v.modelId,
          stage: 'new', stageAt: NA.today(), consultantId, budget: '', financing: '', timeline: '',
          engagements: [], visit: null, testDrive: null, quotation: null, quotes: [], nextFollowUp: NA.today(),
          notes: '', noteLog: v.note ? [{ at: new Date().toISOString(), by: me.name, byId: me.staffId || null, text: v.note }] : [],
          company: '', customerId: linked ? linked.id : null, createdBy: me.name, createdById: me.staffId || null, history: [],
        });
        lsSet('na-last-source', v.source);
        const over = hits.filter((x) => blocks(x, 'lead'));
        NA.log(`New lead ${rec.name} (${rec.source}) — ${NA.modelName(rec.modelId)}${consultantId ? '' : ' · unassigned'}${over.length ? ' · added although the number is already with ' + over.map((x) => x.ownerName).join(', ') : ''}`,
          { rec, link: '#/leads/' + rec.id, kind: 'success' });
        ui.toast(`Lead ${rec.code} added — call ${rec.name} today`);
        if (prefill.stay) refresh(); else NA.go('#/leads/' + rec.id);
      },
    });
    el.classList.add('ld-modal');
    wireDup(el, 'lead');
  }

  function editContact(l) {
    const assignable = mayAssign(l);
    const q0 = l.quotation && Number(l.quotation.price) > 0 ? l.quotation : null;
    const el = ui.formModal({
      title: 'Edit lead', subtitle: esc(l.code), submitLabel: 'Save changes', intro: '<div data-dup></div><div data-model-note></div>',
      fields: contactFields('edit', l),
      values: { name: l.name, mobile: l.mobile, source: l.source, modelId: l.modelId, consultantId: l.consultantId || '', email: l.email || '', company: l.company || '' },
      onSubmit: async (v, modal) => {
        clearErrors(modal);
        const f = NA.get('leads', l.id) || l;
        if (!validMobile(v.mobile)) return fieldError(modal, 'mobile', 'Enter 11 digits starting with 01, e.g. 01712345678');
        if (!validEmail(v.email)) return fieldError(modal, 'email', 'This email address doesn’t look right');
        if (normMobile(v.mobile) !== normMobile(f.mobile) && (await dupOk(modal, 'lead', v.mobile, { kind: 'lead', id: f.id })) === false) return false;
        const patch = { name: v.name, mobile: normMobile(v.mobile), source: v.source, modelId: v.modelId, email: v.email, company: v.company };
        // Only a real change moves the lead (NA.update then hands it over, or leaves it with this manager when unassigned).
        if (assignable && (v.consultantId || '') !== (f.consultantId || '')) patch.consultantId = v.consultantId || '';
        const word = { name: 'name', mobile: 'mobile', source: 'source', modelId: 'model', consultantId: 'consultant', email: 'email', company: 'company' };
        const show = (k, x) => (k === 'modelId' ? NA.modelName(x) : k === 'consultantId' ? (x ? NA.staffName(x) : 'Unassigned') : x || '—');
        const changes = Object.keys(patch).filter((k) => String(f[k] || '') !== String(patch[k] || '')).map((k) => `${word[k]} ${show(k, f[k])} → ${show(k, patch[k])}`);
        // A different model makes the quote meaningless: it stays in the history, marked as cancelled.
        const voidQuote = patch.modelId !== f.modelId && f.quotation && Number(f.quotation.price) > 0;
        if (voidQuote) {
          patch.quotes = (f.quotes || []).concat([Object.assign({}, f.quotation, { modelId: f.quotation.modelId || f.modelId, status: 'void', voidReason: 'Model changed', replacedAt: NA.today() })]);
          patch.quotation = null;
        }
        NA.update('leads', l.id, patch);
        if (changes.length) NA.log(`Lead ${f.code} changed: ${changes.join('; ')}${voidQuote ? ' · the quote was cancelled' : ''}`, { rec: f, link: '#/leads/' + l.id });
        ui.toast(voidQuote ? 'Saved — make a new quote for the new model' : 'Saved');
        refresh();
      },
    });
    el.classList.add('ld-modal');
    wireDup(el, 'lead', { kind: 'lead', id: l.id }, l.mobile);
    const sel = el.querySelector('[name=modelId]'); const note = el.querySelector('[data-model-note]');
    if (sel && note && q0) sel.addEventListener('change', () => {
      note.innerHTML = sel.value !== l.modelId ? `<div class="callout callout-warn ld-intro">${NA.icon('alert', 16)}<div>Changing the model cancels quote ${esc(q0.no || '')} — you will make a new one for the new model.</div></div>` : '';
    });
  }

  /* ---------------- Quotation print ---------------- */
  /** Older quotes were saved without a number: give them one the first time they are printed or shared. */
  function quoteNumber(l) {
    const q = l.quotation;
    if (!q || q.no) return q ? q.no : '';
    const base = l.quoteNo || NA.nextCode('Q');
    const rev = 1 + (l.quotes || []).length;
    const no = base + (rev > 1 ? '-R' + rev : '');
    NA.update('leads', l.id, { quoteNo: base, quotation: Object.assign({}, q, { no, rev, modelId: q.modelId || l.modelId }) });
    return no;
  }
  const branchOf = (staff) => (staff && staff.location) || (NA.db.settings.locations || []).find((x) => /showroom/i.test(x)) || 'Uttara Showroom';

  /** Send the quote's key figures on WhatsApp (same rules as printing). */
  function shareQuote(l) {
    const s = quoteState(l);
    if (s.key !== 'ok') { ui.toast(quoteBlock(s), 'info'); return; }
    const no = quoteNumber(l);
    const q = (NA.get('leads', l.id) || l).quotation;
    const c = quoteCalc(q);
    const text = `Assalamu Alaikum ${l.name}, here is your quote ${no} from ${NA.db.settings.company}: ${NA.modelName(q.modelId || l.modelId)}${q.color ? ' (' + q.color + ')' : ''} — `
      + `${NA.fmt.money(c.net)} including VAT${Number(q.discount) ? ', after ' + NA.fmt.money(q.discount) + ' off' : ''}. Valid until ${NA.fmt.date(q.validUntil)}.`;
    window.open(waHref(l.mobile, text), '_blank', 'noopener');
    NA.log(`Quote ${no} sent on WhatsApp to ${l.name} (${NA.fmt.money(c.net)})`, { rec: l, link: '#/leads/' + l.id });
  }

  function printQuote(l) {
    const s = quoteState(l);
    if (s.key !== 'ok') { ui.toast(quoteBlock(s), 'info'); return; }
    const no = quoteNumber(l);
    const q = (NA.get('leads', l.id) || l).quotation;
    const c = quoteCalc(q); const m = NA.model(q.modelId || l.modelId) || {};
    const consultant = NA.get('staff', l.consultantId) || {};
    const chan = NA.FLOW.channels.find((x) => x.key === q.channel) || { label: q.channel };
    const appr = s.needs && s.appr && s.appr.status === 'approved' ? s.appr : null;
    const terms = {
      Retail: 'Booking money confirms the order and a money receipt is issued. The balance is payable before delivery. The actual VIN is assigned only after 100% payment.',
      Bank: 'Customer equity is paid to Noor Autos and the balance is disbursed by the financing bank after sanction. The vehicle is registered with bank co-registration at BRTA. The actual VIN is assigned after 100% payment (including disbursement).',
      Corporate: 'The order is confirmed by the company\'s Purchase Order / Award Letter / Letter of Intent. Payment as per the agreed corporate terms; the actual VIN is assigned after full payment or approved credit.',
    }[q.channel] || '';
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div><h1>Price quotation</h1><div class="muted">No. ${esc(no)} · Date ${esc(NA.fmt.date(q.date || q.revisedAt || NA.today()))}</div></div>
        <div style="text-align:right"><b>Valid until ${esc(NA.fmt.date(q.validUntil))}</b><div class="muted">${esc(chan.label)}</div></div>
      </div>
      <table><tr><th style="width:50%">Prepared for</th><th>Your sales consultant</th></tr>
        <tr><td><b>${esc(l.company || l.name)}</b>${l.company && l.company !== l.name ? '<br>Attn: ' + esc(l.name) : ''}<br>Mobile: ${esc(prettyMobile(l.mobile))}${l.email ? '<br>' + esc(l.email) : ''}</td>
            <td><b>${esc(consultant.name || '—')}</b><br>${esc(consultant.role || '')}${consultant.phone ? '<br>Mobile: ' + esc(prettyMobile(consultant.phone)) : ''}<br>${esc(branchOf(consultant))}</td></tr></table>
      <table>
        <tr><th>Description</th><th class="r" style="width:30%">Amount (BDT)</th></tr>
        <tr><td><b>${esc(NA.modelName(q.modelId || l.modelId))}</b>${m.body ? ' — ' + esc(m.body) : ''}<br>
          <span class="muted">Brand-new BYD electric vehicle${q.color ? ' · Colour: ' + esc(q.color) : ''}<br>
          Warranty: ${Math.round((m.warrantyMonths || 72) / 12)} years / ${NA.fmt.num(m.warrantyKm || 150000)} km · Battery: ${Math.round((m.batteryWarrantyMonths || 96) / 12)} years</span></td>
          <td class="r">${esc(NA.fmt.money(q.price))}</td></tr>
        ${Number(q.discount) ? `<tr><td>Less: special discount</td><td class="r">− ${esc(NA.fmt.money(q.discount))}</td></tr>` : ''}
        <tr><th>Total price (VAT inclusive)</th><th class="r" style="font-size:16px">${esc(NA.fmt.money(c.net))}</th></tr>
        <tr><td class="muted">Price excluding VAT</td><td class="r muted">${esc(NA.fmt.money(c.base))}</td></tr>
        <tr><td class="muted">VAT @ ${Math.round(c.vr * 100)}% (included above)</td><td class="r muted">${esc(NA.fmt.money(c.vat))}</td></tr>
      </table>
      <p><b>In words:</b> Taka ${esc(takaWords(c.net))} only.</p>
      ${q.notes ? `<p><b>Notes:</b> ${esc(q.notes)}</p>` : ''}
      <h3 style="margin-top:22px;font-size:14px">Terms</h3>
      <ol class="muted" style="padding-left:18px;line-height:1.6">
        <li>${esc(terms)}</li>
        <li>Prices are subject to change without notice after the validity date.</li>
        <li>BRTA registration, insurance and number-plate charges are not included unless stated above.</li>
        <li>Delivery is made after PDI with a signed handover form; warranty is activated on delivery.</li>
      </ol>
      ${appr ? `<p class="muted">Discount approved by ${esc(appr.decidedBy || '—')} on ${esc(NA.fmt.date(appr.decidedAt))}.</p>` : ''}
      <div class="sig"><div>Customer acceptance</div><div>For ${esc(NA.db.settings.company)}</div></div>`;
    // Pop-ups blocked: ui.print has said so, and nothing is marked as printed.
    if (!ui.print('Quotation ' + no + ' — ' + l.name, html)) return;
    const fresh = NA.get('leads', l.id) || l;
    NA.update('leads', l.id, { quotation: Object.assign({}, fresh.quotation, { printedAt: new Date().toISOString(), printedBy: NA.me().name }) });
    NA.log(`Quote ${no} printed for ${l.name} (${NA.fmt.money(c.net)})`, { rec: fresh, link: '#/leads/' + l.id });
  }

  /* ---------------- CSS (module scoped) ---------------- */
  function ensureCss() {
    if (!document.head || document.getElementById('css-leads')) return;
    const s = document.createElement('style');
    s.id = 'css-leads';
    s.textContent = `
      .ld-kpis { margin-bottom: 24px; }
      .ld-kpi-on { box-shadow: 0 0 0 2px var(--tint), var(--shadow-sm); }
      .ld-toolbar { margin-bottom: 20px; gap: 10px 12px; }
      .ld-search { position: relative; flex: 1 1 240px; max-width: 380px; }
      .ld-search input { width: 100%; padding-left: 34px !important; }
      .ld-search .ico { position: absolute; left: 11px; top: 9px; color: var(--muted); pointer-events: none; }
      .ld-toolbar select { min-width: 0 !important; max-width: 200px; }
      .ld-count { font-size: 12.5px; color: var(--muted); margin-left: auto; }
      .ld-dnd-tip { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; margin: 0 0 12px; }
      @media (pointer: coarse) { .ld-dnd-tip { display: none; } }
      .ld-lane .lane-head b .ico { color: var(--muted); }
      .ld-lane-won .lane-head b, .ld-lane-won .lane-head b .ico { color: var(--green); }
      .ld-card .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ld-card.is-overdue { box-shadow: inset 3px 0 0 var(--red-solid), var(--shadow-sm); }
      .ld-card .meta .badge { height: 20px; font-size: 11.5px; padding: 0 7px; }
      .ld-chip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 6px; background: var(--fill-2); color: var(--ink-2); font-weight: 500; font-size: 11.5px; }
      .ld-card .foot span { display: inline-flex; align-items: center; gap: 4px; }
      .ld-card-acts { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
      .ld-qa { display: inline-grid; place-items: center; width: 32px; height: 30px; border-radius: 8px; background: var(--fill-2); color: var(--ink-2); }
      .ld-qa:hover { background: var(--fill); color: var(--ink); }
      .ld-adv { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--tint); font-size: 13px; font-weight: 500; }
      .ld-adv:hover { background: var(--tint-soft); }
      .ld-card-closed { margin-top: 10px; font-size: 12.5px; color: var(--muted); }
      .ld-card-closed a { color: var(--tint); font-weight: 500; }
      .ld-lane-empty { padding: 20px 10px; text-align: center; color: var(--muted-2); font-size: 12.5px; }
      .ld-add { border: 0; background: none; border-radius: 10px; min-height: 36px; color: var(--tint); font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .ld-add:hover { background: var(--tint-soft); }
      .ld-stage-mini { display: flex; gap: 2px; margin-top: 5px; }
      .ld-stage-mini i { width: 14px; height: 4px; border-radius: 2px; background: var(--fill); }
      .ld-stage-mini i.on { background: var(--green-solid); }
      .ld-section { margin-top: 32px; }
      .ld-section .glist-title { margin-bottom: 8px; }
      .ld-lost-why { color: var(--ink-2); }
      .ld-modal .radio-cards { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
      .ld-modal .radio-card span { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 2px 8px; padding: 10px 12px; }
      .ld-modal .radio-card span small { flex-basis: 100%; }
      .ld-modal .check { padding: 10px 14px; }
      .ld-intro { margin-bottom: 16px; }
      .ld-lede { color: var(--muted); font-size: 13.5px; margin-bottom: 18px; }
      .ld-err { color: var(--red); font-size: 12.5px; line-height: 1.35; }
      .ld-dup { margin-bottom: 18px; }
      .ld-dup .ld-dup-sub { display: block; color: var(--muted); font-size: 12.5px; margin-top: 2px; }
      .ld-dup-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 4px; }
      .ld-dup-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; background: var(--surface); }
      .ld-dup-row b { display: block; font-weight: 500; }
      .ld-dup-row small { display: block; color: var(--muted); font-size: 12.5px; }
      .ld-pick { display: flex; flex-wrap: wrap; gap: 8px; }
      .ld-pick-chip { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 10px; border-radius: 999px; background: var(--fill); cursor: pointer; font-weight: 500; font-size: 13.5px; }
      .ld-pick-chip:has(input:checked) { background: var(--tint-soft); color: var(--tint); }
      .ld-qprev { margin-top: 18px; padding: 16px 18px; border-radius: 14px; background: var(--fill-3); }
      .ld-qprev-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .ld-qprev small { display: block; color: var(--muted); font-size: 12px; }
      .ld-qprev b { font-size: 20px; font-weight: 600; letter-spacing: -.02em; }
      .ld-qprev-note { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 13px; color: var(--ink-2); }
      .ld-qprev-note .ico { color: var(--amber); margin-top: 2px; }
      @media (max-width: 560px) { .ld-qprev-grid { grid-template-columns: 1fr; } }
      .ld-detail .stepper { padding-bottom: 4px; }
      .ld-banner { margin-bottom: 16px; }
      .ld-journey { margin-bottom: 20px; }
      .ld-journey-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
      .ld-st-list { gap: 16px; }
      .ld-st-head { display: flex; align-items: center; gap: 14px; padding: 16px 20px; flex-wrap: wrap; }
      .ld-st-num { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 600; font-size: 12.5px; background: var(--fill); color: var(--muted); flex: none; }
      .ld-st.done .ld-st-num { background: var(--green-solid); color: #fff; }
      .ld-st.next { box-shadow: 0 0 0 2px var(--tint-soft-2), var(--shadow-sm); }
      .ld-st.next .ld-st-num { background: var(--tint); color: #fff; }
      .ld-st.todo .ld-st-title b { color: var(--muted); font-weight: 500; }
      .ld-st-title { flex: 1; min-width: 160px; }
      .ld-st-title b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
      .ld-st-title small { color: var(--muted); font-size: 12.5px; }
      .ld-st-body { padding: 0 20px 20px 64px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 20px; }
      .ld-st-body.one { grid-template-columns: 1fr; }
      @media (max-width: 900px) { .ld-st-body { grid-template-columns: 1fr; padding-left: 20px; } }
      .ld-st.flash { animation: ldflash 1.4s ease; }
      @keyframes ldflash { 0%, 50% { box-shadow: 0 0 0 4px var(--tint-soft-2); } }
      .ld-st .dl { grid-template-columns: 120px 1fr; }
      .ld-eng { list-style: none; margin: 0; padding: 0; }
      .ld-eng li { display: flex; gap: 12px; padding: 10px 0; font-size: 13.5px; }
      .ld-eng li + li { border-top: .5px solid var(--line-2); }
      .ld-eng .ei { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--fill-2); color: var(--ink-2); flex: none; }
      .ld-eng-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .ld-quote { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; padding: 14px 16px; background: var(--fill-3); border-radius: 12px; font-size: 13.5px; }
      .ld-quote .tot { font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
      .ld-quote .r { text-align: right; }
      .ld-quote-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
      .ld-versions { list-style: none; margin: 14px 0 0; padding: 0; font-size: 12.5px; color: var(--muted); }
      .ld-versions li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; }
      .ld-versions li + li { border-top: .5px solid var(--line-2); }
      .ld-side { gap: 20px; }
      .ld-contact-head { display: flex; align-items: center; gap: 14px; padding: 18px 18px 14px; }
      .ld-contact-head b { display: block; font-size: 17px; font-weight: 600; letter-spacing: -.015em; }
      .ld-contact-head .small { display: block; }
      .ld-contact-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 18px 16px; }
      .ld-fu-now { font-size: 20px; font-weight: 600; letter-spacing: -.02em; margin-top: 10px; }
      .ld-fu-quick { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .ld-fu-date, .ld-notes { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: var(--field-bg); color: var(--ink); font: inherit; outline: none; transition: border-color .15s, box-shadow .15s; }
      .ld-fu-date { height: 38px; padding: 0 12px; margin-top: 12px; }
      .ld-notes { min-height: 76px; padding: 10px 12px; resize: vertical; margin-top: 10px; }
      .ld-fu-date:focus, .ld-notes:focus { border-color: var(--tint); box-shadow: var(--focus); }
      .ld-note-list { list-style: none; margin: 14px 0 0; padding: 0; }
      .ld-note-list li { padding: 10px 0; font-size: 13.5px; white-space: pre-wrap; }
      .ld-note-list li + li { border-top: .5px solid var(--line-2); }
      .ld-note-list small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; white-space: normal; }
      .ld-actions-row { display: flex; justify-content: flex-end; margin-top: 10px; }
      @media (max-width: 560px) { .next-step { flex-wrap: wrap; } .next-step > .btn, .next-step > .row { width: 100%; justify-content: center; } }
    `;
    document.head.appendChild(s);
  }

  /* ======================================================================
     Board / list page
     ====================================================================== */
  // consultant: '' = everyone, '_none' = unassigned, else a staff id (managers only).
  const state = { view: lsGet('na-leads-view') === 'list' ? 'list' : 'board', q: '', source: '', model: '', consultant: '', closed: false, sort: 'followup' };

  /** The leads this person works with: a consultant's own; a manager everyone's, or one consultant's, or the unassigned ones. */
  function scopeLeads() {
    if (!isManager()) return NA.db.leads.filter((l) => NA.isMine(l));
    if (state.consultant === '_none') return NA.db.leads.filter((l) => !l.consultantId);
    return state.consultant ? NA.db.leads.filter((l) => l.consultantId === state.consultant) : NA.db.leads;
  }
  /** Quick filters (the numbers at the top of the page). */
  const SHOW = {
    due: { label: 'To call today', test: (l) => ['overdue', 'today', 'none'].includes(fuState(l)) },
    cold: { label: 'Not contacted', test: (l) => notContacted(l) > 0 },
    hot: { label: 'Hot leads', test: (l) => !isClosed(l) && (l.stage === 'testdrive' || l.stage === 'opportunity') },
    new: { label: 'New this week', test: (l) => createdDay(l) >= NA.addDays(NA.today(), -7) },
    // Today's "Test drives today" opens this list: driven today, or booked for today and not done yet (Today's rule).
    drives: { label: 'Test drives today', test: (l) => {
      const t = l.testDrive || {}, p = t.plannedFor || {}, T = NA.today();
      return String(t.date || '').slice(0, 10) === T || (String(p.date || '').slice(0, 10) === T && !complete(l, 'testdrive'));
    } },
  };

  function filterLeads(stageQ, show) {
    const q = state.q.toLowerCase().trim(); const qd = q.replace(/\D/g, '');
    const sh = SHOW[show];
    return scopeLeads().filter((l) => {
      if (stageQ) { if (l.stage !== stageQ) return false; }
      else if (!state.closed && isClosed(l)) return false;
      if (sh && !sh.test(l)) return false;
      if (state.source && l.source !== state.source) return false;
      if (state.model && l.modelId !== state.model) return false;
      if (q) {
        const hay = [l.name, l.code, l.company, l.email, l.mobile].join(' ').toLowerCase();
        const digits = String(l.mobile || '').replace(/\D/g, '');
        if (!hay.includes(q) && !(qd.length >= 3 && digits.includes(qd))) return false;
      }
      return true;
    });
  }

  function sortLeads(list) {
    const rank = (l) => { const f = fuState(l); return f === 'overdue' ? 0 : f === 'today' ? 1 : f === 'later' ? 2 : 3; };
    const by = {
      followup: (a, b) => rank(a) - rank(b) || String(a.nextFollowUp || '9').localeCompare(String(b.nextFollowUp || '9')) || String(b.createdAt).localeCompare(String(a.createdAt)),
      recent: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      stage: (a, b) => ALL_STAGES.findIndex((s) => s.key === b.stage) - ALL_STAGES.findIndex((s) => s.key === a.stage),
      stale: (a, b) => daysInStage(b) - daysInStage(a),
    }[state.sort] || (() => 0);
    return list.slice().sort(by);
  }

  const consultantCell = (l) => (l.consultantId
    ? `<span class="row nowrap gap-4">${ui.avatar(NA.staffName(l.consultantId), 22)}<span class="small">${esc(NA.staffName(l.consultantId))}</span></span>` : ui.badge('Unassigned', 'amber'));
  /** The small action on a card or row: the next step, or "Reopen" for a lead that can be worked again. */
  function advanceBtn(l, cls) {
    if (l.stage === 'lost' || orderCancelled(l)) return `<button class="${cls}" data-act="advance" data-id="${esc(l.id)}">Reopen</button>`;
    if (isClosed(l) || (l.stage === 'opportunity' && !NA.can('orders.create'))) return '';
    return `<button class="${cls}" data-act="advance" data-id="${esc(l.id)}">${esc(NEXT_VERB[l.stage] || 'Next')}${NA.icon('chevron-right', 13)}</button>`;
  }

  function cardHtml(l) {
    const fu = fuState(l); const closed = isClosed(l); const cancelled = orderCancelled(l);
    const d = daysInStage(l);
    const order = orderOf(l);
    const qs = l.stage === 'opportunity' ? quoteState(l) : null;
    const td = !closed && l.testDrive && l.testDrive.plannedFor && !complete(l, 'testdrive') ? l.testDrive.plannedFor : null;
    return `<article class="kcard ld-card ${fu === 'overdue' ? 'is-overdue' : ''}" draggable="${l.stage === 'won' && !cancelled ? 'false' : 'true'}" data-lead="${esc(l.id)}">
      <div class="row-between"><div class="t" title="${esc(l.name)}">${esc(l.name)}</div>
        ${isManager() ? (l.consultantId ? `<span title="${esc(NA.staffName(l.consultantId))}">${ui.avatar(NA.staffName(l.consultantId), 24)}</span>` : ui.badge('Unassigned', 'amber')) : ''}</div>
      <div class="s">${esc(NA.modelName(l.modelId))} · ${esc(l.code)}</div>
      <div class="meta">${coldBadge(l)}${qs ? quoteBadge(qs) : ''}${srcBadge(l.source)}
        ${Number(l.budget) ? `<span class="ld-chip" title="Budget">${NA.icon('wallet', 12)}${esc(NA.fmt.short(l.budget))}</span>` : ''}
        ${qs && qs.q ? `<span class="ld-chip" title="Customer pays">${NA.icon('file-text', 12)}${esc(NA.fmt.short(quoteCalc(qs.q).net))}</span>` : ''}
        ${td && td.date ? `<span class="ld-chip" title="Test drive booked">${NA.icon('steering', 12)}${esc(NA.fmt.dateShort(td.date))}${td.time ? ' ' + esc(td.time) : ''}</span>` : ''}
      </div>
      <div class="foot">
        <span class="${fuTone(fu)}" title="Next follow-up">${NA.icon('bell', 13)}${esc(fuText(l))}</span>
        <span title="Days in this stage" class="${d > 7 && !closed ? 'tone-amber' : ''}">${NA.icon('clock', 13)}${d}d</span>
      </div>
      ${closed
        ? `<div class="ld-card-closed">${l.stage === 'won'
          ? (cancelled ? `Order ${esc(order.code)} was cancelled · ${advanceBtn(l, 'btn btn-link')}`
            : order ? `<a href="#/sales/${esc(order.id)}">${NA.icon('receipt', 13)} Order ${esc(order.code)}</a>` : 'Has an order')
          : esc(l.lostReason || 'Lost')}</div>`
        : `<div class="ld-card-acts">
          <a class="ld-qa" href="${esc(telHref(l.mobile))}" title="Call ${esc(prettyMobile(l.mobile))}" aria-label="Call">${NA.icon('phone', 14)}</a>
          <a class="ld-qa" href="${esc(waHref(l.mobile))}" target="_blank" rel="noopener" title="WhatsApp ${esc(prettyMobile(l.mobile))}" aria-label="WhatsApp">${NA.icon('whatsapp', 14)}</a>
          ${advanceBtn(l, 'ld-adv')}
        </div>`}
    </article>`;
  }

  function boardHtml(list) {
    const lanes = STAGES.map((s) => ({ key: s.key, label: s.label, hint: s.hint, icon: s.icon }));
    if (state.closed) lanes.push({ key: 'won', label: stageLabel('won'), hint: 'Has an order', icon: 'check-circle' }, { key: 'lost', label: stageLabel('lost'), hint: 'Drop a card here to mark it lost', icon: 'x' });
    const canAdd = NA.can('leads.create');
    return `<div class="ld-dnd-tip">${NA.icon('info', 14)}Drag a card to the next column to move it on — if something is missing, the form opens.</div>
      <div class="kanban ld-kanban">${lanes.map((lane) => {
        const items = sortLeads(list.filter((l) => l.stage === lane.key));
        const overdue = items.filter((l) => fuState(l) === 'overdue').length;
        return `<section class="lane ld-lane ld-lane-${lane.key}" data-lane="${lane.key}">
          <div class="lane-head"><div class="row-between"><b class="row gap-4">${NA.icon(lane.icon, 15)}${esc(lane.label)}</b>
            <span class="row gap-4">${overdue ? `<span class="badge badge-red" title="Follow-ups overdue">${overdue} late</span>` : ''}<span class="lane-count">${items.length}</span></span></div>
            <small>${esc(lane.hint)}</small></div>
          <div class="lane-body">
            ${items.map(cardHtml).join('') || `<div class="ld-lane-empty">${lane.key === 'new' ? 'No new leads' : 'Nothing here'}</div>`}
            ${lane.key === 'new' && canAdd ? `<button class="ld-add" data-act="new-lead">${NA.icon('plus', 15)}Add lead</button>` : ''}
          </div></section>`;
      }).join('')}</div>`;
  }

  function listHtml(list) {
    const rows = sortLeads(list);
    return `<div class="card">${ui.table([
      { label: 'Lead', render: (l) => `<div class="row">${ui.avatar(l.name, 30)}<div><div class="cell-main">${esc(l.name)}</div><div class="cell-sub">${esc(l.code)}</div></div></div>` },
      { label: 'Mobile', render: (l) => `<div class="row gap-4 nowrap"><span>${esc(prettyMobile(l.mobile))}</span>
          <a class="icon-btn" href="${esc(telHref(l.mobile))}" title="Call" aria-label="Call">${NA.icon('phone', 15)}</a><a class="icon-btn" href="${esc(waHref(l.mobile))}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${NA.icon('whatsapp', 15)}</a></div>` },
      { label: 'Model', render: (l) => esc(NA.modelName(l.modelId)) },
      { label: 'Source', render: (l) => srcBadge(l.source) },
      { label: 'Stage', render: (l) => { const i = l.stage === 'won' ? 6 : stageIdx(l) + 1; const qs = l.stage === 'opportunity' ? quoteState(l) : null;
        return `<span class="row gap-4 wrap">${stageBadge(l.stage)}${coldBadge(l)}${qs ? quoteBadge(qs) : ''}</span><div class="ld-stage-mini">${KEYS.map((k, j) => `<i class="${j < i ? 'on' : ''}"></i>`).join('')}</div>`; } },
      isManager() ? { label: 'Consultant', render: consultantCell } : null,
      { label: 'Budget', cls: 'right', render: (l) => (Number(l.budget) ? esc(NA.fmt.short(l.budget)) : '<span class="muted">—</span>') },
      { label: 'Follow-up', render: (l) => `<span class="nowrap ${fuTone(fuState(l))}">${esc(fuText(l))}</span>` },
      { label: 'In stage', cls: 'right', render: (l) => `${daysInStage(l)}d` },
      { label: '', cls: 'right', render: (l) => advanceBtn(l, 'btn btn-plain btn-sm') },
    ].filter(Boolean), rows, { rowAttr: (l) => `data-lead="${esc(l.id)}" class="clickable"`, empty: 'No leads match these filters', emptyIcon: 'search' })}</div>`;
  }

  /** Managers: hot leads that slipped away this week, so they can be called back. Visibility only, no approval. */
  function lostWeekHtml() {
    const since = NA.addDays(NA.today(), -7);
    const list = scopeLeads().filter((l) => l.stage === 'lost' && ['testdrive', 'opportunity'].includes(l.lostFrom) && String(l.lostAt || l.stageAt || '').slice(0, 10) >= since)
      .sort((a, b) => String(b.lostAt || '').localeCompare(String(a.lostAt || '')));
    if (!list.length) return '';
    return `<section class="ld-section"><div class="glist-title">Lost this week after a test drive or quote</div>
      <div class="glist">${list.map((l) => `<a class="gl-row" href="#/leads/${esc(l.id)}">${ui.avatar(l.name, 30)}
        <div class="gl-main"><b>${esc(l.name)}</b><small>${esc(NA.modelName(l.modelId))} · lost at ${esc(stageLabel(l.lostFrom))} · ${esc(l.consultantId ? NA.staffName(l.consultantId) : 'Unassigned')}</small></div>
        <span class="gl-value ld-lost-why">${esc(l.lostTo ? 'Went to ' + l.lostTo : String(l.lostReason || '').split(' — ')[0])}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`).join('')}</div>
      <p class="glist-foot">Worth a call back — some of these can still be won.</p></section>`;
  }

  /** Four numbers that follow the consultant / source / model filters. Tapping one shows those leads. */
  function kpisHtml(base, show) {
    const open = base.filter((l) => !isClosed(l));
    const due = open.filter(SHOW.due.test);
    const late = due.filter((l) => fuState(l) === 'overdue').length;
    const cold = open.filter(SHOW.cold.test).length;
    const hot = open.filter(SHOW.hot.test);
    const tile = (key, opts) => {
      const html = ui.kpi(Object.assign({ href: show === key ? '#/leads' : '#/leads?show=' + key }, opts));
      return show === key ? html.replace('class="kpi ', 'class="kpi ld-kpi-on ') : html;
    };
    const tiles = [
      tile('due', { label: 'To call today', value: due.length, sub: late ? `<span class="tone-red">${late} overdue</span>` : 'none overdue', icon: 'phone', tone: late ? 'amber' : 'neutral' }),
      tile('cold', { label: 'Not contacted', value: cold, sub: `no call within ${Number(pol().firstContactHours) || 24} hours`, icon: 'clock', tone: cold ? 'red' : 'neutral' }),
      tile('hot', { label: 'Hot leads', value: hot.length, sub: 'test drive or quote given', icon: 'bolt' }),
    ];
    if (isManager()) {
      const since = NA.addDays(NA.today(), -90);
      const day = (x) => String(x || '').slice(0, 10);
      const won = base.filter((l) => l.stage === 'won' && !orderCancelled(l) && day(l.wonAt || l.stageAt || l.updatedAt) >= since).length;
      const lost = base.filter((l) => (l.stage === 'lost' && day(l.lostAt || l.stageAt) >= since) || (orderCancelled(l) && day(l.updatedAt) >= since)).length;
      tiles.push(ui.kpi({ label: 'Win rate', value: won + lost ? Math.round((won / (won + lost)) * 100) + '%' : '—', sub: `${won} won · ${lost} lost · last 90 days`, icon: 'trophy' }));
    } else {
      tiles.push(tile('new', { label: 'New this week', value: base.filter((l) => SHOW.new.test(l) && (state.closed || !isClosed(l))).length, sub: 'last 7 days', icon: 'user-plus' }));
    }
    return `<div class="grid grid-4 ld-kpis">${tiles.join('')}</div>`;
  }

  function toolbarHtml(stageQ, view, show) {
    const sel = (key, label, opts) => `<select data-filter="${key}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map((o) => `<option value="${esc(o.value)}" ${state[key] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    const hasFilters = state.q || state.source || state.model || state.consultant || show || stageQ;
    return `<div class="toolbar ld-toolbar">
      <label class="ld-search">${NA.icon('search', 16)}<input type="search" data-search placeholder="Search name, mobile or code" value="${esc(state.q)}" autocomplete="off" aria-label="Search leads"/></label>
      ${stageQ ? `<a class="chip active" href="#/leads">${esc(stageLabel(stageQ))} ${NA.icon('x', 13)}</a>` : `<div class="seg" role="group" aria-label="View">
        <button class="${view === 'board' ? 'active' : ''}" data-act="view" data-v="board">${NA.icon('dashboard', 15)}Board</button>
        <button class="${view === 'list' ? 'active' : ''}" data-act="view" data-v="list">${NA.icon('menu', 15)}List</button></div>
        <button class="chip ${state.closed ? 'active' : ''}" data-act="closed">Won and lost</button>`}
      ${show ? `<a class="chip active" href="#/leads">${esc(SHOW[show].label)} ${NA.icon('x', 13)}</a>` : ''}
      ${isManager() ? sel('consultant', 'Everyone', [{ value: '_none', label: 'Unassigned' }].concat(ui.opts.consultants())) : ''}
      ${sel('source', 'All sources', NA.FLOW.leadSources.map((s) => ({ value: s, label: s })))}
      ${sel('model', 'All models', ui.opts.models())}
      ${view === 'list' ? `<select data-filter="sort" aria-label="Sort">${[['followup', 'Follow-up first'], ['recent', 'Newest first'], ['stage', 'Furthest stage'], ['stale', 'Longest in stage']].map(([v, t]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}
      ${hasFilters ? '<button class="btn btn-plain btn-sm" data-act="clear">Clear</button>' : ''}
      <span class="ld-count" data-count></span>
    </div>`;
  }

  function renderBoard(root, query) {
    ensureCss();
    query = query || {};
    const stageQ = query.stage && ALL_STAGES.some((s) => s.key === query.stage) ? query.stage : '';
    const show = SHOW[query.show] ? query.show : '';
    // "?show=unassigned" (from Today or the banner) picks the Unassigned filter once; the select can change it after.
    if (!isManager()) state.consultant = '';
    else if (query.show === 'unassigned' && !state._ua) { state.consultant = '_none'; state._ua = true; }
    if (query.show !== 'unassigned') state._ua = false;
    if (query.q != null && query.q !== state._lastQ) { state.q = query.q; state._lastQ = query.q; }
    const view = stageQ ? 'list' : state.view;
    const mine = !isManager();
    const base = scopeLeads().filter((l) => (!state.source || l.source === state.source) && (!state.model || l.modelId === state.model));
    const unassigned = isManager() && state.consultant !== '_none' ? NA.db.leads.filter((l) => !isClosed(l) && !l.consultantId).length : 0;
    root.innerHTML = ui.pageHead({
      title: mine ? 'My leads' : 'Leads',
      subtitle: mine ? 'Your customers, from the first call to the quote.' : 'Everyone’s leads, from the first call to the quote.',
      actions: NA.can('leads.create') ? ui.btn('New lead', { kind: 'primary', icon: 'plus', act: 'new-lead' }) : '',
    }) + kpisHtml(base, show)
      + (unassigned ? `<div class="callout callout-info ld-banner">${NA.icon('users', 16)}<div class="grow">${unassigned} open lead${unassigned === 1 ? ' has' : 's have'} no consultant yet.</div><a class="btn btn-plain btn-sm" href="#/leads?show=unassigned">Show them</a></div>` : '')
      + toolbarHtml(stageQ, view, show) + '<div data-results></div>' + (isManager() ? lostWeekHtml() : '');

    const draw = () => {
      const list = filterLeads(stageQ, show);
      const box = root.querySelector('[data-results]');
      if (box) box.innerHTML = !scopeLeads().length && !state.consultant
        ? `<div class="card pad">${ui.empty(mine ? 'No leads yet. Every walk-in, call, WhatsApp or ad enquiry you take starts here.' : 'No leads yet. Every walk-in, call, WhatsApp or ad enquiry starts here.', 'user-plus',
          NA.can('leads.create') ? ui.btn('Add the first lead', { kind: 'primary', icon: 'plus', act: 'new-lead' }) : '')}</div>`
        : view === 'board' ? boardHtml(list) : listHtml(list);
      const cnt = root.querySelector('[data-count]');
      if (cnt) cnt.textContent = list.length + ' lead' + (list.length === 1 ? '' : 's');
    };
    draw();

    const off = [];
    const on = (type, fn) => { root.addEventListener(type, fn); off.push(() => root.removeEventListener(type, fn)); };

    on('input', (e) => { if (e.target.matches && e.target.matches('[data-search]')) { state.q = e.target.value; draw(); } });
    on('change', (e) => {
      const f = e.target.dataset && e.target.dataset.filter;
      if (f) { state[f] = e.target.value; NA.render(); }
    });
    on('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act && root.contains(act)) {
        const a = act.dataset.act;
        if (a === 'new-lead') return newLead();
        if (a === 'view') { state.view = act.dataset.v; lsSet('na-leads-view', state.view); return NA.render(); }
        if (a === 'closed') { state.closed = !state.closed; return NA.render(); }
        if (a === 'clear') { Object.assign(state, { q: '', source: '', model: '', consultant: '' }); state._lastQ = query.q; return show || stageQ ? NA.go('#/leads') : NA.render(); }
        if (a === 'advance') { e.stopPropagation(); const l = NA.get('leads', act.dataset.id); if (l) advanceLead(l); return; }
        return;
      }
      if (e.target.closest('a')) return;
      const card = e.target.closest('[data-lead]');
      if (card) NA.go('#/leads/' + card.dataset.lead);
    });

    // HTML5 drag & drop between lanes
    let dragId = null;
    on('dragstart', (e) => {
      const c = e.target.closest && e.target.closest('[data-lead]'); if (!c) return;
      dragId = c.dataset.lead; c.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
    });
    on('dragend', () => { root.querySelectorAll('.dragging, .drop-over').forEach((x) => x.classList.remove('dragging', 'drop-over')); dragId = null; });
    on('dragover', (e) => {
      const lane = e.target.closest && e.target.closest('[data-lane]'); if (!lane || !dragId) return;
      e.preventDefault();
      root.querySelectorAll('.drop-over').forEach((x) => { if (x !== lane) x.classList.remove('drop-over'); });
      lane.classList.add('drop-over');
    });
    on('dragleave', (e) => { const lane = e.target.closest && e.target.closest('[data-lane]'); if (lane && !lane.contains(e.relatedTarget)) lane.classList.remove('drop-over'); });
    on('drop', (e) => {
      const lane = e.target.closest && e.target.closest('[data-lane]'); if (!lane || !dragId) return;
      e.preventDefault(); lane.classList.remove('drop-over');
      const l = NA.get('leads', dragId); dragId = null;
      if (l) moveTo(l, lane.dataset.lane);
    });

    return () => off.forEach((f) => f());
  }

  /* ======================================================================
     Lead detail page
     ====================================================================== */
  function nextStepHtml(l) {
    const box = (icon, title, sub, btn) => `<div class="next-step"><span class="ns-icon">${NA.icon(icon, 20)}</span><div class="ns-text"><b>${title}</b><small>${sub}</small></div>${btn}</div>`;
    const quoteBtn = (label, icon) => ui.btn(label, { kind: 'primary', icon, act: 'stage-form', attrs: 'data-stage="opportunity"' });
    if (l.stage === 'won') {
      const o = orderOf(l);
      if (orderCancelled(l)) return box('alert', `Order ${esc(o.code)} was cancelled`, 'Open the lead again to keep working with this customer, or mark it as lost.', ui.btn('Reopen lead', { kind: 'primary', icon: 'refresh', act: 'reopen' }));
      return box('check-circle', 'This lead has an order', o ? `${esc(o.code)} · ${esc(orderStageWord(o))}` : 'The order carries on in Orders',
        o ? ui.btn('Open order ' + o.code, { kind: 'primary', icon: 'arrow-right', href: '#/sales/' + o.id }) : NA.canSee('sales') ? ui.btn('Orders', { kind: 'primary', href: '#/sales' }) : '');
    }
    if (l.stage === 'lost') return box('alert', 'Marked as lost', esc(l.lostReason || 'No reason given') + (l.lostTo ? ' · went to ' + esc(l.lostTo) : '') + (l.lostAt ? ' · ' + esc(NA.fmt.date(l.lostAt)) : ''), ui.btn('Reopen lead', { kind: 'primary', icon: 'refresh', act: 'reopen' }));
    const cold = notContacted(l);
    // A walk-in was met in the showroom: what is missing is usually just the note of that meeting.
    const walkIn = l.source === 'Walk-in';
    if (cold) return box('phone', `Call ${esc(l.name)} now`, `Waiting ${esc(waitText(cold))} for a first call — new leads go cold quickly.`,
      `<div class="row wrap">${ui.btn(walkIn ? 'Log the meeting' : 'Log the call', { icon: 'edit', act: 'log', attrs: `data-type="${walkIn ? 'Met in person' : 'Call'}"` })}${ui.btn('Call', { kind: 'primary', icon: 'phone', href: telHref(l.mobile) })}</div>`);
    if (l.stage === 'opportunity') {
      if (!complete(l, 'opportunity')) return box('file-text', 'Give a quote', 'Price, discount, how they pay and how long it is valid.', quoteBtn('Make quote', 'file-text'));
      const s = quoteState(l); const q = s.q; const net = esc(NA.fmt.money(quoteCalc(q).net));
      const ref = q.no ? `Quote ${esc(q.no)} · ` : '';
      switch (s.key) {
        case 'ask': return box('percent', `Ask for approval — ${esc(NA.fmt.money(s.conc))} off`, `More off than a consultant may give alone. ${ref}Customer pays ${net}.`, ui.btn('Ask for approval', { kind: 'primary', icon: 'stamp', act: 'ask-discount' }));
        case 'pending': return box('clock', 'Waiting for approval', `${esc(quoteBlock(s))}. Printing and the order wait until it is approved.`, `<span class="lock-note">${NA.icon('lock', 14)}Waiting</span>`);
        case 'rejected': return box('x', 'The discount was declined', `${s.appr && s.appr.note ? '“' + esc(s.appr.note) + '” · ' : ''}Make a new version of the quote with less off.`, quoteBtn('Change quote', 'edit'));
        case 'expired': return box('calendar', 'The quote has expired', `It was valid until ${esc(NA.fmt.date(q.validUntil))}. Renew it at today’s price before printing or making the order.`, quoteBtn('Renew quote', 'refresh'));
        case 'stale': return box('alert', 'The quote is for another model', 'Make a new quote for the model they want now.', quoteBtn('Make quote', 'file-text'));
        default: return box('receipt', 'Make the order', `${ref}Customer pays ${net} · valid until ${esc(NA.fmt.date(q.validUntil))}`,
          NA.can('orders.create') ? ui.btn('Make order', { kind: 'primary', icon: 'arrow-right', act: 'convert' }) : '');
      }
    }
    const i = stageIdx(l); const next = STAGES[i + 1];
    if (complete(l, next.key)) return box(next.icon, 'Ready to move on', `${esc(next.label)}: everything is in.`, ui.btn('Move to ' + next.label, { kind: 'primary', icon: 'arrow-right', act: 'advance' }));
    const go = ui.btn(NEXT_BTN[next.key] || 'Continue', { kind: 'primary', icon: 'arrow-right', act: 'advance' });
    if (next.key === 'testdrive') {
      const p = (l.testDrive || {}).plannedFor;
      if (p && p.date) return box(next.icon, `Test drive booked for ${esc(NA.fmt.date(p.date))}${p.time ? ' at ' + esc(p.time) : ''}`, 'Record it after the drive: the signed form and a driving licence valid on the day.', go);
      return box(next.icon, esc(NEXT_TITLE[next.key]), 'Book a day for the drive, then record it: ' + esc(missing(l, next.key).join(' · ').toLowerCase()) + '.',
        `<div class="row wrap">${ui.btn('Book test drive', { icon: 'calendar', act: 'td-book' })}${go}</div>`);
    }
    return box(next.icon, esc(NEXT_TITLE[next.key] || next.label), 'Still needed: ' + esc(missing(l, next.key).join(' · ')), go);
  }

  const dl = (rows) => `<dl class="dl">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const dash = '<span class="muted">—</span>';

  function stageBody(l, key) {
    switch (key) {
      case 'new': return dl([['Name', esc(l.name)], ['Mobile', esc(prettyMobile(l.mobile))], ['Came from', srcBadge(l.source) || dash], ['Wants', esc(NA.modelName(l.modelId))], ['Came in', esc(NA.fmt.date(l.createdAt))]]);
      case 'qualified': { const f = finMeta(l.financing); return dl([['Budget', Number(l.budget) ? esc(NA.fmt.money(l.budget)) : dash], ['Pays by', f ? `<span class="row gap-4">${NA.icon(f.icon, 15)}${esc(f.label)}</span>` : dash], ['Buying', esc(l.timeline) || dash], l.company ? ['Company', esc(l.company)] : null]); }
      case 'engaged': {
        const e = l.engagements || [];
        return `<div>${e.length ? `<ul class="ld-eng">${e.slice(0, 6).map((x) => `<li><span class="ei">${NA.icon(engIcon(x.type), 15)}</span><div><b>${esc(x.type)}</b> <span class="muted small">· ${esc(NA.fmt.date(x.date))}${x.by ? ' · ' + esc(x.by) : ''}</span><div class="small">${esc(x.note || '')}</div></div></li>`).join('')}</ul>${e.length > 6 ? `<div class="small muted">and ${e.length - 6} earlier</div>` : ''}` : '<p class="muted small">Nobody has called or messaged yet.</p>'}
          ${isClosed(l) ? '' : `<div class="ld-eng-btns">${ENG_TYPES.map((t) => ui.btn(t.label, { size: 'sm', icon: t.icon, act: 'log', attrs: `data-type="${esc(t.value)}"` })).join('')}</div>`}</div>`;
      }
      case 'visit': { const v = l.visit || {}; return dl([['Date', v.date ? esc(NA.fmt.date(v.date)) : dash], ['Met by', v.consultantId ? esc(NA.staffName(v.consultantId)) : dash], ['Looked at', (v.modelsViewed || []).length ? `<span class="row wrap gap-4">${v.modelsViewed.map((id) => ui.badge(NA.modelName(id), 'gray', 'car')).join('')}</span>` : dash]]); }
      case 'testdrive': {
        const t = l.testDrive || {};
        if (t.skipped) return dl([['Test drive', 'Not taken'], ['Why', esc(t.skipped.reason || '—')], ['Noted by', `${esc(t.skipped.by || '—')}${t.skipped.at ? ' · ' + esc(NA.fmt.date(t.skipped.at)) : ''}`]]);
        const p = t.plannedFor;
        const lic = t.licenceNo ? `${esc(t.licenceNo)}${t.licenceExpiry ? ` · valid until ${esc(NA.fmt.date(t.licenceExpiry))}` : ''}` : dash;
        return dl([p && p.date && !complete(l, 'testdrive') ? ['Booked for', `${esc(NA.fmt.date(p.date))}${p.time ? ' at ' + esc(p.time) : ''}`] : null,
          ['Date', t.date ? esc(NA.fmt.date(t.date)) : dash], ['Car', esc(t.vehicle) || dash], ['Licence', lic], ['Form', t.formSigned ? 'Signed' : t.date ? '<span class="tone-amber">Not signed yet</span>' : dash]]);
      }
      case 'opportunity': {
        const q = l.quotation;
        const old = (l.quotes || []).slice().reverse();
        const versions = old.length ? `<div class="small muted mt-12">Earlier versions</div><ul class="ld-versions">${old.map((x) => `<li><span>${esc(x.no || 'Earlier quote')} · ${esc(NA.fmt.date(x.date))}${x.status === 'void' ? ' · cancelled' + (x.voidReason ? ' (' + esc(x.voidReason.toLowerCase()) + ')' : '') : ''}</span><span class="num">${esc(NA.fmt.money(quoteCalc(x).net))}</span></li>`).join('')}</ul>` : '';
        if (!q || !q.price) return `<p class="muted small">No quote yet. It starts at the model’s list price.</p>${versions}`;
        const s = quoteState(l); const c = quoteCalc(q);
        const chan = NA.FLOW.channels.find((x) => x.key === q.channel) || { label: q.channel || '—' };
        const lp = Number(q.listPrice) || Number(q.price);
        return `<div><div class="ld-quote">
            <span class="muted">Quote</span><span class="r">${esc(q.no || '—')}</span>
            <span>List price</span><span class="r num">${esc(NA.fmt.money(lp))}</span>
            ${lp > Number(q.price) ? `<span>Price cut</span><span class="r num">− ${esc(NA.fmt.money(lp - q.price))}</span>` : ''}
            <span>Discount</span><span class="r num">${Number(q.discount) ? '− ' + esc(NA.fmt.money(q.discount)) : '—'}</span>
            <b>Customer pays (with VAT)</b><span class="r tot num">${esc(NA.fmt.money(c.net))}</span>
            <span class="muted small">of which VAT ${Math.round(c.vr * 100)}%</span><span class="r muted small num">${esc(NA.fmt.money(c.vat))}</span>
          </div>
          <div class="row wrap mt-8 small">${quoteBadge(s)}${ui.badge(chan.label, 'gray', chan.icon)}${q.color ? ui.badge(q.color, 'gray') : ''}${ui.badge('Valid until ' + NA.fmt.date(q.validUntil), 'gray', 'calendar')}</div>
          ${q.notes ? `<p class="small muted mt-8">${esc(q.notes)}</p>` : ''}
          <div class="ld-quote-acts">${s.key === 'ok' ? ui.btn('Print', { size: 'sm', icon: 'print', act: 'print' }) + ui.btn('Send on WhatsApp', { size: 'sm', icon: 'whatsapp', act: 'share' })
            : `<span class="lock-note">${NA.icon('lock', 14)}${esc(quoteBlock(s))}</span>`}</div>${versions}</div>`;
      }
      default: return '';
    }
  }

  /** How far the lead got (stepper index). */
  const journeyIdx = (l) => (l.stage === 'won' ? KEYS.length : l.stage === 'lost' ? KEYS.indexOf(reopenStage(l)) : stageIdx(l));

  function stageCard(l, s, i) {
    const idx = journeyIdx(l);
    const ok = complete(l, s.key);
    const status = i <= idx ? 'done' : i === idx + 1 && !isClosed(l) ? 'next' : 'todo';
    // The quote step stays "open" until the quote can be used (approved, still valid).
    const qs = s.key === 'opportunity' && l.stage === 'opportunity' ? quoteState(l) : null;
    const badge = qs && qs.key !== 'ok' && qs.key !== 'none' ? quoteBadge(qs)
      : status === 'done' ? ui.badge('Done', 'green', 'check') : status === 'next' ? ui.badge(ok ? 'Ready' : 'Next', 'blue') : ok ? ui.badge('Added early', 'gray') : '';
    // A visit and a test drive are recorded when they happen, never ahead of time. The first step is edited from the header.
    const early = status === 'todo' && !ok && (s.key === 'visit' || s.key === 'testdrive');
    const locked = (l.stage === 'won' && !orderCancelled(l)) || s.key === 'new' || early;
    const label = s.key === 'engaged' ? 'Log contact' : ok || status === 'done' ? 'Edit' : 'Add now';
    const btn = locked ? '' : ui.btn(label, { size: 'sm', icon: ok || status === 'done' ? 'edit' : 'plus', act: 'stage-form', attrs: `data-stage="${s.key}"` });
    // A drive can be booked ahead of time; when it is the next step, "no test drive" is an option too.
    const booked = s.key === 'testdrive' && !!((l.testDrive || {}).plannedFor || {}).date;
    const tdBtns = s.key === 'testdrive' && !isClosed(l) && !ok && status !== 'done'
      ? ui.btn(booked ? 'Change booking' : 'Book', { size: 'sm', kind: 'plain', icon: 'calendar', act: 'td-book' })
        + (early ? '' : ui.btn('No test drive', { size: 'sm', kind: 'plain', act: 'td-skip' })) : '';
    const show = status !== 'todo' || ok || booked || (s.key === 'engaged' && (l.engagements || []).length) || (s.key === 'opportunity' && (l.quotes || []).length);
    return `<section class="card ld-st ${status}" data-stage-card="${s.key}">
      <header class="ld-st-head"><span class="ld-st-num">${status === 'done' ? NA.icon('check', 14) : i + 1}</span>
        <div class="ld-st-title"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></div>${badge}${tdBtns}${btn}</header>
      ${show ? `<div class="ld-st-body"><div>${checklistHtml(l, s.key)}</div><div>${stageBody(l, s.key)}</div></div>`
        : `<div class="ld-st-body one"><p class="small muted">Comes after ${esc(STAGES[i - 1] ? STAGES[i - 1].label.toLowerCase() : 'the first step')}. Needs: ${esc(reqs(l, s.key).filter((r) => !r.soft).map((r) => r.label.toLowerCase()).join(', '))}.</p></div>`}
    </section>`;
  }

  /** Managers hand a lead to a consultant (or take it back to Unassigned). Logged old → new. */
  function assignLead(l) {
    if (!mayAssign(l)) return;
    ui.formModal({
      title: 'Change consultant', subtitle: esc(l.name) + ' · ' + esc(l.code), size: 'sm', submitLabel: 'Save',
      fields: [{ name: 'consultantId', label: 'Consultant', type: 'select', options: consultantOpts(l.consultantId), placeholder: false, span: 2 }],
      values: { consultantId: l.consultantId || '' },
      onSubmit: (v) => {
        const f = NA.get('leads', l.id) || l;
        const to = v.consultantId || '';
        if (to === (f.consultantId || '')) return;
        const from = f.consultantId ? NA.staffName(f.consultantId) : 'Unassigned';
        // NA.update moves ownerId with it; an unassigned lead stays with the manager who unassigned it until someone takes it.
        NA.update('leads', l.id, { consultantId: to });
        NA.log(`Lead ${f.code} consultant: ${from} → ${to ? NA.staffName(to) : 'Unassigned'} (by ${NA.me().name})`, { rec: f, link: '#/leads/' + l.id });
        ui.toast(to ? 'Given to ' + NA.staffName(to) : 'Now unassigned');
        refresh();
      },
    });
  }

  function linkCustomer(l, cid) {
    const c = NA.customer(cid);
    if (!c) return;
    NA.update('leads', l.id, { customerId: c.id });
    NA.log(`Lead ${l.code} linked to customer ${c.name}`, { rec: l, link: '#/leads/' + l.id });
    ui.toast('Linked to ' + c.name);
    refresh();
  }

  function renderDetail(root, id) {
    ensureCss();
    const l = NA.get('leads', id);
    const crumb = { label: isManager() ? 'Leads' : 'My leads', href: '#/leads' };
    // Not here, or (on a shared computer) another consultant's lead.
    if (!l || (!isManager() && !NA.isMine(l))) {
      root.innerHTML = ui.pageHead({ title: 'Lead', crumbs: [crumb, { label: 'Not available' }] }) + ui.notFound('lead', '#/leads', isManager() ? 'All leads' : 'My leads');
      return;
    }
    const idx = journeyIdx(l);
    const fu = fuState(l);
    const consultant = l.consultantId ? NA.get('staff', l.consultantId) : null;
    // Linked by id only; a customer with the same number is offered as a suggestion.
    const customer = l.customerId ? NA.customer(l.customerId) : null;
    const suggest = !l.customerId && validMobile(l.mobile) ? NA.find('customers', (c) => normMobile(c.mobile) === normMobile(l.mobile)) : null;
    const hist = (l.history || []).slice(0, 25);
    const closed = isClosed(l);
    const notes = (l.noteLog || []).concat(l.notes ? [{ text: l.notes, at: null, by: '' }] : []);
    const greeting = `Assalamu Alaikum ${l.name}, this is ${consultant ? consultant.name : 'the sales team'} from ${NA.db.settings.company || 'Noor Autos'} (BYD).`;
    const row = (label, value, extra) => `<div class="gl-row"><span class="gl-label grow">${esc(label)}</span><span class="gl-value">${value}</span>${extra || ''}</div>`;

    const actions = ui.btn('Edit', { icon: 'edit', act: 'edit-contact' })
      + (l.stage !== 'lost' && (!closed || orderCancelled(l)) ? ui.btn('Mark as lost', { kind: 'danger', icon: 'x', act: 'lost' }) : '');
    const banners = [
      NA.ui.approvalBanners('leads', l.id),
      fu === 'overdue' ? `<div class="callout callout-warn">${NA.icon('bell', 16)}<div><b>Follow-up overdue</b> since ${esc(NA.fmt.date(l.nextFollowUp))}. Call or message ${esc(l.name)}, then set the next date.</div></div>` : '',
      fu === 'none' ? `<div class="callout callout-warn">${NA.icon('bell', 16)}<div><b>No next follow-up date.</b> Every open lead needs one — pick a day on the right.</div></div>` : '',
    ].filter(Boolean).join('');

    root.innerHTML = `<div class="ld-detail">${ui.pageHead({
      title: l.name,
      crumbs: [crumb, { label: l.code }],
      subtitle: `<span class="row wrap gap-4">${stageBadge(l.stage)}${coldBadge(l)}<span class="muted">${esc(l.code)} · ${esc(NA.modelName(l.modelId))} · came in ${esc(NA.fmt.ago(l.createdAt))}${closed ? '' : ' · ' + daysInStage(l) + ' days at this step'}</span></span>`,
      actions,
    })}
    ${banners ? `<div class="stack ld-banner">${banners}</div>` : ''}
    <div class="card pad ld-journey"><div class="ld-journey-head"><h3 class="section-title">Progress</h3>
      <span class="small muted">${l.stage === 'won' ? 'All six steps done' : `Step ${Math.min(idx + 1, 6)} of 6 · tap a finished step to see it`}</span></div>
      ${ui.stepper(STAGES, idx, { clickable: true })}</div>
    <div class="ld-banner">${nextStepHtml(l)}</div>
    <div class="grid grid-main-side">
      <div class="stack ld-st-list">${STAGES.map((s, i) => stageCard(l, s, i)).join('')}</div>
      <div class="stack ld-side">
        <div class="glist">
          <div class="ld-contact-head">${ui.avatar(l.name, 46)}<div class="grow"><b>${esc(l.name)}</b><span class="small muted">${esc(l.company || (finMeta(l.financing) || {}).label || 'Prospect')}</span></div></div>
          <div class="ld-contact-btns">
            <a class="btn btn-ghost" href="${esc(telHref(l.mobile))}">${NA.icon('phone', 16)}Call</a>
            <a class="btn btn-ghost" href="${esc(waHref(l.mobile, greeting))}" target="_blank" rel="noopener">${NA.icon('whatsapp', 16)}WhatsApp</a>
          </div>
          ${row('Mobile', esc(prettyMobile(l.mobile)))}
          ${l.email ? `<a class="gl-row" href="mailto:${esc(l.email)}"><span class="gl-label grow">Email</span><span class="gl-value">${esc(l.email)}</span></a>` : ''}
          ${row('Came from', esc(l.source || '—'))}
          ${row('Wants', esc(NA.modelName(l.modelId)))}
          ${row('Budget', Number(l.budget) ? esc(NA.fmt.money(l.budget)) : '—')}
          ${row('Consultant', consultant ? esc(consultant.name) : '<span class="tone-amber">Unassigned</span>', mayAssign(l) ? '<button class="btn btn-plain btn-sm" data-act="assign">Change</button>' : '')}
          ${customer ? `<a class="gl-row" href="#/customers/${esc(customer.id)}"><span class="gl-label grow">Customer</span><span class="gl-value">${esc(customer.name)}</span>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`
            : suggest ? `<div class="gl-row"><div class="gl-main"><b>Same number as ${esc(suggest.name)}</b><small>Is this the same person?</small></div><button class="btn btn-plain btn-sm" data-act="link-customer" data-id="${esc(suggest.id)}">Link</button></div>` : ''}
        </div>
        ${closed ? '' : `<div class="card pad">
          <h3 class="section-title">Next follow-up</h3>
          <div class="ld-fu-now ${fu === 'overdue' ? 'tone-red' : fu === 'today' || fu === 'none' ? 'tone-amber' : ''}">${l.nextFollowUp ? esc(NA.fmt.date(l.nextFollowUp)) : 'No date yet'}</div>
          <div class="small muted">${esc(fuText(l))}</div>
          <div class="ld-fu-quick">${[['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([t, n]) => `<button class="chip" data-act="fu" data-days="${n}">${t}</button>`).join('')}</div>
          <input type="date" class="ld-fu-date" data-fu-date min="${NA.today()}" value="${esc(l.nextFollowUp || '')}" aria-label="Pick a follow-up date"/>
        </div>`}
        <div class="card pad">
          <h3 class="section-title">Notes</h3>
          <textarea class="ld-notes" data-notes placeholder="Preferences, family, trade-in, best time to call…" aria-label="New note"></textarea>
          <div class="ld-actions-row">${ui.btn('Add note', { size: 'sm', icon: 'plus', act: 'save-notes' })}</div>
          ${notes.length ? `<ul class="ld-note-list">${notes.map((n) => `<li>${esc(n.text)}<small>${n.at ? esc(NA.fmt.datetime(n.at)) : 'Earlier note'}${n.by ? ' · ' + esc(n.by) : ''}</small></li>`).join('')}</ul>` : ''}
        </div>
        <div class="card pad">
          <h3 class="section-title">History</h3>
          <div class="mt-12">${hist.length ? `<ul class="timeline">${hist.map((h) => `<li>${esc(h.text)}<small>${esc(NA.fmt.datetime(h.at))}${h.by ? ' · ' + esc(h.by) : ''}</small></li>`).join('')}</ul>` : ui.empty('Nothing yet', 'clock')}</div>
        </div>
      </div>
    </div></div>`;

    const off = [];
    off.push(ui.delegate(root, 'click', '[data-act]', (el) => {
      const a = el.dataset.act;
      const cur = NA.get('leads', l.id) || l;
      if (a === 'advance') advanceLead(cur);
      else if (a === 'stage-form') openStageForm(cur, el.dataset.stage);
      else if (a === 'log') openStageForm(cur, 'engaged', { type: el.dataset.type });
      else if (a === 'edit-contact') editContact(cur);
      else if (a === 'convert') convertLead(cur);
      else if (a === 'ask-discount') askDiscount(cur);
      else if (a === 'lost') markLost(cur);
      else if (a === 'reopen') reopen(cur);
      else if (a === 'print') printQuote(cur);
      else if (a === 'share') shareQuote(cur);
      else if (a === 'assign') assignLead(cur);
      else if (a === 'td-book') bookTestDrive(cur);
      else if (a === 'td-skip') skipTestDrive(cur);
      else if (a === 'link-customer') linkCustomer(cur, el.dataset.id);
      else if (a === 'fu') setFollowUp(cur, NA.addDays(NA.today(), Number(el.dataset.days) || 0));
      else if (a === 'save-notes') {
        // Notes are added, never overwritten.
        const t = root.querySelector('[data-notes]');
        const text = t ? t.value.trim() : '';
        if (!text) { ui.toast('Write the note first', 'info'); return; }
        const me = NA.me();
        NA.update('leads', l.id, { noteLog: [{ at: new Date().toISOString(), by: me.name, byId: me.staffId || null, text }].concat(cur.noteLog || []) });
        NA.log(`Note added to ${cur.name}`, { rec: cur, link: '#/leads/' + l.id });
        ui.toast('Note added'); refresh();
      }
    }));
    off.push(ui.delegate(root, 'click', '[data-step]', (el) => {
      const i = Number(el.dataset.step);
      if (i > idx) { ui.toast(`${STAGES[i].label} comes later — finish the earlier steps first`, 'info'); return; }
      const card = root.querySelector(`[data-stage-card="${STAGES[i].key}"]`);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
    }));
    off.push(ui.delegate(root, 'change', '[data-fu-date]', (el) => setFollowUp(NA.get('leads', l.id) || l, el.value)));
    return () => off.forEach((f) => f());
  }

  /* ---------------- A customer goes to someone else ----------------
     Run by whoever hands the customer over (the Sales Manager or the Managing Director, who see everything), after
     the customer record has moved. Orders stay with their consultant, and so do their calls. The customer's own open
     calls (planned on their page) go to the new person: the old consultant's own calls become theirs, and a manager's
     call-back or a workshop call keeps who makes it but now shows on the new person's list. The new consultant is
     not sent the orders that stayed behind, so a customer who has bought gets firstOrderAt: their name and ID
     details then stay locked on every screen (the office server reads the same field). Returns the calls moved. */
  const managerCall = (f) => !!f.escalated || f.type === 'Manager call-back';
  const serviceCall = (f) => (NA.service && typeof NA.service.isServiceCall === 'function' ? NA.service.isServiceCall(f) : !!f.jobCardId || !f.consultantId);
  function customerHandedOver(customerId, from, to) {
    const c = NA.customer(customerId);
    if (!c || !to || from === to) return 0;
    if (!c.firstOrderAt) {
      const first = NA.where('orders', (o) => o.customerId === c.id).map((o) => String(o.createdAt || NA.today()).slice(0, 10)).sort()[0];
      if (first) NA.update('customers', c.id, { firstOrderAt: first });
    }
    if (!from) return 0;
    const open = NA.where('followUps', (f) => f.customerId === c.id && f.status !== 'done' && f.status !== 'closed' && !f.orderId);
    let n = 0;
    open.forEach((f) => {
      const theirs = f.consultantId === from && !managerCall(f) && !serviceCall(f);
      if (!theirs && f.ownerId !== from) return;
      NA.update('followUps', f.id, theirs ? { consultantId: to, ownerId: to } : { ownerId: to });
      n++;
    });
    return n;
  }

  /* ---------------- Approvals: hand-over of a lead or customer ----------------
     Runs in the approver's browser. The lead or customer goes to the person who asked;
     orders that already exist stay with their consultant. */
  A.onDecide('transfer', (a, decision) => {
    if (decision !== 'approved' || !['leads', 'customers'].includes(a.refC)) return;
    const d = a.data || {};
    const to = d.toStaffId || a.ownerId;
    if (!to) return;
    // Without a record id the request says what it is about in data.kind (the Orders screen asks with ref 'leads'
    // for a customer too), so look in that collection.
    const col = a.refId ? a.refC : d.kind === 'customer' ? 'customers' : d.kind === 'lead' ? 'leads' : a.refC;
    let rec = a.refId ? NA.get(col, a.refId) : null;
    if (!rec && d.mobile) {
      // Asked without a record id (the consultant could not see it): find it by the number.
      const pool = (NA.db[col] || []).filter((r) => normMobile(r.mobile) === normMobile(d.mobile) && (col === 'customers' || !isClosed(r)));
      rec = pool.find((r) => d.ownerId && (r.ownerId === d.ownerId || r.consultantId === d.ownerId)) || pool[0] || null;
    }
    if (!rec) { ui.toast('Approved — but that lead or customer was not found. It may be closed or already moved; hand it over from its own page.', 'info'); return; }
    const from = rec.consultantId || rec.ownerId || null;
    if (from === to) return;
    NA.update(col, rec.id, { consultantId: to });
    // A customer's own open calls go along with them (see customerHandedOver).
    const moved = col === 'customers' ? customerHandedOver(rec.id, from, to) : 0;
    NA.log(`${col === 'leads' ? 'Lead' : 'Customer'} ${rec.name} handed over: ${from ? NA.staffName(from) : 'nobody'} → ${NA.staffName(to)} (approved by ${NA.me().name})${moved ? ` · ${moved} open call${moved === 1 ? '' : 's'} went too` : ''}`,
      { rec, link: (col === 'leads' ? '#/leads/' : '#/customers/') + rec.id, kind: 'info' });
  });

  /* ---------------- Registration ---------------- */
  NA.actions = NA.actions || {};
  NA.actions.newLead = newLead;
  /** Log a call or message with a lead (used by Today). */
  NA.actions.logEngagement = (leadId, type) => {
    const l = NA.get('leads', leadId);
    if (!l) { ui.toast('This lead is not available', 'error'); return; }
    openStageForm(l, 'engaged', { type: type || 'Call' });
  };
  NA.leadUtils = {
    normMobile, validMobile, validEmail, prettyMobile, complete, reqs, moveTo, quoteCalc, takaWords, quoteState, notContacted, orderCancelled,
    whoHas, blocks, dupHtml, wireDup, dupOk, requestTransfer, fieldError, clearErrors,
    /** After a customer has moved to someone else: their own open calls go along (customers.js, and any other hand-over). */
    customerHandedOver,
    /** The stage words and colours (from core), kept here for screens that already ask for them. */
    stageLabel, stageTone,
  };

  NA.page({
    path: 'leads', title: 'Leads', icon: 'user-plus',
    render(root, params, query) { return params && params[0] ? renderDetail(root, params[0]) : renderBoard(root, query || {}); },
  });
})();
