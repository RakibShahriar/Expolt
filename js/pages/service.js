/* ==========================================================================
   Service — the workshop and everything after the sale.
   A car is booked, checked in, repaired, billed (or done free under
   warranty, or at our own cost) and handed back with a gate pass.
   Sign-off (js/approvals.js): free warranty work, a service discount above
   the limit and cancelling a job that has work or parts on it go to the
   Service Manager. Money taken at the counter becomes a numbered receipt
   (MR) that Accounts confirms. Free warranty work is claimed from BYD.
   Routes: #/service?tab=jobs|bookings|warranties|claims|followups
           #/service/job/<id>
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

  /* ------------------------------------------------------------------------
     Constants & small helpers
     ------------------------------------------------------------------------ */
  const TABS = ['jobs', 'bookings', 'warranties', 'claims', 'followups'];
  const BK = {
    booked:      { label: 'Booked',       tone: 'blue',  dot: 'blue',  icon: 'calendar' },
    in_workshop: { label: 'In workshop',  tone: 'amber', dot: 'amber', icon: 'wrench' },
    completed:   { label: 'Done',         tone: 'green', dot: 'green', icon: 'check-circle' },
    no_show:     { label: 'Did not come', tone: 'red',   dot: 'red',   icon: 'alert' },
    cancelled:   { label: 'Cancelled',    tone: 'gray',  dot: 'gray',  icon: 'x' },
  };
  const TYPE_ICON = {
    'Periodic Maintenance': 'clock', 'Inspection': 'search', 'Warranty Repair': 'shield',
    'General Repair': 'wrench', 'Battery Health Check': 'battery', 'Body & Paint': 'car',
  };
  /** Work that can be free under warranty. Routine servicing and body work are always paid for. */
  const WARRANTY_TYPES = ['Warranty Repair', 'General Repair', 'Battery Health Check', 'Inspection'];
  /** 'Bounced payment': a service receipt Accounts marked as not received, to collect again. */
  const FU_TYPES = NA.FLOW.followUpTypes.concat(['Complaint', 'Bounced payment']);
  const FU_ICON = {
    'Satisfaction Call': 'star', 'Service Reminder': 'wrench', 'Warranty Renewal': 'shield',
    'Insurance Renewal': 'file-text', 'Registration Renewal': 'id-card', 'Complaint': 'alert', 'Payment Follow-up': 'wallet', 'Bounced payment': 'wallet',
  };
  const INTERNAL_REASONS = ['Damage found at the arrival check', 'Transport damage', 'Before delivery to the buyer', 'Demo car', 'Showroom or workshop use', 'Other'];
  const AGREED_HOW = ['Phone call', 'In person', 'WhatsApp', 'Signed the job card'];
  const BOOKING_CANCEL = ['Customer cancelled', 'Customer did not come', 'Booked twice', 'Other'];
  const JOB_CANCEL = ['Customer changed their mind', 'Opened by mistake', 'Opened twice', 'Parts not available', 'Other'];
  /** Wear items are not covered by the warranty (see the certificate). */
  const WEAR = /\b(tyres?|tires?|wipers?|brake pads?)\b/i;
  /** Payment methods that need a cheque or transaction number. */
  const NEEDS_REF = ['Cheque', 'Pay Order', 'RTGS', 'Bank Transfer'];
  /** One name for one permission, on every button and note. */
  const CREDIT_WORDS = 'Let the car go before it is paid';
  const PAY_METHODS = NA.FLOW.paymentMethods.filter((m) => m !== 'Bank Disbursement');
  const TIME_SLOTS = (() => { const out = []; for (let h = 9; h <= 17; h++) { out.push(pad(h) + ':00'); if (h < 17) out.push(pad(h) + ':30'); } return out; })();
  function pad(n) { return String(n).padStart(2, '0'); }

  const today = () => NA.today();
  const isFriday = (iso) => !!iso && new Date(iso + 'T00:00:00').getDay() === 5;
  const hit = (q, ...xs) => !q || xs.some((x) => String(x || '').toLowerCase().includes(q));
  const settings = () => NA.db.settings;
  /** A public holiday listed in Settings ({ date, name } or a plain date), or null. */
  const holidayOn = (iso) => (Array.isArray(settings().holidays) ? settings().holidays : []).find((h) => (typeof h === 'string' ? h : h && h.date) === iso) || null;
  const holidayName = (iso) => { const h = holidayOn(iso); return (h && typeof h === 'object' && String(h.name || '').trim()) || ''; };
  /** The workshop is closed on Fridays and on the public holidays in Settings (NA.isHoliday, as People and leave use). */
  const isClosed = (iso) => !!iso && (typeof NA.isHoliday === 'function' ? NA.isHoliday(iso) : isFriday(iso) || !!holidayOn(iso));
  /** A closed day in a word or two ('Friday', 'Victory Day'), and in a sentence ('… is a Friday, the weekly holiday'). */
  const closedLabel = (iso) => (isFriday(iso) ? 'Friday' : holidayName(iso) || 'Public holiday');
  const closedWhat = (iso) => (isFriday(iso) ? 'a Friday, the weekly holiday' : holidayName(iso) ? holidayName(iso) + ', a public holiday' : 'a public holiday');
  const closedToast = (iso) => (isFriday(iso) ? 'The workshop is closed on Fridays' : `The workshop is closed on ${fmt.date(iso)}: ${closedWhat(iso)}`);
  /** The first day from iso on when the workshop is open. */
  const nextOpen = (iso) => { let d = iso; for (let i = 0; i < 31 && isClosed(d); i++) d = NA.addDays(d, 1); return d; };
  const num = (x) => Number(x) || 0;
  const sum = (list, fn) => list.reduce((s, x) => s + num(fn(x)), 0);
  /** Who did it, and when (stored on every money, stock and approval step). */
  const stamp = () => ({ by: NA.me().name, byId: NA.myStaffId(), at: new Date().toISOString() });
  const canWork = () => NA.can('service.manage');
  const canApprove = () => NA.can('service.approve');
  /** May let the car go before it is paid: the Service Manager, Accounts (NA.actions.allowServiceCredit) or the Managing Director. */
  const canCredit = () => canApprove() || NA.isRole('accounts');
  /** Records from before the approval rules existed keep working as they did. */
  const before = (iso) => { const s = settings().policyStart; return !!s && !!iso && String(iso).slice(0, 10) < s; };
  /** In shared mode, document numbers come from the office server; don't make bills while it can't be reached. */
  const offline = () => !!(NA.sync && NA.sync.on && NA.sync.state === 'offline');
  const jobHref = (jc) => '#/service/job/' + jc.id;
  const defaultRate = () => { const r = settings().labourRate; return r === '' || r == null || isNaN(Number(r)) ? 2500 : Number(r); };
  /** Is a step the person's own call, someone else's, or not needed at all? 'ask' | 'self' | 'direct'. */
  function gate(type, amount) {
    if (A.needed(type, amount)) return 'ask';
    const roles = A.approverRoles(type, amount);
    return NA.isRole('owner') || roles.includes(NA.role()) ? 'self' : 'direct';
  }

  const jobBadge = (jc) => { const s = jobStatus(jc); return ui.badge(s[0], s[1]); };
  const bookingBadge = (b) => { const m = BK[bkState(b)] || { label: b.status, tone: 'gray' }; return ui.badge(m.label, m.tone, m.icon); };
  /** Who pays: a job (or a billing value). quiet: nothing for an ordinary paid job. */
  const billBadge = (x, quiet) => {
    const b = typeof x === 'string' ? x : x && isInternal(x) ? 'internal' : x && x.billing;
    if (b === 'warranty') return ui.badge('Warranty', 'teal', 'shield');
    if (b === 'internal') return ui.badge('Our cost', 'gray');
    return quiet ? '' : ui.badge('Customer pays', 'blue', 'wallet');
  };
  /** A booking's state; a booked visit whose day has passed did not happen. */
  const bkState = (b) => (b.status === 'booked' && b.date && b.date < today() ? 'no_show' : b.status);

  function custVehicles(cid) { return cid ? NA.where('vehicles', (v) => v.customerId === cid) : []; }
  function vehLine(v) { return v ? NA.modelName(v.modelId) + (v.regNo ? ' · ' + v.regNo : '') : 'No vehicle'; }
  function vehOptionLabel(v) {
    return NA.modelName(v.modelId) + ' · ' + (v.regNo || 'no registration yet') + ' · VIN …' + String(v.vin || '').slice(-6) + (v.status !== 'delivered' ? ' (not handed over yet)' : '');
  }
  function digits(m) { return String(m || '').replace(/\D/g, ''); }
  function waLink(mobile, text) {
    let n = digits(mobile);
    if (!n) return '';
    if (n.startsWith('0')) n = '88' + n; else if (!n.startsWith('880')) n = '880' + n;
    return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function contactBtns(mobile, text) {
    if (!mobile) return '';
    return `<a class="btn btn-sm btn-ghost" href="tel:${esc(digits(mobile))}" title="Call ${esc(mobile)}" aria-label="Call">${NA.icon('phone', 15)}</a>` +
      `<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${esc(waLink(mobile, text))}" title="WhatsApp" aria-label="WhatsApp">${NA.icon('whatsapp', 15)}</a>`;
  }
  function stars(n, size = 14) {
    n = Math.round(num(n));
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<i class="${i <= n ? 'on' : ''}">${NA.icon('star', size)}</i>`;
    return `<span class="sv-rating" title="${n} of 5">${s}</span>`;
  }

  /** Warranty cover for a car. Uses the higher of the job's odometer and the car's own km reading. When the car cover
      has ended, the traction battery may still be covered (scope 'battery': battery work only).
      onDate: judge the cover on that day — a job is judged on the day the car was checked in (jobCover), so a cover
      that ends while the car is in the workshop still pays for the repair. Without it: today. */
  function warrantyInfo(vehicleId, odometer, onDate) {
    const v = NA.vehicle(vehicleId);
    const w = vehicleId ? B.warrantyFor(vehicleId) : null;
    const km = Math.max(num(odometer), num(v && v.km));
    const T = onDate && /^\d{4}-\d{2}-\d{2}/.test(String(onDate)) ? String(onDate).slice(0, 10) : today();
    if (!w) {
      const notDelivered = !!v && v.status !== 'delivered';
      return { w: null, ok: false, vehicleOk: false, batteryOk: false, scope: '', km, kmLimit: 0, daysLeft: 0, used: 1, notDelivered, on: T,
        reason: notDelivered ? 'The car is not delivered yet, so its warranty has not started' : 'There is no warranty on record for this car' };
    }
    const daysLeft = NA.daysBetween(today(), w.expiry);
    const span = NA.daysBetween(w.start, w.expiry) || 1;
    const used = Math.min(1, Math.max(0, NA.daysBetween(w.start, today()) / span));
    const kmLimit = num(w.kmLimit);
    const isVoid = w.status === 'void';
    const dateOk = !!w.expiry && T <= w.expiry;
    const overKm = !!kmLimit && km > kmLimit;
    const vehicleOk = !isVoid && dateOk && !overKm;
    const batteryOk = !isVoid && !!w.batteryExpiry && T <= w.batteryExpiry && !(num(w.batteryKmLimit) && km > num(w.batteryKmLimit));
    let reason = '';
    if (isVoid) reason = 'This warranty was cancelled';
    else if (!dateOk) reason = 'The car warranty ended on ' + fmt.date(w.expiry);
    else if (overKm) reason = `${fmt.num(km)} km is over the ${fmt.num(kmLimit)} km limit`;
    // Covered on the check-in day, though the cover has ended since.
    const endedSince = T < today() && ((vehicleOk && today() > w.expiry) || (!vehicleOk && batteryOk && today() > w.batteryExpiry));
    return { w, ok: vehicleOk || batteryOk, vehicleOk, batteryOk, scope: vehicleOk ? 'vehicle' : batteryOk ? 'battery' : '', reason, km, kmLimit, daysLeft, used, on: T, endedSince };
  }
  /** A job's own cover: judged on the day the car was checked in. */
  const jobCover = (jc) => warrantyInfo(jc.vehicleId, jc.odometer, jc.openedAt);
  function warrantyState(w) {
    if (!w) return 'none';
    if (w.status === 'void') return 'void';
    if (!B.warrantyActive(w)) return 'expired';
    if (NA.daysBetween(today(), w.expiry) <= 90) return 'expiring';
    return 'active';
  }
  function warrantyChip(vehicleId) {
    const wi = warrantyInfo(vehicleId);
    if (!wi.w) return ui.badge('No warranty', 'gray');
    if (wi.vehicleOk) return ui.badge('Under warranty', 'green', 'shield');
    if (wi.batteryOk) return ui.badge('Battery only', 'amber', 'battery');
    return ui.badge(wi.w.status === 'void' ? 'Cancelled' : 'Ended', 'red');
  }
  function warrantyCallout(wi) {
    if (!wi.w) return `<div class="callout callout-warn">${NA.icon('alert', 16)}<div><b>${esc(wi.reason)}.</b> ${wi.notDelivered ? 'Work on it is our own cost.' : 'The customer pays for the work.'}</div></div>`;
    const bat = wi.w.batteryExpiry ? ` Traction battery until ${fmt.date(wi.w.batteryExpiry)}.` : '';
    const since = wi.endedSince ? ` The car came in on ${fmt.date(wi.on)}, while it was covered, so this job still is.` : '';
    if (wi.vehicleOk) return `<div class="callout callout-ok">${NA.icon('shield', 16)}<div><b>Under warranty</b> until ${fmt.date(wi.w.expiry)} or ${fmt.num(wi.kmLimit)} km · now ${fmt.num(wi.km)} km.${bat}${since}</div></div>`;
    if (wi.batteryOk) return `<div class="callout callout-warn">${NA.icon('battery', 16)}<div><b>Battery cover only.</b> ${esc(wi.reason)}.${bat} Other work is paid by the customer.${since}</div></div>`;
    return `<div class="callout callout-danger">${NA.icon('alert', 16)}<div><b>Not under warranty.</b> ${esc(wi.reason)}.</div></div>`;
  }
  /** Why this job can't be free under warranty ('' = it can). Judged on the day the car was checked in. */
  function warrantyBlock(jc, wi) {
    wi = wi || jobCover(jc);
    if (isInternal(jc)) return 'This is our own car, so the work is our cost';
    if (!WARRANTY_TYPES.includes(jc.type || 'General Repair')) return `${jc.type} is not warranty work`;
    if (wi.vehicleOk) return '';
    if (wi.batteryOk) return jc.batteryWork ? '' : `${wi.reason}. Only traction battery work is still covered`;
    return wi.reason || 'Not under warranty';
  }

  function customerOptions() {
    const owners = new Set(NA.db.vehicles.filter((v) => v.customerId).map((v) => v.customerId));
    return NA.db.customers.slice()
      .sort((a, b) => (Number(owners.has(b.id)) - Number(owners.has(a.id))) || String(a.name).localeCompare(String(b.name)))
      .map((c) => ({ value: c.id, label: c.name + (c.mobile ? ' · ' + c.mobile : '') + (owners.has(c.id) ? '' : ' (no vehicle on record)') }));
  }
  function vehicleOptions(cid) { return custVehicles(cid).map((v) => ({ value: v.id, label: vehOptionLabel(v) })); }
  function vehicleOptionsHtml(cid, selected, pinned) {
    if (!cid && pinned) return `<option value="${esc(pinned.id)}" selected>${esc(vehOptionLabel(pinned))}</option>`;
    if (!cid) return '<option value="">Choose the customer first…</option>';
    const vs = custVehicles(cid);
    if (!vs.length) return '<option value="">No vehicle on record for this customer</option>';
    const sel = vs.some((v) => v.id === selected) ? selected : (vs.length === 1 ? vs[0].id : '');
    return (vs.length > 1 ? '<option value="">Select vehicle…</option>' : '') +
      vs.map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(vehOptionLabel(v))}</option>`).join('');
  }
  /** Customer select → that customer's vehicles. onChange runs after every change. */
  function wireCustomerVehicle(el, onChange, pinned) {
    const cs = el.querySelector('[name=customerId]');
    const vs = el.querySelector('[name=vehicleId]');
    if (!cs || !vs) return;
    const fill = () => { vs.innerHTML = vehicleOptionsHtml(cs.value, vs.value, pinned); vs.dispatchEvent(new Event('change', { bubbles: true })); };
    cs.addEventListener('change', fill);
    if (onChange) el.addEventListener('change', onChange);
    vs.innerHTML = vehicleOptionsHtml(cs.value, vs.value, pinned);
  }
  /** Customer name for a job card — work on our own cars has no customer. */
  const jobCustName = (j) => (j.customerId ? NA.customerName(j.customerId) : 'Our own car');
  /** The people at the service desk (the same list on every form). */
  const advisorOptions = (current) => {
    const out = NA.staffBy(['Service Advisor', 'Service Manager']).map((s) => ({ value: s.id, label: s.name }));
    if (current && !out.some((o) => o.value === current) && NA.get('staff', current)) out.push({ value: current, label: NA.staffName(current) });
    return out;
  };
  const myAdvisorId = () => { const s = NA.get('staff', NA.myStaffId()); return s && ['Service Advisor', 'Service Manager'].includes(s.role) ? s.id : ''; };
  const serviceManagerId = () => (NA.staffBy(['Service Manager'])[0] || {}).id || null;
  /** A call a manager makes: the call-back after a low rating on a sales call. */
  const managerCall = (f) => !!f.escalated || f.type === 'Manager call-back';
  /** The sales team's calls (the same rule as Today): chasing car payments, the call after a car is handed over,
      and the Sales Manager's call-backs. */
  const salesCall = (f) => f.type === 'Payment Follow-up' || managerCall(f) || (f.type === 'Satisfaction Call' && !!f.orderId && !f.jobCardId);
  /** Calls the service desk makes: about a job, or with no consultant and not a sales call. */
  const isServiceCall = (f) => (!!f.jobCardId && !managerCall(f)) || (!f.consultantId && !salesCall(f));
  const serviceFollowUps = () => NA.db.followUps.filter(isServiceCall);
  /** Who finishes a follow-up when the current person may not ('' = they may). The office server's rules: call-backs
      only the Sales Manager, complaints only the Service Manager (the Managing Director both); otherwise whoever may
      change follow-ups (a consultant only their own). */
  function followUpCloser(f) {
    if (managerCall(f) && !NA.isManager()) return 'the Sales Manager';
    if (f.type === 'Complaint' && !canApprove()) return 'the Service Manager';
    if (managerCall(f) || f.type === 'Complaint' || NA.isRole('owner')) return '';
    const a = ((NA.ACCESS || {})[NA.role()] || {}).followUps;
    if (a === 'all' || (a === 'own' && !!NA.myStaffId() && f.ownerId === NA.myStaffId())) return '';
    return isServiceCall(f) ? 'the service desk' : f.consultantId ? NA.staffName(f.consultantId) : 'the sales team';
  }
  const capital = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  /* ------------------------------------------------------------------------
     Money on a job. The labour rate comes from Settings (0 is a real rate).
     A discount sits on its own line before VAT, on customer-paid jobs only.
     ------------------------------------------------------------------------ */
  /** Our own car (not sold, or sold but not handed over): no bill, the work is our cost. */
  const isInternal = (jc) => jc.billing === 'internal' || !jc.customerId;
  /** The job's own rate (stored at check-in); jobs without one use the rate in Settings — the same rule as B.jobTotals. */
  function rateOf(jc) {
    const r = jc.labourRate;
    return r !== null && r !== undefined && r !== '' && !isNaN(Number(r)) ? Number(r) : num(settings().labourRate);
  }
  const discountOf = (jc) => (jc.discount ? Math.max(0, num(jc.discount.amount)) : 0);
  /** Totals for a job. internalCost = the value of the work (parts at selling price + labour), kept for warranty
      claims and our own jobs, which bill ৳ 0. One rule for every screen: B.jobTotals (core.js); the copy below is
      only used if that is missing. */
  function totals(jc, vatRate) {
    if (typeof B.jobTotals === 'function') return B.jobTotals(jc, vatRate);
    const parts = (jc.parts || []).reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
    const labour = Math.round(num(jc.labourHours) * rateOf(jc));
    const subtotal = parts + labour;
    const paid = jc.billing !== 'warranty' && !isInternal(jc);
    const discount = paid ? Math.min(subtotal, discountOf(jc)) : 0;
    const net = subtotal - discount;
    const rate = vatRate != null ? num(vatRate) : num(settings().vatRate);
    const vat = paid ? Math.round(net * rate) : 0;
    return { parts, labour, subtotal, discount, net, vat, vatRate: rate, total: paid ? net + vat : 0, internalCost: subtotal, paid };
  }
  /** The VAT rate a bill was made at (bills from before the rate was stored: worked out from its figures). */
  function invVatRate(inv) {
    if (inv.vatRate != null && inv.vatRate !== '' && !isNaN(Number(inv.vatRate))) return Number(inv.vatRate);
    if (num(inv.subtotal) > 0 && num(inv.vat) > 0) return Math.round((num(inv.vat) / num(inv.subtotal)) * 200) / 200;
    return num(settings().vatRate);
  }
  const invoiceOf = (jc) => (jc && jc.invoiceId && NA.get('invoices', jc.invoiceId)) || null;
  const receiptPayment = (r) => (r && r.paymentId ? NA.get('payments', r.paymentId) : null);
  /** Has Accounts marked this receipt as not received? Recorded on the bill itself (r.bounced, see syncBounce), so it
      shows for everyone — a service user only receives their own payment records. */
  const receiptBounced = (r) => !!r && (!!r.bounced || (() => { const p = receiptPayment(r); return !!p && B.paymentBounced(p); })());
  /** Money on a bill that still counts. inv.paid already leaves out receipts marked bounced on the bill; a bounce
      that is only on the payment record (older data) is taken off here. */
  function invReceived(inv) {
    if (!inv) return 0;
    const bounced = (inv.receipts || []).filter((r) => !r.bounced && receiptBounced(r)).reduce((s, r) => s + num(r.amount), 0);
    return Math.max(0, num(inv.paid) - bounced);
  }
  const invDue = (inv) => (inv ? Math.max(0, num(inv.total) - invReceived(inv)) : 0);

  /* Parts on a job. Lines show the part's current name; a part's reserved count always equals what job cards hold. */
  const partOf = (l) => NA.get('parts', l.partId);
  const partName = (l) => (partOf(l) || {}).name || l.name || 'Part';
  const partSku = (l) => (partOf(l) || {}).sku || l.sku || '';
  const lineId = (l) => l.lid || 'p:' + l.partId + ':' + num(l.unitPrice);
  const wearLines = (jc) => (jc.parts || []).filter((l) => WEAR.test(partName(l)));
  /** Units of a part held by job cards (lines not yet taken out of stock). */
  function heldOnJobs(partId) {
    return NA.db.jobCards.reduce((s, j) => s + (j.status === 'cancelled' ? 0
      : (j.parts || []).filter((l) => l.partId === partId && !l.consumed).reduce((t, l) => t + num(l.qty), 0)), 0);
  }
  /** Keep the part's reserved count equal to what job cards hold. On hand and reserved travel to the office server as
      increments (sync.js), so two people moving the same part both count; this stays as a safety net. */
  function syncReserved(partId) {
    const p = NA.get('parts', partId);
    if (!p) return;
    const held = heldOnJobs(partId);
    if (num(p.reserved) !== held) NA.update('parts', partId, { reserved: held });
  }

  /* ------------------------------------------------------------------------
     Approvals and the customer's OK
     ------------------------------------------------------------------------ */
  /** Free warranty work needs the Service Manager's OK: 'na' | 'ok' | 'pending' | 'rejected' | 'needed'. */
  function warrantyApproval(jc) {
    if (jc.billing !== 'warranty') return 'na';
    const s = A.state('jobCards', jc.id, 'warranty_job', totals(jc).internalCost);
    if (s === 'approved') return 'ok';
    if (s === 'pending') return 'pending';
    if (before(jc.completedAt)) return 'ok';      // finished before approvals existed
    return s === 'rejected' ? 'rejected' : 'needed';
  }
  function discountApproval(jc) {
    const d = discountOf(jc);
    if (!d || jc.billing === 'warranty' || isInternal(jc)) return 'na';
    if (d <= num(NA.policy().serviceDiscountFree)) return 'ok';
    const s = A.state('jobCards', jc.id, 'service_discount', d);
    return s === 'approved' ? 'ok' : s === 'pending' ? 'pending' : s === 'rejected' ? 'rejected' : 'needed';
  }
  const cancelPending = (jc) => A.isPending('jobCards', jc.id, 'job_cancel');
  /** Parts and labour change only while the car is in the workshop, and not while a cancel request waits (the
      Service Manager decides on the parts that were on the job when it was asked). */
  const workEditable = (jc) => canWork() && ['open', 'in_progress'].includes(jc.status) && !cancelPending(jc);
  const workLockedWhy = (jc) => (cancelPending(jc) ? 'Parts and labour can’t change while the cancel request waits for the Service Manager' : 'Parts and labour change only while the car is in the workshop');
  /** The customer agrees to the expected bill before work starts, and again if it grows by more than 10%. */
  function estimateState(jc) {
    if (jc.billing === 'warranty' || isInternal(jc)) return 'na';
    if (!jc.estimate) return before(jc.openedAt) ? 'na' : 'needed';
    return totals(jc).total > num(jc.estimate.total) * 1.1 + 1 ? 'risen' : 'ok';
  }
  function approvalDetail(jc) {
    const wear = wearLines(jc);
    return `${jobCustName(jc)} · ${vehLine(NA.vehicle(jc.vehicleId))} · ${String(jc.diagnosis || jc.complaint || '').slice(0, 140)}`
      + (wear.length ? ' · includes wear items: ' + wear.map(partName).join(', ') : '');
  }
  function warrantyRequest(jc) {
    const t = totals(jc);
    const wi = jobCover(jc);
    return { type: 'warranty_job', ref: { c: 'jobCards', id: jc.id, code: jc.code }, amount: t.internalCost, value: t.internalCost,
      title: `Free ${wi.scope === 'battery' ? 'battery ' : ''}warranty work on ${jc.code} · ${fmt.money(t.internalCost)}`, detail: approvalDetail(jc) };
  }
  function discountRequest(jc) {
    const d = discountOf(jc);
    return { type: 'service_discount', ref: { c: 'jobCards', id: jc.id, code: jc.code }, amount: d, value: d,
      title: `${fmt.money(d)} off ${jc.code} · ${jobCustName(jc)}`,
      detail: `Bill ${fmt.money(totals(jc).subtotal)} before VAT${jc.discount && jc.discount.reason ? ' · ' + jc.discount.reason : ''}` };
  }

  /* ------------------------------------------------------------------------
     Where a job is: in the workshop → ready (bill, collect, hand back) →
     released. Bills from before the release step count as handed back once paid.
     ------------------------------------------------------------------------ */
  function isReleased(jc) {
    if (jc.release || jc.releasedAt) return true;
    if (jc.status !== 'invoiced') return false;
    return before(jc.invoicedAt || jc.completedAt || jc.openedAt) && invDue(invoiceOf(jc)) <= 0;
  }
  /** 'workshop' | 'ready' | 'released' | 'closed' | 'cancelled' */
  function phase(jc) {
    if (jc.status === 'cancelled' || jc.status === 'closed') return jc.status;
    if (jc.status === 'open' || jc.status === 'in_progress') return 'workshop';
    if (jc.status === 'invoiced' && isReleased(jc)) return 'released';
    return 'ready';
  }
  const releaseDate = (jc) => String((jc.release && jc.release.at) || jc.releasedAt || jc.invoicedAt || jc.completedAt || jc.openedAt || '').slice(0, 10);
  /** A short plain status and its tone. */
  function jobStatus(jc) {
    if (jc.status === 'cancelled') return ['Cancelled', 'gray'];
    if (jc.status === 'closed') return ['Closed · our cost', 'gray'];
    if (cancelPending(jc)) return ['Cancel requested', 'red'];
    if (jc.status === 'open') return estimateState(jc) === 'needed' ? ['Waiting for the customer’s OK', 'amber'] : ['Waiting to start', 'gray'];
    if (jc.status === 'in_progress') return warrantyApproval(jc) === 'pending' ? ['Waiting for approval', 'amber'] : ['Being repaired', 'blue'];
    if (jc.status === 'completed') return isInternal(jc) ? ['Ready to close', 'amber'] : ['Ready to bill', 'amber'];
    if (isReleased(jc)) return ['Handed back', 'green'];
    const inv = invoiceOf(jc);
    const due = invDue(inv);
    if (due > 0 && !(inv && inv.credit)) return ['To collect ' + fmt.short(due), 'amber'];
    return ['Ready to hand back', 'green'];
  }
  /** A job this car is already on (still in the workshop). */
  const openJobFor = (vehicleId, exceptId) => NA.find('jobCards', (j) => j.vehicleId === vehicleId && j.id !== exceptId && phase(j) === 'workshop');

  /** What happens next on a job, and what is in the way:
      { icon, title, hint, act, label, blockers[] (stop the step), notes[] (worth knowing), extra[] (other buttons) }. */
  function nextStep(jc) {
    const t = totals(jc);
    const out = { icon: 'wrench', title: '', hint: '', act: '', label: '', blockers: [], notes: [], extra: [] };
    const set = (o) => Object.assign(out, o);
    if (jc.status === 'cancelled') return set({ icon: 'x', title: 'This job was cancelled', hint: jc.cancel && jc.cancel.reason ? 'Reason: ' + jc.cancel.reason + (jc.cancel.note ? ' — ' + jc.cancel.note : '') : 'Parts on it went back to the shelf.' });
    if (jc.status === 'closed') return set({ icon: 'check', title: 'Closed as our own cost', hint: `Work worth ${fmt.money(jc.internal && jc.internal.value != null ? jc.internal.value : t.internalCost)}${jc.internal && jc.internal.reason ? ' · ' + jc.internal.reason : ''}.` });
    if (cancelPending(jc)) out.blockers.push('Cancelling this job is waiting for the Service Manager');
    if (jc.status === 'open') {
      const est = estimateState(jc);
      if (est === 'needed' || est === 'risen') {
        set({ icon: 'phone', title: 'Get the customer’s OK on the estimate', act: 'estimate', label: 'Customer agreed',
          hint: `Expected bill ${fmt.money(t.total)} including VAT. Tell the customer, then note how they agreed.` });
        return out;
      }
      set({ icon: 'wrench', title: 'Start the work', act: 'start', label: 'Start work', hint: jc.technicianId ? NA.staffName(jc.technicianId) + ' works on the car.' : 'Choose who works on the car.' });
      if (!jc.technicianId) out.blockers.push('Choose a technician');
      return out;
    }
    if (jc.status === 'in_progress') {
      const internal = isInternal(jc);
      set({ icon: 'check-circle', title: internal ? 'Finish the work and close the job' : 'Finish the work', act: 'complete', label: internal ? 'Finish and close' : 'Work is done',
        hint: internal ? `Our own car: no bill. The work is recorded as our cost${jc.internal && jc.internal.reason ? ' (' + jc.internal.reason.toLowerCase() + ')' : ''}.` : 'The parts on the job are taken out of stock when you finish.' });
      if (!jc.technicianId) out.blockers.push('Choose a technician');
      if (!String(jc.diagnosis || '').trim()) out.blockers.push('Write what was found and done');
      if (!(num(jc.labourHours) > 0) && !(jc.parts || []).length) out.blockers.push('Add parts or labour');
      estimateGate(jc, t, out);
      warrantyGate(jc, out);
      return finishAsk(out);
    }
    if (jc.status === 'completed') {
      if (isInternal(jc)) return set({ icon: 'check', title: 'Close the job', act: 'close', label: 'Close job', hint: `Our own car, so there is no bill. Work worth ${fmt.money(t.internalCost)} is recorded as our cost.` });
      const free = jc.billing === 'warranty';
      set({ icon: 'receipt', title: free ? 'Make the ৳ 0 warranty bill' : 'Make the bill', act: 'invoice', label: 'Make the bill',
        hint: free ? `Free for the customer. ${fmt.money(t.internalCost)} is claimed from BYD afterwards.` : `${fmt.money(t.total)} including VAT${t.discount ? ', after a ' + fmt.money(t.discount) + ' discount' : ''}.` });
      // Checked again here: a discount may have been declined or taken off, or the warranty switched off, after the work was done.
      estimateGate(jc, t, out);
      warrantyGate(jc, out);
      const ds = discountApproval(jc);
      if (ds === 'pending') out.blockers.push(`The ${fmt.money(discountOf(jc))} discount is waiting for approval`);
      if (ds === 'rejected') out.notes.push('The discount was declined. Change it, take it off, or ask again.');
      if ((ds === 'needed' || ds === 'rejected') && !out.ask) out.ask = { act: 'ask-discount', label: 'Ask for approval', title: `Ask for approval of the ${fmt.money(discountOf(jc))} discount`, hint: 'It is more than the service desk may give on its own.' };
      if (offline()) out.blockers.push('The office server can’t be reached. Make the bill when it is back, so its number is not used twice.');
      return finishAsk(out);
    }
    if (jc.status === 'invoiced') {
      const inv = invoiceOf(jc);
      const due = invDue(inv);
      if (isReleased(jc)) {
        return set({ icon: 'check', title: 'Handed back to the customer', act: jc.release ? 'print-gate' : '', label: 'Print gate pass',
          hint: jc.release ? `${fmt.date(jc.release.at)} · gate pass ${jc.release.gatePass || '—'}${jc.release.to ? ' · to ' + jc.release.to : ''}${due > 0 ? ' · ' + fmt.money(due) + ' still due' : ''}` : `Billed ${fmt.date(jc.invoicedAt || jc.completedAt)} and paid.` });
      }
      if (due > 0 && !(inv && inv.credit)) {
        set({ icon: 'wallet', title: `Collect ${fmt.money(due)}`, act: 'collect', label: 'Customer paid', hint: `Bill ${inv ? inv.no : ''} is not fully paid. The car leaves once it is paid.` });
        if (canCredit()) out.extra.push({ label: CREDIT_WORDS, act: 'credit' });
        return out;
      }
      return set({ icon: 'car', title: 'Hand the car back', act: 'release', label: 'Release car',
        hint: due > 0 ? `${inv.credit.by ? inv.credit.by + ' let' : 'Agreed to let'} the car go before it is paid. ${fmt.money(due)} is still due.` : 'Paid. Give the keys back with the gate pass.' });
    }
    return out;
  }
  /** The customer agrees to the bill they will pay (paid jobs): before the work is finished and before the bill. */
  function estimateGate(jc, t, out) {
    const est = estimateState(jc);
    if (est === 'needed') { out.blockers.push(`The customer has not agreed to the bill of ${fmt.money(t.total)}`); out.extra.push({ label: 'Customer agreed', act: 'estimate' }); }
    if (est === 'risen') { out.blockers.push(`The bill is now ${fmt.money(t.total)}, more than 10% above the ${fmt.money(jc.estimate.total)} the customer agreed to`); out.extra.push({ label: 'Customer agreed to the new amount', act: 'estimate' }); }
  }
  /** Free warranty work: still covered, approved, nothing else in the way. */
  function warrantyGate(jc, out) {
    if (jc.billing !== 'warranty') return;
    const why = warrantyBlock(jc);
    if (why) { out.blockers.push(`Warranty no longer applies: ${why}. Switch it off so the customer pays.`); return; }
    const s = warrantyApproval(jc);
    if (s === 'ok' || canApprove()) return;          // a Service Manager going ahead approves it
    if (s === 'pending') { out.blockers.push('Waiting for the Service Manager to approve the free work'); return; }
    if (s === 'rejected') out.notes.push('The Service Manager declined the free work. Ask again, or switch the warranty off so the customer pays.');
    out.ask = { act: 'ask-warranty', label: 'Ask for approval', title: 'Ask the Service Manager to approve the free work', hint: `Warranty work worth ${fmt.money(totals(jc).internalCost)}. The customer pays nothing.` };
  }
  /** When asking for approval is all that is left, asking becomes the next step. */
  function finishAsk(out) {
    if (!out.ask) return out;
    if (!out.blockers.length) Object.assign(out, { icon: 'stamp', title: out.ask.title, hint: out.ask.hint, act: out.ask.act, label: out.ask.label });
    else { out.blockers.push('It also needs approval'); out.extra.push({ label: 'Ask for approval now', act: out.ask.act }); }
    return out;
  }

  function injectCss() {
    if (document.getElementById('css-service')) return;
    const s = document.createElement('style');
    s.id = 'css-service';
    s.textContent = `
      .sv-today{margin-bottom:32px}
      .sv-board{grid-auto-columns:minmax(264px,1fr)}
      .sv-board .empty{padding:24px 8px}
      .sv-card .sv-card-t{margin-top:8px;font-size:15px}
      .sv-card .sv-card-c{margin-top:6px;color:var(--ink-2)}
      .sv-card .foot{gap:10px}
      .sv-why{font-size:12px;color:var(--muted);text-align:right;line-height:1.35}
      .sv-days{display:grid;grid-template-columns:repeat(8,minmax(88px,1fr));gap:10px;overflow-x:auto;padding:2px 2px 8px;margin-bottom:20px}
      .sv-day{border:0;background:var(--surface);box-shadow:var(--shadow-sm);border-radius:14px;padding:12px 14px;text-align:left;display:flex;flex-direction:column;gap:2px;transition:box-shadow .15s}
      .sv-day:hover{box-shadow:var(--shadow)}
      .sv-day.active{box-shadow:inset 0 0 0 2px var(--tint)}
      .sv-day .dw{font-size:12px;color:var(--muted);font-weight:500}
      .sv-day.today .dw{color:var(--tint)}
      .sv-day .dn{font-size:20px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
      .sv-day .dc{font-size:12px;color:var(--muted)}
      .sv-day:disabled{background:var(--fill-3);box-shadow:none;cursor:default;opacity:.6}
      .sv-day .dots{display:flex;gap:3px;margin-top:6px;min-height:8px;flex-wrap:wrap}
      .sv-time{font-weight:600;font-size:15px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
      .sv-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;align-items:center}
      .sv-steps .stepper{margin-bottom:4px}
      .sv-ns-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .sv-blockers{list-style:none;margin:14px 0 0;padding:0 4px;display:flex;flex-direction:column;gap:8px}
      .sv-blockers .lock-note.note .ico{color:var(--blue)}
      .sv-job{gap:28px}
      .sv-col{display:flex;flex-direction:column;gap:28px;min-width:0}
      .sv-col > section > .card, .sv-col > section > .glist{margin:0}
      .sv-saved{display:inline-flex;align-items:center;gap:4px;color:var(--green);opacity:0;transition:opacity .2s}
      .sv-saved.on{opacity:1}
      .sv-odo{display:flex;align-items:center;gap:10px;height:40px}
      .sv-odo .num{font-weight:500}
      .sv-line{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:14px 24px;border-top:.5px solid var(--line-2)}
      .sv-line > .grow{flex:1 1 160px}
      .sv-ctl{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 12px;margin-left:auto}
      .sv-line b{font-weight:500;display:block}
      .sv-line small{display:block;color:var(--muted);font-size:12.5px}
      .sv-line .sv-amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
      .sv-step{display:inline-flex;align-items:center;background:var(--fill);border-radius:10px;height:34px}
      .sv-step button{border:0;background:none;width:34px;height:34px;font-size:18px;line-height:1;color:var(--ink-2);border-radius:10px}
      .sv-step button:hover{background:var(--fill-2)}
      .sv-step input{width:56px;height:34px;border:0;background:none;text-align:center;font-variant-numeric:tabular-nums;outline:none}
      .sv-rate{width:120px}
      .sv-rate input{height:34px;border:0;border-radius:10px;background:var(--fill);width:100%;padding:0 10px 0 26px;text-align:right;outline:none}
      .sv-rate span{height:34px}
      .sv-big{font-family:var(--font-display);font-size:30px;font-weight:600;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}
      .sv-sum{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
      .sv-sum td{padding:6px 0}
      .sv-sum td:last-child{text-align:right}
      .sv-sum tr.minus td:last-child{color:var(--green)}
      .sv-sum tr.tot td{border-top:.5px solid var(--line-2);padding-top:12px;font-size:17px;font-weight:600}
      .sv-sum tr.due td{color:var(--red);font-weight:600}
      .sv-receipts{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
      .sv-receipts li{display:flex;align-items:center;gap:10px;font-size:13.5px}
      .sv-receipts li .grow small{display:block;color:var(--muted);font-size:12px}
      .sv-meter{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink-2)}
      .sv-est{display:flex;flex-direction:column;gap:4px;margin-bottom:20px}
      .sv-rating{display:inline-flex;gap:0}
      .sv-rating i{color:var(--fill);display:inline-flex}
      .sv-rating i.on{color:var(--amber-solid)}
      .sv-rating .ico{fill:currentColor}
      .sv-pick{max-height:360px;overflow:auto;border-radius:12px;background:var(--fill-3);margin-top:12px}
      .sv-pick label{display:flex;gap:12px;align-items:center;padding:12px 14px;cursor:pointer;position:relative}
      .sv-pick label + label::before{content:'';position:absolute;top:0;left:14px;right:0;height:.5px;background:var(--line-2)}
      .sv-pick label:hover{background:var(--fill-2)}
      .sv-pick label:has(input[type=radio]:checked){background:var(--tint-soft)}
      .sv-pick label.off{opacity:.5;cursor:not-allowed}
      .sv-pick:not(.all) label.other{display:none}
      .sv-pick input[type=radio]{width:16px;height:16px;flex:none}
      .sv-pick .grow{flex:1;min-width:0}
      .sv-free{font-weight:600;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
      .sv-pick .sv-qty{display:none}
      .sv-pick label:has(input[type=radio]:checked) .sv-qty{display:inline-flex}
      .sv-pick label:has(input[type=radio]:checked) .sv-free{display:none}
      .sv-fu-row .ar-icon{background:var(--fill-2);color:var(--ink-2)}
      .sv-fu-row.over .ar-icon{background:var(--red-50);color:var(--red)}
      .sv-fu-row.due .ar-icon{background:var(--amber-50);color:var(--amber)}
      .sv-fu-row.done .ar-icon{background:var(--green-50);color:var(--green)}
      .sv-fu-row .ar-icon.idea{background:var(--violet-50);color:var(--violet)}
      .sv-fu-row .grow{flex:1;min-width:0}
      .sv-dist{display:flex;flex-direction:column;gap:6px;margin-top:16px}
      .sv-dist .n{width:28px}
      .sv-dist .c{width:24px;text-align:right}
      .sv-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .sv-more summary{cursor:pointer;color:var(--tint);font-size:13px;margin-top:12px;list-style:none}
      .sv-more summary::-webkit-details-marker{display:none}
      .sv-intro{margin-bottom:16px}
      @media(max-width:900px){.sv-line{padding:14px 18px}}
    `;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------------
     Page state (kept between renders)
     ------------------------------------------------------------------------ */
  const S = {
    bk: { day: '', st: 'active', q: '' },
    jobs: { bill: 'all', q: '', mine: false },
    wr: { f: 'all', q: '' },
    cl: { f: 'not_filed', q: '' },
    fu: { f: 'due', type: '', q: '' },
  };
  let drawList = null; // redraws the searchable list of the current tab

  /* ------------------------------------------------------------------------
     Router entry
     ------------------------------------------------------------------------ */
  NA.page({
    path: 'service',
    title: 'Service',
    icon: 'wrench',
    render(root, params, query) {
      injectCss();
      if (params[0] === 'job') return renderJob(root, params[1]);
      return renderMain(root, query || {});
    },
  });

  /* ------------------------------------------------------------------------
     Overview: today in four numbers, then the tabs
     ------------------------------------------------------------------------ */
  function stats() {
    const T = today();
    const jobs = NA.db.jobCards;
    const calls = serviceFollowUps().filter((f) => f.status !== 'done');
    return {
      arriving: NA.db.serviceBookings.filter((b) => b.date === T && b.status === 'booked').length,
      checkedIn: NA.db.serviceBookings.filter((b) => b.date === T && ['in_workshop', 'completed'].includes(b.status)).length,
      upcoming: NA.db.serviceBookings.filter((b) => b.status === 'booked' && b.date >= T).length,
      inShop: jobs.filter((j) => phase(j) === 'workshop').length,
      started: jobs.filter((j) => j.status === 'in_progress').length,
      ready: jobs.filter((j) => phase(j) === 'ready').length,
      toBill: jobs.filter((j) => j.status === 'completed').length,
      fuDue: calls.filter((f) => f.due <= T).length,
      fuOver: calls.filter((f) => f.due < T).length,
    };
  }

  function todayRow(k) {
    return `<div class="grid grid-4 sv-today">
      ${ui.kpi({ label: 'Arriving today', value: k.arriving, sub: k.checkedIn ? `${k.checkedIn} already checked in` : k.upcoming ? `${k.upcoming} booked from today` : 'No bookings', href: '#/service?tab=bookings' })}
      ${ui.kpi({ label: 'In the workshop', value: k.inShop, sub: k.started ? `${k.started} being repaired` : 'None started yet', href: '#/service?tab=jobs' })}
      ${ui.kpi({ label: 'Ready for pickup', value: k.ready, sub: k.toBill ? `${k.toBill} to bill` : 'Bill, collect, hand back', href: '#/service?tab=jobs' })}
      ${ui.kpi({ label: 'Calls to make', value: k.fuDue, sub: k.fuOver ? `<span class="tone-red">${k.fuOver} overdue</span>` : 'All on time', href: '#/service?tab=followups' })}
    </div>`;
  }

  function renderMain(root, query) {
    const tab = TABS.includes(query.tab) ? query.tab : 'jobs';
    const k = stats();
    const toClaim = claimRows().filter((r) => r.status === 'not_filed').length;
    root.innerHTML = ui.pageHead({
      title: 'Service',
      subtitle: 'Check cars in, repair them, bill and hand them back.',
    }) + todayRow(k) + ui.tabs([
      { key: 'jobs', label: 'Workshop', icon: 'wrench', count: k.inShop + k.ready },
      { key: 'bookings', label: 'Bookings', icon: 'calendar', count: k.upcoming },
      { key: 'warranties', label: 'Warranties', icon: 'shield' },
      { key: 'claims', label: 'BYD claims', icon: 'file-text', count: toClaim || null },
      { key: 'followups', label: 'Follow-ups', icon: 'bell', count: k.fuDue || null },
    ], tab) + '<div data-tabbody></div>';

    const body = root.querySelector('[data-tabbody]');
    drawList = null;
    ({ bookings: tabBookings, jobs: tabJobs, warranties: tabWarranties, claims: tabClaims, followups: tabFollowUps })[tab](body);

    const unbind = [
      ui.delegate(root, 'click', '[data-tab]', (el) => NA.go('#/service?tab=' + el.dataset.tab)),
      ui.delegate(root, 'input', '[data-search]', (el) => { S[el.dataset.search].q = el.value.trim().toLowerCase(); if (drawList) drawList(); }),
      ui.delegate(root, 'change', '[data-filter]', (el) => { const [g, key] = el.dataset.filter.split('.'); S[g][key] = el.value; NA.render(); }),
      ui.delegate(root, 'click', '[data-act]', (el, ev) => handleAct(el, ev)),
    ];
    if (tab === 'jobs') wireDrag(root);
    return () => unbind.forEach((u) => u());
  }

  function handleAct(el, ev) {
    const id = el.dataset.id; const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'new-booking': return NA.actions.newServiceBooking(v ? { date: v } : {});
      case 'new-job': return NA.actions.newJobCard({});
      case 'bk-day': S.bk.day = v || ''; return NA.render();
      case 'bk-st': S.bk.st = v; return NA.render();
      case 'checkin': return NA.actions.newJobCard({ bookingId: id });
      case 'bk-cancel': return cancelBooking(id);
      case 'bk-move': return rescheduleBooking(id);
      case 'job-bill': S.jobs.bill = v; return NA.render();
      case 'job-mine': S.jobs.mine = !S.jobs.mine; return NA.render();
      case 'job-next': { const jc = NA.get('jobCards', id); return jc && doAct(el.dataset.next, jc); }
      case 'open-job': if (ev && ev.target.closest('a,button') && ev.target.closest('a,button') !== el) return null; return NA.go('#/service/job/' + id);
      case 'wr-f': S.wr.f = v; return NA.render();
      case 'wr-cert': return printCertificate(id);
      case 'wr-book': { const w = NA.get('warranties', id); return w && NA.actions.newServiceBooking({ customerId: w.customerId, vehicleId: w.vehicleId }); }
      case 'cl-f': S.cl.f = v; return NA.render();
      case 'cl-act': return claimAct(id);
      case 'fu-f': S.fu.f = v; return NA.render();
      case 'fu-new': return newFollowUp({});
      case 'fu-done': return completeFollowUp(id);
      case 'fu-reopen': return reopenFollowUp(id);
      case 'fu-suggest': return createSuggested(el);
      case 'fu-suggest-all': return addAllSuggested();
      default: return null;
    }
  }

  /* ------------------------------------------------------------------------
     BOOKINGS tab
     ------------------------------------------------------------------------ */
  function tabBookings(body) {
    const T = today(); const st = S.bk;
    const all = NA.db.serviceBookings;
    const days = []; for (let i = 0; i < 7; i++) days.push(NA.addDays(T, i));
    const dayCard = (d) => {
      const list = all.filter((b) => b.date === d && b.status !== 'cancelled');
      const dt = new Date(d + 'T00:00:00'); const hol = isClosed(d);
      return `<button class="sv-day ${st.day === d ? 'active' : ''} ${d === T ? 'today' : ''}" data-act="bk-day" data-v="${d}" ${hol && !list.length ? `disabled title="${esc(closedLabel(d))} — the workshop is closed"` : ''}>
        <span class="dw">${d === T ? 'Today' : dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        <span class="dn">${dt.getDate()} ${esc(dt.toLocaleDateString('en-GB', { month: 'short' }))}</span>
        <span class="dc">${hol ? 'Closed' : list.length ? list.length + ' booked' : 'Free'}</span>
        <span class="dots">${list.slice(0, 10).map((b) => `<i class="dot dot-${(BK[bkState(b)] || {}).dot || 'gray'}"></i>`).join('')}</span>
      </button>`;
    };
    const inDay = all.filter((b) => !st.day || b.date === st.day);
    const match = (b, k) => { const s = bkState(b); return k === 'all' ? true : k === 'active' ? ['booked', 'in_workshop'].includes(s) : s === k; };
    const cnt = (k) => inDay.filter((b) => match(b, k)).length;
    const chips = [['active', 'Open'], ['booked', 'Booked'], ['in_workshop', 'In workshop'], ['no_show', 'Did not come'], ['completed', 'Done'], ['cancelled', 'Cancelled'], ['all', 'All']];

    body.innerHTML = `
      <div class="sv-days">
        <button class="sv-day ${!st.day ? 'active' : ''}" data-act="bk-day" data-v="">
          <span class="dw">All dates</span><span class="dn">${all.filter((b) => ['booked', 'in_workshop'].includes(bkState(b))).length}</span><span class="dc">open</span><span class="dots"></span>
        </button>
        ${days.map(dayCard).join('')}
      </div>
      ${st.day && isClosed(st.day) ? `<div class="callout callout-warn sv-intro">${NA.icon('alert', 16)}<div>${fmt.date(st.day)} is ${esc(closedWhat(st.day))}. The workshop is normally closed.</div></div>` : ''}
      <div class="toolbar">
        <input type="search" data-search="bk" placeholder="Search customer, phone, reg no, booking" value="${esc(st.q)}"/>
        <div class="chips">${chips.map(([k, l]) => `<button class="chip ${st.st === k ? 'active' : ''}" data-act="bk-st" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
        <span class="spacer"></span>
        ${canWork() ? ui.btn(st.day && !isClosed(st.day) ? 'Book for ' + fmt.dateShort(st.day) : 'New booking', { kind: 'primary', icon: 'plus', act: 'new-booking', attrs: st.day && !isClosed(st.day) ? `data-v="${st.day}"` : '' }) : ''}
      </div>
      <div class="card" data-list></div>`;

    const listEl = body.querySelector('[data-list]');
    drawList = () => {
      const q = st.q;
      let rows = inDay.filter((b) => match(b, st.st));
      rows = rows.filter((b) => { const c = NA.customer(b.customerId) || {}; const v = NA.vehicle(b.vehicleId) || {}; return hit(q, b.code, c.name, c.mobile, v.regNo, v.vin, b.type, b.channel); });
      const desc = ['completed', 'cancelled', 'no_show', 'all'].includes(st.st);
      rows.sort((a, b) => (desc ? -1 : 1) * String(a.date + a.time).localeCompare(String(b.date + b.time)));
      listEl.innerHTML = ui.table([
        { label: 'When', render: (b) => `<div class="sv-time">${esc(b.time || '—')}</div><div class="cell-sub">${b.date === T ? '<b class="tone-blue">Today</b>' : fmt.date(b.date)}</div>` },
        { label: 'Customer', render: (b) => { const c = NA.customer(b.customerId) || {}; return `<div class="row">${ui.avatar(c.name, 30)}<div><div class="cell-main">${esc(c.name || '—')}</div><div class="cell-sub">${esc(c.mobile || '')} · ${esc(b.code)}</div></div></div>`; } },
        { label: 'Car', render: (b) => { const v = NA.vehicle(b.vehicleId); return v ? `<div class="cell-main">${esc(NA.modelName(v.modelId))}</div><div class="cell-sub">${esc(v.regNo || 'No registration yet')} · <span class="mono">${esc(String(v.vin || '').slice(-8))}</span></div>` : '—'; } },
        { label: 'Service', render: (b) => `<div class="row gap-4">${NA.icon(TYPE_ICON[b.type] || 'wrench', 15)}<span class="cell-main">${esc(b.type)}</span></div><div class="cell-sub sv-clamp">${b.channel ? 'Booked by ' + esc(String(b.channel).toLowerCase()) : ''}${b.channel && b.notes ? ' · ' : ''}${esc(b.notes || '')}</div>` },
        { label: 'Warranty', render: (b) => warrantyChip(b.vehicleId) },
        { label: 'Status', render: (b) => { const jc = b.jobCardId && NA.get('jobCards', b.jobCardId); return bookingBadge(b) + (jc && jc.status === 'cancelled' ? '<div class="cell-sub">Job cancelled</div>' : b.rescheduled ? `<div class="cell-sub">Moved ${b.rescheduled === 1 ? 'once' : b.rescheduled + ' times'}</div>` : ''); } },
        { label: '', cls: 'right', render: (b) => bookingActions(b) },
      ], rows, { empty: st.day ? 'No bookings for ' + fmt.date(st.day) + '. The bay is free.' : 'No bookings match these filters', emptyIcon: 'calendar' });
    };
    drawList();
  }

  function bookingActions(b) {
    const c = NA.customer(b.customerId) || {};
    const v = NA.vehicle(b.vehicleId);
    const s = bkState(b);
    const msg = s === 'no_show'
      ? `Dear ${c.name || 'customer'}, this is Noor Autos (BYD). We missed you at the workshop on ${fmt.date(b.date)}. Reply with a day and time that suits you and we will book it (booking ${b.code}).`
      : `Dear ${c.name || 'customer'}, this is Noor Autos (BYD). A reminder of your ${String(b.type || 'service').toLowerCase()} appointment${v ? ' for your ' + NA.modelName(v.modelId) : ''} on ${fmt.date(b.date)} at ${b.time} at our Gulshan workshop (booking ${b.code}). Reply if you need another time.`;
    const wa = c.mobile ? `<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${esc(waLink(c.mobile, msg))}" title="Send a WhatsApp message">${NA.icon('whatsapp', 15)}${s === 'no_show' ? 'Message' : 'Remind'}</a>` : '';
    if ((s === 'booked' || s === 'no_show') && canWork()) {
      return `<div class="sv-acts">${s === 'booked' ? ui.btn('Check in', { kind: 'plain', size: 'sm', act: 'checkin', attrs: `data-id="${esc(b.id)}" title="The car has arrived: open the job card"` }) : ''}${wa}${ui.btn(s === 'no_show' ? 'Rebook' : 'Move', { kind: 'ghost', size: 'sm', act: 'bk-move', attrs: `data-id="${esc(b.id)}" title="Change the day or time (keeps the booking number)"` })}<button class="icon-btn" data-act="bk-cancel" data-id="${esc(b.id)}" title="Cancel booking" aria-label="Cancel booking">${NA.icon('x', 16)}</button></div>`;
    }
    if (b.jobCardId && NA.get('jobCards', b.jobCardId)) {
      const jc = NA.get('jobCards', b.jobCardId);
      return `<div class="sv-acts">${ui.btn(jc.code, { kind: 'plain', size: 'sm', href: jobHref(jc) })}</div>`;
    }
    return '';
  }

  function cancelBooking(id) {
    const b = NA.get('serviceBookings', id); if (!b) return;
    ui.formModal({
      title: 'Cancel booking', size: 'sm', submitLabel: 'Cancel booking',
      intro: `<p class="muted sv-intro">${esc(b.code)} · ${esc(NA.customerName(b.customerId))} · ${fmt.date(b.date)} ${esc(b.time || '')}</p>`,
      fields: [
        { name: 'reason', label: 'Why?', type: 'select', options: BOOKING_CANCEL, required: true, span: 2, placeholder: false },
        { name: 'note', label: 'Note', span: 2, placeholder: 'Optional' },
      ],
      values: { reason: bkState(b) === 'no_show' ? 'Customer did not come' : 'Customer cancelled' },
      onSubmit: (f) => {
        const cur = NA.get('serviceBookings', id);
        if (!cur || !['booked'].includes(cur.status)) { ui.toast('This booking has already moved on', 'info'); NA.refresh(); return true; }
        const reason = f.reason + (f.note ? ' — ' + f.note : '');
        NA.update('serviceBookings', id, { status: 'cancelled', cancelledAt: today(), cancel: Object.assign({ reason }, stamp()) });
        NA.log(`Service booking ${cur.code} cancelled — ${NA.customerName(cur.customerId)} (${reason})`, { rec: NA.get('serviceBookings', id), link: '#/service?tab=bookings', kind: 'warn' });
        ui.toast('Booking cancelled', 'info');
        NA.refresh();
      },
    });
  }

  /** Move a booking to another day or time. It keeps its number, so the customer's message still matches. */
  function rescheduleBooking(id) {
    const b = NA.get('serviceBookings', id); if (!b) return;
    const el = ui.formModal({
      title: 'Move booking', size: 'sm', submitLabel: 'Move booking',
      intro: `<p class="muted sv-intro">${esc(b.code)} · ${esc(NA.customerName(b.customerId))} · now ${fmt.date(b.date)} ${esc(b.time || '')}</p>`,
      fields: [
        { name: 'date', label: 'New date', type: 'date', required: true, min: today() },
        { name: 'time', label: 'Time', type: 'select', options: TIME_SLOTS, required: true, placeholder: false },
        { name: 'note', label: 'Note', span: 2, placeholder: 'Optional — e.g. customer asked for the afternoon' },
      ],
      values: { date: b.date >= today() ? b.date : nextOpen(NA.addDays(today(), 1)), time: b.time || '10:00' },
      onSubmit: (f) => {
        const cur = NA.get('serviceBookings', id);
        if (!cur || cur.status !== 'booked') { ui.toast('This booking has already moved on', 'info'); NA.refresh(); return true; }
        if (f.date < today()) { ui.toast('Choose today or a later day', 'error'); return false; }
        if (isClosed(f.date)) { ui.toast(closedToast(f.date), 'error'); return false; }
        if (f.date === cur.date && f.time === cur.time) return true;
        NA.update('serviceBookings', id, { date: f.date, time: f.time, rescheduled: num(cur.rescheduled) + 1 });
        NA.log(`Service booking ${cur.code} moved from ${fmt.date(cur.date)} ${cur.time || ''} to ${fmt.date(f.date)} ${f.time}${f.note ? ' (' + f.note + ')' : ''}`, { rec: NA.get('serviceBookings', id), link: '#/service?tab=bookings' });
        ui.toast(`Moved to ${fmt.dateShort(f.date)} ${f.time}`);
        NA.refresh();
      },
    });
    if (el && el.querySelector) {
      const form = el.querySelector('form');
      const d = form && form.querySelector('[name=date]');
      if (d && d.closest) {
        d.closest('.field').insertAdjacentHTML('beforeend', '<small class="help" data-slot></small>');
        const show = () => {
          const box = form.querySelector('[data-slot]'); if (!box) return;
          const v = ui.readForm(form);
          const same = NA.db.serviceBookings.filter((x) => x.id !== id && x.date === v.date && ['booked', 'in_workshop'].includes(x.status));
          box.textContent = isClosed(v.date) ? closedLabel(v.date) + ' — the workshop is closed' : `${same.length} other booking${same.length === 1 ? '' : 's'} that day${same.some((x) => x.time === v.time) ? ', one already at ' + v.time : ''}`;
        };
        form.addEventListener('change', show); show();
      }
    }
  }

  /* New service booking ------------------------------------------------- */
  NA.actions.newServiceBooking = function (prefill) {
    prefill = prefill || {};
    let customerId = prefill.customerId || '';
    if (!customerId && prefill.vehicleId) { const v = NA.vehicle(prefill.vehicleId); customerId = (v && v.customerId) || ''; }
    const firstOpen = nextOpen(today());
    const vals = {
      customerId, vehicleId: prefill.vehicleId || '', date: prefill.date || firstOpen, time: prefill.time || '10:00',
      type: prefill.type || 'Periodic Maintenance', channel: prefill.channel || 'Phone', notes: prefill.notes || '',
    };
    if (!canWork()) { ui.toast('The service desk books services', 'error'); return; }
    if (!NA.db.customers.length) { ui.toast('Add a customer first — bookings are for cars we have delivered', 'error'); return; }
    const el = ui.formModal({
      title: 'Book a service',
      subtitle: 'Choose the customer, their car and a time.',
      size: 'md',
      submitLabel: 'Book',
      fields: [
        { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions(), required: true, span: 2, placeholder: 'Who is booking?' },
        { name: 'vehicleId', label: 'Car', type: 'select', options: vehicleOptions(customerId), required: true, span: 2 },
        { name: 'date', label: 'Date', type: 'date', required: true, min: today() },
        { name: 'time', label: 'Time', type: 'select', options: TIME_SLOTS, required: true, placeholder: false },
        { name: 'type', label: 'Service', type: 'select', options: NA.FLOW.serviceTypes, required: true, placeholder: false },
        { name: 'channel', label: 'Booked by', type: 'select', options: NA.FLOW.serviceChannels, required: true, placeholder: false },
        { name: 'notes', label: 'What the customer says', type: 'textarea', span: 2, rows: 2, placeholder: 'e.g. 10,000 km service, AC weak, noise from the front left' },
      ],
      values: vals,
      onSubmit: (f) => {
        if (!f.vehicleId) { ui.toast('Choose the customer’s car', 'error'); return false; }
        if (f.date < today()) { ui.toast('Choose today or a later day', 'error'); return false; }
        if (isClosed(f.date)) { ui.toast(closedToast(f.date), 'error'); return false; }    // the same rule as moving a booking
        const twice = NA.find('serviceBookings', (x) => x.vehicleId === f.vehicleId && x.status === 'booked' && x.date >= today());
        if (twice) { ui.toast(`This car is already booked for ${fmt.date(twice.date)} (${twice.code}). Move that booking instead.`, 'error'); return false; }
        const b = NA.insert('serviceBookings', {
          code: NA.nextCode('SB'), customerId: f.customerId, vehicleId: f.vehicleId, date: f.date, time: f.time,
          type: f.type, channel: f.channel, notes: f.notes, status: 'booked', jobCardId: null,
          bookedBy: NA.me().name, bookedById: NA.myStaffId(),
        });
        NA.log(`Service booked ${b.code} — ${NA.customerName(b.customerId)}, ${b.type} on ${fmt.date(b.date)} ${b.time} (${b.channel})`, { rec: b, link: '#/service?tab=bookings', kind: 'info' });
        ui.toast(`Booking ${b.code} confirmed for ${fmt.dateShort(b.date)} ${b.time}`);
        const inStrip = NA.daysBetween(today(), b.date) >= 0 && NA.daysBetween(today(), b.date) < 7;
        S.bk.day = inStrip ? b.date : ''; S.bk.st = 'active';
        if (NA.currentRoute().section === 'service' && !NA.currentRoute().params.length) NA.go('#/service?tab=bookings');
        else NA.refresh();
      },
    });
    if (!el || !el.querySelector) return;
    const form = el.querySelector('form');
    const vs = form.querySelector('[name=vehicleId]');
    vs.closest('.field').insertAdjacentHTML('afterend', '<div class="span-2" data-wbox></div>');
    const box = form.querySelector('[data-wbox]');
    const update = () => {
      const f = ui.readForm(form);
      const parts = [];
      if (f.vehicleId) {
        const wi = warrantyInfo(f.vehicleId);
        parts.push(warrantyCallout(wi));
        if (f.type === 'Warranty Repair' && !wi.vehicleOk) parts.push(`<div class="callout callout-warn">${NA.icon('info', 16)}<div>${wi.batteryOk ? 'Only traction battery work is still covered. Other repairs are paid by the customer.' : 'This car is not under warranty, so the customer pays for the repair.'}</div></div>`);
        const open = NA.find('jobCards', (j) => j.vehicleId === f.vehicleId && phase(j) === 'workshop');
        if (open) parts.push(`<div class="callout callout-info">${NA.icon('info', 16)}<div>This car is already in the workshop on <b>${esc(open.code)}</b>.</div></div>`);
        const twice = NA.find('serviceBookings', (x) => x.vehicleId === f.vehicleId && x.status === 'booked' && x.date >= today());
        if (twice) parts.push(`<div class="callout callout-warn">${NA.icon('calendar', 16)}<div>Already booked for ${fmt.date(twice.date)} ${esc(twice.time || '')} (${esc(twice.code)}). Move that booking instead.</div></div>`);
      } else if (f.customerId && !custVehicles(f.customerId).length) {
        parts.push(`<div class="callout callout-warn">${NA.icon('alert', 16)}<div>No car is linked to this customer yet. A car is linked when its VIN is given on a sales order.</div></div>`);
      }
      if (isClosed(f.date)) parts.push(`<div class="callout callout-warn">${NA.icon('calendar', 16)}<div>${fmt.date(f.date)} is ${esc(closedWhat(f.date))}. The workshop is closed, so choose another day.</div></div>`);
      const same = NA.db.serviceBookings.filter((b) => b.date === f.date && ['booked', 'in_workshop'].includes(b.status));
      if (f.date) {
        const slot = same.filter((b) => b.time === f.time).length;
        parts.push(`<div class="small muted">${same.length ? `${same.length} other booking${same.length === 1 ? '' : 's'} on ${fmt.dateShort(f.date)}` : `Nothing else booked on ${fmt.dateShort(f.date)}`}${slot ? ` · <b class="tone-amber">${slot} already at ${esc(f.time)}</b>` : ''}</div>`);
      }
      box.innerHTML = `<div class="stack">${parts.join('')}</div>`;
    };
    wireCustomerVehicle(form, update);
    update();
  };

  /* ------------------------------------------------------------------------
     WORKSHOP tab — today's board: Booked → In workshop → Ready → Released
     ------------------------------------------------------------------------ */
  const LANES = [
    { key: 'booked', label: 'Booked', hint: 'Arriving today', icon: 'calendar' },
    { key: 'workshop', label: 'In workshop', hint: 'Waiting to start or being repaired', icon: 'wrench' },
    { key: 'ready', label: 'Ready', hint: 'Bill, collect and hand back', icon: 'check-circle' },
    { key: 'released', label: 'Released', hint: 'Handed back in the last 7 days', icon: 'car' },
  ];
  /** Steps a card button may run straight from the board. */
  const CARD_ACTS = ['estimate', 'start', 'complete', 'close', 'invoice', 'collect', 'release', 'ask-warranty', 'ask-discount'];

  function tabJobs(body) {
    const st = S.jobs; const T = today();
    const myId = NA.myStaffId();
    const all = NA.db.jobCards.filter((j) => j.status !== 'cancelled');
    const kindOf = (j) => (isInternal(j) ? 'internal' : j.billing === 'warranty' ? 'warranty' : 'paid');
    const billOk = (j) => st.bill === 'all' || kindOf(j) === st.bill;
    const mineOk = (j) => !st.mine || j.technicianId === myId || j.advisorId === myId;
    const laneOf = (j) => { const p = phase(j); return p === 'closed' ? 'released' : p; };
    const recent = (j) => { const p = phase(j); return (p !== 'released' && p !== 'closed') || NA.daysBetween(p === 'closed' ? (j.closedAt || j.completedAt || j.openedAt) : releaseDate(j), T) <= 7; };
    const cnt = (k) => all.filter((j) => recent(j) && (k === 'all' || kindOf(j) === k)).length;
    const mine = myId && all.some((j) => j.technicianId === myId || j.advisorId === myId);
    body.innerHTML = `
      <div class="toolbar">
        <input type="search" data-search="jobs" placeholder="Search job, customer, reg no, complaint" value="${esc(st.q)}"/>
        <div class="chips">${[['all', 'All'], ['paid', 'Customer pays'], ['warranty', 'Warranty'], ['internal', 'Our cars']].map(([k, l]) => `<button class="chip ${st.bill === k ? 'active' : ''}" data-act="job-bill" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}
          ${mine ? `<button class="chip ${st.mine ? 'active' : ''}" data-act="job-mine">${NA.icon('user', 14)}Mine</button>` : ''}</div>
        <span class="spacer"></span>
        ${canWork() ? ui.btn('Check in a car', { kind: 'primary', icon: 'plus', act: 'new-job' }) : ''}
      </div>
      <div data-list></div>`;
    const listEl = body.querySelector('[data-list]');
    drawList = () => {
      const q = st.q;
      const rows = all.filter((j) => billOk(j) && mineOk(j) && recent(j)).filter((j) => {
        const c = NA.customer(j.customerId) || {}; const v = NA.vehicle(j.vehicleId) || {};
        return hit(q, j.code, c.name, c.mobile, v.regNo, v.vin, j.complaint, NA.staffName(j.technicianId));
      });
      const bookings = st.bill === 'internal' || st.mine ? [] : NA.db.serviceBookings.filter((b) => b.date === T && b.status === 'booked')
        .filter((b) => { const c = NA.customer(b.customerId) || {}; const v = NA.vehicle(b.vehicleId) || {}; return hit(q, b.code, c.name, c.mobile, v.regNo, v.vin, b.type, b.notes); })
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));
      listEl.innerHTML = `<div class="kanban sv-board">${LANES.map((s) => {
        const items = s.key === 'booked' ? bookings : rows.filter((j) => laneOf(j) === s.key)
          .sort((a, b) => (s.key === 'released' ? releaseDate(b).localeCompare(releaseDate(a)) : String(a.openedAt || '').localeCompare(String(b.openedAt || ''))));
        return `<div class="lane" data-lane="${s.key}">
          <div class="lane-head"><div class="row-between"><b>${esc(s.label)}</b><span class="lane-count">${items.length}</span></div><small>${esc(s.hint)}</small></div>
          <div class="lane-body">${items.length ? items.map(s.key === 'booked' ? bookingTile : jobCardTile).join('') : `<div class="empty">${NA.icon(s.icon, 22)}<p class="small">Nothing here</p></div>`}</div>
        </div>`;
      }).join('')}</div>`;
    };
    drawList();
  }

  const daysText = (from) => { const d = Math.max(0, NA.daysBetween(String(from || today()).slice(0, 10), today())); return d ? d + ' day' + (d === 1 ? '' : 's') : 'today'; };

  function jobCardTile(j) {
    const v = NA.vehicle(j.vehicleId);
    const [label, tone] = jobStatus(j);
    const ns = nextStep(j);
    const p = phase(j);
    const tech = j.technicianId ? NA.staffName(j.technicianId) : '';
    const when = p === 'workshop' ? 'In for ' + daysText(j.openedAt) : p === 'ready' ? 'Ready ' + (daysText(j.completedAt) === 'today' ? 'today' : 'for ' + daysText(j.completedAt))
      : p === 'closed' ? 'Closed ' + fmt.dateShort(j.closedAt || j.completedAt) : 'Handed back ' + fmt.dateShort(releaseDate(j));
    const go = canWork() && CARD_ACTS.includes(ns.act) && !ns.blockers.length;
    const right = go ? `<button class="btn btn-sm btn-ghost" data-act="job-next" data-id="${esc(j.id)}" data-next="${esc(ns.act)}">${esc(ns.label)}</button>`
      : ns.blockers.length && ['workshop', 'ready'].includes(p) ? `<span class="sv-why">${esc(ns.blockers[0])}</span>` : '';
    return `<div class="kcard sv-card" draggable="true" data-act="open-job" data-id="${esc(j.id)}">
      <div class="row-between"><span class="mono small muted">${esc(j.code)}</span>${billBadge(j, true)}</div>
      <div class="t sv-card-t">${esc(jobCustName(j))}</div>
      <div class="s">${esc(vehLine(v))}</div>
      ${j.complaint ? `<div class="s sv-clamp sv-card-c">${esc(j.complaint)}</div>` : ''}
      <div class="meta">${ui.badge(label, tone)}${tech ? `<span>${esc(tech)}</span>` : p === 'workshop' ? '<span class="tone-amber">No technician yet</span>' : ''}</div>
      <div class="foot"><span>${esc(when)}</span>${right}</div>
    </div>`;
  }

  function bookingTile(b) {
    const c = NA.customer(b.customerId) || {}; const v = NA.vehicle(b.vehicleId);
    return `<div class="kcard sv-card" draggable="true" data-bk="${esc(b.id)}">
      <div class="row-between"><span class="sv-time">${esc(b.time || '—')}</span>${warrantyChip(b.vehicleId)}</div>
      <div class="t sv-card-t">${esc(c.name || '—')}</div>
      <div class="s">${esc(vehLine(v))}</div>
      <div class="s sv-clamp sv-card-c">${esc(b.type || 'Service')}${b.notes ? ' · ' + esc(b.notes) : ''}</div>
      <div class="foot"><span>${esc(b.code)}</span>${canWork() ? `<button class="btn btn-sm btn-ghost" data-act="checkin" data-id="${esc(b.id)}">Check in</button>` : ''}</div>
    </div>`;
  }

  /** Drag and drop for mouse users: the same steps as the buttons on the cards. */
  function wireDrag(root) {
    let drag = null;
    const clear = () => root.querySelectorAll('.lane.drop-over').forEach((l) => l.classList.remove('drop-over'));
    root.addEventListener('dragstart', (e) => {
      const c = e.target.closest && e.target.closest('.kcard'); if (!c) return;
      drag = c.dataset.bk ? { kind: 'booking', id: c.dataset.bk } : { kind: 'job', id: c.dataset.id };
      c.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', drag.id); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ignore */ }
    });
    root.addEventListener('dragend', (e) => { const c = e.target.closest && e.target.closest('.kcard'); if (c) c.classList.remove('dragging'); clear(); });
    root.addEventListener('dragover', (e) => { const lane = e.target.closest && e.target.closest('.lane'); if (!lane || !drag) return; e.preventDefault(); root.querySelectorAll('.lane.drop-over').forEach((l) => l !== lane && l.classList.remove('drop-over')); lane.classList.add('drop-over'); });
    root.addEventListener('dragleave', (e) => { const lane = e.target.closest && e.target.closest('.lane'); if (lane && !lane.contains(e.relatedTarget)) lane.classList.remove('drop-over'); });
    root.addEventListener('drop', (e) => {
      const lane = e.target.closest && e.target.closest('.lane'); if (!lane || !drag) return;
      e.preventDefault(); clear();
      const d = drag; drag = null;
      moveCard(d, lane.dataset.lane);
    });
  }

  function moveCard(d, lane) {
    if (!canWork()) return;
    if (d.kind === 'booking') {
      if (lane === 'workshop') return NA.actions.newJobCard({ bookingId: d.id });
      if (lane !== 'booked') ui.toast('Check the car in first', 'info');
      return null;
    }
    const jc = NA.get('jobCards', d.id); if (!jc) return null;
    const from = phase(jc) === 'closed' ? 'released' : phase(jc);
    if (from === lane) return null;
    const ns = nextStep(jc);
    const fits = { workshop: ['estimate', 'start'], ready: ['complete'], released: ['release', 'close'] }[lane] || [];
    if (fits.includes(ns.act) && !ns.blockers.length) return doAct(ns.act, jc);
    return ui.toast(ns.blockers[0] || (ns.title ? 'Next: ' + ns.title : 'That move is not possible'), 'info');
  }

  /** Run a job's next step (from the board, the job page or a drop). */
  function doAct(act, jc) {
    const fresh = NA.get('jobCards', jc.id); if (!fresh) return null;
    const inv = invoiceOf(fresh);
    switch (act) {
      case 'estimate': return agreeEstimate(fresh);
      case 'start': return startJob(fresh);
      case 'complete': return completeJob(fresh);
      case 'close': return closeInternal(fresh);
      case 'invoice': return invoiceJob(fresh);
      case 'collect': return inv && collectPayment(inv);
      case 'credit': return inv && allowCredit(inv);
      case 'release': return releaseJob(fresh);
      case 'ask-warranty': return askWarranty(fresh);
      case 'ask-discount': return askDiscount(fresh);
      case 'print-gate': return printGatePass(fresh);
      default: return null;
    }
  }

  /* New job card -------------------------------------------------------- */
  NA.actions.newJobCard = function (prefill) {
    prefill = prefill || {};
    if (!canWork()) { ui.toast('The service desk checks cars in', 'error'); return; }
    const bk = prefill.bookingId ? NA.get('serviceBookings', prefill.bookingId) : null;
    if (bk && bk.jobCardId && NA.get('jobCards', bk.jobCardId)) { ui.toast(`Already checked in on ${NA.get('jobCards', bk.jobCardId).code}`, 'info'); NA.go('#/service/job/' + bk.jobCardId); return; }
    let customerId = prefill.customerId || (bk && bk.customerId) || '';
    const vehicleId = prefill.vehicleId || (bk && bk.vehicleId) || '';
    if (!customerId && vehicleId) { const v0 = NA.vehicle(vehicleId); customerId = (v0 && v0.customerId) || ''; }
    const v = NA.vehicle(vehicleId);
    // Our own car (in stock, or sold but not handed over yet, e.g. damage found at the arrival check): no bill, our cost.
    const ownCar = v && (!v.customerId || v.status !== 'delivered') ? v : null;
    const type = prefill.type || (bk && bk.type) || 'General Repair';
    const vals = {
      customerId: ownCar ? '' : customerId, vehicleId, type,
      odometer: prefill.odometer != null ? prefill.odometer : (v ? v.km || 0 : ''),
      technicianId: prefill.technicianId || '',
      advisorId: prefill.advisorId || myAdvisorId(),
      complaint: prefill.complaint || (bk ? bk.type + (bk.notes ? ' — ' + bk.notes : '') : ''),
    };
    const el = ui.formModal({
      title: bk ? `Check in · ${bk.code}` : 'Check in a car',
      subtitle: bk ? `Booked for ${esc(fmt.date(bk.date))} ${esc(bk.time || '')}. Write what the customer says; the parts and the work come next.` : 'Write what the customer says; the parts and the work come next.',
      size: 'lg',
      submitLabel: 'Open job card',
      intro: ownCar ? `<div class="callout callout-info sv-intro">${NA.icon('car', 16)}<div><b>Our own car.</b> ${ownCar.customerId ? 'It is sold but not handed over yet' : 'It is not sold yet'}, so the work is our cost and no bill is made.</div></div>` : '',
      fields: [
        { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions(), required: !ownCar, span: 2, placeholder: ownCar ? 'Our own car (no customer)' : 'Who brought the car?' },
        { name: 'vehicleId', label: 'Car', type: 'select', options: ownCar ? [{ value: ownCar.id, label: vehOptionLabel(ownCar) }] : vehicleOptions(customerId), required: true, span: 2 },
        { name: 'internalReason', label: 'Why are we working on our own car?', type: 'select', options: INTERNAL_REASONS, span: 2, placeholder: 'Choose…' },
        { name: 'type', label: 'Service', type: 'select', options: NA.FLOW.serviceTypes, required: true, placeholder: false },
        { name: 'odometer', label: 'Odometer (km)', type: 'number', required: true, min: 0, help: 'From the dashboard. It can only go up later.' },
        { name: 'technicianId', label: 'Technician', type: 'select', options: ui.opts.technicians(), placeholder: 'Choose later' },
        { name: 'advisorId', label: 'Service advisor', type: 'select', options: advisorOptions(vals.advisorId), placeholder: '—' },
        { name: 'complaint', label: 'What the customer says', type: 'textarea', required: true, span: 2, placeholder: 'In their words: what is wrong and when it happens' },
      ],
      values: vals,
      onSubmit: (f) => {
        const veh = NA.vehicle(f.vehicleId);
        if (!veh) { ui.toast('Choose the car', 'error'); return false; }
        const internal = !veh.customerId || veh.status !== 'delivered';
        if (!internal && !f.customerId) { ui.toast('Choose the customer', 'error'); return false; }
        if (internal && !f.internalReason) { ui.toast('Say why we are working on our own car', 'error'); return false; }
        if (f.odometer === '' || !(Number(f.odometer) >= 0)) { ui.toast('Enter the odometer reading', 'error'); return false; }
        const odo = Math.round(Number(f.odometer));
        if (num(veh.km) && odo < num(veh.km)) { ui.toast(`The odometer can’t be lower than the last reading (${fmt.num(veh.km)} km)`, 'error'); return false; }
        const open = openJobFor(veh.id);
        if (open) { ui.toast(`This car is already on ${open.code}. Add the complaint there instead.`, 'error'); return false; }
        // The booking may have been checked in on another screen in the meantime.
        const bkNow = bk && NA.get('serviceBookings', bk.id);
        if (bk && (!bkNow || bkNow.status !== 'booked' || (bkNow.jobCardId && NA.get('jobCards', bkNow.jobCardId)))) {
          const other = bkNow && bkNow.jobCardId && NA.get('jobCards', bkNow.jobCardId);
          ui.toast(other ? `Already checked in on ${other.code}` : 'This booking has changed — check it again', 'info');
          if (other) NA.go(jobHref(other)); else NA.refresh();
          return true;
        }
        const booking = bkNow || NA.find('serviceBookings', (b) => b.vehicleId === veh.id && b.status === 'booked' && !b.jobCardId && b.date <= NA.addDays(today(), 1) && b.date >= NA.addDays(today(), -3));
        const wi = warrantyInfo(veh.id, odo);
        const jc = NA.insert('jobCards', {
          code: NA.nextCode('JC'), customerId: internal ? '' : f.customerId, vehicleId: veh.id, bookingId: booking ? booking.id : null,
          type: f.type, technicianId: f.technicianId || '', advisorId: f.advisorId || '',
          parts: [], labourHours: 1, labourRate: defaultRate(),
          billing: internal ? 'internal' : f.type === 'Warranty Repair' && wi.vehicleOk ? 'warranty' : 'paid',
          internal: internal ? { reason: f.internalReason, buyerId: veh.customerId || null } : null,
          status: 'open', openedAt: today(), odometer: odo, odometerIn: odo, complaint: f.complaint, diagnosis: '', history: [],
          openedBy: NA.me().name, openedById: NA.myStaffId(),
        });
        if (booking) NA.update('serviceBookings', booking.id, { status: 'in_workshop', jobCardId: jc.id, checkedInAt: new Date().toISOString() });
        if (odo > num(veh.km)) NA.update('vehicles', veh.id, { km: odo });
        NA.log(`Job card ${jc.code} opened — ${jobCustName(jc)}, ${NA.modelName(veh.modelId)} at ${fmt.num(odo)} km${internal ? ' (our cost: ' + f.internalReason.toLowerCase() + ')' : ''}`, { rec: jc, link: jobHref(jc), kind: 'info' });
        ui.toast(`Job card ${jc.code} opened`);
        NA.go(jobHref(jc));
      },
    });
    if (!el || !el.querySelector) return;
    const form = el.querySelector('form');
    const vs = form.querySelector('[name=vehicleId]');
    vs.closest('.field').insertAdjacentHTML('afterend', '<div class="span-2" data-wbox></div>');
    const box = form.querySelector('[data-wbox]');
    const reasonField = form.querySelector('[name=internalReason]');
    let lastVeh = vs.value;
    const update = () => {
      const f = ui.readForm(form);
      const vv = NA.vehicle(f.vehicleId);
      if (f.vehicleId !== lastVeh) {
        lastVeh = f.vehicleId;
        form.querySelector('[name=odometer]').value = vv ? vv.km || 0 : '';
      }
      const internal = !!vv && (!vv.customerId || vv.status !== 'delivered');
      if (reasonField && reasonField.closest) reasonField.closest('.field').classList.toggle('hidden', !internal);
      const bits = [];
      if (f.vehicleId) {
        bits.push(internal ? `<div class="callout callout-info">${NA.icon('car', 16)}<div>This car is not handed over to a customer yet, so the work is our cost and no bill is made.</div></div>` : warrantyCallout(warrantyInfo(f.vehicleId, f.odometer)));
        const open = openJobFor(f.vehicleId);
        if (open) bits.push(`<div class="callout callout-warn">${NA.icon('alert', 16)}<div class="grow">This car is already in the workshop on <b>${esc(open.code)}</b>. Add the new complaint to that job instead.
          <div class="mt-8">${ui.btn('Add it to ' + open.code, { kind: 'ghost', size: 'sm', attrs: `type="button" data-addto="${esc(open.id)}"` })}</div></div></div>`);
      } else if (f.customerId && !custVehicles(f.customerId).length) {
        bits.push(`<div class="callout callout-warn">${NA.icon('alert', 16)}<div>No car is linked to this customer.</div></div>`);
      }
      box.innerHTML = `<div class="stack">${bits.join('')}</div>`;
    };
    wireCustomerVehicle(form, update, ownCar);
    el.addEventListener('click', (e) => {
      const add = e.target.closest('[data-addto]');
      if (add) { const job = NA.get('jobCards', add.dataset.addto); const text = ui.readForm(form).complaint; ui.closeTop(); if (job) addToOpenJob(job, text, bk); return; }
      if (e.target.closest('a[href^="#/"]')) ui.closeTop();
    });
    update();
  };

  /** One job card per car in the workshop: a second complaint goes onto the job that is already open. */
  function addToOpenJob(jc, text, bk) {
    const fresh = NA.get('jobCards', jc.id); if (!fresh) return;
    const add = String(text || '').trim();
    if (add && !String(fresh.complaint || '').includes(add)) NA.update('jobCards', fresh.id, { complaint: (fresh.complaint ? fresh.complaint + '\n' : '') + add });
    const b = bk && NA.get('serviceBookings', bk.id);
    if (b && b.status === 'booked') NA.update('serviceBookings', b.id, { status: 'in_workshop', jobCardId: fresh.id, checkedInAt: new Date().toISOString() });
    NA.log(`${fresh.code} — another complaint added${add ? ': ' + add.slice(0, 90) : ''}`, { rec: NA.get('jobCards', fresh.id), link: jobHref(fresh) });
    ui.toast('Added to ' + fresh.code);
    NA.go(jobHref(fresh));
  }

  /* ------------------------------------------------------------------------
     Job card lifecycle
     ------------------------------------------------------------------------ */
  const logJob = (jc, text, kind) => NA.log(text, { rec: NA.get('jobCards', jc.id) || jc, link: jobHref(jc), kind: kind || 'info' });
  const refuse = (ns, fallback) => { ui.toast(ns.blockers[0] || fallback || ns.title || 'Not possible yet', 'error'); };

  /** The customer agrees to the expected bill (paid jobs), before the work starts. */
  function agreeEstimate(jc) {
    const t = totals(jc);
    const c = NA.customer(jc.customerId) || {};
    const msg = `Dear ${c.name || 'customer'}, this is Noor Autos (BYD) about your car (job ${jc.code}). The work will cost about ${fmt.money(t.total)} including VAT. Please reply YES to go ahead.`;
    ui.formModal({
      title: 'Customer agreed', size: 'sm', submitLabel: 'Save',
      intro: `<div class="sv-est"><span class="muted small">Expected bill</span><div class="sv-big">${fmt.money(t.total)}</div>
          <span class="muted small">Parts ${fmt.money(t.parts)} · labour ${fmt.money(t.labour)}${t.discount ? ' · discount ' + fmt.money(t.discount) : ''} · VAT ${fmt.money(t.vat)}</span>
          ${c.mobile ? `<div class="mt-8"><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${esc(waLink(c.mobile, msg))}">${NA.icon('whatsapp', 15)}Send on WhatsApp</a></div>` : ''}</div>`,
      fields: [
        { name: 'how', label: 'How did they agree?', type: 'select', options: AGREED_HOW, required: true, placeholder: false, span: 2 },
        { name: 'note', label: 'Note', span: 2, placeholder: 'Optional — e.g. spoke to Mr Karim at 11:30' },
      ],
      values: { how: 'Phone call' },
      onSubmit: (f) => {
        const fresh = NA.get('jobCards', jc.id); if (!fresh) return true;
        const now = totals(fresh).total;
        NA.update('jobCards', fresh.id, { estimate: Object.assign({ total: now, how: f.how, note: f.note || '' }, stamp()) });
        logJob(fresh, `${fresh.code} — customer agreed to ${fmt.money(now)} (${f.how.toLowerCase()}${f.note ? ', ' + f.note : ''})`, 'success');
        ui.toast('Saved');
        NA.refresh();
      },
    });
  }

  function startJob(jc) {
    const ns = nextStep(jc);
    if (ns.act !== 'start' || ns.blockers.length) return refuse(ns);
    NA.update('jobCards', jc.id, { status: 'in_progress', startedAt: new Date().toISOString() });
    logJob(jc, `${jc.code} — work started by ${NA.staffName(jc.technicianId)}`);
    ui.toast(`${jc.code} is being repaired`);
    NA.refresh();
  }
  /** Started by mistake: back to waiting (nothing has left the shelf yet). */
  function stopJob(jc) {
    if (jc.status !== 'in_progress') return;
    NA.update('jobCards', jc.id, { status: 'open', startedAt: null });
    logJob(jc, `${jc.code} — moved back to waiting to start`);
    NA.refresh();
  }

  /** Take a job's held parts out of stock. Returns the job's part lines, all marked as used. */
  function takeFromStock(jc) {
    const ids = new Set();
    const lines = (jc.parts || []).map((l) => {
      if (l.consumed) return l;
      const p = NA.get('parts', l.partId);
      if (p) { NA.update('parts', p.id, { onHand: Math.max(0, num(p.onHand) - num(l.qty)) }); ids.add(p.id); }
      return Object.assign({}, l, { consumed: true, consumedAt: today() });
    });
    NA.update('jobCards', jc.id, { parts: lines });
    ids.forEach(syncReserved);
    return lines;
  }
  /** The visit is over: its booking is done. */
  function finishBooking(jc, extra) {
    const b = (jc.bookingId && NA.get('serviceBookings', jc.bookingId)) || NA.find('serviceBookings', (x) => x.jobCardId === jc.id);
    if (b && b.status !== 'completed') NA.update('serviceBookings', b.id, Object.assign({ status: 'completed', jobCardId: jc.id }, extra || {}));
  }

  async function completeJob(jc) {
    const cur = NA.get('jobCards', jc.id); if (!cur) return;
    let ns = nextStep(cur);
    if (ns.act !== 'complete' || ns.blockers.length) return refuse(ns, 'This job can’t be finished yet');
    const internal = isInternal(cur);
    const lines = (cur.parts || []).filter((l) => !l.consumed);
    const what = lines.length ? `${lines.length === 1 ? 'This part is' : 'These parts are'} taken out of stock: ${lines.map((l) => esc(l.qty + ' × ' + partName(l))).join(', ')}.` : 'No parts are taken out of stock.';
    const label = internal ? 'Finish and close' : 'Work is done';
    const ok = await ui.confirm(`${internal ? 'Finish the work and close' : 'Finish the work on'} <b>${esc(cur.code)}</b>?<br><br>${what}`, { title: label, okLabel: label });
    if (!ok) return;
    const fresh = NA.get('jobCards', jc.id); if (!fresh) return;
    ns = nextStep(fresh);
    if (ns.act !== 'complete' || ns.blockers.length) { refuse(ns, 'The job changed meanwhile — check it again'); NA.refresh(); return; }
    // A Service Manager finishing free warranty work approves it themselves (it is recorded).
    if (fresh.billing === 'warranty' && warrantyApproval(fresh) !== 'ok' && canApprove()) A.request(warrantyRequest(fresh));
    const t = totals(fresh);
    const used = takeFromStock(fresh);
    const patch = { parts: used, status: internal ? 'closed' : 'completed', completedAt: today() };
    if (internal) Object.assign(patch, { billing: 'internal', closedAt: today(), internal: Object.assign({}, fresh.internal, { value: t.internalCost, closedBy: NA.me().name, closedById: NA.myStaffId() }) });
    NA.update('jobCards', fresh.id, patch);
    const v = NA.vehicle(fresh.vehicleId);
    if (v && num(fresh.odometer) > num(v.km)) NA.update('vehicles', v.id, { km: num(fresh.odometer) });
    if (internal) finishBooking(fresh);
    logJob(fresh, internal
      ? `${fresh.code} — closed as our own cost: work worth ${fmt.money(t.internalCost)}${fresh.internal && fresh.internal.reason ? ' (' + fresh.internal.reason.toLowerCase() + ')' : ''}`
      : `${fresh.code} — work done${lines.length ? ', ' + lines.length + ' part line' + (lines.length === 1 ? '' : 's') + ' taken out of stock' : ''}`, 'success');
    ui.toast(internal ? 'Closed — recorded as our own cost' : 'Work done — ready to bill');
    NA.refresh();
  }

  /** Our own car whose work was finished before the Closed step existed. */
  function closeInternal(jc) {
    const fresh = NA.get('jobCards', jc.id);
    if (!fresh || fresh.status !== 'completed' || !isInternal(fresh)) return;
    const finish = (reason) => {
      const t = totals(fresh);
      NA.update('jobCards', fresh.id, { status: 'closed', billing: 'internal', closedAt: today(), internal: Object.assign({}, fresh.internal, { reason, value: t.internalCost, closedBy: NA.me().name, closedById: NA.myStaffId() }) });
      finishBooking(fresh);
      logJob(fresh, `${fresh.code} — closed as our own cost: work worth ${fmt.money(t.internalCost)} (${reason.toLowerCase()})`, 'success');
      ui.toast('Job closed');
      NA.refresh();
    };
    if (fresh.internal && fresh.internal.reason) return finish(fresh.internal.reason);
    ui.formModal({ title: 'Close the job', size: 'sm', submitLabel: 'Close job',
      fields: [{ name: 'reason', label: 'Why did we work on our own car?', type: 'select', options: INTERNAL_REASONS, required: true, span: 2 }],
      onSubmit: (f) => finish(f.reason) });
  }

  /** Cancel a job. Once work or parts are on it, the Service Manager decides (approval kind job_cancel). */
  function cancelJob(jc) {
    const cur = NA.get('jobCards', jc.id);
    if (!cur || !['open', 'in_progress'].includes(cur.status)) return;
    if (cancelPending(cur)) { ui.toast('Cancelling this job is already waiting for the Service Manager', 'info'); return; }
    const held = (cur.parts || []).filter((l) => !l.consumed);
    const started = cur.status === 'in_progress' || !!cur.startedAt || held.length > 0;
    const value = totals(cur).internalCost;
    const asks = started && gate('job_cancel', value) === 'ask';
    const partsHtml = held.length ? `<div class="glist-title mt-16">Parts on this job</div><div class="glist">${held.map((l) => `<label class="gl-row link"><span class="gl-main"><b>${esc(l.qty + ' × ' + partName(l))}</b><small>On if it is back on the shelf</small></span><input type="checkbox" name="back_${esc(lineId(l))}" checked/></label>`).join('')}</div>
      <p class="glist-foot">Parts already fitted that can’t go back are taken out of stock.</p>` : '';
    ui.modal({
      title: 'Cancel this job', size: 'sm',
      subtitle: asks ? 'Work or parts are already on this job, so the Service Manager decides.' : esc(cur.code + ' · ' + jobCustName(cur)),
      body: `<form class="modal-form" onsubmit="return false"><div class="form-grid">
          ${ui.field({ name: 'reason', label: 'Why?', type: 'select', options: JOB_CANCEL, required: true, span: 2 })}
          ${ui.field({ name: 'note', label: 'Note', span: 2, placeholder: 'Optional' })}</div>${partsHtml}</form>`,
      actions: [{ label: 'Keep the job' }, { label: asks ? 'Ask to cancel' : 'Cancel job', kind: 'danger', onClick: (el) => {
        const form = el.querySelector('form');
        if (!ui.validate(form)) return false;
        const v = ui.readForm(form);
        const fresh = NA.get('jobCards', cur.id);
        if (!fresh || !['open', 'in_progress'].includes(fresh.status)) { NA.refresh(); return true; }
        const lines = (fresh.parts || []).filter((l) => !l.consumed);
        const returned = lines.filter((l) => v['back_' + lineId(l)] !== false).map(lineId);
        // What was on the job when asked (line → units): only these can be written off when it is approved.
        const asked = {}; lines.forEach((l) => { asked[lineId(l)] = num(asked[lineId(l)]) + num(l.qty); });
        const reason = v.reason + (v.note ? ' — ' + v.note : '');
        const data = { reason: v.reason, note: v.note || '', returned, lines: asked, by: NA.me().name, byId: NA.myStaffId() };
        if (started) {
          const a = A.request({ type: 'job_cancel', ref: { c: 'jobCards', id: fresh.id, code: fresh.code }, amount: value, value, reason, data,
            title: `Cancel ${fresh.code} · ${jobCustName(fresh)}`, detail: `${reason}${lines.length ? ` · parts back on the shelf: ${returned.length} of ${lines.length}` : ''} · work worth ${fmt.money(value)}` });
          ui.toast(a.status === 'approved' ? 'Job cancelled' : 'Sent to the Service Manager', a.status === 'approved' ? 'success' : 'info');
        } else {
          doCancel(fresh, data, null);
          ui.toast('Job cancelled', 'info');
        }
        NA.refresh();
        return true;
      } }],
    });
  }
  /** Carry out a cancellation (straight away, or when the Service Manager approves it). */
  function doCancel(jc, data, approvedBy) {
    const fresh = NA.get('jobCards', jc.id);
    if (!fresh || !['open', 'in_progress'].includes(fresh.status)) return;
    data = data || {};
    const back = Array.isArray(data.returned) ? new Set(data.returned) : null;     // no list: everything goes back
    // Lines on the job when the cancel was asked (older requests did not record them: every line counts).
    const left = data.lines && typeof data.lines === 'object' && !Array.isArray(data.lines) ? Object.assign({}, data.lines) : null;
    const ids = new Set();
    const lines = [];
    (fresh.parts || []).forEach((l) => {
      if (l.consumed) { lines.push(l); return; }
      ids.add(l.partId);
      if (!back || back.has(lineId(l))) return;                                       // back on the shelf
      // Fitted: used up. Units added after the request never left the shelf, so they go back.
      const fitted = left ? Math.min(num(l.qty), num(left[lineId(l)])) : num(l.qty);
      if (left) left[lineId(l)] = num(left[lineId(l)]) - Math.max(0, fitted);
      if (fitted <= 0) return;
      const p = NA.get('parts', l.partId);
      if (p) NA.update('parts', p.id, { onHand: Math.max(0, num(p.onHand) - fitted) });
      lines.push(Object.assign({}, l, { qty: fitted, consumed: true, consumedAt: today(), onCancelledJob: true }));
    });
    NA.update('jobCards', fresh.id, { status: 'cancelled', parts: lines,
      cancel: { reason: data.reason || '', note: data.note || '', by: data.by || NA.me().name, byId: data.byId || NA.myStaffId(), at: new Date().toISOString(), approvedBy: approvedBy || null } });
    ids.forEach(syncReserved);
    finishBooking(fresh, { outcome: 'Job cancelled' });
    const used = lines.filter((l) => l.onCancelledJob).length;
    logJob(fresh, `${fresh.code} cancelled${data.reason ? ' — ' + data.reason : ''}${approvedBy ? ' (approved by ' + approvedBy + ')' : ''}${used ? ' · ' + used + ' fitted part line' + (used === 1 ? '' : 's') + ' taken out of stock' : ''}`, 'warn');
  }

  function invoiceLines(jc) {
    const lines = (jc.parts || []).map((l) => ({ desc: partName(l) + (partSku(l) ? ' (' + partSku(l) + ')' : ''), qty: num(l.qty), rate: num(l.unitPrice) }));
    if (num(jc.labourHours) > 0) lines.push({ desc: 'Labour ' + jc.labourHours + ' h' + (jc.type ? ' — ' + jc.type : ''), qty: num(jc.labourHours), rate: rateOf(jc) });
    return lines;
  }

  function linesTable(lines) {
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead><tbody>
      ${lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="right">${esc(l.qty)}</td><td class="right">${fmt.money(l.rate)}</td><td class="right strong">${fmt.money(l.qty * l.rate)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  /** Bill figures as a small table: t from totals(), or a bill's own stored figures. */
  function sumTable(t) {
    return `<table class="sv-sum">
      <tr><td>Parts</td><td>${fmt.money(t.parts)}</td></tr><tr><td>Labour</td><td>${fmt.money(t.labour)}</td></tr>
      ${t.discount ? `<tr class="minus"><td>Discount</td><td>− ${fmt.money(t.discount)}</td></tr>` : ''}
      <tr><td>VAT ${fmt.pct(t.vatRate, Math.round(t.vatRate * 1000) % 10 ? 1 : 0)}</td><td>${fmt.money(t.vat)}</td></tr>
      <tr class="tot"><td>Total</td><td>${fmt.money(t.total)}</td></tr></table>`;
  }

  /** What is wrong with a payment's method and reference ('' = fine). */
  function refProblem(method, ref) {
    const r = String(ref || '').trim();
    if (NEEDS_REF.includes(method) && !r) return `Enter the ${method === 'Cheque' || method === 'Pay Order' ? 'cheque' : 'transaction'} number`;
    if (!r || !NEEDS_REF.includes(method)) return '';
    const same = (m, x) => m === method && String(x || '').trim().toLowerCase() === r.toLowerCase();
    const dup = NA.find('payments', (p) => same(p.method, p.ref) && !B.paymentBounced(p));
    if (dup) return `${method} ${r} was already recorded on receipt ${dup.receiptNo || ''}`;
    // Receipts other people took at the desk: their payment records may not be visible here, the bills are.
    let seen = null;
    NA.db.invoices.some((inv) => (inv.receipts || []).some((x) => { if (same(x.method, x.ref) && !receiptBounced(x)) { seen = x; return true; } return false; }));
    return seen ? `${method} ${r} was already recorded on receipt ${seen.receiptNo || ''}` : '';
  }
  /** Money taken at the service desk: kept on the bill and as a numbered receipt Accounts confirms. */
  function recordServicePayment(inv, jc, { amount, method, ref, date }) {
    const status = B.initialPaymentStatus(method);
    const me = NA.me();
    const p = NA.insert('payments', {
      receiptNo: NA.nextCode('MR', 5), customerId: inv.customerId, invoiceId: inv.id, jobCardId: (jc && jc.id) || inv.refId,
      date: date || today(), amount, method, ref: String(ref || '').trim(), note: 'Service ' + ((jc && jc.code) || inv.no), kind: 'service', status,
      receivedBy: me.name, receivedById: NA.myStaffId(),
      verifiedBy: status === 'cleared' ? me.name : null, verifiedById: status === 'cleared' ? NA.myStaffId() : null,
      verifiedAt: status === 'cleared' ? new Date().toISOString() : null,
    });
    const cur = NA.get('invoices', inv.id) || inv;
    NA.update('invoices', cur.id, { paid: num(cur.paid) + amount, receipts: (cur.receipts || []).concat([{ date: p.date, amount, method, ref: p.ref, receiptNo: p.receiptNo, paymentId: p.id, by: me.name, byId: NA.myStaffId() }]) });
    NA.log(`Service payment ${fmt.money(amount)} (${method}) for ${cur.no} — receipt ${p.receiptNo}${status === 'pending' ? ' · waiting for Accounts to confirm' : ''}`,
      { rec: jc ? NA.get('jobCards', jc.id) : null, link: jc ? jobHref(jc) : '#/approvals?tab=money', kind: 'money' });
    // Paid again after a bounce: the call to collect it is done.
    if (invDue(NA.get('invoices', cur.id)) <= 0) {
      NA.where('followUps', (f) => f.type === 'Bounced payment' && f.invoiceId === cur.id && f.status !== 'done').forEach((f) => {
        NA.update('followUps', f.id, { status: 'done', doneAt: today(), doneBy: me.name, doneById: NA.myStaffId(), rating: null, outcome: `Paid again — receipt ${p.receiptNo}` });
      });
    }
    return p;
  }

  /** Accounts marks a service receipt as not received (or, rarely, takes that back). The bill records it — the receipt
      is marked bounced and inv.paid goes down — so everyone sees the money as owed again (a service user only
      receives their own payment records; Today and Reports read total − paid), and the desk gets a call to collect
      it again. Runs in the browser that changed the payment (Accounts' or the Managing Director's): both may write
      bills and follow-ups. Safe to run twice. */
  function syncBounce(p) {
    if (!p || !p.invoiceId || p.orderId) return;
    const inv = NA.get('invoices', p.invoiceId);
    if (!inv || inv.kind === 'vehicle') return;
    const receipts = inv.receipts || [];
    const i = receipts.findIndex((r) => (r.paymentId ? r.paymentId === p.id : !!p.receiptNo && r.receiptNo === p.receiptNo));
    if (i < 0) return;
    const r = receipts[i];
    const bounced = B.paymentBounced(p);
    if (!!r.bounced === bounced) return;
    const amt = num(r.amount);
    const me = NA.me();
    const next = receipts.slice();
    next[i] = bounced ? Object.assign({}, r, { bounced: true, bouncedAt: new Date().toISOString(), bouncedBy: me.name, bouncedById: NA.myStaffId() })
      : Object.assign({}, r, { bounced: false });
    NA.update('invoices', inv.id, { receipts: next, paid: Math.max(0, num(inv.paid) + (bounced ? -amt : amt)) });
    const fresh = NA.get('invoices', inv.id);
    const jc = inv.refId ? NA.get('jobCards', inv.refId) : null;
    NA.log(bounced ? `${inv.no} — receipt ${p.receiptNo || ''} (${fmt.money(amt)}, ${p.method || ''}${p.ref ? ' ' + p.ref : ''}) was not received; ${fmt.money(invDue(fresh))} is owed again`
      : `${inv.no} — receipt ${p.receiptNo || ''} (${fmt.money(amt)}) counts again`, { rec: fresh, link: jc ? jobHref(jc) : '#/finance', kind: bounced ? 'warn' : 'money' });
    if (bounced && invDue(fresh) > 0 && !NA.find('followUps', (f) => f.type === 'Bounced payment' && f.paymentId === p.id)) {
      NA.insert('followUps', { customerId: inv.customerId, vehicleId: inv.vehicleId || (jc && jc.vehicleId) || null, jobCardId: inv.refId || null,
        invoiceId: inv.id, paymentId: p.id, amount: amt, due: today(), type: 'Bounced payment', status: 'pending',
        assignedTo: p.receivedById || (jc && jc.advisorId) || null,
        notes: `${p.method || 'Payment'}${p.ref ? ' ' + p.ref : ''} on bill ${inv.no} was not received${p.verifyNote ? ' (' + p.verifyNote + ')' : ''}. Collect ${fmt.money(amt)} again.` });
    }
  }

  function invoiceJob(jc) {
    const cur0 = NA.get('jobCards', jc.id); if (!cur0) return;
    if (invoiceOf(cur0)) { ui.toast('This job already has a bill', 'info'); return; }
    const ns = nextStep(cur0);
    if (ns.act !== 'invoice' || ns.blockers.length) return refuse(ns);
    const warranty = cur0.billing === 'warranty';
    const t = totals(cur0);
    const lines = invoiceLines(cur0);
    const intro = `${linesTable(lines)}<div class="mt-16 sv-intro">${warranty
      ? `<div class="sv-big">${fmt.money(0)}</div><p class="muted small mt-4">Free for the customer under warranty. Work worth ${fmt.money(t.internalCost)} is claimed from BYD.</p>`
      : sumTable(t)}</div>`;
    const fields = warranty
      ? [{ name: 'claimNo', label: 'BYD claim number', span: 2, placeholder: 'If it is already filed', help: 'You can add it later under BYD claims.' }]
      : [
        { name: 'collect', label: 'Payment', type: 'radio-cards', span: 2, required: true, options: [
          { value: 'now', label: 'Customer pays now', icon: 'wallet' },
          { value: 'later', label: 'When they collect the car', icon: 'clock' },
        ].concat(canCredit() ? [{ value: 'credit', label: CREDIT_WORDS, icon: 'file-text', hint: 'Credit customer: they pay later' }] : []) },
        { name: 'amount', label: 'Amount received', type: 'money', min: 1 },
        { name: 'method', label: 'How', type: 'select', options: PAY_METHODS, placeholder: false },
        { name: 'ref', label: 'Cheque or transaction no.', span: 2, placeholder: 'Needed for cheque and bank payments' },
        { name: 'creditNote', label: 'Why may they pay later?', span: 2, placeholder: 'e.g. Fleet customer, pays monthly' },
      ];
    const el = ui.formModal({
      title: warranty ? 'Make the ৳ 0 warranty bill' : 'Make the bill',
      subtitle: esc(cur0.code + ' · ' + jobCustName(cur0)),
      size: 'lg', intro, fields,
      values: { collect: 'now', amount: t.total, method: 'Cash' },
      submitLabel: 'Make the bill',
      onSubmit: (f) => {
        const cur = NA.get('jobCards', jc.id);
        if (!cur || invoiceOf(cur)) { ui.toast('This job already has a bill', 'info'); NA.refresh(); return true; }
        const ns2 = nextStep(cur);
        if (ns2.act !== 'invoice' || ns2.blockers.length) { refuse(ns2); NA.refresh(); return true; }
        // Work it out again now: someone may have changed the job while this was open.
        const t2 = totals(cur);
        if (Math.abs(t2.total - t.total) > 0.5 || Math.abs(t2.internalCost - t.internalCost) > 0.5) { ui.toast('The job changed while this was open — check the bill again', 'error'); NA.refresh(); return true; }
        const lines2 = invoiceLines(cur);
        const now = today();
        if (warranty) {
          const claimNo = String(f.claimNo || '').trim();
          const inv = NA.insert('invoices', {
            no: NA.nextCode('INV', 5), kind: 'service', refId: cur.id, customerId: cur.customerId, vehicleId: cur.vehicleId, date: now,
            lines: lines2, subtotal: t2.subtotal, vat: 0, vatRate: t2.vatRate, total: 0, paid: 0, billing: 'warranty', costCentre: 'Workshop',
            internalCost: t2.internalCost, receipts: [], claimRef: claimNo, createdBy: NA.me().name, createdById: NA.myStaffId(),
          });
          NA.update('jobCards', cur.id, { status: 'invoiced', invoiceId: inv.id, invoicedAt: now,
            claim: Object.assign({ amount: t2.internalCost }, cur.claim, { status: claimNo ? 'filed' : 'not_filed', no: claimNo, filedAt: claimNo ? now : null, filedBy: claimNo ? NA.me().name : null, filedById: claimNo ? NA.myStaffId() : null }) });
          logJob(cur, `Warranty bill ${inv.no} for ${cur.code} — ৳ 0 to the customer, ${fmt.money(t2.internalCost)} to claim from BYD${claimNo ? ' (claim ' + claimNo + ')' : ''}`, 'money');
          ui.toast(`Bill ${inv.no} made`);
          NA.refresh();
          return true;
        }
        const collect = f.collect || 'now';
        const amount = collect === 'now' ? Math.round(num(f.amount)) : 0;
        if (collect === 'now') {
          if (amount <= 0) { ui.toast('Enter the amount received, or choose “When they collect the car”', 'error'); return false; }
          if (amount > t2.total + 0.5) { ui.toast(`That is more than the ${fmt.money(t2.total)} bill`, 'error'); return false; }
          const bad = refProblem(f.method, f.ref); if (bad) { ui.toast(bad, 'error'); return false; }
        }
        if (collect === 'credit' && !String(f.creditNote || '').trim()) { ui.toast('Say why they may pay later', 'error'); return false; }
        const inv = NA.insert('invoices', {
          no: NA.nextCode('INV', 5), kind: 'service', refId: cur.id, customerId: cur.customerId, vehicleId: cur.vehicleId, date: now,
          lines: lines2.concat(t2.discount ? [{ desc: 'Discount' + (cur.discount && cur.discount.reason ? ' — ' + cur.discount.reason : ''), qty: 1, rate: -t2.discount }] : []),
          gross: t2.subtotal, discount: t2.discount, discountReason: t2.discount && cur.discount ? cur.discount.reason || '' : '',
          subtotal: t2.net, vat: t2.vat, vatRate: t2.vatRate, total: t2.total, paid: 0, billing: cur.billing || 'paid', costCentre: 'Workshop',
          internalCost: t2.internalCost, receipts: [], claimRef: '',
          credit: collect === 'credit' ? Object.assign({ note: String(f.creditNote).trim() }, stamp()) : null,
          createdBy: NA.me().name, createdById: NA.myStaffId(),
        });
        NA.update('jobCards', cur.id, { status: 'invoiced', invoiceId: inv.id, invoicedAt: now });
        const p = amount > 0 ? recordServicePayment(inv, cur, { amount, method: f.method || 'Cash', ref: f.ref }) : null;
        logJob(cur, `Service bill ${inv.no} for ${cur.code} — ${fmt.money(inv.total)}${p ? ', ' + fmt.money(amount) + ' received (' + p.receiptNo + ')' : collect === 'credit' ? '; ' + NA.me().name + ' let the car go before it is paid' : ', to collect'}`, 'money');
        ui.toast(`Bill ${inv.no} made${p ? ' · receipt ' + p.receiptNo : ''}`);
        NA.refresh();
        return true;
      },
    });
    if (!warranty && el && el.querySelector) {
      const form = el.querySelector('form');
      const show = () => {
        const v = ui.readForm(form);
        ['amount', 'method', 'ref'].forEach((n) => { const x = form.querySelector(`[name=${n}]`); if (x && x.closest) x.closest('.field').classList.toggle('hidden', v.collect !== 'now'); });
        const cn = form.querySelector('[name=creditNote]'); if (cn && cn.closest) cn.closest('.field').classList.toggle('hidden', v.collect !== 'credit');
      };
      form.addEventListener('change', show); show();
    }
  }

  function collectPayment(inv) {
    const fresh = NA.get('invoices', inv.id) || inv;
    const due = invDue(fresh);
    if (due <= 0) { ui.toast('Nothing is due on this bill', 'info'); return; }
    if (!canWork() && !NA.can('payments.record')) { ui.toast('The service desk takes payments', 'error'); return; }
    ui.formModal({
      title: 'Customer paid', size: 'sm',
      subtitle: `${esc(fresh.no)} · ${fmt.money(due)} due from ${esc(NA.customerName(fresh.customerId))}`,
      fields: [
        { name: 'amount', label: 'Amount received', type: 'money', required: true, min: 1 },
        { name: 'date', label: 'Date', type: 'date', required: true, min: NA.addDays(today(), -3), max: today() },
        { name: 'method', label: 'How', type: 'select', options: PAY_METHODS, placeholder: false },
        { name: 'ref', label: 'Cheque or transaction no.', placeholder: 'Needed for cheque and bank payments' },
      ],
      values: { amount: due, date: today(), method: 'Cash' },
      submitLabel: 'Save receipt',
      onSubmit: (f) => {
        const cur = NA.get('invoices', fresh.id); if (!cur) return true;
        const now = invDue(cur);
        const amt = Math.round(num(f.amount));
        if (amt <= 0) { ui.toast('Enter the amount received', 'error'); return false; }
        if (amt > now + 0.5) { ui.toast(`That is more than the ${fmt.money(now)} due`, 'error'); return false; }
        if (f.date > today() || f.date < NA.addDays(today(), -3)) { ui.toast('Use a date within the last three days', 'error'); return false; }
        const bad = refProblem(f.method, f.ref); if (bad) { ui.toast(bad, 'error'); return false; }
        const jc = NA.get('jobCards', cur.refId);
        const p = recordServicePayment(cur, jc, { amount: amt, method: f.method || 'Cash', ref: f.ref, date: f.date });
        ui.toast(`Receipt ${p.receiptNo} saved${p.status === 'pending' ? ' — Accounts will confirm it' : ''}`);
        NA.refresh();
      },
    });
  }

  /** Let the car go before the bill is paid (Service Manager, Accounts or the Managing Director). Accounts does this
      from their own screens (NA.actions.allowServiceCredit): they may change bills but not job cards, so it is logged on the bill. */
  function allowCredit(inv) {
    if (!canCredit()) { ui.toast('Only the Service Manager or Accounts can let the car go before it is paid', 'error'); return; }
    const cur0 = NA.get('invoices', inv.id) || inv;
    if (cur0.kind === 'vehicle' || cur0.billing === 'warranty') return;
    if (invDue(cur0) <= 0) { ui.toast('Nothing is due on this bill', 'info'); return; }
    if (cur0.credit) { ui.toast(`${cur0.credit.by || 'Someone'} already let the car go before it is paid`, 'info'); return; }
    ui.formModal({
      title: CREDIT_WORDS, size: 'sm', submitLabel: 'Let it go',
      intro: `<p class="muted sv-intro">${esc(cur0.no)} · ${fmt.money(invDue(cur0))} due from ${esc(NA.customerName(cur0.customerId))}. The bill stays open until it is paid.</p>`,
      fields: [{ name: 'note', label: 'Why, and when will they pay?', type: 'textarea', rows: 2, required: true, span: 2 }],
      onSubmit: (f) => {
        const cur = NA.get('invoices', inv.id); if (!cur) return true;
        NA.update('invoices', cur.id, { credit: Object.assign({ note: f.note }, stamp()) });
        const jc = NA.get('jobCards', cur.refId);
        NA.log(`${cur.no} — ${NA.me().name} let the car go before it is paid: ${fmt.money(invDue(cur))} due (${f.note})`,
          { rec: jc && canWork() ? jc : NA.get('invoices', cur.id), link: jc && NA.canSee('service') ? jobHref(jc) : '#/finance', kind: 'warn' });
        ui.toast('Done — the car can be released');
        NA.refresh();
      },
    });
  }

  /** Hand the car back: a gate pass for the guard. Needs the bill paid, or the Service Manager's or Accounts' OK. */
  function releaseJob(jc) {
    const cur = NA.get('jobCards', jc.id); if (!cur) return;
    const ns = nextStep(cur);
    if (ns.act !== 'release') return refuse(ns);
    const c = NA.customer(cur.customerId) || {};
    ui.formModal({
      title: 'Hand the car back', size: 'sm', submitLabel: 'Release car',
      intro: `<p class="muted sv-intro">A gate pass number is given and printed for the guard.</p>`,
      fields: [
        { name: 'to', label: 'Handed to', required: true, span: 2, placeholder: 'Name of the person collecting the car' },
        { name: 'odometerOut', label: 'Odometer now (km)', type: 'number', min: num(cur.odometer), required: true },
        { name: 'note', label: 'Note', placeholder: 'Optional' },
      ],
      values: { to: c.name || '', odometerOut: cur.odometer },
      onSubmit: (f) => {
        const fresh = NA.get('jobCards', cur.id);
        const ns2 = fresh && nextStep(fresh);
        if (!ns2 || ns2.act !== 'release') { ui.toast('This car can’t be released now', 'error'); NA.refresh(); return true; }
        const out = Math.round(Number(f.odometerOut));
        if (f.odometerOut === '' || !(out >= num(fresh.odometer))) { ui.toast(`The odometer can’t be below ${fmt.num(fresh.odometer)} km`, 'error'); return false; }
        const gatePass = NA.nextCode('GP');
        const due = invDue(invoiceOf(fresh));
        NA.update('jobCards', fresh.id, { release: Object.assign({ gatePass, to: f.to, odometerOut: out, note: f.note || '', due }, stamp()), releasedAt: today() });
        const v = NA.vehicle(fresh.vehicleId);
        if (v && out > num(v.km)) NA.update('vehicles', v.id, { km: out });
        finishBooking(fresh);
        if (fresh.customerId && !NA.find('followUps', (x) => x.jobCardId === fresh.id && x.type === 'Satisfaction Call')) {
          NA.insert('followUps', { customerId: fresh.customerId, vehicleId: fresh.vehicleId, jobCardId: fresh.id, due: NA.addDays(today(), 2), type: 'Satisfaction Call', status: 'pending',
            assignedTo: fresh.advisorId || NA.myStaffId() || null, notes: 'After service ' + fresh.code + (fresh.billing === 'warranty' ? ' (warranty)' : '') });
        }
        logJob(fresh, `${fresh.code} — car handed back to ${f.to}, gate pass ${gatePass}${due > 0 ? ' · ' + fmt.money(due) + ' still due' : ''}`, 'success');
        ui.toast(`Released · gate pass ${gatePass}`);
        printGatePass(NA.get('jobCards', fresh.id));
        NA.refresh();
      },
    });
  }

  /* Discount: its own line, with a reason; above the limit the Service Manager (or MD) approves. */
  const canDiscount = (jc) => canWork() && jc.billing !== 'warranty' && !isInternal(jc) && ['open', 'in_progress', 'completed'].includes(jc.status);
  function setDiscount(jc) {
    if (!canDiscount(jc)) return;
    const free = num(NA.policy().serviceDiscountFree);
    ui.formModal({
      title: 'Discount on this bill', size: 'sm', submitLabel: 'Save discount',
      intro: `<p class="muted sv-intro">Up to ${fmt.money(free)} without asking. More than that needs ${esc(A.approverRoles('service_discount', free + 1).map(NA.roleLabel).join(' or '))}’s approval. VAT is worked out after the discount.</p>`,
      fields: [
        { name: 'amount', label: 'Discount', type: 'money', required: true, min: 1 },
        { name: 'reason', label: 'Reason', required: true, placeholder: 'e.g. Regular customer, goodwill for the delay' },
      ],
      values: { amount: jc.discount ? jc.discount.amount : '', reason: jc.discount ? jc.discount.reason : '' },
      onSubmit: (f) => {
        const fresh = NA.get('jobCards', jc.id); if (!fresh || !canDiscount(fresh)) return true;
        const amount = Math.round(num(f.amount));
        const max = totals(fresh).subtotal;
        if (amount <= 0) { ui.toast('Enter the discount', 'error'); return false; }
        if (amount > max) { ui.toast(`The discount can’t be more than the bill before VAT (${fmt.money(max)})`, 'error'); return false; }
        const old = discountOf(fresh);
        NA.update('jobCards', fresh.id, { discount: Object.assign({ amount, reason: f.reason }, stamp()) });
        logJob(fresh, `${fresh.code} — discount ${old ? fmt.money(old) + ' → ' : ''}${fmt.money(amount)} (${f.reason})`);
        const g = amount > free ? gate('service_discount', amount) : 'direct';
        if (g === 'self') A.request(discountRequest(NA.get('jobCards', fresh.id)));
        if (g === 'ask') setTimeout(() => askDiscount(NA.get('jobCards', fresh.id)), 250);
        else ui.toast('Discount saved');
        NA.refresh();
      },
    });
  }
  async function removeDiscount(jc) {
    const ok = await ui.confirm(`Take the ${fmt.money(discountOf(jc))} discount off ${esc(jc.code)}?`, { title: 'Remove discount', okLabel: 'Remove', danger: true });
    if (!ok) return;
    const fresh = NA.get('jobCards', jc.id); if (!fresh || !canDiscount(fresh)) return;
    const a = A.find('jobCards', fresh.id, 'service_discount');
    if (a && a.status === 'pending' && A.isMine(a)) A.withdraw(a);
    NA.update('jobCards', fresh.id, { discount: null });
    logJob(fresh, `${fresh.code} — discount taken off`);
    NA.refresh();
  }
  const askDiscount = (jc) => ui.requestApproval(Object.assign(discountRequest(jc), { placeholder: 'e.g. Regular customer, the repair took two extra days' })).then(() => NA.refresh());
  const askWarranty = (jc) => ui.requestApproval(Object.assign(warrantyRequest(jc), { placeholder: 'e.g. Known software fault, covered by BYD' })).then(() => NA.refresh());

  /** The warranty switch: on while the car is in the workshop; off also after the work is done, until the bill is made
      (the customer then pays, and agrees to the bill first). */
  const warrantyCanOn = (jc) => canWork() && ['open', 'in_progress'].includes(jc.status);
  const warrantyCanOff = (jc) => warrantyCanOn(jc) || (canWork() && jc.status === 'completed' && !isInternal(jc) && !invoiceOf(jc));
  /** Free under warranty: on (when the car is covered) or off (the customer pays). */
  function setWarranty(jc, on) {
    const fresh = NA.get('jobCards', jc.id); if (!fresh || !(on ? warrantyCanOn(fresh) : warrantyCanOff(fresh))) { NA.refresh(); return; }
    if (on) {
      const why = warrantyBlock(fresh);
      if (why) { ui.toast(why, 'error'); NA.refresh(); return; }
      NA.update('jobCards', fresh.id, { billing: 'warranty' });
      logJob(fresh, `${fresh.code} — free under warranty (the Service Manager approves it)`);
    } else {
      if (fresh.billing !== 'warranty') { NA.refresh(); return; }
      const a = A.find('jobCards', fresh.id, 'warranty_job');
      if (a && a.status === 'pending' && A.isMine(a)) A.withdraw(a);
      NA.update('jobCards', fresh.id, { billing: 'paid', batteryWork: false });
      const done = fresh.status === 'completed';
      logJob(fresh, `${fresh.code} — warranty switched off${done ? ' after the work was done' : ''}: the customer pays`);
      if (done) ui.toast('The customer pays. Get their OK on the bill first', 'info');
    }
    NA.refresh();
  }
  function setBatteryWork(jc, on) {
    const fresh = NA.get('jobCards', jc.id); if (!fresh || !canWork() || !['open', 'in_progress'].includes(fresh.status)) { NA.refresh(); return; }
    const patch = { batteryWork: !!on };
    if (!on && fresh.billing === 'warranty' && jobCover(fresh).scope === 'battery') patch.billing = 'paid';
    NA.update('jobCards', fresh.id, patch);
    logJob(fresh, `${fresh.code} — ${on ? 'marked as traction battery work' : 'not traction battery work'}${patch.billing ? '; the customer pays' : ''}`);
    NA.refresh();
  }

  /** The odometer is fixed at check-in. It may only go up, unless the Service Manager corrects it with a reason. */
  function correctOdometer(jc) {
    const lowerOk = canApprove();
    ui.formModal({
      title: 'Correct the odometer', size: 'sm', submitLabel: 'Save',
      intro: `<p class="muted sv-intro">Checked in at ${fmt.num(jc.odometerIn != null ? jc.odometerIn : jc.odometer)} km. ${lowerOk ? 'You may lower it if it was typed wrongly; say why.' : 'It can only go up. Ask the Service Manager to lower it.'}</p>`,
      fields: [
        { name: 'odometer', label: 'Odometer (km)', type: 'number', min: lowerOk ? 0 : num(jc.odometer), required: true },
        { name: 'reason', label: 'Reason', placeholder: lowerOk ? 'Needed when lowering it' : 'Optional' },
      ],
      values: { odometer: jc.odometer },
      onSubmit: (f) => {
        const fresh = NA.get('jobCards', jc.id); if (!fresh) return true;
        if (f.odometer === '' || !(Number(f.odometer) >= 0)) { ui.toast('Enter the odometer reading', 'error'); return false; }
        const val = Math.round(Number(f.odometer)); const old = num(fresh.odometer);
        if (val === old) return true;
        if (val < old && !lowerOk) { ui.toast('Only the Service Manager can lower the odometer', 'error'); return false; }
        if (val < old && !String(f.reason || '').trim()) { ui.toast('Say why the reading is lower', 'error'); return false; }
        NA.update('jobCards', fresh.id, { odometer: val });
        const v = NA.vehicle(fresh.vehicleId);
        if (v && val > num(v.km)) NA.update('vehicles', v.id, { km: val });
        if (v && val < old && num(v.km) === old) NA.update('vehicles', v.id, { km: val });   // the car's reading came from this typing mistake
        logJob(fresh, `${fresh.code} — odometer ${fmt.num(old)} → ${fmt.num(val)} km${f.reason ? ' (' + f.reason + ')' : ''}`, val < old ? 'warn' : 'info');
        NA.refresh();
      },
    });
  }

  /* ------------------------------------------------------------------------
     Job card detail page
     ------------------------------------------------------------------------ */
  function renderJob(root, id) {
    const jc = NA.get('jobCards', id);
    if (!jc) {
      root.innerHTML = ui.pageHead({ title: 'Job card', crumbs: [{ label: 'Service', href: '#/service?tab=jobs' }, { label: 'Job card' }] }) + ui.notFound('job card', '#/service?tab=jobs', 'Back to the workshop');
      return null;
    }
    const c = NA.customer(jc.customerId) || {};
    const v = NA.vehicle(jc.vehicleId);
    const wi = jobCover(jc);
    const inv = invoiceOf(jc);
    const t = totals(jc);
    const internal = isInternal(jc);
    const editable = workEditable(jc);                                                    // parts and labour (not while a cancel waits)
    const notesOpen = canWork() && !['invoiced', 'cancelled', 'closed'].includes(jc.status);   // complaint and work notes
    const booking = (jc.bookingId && NA.get('serviceBookings', jc.bookingId)) || NA.find('serviceBookings', (b) => b.jobCardId === jc.id);
    const steps = internal
      ? [{ label: 'Checked in', icon: 'clipboard' }, { label: 'Being repaired', icon: 'wrench' }, { label: 'Closed', icon: 'check' }]
      : [{ label: 'Checked in', icon: 'clipboard' }, { label: 'Being repaired', icon: 'wrench' }, { label: 'Ready', icon: 'receipt' }, { label: 'Handed back', icon: 'car' }];
    const idx = jc.status === 'cancelled' ? -1 : jc.status === 'open' ? 0 : jc.status === 'in_progress' ? 1
      : internal ? (jc.status === 'closed' ? steps.length : 2) : phase(jc) === 'released' ? steps.length : 2;

    const crumbs = [{ label: 'Service', href: '#/service?tab=jobs' }, { label: jc.code }];
    const actions = [
      ui.btn('Print job card', { icon: 'print', act: 'print-job' }),
      inv ? ui.btn('Print bill', { icon: 'receipt', act: 'print-inv' }) : '',
      jc.release ? ui.btn('Gate pass', { icon: 'gate', act: 'print-gate' }) : '',
      editable && jc.status === 'in_progress' ? ui.btn('Move back to waiting', { kind: 'plain', act: 'stop' }) : '',
      editable ? ui.btn('Cancel job', { kind: 'danger', icon: 'x', act: 'cancel' }) : '',
    ].join('');

    const techs = ui.opts.technicians();
    if (jc.technicianId && !techs.some((o) => o.value === jc.technicianId) && NA.get('staff', jc.technicianId)) techs.push({ value: jc.technicianId, label: NA.staffName(jc.technicianId) });
    const formHtml = `<div class="form-grid">
        ${ui.field({ name: 'complaint', label: 'What the customer says', type: 'textarea', span: 2, rows: 2 }, jc.complaint)}
        ${ui.field({ name: 'diagnosis', label: 'What we found and did', type: 'textarea', span: 2, rows: 3, placeholder: 'What the technician found and what was done' }, jc.diagnosis)}
        ${ui.field({ name: 'type', label: 'Service', type: 'select', options: NA.FLOW.serviceTypes, placeholder: false }, jc.type || 'General Repair')}
        ${ui.field({ name: 'technicianId', label: 'Technician', type: 'select', options: techs, placeholder: 'Choose…' }, jc.technicianId)}
        ${ui.field({ name: 'advisorId', label: 'Service advisor', type: 'select', options: advisorOptions(jc.advisorId), placeholder: '—' }, jc.advisorId)}
        <div class="field"><label>Odometer</label><div class="sv-odo"><span class="num">${fmt.num(jc.odometer)} km</span>${canWork() && !['cancelled', 'closed'].includes(jc.status) && !jc.release ? ui.btn('Correct', { kind: 'plain', size: 'sm', act: 'odo' }) : ''}</div></div>
      </div>`;

    const lines = jc.parts || [];
    const partsTable = lines.length ? ui.table([
      { label: 'Part', render: (l) => `<div class="cell-main">${esc(partName(l))}</div><div class="cell-sub mono">${esc(partSku(l))}</div>${jc.billing === 'warranty' && WEAR.test(partName(l)) ? '<div class="cell-sub tone-amber">Wear item, not normally covered</div>' : ''}` },
      { label: 'Qty', cls: 'right', render: (l) => esc(l.qty) },
      { label: 'Price', cls: 'right', render: (l) => fmt.money(l.unitPrice) },
      { label: 'Amount', cls: 'right', render: (l) => `<b>${fmt.money(num(l.qty) * num(l.unitPrice))}</b>` },
      { label: '', render: (l) => (l.consumed ? ui.badge('Used', 'green') : ui.badge('Held', 'amber')) },
      { label: '', cls: 'right', render: (l) => (editable && !l.consumed ? `<button class="icon-btn" data-act="rm-part" data-lid="${esc(lineId(l))}" title="Remove and put back on the shelf" aria-label="Remove">${NA.icon('trash', 16)}</button>` : '') },
    ], lines) : `<div class="card-body">${ui.empty(editable ? 'No parts yet. Parts you add are held for this car until the work is done.' : 'No parts on this job.', 'cog-parts')}</div>`;
    const rate = rateOf(jc);
    // The controls sit in one group that moves under the label on a narrow screen.
    const labourHtml = `<div class="sv-line">
        <div class="grow"><b>Labour</b><small>${fmt.money(rate)} an hour${rate !== defaultRate() ? ' · the usual rate is ' + fmt.money(defaultRate()) : ''}</small></div>
        <div class="sv-ctl">
        ${editable ? `<div class="sv-step"><button type="button" data-act="hours" data-d="-0.5" aria-label="Fewer hours">−</button><input type="number" min="0" step="0.5" data-labour="labourHours" value="${esc(num(jc.labourHours))}" aria-label="Hours"/><button type="button" data-act="hours" data-d="0.5" aria-label="More hours">+</button></div><span class="muted small">h</span>` : `<span class="num">${esc(num(jc.labourHours))} h</span>`}
        ${editable && canApprove() ? `<div class="input-prefix sv-rate"><span>৳</span><input type="number" min="0" step="50" data-labour="labourRate" value="${esc(rate)}" aria-label="Rate an hour"/></div>` : ''}
        <span class="sv-amt" data-labour-amt>${fmt.money(t.labour)}</span></div>
      </div>`;
    const discHtml = jc.billing === 'warranty' || internal ? '' : jc.discount
      ? `<div class="sv-line"><div class="grow"><b>Discount</b><small>${esc(jc.discount.reason || '')}${jc.discount.by ? ' · ' + esc(jc.discount.by) : ''}</small></div><div class="sv-ctl"><span class="sv-amt tone-green">− ${fmt.money(discountOf(jc))}</span>${canDiscount(jc) ? ui.btn('Change', { kind: 'plain', size: 'sm', act: 'discount' }) + ui.btn('Remove', { kind: 'plain', size: 'sm', act: 'rm-discount' }) : ''}</div></div>`
      : canDiscount(jc) ? `<div class="sv-line"><div class="grow muted">No discount</div>${ui.btn('Add a discount', { kind: 'plain', size: 'sm', act: 'discount' })}</div>` : '';

    root.innerHTML = ui.pageHead({
      title: `${jc.code} · ${jobCustName(jc)}`,
      subtitle: `${esc(vehLine(v))} · opened ${fmt.date(jc.openedAt)} &nbsp;${jobBadge(jc)} ${billBadge(jc)}`,
      crumbs, actions,
    }) + `
      <div class="card pad sv-steps">${ui.stepper(steps, idx)}<div class="mt-24" data-next>${nextHtml(jc)}</div></div>
      <div class="grid grid-main-side sv-job mt-32">
        <div class="sv-col">
          <section>
            <div class="glist-title">Complaint and work</div>
            <div class="card"><div class="card-body" data-jobform>${formHtml}</div></div>
            ${notesOpen ? `<p class="glist-foot">Changes save as you go. <span class="sv-saved" data-saved>${NA.icon('check', 13)}Saved</span></p>` : ''}
          </section>
          <section>
            <div class="row-between"><div class="glist-title">Parts and labour</div>${editable ? ui.btn('Add part', { kind: 'plain', size: 'sm', icon: 'plus', act: 'add-part' }) : ''}</div>
            <div class="card">${partsTable}${labourHtml}${discHtml}</div>
            ${canWork() && ['open', 'in_progress'].includes(jc.status) && cancelPending(jc) ? `<p class="glist-foot">${esc(workLockedWhy(jc))}.</p>` : ''}
          </section>
          ${warrantySection(jc, wi)}
        </div>
        <div class="sv-col">
          <section><div class="glist-title">${inv ? 'Bill ' + esc(inv.no) : internal ? 'Our cost' : 'Bill'}</div><div class="card"><div class="card-body" data-money>${moneyHtml(jc)}</div></div></section>
          <section><div class="glist-title">Customer and car</div>${carList(jc, c, v, booking)}</section>
          ${pastJobs(jc)}
          <section><div class="glist-title">History</div><div class="card"><div class="card-body">${historyHtml(jc)}</div></div></section>
        </div>
      </div>`;

    if (!notesOpen) root.querySelectorAll('[data-jobform] [name]').forEach((el) => { el.disabled = true; });
    else if (!editable) root.querySelectorAll('[data-jobform] [name=type], [data-jobform] [name=technicianId]').forEach((el) => { el.disabled = true; });

    let savedTimer = null;
    const saved = () => { const s = root.querySelector('[data-saved]'); if (!s || !s.classList) return; s.classList.add('on'); clearTimeout(savedTimer); savedTimer = setTimeout(() => s.classList.remove('on'), 1800); };
    /** Redraw only what a saved field can change, so the cursor stays where it is. */
    const paint = () => {
      const fresh = NA.get('jobCards', id); if (!fresh) return;
      const n = root.querySelector('[data-next]'); if (n) n.innerHTML = nextHtml(fresh);
      const m = root.querySelector('[data-money]'); if (m) m.innerHTML = moneyHtml(fresh);
      const la = root.querySelector('[data-labour-amt]'); if (la) la.textContent = fmt.money(totals(fresh).labour);
    };
    const unbind = [
      ui.delegate(root, 'change', '[data-jobform] [name]', (el) => {
        const fresh = NA.get('jobCards', id); if (!fresh || !canWork()) return;
        const k = el.name; const val = el.value;
        if (!['complaint', 'diagnosis', 'type', 'technicianId', 'advisorId'].includes(k)) return;
        if (String(fresh[k] == null ? '' : fresh[k]) === String(val)) return;
        const locked = ['type', 'technicianId'].includes(k) ? !workEditable(fresh) : ['invoiced', 'cancelled', 'closed'].includes(fresh.status);
        if (locked) { el.value = fresh[k] || ''; ui.toast('This can’t be changed any more', 'info'); return; }
        const patch = { [k]: val };
        if (k === 'type' && fresh.billing === 'warranty' && !WARRANTY_TYPES.includes(val)) patch.billing = 'paid';
        NA.update('jobCards', fresh.id, patch);
        const what = k === 'technicianId' ? (val ? 'technician ' + NA.staffName(val) : 'technician taken off')
          : k === 'advisorId' ? (val ? 'service advisor ' + NA.staffName(val) : 'service advisor taken off')
          : k === 'type' ? `service ${fresh.type || '—'} → ${val}${patch.billing ? '; not warranty work, so the customer pays' : ''}`
          : k === 'complaint' ? 'complaint changed' : 'work notes updated';
        logJob(fresh, `${fresh.code} — ${what}`);
        saved();
        if (patch.billing) { ui.toast(`${val} is not warranty work — the customer pays`, 'info'); NA.refresh(); } else paint();
      }),
      ui.delegate(root, 'change', '[data-labour]', (el) => {
        const fresh = NA.get('jobCards', id); if (!fresh) return;
        if (!workEditable(fresh)) { if (canWork()) ui.toast(workLockedWhy(fresh), 'info'); NA.refresh(); return; }
        const k = el.dataset.labour;
        if (k === 'labourRate' && !canApprove()) return;
        const old = k === 'labourRate' ? rateOf(fresh) : num(fresh.labourHours);
        if (el.value === '' || isNaN(Number(el.value))) { el.value = old; return; }
        const n = k === 'labourRate' ? Math.max(0, Math.round(Number(el.value))) : Math.max(0, Math.round(Number(el.value) * 100) / 100);
        if (n === old) return;
        NA.update('jobCards', fresh.id, { [k]: n });
        logJob(fresh, `${fresh.code} — ${k === 'labourRate' ? 'labour rate ' + fmt.money(old) + ' → ' + fmt.money(n) + ' an hour' : 'labour ' + old + ' h → ' + n + ' h'}`);
        saved();
        if (k === 'labourRate') NA.refresh(); else paint();
      }),
      ui.delegate(root, 'change', '[data-warranty]', (el) => setWarranty(jc, el.checked)),
      ui.delegate(root, 'change', '[data-battery]', (el) => setBatteryWork(jc, el.checked)),
      ui.delegate(root, 'click', '[data-act]', (el) => {
        const fresh = NA.get('jobCards', id); if (!fresh) return null;
        const freshInv = invoiceOf(fresh);
        switch (el.dataset.act) {
          case 'next': return doAct(el.dataset.next, fresh);
          case 'cancel': return cancelJob(fresh);
          case 'stop': return stopJob(fresh);
          case 'add-part': return addPartModal(fresh);
          case 'rm-part': return removePart(fresh, el.dataset.lid);
          case 'odo': return correctOdometer(fresh);
          case 'hours': {
            if (!workEditable(fresh)) { if (canWork()) ui.toast(workLockedWhy(fresh), 'info'); return NA.refresh(); }
            const old = num(fresh.labourHours);
            const n = Math.max(0, Math.round((old + num(el.dataset.d)) * 100) / 100);
            if (n === old) return null;
            NA.update('jobCards', fresh.id, { labourHours: n });
            logJob(fresh, `${fresh.code} — labour ${old} h → ${n} h`);
            const inp = root.querySelector('[data-labour="labourHours"]'); if (inp) inp.value = n;
            saved();
            return paint();
          }
          case 'discount': return setDiscount(fresh);
          case 'rm-discount': return removeDiscount(fresh);
          case 'collect': return freshInv && collectPayment(freshInv);
          case 'credit': return freshInv && allowCredit(freshInv);
          case 'print-job': return printJobCard(fresh);
          case 'print-inv': return freshInv && printInvoice(freshInv);
          case 'print-gate': return printGatePass(fresh);
          default: return null;
        }
      }),
    ];
    return () => unbind.forEach((u) => u());
  }

  /** The next step with what is in the way, and the approval banners. */
  function nextHtml(jc) {
    const ns = nextStep(jc);
    const can = canWork();
    const quiet = ns.blockers.length || ns.act === 'print-gate';
    const btn = ns.act && can ? ui.btn(ns.label, { kind: quiet ? 'ghost' : 'primary', act: 'next', attrs: `data-next="${esc(ns.act)}"${ns.blockers.length ? ' disabled' : ''}` }) : '';
    const extra = can ? ns.extra.map((x) => ui.btn(x.label, { kind: 'plain', act: 'next', attrs: `data-next="${esc(x.act)}"` })).join('') : '';
    const lines = ns.blockers.map((b) => `<li class="lock-note">${NA.icon('lock', 13)}${esc(b)}</li>`)
      .concat(ns.notes.map((b) => `<li class="lock-note note">${NA.icon('info', 13)}${esc(b)}</li>`))
      .concat(ns.act && !can && ns.act !== 'print-gate' ? [`<li class="lock-note">${NA.icon('lock', 13)}The service team does this step</li>`] : []);
    const banners = NA.ui.approvalBanners('jobCards', jc.id);
    return `<div class="next-step"><span class="ns-icon">${NA.icon(ns.icon, 20)}</span>
        <div class="ns-text"><b>${esc(ns.title)}</b>${ns.hint ? `<small>${esc(ns.hint)}</small>` : ''}</div>
        ${btn || extra ? `<div class="sv-ns-acts">${extra}${btn}</div>` : ''}</div>
      ${lines.length ? `<ul class="sv-blockers">${lines.join('')}</ul>` : ''}
      ${banners ? `<div class="mt-16">${banners}</div>` : ''}`;
  }

  /** The bill (or what the work is worth when nobody pays). */
  function moneyHtml(jc) {
    const inv = invoiceOf(jc);
    if (inv) return billHtml(jc, inv);
    const t = totals(jc);
    if (isInternal(jc)) return `<div class="sv-big">${fmt.money(t.internalCost)}</div><p class="muted small mt-4">Our own car, so no bill. Parts ${fmt.money(t.parts)} and labour ${fmt.money(t.labour)} are recorded as our cost.</p>`;
    if (jc.billing === 'warranty') return `<div class="sv-big">${fmt.money(0)}</div><p class="muted small mt-4">Free for the customer. Work worth ${fmt.money(t.internalCost)} (parts ${fmt.money(t.parts)}, labour ${fmt.money(t.labour)}) is claimed from BYD.</p>`;
    return sumTable(t) + (jc.estimate ? `<p class="small muted mt-12">The customer agreed to ${fmt.money(jc.estimate.total)} · ${esc(String(jc.estimate.how || '').toLowerCase())} · ${esc(fmt.ago(jc.estimate.at))}</p>` : '');
  }
  function billHtml(jc, inv) {
    if (inv.billing === 'warranty') {
      return `<div class="sv-big">${fmt.money(0)}</div><p class="muted small mt-4">Free under warranty · work worth ${fmt.money(num(inv.internalCost) || num(inv.subtotal))} · ${fmt.date(inv.date)}</p>
        <p class="small mt-12">${claimText(jc)}</p>`;
    }
    const due = invDue(inv);
    const rate = invVatRate(inv);
    const gross = inv.gross != null ? num(inv.gross) : num(inv.subtotal);
    const receipts = (inv.receipts || []).map((r) => {
      const p = receiptPayment(r);
      const st = receiptBounced(r) ? ui.badge('Not received', 'red') : p ? (B.paymentPending(p) ? ui.badge('Waiting for Accounts', 'amber') : ui.badge('Confirmed', 'green')) : '';
      return `<li><div class="grow">${fmt.money(r.amount)} · ${esc(r.method || '')}<small>${r.receiptNo ? esc(r.receiptNo) + ' · ' : ''}${fmt.date(r.date)}${r.ref ? ' · ' + esc(r.ref) : ''}${r.by ? ' · ' + esc(r.by) : ''}</small></div>${st}</li>`;
    }).join('');
    const later = due > 0 && canWork() && (isReleased(jc) || inv.credit);
    return `<table class="sv-sum">
        <tr><td>Parts and labour</td><td>${fmt.money(gross)}</td></tr>
        ${num(inv.discount) ? `<tr class="minus"><td>Discount</td><td>− ${fmt.money(inv.discount)}</td></tr>` : ''}
        <tr><td>VAT ${fmt.pct(rate, Math.round(rate * 1000) % 10 ? 1 : 0)}</td><td>${fmt.money(inv.vat)}</td></tr>
        <tr class="tot"><td>Total</td><td>${fmt.money(inv.total)}</td></tr>
        <tr><td>Received</td><td>${fmt.money(invReceived(inv))}</td></tr>
        ${due > 0 ? `<tr class="due"><td>Still due</td><td>${fmt.money(due)}</td></tr>` : ''}
      </table>
      ${receipts ? `<ul class="sv-receipts">${receipts}</ul>` : ''}
      ${inv.credit ? `<p class="small muted mt-12">${esc(CREDIT_WORDS)} · ${esc(inv.credit.by || '—')}${inv.credit.note ? ': ' + esc(inv.credit.note) : ''}</p>` : ''}
      ${later ? `<div class="mt-16">${ui.btn('Customer paid', { kind: 'ghost', size: 'sm', icon: 'wallet', act: 'collect' })}</div>` : ''}`;
  }

  /** Warranty: the cover, the "free under warranty" switch and the BYD claim. */
  function warrantySection(jc, wi) {
    if (isInternal(jc)) return '';
    const on = jc.billing === 'warranty';
    if (!on && !wi.w) return '';
    const can = warrantyCanOn(jc);
    const why = warrantyBlock(jc, wi);
    const wear = on ? wearLines(jc) : [];
    const rows = [warrantyCallout(wi)];
    if (wi.scope === 'battery' && (can || jc.batteryWork)) rows.push(`<label class="check"><input type="checkbox" data-battery ${jc.batteryWork ? 'checked' : ''} ${can ? '' : 'disabled'}/><span>This is traction battery work</span><small class="help">Only the battery is still under warranty.</small></label>`);
    if (on ? warrantyCanOff(jc) : can && !why) {
      const help = can ? 'The customer pays nothing. The Service Manager approves it, and we claim the cost from BYD.'
        : 'The work is done. Switch it off if the warranty does not apply: the customer then pays, and agrees to the bill first.';
      rows.push(`<label class="check"><input type="checkbox" data-warranty ${on ? 'checked' : ''}/><span>Free under warranty</span><small class="help">${esc(help)}</small></label>`);
    } else if (on) rows.push(`<p class="small">${NA.icon('shield', 14)} Free under warranty.</p>`);
    if (wear.length) rows.push(`<div class="callout callout-warn">${NA.icon('alert', 16)}<div>${esc(wear.map(partName).join(', '))} ${wear.length === 1 ? 'is a wear item' : 'are wear items'}, not normally covered by the warranty.</div></div>`);
    if (on && ['completed', 'invoiced'].includes(jc.status) && !invoiceOf(jc)) rows.push(`<p class="small muted">Make the ৳ 0 bill, then claim the cost from BYD.</p>`);
    return `<section><div class="glist-title">Warranty</div><div class="card"><div class="card-body stack">${rows.join('')}</div></div></section>`;
  }

  function carList(jc, c, v, booking) {
    const rows = [];
    if (jc.customerId) rows.push(`<div class="gl-row"><span class="gl-main"><b>${esc(c.name || '—')}</b><small>${esc(c.mobile || '')}</small></span><span class="row gap-4">${contactBtns(c.mobile, `Dear ${c.name || 'customer'}, an update on your car at Noor Autos (job ${jc.code}): `)}</span></div>`);
    else rows.push(`<div class="gl-row"><span class="gl-main"><b>Our own car</b><small>${esc((jc.internal && jc.internal.reason) || 'No customer to bill')}${jc.internal && jc.internal.buyerId ? ' · sold to ' + esc(NA.customerName(jc.internal.buyerId)) : ''}</small></span></div>`);
    if (v) {
      const inner = `<span class="gl-main"><b>${esc(NA.modelName(v.modelId))}${v.color ? ' · ' + esc(v.color) : ''}</b><small>${esc(v.regNo || 'No registration yet')} · <span class="mono">${esc(v.vin || '')}</span></small></span>`;
      rows.push(NA.canSee('inventory') ? `<a class="gl-row" href="#/inventory/${esc(v.id)}">${inner}${NA.icon('chevron-right', 16, 'gl-chev')}</a>` : `<div class="gl-row">${inner}</div>`);
    }
    rows.push(`<div class="gl-row"><span class="gl-label grow">Odometer at check-in</span><span class="gl-value">${fmt.num(jc.odometerIn != null ? jc.odometerIn : jc.odometer)} km</span></div>`);
    rows.push(`<div class="gl-row"><span class="gl-label grow">Booking</span><span class="gl-value">${booking ? esc(booking.code) + ' · ' + fmt.dateShort(booking.date) + ' ' + esc(booking.time || '') : 'Walked in'}</span></div>`);
    if (jc.release) rows.push(`<div class="gl-row"><span class="gl-label grow">Gate pass</span><span class="gl-value">${esc(jc.release.gatePass || '—')} · ${fmt.dateShort(jc.release.at)}</span></div>`);
    if (c.id && NA.canSee('customers')) rows.push(`<a class="gl-row" href="#/customers/${esc(c.id)}"><span class="gl-main"><b>Customer profile</b></span>${NA.icon('chevron-right', 16, 'gl-chev')}</a>`);
    return `<div class="glist">${rows.join('')}</div>`;
  }

  function pastJobs(jc) {
    const list = NA.where('jobCards', (j) => j.vehicleId === jc.vehicleId && j.id !== jc.id && j.status !== 'cancelled')
      .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || ''))).slice(0, 4);
    if (!list.length) return '';
    return `<section><div class="glist-title">Earlier visits</div><div class="glist">${list.map((j) => `<a class="gl-row" href="${jobHref(j)}"><span class="gl-main"><b>${esc(j.code)} · ${esc(j.type || 'Service')}</b><small>${fmt.date(j.openedAt)} · ${fmt.num(j.odometer)} km${j.complaint ? ' · ' + esc(String(j.complaint).slice(0, 60)) : ''}</small></span>${billBadge(j, true)}${NA.icon('chevron-right', 16, 'gl-chev')}</a>`).join('')}</div></section>`;
  }

  function historyHtml(jc) {
    const h = jc.history || [];
    if (!h.length) return ui.empty('Nothing yet', 'clock');
    const li = (x) => `<li>${esc(x.text)}<small>${fmt.datetime(x.at)}${x.by ? ' · ' + esc(x.by) : ''}</small></li>`;
    return `<ul class="timeline">${h.slice(0, 5).map(li).join('')}</ul>${h.length > 5 ? `<details class="sv-more"><summary>Show all ${h.length}</summary><ul class="timeline mt-12">${h.slice(5).map(li).join('')}</ul></details>` : ''}`;
  }

  /* Parts on a job card -------------------------------------------------- */
  function addPartModal(jc) {
    if (!workEditable(jc)) { ui.toast(cancelPending(jc) ? workLockedWhy(jc) : 'Parts can only be added while the car is in the workshop', 'error'); return; }
    const v = NA.vehicle(jc.vehicleId);
    const modelId = v && v.modelId;
    const fits = (p) => !(p.compatible || []).length || (!!modelId && p.compatible.includes(modelId));
    const freeOf = (p) => Math.max(0, num(p.onHand) - Math.max(num(p.reserved), heldOnJobs(p.id)));
    const parts = NA.db.parts.slice().sort((a, b) => (Number(fits(b)) - Number(fits(a))) || (Number(freeOf(b) > 0) - Number(freeOf(a) > 0)) || String(a.name).localeCompare(String(b.name)));
    const others = parts.filter((p) => !fits(p)).length;
    const row = (p) => {
      const free = freeOf(p); const ok = free > 0;
      return `<label class="${ok ? '' : 'off'} ${fits(p) ? '' : 'other'}" data-name="${esc((p.name + ' ' + p.sku).toLowerCase())}">
        <input type="radio" name="partId" value="${esc(p.id)}" ${ok ? '' : 'disabled'}/>
        <div class="grow"><div class="cell-main">${esc(p.name)}</div><div class="small muted"><span class="mono">${esc(p.sku)}</span> · ${fmt.money(p.price)}${fits(p) ? '' : ' · for another model'}</div></div>
        <span class="sv-free ${ok ? (B.partLow(p) ? 'tone-amber' : 'tone-green') : 'tone-red'}">${ok ? free + ' free' : 'None free'}</span>
        <span class="sv-step sv-qty"><button type="button" data-q="-1" aria-label="Fewer">−</button><input type="number" min="1" max="${free}" value="1" data-qty="${esc(p.id)}" aria-label="How many"/><button type="button" data-q="1" aria-label="More">+</button></span>
      </label>`;
    };
    ui.modal({
      title: 'Add a part', size: 'lg',
      subtitle: `${esc(jc.code)} · ${esc(vehLine(v))}. It is held for this car until the work is done.`,
      body: `<div class="toolbar"><input type="search" data-q placeholder="Search part name or number" class="grow"/>
          ${others ? `<label class="row small"><input type="checkbox" class="box" data-showall/> Show parts for other models (${others})</label>` : ''}</div>
        <div class="sv-pick">${parts.length ? parts.map(row).join('') : ui.empty('No parts in the list yet', 'cog-parts', NA.canSee('parts') ? ui.btn('Go to Parts', { href: '#/parts' }) : '')}</div>
        <p class="small muted mt-8">Only free stock can be added: on the shelf and not held for another job. Parts that run out show on the order list in Parts.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Add to job', kind: 'primary', onClick: (el) => {
        const sel = el.querySelector('input[name=partId]:checked');
        if (!sel) { ui.toast('Choose a part from the list', 'error'); return false; }
        const qi = el.querySelector(`[data-qty="${sel.value}"]`);
        const qty = Math.floor(num(qi && qi.value));
        if (qty < 1) { ui.toast('Add at least one', 'error'); return false; }
        const p = NA.get('parts', sel.value);
        const fresh = NA.get('jobCards', jc.id);
        if (!p || !fresh || !workEditable(fresh)) { ui.toast(fresh && cancelPending(fresh) ? workLockedWhy(fresh) : 'This job is no longer in the workshop', 'error'); NA.refresh(); return true; }
        const free = freeOf(p);
        if (free < qty) { ui.toast(`Only ${free} × ${p.name} free`, 'error'); return false; }
        const lines = (fresh.parts || []).map((l) => Object.assign({}, l));
        const price = num(p.price);
        // Same part at the same price: one line. A new price gets its own line, so nothing is repriced quietly.
        const ex = lines.find((l) => l.partId === p.id && !l.consumed && num(l.unitPrice) === price);
        if (ex) ex.qty = num(ex.qty) + qty;
        else lines.push({ lid: NA.uid(), partId: p.id, sku: p.sku, name: p.name, qty, unitPrice: price, consumed: false });
        NA.update('jobCards', fresh.id, { parts: lines });
        syncReserved(p.id);
        logJob(fresh, `${fresh.code} — ${qty} × ${p.name} held for this car`);
        ui.toast(`${qty} × ${p.name} added`);
        NA.refresh();
        return true;
      } }],
      onMount: (el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('a[href^="#/"]')) { ui.closeTop(); return; }
          const b = e.target.closest('button[data-q]'); if (!b) return;
          e.preventDefault();
          const inp = b.parentElement.querySelector('input'); if (!inp) return;
          inp.value = Math.max(1, Math.min(num(inp.max) || 1, Math.floor(num(inp.value)) + num(b.dataset.q)));
        });
        const q = el.querySelector('[data-q]:not(button)');
        const pick = el.querySelector('.sv-pick');
        const all = el.querySelector('[data-showall]');
        if (all) all.addEventListener('change', () => pick.classList.toggle('all', all.checked));
        if (q) q.addEventListener('input', () => {
          const s = q.value.trim().toLowerCase();
          if (s && all && !all.checked) { all.checked = true; pick.classList.add('all'); }
          el.querySelectorAll('.sv-pick label').forEach((l) => { l.classList.toggle('hidden', !!s && !l.dataset.name.includes(s)); });
        });
      },
    });
  }

  async function removePart(jc, lid) {
    const line = (jc.parts || []).find((l) => !l.consumed && lineId(l) === lid);
    if (!line) return;
    if (!workEditable(jc)) { ui.toast(workLockedWhy(jc), 'error'); return; }
    const ok = await ui.confirm(`Take ${esc(line.qty + ' × ' + partName(line))} off ${esc(jc.code)} and put it back on the shelf?`, { title: 'Remove part', okLabel: 'Remove', danger: true });
    if (!ok) return;
    const fresh = NA.get('jobCards', jc.id);
    if (!fresh || !workEditable(fresh)) { if (fresh && cancelPending(fresh)) ui.toast(workLockedWhy(fresh), 'error'); NA.refresh(); return; }
    NA.update('jobCards', fresh.id, { parts: (fresh.parts || []).filter((l) => l.consumed || lineId(l) !== lid) });
    syncReserved(line.partId);
    logJob(fresh, `${fresh.code} — ${line.qty} × ${partName(line)} put back on the shelf`);
    ui.toast('Part removed', 'info');
    NA.refresh();
  }

  /* ------------------------------------------------------------------------
     WARRANTIES tab
     ------------------------------------------------------------------------ */
  function tabWarranties(body) {
    const st = S.wr;
    const all = NA.db.warranties.slice();
    const match = (w, k) => k === 'all' || warrantyState(w) === k || (k === 'active' && warrantyState(w) === 'expiring');
    const cnt = (k) => all.filter((w) => match(w, k)).length;
    body.innerHTML = `
      <div class="toolbar">
        <input type="search" data-search="wr" placeholder="Search VIN, reg no, customer, warranty no" value="${esc(st.q)}"/>
        <div class="chips">${[['all', 'All'], ['active', 'Covered'], ['expiring', 'Ending in 90 days'], ['expired', 'Ended'], ['void', 'Cancelled']].filter(([k]) => k !== 'void' || cnt('void')).map(([k, l]) => `<button class="chip ${st.f === k ? 'active' : ''}" data-act="wr-f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
      </div>
      <div class="card" data-list></div>
      <p class="glist-foot">A warranty starts by itself when a car is handed over. Its end date, battery cover and km limit come from the model.</p>`;
    const listEl = body.querySelector('[data-list]');
    drawList = () => {
      const rows = all.filter((w) => match(w, st.f))
        .filter((w) => { const c = NA.customer(w.customerId) || {}; return hit(st.q, w.code, w.vin, w.regNo, c.name, c.mobile, NA.modelName(w.modelId)); })
        .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
      listEl.innerHTML = ui.table([
        { label: 'Car', render: (w) => { const v = NA.vehicle(w.vehicleId); return `<div class="cell-main">${esc(NA.modelName(w.modelId))}${w.regNo || (v && v.regNo) ? ' · ' + esc(w.regNo || v.regNo) : ''}</div><div class="cell-sub"><span class="mono">${esc(w.vin || '')}</span> · ${esc(w.code)}</div>`; } },
        { label: 'Customer', render: (w) => { const c = NA.customer(w.customerId) || {}; return `<div class="cell-main">${esc(c.name || '—')}</div><div class="cell-sub">${esc(c.mobile || '')}</div>`; } },
        { label: 'Cover', render: (w) => { const v = NA.vehicle(w.vehicleId); const km = num(v && v.km); return `<div>Until ${fmt.date(w.expiry)} or ${fmt.num(w.kmLimit)} km</div><div class="cell-sub">Now ${fmt.num(km)} km · battery until ${fmt.date(w.batteryExpiry)}</div>`; } },
        { label: 'Status', render: (w) => { const s = warrantyState(w); const dl = NA.daysBetween(today(), w.expiry); return s === 'active' ? ui.badge('Covered', 'green', 'shield') : s === 'expiring' ? ui.badge(`Ends in ${dl} day${dl === 1 ? '' : 's'}`, 'amber') : s === 'void' ? ui.badge('Cancelled', 'gray') : warrantyInfo(w.vehicleId).batteryOk ? ui.badge('Battery only', 'amber', 'battery') : ui.badge('Ended', 'red'); } },
        { label: '', cls: 'right', render: (w) => `<div class="sv-acts">${canWork() ? ui.btn('Book a service', { kind: 'plain', size: 'sm', act: 'wr-book', attrs: `data-id="${esc(w.id)}"` }) : ''}<button class="icon-btn" data-act="wr-cert" data-id="${esc(w.id)}" title="Print the warranty certificate" aria-label="Print certificate">${NA.icon('print', 16)}</button></div>` },
      ], rows, { empty: 'No warranties match. A warranty appears here as soon as a car is handed over.', emptyIcon: 'shield' });
    };
    drawList();
  }

  /* ------------------------------------------------------------------------
     BYD CLAIMS tab — free warranty work is claimed back from BYD
     ------------------------------------------------------------------------ */
  const CLAIM = {
    not_filed: { label: 'To claim', tone: 'amber', icon: 'clock' },
    filed: { label: 'Claimed', tone: 'blue', icon: 'file-text' },
    approved: { label: 'Approved by BYD', tone: 'blue', icon: 'check' },
    paid: { label: 'Paid by BYD', tone: 'green', icon: 'check' },
    rejected: { label: 'Rejected by BYD', tone: 'red', icon: 'x' },
  };
  /** Finished warranty jobs and their claim (jc.claim; older bills only had a claim reference on the invoice). */
  function claimRows() {
    return NA.db.jobCards.filter((j) => (j.billing === 'warranty' && ['completed', 'invoiced'].includes(j.status)) || (j.claim && j.claim.status)).map((j) => {
      const inv = invoiceOf(j);
      const c = j.claim || {};
      const value = num(inv && (inv.internalCost || inv.subtotal)) || totals(j).internalCost;
      const status = CLAIM[c.status] ? c.status : inv && inv.claimRef ? 'filed' : 'not_filed';
      const amount = num(c.amount) || value;
      const owed = status === 'filed' ? amount : status === 'approved' ? (num(c.approvedAmount) || amount) : 0;
      return { jc: j, inv, c, status, value, amount, owed, no: c.no || (inv && inv.claimRef) || '', date: (inv && inv.date) || j.completedAt || j.openedAt };
    });
  }
  function claimText(jc) {
    const r = claimRows().find((x) => x.jc.id === jc.id);
    if (!r) return '';
    const s = CLAIM[r.status];
    return `${ui.badge(s.label, s.tone, s.icon)} ${r.no ? 'Claim ' + esc(r.no) + ' · ' : ''}${fmt.money(r.status === 'paid' ? num(r.c.paidAmount) || r.amount : r.amount)}${r.status === 'not_filed' ? ` · <a class="btn-link" href="#/service?tab=claims">Claim it</a>` : ''}`;
  }

  function tabClaims(body) {
    const st = S.cl;
    const rows = claimRows();
    const cnt = (k) => rows.filter((r) => k === 'all' || r.status === k).length;
    const toFile = rows.filter((r) => r.status === 'not_filed');
    const owed = sum(rows, (r) => r.owed);
    const year = today().slice(0, 4);
    const paidYear = rows.filter((r) => r.status === 'paid' && String(r.c.paidAt || '').slice(0, 4) === year);
    body.innerHTML = `
      <div class="grid grid-3 sv-today">
        ${ui.kpi({ label: 'To claim from BYD', value: toFile.length, sub: toFile.length ? fmt.money(sum(toFile, (r) => r.value)) + ' of free work' : 'Everything is claimed' })}
        ${ui.kpi({ label: 'Owed by BYD', value: fmt.short(owed), sub: 'Claimed or approved, not paid yet' })}
        ${ui.kpi({ label: 'Paid by BYD this year', value: fmt.short(sum(paidYear, (r) => num(r.c.paidAmount) || r.amount)), sub: `${paidYear.length} claim${paidYear.length === 1 ? '' : 's'}` })}
      </div>
      <div class="toolbar">
        <input type="search" data-search="cl" placeholder="Search job, customer, claim no" value="${esc(st.q)}"/>
        <div class="chips">${[['not_filed', 'To claim'], ['filed', 'Claimed'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => `<button class="chip ${st.f === k ? 'active' : ''}" data-act="cl-f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
      </div>
      <div class="card" data-list></div>`;
    const listEl = body.querySelector('[data-list]');
    const next = { not_filed: 'Claim from BYD', filed: 'BYD answered', approved: 'BYD paid', rejected: 'Claim again' };
    drawList = () => {
      const list = rows.filter((r) => st.f === 'all' || r.status === st.f)
        .filter((r) => { const c = NA.customer(r.jc.customerId) || {}; return hit(st.q, r.jc.code, r.no, c.name, c.mobile, r.inv && r.inv.no); })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      listEl.innerHTML = ui.table([
        { label: 'Job', render: (r) => `<a class="cell-main" href="${jobHref(r.jc)}">${esc(r.jc.code)}</a><div class="cell-sub">${fmt.date(r.date)}${r.inv ? ' · ' + esc(r.inv.no) : ' · not billed yet'}</div>` },
        { label: 'Customer and car', render: (r) => `<div class="cell-main">${esc(jobCustName(r.jc))}</div><div class="cell-sub">${esc(vehLine(NA.vehicle(r.jc.vehicleId)))}</div>` },
        { label: 'Work', cls: 'right', render: (r) => fmt.money(r.value) },
        { label: 'Claim', render: (r) => { const s = CLAIM[r.status]; return `${ui.badge(s.label, s.tone, s.icon)}<div class="cell-sub">${r.no ? esc(r.no) : '—'}${r.status === 'approved' && num(r.c.approvedAmount) ? ' · approved ' + fmt.money(r.c.approvedAmount) : ''}${r.status === 'paid' ? ' · ' + fmt.money(num(r.c.paidAmount) || r.amount) + ' on ' + fmt.dateShort(r.c.paidAt) : ''}${r.status === 'rejected' && r.c.note ? ' · ' + esc(r.c.note) : ''}</div>`; } },
        { label: '', cls: 'right', render: (r) => (canWork() && next[r.status] && (r.inv || r.status !== 'not_filed') ? ui.btn(next[r.status], { kind: 'plain', size: 'sm', act: 'cl-act', attrs: `data-id="${esc(r.jc.id)}"` }) : '') },
      ], list, { empty: st.f === 'not_filed' ? 'Nothing to claim. Every free warranty job is claimed from BYD.' : 'No claims here', emptyIcon: 'file-text' });
    };
    drawList();
  }

  /** The next step of a claim: file it, record BYD's answer, record the payment. */
  function claimAct(id) {
    if (!canWork()) { ui.toast('The service team keeps the BYD claims', 'error'); return; }
    const r = claimRows().find((x) => x.jc.id === id); if (!r) return;
    const save = (patch, text) => {
      const fresh = NA.get('jobCards', id); if (!fresh) return;
      NA.update('jobCards', id, { claim: Object.assign({ amount: r.amount }, fresh.claim, patch, { updatedBy: NA.me().name, updatedById: NA.myStaffId(), updatedAt: new Date().toISOString() }) });
      logJob(fresh, `${fresh.code} — BYD claim: ${text}`, 'money');
      ui.toast('Claim updated');
      NA.refresh();
    };
    const head = `<p class="muted sv-intro">${esc(r.jc.code)} · ${esc(jobCustName(r.jc))} · work worth ${fmt.money(r.value)}</p>`;
    if (r.status === 'not_filed' || r.status === 'rejected') {
      return ui.formModal({ title: r.status === 'rejected' ? 'Claim again from BYD' : 'Claim from BYD', size: 'sm', submitLabel: 'Save claim', intro: head,
        fields: [
          { name: 'no', label: 'BYD claim number', required: true, span: 2 },
          { name: 'amount', label: 'Amount claimed', type: 'money', required: true },
          { name: 'date', label: 'Claimed on', type: 'date', required: true, max: today() },
        ],
        values: { no: r.status === 'rejected' ? '' : r.no, amount: r.amount, date: today() },
        onSubmit: (f) => save({ status: 'filed', no: String(f.no).trim(), amount: Math.round(num(f.amount)), filedAt: f.date, filedBy: NA.me().name, filedById: NA.myStaffId(), note: '' }, `claimed ${fmt.money(f.amount)} (${String(f.no).trim()})`) });
    }
    if (r.status === 'filed') {
      return ui.formModal({ title: 'BYD’s answer', size: 'sm', submitLabel: 'Save', intro: head,
        fields: [
          { name: 'decision', label: 'BYD', type: 'select', options: [{ value: 'approved', label: 'Approved the claim' }, { value: 'rejected', label: 'Rejected the claim' }], required: true, placeholder: false, span: 2 },
          { name: 'approvedAmount', label: 'Amount approved', type: 'money' },
          { name: 'note', label: 'Note', placeholder: 'e.g. reason given by BYD' },
        ],
        values: { decision: 'approved', approvedAmount: r.amount },
        onSubmit: (f) => {
          if (f.decision === 'rejected' && !String(f.note || '').trim()) { ui.toast('Write the reason BYD gave', 'error'); return false; }
          const who = { decidedAt: today(), decidedBy: NA.me().name, decidedById: NA.myStaffId() };   // who recorded BYD's answer
          return save(f.decision === 'approved'
            ? Object.assign({ status: 'approved', approvedAmount: Math.round(num(f.approvedAmount) || r.amount), note: f.note || '' }, who)
            : Object.assign({ status: 'rejected', note: f.note }, who), f.decision === 'approved' ? `approved ${fmt.money(num(f.approvedAmount) || r.amount)}` : `rejected (${f.note})`);
        } });
    }
    if (r.status === 'approved') {
      return ui.formModal({ title: 'BYD paid', size: 'sm', submitLabel: 'Save', intro: head,
        fields: [
          { name: 'paidAmount', label: 'Amount received', type: 'money', required: true },
          { name: 'paidAt', label: 'Received on', type: 'date', required: true, max: today() },
          { name: 'ref', label: 'Payment or credit note no.', span: 2 },
        ],
        values: { paidAmount: num(r.c.approvedAmount) || r.amount, paidAt: today() },
        // receivedBy: who recorded that BYD's money arrived (the same word as on payments).
        onSubmit: (f) => save({ status: 'paid', paidAmount: Math.round(num(f.paidAmount)), paidAt: f.paidAt, ref: f.ref || '', receivedBy: NA.me().name, receivedById: NA.myStaffId() }, `paid ${fmt.money(f.paidAmount)}${f.ref ? ' (' + f.ref + ')' : ''}`) });
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     FOLLOW-UPS tab
     ------------------------------------------------------------------------ */
  function suggestions() {
    const T = today(); const out = [];
    const pending = serviceFollowUps().filter((f) => f.status !== 'done');
    const hasPending = (vehicleId, type) => pending.some((f) => f.vehicleId === vehicleId && f.type === type);
    NA.db.warranties.forEach((w) => {
      const dl = NA.daysBetween(T, w.expiry);
      if (dl >= 0 && dl <= 120 && !hasPending(w.vehicleId, 'Warranty Renewal')) {
        out.push({ type: 'Warranty Renewal', customerId: w.customerId, vehicleId: w.vehicleId, due: NA.addDays(T, Math.max(1, Math.min(14, dl - 30))), text: `Warranty ${w.code} ends in ${dl} days — offer extended warranty`, icon: 'shield' });
      }
    });
    NA.db.vehicles.filter((v) => v.status === 'delivered' && v.customerId).forEach((v) => {
      const last = NA.where('jobCards', (j) => j.vehicleId === v.id && j.status !== 'cancelled').map((j) => j.openedAt).sort().pop() || v.deliveredAt;
      if (last && NA.daysBetween(last, T) >= 150 && !hasPending(v.id, 'Service Reminder')) {
        out.push({ type: 'Service Reminder', customerId: v.customerId, vehicleId: v.id, due: NA.addDays(T, 1), text: `${NA.modelName(v.modelId)} not serviced for ${NA.daysBetween(last, T)} days`, icon: 'wrench' });
      }
    });
    NA.db.orders.filter((o) => o.stage === 'delivered' && o.deliveredAt && o.brta && o.brta.policyNo).forEach((o) => {
      let renew = NA.addMonths(o.deliveredAt, 12);
      while (renew < T) renew = NA.addMonths(renew, 12);
      const dl = NA.daysBetween(T, renew);
      if (dl <= 45 && !hasPending(o.vehicleId, 'Insurance Renewal')) {
        out.push({ type: 'Insurance Renewal', customerId: o.customerId, vehicleId: o.vehicleId, due: NA.addDays(renew, -14) < T ? T : NA.addDays(renew, -14), text: `Insurance (${o.brta.insurer || 'policy'} ${o.brta.policyNo}) renews ${fmt.date(renew)}`, icon: 'file-text' });
      }
    });
    return out.slice(0, 12);
  }

  /** A WhatsApp message for a follow-up, in plain words. */
  function followUpMessage(f, c, v, jc) {
    const name = c.name || 'customer';
    const car = v ? ' for your ' + NA.modelName(v.modelId) + (v.regNo ? ' (' + v.regNo + ')' : '') : '';
    if (f.type === 'Satisfaction Call') return `Dear ${name}, thank you for choosing Noor Autos (BYD). How was your experience${jc ? ' with service ' + jc.code : ''}? Please reply with a rating from 1 to 5.`;
    if (f.type === 'Complaint') return `Dear ${name}, this is Noor Autos (BYD). We are sorry your last visit did not go well and we would like to put it right. When is a good time to call you?`;
    if (f.type === 'Bounced payment') {
      const inv = f.invoiceId ? NA.get('invoices', f.invoiceId) : null;
      return `Dear ${name}, this is Noor Autos (BYD). Your payment of ${fmt.money(f.amount)}${inv ? ' for service bill ' + inv.no : ''} did not reach us. Please let us know when you can pay it again.`;
    }
    const what = { 'Service Reminder': 'your next service is', 'Warranty Renewal': 'your warranty renewal is', 'Insurance Renewal': 'your insurance renewal is', 'Registration Renewal': 'your registration renewal is' }[f.type] || 'your appointment is';
    return `Dear ${name}, a friendly reminder from Noor Autos (BYD): ${what} due${car}. Reply and we will book a time for you.`;
  }

  function tabFollowUps(body) {
    const st = S.fu; const T = today();
    const all = serviceFollowUps();
    const bucket = (f) => f.status === 'done' ? 'done' : f.due <= T ? 'due' : 'upcoming';
    const cnt = (k) => all.filter((f) => (k === 'all' || bucket(f) === k) && (!st.type || f.type === st.type)).length;
    const done = all.filter((f) => f.status === 'done' && f.rating);
    const avg = done.length ? done.reduce((s, f) => s + Number(f.rating), 0) / done.length : 0;
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: done.filter((f) => Number(f.rating) === n).length }));
    const sugg = suggestions();
    body.innerHTML = `
      <div class="toolbar">
        <input type="search" data-search="fu" placeholder="Search customer, phone, notes" value="${esc(st.q)}"/>
        <div class="chips">${[['due', 'Due now'], ['upcoming', 'Coming up'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="chip ${st.f === k ? 'active' : ''}" data-act="fu-f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
        <select data-filter="fu.type" aria-label="Type"><option value="">All types</option>${FU_TYPES.map((t) => `<option ${st.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <span class="spacer"></span>
        ${canWork() ? ui.btn('Add reminder', { kind: 'primary', icon: 'plus', act: 'fu-new' }) : ''}
      </div>
      <div class="grid grid-main-side">
        <div class="card"><div class="card-body" data-list></div></div>
        <div class="sv-col">
          <section><div class="glist-title">How happy are customers?</div>
            <div class="card"><div class="card-body">
              <div class="row gap-12"><div class="sv-big">${avg ? avg.toFixed(1) : '—'}</div><div>${stars(Math.round(avg), 18)}<div class="small muted">${done.length} rating${done.length === 1 ? '' : 's'}</div></div></div>
              <div class="sv-dist">${dist.map((d) => `<div class="row small"><span class="n">${d.n} ★</span><div class="grow">${ui.progress(done.length ? d.c / done.length : 0, d.n >= 4 ? 'green' : d.n === 3 ? 'amber' : 'red')}</div><span class="c muted">${d.c}</span></div>`).join('')}</div>
            </div></div>
          </section>
          <section><div class="row-between"><div class="glist-title">Suggested reminders</div>${sugg.length && canWork() ? ui.btn('Add all', { kind: 'plain', size: 'sm', act: 'fu-suggest-all' }) : ''}</div>
            <div class="card"><div class="card-body">${sugg.length ? sugg.map((s, i) => `<div class="alert-row sv-fu-row"><span class="ar-icon idea">${NA.icon(s.icon, 16)}</span>
              <div class="grow"><div class="strong small">${esc(NA.customerName(s.customerId))}</div><div class="small muted">${esc(s.text)}</div></div>
              ${canWork() ? `<button class="btn btn-sm btn-ghost" data-act="fu-suggest" data-i="${i}" data-type="${esc(s.type)}" data-c="${esc(s.customerId)}" data-veh="${esc(s.vehicleId || '')}" data-due="${esc(s.due)}" data-note="${esc(s.text)}">Add</button>` : ''}</div>`).join('')
              : ui.empty('Nothing coming up. Warranty, insurance and service reminders are suggested here.', 'check-circle')}</div></div>
          </section>
        </div>
      </div>
      <p class="glist-foot">Calls after a car is sold, and chasing car payments, are on the sales team’s screens.</p>`;
    const listEl = body.querySelector('[data-list]');
    drawList = () => {
      const rows = all.filter((f) => (st.f === 'all' || bucket(f) === st.f) && (!st.type || f.type === st.type))
        .filter((f) => { const c = NA.customer(f.customerId) || {}; return hit(st.q, c.name, c.mobile, f.notes, f.type); })
        .sort((a, b) => st.f === 'done' ? String(b.doneAt || b.due).localeCompare(String(a.doneAt || a.due)) : String(a.due).localeCompare(String(b.due)));
      if (!rows.length) {
        listEl.innerHTML = ui.empty(st.f === 'due' ? 'Nothing due. Every customer has been looked after.' : 'No follow-ups here', 'bell', st.f === 'due' || !canWork() ? '' : ui.btn('Add reminder', { act: 'fu-new', icon: 'plus' }));
        return;
      }
      listEl.innerHTML = rows.map((f) => {
        const c = NA.customer(f.customerId) || {}; const v = NA.vehicle(f.vehicleId);
        const b = bucket(f); const late = f.status !== 'done' ? NA.daysBetween(f.due, T) : 0;
        const cls = f.status === 'done' ? 'done' : late > 0 ? 'over' : b === 'due' ? 'due' : '';
        const when = f.status === 'done' ? `Done ${fmt.date(f.doneAt || f.due)}${f.doneBy ? ' by ' + esc(f.doneBy) : ''}` : late > 0 ? `<b class="tone-red">${late} day${late > 1 ? 's' : ''} overdue</b>` : late === 0 ? '<b class="tone-amber">Due today</b>' : `Due ${fmt.date(f.due)}`;
        const jc = f.jobCardId ? NA.get('jobCards', f.jobCardId) : null;
        const who = f.assignedTo ? NA.staffName(f.assignedTo) : '';
        return `<div class="alert-row sv-fu-row ${cls}">
          <span class="ar-icon">${NA.icon(FU_ICON[f.type] || 'bell', 16)}</span>
          <div class="grow">
            <div class="row wrap gap-4"><b>${esc(f.type)}</b><span class="muted">·</span><span>${esc(c.name || '—')}</span>${jc ? `<a class="badge badge-gray" href="${jobHref(jc)}">${esc(jc.code)}</a>` : ''}</div>
            <div class="small muted">${v ? esc(vehLine(v)) + ' · ' : ''}${when}${who && who !== '—' && f.status !== 'done' ? ' · ' + esc(who) : ''}${f.notes ? ' · ' + esc(f.notes) : ''}</div>
            ${f.status === 'done' ? `<div class="small mt-8">${f.rating ? stars(f.rating) : ''} ${esc(f.outcome || '')}</div>` : ''}
          </div>
          <div class="sv-acts">${followUpActs(f, c, v, jc)}</div>
        </div>`;
      }).join('');
    };
    drawList();
  }

  /** Call, message and Done for whoever may finish this follow-up; a short note for everyone else. */
  function followUpActs(f, c, v, jc) {
    if (!canWork()) return '';
    const who = followUpCloser(f);
    if (f.status === 'done') return who ? '' : ui.btn('Reopen', { size: 'sm', kind: 'plain', act: 'fu-reopen', attrs: `data-id="${esc(f.id)}"` });
    return contactBtns(c.mobile, followUpMessage(f, c, v, jc))
      + (who ? `<span class="lock-note">${NA.icon('lock', 13)}${esc(capital(who))} closes this</span>`
        : ui.btn('Done', { size: 'sm', kind: 'ghost', icon: 'check', act: 'fu-done', attrs: `data-id="${esc(f.id)}"` }));
  }

  function createSuggested(el) {
    const d = el.dataset;
    const f = NA.insert('followUps', { customerId: d.c, vehicleId: d.veh || null, due: d.due, type: d.type, status: 'pending', notes: d.note, assignedTo: NA.myStaffId() || null });
    NA.log(`${d.type} reminder for ${NA.customerName(d.c)} on ${fmt.date(d.due)}`, { rec: f, link: '#/service?tab=followups' });
    ui.toast(`Reminder added for ${fmt.dateShort(d.due)}`);
    NA.refresh();
  }
  function addAllSuggested() {
    const list = suggestions();
    list.forEach((s) => NA.insert('followUps', { customerId: s.customerId, vehicleId: s.vehicleId || null, due: s.due, type: s.type, status: 'pending', notes: s.text, assignedTo: NA.myStaffId() || null }));
    if (list.length) NA.log(`${list.length} reminder${list.length === 1 ? '' : 's'} added from the suggestions`, { link: '#/service?tab=followups' });
    ui.toast(`${list.length} reminder${list.length === 1 ? '' : 's'} added`);
    NA.refresh();
  }
  /** Back to the to-do list. The earlier answer is kept on the record, not thrown away. */
  function reopenFollowUp(id) {
    const f = NA.get('followUps', id); if (!f || f.status !== 'done' || !canWork()) return;
    const who = followUpCloser(f);
    if (who) { ui.toast(capital(who) + ' looks after this one', 'info'); return; }
    const previous = (f.previous || []).concat([{ rating: f.rating || null, outcome: f.outcome || '', doneAt: f.doneAt || null, doneBy: f.doneBy || '' }]);
    NA.update('followUps', id, { status: 'pending', doneAt: null, rating: null, outcome: '', previous });
    NA.log(`${f.type} reopened — ${NA.customerName(f.customerId)}${f.rating ? ' (was rated ' + f.rating + '/5)' : ''}`, { rec: NA.get('followUps', id), link: '#/service?tab=followups' });
    ui.toast('Reopened', 'info');
    NA.refresh();
  }

  function newFollowUp(prefill) {
    prefill = prefill || {};
    if (!canWork()) { ui.toast('The service desk adds reminders', 'error'); return; }
    const cid = prefill.customerId || '';
    const el = ui.formModal({
      title: 'Add a reminder',
      subtitle: 'A call or a message to make on a day.',
      size: 'md',
      submitLabel: 'Add reminder',
      fields: [
        { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions(), required: true, span: 2 },
        { name: 'vehicleId', label: 'Car', type: 'select', options: vehicleOptions(cid), span: 2, placeholder: 'Any' },
        { name: 'type', label: 'What for', type: 'select', options: NA.FLOW.followUpTypes, required: true, placeholder: false },
        { name: 'due', label: 'On', type: 'date', required: true },
        { name: 'notes', label: 'Note', span: 2, placeholder: 'What to talk about' },
      ],
      values: { customerId: cid, vehicleId: prefill.vehicleId || '', type: prefill.type || 'Service Reminder', due: prefill.due || NA.addDays(today(), 1), notes: prefill.notes || '' },
      onSubmit: (f) => {
        const r = NA.insert('followUps', { customerId: f.customerId, vehicleId: f.vehicleId || null, due: f.due, type: f.type, status: 'pending', notes: f.notes, assignedTo: NA.myStaffId() || null });
        NA.log(`Reminder “${f.type}” for ${NA.customerName(f.customerId)} on ${fmt.date(f.due)}`, { rec: r, link: '#/service?tab=followups' });
        ui.toast('Reminder added');
        NA.refresh();
      },
    });
    if (el && el.querySelector) wireCustomerVehicle(el.querySelector('form'), null);
  }

  /** The customer's consultant: set on the record, or (older records) the salesperson who owns it (as on Customers). */
  const consultantOfCustomer = (c) => {
    if (!c) return '';
    if (c.consultantId) return c.consultantId;
    const s = c.ownerId && NA.get('staff', c.ownerId);
    return s && ['Sales Consultant', 'Sales Manager'].includes(s.role) ? s.id : '';
  };
  /** Who the next call belongs to: the sales team's go to the customer's consultant (their Today screen) — a
      consultant's own are theirs, as the office server lets them add only their own; anyone else's (the service desk,
      Accounts) stay with the person who planned them, on the workshop's list. */
  const plannedBy = (c, consultantId) => (NA.isRole('sales') ? { consultantId: NA.myStaffId() || null }
    : NA.can('leads.create') ? { consultantId: consultantId || consultantOfCustomer(c) || null }
      : { consultantId: null, assignedTo: NA.myStaffId() || null });
  /** Who calls an unhappy customer back after a sales call: the Sales Manager (the Managing Director when there is none). */
  const callBackBy = () => (NA.staffBy(['Sales Manager'])[0] || NA.staffBy(['Managing Director'])[0] || {}).id || null;

  /** The one form for finishing a follow-up — this screen, Customers and Today all use it (NA.actions.completeFollowUp).
      Saves { status: 'done', doneAt, doneBy, doneById, rating, outcome }. A rating of 2 or less opens a call for a
      manager: on the workshop's calls a Complaint the Service Manager closes (the Service screen and Today list it for
      the service desk), on the sales team's calls a 'Manager call-back' for the Sales Manager. Call-backs and
      complaints are closed by their manager, with what was done, and are not rated again. */
  function completeFollowUp(id) {
    const f = NA.get('followUps', id);
    if (!f) { ui.toast('This follow-up is no longer here', 'error'); return; }
    if (f.status === 'done') { ui.toast('Someone has already closed this follow-up', 'info'); NA.refresh(); return; }
    const who = followUpCloser(f);
    if (who) { ui.toast(capital(who) + ' closes this one', 'info'); return; }
    const c = NA.customer(f.customerId) || null;
    const name = c ? c.name : NA.customerName(f.customerId);
    const WORDS = ['', 'Very unhappy', 'Unhappy', 'Okay', 'Happy', 'Very happy'];
    const complaint = f.type === 'Complaint';
    const escal = complaint || managerCall(f);
    ui.formModal({
      title: complaint ? 'Close the complaint' : escal ? 'Close the call-back' : 'Mark as done',
      subtitle: esc(f.type) + ' · ' + esc(name), submitLabel: escal ? 'Close it' : 'Mark done',
      fields: [
        escal ? null : { name: 'rating', label: f.type === 'Satisfaction Call' ? 'How happy is the customer?' : 'How happy is the customer? (optional)', type: 'radio-cards', span: 2, required: f.type === 'Satisfaction Call',
          options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n + (n === 1 ? ' star' : ' stars'), hint: WORDS[n] })) },
        { name: 'outcome', label: complaint ? 'What did we do about it?' : escal ? 'What did the customer say, and what was done?' : 'What did the customer say?', type: 'textarea', span: 2, rows: 3, required: escal,
          placeholder: escal ? 'e.g. Called back, the noise was a loose trim — fixed free on Saturday' : 'e.g. Happy with the car, asked about a home charger' },
        { name: 'nextType', label: 'Next follow-up (optional)', type: 'select', options: NA.FLOW.followUpTypes, placeholder: 'None' },
        { name: 'nextDue', label: 'On', type: 'date', min: today() },
      ].filter(Boolean),
      values: { outcome: f.outcome || '', nextDue: NA.addMonths(today(), 3) },
      onSubmit: (v) => {
        const outcome = String(v.outcome || '').trim();
        if (escal && !outcome) { ui.toast(complaint ? 'Write what was done about the complaint' : 'Write what the customer said and what was done', 'error'); return false; }
        if (!escal && f.type === 'Satisfaction Call' && !v.rating) { ui.toast('Choose how happy the customer is', 'error'); return false; }
        if (v.nextType && v.nextDue && v.nextDue < today()) { ui.toast('Pick today or a later day for the next follow-up', 'error'); return false; }
        const now = NA.get('followUps', f.id);
        if (!now || now.status === 'done') { ui.toast('Someone has already closed this follow-up', 'info'); NA.refresh(); return true; }
        const me = NA.me();
        const rating = escal ? null : Number(v.rating) || null;
        NA.update('followUps', f.id, { status: 'done', doneAt: today(), doneBy: me.name, doneById: NA.myStaffId(), rating, outcome });
        const workshop = isServiceCall(f);
        const link = workshop && NA.canSee('service') ? '#/service?tab=followups' : '#/customers/' + f.customerId;
        // On the customer's timeline when this person may change the customer (a consultant only their own), else on the follow-up.
        const logRec = c && (!NA.isRole('sales') || NA.isMine(c)) ? c : NA.get('followUps', f.id);
        NA.log(`${f.type} ${escal ? 'closed' : 'done'} for ${name}${rating ? ' — ' + rating + ' of 5' : ''} (by ${me.name})${escal ? ': ' + outcome : ''}`, { rec: logRec, link, kind: rating && rating <= 2 ? 'warn' : 'success' });
        if (v.nextType && v.nextDue) {
          NA.insert('followUps', Object.assign({ customerId: f.customerId, vehicleId: f.vehicleId || null, orderId: NA.can('leads.create') ? f.orderId || null : null, due: v.nextDue, type: v.nextType, status: 'pending',
            notes: 'Planned after ' + f.type.toLowerCase(), createdBy: me.name }, plannedBy(c, managerCall(f) ? '' : f.consultantId)));
        }
        if (rating && rating <= 2 && !NA.find('followUps', (x) => x.fromId === f.id && ['Complaint', 'Manager call-back'].includes(x.type))) {
          if (workshop) {
            NA.insert('followUps', { customerId: f.customerId, vehicleId: f.vehicleId || null, jobCardId: f.jobCardId || null, fromId: f.id, due: today(), type: 'Complaint', status: 'pending',
              assignedTo: serviceManagerId(), notes: `Rated ${rating}/5${outcome ? ': ' + outcome : ''}`, createdBy: me.name });
            NA.log(`Complaint opened for the Service Manager — ${name} rated ${rating}/5`, { link: '#/service?tab=followups', kind: 'warn' });
            ui.toast('Low rating — a complaint is open for the Service Manager', 'info');
          } else {
            // consultantId = who calls (the Sales Manager), so it is on no one else's list; it stays with the follow-up's
            // owner, so the consultant sees it but cannot close it.
            NA.insert('followUps', { customerId: f.customerId, vehicleId: f.vehicleId || null, orderId: f.orderId || null, fromId: f.id, due: today(), type: 'Manager call-back', status: 'pending', escalated: true,
              consultantId: callBackBy() || consultantOfCustomer(c) || null, ownerId: f.ownerId || NA.myStaffId() || null,
              notes: `Rated ${rating} of 5 on the ${f.type.toLowerCase()}${outcome ? ': ' + outcome : ''}`, createdBy: me.name });
            ui.toast('Low rating — the Sales Manager will call the customer back', 'info');
          }
        } else ui.toast(escal ? 'Closed' : 'Follow-up done');
        NA.refresh();
        return true;
      },
    });
  }

  /* ------------------------------------------------------------------------
     Printouts
     ------------------------------------------------------------------------ */
  /* Paper keeps its own colours (print styles in NA.ui.print). */
  const sellerLine = () => { const s = settings(); return [s.address, s.phone, s.bin ? 'BIN ' + s.bin : '', s.tin ? 'TIN ' + s.tin : ''].filter(Boolean).map(esc).join(' · '); };
  function partyBlock(c, v, extra) {
    return `<table><tr><th style="width:50%">Customer</th><th>Car</th></tr><tr>
      <td><b>${esc(c.name || '—')}</b>${c.company && c.company !== c.name ? '<br>' + esc(c.company) : ''}<br>${esc(c.mobile || '')}${c.address ? '<br>' + esc(c.address) : ''}${c.bin ? '<br>BIN ' + esc(c.bin) : ''}${c.tin ? '<br>TIN ' + esc(c.tin) : ''}</td>
      <td>${v ? `<b>${esc(NA.modelName(v.modelId))}</b> · ${esc(v.color || '')}<br>VIN ${esc(v.vin)}<br>Reg. ${esc(v.regNo || 'not yet')}${extra || ''}` : '—'}</td></tr></table>`;
  }
  const odoText = (jc) => (jc.odometer !== '' && jc.odometer != null && !isNaN(Number(jc.odometer)) ? '<br>Odometer ' + fmt.num(jc.odometer) + ' km' : '');

  function printInvoice(inv) {
    const c = NA.customer(inv.customerId) || {};
    const jc = NA.get('jobCards', inv.refId) || {};
    const v = NA.vehicle(inv.vehicleId || jc.vehicleId);
    const w = inv.billing === 'warranty';
    const due = invDue(inv);
    const rate = invVatRate(inv);
    const wr = v ? B.warrantyFor(v.id) : null;
    const gross = inv.gross != null ? num(inv.gross) : num(inv.subtotal);
    const lines = (inv.lines || []).filter((l) => num(l.rate) >= 0);
    ui.print('Service invoice ' + inv.no, `
      <h1>${w ? 'Warranty service note' : 'Tax invoice'} ${esc(inv.no)}</h1>
      <div class="muted">${sellerLine()}</div>
      <div class="muted">Date ${fmt.date(inv.date)} · Job card ${esc(jc.code || '')} · ${w ? 'Warranty — no charge to the customer' : 'Service'}${w ? '' : ' · VAT ' + fmt.pct(rate, Math.round(rate * 1000) % 10 ? 1 : 0)}</div>
      ${partyBlock(c, v, odoText(jc))}
      <table><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
      ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.desc)}</td><td class="r">${esc(l.qty)}</td><td class="r">${fmt.money(l.rate)}</td><td class="r">${fmt.money(l.qty * l.rate)}</td></tr>`).join('')}
      ${w ? `<tr><td colspan="4" class="r">Value of the work</td><td class="r">${fmt.money(inv.subtotal)}</td></tr>
             <tr><td colspan="4" class="r">Covered by warranty ${wr ? esc(wr.code) : ''}</td><td class="r">− ${fmt.money(inv.subtotal)}</td></tr>
             <tr><th colspan="4" class="r">To pay</th><th class="r">${fmt.money(0)}</th></tr>`
          : `<tr><td colspan="4" class="r">Parts and labour</td><td class="r">${fmt.money(gross)}</td></tr>
             ${num(inv.discount) ? `<tr><td colspan="4" class="r">Discount${inv.discountReason ? ' (' + esc(inv.discountReason) + ')' : ''}</td><td class="r">− ${fmt.money(inv.discount)}</td></tr>` : ''}
             <tr><td colspan="4" class="r">Value before VAT</td><td class="r">${fmt.money(inv.subtotal)}</td></tr>
             <tr><td colspan="4" class="r">VAT ${fmt.pct(rate, Math.round(rate * 1000) % 10 ? 1 : 0)}</td><td class="r">${fmt.money(inv.vat)}</td></tr>
             <tr><th colspan="4" class="r">Total</th><th class="r">${fmt.money(inv.total)}</th></tr>
             <tr><td colspan="4" class="r">Received</td><td class="r">${fmt.money(invReceived(inv))}</td></tr>
             <tr><th colspan="4" class="r">Balance due</th><th class="r">${fmt.money(due)}</th></tr>`}
      </table>
      ${(inv.receipts || []).length ? `<p class="muted">Payments: ${(inv.receipts || []).map((r) => `${r.receiptNo ? esc(r.receiptNo) + ' ' : ''}${fmt.date(r.date)} ${fmt.money(r.amount)} ${esc(r.method || '')} ${esc(r.ref || '')}`).join(' · ')}</p>` : ''}
      ${w && (jc.claim && jc.claim.no || inv.claimRef) ? `<p class="muted">BYD warranty claim ${esc((jc.claim && jc.claim.no) || inv.claimRef)}</p>` : ''}
      ${jc.diagnosis ? `<p><b>Work done:</b> ${esc(jc.diagnosis)}</p>` : ''}
      <div class="sig"><div>Customer signature</div><div>For ${esc(settings().company)}</div></div>`);
  }

  function printJobCard(jc) {
    const c = NA.customer(jc.customerId) || {}; const v = NA.vehicle(jc.vehicleId);
    const t = totals(jc);
    ui.print('Job card ' + jc.code, `
      <h1>Workshop job card ${esc(jc.code)}</h1>
      <div class="muted">Opened ${fmt.date(jc.openedAt)} · ${esc(jc.type || '')} · ${esc(jobStatus(jc)[0])} · ${jc.billing === 'warranty' ? 'Warranty' : isInternal(jc) ? 'Our own car' : 'Customer pays'}</div>
      ${isInternal(jc) ? `<p><b>Our own car</b>${jc.internal && jc.internal.reason ? ' — ' + esc(jc.internal.reason) : ''}</p>${v ? partyBlock({ name: 'Noor Autos' }, v, odoText(jc)) : ''}` : partyBlock(c, v, odoText(jc))}
      <table><tr><th style="width:25%">Complaint</th><td>${esc(jc.complaint || '')}</td></tr>
        <tr><th>What we found and did</th><td style="height:60px">${esc(jc.diagnosis || '')}</td></tr>
        <tr><th>Technician</th><td>${esc(NA.staffName(jc.technicianId))}</td></tr>
        <tr><th>Service advisor</th><td>${esc(NA.staffName(jc.advisorId))}</td></tr>
        ${jc.estimate ? `<tr><th>Customer agreed</th><td>${fmt.money(jc.estimate.total)} · ${esc(jc.estimate.how || '')} · ${fmt.datetime(jc.estimate.at)}</td></tr>` : ''}</table>
      <table><tr><th>Part</th><th>Part no.</th><th class="r">Qty</th><th class="r">Price</th></tr>
        ${(jc.parts || []).map((l) => `<tr><td>${esc(partName(l))}</td><td>${esc(partSku(l))}</td><td class="r">${esc(l.qty)}</td><td class="r">${fmt.money(l.unitPrice)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No parts</td></tr>'}
        <tr><td colspan="2">Labour ${esc(num(jc.labourHours))} h × ${fmt.money(rateOf(jc))}</td><td></td><td class="r">${fmt.money(t.labour)}</td></tr>
        ${t.discount ? `<tr><td colspan="3">Discount${jc.discount && jc.discount.reason ? ' — ' + esc(jc.discount.reason) : ''}</td><td class="r">− ${fmt.money(t.discount)}</td></tr>` : ''}
        <tr><th colspan="3" class="r">Expected total ${jc.billing === 'warranty' ? '(warranty — ৳ 0 to the customer)' : isInternal(jc) ? '(our cost)' : 'with VAT'}</th><th class="r">${fmt.money(isInternal(jc) ? t.internalCost : t.total)}</th></tr></table>
      <div class="sig"><div>Customer (car handed over)</div><div>Service advisor</div></div>`);
  }

  /** The guard's copy: the car may leave the workshop. */
  function printGatePass(jc) {
    if (!jc || !jc.release) return;
    const c = NA.customer(jc.customerId) || {}; const v = NA.vehicle(jc.vehicleId);
    const r = jc.release;
    ui.print('Gate pass ' + (r.gatePass || ''), `
      <h1>Gate pass ${esc(r.gatePass || '')}</h1>
      <div class="muted">${esc(fmt.datetime(r.at))} · Job card ${esc(jc.code)} · released by ${esc(r.by || '')}</div>
      ${partyBlock(c, v, r.odometerOut != null ? '<br>Odometer out ' + fmt.num(r.odometerOut) + ' km' : '')}
      <table><tr><th style="width:35%">Handed to</th><td>${esc(r.to || '')}</td></tr>
        <tr><th>Bill</th><td>${(() => { const inv = invoiceOf(jc); return inv ? esc(inv.no) + (num(r.due) > 0 ? ' · ' + fmt.money(r.due) + ' still due (' + esc(CREDIT_WORDS.toLowerCase()) + ': ' + esc((inv.credit && inv.credit.by) || '') + ')' : ' · paid') : jc.billing === 'warranty' ? 'Warranty — nothing to pay' : '—'; })()}</td></tr>
        ${r.note ? `<tr><th>Note</th><td>${esc(r.note)}</td></tr>` : ''}</table>
      <div class="sig"><div>Customer</div><div>Guard</div></div>`);
  }

  function printCertificate(id) {
    const w = NA.get('warranties', id); if (!w) return;
    const c = NA.customer(w.customerId) || {}; const v = NA.vehicle(w.vehicleId);
    ui.print('Warranty certificate ' + w.code, `
      <h1 style="text-align:center;margin-top:10px">Certificate of Warranty</h1>
      <p style="text-align:center" class="muted">${esc(settings().company)} — Authorized BYD Dealer, Bangladesh</p>
      <table>
        <tr><th style="width:35%">Certificate no.</th><td><b>${esc(w.code)}</b></td></tr>
        <tr><th>Owner</th><td>${esc(c.name || '—')}<br>${esc(c.mobile || '')} · ${esc(c.address || '')}</td></tr>
        <tr><th>Vehicle</th><td>${esc(NA.modelName(w.modelId))}${v ? ' · ' + esc(v.color || '') : ''}</td></tr>
        <tr><th>VIN</th><td>${esc(w.vin || '')}</td></tr>
        <tr><th>Motor no.</th><td>${esc((v && v.motorNo) || '')}</td></tr>
        <tr><th>Registration no.</th><td>${esc(w.regNo || (v && v.regNo) || 'Pending')}</td></tr>
        <tr><th>Warranty start (delivery)</th><td>${fmt.date(w.start)}</td></tr>
        <tr><th>Vehicle warranty</th><td>${num(w.kmLimit) ? `Until ${fmt.date(w.expiry)} or ${fmt.num(w.kmLimit)} km, whichever comes first` : `Until ${fmt.date(w.expiry)} · no km limit`}</td></tr>
        <tr><th>Traction battery warranty</th><td>Until ${fmt.date(w.batteryExpiry)}${num(w.batteryKmLimit) ? ` or ${fmt.num(w.batteryKmLimit)} km, whichever comes first` : ''}</td></tr>
      </table>
      <p class="muted">Warranty covers manufacturing defects when the vehicle is serviced at an authorized BYD workshop as per the maintenance schedule. Accident damage, misuse and wear items (tyres, wiper blades, brake pads) are excluded.</p>
      <div class="sig"><div>Customer</div><div>Authorized signatory</div></div>`);
  }

  /* ------------------------------------------------------------------------
     After a decision (these run in the approver's browser)
     ------------------------------------------------------------------------ */
  if (A) {
    // Cancelling a started job: carried out when the Service Manager approves it.
    A.onDecide('job_cancel', (a, decision) => {
      if (a.refC !== 'jobCards' || decision !== 'approved') return;
      const jc = NA.get('jobCards', a.refId);
      if (jc) doCancel(jc, a.data || {}, a.decidedBy || NA.me().name);
    });
    // An older request that a newer one replaced. Only the asker or the approver may withdraw a request, so when someone
    // else asks again the office server keeps both open; deciding the old one must not undo the newer one.
    const replaced = (a, type) => { const cur = A.find('jobCards', a.refId, type); return !!cur && cur.id !== a.id; };
    // Free work declined: the customer pays.
    A.onDecide('warranty_job', (a, decision) => {
      if (a.refC !== 'jobCards' || decision !== 'rejected' || replaced(a, 'warranty_job')) return;
      const jc = NA.get('jobCards', a.refId);
      if (!jc || jc.billing !== 'warranty' || !['open', 'in_progress', 'completed'].includes(jc.status)) return;
      NA.update('jobCards', jc.id, { billing: 'paid', batteryWork: false });
      logJob(jc, `${jc.code} — free warranty work declined${a.note ? ' (' + a.note + ')' : ''}; the customer pays`, 'warn');
    });
    // A declined discount comes off the bill — only the discount that was asked for, not one changed since.
    A.onDecide('service_discount', (a, decision) => {
      if (a.refC !== 'jobCards' || decision !== 'rejected' || replaced(a, 'service_discount')) return;
      const jc = NA.get('jobCards', a.refId);
      if (!jc || !jc.discount || ['invoiced', 'cancelled', 'closed'].includes(jc.status)) return;
      if (Math.abs(discountOf(jc) - num(a.value)) > 0.5) return;
      NA.update('jobCards', jc.id, { discount: null });
      logJob(jc, `${jc.code} — discount of ${fmt.money(a.value)} declined${a.note ? ' (' + a.note + ')' : ''} and taken off`, 'warn');
    });
  }

  /* A service receipt marked as not received: recorded on its bill in the browser that made the change. */
  NA.on('change', (e) => {
    if (!e || e.name !== 'payments' || !e.rec || !e.rec.invoiceId || e.rec.orderId) return;
    syncBounce(e.rec);
  });
  // Bounces from before the bill recorded them (or recorded by a browser with an older copy of this screen): Accounts'
  // and the Managing Director's browsers put them on the bill. Nothing is written when there is nothing to fix.
  NA.on('rendered', () => {
    if (NA.preview || !NA.can('payments.verify') || !NA.db || !Array.isArray(NA.db.payments)) return;
    NA.db.payments.forEach((p) => {
      if (!p.invoiceId || p.orderId || !B.paymentBounced(p)) return;
      const inv = NA.get('invoices', p.invoiceId);
      const r = inv && (inv.receipts || []).find((x) => (x.paymentId ? x.paymentId === p.id : !!p.receiptNo && x.receiptNo === p.receiptNo));
      if (r && !r.bounced) { try { syncBounce(p); } catch (er) { console.error(er); } }
    });
  });

  /* Cross-module helpers for other pages */
  NA.actions.printServiceInvoice = (invoiceId) => { const inv = NA.get('invoices', invoiceId); if (inv) printInvoice(inv); };
  NA.actions.printWarrantyCertificate = (warrantyId) => printCertificate(warrantyId);
  NA.actions.newFollowUp = (prefill) => newFollowUp(prefill);
  /** Finish a follow-up with the one shared form (checks who may close it; see completeFollowUp). */
  NA.actions.completeFollowUp = (followUpId) => completeFollowUp(followUpId);
  /** Accounts lets the car go before the service bill is paid, from their own screens (they cannot open Service). */
  NA.actions.allowServiceCredit = (invoiceId) => { const inv = NA.get('invoices', invoiceId); if (inv) allowCredit(inv); };
  /** Read-only service rules other screens may use (money on a job, where a job is, warranty cover, whose call a
      follow-up is). followUpCloser(f): '' when the current person may finish it, else who does (e.g. 'the Service Manager').
      estimateState(jc): 'na' (warranty, our own car, or opened before the rules) | 'needed' | 'risen' (more than 10%
      above what the customer agreed) | 'ok'. */
  NA.service = { totals, phase, jobStatus, nextStep, isReleased, warrantyInfo, jobCover, invDue, invReceived, claimRows, heldOnJobs, isServiceCall, followUpCloser, estimateState };
})();
