/* ==========================================================================
   Demo data — a realistic month at Noor Autos so every screen has life.
   Everything is consistent with the business rules in core.js
   (e.g. a VIN is only linked to an order once it is 100% paid).
   Settings → "Start fresh" wipes this and starts with an empty system.
   ========================================================================== */
(function () {
  'use strict';
  const NA = window.NA;

  NA.seed = function (db) {
    let seedN = 7;
    const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const id = () => NA.uid();
    const T = NA.today();
    const d = (n) => NA.addDays(T, n);
    const iso = (n, h = 11) => d(n) + 'T' + String(h).padStart(2, '0') + ':15:00.000Z';
    const code = (p, pad = 4) => { db.counters[p] = (db.counters[p] || 0) + 1; return p + '-' + String(db.counters[p]).padStart(pad, '0'); };
    const add = (col, obj, daysAgo = 0) => { const r = Object.assign({ id: id(), createdAt: iso(-daysAgo), updatedAt: iso(-daysAgo) }, obj); db[col].push(r); return r; };
    const hist = (...items) => items.map(([n, text]) => ({ at: iso(-n), text, by: 'Admin' }));

    /* ---------- Models (prices editable in Settings) ---------- */
    const M = {};
    [
      ['atto2', 'BYD ATTO 2', 'Dynamic', 3790000, 'SUV', ['Ski White', 'Cosmos Black', 'Climbing Grey', 'Space Blue']],
      ['dolphin', 'BYD DOLPHIN', 'Extended Range', 4190000, 'Hatchback', ['Ski White', 'Coral Pink', 'Surf Blue', 'Urban Grey']],
      ['atto3', 'BYD ATTO 3', 'Extended Range', 5590000, 'SUV', ['Ski White', 'Boulder Grey', 'Surf Blue', 'Parkour Red', 'Cosmos Black']],
      ['m6', 'BYD M6', 'Superior', 5490000, 'MPV', ['Crystal White', 'Quartz Blue', 'Cosmos Black']],
      ['seal', 'BYD SEAL', 'Premium RWD', 7990000, 'Sedan', ['Arctic Blue', 'Aurora White', 'Cosmos Black', 'Shadow Green']],
      ['sealion7', 'BYD SEALION 7', 'Performance AWD', 9290000, 'SUV', ['Shark Grey', 'Atlantis Grey', 'Cosmos Black', 'Arctic Blue']],
    ].forEach(([k, name, variant, price, body, colors]) => {
      M[k] = add('models', { name, variant, body, price, cost: Math.round(price * 0.8 / 1000) * 1000, colors, warrantyMonths: 72, warrantyKm: 150000, batteryWarrantyMonths: 96, active: true, vinCode: k.toUpperCase().slice(0, 3) }, 200);
    });
    const models = Object.values(M);

    /* ---------- Staff ---------- */
    const S = {};
    [
      ['md', 'Shahnoor Sanjid', 'Managing Director', 0],
      ['sm', 'Tanvir Rahman', 'Sales Manager', 150000],
      ['c1', 'Nusrat Jahan', 'Sales Consultant', 65000],
      ['c2', 'Arif Hossain', 'Sales Consultant', 62000],
      ['c3', 'Farhana Akter', 'Sales Consultant', 60000],
      ['sa', 'Mahmudul Hasan', 'Service Advisor', 55000],
      ['t1', 'Rafiqul Islam', 'Technician', 45000],
      ['t2', 'Sohel Rana', 'Technician', 42000],
      ['ac', 'Kamrul Ahsan', 'Accounts', 70000],
      ['pr', 'Imran Chowdhury', 'Procurement', 75000],
      ['hr', 'Sadia Islam', 'Admin & HR', 58000],
      ['dr', 'Jamal Uddin', 'Driver', 25000],
    ].forEach(([k, name, role, salary], i) => {
      S[k] = add('staff', { name, role, salary, phone: '01' + (7 + (i % 3)) + String(10000000 + Math.floor(rnd() * 89999999)).slice(0, 8), joinDate: d(-400 - i * 37), active: true, location: ['t1', 't2', 'sa'].includes(k) ? 'Gulshan Warehouse' : 'Uttara Showroom' }, 400);
    });
    const consultants = [S.c1, S.c2, S.c3];

    /* ---------- Vendors ---------- */
    const V_BYD = add('vendors', { name: 'BYD Auto Industry Co., Ltd. (Export)', type: 'Principal', country: 'China', contact: 'export-asia@byd.example', terms: '30% advance with PO · 70% per-unit release' }, 300);
    const V_CG = add('vendors', { name: 'CG Runner', type: 'Emergency supplier', country: 'Bangladesh', contact: '+880 1711-000000', terms: '100% payment on VIN confirmation' }, 300);

    /* ---------- Customers ---------- */
    const people = [
      ['Md. Rezaul Karim', 'Individual'], ['Ayesha Siddiqua', 'Individual'], ['Tahmid Chowdhury', 'Individual'], ['Nafisa Rahman', 'Individual'],
      ['Shafiqul Alam', 'Individual'], ['Fahim Ahmed', 'Individual'], ['Sharmin Sultana', 'Individual'], ['Zahid Hasan', 'Individual'],
      ['Mehedi Hasan', 'Individual'], ['Rumana Afroz', 'Individual'], ['Kazi Anwar', 'Individual'], ['Labiba Noor', 'Individual'],
      ['Sabbir Hossain', 'Individual'], ['Tasnim Ara', 'Individual'],
      ['Green Delta Logistics Ltd', 'Corporate'], ['Summit Power Services', 'Corporate'], ['BRAC Enterprises', 'Corporate'],
    ];
    const areas = ['Gulshan 2, Dhaka', 'Banani, Dhaka', 'Uttara Sector 7, Dhaka', 'Dhanmondi 27, Dhaka', 'Bashundhara R/A, Dhaka', 'Mirpur DOHS, Dhaka', 'Baridhara, Dhaka', 'Agrabad, Chattogram'];
    const mobile = () => '01' + pick(['7', '8', '9', '3', '5']) + String(Math.floor(10000000 + rnd() * 89999999));
    const C = people.map(([name, type], i) => add('customers', {
      name, type, mobile: mobile(), email: name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@example.com',
      address: pick(areas), company: type === 'Corporate' ? name : '', contactPerson: type === 'Corporate' ? pick(['Mr. Habib', 'Ms. Rina', 'Mr. Sajjad']) : '',
      nid: type === 'Individual' ? String(1990000000 + Math.floor(rnd() * 9999999)) : '', tin: type === 'Corporate' ? String(100000000000 + i) : '',
    }, 90 - i * 3));

    /* ---------- Vehicles & purchase orders ---------- */
    let vinSeq = 31842;
    // 17 characters, never I, O or Q: maker (LGX) · model · check digit · year (S = 2025) · plant · serial.
    const vinSafe = (t) => String(t).toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '9');
    const vin = (m) => 'LGX' + pick(['C', 'D', 'E']) + vinSafe(m.vinCode.slice(0, 2)) + 'B' + pick(['0', '1', '3', '5']) + pick(['2', '4', '7', 'X']) + 'S' + '0' + String(vinSeq++).padStart(6, '0');
    const motor = () => 'TZ' + Math.floor(100 + rnd() * 899) + 'XSE' + Math.floor(1000000 + rnd() * 8999999);

    function makeVehicle(m, color, status, extra = {}) {
      return add('vehicles', Object.assign({
        vin: vin(m), motorNo: motor(), modelId: m.id, color, year: 2025, status,
        location: status === 'in_transit' ? 'In transit' : pick(NA.defaultSettings().locations), cost: m.cost,
        arrivedAt: status === 'in_transit' ? null : d(-Math.floor(10 + rnd() * 40)),
        pdi: status === 'in_transit' || status === 'pdi' ? null : { date: d(-Math.floor(5 + rnd() * 30)), vinVerified: true, damageCheck: 'OK', batterySoh: 100, notes: 'All OK', by: S.t1.id },
        km: Math.floor(rnd() * 25),
      }, extra), 60);
    }

    // Closed historical PO (all units received)
    const po1 = add('purchaseOrders', {
      code: code('PO'), type: 'standard', vendorId: V_BYD.id, date: d(-120), proformaRef: 'PI-BYD-25-0611', stage: 'closed', currency: 'BDT',
      lots: [{ lotNo: 'LOT-25-07A', qty: 10, status: 'Delivered to Warehouse', eta: d(-70), shipment: 'MV Ocean Pride' }],
      units: [], notes: 'Q3 replenishment', history: hist([120, 'PO raised & 30% advance paid'], [100, 'Lot LOT-25-07A allocated'], [75, '70% releases paid, VINs received'], [68, 'All units PDI-passed and warehoused']),
    }, 120);
    // Received stock from po1
    const stockPlan = [
      [M.atto3, 'Ski White'], [M.atto3, 'Surf Blue'], [M.atto3, 'Boulder Grey'], [M.dolphin, 'Ski White'], [M.dolphin, 'Surf Blue'],
      [M.seal, 'Arctic Blue'], [M.seal, 'Aurora White'], [M.sealion7, 'Shark Grey'], [M.m6, 'Crystal White'], [M.atto2, 'Space Blue'],
    ];
    const stock = stockPlan.map(([m, c]) => {
      const v = makeVehicle(m, c, 'available', { poId: po1.id, lotNo: 'LOT-25-07A' });
      po1.units.push({ id: id(), modelId: m.id, color: c, unitCost: m.cost, lotNo: 'LOT-25-07A', vin: v.vin, vehicleId: v.id, releasePaidAt: d(-76), releaseRef: 'TT-' + Math.floor(rnd() * 99999), receivedAt: d(-68) });
      return v;
    });
    add('vendorPayments', { poId: po1.id, vendorId: V_BYD.id, date: d(-120), amount: Math.round(NA.biz.poTotal(po1) * 0.3), kind: 'Advance 30%', ref: 'LC-AD-8812', method: 'TT / LC' }, 120);
    po1.units.forEach((u) => add('vendorPayments', { poId: po1.id, vendorId: V_BYD.id, date: d(-76), amount: Math.round(u.unitCost * 0.7), kind: 'Release 70%', ref: u.releaseRef, method: 'TT', vin: u.vin }, 76));

    // Older delivered stock (for delivered orders & service history)
    const deliveredStock = [
      [M.atto3, 'Parkour Red'], [M.dolphin, 'Coral Pink'], [M.seal, 'Cosmos Black'], [M.atto3, 'Cosmos Black'], [M.m6, 'Quartz Blue'], [M.atto2, 'Ski White'],
    ].map(([m, c]) => makeVehicle(m, c, 'delivered', { location: 'Customer' }));

    // PO in releasing stage: lot allocated, some units released (VIN received, awaiting PDI), some pending release
    const po2 = add('purchaseOrders', {
      code: code('PO'), type: 'standard', vendorId: V_BYD.id, date: d(-45), proformaRef: 'PI-BYD-25-0904', stage: 'releasing', currency: 'BDT',
      lots: [{ lotNo: 'LOT-25-10B', qty: 6, status: 'At Chattogram Port', eta: d(4), shipment: 'MV Asian Star' }],
      units: [], notes: 'Festive season demand (Atto 3 / Sealion 7)', history: hist([45, 'PO raised & 30% advance paid'], [30, 'Lot LOT-25-10B allocated by BYD'], [6, 'First 3 units released, VINs received']),
    }, 45);
    [[M.atto3, 'Ski White'], [M.atto3, 'Cosmos Black'], [M.sealion7, 'Cosmos Black'], [M.sealion7, 'Arctic Blue'], [M.dolphin, 'Urban Grey'], [M.seal, 'Shadow Green']].forEach(([m, c], i) => {
      const u = { id: id(), modelId: m.id, color: c, unitCost: m.cost, lotNo: 'LOT-25-10B', vin: null, vehicleId: null, releasePaidAt: null, releaseRef: '' };
      if (i < 3) {
        const v = makeVehicle(m, c, i === 0 ? 'pdi' : 'in_transit', { poId: po2.id, lotNo: 'LOT-25-10B', location: i === 0 ? 'Gulshan Warehouse' : 'In transit', arrivedAt: i === 0 ? d(-1) : null });
        Object.assign(u, { vin: v.vin, vehicleId: v.id, releasePaidAt: d(-6), releaseRef: 'TT-' + Math.floor(10000 + rnd() * 89999) });
        add('vendorPayments', { poId: po2.id, vendorId: V_BYD.id, date: d(-6), amount: Math.round(m.cost * 0.7), kind: 'Release 70%', ref: u.releaseRef, method: 'TT', vin: v.vin }, 6);
      }
      po2.units.push(u);
    });
    add('vendorPayments', { poId: po2.id, vendorId: V_BYD.id, date: d(-45), amount: Math.round(NA.biz.poTotal(po2) * 0.3), kind: 'Advance 30%', ref: 'LC-AD-9120', method: 'TT / LC' }, 45);

    // New PO, just raised
    const po3 = add('purchaseOrders', {
      code: code('PO'), type: 'standard', vendorId: V_BYD.id, date: d(-3), proformaRef: 'PI-BYD-25-1027', stage: 'po', currency: 'BDT', lots: [],
      units: [[M.atto2, 'Ski White'], [M.atto2, 'Space Blue'], [M.atto2, 'Climbing Grey'], [M.m6, 'Cosmos Black']].map(([m, c]) => ({ id: id(), modelId: m.id, color: c, unitCost: m.cost, lotNo: '', vin: null, vehicleId: null, releasePaidAt: null })),
      notes: 'Atto 2 launch stock', history: hist([3, 'PO raised from demand plan']),
    }, 3);
    add('vendorPayments', { poId: po3.id, vendorId: V_BYD.id, date: d(-2), amount: Math.round(NA.biz.poTotal(po3) * 0.3), kind: 'Advance 30%', ref: 'LC-AD-9311', method: 'TT / LC' }, 2);

    // Emergency PO via CG Runner (VIN confirmed, awaiting 100% payment)
    add('purchaseOrders', {
      code: code('PO'), type: 'emergency', vendorId: V_CG.id, date: d(-2), stage: 'confirmed', currency: 'BDT', lots: [],
      units: [{ id: id(), modelId: M.seal.id, color: 'Aurora White', unitCost: Math.round(M.seal.cost * 1.04), vin: 'LGXCSEB3S0' + String(vinSeq++).padStart(7, '0'), vehicleId: null, releasePaidAt: null }],
      availabilityNote: 'CG Runner confirmed 1 × Seal Aurora White in Tejgaon yard', forOrderNote: 'Urgent: corporate client wants Seal White this week',
      history: hist([2, 'Availability confirmed with CG Runner'], [1, 'VIN confirmed — emergency PO raised']),
    }, 2);

    /* ---------- Leads (Stage 1) ---------- */
    const leadData = [
      // name, stage, model, source, daysAgo, consultant
      ['Rakib Hasan', 'new', M.atto3, 'Facebook Ads', 0, 0], ['Mitu Akter', 'new', M.dolphin, 'WhatsApp', 0, 1], ['Hasibul Islam', 'new', M.sealion7, 'Google Ads', 1, 2],
      ['Priya Saha', 'new', M.atto2, 'Website', 1, 0], ['Omar Faruk', 'qualified', M.seal, 'Referral', 3, 1], ['Nadia Islam', 'qualified', M.atto3, 'Facebook Ads', 4, 2],
      ['Jubayer Ahmed', 'qualified', M.m6, 'Walk-in', 5, 0], ['Tanjila Haque', 'engaged', M.dolphin, 'Event', 6, 1], ['Abrar Kabir', 'engaged', M.sealion7, 'Google Ads', 7, 2],
      ['Shirin Sultana', 'engaged', M.atto3, 'Dealer / Partner', 8, 0], ['Ridwan Hossain', 'visit', M.seal, 'Walk-in', 9, 1], ['Moumita Das', 'visit', M.atto2, 'Facebook Ads', 10, 2],
      ['Asif Iqbal', 'testdrive', M.atto3, 'Referral', 11, 0], ['Sumaiya Khan', 'testdrive', M.sealion7, 'Website', 12, 1],
      ['Rashed Mahmud', 'opportunity', M.seal, 'Corporate', 13, 2], ['Farzana Yasmin', 'opportunity', M.dolphin, 'Walk-in', 14, 0], ['Navana Pharma Ltd', 'opportunity', M.m6, 'Corporate', 15, 1],
      ['Saiful Islam', 'lost', M.atto3, 'Facebook Ads', 20, 2],
    ];
    const order = ['new', 'qualified', 'engaged', 'visit', 'testdrive', 'opportunity'];
    leadData.forEach(([name, stage, m, source, ago, ci]) => {
      const idx = order.indexOf(stage);
      const fin = source === 'Corporate' || name.includes('Ltd') ? 'Corporate' : pick(['Self', 'Self', 'Bank']);
      const l = {
        code: code('LD'), name, mobile: mobile(), email: '', source, modelId: m.id, stage, consultantId: consultants[ci].id,
        budget: idx >= 1 || stage === 'lost' ? Math.round(m.price / 100000) * 100000 + pick([0, 200000, -200000]) : '', financing: idx >= 1 ? fin : '',
        timeline: idx >= 1 ? pick(['Within 2 weeks', 'This month', '1–3 months']) : '', engagements: [], visit: null, testDrive: null, quotation: null,
        nextFollowUp: d(Math.floor(rnd() * 4) - 1), notes: '', company: fin === 'Corporate' ? name : '',
        history: hist([ago, 'Lead created from ' + source]),
      };
      if (idx >= 2) l.engagements = [{ date: d(-ago + 1), type: pick(['Call', 'WhatsApp']), note: 'Shared brochure & price list' }, { date: d(-ago + 2), type: 'Brochure', note: NA.modelName(m.id) + ' brochure sent' }];
      if (idx >= 3) l.visit = { date: d(-ago + 3), consultantId: consultants[ci].id, modelsViewed: [m.id, pick(models).id] };
      if (idx >= 4) l.testDrive = { date: d(-ago + 4), formSigned: true, licenceVerified: true, licenceNo: 'DK' + Math.floor(1000000 + rnd() * 8999999), vehicle: NA.modelName(m.id) + ' demo' };
      if (idx >= 5) l.quotation = { date: d(-ago + 5), price: m.price, discount: pick([0, 50000, 100000]), channel: fin === 'Corporate' ? 'Corporate' : fin === 'Bank' ? 'Bank' : 'Retail', validUntil: d(-ago + 20), notes: fin === 'Corporate' ? 'Fleet proposal for 3 units' : 'Includes free 1st year service' };
      if (stage === 'lost') l.lostReason = 'Budget — chose a cheaper ICE car';
      add('leads', l, ago);
    });

    /* ---------- Sales orders (Stage 2) ---------- */
    const MR = () => code('MR', 5);
    function pay(o, cust, daysAgo, amount, method, ref) {
      add('payments', { receiptNo: MR(), orderId: o.id, customerId: cust.id, date: d(-daysAgo), amount, method, ref: ref || '', note: '' }, daysAgo);
    }
    function mkOrder(cust, m, color, channel, stage, ago, ci, extra = {}) {
      const discount = pick([0, 0, 50000, 100000]);
      const o = add('orders', Object.assign({
        code: code('SO'), customerId: cust.id, modelId: m.id, color, channel, stage, price: m.price, discount, consultantId: consultants[ci].id,
        booking: { date: d(-ago), receiptNo: '', demoVin: 'DEMO-' + m.vinCode + '-01' }, bank: null, corporate: null, vehicleId: null,
        brta: null, delivery: null, expectedDelivery: d(-ago + 21), history: hist([ago, 'Order booked']),
      }, extra), ago);
      // lead that became this order
      add('leads', { code: code('LD'), name: cust.name, mobile: cust.mobile, source: pick(NA.FLOW.leadSources), modelId: m.id, stage: 'won', consultantId: consultants[ci].id, orderId: o.id, customerId: cust.id, financing: channel === 'Retail' ? 'Self' : channel, history: hist([ago + 10, 'Lead created'], [ago, 'Converted to order ' + o.code]) }, ago + 10);
      return o;
    }
    const net = (o) => o.price - o.discount;

    // 1. booking (retail) — booking money only
    let o = mkOrder(C[0], M.atto3, 'Surf Blue', 'Retail', 'booking', 1, 0);
    pay(o, C[0], 1, 500000, 'Cheque', 'DBBL-883421'); o.stage = 'payment';
    // 2. booking corporate (PO letter, no booking money)
    o = mkOrder(C[14], M.m6, 'Crystal White', 'Corporate', 'booking', 2, 1, { corporate: { docType: 'Purchase Order', docRef: 'GDL/PROC/2025/118', date: d(-2), units: 1, creditApproved: false } });
    // 3. payment in progress — instalments
    o = mkOrder(C[1], M.dolphin, 'Ski White', 'Retail', 'payment', 9, 2);
    pay(o, C[1], 9, 500000, 'Cash'); pay(o, C[1], 5, 1500000, 'RTGS', 'RTGS-CITY-77812');
    // 4. bank finance in progress
    o = mkOrder(C[2], M.seal, 'Arctic Blue', 'Bank', 'payment', 12, 0, {
      bank: { bankName: 'City Bank PLC', loanAmount: 5000000, branch: 'Gulshan Avenue', steps: { application: d(-11), approval: d(-6), sanction: d(-3), documents: null, disbursement: null } },
    });
    pay(o, C[2], 12, 2990000 - o.discount, 'Pay Order', 'PO-EBL-55102');
    // 5. full payment — ready for VIN assignment (stock exists)
    o = mkOrder(C[3], M.atto3, 'Ski White', 'Retail', 'vin', 14, 1);
    pay(o, C[3], 14, 1000000, 'Cheque', 'BRAC-112098'); pay(o, C[3], 4, net(o) - 1000000, 'RTGS', 'RTGS-BRAC-99011');
    // 6. BRTA registration in progress — VIN assigned
    o = mkOrder(C[4], M.sealion7, 'Shark Grey', 'Retail', 'brta', 18, 2, { vinAssignedAt: d(-6) });
    pay(o, C[4], 18, 2000000, 'Cheque', 'SCB-77123'); pay(o, C[4], 7, net(o) - 2000000, 'RTGS', 'RTGS-SCB-1182');
    let v = stock.find((x) => x.modelId === M.sealion7.id); v.status = 'allocated'; v.orderId = o.id; v.customerId = C[4].id; o.vehicleId = v.id;
    o.brta = { appliedDate: d(-5), insurer: 'Green Delta Insurance', policyNo: 'GDI-MTR-25-44120', regNo: '', bankCoReg: false, completedDate: null };
    // 7. BRTA done, ready for delivery (bank financed)
    o = mkOrder(C[5], M.atto3, 'Boulder Grey', 'Bank', 'delivery', 25, 0, { vinAssignedAt: d(-10),
      bank: { bankName: 'Eastern Bank PLC', loanAmount: 3500000, branch: 'Uttara', steps: { application: d(-24), approval: d(-20), sanction: d(-17), documents: d(-14), disbursement: d(-11) } } });
    pay(o, C[5], 25, net(o) - 3500000, 'Pay Order', 'PO-EBL-55002'); pay(o, C[5], 11, 3500000, 'Bank Disbursement', 'EBL-DISB-7781');
    v = stock.find((x) => x.modelId === M.atto3.id && x.color === 'Boulder Grey'); v.status = 'allocated'; v.orderId = o.id; v.customerId = C[5].id; o.vehicleId = v.id;
    o.brta = { appliedDate: d(-9), insurer: 'Pragati Insurance', policyNo: 'PIL-25-88213', regNo: 'Dhaka Metro-Ga 47-' + Math.floor(1000 + rnd() * 8999), bankCoReg: true, completedDate: d(-2) };
    o.delivery = { pdiDone: true, handoverForm: false, signedAck: false, date: null };

    // 8–13. delivered orders (feed warranties & service)
    const deliveredSpec = [[C[6], 'Retail', 70], [C[7], 'Retail', 62], [C[8], 'Bank', 48], [C[15], 'Corporate', 24], [C[9], 'Retail', 9], [C[10], 'Retail', 210]];
    deliveredStock.forEach((veh, i) => {
      const [cust, channel, ago] = deliveredSpec[i];
      const m = NA.get('models', veh.modelId) || models.find((x) => x.id === veh.modelId);
      const ord = mkOrder(cust, m, veh.color, channel, 'delivered', ago + 20, i % 3, {
        corporate: channel === 'Corporate' ? { docType: 'Award Letter', docRef: 'SPS/ADM/AW/2025/07', date: d(-ago - 20), units: 1, creditApproved: true } : null,
        bank: channel === 'Bank' ? { bankName: 'BRAC Bank PLC', loanAmount: 2500000, branch: 'Banani', steps: { application: d(-ago - 18), approval: d(-ago - 14), sanction: d(-ago - 12), documents: d(-ago - 9), disbursement: d(-ago - 6) } } : null,
        vinAssignedAt: d(-ago - 5), deliveredAt: d(-ago),
      });
      pay(ord, cust, ago + 20, 500000, 'Cheque', 'CHQ-' + Math.floor(rnd() * 99999));
      pay(ord, cust, ago + 6, net(ord) - 500000, channel === 'Bank' ? 'Bank Disbursement' : 'RTGS', 'RTGS-' + Math.floor(rnd() * 99999));
      const regNo = 'Dhaka Metro-' + pick(['Ga', 'Gha', 'Cha']) + ' ' + Math.floor(11 + rnd() * 40) + '-' + Math.floor(1000 + rnd() * 8999);
      ord.vehicleId = veh.id; veh.orderId = ord.id; veh.customerId = cust.id; veh.regNo = regNo; veh.deliveredAt = d(-ago); veh.km = Math.floor(ago * 45);
      ord.brta = { appliedDate: d(-ago - 4), insurer: 'Green Delta Insurance', policyNo: 'GDI-' + Math.floor(rnd() * 999999), regNo, bankCoReg: channel === 'Bank', completedDate: d(-ago - 1) };
      ord.delivery = { pdiDone: true, handoverForm: true, signedAck: true, date: d(-ago), deliveredBy: S.dr.id };
      ord.history.unshift({ at: iso(-ago), text: 'Delivered — warranty activated', by: 'Admin' });
      add('warranties', { code: code('WR'), orderId: ord.id, vehicleId: veh.id, customerId: cust.id, modelId: m.id, vin: veh.vin, regNo, start: d(-ago),
        expiry: NA.addMonths(d(-ago), m.warrantyMonths), batteryExpiry: NA.addMonths(d(-ago), m.batteryWarrantyMonths), kmLimit: m.warrantyKm, status: 'active' }, ago);
      const base = Math.round(net(ord) / 1.15);
      add('invoices', { no: code('INV', 5), kind: 'vehicle', refId: ord.id, customerId: cust.id, date: d(-ago), lines: [{ desc: NA.modelName(m.id) + ' — VIN ' + veh.vin, qty: 1, rate: base }], subtotal: base, vat: net(ord) - base, total: net(ord), paid: net(ord), billing: 'paid', costCentre: 'Showroom' }, ago);
      add('followUps', { customerId: cust.id, vehicleId: veh.id, due: d(-ago + 3), type: 'Satisfaction Call', status: 'done', rating: pick([4, 5, 5]), notes: 'Happy with the car & handover', doneAt: d(-ago + 3) }, ago);
      add('followUps', { customerId: cust.id, vehicleId: veh.id, due: NA.addMonths(d(-ago), 3), type: 'Service Reminder', status: 'pending', notes: 'First free service' }, ago);
    });

    /* ---------- Spare parts ---------- */
    const P = {};
    [
      ['cabin', 'BYD-CF-1001', 'Cabin air filter (PM2.5)', null, 26, 10, 1800, 2900],
      ['wiper', 'BYD-WB-2210', 'Wiper blade set', null, 14, 8, 1500, 2600],
      ['brakefl', 'BYD-BF-0400', 'Brake fluid DOT4 (1L)', null, 18, 6, 900, 1600],
      ['coolant', 'BYD-CL-0310', 'Battery coolant (4L)', null, 4, 6, 3800, 6200],
      ['pads', 'BYD-BP-3310', 'Front brake pads — Atto 3', [M.atto3.id], 6, 4, 6500, 11500],
      ['padsSeal', 'BYD-BP-3501', 'Front brake pads — Seal', [M.seal.id], 2, 3, 9800, 16500],
      ['tyre', 'BYD-TY-2155', 'Tyre 215/55 R18 (Atto 3)', [M.atto3.id], 12, 8, 14500, 21000],
      ['tyreD', 'BYD-TY-2055', 'Tyre 205/55 R16 (Dolphin)', [M.dolphin.id], 9, 8, 11000, 16500],
      ['12v', 'BYD-LB-12V', '12V auxiliary battery', null, 3, 4, 13500, 21500],
      ['mirror', 'BYD-MR-L330', 'Door mirror glass LH — Atto 3', [M.atto3.id], 2, 2, 5200, 8900],
      ['charger', 'BYD-CH-7KW', '7 kW wall-box charger', null, 7, 3, 72000, 115000],
      ['cable', 'BYD-CC-T2', 'Portable charging cable (Type 2)', null, 5, 3, 21000, 34000],
      ['bumper', 'BYD-BM-D101', 'Front bumper — Dolphin', [M.dolphin.id], 1, 1, 38000, 62000],
      ['gear', 'BYD-RO-2001', 'Reduction gear oil (1L)', null, 20, 10, 1400, 2400],
    ].forEach(([k, sku, name, compat, onHand, reorderLevel, cost, price]) => {
      P[k] = add('parts', { sku, name, compatible: compat || [], onHand, reserved: 0, reorderLevel, cost, price, location: 'Gulshan Warehouse', bin: 'R' + Math.floor(1 + rnd() * 9) + '-S' + Math.floor(1 + rnd() * 5) }, 150);
    });

    /* ---------- Service bookings & job cards ---------- */
    const custVehicles = deliveredStock.map((veh) => ({ veh, cust: C.find((c) => c.id === veh.customerId) }));
    function job(cv, opts) {
      const jc = add('jobCards', Object.assign({
        code: code('JC'), customerId: cv.cust.id, vehicleId: cv.veh.id, technicianId: pick([S.t1, S.t2]).id, advisorId: S.sa.id,
        parts: [], labourHours: 1, labourRate: 2500, billing: 'paid', status: 'open', openedAt: d(-1), odometer: cv.veh.km,
        history: hist([1, 'Job card opened']),
      }, opts), opts.ago || 1);
      return jc;
    }
    // Completed + invoiced paid service
    const jc1 = job(custVehicles[0], { ago: 20, openedAt: d(-20), completedAt: d(-20), status: 'invoiced', complaint: 'First free service (5,000 km)', diagnosis: 'Routine inspection, cabin filter replaced', billing: 'paid', labourHours: 1.5,
      parts: [{ partId: P.cabin.id, name: P.cabin.name, qty: 1, unitPrice: P.cabin.price, consumed: true }] });
    // Completed warranty repair
    const jc2 = job(custVehicles[2], { ago: 8, openedAt: d(-8), completedAt: d(-7), status: 'invoiced', complaint: 'Infotainment screen rebooting intermittently', diagnosis: 'Software issue — OTA firmware reflashed under warranty', billing: 'warranty', labourHours: 2, parts: [] });
    // In workshop — warranty
    const jc3 = job(custVehicles[1], { ago: 1, status: 'in_progress', complaint: 'Wipers judder and leave streaks', diagnosis: 'Wiper blade rubber defective — warranty replacement', billing: 'warranty', labourHours: 1,
      parts: [{ partId: P.wiper.id, name: P.wiper.name, qty: 1, unitPrice: P.wiper.price, consumed: false }] });
    P.wiper.reserved += 1;
    // Open — paid
    const jc4 = job(custVehicles[5], { ago: 0, openedAt: d(0), status: 'open', complaint: '12V battery warning, brake pads squeal', diagnosis: '', billing: 'paid', labourHours: 2.5,
      parts: [{ partId: P['12v'].id, name: P['12v'].name, qty: 1, unitPrice: P['12v'].price, consumed: false }, { partId: P.pads.id, name: P.pads.name, qty: 1, unitPrice: P.pads.price, consumed: false }] });
    P['12v'].reserved += 1; P.pads.reserved += 1;
    [jc1, jc2].forEach((jc) => {
      const t = NA.biz.jobTotals(jc);
      const inv = add('invoices', { no: code('INV', 5), kind: 'service', refId: jc.id, customerId: jc.customerId, date: jc.completedAt,
        lines: [...jc.parts.map((p) => ({ desc: p.name, qty: p.qty, rate: p.unitPrice })), { desc: 'Labour ' + jc.labourHours + ' h', qty: jc.labourHours, rate: jc.labourRate }],
        subtotal: t.subtotal, vat: t.vat, total: t.total, paid: t.total, billing: jc.billing, costCentre: 'Workshop' }, 7);
      jc.invoiceId = inv.id;
    });
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[0].cust.id, vehicleId: custVehicles[0].veh.id, date: d(-20), time: '10:00', type: 'Periodic Maintenance', channel: 'Phone', status: 'completed', jobCardId: jc1.id, notes: 'First free service' }, 22);
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[2].cust.id, vehicleId: custVehicles[2].veh.id, date: d(-8), time: '11:30', type: 'Warranty Repair', channel: 'WhatsApp', status: 'completed', jobCardId: jc2.id, notes: 'Screen reboots' }, 9);
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[1].cust.id, vehicleId: custVehicles[1].veh.id, date: d(-1), time: '09:30', type: 'Warranty Repair', channel: 'Website', status: 'in_workshop', jobCardId: jc3.id, notes: 'Wiper judder' }, 2);
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[5].cust.id, vehicleId: custVehicles[5].veh.id, date: d(0), time: '12:00', type: 'General Repair', channel: 'Phone', status: 'in_workshop', jobCardId: jc4.id, notes: '12V warning' }, 1);
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[3].cust.id, vehicleId: custVehicles[3].veh.id, date: d(1), time: '10:30', type: 'Periodic Maintenance', channel: 'WhatsApp', status: 'booked', jobCardId: null, notes: 'Fleet car — 10,000 km service' }, 0);
    add('serviceBookings', { code: code('SB'), customerId: custVehicles[4].cust.id, vehicleId: custVehicles[4].veh.id, date: d(2), time: '15:00', type: 'Battery Health Check', channel: 'Website', status: 'booked', jobCardId: null, notes: '' }, 0);
    add('followUps', { customerId: custVehicles[0].cust.id, vehicleId: custVehicles[0].veh.id, jobCardId: jc1.id, due: d(-17), type: 'Satisfaction Call', status: 'done', rating: 5, notes: 'Very satisfied with service', doneAt: d(-17) }, 17);
    add('followUps', { customerId: custVehicles[2].cust.id, vehicleId: custVehicles[2].veh.id, jobCardId: jc2.id, due: d(-4), type: 'Satisfaction Call', status: 'pending', notes: 'After warranty repair' }, 7);
    add('followUps', { customerId: custVehicles[5].cust.id, vehicleId: custVehicles[5].veh.id, due: d(5), type: 'Insurance Renewal', status: 'pending', notes: 'Policy renews next week' }, 3);

    /* ---------- Expenses (cost centres) ---------- */
    for (let mth = 0; mth < 4; mth++) {
      const base = -mth * 30 - 2;
      [['Rent', 'Showroom', 650000], ['Rent', 'Warehouse', 280000], ['Utilities', 'Showroom', 85000], ['Utilities', 'Workshop', 42000],
       ['Marketing — Facebook/Google Ads', 'Marketing', 180000 + mth * 15000], ['Salaries', 'Administration', 1160000], ['Port & clearing (C&F)', 'Warehouse', mth === 2 ? 920000 : 0],
       ['Workshop tools & consumables', 'Workshop', 38000], ['Event — EV test-drive day', 'Marketing', mth === 1 ? 240000 : 0]].forEach(([category, costCentre, amount]) => {
        if (amount) add('expenses', { date: d(base), category, costCentre, amount, vatPaid: category === 'Rent' ? Math.round(amount * 0.15) : 0, note: '', ref: 'EXP-' + Math.floor(rnd() * 99999) }, -base);
      });
    }

    /* ---------- HR: attendance (last 10 working days), assets, compliance ---------- */
    for (let i = 0; i < 14; i++) {
      const day = d(-i); const dow = new Date(day + 'T00:00:00').getDay();
      if (dow === 5) continue; // Friday weekly holiday
      db.staff.forEach((s) => {
        const r = rnd();
        add('attendance', { staffId: s.id, date: day, status: r < 0.86 ? 'Present' : r < 0.93 ? 'Late' : r < 0.97 ? 'Leave' : 'Absent', inTime: r < 0.86 ? '09:0' + Math.floor(rnd() * 9) : r < 0.93 ? '09:4' + Math.floor(rnd() * 9) : '' }, i);
      });
    }
    [
      ['BYD Atto 3 — Demo / test-drive car', 'Vehicle', 'Uttara Showroom', 4500000, -300, S.c1.id],
      ['BYD Seal — Demo car', 'Vehicle', 'Uttara Showroom', 6400000, -200, S.c2.id],
      ['Diagnostic scanner (BYD VDS)', 'Workshop equipment', 'Gulshan Warehouse', 850000, -280, S.t1.id],
      ['2-post vehicle lift ×2', 'Workshop equipment', 'Gulshan Warehouse', 1200000, -350, S.sa.id],
      ['DC fast charger 60 kW', 'Charging', 'Uttara Showroom', 3200000, -260, null],
      ['Office laptops ×8', 'IT', 'Uttara Showroom', 960000, -380, S.hr.id],
      ['Showroom furniture & display', 'Furniture', 'Uttara Showroom', 2100000, -390, null],
    ].forEach(([name, category, location, value, ago, assignedTo]) => add('assets', { tag: code('AST'), name, category, location, value, purchaseDate: d(ago), assignedTo, condition: 'Good' }, -ago));
    [
      ['Trade Licence', 'DNCC', 'TRAD/DNCC/045812/2025', d(-300), d(65)],
      ['TIN Certificate', 'NBR', '548812004471', d(-700), null],
      ['VAT Registration (BIN)', 'NBR', '004588127-0101', d(-700), null],
      ['Import Registration Certificate (IRC)', 'CCI&E', 'IRC-BA-0158827', d(-330), d(35)],
      ['BYD Dealership Agreement', 'BYD Auto', 'BYD-BD-DLR-2024-02', d(-420), d(310)],
      ['Fire Licence — Showroom', 'Fire Service & Civil Defence', 'FSCD/DHK/22018', d(-350), d(15)],
      ['Environmental Clearance — Workshop', 'Dept. of Environment', 'DOE/DHK/ECC/7741', d(-200), d(165)],
    ].forEach(([name, authority, ref, issued, expiry]) => add('compliance', { name, authority, ref, issued, expiry }, 300));

    /* ---------- Activity feed ---------- */
    [
      [0, 'New lead Rakib Hasan (Facebook Ads) — BYD ATTO 3'], [0, 'Job card opened for ' + custVehicles[5].cust.name], [1, 'Booking money ৳ 5,00,000 received — ' + C[0].name],
      [1, 'Unit LGX… arrived at Gulshan Warehouse — awaiting PDI'], [2, 'Emergency PO raised with CG Runner — BYD SEAL'], [4, 'Full payment received — ' + C[3].name + ' ready for VIN'],
      [6, '3 units released (70%) on LOT-25-10B — VINs received'],
    ].forEach(([n, text]) => db.activity.push({ id: id(), at: iso(-n, 9 + n), text, kind: 'info', by: 'Admin' }));

    // newest first, like NA.insert
    NA.COLLECTIONS.forEach((c) => db[c].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    db.activity.sort((a, b) => b.at.localeCompare(a.at));
    db.meta.seeded = true;
  };
})();
