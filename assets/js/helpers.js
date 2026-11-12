(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});

  function uid(prefix) {
    return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function esc(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toMoney(val) {
    const n = Number(val);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function nonNeg(val) {
    return Math.max(0, toMoney(val));
  }

  function formatCurrency(val) {
    const sym = (App.Store && App.Store.getState().settings.currencySymbol) || '₹';
    const num = toMoney(val);
    const abs = Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
    return num < 0 ? `-${sym}${abs}` : `${sym}${abs}`;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function currentMonth() {
    return todayISO().slice(0, 7);
  }

  function prevMonth(ym, offset = 1) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    if (!d) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function formatMonth(ym) {
    if (!ym || ym.length < 7) return ym || '—';
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function statusBadge(status) {
    const s = String(status || 'Pending');
    const l = s.toLowerCase();
    let cls = 'badge-neutral';
    if (['paid', 'occupied', 'active', 'settled'].includes(l)) cls = 'badge-success';
    else if (['partial', 'partially paid', 'pending', 'owner expense'].includes(l)) cls = 'badge-warning';
    else if (['unpaid', 'overdue'].includes(l)) cls = 'badge-danger';
    else if (['vacant'].includes(l)) cls = 'badge-info';
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function openModal({ title, bodyHtml, footerHtml = '', size = '' }) {
    const overlay = document.getElementById('modal-overlay');
    const dialog = document.getElementById('modal-dialog');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    const footerEl = document.getElementById('modal-footer');
    dialog.className = `modal-dialog ${size}`;
    if (footerHtml) {
      footerEl.innerHTML = footerHtml;
      footerEl.classList.remove('hidden');
    } else {
      footerEl.innerHTML = '';
      footerEl.classList.add('hidden');
    }
    overlay.classList.remove('hidden');
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function confirmDialog({ title = 'Confirm', message, confirmText = 'Confirm', danger = true }) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const okBtn = document.getElementById('confirm-ok-btn');
      const cancelBtn = document.getElementById('confirm-cancel-btn');
      const closeBtn = document.getElementById('confirm-close-btn');

      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-body').innerHTML = `<p style="margin:0">${esc(message)}</p>`;
      okBtn.textContent = confirmText;
      okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
      overlay.classList.remove('hidden');

      const done = (val) => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onNo);
        closeBtn.removeEventListener('click', onNo);
        resolve(val);
      };
      const onOk = () => done(true);
      const onNo = () => done(false);
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onNo);
      closeBtn.addEventListener('click', onNo);
    });
  }

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    properties: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/></svg>',
    payments: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    history: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>'
  };

  App.H = {
    uid,
    esc,
    toMoney,
    nonNeg,
    formatCurrency,
    todayISO,
    currentMonth,
    prevMonth,
    formatDate,
    formatMonth,
    statusBadge,
    downloadFile,
    toast,
    openModal,
    closeModal,
    confirmDialog,
    icon: (name) => ICONS[name] || ''
  };
})(window);
