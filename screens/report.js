// Daily report (read-only). Loads only when the Report tab is tapped.
// Short report first; "Show full details" loads the full old-app report on tap.
// The phone keeps only the last short headline (shown with "as of HH:MM" when offline); full details are never kept.
import { callApi, malawiToday, dmy, REPORT_HEAD_KEY, REPORT_STALE_KEY } from '../api.js';
import { esc, kw, setupDateControl } from '../app.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function readHead() {
  try { const h = JSON.parse(localStorage.getItem(REPORT_HEAD_KEY) || 'null'); return h && h.data && h.date ? h : null; } catch (e) { return null; }
}
function saveHead(date, data) {
  try { localStorage.setItem(REPORT_HEAD_KEY, JSON.stringify({ date, data })); } catch (e) {}
}
function isStale() { try { return localStorage.getItem(REPORT_STALE_KEY) === '1'; } catch (e) { return false; } }
function clearStale() { try { localStorage.removeItem(REPORT_STALE_KEY); } catch (e) {} }

function asOf(r) {
  const m = /(\d{2}:\d{2})/.exec(String(r && r.generatedAt || ''));
  return m ? m[1] : '';
}

function shopFlag(s, S) {
  if (s.isCredit) return '';
  if (s.checkStock) return '<span class="rp-flag red">Check stock</span>';
  if (s.hasAny && !s.counted) return '<span class="rp-flag amber">Not counted</span>';
  if (!s.hasAny) return '<span class="rp-flag grey">Nothing entered</span>';
  if (s.cashKind !== 'recorded') return '<span class="rp-flag amber">No cash</span>';
  if ((S.noExpenses || []).includes(s.name)) return '<span class="rp-flag amber">No expenses</span>';
  if (s.gap > 0) return `<span class="rp-flag amber">Short ${esc(kw(s.gap))}</span>`;
  return '<span class="rp-flag ok">OK</span>';
}

function shopSales(s) {
  if (!s.hasAny) return '—';
  if (!s.isCredit && !s.counted) return '<span class="rp-uncounted">not counted</span>';
  return esc(kw(s.sales));
}
function shopCash(s) {
  if (s.isCredit) return '<span class="rp-dimtxt">on credit</span>';
  return s.cashKind === 'recorded' || s.cashKind === 'calculated' ? esc(kw(s.cash)) : '—';
}

export function renderShort(r) {
  const S = r.summary;
  const dow = DAYS[r.dow] || '';
  const dateLabel = `${dow} ${dmy(r.date).slice(0, 5)}`;
  if (!r.sources || !r.sources.wholesale || !r.sources.wholesale.ok) {
    return '<div class="rp-box"><p class="rp-warn">Could not read the sales sheet. This is a reading problem, not missing numbers. Tap Refresh to try again.</p></div>';
  }
  if (!r.sources.wholesale.found || !S) {
    return `<div class="rp-box"><p class="rp-hero-label">${esc(dateLabel)}</p><p class="rp-none">Nothing in the sales sheet for this day yet.</p>${r.sunday ? '<p class="note">Sunday — the bakery is closed.</p>' : ''}</div>`;
  }
  const notC = S.shopsNotCounted || [];
  const cs = S.shopsCheckStock || [];
  const warns = [];
  cs.forEach((n) => warns.push(`${n}: check stock — not counted`));
  notC.filter((n) => !cs.includes(n)).forEach((n) => warns.push(`${n}: Stock left not typed — not counted`));

  const boxes = [['Sales', S.sales], ['Expenses', S.expenses], ['Credit', S.credit]];
  if (S.cashGap > 0) boxes.push(['Cash short', S.cashGap, 'warn']);
  if (S.expensesFamily > 0) boxes.push(['Family money', S.expensesFamily]);

  const notes = [];
  (S.expensesHeldBack || []).forEach((h) => notes.push(`${esc(h.shop)} expenses ${esc(kw(h.amount))} left out of Money made (shop not counted).`));
  if (S.expensesFamily > 0) notes.push('Family money is not taken out of Money made.');
  if (S.expensesFarm > 0) notes.push(`Farm ${esc(kw(S.expensesFarm))} is not in Money made.`);
  if (S.expensesNotSplit > 0) notes.push(`${esc(kw(S.expensesNotSplit))} of expenses not marked Bakery or Family — not in Money made.`);

  const rows = (S.shops || []).map((s) => `<tr><td>${esc(s.name)}</td><td>${shopSales(s)}</td><td>${shopCash(s)}</td><td>${shopFlag(s, S)}</td></tr>`).join('');

  const top = r.top || [];
  let attn;
  if (!top.length) attn = '<p class="rp-caught">Nothing needs attention.</p>';
  else attn = `<ul class="rp-attn">${top.map((t) => `<li class="${t.level === 'red' ? 'red' : 'amber'}">${esc(t.text)}</li>`).join('')}</ul>` +
    (r.moreCount > 0 ? `<p class="rp-more-note">${r.moreCount} more in full details.</p>` : '');

  const mm = S.moneyMade;
  return `
    <div class="rp-box">
      <div class="rp-hero-row">
        <p class="rp-hero-label">Money made</p>
        <span class="rp-day">${esc(dateLabel)}</span>
      </div>
      <p class="rp-hero${mm < 0 ? ' neg' : ''}${notC.length ? ' partial' : ''}">${esc(kw(mm))}</p>
      ${warns.map((w) => `<p class="rp-warn">${esc(w)}</p>`).join('')}
      ${r.sunday ? '<p class="note">Sunday — the bakery is closed.</p>' : ''}
      <div class="rp-boxes">${boxes.map(([l, v, c]) => `<div class="${c || ''}"><small>${esc(l)}</small><strong>${esc(kw(v || 0))}</strong></div>`).join('')}</div>
      ${notes.map((n) => `<p class="rp-small">${n}</p>`).join('')}
      <table class="rp-shops-t"><thead><tr><th>Shop</th><th>Sales</th><th>Cash</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="rp-box">
      <h3 class="rp-attn-h">Needs attention</h3>
      ${attn}
    </div>`;
}

