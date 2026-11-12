(function (global) {
  'use strict';

  const App = (global.RentalApp = global.RentalApp || {});

  const MAIN_NAV = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Dashboard', icon: 'dashboard', subtitle: '7 Units · Rental Overview' },
    { id: 'properties', label: 'Properties', mobileLabel: 'Properties', icon: 'properties', subtitle: 'Independent unit details & timeline' },
    { id: 'payments', label: 'Payments & Bills', mobileLabel: 'Payments', icon: 'payments', subtitle: 'Rent, 6 electricity meters, water & expenses' },
    { id: 'history', label: 'History', mobileLabel: 'History', icon: 'history', subtitle: 'Complete building activity timeline' }
  ];

  let currentView = 'dashboard';

  function applyTheme() {
    const theme = App.Store.getState().settings.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
      sun.classList.toggle('hidden', theme !== 'dark');
      moon.classList.toggle('hidden', theme === 'dark');
    }
  }

  function updateSaveStatus() {
    const st = App.Store.getState();
    const bNameEl = document.getElementById('sidebar-building-name');
    if (bNameEl) bNameEl.textContent = st.settings.buildingName || 'PropLedger';
    const demoBadge = document.getElementById('demo-badge-wrap');
    if (demoBadge) demoBadge.classList.toggle('hidden', !st.settings.isDemoData);
    const savedEl = document.getElementById('sidebar-last-saved');
    if (savedEl) savedEl.textContent = st.settings.lastBackupAt ? `Backup: ${App.H.formatDate(st.settings.lastBackupAt)}` : 'Auto-saved locally';
  }

  function renderNav() {
    const H = App.H;
    const sidebarNav = document.getElementById('sidebar-nav');
    sidebarNav.innerHTML = MAIN_NAV.map((n) => `
      <button class="nav-item ${currentView === n.id ? 'active' : ''}" data-view="${n.id}">
        ${H.icon(n.icon)}
        <span>${H.esc(n.label)}</span>
      </button>
    `).join('');

    sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeDrawer();
        navigate(btn.dataset.view);
      });
    });

    const settingsBtn = document.getElementById('nav-settings-btn');
    if (settingsBtn) settingsBtn.classList.toggle('active', currentView === 'settings');

    const mobileNav = document.getElementById('mobile-bottom-nav');
    mobileNav.innerHTML = MAIN_NAV.map((n) => `
      <button class="mobile-nav-btn ${currentView === n.id ? 'active' : ''}" data-mview="${n.id}">
        ${H.icon(n.icon)}
        <span>${H.esc(n.mobileLabel)}</span>
      </button>
    `).join('');
    mobileNav.querySelectorAll('.mobile-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.mview));
    });
  }

  function openDrawer() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
  }

  function navigate(viewId) {
    const meta = MAIN_NAV.find((n) => n.id === viewId) || { id: 'settings', label: 'Settings & Backup', subtitle: 'JSON backup, restore & preferences' };
    currentView = meta.id;
    document.getElementById('page-title').textContent = meta.label;
    document.getElementById('page-subtitle').textContent = meta.subtitle;
    renderNav();

    const main = document.getElementById('main-content');
    if (App.Views && App.Views[currentView]) {
      App.Views[currentView](main);
    }
  }

  function refresh() {
    navigate(currentView);
    updateSaveStatus();
  }

  let deferredInstallPrompt = null;

  function showMpinScreen() {
    App.Store.setSessionUnlocked(false);
    const screen = document.getElementById('mpin-screen');
    const appEl = document.getElementById('app');
    if (!screen) return;
    const st = App.Store.getState();
    const titleEl = document.getElementById('mpin-building-title');
    if (titleEl) titleEl.textContent = st.settings.buildingName || 'PropLedger';
    const hintEl = document.getElementById('mpin-default-hint');
    if (hintEl) hintEl.classList.toggle('hidden', !st.settings.mpinIsDefault);
    const errEl = document.getElementById('mpin-error');
    if (errEl) errEl.classList.add('hidden');

    if (appEl) appEl.classList.add('hidden');
    screen.classList.remove('hidden');

    const digits = Array.from(document.querySelectorAll('.mpin-digit'));
    digits.forEach((d) => { d.value = ''; });
    if (digits[0]) digits[0].focus();
  }

  function unlockPanel() {
    App.Store.setSessionUnlocked(true);
    const screen = document.getElementById('mpin-screen');
    const appEl = document.getElementById('app');
    if (screen) screen.classList.add('hidden');
    if (appEl) appEl.classList.remove('hidden');
    navigate(currentView);
  }

  function setupPWA() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const installBtn = document.getElementById('topbar-install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (installBtn) installBtn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installBtn) installBtn.classList.add('hidden');
      App.H.toast('PropLedger installed as an app!', 'success');
    });

    if (installBtn) {
      installBtn.addEventListener('click', () => promptInstall());
    }
  }

  async function promptInstall() {
    if (!deferredInstallPrompt) {
      App.H.toast('Open in Chrome/Edge over HTTPS (e.g. GitHub Pages) or tap browser menu → Add to Home Screen.', 'info');
      return;
    }
    deferredInstallPrompt.prompt();
    const res = await deferredInstallPrompt.userChoice;
    if (res && res.outcome === 'accepted') {
      deferredInstallPrompt = null;
      const btn = document.getElementById('topbar-install-btn');
      if (btn) btn.classList.add('hidden');
    }
  }

  function bindMpinGate() {
    const screen = document.getElementById('mpin-screen');
    if (!screen) {
      navigate('dashboard');
      return;
    }

    const digits = Array.from(document.querySelectorAll('.mpin-digit'));
    const boxesWrap = document.getElementById('mpin-boxes');
    const errEl = document.getElementById('mpin-error');

    const getEnteredPin = () => digits.map((d) => d.value).join('');

    const attemptUnlock = () => {
      const pin = getEnteredPin();
      if (pin.length < 4) return;
      if (App.Store.verifyMpin(pin)) {
        digits.forEach((d) => { d.value = ''; });
        if (errEl) errEl.classList.add('hidden');
        unlockPanel();
      } else {
        if (errEl) errEl.classList.remove('hidden');
        if (boxesWrap) {
          boxesWrap.classList.remove('mpin-shake');
          void boxesWrap.offsetWidth;
          boxesWrap.classList.add('mpin-shake');
        }
        digits.forEach((d) => { d.value = ''; });
        if (digits[0]) digits[0].focus();
      }
    };

    digits.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(-1);
        if (errEl) errEl.classList.add('hidden');
        if (input.value && idx < 3) digits[idx + 1].focus();
        if (getEnteredPin().length === 4) attemptUnlock();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          digits[idx - 1].value = '';
          digits[idx - 1].focus();
        } else if (e.key === 'Enter') {
          attemptUnlock();
        }
      });

      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
        if (!text) return;
        e.preventDefault();
        text.split('').forEach((ch, i) => { if (digits[i]) digits[i].value = ch; });
        if (text.length === 4) attemptUnlock();
      });
    });

    document.querySelectorAll('.mpin-key').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.k;
        if (errEl) errEl.classList.add('hidden');
        if (k === 'clear') {
          digits.forEach((d) => { d.value = ''; });
          if (digits[0]) digits[0].focus();
          return;
        }
        if (k === 'back') {
          for (let i = 3; i >= 0; i--) {
            if (digits[i].value) {
              digits[i].value = '';
              digits[i].focus();
              break;
            }
          }
          return;
        }
        const emptyIdx = digits.findIndex((d) => !d.value);
        if (emptyIdx !== -1) {
          digits[emptyIdx].value = k;
          if (emptyIdx < 3) digits[emptyIdx + 1].focus();
          if (getEnteredPin().length === 4) attemptUnlock();
        }
      });
    });

    const unlockBtn = document.getElementById('mpin-unlock-btn');
    if (unlockBtn) unlockBtn.addEventListener('click', attemptUnlock);

    if (App.Store.isSessionUnlocked()) {
      unlockPanel();
    } else {
      showMpinScreen();
    }
  }

  function init() {
    App.Store.load();
    applyTheme();
    updateSaveStatus();
    setupPWA();

    const lockBtn = document.getElementById('lock-panel-btn');
    if (lockBtn) lockBtn.addEventListener('click', showMpinScreen);

    document.getElementById('nav-settings-btn').addEventListener('click', () => { closeDrawer(); navigate('settings'); });
    document.getElementById('topbar-settings-btn').addEventListener('click', () => navigate('settings'));
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      const s = App.Store.getState().settings;
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
      App.Store.save();
      applyTheme();
    });

    document.getElementById('clear-demo-quick-btn').addEventListener('click', async () => {
      const ok = await App.H.confirmDialog({
        title: 'Clear Demo Data',
        message: 'Clear sample records and keep the 7 empty units ready for real entries?',
        confirmText: 'Clear Demo'
      });
      if (!ok) return;
      App.Store.clearDemoData();
      App.H.toast('Demo data cleared.', 'success');
      refresh();
    });

    document.getElementById('mobile-menu-btn').addEventListener('click', openDrawer);
    document.getElementById('sidebar-close-btn').addEventListener('click', closeDrawer);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeDrawer);

    document.getElementById('modal-close-btn').addEventListener('click', App.H.closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') App.H.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') App.H.closeModal();
    });

    bindMpinGate();
  }

  App.navigate = navigate;
  App.refresh = refresh;
  App.applyTheme = applyTheme;
  App.updateSaveStatus = updateSaveStatus;
  App.lockPanel = showMpinScreen;
  App.promptInstall = promptInstall;
  App.canInstall = () => Boolean(deferredInstallPrompt);

  document.addEventListener('DOMContentLoaded', init);
})(window);
