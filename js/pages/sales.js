/* ==========================================================================
   Orders — from booking to handing over the car (flowchart stage 2).
   Booked → Payment (Accounts confirms the money) → VIN (after 100% confirmed
   payment, or an approved "car before full payment") → BRTA registration →
   Handover → Delivered (the warranty starts automatically).
   Consultants work only their own orders; the Sales Manager, the Managing
   Director and Accounts see every order. Approvals used here: discount
   (Sales Manager / MD), car before full payment (MD), cancelling an order
   that has money or a VIN (MD).
   Routes: #/sales · #/sales?stage=<key> · #/sales?channel=<key> · #/sales/<orderId>
   Actions: NA.actions.newOrder(prefill), NA.actions.recordPayment(orderId?),
            NA.actions.printReceipt(paymentId), NA.actions.payRefund(orderId)
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;
  const esc = NA.esc;
  const ui = NA.ui;
  const B = NA.biz;
  const F = NA.fmt;
  NA.actions = NA.actions || {};

  /* ------------------------------------------------------------------------
     Constants & small helpers
     ------------------------------------------------------------------------ */
  const OPEN_STAGES = ['booking', 'payment', 'vin', 'brta', 'delivery'];
  /** Plain words for where an order is. */
  const STAGE_NAME = { booking: 'Booked', payment: 'Waiting for payment', vin: 'Ready for VIN', brta: 'Registration', delivery: 'Ready to hand over', delivered: 'Delivered', cancelled: 'Cancelled' };
  const STAGE_TONE = { booking: 'gray', payment: 'amber', vin: 'blue', brta: 'teal', delivery: 'green', delivered: 'gray', cancelled: 'red' };
  /** The stepper on an order page. */
  const STEPS = [
    { key: 'booking', label: 'Booked', icon: 'receipt' },
    { key: 'payment', label: 'Payment', icon: 'wallet' },
    { key: 'vin', label: 'VIN', icon: 'key' },
    { key: 'brta', label: 'Registration', icon: 'id-card' },
    { key: 'delivery', label: 'Handover', icon: 'car' },
    { key: 'delivered', label: 'Delivered', icon: 'check-circle' },
  ];
  const CHANNEL_SHORT = { Retail: 'Retail', Bank: 'Bank loan', Corporate: 'Corporate' };
  const CHANNEL_HINT = {
    Retail: 'The customer pays from their own money',
    Bank: 'A bank loan pays part of the price',
    Corporate: 'A company buys against its purchase order',
  };
  /** Methods that need a reference number (cheque no., transfer ref.). */
  const REF_METHODS = ['Cheque', 'Pay Order', 'RTGS', 'Bank Transfer', 'Bank Disbursement'];
  /** Board columns: booking and payment are one column ("still paying"). */
  const LANES = [
    { key: 'paying', label: 'Waiting for payment', stages: ['booking', 'payment'] },
    { key: 'vin', label: 'Ready for VIN', stages: ['vin'] },
    { key: 'brta', label: 'Registration', stages: ['brta'] },
    { key: 'delivery', label: 'Ready to hand over', stages: ['delivery'] },
  ];
  const BANKS = ['City Bank PLC', 'Eastern Bank PLC', 'BRAC Bank PLC', 'Dutch-Bangla Bank PLC', 'Standard Chartered Bangladesh', 'Prime Bank PLC', 'Mutual Trust Bank PLC', 'The Premier Bank PLC', 'IDLC Finance PLC', 'LankaBangla Finance PLC', 'IPDC Finance PLC'];
  const INSURERS = ['Green Delta Insurance', 'Pragati Insurance', 'Reliance Insurance', 'Sadharan Bima Corporation', 'Eastern Insurance', 'City General Insurance', 'Pioneer Insurance'];
  const ACCESSORIES = ['Portable charging cable (Type 2)', 'NFC card key ×2 / smart key', "Owner's manual & warranty booklet", 'Tool kit & tyre repair kit', 'Floor mats', 'Warning triangle & first-aid kit', 'Number plates fitted', 'Registration papers & tax token', 'Insurance certificate'];
  const CANCEL_REASONS = ['Customer changed mind', 'Finance / loan not approved', 'Price or budget', 'Delivery time too long', 'Chose another brand', 'Duplicate order', 'Other'];

  const COLOR_HEX = {
    'ski white': '#f4f4f1', 'cosmos black': '#17181b', 'climbing grey': '#8b9095', 'space blue': '#2c4b7a',
    'coral pink': '#e9a8a0', 'surf blue': '#4f86b8', 'urban grey': '#6c7277', 'boulder grey': '#9b9c96',
    'parkour red': '#b4202a', 'crystal white': '#f8f8f6', 'quartz blue': '#5a7fa8', 'arctic blue': '#a8c5dc',
    'aurora white': '#eef0f2', 'shadow green': '#3e5245', 'shark grey': '#5b6066', 'atlantis grey': '#4a5a66',
  };
  function colorHex(name) {
    const k = String(name || '').toLowerCase().trim();
    if (COLOR_HEX[k]) return COLOR_HEX[k];
    if (/white/.test(k)) return '#f4f4f1';
    if (/black/.test(k)) return '#18191b';
    if (/gr[ae]y|silver/.test(k)) return '#8a8f94';
    if (/blue/.test(k)) return '#3f6fa8';
    if (/red/.test(k)) return '#b3202a';
    if (/pink/.test(k)) return '#e8a7a0';
    if (/green/.test(k)) return '#3e5245';
    return '#c8ced3';
  }
  /** Paint swatch. The paint colour is product data, so it stays an inline (dynamic) value. */
  const swatch = (c, big) => `<i class="swatch${big ? ' so-sw-lg' : ''}" style="background:${colorHex(c)}"></i>`;

  const SI = (k) => STEPS.findIndex((s) => s.key === k);
  const isOpen = (o) => OPEN_STAGES.includes(o.stage);
  const bookingDate = (o) => (o.booking && o.booking.date) || String(o.createdAt || '').slice(0, 10) || NA.today();
  /** Days since booking; the count stops at delivery or cancellation. */
  const daysOpen = (o) => Math.max(0, NA.daysBetween(bookingDate(o), o.deliveredAt || (o.cancel && o.cancel.date) || NA.today()));
  const orderPayments = (o) => NA.where('payments', (p) => p.orderId === o.id)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.receiptNo).localeCompare(String(b.receiptNo)));
  const regDone = (o) => !!(o.brta && o.brta.regNo && o.brta.completedDate);
  const normMobile = (m) => String(m || '').replace(/\D/g, '').slice(-10);
  /** A mobile as it is stored: 01XXXXXXXXX (+880, spaces and dashes removed), the same as Leads and Customers. */
  const storeMobile = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('880')) d = d.slice(2); if (d.length === 10 && d[0] === '1') d = '0' + d; return d; };
  /** A cheque / transfer reference compared without spaces or case (the office server's lookup does the same). */
  const refKey = (r) => String(r || '').replace(/\s+/g, '').toUpperCase();
  const waNumber = (m) => String(m || '').replace(/\D/g, '').replace(/^0/, '880');
  const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const nowIso = () => new Date().toISOString();
  const hasAction = (name) => typeof NA.actions[name] === 'function';
  /** Corporate orders must carry the company's purchase order / award letter before anything else happens (core rule). */
  const corpDocMissing = (o) => B.corpDocMissing(o);
  const channelLabel = (ch) => CHANNEL_SHORT[ch] || ch || '—';
  /** May this person change records of collection c? (mirrors the office server: the MD, or full access). */
  const canWrite = (c) => NA.isRole('owner') || ((NA.ACCESS && NA.ACCESS[NA.role()]) || {})[c] === 'all';

  /** What is wrong with a car that stops a sale or a handover ('' = nothing). Core rule. */
  const carProblem = (v) => B.carProblem(v);
  const pdiPassed = (v) => !!(v && v.pdi && !carProblem(v));

  /* Price. The model's list price is copied onto the order (listPrice); consultants only give a discount.
     Older orders have no listPrice: their price counts as the list price. */
  const listPriceOf = (o) => Number(o.listPrice != null ? o.listPrice : o.price) || 0;
  /** Everything given off the list price: a lower price plus the discount. */
  const concessionOf = (o) => Math.max(0, listPriceOf(o) - (Number(o.price) || 0) + (Number(o.discount) || 0));
  /**
   * Core rule (B.discountOk): above the free limit a discount needs an approval, on the order or on the lead's quote.
   * An order from before the approval rules keeps its exemption only until its discount is raised (editOrder stamps
   * discountChangedAt).
   */
  const discountOk = (o) => B.discountOk(o);
  /** 'ok' | 'pending' | 'rejected' | 'none' (above the free limit and nobody has asked yet). */
  function discountState(o) {
    if (discountOk(o)) return 'ok';
    const st = NA.approvals ? NA.approvals.state('orders', o.id, 'discount', Number(o.discount) || 0) : 'none';
    return st === 'pending' || st === 'rejected' ? st : 'none';
  }
  const DISCOUNT_BLOCK = { pending: 'The discount is waiting for approval', rejected: 'The discount was not approved', none: 'The discount needs approval' };

  /* Car before full payment (core B.creditApproved also counts the old on/off switch). legacyCredit is only for its note. */
  const legacyCredit = (o) => !!(o.corporate && o.corporate.creditApproved && o.corporate.creditApprovedAt);
  const paidOrCredit = (o) => B.isFullyPaid(o) || B.creditApproved(o);

  /** Core blockers with the discount line in this screen's words (waiting / not approved / needs approval). */
  function plainBlockers(o, list) {
    const msg = discountOk(o) ? '' : DISCOUNT_BLOCK[discountState(o)] || DISCOUNT_BLOCK.none;
    const out = [];
    list.forEach((x) => {
      if (!/^The discount\b/.test(x)) out.push(x);
      else if (msg && !out.includes(msg)) out.push(msg);
    });
    if (msg && !out.includes(msg)) out.push(msg);
    return out;
  }
  /** Why the order cannot get its VIN yet (empty = it can). */
  const vinBlockersFor = (o) => plainBlockers(o, B.vinBlockers(o));
  const canGiveVin = (o) => vinBlockersFor(o).length === 0;
  /** Why the car cannot be handed over yet (empty = it can). */
  const deliveryBlockersFor = (o) => plainBlockers(o, B.deliveryBlockers(o));
  /** Ticks on the handover checklist that are still open. */
  function checklistMissing(o) {
    const d = o.delivery || {};
    const out = [];
    if (!d.handoverForm) out.push('Handover form');
    if (!d.signedAck) out.push('Signed acknowledgement');
    return out;
  }

  /** Where the order really is (core rule; the saved stage can lag behind when money is confirmed elsewhere). */
  const stageOf = (o) => B.stageOf(o);
  function stageBadge(o) {
    const k = typeof o === 'string' ? o : stageOf(o);
    return ui.badge(STAGE_NAME[k] || k || '—', STAGE_TONE[k] || 'gray');
  }
  function payTone(o) { return B.orderPaidPct(o) >= 1 ? 'green' : 'blue'; }

  /* Bank orders: the customer's own share and the bank's share are tracked apart. */
  const customerShare = (o) => Math.max(0, B.orderNet(o) - (Number(o.bank && o.bank.loanAmount) || 0));
  const customerReceived = (o) => orderPayments(o).filter((p) => p.method !== 'Bank Disbursement' && !B.paymentBounced(p) && p.kind !== 'refund')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  /** A bank-loan order still waiting for the bank's money: the customer's own share is collected apart from it. */
  const bankOpen = (o) => o.channel === 'Bank' && !!o.bank && !o.bank.rejected && !(o.bank.steps || {}).disbursement;
  const shareLeft = (o) => Math.max(0, customerShare(o) - customerReceived(o));

  /** Cars that could go to this order: same model, available, not on hold, not kept for another order. */
  function stockFor(o) {
    return NA.where('vehicles', (v) => v.modelId === o.modelId && v.status === 'available' && !carProblem(v) && (!v.reservedFor || v.reservedFor === o.id))
      .sort((a, b) => ((b.reservedFor === o.id) - (a.reservedFor === o.id)) || ((a.color === o.color ? 0 : 1) - (b.color === o.color ? 0 : 1))
        || String(a.arrivedAt || '').localeCompare(String(b.arrivedAt || '')));
  }
  const incomingFor = (o) => NA.where('vehicles', (v) => v.modelId === o.modelId && ['in_transit', 'pdi'].includes(v.status) && !v.orderId && (!v.reservedFor || v.reservedFor === o.id));
  /** Purchasing's copy of its emergency purchase, kept on the order (o.emergencyPO {id, code, stage, eta}) for people
      who receive no purchase orders (consultants). null when this person sees the purchase order itself. */
  const emCopy = (o) => (o.emergencyPO && !(o.emergencyPO.id && NA.get('purchaseOrders', o.emergencyPO.id)) ? Object.assign({ type: 'emergency', copy: true }, o.emergencyPO) : null);
  /** Emergency purchases under way for this order (cancelled ones are left out). */
  function emergencyPOs(o) {
    const list = NA.where('purchaseOrders', (p) => p.orderId === o.id && p.stage !== 'cancelled');
    const c = emCopy(o);
    if (c && c.stage !== 'cancelled') list.push(c);
    return list;
  }
  /** The cancelled emergency purchase for this order (the car was not available), when no other one is under way. */
  function emergencyGone(o) {
    if (emergencyPOs(o).length) return null;
    const c = emCopy(o);
    return c && c.stage === 'cancelled' ? c : NA.find('purchaseOrders', (p) => p.orderId === o.id && p.stage === 'cancelled');
  }
  /** Cars kept for this order without being given to it (an emergency car that arrived before the VIN). */
  const keptCars = (o) => NA.where('vehicles', (v) => v.reservedFor === o.id && v.id !== o.vehicleId);
  /** Purchasing is involved: asked for an emergency car, buying one (only some roles see purchase orders), or keeping one. */
  const purchasingInvolved = (o) => !!o.emergencyRequest || emergencyPOs(o).length > 0 || keptCars(o).length > 0;
  /** 'pending' | 'approved' | 'rejected' | 'none': the Managing Director's decision (the copy has it when Purchasing writes it). */
  function emApproval(p) {
    if (!p.copy) return B.poApproval(p);
    const a = p.approval;
    return (typeof a === 'string' ? a : a && a.status) || 'none';
  }
  function emStatus(p) {
    const ap = emApproval(p);
    if (ap === 'pending') return 'waiting for the Managing Director’s approval';
    if (ap === 'rejected') return 'not approved by the Managing Director';
    return NA.stageLabel(NA.FLOW.emergencyStages, p.stage).replace(/^[A-Z][a-z]/, (x) => x.toLowerCase())
      + (p.eta && p.stage !== 'received' ? ', expected ' + F.date(String(p.eta)) : '');
  }
  /** The date an order became fully paid with confirmed money (first come, first served). */
  function paidUpOn(o) {
    const net = B.orderNet(o);
    let s = 0;
    for (const p of orderPayments(o).filter(B.paymentCleared)) { s += Number(p.amount) || 0; if (net > 0 && s >= net - 0.5) return p.date || ''; }
    return String(o.createdAt || '').slice(0, 10) || NA.today();
  }
  /** An earlier fully paid order that should get this car first ('' when this order is first in line). */
  function firstInLine(v, o) {
    if (v.reservedFor === o.id) return null;
    const mine = paidUpOn(o);
    const waiting = NA.db.orders.filter((x) => x.id !== o.id && !x.vehicleId && x.modelId === v.modelId && ['booking', 'payment', 'vin'].includes(x.stage)
      && canGiveVin(x) && (!x.color || !v.color || x.color === v.color))
      .sort((a, b) => String(paidUpOn(a)).localeCompare(String(paidUpOn(b))));
    return waiting[0] && String(paidUpOn(waiting[0])) < String(mine) ? waiting[0] : null;
  }
  const warrantyOf = (o) => NA.find('warranties', (w) => w.orderId === o.id);
  /** A number from Settings: 0 is a real value, only a blank falls back (the same rule as core B.deliverOrder). */
  const setOr = (v, d) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
  /** " or 150,000 km" — a limit of 0 means no km limit (Service reads it the same way). */
  const kmWords = (km) => (Number(km) > 0 ? ` or ${F.num(km)} km` : ' with no km limit');
  /** The warranty for an order in words: from its warranty record once the car is handed over, else the model's terms. */
  function warrantyTerms(o) {
    const w = warrantyOf(o);
    if (w) return { w, km: Number(w.kmLimit) || 0, car: 'until ' + F.date(w.expiry), battery: 'until ' + F.date(w.batteryExpiry) };
    const m = NA.model(o.modelId) || {};
    return { w: null, km: setOr(m.warrantyKm, 150000), car: setOr(m.warrantyMonths, 72) + ' months', battery: setOr(m.batteryWarrantyMonths, 96) + ' months' };
  }
  const canBookService = () => NA.can('service.manage') && hasAction('newServiceBooking');
  const canAskEmergency = (o) => isOpen(o) && !o.vehicleId && canGiveVin(o) && (NA.can('orders.edit') || NA.can('vin.assign'));

  /** Who does a step — "You" when it is the current person's job. */
  function whoDoes(kind, o) {
    if (kind === 'consultant') {
      if (NA.isRole('sales', 'sales_manager') && NA.isMine(o)) return 'You';
      const n = o && o.consultantId ? NA.staffName(o.consultantId) : '—';
      return n !== '—' ? n : 'the sales consultant';
    }
    if (kind === 'accounts') return NA.isRole('accounts') ? 'You' : 'Accounts';
    if (kind === 'vin') return NA.isRole('accounts', 'sales_manager') ? 'You' : 'the Sales Manager or Accounts';
    if (kind === 'md') return NA.isRole('owner') ? 'You' : 'the Managing Director';
    if (kind === 'procurement') return NA.isRole('procurement') ? 'You' : 'Purchasing';
    return '';
  }

  /** While the Managing Director decides a cancellation the order is paused (true = stop, with a short note). */
  function paused(o) {
    if (!B.cancelPending(o)) return false;
    ui.toast('A cancellation is waiting for a decision', 'info');
    return true;
  }
  /** May this person close someone's open request? The office server lets the asker, an approver and the MD do it. */
  const mayClose = (a) => NA.isRole('owner') || NA.approvals.isMine(a) || NA.approvals.canDecide(a);
  /** "Approve or decline" on the next step when the open request is this person's to decide. It only scrolls to the
      banner, whose Approve button stays the one primary on the page. */
  const decideBtn = (a) => (a && a.status === 'pending' && NA.approvals.canDecide(a) ? { label: 'Approve or decline', act: 'goto', target: 'so-approvals', icon: 'stamp', kind: 'ghost' } : null);

  /** Remember the last payment method used on this computer (a small convenience). */
  function rememberedMethod(allowed) {
    let m = '';
    try { m = localStorage.getItem('na-sales-method') || ''; } catch (e) { m = ''; }
    return allowed.includes(m) ? m : (allowed.includes('Cash') ? 'Cash' : allowed[0]);
  }
  function rememberMethod(m) { try { localStorage.setItem('na-sales-method', m); } catch (e) { /* not important */ } }

  /** Number to words (Bangladeshi system: crore, lakh, thousand). */
  function inWords(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (!n) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
    const out = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(inWords(crore) + ' Crore');
    if (lakh) out.push(two(lakh) + ' Lakh');
    if (th) out.push(two(th) + ' Thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }

  /** Save the stage the order has really reached (core rule; B.recordPayment and B.verifyPayment already call it). */
  const syncStage = (order) => B.syncStage(order);

  function getLead(o) {
    return (o.leadId && NA.get('leads', o.leadId)) || NA.find('leads', (l) => l.orderId === o.id);
  }

  /* ------------------------------------------------------------------------
     Module CSS (injected once)
     ------------------------------------------------------------------------ */
  function ensureCss() {
    if (typeof document === 'undefined' || !document.getElementById || document.getElementById('css-sales')) return;
    const host = document.head || document.body;
    if (!host || !document.createElement) return;
    const s = document.createElement('style');
    s.id = 'css-sales';
    s.textContent = `
.so-mb{margin-bottom:20px}
.so-ic{color:#fff}
.so-end{justify-content:flex-end}
.so-sw-lg{width:18px;height:18px}
.so-toolbar{margin-bottom:20px}
.so-toolbar input[type=search]{flex:1;min-width:220px}
.so-toolbar .seg .n{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.so-kpis{margin-bottom:24px}
.so-board{grid-auto-columns:minmax(236px,1fr)}
.so-board .lane{max-height:none}
.so-card{display:block;color:inherit}
.so-card .so-pay{margin-top:12px}
.so-card .so-pay-line{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--muted);margin-bottom:6px}
.so-card .so-pay-line b{color:var(--ink);font-weight:600}
.so-card .so-flag{margin-top:10px}
.so-lane-empty{color:var(--muted);font-size:13px;text-align:center;padding:20px 8px}
.so-summary-line{color:var(--muted);margin-bottom:20px}
.so-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:20px}
.so-fact{padding:18px 22px;min-width:0}
.so-fact small{display:block;color:var(--muted);font-size:12.5px}
.so-fact b{display:block;font-size:17px;font-weight:600;letter-spacing:-.015em;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.so-fact span{display:block;color:var(--muted);font-size:12.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.so-top .next-step{margin-top:24px}
.so-ns-more{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 0 -8px}
.so-banners{margin-top:20px}
.so-cols{margin-top:24px;align-items:start}
.so-main{gap:20px}
.so-panel.so-now{box-shadow:var(--shadow-sm),0 0 0 2px var(--tint-soft-2)}
.so-panel .card-head .row{justify-content:flex-end}
.so-compact{display:flex;align-items:center;gap:14px;padding:16px 22px}
.so-compact-ic{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--fill);color:var(--muted)}
.so-compact-ic.ok{background:var(--green-solid);color:#fff}
.so-compact b{display:block;font-weight:600;letter-spacing:-.01em}
.so-compact small{display:block;color:var(--muted);font-size:13px;margin-top:1px}
.so-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.so-stat{padding:14px 16px;border-radius:var(--radius-sm);background:var(--fill-3);min-width:0}
.so-stat small{display:block;color:var(--muted);font-size:12.5px}
.so-stat b{display:block;font-size:18px;font-weight:600;letter-spacing:-.02em;margin-top:2px}
.so-stat span{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.so-row-acts{display:flex;align-items:center;gap:6px;flex:none}
.so-vin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.so-vin-grid .vin-card{cursor:default}
.so-vin-grid .vin-card .mono{font-size:13.5px;font-weight:600}
.so-vin-grid .vin-card .btn{align-self:flex-start;margin-top:4px}
.so-checklist{gap:12px}
.so-checklist li{flex-wrap:wrap}
.so-checklist li.bad .ico{color:var(--amber)}
.so-checklist label{display:flex;align-items:center;gap:10px;flex:1;min-width:200px;cursor:pointer}
.so-acc-head{display:flex;align-items:center;gap:10px;margin:24px 0 10px}
.so-acc-head b{font-weight:600}
.so-acc{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2px 20px}
.so-acc label{display:flex;align-items:center;gap:10px;min-height:36px;font-size:13.5px;cursor:pointer}
.so-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:24px}
.so-done{display:flex;gap:16px;align-items:center;padding:18px;border-radius:var(--radius-sm);background:var(--green-50);flex-wrap:wrap}
.so-done .ic{width:44px;height:44px;border-radius:50%;background:var(--green-solid);color:#fff;display:grid;place-items:center;flex:none}
.so-done .grow{min-width:200px}
.so-tracks{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.so-track{padding:16px;border-radius:var(--radius-sm);background:var(--fill-3);min-width:0}
.so-track h4{font-size:14px;font-weight:600;margin-bottom:6px}
.so-track .progress{margin:10px 0 6px}
.so-track > small{display:block;color:var(--muted);font-size:12.5px}
.so-bank-list{margin-top:8px}
.so-bank-list>li{padding:9px 0}
.so-bank-list>li .ic{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--fill);color:var(--muted);font-size:12px;font-weight:600}
.so-bank-list>li.done .ic{background:var(--green-solid);color:#fff}
.so-bank-list>li.next .ic{background:var(--tint);color:var(--on-tint)}
.so-sec{margin-bottom:28px}
.so-sec-h{display:flex;gap:10px;align-items:center;margin-bottom:14px}
.so-sec-h b{font-size:15px;font-weight:600}
.so-sec-h small{display:block;color:var(--muted);font-size:12.5px;font-weight:400}
.so-num{width:24px;height:24px;border-radius:50%;background:var(--fill);color:var(--ink-2);display:grid;place-items:center;font-size:12.5px;font-weight:600;flex:none}
.so-pick-list{max-height:240px;overflow:auto;border-radius:var(--radius-sm);background:var(--fill-3);margin-top:10px;padding:4px}
.so-pick{display:flex;gap:12px;align-items:center;width:100%;border:0;background:none;padding:9px 10px;border-radius:9px;text-align:left}
.so-pick:hover{background:var(--fill-2)}
.so-pick.sel{background:var(--tint-soft)}
.so-pick .grow{flex:1;min-width:0}
.so-pick small{display:block;color:var(--muted);font-size:12.5px}
.so-pick-empty{padding:14px 10px}
.so-colors{display:flex;flex-wrap:wrap;gap:10px}
.so-color{position:relative}
.so-color input{position:absolute;opacity:0;pointer-events:none}
.so-color > span{display:flex;align-items:center;gap:10px;padding:9px 14px 9px 10px;border-radius:12px;cursor:pointer;background:var(--fill-3);box-shadow:inset 0 0 0 1px var(--line-2)}
.so-color b{display:block;font-size:13.5px;font-weight:600}
.so-color small{display:block;font-size:12px}
.so-color input:checked + span{background:var(--tint-soft);box-shadow:inset 0 0 0 2px var(--tint)}
.so-color input:focus-visible + span{box-shadow:inset 0 0 0 2px var(--tint),0 0 0 4px var(--tint-soft)}
.so-color .swatch{width:20px;height:20px}
.so-price{height:40px;display:flex;align-items:center;gap:8px;font-size:15px}
.so-sub{margin-top:16px;padding:16px;border-radius:var(--radius-sm);background:var(--fill-3)}
.so-sub-title{font-size:13px;font-weight:600;color:var(--ink-2);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.so-more{margin-top:16px}
.so-more > summary{cursor:pointer;color:var(--tint);font-weight:500;font-size:13.5px;list-style:none;display:inline-flex;align-items:center;gap:6px}
.so-more > summary::-webkit-details-marker{display:none}
.so-more[open] > summary{margin-bottom:14px}
.so-err{display:block;color:var(--red);font-size:12.5px;margin-top:6px}
.so-err:empty{display:none}
.so-total{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;padding:18px 20px;border-radius:var(--radius);background:var(--fill-3);margin-top:8px}
.so-total small{display:block;color:var(--muted);font-size:12.5px}
.so-total b{display:block;font-size:19px;font-weight:600;letter-spacing:-.02em;margin-top:2px}
.so-total .note{grid-column:1/-1;font-size:13px;color:var(--ink-2);display:flex;gap:8px;align-items:flex-start}
.so-side .glist{margin-bottom:24px}
.so-side .gl-value{white-space:normal;max-width:62%;overflow-wrap:anywhere}
.so-side .gl-row .btn{flex:none}
.so-sheet .gl-row b{font-weight:500}
.so-sheet .so-danger b{color:var(--red)}
@media (max-width:760px){.so-facts{grid-template-columns:1fr 1fr}.so-fact{padding:14px 18px}.so-stats{grid-template-columns:1fr}.so-tracks{grid-template-columns:1fr}.so-top .next-step{flex-wrap:wrap}.so-top .next-step > .btn{width:100%}.so-pay-rows .gl-row{flex-wrap:wrap}.so-pay-rows .so-row-acts{width:100%;justify-content:flex-end}}
`;
    host.appendChild(s);
  }

  /* ------------------------------------------------------------------------
     Printing: money receipt, handover form, acknowledgement
     ------------------------------------------------------------------------ */
  /**
   * The money receipt — one template for the whole app (Finance can call NA.actions.printReceipt).
   * "Total received to date" is as of this receipt, so a reprint of an old receipt shows the same figures.
   * The first print is the Original; every later print says Duplicate and is logged with the person.
   */
  function printReceipt(p) {
    const o = NA.get('orders', p.orderId);
    const c = NA.customer(p.customerId || (o && o.customerId)) || {};
    const refund = p.kind === 'refund' || (Number(p.amount) || 0) < 0;
    const first = !p.printedAt;
    let paidToDate = 0, balance = 0, net = 0;
    if (o) {
      const list = orderPayments(o).filter((x) => !B.paymentBounced(x) || x.id === p.id);
      const idx = list.findIndex((x) => x.id === p.id);
      paidToDate = list.slice(0, idx + 1).filter((x) => !B.paymentBounced(x)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      net = B.orderNet(o);
      balance = Math.max(0, net - paidToDate);
    }
    const who = NA.me().name;
    const copy = first ? 'Original — customer copy' : `Duplicate — printed ${F.datetime(nowIso())} by ${who}`;
    const status = B.paymentBounced(p) ? 'NOT RECEIVED — this payment did not clear.'
      : B.paymentPending(p) ? 'Subject to realisation: the payment counts once our Accounts team confirms it.' : '';
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div><h1>${refund ? 'Refund Voucher' : 'Money Receipt'}</h1><div class="muted">${esc(copy)}</div></div>
        <div style="text-align:right"><div>${refund ? 'Voucher' : 'Receipt'} No. <b>${esc(p.receiptNo)}</b></div><div>Date: <b>${F.date(p.date)}</b></div></div>
      </div>
      <table>
        <tr><th style="width:34%">${refund ? 'Paid to' : 'Received with thanks from'}</th><td><b>${esc(c.name || '—')}</b>${c.mobile ? ' · ' + esc(c.mobile) : ''}${c.address ? '<br><span class="muted">' + esc(c.address) + '</span>' : ''}</td></tr>
        <tr><th>Amount</th><td><b style="font-size:16px">${F.money(Math.abs(Number(p.amount) || 0))}</b></td></tr>
        <tr><th>In words</th><td>Taka ${esc(inWords(p.amount))} only</td></tr>
        <tr><th>Payment method</th><td>${esc(p.method)}${p.ref ? ' — Ref: ' + esc(p.ref) : ''}</td></tr>
        ${o ? `<tr><th>Against sales order</th><td>${esc(o.code)} — ${esc(NA.modelName(o.modelId))}, ${esc(o.color || '')}</td></tr>
        ${refund ? '' : `<tr><th>Price after discount (incl. VAT)</th><td>${F.money(net)}</td></tr>
        <tr><th>Total received to date</th><td>${F.money(paidToDate)}</td></tr>
        <tr><th>Balance due</th><td><b>${F.money(balance)}</b></td></tr>`}` : ''}
        ${p.receivedBy ? `<tr><th>${refund ? 'Paid by' : 'Received by'}</th><td>${esc(p.paidBy || p.receivedBy)}</td></tr>` : ''}
        ${p.note ? `<tr><th>Note</th><td>${esc(p.note)}</td></tr>` : ''}
      </table>
      ${status ? `<p><b>${esc(status)}</b></p>` : ''}
      ${!refund && o && !o.vehicleId ? '<p class="muted">The car’s VIN is given to the customer after 100% payment, confirmed by Accounts.</p>' : ''}
      <p class="muted">Cheque and pay order payments are subject to realisation.</p>
      <div class="sig"><div>Customer signature</div><div>For ${esc(NA.db.settings.company)}<br><span class="muted">Accounts / Authorized signatory</span></div></div>`;
    const w = ui.print((refund ? 'Refund voucher ' : 'Money receipt ') + p.receiptNo, html);
    if (!w) return null;   // pop-ups blocked: nothing printed, so this is still not the Original
    if (first) NA.update('payments', p.id, { printedAt: nowIso(), printedBy: who, printCount: 1 });
    else {
      NA.update('payments', p.id, { printCount: (Number(p.printCount) || 1) + 1 });
      NA.log(`Duplicate of ${refund ? 'refund voucher' : 'receipt'} ${p.receiptNo} printed by ${who}`, { rec: o || null, link: o ? '#/sales/' + o.id : null, kind: 'info' });
    }
    return w;
  }
  NA.actions.printReceipt = (paymentId) => { const p = NA.get('payments', paymentId); return p ? printReceipt(p) : null; };

  function vehicleTable(o) {
    const v = NA.vehicle(o.vehicleId) || {};
    const m = NA.model(o.modelId) || {};
    // Only this order's own registration number: a car returned from another order may still carry that customer's number.
    const regNo = (o.brta && o.brta.regNo) || (v.orderId === o.id && v.regNo) || '—';
    return `<table>
      <tr><th style="width:30%">Model</th><td>${esc(NA.modelName(o.modelId))} ${m.body ? '(' + esc(m.body) + ')' : ''}</td><th style="width:18%">Colour</th><td>${esc(v.color || o.color || '—')}</td></tr>
      <tr><th>VIN / Chassis no.</th><td><b>${esc(v.vin || '—')}</b></td><th>Motor no.</th><td>${esc(v.motorNo || '—')}</td></tr>
      <tr><th>Registration no.</th><td><b>${esc(regNo)}</b></td><th>Model year</th><td>${esc(v.year || '—')}</td></tr>
      <tr><th>Odometer</th><td>${esc(v.km != null ? v.km + ' km' : '—')}</td><th>Order</th><td>${esc(o.code)}</td></tr>
    </table>`;
  }

  function printHandover(o) {
    const c = NA.customer(o.customerId) || {};
    const v = NA.vehicle(o.vehicleId) || {};
    const wt = warrantyTerms(o);
    const d = o.delivery || {};
    const acc = d.accessories || [];
    const html = `
      <h1>Vehicle Handover Form</h1>
      <p class="muted">Order ${esc(o.code)} · Delivery date: ${F.date(d.date || NA.today())}</p>
      <h3>Customer</h3>
      <table>
        <tr><th style="width:30%">Name</th><td>${esc(c.name || '—')}</td></tr>
        <tr><th>Mobile</th><td>${esc(c.mobile || '—')}</td></tr>
        <tr><th>Address</th><td>${esc(c.address || '—')}</td></tr>
        <tr><th>${c.type === 'Corporate' ? 'TIN' : 'NID'}</th><td>${esc((c.type === 'Corporate' ? c.tin : c.nid) || '—')}</td></tr>
        ${o.channel === 'Bank' && o.bank ? `<tr><th>Hypothecated to</th><td>${esc(o.bank.bankName || '')} ${o.bank.branch ? '(' + esc(o.bank.branch) + ')' : ''}</td></tr>` : ''}
      </table>
      <h3>Vehicle</h3>
      ${vehicleTable(o)}
      <h3>Pre-delivery inspection</h3>
      <table><tr><th style="width:30%">PDI</th><td>${pdiPassed(v) ? 'Passed on ' + F.date(v.pdi.date) + ' · VIN verified · Damage check: ' + esc(v.pdi.damageCheck || 'OK') + (v.pdi.batterySoh ? ' · Battery SOH ' + esc(v.pdi.batterySoh) + '%' : '') : carProblem(v) ? 'On hold: ' + esc(carProblem(v)) : '☐ Not inspected yet'}</td></tr></table>
      <h3>Accessories &amp; documents handed over</h3>
      <table>${ACCESSORIES.map((a) => `<tr><td style="width:40px;text-align:center;font-size:16px">${acc.includes(a) ? '☑' : '☐'}</td><td>${esc(a)}</td></tr>`).join('')}</table>
      <h3>Warranty</h3>
      <p>Vehicle warranty ${esc(wt.car + kmWords(wt.km))}${wt.km > 0 ? ' (whichever comes first)' : ''}; traction battery ${esc(wt.battery)}. ${wt.w ? 'The warranty started on ' + esc(F.date(wt.w.start)) + '.' : 'Warranty starts on the delivery date.'}</p>
      <div class="sig"><div>Customer signature</div><div>Delivered by${d.deliveredBy ? ': ' + esc(NA.staffName(d.deliveredBy)) : ''}</div></div>
      <div class="sig" style="margin-top:50px"><div>Sales consultant: ${esc(NA.staffName(o.consultantId))}</div><div>For ${esc(NA.db.settings.company)}</div></div>`;
    ui.print('Handover ' + o.code, html);
  }

  function printAck(o) {
    const c = NA.customer(o.customerId) || {};
    const d = o.delivery || {};
    const html = `
      <h1>Delivery Acknowledgement</h1>
      <p class="muted">Order ${esc(o.code)} · Date: ${F.date(d.date || NA.today())}</p>
      <p style="font-size:14px;line-height:1.7;margin-top:18px">I, <b>${esc(c.name || '________________')}</b>${c.type === 'Corporate' && c.contactPerson ? ' (represented by ' + esc(c.contactPerson) + ')' : ''}, hereby acknowledge that I have
      received the vehicle described below from <b>${esc(NA.db.settings.company)}</b> in good condition, together with the accessories and documents
      listed on the handover form. I have inspected the vehicle and have been briefed on charging, safety features, the service schedule and the warranty terms.</p>
      ${vehicleTable(o)}
      <p class="muted">Any issue found after delivery will be handled under the BYD warranty through the Noor Autos workshop (Gulshan).</p>
      <div class="sig"><div>Customer signature &amp; date</div><div>Witness (Noor Autos)</div></div>`;
    ui.print('Acknowledgement ' + o.code, html);
  }

  /**
   * Gate pass: lets the car leave the showroom. Numbered on the first print; later prints say Copy.
   * The number is taken only once the print window has opened (blocked pop-ups use no number), then written into it.
   */
  function printGatePass(o) {
    const c = NA.customer(o.customerId) || {};
    const v = NA.vehicle(o.vehicleId) || {};
    const old = o.delivery && o.delivery.gatePass;
    const first = !old;
    const gp = old || { no: '', at: nowIso(), by: NA.me().name, byId: NA.myStaffId() };
    const credit = !B.isFullyPaid(o);
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div><h1>Gate Pass</h1><div class="muted">${first ? 'Original' : 'Copy'} — this car may leave the showroom</div></div>
        <div style="text-align:right"><div>Gate pass no. <b data-gp-no>${esc(gp.no)}</b></div><div>Issued ${esc(F.datetime(gp.at))}</div></div>
      </div>
      <table>
        <tr><th style="width:32%">Customer</th><td><b>${esc(c.name || '—')}</b>${c.mobile ? ' · ' + esc(c.mobile) : ''}</td></tr>
        <tr><th>Order</th><td>${esc(o.code)}</td></tr>
        <tr><th>Car</th><td>${esc(NA.modelName(o.modelId))} · ${esc(v.color || o.color || '')}</td></tr>
        <tr><th>VIN / Chassis no.</th><td><b>${esc(v.vin || '—')}</b></td></tr>
        <tr><th>Motor no.</th><td>${esc(v.motorNo || '—')}</td></tr>
        <tr><th>Registration no.</th><td><b>${esc((o.brta && o.brta.regNo) || '—')}</b></td></tr>
        <tr><th>Payment</th><td>${credit ? `Released before full payment, approved by the Managing Director — ${F.money(B.orderBalance(o))} still due` : 'Paid in full and confirmed by Accounts'}</td></tr>
      </table>
      <div class="sig"><div>Issued by: ${esc(gp.by)}</div><div>Checked at the gate (security)</div></div>
      <div class="sig" style="margin-top:50px"><div>Customer signature</div><div>For ${esc(NA.db.settings.company)}</div></div>`;
    const w = ui.print(first ? 'Gate pass' : 'Gate pass ' + gp.no, html);
    if (!w) return false;   // pop-ups blocked: no gate pass was issued
    if (first) {
      gp.no = NA.nextCode('GP');
      // The window's page is already written (it prints after a short delay): put the number in.
      try { const slot = w.document.querySelector('[data-gp-no]'); if (slot) slot.textContent = gp.no; w.document.title = 'Gate pass ' + gp.no; } catch (e) { /* the number is still on the order and on every copy */ }
      NA.update('orders', o.id, { delivery: Object.assign({}, o.delivery, { gatePass: gp }) });
      NA.log(`${o.code}: gate pass ${gp.no} issued by ${gp.by}`, { rec: NA.get('orders', o.id) || o, link: '#/sales/' + o.id, kind: 'info' });
    }
    return true;
  }

  /** After a payment is saved: one calm sheet with Print receipt and WhatsApp. */
  function receiptSheet(p) {
    const o = NA.get('orders', p.orderId) || {};
    const c = NA.customer(p.customerId || o.customerId) || {};
    const pending = B.paymentPending(p);
    const wa = c.mobile ? waNumber(c.mobile) : '';
    const text = `Dear ${c.name || 'customer'}, Noor Autos has received ${F.money(p.amount)} (${p.method}) for your order ${o.code || ''}. Receipt ${p.receiptNo}.${pending ? ' It counts once our Accounts team confirms it.' : ''} Thank you.`;
    const actions = [{ label: 'Done' }];
    if (wa) actions.push({ label: 'WhatsApp', icon: 'whatsapp', onClick: () => { window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); return false; } });
    // Stays open when pop-ups are blocked, so the person can allow them and press Print again.
    actions.push({ label: 'Print receipt', kind: 'primary', icon: 'print', onClick: () => (printReceipt(NA.get('payments', p.id) || p) ? true : false) });
    ui.modal({
      title: 'Payment saved', size: 'sm',
      body: `<div class="glist">
          <div class="gl-row"><span class="gl-main"><b>${esc(p.receiptNo)}</b><small>${esc(c.name || '—')}${o.code ? ' · ' + esc(o.code) : ''} · ${esc(p.method)}</small></span><span class="gl-value"><b class="num">${F.money(p.amount)}</b></span></div>
          <div class="gl-row"><span class="gl-main"><b>${pending ? 'Waiting for Accounts to confirm' : 'Confirmed'}</b><small>${pending ? 'It counts towards “fully paid” once Accounts confirms the money.' : 'It already counts towards “fully paid”.'}</small></span></div>
        </div>`,
      actions,
    });
  }

  /* ------------------------------------------------------------------------
     Shared form bits
     ------------------------------------------------------------------------ */
  function datalist(id, items) { return `<datalist id="${id}">${items.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>`; }
  function markInvalid(form, name, msg) {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) { const f = el.closest('.field') || el; f.classList.add('invalid'); try { el.focus(); } catch (e) {} if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    ui.toast(msg, 'error');
    return false;
  }
  function clearInvalid(form) {
    form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((x) => { x.textContent = ''; });
  }
  /** Show a message under the section it is about (for choices that are not a single field). */
  function sectionError(form, key, msg) {
    const box = form.querySelector(`[data-err="${key}"]`);
    if (box) { box.textContent = msg; if (box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else ui.toast(msg, 'error');
    return false;
  }

  /* ------------------------------------------------------------------------
     ACTION: New sales order (guided)
     ------------------------------------------------------------------------ */
  /** Cars that can be sold now (available, not on hold, not kept for another order). */
  const freeStock = (modelId, color) => NA.where('vehicles', (v) => v.modelId === modelId && v.status === 'available' && !carProblem(v) && !v.reservedFor && (!color || v.color === color)).length;

  /**
   * Booking from the lead's quote for the same model, while the quote is valid: the customer pays exactly the quoted
   * net. The order keeps the quote's list price, a price never below it, and one discount for everything given off
   * it (a price cut plus the discount) — the whole concession, which is the value approved on the lead (B.discountOk).
   * The Leads screen sends the same figures (prefill.listPrice, price, discount); these are worked out from the quote
   * itself, so a quote above the list price is booked as quoted too. null when there is no valid quote for this model.
   */
  function quoteTerms(lead, m) {
    const q = lead && lead.quotation;
    if (!q || !m || !(Number(q.price) > 0) || (q.modelId || lead.modelId) !== m.id) return null;
    if (q.validUntil && q.validUntil < NA.today()) return null;
    const listPrice = Number(q.listPrice) || Number(m.price) || Number(q.price);
    const price = Math.max(listPrice, Number(q.price));
    const net = Math.max(0, Number(q.price) - (Number(q.discount) || 0));
    return { listPrice, price, discount: Math.max(0, price - net), net, no: q.no || '' };
  }

  /** The lead was booked already (its order sheet was open on two screens): that order's code, or '' when it is free. */
  function leadBooked(lead) {
    const l = lead && NA.get('leads', lead.id);
    if (!l || l.stage !== 'won' || !l.orderId) return '';
    const o = NA.get('orders', l.orderId);
    return o && o.stage === 'cancelled' ? '' : (o && o.code) || 'another order';
  }
  function bookedStop(lead, code, saving) {
    const l = NA.get('leads', lead.id) || lead;
    ui.toast(`${l.code || l.name || 'This lead'} is already booked as ${code}${saving ? ' — nothing was saved' : ''}`, saving ? 'error' : 'info');
    if (NA.get('orders', l.orderId)) setTimeout(() => NA.go('#/sales/' + l.orderId), 0);
  }

  NA.actions.newOrder = function (prefill) {
    prefill = prefill || {};
    ensureCss();
    if (!NA.can('orders.create')) { ui.toast('Orders are booked by the sales team', 'info'); return; }
    if (!NA.can('leads.assign') && !NA.myStaffId()) { ui.toast('Your sign-in is not linked to a staff record — ask the Managing Director', 'error'); return; }
    const models = NA.db.models.filter((m) => m.active !== false);
    if (!models.length) { ui.toast('Add car models in Settings first', 'error'); return; }
    const lead = prefill.leadId ? NA.get('leads', prefill.leadId) : null;
    const booked = leadBooked(lead);
    if (booked) { bookedStop(lead, booked, false); return; }
    const quote = (lead && lead.quotation) || {};
    let leadCustomer = lead && lead.customerId ? NA.customer(lead.customerId) : null;
    if (lead && !leadCustomer && lead.mobile) leadCustomer = NA.find('customers', (c) => c.mobile && normMobile(c.mobile) === normMobile(lead.mobile));

    const pickModel = (id) => (id && models.find((m) => m.id === id)) || null;
    const model = pickModel(prefill.modelId) || pickModel(lead && lead.modelId) || models[0];
    const CH = ['Retail', 'Bank', 'Corporate'];
    const channel = CH.includes(prefill.channel) ? prefill.channel : CH.includes(quote.channel) ? quote.channel
      : (lead && lead.financing === 'Bank' ? 'Bank' : lead && lead.financing === 'Corporate' ? 'Corporate' : 'Retail');
    // From the quote for this model the customer pays the quoted net (quoteTerms). The discount sent with the lead (or
    // the quote's) is for the quoted model only: another model starts with no discount (its approval would not count).
    const quotedModelId = quote.modelId || (lead && lead.modelId) || '';
    const baseDiscount = Number(prefill.discount) > 0 ? Number(prefill.discount) : (Number(quote.discount) || 0);
    const startDiscount = (m) => { const t = quoteTerms(lead, m); return t ? t.discount : !lead || !quotedModelId || m.id === quotedModelId ? baseDiscount : 0; };
    /** The lead's (quotation's) approval covers this discount on this model. */
    const leadCovers = (mid, d) => {
      const a = lead && NA.approvals ? NA.approvals.find('leads', lead.id, 'discount') : null;
      return !!a && (!a.data || !a.data.modelId || a.data.modelId === mid) && NA.approvals.isApproved('leads', lead.id, 'discount', d);
    };
    const terms0 = quoteTerms(lead, model);
    const discount = startDiscount(model);
    const canAssign = NA.can('leads.assign');
    const consultants = ui.opts.consultants();
    const consultant0 = prefill.consultantId || (lead && lead.consultantId) || NA.defaultConsultant() || '';
    const anyCustomers = NA.db.customers.some((c) => !NA.isRole('sales') || NA.isMine(c));
    const st = {
      mode: (prefill.customerId || leadCustomer) ? 'existing' : lead ? 'new' : (anyCustomers ? 'existing' : 'new'),
      customerId: prefill.customerId || (leadCustomer && leadCustomer.id) || '',
      q: '', bkTouched: false, loanTouched: false, discTouched: false, quoteNo: String(prefill.quoteNo || ''),
    };
    const colors = ui.opts.colors(model.id);
    const wanted = prefill.color || quote.color;
    const color = wanted && colors.includes(wanted) ? wanted : (colors.find((c) => freeStock(model.id, c)) || colors[0]);
    const methods = NA.FLOW.paymentMethods.filter((m) => m !== 'Bank Disbursement');
    const net0 = Math.max(0, (terms0 ? terms0.price : Number(model.price) || 0) - discount);
    const minDate = NA.can('payments.verify') ? null : NA.addDays(NA.today(), -3);

    const custFields = [
      { name: 'c_name', label: 'Name (person or company)', required: true, placeholder: 'e.g. Md. Rezaul Karim', value: lead && !leadCustomer ? lead.name : '' },
      { name: 'c_mobile', label: 'Mobile', type: 'tel', required: true, placeholder: '01XXXXXXXXX', value: lead && !leadCustomer ? lead.mobile : '' },
      { name: 'c_type', label: 'Customer type', type: 'select', placeholder: false, options: ['Individual', 'Corporate'], value: lead && (lead.company || lead.financing === 'Corporate') ? 'Corporate' : 'Individual' },
      { name: 'c_nid', label: 'NID (TIN for a company)', placeholder: 'Needed for BRTA — can be added later' },
    ];
    const moreFields = [
      { name: 'c_email', label: 'Email', type: 'email', value: lead && !leadCustomer ? lead.email || '' : '' },
      { name: 'c_address', label: 'Address', placeholder: 'Area, city' },
    ];

    const body = `<form onsubmit="return false">
      ${lead ? `<div class="callout callout-info so-mb">${NA.icon('user-plus')}<div>Booking an order for lead <b>${esc(lead.code || '')} · ${esc(lead.name)}</b>. ${leadCustomer ? 'It is linked to the existing customer.' : 'A customer record is made from the lead.'}</div></div>` : ''}
      <section class="so-sec">
        <div class="so-sec-h"><span class="so-num">1</span><div><b>Customer</b><small>Who is buying the car?</small></div></div>
        <div class="seg" data-cust-tabs>
          <button type="button" data-mode="existing">Existing customer</button>
          <button type="button" data-mode="new">New customer</button>
        </div>
        <div data-mode-panel="existing" class="mt-12">
          <div class="field"><input type="search" placeholder="Search by name or mobile" data-cust-q autocomplete="off" aria-label="Search customers"/></div>
          <input type="hidden" name="customerId" value="${esc(st.customerId)}"/>
          <div class="so-pick-list" data-cust-list></div>
          <small class="so-err" data-err="customer"></small>
        </div>
        <div data-mode-panel="new" class="mt-12">${ui.form(custFields)}
          <details class="so-more"><summary>${NA.icon('plus', 14)}Email and address</summary>${ui.form(moreFields)}</details>
        </div>
      </section>

      <section class="so-sec">
        <div class="so-sec-h"><span class="so-num">2</span><div><b>Car and price</b><small>Model, colour and any discount</small></div></div>
        <div class="form-grid">
          ${ui.field({ name: 'modelId', label: 'Model', type: 'select', placeholder: false, options: ui.opts.models(), span: 2 }, model.id)}
          <div class="field span-2"><label>Colour</label><div class="so-colors" data-colors></div><small class="help" data-stockline></small><small class="so-err" data-err="color"></small></div>
          <div class="field"><label>Price (incl. VAT)</label><div class="so-price" data-listprice></div><small class="help" data-pricehelp>From the price list in Settings</small></div>
          <div class="field"><label for="so-disc">Discount</label><div class="input-prefix"><span>৳</span><input id="so-disc" type="number" name="discount" value="${esc(discount)}" min="0" step="1" placeholder="0"/></div><small class="help" data-dischint></small></div>
          <div class="field span-2 hidden" data-why><label for="so-why">Why this discount?</label><textarea id="so-why" name="discountReason" rows="2" placeholder="e.g. Matching a competitor’s offer — helps the manager decide quickly"></textarea></div>
          ${canAssign ? ui.field({ name: 'consultantId', label: 'Sales consultant', type: 'select', required: true, options: consultants, span: 2 }, consultant0) : ''}
        </div>
      </section>

      <section class="so-sec">
        <div class="so-sec-h"><span class="so-num">3</span><div><b>Payment</b><small>How the customer pays, and the booking money</small></div></div>
        ${ui.field({ name: 'channel', type: 'radio-cards', options: NA.FLOW.channels.map((c) => ({ value: c.key, label: channelLabel(c.key), icon: c.icon, hint: CHANNEL_HINT[c.key] })) }, channel)}
        <small class="so-err" data-err="channel"></small>
        <div class="so-sub" data-for="Bank">
          <div class="so-sub-title">${NA.icon('bank', 15)} Bank loan</div>
          <div class="form-grid">
            <div class="field"><label for="so-bank">Bank or finance company <i class="req">*</i></label><input id="so-bank" name="bank_name" list="so-banks" placeholder="e.g. City Bank PLC"/></div>
            ${ui.field({ name: 'bank_branch', label: 'Branch', placeholder: 'e.g. Gulshan Avenue' })}
            ${ui.field({ name: 'bank_loan', label: 'Loan amount', type: 'money', help: 'The bank pays this to us when it disburses the loan' }, Math.round(net0 * 0.6 / 10000) * 10000)}
          </div>
          ${datalist('so-banks', BANKS)}
        </div>
        <div class="so-sub" data-for="Corporate">
          <div class="so-sub-title">${NA.icon('building', 15)} The company’s order document</div>
          <p class="small muted so-mb">No booking money is needed — the company’s purchase order, award letter or letter of intent confirms the order.</p>
          <div class="form-grid">
            ${ui.field({ name: 'corp_type', label: 'Document', type: 'select', placeholder: false, options: NA.FLOW.corporateDocs })}
            ${ui.field({ name: 'corp_ref', label: 'Document number', placeholder: 'e.g. GDL/PROC/2025/118' })}
            ${ui.field({ name: 'corp_date', label: 'Document date', type: 'date', max: NA.today() }, NA.today())}
            ${ui.field({ name: 'corp_units', label: 'Cars on this document', type: 'number', min: 1 }, 1)}
          </div>
        </div>
        <div class="so-sub" data-for="Retail Bank">
          <div class="so-sub-title">${NA.icon('receipt', 15)} Booking money — the money receipt is made automatically</div>
          <div class="form-grid">
            ${ui.field({ name: 'bk_amount', label: 'Booking money', type: 'money' }, Math.min(500000, net0))}
            ${ui.field({ name: 'bk_method', label: 'Paid by', type: 'select', placeholder: false, options: methods }, rememberedMethod(methods))}
            ${ui.field({ name: 'bk_date', label: 'Date received', type: 'date', min: minDate, max: NA.today() }, NA.today())}
            ${ui.field({ name: 'bk_ref', label: 'Reference (cheque or transfer no.)', placeholder: 'e.g. DBBL-883421' })}
          </div>
        </div>
      </section>

      <details class="so-more"><summary>${NA.icon('plus', 14)}Add a note</summary>${ui.field({ name: 'notes', label: 'Note', type: 'textarea', rows: 2, placeholder: 'Accessories promised, registration wishes…' })}</details>
      <div class="so-total" data-summary></div>
    </form>`;

    ui.modal({
      title: 'New order',
      subtitle: esc(lead ? 'From lead ' + (lead.code || lead.name) : 'Book a car for a customer'),
      size: 'lg',
      body,
      actions: [
        { label: 'Cancel' },
        { label: 'Book order', kind: 'primary', icon: 'check', onClick: (el) => submitOrder(el, st, lead) },
      ],
      onMount: (el) => {
        const form = el.querySelector('form');
        const q = (sel) => form.querySelector(sel);
        const modelNow = () => NA.model(q('[name=modelId]').value) || model;
        const listPrice = () => Number(modelNow().price) || 0;
        const termsNow = () => quoteTerms(lead, modelNow());
        const priceNow = () => { const t = termsNow(); return t ? t.price : listPrice(); };
        const netNow = () => Math.max(0, priceNow() - (Number(q('[name=discount]').value) || 0));
        const drawCustomers = () => {
          const list = el.querySelector('[data-cust-list]');
          const s = st.q.trim().toLowerCase();
          // A consultant books only for their own customers (the office server sends no others; this keeps one computer the same).
          let rows = NA.db.customers.filter((c) => (!NA.isRole('sales') || NA.isMine(c)) && (!s || [c.name, c.mobile, c.company, c.email].some((x) => String(x || '').toLowerCase().includes(s))));
          const sel = st.customerId && NA.customer(st.customerId);
          if (sel) rows = [sel].concat(rows.filter((c) => c.id !== sel.id));
          rows = rows.slice(0, 40);
          list.innerHTML = rows.length ? rows.map((c) => `<button type="button" class="so-pick ${c.id === st.customerId ? 'sel' : ''}" data-cid="${esc(c.id)}">${ui.avatar(c.name, 30)}<span class="grow"><b>${esc(c.name)}</b><small>${esc(c.mobile || 'No mobile')} · ${esc(c.type || 'Individual')}${c.address ? ' · ' + esc(c.address) : ''}</small></span>${c.id === st.customerId ? NA.icon('check-circle', 18, 'tone-green') : ''}</button>`).join('')
            : `<div class="so-pick-empty"><p class="muted small">No customer matches “${esc(st.q)}”.</p><button type="button" class="btn btn-sm btn-plain mt-8" data-mode="new">${NA.icon('user-plus', 15)}New customer</button></div>`;
          q('[name=customerId]').value = st.customerId || '';
        };
        const drawMode = () => {
          el.querySelectorAll('[data-cust-tabs] [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === st.mode));
          el.querySelectorAll('[data-mode-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.modePanel !== st.mode));
        };
        const drawColors = (keep) => {
          const mid = q('[name=modelId]').value;
          const cols = ui.opts.colors(mid);
          const cur = keep && cols.includes(keep) ? keep : (cols.find((c) => freeStock(mid, c)) || cols[0]);
          el.querySelector('[data-colors]').innerHTML = cols.map((c) => {
            const n = freeStock(mid, c);
            return `<label class="so-color"><input type="radio" name="color" value="${esc(c)}" ${c === cur ? 'checked' : ''}/><span>${swatch(c)}<span><b>${esc(c)}</b><small class="${n ? 'tone-green' : 'muted'}">${n ? n + ' in stock' : 'Not in stock'}</small></span></span></label>`;
          }).join('');
          const incoming = NA.where('vehicles', (v) => v.modelId === mid && ['in_transit', 'pdi'].includes(v.status) && !v.orderId).length;
          el.querySelector('[data-stockline]').textContent = `${freeStock(mid)} in stock · ${incoming} on the way. The car’s VIN is given after 100% payment.`;
        };
        const drawPrice = () => {
          const lp = listPrice();
          const t = termsNow();
          const pr = t ? t.price : lp;
          el.querySelector('[data-listprice]').innerHTML = `<b class="num">${F.money(pr)}</b>${pr !== lp ? ` <span class="muted small">· today’s list price ${F.money(lp)}</span>` : ''}`;
          el.querySelector('[data-pricehelp]').textContent = t ? `As quoted${t.no ? ' on ' + t.no : ''}: the customer pays ${F.money(t.net)}` : 'From the price list in Settings';
          const d = Number(q('[name=discount]').value) || 0;
          const free = NA.policy().discountFree;
          let text = '', warn = false, why = false;
          if (!d) text = `Up to ${F.money(free)} may be given without asking.`;
          else if (d <= free) text = 'No approval needed.';
          else if (leadCovers(modelNow().id, d)) text = 'Already approved on the quotation.';
          else if (NA.approvals.needed('discount', d)) {
            text = `Needs approval from the ${NA.approvals.approverRoles('discount', d).map(NA.roleLabel).join(' or ')}. You can book now — the VIN waits for the approval.`;
            warn = true; why = true;
          } else text = 'Within your own approval limit — it is recorded as approved by you.';
          const hint = el.querySelector('[data-dischint]');
          hint.textContent = text;
          hint.classList.toggle('tone-amber', warn);
          el.querySelector('[data-why]').classList.toggle('hidden', !why);
        };
        const drawChannel = () => {
          const ch = (form.querySelector('[name=channel]:checked') || {}).value || 'Retail';
          el.querySelectorAll('[data-for]').forEach((p) => p.classList.toggle('hidden', !p.dataset.for.split(' ').includes(ch)));
        };
        const drawRef = () => {
          const f = q('[name=bk_ref]');
          const box = f && f.closest('.field');
          if (box) box.classList.toggle('hidden', q('[name=bk_method]').value === 'Cash');
        };
        // Defaults follow the price until the person types their own figure.
        const refreshDefaults = () => {
          const net = netNow();
          if (!st.bkTouched) q('[name=bk_amount]').value = Math.min(500000, net);
          if (!st.loanTouched) q('[name=bank_loan]').value = Math.round(net * 0.6 / 10000) * 10000;
        };
        const drawSummary = () => {
          const v = ui.readForm(form);
          const ch = v.channel || 'Retail';
          const net = netNow();
          const bk = ch === 'Corporate' ? 0 : Number(v.bk_amount) || 0;
          const loan = ch === 'Bank' ? Number(v.bank_loan) || 0 : 0;
          const note = ch === 'Corporate'
            ? 'The company’s document confirms the order. The VIN is given after full payment — or earlier if the Managing Director approves.'
            : ch === 'Bank'
              ? `The customer pays ${F.money(Math.max(0, net - loan))} and the bank pays ${F.money(loan)}. The VIN is given when 100% is paid and confirmed.`
              : 'The rest can be paid in parts (cash, transfer, cheque). The VIN is given when 100% is paid and confirmed.';
          el.querySelector('[data-summary]').innerHTML = `
            <div><small>Price after discount (incl. VAT)</small><b class="num">${F.money(net)}</b></div>
            <div><small>Booking money today</small><b class="num">${ch === 'Corporate' ? 'Not needed' : F.money(bk)}</b></div>
            <div><small>Still to pay after booking</small><b class="num">${F.money(Math.max(0, net - bk))}</b></div>
            <div class="note">${NA.icon('info', 16)}<span>${esc(note)}</span></div>`;
        };

        drawMode(); drawCustomers(); drawColors(color); drawPrice(); drawChannel(); drawRef(); drawSummary();

        el.addEventListener('click', (e) => {
          const m = e.target.closest('[data-mode]');
          if (m) { st.mode = m.dataset.mode; drawMode(); const first = el.querySelector(`[data-mode-panel="${st.mode}"] input:not([type=hidden])`); if (first) first.focus(); return; }
          const pick = e.target.closest('[data-cid]');
          if (pick) { st.customerId = pick.dataset.cid; drawCustomers(); const x = q('[data-err="customer"]'); if (x) x.textContent = ''; }
        });
        el.querySelector('[data-cust-q]').addEventListener('input', (e) => { st.q = e.target.value; drawCustomers(); });
        form.addEventListener('input', (e) => {
          if (e.target.name === 'bk_amount') st.bkTouched = true;
          if (e.target.name === 'bank_loan') st.loanTouched = true;
          if (e.target.name === 'discount') { st.discTouched = true; refreshDefaults(); drawPrice(); }
          drawSummary();
        });
        form.addEventListener('change', (e) => {
          const n = e.target.name;
          if (n === 'modelId') {
            // Until the person types a discount, it follows the model: the quote's terms for the quoted model.
            if (!st.discTouched) q('[name=discount]').value = startDiscount(modelNow());
            drawColors(); drawPrice(); refreshDefaults();
          }
          if (n === 'channel') { drawChannel(); const x = q('[data-err="channel"]'); if (x) x.textContent = ''; }
          if (n === 'color') { const x = q('[data-err="color"]'); if (x) x.textContent = ''; }
          if (n === 'bk_method') drawRef();
          if (e.target.closest('.field')) e.target.closest('.field').classList.remove('invalid');
          drawSummary();
        });
      },
    });
  };

  /**
   * Warn when a cheque / transfer reference is already on a receipt (a typo or a double entry) — anyone's: the office
   * server is asked (NA.lookupPaymentRef), as a consultant receives only their own receipts; this computer's are checked
   * too. Payments that were not received and refunds do not count. Resolves true to go on.
   */
  async function refIsNew(ref) {
    const key = refKey(ref);
    if (!key) return true;
    let found = [];
    try { found = (typeof NA.lookupPaymentRef === 'function' && (await NA.lookupPaymentRef(ref))) || []; } catch (e) { found = []; }
    NA.db.payments.forEach((p) => { if (refKey(p.ref) === key && !found.some((x) => x.id === p.id)) found.push(p); });
    const dup = found.find((p) => p.status !== 'bounced' && !((Number(p.amount) || 0) < 0));
    if (!dup) return true;
    return ui.confirm(`Reference <b>${esc(ref)}</b> is already on receipt <b>${esc(dup.receiptNo || '')}</b> (${F.money(dup.amount)}, ${esc(F.date(dup.date))}). Save it again?`,
      { title: 'Same reference used before', okLabel: 'Save anyway' });
  }

  /** File a discount approval for an order (approved at once when the person may approve it themselves). */
  function requestDiscount(o, reason) {
    const d = Number(o.discount) || 0;
    return NA.approvals.request({
      type: 'discount', ref: { c: 'orders', id: o.id, code: o.code },
      title: `${F.money(d)} off ${o.code}`,
      detail: `${NA.customerName(o.customerId)} · ${NA.modelName(o.modelId)} · list price ${F.money(listPriceOf(o))} → ${F.money(B.orderNet(o))}`,
      amount: d, value: d, reason: reason || '', data: { listPrice: listPriceOf(o), net: B.orderNet(o) },
    });
  }

  /** The mobile belongs to another consultant's customer or lead: offer to ask for a hand-over (never book a duplicate). */
  function alreadyWithSheet(m, v) {
    const me = NA.me();
    const owner = m.ownerName || 'another consultant';
    ui.modal({
      title: 'Already with ' + owner, size: 'sm',
      body: `<p>${m.kind === 'lead' ? 'This mobile number belongs to a lead of' : 'This customer belongs to'} <b>${esc(owner)}</b>${m.name ? ' (' + esc(m.name) + ')' : ''}. To book the order yourself, ask the Sales Manager to hand the customer to you.</p>`,
      actions: [{ label: 'Back' }, { label: 'Ask Sales Manager to hand over', kind: 'primary', onClick: () => {
        // Same shape as the CRM's own hand-over request: a customer is looked up among customers (by its number when this
        // person cannot see the record), and it goes to whoever asked.
        NA.ui.requestApproval({
          type: 'transfer', sheetTitle: 'Ask for a hand-over',
          ref: { c: m.kind === 'lead' ? 'leads' : 'customers', id: m.id || '', code: m.name || normMobile(v.c_mobile) },
          title: `Hand ${m.name || v.c_name || 'this customer'} (${v.c_mobile}) to ${me.name}`,
          detail: `Now with ${owner}. ${me.name} wants to book an order.`,
          amount: 0, value: 0,
          data: { mobile: normMobile(v.c_mobile), kind: m.kind, ownerId: m.ownerId || null, name: v.c_name, toStaffId: me.staffId || null, toName: me.name },
        });
      } }],
    });
  }

  /**
   * New customer typed in: is the mobile already known — even to someone else (works server-wide)?
   * Resolves an existing customer id to use, null to create a new customer, or false to stop.
   */
  async function duplicateCheck(v, lead) {
    const digits = normMobile(v.c_mobile);
    const local = NA.find('customers', (c) => normMobile(c.mobile) === digits);
    if (local) {
      const use = await ui.confirm(`<b>${esc(local.name)}</b> already has mobile <b>${esc(v.c_mobile)}</b>. Use that customer for this order?`, { title: 'Customer already exists', okLabel: 'Use this customer' });
      return use ? local.id : false;
    }
    let matches = [];
    try { matches = (await NA.lookupMobile(digits)) || []; } catch (e) { matches = []; }
    const other = matches.find((x) => !x.mine && (x.kind === 'customer' || (x.kind === 'lead' && (!lead || x.id !== lead.id) && !['won', 'lost'].includes(x.stage))));
    if (!other) return null;
    if (NA.can('leads.assign')) {
      const ok = await ui.confirm(`This mobile is already with <b>${esc(other.ownerName || 'another consultant')}</b> (${other.kind === 'lead' ? 'a lead' : 'a customer'}${other.name ? ': ' + esc(other.name) : ''}). Book the order anyway?`,
        { title: 'Already with another consultant', okLabel: 'Book anyway' });
      return ok ? null : false;
    }
    alreadyWithSheet(other, v);
    return false;
  }

  async function submitOrder(el, st, lead) {
    const form = el.querySelector('form');
    clearInvalid(form);
    // The same lead may have been booked on another screen since this sheet opened.
    const booked0 = leadBooked(lead);
    if (booked0) { bookedStop(lead, booked0, true); return true; }
    const v = ui.readForm(form);
    const ch = v.channel;
    const m = NA.model(v.modelId);
    const canAssign = NA.can('leads.assign');
    // 1. customer
    let customerId = null;
    if (st.mode === 'existing') {
      if (!st.customerId || !NA.customer(st.customerId)) return sectionError(form, 'customer', 'Choose the customer from the list — or switch to “New customer”.');
      customerId = st.customerId;
    } else {
      if (!v.c_name) return markInvalid(form, 'c_name', 'Enter the customer’s name');
      if (normMobile(v.c_mobile).length < 10) return markInvalid(form, 'c_mobile', 'Enter a valid mobile number (11 digits, e.g. 017XXXXXXXX)');
      const found = await duplicateCheck(v, lead);
      if (found === false) return false;
      if (found) customerId = found;
    }
    // 2. car and price — the list price comes from Settings (or the lead's quote for this model); only the discount is typed
    if (!m) return markInvalid(form, 'modelId', 'Choose the model');
    if (!v.color) return sectionError(form, 'color', 'Choose the colour');
    const listPrice = Number(m.price) || 0;
    if (listPrice <= 0) return markInvalid(form, 'modelId', 'This model has no list price yet — the Managing Director sets it in Settings');
    const terms = quoteTerms(lead, m);
    const orderList = terms ? terms.listPrice : listPrice;
    const price = terms ? terms.price : listPrice;
    const discount = Number(v.discount) || 0;
    if (discount < 0 || discount >= price) return markInvalid(form, 'discount', 'The discount must be less than the price');
    const net = price - discount;
    const consultantId = canAssign ? v.consultantId : (NA.myStaffId() || '');
    if (canAssign && !consultantId && ui.opts.consultants().length) return markInvalid(form, 'consultantId', 'Choose the sales consultant');
    // 3. payment
    if (!ch) return sectionError(form, 'channel', 'Choose how the customer pays: Retail, Bank loan or Corporate.');
    if (ch === 'Bank') {
      if (!v.bank_name) return markInvalid(form, 'bank_name', 'Enter the bank');
      if (!(Number(v.bank_loan) > 0)) return markInvalid(form, 'bank_loan', 'Enter the loan amount');
      if (Number(v.bank_loan) >= net) return markInvalid(form, 'bank_loan', 'The loan must be less than the price — the customer pays the rest');
    }
    if (ch === 'Corporate') {
      if (!v.corp_ref) return markInvalid(form, 'corp_ref', 'Enter the number of the purchase order or award letter');
      if (!v.corp_date) return markInvalid(form, 'corp_date', 'Enter the document date');
      const units = Math.max(1, Number(v.corp_units) || 1);
      const used = NA.where('orders', (o) => o.stage !== 'cancelled' && o.corporate && String(o.corporate.docRef || '').trim().toLowerCase() === v.corp_ref.trim().toLowerCase()).length;
      if (used >= units) {
        const ok = await ui.confirm(`Document <b>${esc(v.corp_ref)}</b> is already on ${used} order${used === 1 ? '' : 's'}, and it covers ${units} car${units === 1 ? '' : 's'}. Book another order on it?`, { title: 'Document already used', okLabel: 'Book anyway' });
        if (!ok) return false;
      }
    }
    if (ch !== 'Corporate') {
      const bk = Number(v.bk_amount) || 0;
      if (bk <= 0) return markInvalid(form, 'bk_amount', 'Enter the booking money received');
      if (bk > net) return markInvalid(form, 'bk_amount', 'The booking money cannot be more than the price');
      if (!v.bk_date || v.bk_date > NA.today()) return markInvalid(form, 'bk_date', 'Enter the date the money was received (not a future date)');
      if (!NA.can('payments.verify') && v.bk_date < NA.addDays(NA.today(), -3)) return markInvalid(form, 'bk_date', 'Money received more than 3 days ago is entered by Accounts');
      if (REF_METHODS.includes(v.bk_method) && !v.bk_ref) return markInvalid(form, 'bk_ref', `Enter the ${v.bk_method === 'Cheque' ? 'cheque number' : 'reference number'}`);
      if (v.bk_method !== 'Cash' && v.bk_ref && !(await refIsNew(v.bk_ref))) return false;
    }
    // Checked again: the questions above wait for an answer, and a sync can bring the other screen's booking meanwhile.
    const booked = leadBooked(lead);
    if (booked) { bookedStop(lead, booked, true); return true; }

    // ---- save ----
    const me = NA.me();
    let stays = '';
    if (!customerId) {
      const corporate = v.c_type === 'Corporate';
      // firstOrderAt: the customer has bought — Customers and the office server then lock their name, mobile, NID and TIN.
      const c = NA.insert('customers', {
        name: v.c_name, mobile: storeMobile(v.c_mobile), type: v.c_type || 'Individual', email: v.c_email || '', address: v.c_address || '',
        company: corporate ? v.c_name : (lead && lead.company) || '', contactPerson: '', nid: corporate ? '' : (v.c_nid || ''), tin: corporate ? (v.c_nid || '') : '',
        leadId: lead ? lead.id : null, consultantId: consultantId || null, firstOrderAt: NA.today(),
      });
      customerId = c.id;
      NA.log(`New customer ${c.name} added${lead ? ' from lead ' + (lead.code || '') : ''}`, { rec: c, link: '#/customers/' + c.id, kind: 'info' });
    } else {
      // A manager booking for another consultant: the customer goes with the order, so that consultant can see them —
      // unless the present consultant still has an order with them (their receipts and handover need the customer too).
      const c = NA.customer(customerId);
      if (c && canAssign && consultantId && c.ownerId !== consultantId) {
        const busy = c.ownerId ? NA.where('orders', (x) => x.customerId === c.id && x.consultantId === c.ownerId && x.stage !== 'cancelled') : [];
        if (!busy.length) {
          const before = c.ownerId || null;
          NA.update('customers', c.id, { consultantId });
          if (NA.leadUtils && NA.leadUtils.customerHandedOver) NA.leadUtils.customerHandedOver(c.id, before, consultantId);
          NA.log(`${c.name} handed to ${NA.staffName(consultantId)} with a new order`, { rec: c, link: '#/customers/' + c.id, kind: 'info' });
        } else stays = `${c.name} stays with ${NA.staffName(c.ownerId)}, who has ${busy.length === 1 ? 'order ' + busy[0].code : busy.length + ' orders'} with them`;
      }
      // Their first order: stamped once (a customer from before the stamp gets the day of their first order seen here).
      // Only where this person may change the customer — the office server refuses anyone else.
      const cur = NA.customer(customerId);
      if (cur && !cur.firstOrderAt && (canWrite('customers') || NA.isMine(cur))) {
        const first = NA.where('orders', (x) => x.customerId === cur.id).map(bookingDate).sort()[0];
        NA.update('customers', cur.id, { firstOrderAt: first && first < NA.today() ? first : NA.today() });
      }
    }
    const bookingDay = ch === 'Corporate' ? (v.corp_date || NA.today()) : (v.bk_date || NA.today());
    const quoteNo = terms ? terms.no || st.quoteNo || '' : '';   // the quote it was booked on (not when booked for another model)
    const order = NA.insert('orders', {
      code: NA.nextCode('SO'), customerId, modelId: m.id, color: v.color, channel: ch, stage: 'booking',
      listPrice: orderList, price, discount, consultantId: consultantId || null, leadId: lead ? lead.id : null, quoteNo,
      booking: { date: bookingDay, receiptNo: '' },
      bank: ch === 'Bank' ? { bankName: v.bank_name, branch: v.bank_branch || '', loanAmount: Number(v.bank_loan) || 0, steps: { application: null, approval: null, sanction: null, documents: null, disbursement: null } } : null,
      corporate: ch === 'Corporate' ? { docType: v.corp_type, docRef: v.corp_ref, date: v.corp_date, units: Math.max(1, Number(v.corp_units) || 1) } : null,
      vehicleId: null, brta: null, delivery: null, expectedDelivery: NA.addDays(NA.today(), 21),
      noteLog: v.notes ? [{ at: nowIso(), text: v.notes, by: me.name, byId: me.staffId || null }] : [],
      createdBy: me.name, createdById: me.staffId || null, history: [],
    });
    NA.log(`Order ${order.code} booked — ${NA.customerName(customerId)}, ${NA.modelName(order.modelId)} (${order.color}), ${channelLabel(ch)}${ch === 'Corporate' ? ' · ' + v.corp_type + ' ' + v.corp_ref : ''}${quoteNo ? ' · quote ' + quoteNo : ''}`, { rec: order, link: '#/sales/' + order.id, kind: 'success' });
    let receipt = null;
    if (ch !== 'Corporate') {
      receipt = B.recordPayment(order, { amount: Number(v.bk_amount), method: v.bk_method, date: v.bk_date, ref: v.bk_method === 'Cash' ? '' : v.bk_ref, note: 'Booking money' });
      NA.update('orders', order.id, { booking: Object.assign({}, order.booking, { receiptNo: receipt.receiptNo, amount: receipt.amount }) });
      rememberMethod(v.bk_method);
    }
    // The stage follows by itself: B.recordPayment saves it, and so does a discount approved at once (onDecide below).
    let approval = null;
    const fresh = NA.get('orders', order.id);
    if (discount > NA.policy().discountFree && !discountOk(fresh)) approval = requestDiscount(fresh, v.discountReason);
    if (lead) {
      NA.log(`Lead converted to order ${order.code}`, { rec: lead, link: '#/sales/' + order.id, kind: 'success' });
      NA.update('leads', lead.id, { stage: 'won', orderId: order.id, customerId, wonAt: NA.today() });
    }
    ui.toast((approval && approval.status === 'pending' ? `Order ${order.code} booked — the discount is sent for approval` : `Order ${order.code} booked`) + (stays ? ` · ${stays}` : ''), 'success');
    setTimeout(() => {
      NA.go('#/sales/' + order.id);
      if (NA.refresh) NA.refresh();
      if (receipt) setTimeout(() => receiptSheet(receipt), 250);
    }, 0);
    return true;
  }

  /* ------------------------------------------------------------------------
     ACTION: Record customer payment
     ------------------------------------------------------------------------ */
  function openPayment(orderId, opts) {
    opts = opts || {};
    ensureCss();
    if (!NA.can('payments.record')) { ui.toast('Payments are recorded by the sales team or Accounts', 'info'); return; }
    const toCollect = (o) => B.orderToCollect(o);   // money waiting for Accounts counts as handed over
    const payable = (o) => o.stage !== 'cancelled' && !B.cancelPending(o) && toCollect(o) > 0.5;
    const order = orderId ? NA.get('orders', orderId) : null;
    if (orderId && !order) { ui.toast('This order isn’t available to you', 'error'); return; }
    if (order) {
      if (order.stage === 'cancelled') { ui.toast('This order is cancelled — no more payments can be recorded', 'error'); return; }
      if (B.cancelPending(order)) { ui.toast('A cancellation is waiting for a decision — payments are paused', 'info'); return; }
      if (toCollect(order) <= 0.5) {
        const pend = B.orderPending(order);
        ui.toast(pend > 0.5 ? `${order.code} is fully paid — ${F.money(pend)} is waiting for Accounts to confirm` : `${order.code} is already fully paid`, 'info');
        return;
      }
    }
    // Consultants only ever get their own orders; newest first, customer's name first.
    const candidates = order ? [] : NA.db.orders.filter((o) => payable(o) && (!NA.isRole('sales') || NA.isMine(o)))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!order && !candidates.length) { ui.toast('No orders with money still to collect', 'info'); return; }
    const st = { orderId: order ? order.id : '', q: '', amtTouched: false };
    const minDate = NA.can('payments.verify') ? null : NA.addDays(NA.today(), -3);
    const methods = opts.lockMethod ? [opts.method] : NA.FLOW.paymentMethods.filter((m) => m !== 'Bank Disbursement' || (order && order.channel === 'Bank'));
    const method0 = opts.method && methods.includes(opts.method) ? opts.method : rememberedMethod(methods);
    // What is filled in: everything still to pay. On a bank-loan order the customer's own share comes first, and the
    // bank's part only as a Bank Disbursement — so the bank's money is never saved as the customer's cash by default.
    const suggest = (o, method) => {
      const left = toCollect(o);
      if (!bankOpen(o)) return left;
      return Math.min(left, method === 'Bank Disbursement' ? Number(o.bank.loanAmount) || left : shareLeft(o));
    };
    const amount0 = opts.amount != null ? Math.round(opts.amount) : order ? Math.round(suggest(order, method0)) || '' : '';
    const amountHelp = order && bankOpen(order) && opts.amount == null ? 'The customer’s own share still to pay is filled in — the bank’s money is recorded as a Bank Disbursement'
      : 'The full amount still to pay is filled in — change it for a part payment';

    const body = `<form onsubmit="return false">
      ${order ? `<div class="row gap-12 so-mb">${ui.avatar(NA.customerName(order.customerId), 38)}<div><b>${esc(NA.customerName(order.customerId))}</b><div class="muted small">${esc(order.code)} · ${swatch(order.color)} ${esc(NA.modelName(order.modelId))} · ${esc(order.color || '')} · ${esc(channelLabel(order.channel))}</div></div></div>`
        : `<div class="field"><label>Which order is this money for?</label><input type="search" placeholder="Search by customer, order or mobile" data-pay-q autocomplete="off" aria-label="Search orders"/></div>
           <div class="so-pick-list" data-pay-list></div><small class="so-err" data-err="order"></small>`}
      <div class="so-stats mt-16" data-stats></div>
      <div class="form-grid mt-16">
        ${ui.field({ name: 'amount', label: 'Amount received', type: 'money', required: true, help: amountHelp }, amount0)}
        ${ui.field({ name: 'method', label: 'Paid by', type: 'select', placeholder: false, options: methods }, method0)}
        ${ui.field({ name: 'date', label: 'Date received', type: 'date', required: true, min: minDate, max: NA.today(), help: minDate ? 'Within the last 3 days — older money is entered by Accounts' : '' }, NA.today())}
        ${ui.field({ name: 'ref', label: 'Reference (cheque or transfer no.)', placeholder: 'e.g. RTGS-CITY-77812' }, opts.ref || '')}
        ${ui.field({ name: 'note', label: 'Note (optional)', span: 2 }, opts.note || '')}
      </div>
      <div class="callout callout-info mt-16" data-after>${NA.icon('info')}<span>Choose the order to see what this payment does.</span></div>
    </form>`;

    ui.modal({
      title: opts.title || 'Record payment',
      subtitle: 'A money receipt number is given automatically',
      size: 'md',
      body,
      actions: [
        { label: 'Cancel' },
        { label: 'Save payment', kind: 'primary', icon: 'check', onClick: async (el) => {
          const form = el.querySelector('form');
          clearInvalid(form);
          const v = ui.readForm(form);
          const o = order || NA.get('orders', st.orderId);
          if (!o) return sectionError(form, 'order', 'Choose the order this money is for');
          const max = toCollect(o);
          const amt = Number(v.amount) || 0;
          if (amt <= 0) return markInvalid(form, 'amount', 'Enter the amount received');
          if (amt > max + 0.5) return markInvalid(form, 'amount', `That is more than the ${F.money(max)} still to pay`);
          if (!v.date || v.date > NA.today()) return markInvalid(form, 'date', 'Enter the date the money was received (not a future date)');
          if (minDate && v.date < minDate) return markInvalid(form, 'date', 'Money received more than 3 days ago is entered by Accounts');
          if (REF_METHODS.includes(v.method) && !v.ref) return markInvalid(form, 'ref', `Enter the ${v.method === 'Cheque' ? 'cheque number' : 'reference number'}`);
          if (v.method !== 'Cash' && v.ref && !(await refIsNew(v.ref))) return false;
          const fresh0 = NA.get('orders', o.id);
          if (!fresh0 || !payable(fresh0)) { ui.toast('This order changed in the meantime — nothing was saved', 'error'); NA.refresh(); return true; }
          const p = B.recordPayment(fresh0, { amount: amt, method: v.method, date: v.date, ref: v.method === 'Cash' ? '' : v.ref, note: v.note });   // also saves the stage
          if (!opts.lockMethod && v.method !== 'Bank Disbursement') rememberMethod(v.method);
          if (opts.onSaved) opts.onSaved(p, v, o);
          if (NA.refresh) NA.refresh();
          setTimeout(() => receiptSheet(p), 200);
          return true;
        } },
      ],
      onMount: (el) => {
        const form = el.querySelector('form');
        const drawPick = () => {
          const list = el.querySelector('[data-pay-list]');
          if (!list) return;
          const s = st.q.trim().toLowerCase();
          const rows = candidates.filter((o) => !s || [o.code, NA.customerName(o.customerId), (NA.customer(o.customerId) || {}).mobile, NA.modelName(o.modelId)]
            .some((x) => String(x || '').toLowerCase().includes(s))).slice(0, 30);
          list.innerHTML = rows.length ? rows.map((o) => `<button type="button" class="so-pick ${o.id === st.orderId ? 'sel' : ''}" data-oid="${esc(o.id)}">${ui.avatar(NA.customerName(o.customerId), 30)}<span class="grow"><b>${esc(NA.customerName(o.customerId))}</b><small>${esc(o.code)} · ${esc(NA.modelName(o.modelId))} · ${F.money(toCollect(o))} to pay</small></span>${o.id === st.orderId ? NA.icon('check-circle', 18, 'tone-green') : ''}</button>`).join('')
            : `<p class="muted small so-pick-empty">No order matches “${esc(st.q)}”.</p>`;
        };
        const drawRef = () => {
          const box = form.querySelector('[name=ref]') && form.querySelector('[name=ref]').closest('.field');
          if (box) box.classList.toggle('hidden', form.querySelector('[name=method]').value === 'Cash');
        };
        const draw = (resetAmount) => {
          const o = order || NA.get('orders', st.orderId);
          const stats = el.querySelector('[data-stats]');
          const after = el.querySelector('[data-after]');
          if (!o) { stats.innerHTML = ''; after.className = 'callout callout-info mt-16'; after.innerHTML = `${NA.icon('info')}<span>Choose the order to see what this payment does.</span>`; return; }
          const net = B.orderNet(o), paid = B.orderPaid(o), pend = B.orderPending(o), max = toCollect(o);
          if (resetAmount && !st.amtTouched) form.querySelector('[name=amount]').value = Math.round(suggest(o, form.querySelector('[name=method]').value)) || '';
          const amt = Number(form.querySelector('[name=amount]').value) || 0;
          stats.innerHTML = `<div class="so-stat"><small>Price after discount</small><b class="num">${F.money(net)}</b></div>
            <div class="so-stat"><small>Paid and confirmed</small><b class="num">${F.money(paid)}</b>${pend > 0.5 ? `<span>${F.money(pend)} waiting for Accounts</span>` : ''}</div>
            <div class="so-stat"><small>Still to pay</small><b class="num">${F.money(max)}</b></div>`;
          const waits = B.initialPaymentStatus(form.querySelector('[name=method]').value) === 'pending';
          if (amt > max + 0.5) {
            after.className = 'callout callout-danger mt-16';
            after.innerHTML = `${NA.icon('alert')}<span>That is <b>${F.money(amt - max)}</b> more than what is still to pay.</span>`;
          } else if (amt >= max - 0.5 && amt > 0) {
            after.className = 'callout callout-ok mt-16';
            after.innerHTML = `${NA.icon('check-circle')}<span>This pays the order in full. ${waits ? 'The VIN can be given <b>once Accounts confirms the money</b>.' : 'The order is <b>ready for its VIN</b>.'}</span>`;
          } else {
            after.className = 'callout callout-info mt-16';
            after.innerHTML = `${NA.icon('info')}<span>After this payment <b>${F.money(Math.max(0, max - amt))}</b> is still to pay.${waits ? ' Accounts confirms the money before it counts.' : ''}</span>`;
          }
        };
        drawPick(); drawRef(); draw(false);
        el.addEventListener('click', (e) => {
          const pick = e.target.closest('[data-oid]');
          if (!pick) return;
          st.orderId = pick.dataset.oid; drawPick(); draw(true);
          const x = form.querySelector('[data-err="order"]'); if (x) x.textContent = '';
        });
        const pq = el.querySelector('[data-pay-q]');
        if (pq) pq.addEventListener('input', (e) => { st.q = e.target.value; drawPick(); });
        form.addEventListener('input', (e) => { if (e.target.name === 'amount') st.amtTouched = true; draw(false); });
        form.addEventListener('change', (e) => {
          if (e.target.closest('.field')) e.target.closest('.field').classList.remove('invalid');
          if (e.target.name === 'method') drawRef();
          // Until the person types an amount, it follows the method (customer's share, or the bank's part).
          draw(e.target.name === 'method' && opts.amount == null);
        });
      },
    });
  }
  NA.actions.recordPayment = function (orderId) { openPayment(orderId && typeof orderId === 'string' ? orderId : null); };

  /* ------------------------------------------------------------------------
     LIST: pipeline board / table
     ------------------------------------------------------------------------ */
  // urlChannel: the ?channel= of the last address seen. A channel in the address is applied once, when it changes;
  // after that the filter belongs to the screen (otherwise every redraw would put the address's channel back).
  const listState = { q: '', channel: '', urlChannel: undefined, consultant: '', view: null };
  function getView() {
    if (listState.view) return listState.view;
    try { listState.view = localStorage.getItem('na-sales-view') || 'board'; } catch (e) { listState.view = 'board'; }
    return listState.view;
  }
  function setView(v) { listState.view = v; try { localStorage.setItem('na-sales-view', v); } catch (e) { /* only a convenience */ } }

  /** The orders this person works with. A consultant only ever has their own (the office server sends nothing else). */
  const myOrders = () => NA.db.orders.filter((o) => !NA.isRole('sales') || NA.isMine(o));

  function matchesFilters(o) {
    if (listState.channel && o.channel !== listState.channel) return false;
    if (listState.consultant && o.consultantId !== listState.consultant) return false;
    const q = listState.q.trim().toLowerCase();
    if (q) {
      const c = NA.customer(o.customerId) || {};
      const v = NA.vehicle(o.vehicleId) || {};
      const hay = [o.code, c.name, c.mobile, c.company, NA.modelName(o.modelId), o.color, v.vin, o.brta && o.brta.regNo].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  /** The one thing an order needs right now, as a single badge ('' when nothing stands out). */
  function orderFlag(o) {
    if (o.stage === 'cancelled') return o.refund && o.refund.status === 'due' ? ui.badge('Refund due', 'red') : '';
    if (o.stage === 'delivered') return B.orderBalance(o) > 0.5 ? ui.badge('Balance due', 'amber') : '';
    if (B.cancelPending(o)) return ui.badge('Cancellation asked', 'red');
    if (!paidOrCredit(o) && orderPayments(o).some(B.paymentBounced)) return ui.badge('Payment not received', 'red');
    if (corpDocMissing(o)) return ui.badge('Needs company document', 'amber');
    const ds = discountState(o);
    if (ds === 'pending' || (NA.approvals && NA.approvals.isPending('orders', o.id, 'credit'))) return ui.badge('Waiting for approval', 'amber');
    if (ds === 'none' || ds === 'rejected') return ui.badge('Discount needs approval', 'amber');
    if (B.orderPending(o) > 0.5) return ui.badge('Money to confirm', 'amber');
    const s = stageOf(o);
    if (s === 'vin' && !stockFor(o).length) return emergencyPOs(o).length ? ui.badge('Emergency car coming', 'blue') : ui.badge('No car in stock', 'amber');
    if (s === 'delivery' && !deliveryBlockersFor(o).length && !checklistMissing(o).length) return ui.badge('Ready', 'green');
    return '';
  }

  function orderCard(o) {
    const flag = orderFlag(o);
    const who = !NA.isRole('sales') && o.consultantId ? NA.staffName(o.consultantId).split(' ')[0] : daysOpen(o) + (daysOpen(o) === 1 ? ' day' : ' days');
    return `<a class="kcard so-card" href="#/sales/${esc(o.id)}">
      <div class="t">${esc(NA.customerName(o.customerId))}</div>
      <div class="s">${swatch(o.color)} ${esc(NA.modelName(o.modelId))} · ${esc(o.color || '')}</div>
      <div class="so-pay"><div class="so-pay-line"><span><b>${F.short(B.orderPaid(o))}</b> of ${F.short(B.orderNet(o))}</span><span class="num">${F.pct(B.orderPaidPct(o))}</span></div>${ui.progress(B.orderPaidPct(o), payTone(o))}</div>
      ${flag ? `<div class="so-flag">${flag}</div>` : ''}
      <div class="foot"><span class="mono">${esc(o.code)}</span><span>${esc(who)}</span></div>
    </a>`;
  }

  function renderBoard(rows) {
    return `<div class="kanban so-board">${LANES.map((l) => {
      const items = rows.filter((o) => l.stages.includes(stageOf(o))).sort((a, b) => daysOpen(b) - daysOpen(a));
      const value = items.reduce((t, o) => t + B.orderNet(o), 0);
      return `<section class="lane">
        <div class="lane-head"><div class="row-between"><b>${esc(l.label)}</b><span class="lane-count">${items.length}</span></div><small>${items.length ? F.short(value) : 'Nothing here'}</small></div>
        <div class="lane-body">${items.map(orderCard).join('') || '<p class="so-lane-empty">No orders</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  }

  /** Short line under the status in the table. */
  function statusSub(o) {
    if (o.stage === 'delivered') return `<div class="cell-sub">on ${esc(F.date(o.deliveredAt))}</div>`;
    if (o.stage === 'cancelled') return `<div class="cell-sub">${esc((o.cancel && o.cancel.reason) || '')}</div>`;
    const flag = orderFlag(o);
    return flag ? `<div class="mt-4">${flag}</div>` : '';
  }

  function renderTable(rows) {
    const showWho = !NA.isRole('sales');
    const sorted = rows.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.code).localeCompare(String(a.code)));
    const cols = [
      { label: 'Customer and car', render: (o) => `<a class="cell-main" href="#/sales/${esc(o.id)}">${esc(NA.customerName(o.customerId))}</a><div class="cell-sub">${swatch(o.color)} ${esc(NA.modelName(o.modelId))} · ${esc(o.color || '')} · <span class="mono">${esc(o.code)}</span></div>` },
      { label: 'Status', render: (o) => stageBadge(o) + statusSub(o) },
      { label: 'Paid', cls: 'right', render: (o) => `<span class="num nowrap">${F.money(B.orderPaid(o))}</span><div class="cell-sub">${F.pct(B.orderPaidPct(o))}</div>` },
      { label: 'Still to pay', cls: 'right', render: (o) => {
        if (o.stage === 'cancelled') return o.refund ? `<span class="num nowrap">${F.money(o.refund.amount)}</span><div class="cell-sub">${o.refund.status === 'paid' ? 'refunded' : 'refund due'}</div>` : '<span class="muted">—</span>';
        const bal = B.orderBalance(o), pend = B.orderPending(o);
        if (bal <= 0.5) return `<span class="tone-green">Paid</span>`;
        return `<span class="num nowrap">${F.money(bal)}</span>${pend > 0.5 ? `<div class="cell-sub">${F.money(pend)} to confirm</div>` : ''}`;
      } },
    ];
    if (showWho) cols.push({ label: 'Consultant', render: (o) => `<span class="nowrap">${esc(NA.staffName(o.consultantId))}</span>` });
    return `<div class="card">${ui.table(cols, sorted, { rowAttr: (o) => `data-href="#/sales/${esc(o.id)}"`, empty: 'No orders match these filters', emptyIcon: 'receipt' })}</div>`;
  }

  function renderList(root, query) {
    const stageQ = query.stage && (OPEN_STAGES.includes(query.stage) || query.stage === 'delivered' || query.stage === 'cancelled') ? query.stage : '';
    const seg = stageQ === 'delivered' || stageQ === 'cancelled' ? stageQ : 'active';
    const stageFilter = OPEN_STAGES.includes(stageQ) ? stageQ : '';
    if (query.channel !== listState.urlChannel) {
      listState.urlChannel = query.channel;
      listState.channel = NA.FLOW.channels.some((c) => c.key === query.channel) ? query.channel : '';
    }
    const consultantView = NA.isRole('sales');
    const all = myOrders();
    const counts = { active: all.filter(isOpen).length, delivered: all.filter((o) => o.stage === 'delivered').length, cancelled: all.filter((o) => o.stage === 'cancelled').length };
    const useBoard = seg === 'active' && getView() === 'board';
    const canNew = NA.can('orders.create');
    const canPay = NA.can('payments.record');
    const toConfirm = NA.can('payments.verify') ? B.paymentsToVerify().filter((p) => p.orderId).length : 0;
    const consultants = ui.opts.consultants();
    const SEGS = [['active', 'Active'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

    root.innerHTML = `
      ${ui.pageHead({
        title: consultantView ? 'My orders' : 'Orders',
        subtitle: consultantView ? 'Your customers’ cars, from booking to handover.' : 'Every car sold, from booking to handover.',
        actions: (canPay ? ui.btn('Record payment', { icon: 'wallet', act: 'pay' }) : '') + (canNew ? ui.btn('New order', { kind: 'primary', icon: 'plus', act: 'new' }) : ''),
      })}
      ${toConfirm ? `<a class="alert-row so-mb" href="#/approvals?tab=money"><span class="ar-icon bg-amber">${NA.icon('wallet', 17)}</span><div class="grow"><b>${toConfirm} payment${toConfirm === 1 ? '' : 's'} waiting for you to confirm</b><div class="small muted">Money counts towards “fully paid” only after you confirm it.</div></div>${NA.icon('chevron-right', 16)}</a>` : ''}
      <div class="toolbar so-toolbar">
        <div class="seg">${SEGS.map(([k, label]) => `<button data-act="seg" data-seg="${k}" class="${k === seg ? 'active' : ''}">${esc(label)} <span class="n">${counts[k]}</span></button>`).join('')}</div>
        <input type="search" data-q placeholder="Search customer, order, VIN or reg. no." value="${esc(listState.q)}" aria-label="Search orders"/>
        <select data-channel aria-label="Channel"><option value="">All channels</option>${NA.FLOW.channels.map((c) => `<option value="${esc(c.key)}" ${listState.channel === c.key ? 'selected' : ''}>${esc(channelLabel(c.key))}</option>`).join('')}</select>
        ${consultantView ? '' : `<select data-consultant aria-label="Consultant"><option value="">All consultants</option>${consultants.map((c) => `<option value="${esc(c.value)}" ${c.value === listState.consultant ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`}
        ${seg === 'active' ? `<div class="seg"><button data-act="view" data-view="board" class="${useBoard ? 'active' : ''}">Board</button><button data-act="view" data-view="table" class="${!useBoard ? 'active' : ''}">List</button></div>` : ''}
      </div>
      ${stageFilter ? `<div class="chips so-mb"><button class="chip active" data-act="clear-stage" title="Show all active orders">${esc(STAGE_NAME[stageFilter])} ${NA.icon('x', 14)}</button></div>` : ''}
      <div data-results></div>`;

    const draw = () => {
      const box = root.querySelector('[data-results]');
      if (!all.length) {
        box.innerHTML = `<div class="card">${ui.empty(consultantView ? 'You have no orders yet. Book one from a lead, or for a walk-in customer.' : 'No orders yet. Book the first one from a lead or for a walk-in customer.', 'receipt', canNew ? ui.btn('New order', { icon: 'plus', act: 'new' }) : '')}</div>`;   // the header's New order stays the one primary
        return;
      }
      const rows = all.filter((o) => (seg === 'active' ? isOpen(o) : o.stage === seg) && (!stageFilter || stageOf(o) === stageFilter) && matchesFilters(o));
      const filtered = listState.q || listState.channel || listState.consultant;
      const sum = (fn) => rows.reduce((s, o) => s + (Number(fn(o)) || 0), 0);
      let top = '';
      if (seg === 'active') {
        const value = sum(B.orderNet), paid = sum(B.orderPaid), pend = sum(B.orderPending), toCollect = sum(B.orderToCollect);
        top = `<div class="grid grid-4 so-kpis">
          ${ui.kpi({ label: consultantView ? 'My open orders' : 'Open orders', value: rows.length, sub: F.short(value) + ' in orders', icon: 'receipt' })}
          ${ui.kpi({ label: 'Paid and confirmed', value: F.short(paid), sub: value ? F.pct(paid / value) + ' of the order value' : 'Nothing yet', icon: 'check-circle', tone: 'green' })}
          ${ui.kpi({ label: 'Waiting for Accounts', value: F.short(pend), sub: rows.filter((o) => B.orderPending(o) > 0.5).length + ' orders', icon: 'clock', tone: 'amber' })}
          ${ui.kpi({ label: 'Still to collect', value: F.short(toCollect), sub: rows.filter((o) => B.orderToCollect(o) > 0.5).length + ' orders still paying', icon: 'wallet', tone: 'blue' })}
        </div>`;
      } else if (seg === 'delivered') {
        const month = NA.today().slice(0, 7);
        const credit = rows.filter((o) => B.orderBalance(o) > 0.5);
        top = `<p class="so-summary-line">${rows.length} delivered · ${F.short(sum(B.orderNet))} · ${rows.filter((o) => String(o.deliveredAt || '').slice(0, 7) === month).length} this month${credit.length ? ` · ${credit.length} with ${F.short(credit.reduce((s, o) => s + B.orderBalance(o), 0))} still to collect` : ''}</p>`;
      } else {
        const due = rows.filter((o) => o.refund && o.refund.status === 'due');
        top = `<p class="so-summary-line">${rows.length} cancelled${due.length ? ` · ${due.length} refund${due.length === 1 ? '' : 's'} to pay (${F.short(due.reduce((s, o) => s + (Number(o.refund.amount) || 0), 0))})` : ''}</p>`;
      }
      const note = filtered ? `<div class="row small muted so-mb">${NA.icon('filter', 14)} ${rows.length} matching order${rows.length === 1 ? '' : 's'} <button class="btn btn-link small" data-act="clear">Clear filters</button></div>` : '';
      box.innerHTML = top + note + (useBoard ? renderBoard(rows) : renderTable(rows));
    };
    draw();

    const qEl = root.querySelector('[data-q]');
    qEl.addEventListener('input', () => { listState.q = qEl.value; draw(); });
    root.querySelector('[data-channel]').addEventListener('change', (e) => { listState.channel = e.target.value; draw(); });
    const cEl = root.querySelector('[data-consultant]');
    if (cEl) cEl.addEventListener('change', (e) => { listState.consultant = e.target.value; draw(); });
    ui.delegate(root, 'click', '[data-act]', (el) => {
      const act = el.dataset.act;
      if (act === 'new') NA.actions.newOrder();
      else if (act === 'pay') NA.actions.recordPayment();
      else if (act === 'view') { setView(el.dataset.view); NA.render(); }
      else if (act === 'seg') NA.go('#/sales' + (el.dataset.seg === 'active' ? '' : '?stage=' + el.dataset.seg));
      else if (act === 'clear-stage') NA.go('#/sales');
      else if (act === 'clear') { listState.q = ''; listState.channel = ''; listState.consultant = ''; NA.render(); }
    });
    ui.delegate(root, 'click', 'tr[data-href]', (el, e) => { if (e.target.closest('a,button')) return; NA.go(el.dataset.href); });
  }

  /* ------------------------------------------------------------------------
     DETAIL: order record
     ------------------------------------------------------------------------ */
  /** Optional extra: "car before full payment" — offered on corporate orders, and on bank orders once the sanction letter is in. */
  function creditOffer(o) {
    const can = NA.can('orders.edit') || NA.can('payments.verify');
    if (!can || !isOpen(o) || o.vehicleId || paidOrCredit(o) || corpDocMissing(o) || B.cancelPending(o)) return [];
    if (NA.approvals.isPending('orders', o.id, 'credit')) return [];
    if (o.channel === 'Corporate') return [{ label: 'Ask to release the car before full payment', act: 'ask-credit' }];
    if (o.channel === 'Bank' && o.bank && o.bank.steps && o.bank.steps.sanction) return [{ label: 'Release the car against the sanction letter', act: 'ask-credit' }];
    return [];
  }

  /** The one next step: what to do, who does it, and the button for it (only when this person may do it). */
  function nextStep(o) {
    const pay = NA.can('payments.record') && B.orderToCollect(o) > 0.5 && !B.cancelPending(o) ? { label: 'Record payment', act: 'pay', icon: 'wallet' } : null;
    const edit = NA.can('orders.edit');
    const consultant = whoDoes('consultant', o);
    if (o.stage === 'cancelled') {
      const r = o.refund;
      if (r && r.status === 'due') return { icon: 'undo', title: `Refund ${F.money(r.amount)} to the customer`, text: `The cancellation was approved${r.approvedBy ? ' by ' + r.approvedBy : ''}. Accounts pays the refund and records it here — at most the confirmed money held for the order.`, who: whoDoes('accounts', o), btn: NA.can('finance.manage') ? { label: 'Pay refund', act: 'refund', icon: 'undo' } : null };
      if (r && r.status === 'paid' && !(Number(r.amount) > 0.5)) return { icon: 'check', title: 'Nothing to refund', text: `None of the money for this order was confirmed, so the approved ${F.money(r.approvedAmount)} was not paid. Closed${r.paidBy ? ' by ' + r.paidBy : ''} on ${F.date(r.paidAt)}.` };
      if (r && r.status === 'paid') return { icon: 'check', title: `Refund of ${F.money(r.amount)} paid`, text: `Paid on ${F.date(r.paidAt)}${r.paidBy ? ' by ' + r.paidBy : ''}${r.approvedAmount != null && Number(r.approvedAmount) > Number(r.amount) + 0.5 ? ` (${F.money(r.approvedAmount)} was approved; the rest was never confirmed)` : ''}. Nothing more to do.` };
      return { icon: 'x', title: 'Order cancelled', text: (o.cancel && o.cancel.reason ? 'Reason: ' + o.cancel.reason + '. ' : '') + 'Nothing more to do.' };
    }
    if (o.stage === 'delivered') {
      const bal = B.orderBalance(o);
      if (bal > 0.5) return { icon: 'wallet', title: `Collect ${F.money(bal)} — the car was released before full payment`, text: `Delivered on ${F.date(o.deliveredAt)}.${B.orderPending(o) > 0.5 ? ' ' + F.money(B.orderPending(o)) + ' is waiting for Accounts to confirm.' : ''}`, who: consultant, btn: pay };
      const w = warrantyOf(o);
      return { icon: 'shield', title: 'Delivered — the warranty is active', text: w ? `Warranty ${w.code} runs until ${F.date(w.expiry)}. The first free service is due in about 3 months.` : 'The car was handed over.', btn: canBookService() ? { label: 'Book first service', act: 'book-service', icon: 'calendar' } : null };
    }
    if (B.cancelPending(o)) {
      const decide = decideBtn(NA.approvals.find('orders', o.id, 'cancel'));
      return { icon: 'clock', title: decide ? 'Decide on the cancellation' : 'Cancellation waiting for the Managing Director', text: 'Payments, the VIN, registration and the handover are paused until it is decided.', who: decide ? 'You' : whoDoes('md', o), btn: decide };
    }
    if (corpDocMissing(o)) return { icon: 'file-text', title: 'Add the company’s purchase order', text: 'A corporate order is confirmed by its purchase order, award letter or letter of intent.', who: consultant, btn: edit ? { label: 'Add document', act: 'corp-edit', icon: 'file-text' } : null };
    const ds = discountState(o);
    if (ds === 'none') return { icon: 'percent', title: `Ask for approval of the ${F.money(o.discount)} discount`, text: `It is more than the ${F.money(NA.policy().discountFree)} a consultant may give. Payments can go on; the VIN waits for the approval.`, who: consultant, btn: edit ? { label: 'Ask for approval', act: 'ask-discount', icon: 'stamp' } : null };
    if (ds === 'rejected') return { icon: 'percent', title: 'The discount was not approved', text: 'Lower the discount, or ask again with a clearer reason.', who: consultant, btn: edit ? { label: 'Change discount', act: 'edit', icon: 'edit' } : null, secondary: edit ? [{ label: 'Ask again', act: 'ask-discount' }] : [] };
    if (!o.vehicleId) {
      if (canGiveVin(o)) {
        const stock = stockFor(o);
        if (stock.length) return { icon: 'key', title: 'Give the car (VIN) to this order', text: `${B.isFullyPaid(o) ? 'Paid in full and confirmed' : 'Car before full payment approved'}. ${stock.length} ${NA.modelName(o.modelId)} in stock${stock.some((x) => x.color === o.color) ? '' : ', none in ' + o.color}.`, who: whoDoes('vin', o), btn: NA.can('vin.assign') ? { label: 'Give VIN', act: 'goto', target: 'so-vin', icon: 'key' } : null };
        const em = emergencyPOs(o)[0];
        if (em) {
          const name = em.code ? 'emergency purchase ' + em.code : 'an emergency purchase';
          return emApproval(em) === 'rejected'
            ? { icon: 'truck', title: upperFirst(name) + ' was not approved', text: 'The Managing Director declined it. Purchasing asks again or cancels it.', who: whoDoes('procurement', o) }
            : { icon: 'truck', title: 'A car is coming — ' + name, text: `Status: ${emStatus(em)}. The VIN can be given when the car arrives and passes its inspection.`, who: whoDoes('procurement', o) };
        }
        const incoming = incomingFor(o);
        if (incoming.length) return { icon: 'truck', title: 'A car is on the way', text: `${incoming.length} ${NA.modelName(o.modelId)} arriving or being inspected. It can be given once it passes the inspection.`, who: whoDoes('procurement', o), secondary: canAskEmergency(o) && !o.emergencyRequest ? [{ label: 'Ask Purchasing for an emergency car', act: 'ask-emergency' }] : [] };
        const gone = emergencyGone(o);
        const goneText = gone ? ` ${gone.code ? 'Emergency purchase ' + gone.code : 'The emergency purchase'} was cancelled — that car was not available.` : '';
        if (o.emergencyRequest) return { icon: 'bolt', title: 'Purchasing has been asked for a car', text: `Asked ${F.ago(o.emergencyRequest.at)}${o.emergencyRequest.by ? ' by ' + o.emergencyRequest.by : ''}.${gone ? goneText + ' The request stays with Purchasing.' : ' Purchasing checks with CG Runner; the Managing Director approves the purchase.'}`, who: whoDoes('procurement', o), btn: NA.can('po.manage') && hasAction('newEmergencyPO') ? { label: 'Start emergency purchase', act: 'emergency', icon: 'bolt' } : null };
        return { icon: 'bolt', title: 'No car in stock — ask Purchasing', text: `No ${NA.modelName(o.modelId)} is free in the warehouse or showroom, and none is on the way.${goneText}`, who: consultant, btn: canAskEmergency(o) ? { label: 'Ask Purchasing for a car', act: 'ask-emergency', icon: 'bolt' } : null };
      }
      if (paidOrCredit(o)) {
        // Paid, but the discount approval is still open (the approver gets a way to it, not "waiting for" themselves).
        const a = NA.approvals.find('orders', o.id, 'discount');
        const decide = decideBtn(a);
        return { icon: 'clock', title: decide ? 'Decide on the discount' : 'Waiting for the discount approval', text: 'The order is paid. The VIN can be given once the discount is approved.', who: decide ? 'You' : a ? NA.approvals.approverText(a) : 'the Sales Manager', btn: decide };
      }
      const toCollect = B.orderToCollect(o), pending = B.orderPending(o);
      const em0 = emergencyPOs(o)[0];
      const emNote = em0 ? ` Purchasing is buying the car (${em0.code || 'emergency purchase'}, ${emStatus(em0)}).` : '';
      if (toCollect <= 0.5 && pending > 0.5) return { icon: 'clock', title: `Accounts to confirm ${F.money(pending)}`, text: 'The customer has paid everything. The VIN can be given once Accounts confirms the money — cash handed over, cheque cleared, transfer seen in the bank.', who: whoDoes('accounts', o), btn: NA.can('payments.verify') ? { label: 'Confirm payments', act: 'goto', target: 'so-payments', icon: 'check' } : null };
      if (o.channel === 'Bank' && o.bank) {
        const share = shareLeft(o);
        const nextBank = NA.FLOW.bankSteps.find((s) => !(o.bank.steps || {})[s.key]);
        // "Record payment" fills in the share (openPayment), never the bank's part.
        if (share > 0.5) return { icon: 'wallet', title: `Collect the customer’s share — ${F.money(share)}`, text: `The bank pays ${F.money(o.bank.loanAmount)}${nextBank ? '. Bank loan, next: ' + nextBank.label.toLowerCase() : ''}.${emNote}`, who: consultant, btn: pay, secondary: creditOffer(o) };
        if (nextBank) {
          const disb = nextBank.key === 'disbursement';
          const may = disb ? NA.can('payments.record') : edit;
          return { icon: 'bank', title: disb ? `Record the bank’s payment — ${F.money(Math.min(Number(o.bank.loanAmount) || 0, toCollect))}` : `Bank loan: ${nextBank.label.toLowerCase()}`, text: `${o.bank.bankName || 'The bank'} · the customer’s share is in.${emNote}`, who: consultant, btn: may ? { label: disb ? 'Record disbursement' : `Mark “${nextBank.label}” done`, act: 'bank-step', step: nextBank.key, icon: 'check' } : null, secondary: creditOffer(o) };
        }
      }
      if (!B.orderReceived(o) && o.channel !== 'Corporate') return { icon: 'receipt', title: 'Record the booking money', text: 'The booking is confirmed when the money receipt is issued.' + emNote, who: consultant, btn: pay };
      return { icon: 'wallet', title: `Collect ${F.money(toCollect)}`, text: `${F.pct(B.orderPaidPct(o))} paid and confirmed. The VIN is given after 100% is paid and confirmed by Accounts.${ds === 'pending' ? ' The discount is waiting for approval.' : ''}${emNote}`, who: consultant, btn: pay, secondary: creditOffer(o) };
    }
    if (!(o.brta && o.brta.appliedDate)) return { icon: 'id-card', title: 'File the registration with BRTA', text: `In the customer’s name, with insurance${o.channel === 'Bank' ? ' and the bank as co-owner (hypothecation)' : ''}.`, who: consultant, btn: edit ? { label: 'Filed with BRTA', act: 'brta-file', icon: 'id-card' } : null };
    if (!regDone(o)) return { icon: 'id-card', title: 'Waiting for the registration number', text: `Filed with BRTA on ${F.date(o.brta.appliedDate)}. Enter the number when BRTA issues it.`, who: consultant, btn: edit ? { label: 'Number received', act: 'brta-number', icon: 'check' } : null };
    const blockers = deliveryBlockersFor(o).concat(checklistMissing(o));
    if (blockers.length) return { icon: 'clipboard-check', title: 'Prepare the handover', text: 'Still needed: ' + blockers.join(' · ') + '.', who: consultant, btn: { label: 'Open the checklist', act: 'goto', target: 'so-delivery', icon: 'clipboard-check' } };
    return { icon: 'car', title: 'Hand over the car', text: 'Everything is ready. Print the gate pass, then confirm the handover — the warranty starts automatically.', who: consultant, btn: NA.can('delivery.complete') ? { label: 'Hand over car', act: 'deliver', icon: 'check' } : null, secondary: NA.can('delivery.complete') || NA.can('payments.verify') ? [{ label: 'Print gate pass', act: 'gate-pass' }] : [] };
  }

  function nextStepHtml(o) {
    const n = nextStep(o);
    const b = n.btn;
    let action = '';
    if (b) action = `<button class="btn btn-${b.kind || 'primary'} btn-lg" data-act="${esc(b.act)}" ${b.target ? `data-target="${esc(b.target)}"` : ''} ${b.step ? `data-step="${esc(b.step)}"` : ''}>${NA.icon(b.icon || 'arrow-right', 17)}${esc(b.label)}</button>`;
    else if (n.who && n.who !== 'You') action = `<span class="lock-note">${NA.icon('clock', 15)}Waiting for ${esc(n.who)}</span>`;
    const more = (n.secondary || []).map((s) => `<button class="btn btn-plain btn-sm" data-act="${esc(s.act)}">${esc(s.label)}</button>`).join('');
    return `<div class="next-step"><span class="ns-icon">${NA.icon(n.icon, 20)}</span>
      <div class="ns-text"><small>Next step${n.who ? ' · ' + esc(upperFirst(n.who)) : ''}</small><b>${esc(n.title)}</b><small>${esc(n.text)}</small>${more ? `<div class="so-ns-more">${more}</div>` : ''}</div>${action}</div>`;
  }

  /** A step on the order page. status: 'now' (current step), 'done', or '' (other). */
  function panel({ id, icon, title, status, body, actions }) {
    const badge = status === 'done' ? ui.badge('Done', 'green', 'check') : status === 'now' ? ui.badge('Now', 'blue') : '';
    return `<section class="card so-panel ${status === 'now' ? 'so-now' : ''}" id="${id}">
      <div class="card-head"><h3>${NA.icon(icon, 18)} ${esc(title)}</h3><div class="row wrap">${actions || ''}${badge}</div></div>
      <div class="card-body">${body}</div>
    </section>`;
  }
  /** A step that is not open yet (or finished with nothing to show): one calm line. */
  function compactPanel(id, icon, title, text, ok) {
    return `<section class="card so-compact" id="${id}"><span class="so-compact-ic ${ok ? 'ok' : ''}">${NA.icon(ok ? 'check' : icon, 16)}</span><div class="grow"><b>${esc(title)}</b><small>${esc(text)}</small></div></section>`;
  }

  function paymentStatusBadge(p) {
    if (p.kind === 'refund' || (Number(p.amount) || 0) < 0) return ui.badge('Refund paid', 'gray');
    if (B.paymentBounced(p)) return ui.badge('Not received', 'red');
    if (B.paymentPending(p)) return ui.badge('Waiting for Accounts', 'amber');
    return ui.badge('Confirmed', 'green');
  }

  function paymentsPanel(o) {
    const net = B.orderNet(o), paid = B.orderPaid(o), pend = B.orderPending(o), bal = B.orderBalance(o);
    const list = orderPayments(o);
    const verifier = NA.can('payments.verify');
    const canEdit = NA.can('orders.edit') && isOpen(o) && !o.vehicleId;
    const lp = listPriceOf(o);
    const breakdown = `${F.money(lp)} list price${(Number(o.price) || 0) !== lp ? ' · price ' + F.money(o.price) : ''}${o.discount ? ' − ' + F.money(o.discount) + ' discount' : ''}`;
    const ds = Number(o.discount) > NA.policy().discountFree ? discountState(o) : '';
    // "Approved" only when someone approved it (orders from before the approval rules need nothing).
    const da = ds === 'ok' ? [NA.approvals.find('orders', o.id, 'discount'), o.leadId && NA.approvals.find('leads', o.leadId, 'discount')]
      .find((a) => a && a.status === 'approved' && (Number(a.value) || 0) + 0.5 >= (Number(o.discount) || 0)) : null;
    const discountLine = da ? `<p class="lock-note mt-12">${NA.icon('check', 14)}Discount approved by ${esc(da.decidedBy || '—')}${da.refC === 'leads' ? ' on the quotation' : ''}</p>`
      : ds === 'none' ? `<p class="lock-note mt-12">${NA.icon('lock', 14)}The ${F.money(o.discount)} discount needs approval before the VIN.</p>`
      : ds === 'rejected' ? `<p class="lock-note mt-12">${NA.icon('x', 14)}The discount was not approved — change it or ask again.</p>` : '';
    // Accounts see every payment, so they are told here when a cheque or transfer number is already on another receipt.
    const sameRef = (p) => (B.sameRefPayment ? B.sameRefPayment(p) : null);
    const rows = list.map((p) => {
      // Waiting money is settled even on a cancelled order (the refund can only pay out confirmed money).
      const toVerify = verifier && B.paymentPending(p);
      const dup = toVerify ? sameRef(p) : null;
      return `<div class="gl-row">
        <span class="gl-main"><b><span class="num">${F.money(p.amount)}</span> · ${esc(p.method)}</b><small>${esc(p.receiptNo || '')} · ${esc(F.date(p.date))}${p.ref ? ' · ' + esc(p.ref) : ''}${p.receivedBy ? ' · ' + esc(p.receivedBy) : ''}${p.note ? ' · ' + esc(p.note) : ''}${B.paymentBounced(p) && p.verifyNote ? ' · “' + esc(p.verifyNote) + '”' : ''}${dup ? ` · <span class="tone-amber">same reference as ${esc(dup.receiptNo || 'another receipt')}</span>` : ''}</small></span>
        ${paymentStatusBadge(p)}
        <span class="so-row-acts">${toVerify ? `<button class="btn btn-sm btn-ghost" data-act="bounce" data-id="${esc(p.id)}">Not received</button><button class="btn btn-sm btn-plain" data-act="clear" data-id="${esc(p.id)}">Confirm</button>` : ''}<button class="icon-btn" data-act="print-receipt" data-id="${esc(p.id)}" title="Print receipt" aria-label="Print receipt ${esc(p.receiptNo || '')}">${NA.icon('print', 16)}</button></span>
      </div>`;
    }).join('');
    const empty = `<div class="gl-row"><span class="gl-main"><small>${o.channel === 'Corporate' ? 'No payments yet. The company’s document confirms the order; the VIN still needs full payment (or the Managing Director’s approval).' : 'No booking money recorded yet — the booking is confirmed when the money receipt is issued.'}</small></span></div>`;
    const body = `
      <div class="so-stats">
        <div class="so-stat"><small>Price after discount (incl. VAT)</small><b class="num">${F.money(net)}</b><span>${esc(breakdown)}</span></div>
        <div class="so-stat"><small>Paid and confirmed</small><b class="num">${F.money(paid)}</b>${pend > 0.5 ? `<span>${F.money(pend)} waiting for Accounts</span>` : ''}</div>
        <div class="so-stat"><small>Still to pay</small><b class="num">${bal > 0.5 ? F.money(bal) : 'Nothing'}</b>${bal > 0.5 && pend > 0.5 ? `<span>${F.money(B.orderToCollect(o))} still to hand over</span>` : ''}</div>
      </div>
      <div class="mt-16">${ui.progress(B.orderPaidPct(o), payTone(o))}</div>
      ${discountLine}
      ${o.bank && o.bank.rejected ? `<p class="lock-note mt-12">${NA.icon('bank', 14)}The ${esc(o.bank.bankName || 'bank')} loan was rejected on ${esc(F.date(o.bank.rejectedAt))} — the customer pays in full.</p>` : ''}
      <div class="glist so-pay-rows mt-16">${rows || empty}</div>`;
    const actions = canEdit && !B.cancelPending(o) ? `<button class="btn btn-sm btn-plain" data-act="edit">Change price or discount</button>` : '';
    const status = B.isFullyPaid(o) ? 'done' : isOpen(o) && !o.vehicleId ? 'now' : '';
    return panel({ id: 'so-payments', icon: 'wallet', title: 'Payments', status, body, actions });
  }

  /** "Car before full payment" status line, shared by the corporate and bank panels. */
  function creditLine(o) {
    // Approved with the old switch and never through the approval system: say so (B.creditApproved counts both).
    if (legacyCredit(o) && !NA.approvals.isApproved('orders', o.id, 'credit')) {
      const c = o.corporate;
      return `<p class="lock-note mt-16">${NA.icon('check', 14)}Car before full payment approved${c.creditApprovedBy ? ' by ' + esc(c.creditApprovedBy) : ''} on ${esc(F.date(c.creditApprovedAt))} — before the approval system, so it still counts.</p>`;
    }
    const a = NA.approvals.find('orders', o.id, 'credit');
    // An approval covers the balance it was asked for: a raised price or a bounced payment since then needs a new one.
    const short = !!a && a.status === 'approved' && !B.creditApproved(o) && !B.isFullyPaid(o);
    if (a && a.status === 'approved' && !short) return `<p class="lock-note mt-16">${NA.icon('check', 14)}Car before full payment approved by ${esc(a.decidedBy || '—')} ${esc(F.ago(a.decidedAt))}.</p>`;
    if (a && a.status === 'pending') return `<p class="lock-note mt-16">${NA.icon('clock', 14)}Releasing the car before full payment is waiting for ${esc(NA.approvals.approverText(a))}.</p>`;
    const offer = creditOffer(o)[0];
    if (short) {
      return `<div class="row-between wrap mt-16"><span class="small muted">Car before full payment was approved with ${F.money(a.value)} still to pay. ${F.money(B.orderBalance(o))} is owed now, so it has to be asked again.</span>${offer ? `<button class="btn btn-sm btn-plain" data-act="ask-credit">Ask again</button>` : ''}</div>`;
    }
    if (!offer) return '';
    return `<div class="row-between wrap mt-16"><span class="small muted">${a && a.status === 'rejected' ? 'Releasing the car before full payment was declined.' : 'The VIN is normally given only after 100% confirmed payment.'}</span><button class="btn btn-sm btn-plain" data-act="ask-credit">${esc(a && a.status === 'rejected' ? 'Ask again' : offer.label)}</button></div>`;
  }

  function bankPanel(o) {
    const bk = o.bank || {};
    const steps = bk.steps || {};
    const idx = NA.FLOW.bankSteps.findIndex((s) => !steps[s.key]);
    const cur = idx < 0 ? NA.FLOW.bankSteps.length : idx;
    const allDone = idx < 0;
    const open = isOpen(o);
    const live = open && !B.cancelPending(o);   // paused while a cancellation waits for the Managing Director
    const edit = NA.can('orders.edit');
    const share = customerShare(o), shareIn = Math.min(share, customerReceived(o));
    const stepRow = (s, i) => {
      const d = steps[s.key];
      const isNext = i === cur;
      const may = s.key === 'disbursement' ? NA.can('payments.record') : edit;
      const sub = d ? 'Done on ' + F.date(d) + (s.key === 'sanction' && bk.sanctionRef ? ' · letter ' + bk.sanctionRef : '')
        : isNext ? (s.key === 'disbursement' ? `The bank pays ${F.money(bk.loanAmount)} to Noor Autos` : 'Next') : '';
      const act = d ? (live && edit && i === cur - 1 ? `<button class="btn btn-sm btn-link" data-act="bank-undo" data-step="${esc(s.key)}">Undo</button>` : '')
        : isNext && live && may ? `<button class="btn btn-sm btn-plain" data-act="bank-step" data-step="${esc(s.key)}">${s.key === 'disbursement' ? 'Record payment' : 'Mark done'}</button>` : '';
      return `<li class="${d ? 'done' : isNext ? 'next' : ''}"><span class="ic">${d ? NA.icon('check', 13) : i + 1}</span><div class="grow"><div class="t">${esc(s.label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>${act}</li>`;
    };
    const body = `<div class="so-tracks">
        <div class="so-track"><h4>Customer’s share</h4><b class="num">${F.money(shareIn)}</b> <span class="muted">of ${F.money(share)}</span>${ui.progress(share ? shareIn / share : 1, shareIn >= share - 0.5 ? 'green' : 'blue')}<small>${shareIn >= share - 0.5 ? 'Received' : F.money(share - shareIn) + ' still to collect'}</small></div>
        <div class="so-track"><h4>Bank loan · ${esc(bk.bankName || 'Bank')}</h4><b class="num">${F.money(bk.loanAmount)}</b>${bk.branch ? ` <span class="muted">${esc(bk.branch)}</span>` : ''}
          <ul class="list so-bank-list">${NA.FLOW.bankSteps.map(stepRow).join('')}</ul></div>
      </div>
      ${open && !o.vehicleId ? creditLine(o) : ''}`;
    const sanctioned = !!steps.sanction;
    const actions = live && edit ? (sanctioned ? '' : `<button class="btn btn-sm btn-plain" data-act="bank-edit">Edit loan</button>`)
      + (!steps.disbursement ? `<button class="btn btn-sm btn-plain" data-act="bank-rejected">Loan rejected</button>` : '') : '';
    return panel({ id: 'so-bank', icon: 'bank', title: 'Bank loan', status: allDone ? 'done' : open && !o.vehicleId ? 'now' : '', body, actions });
  }

  function corporatePanel(o) {
    const c = o.corporate || {};
    const has = !!c.docRef;
    const open = isOpen(o);
    const edit = NA.can('orders.edit');
    if (!has) return compactPanel('so-corp', 'building', 'Company order document', 'Not added yet — a corporate order is confirmed by its purchase order, award letter or letter of intent.');
    const used = NA.where('orders', (x) => x.stage !== 'cancelled' && x.corporate && String(x.corporate.docRef || '').trim().toLowerCase() === String(c.docRef).trim().toLowerCase()).length;
    const row = (label, value) => `<div class="gl-row"><span class="gl-main"><span class="gl-label">${esc(label)}</span></span><span class="gl-value">${value}</span></div>`;
    const body = `<div class="glist">
        ${row('Document', esc(c.docType || '—'))}
        ${row('Number', `<span class="mono">${esc(c.docRef)}</span>`)}
        ${row('Date', esc(F.date(c.date)))}
        ${row('Cars on this document', esc(c.units || 1) + (used > (Number(c.units) || 1) ? ` · <span class="tone-amber">on ${used} orders</span>` : ''))}
      </div>
      ${open && !o.vehicleId ? creditLine(o) : ''}`;
    return panel({ id: 'so-corp', icon: 'building', title: 'Company order', status: 'done', body,
      actions: open && edit && !B.cancelPending(o) ? `<button class="btn btn-sm btn-plain" data-act="corp-edit">Edit</button>` : '' });
  }

  function vinPanel(o) {
    const v = NA.vehicle(o.vehicleId);
    if (v) {
      const prob = carProblem(v);
      const body = `<div class="glist">
          <div class="gl-row">${swatch(v.color, true)}<span class="gl-main"><b class="mono">${esc(v.vin)}</b><small>${esc(v.color || '')} · ${esc(NA.modelName(v.modelId))}${v.year ? ' · ' + esc(v.year) : ''}</small></span>${ui.vehicleStatusBadge(v.status)}</div>
          <div class="gl-row"><span class="gl-main"><span class="gl-label">Motor no.</span></span><span class="gl-value mono">${esc(v.motorNo || '—')}</span></div>
          <div class="gl-row"><span class="gl-main"><span class="gl-label">Where it is</span></span><span class="gl-value">${esc(v.location || '—')}</span></div>
          <div class="gl-row"><span class="gl-main"><span class="gl-label">Given on</span></span><span class="gl-value">${esc(F.date(o.vinAssignedAt))}${o.vinBy ? ' · ' + esc(o.vinBy) : ''}</span></div>
        </div>
        ${prob && isOpen(o) ? `<div class="callout callout-warn mt-16">${NA.icon('alert')}<div><b>The car is on hold:</b> ${esc(prob)}. The handover waits until Purchasing clears it.</div></div>` : ''}
        ${NA.canSee('inventory') ? `<div class="mt-12"><a class="btn btn-sm btn-plain" href="#/inventory/${esc(v.id)}">Open the car</a></div>` : ''}`;
      return panel({ id: 'so-vin', icon: 'key', title: 'VIN', status: 'done', body });
    }
    if (!isOpen(o)) return compactPanel('so-vin', 'key', 'VIN', 'No car was given to this order.');
    const blockers = vinBlockersFor(o);
    const free = stockFor(o);
    if (blockers.length) {
      return compactPanel('so-vin', 'lock', 'VIN', blockers.join(' · ') + ` · ${free.length} ${NA.modelName(o.modelId)} in stock now.`);
    }
    const can = NA.can('vin.assign');
    const ems = emergencyPOs(o);
    const emHtml = ems.length ? `<div class="mt-16">${ems.map((p) => {
      const inner = `<span class="ar-icon bg-amber so-ic">${NA.icon('bolt', 16)}</span><div class="grow"><b>${esc(p.code || 'Emergency purchase')}</b><div class="small muted">Emergency purchase for this order · ${esc(emStatus(p))}</div></div>`;
      return !p.copy && NA.canSee('procurement') ? `<a class="alert-row" href="#/procurement/${esc(p.id)}">${inner}${NA.icon('chevron-right', 16)}</a>` : `<div class="alert-row">${inner}</div>`;
    }).join('')}</div>` : '';
    const gone = ems.length ? null : emergencyGone(o);
    const goneHtml = gone ? `<p class="lock-note mt-16">${NA.icon('x', 14)}${esc(gone.code ? 'Emergency purchase ' + gone.code : 'The emergency purchase')} was cancelled — that car was not available.</p>` : '';
    const req = o.emergencyRequest;
    const reqHtml = req ? `<p class="lock-note mt-16">${NA.icon('bolt', 14)}Purchasing was asked for a car ${esc(F.ago(req.at))}${req.by ? ' by ' + esc(req.by) : ''}${req.note ? ' — “' + esc(req.note) + '”' : ''}.${ems.length ? ' The purchase has started.' : NA.can('orders.edit') || NA.can('vin.assign') ? ' <button class="btn btn-link small" data-act="withdraw-emergency">Withdraw</button>' : ''}</p>` : '';
    let body;
    if (!free.length) {
      const incoming = incomingFor(o);
      body = `<p class="muted">No ${esc(NA.modelName(o.modelId))} is free in the warehouse or showroom.${incoming.length ? ` ${incoming.length} on the way — the VIN can be given once a car passes its inspection.` : ''}</p>
        ${incoming.length ? `<div class="glist mt-16">${incoming.map((x) => `<div class="gl-row">${swatch(x.color)}<span class="gl-main"><b class="mono">${esc(x.vin || 'VIN to come')}</b><small>${esc(x.color || '')} · ${esc(x.location || '')}</small></span>${ui.vehicleStatusBadge(x.status)}</div>`).join('')}</div>` : ''}
        ${emHtml}${goneHtml}${reqHtml}
        ${!req && !ems.length && canAskEmergency(o) ? `<div class="mt-16"><button class="btn btn-ghost" data-act="ask-emergency">${NA.icon('bolt', 16)}Ask Purchasing for an emergency car</button></div>` : ''}`;
    } else {
      const colourMatch = free.some((x) => x.color === o.color);
      const firstOther = firstInLine(free[0], o);
      body = `<p class="muted">${can ? 'Choose the car for this customer.' : 'The Sales Manager or Accounts gives the VIN.'} ${colourMatch ? `Cars in ${esc(o.color)} are shown first.` : `None in ${esc(o.color)} — another colour needs the customer’s agreement.`}</p>
        ${firstOther ? `<div class="callout callout-warn mt-16">${NA.icon('clock')}<div><b>First come, first served.</b> ${esc(firstOther.code)} (${esc(NA.customerName(firstOther.customerId))}) was paid in full earlier, on ${esc(F.date(paidUpOn(firstOther)))}, and is also waiting for a ${esc(NA.modelName(o.modelId))}.</div></div>` : ''}
        <div class="so-vin-grid mt-16">${free.map((x) => {
          const days = x.arrivedAt ? NA.daysBetween(x.arrivedAt, NA.today()) : null;
          const tag = x.reservedFor === o.id ? ui.badge('Kept for this order', 'indigo') : x.color === o.color ? ui.badge('Ordered colour', 'green') : ui.badge('Other colour', 'amber');
          return `<div class="vin-card">
            <div class="row-between"><span class="mono">${esc(x.vin)}</span>${tag}</div>
            <div class="row small">${swatch(x.color)} <b>${esc(x.color)}</b></div>
            <div class="small muted">${esc(x.location || '—')} · ${days != null ? days + ' days in stock' : 'arrival date not known'}</div>
            <div class="small ${x.pdi ? 'muted' : 'tone-amber'}">${x.pdi ? 'Inspection passed ' + esc(F.dateShort(x.pdi.date)) : 'Not inspected yet — needed before the handover'}</div>
            ${can ? `<button class="btn btn-sm btn-ghost" data-act="give-vin" data-id="${esc(x.id)}">Give this car</button>` : ''}
          </div>`;
        }).join('')}</div>
        ${emHtml}${reqHtml}
        ${!colourMatch && !req && !ems.length && canAskEmergency(o) ? `<div class="mt-16"><button class="btn btn-plain" data-act="ask-emergency">Customer wants ${esc(o.color)}? Ask Purchasing</button></div>` : ''}`;
    }
    return panel({ id: 'so-vin', icon: 'key', title: 'VIN', status: 'now', body });
  }

  function brtaPanel(o) {
    const b = o.brta || {};
    if (!o.vehicleId) return compactPanel('so-brta', 'id-card', 'Registration (BRTA)', isOpen(o) ? 'Opens after the VIN is given — BRTA needs the chassis and motor number.' : 'Not registered.');
    const done = regDone(o);
    const bank = o.channel === 'Bank';
    const edit = NA.can('orders.edit') && isOpen(o) && !B.cancelPending(o);   // paused while a cancellation is decided
    const row = (ok, label, value) => `<li class="${ok ? 'ok' : ''}">${NA.icon(ok ? 'check-circle' : 'clock', 17)}<span class="grow">${esc(label)}</span><span class="muted">${value || '—'}</span></li>`;
    const body = `<ul class="checklist so-checklist">
        ${row(!!b.appliedDate, 'Filed with BRTA', b.appliedDate ? esc(F.date(b.appliedDate)) : '')}
        ${row(!!b.appliedDate, 'In the name of', esc(b.regName || NA.customerName(o.customerId)))}
        ${row(!!(b.insurer && b.policyNo), 'Insurance', b.insurer ? esc(b.insurer) + (b.policyNo ? ' · <span class="mono">' + esc(b.policyNo) + '</span>' : '') : '')}
        ${bank ? row(!!b.bankCoReg, 'Bank as co-owner (hypothecation)', b.bankCoReg ? esc((o.bank && o.bank.bankName) || 'Bank') : 'Needed for a bank loan') : ''}
        ${row(!!b.regNo, 'Registration number', b.regNo ? `<b class="mono">${esc(b.regNo)}</b>` : '')}
        ${row(!!b.completedDate, 'Registered on', b.completedDate ? esc(F.date(b.completedDate)) : '')}
      </ul>`;
    const actions = edit ? (b.appliedDate
      ? `<button class="btn btn-sm btn-plain" data-act="brta-file">Edit filing</button><button class="btn btn-sm btn-plain" data-act="brta-number">${done ? 'Edit number' : 'Number received'}</button>`
      : `<button class="btn btn-sm btn-plain" data-act="brta-file">Filed with BRTA</button>`) : '';
    return panel({ id: 'so-brta', icon: 'id-card', title: 'Registration (BRTA)', status: done ? 'done' : 'now', body, actions });
  }

  function deliveryPanel(o) {
    const d = o.delivery || {};
    if (o.stage === 'delivered') {
      const w = warrantyOf(o);
      const body = `<div class="so-done"><span class="ic">${NA.icon('check', 24)}</span><div class="grow"><b>Delivered on ${esc(F.date(o.deliveredAt || d.date))}</b>
          <div class="small mt-4">Handed over${d.deliveredBy ? ' by ' + esc(NA.staffName(d.deliveredBy)) : ''}. ${w ? `Warranty ${esc(w.code)} runs until ${esc(F.date(w.expiry) + kmWords(w.kmLimit))}; the battery until ${esc(F.date(w.batteryExpiry))}.` : 'The warranty started.'}</div></div></div>
        <div class="row wrap mt-16">
          ${canBookService() ? `<button class="btn btn-sm btn-ghost" data-act="book-service">${NA.icon('calendar', 15)}Book first service</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-act="print-handover">${NA.icon('print', 15)}Handover form</button>
          <button class="btn btn-sm btn-ghost" data-act="print-ack">${NA.icon('print', 15)}Acknowledgement</button>
          ${d.gatePass ? `<button class="btn btn-sm btn-ghost" data-act="gate-pass">${NA.icon('print', 15)}Gate pass</button>` : ''}
        </div>`;
      return panel({ id: 'so-delivery', icon: 'car', title: 'Handover', status: 'done', body });
    }
    if (!isOpen(o)) return compactPanel('so-delivery', 'car', 'Handover', 'Not delivered.');
    if (!o.vehicleId || !regDone(o)) return compactPanel('so-delivery', 'car', 'Handover', 'Opens when the car is registered and the BRTA number is in.');
    const v = NA.vehicle(o.vehicleId) || {};
    const b = o.brta || {};
    const acc = accDraft[o.id] || d.accessories || [];   // ticks not saved yet survive a redraw
    const can = NA.can('delivery.complete');
    const prob = carProblem(v);
    const auto = [
      { ok: paidOrCredit(o), label: B.isFullyPaid(o) ? 'Paid in full and confirmed' : B.creditApproved(o) ? 'Car before full payment approved' : `${F.money(B.orderBalance(o))} still to be paid and confirmed` },
      { ok: pdiPassed(v), label: pdiPassed(v) ? `Inspection (PDI) passed on ${F.date(v.pdi.date)}` : prob ? 'Car on hold: ' + prob : 'Inspection (PDI) not done yet — the workshop records it on the car', link: NA.canSee('inventory') && v.id && !pdiPassed(v) ? '#/inventory/' + v.id : '' },
      { ok: !!(b.insurer && b.policyNo), label: b.insurer && b.policyNo ? `Insurance: ${b.insurer} · ${b.policyNo}` : 'Insurance not recorded (Edit filing)' },
      { ok: !!b.regNo, label: 'Registration ' + (b.regNo || 'number missing') },
    ];
    if (Number(o.discount) > NA.policy().discountFree && !discountOk(o)) auto.push({ ok: false, label: DISCOUNT_BLOCK[discountState(o)] });
    if (B.cancelPending(o)) auto.push({ ok: false, label: 'A cancellation has been requested' });
    const autoHtml = auto.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${NA.icon(x.ok ? 'check-circle' : 'alert', 17)}<span class="grow">${esc(x.label)}</span>${x.link ? `<a class="btn btn-sm btn-plain" href="${esc(x.link)}">Open the car</a>` : ''}</li>`).join('');
    const tick = (key, label, print) => `<li class="${d[key] ? 'ok' : ''}"><label><input type="checkbox" class="box" data-act="dlv-toggle" data-key="${key}" ${d[key] ? 'checked' : ''} ${can ? '' : 'disabled'}/><span>${esc(label)}</span></label><button class="btn btn-sm btn-ghost" data-act="${print}">Print</button></li>`;
    const blockers = deliveryBlockersFor(o).concat(checklistMissing(o));
    const ready = !blockers.length;
    const body = `
      <ul class="checklist so-checklist">${autoHtml}
        ${tick('handoverForm', 'Handover form filled in with the customer', 'print-handover')}
        ${tick('signedAck', 'Signed acknowledgement received', 'print-ack')}
      </ul>
      <div class="so-acc-head"><b>Accessories and papers handed over</b><span class="small muted" data-acc-count>${accCountText(o, acc)}</span>${can ? '<button class="btn btn-sm btn-plain" data-act="acc-all">Tick all</button>' : ''}</div>
      <div class="so-acc" data-acc-list>${ACCESSORIES.map((a, i) => `<label><input type="checkbox" class="box" data-acc="${i}" ${acc.includes(a) ? 'checked' : ''} ${can ? '' : 'disabled'}/> ${esc(a)}</label>`).join('')}</div>
      ${can ? '<div class="mt-12"><button class="btn btn-sm btn-ghost" data-act="acc-save">Save the list</button></div>' : ''}
      <div class="so-foot">
        <span class="small ${ready ? 'tone-green' : 'muted'}">${ready ? 'Everything is ready for the handover.' : 'Still needed: ' + esc(blockers.join(' · ')) + '.'}</span>
        <div class="row wrap">${can || NA.can('payments.verify') ? `<button class="btn btn-ghost" data-act="gate-pass" ${ready ? '' : 'disabled'}>${NA.icon('print', 16)}Print gate pass</button>` : ''}
          ${can ? `<button class="btn btn-ghost" data-act="deliver" ${ready ? '' : 'disabled'}>${NA.icon('check', 16)}Hand over car</button>` : '<span class="lock-note">The sales team hands over the car</span>'}</div>
      </div>`;
    return panel({ id: 'so-delivery', icon: 'car', title: 'Handover', status: 'now', body });
  }

  function sideLists(o) {
    const c = NA.customer(o.customerId) || {};
    const v = NA.vehicle(o.vehicleId);
    const lead = getLead(o);
    const pays = orderPayments(o);
    const inv = NA.find('invoices', (i) => i.kind === 'vehicle' && i.refId === o.id);
    const b = o.brta || {};
    const d = o.delivery || {};
    const row = (label, value) => `<div class="gl-row"><span class="gl-main"><span class="gl-label">${esc(label)}</span></span><span class="gl-value">${value}</span></div>`;
    const wa = c.mobile ? waNumber(c.mobile) : '';
    const customer = `<div class="glist-title">Customer</div><div class="glist">
        <div class="gl-row">${ui.avatar(c.name, 36)}<span class="gl-main"><b>${esc(c.name || '—')}</b><small>${esc(c.type || 'Individual')}${c.company && c.company !== c.name ? ' · ' + esc(c.company) : ''}</small></span>${c.id && NA.canSee('customers') ? `<a class="btn btn-sm btn-plain" href="#/customers/${esc(c.id)}">Open</a>` : ''}</div>
        ${row('Mobile', c.mobile ? `<a class="btn-link" href="tel:${esc(c.mobile)}">${esc(c.mobile)}</a> · <a class="btn-link" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}">WhatsApp</a>` : '—')}
        ${c.email ? row('Email', esc(c.email)) : ''}
        ${c.address ? row('Address', esc(c.address)) : ''}
        ${c.contactPerson ? row('Contact person', esc(c.contactPerson)) : ''}
        ${lead ? row('From lead', NA.canSee('leads') ? `<a class="btn-link" href="#/leads/${esc(lead.id)}">${esc(lead.code || 'Lead')}</a>` : esc(lead.code || 'Lead')) : ''}
      </div>`;
    const car = `<div class="glist-title">Car</div><div class="glist">
        <div class="gl-row">${swatch(o.color, true)}<span class="gl-main"><b>${esc(NA.modelName(o.modelId))}</b><small>${esc(o.color || '—')}</small></span>${v && NA.canSee('inventory') ? `<a class="btn btn-sm btn-plain" href="#/inventory/${esc(v.id)}">Open</a>` : ''}</div>
        ${v ? row('VIN', `<span class="mono">${esc(v.vin)}</span>`) + row('Motor no.', `<span class="mono">${esc(v.motorNo || '—')}</span>`) + row('Status', ui.vehicleStatusBadge(v.status))
          : row('VIN', '<span class="muted">Given after 100% payment</span>') + (o.booking && o.booking.demoVin ? row('Demo VIN', `<span class="mono">${esc(o.booking.demoVin)}</span> <span class="muted small">for reference</span>`) : '')}
        ${b.regNo ? row('Registration', `<span class="mono">${esc(b.regNo)}</span>`) : ''}
      </div>`;
    const overdue = isOpen(o) && o.expectedDelivery && o.expectedDelivery < NA.today();
    const order = `<div class="glist-title">Order</div><div class="glist">
        ${row('Booked', esc(F.date(bookingDate(o))))}
        ${isOpen(o) ? row('Days since booking', esc(daysOpen(o))) : ''}
        ${row('Expected delivery', esc(F.date(o.expectedDelivery)) + (overdue ? ' ' + ui.badge('Late', 'amber') : ''))}
        ${row('Consultant', esc(NA.staffName(o.consultantId)) + (NA.can('leads.assign') && isOpen(o) ? ' · <button class="btn-link small" data-act="reassign">Change</button>' : ''))}
        ${row('How the customer pays', esc(channelLabel(o.channel)))}
        ${o.deliveredAt ? row('Delivered', esc(F.date(o.deliveredAt))) : ''}
      </div>`;
    const docs = [];
    const doc = (title, sub, act) => `<div class="gl-row"><span class="gl-main"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${act || ''}</div>`;
    const printBtn = (act, id, label) => `<button class="icon-btn" data-act="${act}" ${id ? `data-id="${esc(id)}"` : ''} title="Print" aria-label="Print ${esc(label)}">${NA.icon('print', 16)}</button>`;
    if (o.quoteNo) docs.push(doc('Quotation ' + o.quoteNo, 'The price and discount were booked from this quote'));
    pays.forEach((p) => docs.push(doc(`${(Number(p.amount) || 0) < 0 ? 'Refund voucher' : 'Money receipt'} ${p.receiptNo || ''}`, `${esc(F.date(p.date))} · ${F.money(p.amount)}`, printBtn('print-receipt', p.id, p.receiptNo || 'receipt'))));
    if (o.corporate && o.corporate.docRef) docs.push(doc(o.corporate.docType || 'Purchase order', `<span class="mono">${esc(o.corporate.docRef)}</span> · ${esc(F.date(o.corporate.date))}`));
    if (o.bank && o.bank.steps && o.bank.steps.sanction) docs.push(doc('Sanction letter', `${esc(o.bank.bankName || '')}${o.bank.sanctionRef ? ' · ' + esc(o.bank.sanctionRef) : ''} · ${esc(F.date(o.bank.steps.sanction))}`));
    if (b.policyNo) docs.push(doc('Insurance policy', `${esc(b.insurer || '')} · <span class="mono">${esc(b.policyNo)}</span>`));
    if (o.vehicleId) {
      docs.push(doc('Handover form', d.handoverForm ? 'Filled in' : 'Not filled in yet', printBtn('print-handover', '', 'handover form')));
      docs.push(doc('Delivery acknowledgement', d.signedAck ? 'Signed' : 'Not signed yet', printBtn('print-ack', '', 'acknowledgement')));
    }
    if (d.gatePass) docs.push(doc('Gate pass ' + d.gatePass.no, `${esc(F.datetime(d.gatePass.at))} · ${esc(d.gatePass.by || '')}`, printBtn('gate-pass', '', 'gate pass')));
    if (inv) docs.push(doc('Sales invoice ' + (inv.no || ''), `${F.money(inv.total)} incl. VAT ${F.money(inv.vat)}`, NA.canSee('finance') ? `<a class="icon-btn" href="#/finance" title="Open in Accounts" aria-label="Open in Accounts">${NA.icon('chevron-right', 16)}</a>` : ''));
    const documents = `<div class="glist-title">Documents</div><div class="glist">${docs.join('') || doc('No documents yet', '')}</div>`;
    const notesList = (o.noteLog || []).slice().reverse();
    const notes = `<div class="glist-title">Notes</div><div class="card pad so-mb">
        <div class="field"><textarea rows="2" data-note placeholder="e.g. Customer wants the car on Thursday" aria-label="New note"></textarea></div>
        <div class="row mt-8 so-end"><button class="btn btn-sm btn-ghost" data-act="add-note">Save note</button></div>
        ${notesList.length ? `<ul class="timeline mt-16">${notesList.map((n) => `<li>${esc(n.text)}<small>${esc(F.datetime(n.at))} · ${esc(n.by || '')}</small></li>`).join('')}</ul>` : ''}
      </div>`;
    const hist = o.history || [];
    const history = `<div class="glist-title">History</div><div class="card pad">${hist.length ? `<ul class="timeline">${hist.slice(0, 30).map((h) => `<li>${esc(h.text)}<small>${esc(F.datetime(h.at))}${h.by ? ' · ' + esc(h.by) : ''}</small></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet.</p>'}</div>`;
    return customer + car + order + documents + notes + history;
  }

  /** Customer, car, price and money at a glance, above everything else (also on small screens). */
  function factsStrip(o) {
    const c = NA.customer(o.customerId) || {};
    const v = NA.vehicle(o.vehicleId);
    const pend = B.orderPending(o);
    const cell = (label, value, sub) => `<div class="so-fact"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    let money;
    if (o.stage === 'cancelled') {
      const r = o.refund;
      const none = r && r.status === 'paid' && !(Number(r.amount) > 0.5);   // closed: no confirmed money was held
      money = cell('Refund', r && !none ? `<span class="num">${F.money(r.amount)}</span>` : 'None', none ? 'Nothing was held' : r ? (r.status === 'paid' ? 'Paid on ' + esc(F.date(r.paidAt)) : 'Accounts to pay') : '');
    } else {
      const bal = B.orderBalance(o);
      money = cell('Still to pay', bal > 0.5 ? `<span class="num">${F.money(bal)}</span>` : 'Nothing', pend > 0.5 ? F.money(pend) + ' waiting for Accounts' : bal > 0.5 ? F.pct(B.orderPaidPct(o)) + ' paid' : 'Paid in full');
    }
    return `<div class="card so-facts">
      ${cell('Customer', esc(c.name || '—'), c.mobile ? `<a class="btn-link" href="tel:${esc(c.mobile)}">${esc(c.mobile)}</a>` : '')}
      ${cell('Car', `${swatch(o.color)} ${esc(NA.modelName(o.modelId))}`, v ? `<span class="mono">${esc(v.vin)}</span>` : esc(o.color || ''))}
      ${cell('Price after discount', `<span class="num">${F.money(B.orderNet(o))}</span>`, concessionOf(o) > 0.5 ? `${F.money(concessionOf(o))} off ${F.money(listPriceOf(o))}` : (Number(o.price) || 0) > listPriceOf(o) + 0.5 ? 'List price ' + F.money(listPriceOf(o)) : 'List price')}
      ${money}
    </div>`;
  }

  /** Secondary actions for an order (cancelling lives here, not as a red button on the page). */
  function moreItems(o) {
    const items = [];
    const edit = NA.can('orders.edit') && isOpen(o) && !B.cancelPending(o);
    if (edit) items.push({ act: 'edit', icon: 'edit', label: o.vehicleId ? 'Change the expected delivery date' : 'Change price, discount or colour' });
    if (NA.can('leads.assign') && isOpen(o)) items.push({ act: 'reassign', icon: 'users', label: 'Give the order to another consultant' });
    if (o.vehicleId) items.push({ act: 'print-handover', icon: 'print', label: 'Print the handover form' }, { act: 'print-ack', icon: 'print', label: 'Print the delivery acknowledgement' });
    if (edit) items.push({ act: 'cancel', icon: 'x', label: B.orderReceived(o) > 0.5 || o.vehicleId ? 'Ask to cancel the order' : 'Cancel the order', danger: true });
    return items;
  }
  function moreSheet(o, root) {
    const items = moreItems(o);
    if (!items.length) { ui.toast('Nothing else to do on this order', 'info'); return; }
    ui.modal({
      title: o.code, subtitle: esc(NA.customerName(o.customerId)), size: 'sm',
      body: `<div class="glist so-sheet">${items.map((x) => `<button class="gl-row has-icon ${x.danger ? 'so-danger' : ''}" data-sheet="${esc(x.act)}"><span class="gl-icon ${x.danger ? 'bg-red' : 'bg-gray'}">${NA.icon(x.icon, 17)}</span><span class="gl-main"><b>${esc(x.label)}</b></span>${NA.icon('chevron-right', 16, 'gl-chev')}</button>`).join('')}</div>`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sheet]');
        if (!b) return;
        ui.closeTop();
        handleDetailAction(o.id, { dataset: { act: b.dataset.sheet } }, root);
      }),
    });
  }

  function renderDetail(root, id) {
    const o = NA.get('orders', id);
    if (!o || (NA.isRole('sales') && !NA.isMine(o))) { root.innerHTML = ui.notFound('order', '#/sales', NA.isRole('sales') ? 'My orders' : 'All orders'); return; }
    const cancelled = o.stage === 'cancelled';
    const cur = o.stage === 'delivered' ? STEPS.length : cancelled ? Math.max(0, SI(o.cancel && o.cancel.fromStage)) : Math.max(0, SI(stageOf(o)));
    const showWho = !NA.isRole('sales');
    const subtitle = `${esc(STAGE_NAME[stageOf(o)] || o.stage)} · ${esc(NA.modelName(o.modelId))} · ${esc(o.color || '')} · ${esc(channelLabel(o.channel))}${showWho && o.consultantId ? ' · ' + esc(NA.staffName(o.consultantId)) : ''}`;
    const canPay = NA.can('payments.record') && !cancelled && !B.cancelPending(o) && B.orderToCollect(o) > 0.5;
    const actions = (canPay ? ui.btn('Record payment', { icon: 'wallet', act: 'pay' }) : '') + (moreItems(o).length ? ui.btn('More', { icon: 'more', act: 'more' }) : '');
    // A discount approved on the lead's quotation counts too: show it when the order has no discount request of its own.
    const banners = NA.ui.approvalBanners('orders', o.id)
      + (o.leadId && Number(o.discount) > 0 && !NA.approvals.find('orders', o.id, 'discount') ? NA.ui.approvalBanners('leads', o.leadId, ['discount']) : '');

    root.innerHTML = `
      ${ui.pageHead({ title: `${o.code} · ${NA.customerName(o.customerId)}`, subtitle, actions, crumbs: [{ label: NA.isRole('sales') ? 'My orders' : 'Orders', href: '#/sales' }, { label: o.code }] })}
      ${cancelled ? `<div class="callout callout-danger so-mb">${NA.icon('x')}<div><b>This order was cancelled</b>${o.cancel ? ` on ${esc(F.date(o.cancel.date))} — ${esc(o.cancel.reason || '')}${o.cancel.note ? ': ' + esc(o.cancel.note) : ''}` : ''}.${o.cancel && o.cancel.approvedBy ? ' Approved by ' + esc(o.cancel.approvedBy) + '.' : ''}</div></div>` : ''}
      ${factsStrip(o)}
      <div class="card pad so-top">
        ${ui.stepper(STEPS, cur)}
        ${nextStepHtml(o)}
      </div>
      ${banners ? `<div class="so-banners" id="so-approvals">${banners}</div>` : ''}
      <div class="grid grid-main-side so-cols">
        <div class="stack so-main">
          ${paymentsPanel(o)}
          ${o.channel === 'Bank' ? bankPanel(o) : ''}
          ${o.channel === 'Corporate' ? corporatePanel(o) : ''}
          ${vinPanel(o)}
          ${brtaPanel(o)}
          ${deliveryPanel(o)}
        </div>
        <aside class="so-side">${sideLists(o)}</aside>
      </div>`;

    ui.delegate(root, 'click', '[data-act]', (el) => handleDetailAction(o.id, el, root));
    ui.delegate(root, 'change', '[data-acc]', () => countAccessories(root, o.id));
  }

  /* ---------------- detail actions ---------------- */
  function handleDetailAction(orderId, el, root) {
    const o = NA.get('orders', orderId);
    if (!o) return;
    switch (el.dataset.act) {
      case 'pay': return openPayment(o.id);
      case 'more': return moreSheet(o, root);
      case 'print-receipt': { const p = NA.get('payments', el.dataset.id); if (p) printReceipt(p); return; }
      case 'print-handover': return printHandover(o);
      case 'print-ack': return printAck(o);
      case 'gate-pass': return gatePass(o);
      case 'goto': { const t = root.querySelector('#' + el.dataset.target); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      case 'edit': return editOrder(o);
      case 'reassign': return reassign(o);
      case 'ask-discount': return askDiscount(o);
      case 'ask-credit': return askCredit(o);
      case 'cancel': return cancelOrder(o);
      case 'refund': return payRefund(o);
      case 'clear': return confirmPayment(o, el.dataset.id, true);
      case 'bounce': return confirmPayment(o, el.dataset.id, false);
      case 'bank-step': return markBankStep(o, el.dataset.step);
      case 'bank-undo': return undoBankStep(o, el.dataset.step);
      case 'bank-edit': return editBank(o);
      case 'bank-rejected': return loanRejected(o);
      case 'corp-edit': return editCorporate(o);
      case 'give-vin': return giveVinSheet(o, el.dataset.id);
      case 'ask-emergency': return askEmergency(o);
      case 'withdraw-emergency': return withdrawEmergency(o);
      case 'emergency': {
        if (NA.can('po.manage') && hasAction('newEmergencyPO')) NA.actions.newEmergencyPO({ modelId: o.modelId, color: o.color, orderId: o.id });
        else askEmergency(o);
        return;
      }
      case 'brta-file': return fileBrta(o);
      case 'brta-number': return brtaNumber(o);
      case 'dlv-toggle': return toggleDelivery(o, el.dataset.key);
      case 'acc-all': { root.querySelectorAll('[data-acc]').forEach((x) => { if (!x.disabled) x.checked = true; }); countAccessories(root, o.id); return; }
      case 'acc-save': return saveAccessories(o, root, true);
      case 'deliver': return confirmDelivery(o, root);
      case 'book-service': { if (canBookService()) NA.actions.newServiceBooking({ customerId: o.customerId, vehicleId: o.vehicleId, type: 'Periodic Maintenance' }); return; }
      case 'add-note': return addNote(o, root);
      default:
    }
  }

  function addNote(o, root) {
    const ta = root.querySelector('[data-note]');
    const text = ta && ta.value.trim();
    if (!text) { ui.toast('Type a note first', 'error'); if (ta) ta.focus(); return; }
    const me = NA.me();
    NA.update('orders', o.id, { noteLog: (o.noteLog || []).concat([{ at: nowIso(), text, by: me.name, byId: me.staffId || null }]) });
    ui.toast('Note saved');
    NA.refresh();
  }

  /** Accounts confirms money (cash handed over, cheque cleared, transfer seen) or marks it not received. */
  function confirmPayment(o, pid, ok) {
    if (!NA.can('payments.verify')) { ui.toast('Accounts confirms payments', 'info'); return; }
    const p = NA.get('payments', pid);
    if (!p || !B.paymentPending(p)) { NA.refresh(); return; }
    // B.verifyPayment also saves the order's stage.
    if (ok) { B.verifyPayment(p, true); ui.toast('Confirmed — ' + F.money(p.amount)); NA.refresh(); return; }
    ui.formModal({
      title: 'Payment not received', size: 'sm', submitLabel: 'Mark as not received',
      intro: `<p class="muted so-mb">${esc(p.receiptNo || '')} · ${F.money(p.amount)} · ${esc(p.method)}${p.ref ? ' ' + esc(p.ref) : ''}. The amount stops counting, and ${esc(o.consultantId ? NA.staffName(o.consultantId) : 'the consultant')} gets a follow-up to collect it again.</p>`,
      fields: [{ name: 'note', label: 'What happened?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Cheque bounced — insufficient funds' }],
      onSubmit: (v) => { B.verifyPayment(p, false, v.note); ui.toast('Marked as not received', 'info'); NA.refresh(); },
    });
  }

  function gatePass(o) {
    if (!(NA.can('delivery.complete') || NA.can('payments.verify'))) { ui.toast('The sales team or Accounts prints the gate pass', 'info'); return; }
    if (o.stage === 'delivered' && !(o.delivery && o.delivery.gatePass)) { ui.toast('No gate pass was printed for this car', 'info'); return; }
    if (o.stage !== 'delivered') {
      const blockers = deliveryBlockersFor(o).concat(checklistMissing(o));
      if (blockers.length) { ui.toast(blockers[0], 'error'); return; }
    }
    if (printGatePass(o)) NA.refresh();
  }

  function toggleDelivery(o, key) {
    if (!NA.can('delivery.complete') || !['handoverForm', 'signedAck'].includes(key) || !isOpen(o) || !o.vehicleId) { NA.refresh(); return; }
    const d = Object.assign({ handoverForm: false, signedAck: false }, o.delivery);
    d[key] = !d[key];
    d[key + 'By'] = d[key] ? NA.me().name : null;
    NA.update('orders', o.id, { delivery: d });
    const labels = { handoverForm: 'Handover form', signedAck: 'Signed acknowledgement' };
    NA.log(`${o.code}: ${labels[key]} ${d[key] ? 'ticked' : 'un-ticked'}`, { rec: o, link: '#/sales/' + o.id });
    NA.refresh();
  }

  /* Accessories: ticked on the screen, saved once (one history line, no page jump on every tick).
     Ticks not saved yet are kept per order (accDraft), so another tick or a sync update that redraws the page keeps them. */
  const accDraft = {};
  const sameList = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const savedAccessories = (orderId) => { const o = NA.get('orders', orderId); return (o && o.delivery && o.delivery.accessories) || []; };
  function accCountText(o, list) {
    return `${list.length} of ${ACCESSORIES.length}${accDraft[o.id] && !sameList(accDraft[o.id], savedAccessories(o.id)) ? ' · not saved yet' : ''}`;
  }
  function readAccessories(root) {
    const boxes = root.querySelectorAll('[data-acc]');
    if (!boxes.length) return null;
    const out = [];
    boxes.forEach((x) => { if (x.checked && ACCESSORIES[+x.dataset.acc]) out.push(ACCESSORIES[+x.dataset.acc]); });
    return out;
  }
  function countAccessories(root, orderId) {
    const list = readAccessories(root);
    if (!list) return;
    if (sameList(list, savedAccessories(orderId))) delete accDraft[orderId]; else accDraft[orderId] = list;
    const el = root.querySelector('[data-acc-count]');
    if (el) el.textContent = accCountText({ id: orderId }, list);
  }
  function saveAccessories(o, root, announce) {
    if (!NA.can('delivery.complete')) return;
    const list = readAccessories(root);
    if (!list) return;
    const before = (o.delivery && o.delivery.accessories) || [];
    delete accDraft[o.id];
    if (sameList(list, before)) { if (announce) ui.toast('Nothing changed', 'info'); return; }
    NA.update('orders', o.id, { delivery: Object.assign({}, o.delivery, { accessories: list }) });
    const missing = ACCESSORIES.filter((a) => !list.includes(a));
    NA.log(`${o.code}: accessories handed over ${list.length} of ${ACCESSORIES.length}${missing.length && missing.length <= 3 ? ' (not yet: ' + missing.join(', ') + ')' : ''}`, { rec: o, link: '#/sales/' + o.id });
    if (announce) { ui.toast('Accessories list saved'); NA.refresh(); }
  }

  /** Change the discount and colour (until the VIN), the price (managers, never below list) and the expected delivery date.
      Every change is logged old → new; a bigger discount needs a new approval automatically. */
  function editOrder(o) {
    if (!NA.can('orders.edit')) { ui.toast('Only the sales team changes orders', 'info'); return; }
    if (!isOpen(o)) { ui.toast('This order is closed', 'info'); return; }
    if (B.cancelPending(o)) { ui.toast('A cancellation is waiting for a decision', 'info'); return; }
    const locked = !!o.vehicleId;
    const manager = NA.isManager();
    const lp = listPriceOf(o);
    const received = B.orderReceived(o);
    const old = { price: Number(o.price) || 0, discount: Number(o.discount) || 0, color: o.color, exp: o.expectedDelivery || null };
    const fields = [];
    if (!locked) {
      if (manager) fields.push({ name: 'price', label: 'Price (incl. VAT)', type: 'money', required: true, help: `List price ${F.money(lp)}. A lower price is given as a discount, so the approval rules apply.` });
      fields.push({ name: 'discount', label: 'Discount', type: 'money', help: `Up to ${F.money(NA.policy().discountFree)} without asking` });
      fields.push({ name: 'discountReason', label: 'Why this discount? (when it needs approval)', type: 'textarea', rows: 2, span: 2 });
      fields.push({ name: 'color', label: 'Colour', type: 'select', placeholder: false, options: ui.opts.colors(o.modelId) });
    }
    fields.push({ name: 'expectedDelivery', label: 'Expected delivery', type: 'date' });
    const intro = (locked ? '<p class="muted so-mb">The car (VIN) is given, so the price and colour are fixed now.</p>' : '')
      + (!locked && !manager ? `<div class="glist so-mb"><div class="gl-row"><span class="gl-main"><span class="gl-label">List price (incl. VAT)</span></span><span class="gl-value num">${F.money(lp)}</span></div></div>` : '')
      + (!locked && received > 0.5 ? `<p class="small muted so-mb">${F.money(received)} has been paid, so the price after discount cannot go below that.</p>` : '');
    ui.formModal({
      title: locked ? 'Expected delivery' : 'Change price or discount', subtitle: esc(o.code), size: 'sm', intro, fields,
      values: { price: old.price, discount: old.discount, color: o.color, expectedDelivery: o.expectedDelivery || '' },
      submitLabel: 'Save changes',
      onSubmit: (v, el) => {
        const form = el.querySelector('form');
        const price = locked || !manager ? old.price : Number(v.price) || 0;
        const disc = locked ? old.discount : Number(v.discount) || 0;
        if (!locked) {
          if (manager && price < lp) return markInvalid(form, 'price', `Keep the price at ${F.money(lp)} or more — give a lower price as a discount`);
          if (disc < 0 || disc >= price) return markInvalid(form, 'discount', 'The discount must be less than the price');
          if (price - disc < received - 0.5) return markInvalid(form, 'discount', `The price after discount cannot be below the ${F.money(received)} already paid`);
        }
        const color = locked ? old.color : v.color;
        const exp = v.expectedDelivery || null;
        const changes = [];
        if (price !== old.price) changes.push(`price ${F.money(old.price)} → ${F.money(price)}`);
        if (disc !== old.discount) changes.push(`discount ${F.money(old.discount)} → ${F.money(disc)}`);
        if (color !== old.color) changes.push(`colour ${old.color || '—'} → ${color}`);
        if (exp !== old.exp) changes.push(`expected delivery ${F.date(old.exp)} → ${F.date(exp)}`);
        if (!changes.length) return true;
        const free = NA.policy().discountFree;
        // A raised discount above the free limit is stamped: an order from before the approval rules then loses its
        // exemption (see discountOk), so the raise needs an approval like on any new order.
        const raised = disc > old.discount && disc > free;
        NA.update('orders', o.id, Object.assign({ price, discount: disc, color, expectedDelivery: exp }, raised ? { discountChangedAt: NA.today() } : {}));
        const fresh = NA.get('orders', o.id);
        NA.log(`${o.code} changed: ${changes.join(', ')}`, { rec: fresh, link: '#/sales/' + o.id });
        let msg = 'Order updated';
        if (disc !== old.discount && disc > free && !discountOk(fresh)) {
          const a = requestDiscount(fresh, v.discountReason);
          msg = a.status === 'approved' ? 'Order updated — discount approved' : 'Order updated — the discount is sent for approval';
        }
        // Car before full payment covers the balance it was approved for: more owed now means asking again.
        const cr = NA.approvals.find('orders', o.id, 'credit');
        if (cr && cr.status === 'approved' && !B.creditApproved(fresh) && !B.isFullyPaid(fresh)) {
          msg += ` — car before full payment was approved with ${F.money(cr.value)} owed, so ask again for ${F.money(B.orderBalance(fresh))}`;
        }
        syncStage(fresh);
        ui.toast(msg);
        NA.refresh();
      },
    });
  }

  /** Managers give an order to another consultant (with a reason). Its receipts, warranty and follow-ups go with it. */
  function reassign(o) {
    if (!NA.can('leads.assign')) { ui.toast('Only the Sales Manager gives an order to another consultant', 'info'); return; }
    ui.formModal({
      title: 'Give the order to another consultant', subtitle: esc(o.code + ' · ' + NA.customerName(o.customerId)), size: 'sm',
      fields: [
        { name: 'consultantId', label: 'Sales consultant', type: 'select', required: true, options: ui.opts.consultants() },
        { name: 'reason', label: 'Why?', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Nusrat is on leave until the handover' },
      ],
      values: { consultantId: o.consultantId || '' },
      submitLabel: 'Give order',
      onSubmit: (v) => {
        const from = o.consultantId || null;
        const to = v.consultantId;
        if (!to || to === from) return true;
        NA.update('orders', o.id, { consultantId: to });
        NA.where('payments', (p) => p.orderId === o.id).forEach((p) => NA.update('payments', p.id, { ownerId: to }));
        NA.where('warranties', (w) => w.orderId === o.id).forEach((w) => NA.update('warranties', w.id, { ownerId: to }));
        NA.where('invoices', (i) => i.kind === 'vehicle' && i.refId === o.id).forEach((i) => NA.update('invoices', i.id, { ownerId: to }));
        // Open follow-ups go with it. The Sales Manager's call-backs (escalated) stay the Sales Manager's to make: only
        // their owner moves, so the new consultant sees them.
        NA.where('followUps', (f) => f.orderId === o.id && !['done', 'closed'].includes(f.status))
          .forEach((f) => NA.update('followUps', f.id, f.escalated || f.type === 'Manager call-back' ? { ownerId: to } : { consultantId: to, ownerId: to }));
        // The customer follows too, unless they have other orders with the previous consultant.
        const c = NA.customer(o.customerId);
        const others = NA.where('orders', (x) => x.id !== o.id && x.customerId === o.customerId && x.consultantId === from && x.stage !== 'cancelled');
        if (c && from && c.ownerId === from && !others.length) {
          NA.update('customers', c.id, { consultantId: to });
          // The customer's own open calls go along, by the same rule as a hand-over in Customers.
          if (NA.leadUtils && NA.leadUtils.customerHandedOver) NA.leadUtils.customerHandedOver(c.id, from, to);
        }
        NA.log(`${o.code}: consultant changed from ${NA.staffName(from)} to ${NA.staffName(to)} — ${v.reason}`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
        ui.toast('Order given to ' + NA.staffName(to));
        NA.refresh();
      },
    });
  }

  function askDiscount(o) {
    if (!NA.can('orders.edit')) return;
    const d = Number(o.discount) || 0;
    if (!d || discountOk(o)) { ui.toast('This discount needs no approval', 'info'); NA.refresh(); return; }
    NA.ui.requestApproval({
      type: 'discount', ref: { c: 'orders', id: o.id, code: o.code },
      title: `${F.money(d)} off ${o.code}`,
      detail: `${NA.customerName(o.customerId)} · ${NA.modelName(o.modelId)} · list price ${F.money(listPriceOf(o))} → ${F.money(B.orderNet(o))}`,
      amount: d, value: d, data: { listPrice: listPriceOf(o), net: B.orderNet(o) },
      placeholder: 'e.g. Repeat customer, matching a competitor’s offer',
    }).then((a) => { if (a) { syncStage(o); NA.refresh(); } });
  }

  /** Car before full payment: the Managing Director decides (a company's purchase order terms, or a bank's sanction letter). */
  function askCredit(o) {
    if (!(NA.can('orders.edit') || NA.can('payments.verify'))) return;
    if (paused(o)) return;
    if (paidOrCredit(o)) { ui.toast('Not needed — the order is paid in full or already approved', 'info'); return; }
    if (!['Corporate', 'Bank'].includes(o.channel)) { ui.toast('Only corporate and bank-loan orders can get the car before full payment', 'info'); return; }
    if (corpDocMissing(o)) { ui.toast('Add the company’s purchase order first', 'error'); return; }
    const bank = o.channel === 'Bank';
    if (bank && !(o.bank && o.bank.steps && o.bank.steps.sanction)) { ui.toast('Ask once the bank’s sanction letter is in', 'info'); return; }
    const bal = B.orderBalance(o);
    NA.ui.requestApproval({
      type: 'credit', sheetTitle: 'Car before full payment', ref: { c: 'orders', id: o.id, code: o.code },
      title: bank ? `${o.code}: release the car against the ${(o.bank && o.bank.bankName) || 'bank'} sanction letter` : `${o.code}: car before full payment`,
      detail: `${NA.customerName(o.customerId)} · ${NA.modelName(o.modelId)} · ${F.money(bal)} still to pay${bank && o.bank.sanctionRef ? ' · sanction letter ' + o.bank.sanctionRef : ''}${o.corporate && o.corporate.docRef ? ' · ' + (o.corporate.docType || 'PO') + ' ' + o.corporate.docRef : ''}`,
      amount: bal, value: bal,
      placeholder: bank ? 'e.g. Sanction letter received; the bank pays after registration' : 'e.g. The company pays within 30 days of delivery, as in its purchase order',
    }).then((a) => { if (a) { syncStage(o); NA.refresh(); } });
  }

  /**
   * Cancel an order. No money, no car and no emergency car from Purchasing → cancelled at once, with a reason.
   * Otherwise it is a request to the Managing Director (approval kind 'cancel'); applyCancel runs when it is approved —
   * in the MD's browser, which can release a car kept for the order and tell Purchasing on its purchase order.
   */
  const needsMdToCancel = (o) => B.orderReceived(o) > 0.5 || !!o.vehicleId || purchasingInvolved(o);
  function cancelOrder(o) {
    if (!NA.can('orders.edit')) { ui.toast('The sales team cancels orders', 'info'); return; }
    if (!isOpen(o)) { ui.toast(o.stage === 'delivered' ? 'A delivered car cannot be cancelled' : 'This order is already cancelled', 'info'); return; }
    if (B.cancelPending(o)) { ui.toast('A cancellation is already waiting for the Managing Director', 'info'); return; }
    const v = NA.vehicle(o.vehicleId);
    const confirmed = B.orderPaid(o), pending = B.orderPending(o), received = confirmed + pending;
    const needsOk = needsMdToCancel(o);
    const kept = keptCars(o);
    const fields = [
      { name: 'reason', label: 'Reason', type: 'select', required: true, options: CANCEL_REASONS },
      { name: 'note', label: 'What happened?', type: 'textarea', rows: 2 },
    ];
    if (received > 0.5) fields.push({ name: 'refund', label: 'Refund to the customer', type: 'money', required: true, help: `Paid so far: ${F.money(confirmed)} confirmed${pending > 0.5 ? ' and ' + F.money(pending) + ' waiting for Accounts (refunded only once it is confirmed)' : ''}. Enter less if part of the booking money is kept.` });
    const what = [received > 0.5 ? F.money(received) + ' paid' : '', v ? 'the car ' + v.vin + ' given' : '',
      !v && kept.length ? 'a car kept for it' : !v && purchasingInvolved(o) ? 'an emergency car asked from Purchasing' : ''].filter(Boolean).join(' and ');
    const intro = needsOk
      ? `<div class="callout callout-warn so-mb">${NA.icon('alert')}<div>This order has ${esc(what)}. The Managing Director decides. Until then payments, the VIN, registration and the handover are paused.</div></div>`
      : '<p class="muted so-mb">No money was paid and no car was given, so the order is cancelled straight away.</p>';
    ui.modal({
      title: (needsOk ? 'Ask to cancel ' : 'Cancel ') + o.code, size: 'sm',
      body: intro + `<form class="modal-form" onsubmit="return false">${ui.form(fields, { refund: Math.round(received) })}</form>`,
      actions: [{ label: 'Keep the order' }, { label: needsOk ? 'Send to Managing Director' : 'Cancel order', kind: 'danger', onClick: (el) => {
        const form = el.querySelector('form');
        if (!ui.validate(form)) return false;
        const val = ui.readForm(form);
        const refund = received > 0.5 ? Number(val.refund) || 0 : 0;
        if (refund < 0 || refund > received + 0.5) return markInvalid(form, 'refund', `The refund can be up to ${F.money(received)}`);
        const fresh = NA.get('orders', o.id);
        if (!fresh || !isOpen(fresh) || B.cancelPending(fresh) || needsMdToCancel(fresh) !== needsOk) { ui.toast('This order changed in the meantime — nothing was sent', 'error'); NA.refresh(); return true; }
        if (!needsOk) {
          applyCancel(fresh, { reason: val.reason, note: val.note || '', refund: 0 });
          ui.toast('Order cancelled', 'info');
          NA.refresh();
          return true;
        }
        const a = NA.approvals.request({
          type: 'cancel', ref: { c: 'orders', id: o.id, code: o.code },
          title: `Cancel ${o.code}${refund ? ' · refund ' + F.money(refund) : ''}`,
          detail: `${NA.customerName(o.customerId)} · ${NA.modelName(o.modelId)}${v ? ' · VIN ' + v.vin : ''}${received > 0.5 ? ' · paid ' + F.money(received) : ''}${!v && purchasingInvolved(o) ? ' · Purchasing has an emergency car for it' : ''}`,
          amount: confirmed, value: refund, reason: [val.reason, val.note].filter(Boolean).join(' — '),
          data: { reason: val.reason, note: val.note || '', refund },
        });
        ui.toast(a.status === 'approved' ? 'Order cancelled' : 'Sent to the Managing Director', 'info');
        NA.refresh();
        return true;
      } }],
    });
  }

  /** What a cancellation does — straight away, or when the Managing Director approves the request (see onDecide below). */
  function applyCancel(order, info) {
    const o = NA.get('orders', order.id);
    if (!o || !isOpen(o)) return;
    const me = NA.me();
    const fromStage = o.stage;
    const v = o.vehicleId && NA.vehicle(o.vehicleId);
    let carNote = '';
    if (v) {
      // A registered, driven or damaged car is not sold as new again until someone checks it: it goes on hold.
      const regNo = v.regNo || (o.brta && o.brta.regNo) || '';
      const why = [regNo ? `registered to ${NA.customerName(o.customerId)} (${regNo})` : '', (Number(v.km) || 0) > 50 ? `${v.km} km on the clock` : '', carProblem(v)].filter(Boolean).join(' · ');
      if (why) {
        NA.update('vehicles', v.id, { status: 'hold', orderId: null, customerId: null, reservedFor: null, holdReason: `Back from cancelled order ${o.code} — ${why}`, hold: { from: 'cancellation', by: me.name, byId: me.staffId || null, at: nowIso() } });
        carNote = ` · VIN ${v.vin} back in stock on hold (${why})`;
      } else {
        NA.update('vehicles', v.id, { status: 'available', orderId: null, customerId: null, reservedFor: null });
        carNote = ` · VIN ${v.vin} back in stock`;
      }
    }
    // A car kept for this order (an emergency car that came before the VIN) is free for other orders again.
    const kept = keptCars(o);
    kept.forEach((x) => NA.update('vehicles', x.id, { reservedFor: null }));
    if (kept.length) carNote += ` · ${kept.map((x) => 'VIN ' + x.vin).join(', ')} no longer kept for it`;
    const refund = Math.max(0, Number(info.refund) || 0);
    NA.update('orders', o.id, {
      stage: 'cancelled', vehicleId: null, releasedVehicleId: v ? v.id : null,
      cancel: { date: NA.today(), reason: info.reason || 'Cancelled', note: info.note || '', fromStage, by: info.requestedBy || me.name, approvedBy: info.approvedBy || null },
      refund: refund > 0.5 ? { amount: refund, status: 'due', approvedBy: info.approvedBy || me.name, approvedAt: nowIso() } : null,
    });
    // Requests still open on this order are no longer needed — closed where this person may (the asker, an approver or
    // the MD; the office server refuses anyone else). Others stay for their approver, and deciding them changes nothing now.
    NA.approvals.forRecord('orders', o.id).filter((a) => a.status === 'pending' && a.type !== 'cancel' && mayClose(a))
      .forEach((a) => NA.update('approvals', a.id, { status: 'cancelled', note: 'The order was cancelled' }));
    // The lead is no longer "won", so it can be worked again and the conversion figures stay true.
    const lead = getLead(o);
    if (lead && lead.stage === 'won') {
      NA.update('leads', lead.id, { stage: 'lost', lostFrom: 'opportunity', lostReason: 'Order cancelled', lostNote: info.reason || '', lostAt: NA.today(), stageAt: NA.today(), lostTo: '', lostCompetitor: null, nextFollowUp: '' });
      NA.log(`Lead ${lead.code || lead.name} marked lost — order ${o.code} was cancelled`, { rec: lead, link: '#/leads/' + lead.id, kind: 'warn' });
    }
    // Purchasing reads this on the purchase order itself (written there by whoever may change purchase orders — the MD here).
    emergencyPOs(o).forEach((p) => NA.log(`${p.code || 'Emergency purchase'}: order ${o.code} was cancelled (${info.reason || 'no reason given'}) — Purchasing decides whether to keep this car for stock`,
      { rec: canWrite('purchaseOrders') && !p.copy ? p : null, link: '#/procurement/' + p.id, kind: 'warn' }));
    NA.log(`${o.code} cancelled — ${info.reason || 'no reason given'}${carNote}${refund > 0.5 ? ` · refund ${F.money(refund)} due to the customer` : ''}`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
  }

  /** Confirmed money still held for an order: cleared receipts net of refunds already paid (core B.orderPaid). */
  const heldFor = (o) => Math.max(0, B.orderPaid(o));
  /** Money still waiting to be confirmed is settled before any refund ('' = nothing waiting). */
  function refundWait(o) {
    const pend = B.orderPending(o);
    return pend > 0.5 ? `${F.money(pend)} for ${o.code} is still waiting to be confirmed. Confirm it or mark it not received first (Payments on the order, or Approvals → Money to confirm), then pay the refund.` : '';
  }

  /**
   * Accounts pays an approved refund: a negative payment (kind 'refund'); the order's refund is then marked paid.
   * It pays at most the confirmed money still held, so money that bounced after the approval is never paid back
   * (refund.amount = what was paid, refund.approvedAmount = what the MD approved).
   */
  function payRefund(o) {
    const r = o.refund;
    if (!r || r.status !== 'due') { ui.toast('No refund is due on this order', 'info'); return; }
    if (!NA.can('finance.manage')) { ui.toast('Accounts pays refunds', 'info'); return; }
    const wait = refundWait(o);
    if (wait) { ui.toast(wait, 'info'); return; }
    const approved = Math.abs(Number(r.amount) || 0);
    const pay = Math.min(approved, heldFor(o));
    const me = NA.me();
    if (pay <= 0.5) {
      // None of the money was confirmed (it all bounced): the refund is closed with nothing paid, and no voucher.
      ui.confirm(`None of the money for ${esc(o.code)} was confirmed, so the approved ${F.money(approved)} cannot be paid back. Close the refund with nothing paid?`,
        { title: 'Nothing to refund', okLabel: 'Close the refund' }).then((ok) => {
        if (!ok) return;
        const fresh = NA.get('orders', o.id);
        if (!fresh || !fresh.refund || fresh.refund.status !== 'due' || refundWait(fresh) || heldFor(fresh) > 0.5) { ui.toast('This order changed in the meantime — nothing was saved', 'error'); NA.refresh(); return; }
        NA.update('orders', o.id, { refund: Object.assign({}, fresh.refund, { status: 'paid', amount: 0, approvedAmount: approved, paidAt: NA.today(), paidBy: me.name, paidById: me.staffId || null }) });
        NA.log(`Refund for ${o.code} closed: ${F.money(approved)} approved, nothing paid — none of the money was confirmed`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
        ui.toast('Refund closed — nothing was paid', 'info');
        NA.refresh();
      });
      return;
    }
    const methods = (NA.FLOW.payOutMethods || ['Bank Transfer', 'Cheque', 'Pay Order', 'RTGS', 'Cash']).slice();
    const capped = pay < approved - 0.5;
    ui.formModal({
      title: 'Pay refund', subtitle: esc(`${o.code} · ${NA.customerName(o.customerId)}`), size: 'sm', submitLabel: 'Record refund',
      intro: `<div class="glist so-mb">
          <div class="gl-row"><span class="gl-main"><b>Refund approved</b><small>${esc(r.approvedBy ? 'by ' + r.approvedBy : '')}${r.approvedAt ? ' · ' + esc(F.date(r.approvedAt)) : ''}</small></span><span class="gl-value"><b class="num">${F.money(approved)}</b></span></div>
          ${capped ? `<div class="gl-row"><span class="gl-main"><b>To pay now</b><small>Only ${F.money(pay)} of the money for this order was confirmed — the rest never came in</small></span><span class="gl-value"><b class="num">${F.money(pay)}</b></span></div>` : ''}
        </div>`,
      fields: [
        { name: 'method', label: 'Paid by', type: 'select', placeholder: false, options: methods },
        { name: 'date', label: 'Date paid', type: 'date', required: true, max: NA.today() },
        { name: 'ref', label: 'Reference (cheque, transfer or transaction no.)' },
        { name: 'note', label: 'Note (optional)', span: 2 },
      ],
      values: { method: methods.includes('Bank Transfer') ? 'Bank Transfer' : methods[0], date: NA.today() },
      onSubmit: (v, el) => {
        const form = el.querySelector('form');
        if (v.date > NA.today()) return markInvalid(form, 'date', 'The date cannot be in the future');
        if (v.method !== 'Cash' && !v.ref) return markInvalid(form, 'ref', 'Enter the cheque, transfer or transaction number');
        const fresh = NA.get('orders', o.id);
        if (!fresh || !fresh.refund || fresh.refund.status !== 'due') { ui.toast('This refund was already recorded', 'info'); NA.refresh(); return true; }
        const stillWaiting = refundWait(fresh);
        if (stillWaiting) { ui.toast(stillWaiting, 'error'); NA.refresh(); return true; }
        const ok = Math.abs(Number(fresh.refund.amount) || 0);
        const amount = Math.min(ok, heldFor(fresh));
        if (amount <= 0.5) { ui.toast('No confirmed money is held for this order any more — nothing was paid', 'error'); NA.refresh(); return true; }
        const p = NA.insert('payments', {
          receiptNo: NA.nextCode('RF', 5), orderId: o.id, customerId: o.customerId, date: v.date, amount: -amount,
          method: v.method, ref: v.method === 'Cash' ? '' : v.ref, note: v.note || 'Refund — order cancelled', kind: 'refund', status: 'cleared',
          receivedBy: me.name, paidBy: me.name, paidById: me.staffId || null, verifiedBy: me.name, verifiedAt: nowIso(),
        });
        NA.update('orders', o.id, { refund: Object.assign({}, fresh.refund, { status: 'paid', amount, approvedAmount: ok, paidAt: v.date, paidBy: me.name, paidById: me.staffId || null, paymentId: p.id, method: v.method, ref: p.ref }) });
        NA.log(`Refund ${F.money(amount)} paid to ${NA.customerName(o.customerId)} for ${o.code} (${v.method}${p.ref ? ' ' + p.ref : ''}) — voucher ${p.receiptNo}${amount < ok - 0.5 ? ` · approved ${F.money(ok)} → paid ${F.money(amount)}: the rest was never confirmed` : ''}`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'money' });
        ui.toast('Refund recorded — the voucher is under Documents');
        NA.refresh();
      },
    });
  }
  /** Finance and Today open the same refund payout (only people who may pay refunds get past payRefund's check). */
  NA.actions.payRefund = function (orderId) {
    ensureCss();
    const o = orderId ? NA.get('orders', orderId) : null;
    if (!o) { ui.toast('This order isn’t available to you', 'error'); return; }
    payRefund(o);
  };

  function markBankStep(o, key) {
    const bk = o.bank || {};
    const steps = Object.assign({}, bk.steps);
    const idx = NA.FLOW.bankSteps.findIndex((s) => s.key === key);
    const firstPending = NA.FLOW.bankSteps.findIndex((s) => !steps[s.key]);
    if (idx < 0 || idx !== firstPending) { ui.toast('Do the bank steps in order', 'error'); return; }
    if (!isOpen(o) || paused(o)) return;
    const label = NA.FLOW.bankSteps[idx].label;
    const save = (date, extra) => {
      const cur = NA.get('orders', o.id).bank || bk;
      const st = Object.assign({}, cur.steps, { [key]: date || NA.today() });
      NA.update('orders', o.id, { bank: Object.assign({}, cur, extra || {}, { steps: st }) });
      NA.log(`${o.code}: bank loan — ${label.toLowerCase()} done (${cur.bankName || 'bank'})`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: key === 'disbursement' ? 'money' : 'info' });
    };
    if (key === 'disbursement') {
      if (!NA.can('payments.record')) { ui.toast('The sales team or Accounts records the bank’s payment', 'info'); return; }
      // The step closes only with a real "Bank Disbursement" payment.
      const already = orderPayments(o).find((p) => p.method === 'Bank Disbursement' && !B.paymentBounced(p));
      if (already) { save(already.date); ui.toast('Disbursement marked done'); NA.refresh(); return; }
      const left = B.orderToCollect(o);
      if (left <= 0.5) { ui.toast('Nothing is left to pay, so no bank payment is expected. If the loan is not needed, use “Loan rejected” to switch to Retail.', 'info'); return; }
      openPayment(o.id, {
        title: 'Record the bank’s payment',
        amount: Math.min(Number(bk.loanAmount) || left, left),
        method: 'Bank Disbursement', lockMethod: true,
        note: 'Loan disbursement — ' + (bk.bankName || ''),
        onSaved: (p) => { if (p.method === 'Bank Disbursement') save(p.date); },
      });
      return;
    }
    if (!NA.can('orders.edit')) { ui.toast('The sales team records the bank steps', 'info'); return; }
    const sanction = key === 'sanction';
    const fields = [{ name: 'date', label: 'Date', type: 'date', required: true, max: NA.today() }];
    if (sanction) {
      fields.push({ name: 'ref', label: 'Sanction letter number', required: true, placeholder: 'e.g. CBL/AUTO/2025/7781' });
      fields.push({ name: 'amount', label: 'Amount the bank sanctioned', type: 'money', required: true });
    }
    ui.formModal({
      title: label, subtitle: esc(`${o.code} · ${bk.bankName || 'Bank loan'}`), size: 'sm', fields,
      values: { date: NA.today(), amount: bk.loanAmount },
      submitLabel: 'Mark done',
      onSubmit: (v, el) => {
        const form = el.querySelector('form');
        if (v.date > NA.today()) return markInvalid(form, 'date', 'The date cannot be in the future');
        if (!sanction) { save(v.date); ui.toast(label + ' done'); NA.refresh(); return; }
        const amt = Number(v.amount) || 0;
        if (amt <= 0 || amt >= B.orderNet(o)) return markInvalid(form, 'amount', 'The sanctioned amount must be more than 0 and less than the price');
        const extra = { sanctionRef: v.ref, sanctionAmount: amt };
        if (Math.abs(amt - (Number(bk.loanAmount) || 0)) > 0.5) {
          extra.loanAmount = amt;
          NA.log(`${o.code}: bank loan changed from ${F.money(bk.loanAmount)} to ${F.money(amt)} (sanctioned) — the customer’s share is now ${F.money(Math.max(0, B.orderNet(o) - amt))}`, { rec: o, link: '#/sales/' + o.id, kind: 'warn' });
        }
        save(v.date, extra);
        ui.toast('Sanction letter recorded');
        NA.refresh();
      },
    });
  }

  function undoBankStep(o, key) {
    if (!NA.can('orders.edit') || paused(o)) return;
    ui.confirm(`Undo “${esc(NA.stageLabel(NA.FLOW.bankSteps, key))}”? Its date is cleared${key === 'disbursement' ? ' (the bank’s payment stays recorded)' : ''}.`, { okLabel: 'Undo step' }).then((ok) => {
      if (!ok) return;
      const bk = NA.get('orders', o.id).bank || {};
      const steps = Object.assign({}, bk.steps, { [key]: null });
      NA.update('orders', o.id, { bank: Object.assign({}, bk, { steps }) });
      NA.log(`${o.code}: bank step “${NA.stageLabel(NA.FLOW.bankSteps, key)}” opened again`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
      NA.refresh();
    });
  }

  function editBank(o) {
    if (!NA.can('orders.edit') || paused(o)) return;
    const bk = o.bank || {};
    if (bk.steps && bk.steps.sanction) { ui.toast('The loan is fixed by the sanction letter. If the bank changed it, undo the sanction step first.', 'info'); return; }
    const el = ui.formModal({
      title: 'Bank loan', subtitle: esc(o.code), size: 'sm',
      fields: [
        { name: 'bankName', label: 'Bank or finance company', required: true },
        { name: 'branch', label: 'Branch' },
        { name: 'loanAmount', label: 'Loan amount', type: 'money', required: true },
      ],
      values: { bankName: bk.bankName, branch: bk.branch, loanAmount: bk.loanAmount },
      submitLabel: 'Save',
      onSubmit: (v, m) => {
        if (!(Number(v.loanAmount) > 0) || Number(v.loanAmount) >= B.orderNet(o)) return markInvalid(m.querySelector('form'), 'loanAmount', 'The loan must be more than 0 and less than the price');
        const changes = [];
        if (v.bankName !== bk.bankName) changes.push(`bank ${bk.bankName || '—'} → ${v.bankName}`);
        if ((v.branch || '') !== (bk.branch || '')) changes.push(`branch ${bk.branch || '—'} → ${v.branch || '—'}`);
        if (Number(v.loanAmount) !== Number(bk.loanAmount)) changes.push(`loan ${F.money(bk.loanAmount)} → ${F.money(v.loanAmount)}`);
        if (!changes.length) return true;
        NA.update('orders', o.id, { bank: Object.assign({}, bk, { bankName: v.bankName, branch: v.branch, loanAmount: Number(v.loanAmount), steps: bk.steps || {} }) });
        NA.log(`${o.code}: bank loan changed — ${changes.join(', ')}`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id });
        NA.refresh();
      },
    });
    const inp = el && el.querySelector('[name=bankName]');
    if (inp) { inp.setAttribute('list', 'so-banks-e'); inp.insertAdjacentHTML('afterend', datalist('so-banks-e', BANKS)); }
  }

  /**
   * An open request to release the car against the sanction letter must be closed before the order becomes Retail —
   * if the MD approved it later, a Retail order would get its car before full payment. Only its asker or the MD may
   * close it (the office server refuses anyone else), so anyone else is told who to ask ('' = nothing in the way).
   */
  function creditRequestInTheWay(o) {
    const a = NA.approvals.find('orders', o.id, 'credit');
    if (!a || a.status !== 'pending' || mayClose(a)) return '';
    return `${a.requestedBy || 'Someone'} asked to release the car before full payment. Ask ${a.requestedBy ? 'them' : 'the person who asked'} to withdraw that request, or the Managing Director to decline it — then switch to Retail.`;
  }

  /** The bank said no: the customer pays in full (Retail), or the order is cancelled. */
  function loanRejected(o) {
    if (!NA.can('orders.edit') || !isOpen(o) || paused(o)) return;
    const bk = o.bank || {};
    if (B.creditApproved(o) && !NA.isRole('owner')) { ui.toast('The Managing Director approved releasing the car against the sanction letter — ask the Managing Director to record the rejection', 'info'); return; }
    ui.formModal({
      title: 'Bank loan rejected', subtitle: esc(`${o.code} · ${bk.bankName || 'Bank'}`), size: 'sm', submitLabel: 'Continue',
      fields: [{ name: 'next', label: 'What happens now?', type: 'radio-cards', required: true, span: 2, options: [
        { value: 'retail', label: 'Customer pays in full', icon: 'wallet', hint: 'The order becomes a Retail order' },
        { value: 'cancel', label: 'Cancel the order', icon: 'x', hint: 'With a reason; a refund if money was paid' },
      ] }],
      values: { next: 'retail' },
      onSubmit: (v) => {
        if (v.next === 'cancel') { setTimeout(() => cancelOrder(NA.get('orders', o.id)), 180); return true; }
        const fresh = NA.get('orders', o.id) || o;
        if (B.creditApproved(fresh) && !NA.isRole('owner')) { ui.toast('The Managing Director approved releasing the car against the sanction letter — ask the Managing Director to record the rejection', 'error'); return false; }
        const inTheWay = creditRequestInTheWay(fresh);
        if (inTheWay) { ui.toast(inTheWay, 'error'); return false; }   // the sheet stays open: cancelling is still possible
        const me = NA.me();
        NA.update('orders', o.id, { channel: 'Retail', bank: Object.assign({}, bk, { rejected: true, rejectedAt: NA.today(), rejectedBy: me.name }) });
        // An approval to release the car against this sanction letter no longer stands (this person may close it).
        const a = NA.approvals.find('orders', o.id, 'credit');
        if (a && (a.status === 'pending' || a.status === 'approved')) NA.update('approvals', a.id, { status: 'cancelled', note: 'The bank loan was rejected' });
        NA.log(`${o.code}: ${bk.bankName || 'bank'} loan rejected — the customer pays in full (now a Retail order)`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
        syncStage(o);
        ui.toast('Switched to Retail — the customer pays in full');
        NA.refresh();
      },
    });
  }

  function editCorporate(o) {
    if (!NA.can('orders.edit') || !isOpen(o) || paused(o)) return;
    const c = o.corporate || {};
    ui.formModal({
      title: 'Company order document', subtitle: esc(`${o.code} · no booking money is needed — this document confirms the order`), size: 'sm',
      fields: [
        { name: 'docType', label: 'Document', type: 'select', placeholder: false, options: NA.FLOW.corporateDocs, required: true },
        { name: 'docRef', label: 'Document number', required: true, placeholder: 'e.g. GDL/PROC/2025/118' },
        { name: 'date', label: 'Document date', type: 'date', required: true, max: NA.today() },
        { name: 'units', label: 'Cars on this document', type: 'number', min: 1 },
      ],
      values: { docType: c.docType || NA.FLOW.corporateDocs[0], docRef: c.docRef, date: c.date || NA.today(), units: c.units || 1 },
      submitLabel: 'Save document',
      onSubmit: async (v) => {
        const units = Math.max(1, Number(v.units) || 1);
        const ref = String(v.docRef || '').trim().toLowerCase();
        const used = NA.where('orders', (x) => x.id !== o.id && x.stage !== 'cancelled' && x.corporate && String(x.corporate.docRef || '').trim().toLowerCase() === ref).length;
        if (used >= units) {
          const ok = await ui.confirm(`Document <b>${esc(v.docRef)}</b> is already on ${used} other order${used === 1 ? '' : 's'}, and it covers ${units} car${units === 1 ? '' : 's'}. Use it here too?`, { title: 'Document already used', okLabel: 'Use anyway' });
          if (!ok) return false;
        }
        const wasConfirmed = !!c.docRef;
        const changes = [];
        if (wasConfirmed) {
          if (v.docType !== c.docType) changes.push(`document ${c.docType} → ${v.docType}`);
          if (v.docRef !== c.docRef) changes.push(`number ${c.docRef} → ${v.docRef}`);
          if (v.date !== c.date) changes.push(`date ${F.date(c.date)} → ${F.date(v.date)}`);
          if (units !== (Number(c.units) || 1)) changes.push(`cars ${c.units || 1} → ${units}`);
          if (!changes.length) return true;
        }
        NA.update('orders', o.id, { corporate: Object.assign({}, c, { docType: v.docType, docRef: v.docRef, date: v.date, units }) });
        NA.log(wasConfirmed ? `${o.code}: company document changed — ${changes.join(', ')}` : `${o.code}: order confirmed by ${v.docType} ${v.docRef}`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: wasConfirmed ? 'info' : 'success' });
        syncStage(o);
        NA.refresh();
      },
    });
  }

  function giveVinSheet(o, vehicleId) {
    if (!NA.can('vin.assign')) { ui.toast('The Sales Manager or Accounts gives the VIN', 'info'); return; }
    const v = NA.vehicle(vehicleId);
    const blockers = vinBlockersFor(o);
    if (blockers.length) { ui.toast(blockers[0], 'error'); return; }
    if (!v || v.status !== 'available' || carProblem(v)) { ui.toast('That car is no longer free — pick another', 'error'); NA.refresh(); return; }
    if (v.reservedFor && v.reservedFor !== o.id) { ui.toast(`This car is kept for ${(NA.get('orders', v.reservedFor) || {}).code || 'another order'}`, 'error'); return; }
    const first = firstInLine(v, o);
    const colourDiff = !!(o.color && v.color && o.color !== v.color);
    const fields = [];
    if (colourDiff) fields.push({ name: 'agreed', type: 'checkbox', span: 2, label: `Customer agreed to ${v.color} instead of ${o.color}` });
    if (first) fields.push({ name: 'reason', label: `${first.code} (${NA.customerName(first.customerId)}) was paid in full earlier, on ${F.date(paidUpOn(first))}. Why does ${o.code} get this car first?`, type: 'textarea', rows: 2, span: 2, required: true });
    ui.formModal({
      title: 'Give VIN', size: 'md', submitLabel: 'Give VIN',
      intro: `<div class="glist so-mb">
          <div class="gl-row">${swatch(v.color, true)}<span class="gl-main"><b>${esc(NA.modelName(v.modelId))} · ${esc(v.color || '')}</b><small class="mono">${esc(v.vin)}</small></span><span class="gl-value">${esc(v.location || '')}</span></div>
          <div class="gl-row"><span class="gl-main"><b>${esc(o.code)} · ${esc(NA.customerName(o.customerId))}</b><small>${B.isFullyPaid(o) ? 'Paid in full on ' + esc(F.date(paidUpOn(o))) : 'Car before full payment approved'}${o.color ? ' · ordered ' + esc(o.color) : ''}</small></span></div>
        </div>${fields.length ? '' : '<p class="muted">The car is marked sold and the order moves on to registration (BRTA).</p>'}`,
      fields,
      onSubmit: (val, el) => {
        if (colourDiff && !val.agreed) return markInvalid(el.querySelector('form'), 'agreed', `Tick that the customer agreed to ${v.color}`);
        try { giveVin(o, v, { reason: val.reason, skipped: first, colourAgreed: colourDiff }); }
        catch (e) { ui.toast(e.message, 'error'); return false; }
        ui.toast(`VIN ${v.vin} given to ${o.code} — next: registration`);
        NA.refresh();
      },
    });
  }

  /**
   * Link the car to the order with core B.assignVin: it refuses an order that already has a car or is past the VIN
   * step, and a car kept for another order; it frees the car's reservation and any other car kept for this order.
   * The checks here only put the reason in this screen's words first (and keep cars with a problem out).
   */
  function giveVin(order, vehicle, opts) {
    const o = NA.get('orders', order.id);
    const v = NA.vehicle(vehicle.id);
    if (!o) throw new Error('This order is no longer available');
    const blockers = vinBlockersFor(o);
    if (blockers.length) throw new Error(blockers[0]);
    if (!v || v.status !== 'available' || carProblem(v)) throw new Error('That car is no longer free — pick another');
    if (v.reservedFor && v.reservedFor !== o.id) throw new Error('This car is kept for another order');
    const me = NA.me();
    const fromColour = o.color;
    B.assignVin(o, v.id);
    const patch = { vinBy: me.name, vinById: me.staffId || null };
    if (fromColour && v.color && fromColour !== v.color) patch.color = v.color;
    NA.update('orders', o.id, patch);
    const fresh = NA.get('orders', o.id);
    if (patch.color) NA.log(`${o.code}: colour changed from ${fromColour} to ${v.color} — the customer agreed (confirmed by ${me.name})`, { rec: fresh, link: '#/sales/' + o.id, kind: 'warn' });
    if (opts && opts.skipped) NA.log(`VIN ${v.vin} given to ${o.code} ahead of ${opts.skipped.code}, which was paid earlier — ${opts.reason || 'no reason given'}`, { rec: fresh, link: '#/sales/' + o.id, kind: 'warn' });
    if (o.emergencyRequest) NA.update('orders', o.id, { emergencyRequest: null });
  }

  /** No car for a paid order: ask Purchasing (they check CG Runner; the Managing Director approves an emergency purchase). */
  function askEmergency(o) {
    if (!canAskEmergency(o)) { ui.toast(vinBlockersFor(o)[0] || 'Purchasing is asked once the order is paid in full', 'info'); return; }
    if (o.emergencyRequest) { ui.toast('Purchasing has already been asked', 'info'); return; }
    const em = emergencyPOs(o)[0];
    if (em) { ui.toast(`Purchasing is already buying a car for this order${em.code ? ' — ' + em.code : ''}`, 'info'); return; }
    ui.formModal({
      title: 'Ask Purchasing for a car', subtitle: esc(`${o.code} · ${NA.modelName(o.modelId)} · ${o.color || ''}`), size: 'sm', submitLabel: 'Send to Purchasing',
      intro: '<p class="muted so-mb">Purchasing checks with CG Runner. An emergency purchase costs more and is paid 100% up front, so the Managing Director approves it.</p>',
      fields: [{ name: 'note', label: 'Note for Purchasing', type: 'textarea', rows: 2, placeholder: 'e.g. The customer needs the car this week; Ski White would also do' }],
      onSubmit: (v) => {
        const me = NA.me();
        NA.update('orders', o.id, { emergencyRequest: { at: nowIso(), by: me.name, byId: me.staffId || null, note: v.note || '', color: o.color || '' } });
        NA.log(`${o.code}: Purchasing asked for an emergency car (${NA.modelName(o.modelId)}${o.color ? ', ' + o.color : ''})`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
        ui.toast('Sent to Purchasing');
        NA.refresh();
      },
    });
  }
  function withdrawEmergency(o) {
    if (!o.emergencyRequest || !(NA.can('orders.edit') || NA.can('vin.assign'))) return;
    if (emergencyPOs(o).length) { ui.toast('Purchasing has already started buying the car — ask them to cancel it', 'info'); return; }
    ui.confirm('Withdraw the request to Purchasing?', { title: 'Withdraw request', okLabel: 'Withdraw' }).then((ok) => {
      if (!ok) return;
      NA.update('orders', o.id, { emergencyRequest: null });
      NA.log(`${o.code}: request for an emergency car withdrawn`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id });
      NA.refresh();
    });
  }

  /** Step 1 of registration: filed with BRTA (date, name, insurance, the bank as co-owner on a loan). */
  function fileBrta(o) {
    if (!NA.can('orders.edit') || !isOpen(o) || paused(o)) return;
    if (!o.vehicleId) { ui.toast('Give the VIN before filing with BRTA', 'error'); return; }
    const b = o.brta || {};
    const bank = o.channel === 'Bank';
    const insurers = INSURERS.slice();
    if (b.insurer && !insurers.includes(b.insurer)) insurers.unshift(b.insurer);
    const fields = [
      { name: 'appliedDate', label: 'Filed on', type: 'date', required: true, max: NA.today() },
      { name: 'regName', label: 'In the name of', required: true },
      { name: 'insurer', label: 'Insurance company', required: true, placeholder: 'Start typing…' },
      { name: 'policyNo', label: 'Policy number', required: true, placeholder: 'e.g. GDI-MTR-25-44120' },
    ];
    if (bank) fields.push({ name: 'bankCoReg', label: `${(o.bank && o.bank.bankName) || 'The bank'} is co-owner (hypothecation)`, type: 'checkbox', span: 2 });
    const el = ui.formModal({
      title: 'Filed with BRTA', subtitle: esc(`${o.code} · VIN ${(NA.vehicle(o.vehicleId) || {}).vin || ''}`), size: 'md', fields,
      values: { appliedDate: b.appliedDate || NA.today(), regName: b.regName || NA.customerName(o.customerId), insurer: b.insurer || '', policyNo: b.policyNo || '', bankCoReg: b.appliedDate ? !!b.bankCoReg : bank },
      submitLabel: 'Save',
      onSubmit: (v, m) => {
        const form = m.querySelector('form');
        if (v.appliedDate > NA.today()) return markInvalid(form, 'appliedDate', 'The date cannot be in the future');
        if (bank && !v.bankCoReg) return markInvalid(form, 'bankCoReg', 'A car on a bank loan is registered with the bank as co-owner — tick it when done');
        const brta = Object.assign({}, b, { appliedDate: v.appliedDate, regName: v.regName, insurer: v.insurer, policyNo: v.policyNo, bankCoReg: bank ? !!v.bankCoReg : false });
        const changes = [];
        if (b.appliedDate) {
          if (v.appliedDate !== b.appliedDate) changes.push(`filed ${F.date(b.appliedDate)} → ${F.date(v.appliedDate)}`);
          if (v.regName !== b.regName) changes.push(`name ${b.regName || '—'} → ${v.regName}`);
          if (v.insurer !== b.insurer || v.policyNo !== b.policyNo) changes.push(`insurance ${b.insurer || '—'} ${b.policyNo || ''} → ${v.insurer} ${v.policyNo}`);
          if (!changes.length && brta.bankCoReg === !!b.bankCoReg) return true;
        }
        NA.update('orders', o.id, { brta });
        const fresh = NA.get('orders', o.id);
        NA.log(b.appliedDate ? `${o.code}: BRTA filing changed${changes.length ? ' — ' + changes.join(', ') : ''}` : `${o.code}: filed with BRTA on ${F.date(v.appliedDate)} in the name of ${v.regName} · insurance ${v.insurer} ${v.policyNo}`, { rec: fresh, link: '#/sales/' + o.id });
        if (v.regName.trim().toLowerCase() !== String(NA.customerName(o.customerId)).trim().toLowerCase()) NA.log(`${o.code}: registered in a different name (${v.regName}) than the customer (${NA.customerName(o.customerId)})`, { rec: fresh, link: '#/sales/' + o.id, kind: 'warn' });
        ui.toast(b.appliedDate ? 'Filing updated' : 'Filed with BRTA — next: the registration number');
        NA.refresh();
      },
    });
    const inp = el && el.querySelector('[name=insurer]');
    if (inp) { inp.setAttribute('list', 'so-insurers'); inp.insertAdjacentHTML('afterend', datalist('so-insurers', insurers)); }
  }

  /** Step 2 of registration: the number BRTA issued. Saving it moves the order to the handover; removing it moves it back. */
  function brtaNumber(o) {
    if (!NA.can('orders.edit') || !isOpen(o) || paused(o)) return;
    const b = o.brta || {};
    if (!o.vehicleId || !b.appliedDate) { ui.toast('Record the BRTA filing first', 'error'); return; }
    if (!(b.insurer && b.policyNo)) { ui.toast('Add the insurance to the filing first', 'error'); return; }
    ui.formModal({
      title: 'Registration number', subtitle: esc(`${o.code} · filed ${F.date(b.appliedDate)}`), size: 'sm',
      intro: b.regNo ? '<p class="small muted so-mb">To correct a mistake, change the number. Leave it empty to remove it — the order goes back to registration.</p>' : '',
      fields: [
        { name: 'regNo', label: 'Registration number', required: !b.regNo, placeholder: 'e.g. Dhaka Metro-Ga 47-1234' },
        { name: 'completedDate', label: 'Registered on', type: 'date', min: b.appliedDate, max: NA.today() },
      ],
      values: { regNo: b.regNo || '', completedDate: b.completedDate || NA.today() },
      submitLabel: 'Save',
      onSubmit: (v, m) => {
        const form = m.querySelector('form');
        const regNo = String(v.regNo || '').trim();
        const veh = NA.vehicle(o.vehicleId);
        if (!regNo) {
          if (!b.regNo) return markInvalid(form, 'regNo', 'Enter the registration number');
          // Removing a number: back to registration, and the car no longer carries it.
          NA.update('orders', o.id, { brta: Object.assign({}, b, { regNo: '', completedDate: null }), stage: o.stage === 'delivery' ? 'brta' : o.stage });
          if (veh && veh.regNo === b.regNo) NA.update('vehicles', veh.id, { regNo: '' });
          NA.log(`${o.code}: registration number ${b.regNo} removed — back to registration`, { rec: NA.get('orders', o.id), link: '#/sales/' + o.id, kind: 'warn' });
          ui.toast('Number removed', 'info');
          NA.refresh();
          return true;
        }
        if (!v.completedDate || v.completedDate > NA.today() || v.completedDate < b.appliedDate) return markInvalid(form, 'completedDate', 'Enter the date BRTA registered the car (after the filing date, not in the future)');
        const patch = { brta: Object.assign({}, b, { regNo, completedDate: v.completedDate }) };
        if (o.stage === 'brta') patch.stage = 'delivery';
        NA.update('orders', o.id, patch);
        if (veh) NA.update('vehicles', veh.id, { regNo });
        const fresh = NA.get('orders', o.id);
        NA.log(b.regNo ? `${o.code}: registration number ${b.regNo} → ${regNo}` : `${o.code}: registered with BRTA — ${regNo}. Ready for the handover`, { rec: fresh, link: '#/sales/' + o.id, kind: b.regNo ? 'info' : 'success' });
        ui.toast(b.regNo ? 'Number updated' : 'Registered — next: the handover');
        NA.refresh();
      },
    });
  }

  function confirmDelivery(order, root) {
    const o = NA.get('orders', order.id);
    if (!NA.can('delivery.complete')) { ui.toast('The sales team hands over the car', 'info'); return; }
    if (!o || o.stage === 'delivered') { ui.toast('This car was already handed over', 'info'); NA.refresh(); return; }
    if (!isOpen(o) || !o.vehicleId) { ui.toast('This order is not ready for the handover', 'error'); return; }
    const blockers = deliveryBlockersFor(o).concat(checklistMissing(o));
    if (blockers.length) { ui.toast(blockers[0], 'error'); return; }
    const acc = readAccessories(root) || accDraft[o.id] || null;
    const bal = B.orderBalance(o);
    const wt = warrantyTerms(o);   // no warranty yet: the model's terms, as core B.deliverOrder will write them
    const d = o.delivery || {};
    const staff = ui.opts.staff(['Sales Consultant', 'Sales Manager', 'Driver', 'Managing Director']);
    // The delivery date starts the warranty: today, or up to 3 days back (managers may go further back).
    const minDate = NA.isManager() ? null : NA.addDays(NA.today(), -3);
    ui.formModal({
      title: 'Hand over the car', subtitle: esc(`${o.code} · ${NA.customerName(o.customerId)}`), size: 'sm',
      intro: `<div class="callout callout-ok so-mb">${NA.icon('shield')}<div>The warranty starts automatically (${esc(wt.car + kmWords(wt.km))}), the sales invoice is made and the follow-up calls are planned.</div></div>`
        + (bal > 0.5 ? `<div class="callout callout-warn so-mb">${NA.icon('alert')}<div>${F.money(bal)} is still to be paid — the Managing Director approved releasing the car first.</div></div>` : ''),
      fields: [
        { name: 'date', label: 'Handover date', type: 'date', required: true, min: minDate, max: NA.today() },
        { name: 'deliveredBy', label: 'Handed over by', type: 'select', required: true, options: staff },
      ],
      values: { date: NA.today(), deliveredBy: d.deliveredBy || o.consultantId || NA.myStaffId() || '' },
      submitLabel: 'Hand over car',
      onSubmit: (v, el) => {
        const form = el.querySelector('form');
        if (v.date > NA.today()) return markInvalid(form, 'date', 'The handover date cannot be in the future');
        if (minDate && v.date < minDate) return markInvalid(form, 'date', 'An older handover date is entered by the Sales Manager');
        const fresh = NA.get('orders', o.id);
        // Someone else may have handed it over on another screen in the meantime.
        if (!fresh || fresh.stage === 'delivered') { ui.toast('This car was already handed over', 'info'); NA.refresh(); return true; }
        const still = deliveryBlockersFor(fresh).concat(checklistMissing(fresh));
        if (still.length) { ui.toast(still[0], 'error'); NA.refresh(); return true; }
        const me = NA.me();
        try {
          B.deliverOrder(fresh, Object.assign({}, fresh.delivery, acc ? { accessories: acc } : {}, { date: v.date, deliveredBy: v.deliveredBy, handedOverBy: me.name, handedOverById: me.staffId || null }));
        } catch (e) { ui.toast(e.message, 'error'); return false; }
        delete accDraft[o.id];
        const w = warrantyOf(fresh);
        ui.toast(`Handed over — warranty ${w ? w.code + ' runs until ' + F.date(w.expiry) : 'started'}`);
        NA.refresh();
      },
    });
  }

  /* ------------------------------------------------------------------------
     Route
     ------------------------------------------------------------------------ */
  NA.page({
    path: 'sales',
    title: 'Orders',
    icon: 'receipt',
    render(root, params, query) {
      ensureCss();
      if (params && params[0]) renderDetail(root, params[0]);
      else renderList(root, query || {});
    },
  });

  /* ------------------------------------------------------------------------
     Approval side effects (they run in the browser of whoever decides).
     ------------------------------------------------------------------------ */
  if (NA.approvals) {
    // Cancelling with money or a car: only happens once the Managing Director approves.
    NA.approvals.onDecide('cancel', (a, decision) => {
      if (a.refC !== 'orders' || decision !== 'approved') return;
      const o = NA.get('orders', a.refId);
      if (!o) return;
      const d = a.data || {};
      applyCancel(o, { reason: d.reason || 'Cancelled', note: d.note || '', refund: d.refund != null ? d.refund : a.value, approvedBy: a.decidedBy || NA.me().name, requestedBy: a.requestedBy });
    });
    // A decided discount or "car before full payment" can make the order ready for its VIN (or not): save the real stage.
    NA.approvals.onDecide('discount', (a) => {
      if (a.refC === 'orders') syncStage({ id: a.refId });
      if (a.refC === 'leads') NA.where('orders', (o) => o.leadId === a.refId).forEach(syncStage);
    });
    NA.approvals.onDecide('credit', (a) => { if (a.refC === 'orders') syncStage({ id: a.refId }); });
  }
})();
