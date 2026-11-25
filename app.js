import { DATA_MODE, WHO_QUICK_NAMES } from './config.js';
import { malawiToday, dmy, addDays, dowOf, getPin, setPin, isValidPin, onWrongPin, callApi } from './api.js';

const WHO_STORAGE_KEY = 'bakery.who';
const TAB_NAMES = ['wholesale', 'expenses', 'production', 'dispatch'];
const loadedScreens = {};
const whoListeners = new Set();
let activeTab = 'wholesale';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function kw(n) {
  return n == null ? '—' : 'K' + Number(n).toLocaleString('en-US');
}

export function num(n) {
  return n == null ? '' : Number(n).toLocaleString('en-US');
}

export function getWho() {
  try {
    return (localStorage.getItem(WHO_STORAGE_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

export function setWho(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  try {
    localStorage.setItem(WHO_STORAGE_KEY, clean);
    localStorage.setItem('bakery.dispatch.who', clean);
  } catch (e) {}
  updateWhoBar();
  whoListeners.forEach((fn) => {
    try { fn(clean); } catch (e) {}
  });
}

export function onWhoChange(fn) {
  whoListeners.add(fn);
}

function updateWhoBar() {
  const cur = getWho();
  const el = document.getElementById('who-current');
  if (el) el.textContent = cur || 'Not picked';
}

export function openWhoModal(allowCancel = true) {
  const modal = document.getElementById('who-modal');
  const grid = document.getElementById('who-quick-grid');
  const cancelBtn = document.getElementById('who-cancel-btn');
  const customInput = document.getElementById('who-custom-input');
  const errEl = document.getElementById('who-custom-err');
  const current = getWho();

  errEl.textContent = '';
  errEl.classList.remove('show');
  customInput.value = '';
  cancelBtn.hidden = !allowCancel || !current;

  grid.innerHTML = WHO_QUICK_NAMES.map((name) => {
    const active = current.toLowerCase() === name.toLowerCase();
    return `<button type="button" class="who-btn${active ? ' active' : ''}" data-who-pick="${esc(name)}">${esc(name)}</button>`;
  }).join('');

  grid.querySelectorAll('[data-who-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setWho(btn.getAttribute('data-who-pick'));
      modal.hidden = true;
      afterIdentityChange();
    });
  });

  modal.hidden = false;
}

function initWhoModal() {
  const modal = document.getElementById('who-modal');
  const changeBtn = document.getElementById('who-change-btn');
  const cancelBtn = document.getElementById('who-cancel-btn');
  const form = document.getElementById('who-custom-form');
  const customInput = document.getElementById('who-custom-input');
  const errEl = document.getElementById('who-custom-err');

  changeBtn.addEventListener('click', () => openWhoModal(true));
  cancelBtn.addEventListener('click', () => { modal.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = customInput.value.replace(/\s+/g, ' ').trim();
    if (val.length < 2 || !/^[A-Za-z][A-Za-z .'\-]*$/.test(val)) {
      errEl.textContent = 'Type a name (letters only, at least 2 letters).';
      errEl.classList.add('show');
      customInput.focus();
      return;
    }
    setWho(val);
    modal.hidden = true;
    afterIdentityChange();
  });

  updateWhoBar();
}

export function openPinModal(opts = {}) {
  const modal = document.getElementById('pin-modal');
  const input = document.getElementById('pin-input');
  const errEl = document.getElementById('pin-err');
  const cancelBtn = document.getElementById('pin-cancel-btn');
  const current = getPin();
  const allowCancel = !!opts.allowCancel && isValidPin(current);
  const message = opts.message || '';

  errEl.textContent = message;
  errEl.classList.toggle('show', !!message);
  input.value = '';
  cancelBtn.hidden = !allowCancel;
  modal.hidden = false;
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 50);
}

function initPinModal() {
  const modal = document.getElementById('pin-modal');
  const form = document.getElementById('pin-form');
  const input = document.getElementById('pin-input');
  const errEl = document.getElementById('pin-err');
  const cancelBtn = document.getElementById('pin-cancel-btn');
  const changeBtn = document.getElementById('pin-change-btn');

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.replace(/\D/g, '');
    if (!isValidPin(val)) {
      errEl.textContent = 'Enter the 6-digit Family PIN (numbers only).';
      errEl.classList.add('show');
      input.focus();
      return;
    }
    setPin(val);
    modal.hidden = true;
    afterIdentityChange();
  });

  cancelBtn.addEventListener('click', () => { modal.hidden = true; });
  changeBtn.addEventListener('click', () => openPinModal({ allowCancel: true }));
  onWrongPin(() => {
    openPinModal({
      allowCancel: false,
      message: 'That PIN is not right. Ask Masa for the Family PIN and try again.'
    });
  });
}

function appReady() {
  return !!getWho() && isValidPin(getPin());
}

function afterIdentityChange() {
  if (!getWho()) {
    openWhoModal(false);
    return;
  }
  if (!isValidPin(getPin())) {
    openPinModal({ allowCancel: false });
    return;
  }
  maybeStartApp();
}

