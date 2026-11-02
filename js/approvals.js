/* ==========================================================================
   approvals.js — management sign-off.

   Some steps cost real money if they go wrong (a big discount, releasing a
   car before it is paid for, cancelling an order, paying a supplier…).
   Those steps ask for approval first. The request lands in the approver's
   Approvals inbox; the record shows a banner until someone decides.

   If the person asking is allowed to approve it themselves (the Managing
   Director, or a Sales Manager within their limit) it is approved at once
   and logged, so nobody waits for nothing.

   Limits live in Settings → Approval rules (NA.db.settings.policy).
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const { esc } = NA;

  NA.defaultPolicy = () => ({
    discountFree: 20000,        // a consultant may give up to this off a car without asking
    discountManager: 100000,    // the Sales Manager approves up to this; above it goes to the Managing Director
    expenseFree: 2000,          // small spends need no approval
    expenseAccounts: 10000,     // Accounts approves up to this; above it goes to the Managing Director
    serviceDiscountFree: 2000,  // discount on a service bill without asking
    serviceDiscountManager: 10000, // the Service Manager approves up to this; above it goes to the Managing Director
    poApproval: true,           // purchase orders need the MD's approval before the advance is paid
    stockAdjustApproval: true,  // writing parts off or correcting counts needs approval
    partsOrderLimit: 100000,    // parts orders above this go to the Managing Director
    quoteValidDays: 7,
    firstContactHours: 24,      // a new lead must be contacted within this many hours
  });
  NA.policy = () => Object.assign(NA.defaultPolicy(), (NA.db.settings && NA.db.settings.policy) || {});

  const pol = () => NA.policy();
  const money = (n) => NA.fmt.money(n);

  /* Approval kinds. approvers(amount) returns the roles that may decide. */
  NA.APPROVALS = {
    discount:      { label: 'Discount',                  icon: 'tag',      tone: 'violet', approvers: (a) => (a > pol().discountManager ? ['owner'] : ['sales_manager']),
                     why: 'Above the discount a consultant may give on their own' },
    credit:        { label: 'Car before full payment',   icon: 'key',      tone: 'amber',  approvers: () => ['owner'],
                     why: 'A VIN is normally given only after 100% cleared payment' },
    cancel:        { label: 'Cancel order and refund',   icon: 'x',        tone: 'red',    approvers: () => ['owner'],
                     why: 'Cancelling releases the car and may mean a refund' },
    transfer:      { label: 'Customer hand-over',        icon: 'users',    tone: 'blue',   approvers: () => ['sales_manager'],
                     why: 'This customer already belongs to another consultant' },
    po:            { label: 'Purchase order',            icon: 'cart',     tone: 'blue',   approvers: () => ['owner'],
                     why: 'A purchase order commits the company to the advance payment' },
    emergency:     { label: 'Emergency purchase',        icon: 'bolt',     tone: 'amber',  approvers: () => ['owner'],
                     why: 'CG Runner purchases are paid 100% up front' },
    vendor_payment:{ label: 'Supplier payment',          icon: 'wallet',   tone: 'blue',   approvers: () => ['owner'],
                     why: 'Money leaving the company' },
    expense:       { label: 'Expense',                   icon: 'receipt',  tone: 'gray',   approvers: (a) => (a > pol().expenseAccounts ? ['owner'] : ['accounts']),
                     why: 'Spending above the petty-cash limit' },
    warranty_job:  { label: 'Warranty job (free)',       icon: 'shield',   tone: 'teal',   approvers: () => ['service_manager'],
                     why: 'The customer pays nothing; the cost is claimed from BYD' },
    service_discount: { label: 'Service discount',       icon: 'wrench',   tone: 'violet', approvers: (a) => (a > pol().serviceDiscountManager ? ['owner'] : ['service_manager']),
                     why: 'Discount or free work on a service bill' },
    job_cancel:    { label: 'Cancel a started job',      icon: 'x',        tone: 'red',    approvers: () => ['service_manager'],
                     why: 'Work or parts are already on this job card' },
    stock_adjust:  { label: 'Stock adjustment',          icon: 'boxes',    tone: 'amber',  approvers: () => ['owner'],
                     why: 'Writing stock off or correcting a count' },
    leave:         { label: 'Leave',                     icon: 'calendar', tone: 'teal',   approvers: () => ['hr'],
                     why: 'Time off work' },
    payroll:       { label: 'Payroll',                   icon: 'hr',       tone: 'indigo', approvers: () => ['owner'],
                     why: 'Monthly salaries before they are paid' },
  };

  const A = (NA.approvals = {});
  const handlers = {};
  /** Run fn(approval, decision) after someone approves or declines this kind. */
  A.onDecide = (type, fn) => ((handlers[type] = handlers[type] || []).push(fn));

  const all = () => NA.db.approvals || (NA.db.approvals = []);
  const live = (a) => a.status !== 'cancelled';
  A.approverRoles = (type, amount) => { const t = NA.APPROVALS[type]; return t ? t.approvers(Number(amount) || 0) : ['owner']; };
  A.canDecide = function (a) {
    if (!a || a.status !== 'pending') return false;
    if (NA.isRole('owner')) return true;
    if (a.ownerId && a.ownerId === NA.myStaffId()) return false;   // nobody approves their own request
    return (a.approverRoles || []).includes(NA.role());
  };
  A.isMine = (a) => !!a && !!NA.myStaffId() && a.ownerId === NA.myStaffId();
  A.label = (type) => (NA.APPROVALS[type] || { label: type }).label;
  A.approverText = (a) => (a.approverRoles || []).map(NA.roleLabel).join(' or ') || 'Managing Director';

  /** Would this need someone else's approval if the current person did it? */
  A.needed = function (type, amount) {
    const p = pol();
    amount = Number(amount) || 0;
    if (type === 'discount' && amount <= p.discountFree) return false;
    if (type === 'expense' && amount <= p.expenseFree) return false;
    if (type === 'service_discount' && amount <= p.serviceDiscountFree) return false;
    if (type === 'po' && !p.poApproval) return false;
    if (type === 'stock_adjust' && !p.stockAdjustApproval) return false;
    const roles = A.approverRoles(type, amount);
    return !(NA.isRole('owner') || roles.includes(NA.role()));
  };

  /** Latest approval for a record and kind (withdrawn ones ignored). */
  A.find = (c, id, type) => (id ? all().filter((a) => a.refC === c && a.refId === id && a.type === type && live(a))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0] || null : null);
  /** Requests about a record the asker cannot see (no id) are matched by a key instead, e.g. 'mobile:1711000000'. */
  const keyOf = (ref, data) => (ref && ref.key) || (data && data.mobile ? 'mobile:' + String(data.mobile).replace(/\D/g, '').slice(-10) : '');
  A.findKey = (type, key) => (key ? all().filter((a) => a.type === type && a.refKey === key && live(a))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0] || null : null);
  A.forRecord = (c, id) => all().filter((a) => a.refC === c && a.refId === id && live(a))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));

  /** 'none' | 'pending' | 'approved' | 'rejected'. With a value, an approval only counts if it covered at least that much. */
  A.state = function (c, id, type, value) {
    const a = A.find(c, id, type);
    if (!a) return 'none';
    if (a.status === 'approved' && value != null && Number(value) > (Number(a.value) || 0) + 0.5) return 'none';
    return a.status;
  };
  A.isApproved = (c, id, type, value) => A.state(c, id, type, value) === 'approved';
  A.isPending = (c, id, type) => A.state(c, id, type) === 'pending';

  /** A request someone else asked again about since (the newer one is the one that counts; A.find returns it). */
  A.superseded = function (a) {
    if (!a) return false;
    const newer = a.refId ? A.find(a.refC, a.refId, a.type) : a.refKey ? A.findKey(a.type, a.refKey) : null;
    return !!newer && newer.id !== a.id && String(newer.createdAt) > String(a.createdAt);
  };
  A.pendingForMe = () => all().filter((a) => a.status === 'pending' && A.canDecide(a) && !A.superseded(a))
    .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  A.mine = () => all().filter((a) => A.isMine(a)).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  A.countForMe = () => A.pendingForMe().length;

  /**
   * Ask for approval.
   *   type   one of NA.APPROVALS
   *   ref    { c: collection, id, code } of the record it is about
   *   title  short line, e.g. "৳ 1,20,000 off SO-0021"
   *   detail longer context shown to the approver
   *   amount money involved (decides who approves)
   *   value  the figure being approved (e.g. the discount); a later, bigger figure needs a new approval
   *   reason why the person is asking (their words)
   *   selfApprove  false = always wait for someone else, even when the asker holds the authority
   *                (Accounts' own expense claim, a void they asked for)
   * Returns the approval record (already approved if the person may approve it themselves).
   */
  A.request = function ({ type, ref, title, detail, amount, value, reason, data, selfApprove }) {
    const me = NA.me();
    const roles = A.approverRoles(type, amount);
    const self = selfApprove !== false && (NA.isRole('owner') || roles.includes(me.role));
    // Replace any earlier open request for the same thing (by the record, or by its key when there is no id).
    const key = ref && !ref.id ? keyOf(ref, data) : '';
    const prev = ref && (ref.id ? A.find(ref.c, ref.id, type) : A.findKey(type, key));
    // Only the person who asked, or someone who may decide it, can close the earlier request (the office server refuses
    // anyone else); otherwise it stays, and the newer request is the one that counts (A.superseded).
    if (prev && prev.status === 'pending' && (A.isMine(prev) || (ref.id && A.canDecide(prev)))) NA.update('approvals', prev.id, { status: 'cancelled', note: 'Replaced by a new request' });
    const now = new Date().toISOString();
    const rec = NA.insert('approvals', {
      code: NA.nextCode('AP'), type, refC: ref && ref.c, refId: (ref && ref.id) || '', refKey: key || null, refCode: ref && ref.code,
      title: title || A.label(type), detail: detail || '', amount: Number(amount) || 0, value: value != null ? Number(value) : (Number(amount) || 0),
      reason: reason || '', data: data || null, approverRoles: roles, requestedBy: me.name, ownerId: me.staffId || null,
      status: self ? 'approved' : 'pending', decidedBy: self ? me.name : null, decidedById: self ? me.staffId : null, decidedAt: self ? now : null,
      note: self ? 'Within ' + (NA.isRole('owner') ? 'the Managing Director’s' : NA.roleLabel(me.role) + '’s') + ' own authority' : '',
    });
    // The request goes into the record's own history only when this person may change that record (the office server
    // refuses a history line on a record they can only read, e.g. another consultant's customer).
    const target = ref && ref.id ? NA.get(ref.c, ref.id) : null;
    NA.log(self ? `${A.label(type)} approved by ${me.name}: ${rec.title}` : `${me.name} asked for approval: ${rec.title}`,
      { link: refLink(rec) || '#/approvals', kind: self ? 'success' : 'warn', rec: target && NA.mayWrite(ref.c, target) ? target : null });
    if (self) (handlers[type] || []).forEach((fn) => { try { fn(rec, 'approved'); } catch (e) { console.error(e); } });
    return rec;
  };

  /** Approve or decline. */
  A.decide = function (a, decision, note) {
    if (!A.canDecide(a)) { NA.ui.toast('You cannot decide this request', 'error'); return false; }
    const me = NA.me();
    NA.update('approvals', a.id, { status: decision, decidedBy: me.name, decidedById: me.staffId || null, decidedAt: new Date().toISOString(), note: note || '' });
    const ref = a.refC && NA.get(a.refC, a.refId);
    NA.log(`${A.label(a.type)} ${decision === 'approved' ? 'approved' : 'declined'} by ${me.name}: ${a.title}${note ? ' (' + note + ')' : ''}`,
      { link: refLink(a) || '#/approvals', kind: decision === 'approved' ? 'success' : 'warn', rec: ref && NA.mayWrite(a.refC, ref) ? ref : null });
    (handlers[a.type] || []).forEach((fn) => { try { fn(a, decision); } catch (e) { console.error(e); } });
    return true;
  };

  /** The person who asked can take the request back while it is still open. */
  A.withdraw = function (a) {
    if (!a || a.status !== 'pending') return false;
    NA.update('approvals', a.id, { status: 'cancelled', note: 'Withdrawn by ' + NA.me().name });
    (handlers[a.type] || []).forEach((fn) => { try { fn(a, 'cancelled'); } catch (e) { console.error(e); } });
    return true;
  };

  /* Where an approval's record lives in the app. Pages can override per collection. */
  const LINKS = {
    leads: (id) => '#/leads/' + id, customers: (id) => '#/customers/' + id, orders: (id) => '#/sales/' + id,
    purchaseOrders: (id) => '#/procurement/' + id, jobCards: (id) => '#/service/job/' + id, expenses: () => '#/finance?tab=expenses',
    parts: () => '#/parts', partOrders: () => '#/parts?tab=orders', leaves: () => '#/admin?tab=leave', payroll: () => '#/admin?tab=payroll', vendorPayments: () => '#/finance',
  };
  A.LINKS = LINKS;
  function refLink(a) { const f = a && a.refC && LINKS[a.refC]; return f ? f(a.refId) : null; }
  A.link = refLink;

  /* ------------------------------------------------------------------------
     UI: a banner for records, a request sheet, and one click handler for both.
     ------------------------------------------------------------------------ */
  const ago = (iso) => NA.fmt.ago(iso);

  /** Banner html for one approval (or '' if there is none). */
  NA.ui.approvalBanner = function (a, opts = {}) {
    if (!a || a.status === 'cancelled') return '';
    const t = NA.APPROVALS[a.type] || { label: a.type, icon: 'info' };
    const decide = A.canDecide(a) && a.status === 'pending';
    if (a.status === 'pending') {
      return `<div class="appr" data-appr="${esc(a.id)}">
        <span class="appr-ico">${NA.icon('clock', 18)}</span>
        <div class="appr-text"><b>${esc(opts.pendingTitle || 'Waiting for approval · ' + t.label)}</b>
          <small>${esc(a.title)} · asked by ${esc(a.requestedBy || '—')} ${esc(ago(a.createdAt))} · ${esc(A.approverText(a))} to decide${a.reason ? ' · “' + esc(a.reason) + '”' : ''}</small></div>
        <div class="appr-actions">${decide
          ? `<button class="btn btn-sm btn-ghost" data-appr-act="reject" data-id="${esc(a.id)}">Decline</button><button class="btn btn-sm btn-tinted" data-appr-act="approve" data-id="${esc(a.id)}">Approve</button>`
          : A.isMine(a) ? `<button class="btn btn-sm btn-ghost" data-appr-act="withdraw" data-id="${esc(a.id)}">Withdraw</button>` : ''}</div>
      </div>`;
    }
    const ok = a.status === 'approved';
    return `<div class="appr ${ok ? 'ok' : 'no'}" data-appr="${esc(a.id)}">
      <span class="appr-ico">${NA.icon(ok ? 'check' : 'x', 18)}</span>
      <div class="appr-text"><b>${ok ? 'Approved' : 'Declined'} · ${esc(t.label)}</b>
        <small>${esc(a.title)} · ${esc(a.decidedBy || '—')} ${esc(ago(a.decidedAt))}${a.note ? ' · “' + esc(a.note) + '”' : ''}</small></div>
      ${opts.action || ''}
    </div>`;
  };

  /** Banners for every open (or the latest decided) approval on a record. */
  NA.ui.approvalBanners = function (c, id, types) {
    const list = A.forRecord(c, id).filter((a) => !types || types.includes(a.type));
    const seen = new Set();
    return list.filter((a) => { if (seen.has(a.type)) return false; seen.add(a.type); return true; })
      .map((a) => NA.ui.approvalBanner(a)).join('');
  };

  /**
   * Ask the person for a short reason, then request approval.
   * Resolves with the approval record, or null if they cancelled.
   */
  NA.ui.requestApproval = function (opts) {
    return new Promise((resolve) => {
      const t = NA.APPROVALS[opts.type] || { label: opts.type, why: '' };
      const roles = A.approverRoles(opts.type, opts.amount);
      let done = null;
      NA.ui.modal({
        title: opts.sheetTitle || 'Ask for approval', size: 'sm',
        subtitle: esc(t.why || ''),
        body: `<div class="glist">
            <div class="gl-row"><div class="gl-main"><b>${esc(opts.title)}</b>${opts.detail ? `<small>${esc(opts.detail)}</small>` : ''}</div></div>
            <div class="gl-row"><span class="gl-label grow">Goes to</span><span class="gl-value">${esc(roles.map(NA.roleLabel).join(' or '))}</span></div>
          </div>
          <form class="modal-form mt-16" onsubmit="return false">${NA.ui.field({ name: 'reason', label: 'Reason (helps them decide quickly)', type: 'textarea', rows: 2, placeholder: opts.placeholder || 'e.g. Repeat customer, matching a competitor offer' })}</form>`,
        onClose: () => resolve(done),
        actions: [{ label: 'Cancel' }, { label: 'Send request', kind: 'primary', onClick: (el) => {
          const reason = el.querySelector('[name=reason]').value.trim();
          done = A.request(Object.assign({}, opts, { reason }));
          NA.ui.toast(done.status === 'approved' ? 'Approved' : 'Sent to ' + roles.map(NA.roleLabel).join(' or '), done.status === 'approved' ? 'success' : 'info');
        } }],
      });
    });
  };

  /** Ask for a note when declining. */
  function declineSheet(a) {
    NA.ui.formModal({
      title: 'Decline request', size: 'sm', submitLabel: 'Decline',
      intro: `<p class="muted mb-12" style="margin-bottom:14px">${esc(a.title)}</p>`,
      fields: [{ name: 'note', label: 'Reason (the requester sees this)', type: 'textarea', rows: 2, required: true }],
      onSubmit: (v) => { if (A.decide(a, 'rejected', v.note)) { NA.ui.toast('Declined'); NA.refresh(); } },
    });
  }
  A.declineSheet = declineSheet;
  A.approve = (a, note) => { if (A.decide(a, 'approved', note)) { NA.ui.toast('Approved'); NA.refresh(); } };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-appr-act]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = NA.get('approvals', b.dataset.id);
    if (!a) return;
    const act = b.dataset.apprAct;
    if (act === 'approve') A.approve(a);
    else if (act === 'reject') declineSheet(a);
    else if (act === 'withdraw') NA.ui.confirm('Withdraw this request?', { title: 'Withdraw', okLabel: 'Withdraw' }).then((ok) => { if (ok && A.withdraw(a)) { NA.ui.toast('Withdrawn'); NA.refresh(); } });
    else if (act === 'open') { const l = A.link(a); if (l) NA.go(l); }
  });
})();