export async function mount(panel) {
  const today = malawiToday();
  panel.innerHTML = `
    <h2>Daily report</h2>
    <div class="block">
      <label class="field-label" for="rp-date">Day (Malawi)</label>
      <div class="date-ctrl">
        <div class="date-top">
          <input id="rp-date" type="date" max="${today}" value="${today}" />
          <button type="button" id="rp-refresh" class="btn-refresh">↻ Refresh</button>
        </div>
        <div id="rp-date-chips" class="date-chips"></div>
      </div>
    </div>
    <p id="rp-status" class="rp-status" role="status" aria-live="polite"></p>
    <div id="rp-short"></div>
    <button type="button" id="rp-more" class="rp-more-btn" aria-expanded="false" aria-controls="rp-full" hidden>Show full details</button>
    <div id="rp-full" hidden></div>
  `;
  const el = (id) => panel.querySelector('#rp-' + id);
  setupDateControl(el('date'), el('date-chips'), { max: today });

  let seq = 0;
  let shownDate = '';
  let fullSeq = 0;

  function status(text, kind) {
    const s = el('status');
    s.textContent = text || '';
    s.className = 'rp-status' + (kind ? ' ' + kind : '');
  }
  function resetFull() {
    fullSeq++;
    const f = el('full');
    f.hidden = true; f.innerHTML = '';
    el('more').textContent = 'Show full details';
    el('more').setAttribute('aria-expanded', 'false');
  }
  function show(r) {
    el('short').innerHTML = renderShort(r);
    el('more').hidden = !(r.sources && r.sources.wholesale && r.sources.wholesale.ok && r.sources.wholesale.found);
  }

  async function load(force) {
    const date = el('date').value;
    if (!date) { status('Pick a day.'); return; }
    const my = ++seq;
    const useForce = !!force || isStale();
    if (shownDate !== date) resetFull();
    shownDate = date;
    const head = readHead();
    const headHere = head && head.date === date ? head : null;
    if (headHere) {
      show(headHere.data);
      status(`Saved copy, as of ${asOf(headHere.data)} (Malawi time). Getting the latest…`);
    } else {
      el('short').innerHTML = '<div class="rp-box rp-loading"><p>Loading the report…</p></div>';
      el('more').hidden = true;
      status('');
    }
    try {
      const r = await callApi('readReportSummary', { date, force: useForce });
      if (my !== seq) return;
      if (!r || r.ok === false) {
        if (r && r.error === 'wrong_pin') { status('The Family PIN on this phone is not right. Enter the PIN, then tap Refresh.', 'warn'); return; }
        status('Could not load the report' + (r && r.error ? ': ' + r.error : '') + '. Tap Refresh to try again.', 'warn');
        return;
      }
      show(r);
      saveHead(date, r);
      if (useForce) clearStale();
      status(`As of ${asOf(r)} (Malawi time)${r.practice ? ' · Practice example numbers' : ''}.`);
    } catch (err) {
      if (my !== seq) return;
      if (headHere) {
        status(`No internet. Showing the last report saved on this phone, as of ${asOf(headHere.data)} (Malawi time). It may be old.`, 'offline');
      } else {
        el('short').innerHTML = '';
        el('more').hidden = true;
        const other = head && head.date !== date ? ` The last saved report on this phone is for ${dmy(head.date)}.` : '';
        status(`No internet. The report needs internet to load.${other}`, 'offline');
      }
    }
  }

  async function toggleFull() {
    const f = el('full'), btn = el('more');
    if (!f.hidden) { resetFull(); return; }
    const date = el('date').value;
    const my = ++fullSeq;
    f.hidden = false;
    btn.textContent = 'Hide full details';
    btn.setAttribute('aria-expanded', 'true');
    f.innerHTML = '<div class="rp-box rp-loading"><p>Loading full details…</p></div>';
    try {
      const [mod, r] = await Promise.all([import('./report-full.js'), callApi('readReportFull', { date, force: false })]);
      if (my !== fullSeq) return;
      if (!r || r.ok === false) throw new Error(r && r.error || 'not loaded');
      mod.renderFull(f, r);
    } catch (err) {
      if (my !== fullSeq) return;
      f.innerHTML = '<div class="rp-box"><p class="rp-warn">Full details could not load. They need internet. Tap "Hide full details", then try again.</p></div>';
    }
  }

  el('refresh').addEventListener('click', () => load(true));
  el('date').addEventListener('change', () => load(false));
  el('more').addEventListener('click', toggleFull);

  await load(false);

  mountedOnShow = () => {
    // No timer. Fetch again only when this phone saved something since, or the day changed.
    if (isStale() || shownDate !== el('date').value) load(false);
  };
}

let mountedOnShow = null;
export function onShow() {
  if (mountedOnShow) mountedOnShow();
}
