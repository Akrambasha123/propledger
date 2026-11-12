(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});

  function st() {
    return App.Store.getState();
  }

  function getUnit(unitId) {
    return st().units.find((u) => u.id === unitId) || null;
  }

  function getUnitName(unitId) {
    const u = getUnit(unitId);
    return u ? u.name : 'Unknown Unit';
  }

  function getTenancy(tenancyId) {
    return st().tenancies.find((t) => t.id === tenancyId) || null;
  }

  function getActiveTenancy(unitId) {
    const u = getUnit(unitId);
    if (!u || !u.currentTenancyId) return null;
    return getTenancy(u.currentTenancyId);
  }

  // =========================================================================
  // Tenant Move-In & Move-Out
  // =========================================================================
  function addTenant({ unitId, tenantName, mobile, monthlyRent, advanceAmount, joiningDate }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Property not found.' };
    if (u.occupancyStatus === 'Occupied') return { ok: false, error: `${u.name} is already occupied. Vacate current tenant first.` };
    const name = String(tenantName || '').trim();
    if (!name) return { ok: false, error: 'Tenant name is required.' };

    const rent = H.nonNeg(monthlyRent);
    const adv = H.nonNeg(advanceAmount);
    const join = joiningDate || H.todayISO();
    const tenancyId = H.uid('t');

    st().tenancies.push({
      id: tenancyId,
      unitId,
      tenantName: name,
      mobile: String(mobile || '').trim(),
      monthlyRent: rent,
      advanceAmount: adv,
      joiningDate: join,
      leavingDate: '',
      status: 'Active',
      settlement: null
    });

    u.occupancyStatus = 'Occupied';
    u.currentTenancyId = tenancyId;
    u.monthlyRent = rent;
    u.advanceHeld = adv;

    if (adv > 0) {
      st().payments.unshift({
        id: H.uid('pay'),
        unitId,
        tenancyId,
        type: 'Advance',
        amount: adv,
        date: join,
        note: `Advance from ${name}`
      });
    }

    // Record initial rent revision for joining month so history is explicit
    st().rent_revisions.unshift({
      id: H.uid('rev'),
      unitId,
      effectiveMonth: join.slice(0, 7),
      previousRent: u.monthlyRent,
      newRent: rent,
      createdAt: join
    });

    App.Store.save();
    return { ok: true, tenancyId };
  }

  function updateTenancy(tenancyId, { tenantName, mobile, monthlyRent, advanceAmount, joiningDate, leavingDate }) {
    const H = App.H;
    const t = getTenancy(tenancyId);
    if (!t) return { ok: false, error: 'Tenant record not found.' };
    const name = String(tenantName || '').trim();
    if (!name) return { ok: false, error: 'Tenant name is required.' };

    const rent = H.nonNeg(monthlyRent);
    const adv = H.nonNeg(advanceAmount);
    const oldJoin = t.joiningDate;

    t.tenantName = name;
    t.mobile = String(mobile || '').trim();
    t.monthlyRent = rent;
    t.advanceAmount = adv;
    if (joiningDate) t.joiningDate = joiningDate;
    if (t.status === 'Vacated' && leavingDate !== undefined) t.leavingDate = leavingDate;

    const u = getUnit(t.unitId);
    if (t.status === 'Active' && u && u.currentTenancyId === t.id) {
      u.monthlyRent = rent;
      u.advanceHeld = adv;
    }

    // Sync initial advance entry if one existed on joining date
    const initPay = st().payments.find(
      (p) => p.tenancyId === t.id && p.type === 'Advance' && p.date === oldJoin && String(p.note || '').startsWith('Advance from')
    );
    if (initPay) {
      initPay.amount = adv;
      initPay.date = t.joiningDate;
      initPay.note = `Advance from ${name}`;
    }

    App.Store.save();
    return { ok: true, tenancy: t };
  }

  function vacateTenant(unitId, payload) {
    const H = App.H;
    const u = getUnit(unitId);
    const t = getActiveTenancy(unitId);
    if (!u || !t) return { ok: false, error: 'No active tenant on this property.' };

    const leavingDate = payload.leavingDate || H.todayISO();
    const pendingRent = H.nonNeg(payload.pendingRent);
    const pendingElec = H.nonNeg(payload.pendingElec);
    const pendingWater = H.nonNeg(payload.pendingWater);
    const paintingDeduction = H.nonNeg(payload.paintingDeduction);
    const maintenanceDeduction = H.nonNeg(payload.maintenanceDeduction);
    const otherDeduction = H.nonNeg(payload.otherDeduction);
    const totalDeductions = H.toMoney(pendingRent + pendingElec + pendingWater + paintingDeduction + maintenanceDeduction + otherDeduction);
    const advanceHeld = H.nonNeg(u.advanceHeld);
    const refundedAmount = payload.refundedAmount !== undefined && payload.refundedAmount !== ''
      ? H.nonNeg(payload.refundedAmount)
      : H.nonNeg(advanceHeld - totalDeductions);

    t.status = 'Vacated';
    t.leavingDate = leavingDate;
    t.settlement = {
      leavingDate,
      pendingRent,
      pendingElec,
      pendingWater,
      paintingDeduction,
      maintenanceDeduction,
      otherDeduction,
      totalDeductions,
      advanceHeld,
      refundedAmount
    };

    // Settle open rent/elec/water balances if deducted at move-out so next tenant starts clean
    if (pendingRent > 0) {
      st().rent_months.forEach((rm) => {
        if (rm.unitId === unitId && rm.receivedAmount < rm.expectedRent) {
          rm.receivedAmount = rm.expectedRent;
        }
      });
    }
    if (pendingElec > 0) {
      st().electricity_bills.forEach((b) => {
        if (!b.isBachelorMeter && b.unitId === unitId && !b.isOwnerExpense) {
          const net = getIndividualElecNet(b);
          if (b.receivedAmount < net) b.receivedAmount = net;
        } else if (b.isBachelorMeter) {
          if (unitId === 'unit_br1' && b.br1Received < b.br1Share) b.br1Received = b.br1Share;
          if (unitId === 'unit_br2' && b.br2Received < b.br2Share) b.br2Received = b.br2Share;
        }
      });
    }
    if (pendingWater > 0) {
      st().water_bills.forEach((w) => {
        if (w.unitId === unitId && !w.isOwnerExpense && w.receivedAmount < w.billAmount) {
          w.receivedAmount = w.billAmount;
        }
      });
    }

    // Link any maintenance expenses if deducted
    if (maintenanceDeduction > 0) {
      st().expenses.forEach((e) => {
        if (e.unitId === unitId && !e.settledInTenancyId) e.settledInTenancyId = t.id;
      });
    }

    st().payments.unshift({
      id: H.uid('pay'),
      unitId,
      tenancyId: t.id,
      type: 'Advance Refund',
      amount: refundedAmount,
      date: leavingDate,
      note: `Vacate settlement (${t.tenantName}) — Deductions: ${H.formatCurrency(totalDeductions)}`
    });

    u.occupancyStatus = 'Vacant';
    u.currentTenancyId = null;
    u.advanceHeld = 0;

    App.Store.save();
    return { ok: true, settlement: t.settlement };
  }

  // =========================================================================
  // Rent Tracking (Independent per unit, historical rent never overwritten)
  // =========================================================================
  function getExpectedRentForMonth(unitId, month) {
    const H = App.H;
    const existing = st().rent_months.find((r) => r.unitId === unitId && r.month === month);
    if (existing) return H.toMoney(existing.expectedRent);

    const revs = st().rent_revisions
      .filter((rv) => rv.unitId === unitId && rv.effectiveMonth <= month)
      .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));
    if (revs.length > 0) return H.toMoney(revs[0].newRent);

    const u = getUnit(unitId);
    return u ? H.toMoney(u.monthlyRent) : 0;
  }

  function changeUnitRent(unitId, { newRent, effectiveMonth }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Property not found.' };
    const amt = H.nonNeg(newRent);
    const effMonth = effectiveMonth || H.currentMonth();
    const prev = u.monthlyRent;

    st().rent_revisions.unshift({
      id: H.uid('rev'),
      unitId,
      effectiveMonth: effMonth,
      previousRent: prev,
      newRent: amt,
      createdAt: H.todayISO()
    });

    if (effMonth <= H.currentMonth()) {
      u.monthlyRent = amt;
      const t = getActiveTenancy(unitId);
      if (t) t.monthlyRent = amt;
    }

    // Only update target effectiveMonth if it exists AND is not a locked past month
    const curM = H.currentMonth();
    if (effMonth >= curM) {
      const targetRec = st().rent_months.find((r) => r.unitId === unitId && r.month === effMonth);
      if (targetRec) targetRec.expectedRent = amt;
    }

    App.Store.save();
    return { ok: true };
  }

  function recordRentPayment({ unitId, month, amount, date, note }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Property not found.' };
    const payAmt = H.toMoney(amount);
    if (payAmt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const ym = month || H.currentMonth();
    const payDate = date || H.todayISO();
    let rm = st().rent_months.find((r) => r.unitId === unitId && r.month === ym);
    if (!rm) {
      rm = {
        id: H.uid('rm'),
        unitId,
        tenancyId: u.currentTenancyId || null,
        month: ym,
        expectedRent: getExpectedRentForMonth(unitId, ym),
        receivedAmount: 0,
        payments: []
      };
      st().rent_months.push(rm);
    }

    rm.payments.push({ id: H.uid('rp'), amount: payAmt, date: payDate });
    rm.receivedAmount = H.toMoney((rm.receivedAmount || 0) + payAmt);

    st().payments.unshift({
      id: H.uid('pay'),
      unitId,
      tenancyId: u.currentTenancyId || rm.tenancyId || null,
      type: 'Rent',
      amount: payAmt,
      date: payDate,
      note: note || `Rent ${ym}`
    });

    App.Store.save();
    return { ok: true, rentMonth: rm };
  }

  function updateRentMonth(unitId, month, { expectedRent, receivedAmount }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Property not found.' };
    const ym = month || H.currentMonth();
    const exp = H.nonNeg(expectedRent);
    const rec = H.nonNeg(receivedAmount);

    let rm = st().rent_months.find((r) => r.unitId === unitId && r.month === ym);
    if (!rm) {
      rm = {
        id: H.uid('rm'),
        unitId,
        tenancyId: u.currentTenancyId || null,
        month: ym,
        expectedRent: exp,
        receivedAmount: rec,
        payments: rec > 0 ? [{ id: H.uid('rp'), amount: rec, date: H.todayISO() }] : []
      };
      st().rent_months.push(rm);
    } else {
      const diff = H.toMoney(rec - (rm.receivedAmount || 0));
      rm.expectedRent = exp;
      rm.receivedAmount = rec;
      if (diff !== 0) {
        st().payments.unshift({
          id: H.uid('pay'),
          unitId,
          tenancyId: u.currentTenancyId || rm.tenancyId || null,
          type: 'Rent',
          amount: diff,
          date: H.todayISO(),
          note: `Rent ${ym} edited`
        });
      }
    }

    App.Store.save();
    return { ok: true, rentMonth: rm };
  }

  // =========================================================================
  // Electricity Bills (6 Meters: 5 individual + 1 shared BR1/BR2 meter)
  // =========================================================================
  function getIndividualElecContribsSum(bill) {
    return App.H.toMoney((bill.contributions || []).reduce((s, c) => s + App.H.nonNeg(c.amount), 0));
  }

  function getIndividualElecNet(bill) {
    return App.H.nonNeg(App.H.toMoney(bill.billAmount) - getIndividualElecContribsSum(bill));
  }

  function saveIndividualElecBill({ unitId, month, billAmount, contributions = [], receivedAmount = 0, date, assignVacantToTenant = false }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u || u.isBachelor) return { ok: false, error: 'Select House 1–4 or Shop for individual meter billing.' };
    const amt = H.nonNeg(billAmount);
    if (amt <= 0) return { ok: false, error: 'Electricity bill amount must be greater than zero.' };

    const cleanedContribs = [];
    const seen = new Set();
    for (const c of contributions) {
      if (!c.fromUnitId || c.fromUnitId === unitId) continue;
      if (seen.has(c.fromUnitId)) return { ok: false, error: `Duplicate contribution from ${getUnitName(c.fromUnitId)}.` };
      seen.add(c.fromUnitId);
      const ca = H.nonNeg(c.amount);
      if (ca > 0) cleanedContribs.push({ id: H.uid('ec'), fromUnitId: c.fromUnitId, amount: ca });
    }

    const contribTotal = H.toMoney(cleanedContribs.reduce((s, c) => s + c.amount, 0));
    if (contribTotal > amt) return { ok: false, error: 'Total contributions cannot exceed the bill amount.' };

    const isVacantOwner = u.occupancyStatus === 'Vacant' && !assignVacantToTenant;
    const recAmt = isVacantOwner ? 0 : H.nonNeg(receivedAmount);
    const payDate = date || H.todayISO();

    const bill = {
      id: H.uid('eb'),
      isBachelorMeter: false,
      unitId,
      month: month || H.currentMonth(),
      billAmount: amt,
      contributions: cleanedContribs,
      receivedAmount: recAmt,
      isOwnerExpense: isVacantOwner,
      payments: recAmt > 0 ? [{ id: H.uid('ep'), amount: recAmt, date: payDate }] : []
    };
    st().electricity_bills.unshift(bill);

    if (recAmt > 0) {
      st().payments.unshift({
        id: H.uid('pay'),
        unitId,
        tenancyId: u.currentTenancyId || null,
        type: 'Electricity',
        amount: recAmt,
        date: payDate,
        note: `Electricity ${bill.month}`
      });
    }

    App.Store.save();
    return { ok: true, bill };
  }

  function addContributionToElecBill(billId, { fromUnitId, amount }) {
    const H = App.H;
    const bill = st().electricity_bills.find((b) => b.id === billId && !b.isBachelorMeter);
    if (!bill) return { ok: false, error: 'Electricity bill not found.' };
    if (!fromUnitId || fromUnitId === bill.unitId) return { ok: false, error: 'Select another unit to contribute.' };
    const amt = H.nonNeg(amount);
    if (amt <= 0) return { ok: false, error: 'Contribution amount must be greater than zero.' };

    bill.contributions = bill.contributions || [];
    const existing = bill.contributions.find((c) => c.fromUnitId === fromUnitId);
    const otherSum = H.toMoney(bill.contributions.filter((c) => c.fromUnitId !== fromUnitId).reduce((s, c) => s + H.nonNeg(c.amount), 0));
    if (otherSum + amt > bill.billAmount) {
      return { ok: false, error: 'Total contributions cannot exceed the bill amount.' };
    }
    if (existing) existing.amount = amt;
    else bill.contributions.push({ id: H.uid('ec'), fromUnitId, amount: amt });

    App.Store.save();
    return { ok: true, bill };
  }

  function saveBachelorElecBill({ month, br1Share, br2Share, br1Received = 0, br2Received = 0, date }) {
    const H = App.H;
    const ym = month || H.currentMonth();
    const s1 = H.nonNeg(br1Share);
    const s2 = H.nonNeg(br2Share);
    if (s1 + s2 <= 0) return { ok: false, error: 'Enter electricity share for Bachelor Room 1 and/or 2.' };

    const r1 = H.nonNeg(br1Received);
    const r2 = H.nonNeg(br2Received);
    const payDate = date || H.todayISO();

    let bill = st().electricity_bills.find((b) => b.isBachelorMeter && b.month === ym);
    if (bill) {
      bill.br1Share = s1;
      bill.br2Share = s2;
      if (r1 > 0) {
        bill.br1Received = H.toMoney((bill.br1Received || 0) + r1);
        bill.br1Payments = bill.br1Payments || [];
        bill.br1Payments.push({ id: H.uid('ep'), amount: r1, date: payDate });
      }
      if (r2 > 0) {
        bill.br2Received = H.toMoney((bill.br2Received || 0) + r2);
        bill.br2Payments = bill.br2Payments || [];
        bill.br2Payments.push({ id: H.uid('ep'), amount: r2, date: payDate });
      }
    } else {
      bill = {
        id: H.uid('eb'),
        isBachelorMeter: true,
        unitId: 'unit_br1',
        month: ym,
        br1Share: s1,
        br2Share: s2,
        br1Received: r1,
        br2Received: r2,
        br1Payments: r1 > 0 ? [{ id: H.uid('ep'), amount: r1, date: payDate }] : [],
        br2Payments: r2 > 0 ? [{ id: H.uid('ep'), amount: r2, date: payDate }] : []
      };
      st().electricity_bills.unshift(bill);
    }

    if (r1 > 0) {
      const u1 = getUnit('unit_br1');
      st().payments.unshift({
        id: H.uid('pay'), unitId: 'unit_br1', tenancyId: u1?.currentTenancyId || null,
        type: 'Electricity', amount: r1, date: payDate, note: `Meter 6 share ${ym}`
      });
    }
    if (r2 > 0) {
      const u2 = getUnit('unit_br2');
      st().payments.unshift({
        id: H.uid('pay'), unitId: 'unit_br2', tenancyId: u2?.currentTenancyId || null,
        type: 'Electricity', amount: r2, date: payDate, note: `Meter 6 share ${ym}`
      });
    }

    App.Store.save();
    return { ok: true, bill };
  }

  function recordElecPayment(billId, { amount, date, room = 'single' }) {
    const H = App.H;
    const bill = st().electricity_bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: 'Electricity bill not found.' };
    const payAmt = H.toMoney(amount);
    if (payAmt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    const payDate = date || H.todayISO();

    if (bill.isBachelorMeter) {
      const unitId = room === 'br2' ? 'unit_br2' : 'unit_br1';
      const u = getUnit(unitId);
      if (room === 'br2') {
        bill.br2Received = H.toMoney((bill.br2Received || 0) + payAmt);
        bill.br2Payments = bill.br2Payments || [];
        bill.br2Payments.push({ id: H.uid('ep'), amount: payAmt, date: payDate });
      } else {
        bill.br1Received = H.toMoney((bill.br1Received || 0) + payAmt);
        bill.br1Payments = bill.br1Payments || [];
        bill.br1Payments.push({ id: H.uid('ep'), amount: payAmt, date: payDate });
      }
      st().payments.unshift({
        id: H.uid('pay'), unitId, tenancyId: u?.currentTenancyId || null,
        type: 'Electricity', amount: payAmt, date: payDate, note: `Meter 6 share ${bill.month}`
      });
    } else {
      const u = getUnit(bill.unitId);
      bill.receivedAmount = H.toMoney((bill.receivedAmount || 0) + payAmt);
      bill.isOwnerExpense = false;
      bill.payments = bill.payments || [];
      bill.payments.push({ id: H.uid('ep'), amount: payAmt, date: payDate });
      st().payments.unshift({
        id: H.uid('pay'), unitId: bill.unitId, tenancyId: u?.currentTenancyId || null,
        type: 'Electricity', amount: payAmt, date: payDate, note: `Electricity ${bill.month}`
      });
    }

    App.Store.save();
    return { ok: true, bill };
  }

  // =========================================================================
  // Independent Water Bills (All 7 Units)
  // =========================================================================
  function saveWaterBill({ unitId, month, billAmount, receivedAmount = 0, date, assignVacantToTenant = false }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Property not found.' };
    const amt = H.nonNeg(billAmount);
    if (amt <= 0) return { ok: false, error: 'Water bill amount must be greater than zero.' };

    const isVacantOwner = u.occupancyStatus === 'Vacant' && !assignVacantToTenant;
    const recAmt = isVacantOwner ? 0 : H.nonNeg(receivedAmount);
    const payDate = date || H.todayISO();

    const bill = {
      id: H.uid('wb'),
      unitId,
      month: month || H.currentMonth(),
      billAmount: amt,
      receivedAmount: recAmt,
      isOwnerExpense: isVacantOwner,
      payments: recAmt > 0 ? [{ id: H.uid('wp'), amount: recAmt, date: payDate }] : []
    };
    st().water_bills.unshift(bill);

    if (recAmt > 0) {
      st().payments.unshift({
        id: H.uid('pay'),
        unitId,
        tenancyId: u.currentTenancyId || null,
        type: 'Water',
        amount: recAmt,
        date: payDate,
        note: `Water ${bill.month}`
      });
    }

    App.Store.save();
    return { ok: true, bill };
  }

  function recordWaterPayment(billId, { amount, date }) {
    const H = App.H;
    const bill = st().water_bills.find((w) => w.id === billId);
    if (!bill) return { ok: false, error: 'Water bill not found.' };
    const payAmt = H.toMoney(amount);
    if (payAmt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    const payDate = date || H.todayISO();
    const u = getUnit(bill.unitId);

    bill.receivedAmount = H.toMoney((bill.receivedAmount || 0) + payAmt);
    bill.isOwnerExpense = false;
    bill.payments = bill.payments || [];
    bill.payments.push({ id: H.uid('wp'), amount: payAmt, date: payDate });

    st().payments.unshift({
      id: H.uid('pay'),
      unitId: bill.unitId,
      tenancyId: u?.currentTenancyId || null,
      type: 'Water',
      amount: payAmt,
      date: payDate,
      note: `Water ${bill.month}`
    });

    App.Store.save();
    return { ok: true, bill };
  }

  // =========================================================================
  // Simple Payment Recording & Expenses
  // =========================================================================
  function addExpense({ unitId, amount, category, date, description }) {
    const H = App.H;
    const amt = H.toMoney(amount);
    if (amt <= 0) return { ok: false, error: 'Expense amount must be greater than zero.' };
    const exp = {
      id: H.uid('exp'),
      unitId,
      amount: amt,
      category: category || 'Maintenance',
      date: date || H.todayISO(),
      description: String(description || '').trim()
    };
    st().expenses.unshift(exp);
    App.Store.save();
    return { ok: true, expense: exp };
  }

  function updateIndividualElecBill(billId, { unitId, month, billAmount, contributions = [], receivedAmount = 0, isOwnerExpense = false }) {
    const H = App.H;
    const bill = st().electricity_bills.find((b) => b.id === billId && !b.isBachelorMeter);
    if (!bill) return { ok: false, error: 'Electricity bill not found.' };
    const amt = H.nonNeg(billAmount);
    if (amt <= 0) return { ok: false, error: 'Bill amount must be greater than zero.' };

    const targetUnitId = unitId || bill.unitId;
    const cleanedContribs = [];
    const seen = new Set();
    for (const c of contributions) {
      if (!c.fromUnitId || c.fromUnitId === targetUnitId) continue;
      if (seen.has(c.fromUnitId)) return { ok: false, error: `Duplicate contribution from ${getUnitName(c.fromUnitId)}.` };
      seen.add(c.fromUnitId);
      const ca = H.nonNeg(c.amount);
      if (ca > 0) cleanedContribs.push({ id: c.id || H.uid('ec'), fromUnitId: c.fromUnitId, amount: ca });
    }
    const cSum = H.toMoney(cleanedContribs.reduce((s, c) => s + c.amount, 0));
    if (cSum > amt) return { ok: false, error: 'Total contributions cannot exceed the bill amount.' };

    bill.unitId = targetUnitId;
    bill.month = month || bill.month;
    bill.billAmount = amt;
    bill.contributions = cleanedContribs;
    bill.receivedAmount = isOwnerExpense ? 0 : H.nonNeg(receivedAmount);
    bill.isOwnerExpense = Boolean(isOwnerExpense);
    App.Store.save();
    return { ok: true, bill };
  }

  function updateBachelorElecBill(billId, { month, br1Share, br2Share, br1Received, br2Received }) {
    const H = App.H;
    const bill = st().electricity_bills.find((b) => b.id === billId && b.isBachelorMeter);
    if (!bill) return { ok: false, error: 'Meter 6 bill not found.' };
    const s1 = H.nonNeg(br1Share);
    const s2 = H.nonNeg(br2Share);
    if (s1 + s2 <= 0) return { ok: false, error: 'Combined Meter 6 share must be greater than zero.' };

    bill.month = month || bill.month;
    bill.br1Share = s1;
    bill.br2Share = s2;
    bill.br1Received = H.nonNeg(br1Received);
    bill.br2Received = H.nonNeg(br2Received);
    App.Store.save();
    return { ok: true, bill };
  }

  function deleteElectricityBill(billId) {
    const idx = st().electricity_bills.findIndex((b) => b.id === billId);
    if (idx === -1) return { ok: false, error: 'Electricity bill not found.' };
    st().electricity_bills.splice(idx, 1);
    App.Store.save();
    return { ok: true };
  }

  function updateWaterBill(billId, { unitId, month, billAmount, receivedAmount, isOwnerExpense }) {
    const H = App.H;
    const bill = st().water_bills.find((w) => w.id === billId);
    if (!bill) return { ok: false, error: 'Water bill not found.' };
    const amt = H.nonNeg(billAmount);
    if (amt <= 0) return { ok: false, error: 'Water bill amount must be greater than zero.' };

    bill.unitId = unitId || bill.unitId;
    bill.month = month || bill.month;
    bill.billAmount = amt;
    bill.isOwnerExpense = Boolean(isOwnerExpense);
    bill.receivedAmount = bill.isOwnerExpense ? 0 : H.nonNeg(receivedAmount);
    App.Store.save();
    return { ok: true, bill };
  }

  function deleteWaterBill(billId) {
    const idx = st().water_bills.findIndex((w) => w.id === billId);
    if (idx === -1) return { ok: false, error: 'Water bill not found.' };
    st().water_bills.splice(idx, 1);
    App.Store.save();
    return { ok: true };
  }

  function updateExpense(expId, { unitId, amount, category, date, description }) {
    const H = App.H;
    const exp = st().expenses.find((e) => e.id === expId);
    if (!exp) return { ok: false, error: 'Expense not found.' };
    const amt = H.toMoney(amount);
    if (amt <= 0) return { ok: false, error: 'Expense amount must be greater than zero.' };

    exp.unitId = unitId || exp.unitId;
    exp.amount = amt;
    exp.category = category || exp.category;
    exp.date = date || exp.date;
    exp.description = String(description || '').trim();
    App.Store.save();
    return { ok: true, expense: exp };
  }

  function deleteExpense(expId) {
    const idx = st().expenses.findIndex((e) => e.id === expId);
    if (idx === -1) return { ok: false, error: 'Expense not found.' };
    st().expenses.splice(idx, 1);
    App.Store.save();
    return { ok: true };
  }

  function updatePayment(payId, { unitId, type, amount, date, note }) {
    const H = App.H;
    const pay = st().payments.find((p) => p.id === payId);
    if (!pay) return { ok: false, error: 'Payment record not found.' };
    const newAmt = H.toMoney(amount);
    if (newAmt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const oldAmt = H.toMoney(pay.amount);
    const delta = H.toMoney(newAmt - oldAmt);

    // Keep linked unit balances in sync if amount changed on same unit/type
    if (delta !== 0 && pay.type === 'Rent') {
      const mMatch = String(pay.note || '').match(/(\d{4}-\d{2})/);
      const ym = mMatch ? mMatch[1] : String(pay.date || '').slice(0, 7);
      const rm = st().rent_months.find((r) => r.unitId === pay.unitId && r.month === ym);
      if (rm) rm.receivedAmount = H.nonNeg((rm.receivedAmount || 0) + delta);
    } else if (delta !== 0 && pay.type === 'Advance') {
      const u = getUnit(pay.unitId);
      if (u && u.occupancyStatus === 'Occupied') u.advanceHeld = H.nonNeg((u.advanceHeld || 0) + delta);
      const t = pay.tenancyId ? getTenancy(pay.tenancyId) : null;
      if (t) t.advanceAmount = H.nonNeg((t.advanceAmount || 0) + delta);
    }

    pay.unitId = unitId || pay.unitId;
    pay.type = type || pay.type;
    pay.amount = newAmt;
    pay.date = date || pay.date;
    pay.note = String(note || '').trim();
    App.Store.save();
    return { ok: true, payment: pay };
  }

  function deletePayment(payId) {
    const H = App.H;
    const idx = st().payments.findIndex((p) => p.id === payId);
    if (idx === -1) return { ok: false, error: 'Payment record not found.' };
    const pay = st().payments[idx];

    if (pay.type === 'Rent') {
      const mMatch = String(pay.note || '').match(/(\d{4}-\d{2})/);
      const ym = mMatch ? mMatch[1] : String(pay.date || '').slice(0, 7);
      const rm = st().rent_months.find((r) => r.unitId === pay.unitId && r.month === ym);
      if (rm) rm.receivedAmount = H.nonNeg((rm.receivedAmount || 0) - pay.amount);
    } else if (pay.type === 'Advance') {
      const u = getUnit(pay.unitId);
      if (u && u.occupancyStatus === 'Occupied') u.advanceHeld = H.nonNeg((u.advanceHeld || 0) - pay.amount);
    }

    st().payments.splice(idx, 1);
    App.Store.save();
    return { ok: true };
  }

  function recordSimplePayment({ unitId, type, amount, date, month, note }) {
    const H = App.H;
    const u = getUnit(unitId);
    if (!u) return { ok: false, error: 'Select a property.' };
    const amt = H.toMoney(amount);
    if (amt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    const payDate = date || H.todayISO();

    if (type === 'Rent') {
      return recordRentPayment({ unitId, month: month || H.currentMonth(), amount: amt, date: payDate, note });
    }
    if (type === 'Electricity') {
      // Find pending bill for this unit
      if (u.id === 'unit_br1' || u.id === 'unit_br2') {
        const room = u.id === 'unit_br2' ? 'br2' : 'br1';
        const pendingM6 = st().electricity_bills.find((b) => {
          if (!b.isBachelorMeter) return false;
          const share = room === 'br2' ? b.br2Share : b.br1Share;
          const rec = room === 'br2' ? b.br2Received : b.br1Received;
          return rec < share;
        });
        if (pendingM6) return recordElecPayment(pendingM6.id, { amount: amt, date: payDate, room });
      } else {
        const pendingInd = st().electricity_bills.find(
          (b) => !b.isBachelorMeter && b.unitId === unitId && !b.isOwnerExpense && b.receivedAmount < getIndividualElecNet(b)
        );
        if (pendingInd) return recordElecPayment(pendingInd.id, { amount: amt, date: payDate });
      }
      st().payments.unshift({ id: H.uid('pay'), unitId, tenancyId: u.currentTenancyId || null, type: 'Electricity', amount: amt, date: payDate, note: note || 'Electricity payment' });
      App.Store.save();
      return { ok: true };
    }
    if (type === 'Water') {
      const pendingW = st().water_bills.find((w) => w.unitId === unitId && !w.isOwnerExpense && w.receivedAmount < w.billAmount);
      if (pendingW) return recordWaterPayment(pendingW.id, { amount: amt, date: payDate });
      st().payments.unshift({ id: H.uid('pay'), unitId, tenancyId: u.currentTenancyId || null, type: 'Water', amount: amt, date: payDate, note: note || 'Water payment' });
      App.Store.save();
      return { ok: true };
    }
    if (type === 'Advance') {
      u.advanceHeld = H.toMoney((u.advanceHeld || 0) + amt);
      const t = getActiveTenancy(unitId);
      if (t) t.advanceAmount = H.toMoney((t.advanceAmount || 0) + amt);
      st().payments.unshift({ id: H.uid('pay'), unitId, tenancyId: u.currentTenancyId || null, type: 'Advance', amount: amt, date: payDate, note: note || 'Additional advance' });
      App.Store.save();
      return { ok: true };
    }

    st().payments.unshift({ id: H.uid('pay'), unitId, tenancyId: u.currentTenancyId || null, type: 'Other', amount: amt, date: payDate, note: note || 'Other payment' });
    App.Store.save();
    return { ok: true };
  }

  // =========================================================================
  // Summaries, Balances & Timelines
  // =========================================================================
  function getUnitBalances(unitId, targetMonth) {
    const H = App.H;
    const ym = targetMonth || H.currentMonth();
    const u = getUnit(unitId);
    const tenant = getActiveTenancy(unitId);

    // Current month rent
    const rm = st().rent_months.find((r) => r.unitId === unitId && r.month === ym);
    const expectedMonth = u.occupancyStatus === 'Occupied'
      ? (rm ? H.toMoney(rm.expectedRent) : getExpectedRentForMonth(unitId, ym))
      : 0;
    const receivedMonth = rm ? H.toMoney(rm.receivedAmount) : 0;
    const pendingMonth = H.nonNeg(expectedMonth - receivedMonth);

    let rentStatus = 'Vacant';
    if (u.occupancyStatus === 'Occupied') {
      if (expectedMonth === 0 || pendingMonth <= 0) rentStatus = 'Paid';
      else if (receivedMonth > 0) rentStatus = 'Partial';
      else rentStatus = 'Pending';
    }

    const totalPendingRent = H.toMoney(
      st().rent_months
        .filter((r) => r.unitId === unitId)
        .reduce((s, r) => s + H.nonNeg(r.expectedRent - r.receivedAmount), 0) +
      (!rm && u.occupancyStatus === 'Occupied' ? expectedMonth : 0)
    );

    let pendingElec = 0;
    st().electricity_bills.forEach((b) => {
      if (b.isBachelorMeter) {
        if (unitId === 'unit_br1') pendingElec += H.nonNeg((b.br1Share || 0) - (b.br1Received || 0));
        if (unitId === 'unit_br2') pendingElec += H.nonNeg((b.br2Share || 0) - (b.br2Received || 0));
      } else if (b.unitId === unitId && !b.isOwnerExpense) {
        pendingElec += H.nonNeg(getIndividualElecNet(b) - (b.receivedAmount || 0));
      }
    });

    const pendingWater = H.toMoney(
      st().water_bills
        .filter((w) => w.unitId === unitId && !w.isOwnerExpense)
        .reduce((s, w) => s + H.nonNeg(w.billAmount - w.receivedAmount), 0)
    );

    return {
      unit: u,
      tenant,
      month: ym,
      expectedMonth,
      receivedMonth,
      pendingMonth,
      rentStatus,
      totalPendingRent: H.toMoney(totalPendingRent),
      pendingElec: H.toMoney(pendingElec),
      pendingWater: H.toMoney(pendingWater),
      advanceHeld: H.toMoney(u.advanceHeld || 0)
    };
  }

  function getDashboardSummary(targetMonth) {
    const H = App.H;
    const ym = targetMonth || H.currentMonth();
    const unitCards = st().units.map((u) => getUnitBalances(u.id, ym));

    const occupiedCount = unitCards.filter((c) => c.unit.occupancyStatus === 'Occupied').length;
    const vacantCount = unitCards.length - occupiedCount;
    const expectedRent = H.toMoney(unitCards.reduce((s, c) => s + c.expectedMonth, 0));
    const collectedRent = H.toMoney(unitCards.reduce((s, c) => s + c.receivedMonth, 0));
    const pendingRent = H.toMoney(unitCards.reduce((s, c) => s + c.pendingMonth, 0));
    const totalAdvanceHeld = H.toMoney(unitCards.reduce((s, c) => s + c.advanceHeld, 0));

    return {
      month: ym,
      totalUnits: 7,
      occupiedCount,
      vacantCount,
      expectedRent,
      collectedRent,
      pendingRent,
      totalAdvanceHeld,
      unitCards
    };
  }

  function getTimeline(unitId = null) {
    const H = App.H;
    const items = [];
    const matchUnit = (id) => !unitId || id === unitId;

    // 1. Tenant Joined & Vacated
    st().tenancies.forEach((t) => {
      if (!matchUnit(t.unitId)) return;
      items.push({
        recordType: 'tenancy',
        recordId: t.id,
        date: t.joiningDate,
        unitId: t.unitId,
        kind: 'Tenant joined',
        badge: 'Occupied',
        detail: `${t.tenantName} joined (Rent: ${H.formatCurrency(t.monthlyRent)}, Advance: ${H.formatCurrency(t.advanceAmount)})`,
        amount: t.advanceAmount,
        sign: '+'
      });
      if (t.status === 'Vacated' && t.leavingDate) {
        items.push({
          recordType: 'tenancy',
          recordId: t.id,
          date: t.leavingDate,
          unitId: t.unitId,
          kind: 'Tenant vacated',
          badge: 'Vacated',
          detail: `${t.tenantName} vacated · Refunded ${H.formatCurrency(t.settlement?.refundedAmount || 0)}`,
          amount: t.settlement?.refundedAmount || 0,
          sign: '-'
        });
      }
    });

    // 2. Payments (Rent received, Electricity received, Water received, Advance, Refunds)
    st().payments.forEach((p) => {
      if (!matchUnit(p.unitId)) return;
      if (p.type === 'Advance' && st().tenancies.some((t) => t.unitId === p.unitId && t.joiningDate === p.date && p.note.startsWith('Advance from'))) {
        // Joining advance already shown on Tenant joined; keep additional advances
        return;
      }
      if (p.type === 'Advance Refund') {
        items.push({
          recordType: 'payment',
          recordId: p.id,
          date: p.date,
          unitId: p.unitId,
          kind: 'Advance refunded',
          badge: 'Vacated',
          detail: p.note || 'Advance refunded',
          amount: p.amount,
          sign: '-'
        });
        return;
      }
      const kindMap = {
        Rent: 'Rent received',
        Electricity: 'Electricity amount received',
        Water: 'Water amount received',
        Advance: 'Advance received',
        Other: 'Other receipt'
      };
      items.push({
        recordType: 'payment',
        recordId: p.id,
        date: p.date,
        unitId: p.unitId,
        kind: kindMap[p.type] || p.type,
        badge: 'Paid',
        detail: p.note || p.type,
        amount: p.amount,
        sign: '+'
      });
    });

    // 3. Electricity Bills Recorded & Contributions
    st().electricity_bills.forEach((b) => {
      if (b.isBachelorMeter) {
        if (matchUnit('unit_br1')) {
          items.push({
            recordType: 'elec',
            recordId: b.id,
            date: `${b.month}-01`,
            unitId: 'unit_br1',
            kind: 'Electricity bill recorded',
            badge: 'Pending',
            detail: `Meter 6 share (${H.formatMonth(b.month)}) · Combined meter total: ${H.formatCurrency((b.br1Share || 0) + (b.br2Share || 0))}`,
            amount: b.br1Share || 0,
            sign: ''
          });
        }
        if (matchUnit('unit_br2')) {
          items.push({
            recordType: 'elec',
            recordId: b.id,
            date: `${b.month}-01`,
            unitId: 'unit_br2',
            kind: 'Electricity bill recorded',
            badge: 'Pending',
            detail: `Meter 6 share (${H.formatMonth(b.month)}) · Combined meter total: ${H.formatCurrency((b.br1Share || 0) + (b.br2Share || 0))}`,
            amount: b.br2Share || 0,
            sign: ''
          });
        }
      } else {
        if (matchUnit(b.unitId)) {
          const contribSum = getIndividualElecContribsSum(b);
          const net = getIndividualElecNet(b);
          items.push({
            recordType: 'elec',
            recordId: b.id,
            date: `${b.month}-01`,
            unitId: b.unitId,
            kind: 'Electricity bill recorded',
            badge: b.isOwnerExpense ? 'Owner Expense' : 'Pending',
            detail: `${H.formatMonth(b.month)} bill ${H.formatCurrency(b.billAmount)}${contribSum > 0 ? ` − Contributions ${H.formatCurrency(contribSum)} = Net ${H.formatCurrency(net)}` : ''}`,
            amount: b.billAmount,
            sign: ''
          });
        }
        (b.contributions || []).forEach((c) => {
          if (matchUnit(c.fromUnitId)) {
            items.push({
              recordType: 'elec',
              recordId: b.id,
              date: `${b.month}-01`,
              unitId: c.fromUnitId,
              kind: 'Electricity contribution',
              badge: 'Pending',
              detail: `Contribution towards ${getUnitName(b.unitId)} (${H.formatMonth(b.month)})`,
              amount: c.amount,
              sign: ''
            });
          }
        });
      }
    });

    // 4. Water Bills Recorded
    st().water_bills.forEach((w) => {
      if (!matchUnit(w.unitId)) return;
      items.push({
        recordType: 'water',
        recordId: w.id,
        date: `${w.month}-01`,
        unitId: w.unitId,
        kind: 'Water bill recorded',
        badge: w.isOwnerExpense ? 'Owner Expense' : 'Pending',
        detail: `${H.formatMonth(w.month)} water bill${w.isOwnerExpense ? ' (Vacant — Owner Expense)' : ''}`,
        amount: w.billAmount,
        sign: ''
      });
    });

    // 5. Maintenance & Expenses
    st().expenses.forEach((e) => {
      if (!matchUnit(e.unitId)) return;
      items.push({
        recordType: 'expense',
        recordId: e.id,
        date: e.date,
        unitId: e.unitId,
        kind: 'Maintenance expense',
        badge: 'Owner Expense',
        detail: `${e.category}: ${e.description || 'Expense'}`,
        amount: e.amount,
        sign: '-'
      });
    });

    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  App.Engine = {
    getUnit,
    getUnitName,
    getTenancy,
    getActiveTenancy,
    addTenant,
    updateTenancy,
    vacateTenant,
    getExpectedRentForMonth,
    changeUnitRent,
    recordRentPayment,
    updateRentMonth,
    getIndividualElecContribsSum,
    getIndividualElecNet,
    saveIndividualElecBill,
    updateIndividualElecBill,
    addContributionToElecBill,
    saveBachelorElecBill,
    updateBachelorElecBill,
    deleteElectricityBill,
    recordElecPayment,
    saveWaterBill,
    updateWaterBill,
    deleteWaterBill,
    recordWaterPayment,
    addExpense,
    updateExpense,
    deleteExpense,
    recordSimplePayment,
    updatePayment,
    deletePayment,
    getUnitBalances,
    getDashboardSummary,
    getTimeline
  };
})(window);
