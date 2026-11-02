/* ==========================================================================
   sync.js — shared multi-user mode.

   When the app is opened from the office server (server.py) instead of by
   double-clicking index.html, data lives in the server's database and every
   staff member works on the same records, live:

     * people sign in with their name and a PIN;
     * every save sends only what changed (record by record, field by field),
       so two people editing different parts of the same order don't clash;
     * every few seconds the app pulls in what others have changed;
     * document numbers (LD-0007, SO-0012 …) come from the server, so two
       people can never get the same number.

   Opened from file:// (no server), the app keeps working exactly as before,
   with data in this browser only.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const { esc } = NA;
  const POLL_MS = 2500;
  const SEP = '\u0001';
  const LOCAL_KEY = 'noor-autos-dms-v1';

  const S = NA.sync = { on: false, me: null, rev: 0, epoch: null, online: [], state: 'connecting', unsent: 0 };

  let snap = new Map();   // key -> JSON of the record as the server last confirmed it
  let syncedDb = null;    // the NA.db object the snapshot belongs to
  let busy = false, again = false, localCodes = false, refreshWanted = false;

  const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  const stripLocal = (settings) => { const s = Object.assign({}, settings); delete s.currentUser; return s; };

  /* ------------------------------------------------------------------ HTTP */
  async function api(path, body) {
    const opts = body === undefined
      ? { cache: 'no-store', credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-NA': '1' }, body: JSON.stringify(body) };
    const r = await fetch(path, opts);
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) { const err = new Error((j && j.error) || 'Server error ' + r.status); err.status = r.status; throw err; }
    return j;
  }
  /* Blocking request, for the few places that need an answer before carrying on. */
  function apiNow(path, body) {
    const x = new XMLHttpRequest();
    x.open('POST', path, false);
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('X-NA', '1');
    x.send(JSON.stringify(body));
    let j = null;
    try { j = JSON.parse(x.responseText); } catch (e) { /* not JSON */ }
    if (x.status < 200 || x.status >= 300) { const err = new Error((j && j.error) || 'Server error ' + x.status); err.status = x.status; throw err; }
    return j;
  }
  S.api = api;

  /** Who else already has this mobile number (customer or lead)? Works for every role without exposing records. */
  NA.lookupMobile = async function (mobile) {
    const d = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (d.length < 8) return [];
    if (S.on) { try { return (await api('api/lookup', { mobile: d })).matches || []; } catch (e) { return []; } }
    const out = [];
    [['customers', 'customer'], ['leads', 'lead']].forEach(([c, kind]) => NA.db[c].forEach((r) => {
      if (String(r.mobile || '').replace(/\D/g, '').slice(-10) !== d) return;
      const owner = r.ownerId || r.consultantId || null;
      out.push({ kind, id: r.id, name: r.name, stage: r.stage || null, ownerId: owner, ownerName: owner ? NA.staffName(owner) : 'nobody yet', mine: !!owner && owner === NA.myStaffId() });
    }));
    return out;
  };

  /** Was this cheque / transfer reference used on another receipt (anyone's)? Returns [{id, receiptNo, date, amount, method, status}]. */
  NA.lookupPaymentRef = async function (ref) {
    const key = String(ref || '').replace(/\s+/g, '').toUpperCase();
    if (key.length < 3) return [];
    if (S.on) { try { return (await api('api/lookup-ref', { ref: key })).matches || []; } catch (e) { return []; } }
    return NA.db.payments.filter((p) => String(p.ref || '').replace(/\s+/g, '').toUpperCase() === key)
      .map((p) => ({ id: p.id, receiptNo: p.receiptNo, date: p.date, amount: p.amount, method: p.method, status: p.status }));
  };

  /* ------------------------------------------------------- change tracking */
  /** Flatten the data into one entry per record (collections) or per document (settings, meta, payroll…). */
  function entries(db) {
    const out = new Map();
    Object.keys(db).forEach((key) => {
      const v = db[key];
      if (key === 'counters' || v === undefined) return;   // numbering is owned by the server
      if (Array.isArray(v)) v.forEach((r) => { if (r && r.id != null) out.set(key + SEP + r.id, { c: key, id: String(r.id), v: r }); });
      else out.set('_doc' + SEP + key, { c: '_doc', id: key, v: key === 'settings' ? stripLocal(v) : v });
    });
    return out;
  }

  /** Stock counts travel as increments, so two people moving the same part at once both count. */
  const COUNTERS = { parts: ['onHand', 'reserved'] };
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  function fieldChanges(oldObj, cur, c) {
    const set = {}, unset = [], inc = {};
    const counters = (c && COUNTERS[c]) || [];
    Object.keys(cur).forEach((f) => {
      if (cur[f] === undefined || JSON.stringify(cur[f]) === JSON.stringify(oldObj[f])) return;
      if (counters.includes(f) && isNum(cur[f]) && isNum(oldObj[f])) inc[f] = cur[f] - oldObj[f];
      else set[f] = cur[f];
    });
    Object.keys(oldObj).forEach((f) => { if (!(f in cur) || cur[f] === undefined) unset.push(f); });
    return { set, unset, inc };
  }
  /** Put this browser's unsent edits back on top of a newer copy from the server. */
  function reapply(cur, mine) {
    Object.assign(cur, mine.set);
    mine.unset.forEach((f) => delete cur[f]);
    Object.keys(mine.inc || {}).forEach((f) => { cur[f] = (isNum(cur[f]) ? cur[f] : 0) + mine.inc[f]; });
  }

  function diff() {
    const cur = entries(NA.db);
    const changes = [];
    cur.forEach((e, k) => {
      const json = JSON.stringify(e.v);
      const old = snap.get(k);
      if (old === json) return;
      const ch = { k, json, c: e.c, id: e.id };
      const o = old === undefined ? undefined : JSON.parse(old);
      if (isObj(o) && isObj(e.v)) {
        Object.assign(ch, fieldChanges(o, e.v, e.c));
        // Same fields, only in another order (a copy merged here or by the server): nothing to send.
        if (!Object.keys(ch.set).length && !ch.unset.length && !Object.keys(ch.inc).length) { snap.set(k, json); return; }
      } else ch.put = e.v;
      changes.push(ch);
    });
    snap.forEach((json, k) => {
      if (cur.has(k)) return;
      const i = k.indexOf(SEP);
      changes.push({ k, c: k.slice(0, i), id: k.slice(i + 1), del: true });
    });
    return changes;
  }
  const wire = (ch) => (ch.del ? { c: ch.c, id: ch.id, del: true } : 'put' in ch ? { c: ch.c, id: ch.id, put: ch.put }
    : { c: ch.c, id: ch.id, set: ch.set, unset: ch.unset.length ? ch.unset : undefined, inc: ch.inc && Object.keys(ch.inc).length ? ch.inc : undefined });

  function rebuildSnapshot() {
    snap = new Map();
    entries(NA.db).forEach((e, k) => snap.set(k, JSON.stringify(e.v)));
    syncedDb = NA.db;
  }

  function replaceInPlace(target, src) {
    Object.keys(target).forEach((f) => { if (!(f in src)) delete target[f]; });
    Object.assign(target, src);
  }

  /** Bring one record from the server into NA.db, keeping any edits made here that have not been sent yet. */
  function applyRemote(rc, sent) {
    const k = rc.c + SEP + rc.id;
    const json = rc.data == null ? null : JSON.stringify(rc.data);
    const external = sent.get(k) !== json;
    const base = snap.get(k);

    if (rc.c === '_doc') {
      const cur = NA.db[rc.id];
      if (json == null) { delete NA.db[rc.id]; snap.delete(k); return external; }
      let val = rc.data;
      if (rc.id === 'settings') val = Object.assign(NA.defaultSettings(), val, { currentUser: S.me.name });
      // The snapshot is what this browser now holds from the server: for settings that includes the defaults merged in
      // here, so they are not sent back as a change (every browser merges the same defaults).
      const synced = rc.id === 'settings' && isObj(val) ? JSON.stringify(stripLocal(val)) : json;
      if (isObj(cur) && isObj(val)) {
        const mine = base !== undefined ? fieldChanges(JSON.parse(base), rc.id === 'settings' ? stripLocal(cur) : cur) : null;
        replaceInPlace(cur, val);
        if (mine) reapply(cur, mine);
      } else NA.db[rc.id] = val;
      snap.set(k, synced);
      return external;
    }

    const arr = NA.db[rc.c] || (NA.db[rc.c] = []);
    const i = arr.findIndex((r) => r && String(r.id) === rc.id);
    if (json == null) { if (i >= 0) arr.splice(i, 1); snap.delete(k); return external && i >= 0; }
    if (i < 0) { arr.unshift(rc.data); snap.set(k, json); return true; }
    const cur = arr[i];
    const mine = base !== undefined && isObj(rc.data) ? fieldChanges(JSON.parse(base), cur, rc.c) : null;
    replaceInPlace(cur, rc.data);
    if (mine) reapply(cur, mine);
    snap.set(k, json);
    return external;
  }

  /* ------------------------------------------------------------ sync loop */
  async function sync() {
    if (!S.on) return;
    if (NA.db !== syncedDb) { replaceAll(); return; }
    if (busy) { again = true; return; }
    busy = true;
    const changes = diff();
    try {
      const res = await api('api/sync', { epoch: S.epoch, since: S.rev, changes: changes.map(wire) });
      if (res.reload) {
        S.on = false;
        NA.ui.toast('The data was replaced by an administrator — reloading…', 'info');
        setTimeout(() => location.reload(), 1200);
        return;
      }
      const sent = new Map();
      changes.forEach((ch) => { if (ch.del) snap.delete(ch.k); else snap.set(ch.k, ch.json); sent.set(ch.k, ch.del ? null : ch.json); });
      let external = false;
      (res.changes || []).forEach((rc) => { if (applyRemote(rc, sent)) external = true; });
      S.rev = res.rev;
      S.online = res.online || [];
      if (res.refused) NA.ui.toast(res.refused === 1 ? 'One change was not allowed for your role and was undone' : res.refused + ' changes were not allowed for your role and were undone', 'error');
      setState('live');
      if (external) softRefresh();
    } catch (e) {
      if (e.status === 401) { S.on = false; NA.ui.toast('You were signed out — please sign in again', 'error'); setTimeout(() => location.reload(), 1500); return; }
      setState('offline');
    } finally {
      busy = false;
      if (S.on) { S.unsent = diff().length; drawChip(); }
      if (again) { again = false; setTimeout(sync, 0); }
    }
  }
  S.now = sync;

  /** Re-draw the screen with other people's changes, but never while someone is typing. */
  function softRefresh() {
    const a = document.activeElement;
    const typing = a && /input|textarea|select/i.test(a.tagName) && a.id !== 'globalSearch';
    if (typing || document.querySelector('.overlay')) { refreshWanted = true; return; }
    refreshWanted = false;
    NA.refresh();
  }

  /** Online, one request can carry only 4.5 MB, so a large data set goes up in parts. */
  function sendReplace(payload) {
    const text = JSON.stringify(payload);
    const size = S.hosted && S.hosted.maxPart;
    if (!size || text.length <= size) return apiNow('api/replace', { db: payload });
    const upload = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    let at = 0, i = 0;
    while (at < text.length) {
      let end = Math.min(at + size, text.length);
      // Never cut an emoji or similar character in two.
      const code = text.charCodeAt(end - 1);
      if (end < text.length && code >= 0xD800 && code <= 0xDBFF) end--;
      apiNow('api/replace-part', { upload, i: i++, text: text.slice(at, end) });
      at = end;
    }
    return apiNow('api/replace', { upload, n: i });
  }

  /** The whole data set was swapped here (backup restored, demo data, start fresh): send it all. */
  function replaceAll() {
    const db = NA.db;
    const payload = Object.assign({}, db, { settings: stripLocal(db.settings || {}) });
    try {
      const res = sendReplace(payload);
      S.epoch = res.epoch; S.rev = res.rev;
      db.settings = Object.assign(NA.defaultSettings(), db.settings, { currentUser: S.me.name });
      rebuildSnapshot();
    } catch (e) {
      S.on = false;
      alert((e.status === 403 ? 'Only an administrator can replace all the data.' : 'The server did not accept the data: ' + e.message) + '\n\nThe page will now reload with the current shared data.');
      location.reload();
    }
  }

  function setState(st) { if (S.state !== st) { S.state = st; drawChip(); } }
  function drawChip() {
    const el = document.getElementById('syncChip');
    if (!el || NA.preview) return;
    const others = S.online.filter((n) => n.toLowerCase() !== String(S.me && S.me.name).toLowerCase());
    if (S.state === 'offline') {
      el.className = 'sync-chip off';
      el.innerHTML = `<i></i>Offline${S.unsent ? ` · ${S.unsent} unsaved` : ''}`;
      el.title = 'Cannot reach the office server. Your changes are kept on this screen and will be saved as soon as the connection is back — do not close this tab.';
    } else {
      el.className = 'sync-chip';
      el.innerHTML = `<i></i>Live${others.length ? ` · ${others.length + 1} online` : ''}`;
      el.title = 'Connected to the office server — changes are shared with everyone.' + (S.online.length ? '\nOnline now: ' + S.online.join(', ') : '');
    }
  }
  S.drawChip = drawChip;

  /* --------------------------------------------- hooks into the data store */
  const origNextCode = NA.nextCode;
  NA.nextCode = function (prefix, pad = 4) {
    if (!S.on || localCodes) return origNextCode(prefix, pad);
    try {
      const r = apiNow('api/next-code', { prefix });
      NA.db.counters[prefix] = r.n;
      return prefix + '-' + String(r.n).padStart(pad, '0');
    } catch (e) {
      NA.ui.toast('Office server not reachable — check this document number later', 'error');
      return origNextCode(prefix, pad);
    }
  };

  const origReset = NA.reset;
  NA.reset = function (withDemo) {
    localCodes = true;   // the demo data numbers itself; the server takes the counters as a whole
    try { origReset(withDemo); } finally { localCodes = false; }
  };

  function install(res) {
    const db = res.db || {};
    NA.COLLECTIONS.forEach((c) => { if (!Array.isArray(db[c])) db[c] = []; });
    db.settings = Object.assign(NA.defaultSettings(), db.settings || {}, { currentUser: res.me.name });
    db.meta = db.meta || { version: 1 };
    db.counters = res.counters || {};
    NA.db = db;
    S.me = res.me; S.epoch = res.epoch; S.rev = res.rev; S.online = res.online || []; S.hosted = res.hosted || null;
    rebuildSnapshot();
    S.on = true; S.state = 'live';

    let timer = null;
    NA.save = () => { clearTimeout(timer); timer = setTimeout(sync, 250); };
    NA.saveNow = () => { clearTimeout(timer); if (NA.db !== syncedDb) replaceAll(); else sync(); };
    NA.load = () => true;
    // Online every check is a paid request: a tab nobody is looking at waits, unless it still has something to send.
    setInterval(() => { if (!(S.hosted && document.hidden && !diff().length)) sync(); }, (S.hosted && S.hosted.pollMs) || POLL_MS);
    setInterval(() => { if (refreshWanted) softRefresh(); }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    window.addEventListener('online', sync);
    window.addEventListener('beforeunload', (e) => {
      if (!S.on || NA.db !== syncedDb) return;
      const changes = diff();
      if (!changes.length) return;
      // Last chance to send: keepalive lets the request finish after the tab closes.
      try { fetch('api/sync', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-NA': '1' }, body: JSON.stringify({ epoch: S.epoch, since: S.rev, changes: changes.map(wire) }) }); } catch (err) { /* ignore */ }
      if (S.state === 'offline') { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------------------------------------------------------------- start */
  /** True when this page was opened from the office server. */
  S.detect = async function () {
    if (!/^https?:$/.test(location.protocol)) return false;
    try { S.status = await api('api/status'); } catch (e) {
      // A server that is there but failing (or a dropped connection online) must not fall back to an empty system in this browser.
      if (!(e.status >= 500 || (e.status === undefined && location.protocol === 'https:'))) return false;
      document.getElementById('app').innerHTML = `<div class="auth-screen"><div class="auth-card card"><h2>Cannot reach the system</h2><p class="muted">${esc(e.message)}</p><button class="btn btn-primary btn-block mt-24" onclick="location.reload()">Try again</button></div></div>`;
      return new Promise(() => {});
    }
    if (!S.status || !S.status.shared) return false;
    // From here on this browser's own saved copy must never be touched (it may be migrated at setup).
    NA.save = NA.saveNow = () => {};
    return true;
  };

  /** Sign-in / first-time setup, then load the shared data. Resolves true when the app can start. */
  S.boot = async function () {
    if (S.status.setup) { setupScreen(); return false; }
    if (!S.status.user) { await loginScreen(); return false; }
    try { install(await api('api/db')); return true; }
    catch (e) { if (e.status === 401) { await loginScreen(); return false; } throw e; }
  };

  /* --------------------------------------------------------------- screens */
  function authPage(inner, wide) {
    document.getElementById('app').innerHTML = `
      <div class="auth-screen"><div class="auth-card card${wide ? ' auth-wide' : ''}">
        <div class="auth-brand"><img class="logo-ink" src="assets/noor-logo.png" alt="Noor Autos & Imports Ltd"/><div class="byd"><img src="assets/byd-logo.png" alt="BYD"/> Authorized dealer · Bangladesh</div></div>
        ${inner}
      </div></div>`;
    return document.querySelector('.auth-card');
  }
  const minPin = () => (S.status && S.status.minPin) || 4;
  const pinField = (name, label, extra = '', placeholder = minPin() + '–8 digits') => `<div class="field">${label ? `<label>${label}</label>` : ''}<input type="password" name="${name}" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${extra || 'current-password'}" placeholder="${placeholder}" required/></div>`;
  function showError(card, msg) { const el = card.querySelector('.auth-error'); el.textContent = msg; el.classList.toggle('hidden', !msg); }

  /* Sign in like a Mac: choose yourself, then type your PIN. */
  async function loginScreen() {
    let names = [];
    try { names = (await api('api/login-names')).names || []; } catch (e) { /* show empty list */ }
    const last = (() => { try { return localStorage.getItem('noor-dms-last-user') || ''; } catch (e) { return ''; } })();
    let chosen = names.includes(last) ? last : (names.length === 1 ? names[0] : '');
    const draw = () => {
      const card = authPage(chosen ? `
        <div class="auth-me">${NA.ui.avatar(chosen, 72)}<h2>${esc(chosen)}</h2></div>
        <form class="auth-form" autocomplete="on">
          <input type="hidden" name="name" value="${esc(chosen)}"/>
          ${pinField('pin', '', 'current-password', 'Enter PIN')}
          <div class="auth-error tone-red hidden"></div>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
          ${names.length > 1 ? '<button class="btn btn-plain btn-block" type="button" data-other>Not ' + esc(chosen.split(' ')[0]) + '? Choose someone else</button>' : ''}
        </form>` : `
        <h2>Who’s signing in?</h2><p class="muted">Choose your name</p>
        <div class="auth-people">${names.map((n) => `<button type="button" class="auth-person" data-name="${esc(n)}">${NA.ui.avatar(n, 56)}<span>${esc(n)}</span></button>`).join('') || '<p class="muted small">No one can sign in yet.</p>'}</div>
        <p class="small muted auth-foot">Not on the list or forgot your PIN? Ask the Managing Director to set one for you in Settings → Sign-in and roles.</p>`, !chosen);
      if (!chosen) {
        card.querySelectorAll('[data-name]').forEach((b) => { b.onclick = () => { chosen = b.dataset.name; draw(); }; });
        return;
      }
      const form = card.querySelector('form');
      form.pin.focus();
      const other = card.querySelector('[data-other]');
      if (other) other.onclick = () => { chosen = ''; draw(); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const pin = form.pin.value.trim();
        if (!pin) return showError(card, 'Enter your PIN');
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        try {
          await api('api/login', { name: chosen, pin });
          try { localStorage.setItem('noor-dms-last-user', chosen); } catch (err) { /* ignore */ }
          location.reload();
        } catch (err) { btn.disabled = false; showError(card, err.message); form.pin.value = ''; form.pin.focus(); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      };
    };
    draw();
  }

  function browserData() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const db = raw && JSON.parse(raw);
      return db && Array.isArray(db.customers) ? db : null;
    } catch (e) { return null; }
  }

  function buildStartingData(kind) {
    if (kind === 'browser') return browserData();
    NA.reset(kind === 'demo');   // built in memory only: saving is switched off until sign-in
    return NA.db;
  }

  function setupScreen() {
    const local = browserData();
    const count = (db) => ['customers', 'orders', 'vehicles'].map((c) => `${(db[c] || []).length} ${c}`).join(', ');
    const opt = (v, title, sub, checked) => `<label class="auth-opt"><input type="radio" name="start" value="${v}" ${checked ? 'checked' : ''}/><div><b>${title}</b><small>${sub}</small></div></label>`;
    const card = authPage(`
      <h2>Set up the shared system</h2>
      <p class="muted">The office server is running for the first time. Choose the starting data and create the Managing Director’s sign-in.</p>
      <form class="auth-form">
        <div class="field"><label>Start with</label>
          ${opt('empty', 'An empty system', 'Begin entering your real business from zero.', true)}
          ${local ? opt('browser', 'The data already in this browser', 'Moves what you have entered so far onto the server (' + esc(count(local)) + ').', false) : ''}
          ${opt('demo', 'Demo data', 'A sample month of Noor Autos records, for training.', false)}
        </div>
        <div class="field"><label>Your name</label><input name="name" required maxlength="60" list="setupStaff" placeholder="e.g. Shahnoor Sanjid" autocomplete="name"/><datalist id="setupStaff"></datalist>
          <small class="help">Use the same name as in the staff list, so your work is linked to you.</small></div>
        <div class="grid grid-2">${pinField('pin', 'Choose a PIN', 'new-password')}${pinField('pin2', 'Repeat the PIN', 'new-password')}</div>
        <div class="auth-error tone-red hidden"></div>
        <button class="btn btn-primary btn-block" type="submit">Create and open the system</button>
      </form>`);
    const form = card.querySelector('form');
    const fillNames = () => {
      const kind = form.start.value;
      const staff = kind === 'browser' ? (local.staff || []) : kind === 'demo' ? [{ name: 'Shahnoor Sanjid' }] : [];
      card.querySelector('#setupStaff').innerHTML = staff.map((s) => `<option value="${esc(s.name)}">`).join('');
    };
    form.addEventListener('change', fillNames); fillNames();
    form.name.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = form.name.value.trim(), pin = form.pin.value.trim();
      if (!name) return showError(card, 'Enter your name');
      if (!/^\d{4,8}$/.test(pin) || pin.length < minPin()) return showError(card, `The PIN must be ${minPin()} to 8 digits`);
      if (pin !== form.pin2.value.trim()) return showError(card, 'The two PINs are different');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const db = buildStartingData(form.start.value);
        // The Managing Director is on the staff list from the start (an empty system has nobody yet), so their
        // sign-in is linked to a staff record like everyone else's.
        if (!(db.staff || []).some((s) => String(s.name || '').trim().toLowerCase() === name.toLowerCase())) {
          const now = new Date().toISOString();
          db.staff = (db.staff || []).concat([{ id: NA.uid(), createdAt: now, updatedAt: now, name, role: 'Managing Director', salary: 0, phone: '', joinDate: NA.today(), active: true, location: '' }]);
        }
        const payload = Object.assign({}, db, { settings: stripLocal(db.settings || {}) });
        await api('api/setup', { name, pin, db: payload });
        try { localStorage.setItem('noor-dms-last-user', name); } catch (err) { /* ignore */ }
        location.reload();
      } catch (err) { btn.disabled = false; showError(card, err.message); }
    };
  }

  /* ------------------------------------------------------------ the person menu lives in app.js */
  S.userMenu = () => NA.personMenu && NA.personMenu();

  async function signOut() {
    await sync();
    try { await api('api/logout', {}); } catch (e) { /* signed out anyway */ }
    location.reload();
  }
  S.signOut = signOut;

  /* ------------------------------------ Settings → Sign-in and roles (Managing Director / admin) */
  // The last list of sign-ins, and what the MD is typing in "Add a person": a redraw (someone else saved something)
  // shows them at once instead of flashing "Loading…" and wiping the form.
  let usersCache = null;
  const addDraft = { staffId: '', role: '', pin: '', focus: '' };
  S.accessTab = function () {
    return `<div data-access>${usersCache ? '' : '<div class="card pad muted">Loading…</div>'}</div>`;
  };
  const roleOptions = (sel) => NA.ROLE_KEYS.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${esc(NA.roleLabel(r))}</option>`).join('');
  const ROLE_HELP = {
    owner: 'Everything, and approves the big decisions',
    sales_manager: 'All leads, customers and orders · approves discounts and hand-overs',
    sales: 'Only their own leads, customers, orders and payments',
    accounts: 'Payments, supplier bills, expenses · confirms customer money',
    procurement: 'Purchase orders, vehicle stock and parts',
    service_manager: 'Runs the workshop · approves warranty jobs and service discounts',
    service: 'Service bookings, job cards, warranty and parts',
    hr: 'Staff, attendance, leave, payroll and licences',
  };
  S.wireAccessTab = async function (root) {
    const box = root.querySelector('[data-access]');
    if (!box) return;
    if (!S.me.admin) {
      box.innerHTML = `<div class="callout callout-info">${NA.icon('info')}<div><b>You are signed in as ${esc(S.me.name)} (${esc(NA.roleLabel(S.me.role))}).</b> The Managing Director adds people, sets roles and resets PINs here. To change your own PIN, click your name at the bottom of the menu.</div></div>`;
      return;
    }
    if (usersCache) drawAccess(root, box, usersCache);
    let users = [];
    try { users = (await api('api/users')).users; } catch (e) { if (!usersCache) box.innerHTML = `<div class="callout callout-warn">${NA.icon('alert')}<div>${esc(e.message)}</div></div>`; return; }
    const changed = JSON.stringify(users) !== JSON.stringify(usersCache);
    usersCache = users;
    if (!box.isConnected) return;
    // Do not redraw under someone who is typing in the form.
    if (changed && !(box.contains(document.activeElement) && document.activeElement.closest('[data-add-user]'))) drawAccess(root, box, users);
  };
  function drawAccess(root, box, users) {
    const have = new Set(users.map((u) => u.name.toLowerCase()));
    const staff = NA.db.staff.filter((s) => s.active !== false && s.name);
    const staffLeft = staff.filter((s) => !have.has(s.name.toLowerCase()));
    const staffOpt = (sel) => `<option value="">Not linked</option>` + NA.db.staff.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)} · ${esc(s.role || '')}</option>`).join('');
    box.innerHTML = `
      <div class="grid grid-main-side">
        <section>
          <div class="glist-title">People who can sign in · ${users.length}</div>
          <div class="glist">${users.map((u) => {
            const st = u.staffId && NA.get('staff', u.staffId);
            const self = u.name.toLowerCase() === S.me.name.toLowerCase();
            return `<div class="gl-row" style="align-items:flex-start;padding-top:14px;padding-bottom:14px">${NA.ui.avatar(u.name, 38)}
              <div class="gl-main"><b>${esc(u.name)} ${u.online ? NA.ui.badge('Online', 'green') : ''}</b>
                <small>${esc(ROLE_HELP[u.role] || '')}</small>
                <small>${st ? 'Staff record: ' + esc(st.name) + ' · ' + esc(st.role || '') : '<span class="tone-amber">Not linked to a staff record — their own records cannot be found</span>'} · ${u.lastSeen ? 'last active ' + esc(NA.fmt.datetime(u.lastSeen)) : 'has not signed in yet'}</small>
                <div class="row wrap mt-12" style="gap:8px">
                  <div class="field" style="width:200px"><select data-uact="role" data-name="${esc(u.name)}" ${self ? 'disabled title="Ask another administrator to change your own role"' : ''}>${roleOptions(u.role)}</select></div>
                  <div class="field" style="width:220px"><select data-uact="staff" data-name="${esc(u.name)}">${staffOpt(u.staffId)}</select></div>
                </div></div>
              <div class="row" style="gap:4px"><button class="btn btn-ghost btn-sm" data-uact="pin" data-name="${esc(u.name)}">Reset PIN</button>
              ${self ? '' : `<button class="icon-btn" data-uact="del" data-name="${esc(u.name)}" title="Remove sign-in">${NA.icon('trash', 16)}</button>`}</div></div>`;
          }).join('')}</div>
          <p class="glist-foot">Changing someone’s role or staff record signs them out, so they get the right view when they sign in again.</p>
        </section>
        <section>
          <div class="glist-title">Add a person</div>
          <form class="card pad stack" data-add-user onsubmit="return false" style="gap:16px">
            <div class="field"><label>Staff member</label><select name="staffId" required><option value="">Choose…</option>${staffLeft.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.role || '')}</option>`).join('')}</select>
              ${staffLeft.length ? '' : '<small class="help">Everyone on the staff list can already sign in. Add new people in People → Staff first.</small>'}</div>
            <div class="field"><label>Role</label><select name="role">${roleOptions('sales')}</select><small class="help" data-role-help>${esc(ROLE_HELP.sales)}</small></div>
            ${pinField('pin', 'Starting PIN', 'new-password')}
            <p class="small muted">Tell them the PIN in person; they can change it after signing in.</p>
            <button class="btn btn-primary" data-uact="add">Add person</button>
          </form>
        </section>
      </div>`;
    const reload = () => { usersCache = null; S.wireAccessTab(root); };
    const addForm = box.querySelector('[data-add-user]');
    addForm.staffId.onchange = () => { addDraft.staffId = addForm.staffId.value; const st = NA.get('staff', addForm.staffId.value); if (st) { addForm.role.value = NA.roleForTitle(st.role); addForm.role.onchange(); } };
    addForm.role.onchange = () => { addDraft.role = addForm.role.value; box.querySelector('[data-role-help]').textContent = ROLE_HELP[addForm.role.value] || ''; };
    // Bring back what was being typed before the redraw.
    if (addDraft.staffId && [...addForm.staffId.options].some((o) => o.value === addDraft.staffId)) addForm.staffId.value = addDraft.staffId;
    if (addDraft.role) { addForm.role.value = addDraft.role; box.querySelector('[data-role-help]').textContent = ROLE_HELP[addDraft.role] || ''; }
    if (addDraft.pin) addForm.pin.value = addDraft.pin;
    addForm.pin.oninput = () => { addDraft.pin = addForm.pin.value; };
    addForm.addEventListener('focusin', (e) => { addDraft.focus = e.target.name || ''; });
    addForm.addEventListener('focusout', () => { setTimeout(() => { if (!addForm.contains(document.activeElement)) addDraft.focus = ''; }, 0); });
    if (addDraft.focus && addForm[addDraft.focus] && addForm[addDraft.focus].focus) addForm[addDraft.focus].focus();
    const clearDraft = () => { addDraft.staffId = ''; addDraft.role = ''; addDraft.pin = ''; addDraft.focus = ''; };
    box.onchange = (e) => {
      const el = e.target.closest('[data-uact]'); if (!el || el.tagName !== 'SELECT' || el.closest('[data-add-user]')) return;
      const name = el.dataset.name;
      const body = el.dataset.uact === 'role' ? { name, role: el.value } : { name, staffId: el.value || '' };
      api('api/users', body).then(() => { NA.ui.toast('Saved — ' + name + ' will sign in again'); NA.log(`Sign-in for ${name}: ${el.dataset.uact === 'role' ? 'role set to ' + NA.roleLabel(el.value) : 'staff record changed'}`, { link: '#/settings?tab=access' }); reload(); })
        .catch((err) => { NA.ui.toast(err.message, 'error'); reload(); });
    };
    box.onclick = (e) => {
      const b = e.target.closest('button[data-uact]'); if (!b) return;
      const name = b.dataset.name, act = b.dataset.uact;
      if (act === 'add') {
        const st = NA.get('staff', addForm.staffId.value);
        if (!st) return NA.ui.toast('Choose a staff member', 'error');
        if (have.has(st.name.toLowerCase())) return NA.ui.toast(st.name + ' can already sign in', 'error');
        api('api/users', { name: st.name, pin: addForm.pin.value.trim(), role: addForm.role.value, staffId: st.id, create: true })
          .then(() => { NA.ui.toast(st.name + ' can now sign in'); NA.log(`Sign-in created for ${st.name} (${NA.roleLabel(addForm.role.value)})`, { link: '#/settings?tab=access' }); clearDraft(); reload(); })
          .catch((err) => NA.ui.toast(err.message, 'error'));
      } else if (act === 'pin') {
        NA.ui.modal({ title: 'New PIN for ' + name, size: 'sm', body: `<form class="modal-form" onsubmit="return false">${pinField('pin', 'New PIN', 'new-password')}</form>`,
          actions: [{ label: 'Cancel' }, { label: 'Set PIN', kind: 'primary', onClick: (el) => api('api/users', { name, pin: el.querySelector('[name=pin]').value.trim() })
            .then(() => { NA.ui.toast('PIN reset for ' + name + ' — they are signed out everywhere'); NA.log('PIN reset for ' + name, { kind: 'warn', link: '#/settings?tab=access' }); reload(); })
            .catch((err) => { NA.ui.toast(err.message, 'error'); return false; }) }] });
      } else if (act === 'del') {
        NA.ui.confirm(`Remove the sign-in for <b>${esc(name)}</b>? Their records stay; they just can’t sign in any more.`, { title: 'Remove sign-in', okLabel: 'Remove', danger: true })
          .then((ok) => ok && api('api/users/delete', { name }).then(() => { NA.log('Sign-in removed for ' + name, { kind: 'warn', link: '#/settings?tab=access' }); reload(); }).catch((err) => NA.ui.toast(err.message, 'error')));
      }
    };
  }
})();
