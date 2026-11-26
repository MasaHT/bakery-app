import {
  PRODUCTION_NAMES,
  PRODUCTION_DEFAULTS,
  PRODUCTION_MIN_DATE,
  PRODUCTION_MAX_DATE,
  DISPLAY_NAMES
} from '../config.js';
import { callApi, malawiToday, dmy, dmyText } from '../api.js';
import { esc, kw, num, setupDateControl, renderDayWarnings, notifySaved } from '../app.js';

function displayName(n) {
  return DISPLAY_NAMES[n] || n;
}

function priceLabel(n) {
  return n == null || !isFinite(n) ? 'no price' : 'K' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export async function mount(panel) {
  const today = malawiToday();
  const initialDate = today >= PRODUCTION_MIN_DATE && today <= PRODUCTION_MAX_DATE ? today : PRODUCTION_MAX_DATE;

  panel.innerHTML = `
    <h2>Production</h2>
    <div class="block">
      <label class="field-label" for="pr-date">Production date (Malawi)</label>
      <div class="date-ctrl">
        <div class="date-top">
          <input id="pr-date" type="date" min="${PRODUCTION_MIN_DATE}" max="${PRODUCTION_MAX_DATE}" value="${initialDate}" />
          <button type="button" id="pr-refresh" class="btn-refresh">↻ Refresh</button>
        </div>
        <div id="pr-date-chips" class="date-chips"></div>
      </div>
      <div id="pr-day-warnings"></div>
    </div>

    <p id="pr-status" class="note" role="status" aria-live="polite">Loading production…</p>

    <div id="pr-content" hidden>
      <form id="pr-form">
        <section class="card">
          <p class="note">Day and Night are entered on the same date. Night counts in the next day's Daily Report. Leave blank if not entered; enter 0 for zero.</p>
          <div class="pr-row pr-head"><span>Product</span><span>Day</span><span>Night</span></div>
          <div id="pr-rows"></div>
          <div class="add-product">
            <label class="sr-only" for="pr-add">Add product</label>
            <select id="pr-add"></select>
            <button id="pr-add-btn" type="button" aria-label="Add product">Add</button>
          </div>
        </section>

        <section id="pr-inputs-wrap" class="card" hidden>
          <h3>Inputs used</h3>
          <p id="pr-inputs-note" class="note"></p>
          <div class="pr-row pr-head"><span>Input</span><span>Day</span><span>Night</span></div>
          <div id="pr-inputs"></div>
          <p id="pr-inputs-total" class="pr-in-total"></p>
        </section>

        <label class="replace-day">
          <input id="pr-replace" type="checkbox" />
          <span><strong>Replace this day</strong>
            <small>Tick to unlock already-entered numbers for editing. Blank cells never clear existing numbers.</small>
          </span>
        </label>

        <button id="pr-save" class="save" type="submit">Save production</button>
        <p id="pr-save-msg" class="saved" role="status"></p>
        <p id="pr-save-err" class="form-hint" role="alert"></p>
      </form>

      <section id="pr-totals" class="card" aria-label="Month so far" style="margin-top:14px"></section>
    </div>
  `;

  const el = (id) => panel.querySelector('#pr-' + id);
  let prState = null;
  let prShown = [];
  let prLoadedDate = '';
  let prBusy = false;
  let prDirty = false;
  let prSeq = 0;

  setupDateControl(el('date'), el('date-chips'), { min: PRODUCTION_MIN_DATE, max: PRODUCTION_MAX_DATE });

  function updateWarnings() {
    el('day-warnings').innerHTML = renderDayWarnings(el('date').value, '');
  }

  function lockInputs() {
    if (!prState) return;
    const replace = el('replace').checked;
    el('rows').querySelectorAll('input').forEach((inp) => {
      const row = prState.rows.find((r) => r.name === inp.dataset.product);
      const hasVal = row && row[inp.dataset.shift] !== null;
      inp.disabled = prBusy || !prState.writable || (!replace && hasVal);
    });
    const inpState = prState.inputs;
    el('inputs').querySelectorAll('input').forEach((inp) => {
      const row = inpState?.rows[+inp.dataset.input];
      const hasVal = row && row[inp.dataset.shift] !== null;
      inp.disabled = prBusy || !prState.writable || !!inpState?.locked || !row?.writable || (!replace && hasVal);
    });
    el('save').disabled = prBusy || !prState.writable;
  }

  function calcInputs() {
    const inp = prState?.inputs;
    if (!inp || !inp.ok) return;
    let total = 0;
    let typedAny = false;
    let anyPrice = false;
    inp.rows.forEach((row, i) => {
      const valOf = (s) => {
        const input = el('inputs').querySelector(`input[data-input="${i}"][data-shift="${s}"]`);
        if (input && !input.disabled && input.value !== '' && isFinite(Number(input.value)) && Number(input.value) !== row[s]) {
          typedAny = true;
          return Number(input.value);
        }
        return row[s];
      };
      const dq = valOf('day');
      const nq = valOf('night');
      let amt = null;
      if (row.price != null && (dq != null || nq != null)) {
        amt = ((dq || 0) + (nq || 0)) * row.price;
        total += amt;
        anyPrice = true;
      }
      const noteEl = el('inputs').querySelector(`[data-in-amt="${i}"]`);
      if (noteEl) {
        noteEl.textContent = `@ ${priceLabel(row.price)} · ${amt == null ? '—' : kw(amt)}${row.fixed ? ' · fixed daily cost' : ''}`;
      }
    });
    el('inputs-total').innerHTML = `<span>Total input cost${typedAny ? ' (with typed)' : ''}</span><span>${anyPrice || inp.total != null ? kw(typedAny || inp.total == null ? total : inp.total) : '—'}</span>`;
  }

  function renderInputs() {
    const inp = prState.inputs;
    const wrap = el('inputs-wrap');
    if (!inp) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (!inp.ok) {
      el('inputs').innerHTML = `<p class="hint show">${esc((inp.problems || []).join('; '))}</p>`;
      el('inputs-total').innerHTML = '';
      return;
    }
    el('inputs-note').textContent = inp.locked
      ? 'This day’s inputs were entered as one combined number in Day qty, so they are view-only here.'
      : 'What each shift used, as named in the sheet. Amount = (Day + Night) × price.';
    el('inputs').innerHTML = inp.rows.map((r, i) => `
      <div class="pr-row pr-in${r.day !== null || r.night !== null ? ' is-rec' : ''}">
        <span class="pr-in-name"><strong>${esc(r.name)}</strong><small data-in-amt="${i}"></small></span>
        ${['day', 'night'].map((s) => `
          <label><span class="sr-only">${esc(r.name)} ${s}</span>
            <input class="${r[s] !== null ? 'is-rec-cell' : ''}" aria-label="${esc(r.name)} ${s}" data-input="${i}" data-shift="${s}" type="number" min="0" step="any" inputmode="decimal" value="${r[s] === null ? '' : r[s]}" />
          </label>`).join('')}
      </div>`).join('');
    calcInputs();
  }

  function renderRows() {
    el('rows').innerHTML = prShown.map((n) => {
      const r = prState.rows.find((x) => x.name === n) || { day: null, night: null };
      const anyRec = r.day !== null || r.night !== null;
      return `
        <div class="pr-row${anyRec ? ' is-rec' : ''}">
          <span class="pname"><strong>${esc(displayName(n))}</strong>${anyRec ? ' <span class="already-tag">already entered</span>' : ''}</span>
          ${['day', 'night'].map((s) => `
            <label><span class="sr-only">${esc(n)} ${s}</span>
              <input class="${r[s] !== null ? 'is-rec-cell' : ''}" aria-label="${esc(n)} ${s}" data-product="${esc(n)}" data-shift="${s}" type="number" min="0" step="1" inputmode="numeric" value="${r[s] === null ? '' : r[s]}" />
            </label>`).join('')}
        </div>`;
    }).join('');
    const left = PRODUCTION_NAMES.filter((n) => !prShown.includes(n));
    el('add').innerHTML = `<option value="">Add product…</option>${left.map((n) => `<option value="${esc(n)}">${esc(displayName(n))}</option>`).join('')}`;
    el('add-btn').disabled = !left.length;
    lockInputs();
  }

  function renderTotals() {
    el('totals').innerHTML = `
      <h3>Month so far</h3>
      <p class="note">01/11/2026 through ${esc(dmy(prState.date))}. Blank = not entered; 0 = zero.</p>
      <div class="pr-total-row pr-head"><span>Product</span><span>Day</span><span>Night</span><span>Total</span></div>
      ${(prState.totals || []).map((t) => `
        <div class="pr-total-row">
          <strong>${esc(displayName(t.name))}</strong>
          <span>${t.day == null ? '—' : num(t.day)}</span>
          <span>${t.night == null ? '—' : num(t.night)}</span>
          <strong>${t.total == null ? '—' : num(t.total)}</strong>
        </div>`).join('')}`;
  }

  async function loadProduction(force = false) {
    const date = el('date').value;
    updateWarnings();
    if (prBusy || (!force && date === prLoadedDate)) return;
    if (!date || date < PRODUCTION_MIN_DATE || date > PRODUCTION_MAX_DATE) {
      el('status').textContent = `Production is set up for ${dmy(PRODUCTION_MIN_DATE)}–${dmy(PRODUCTION_MAX_DATE)} only.`;
      el('content').hidden = true;
      return;
    }

    const seq = ++prSeq;
    prBusy = true;
    prState = null;
    prLoadedDate = '';
    prDirty = false;
    el('content').hidden = true;
    el('status').textContent = 'Loading production…';
    el('date').disabled = true;
    el('refresh').disabled = true;

    try {
      const data = await callApi('readProduction', { date }, { isWrite: false });
      if (seq !== prSeq) return;
      if (!data || !data.ok) {
        el('status').textContent = 'Could not load: ' + dmyText(data?.error || 'unknown error');
        return;
      }
      data.rows.forEach((r) => { ['day', 'night'].forEach((s) => { if (r[s] == null || r[s] === '') r[s] = null; }); });
      if (data.inputs?.rows) {
        data.inputs.rows.forEach((r) => { ['day', 'night'].forEach((s) => { if (r[s] == null || r[s] === '') r[s] = null; }); });
      }
      prState = data;
      prLoadedDate = date;
      prShown = PRODUCTION_DEFAULTS.slice();
      el('replace').checked = false;
      data.rows.forEach((r) => {
        if ((r.day !== null || r.night !== null) && !prShown.includes(r.name)) prShown.push(r.name);
      });
      renderInputs();
      renderRows();
      renderTotals();
      el('content').hidden = false;
      el('status').textContent = `Loaded ${dmy(date)}. Red boxes already have numbers in the sheet.`;
    } catch (err) {
      if (seq !== prSeq) return;
      el('status').textContent = err?.message || 'Could not load production. Tap Refresh to try again.';
    } finally {
      if (seq === prSeq) {
        prBusy = false;
        el('date').disabled = false;
        el('refresh').disabled = false;
        lockInputs();
      }
    }
  }

  el('date').addEventListener('change', () => {
    if (prDirty && !window.confirm('Discard unsaved production changes?')) {
      el('date').value = prLoadedDate;
      return;
    }
    loadProduction(true);
  });
  el('refresh').addEventListener('click', () => {
    if (!prDirty || window.confirm('Discard unsaved production changes?')) loadProduction(true);
  });
  el('replace').addEventListener('change', () => { if (prState) { lockInputs(); calcInputs(); } });
  el('inputs').addEventListener('input', () => { prDirty = true; calcInputs(); });
  el('rows').addEventListener('input', () => { prDirty = true; });
  el('add-btn').addEventListener('click', () => {
    const n = el('add').value;
    if (!n || prShown.includes(n)) return;
    const typed = {};
    el('rows').querySelectorAll('input').forEach((i) => { typed[i.dataset.product + '|' + i.dataset.shift] = i.value; });
    prShown.push(n);
    renderRows();
    el('rows').querySelectorAll('input').forEach((i) => {
      const k = i.dataset.product + '|' + i.dataset.shift;
      if (Object.prototype.hasOwnProperty.call(typed, k)) i.value = typed[k];
    });
  });

  el('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (prBusy || !prState || !prState.writable || !el('form').reportValidity()) return;
    el('save-msg').classList.remove('show');
    el('save-err').classList.remove('show');

    const items = [];
    prShown.forEach((n) => {
      const row = prState.rows.find((r) => r.name === n) || { day: null, night: null };
      const it = { name: n, day: '', night: '', expected: { day: row.day, night: row.night } };
      el('rows').querySelectorAll('input').forEach((i) => {
        if (i.dataset.product === n && !i.disabled) it[i.dataset.shift] = i.value;
      });
      if (it.day !== '' || it.night !== '') items.push(it);
    });

    const inputs = [];
    if (prState.inputs?.ok) {
      prState.inputs.rows.forEach((r, idx) => {
        const it = { name: r.name, day: '', night: '', expected: { day: r.day, night: r.night } };
        el('inputs').querySelectorAll(`input[data-input="${idx}"]`).forEach((i) => {
          if (!i.disabled) it[i.dataset.shift] = i.value;
        });
        if (it.day !== '' || it.night !== '') inputs.push(it);
      });
    }

    if (!items.length && !inputs.length) {
      el('save-err').textContent = 'Enter a quantity in an empty box, or tick Replace this day.';
      el('save-err').classList.add('show');
      return;
    }

    const body = { date: prLoadedDate, replace: el('replace').checked, items };
    if (inputs.length) body.inputs = inputs;

    prBusy = true;
    lockInputs();
    el('date').disabled = true;
    el('refresh').disabled = true;
    el('replace').disabled = true;
    el('add-btn').disabled = true;
    el('save').textContent = 'Saving…';

    try {
      const res = await callApi('saveProduction', body, { isWrite: true });
      if (!res || !res.ok) {
        el('save-err').textContent = dmyText(res?.error || 'Could not save production.');
        el('save-err').classList.add('show');
        return;
      }
      prDirty = false;
      const msg = `Saved ${res.written.length} number(s) for ${dmy(prLoadedDate)}.`
        + (res.skipped?.length ? ` ${res.skipped.length} already-entered number(s) kept.` : '');
      prBusy = false;
      await loadProduction(true);
      el('save-msg').textContent = msg;
      el('save-msg').classList.add('show');
      notifySaved(msg);
    } catch (err) {
      el('save-err').textContent = err?.message || 'Could not save production — try again.';
      el('save-err').classList.add('show');
    } finally {
      prBusy = false;
      el('date').disabled = false;
      el('refresh').disabled = false;
      el('replace').disabled = false;
      el('add-btn').disabled = false;
      el('save').textContent = 'Save production';
      lockInputs();
    }
  });

  await loadProduction(true);
}
