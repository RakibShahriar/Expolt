/* ==========================================================================
   app.js — application shell: sidebar, top bar, global search, the "New"
   menu, the person menu, the phone tab bar and start-up.
   Loaded last, after core.js, access.js, approvals.js, seed.js, sync.js and
   every page file. Everyone only sees the parts of the app their role uses.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const { esc } = NA;

  const openLead = (l) => !['won', 'lost'].includes(l.stage);
  /** Approvals waiting for me plus (for Accounts) money waiting to be confirmed. */
  NA.inboxCount = () => {
    let n = NA.approvals ? NA.approvals.countForMe() : 0;
    if (NA.can('payments.verify') && NA.biz.paymentsToVerify) n += NA.biz.paymentsToVerify().length;
    return n;
  };

  /* Sidebar. `count` returns a number (or {n, alert}) shown on the right. */
  const NAV = [
    { section: 'dashboard', label: 'Today', icon: 'home', perm: 'see.today' },
    { section: 'approvals', label: 'Approvals', icon: 'inbox', perm: 'see.approvals', count: () => { const n = NA.inboxCount(); return n ? { n, alert: true } : null; } },
    { group: 'Sales' },
    { section: 'leads', label: 'Leads', icon: 'user-plus', count: () => NA.where('leads', openLead).length },
    { section: 'customers', label: 'Customers', icon: 'users' },
    { section: 'sales', label: 'Orders', icon: 'receipt', count: () => NA.where('orders', (o) => !['delivered', 'cancelled'].includes(o.stage)).length },
    { group: 'Stock' },
    { section: 'inventory', label: 'Vehicles', icon: 'car', count: () => NA.where('vehicles', (v) => v.status === 'available').length },
    { section: 'procurement', label: 'Purchasing', icon: 'cart', count: () => NA.where('purchaseOrders', (p) => !['closed', 'received', 'cancelled'].includes(p.stage)).length },
    { group: 'After-sales' },
    { section: 'service', label: 'Service', icon: 'wrench', count: () => NA.where('jobCards', (j) => ['open', 'in_progress'].includes(j.status)).length },
    { section: 'parts', label: 'Parts', icon: 'cog-parts', count: () => { const n = NA.where('parts', (p) => NA.biz.partLow(p)).length; return n ? { n, alert: true } : null; } },
    { group: 'Office' },
    { section: 'finance', label: 'Accounts', icon: 'chart' },
    { section: 'admin', label: 'People', icon: 'briefcase' },
    { section: 'reports', label: 'Reports', icon: 'pie' },
    { group: ' ' },
    { section: 'process', label: 'How we work', icon: 'flow' },
    { section: 'settings', label: 'Settings', icon: 'cog' },
  ];
  const visibleNav = () => {
    const items = NAV.filter((n) => n.group || (NA.pages[n.section] && NA.canSee(n.section)));
    // Drop group headings with nothing under them.
    return items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  };
  NA.navAllowed = (section) => NAV.some((n) => n.section === section && NA.canSee(n.section));

  function countOf(n) {
    let c = null;
    try { c = n.count ? n.count() : null; } catch (e) { c = null; }
    if (typeof c === 'number') c = c ? { n: c } : null;
    return c;
  }

  /* Tell people when something new needs them, or when their own request was decided. */
  let lastInbox = null, lastMine = null;
  function notices() {
    const n = NA.inboxCount();
    if (lastInbox !== null && n > lastInbox) NA.ui.toast(n - lastInbox === 1 ? 'A new request is waiting for you in Approvals' : (n - lastInbox) + ' new requests are waiting for you in Approvals', 'info');
    lastInbox = n;
    const mine = new Map((NA.approvals ? NA.approvals.mine() : []).map((a) => [a.id, a.status]));
    if (lastMine) mine.forEach((st, id) => {
      if (lastMine.get(id) === 'pending' && (st === 'approved' || st === 'rejected')) {
        const a = NA.get('approvals', id);
        NA.ui.toast(`${a ? NA.approvals.label(a.type) : 'Your request'} ${st === 'approved' ? 'approved' : 'declined'}${a && a.decidedBy ? ' by ' + a.decidedBy : ''}`, st === 'approved' ? 'success' : 'error');
      }
    });
    lastMine = mine;
  }

  function renderNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    try { notices(); } catch (e) { /* never block drawing */ }
    const active = NA.currentRoute().section;
    const me = NA.me();
    const foot = document.querySelector('.sidebar-foot');
    const key = me.name + '|' + me.role;
    if (foot && foot.dataset.user !== key) {
      foot.dataset.user = key;
      foot.innerHTML = `${NA.ui.avatar(me.name, 34)}<div><b>${esc(me.name)}</b><span class="muted">${esc(NA.roleLabel(me.role))}</span></div>`;
    }
    nav.innerHTML = visibleNav().map((n) => {
      if (n.group) return `<div class="nav-group">${esc(n.group.trim() ? n.group : '')}</div>`;
      const c = countOf(n);
      return `<a href="#/${n.section}" data-section="${n.section}" class="${n.section === active ? 'active' : ''}">${NA.icon(n.icon, 18)}<span>${esc(n.label)}</span>${c ? `<span class="count ${c.alert ? 'alert' : ''}">${c.n}</span>` : ''}</a>`;
    }).join('');
    renderTabbar(active);
  }

  /* Phone tab bar: Today, the two screens this role uses most, Approvals, More. */
  const TAB_PRIORITY = ['leads', 'sales', 'service', 'finance', 'procurement', 'inventory', 'admin', 'customers', 'parts', 'reports'];
  function renderTabbar(active) {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    const main = TAB_PRIORITY.filter((s) => NA.pages[s] && NA.canSee(s)).slice(0, 2);
    const items = [NAV[0]].concat(main.map((s) => NAV.find((n) => n.section === s)), [NAV[1]]);
    bar.innerHTML = items.map((n) => {
      const c = n.section === 'approvals' ? countOf(n) : null;
      return `<a href="#/${n.section}" class="${n.section === active ? 'active' : ''}">${NA.icon(n.icon, 24)}<span>${esc(n.label)}</span>${c ? `<span class="count alert">${c.n}</span>` : ''}</a>`;
    }).join('') + `<a href="javascript:void 0" data-more>${NA.icon('menu', 24)}<span>More</span></a>`;
  }

  function shell() {
    document.getElementById('app').innerHTML = `
      <aside class="sidebar">
        <div class="brand">
          <a href="#/dashboard"><img class="noor logo-ink" src="assets/noor-logo.png" alt="Noor Autos & Imports Ltd"/></a>
          <div class="byd"><img src="assets/byd-logo.png" alt="BYD"/> Authorized dealer</div>
        </div>
        <nav class="nav"></nav>
        <div class="sidebar-foot clickable" title="You · appearance · sign out"></div>
      </aside>
      <div class="content">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${NA.icon('menu')}</button>
          <div class="search">${NA.icon('search', 17)}
            <input id="globalSearch" type="search" placeholder="Search" aria-label="Search customers, phones, VINs, orders, job cards" autocomplete="off"/>
            <kbd>/</kbd>
            <div class="search-results hidden" id="searchResults"></div>
          </div>
          <div class="topbar-right">
            ${NA.sync.on ? '<span id="syncChip" class="sync-chip"></span>' : ''}
            <div style="position:relative">
              <button class="btn btn-primary btn-pill" id="quickBtn">${NA.icon('plus', 16)}New</button>
              <div class="search-results menu-list hidden" id="quickMenu" style="left:auto;right:0;width:280px"></div>
            </div>
          </div>
        </header>
        <main id="main"></main>
      </div>
      <nav class="tabbar" id="tabbar"></nav>`;
    renderNav();
    wireSearch();
    wireQuick();
    const foot = document.querySelector('.sidebar-foot');
    foot.onclick = () => personMenu();
    if (NA.sync.on) NA.sync.drawChip();
    const app = document.getElementById('app');
    document.getElementById('menuBtn').onclick = () => app.classList.toggle('nav-open');
    document.querySelector('.nav').addEventListener('click', (e) => { if (e.target.closest('a')) app.classList.remove('nav-open'); });
    app.addEventListener('click', (e) => {
      if (e.target === app && app.classList.contains('nav-open')) app.classList.remove('nav-open');
      if (e.target.closest('[data-more]')) { e.preventDefault(); app.classList.add('nav-open'); }
    });
    // Tapping the dimmed area closes the menu on phones.
    document.addEventListener('click', (e) => {
      if (app.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#menuBtn') && !e.target.closest('[data-more]')) app.classList.remove('nav-open');
    });
  }

  /* ---------- Appearance (per computer) ---------- */
  const THEME_KEY = 'noor-dms-theme';
  NA.theme = {
    get: () => { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } },
    set: (t) => {
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* private window */ }
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    },
  };

  /* ---------- The person menu ---------- */
  function personMenu() {
    const me = NA.me();
    const t = NA.theme.get();
    const shared = NA.sync.on;
    NA.ui.modal({
      title: me.name, size: 'sm', subtitle: esc(NA.roleLabel(me.role)) + (shared ? ' · signed in' : ' · this computer'),
      body: `<div class="stack" style="gap:20px">
        <div><div class="glist-title">Appearance</div>
          <div class="seg" data-theme-seg style="width:100%;display:flex">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" style="flex:1;justify-content:center" class="${t === k ? 'active' : ''}" data-theme="${k}">${l}</button>`).join('')}</div></div>
        ${NA.preview ? `<div class="callout callout-info">${NA.icon('eye-off')}<div>You are previewing the app as <b>${esc(NA.preview.name)}</b>. Nothing you do is saved.</div></div>` : ''}
        ${NA.isRole('owner') && !NA.preview ? `<div><div class="glist-title">See the app as someone else</div>
          <div class="row" style="gap:10px"><div class="field grow"><select data-preview-staff>${NA.db.staff.filter((x) => x.active !== false && x.id !== me.staffId).map((x) => `<option value="${esc(x.id)}">${esc(x.name)} · ${esc(NA.roleLabel(NA.roleForTitle(x.role)))}</option>`).join('')}</select></div>
          <button type="button" class="btn btn-ghost" data-preview-go>View</button></div>
          <p class="glist-foot" style="margin-left:0">Shows exactly what that person can see and do. Nothing is saved while you look.</p></div>` : ''}
        ${shared ? `<div><div class="glist-title">Online now</div><div class="glist"><div class="gl-row"><span class="gl-main small">${esc(NA.sync.online.join(', ') || me.name)}</span></div></div></div>
        <form class="modal-form" onsubmit="return false"><div class="glist-title">Change my PIN</div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><input type="password" name="old" inputmode="numeric" maxlength="8" placeholder="Current PIN" autocomplete="current-password"/></div>
            <div class="field"><input type="password" name="pin" inputmode="numeric" maxlength="8" placeholder="New PIN" autocomplete="new-password"/></div>
          </div><button class="btn btn-ghost btn-sm mt-12" data-pin>Change PIN</button></form>` : `<p class="small muted">On one computer the app runs as the Managing Director. Run the shared server to give each person their own sign-in and their own view.</p>`}
      </div>`,
      actions: NA.preview ? [{ label: 'Exit preview', kind: 'primary', onClick: () => { NA.endPreview(); return false; } }]
        : shared ? [{ label: 'Sign out', kind: 'danger', icon: 'logout', onClick: () => { NA.sync.signOut(); return false; } }, { label: 'Done', kind: 'primary' }] : [{ label: 'Done', kind: 'primary' }],
      onMount: (el) => {
        el.querySelectorAll('[data-theme]').forEach((b) => { b.onclick = () => { NA.theme.set(b.dataset.theme); el.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('active', x === b)); }; });
        const go = el.querySelector('[data-preview-go]');
        if (go) go.onclick = () => { const id = el.querySelector('[data-preview-staff]').value; NA.ui.closeTop(); setTimeout(() => NA.previewAs(id), 200); };
        // Label each person with the role they really sign in with (it can differ from the job title).
        const pick = el.querySelector('[data-preview-staff]');
        if (pick && NA.signInRoles) NA.signInRoles().then((roles) => Array.from(pick.options).forEach((o) => {
          const st = NA.get('staff', o.value);
          if (st && roles[st.id]) o.textContent = st.name + ' · ' + NA.roleLabel(roles[st.id]);
        }));
        const pinBtn = el.querySelector('[data-pin]');
        if (pinBtn) pinBtn.onclick = async () => {
          const f = el.querySelector('form');
          try { await NA.sync.api('api/me/pin', { old: f.old.value.trim(), pin: f.pin.value.trim() }); NA.ui.toast('PIN changed'); f.reset(); }
          catch (e) { NA.ui.toast(e.message, 'error'); }
        };
      },
    });
  }
  NA.personMenu = personMenu;

  /* ---------- Search ---------- */
  function wireSearch() {
    const input = document.getElementById('globalSearch');
    const box = document.getElementById('searchResults');
    let sel = 0, results = [];
    const draw = () => {
      if (!input.value.trim()) { box.classList.add('hidden'); return; }
      results = NA.search(input.value);
      box.classList.remove('hidden');
      box.innerHTML = results.length
        ? results.map((r, i) => `<a href="${r.href}" class="${i === sel ? 'sel' : ''}">${NA.icon(r.icon, 18)}<div style="min-width:0"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.sub)}</div></div><span class="type">${esc(r.type)}</span></a>`).join('')
        : `<div class="empty" style="padding:22px">${NA.icon('search', 22)}<p>No results for “${esc(input.value)}”</p></div>`;
    };
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter' && results[sel]) { location.hash = results[sel].href; input.value = ''; box.classList.add('hidden'); input.blur(); }
      if (e.key === 'Escape') { input.value = ''; box.classList.add('hidden'); input.blur(); }
    });
    box.addEventListener('click', () => { input.value = ''; box.classList.add('hidden'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !document.querySelector('.overlay')) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------- "New" menu: page modules expose these on NA.actions ---------- */
  const QUICK = [
    { label: 'Lead', icon: 'user-plus', action: 'newLead', fallback: '#/leads', perm: 'leads.create' },
    { label: 'Sales order', icon: 'receipt', action: 'newOrder', fallback: '#/sales', perm: 'orders.create' },
    { label: 'Customer payment', icon: 'wallet', action: 'recordPayment', fallback: '#/sales', perm: 'payments.record' },
    { sep: true },
    { label: 'Purchase order', icon: 'cart', action: 'newPO', fallback: '#/procurement', perm: 'po.manage' },
    { label: 'Emergency purchase', icon: 'bolt', action: 'newEmergencyPO', fallback: '#/procurement', perm: 'po.manage' },
    { sep: true },
    { label: 'Service booking', icon: 'calendar', action: 'newServiceBooking', fallback: '#/service', perm: 'service.manage' },
    { label: 'Job card', icon: 'wrench', action: 'newJobCard', fallback: '#/service', perm: 'service.manage' },
    { sep: true },
    { label: 'Expense', icon: 'receipt', action: 'newExpense', fallback: '#/finance', perm: 'expenses.record' },
    { label: 'Leave request', icon: 'calendar', action: 'newLeave', fallback: '#/approvals', perm: 'leave.request' },
  ];
  NA.actions = NA.actions || {};

  function wireQuick() {
    const btn = document.getElementById('quickBtn');
    const menu = document.getElementById('quickMenu');
    const draw = () => {
      const items = QUICK.filter((q) => q.sep || (NA.can(q.perm) && (typeof NA.actions[q.action] === 'function' || NA.navAllowed(q.fallback.slice(2)))));
      // Collapse repeated / leading / trailing separators.
      const clean = items.filter((q, i) => !q.sep || (i > 0 && !items[i - 1].sep && i < items.length - 1));
      menu.innerHTML = `<div class="menu-label">Create new</div>` + clean.map((q) => q.sep ? '<div class="menu-sep"></div>'
        : `<button data-q="${QUICK.indexOf(q)}">${NA.icon(q.icon, 18)}<span>${esc(q.label)}</span></button>`).join('');
    };
    btn.onclick = (e) => { e.stopPropagation(); draw(); menu.classList.toggle('hidden'); };
    document.addEventListener('click', (e) => { if (!e.target.closest('#quickMenu') && !e.target.closest('#quickBtn')) menu.classList.add('hidden'); });
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('[data-q]'); if (!a) return;
      const q = QUICK[+a.dataset.q];
      menu.classList.add('hidden');
      if (typeof NA.actions[q.action] === 'function') NA.actions[q.action]();
      else NA.go(q.fallback);
    });
  }

  /* A bar across the top while the Managing Director previews someone's view. */
  NA.on('preview', (p) => {
    let el = document.getElementById('previewBar');
    if (!el) { el = document.createElement('div'); el.id = 'previewBar'; el.className = 'preview-bar'; document.body.appendChild(el); }
    el.innerHTML = `${NA.ui.avatar(p.name, 26)}<span>Viewing as <b>${esc(p.name)}</b> · ${esc(NA.roleLabel(p.role))} · nothing is saved</span><button class="btn btn-sm btn-pill" data-end-preview>Exit</button>`;
    el.querySelector('[data-end-preview]').onclick = NA.endPreview;
    const chip = document.getElementById('syncChip');
    if (chip) chip.remove();
  });

  /* Re-render the page and the counts whenever data changes (debounced). */
  let pending = false;
  NA.refresh = () => {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; renderNav(); NA.render(); });
  };
  NA.on('rendered', () => renderNav());

  /* Keep people on screens their role may use. */
  NA.on('rendered', ({ section }) => {
    if (NA.pages[section] && !NA.canSee(section) && section !== 'dashboard') {
      NA.ui.toast('That screen is not part of your role', 'info');
      location.hash = '#/dashboard';
    }
  });

  /** Bring older data up to date (new lists, owners on sales records, approval rules). */
  function upgradeData() {
    NA.COLLECTIONS.forEach((c) => { if (!Array.isArray(NA.db[c])) NA.db[c] = []; });
    if (NA.me().role === 'owner') {
      const n = NA.migrateOwners(NA.db);
      let changed = n > 0;
      if (!NA.db.settings.policy) { NA.db.settings.policy = NA.defaultPolicy(); changed = true; }
      if (!NA.db.settings.policyStart) { NA.db.settings.policyStart = NA.today(); changed = true; }
      if (changed) NA.save();
    }
  }

  async function boot() {
    NA.theme.set(NA.theme.get());
    if (await NA.sync.detect()) {
      // Opened from the office server: sign in and load the shared data.
      try { if (!(await NA.sync.boot())) return; }
      catch (e) { document.getElementById('app').innerHTML = `<div class="auth-screen"><div class="auth-card card"><h2>Cannot load the shared data</h2><p class="muted">${esc(e.message)}</p><button class="btn btn-primary btn-block mt-24" onclick="location.reload()">Try again</button></div></div>`; return; }
    } else {
      const had = NA.load();
      const demo = !!(NA.sync.status && NA.sync.status.demo);   // online with no database connected yet
      if (!had) { NA.reset(demo); NA.ui.toast(demo ? 'Demo system with sample data. Changes stay in this browser only' : 'A new, empty system. Start in Settings: company details, then car models and prices', 'info'); }
    }
    upgradeData();
    shell();
    if (!location.hash) location.hash = '#/dashboard';
    NA.render();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
