(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});

  function openAddTenantModal(preUnitId = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const vacant = st.units.filter((u) => u.occupancyStatus === 'Vacant');
    if (vacant.length === 0) {
      return H.toast('All 7 units are currently occupied. Vacate a unit first.', 'warning');
    }
    const defaultUnit = vacant.find((u) => u.id === preUnitId) || vacant[0];

    H.openModal({
      title: 'Add Tenant',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group full">
            <label for="at-unit">Property *</label>
            <select id="at-unit">
              ${vacant.map((u) => `<option value="${H.esc(u.id)}" ${u.id === defaultUnit.id ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="at-name">Tenant Name *</label>
            <input id="at-name" type="text" required placeholder="Full name" />
          </div>
          <div class="form-group">
            <label for="at-mobile">Mobile Number (Optional)</label>
            <input id="at-mobile" type="tel" placeholder="10-digit number" />
          </div>
          <div class="form-group">
            <label for="at-rent">Monthly Rent *</label>
            <input id="at-rent" type="number" min="0" value="${defaultUnit.monthlyRent || 0}" />
          </div>
          <div class="form-group">
            <label for="at-adv">Advance Amount</label>
            <input id="at-adv" type="number" min="0" value="0" />
          </div>
          <div class="form-group full">
            <label for="at-date">Joining Date *</label>
            <input id="at-date" type="date" value="${H.todayISO()}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="at-save-btn" class="btn btn-primary">Save Tenant</button>
      `
    });

    document.getElementById('at-unit').addEventListener('change', (e) => {
      const u = E.getUnit(e.target.value);
      if (u && u.monthlyRent) document.getElementById('at-rent').value = u.monthlyRent;
    });

    document.getElementById('at-save-btn').addEventListener('click', () => {
      const res = E.addTenant({
        unitId: document.getElementById('at-unit').value,
        tenantName: document.getElementById('at-name').value,
        mobile: document.getElementById('at-mobile').value,
        monthlyRent: document.getElementById('at-rent').value,
        advanceAmount: document.getElementById('at-adv').value,
        joiningDate: document.getElementById('at-date').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Tenant added.', 'success');
      App.refresh();
    });
  }

  function openCollectRentModal(preUnitId = '', preMonth = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const ym = preMonth || H.currentMonth();
    const occupied = st.units.filter((u) => u.occupancyStatus === 'Occupied');
    const list = occupied.length > 0 ? occupied : st.units;
    const defId = preUnitId || list[0].id;

    H.openModal({
      title: 'Collect Rent',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="cr-unit">Property *</label>
            <select id="cr-unit">
              ${list.map((u) => `<option value="${H.esc(u.id)}" ${u.id === defId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="cr-month">Billing Month *</label>
            <input id="cr-month" type="month" value="${H.esc(ym)}" />
          </div>
          <div class="form-group">
            <label for="cr-amt">Amount Received *</label>
            <input id="cr-amt" type="number" min="1" step="0.01" required />
            <span id="cr-hint" class="small text-muted"></span>
          </div>
          <div class="form-group">
            <label for="cr-date">Date *</label>
            <input id="cr-date" type="date" value="${H.todayISO()}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="cr-save-btn" class="btn btn-primary">Record Cash Rent</button>
      `
    });

    const uSel = document.getElementById('cr-unit');
    const mIn = document.getElementById('cr-month');
    const amtIn = document.getElementById('cr-amt');
    const hintEl = document.getElementById('cr-hint');

    const syncHint = () => {
      const bal = E.getUnitBalances(uSel.value, mIn.value);
      hintEl.textContent = `Expected: ${H.formatCurrency(bal.expectedMonth)} · Remaining: ${H.formatCurrency(bal.pendingMonth)}`;
      amtIn.value = bal.pendingMonth > 0 ? bal.pendingMonth : bal.expectedMonth;
    };
    uSel.addEventListener('change', syncHint);
    mIn.addEventListener('change', syncHint);
    syncHint();

    document.getElementById('cr-save-btn').addEventListener('click', () => {
      const res = E.recordRentPayment({
        unitId: uSel.value,
        month: mIn.value,
        amount: amtIn.value,
        date: document.getElementById('cr-date').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Rent payment recorded.', 'success');
      App.refresh();
    });
  }

  function openRecordPaymentModal(preUnitId = '', preType = 'Rent', preAmount = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();

    H.openModal({
      title: 'Record Payment',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="rp-unit">Property *</label>
            <select id="rp-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === preUnitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="rp-type">Payment Type *</label>
            <select id="rp-type">
              ${['Rent', 'Electricity', 'Water', 'Advance', 'Other'].map((tp) => `<option value="${tp}" ${tp === preType ? 'selected' : ''}>${tp}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="rp-amt">Amount *</label>
            <input id="rp-amt" type="number" min="1" step="0.01" value="${preAmount !== '' ? preAmount : ''}" required />
            <span id="rp-bal-hint" class="small text-muted"></span>
          </div>
          <div class="form-group">
            <label for="rp-date">Date *</label>
            <input id="rp-date" type="date" value="${H.todayISO()}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="rp-save-btn" class="btn btn-primary">Save Payment</button>
      `
    });

    const uSel = document.getElementById('rp-unit');
    const tSel = document.getElementById('rp-type');
    const amtIn = document.getElementById('rp-amt');
    const hint = document.getElementById('rp-bal-hint');

    const syncBal = () => {
      const bal = E.getUnitBalances(uSel.value);
      let suggested = 0;
      if (tSel.value === 'Rent') suggested = bal.pendingMonth;
      else if (tSel.value === 'Electricity') suggested = bal.pendingElec;
      else if (tSel.value === 'Water') suggested = bal.pendingWater;
      hint.textContent = suggested > 0 ? `Pending balance: ${H.formatCurrency(suggested)}` : 'All transactions treated as cash';
      if (preAmount === '' && suggested > 0) amtIn.value = suggested;
    };
    uSel.addEventListener('change', syncBal);
    tSel.addEventListener('change', syncBal);
    syncBal();

    document.getElementById('rp-save-btn').addEventListener('click', () => {
      const res = E.recordSimplePayment({
        unitId: uSel.value,
        type: tSel.value,
        amount: amtIn.value,
        date: document.getElementById('rp-date').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Payment recorded.', 'success');
      App.refresh();
    });
  }

  function openAddElectricityModal(preUnitId = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const indUnits = st.units.filter((u) => !u.isBachelor);
    const defaultMode = preUnitId === 'unit_br1' || preUnitId === 'unit_br2' ? 'bachelor' : 'individual';
    let contribRows = [];

    H.openModal({
      title: 'Add Electricity Bill',
      bodyHtml: `
        <div class="form-grid mb-2">
          <div class="form-group">
            <label for="eb-meter-mode">Electricity Meter *</label>
            <select id="eb-meter-mode">
              <option value="individual" ${defaultMode === 'individual' ? 'selected' : ''}>Meters 1–5 (House 1–4 / Shop)</option>
              <option value="bachelor" ${defaultMode === 'bachelor' ? 'selected' : ''}>Meter 6 (Bachelor Room 1 + 2 Shared)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="eb-month">Billing Month *</label>
            <input id="eb-month" type="month" value="${H.currentMonth()}" />
          </div>
        </div>

        <div id="eb-ind-box" class="${defaultMode === 'bachelor' ? 'hidden' : ''}">
          <div class="form-grid mb-2">
            <div class="form-group">
              <label for="eb-unit">Property *</label>
              <select id="eb-unit">
                ${indUnits.map((u) => `<option value="${H.esc(u.id)}" ${u.id === preUnitId ? 'selected' : ''}>${H.esc(u.name)} (${u.occupancyStatus})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="eb-amt">Monthly Electricity Bill *</label>
              <input id="eb-amt" type="number" min="1" step="0.01" value="0" />
            </div>
            <div class="form-group">
              <label for="eb-rec">Amount Received Now</label>
              <input id="eb-rec" type="number" min="0" step="0.01" value="0" />
            </div>
            <div class="form-group">
              <label for="eb-date">Date</label>
              <input id="eb-date" type="date" value="${H.todayISO()}" />
            </div>
          </div>

          <div id="eb-vacant-note" class="alert alert-warning mb-2 hidden">
            <div>
              <strong>Vacant Unit:</strong> Automatically recorded as an Owner Expense.
              <label class="flex items-center gap-1 mt-1" style="font-weight:500">
                <input id="eb-assign-vac" type="checkbox" style="width:auto; min-height:auto" /> Assign to tenant instead
              </label>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header">
              <span class="small fw-600">Optional: Contributions from Other Units</span>
              <button type="button" id="eb-add-contrib-btn" class="btn btn-secondary btn-xs">+ Add Contribution</button>
            </div>
            <div class="card-body">
              <div id="eb-contrib-list"><p class="small text-muted" style="margin:0">No contributions added.</p></div>
              <div class="small fw-600 mt-1" id="eb-net-summary"></div>
            </div>
          </div>
        </div>

        <div id="eb-br-box" class="${defaultMode === 'bachelor' ? '' : 'hidden'}">
          <div class="alert alert-info mb-2">
            <strong>Meter 6 (Bachelor Rooms):</strong> Enter total bill, split &amp; assign to Room 1 and Room 2, save as pending, then collect separately from each room.
          </div>
          <div class="form-grid mb-2">
            <div class="form-group full">
              <label for="eb-br-bill-total">Total Meter 6 Current Bill *</label>
              <input id="eb-br-bill-total" type="number" min="1" step="0.01" value="0" placeholder="Enter total combined bill e.g. 800" />
            </div>
            <div class="form-group full">
              <div class="flex flex-wrap gap-1">
                <button type="button" id="eb-br-split-50" class="btn btn-secondary btn-xs">Split 50 / 50</button>
                <button type="button" id="eb-br-split-br1" class="btn btn-secondary btn-xs">100% Room 1</button>
                <button type="button" id="eb-br-split-br2" class="btn btn-secondary btn-xs">100% Room 2</button>
              </div>
            </div>
            <div class="form-group">
              <label for="eb-br1-share">Bachelor Room 1 Assigned Share *</label>
              <input id="eb-br1-share" type="number" min="0" step="0.01" value="0" />
            </div>
            <div class="form-group">
              <label for="eb-br2-share">Bachelor Room 2 Assigned Share *</label>
              <input id="eb-br2-share" type="number" min="0" step="0.01" value="0" />
            </div>
          </div>
          <div id="eb-br-split-status" class="summary-box mb-2">
            <div><div class="summary-item-label">Total Bill</div><div id="eb-br-lbl-tot" class="summary-item-val">₹0</div></div>
            <div><div class="summary-item-label">Assigned (BR1 + BR2)</div><div id="eb-br-lbl-asg" class="summary-item-val">₹0</div></div>
            <div><div class="summary-item-label">Unassigned</div><div id="eb-br-lbl-rem" class="summary-item-val">₹0</div></div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label for="eb-br1-rec">Collected from Room 1 Now (Optional)</label>
              <input id="eb-br1-rec" type="number" min="0" step="0.01" value="0" />
            </div>
            <div class="form-group">
              <label for="eb-br2-rec">Collected from Room 2 Now (Optional)</label>
              <input id="eb-br2-rec" type="number" min="0" step="0.01" value="0" />
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="eb-save-btn" class="btn btn-primary">Save Electricity Bill</button>
      `
    });

    const modeSel = document.getElementById('eb-meter-mode');
    const unitSel = document.getElementById('eb-unit');
    const amtIn = document.getElementById('eb-amt');
    const vacNote = document.getElementById('eb-vacant-note');

    const syncVacant = () => {
      const u = E.getUnit(unitSel.value);
      vacNote.classList.toggle('hidden', !u || u.occupancyStatus !== 'Vacant');
    };
    unitSel.addEventListener('change', syncVacant);
    syncVacant();

    const updateNetSummary = () => {
      const total = H.nonNeg(amtIn.value);
      const cSum = H.toMoney(contribRows.reduce((s, r) => s + H.nonNeg(r.amount), 0));
      const rem = H.toMoney(total - cSum);
      document.getElementById('eb-net-summary').textContent =
        cSum > 0 ? `Bill: ${H.formatCurrency(total)} − Contributions: ${H.formatCurrency(cSum)} = Remaining: ${H.formatCurrency(rem)}` : '';
    };
    amtIn.addEventListener('input', updateNetSummary);

    const renderContribs = () => {
      const listEl = document.getElementById('eb-contrib-list');
      if (contribRows.length === 0) {
        listEl.innerHTML = '<p class="small text-muted" style="margin:0">No contributions added.</p>';
        updateNetSummary();
        return;
      }
      listEl.innerHTML = contribRows.map((row, idx) => `
        <div class="contrib-row" data-idx="${idx}">
          <select class="c-unit">
            <option value="">Select Unit</option>
            ${st.units.filter((u) => u.id !== unitSel.value).map((u) => `<option value="${H.esc(u.id)}" ${row.fromUnitId === u.id ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
          </select>
          <input type="number" class="c-amt" min="0" step="0.01" value="${row.amount}" placeholder="Amount" />
          <button type="button" class="btn btn-ghost btn-xs text-danger c-del">&times;</button>
        </div>
      `).join('');
      listEl.querySelectorAll('.contrib-row').forEach((el) => {
        const i = Number(el.dataset.idx);
        el.querySelector('.c-unit').addEventListener('change', (e) => { contribRows[i].fromUnitId = e.target.value; });
        el.querySelector('.c-amt').addEventListener('input', (e) => { contribRows[i].amount = H.nonNeg(e.target.value); updateNetSummary(); });
        el.querySelector('.c-del').addEventListener('click', () => { contribRows.splice(i, 1); renderContribs(); });
      });
      updateNetSummary();
    };

    document.getElementById('eb-add-contrib-btn').addEventListener('click', () => {
      contribRows.push({ fromUnitId: '', amount: 0 });
      renderContribs();
    });

    const brTotIn = document.getElementById('eb-br-bill-total');
    const br1In = document.getElementById('eb-br1-share');
    const br2In = document.getElementById('eb-br2-share');

    const updateBrSummary = () => {
      const s1 = H.nonNeg(br1In.value);
      const s2 = H.nonNeg(br2In.value);
      const assigned = H.toMoney(s1 + s2);
      const tot = H.nonNeg(brTotIn.value) || assigned;
      const unass = H.toMoney(tot - assigned);
      document.getElementById('eb-br-lbl-tot').textContent = H.formatCurrency(tot);
      document.getElementById('eb-br-lbl-asg').textContent = H.formatCurrency(assigned);
      const remEl = document.getElementById('eb-br-lbl-rem');
      remEl.textContent = H.formatCurrency(unass);
      remEl.className = `summary-item-val ${Math.abs(unass) > 0.01 ? 'text-danger' : 'text-success'}`;
    };

    const splitEqual = () => {
      const tot = H.nonNeg(brTotIn.value);
      const half = Math.floor((tot / 2) * 100) / 100;
      br1In.value = half;
      br2In.value = H.toMoney(tot - half);
      updateBrSummary();
    };

    brTotIn.addEventListener('input', splitEqual);
    document.getElementById('eb-br-split-50').addEventListener('click', splitEqual);
    document.getElementById('eb-br-split-br1').addEventListener('click', () => {
      const tot = H.nonNeg(brTotIn.value);
      br1In.value = tot;
      br2In.value = 0;
      updateBrSummary();
    });
    document.getElementById('eb-br-split-br2').addEventListener('click', () => {
      const tot = H.nonNeg(brTotIn.value);
      br1In.value = 0;
      br2In.value = tot;
      updateBrSummary();
    });

    br1In.addEventListener('input', () => {
      const tot = H.nonNeg(brTotIn.value);
      const s1 = H.nonNeg(br1In.value);
      if (tot > 0 && s1 <= tot) br2In.value = H.toMoney(tot - s1);
      updateBrSummary();
    });
    br2In.addEventListener('input', updateBrSummary);

    modeSel.addEventListener('change', () => {
      const isBr = modeSel.value === 'bachelor';
      document.getElementById('eb-ind-box').classList.toggle('hidden', isBr);
      document.getElementById('eb-br-box').classList.toggle('hidden', !isBr);
    });

    document.getElementById('eb-save-btn').addEventListener('click', () => {
      const month = document.getElementById('eb-month').value;
      const date = document.getElementById('eb-date').value;
      if (modeSel.value === 'bachelor') {
        const tot = H.nonNeg(brTotIn.value);
        const s1 = H.nonNeg(br1In.value);
        const s2 = H.nonNeg(br2In.value);
        if (tot > 0 && Math.abs(tot - (s1 + s2)) > 0.01) {
          return H.toast(`Assigned shares (${H.formatCurrency(s1 + s2)}) must equal Total Bill (${H.formatCurrency(tot)}).`, 'error');
        }
        const res = E.saveBachelorElecBill({
          month,
          br1Share: s1,
          br2Share: s2,
          br1Received: document.getElementById('eb-br1-rec').value,
          br2Received: document.getElementById('eb-br2-rec').value,
          date
        });
        if (!res.ok) return H.toast(res.error, 'error');
      } else {
        const res = E.saveIndividualElecBill({
          unitId: unitSel.value,
          month,
          billAmount: amtIn.value,
          contributions: contribRows,
          receivedAmount: document.getElementById('eb-rec').value,
          date,
          assignVacantToTenant: document.getElementById('eb-assign-vac').checked
        });
        if (!res.ok) return H.toast(res.error, 'error');
      }
      H.closeModal();
      H.toast('Electricity bill saved.', 'success');
      App.refresh();
    });
  }

  function openAddContributionModal(billId) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const bill = st.electricity_bills.find((b) => b.id === billId);
    if (!bill) return;

    H.openModal({
      title: `Add Contribution — ${E.getUnitName(bill.unitId)} (${H.formatMonth(bill.month)})`,
      bodyHtml: `
        <p class="small text-muted mb-2">Original Bill: <strong>${H.formatCurrency(bill.billAmount)}</strong> · Remaining: <strong>${H.formatCurrency(E.getIndividualElecNet(bill))}</strong></p>
        <form class="form-grid">
          <div class="form-group">
            <label for="ac-unit">Contributing Unit *</label>
            <select id="ac-unit">
              ${st.units.filter((u) => u.id !== bill.unitId).map((u) => `<option value="${H.esc(u.id)}">${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="ac-amt">Contribution Amount *</label>
            <input id="ac-amt" type="number" min="1" step="0.01" required />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="ac-save-btn" class="btn btn-primary">Add Contribution</button>
      `
    });

    document.getElementById('ac-save-btn').addEventListener('click', () => {
      const res = E.addContributionToElecBill(billId, {
        fromUnitId: document.getElementById('ac-unit').value,
        amount: document.getElementById('ac-amt').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Contribution recorded.', 'success');
      App.refresh();
    });
  }

  function openAddWaterModal(preUnitId = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const defId = preUnitId || st.units[0].id;

    H.openModal({
      title: 'Add Water Bill',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="wb-unit">Property (Independent per Unit) *</label>
            <select id="wb-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === defId ? 'selected' : ''}>${H.esc(u.name)} (${u.occupancyStatus})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="wb-month">Billing Month *</label>
            <input id="wb-month" type="month" value="${H.currentMonth()}" />
          </div>
          <div class="form-group">
            <label for="wb-amt">Water Bill Amount *</label>
            <input id="wb-amt" type="number" min="1" step="0.01" required />
          </div>
          <div class="form-group">
            <label for="wb-rec">Amount Received Now</label>
            <input id="wb-rec" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-group full hidden" id="wb-vac-note">
            <div class="alert alert-warning">
              <strong>Vacant Unit:</strong> Automatically marked as Owner Expense.
              <label class="flex items-center gap-1 mt-1" style="font-weight:500">
                <input id="wb-assign-vac" type="checkbox" style="width:auto; min-height:auto" /> Assign to tenant instead
              </label>
            </div>
          </div>
          <div class="form-group full">
            <label for="wb-date">Date</label>
            <input id="wb-date" type="date" value="${H.todayISO()}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="wb-save-btn" class="btn btn-primary">Save Water Bill</button>
      `
    });

    const uSel = document.getElementById('wb-unit');
    const vacEl = document.getElementById('wb-vac-note');
    const syncVac = () => {
      const u = E.getUnit(uSel.value);
      vacEl.classList.toggle('hidden', !u || u.occupancyStatus !== 'Vacant');
    };
    uSel.addEventListener('change', syncVac);
    syncVac();

    document.getElementById('wb-save-btn').addEventListener('click', () => {
      const res = E.saveWaterBill({
        unitId: uSel.value,
        month: document.getElementById('wb-month').value,
        billAmount: document.getElementById('wb-amt').value,
        receivedAmount: document.getElementById('wb-rec').value,
        date: document.getElementById('wb-date').value,
        assignVacantToTenant: document.getElementById('wb-assign-vac').checked
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Water bill saved.', 'success');
      App.refresh();
    });
  }

  function openAddExpenseModal(preUnitId = '') {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();

    H.openModal({
      title: 'Add Maintenance / Other Expense',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="ex-unit">Property *</label>
            <select id="ex-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === preUnitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="ex-cat">Category *</label>
            <select id="ex-cat">
              ${['Painting', 'Electrical', 'Plumbing', 'Cleaning', 'Maintenance', 'Other'].map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="ex-amt">Amount *</label>
            <input id="ex-amt" type="number" min="1" step="0.01" required />
          </div>
          <div class="form-group">
            <label for="ex-date">Date *</label>
            <input id="ex-date" type="date" value="${H.todayISO()}" />
          </div>
          <div class="form-group full">
            <label for="ex-desc">Short Description</label>
            <input id="ex-desc" type="text" placeholder="e.g. Tap repair / repainting" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="ex-save-btn" class="btn btn-primary">Save Expense</button>
      `
    });

    document.getElementById('ex-save-btn').addEventListener('click', () => {
      const res = E.addExpense({
        unitId: document.getElementById('ex-unit').value,
        amount: document.getElementById('ex-amt').value,
        category: document.getElementById('ex-cat').value,
        date: document.getElementById('ex-date').value,
        description: document.getElementById('ex-desc').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Expense recorded.', 'success');
      App.refresh();
    });
  }

  function openChangeRentModal(unitId) {
    const H = App.H;
    const E = App.Engine;
    const u = E.getUnit(unitId);
    if (!u) return;

    H.openModal({
      title: `Change Rent — ${u.name}`,
      bodyHtml: `
        <div class="alert alert-info mb-2">Past month rent records never change when you revise future rent.</div>
        <form class="form-grid">
          <div class="form-group">
            <label for="chr-month">Effective Month *</label>
            <input id="chr-month" type="month" value="${H.currentMonth()}" />
          </div>
          <div class="form-group">
            <label for="chr-amt">New Monthly Rent *</label>
            <input id="chr-amt" type="number" min="0" value="${u.monthlyRent}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="chr-save-btn" class="btn btn-primary">Update Rent</button>
      `
    });

    document.getElementById('chr-save-btn').addEventListener('click', () => {
      const res = E.changeUnitRent(unitId, {
        effectiveMonth: document.getElementById('chr-month').value,
        newRent: document.getElementById('chr-amt').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Rent updated for effective month.', 'success');
      App.refresh();
    });
  }

  function openVacateModal(unitId) {
    const H = App.H;
    const E = App.Engine;
    const bal = E.getUnitBalances(unitId);
    if (!bal.tenant) return H.toast('Property is already vacant.', 'info');

    H.openModal({
      title: `Vacate & Settle — ${bal.unit.name} (${bal.tenant.tenantName})`,
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label>Advance Held</label>
            <input type="text" readonly value="${H.formatCurrency(bal.advanceHeld)}" />
          </div>
          <div class="form-group">
            <label for="vac-date">Leaving Date *</label>
            <input id="vac-date" type="date" value="${H.todayISO()}" />
          </div>
          <div class="form-group">
            <label for="vac-rent">Pending Rent</label>
            <input id="vac-rent" type="number" min="0" step="0.01" value="${bal.totalPendingRent}" />
          </div>
          <div class="form-group">
            <label for="vac-elec">Pending Electricity Bill</label>
            <input id="vac-elec" type="number" min="0" step="0.01" value="${bal.pendingElec}" />
          </div>
          <div class="form-group">
            <label for="vac-water">Pending Water Bill</label>
            <input id="vac-water" type="number" min="0" step="0.01" value="${bal.pendingWater}" />
          </div>
          <div class="form-group">
            <label for="vac-paint">Painting Deduction (Optional)</label>
            <input id="vac-paint" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-group">
            <label for="vac-mnt">Maintenance Deduction (Optional)</label>
            <input id="vac-mnt" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-group">
            <label for="vac-other">Other Deduction (Optional)</label>
            <input id="vac-other" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-group full">
            <label for="vac-refund">Amount Refunded (Auto-calculated)</label>
            <input id="vac-refund" type="number" min="0" step="0.01" value="0" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="vac-confirm-btn" class="btn btn-danger">Confirm Vacate &amp; Settle</button>
      `
    });

    const ids = ['vac-rent', 'vac-elec', 'vac-water', 'vac-paint', 'vac-mnt', 'vac-other'];
    const calcRefund = () => {
      const ded = ids.reduce((s, id) => s + H.nonNeg(document.getElementById(id).value), 0);
      document.getElementById('vac-refund').value = H.nonNeg(bal.advanceHeld - ded);
    };
    ids.forEach((id) => document.getElementById(id).addEventListener('input', calcRefund));
    calcRefund();

    document.getElementById('vac-confirm-btn').addEventListener('click', () => {
      const res = E.vacateTenant(unitId, {
        leavingDate: document.getElementById('vac-date').value,
        pendingRent: document.getElementById('vac-rent').value,
        pendingElec: document.getElementById('vac-elec').value,
        pendingWater: document.getElementById('vac-water').value,
        paintingDeduction: document.getElementById('vac-paint').value,
        maintenanceDeduction: document.getElementById('vac-mnt').value,
        otherDeduction: document.getElementById('vac-other').value,
        refundedAmount: document.getElementById('vac-refund').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast(`${bal.unit.name} is now Vacant. Previous records preserved.`, 'success');
      App.refresh();
    });
  }

  function openEditTenantModal(tenancyId) {
    const H = App.H;
    const E = App.Engine;
    const t = E.getTenancy(tenancyId);
    if (!t) return H.toast('Tenant record not found.', 'error');

    H.openModal({
      title: `Edit Tenant — ${E.getUnitName(t.unitId)}`,
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="et-name">Tenant Name *</label>
            <input id="et-name" type="text" required value="${H.esc(t.tenantName)}" />
          </div>
          <div class="form-group">
            <label for="et-mobile">Mobile Number (Optional)</label>
            <input id="et-mobile" type="tel" value="${H.esc(t.mobile || '')}" />
          </div>
          <div class="form-group">
            <label for="et-rent">Monthly Rent *</label>
            <input id="et-rent" type="number" min="0" value="${t.monthlyRent}" />
          </div>
          <div class="form-group">
            <label for="et-adv">Advance Amount</label>
            <input id="et-adv" type="number" min="0" value="${t.advanceAmount}" />
          </div>
          <div class="form-group">
            <label for="et-join">Joining Date</label>
            <input id="et-join" type="date" value="${H.esc(t.joiningDate || '')}" />
          </div>
          ${t.status === 'Vacated' ? `
            <div class="form-group">
              <label for="et-leave">Leaving Date</label>
              <input id="et-leave" type="date" value="${H.esc(t.leavingDate || '')}" />
            </div>
          ` : ''}
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="et-save-btn" class="btn btn-primary">Save Tenant</button>
      `
    });

    document.getElementById('et-save-btn').addEventListener('click', () => {
      const leaveEl = document.getElementById('et-leave');
      const res = E.updateTenancy(tenancyId, {
        tenantName: document.getElementById('et-name').value,
        mobile: document.getElementById('et-mobile').value,
        monthlyRent: document.getElementById('et-rent').value,
        advanceAmount: document.getElementById('et-adv').value,
        joiningDate: document.getElementById('et-join').value,
        leavingDate: leaveEl ? leaveEl.value : undefined
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Tenant details updated.', 'success');
      App.refresh();
    });
  }

  function openEditRentMonthModal(unitId, month) {
    const H = App.H;
    const E = App.Engine;
    const bal = E.getUnitBalances(unitId, month);

    H.openModal({
      title: `Edit Rent — ${bal.unit.name} (${H.formatMonth(bal.month)})`,
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="erm-exp">Expected Rent</label>
            <input id="erm-exp" type="number" min="0" step="0.01" value="${bal.expectedMonth}" />
          </div>
          <div class="form-group">
            <label for="erm-rec">Received Amount</label>
            <input id="erm-rec" type="number" min="0" step="0.01" value="${bal.receivedMonth}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="erm-save-btn" class="btn btn-primary">Save Rent</button>
      `
    });

    document.getElementById('erm-save-btn').addEventListener('click', () => {
      const res = E.updateRentMonth(unitId, bal.month, {
        expectedRent: document.getElementById('erm-exp').value,
        receivedAmount: document.getElementById('erm-rec').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Rent record updated.', 'success');
      App.refresh();
    });
  }

  function openEditElectricityModal(billId) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const bill = st.electricity_bills.find((b) => b.id === billId);
    if (!bill) return H.toast('Electricity bill not found.', 'error');

    if (bill.isBachelorMeter) {
      H.openModal({
        title: `Edit Meter 6 Electricity (${H.formatMonth(bill.month)})`,
        bodyHtml: `
          <form class="form-grid">
            <div class="form-group full">
              <label for="eeb-month">Billing Month</label>
              <input id="eeb-month" type="month" value="${H.esc(bill.month)}" />
            </div>
            <div class="form-group">
              <label for="eeb-s1">Bachelor Room 1 Share</label>
              <input id="eeb-s1" type="number" min="0" step="0.01" value="${bill.br1Share || 0}" />
            </div>
            <div class="form-group">
              <label for="eeb-s2">Bachelor Room 2 Share</label>
              <input id="eeb-s2" type="number" min="0" step="0.01" value="${bill.br2Share || 0}" />
            </div>
            <div class="form-group">
              <label for="eeb-r1">Received from Room 1</label>
              <input id="eeb-r1" type="number" min="0" step="0.01" value="${bill.br1Received || 0}" />
            </div>
            <div class="form-group">
              <label for="eeb-r2">Received from Room 2</label>
              <input id="eeb-r2" type="number" min="0" step="0.01" value="${bill.br2Received || 0}" />
            </div>
          </form>
        `,
        footerHtml: `
          <button id="eeb-del-btn" class="btn btn-danger" style="margin-right:auto">Delete</button>
          <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
          <button id="eeb-save-btn" class="btn btn-primary">Save Changes</button>
        `
      });

      document.getElementById('eeb-save-btn').addEventListener('click', () => {
        const res = E.updateBachelorElecBill(bill.id, {
          month: document.getElementById('eeb-month').value,
          br1Share: document.getElementById('eeb-s1').value,
          br2Share: document.getElementById('eeb-s2').value,
          br1Received: document.getElementById('eeb-r1').value,
          br2Received: document.getElementById('eeb-r2').value
        });
        if (!res.ok) return H.toast(res.error, 'error');
        H.closeModal();
        H.toast('Meter 6 electricity bill updated.', 'success');
        App.refresh();
      });

      document.getElementById('eeb-del-btn').addEventListener('click', async () => {
        if (!await H.confirmDialog({ title: 'Delete Bill', message: 'Delete this Meter 6 electricity bill?', confirmText: 'Delete' })) return;
        E.deleteElectricityBill(bill.id);
        H.closeModal();
        H.toast('Electricity bill deleted.', 'info');
        App.refresh();
      });
      return;
    }

    // Individual Meter 1-5 Edit Modal
    const indUnits = st.units.filter((u) => !u.isBachelor);
    const contribs = (bill.contributions || []).map((c) => ({ ...c }));

    H.openModal({
      title: `Edit Electricity Bill — ${E.getUnitName(bill.unitId)}`,
      bodyHtml: `
        <form class="form-grid mb-2">
          <div class="form-group">
            <label for="eei-unit">Property</label>
            <select id="eei-unit">
              ${indUnits.map((u) => `<option value="${H.esc(u.id)}" ${u.id === bill.unitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="eei-month">Billing Month</label>
            <input id="eei-month" type="month" value="${H.esc(bill.month)}" />
          </div>
          <div class="form-group">
            <label for="eei-amt">Bill Amount</label>
            <input id="eei-amt" type="number" min="1" step="0.01" value="${bill.billAmount}" />
          </div>
          <div class="form-group">
            <label for="eei-rec">Received Amount</label>
            <input id="eei-rec" type="number" min="0" step="0.01" value="${bill.receivedAmount || 0}" />
          </div>
          <div class="form-group full">
            <label class="flex items-center gap-1" style="font-weight:500">
              <input id="eei-owner" type="checkbox" ${bill.isOwnerExpense ? 'checked' : ''} style="width:auto; min-height:auto" />
              Mark as Owner Expense (Vacant / Owner Paid)
            </label>
          </div>
        </form>
        <div class="card">
          <div class="card-header">
            <span class="small fw-600">Contributions</span>
            <button type="button" id="eei-add-c" class="btn btn-secondary btn-xs">+ Add</button>
          </div>
          <div class="card-body" id="eei-c-list"></div>
        </div>
      `,
      footerHtml: `
        <button id="eei-del-btn" class="btn btn-danger" style="margin-right:auto">Delete</button>
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="eei-save-btn" class="btn btn-primary">Save Changes</button>
      `
    });

    const renderC = () => {
      const box = document.getElementById('eei-c-list');
      if (contribs.length === 0) {
        box.innerHTML = '<p class="small text-muted" style="margin:0">No contributions.</p>';
        return;
      }
      const mainUnit = document.getElementById('eei-unit').value;
      box.innerHTML = contribs.map((c, idx) => `
        <div class="contrib-row" data-idx="${idx}">
          <select class="ec-u">
            <option value="">Select Unit</option>
            ${st.units.filter((u) => u.id !== mainUnit).map((u) => `<option value="${H.esc(u.id)}" ${c.fromUnitId === u.id ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
          </select>
          <input type="number" class="ec-a" min="0" step="0.01" value="${c.amount}" />
          <button type="button" class="btn btn-ghost btn-xs text-danger ec-d">&times;</button>
        </div>
      `).join('');
      box.querySelectorAll('.contrib-row').forEach((el) => {
        const i = Number(el.dataset.idx);
        el.querySelector('.ec-u').addEventListener('change', (e) => { contribs[i].fromUnitId = e.target.value; });
        el.querySelector('.ec-a').addEventListener('input', (e) => { contribs[i].amount = H.nonNeg(e.target.value); });
        el.querySelector('.ec-d').addEventListener('click', () => { contribs.splice(i, 1); renderC(); });
      });
    };
    renderC();
    document.getElementById('eei-add-c').addEventListener('click', () => { contribs.push({ fromUnitId: '', amount: 0 }); renderC(); });

    document.getElementById('eei-save-btn').addEventListener('click', () => {
      const res = E.updateIndividualElecBill(bill.id, {
        unitId: document.getElementById('eei-unit').value,
        month: document.getElementById('eei-month').value,
        billAmount: document.getElementById('eei-amt').value,
        receivedAmount: document.getElementById('eei-rec').value,
        isOwnerExpense: document.getElementById('eei-owner').checked,
        contributions: contribs
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Electricity bill updated.', 'success');
      App.refresh();
    });

    document.getElementById('eei-del-btn').addEventListener('click', async () => {
      if (!await H.confirmDialog({ title: 'Delete Bill', message: 'Delete this electricity bill?', confirmText: 'Delete' })) return;
      E.deleteElectricityBill(bill.id);
      H.closeModal();
      H.toast('Electricity bill deleted.', 'info');
      App.refresh();
    });
  }

  function openEditWaterModal(billId) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const w = st.water_bills.find((x) => x.id === billId);
    if (!w) return H.toast('Water bill not found.', 'error');

    H.openModal({
      title: `Edit Water Bill — ${E.getUnitName(w.unitId)}`,
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="ew-unit">Property</label>
            <select id="ew-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === w.unitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="ew-month">Billing Month</label>
            <input id="ew-month" type="month" value="${H.esc(w.month)}" />
          </div>
          <div class="form-group">
            <label for="ew-amt">Water Bill Amount</label>
            <input id="ew-amt" type="number" min="1" step="0.01" value="${w.billAmount}" />
          </div>
          <div class="form-group">
            <label for="ew-rec">Received Amount</label>
            <input id="ew-rec" type="number" min="0" step="0.01" value="${w.receivedAmount || 0}" />
          </div>
          <div class="form-group full">
            <label class="flex items-center gap-1" style="font-weight:500">
              <input id="ew-owner" type="checkbox" ${w.isOwnerExpense ? 'checked' : ''} style="width:auto; min-height:auto" />
              Mark as Owner Expense (Vacant)
            </label>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="ew-del-btn" class="btn btn-danger" style="margin-right:auto">Delete</button>
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="ew-save-btn" class="btn btn-primary">Save Changes</button>
      `
    });

    document.getElementById('ew-save-btn').addEventListener('click', () => {
      const res = E.updateWaterBill(w.id, {
        unitId: document.getElementById('ew-unit').value,
        month: document.getElementById('ew-month').value,
        billAmount: document.getElementById('ew-amt').value,
        receivedAmount: document.getElementById('ew-rec').value,
        isOwnerExpense: document.getElementById('ew-owner').checked
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Water bill updated.', 'success');
      App.refresh();
    });

    document.getElementById('ew-del-btn').addEventListener('click', async () => {
      if (!await H.confirmDialog({ title: 'Delete Water Bill', message: 'Delete this water bill?', confirmText: 'Delete' })) return;
      E.deleteWaterBill(w.id);
      H.closeModal();
      H.toast('Water bill deleted.', 'info');
      App.refresh();
    });
  }

  function openEditExpenseModal(expId) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const exp = st.expenses.find((e) => e.id === expId);
    if (!exp) return H.toast('Expense not found.', 'error');

    H.openModal({
      title: 'Edit Maintenance / Expense',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="eex-unit">Property</label>
            <select id="eex-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === exp.unitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="eex-cat">Category</label>
            <select id="eex-cat">
              ${['Painting', 'Electrical', 'Plumbing', 'Cleaning', 'Maintenance', 'Other'].map((c) => `<option value="${c}" ${c === exp.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="eex-amt">Amount</label>
            <input id="eex-amt" type="number" min="1" step="0.01" value="${exp.amount}" />
          </div>
          <div class="form-group">
            <label for="eex-date">Date</label>
            <input id="eex-date" type="date" value="${H.esc(exp.date)}" />
          </div>
          <div class="form-group full">
            <label for="eex-desc">Description</label>
            <input id="eex-desc" type="text" value="${H.esc(exp.description || '')}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button id="eex-del-btn" class="btn btn-danger" style="margin-right:auto">Delete</button>
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="eex-save-btn" class="btn btn-primary">Save Changes</button>
      `
    });

    document.getElementById('eex-save-btn').addEventListener('click', () => {
      const res = E.updateExpense(exp.id, {
        unitId: document.getElementById('eex-unit').value,
        category: document.getElementById('eex-cat').value,
        amount: document.getElementById('eex-amt').value,
        date: document.getElementById('eex-date').value,
        description: document.getElementById('eex-desc').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Expense updated.', 'success');
      App.refresh();
    });

    document.getElementById('eex-del-btn').addEventListener('click', async () => {
      if (!await H.confirmDialog({ title: 'Delete Expense', message: 'Delete this expense entry?', confirmText: 'Delete' })) return;
      E.deleteExpense(exp.id);
      H.closeModal();
      H.toast('Expense deleted.', 'info');
      App.refresh();
    });
  }

  function openEditPaymentModal(payId) {
    const H = App.H;
    const E = App.Engine;
    const st = App.Store.getState();
    const pay = st.payments.find((p) => p.id === payId);
    if (!pay) return H.toast('Payment record not found.', 'error');

    H.openModal({
      title: 'Edit Payment Record',
      bodyHtml: `
        <form class="form-grid">
          <div class="form-group">
            <label for="epay-unit">Property</label>
            <select id="epay-unit">
              ${st.units.map((u) => `<option value="${H.esc(u.id)}" ${u.id === pay.unitId ? 'selected' : ''}>${H.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="epay-type">Type</label>
            <select id="epay-type">
              ${['Rent', 'Electricity', 'Water', 'Advance', 'Advance Refund', 'Other'].map((tp) => `<option value="${tp}" ${tp === pay.type ? 'selected' : ''}>${tp}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="epay-amt">Amount</label>
            <input id="epay-amt" type="number" min="1" step="0.01" value="${pay.amount}" />
          </div>
          <div class="form-group">
            <label for="epay-date">Date</label>
            <input id="epay-date" type="date" value="${H.esc(pay.date)}" />
          </div>
          <div class="form-group full">
            <label for="epay-note">Note</label>
            <input id="epay-note" type="text" value="${H.esc(pay.note || '')}" />
          </div>
        </form>
      `,
      footerHtml: `
        <button id="epay-del-btn" class="btn btn-danger" style="margin-right:auto">Delete</button>
        <button class="btn btn-secondary" onclick="RentalApp.H.closeModal()">Cancel</button>
        <button id="epay-save-btn" class="btn btn-primary">Save Changes</button>
      `
    });

    document.getElementById('epay-save-btn').addEventListener('click', () => {
      const res = E.updatePayment(pay.id, {
        unitId: document.getElementById('epay-unit').value,
        type: document.getElementById('epay-type').value,
        amount: document.getElementById('epay-amt').value,
        date: document.getElementById('epay-date').value,
        note: document.getElementById('epay-note').value
      });
      if (!res.ok) return H.toast(res.error, 'error');
      H.closeModal();
      H.toast('Payment updated.', 'success');
      App.refresh();
    });

    document.getElementById('epay-del-btn').addEventListener('click', async () => {
      if (!await H.confirmDialog({ title: 'Delete Payment', message: 'Delete this payment entry?', confirmText: 'Delete' })) return;
      E.deletePayment(pay.id);
      H.closeModal();
      H.toast('Payment deleted.', 'info');
      App.refresh();
    });
  }

  App.Modals = {
    openAddTenantModal,
    openEditTenantModal,
    openCollectRentModal,
    openEditRentMonthModal,
    openRecordPaymentModal,
    openAddElectricityModal,
    openEditElectricityModal,
    openAddContributionModal,
    openAddWaterModal,
    openEditWaterModal,
    openAddExpenseModal,
    openEditExpenseModal,
    openEditPaymentModal,
    openChangeRentModal,
    openVacateModal
  };
})(window);

