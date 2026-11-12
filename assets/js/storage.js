(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});
  const STORAGE_KEY = 'propledger_data_v3';
  const LEGACY_V2_KEY = 'propledger_data_v2';
  const PRE_RESTORE_KEY = 'propledger_pre_restore_v3';
  const SCHEMA_VERSION = 3;

  const FIXED_UNITS = [
    { id: 'unit_h1', name: 'House 1', meterNo: 1, meterLabel: 'Meter 1 (House 1)', isBachelor: false },
    { id: 'unit_h2', name: 'House 2', meterNo: 2, meterLabel: 'Meter 2 (House 2)', isBachelor: false },
    { id: 'unit_h3', name: 'House 3', meterNo: 3, meterLabel: 'Meter 3 (House 3)', isBachelor: false },
    { id: 'unit_h4', name: 'House 4', meterNo: 4, meterLabel: 'Meter 4 (House 4)', isBachelor: false },
    { id: 'unit_shop', name: 'Shop', meterNo: 5, meterLabel: 'Meter 5 (Shop)', isBachelor: false },
    { id: 'unit_br1', name: 'Bachelor Room 1', meterNo: 6, meterLabel: 'Meter 6 (Shared: BR1 + BR2)', isBachelor: true },
    { id: 'unit_br2', name: 'Bachelor Room 2', meterNo: 6, meterLabel: 'Meter 6 (Shared: BR1 + BR2)', isBachelor: true }
  ];

  // IndexedDB mirror
  const IDB_NAME = 'PropLedgerDB';
  const IDB_STORE = 'state';

  function idbSave(data) {
    if (!global.indexedDB) return;
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (e) => {
        const tx = e.target.result.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(data, 'current_v3');
      };
    } catch (_) {}
  }

  function hashMpin(pin) {
    const s = `PropLedger:${String(pin || '')}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `mp_${(h >>> 0).toString(16)}`;
  }

  function createEmptyState(isDemo = false) {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: {
        buildingName: 'My Rental Building',
        currencySymbol: '₹',
        theme: 'light',
        mpinHash: hashMpin('1234'),
        mpinIsDefault: true,
        isDemoData: isDemo,
        lastBackupAt: null,
        lastSavedAt: new Date().toISOString()
      },
      units: FIXED_UNITS.map((u) => ({
        ...u,
        occupancyStatus: 'Vacant',
        currentTenancyId: null,
        monthlyRent: 0,
        advanceHeld: 0
      })),
      tenancies: [],
      rent_months: [],
      rent_revisions: [],
      electricity_bills: [],
      water_bills: [],
      expenses: [],
      payments: []
    };
  }

  function buildDemoState() {
    const H = App.H;
    const mNow = H.currentMonth();
    const mPrev = H.prevMonth(mNow, 1);
    const mOld = H.prevMonth(mNow, 2);
    const d = (ym, day) => `${ym}-${String(day).padStart(2, '0')}`;

    const st = createEmptyState(true);

    // Tenancies (including vacated history on House 1, separate Bachelor Room 1 & 2 tenants, vacant House 4)
    st.tenancies = [
      {
        id: 't_john', unitId: 'unit_h1', tenantName: 'John Doe', mobile: '9876500101',
        monthlyRent: 6000, advanceAmount: 30000, joiningDate: d(mOld, 1), leavingDate: d(mPrev, 28),
        status: 'Vacated',
        settlement: {
          leavingDate: d(mPrev, 28), pendingRent: 0, pendingElec: 0, pendingWater: 0,
          paintingDeduction: 2000, maintenanceDeduction: 1000, otherDeduction: 500,
          refundedAmount: 26500
        }
      },
      {
        id: 't_priya', unitId: 'unit_h1', tenantName: 'Priya Nair', mobile: '9876500102',
        monthlyRent: 7000, advanceAmount: 25000, joiningDate: d(mNow, 1), leavingDate: '',
        status: 'Active', settlement: null
      },
      {
        id: 't_karthik', unitId: 'unit_h2', tenantName: 'Karthik Rao', mobile: '9876500104',
        monthlyRent: 6500, advanceAmount: 20000, joiningDate: d(mOld, 1), leavingDate: '',
        status: 'Active', settlement: null
      },
      {
        id: 't_sneha', unitId: 'unit_h3', tenantName: 'Sneha Verma', mobile: '9876500105',
        monthlyRent: 7500, advanceAmount: 25000, joiningDate: d(mOld, 1), leavingDate: '',
        status: 'Active', settlement: null
      },
      {
        id: 't_arjun', unitId: 'unit_shop', tenantName: 'Arjun Mehta', mobile: '9876500103',
        monthlyRent: 12000, advanceAmount: 40000, joiningDate: d(mOld, 1), leavingDate: '',
        status: 'Active', settlement: null
      },
      {
        id: 't_vikram', unitId: 'unit_br1', tenantName: 'Vikram Singh', mobile: '9876500106',
        monthlyRent: 4000, advanceAmount: 10000, joiningDate: d(mPrev, 1), leavingDate: '',
        status: 'Active', settlement: null
      },
      {
        id: 't_imran', unitId: 'unit_br2', tenantName: 'Imran Khan', mobile: '9876500107',
        monthlyRent: 4200, advanceAmount: 12000, joiningDate: d(mPrev, 1), leavingDate: '',
        status: 'Active', settlement: null
      }
    ];

    const unitMap = Object.fromEntries(st.units.map((u) => [u.id, u]));
    st.tenancies.filter((t) => t.status === 'Active').forEach((t) => {
      const u = unitMap[t.unitId];
      u.occupancyStatus = 'Occupied';
      u.currentTenancyId = t.id;
      u.monthlyRent = t.monthlyRent;
      u.advanceHeld = t.advanceAmount;
    });
    // Vacant House 4 default rent
    unitMap.unit_h4.monthlyRent = 7000;

    // Variable Rent History (House 1 historical 6000 -> current 7000) & current month partial/paid/pending
    st.rent_months = [
      { id: 'rm_h1_old', unitId: 'unit_h1', tenancyId: 't_john', month: mOld, expectedRent: 6000, receivedAmount: 6000, payments: [{ id: 'p1', amount: 6000, date: d(mOld, 5) }] },
      { id: 'rm_h1_prev', unitId: 'unit_h1', tenancyId: 't_john', month: mPrev, expectedRent: 6500, receivedAmount: 6500, payments: [{ id: 'p2', amount: 6500, date: d(mPrev, 5) }] },
      { id: 'rm_h1_now', unitId: 'unit_h1', tenancyId: 't_priya', month: mNow, expectedRent: 7000, receivedAmount: 7000, payments: [{ id: 'p3', amount: 7000, date: d(mNow, 3) }] },
      { id: 'rm_h2_now', unitId: 'unit_h2', tenancyId: 't_karthik', month: mNow, expectedRent: 6500, receivedAmount: 4000, payments: [{ id: 'p4', amount: 4000, date: d(mNow, 5) }] },
      { id: 'rm_h3_now', unitId: 'unit_h3', tenancyId: 't_sneha', month: mNow, expectedRent: 7500, receivedAmount: 0, payments: [] },
      { id: 'rm_shop_now', unitId: 'unit_shop', tenancyId: 't_arjun', month: mNow, expectedRent: 12000, receivedAmount: 12000, payments: [{ id: 'p5', amount: 12000, date: d(mNow, 2) }] },
      { id: 'rm_br1_now', unitId: 'unit_br1', tenancyId: 't_vikram', month: mNow, expectedRent: 4000, receivedAmount: 4000, payments: [{ id: 'p6', amount: 4000, date: d(mNow, 4) }] },
      { id: 'rm_br2_now', unitId: 'unit_br2', tenancyId: 't_imran', month: mNow, expectedRent: 4200, receivedAmount: 2000, payments: [{ id: 'p7', amount: 2000, date: d(mNow, 6) }] }
    ];

    // Electricity Bills:
    // - House 3 ₹1,500 with ₹600 contributions (BR1: 200, BR2: 200, H1: 100, H2: 100) -> ₹900 remaining
    // - Bachelor Room Meter 6 ₹800 split manually (BR1: ₹450 paid ₹450, BR2: ₹350 paid ₹200 -> pending ₹150)
    // - Vacant House 4 ₹350 (Owner Expense)
    st.electricity_bills = [
      {
        id: 'eb_h3', isBachelorMeter: false, unitId: 'unit_h3', month: mNow,
        billAmount: 1500,
        contributions: [
          { id: 'ec_1', fromUnitId: 'unit_br1', amount: 200 },
          { id: 'ec_2', fromUnitId: 'unit_br2', amount: 200 },
          { id: 'ec_3', fromUnitId: 'unit_h1', amount: 100 },
          { id: 'ec_4', fromUnitId: 'unit_h2', amount: 100 }
        ],
        receivedAmount: 500, isOwnerExpense: false,
        payments: [{ id: 'ep_1', amount: 500, date: d(mNow, 8) }]
      },
      {
        id: 'eb_br_m6', isBachelorMeter: true, unitId: 'unit_br1', month: mNow,
        br1Share: 450, br2Share: 350,
        br1Received: 450, br2Received: 200,
        br1Payments: [{ id: 'ep_br1', amount: 450, date: d(mNow, 8) }],
        br2Payments: [{ id: 'ep_br2', amount: 200, date: d(mNow, 9) }]
      },
      {
        id: 'eb_h4_vac', isBachelorMeter: false, unitId: 'unit_h4', month: mNow,
        billAmount: 350, contributions: [], receivedAmount: 0, isOwnerExpense: true, payments: []
      }
    ];

    // Water Bills (independent for all 7 units including BR1 & BR2 + vacant House 4)
    st.water_bills = [
      { id: 'wb_br1', unitId: 'unit_br1', month: mNow, billAmount: 150, receivedAmount: 150, isOwnerExpense: false, payments: [{ id: 'wp_1', amount: 150, date: d(mNow, 7) }] },
      { id: 'wb_br2', unitId: 'unit_br2', month: mNow, billAmount: 180, receivedAmount: 100, isOwnerExpense: false, payments: [{ id: 'wp_2', amount: 100, date: d(mNow, 7) }] },
      { id: 'wb_h1', unitId: 'unit_h1', month: mNow, billAmount: 300, receivedAmount: 300, isOwnerExpense: false, payments: [{ id: 'wp_3', amount: 300, date: d(mNow, 6) }] },
      { id: 'wb_h4_vac', unitId: 'unit_h4', month: mNow, billAmount: 150, receivedAmount: 0, isOwnerExpense: true, payments: [] }
    ];

    // Maintenance & Other Expenses
    st.expenses = [
      { id: 'exp_1', unitId: 'unit_h4', amount: 4500, category: 'Painting', date: d(mNow, 4), description: 'Interior repainting while vacant', settledInTenancyId: null },
      { id: 'exp_2', unitId: 'unit_h2', amount: 850, category: 'Plumbing', date: d(mNow, 6), description: 'Kitchen tap valve replacement', settledInTenancyId: null }
    ];

    // Simple Cash Payment Log (chronological)
    st.payments = [
      { id: 'pay_1', unitId: 'unit_h1', tenancyId: 't_john', type: 'Advance', amount: 30000, date: d(mOld, 1), note: 'Joining advance — John Doe' },
      { id: 'pay_2', unitId: 'unit_h1', tenancyId: 't_john', type: 'Rent', amount: 6000, date: d(mOld, 5), note: `Rent ${mOld}` },
      { id: 'pay_3', unitId: 'unit_h1', tenancyId: 't_john', type: 'Rent', amount: 6500, date: d(mPrev, 5), note: `Rent ${mPrev}` },
      { id: 'pay_4', unitId: 'unit_h1', tenancyId: 't_john', type: 'Advance Refund', amount: 26500, date: d(mPrev, 28), note: 'Refunded on vacate (₹3,500 deducted)' },
      { id: 'pay_5', unitId: 'unit_h1', tenancyId: 't_priya', type: 'Advance', amount: 25000, date: d(mNow, 1), note: 'Joining advance — Priya Nair' },
      { id: 'pay_6', unitId: 'unit_h1', tenancyId: 't_priya', type: 'Rent', amount: 7000, date: d(mNow, 3), note: `Rent ${mNow}` },
      { id: 'pay_7', unitId: 'unit_shop', tenancyId: 't_arjun', type: 'Rent', amount: 12000, date: d(mNow, 2), note: `Rent ${mNow}` },
      { id: 'pay_8', unitId: 'unit_h2', tenancyId: 't_karthik', type: 'Rent', amount: 4000, date: d(mNow, 5), note: `Partial rent ${mNow}` },
      { id: 'pay_9', unitId: 'unit_br1', tenancyId: 't_vikram', type: 'Rent', amount: 4000, date: d(mNow, 4), note: `Rent ${mNow}` },
      { id: 'pay_10', unitId: 'unit_br2', tenancyId: 't_imran', type: 'Rent', amount: 2000, date: d(mNow, 6), note: `Partial rent ${mNow}` },
      { id: 'pay_11', unitId: 'unit_h3', tenancyId: 't_sneha', type: 'Electricity', amount: 500, date: d(mNow, 8), note: `Electricity ${mNow}` },
      { id: 'pay_12', unitId: 'unit_br1', tenancyId: 't_vikram', type: 'Electricity', amount: 450, date: d(mNow, 8), note: `Meter 6 share ${mNow}` },
      { id: 'pay_13', unitId: 'unit_br2', tenancyId: 't_imran', type: 'Electricity', amount: 200, date: d(mNow, 9), note: `Meter 6 partial share ${mNow}` },
      { id: 'pay_14', unitId: 'unit_br1', tenancyId: 't_vikram', type: 'Water', amount: 150, date: d(mNow, 7), note: `Water ${mNow}` },
      { id: 'pay_15', unitId: 'unit_br2', tenancyId: 't_imran', type: 'Water', amount: 100, date: d(mNow, 7), note: `Partial water ${mNow}` },
      { id: 'pay_16', unitId: 'unit_h1', tenancyId: 't_priya', type: 'Water', amount: 300, date: d(mNow, 6), note: `Water ${mNow}` }
    ];

    return st;
  }

  function mapLegacyPropToUnitId(propId, oldProps) {
    const p = (oldProps || []).find((x) => x.id === propId);
    const name = (p ? p.name : String(propId || '')).toLowerCase();
    if (name.includes('house 1') || propId === 'prop_h1') return 'unit_h1';
    if (name.includes('house 2') || propId === 'prop_h2') return 'unit_h2';
    if (name.includes('house 3') || propId === 'prop_h3') return 'unit_h3';
    if (name.includes('house 4') || propId === 'prop_h4') return 'unit_h4';
    if (name.includes('shop') || propId === 'prop_shop1') return 'unit_shop';
    if (name.includes('bachelor room 1') || propId === 'prop_br1') return 'unit_br1';
    if (name.includes('bachelor room 2') || propId === 'prop_br2') return 'unit_br2';
    return 'unit_h1';
  }

  function migrateFromV2(v2) {
    const st = createEmptyState(Boolean(v2.settings && v2.settings.isDemoData));
    if (v2.settings) {
      st.settings.currencySymbol = v2.settings.currencySymbol || '₹';
      st.settings.theme = v2.settings.theme || 'light';
      st.settings.lastBackupAt = v2.settings.lastBackupAt || null;
    }
    const oldProps = v2.properties || [];

    // Migrate tenants
    (v2.tenants || []).forEach((t) => {
      const unitId = mapLegacyPropToUnitId(t.propertyId, oldProps);
      const sett = (v2.settlements || []).find((s) => s.tenantId === t.id);
      st.tenancies.push({
        id: t.id,
        unitId,
        tenantName: t.fullName || 'Tenant',
        mobile: t.mobile || '',
        monthlyRent: Number(t.monthlyRent) || 0,
        advanceAmount: Number(t.depositAmount) || 0,
        joiningDate: t.moveInDate || App.H.todayISO(),
        leavingDate: t.moveOutDate || '',
        status: t.status === 'Vacated' ? 'Vacated' : 'Active',
        settlement: sett ? {
          leavingDate: sett.vacateDate,
          pendingRent: sett.outstandingRent || 0,
          pendingElec: 0,
          pendingWater: sett.outstandingUtilities || 0,
          paintingDeduction: 0,
          maintenanceDeduction: 0,
          otherDeduction: sett.totalDeductions || 0,
          refundedAmount: sett.actualRefundPaid || 0
        } : null
      });
    });

    const unitMap = Object.fromEntries(st.units.map((u) => [u.id, u]));
    st.tenancies.filter((t) => t.status === 'Active').forEach((t) => {
      const u = unitMap[t.unitId];
      if (u) {
        u.occupancyStatus = 'Occupied';
        u.currentTenancyId = t.id;
        u.monthlyRent = t.monthlyRent;
        u.advanceHeld = t.advanceAmount;
      }
    });

    (v2.rent_records || []).filter((r) => !r.isDeleted).forEach((r) => {
      st.rent_months.push({
        id: r.id,
        unitId: mapLegacyPropToUnitId(r.propertyId, oldProps),
        tenancyId: r.tenantId || null,
        month: r.billingMonth,
        expectedRent: Number(r.expectedRent) || 0,
        receivedAmount: Number(r.paidAmount) || 0,
        payments: (r.payments || []).map((p) => ({ id: p.id || App.H.uid('p'), amount: p.amount, date: p.date }))
      });
    });

    (v2.electricity_bills || []).filter((b) => !b.isDeleted).forEach((b) => {
      const unitId = mapLegacyPropToUnitId(b.propertyId, oldProps);
      const contribs = (v2.utility_contributions || [])
        .filter((c) => !c.isDeleted && c.originalBillId === b.id)
        .map((c) => ({ id: c.id, fromUnitId: mapLegacyPropToUnitId(c.contributingPropertyId, oldProps), amount: Number(c.amount) || 0 }));
      st.electricity_bills.push({
        id: b.id,
        isBachelorMeter: false,
        unitId,
        month: b.billingMonth,
        billAmount: Number(b.totalAmount) || 0,
        contributions: contribs,
        receivedAmount: Number(b.amountCollected) || 0,
        isOwnerExpense: b.paidBy === 'Owner' || b.status === 'Owner absorbed',
        payments: b.amountCollected > 0 ? [{ id: App.H.uid('ep'), amount: b.amountCollected, date: b.paymentDate || App.H.todayISO() }] : []
      });
    });

    (v2.water_bills || []).filter((b) => !b.isDeleted && b.propertyId).forEach((b) => {
      st.water_bills.push({
        id: b.id,
        unitId: mapLegacyPropToUnitId(b.propertyId, oldProps),
        month: b.billingMonth,
        billAmount: Number(b.totalAmount) || 0,
        receivedAmount: Number(b.amountCollected) || 0,
        isOwnerExpense: b.paidBy === 'Owner' || b.status === 'Owner absorbed',
        payments: b.amountCollected > 0 ? [{ id: App.H.uid('wp'), amount: b.amountCollected, date: b.paymentDate || App.H.todayISO() }] : []
      });
    });

    (v2.maintenance_records || []).filter((m) => !m.isDeleted).forEach((m) => {
      st.expenses.push({
        id: m.id,
        unitId: mapLegacyPropToUnitId(m.propertyId, oldProps),
        amount: Number(m.amount) || 0,
        category: m.category || 'Maintenance',
        date: m.date || App.H.todayISO(),
        description: m.description || '',
        settledInTenancyId: null
      });
    });

    (v2.financial_transactions || []).filter((ft) => !ft.isDeleted).forEach((ft) => {
      let type = 'Other';
      if (ft.type === 'Rent received') type = 'Rent';
      else if (ft.type === 'Electricity received') type = 'Electricity';
      else if (ft.type === 'Water bill received') type = 'Water';
      else if (ft.type === 'Advance received') type = 'Advance';
      else if (ft.type === 'Advance refunded') type = 'Advance Refund';
      else if (['Maintenance expense', 'Other expense', 'Deposit deduction'].includes(ft.type)) return;
      st.payments.push({
        id: ft.id,
        unitId: mapLegacyPropToUnitId(ft.propertyId, oldProps),
        tenancyId: ft.tenantId || null,
        type,
        amount: Number(ft.amount) || 0,
        date: ft.date || App.H.todayISO(),
        note: ft.description || ''
      });
    });

    return st;
  }

  let _state = null;

  function normalizeState(raw) {
    if (raw && raw.schemaVersion === 2) return migrateFromV2(raw);
    const base = createEmptyState(false);
    if (!raw || typeof raw !== 'object') return base;
    const merged = {
      ...base,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      settings: { ...base.settings, ...(raw.settings || {}) }
    };
    // Always guarantee the 7 fixed units exist in exact order
    const rawUnitsMap = Object.fromEntries((Array.isArray(raw.units) ? raw.units : []).map((u) => [u.id, u]));
    merged.units = FIXED_UNITS.map((fu) => ({
      ...fu,
      occupancyStatus: 'Vacant',
      currentTenancyId: null,
      monthlyRent: 0,
      advanceHeld: 0,
      ...(rawUnitsMap[fu.id] || {}),
      id: fu.id,
      name: fu.name,
      meterNo: fu.meterNo,
      meterLabel: fu.meterLabel,
      isBachelor: fu.isBachelor
    }));
    ['tenancies', 'rent_months', 'rent_revisions', 'electricity_bills', 'water_bills', 'expenses', 'payments'].forEach((k) => {
      if (!Array.isArray(merged[k])) merged[k] = [];
    });
    return merged;
  }

  function load() {
    try {
      const v3Raw = localStorage.getItem(STORAGE_KEY);
      if (v3Raw) {
        _state = normalizeState(JSON.parse(v3Raw));
        return _state;
      }
      const v2Raw = localStorage.getItem(LEGACY_V2_KEY);
      if (v2Raw) {
        const parsedV2 = JSON.parse(v2Raw);
        _state = migrateFromV2(parsedV2);
        save();
        return _state;
      }
    } catch (err) {
      console.error('Storage load error:', err);
    }
    _state = buildDemoState();
    save();
    return _state;
  }

  function save() {
    if (!_state) return;
    _state.settings.lastSavedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
      idbSave(_state);
    } catch (err) {
      console.error('Storage save failed:', err);
      if (App.H) App.H.toast('Storage warning: export a JSON backup.', 'warning');
    }
    if (App.updateSaveStatus) App.updateSaveStatus();
  }

  function getState() {
    if (!_state) load();
    return _state;
  }

  function exportJSON() {
    const st = getState();
    st.settings.lastBackupAt = new Date().toISOString();
    save();
    App.H.downloadFile(`propledger-backup-${App.H.todayISO()}.json`, JSON.stringify(st, null, 2), 'application/json;charset=utf-8');
    App.H.toast('JSON backup downloaded.', 'success');
  }

  function validateImport(parsed) {
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Invalid JSON file.' };
    if (parsed.schemaVersion === 2 && Array.isArray(parsed.properties) && Array.isArray(parsed.tenants)) {
      return { ok: true };
    }
    if (!Array.isArray(parsed.units) || !Array.isArray(parsed.tenancies) || !Array.isArray(parsed.rent_months)) {
      return { ok: false, error: 'Backup JSON is missing required PropLedger data arrays.' };
    }
    return { ok: true };
  }

  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return { ok: false, error: 'Could not parse JSON file.' };
    }
    const v = validateImport(parsed);
    if (!v.ok) return v;

    try {
      localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify(getState()));
    } catch (_) {}

    _state = normalizeState(parsed);
    save();
    return { ok: true };
  }

  function rollbackPreRestore() {
    try {
      const raw = localStorage.getItem(PRE_RESTORE_KEY);
      if (!raw) return false;
      _state = normalizeState(JSON.parse(raw));
      save();
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearDemoData() {
    const cur = getState();
    const fresh = createEmptyState(false);
    fresh.settings.theme = cur.settings.theme;
    fresh.settings.currencySymbol = cur.settings.currencySymbol;
    fresh.settings.buildingName = cur.settings.buildingName;
    fresh.settings.mpinHash = cur.settings.mpinHash || hashMpin('1234');
    fresh.settings.mpinIsDefault = Boolean(cur.settings.mpinIsDefault);
    _state = fresh;
    save();
  }

  function resetAll(withDemo = false) {
    const cur = getState();
    _state = withDemo ? buildDemoState() : createEmptyState(false);
    _state.settings.theme = cur.settings.theme;
    _state.settings.currencySymbol = cur.settings.currencySymbol;
    _state.settings.mpinHash = cur.settings.mpinHash || hashMpin('1234');
    _state.settings.mpinIsDefault = Boolean(cur.settings.mpinIsDefault);
    save();
  }

  const UNLOCK_KEY = 'propledger_unlocked_v3';

  function getMpinHash() {
    const s = getState().settings;
    return s.mpinHash || hashMpin('1234');
  }

  function isSessionUnlocked() {
    try {
      return localStorage.getItem(UNLOCK_KEY) === getMpinHash();
    } catch (_) {
      return false;
    }
  }

  function setSessionUnlocked(flag) {
    try {
      if (flag) localStorage.setItem(UNLOCK_KEY, getMpinHash());
      else localStorage.removeItem(UNLOCK_KEY);
    } catch (_) {}
  }

  function verifyMpin(pin) {
    if (!/^\d{4}$/.test(String(pin || ''))) return false;
    return hashMpin(pin) === getMpinHash();
  }

  function setMpin(currentPin, newPin) {
    if (!verifyMpin(currentPin)) return { ok: false, error: 'Current 4-digit MPIN is incorrect.' };
    if (!/^\d{4}$/.test(String(newPin || ''))) return { ok: false, error: 'New MPIN must be exactly 4 digits (0–9).' };
    const wasUnlocked = isSessionUnlocked();
    const s = getState().settings;
    s.mpinHash = hashMpin(newPin);
    s.mpinIsDefault = newPin === '1234';
    save();
    if (wasUnlocked) setSessionUnlocked(true);
    return { ok: true };
  }

  App.Store = {
    FIXED_UNITS,
    load,
    save,
    getState,
    exportJSON,
    importJSON,
    rollbackPreRestore,
    clearDemoData,
    resetAll,
    verifyMpin,
    setMpin,
    isSessionUnlocked,
    setSessionUnlocked,
    hasPreRestoreBackup: () => Boolean(localStorage.getItem(PRE_RESTORE_KEY))
  };
})(window);