async function maybeStartApp() {
  if (!appReady()) return;
  if (!loadedScreens[activeTab]) {
    await openTab(activeTab || 'wholesale');
    return;
  }
  if (activeTab === 'wholesale') {
    const btn = document.getElementById('ws-refresh');
    if (btn) { btn.click(); return; }
  }
  if (activeTab === 'production' && document.getElementById('pr-content')?.hidden) {
    const btn = document.getElementById('pr-refresh');
    if (btn) { btn.click(); return; }
  }
  if (activeTab === 'dispatch' && document.getElementById('dp-content')?.hidden) {
    const btn = document.getElementById('dp-refresh');
    if (btn) { btn.click(); return; }
  }
  // Screens already open (e.g. after Change PIN): a quick ping confirms the PIN.
  try { await callApi('ping', {}); } catch (e) {}
}


// Shared DD/MM/YYYY date picker + quick backdate chips (Today, Yesterday, 2 days ago)
export function setupDateControl(inputEl, chipsEl, opts = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'dmy-wrap';
  inputEl.parentNode.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);
  inputEl.classList.add('dmy-input');

  const face = document.createElement('span');
  face.className = 'dmy-face';
  face.setAttribute('aria-hidden', 'true');
  wrap.appendChild(face);

  const today = malawiToday();
  const chips = [
    { label: 'Today', date: today },
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: '2 days ago', date: addDays(today, -2) }
  ];

  function sync() {
    face.textContent = inputEl.value ? dmy(inputEl.value) : 'DD/MM/YYYY';
    face.classList.toggle('dmy-empty', !inputEl.value);
    if (chipsEl) {
      chipsEl.querySelectorAll('[data-quick-date]').forEach((b) => {
        const d = b.getAttribute('data-quick-date');
        const outOfRange = (opts.min && d < opts.min) || (opts.max && d > opts.max);
        b.disabled = !!outOfRange || inputEl.disabled;
        b.setAttribute('aria-pressed', String(inputEl.value === d));
      });
    }
  }

  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(inputEl, 'value', {
    configurable: true,
    get() { return proto.get.call(inputEl); },
    set(v) { proto.set.call(inputEl, v); sync(); }
  });

  ['input', 'change', 'blur'].forEach((ev) => inputEl.addEventListener(ev, sync));
  inputEl.addEventListener('click', () => {
    if (typeof inputEl.showPicker === 'function') {
      try { inputEl.showPicker(); } catch (e) {}
    }
  });
  new MutationObserver(sync).observe(inputEl, { attributes: true, attributeFilter: ['disabled'] });

  if (chipsEl) {
    chipsEl.innerHTML = chips.map((c) =>
      `<button type="button" class="date-chip" data-quick-date="${c.date}" aria-pressed="false">${esc(c.label)}</button>`
    ).join('');
    chipsEl.querySelectorAll('[data-quick-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-quick-date');
        if (inputEl.value === next) return;
        inputEl.value = next;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  sync();
  return { sync };
}

export function renderDayWarnings(date, shop) {
  if (!date) return '';
  const dow = dowOf(date);
  const warnings = [];
  if (dow === 0) {
    warnings.push('Sunday: bakery is usually closed. You can still save if needed.');
  }
  if (dow === 1 && shop === 'Town') {
    warnings.push("Monday: no Town opening stock (Saturday's closing is not carried over).");
  }
  return warnings.map((w) => `<p class="warn-banner" role="status">${esc(w)}</p>`).join('');
}

async function openTab(name) {
  if (!TAB_NAMES.includes(name)) return;
  if (!appReady()) {
    afterIdentityChange();
    return;
  }
  activeTab = name;

  TAB_NAMES.forEach((t) => {
    const selected = t === name;
    const tab = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
  });

  const panel = document.getElementById(`panel-${name}`);
  if (!loadedScreens[name]) {
    panel.innerHTML = `<div class="screen-loading">Loading ${esc(name)}…</div>`;
    try {
      const mod = await import(`./screens/${name}.js`);
      loadedScreens[name] = mod;
      await mod.mount(panel);
    } catch (err) {
      panel.innerHTML = `
        <div class="screen-loading">
          <p>Could not open this screen.</p>
          <button type="button" class="btn-refresh" id="retry-load-${name}">Try again</button>
        </div>`;
      const retryBtn = document.getElementById(`retry-load-${name}`);
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          delete loadedScreens[name];
          openTab(name);
        });
      }
    }
  } else if (typeof loadedScreens[name].onShow === 'function') {
    loadedScreens[name].onShow();
  }
}

function initTabs() {
  TAB_NAMES.forEach((name) => {
    const tab = document.getElementById(`tab-${name}`);
    tab.addEventListener('click', () => openTab(name));
    tab.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const idx = TAB_NAMES.indexOf(name);
      const next = e.key === 'Home'
        ? TAB_NAMES[0]
        : e.key === 'End'
          ? TAB_NAMES[TAB_NAMES.length - 1]
          : TAB_NAMES[(idx + (e.key === 'ArrowRight' ? 1 : TAB_NAMES.length - 1)) % TAB_NAMES.length];
      openTab(next);
      document.getElementById(`tab-${next}`).focus();
    });
  });
}

function initOfflineBanner() {
  const el = document.getElementById('offline-banner');
  const sync = () => { el.hidden = navigator.onLine !== false; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// Boot shell
const modePill = document.getElementById('mode-pill');
if (DATA_MODE === 'mock') {
  modePill.hidden = false;
  modePill.textContent = 'Practice mode';
} else {
  modePill.hidden = true;
}
initOfflineBanner();
initWhoModal();
initPinModal();
initTabs();
registerSW();
afterIdentityChange();
