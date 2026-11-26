import {
  API_URL,
  DATA_MODE,
  TIMEOUT_READ_MS,
  TIMEOUT_WRITE_MS,
  READ_RETRIES
} from './config.js';

export function malawiToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Blantyre',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (e) {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
}

export function malawiNowLabel() {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Blantyre',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
    return s.replace(',', '') + ' CAT';
  } catch (e) {
    return dmy(malawiToday()) + ' CAT';
  }
}

export function dmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(String(iso == null ? '' : iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : String(iso == null ? '' : iso);
}

export function dmyText(str) {
  return str == null ? '' : String(str).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, mo, day) => `${day}/${mo}/${y}`);
}

export function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function daySerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function dowOf(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return -1;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}


const PIN_STORAGE_KEY = 'bakery.pin';
const pinWrongListeners = new Set();

export function isValidPin(pin) {
  return /^\d{6}$/.test(String(pin == null ? '' : pin));
}

export function getPin() {
  try {
    return (localStorage.getItem(PIN_STORAGE_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

export function setPin(pin) {
  const clean = String(pin == null ? '' : pin).replace(/\D/g, '').slice(0, 6);
  if (!isValidPin(clean)) return false;
  try { localStorage.setItem(PIN_STORAGE_KEY, clean); } catch (e) {}
  return true;
}

export function clearPin() {
  try { localStorage.removeItem(PIN_STORAGE_KEY); } catch (e) {}
}

export function onWrongPin(fn) {
  pinWrongListeners.add(fn);
}

const networkListeners = new Set();

export function onNetworkStatus(fn) {
  networkListeners.add(fn);
}

function reportNetwork(ok) {
  networkListeners.forEach((fn) => {
    try { fn(ok); } catch (e) {}
  });
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  const msg = String(err.message || err);
  if (/server returned|could not read server reply/i.test(msg)) return false;
  if (err.name === 'TypeError') return true;
  return /failed to fetch|networkerror|network error|load failed/i.test(msg);
}

function handleWrongPin() {
  clearPin();
  pinWrongListeners.forEach((fn) => {
    try { fn(); } catch (e) {}
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, bodyText, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyText,
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Could not read server reply');
    }
  } finally {
    clearTimeout(timer);
  }
}

let mockModPromise = null;

function takeResult(result) {
  if (result && result.error === 'wrong_pin') handleWrongPin();
  return result;
}

export async function callApi(action, payload = {}, opts = {}) {
  const isWrite = !!opts.isWrite;
  const pin = getPin();
  if (DATA_MODE === 'mock') {
    if (!mockModPromise) mockModPromise = import('./mock.js');
    const mock = await mockModPromise;
    return takeResult(await mock.runMock(action, payload, pin));
  }

  const bodyText = JSON.stringify({ action, payload, pin });
  const timeoutMs = isWrite ? TIMEOUT_WRITE_MS : TIMEOUT_READ_MS;
  const maxAttempts = isWrite ? 1 : 1 + READ_RETRIES;

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = takeResult(await fetchWithTimeout(API_URL, bodyText, timeoutMs));
      reportNetwork(true);
      return result;
    } catch (err) {
      lastErr = err;
      if (isNetworkError(err)) reportNetwork(false);
      const isAbort = err && err.name === 'AbortError';
      if (attempt < maxAttempts) {
        await sleep(attempt === 1 ? 500 : 1200);
        continue;
      }
      if (isAbort) {
        throw new Error(isWrite
          ? 'Timed out waiting for reply — check the sheet before trying again.'
          : 'Request timed out. Tap Refresh to try again.');
      }
      throw err;
    }
  }
  throw lastErr || new Error('Network error');
}
