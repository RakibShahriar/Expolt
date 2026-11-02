/* ==========================================================================
   Approvals — one inbox for every decision the management makes.
     • For you: requests waiting for your decision (Approve / Decline).
     • Money to confirm: customer payments Accounts must confirm before they
       count (cash handed over, cheque cleared, transfer seen in the bank).
     • Your requests: what you asked for and what happened.
     • History: decided requests (managers).
   Also home of "Request leave", which anyone can do from the New menu.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const A = NA.approvals;

  function injectCss() {
    if (document.getElementById('css-approvals')) return;
    const s = document.createElement('style');
    s.id = 'css-approvals';
    s.textContent = `
      .ap-list { padding: 4px 0; }
      .ap-item { display: flex; gap: 16px; align-items: flex-start; padding: 18px 24px; position: relative; }
      .ap-item + .ap-item::before { content: ''; position: absolute; top: 0; left: 76px; right: 0; height: .5px; background: var(--line-2); }
      .ap-ico { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; flex: none; margin-top: 1px; }
      .ap-main { flex: 1; min-width: 0; }
      .ap-title { font-weight: 600; font-size: 15px; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ap-title a:hover { color: var(--tint); }
      .ap-detail { color: var(--ink-2); margin-top: 3px; font-size: 13.5px; }
      .ap-meta { color: var(--muted); margin-top: 6px; font-size: 12.5px; }
      .ap-reason { margin-top: 10px; padding: 10px 12px; border-radius: 11px; background: var(--fill-3); font-size: 13.5px; color: var(--ink-2); }
      .ap-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex: none; }
      .ap-amount { font-size: 17px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .ap-actions { display: flex; gap: 8px; }
      .ap-actions .btn { min-width: 92px; }
      .ap-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-bottom: 28px; }
      .ap-done { text-align: center; padding: 64px 16px; }
      .ap-done .ap-done-ico { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 16px; background: var(--green-50); color: var(--green); }
      .ap-done h3 { font-size: 20px; font-weight: 600; }
      .ap-done p { color: var(--muted); margin-top: 6px; }
      .ap-rules { margin-top: 36px; }
      @media (max-width: 760px) {
        .ap-item { flex-wrap: wrap; padding: 16px 18px; }
        .ap-item + .ap-item::before { left: 18px; }
        .ap-side { width: 100%; flex-direction: column; align-items: stretch; gap: 10px; padding-left: 54px; }
        .ap-amount { text-align: left; }
        .ap-actions .btn { flex: 1; min-width: 0; }
        .ap-sum { grid-template-columns: 1fr; gap: 12px; }
      }`;
    document.head.appendChild(s);
  }

  const TONE_BG = { violet: 'bg-violet', amber: 'bg-amber', red: 'bg-red', blue: 'bg-tint', gray: 'bg-gray', teal: 'bg-teal', indigo: 'bg-indigo', green: 'bg-green' };
  const kindOf = (a) => NA.APPROVALS[a.type] || { label: a.type, icon: 'info', tone: 'gray' };
  const statusBadge = (a) => ({
    pending: NA.ui.badge('Waiting', 'amber'), approved: NA.ui.badge('Approved', 'green'),
    rejected: NA.ui.badge('Declined', 'red'), cancelled: NA.ui.badge('Withdrawn', 'gray'),
  }[a.status] || '');

  /** A link only to a screen this person can open (Accounts cannot open Service, for example). */
  const openable = (href) => !!href && NA.canSee(String(href).replace(/^#\//, '').split(/[/?]/)[0]);

  /* One filled button per list: the first row's; the rest are tinted. */
  function approvalRow(a, mode, first) {
    const k = kindOf(a);
    const link = A.link(a);
    const title = openable(link) ? `<a href="${link}">${esc(a.title)}</a>` : esc(a.title);
    let side = '';
    if (mode === 'decide') {
      side = `<div class="ap-actions"><button class="btn btn-ghost" data-appr-act="reject" data-id="${esc(a.id)}">Decline</button><button class="btn ${first ? 'btn-primary' : 'btn-tinted'}" data-appr-act="approve" data-id="${esc(a.id)}">Approve</button></div>`;
    } else if (mode === 'mine' && a.status === 'pending') {
      side = `<button class="btn btn-ghost btn-sm" data-appr-act="withdraw" data-id="${esc(a.id)}">Withdraw</button>`;
    }
    const decided = a.status !== 'pending' && a.decidedBy
      ? ` · ${a.status === 'approved' ? 'approved' : a.status === 'rejected' ? 'declined' : 'closed'} by ${esc(a.decidedBy)} ${esc(NA.fmt.ago(a.decidedAt))}` : '';
    return `<div class="ap-item">
      <span class="ap-ico ${TONE_BG[k.tone] || 'bg-gray'}">${NA.icon(k.icon, 18)}</span>
      <div class="ap-main">
        <div class="ap-title">${title} ${mode !== 'decide' ? statusBadge(a) : ''}</div>
        ${a.detail ? `<div class="ap-detail">${esc(a.detail)}</div>` : ''}
        <div class="ap-meta">${esc(k.label)} · asked by ${esc(a.requestedBy || '—')} ${esc(NA.fmt.ago(a.createdAt))}${a.status === 'pending' ? ' · for ' + esc(A.approverText(a)) : ''}${decided}</div>
        ${a.reason ? `<div class="ap-reason">“${esc(a.reason)}”</div>` : ''}
        ${a.note && a.status !== 'pending' ? `<div class="ap-reason"><b>${a.status === 'rejected' ? 'Reason for declining' : 'Note'}:</b> ${esc(a.note)}</div>` : ''}
      </div>
      <div class="ap-side">${a.amount ? `<div class="ap-amount">${NA.fmt.money(a.amount)}</div>` : ''}${side}</div>
    </div>`;
  }

  function paymentRow(p, first) {
    const o = NA.get('orders', p.orderId);
    const what = p.method === 'Cheque' || p.method === 'Pay Order' ? 'Cheque has cleared?' : p.method === 'Cash' ? 'Cash handed over to Accounts?' : 'Money seen in the bank?';
    const jc = !o && p.jobCardId ? NA.get('jobCards', p.jobCardId) : null;
    const inv = !o && p.invoiceId ? NA.get('invoices', p.invoiceId) : null;
    const service = !o && (p.jobCardId || p.invoiceId)
      ? (openable('#/service') && p.jobCardId ? ` · <a class="btn-link" href="#/service/job/${esc(p.jobCardId)}">Service ${esc((jc && jc.code) || 'job')}</a>`
        : ` · Service ${esc((jc && jc.code) || (inv && inv.no) || 'bill')}`) : '';
    const dup = NA.biz.sameRefPayment ? NA.biz.sameRefPayment(p) : null;
    return `<div class="ap-item">
      <span class="ap-ico bg-green">${NA.icon('wallet', 18)}</span>
      <div class="ap-main">
        <div class="ap-title">${esc(p.method)}${p.ref ? ' · ' + esc(p.ref) : ''} <span class="muted small" style="font-weight:400">${esc(p.receiptNo || '')}</span></div>
        <div class="ap-detail">${esc(NA.customerName(p.customerId))}${o ? ` · <a class="btn-link" href="#/sales/${esc(o.id)}">${esc(o.code)}</a> · ${esc(NA.modelName(o.modelId))}` : ''}${service}${p.amount < 0 ? ' · refund paid out' : ''}</div>
        <div class="ap-meta">Received ${esc(NA.fmt.date(p.date))}${p.receivedBy ? ' by ' + esc(p.receivedBy) : ''} · ${esc(what)}${dup ? ` · <span class="tone-amber">same reference as ${esc(dup.receiptNo || 'another receipt')}</span>` : ''}</div>
      </div>
      <div class="ap-side"><div class="ap-amount">${NA.fmt.money(p.amount)}</div>
        <div class="ap-actions"><button class="btn btn-ghost" data-act="bounce" data-id="${esc(p.id)}">Not received</button><button class="btn ${first ? 'btn-primary' : 'btn-tinted'}" data-act="clear" data-id="${esc(p.id)}">Confirm</button></div></div>
    </div>`;
  }

  /** What happens when a payment is marked not received (the same sentences as Today and Accounts). */
  function bounceText(p) {
    const o = p.orderId ? NA.get('orders', p.orderId) : null;
    if (o) return o.stage === 'cancelled' ? 'It stops counting.' : 'It stops counting, and the consultant gets a call to collect it again.';
    if (p.invoiceId || p.jobCardId) return 'It stops counting. The bill shows as owed again, and the service desk gets a call to collect it.';
    return 'It stops counting.';
  }

  const allDone = (title, sub) => `<div class="card ap-done"><div class="ap-done-ico">${NA.icon('check', 30)}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>`;

  function rulesCard() {
    const p = NA.policy();
    const m = (n) => NA.fmt.money(n);
    const rows = [
      ['tag', 'bg-violet', 'Discount on a car', `Up to ${m(p.discountFree)} without asking · up to ${m(p.discountManager)} Sales Manager · above that Managing Director`],
      ['key', 'bg-amber', 'Car before full payment', 'Managing Director (corporate PO, bank loan on the way)'],
      ['x', 'bg-red', 'Cancel an order or refund', 'Managing Director'],
      ['users', 'bg-tint', 'Hand a customer to another consultant', 'Sales Manager'],
      ['wallet', 'bg-green', 'Customer money counts', 'Only after Accounts confirms it (cash handed over, cheque cleared)'],
      ['cart', 'bg-tint', 'Purchase order', `Managing Director, before the ${Math.round((Number(NA.db.settings.advancePct) || 0.3) * 100)}% advance. The approved order covers its supplier payments; emergency purchases always need approval`],
      ['layers', 'bg-tint', 'Parts order', `Above ${m(p.partsOrderLimit)}: Managing Director`],
      ['shield', 'bg-teal', 'Free warranty work', 'Service Manager'],
      ['wrench', 'bg-violet', 'Service discount', `Up to ${m(p.serviceDiscountFree)} without asking · up to ${m(p.serviceDiscountManager)} Service Manager · above that Managing Director`],
      ['boxes', 'bg-amber', 'Stock write-off or count correction', 'Managing Director'],
      ['receipt', 'bg-gray', 'Expenses', `Up to ${m(p.expenseFree)} without asking · up to ${m(p.expenseAccounts)} Accounts · above that Managing Director`],
      ['calendar', 'bg-teal', 'Leave', 'Admin & HR (their own leave: Managing Director)'],
      ['hr', 'bg-indigo', 'Monthly payroll', 'Managing Director'],
    ];
    return `<section class="ap-rules"><div class="glist-title">Who approves what</div>
      <div class="glist">${rows.map(([ic, bg, t, d]) => `<div class="gl-row has-icon"><span class="gl-icon ${bg}">${NA.icon(ic, 17)}</span><div class="gl-main"><b>${esc(t)}</b><small>${esc(d)}</small></div></div>`).join('')}</div>
      <p class="glist-foot">${NA.can('settings.policy') ? 'Change the limits in Settings → Approval rules.' : 'The Managing Director sets these limits.'}</p></section>`;
  }

  NA.page({
    path: 'approvals', title: 'Approvals', icon: 'inbox',
    render(root, params, query) {
      injectCss();
      const forMe = A.pendingForMe();
      const canVerify = NA.can('payments.verify');
      const money = canVerify ? NA.biz.paymentsToVerify() : [];
      const mine = A.mine();
      const decidedAll = (NA.db.approvals || []).filter((a) => a.status === 'approved' || a.status === 'rejected')
        .sort((x, y) => String(y.decidedAt || y.updatedAt).localeCompare(String(x.decidedAt || x.updatedAt)));
      const tabs = [
        { key: 'for', label: 'For you', count: forMe.length },
        canVerify ? { key: 'money', label: 'Money to confirm', count: money.length } : null,
        { key: 'mine', label: 'Your requests', count: mine.filter((a) => a.status === 'pending').length || null },
        NA.isManager() || NA.isRole('accounts', 'service_manager', 'hr') ? { key: 'history', label: 'History' } : null,
      ].filter(Boolean);
      let tab = query.tab && tabs.some((t) => t.key === query.tab) ? query.tab
        : forMe.length ? 'for' : money.length ? 'money' : (tabs.find((t) => t.key === 'for') ? 'for' : tabs[0].key);

      const actions = NA.ui.btn('Request leave', { icon: 'calendar', act: 'leave' });
      let body = '';
      if (tab === 'for') {
        const total = forMe.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        body = forMe.length
          ? `<div class="card ap-list">${forMe.map((a, i) => approvalRow(a, 'decide', i === 0)).join('')}</div>
             <p class="glist-foot">${forMe.length} waiting${total ? ' · ' + NA.fmt.money(total) + ' in total' : ''} · oldest first</p>`
          : allDone('You’re all caught up', 'Nothing is waiting for your decision.');
      } else if (tab === 'money') {
        const sum = money.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        body = money.length
          ? `<div class="callout callout-info" style="margin-bottom:20px">${NA.icon('info')}<div>Customer money only counts towards “fully paid” once you confirm it here. A car cannot get its VIN or be handed over until it is 100% confirmed.</div></div>
             <div class="card ap-list">${money.map((p, i) => paymentRow(p, i === 0)).join('')}</div>
             <p class="glist-foot">${money.length} payments · ${NA.fmt.money(sum)} waiting</p>`
          : allDone('Every payment is confirmed', 'New payments recorded by the sales team will appear here.');
      } else if (tab === 'mine') {
        body = mine.length
          ? `<div class="card ap-list">${mine.slice(0, 100).map((a) => approvalRow(a, 'mine')).join('')}</div>`
          : `<div class="card pad">${NA.ui.empty('You haven’t asked for any approvals yet. When something needs a manager’s OK, the screen offers “Ask for approval”.', 'inbox')}</div>`;
      } else {
        const kind = query.kind || 'all';
        const list = decidedAll.filter((a) => kind === 'all' || a.type === kind);
        const kinds = [...new Set(decidedAll.map((a) => a.type))];
        body = `<div class="chips" style="margin-bottom:18px"><button class="chip ${kind === 'all' ? 'active' : ''}" data-kind="all">All</button>${kinds.map((k) => `<button class="chip ${kind === k ? 'active' : ''}" data-kind="${esc(k)}">${esc(A.label(k))}</button>`).join('')}</div>`
          + (list.length ? `<div class="card ap-list">${list.slice(0, 150).map((a) => approvalRow(a, 'history')).join('')}</div>`
            : `<div class="card pad">${NA.ui.empty('No decisions yet.', 'inbox')}</div>`);
      }

      root.innerHTML = `${NA.ui.pageHead({ title: 'Approvals', subtitle: 'Decisions that need a manager’s OK, in one place.', actions })}
        ${NA.ui.tabs(tabs, tab)}
        ${body}
        ${tab === 'for' || tab === 'mine' ? rulesCard() : ''}`;

      const unbind = [
        NA.ui.delegate(root, 'click', '[data-tab]', (el) => NA.go('#/approvals?tab=' + el.dataset.tab)),
        NA.ui.delegate(root, 'click', '[data-kind]', (el) => NA.go('#/approvals?tab=history&kind=' + el.dataset.kind)),
        NA.ui.delegate(root, 'click', '[data-act="leave"]', () => NA.actions.newLeave()),
        NA.ui.delegate(root, 'click', '[data-act="clear"]', (el) => {
          const p = NA.get('payments', el.dataset.id); if (!p) return;
          NA.biz.verifyPayment(p, true); NA.ui.toast('Confirmed — ' + NA.fmt.money(p.amount)); NA.refresh();
        }),
        NA.ui.delegate(root, 'click', '[data-act="bounce"]', (el) => {
          const p = NA.get('payments', el.dataset.id); if (!p) return;
          NA.ui.formModal({ title: 'Payment not received', size: 'sm', submitLabel: 'Mark as not received',
            intro: `<p class="muted" style="margin-bottom:16px">${esc(p.receiptNo || '')} · ${NA.fmt.money(p.amount)} · ${esc(NA.customerName(p.customerId))}. ${bounceText(p)}</p>`,
            fields: [{ name: 'note', label: 'What happened?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Cheque bounced — insufficient funds' }],
            onSubmit: (v) => { NA.biz.verifyPayment(p, false, v.note); NA.ui.toast('Marked as not received', 'info'); NA.refresh(); } });
        }),
      ];
      return () => unbind.forEach((u) => u());
    },
  });

  /* ------------------------------------------------------------------------
     Leave: anyone asks, Admin & HR approves. Approved leave is shown in
     People → Leave and counted as paid leave there.
     ------------------------------------------------------------------------ */
  const LEAVE_TYPES = [
    { value: 'Casual', label: 'Casual', icon: 'sun', hint: '10 days a year' },
    { value: 'Sick', label: 'Sick', icon: 'shield', hint: '14 days a year' },
    { value: 'Annual', label: 'Annual', icon: 'calendar', hint: 'Earned leave' },
    { value: 'Unpaid', label: 'Unpaid', icon: 'clock', hint: 'Without pay' },
  ];
  NA.LEAVE_TYPES = LEAVE_TYPES;
  /** Working days between two dates (Friday is the weekly holiday). */
  NA.leaveDays = (from, to) => {
    if (!from || !to || to < from) return 0;
    let n = 0;
    for (let d = from; d <= to; d = NA.addDays(d, 1)) if (!NA.isHoliday(d)) n++;
    return n;
  };

  NA.actions = NA.actions || {};
  NA.actions.newLeave = function (prefill) {
    const me = NA.me();
    if (!me.staffId) return NA.ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error');
    NA.ui.formModal({
      title: 'Request leave', size: 'md', submitLabel: 'Send request',
      intro: `<p class="muted" style="margin-bottom:18px">Admin & HR will approve it. You’ll see the answer in Approvals → Your requests.</p>`,
      fields: [
        { name: 'type', label: 'Type', type: 'radio-cards', options: LEAVE_TYPES, required: true, span: 2 },
        { name: 'from', label: 'From', type: 'date', required: true, min: NA.addDays(NA.today(), -7) },
        { name: 'to', label: 'To (last day of leave)', type: 'date', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', rows: 2, span: 2, placeholder: 'Optional' },
      ],
      values: Object.assign({ type: 'Casual', from: NA.today(), to: NA.today() }, prefill || {}),
      onSubmit: (v) => {
        if (v.to < v.from) { NA.ui.toast('The last day is before the first day', 'error'); return false; }
        const days = NA.leaveDays(v.from, v.to);
        if (!days) { NA.ui.toast('Those dates are all holidays', 'error'); return false; }
        const clash = (NA.db.leaves || []).find((l) => l.staffId === me.staffId && ['pending', 'approved'].includes(l.status || 'pending') && l.from <= v.to && l.to >= v.from);
        if (clash) { NA.ui.toast(`You already have ${clash.status === 'approved' ? 'approved' : 'a request for'} leave ${NA.fmt.date(clash.from)} – ${NA.fmt.date(clash.to)} on some of these days`, 'error'); return false; }
        const lv = NA.insert('leaves', { staffId: me.staffId, staffName: me.name, type: v.type, from: v.from, to: v.to, days, reason: v.reason || '', status: 'pending' });
        // Admin & HR approve leave, but not their own: that waits for the Managing Director.
        const hrOwn = NA.isRole('hr');
        const a = A.request({ type: 'leave', ref: { c: 'leaves', id: lv.id, code: '' }, amount: 0,
          title: `${me.name}: ${days} day${days === 1 ? '' : 's'} ${v.type.toLowerCase()} leave`,
          detail: `${NA.fmt.date(v.from)} – ${NA.fmt.date(v.to)}`, reason: v.reason || '', selfApprove: hrOwn ? false : undefined });
        if (a.status === 'approved') NA.update('leaves', lv.id, { status: 'approved', decidedBy: a.decidedBy, decidedAt: a.decidedAt });
        NA.ui.toast(a.status === 'approved' ? 'Leave recorded' : hrOwn ? 'Leave request sent to the Managing Director' : 'Leave request sent to Admin & HR');
        NA.refresh();
      },
    });
  };

  // Keep the leave record in step with the decision (runs in the approver's browser).
  A.onDecide('leave', (a, decision) => {
    if (a.refC !== 'leaves' || !NA.get('leaves', a.refId)) return;
    const status = { approved: 'approved', rejected: 'rejected', cancelled: 'cancelled' }[decision] || 'pending';
    NA.update('leaves', a.refId, { status, decidedBy: NA.me().name, decidedAt: new Date().toISOString(), note: a.note || '' });
  });
})();
