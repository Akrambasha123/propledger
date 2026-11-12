(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});

  let dashMonth = '';
  let selectedUnitId = 'unit_h1';
  let payTab = 'rent'; // rent | electricity | water | expenses
  let payMonth = '';
  let histUnit = 'all';
  let histMonth = '';
  let histKind = 'all';

  function renderQuickActions(container) {
    const M = App.Modals;
    return `
      <div class="quick-actions-bar">
        <button id="qa-add-tenant" class="btn btn-primary">+ Add Tenant</button>
        <button id="qa-collect-rent" class="btn btn-secondary">Collect Rent</button>
        <button id="qa-add-elec" class="btn btn-secondary">Add Electricity Bill</button>
        <button id="qa-add-water" class="btn btn-secondary">Add Water Bill</button>
        <button id="qa-add-exp" class="btn btn-secondary">Add Expense</button>
      </div>
    `;
  }

  function bindQuickActions(preUnitId = '') {
    const M = App.Modals;
    const t = document.getElementById('qa-add-tenant');
    const r = document.getElementById('qa-collect-rent');
    const e = document.getElementById('qa-add-elec');
    const w = document.getElementById('qa-add-water');
    const x = document.getElementById('qa-add-exp');
    if (t) t.addEventListener('click', () => M.openAddTenantModal(preUnitId));
    if (r) r.addEventListener('click', () => M.openCollectRentModal(preUnitId, dashMonth));
    if (e) e.addEventListener('click', () => M.openAddElectricityModal(preUnitId));
    if (w) w.addEventListener('click', () => M.openAddWaterModal(preUnitId));
    if (x) x.addEventListener('click', () => M.openAddExpenseModal(preUnitId));
  }

  // =========================================================================
  // 1. DASHBOARD
  // =========================================================================
  function renderDashboard(container) {
    const H = App.H;
    const E = App.Engine;
    const ym = dashMonth || H.currentMonth();
    const sum = E.getDashboardSummary(ym);

    container.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-1 mb-2">
        <div class="flex items-center gap-1">
          <label for="dash-m" class="small text-muted">Month:</label>
          <input id="dash-m" type="month" value="${H.esc(ym)}" style="width:auto" />
        </div>
        <span class="small text-muted">${H.formatMonth(ym)}</span>
      </div>

      ${renderQuickActions()}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Units</div>
          <div class="kpi-value">${sum.totalUnits}</div>
          <div class="kpi-sub">${sum.occupiedCount} Occupied · ${sum.vacantCount} Vacant</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Expected Monthly Rent</div>
          <div class="kpi-value">${H.formatCurrency(sum.expectedRent)}</div>
          <div class="kpi-sub">${H.formatMonth(ym)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Rent Collected</div>
          <div class="kpi-value text-success">${H.formatCurrency(sum.collectedRent)}</div>
          <div class="kpi-sub">This month</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Rent</div>
          <div class="kpi-value ${sum.pendingRent > 0 ? 'text-danger' : 'text-success'}">${H.formatCurrency(sum.pendingRent)}</div>
          <div class="kpi-sub">Remaining to collect</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Advance Held</div>
          <div class="kpi-value">${H.formatCurrency(sum.totalAdvanceHeld)}</div>
          <div class="kpi-sub">Active tenant deposits</div>
        </div>
      </div>

      <h3 class="mb-2" style="font-size:15px">All 7 Rental Units</h3>
      <div class="property-grid">
        ${sum.unitCards.map((c) => `
          <div class="property-card">
            <div class="property-card-head">
              <div>
                <h4 class="property-name">${H.esc(c.unit.name)}</h4>
                <div class="small text-muted">${c.tenant ? H.esc(c.tenant.tenantName) : 'No tenant'}</div>
              </div>
              ${H.statusBadge(c.unit.occupancyStatus)}
            </div>
            <div class="property-meta">
              <div>
                <div class="small text-muted">Monthly Rent</div>
                <div class="mono fw-700">${H.formatCurrency(c.unit.monthlyRent)}</div>
              </div>
              <div>
                <div class="small text-muted">Rent Status</div>
                <div>${H.statusBadge(c.rentStatus)}</div>
              </div>
              ${c.unit.occupancyStatus === 'Occupied' ? `
                <div>
                  <div class="small text-muted">Received</div>
                  <div class="mono text-success fw-600">${H.formatCurrency(c.receivedMonth)}</div>
                </div>
                <div>
                  <div class="small text-muted">Pending</div>
                  <div class="mono ${c.pendingMonth > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(c.pendingMonth)}</div>
                </div>
              ` : ''}
            </div>
            <div class="flex gap-1">
              <button class="btn btn-primary btn-sm open-prop-btn" style="flex:1" data-id="${H.esc(c.unit.id)}">Open Property</button>
              ${c.unit.occupancyStatus === 'Occupied' && c.pendingMonth > 0
                ? `<button class="btn btn-secondary btn-sm quick-pay-btn" data-id="${H.esc(c.unit.id)}">Collect</button>`
                : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    bindQuickActions();
    document.getElementById('dash-m').addEventListener('change', (e) => { dashMonth = e.target.value || H.currentMonth(); renderDashboard(container); });
    container.querySelectorAll('.open-prop-btn').forEach((b) => b.addEventListener('click', () => {
      selectedUnitId = b.dataset.id;
      App.navigate('properties');
    }));
    container.querySelectorAll('.quick-pay-btn').forEach((b) => b.addEventListener('click', () => {
      App.Modals.openCollectRentModal(b.dataset.id, ym);
    }));
  }

  // =========================================================================
  // 2. PROPERTIES (7 Independent Units + Dedicated Details & Timeline)
  // =========================================================================
  function renderProperties(container) {
    const H = App.H;
    const E = App.Engine;
    const M = App.Modals;
    const st = App.Store.getState();

    const bal = E.getUnitBalances(selectedUnitId);
    const u = bal.unit;
    const pastTenants = st.tenancies.filter((t) => t.unitId === u.id && t.status === 'Vacated').slice().reverse();
    const timeline = E.getTimeline(u.id);

    container.innerHTML = `
      <!-- 7 Unit Switcher -->
      <div class="flex flex-wrap gap-1 mb-3">
        ${st.units.map((unit) => `
          <button class="btn btn-sm ${unit.id === u.id ? 'btn-primary' : 'btn-secondary'} sel-unit-btn" data-id="${H.esc(unit.id)}">
            ${H.esc(unit.name)}
          </button>
        `).join('')}
      </div>

      <!-- Independent Property Details Card -->
      <div class="card mb-3">
        <div class="card-header">
          <div>
            <h3 class="card-title" style="font-size:18px">${H.esc(u.name)}</h3>
            <span class="small text-muted">${H.esc(u.meterLabel)}</span>
          </div>
          ${H.statusBadge(u.occupancyStatus)}
        </div>
        <div class="card-body">
          <div class="summary-box mb-2">
            <div>
              <div class="summary-item-label">Current Tenant</div>
              <div class="summary-item-val" style="font-size:15px">${bal.tenant ? H.esc(bal.tenant.tenantName) : 'Vacant'}</div>
              ${bal.tenant && bal.tenant.mobile ? `<div class="small text-muted">${H.esc(bal.tenant.mobile)}</div>` : ''}
            </div>
            <div>
              <div class="summary-item-label">Monthly Rent</div>
              <div class="summary-item-val">${H.formatCurrency(u.monthlyRent)}</div>
            </div>
            <div>
              <div class="summary-item-label">Advance Held</div>
              <div class="summary-item-val text-success">${H.formatCurrency(bal.advanceHeld)}</div>
            </div>
            <div>
              <div class="summary-item-label">Pending Rent</div>
              <div class="summary-item-val ${bal.totalPendingRent > 0 ? 'text-danger' : ''}">${H.formatCurrency(bal.totalPendingRent)}</div>
            </div>
            <div>
              <div class="summary-item-label">Pending Elec / Water</div>
              <div class="summary-item-val ${(bal.pendingElec + bal.pendingWater) > 0 ? 'text-danger' : ''}">${H.formatCurrency(bal.pendingElec)} / ${H.formatCurrency(bal.pendingWater)}</div>
            </div>
          </div>

          <!-- Major Property Actions -->
          <div class="flex flex-wrap gap-1">
            ${u.occupancyStatus === 'Vacant'
              ? `<button id="prop-add-ten-btn" class="btn btn-primary">+ Add Tenant</button>`
              : `<button id="prop-rec-pay-btn" class="btn btn-primary">Record Payment</button>
                 <button id="prop-edit-ten-btn" class="btn btn-secondary">Edit Tenant</button>
                 <button id="prop-chg-rent-btn" class="btn btn-secondary">Change Rent</button>
                 <button id="prop-vacate-btn" class="btn btn-danger">Vacate &amp; Settle</button>`}
            ${u.occupancyStatus === 'Vacant' ? `<button id="prop-rec-pay-btn" class="btn btn-secondary">Record Payment</button>` : ''}
            <button id="prop-add-elec-btn" class="btn btn-secondary">+ Elec Bill</button>
            <button id="prop-add-water-btn" class="btn btn-secondary">+ Water Bill</button>
            <button id="prop-add-exp-btn" class="btn btn-secondary">+ Expense</button>
          </div>
        </div>
      </div>

      ${pastTenants.length > 0 ? `
        <div class="card mb-3">
          <div class="card-header"><h3 class="card-title">Previous Tenants (${pastTenants.length})</h3></div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Tenant</th><th>Stay</th><th class="text-right">Rent</th><th class="text-right">Advance</th><th class="text-right">Refunded</th><th>Action</th></tr></thead>
              <tbody>
                ${pastTenants.map((t) => `
                  <tr>
                    <td data-label="Tenant"><strong>${H.esc(t.tenantName)}</strong>${t.mobile ? `<div class="small text-muted">${H.esc(t.mobile)}</div>` : ''}</td>
                    <td data-label="Stay" class="small">${H.formatDate(t.joiningDate)} → ${H.formatDate(t.leavingDate)}</td>
                    <td data-label="Rent" class="text-right mono">${H.formatCurrency(t.monthlyRent)}</td>
                    <td data-label="Advance" class="text-right mono">${H.formatCurrency(t.advanceAmount)}</td>
                    <td data-label="Refunded" class="text-right mono text-success fw-600">${H.formatCurrency(t.settlement?.refundedAmount || 0)}</td>
                    <td data-label="Action"><button class="btn btn-secondary btn-xs edit-ten-row-btn" data-id="${H.esc(t.id)}">Edit</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Complete Independent Timeline for This Property -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${H.esc(u.name)} — Activity Timeline (${timeline.length})</h3>
        </div>
        <div class="timeline-list">
          ${timeline.length === 0
            ? '<div class="card-body text-muted small">No activity recorded for this unit yet.</div>'
            : timeline.map((it) => `
              <div class="timeline-item">
                <div>
                  <div class="flex items-center gap-1 flex-wrap">
                    <strong>${H.esc(it.kind)}</strong>
                    <span class="small text-muted">${H.formatDate(it.date)}</span>
                  </div>
                  <div class="small text-muted">${H.esc(it.detail)}</div>
                </div>
                <div class="flex items-center gap-1">
                  <div class="mono fw-700 ${it.sign === '+' ? 'text-success' : it.sign === '-' ? 'text-danger' : ''}">
                    ${it.sign}${H.formatCurrency(it.amount)}
                  </div>
                  ${it.recordId ? `<button class="btn btn-ghost btn-xs edit-tl-btn" data-rtype="${H.esc(it.recordType)}" data-rid="${H.esc(it.recordId)}">Edit</button>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.sel-unit-btn').forEach((b) => b.addEventListener('click', () => {
      selectedUnitId = b.dataset.id;
      renderProperties(container);
    }));

    const addTenBtn = document.getElementById('prop-add-ten-btn');
    if (addTenBtn) addTenBtn.addEventListener('click', () => M.openAddTenantModal(u.id));
    const editTenBtn = document.getElementById('prop-edit-ten-btn');
    if (editTenBtn && bal.tenant) editTenBtn.addEventListener('click', () => M.openEditTenantModal(bal.tenant.id));
    document.getElementById('prop-rec-pay-btn').addEventListener('click', () => M.openRecordPaymentModal(u.id));
    const chgRentBtn = document.getElementById('prop-chg-rent-btn');
    if (chgRentBtn) chgRentBtn.addEventListener('click', () => M.openChangeRentModal(u.id));
    const vacBtn = document.getElementById('prop-vacate-btn');
    if (vacBtn) vacBtn.addEventListener('click', () => M.openVacateModal(u.id));
    document.getElementById('prop-add-elec-btn').addEventListener('click', () => M.openAddElectricityModal(u.id));
    document.getElementById('prop-add-water-btn').addEventListener('click', () => M.openAddWaterModal(u.id));
    document.getElementById('prop-add-exp-btn').addEventListener('click', () => M.openAddExpenseModal(u.id));
    container.querySelectorAll('.edit-ten-row-btn').forEach((b) => b.addEventListener('click', () => M.openEditTenantModal(b.dataset.id)));
    container.querySelectorAll('.edit-tl-btn').forEach((b) => b.addEventListener('click', () => openTimelineItemEditor(b.dataset.rtype, b.dataset.rid)));
  }

  function openTimelineItemEditor(recordType, recordId) {
    const M = App.Modals;
    if (recordType === 'tenancy') M.openEditTenantModal(recordId);
    else if (recordType === 'payment') M.openEditPaymentModal(recordId);
    else if (recordType === 'elec') M.openEditElectricityModal(recordId);
    else if (recordType === 'water') M.openEditWaterModal(recordId);
    else if (recordType === 'expense') M.openEditExpenseModal(recordId);
  }

  // =========================================================================
  // 3. PAYMENTS & BILLS
  // =========================================================================
  function renderPaymentsBills(container) {
    const H = App.H;
    const E = App.Engine;
    const M = App.Modals;
    const st = App.Store.getState();
    const ym = payMonth || H.currentMonth();

    const rentRows = st.units.map((u) => E.getUnitBalances(u.id, ym));
    const m6Bills = st.electricity_bills.filter((b) => b.isBachelorMeter && (!payMonth || b.month === ym));
    const indElecBills = st.electricity_bills.filter((b) => !b.isBachelorMeter && (!payMonth || b.month === ym));
    const waterBills = st.water_bills.filter((w) => !payMonth || w.month === ym);
    const expenses = st.expenses.filter((e) => !payMonth || (e.date && e.date.startsWith(ym)));

    container.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-1">
          <label for="pb-month" class="small text-muted">Month:</label>
          <input id="pb-month" type="month" value="${H.esc(payMonth)}" style="width:auto" />
          ${payMonth ? '<button id="pb-all-m-btn" class="btn btn-ghost btn-xs">Show All</button>' : `<span class="small text-muted">(Rent showing ${H.formatMonth(ym)})</span>`}
        </div>
        <div class="flex flex-wrap gap-1">
          <button id="pb-rec-pay-btn" class="btn btn-primary btn-sm">+ Record Payment</button>
          <button id="pb-add-elec-btn" class="btn btn-secondary btn-sm">+ Elec Bill</button>
          <button id="pb-add-water-btn" class="btn btn-secondary btn-sm">+ Water Bill</button>
          <button id="pb-add-exp-btn" class="btn btn-secondary btn-sm">+ Expense</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${payTab === 'rent' ? 'active' : ''}" data-ptab="rent">Rent</button>
        <button class="tab-btn ${payTab === 'electricity' ? 'active' : ''}" data-ptab="electricity">Electricity (6 Meters)</button>
        <button class="tab-btn ${payTab === 'water' ? 'active' : ''}" data-ptab="water">Water (7 Units)</button>
        <button class="tab-btn ${payTab === 'expenses' ? 'active' : ''}" data-ptab="expenses">Expenses</button>
      </div>

      ${payTab === 'rent' ? `
        <div class="card">
          <div class="card-header"><h3 class="card-title">Monthly Rent Register — ${H.formatMonth(ym)}</h3></div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Property</th><th>Tenant</th><th class="text-right">Expected</th><th class="text-right">Received</th><th class="text-right">Remaining</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${rentRows.map((r) => `
                  <tr>
                    <td data-label="Property"><strong>${H.esc(r.unit.name)}</strong></td>
                    <td data-label="Tenant">${r.tenant ? H.esc(r.tenant.tenantName) : '<span class="text-muted">Vacant</span>'}</td>
                    <td data-label="Expected" class="text-right mono">${H.formatCurrency(r.expectedMonth)}</td>
                    <td data-label="Received" class="text-right mono text-success">${H.formatCurrency(r.receivedMonth)}</td>
                    <td data-label="Remaining" class="text-right mono ${r.pendingMonth > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(r.pendingMonth)}</td>
                    <td data-label="Status">${H.statusBadge(r.rentStatus)}</td>
                    <td data-label="Action">
                      <div class="flex gap-1">
                        ${r.unit.occupancyStatus === 'Occupied' && r.pendingMonth > 0
                          ? `<button class="btn btn-primary btn-xs pb-pay-rent" data-id="${H.esc(r.unit.id)}">Collect</button>`
                          : ''}
                        <button class="btn btn-secondary btn-xs pb-edit-rent" data-id="${H.esc(r.unit.id)}">Edit</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : payTab === 'electricity' ? `
        <!-- Meter 6: Bachelor Rooms Unique Shared Meter (Split & Assign -> Then Collect Separately) -->
        <div class="card mb-3">
          <div class="card-header">
            <div>
              <h3 class="card-title">Meter 6: Bachelor Room 1 &amp; 2 (Shared Meter)</h3>
              <span class="small text-muted">Split total bill &amp; assign shares first, then collect separately from each room</span>
            </div>
            <button id="pb-add-m6-btn" class="btn btn-primary btn-xs">+ Split &amp; Record Bill</button>
          </div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Month</th><th>Unit</th><th class="text-right">Assigned Share</th><th class="text-right">Collected</th><th class="text-right">Pending</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${m6Bills.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No Meter 6 bills recorded.</td></tr>' :
                  m6Bills.flatMap((b) => {
                    const br1Pend = H.nonNeg((b.br1Share || 0) - (b.br1Received || 0));
                    const br2Pend = H.nonNeg((b.br2Share || 0) - (b.br2Received || 0));
                    const combined = H.toMoney((b.br1Share || 0) + (b.br2Share || 0));
                    return [
                      `<tr>
                        <td data-label="Month"><strong>${H.formatMonth(b.month)}</strong><div class="small text-muted">Total Bill: ${H.formatCurrency(combined)}</div></td>
                        <td data-label="Unit"><strong>Bachelor Room 1</strong></td>
                        <td data-label="Assigned Share" class="text-right mono">${H.formatCurrency(b.br1Share)}</td>
                        <td data-label="Collected" class="text-right mono text-success">${H.formatCurrency(b.br1Received)}</td>
                        <td data-label="Pending" class="text-right mono ${br1Pend > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(br1Pend)}</td>
                        <td data-label="Status">${H.statusBadge(br1Pend <= 0 ? 'Paid' : b.br1Received > 0 ? 'Partial' : 'Pending')}</td>
                        <td data-label="Action"><div class="flex gap-1">${br1Pend > 0 ? `<button class="btn btn-primary btn-xs pb-pay-m6" data-id="${H.esc(b.id)}" data-room="br1" data-pend="${br1Pend}">Collect BR1</button>` : ''}<button class="btn btn-secondary btn-xs pb-edit-elec" data-id="${H.esc(b.id)}">Edit Split</button></div></td>
                      </tr>`,
                      `<tr>
                        <td data-label="Month"><strong>${H.formatMonth(b.month)}</strong><div class="small text-muted">Total Bill: ${H.formatCurrency(combined)}</div></td>
                        <td data-label="Unit"><strong>Bachelor Room 2</strong></td>
                        <td data-label="Assigned Share" class="text-right mono">${H.formatCurrency(b.br2Share)}</td>
                        <td data-label="Collected" class="text-right mono text-success">${H.formatCurrency(b.br2Received)}</td>
                        <td data-label="Pending" class="text-right mono ${br2Pend > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(br2Pend)}</td>
                        <td data-label="Status">${H.statusBadge(br2Pend <= 0 ? 'Paid' : b.br2Received > 0 ? 'Partial' : 'Pending')}</td>
                        <td data-label="Action"><div class="flex gap-1">${br2Pend > 0 ? `<button class="btn btn-primary btn-xs pb-pay-m6" data-id="${H.esc(b.id)}" data-room="br2" data-pend="${br2Pend}">Collect BR2</button>` : ''}<button class="btn btn-secondary btn-xs pb-edit-elec" data-id="${H.esc(b.id)}">Edit Split</button></div></td>
                      </tr>`
                    ];
                  }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meters 1-5: Separate Individual Meter Card for Each House & Shop -->
        <h3 class="mb-2" style="font-size:15px">Individual House &amp; Shop Meters (Separate per Unit)</h3>
        <div class="meter-grid">
          ${st.units.filter((u) => !u.isBachelor).map((unit) => {
            const unitBills = indElecBills.filter((b) => b.unitId === unit.id);
            const t = E.getActiveTenancy(unit.id);
            return `
              <div class="card">
                <div class="card-header">
                  <div>
                    <h4 class="card-title">Meter ${unit.meterNo}: ${H.esc(unit.name)}</h4>
                    <span class="small text-muted">${t ? H.esc(t.tenantName) : 'Vacant (Owner Expense)'}</span>
                  </div>
                  <button class="btn btn-secondary btn-xs pb-add-unit-elec" data-unit="${H.esc(unit.id)}">+ Add Bill</button>
                </div>
                <div class="card-body">
                  ${unitBills.length === 0 ? '<p class="small text-muted" style="margin:0">No electricity bills for this meter.</p>' :
                    unitBills.map((b) => {
                      const cSum = E.getIndividualElecContribsSum(b);
                      const net = E.getIndividualElecNet(b);
                      const pend = b.isOwnerExpense ? 0 : H.nonNeg(net - (b.receivedAmount || 0));
                      const status = b.isOwnerExpense ? 'Owner Expense' : pend <= 0 ? 'Paid' : b.receivedAmount > 0 ? 'Partial' : 'Pending';
                      const contribDesc = (b.contributions || []).map((c) => `${E.getUnitName(c.fromUnitId)}: ${H.formatCurrency(c.amount)}`).join(', ');
                      return `
                        <div class="alert mb-1" style="background:var(--bg-subtle)">
                          <div class="flex justify-between items-center mb-1">
                            <strong>${H.formatMonth(b.month)}</strong>
                            ${H.statusBadge(status)}
                          </div>
                          <div class="small">
                            Bill: <strong class="mono">${H.formatCurrency(b.billAmount)}</strong>
                            ${cSum > 0 ? ` · Contribs: <span class="mono">-${H.formatCurrency(cSum)}</span> · Net: <strong class="mono">${H.formatCurrency(net)}</strong>` : ''}
                          </div>
                          ${contribDesc ? `<div class="small text-muted">From: ${H.esc(contribDesc)}</div>` : ''}
                          <div class="small mt-1">
                            Received: <span class="mono text-success fw-600">${H.formatCurrency(b.receivedAmount)}</span> ·
                            Pending: <span class="mono ${pend > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(pend)}</span>
                          </div>
                          <div class="flex flex-wrap gap-1 mt-1">
                            ${pend > 0 ? `<button class="btn btn-primary btn-xs pb-pay-ind-e" data-id="${H.esc(b.id)}" data-pend="${pend}" data-unit="${H.esc(b.unitId)}">Collect</button>` : ''}
                            <button class="btn btn-secondary btn-xs pb-add-contrib" data-id="${H.esc(b.id)}">+ Contrib</button>
                            <button class="btn btn-secondary btn-xs pb-edit-elec" data-id="${H.esc(b.id)}">Edit</button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : payTab === 'water' ? `
        <div class="card">
          <div class="card-header"><h3 class="card-title">Independent Water Bills (All 7 Units)</h3></div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Month</th><th>Property</th><th class="text-right">Water Bill</th><th class="text-right">Received</th><th class="text-right">Pending</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${waterBills.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No water bills recorded.</td></tr>' :
                  waterBills.map((w) => {
                    const pend = w.isOwnerExpense ? 0 : H.nonNeg(w.billAmount - w.receivedAmount);
                    const status = w.isOwnerExpense ? 'Owner Expense' : pend <= 0 ? 'Paid' : w.receivedAmount > 0 ? 'Partial' : 'Pending';
                    return `
                      <tr>
                        <td data-label="Month">${H.formatMonth(w.month)}</td>
                        <td data-label="Property"><strong>${H.esc(E.getUnitName(w.unitId))}</strong></td>
                        <td data-label="Bill" class="text-right mono">${H.formatCurrency(w.billAmount)}</td>
                        <td data-label="Received" class="text-right mono text-success">${H.formatCurrency(w.receivedAmount)}</td>
                        <td data-label="Pending" class="text-right mono ${pend > 0 ? 'text-danger fw-600' : ''}">${H.formatCurrency(pend)}</td>
                        <td data-label="Status">${H.statusBadge(status)}</td>
                        <td data-label="Action"><div class="flex gap-1">${pend > 0 ? `<button class="btn btn-primary btn-xs pb-pay-water" data-id="${H.esc(w.id)}" data-pend="${pend}" data-unit="${H.esc(w.unitId)}">Collect</button>` : ''}<button class="btn btn-secondary btn-xs pb-edit-water" data-id="${H.esc(w.id)}">Edit</button></div></td>
                      </tr>
                    `;
                  }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="card-header"><h3 class="card-title">Maintenance &amp; Other Expenses</h3></div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Date</th><th>Property</th><th>Category</th><th>Description</th><th class="text-right">Amount</th><th>Action</th></tr></thead>
              <tbody>
                ${expenses.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">No expenses recorded.</td></tr>' :
                  expenses.map((e) => `
                    <tr>
                      <td data-label="Date">${H.formatDate(e.date)}</td>
                      <td data-label="Property"><strong>${H.esc(E.getUnitName(e.unitId))}</strong></td>
                      <td data-label="Category"><span class="badge badge-neutral">${H.esc(e.category)}</span></td>
                      <td data-label="Description">${H.esc(e.description || '—')}</td>
                      <td data-label="Amount" class="text-right mono fw-600">${H.formatCurrency(e.amount)}</td>
                      <td data-label="Action"><button class="btn btn-secondary btn-xs pb-edit-exp" data-id="${H.esc(e.id)}">Edit</button></td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById('pb-month').addEventListener('change', (e) => { payMonth = e.target.value; renderPaymentsBills(container); });
    const allBtn = document.getElementById('pb-all-m-btn');
    if (allBtn) allBtn.addEventListener('click', () => { payMonth = ''; renderPaymentsBills(container); });
    container.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { payTab = b.dataset.ptab; renderPaymentsBills(container); }));

    document.getElementById('pb-rec-pay-btn').addEventListener('click', () => M.openRecordPaymentModal());
    document.getElementById('pb-add-elec-btn').addEventListener('click', () => M.openAddElectricityModal());
    document.getElementById('pb-add-water-btn').addEventListener('click', () => M.openAddWaterModal());
    document.getElementById('pb-add-exp-btn').addEventListener('click', () => M.openAddExpenseModal());

    const m6Btn = document.getElementById('pb-add-m6-btn');
    if (m6Btn) m6Btn.addEventListener('click', () => M.openAddElectricityModal('unit_br1'));
    container.querySelectorAll('.pb-add-unit-elec').forEach((b) => b.addEventListener('click', () => M.openAddElectricityModal(b.dataset.unit)));

    container.querySelectorAll('.pb-pay-rent').forEach((b) => b.addEventListener('click', () => M.openCollectRentModal(b.dataset.id, ym)));
    container.querySelectorAll('.pb-edit-rent').forEach((b) => b.addEventListener('click', () => M.openEditRentMonthModal(b.dataset.id, ym)));
    container.querySelectorAll('.pb-add-contrib').forEach((b) => b.addEventListener('click', () => M.openAddContributionModal(b.dataset.id)));
    container.querySelectorAll('.pb-edit-elec').forEach((b) => b.addEventListener('click', () => M.openEditElectricityModal(b.dataset.id)));
    container.querySelectorAll('.pb-edit-water').forEach((b) => b.addEventListener('click', () => M.openEditWaterModal(b.dataset.id)));
    container.querySelectorAll('.pb-edit-exp').forEach((b) => b.addEventListener('click', () => M.openEditExpenseModal(b.dataset.id)));
    container.querySelectorAll('.pb-pay-m6').forEach((b) => b.addEventListener('click', () => {
      const unitId = b.dataset.room === 'br2' ? 'unit_br2' : 'unit_br1';
      M.openRecordPaymentModal(unitId, 'Electricity', b.dataset.pend);
    }));
    container.querySelectorAll('.pb-pay-ind-e').forEach((b) => b.addEventListener('click', () => {
      M.openRecordPaymentModal(b.dataset.unit, 'Electricity', b.dataset.pend);
    }));
    container.querySelectorAll('.pb-pay-water').forEach((b) => b.addEventListener('click', () => {
      M.openRecordPaymentModal(b.dataset.unit, 'Water', b.dataset.pend);
    }));
  }

  // =========================================================================
  // 4. HISTORY (Complete Building & Per-Property Activity Timeline)
  // =========================================================================
  function renderHistory(container) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();

    const raw = E.getTimeline(histUnit === 'all' ? null : histUnit);
    const items = raw.filter((it) => {
      if (histMonth && !(it.date || '').startsWith(histMonth)) return false;
      if (histKind !== 'all' && !it.kind.toLowerCase().includes(histKind)) return false;
      return true;
    });

    container.innerHTML = `
      <div class="filter-bar">
        <select id="hist-unit">
          <option value="all">All 7 Properties</option>
          ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${histUnit === u.id ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
        </select>
        <input id="hist-month" type="month" value="${H.esc(histMonth)}" />
        <select id="hist-kind">
          <option value="all" ${histKind === 'all' ? 'selected' : ''}>All Activity</option>
          <option value="rent" ${histKind === 'rent' ? 'selected' : ''}>Rent</option>
          <option value="electricity" ${histKind === 'electricity' ? 'selected' : ''}>Electricity</option>
          <option value="water" ${histKind === 'water' ? 'selected' : ''}>Water</option>
          <option value="maintenance" ${histKind === 'maintenance' ? 'selected' : ''}>Maintenance / Expenses</option>
          <option value="tenant" ${histKind === 'tenant' ? 'selected' : ''}>Tenant Join / Vacate</option>
        </select>
        <button id="hist-clear" class="btn btn-ghost btn-xs">Clear</button>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Complete Activity History (${items.length})</h3></div>
        <div class="timeline-list">
          ${items.length === 0
            ? '<div class="card-body text-muted small">No matching history records.</div>'
            : items.map((it) => `
              <div class="timeline-item">
                <div>
                  <div class="flex items-center gap-1 flex-wrap">
                    <span class="badge badge-neutral">${H.esc(E.getUnitName(it.unitId))}</span>
                    <strong>${H.esc(it.kind)}</strong>
                    <span class="small text-muted">${H.formatDate(it.date)}</span>
                  </div>
                  <div class="small text-muted mt-1">${H.esc(it.detail)}</div>
                </div>
                <div class="flex items-center gap-1">
                  <div class="mono fw-700 ${it.sign === '+' ? 'text-success' : it.sign === '-' ? 'text-danger' : ''}">
                    ${it.sign}${H.formatCurrency(it.amount)}
                  </div>
                  ${it.recordId ? `<button class="btn btn-ghost btn-xs edit-hist-btn" data-rtype="${H.esc(it.recordType)}" data-rid="${H.esc(it.recordId)}">Edit</button>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;

    document.getElementById('hist-unit').addEventListener('change', (e) => { histUnit = e.target.value; renderHistory(container); });
    document.getElementById('hist-month').addEventListener('change', (e) => { histMonth = e.target.value; renderHistory(container); });
    document.getElementById('hist-kind').addEventListener('change', (e) => { histKind = e.target.value; renderHistory(container); });
    document.getElementById('hist-clear').addEventListener('click', () => { histUnit = 'all'; histMonth = ''; histKind = 'all'; renderHistory(container); });
    container.querySelectorAll('.edit-hist-btn').forEach((b) => b.addEventListener('click', () => openTimelineItemEditor(b.dataset.rtype, b.dataset.rid)));
  }

  // =========================================================================
  // 5. SETTINGS (JSON Backup, JSON Restore & Basic Preferences)
  // =========================================================================
  function renderSettings(container) {
    const H = App.H;
    const st = App.Store.getState();
    const s = st.settings;

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3 class="card-title">JSON Backup &amp; Restore</h3></div>
          <div class="card-body">
            <p class="small text-muted mb-2">
              All data is automatically saved in this browser. Download a JSON backup to keep a copy on your device (not automatically synced to GitHub).
            </p>
            <div class="summary-box mb-2">
              <div><div class="summary-item-label">Last Backup</div><div class="small fw-600">${s.lastBackupAt ? H.formatDate(s.lastBackupAt) : 'Not downloaded yet'}</div></div>
              <div><div class="summary-item-label">Last Auto-Save</div><div class="small fw-600">${s.lastSavedAt ? H.esc(s.lastSavedAt.replace('T', ' ').slice(0, 16)) : '—'}</div></div>
            </div>
            <div class="flex flex-wrap gap-1 mb-2">
              <button id="set-export-btn" class="btn btn-primary btn-sm">Export JSON Backup</button>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                Restore JSON Backup
                <input id="set-import-file" type="file" accept=".json,application/json" class="hidden" />
              </label>
              ${App.Store.hasPreRestoreBackup() ? '<button id="set-rollback-btn" class="btn btn-secondary btn-sm">Undo Last Restore</button>' : ''}
            </div>
            <hr style="border:none; border-top:1px solid var(--border); margin:14px 0" />
            <div class="flex flex-wrap gap-1">
              ${s.isDemoData
                ? '<button id="set-clear-demo-btn" class="btn btn-secondary btn-sm">Clear Demo Data (Start Clean)</button>'
                : '<button id="set-load-demo-btn" class="btn btn-secondary btn-sm">Load Sample Data</button>'}
              <button id="set-reset-btn" class="btn btn-danger btn-sm">Reset All Data</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">Basic Preferences</h3></div>
          <div class="card-body">
            <form class="form-grid">
              <div class="form-group full">
                <label for="pref-bname">Building Name</label>
                <input id="pref-bname" type="text" value="${H.esc(s.buildingName || 'My Rental Building')}" />
              </div>
              <div class="form-group">
                <label for="pref-curr">Currency Symbol</label>
                <input id="pref-curr" type="text" value="${H.esc(s.currencySymbol || '₹')}" maxlength="4" />
              </div>
              <div class="form-group">
                <label for="pref-theme">Theme</label>
                <select id="pref-theme">
                  <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
                  <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
              </div>
            </form>
            <div class="mt-2">
              <button id="pref-save-btn" class="btn btn-primary btn-sm">Save Preferences</button>
            </div>

            <hr style="border:none; border-top:1px solid var(--border); margin:16px 0" />
            <h4 class="mb-1" style="margin-top:0">4-Digit MPIN Lock</h4>
            <form class="form-grid">
              <div class="form-group">
                <label for="mpin-cur">Current 4-Digit MPIN</label>
                <input id="mpin-cur" type="password" inputmode="numeric" maxlength="4" placeholder="Current MPIN" />
              </div>
              <div class="form-group">
                <label for="mpin-new">New 4-Digit MPIN</label>
                <input id="mpin-new" type="password" inputmode="numeric" maxlength="4" placeholder="4 digits" />
              </div>
            </form>
            <div class="mt-2 flex gap-1">
              <button id="mpin-change-btn" class="btn btn-secondary btn-sm">Update MPIN</button>
              <button id="mpin-lock-now-btn" class="btn btn-ghost btn-sm">Lock Panel Now</button>
            </div>

            <hr style="border:none; border-top:1px solid var(--border); margin:16px 0" />
            <h4 class="mb-1" style="margin-top:0">Install as Mobile / Desktop App</h4>
            <p class="small text-muted mb-1">
              When hosted over HTTPS (such as GitHub Pages), install PropLedger to your phone's home screen so it opens like a native app.
            </p>
            <button id="set-install-app-btn" class="btn btn-primary btn-sm">Install App</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('set-export-btn').addEventListener('click', () => { App.Store.exportJSON(); renderSettings(container); });
    document.getElementById('set-import-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const text = await f.text();
      const ok = await H.confirmDialog({
        title: 'Restore Backup',
        message: 'Replace current records with this JSON backup? (A snapshot of your current data will be saved first.)',
        confirmText: 'Restore',
        danger: false
      });
      if (!ok) { e.target.value = ''; return; }
      const res = App.Store.importJSON(text);
      if (!res.ok) return H.toast(res.error, 'error');
      H.toast('Backup restored.', 'success');
      App.applyTheme();
      App.refresh();
    });

    const rbBtn = document.getElementById('set-rollback-btn');
    if (rbBtn) rbBtn.addEventListener('click', () => { if (App.Store.rollbackPreRestore()) { H.toast('Previous snapshot restored.', 'success'); App.refresh(); } });

    const clrBtn = document.getElementById('set-clear-demo-btn');
    if (clrBtn) clrBtn.addEventListener('click', async () => {
      if (await H.confirmDialog({ title: 'Clear Demo Data', message: 'Remove sample data and keep the 7 empty units ready for real entries?', confirmText: 'Clear Demo' })) {
        App.Store.clearDemoData();
        H.toast('Demo data cleared.', 'success');
        App.navigate('dashboard');
      }
    });

    const ldBtn = document.getElementById('set-load-demo-btn');
    if (ldBtn) ldBtn.addEventListener('click', async () => {
      if (await H.confirmDialog({ title: 'Load Sample Data', message: 'Replace current data with sample demo records?', confirmText: 'Load Sample', danger: false })) {
        App.Store.resetAll(true);
        H.toast('Sample data loaded.', 'success');
        App.navigate('dashboard');
      }
    });

    document.getElementById('set-reset-btn').addEventListener('click', async () => {
      if (await H.confirmDialog({ title: 'Reset All Data', message: 'Erase all records and reset the 7 units to vacant?', confirmText: 'Reset Everything' })) {
        App.Store.resetAll(false);
        H.toast('All data reset.', 'info');
        App.navigate('dashboard');
      }
    });

    document.getElementById('pref-save-btn').addEventListener('click', () => {
      s.buildingName = document.getElementById('pref-bname').value.trim() || 'My Rental Building';
      s.currencySymbol = document.getElementById('pref-curr').value.trim() || '₹';
      s.theme = document.getElementById('pref-theme').value;
      App.Store.save();
      App.applyTheme();
      H.toast('Preferences saved.', 'success');
      App.refresh();
    });

    document.getElementById('mpin-change-btn').addEventListener('click', () => {
      const curPin = document.getElementById('mpin-cur').value.trim();
      const newPin = document.getElementById('mpin-new').value.trim();
      const res = App.Store.setMpin(curPin, newPin);
      if (!res.ok) return H.toast(res.error, 'error');
      document.getElementById('mpin-cur').value = '';
      document.getElementById('mpin-new').value = '';
      H.toast('4-digit MPIN updated.', 'success');
    });

    document.getElementById('mpin-lock-now-btn').addEventListener('click', () => {
      if (App.lockPanel) App.lockPanel();
    });

    document.getElementById('set-install-app-btn').addEventListener('click', () => {
      if (App.promptInstall) App.promptInstall();
    });
  }

  App.Views = {
    dashboard: renderDashboard,
    properties: renderProperties,
    payments: renderPaymentsBills,
    history: renderHistory,
    settings: renderSettings
  };
})(window);

