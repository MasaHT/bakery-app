import {
  DISPATCH_PRODUCTS,
  DISPATCH_MIN_DATE,
  DISPATCH_MAX_DATE,
  DISPATCH_ADMINS,
  DISPLAY_NAMES
} from '../config.js';
import { callApi, malawiToday, dmy, dmyText } from '../api.js';
import { esc, num, setupDateControl, renderDayWarnings, getWho, onWhoChange } from '../app.js';

function displayName(n) {
  return DISPLAY_NAMES[n] || n;
}

function signed(n) {
  return n == null ? '' : (n > 0 ? '+' : '') + num(n);
}

function isAdmin(name) {
  return DISPATCH_ADMINS.includes(String(name || '').toLowerCase().replace(/\s+/g, ' ').trim());
}

export async function mount(panel) {
  const today = malawiToday();
  const initialDate = today >= DISPATCH_MIN_DATE && today <= DISPATCH_MAX_DATE ? today : DISPATCH_MAX_DATE;

  panel.innerHTML = `
    <h2>Dispatch room: evening count</h2>
    <p class="note">The dispatch manager counts the room after Home's closing stock is back (~7 PM). Enter 0 if none.</p>

    <div class="block">
      <label class="field-label" for="dp-date">Date (Malawi)</label>
      <div class="date-ctrl">
        <div class="date-top">
          <input id="dp-date" type="date" min="${DISPATCH_MIN_DATE}" max="${DISPATCH_MAX_DATE}" value="${initialDate}" />
          <button type="button" id="dp-refresh" class="btn-refresh">↻ Refresh</button>
        </div>
        <div id="dp-date-chips" class="date-chips"></div>
      </div>
      <div id="dp-day-warnings"></div>
    </div>

    <p id="dp-status" class="note" role="status" aria-live="polite">Loading dispatch room…</p>

    <div id="dp-content" hidden>
      <form id="dp-form" novalidate>
        <div id="dp-warnings"></div>

        <section class="card">
          <p class="dp-sub" id="dp-required-h" style="margin-top:0">Count each product in the room</p>
          <div id="dp-rows" class="dp-grid"></div>

          <p class="dp-sub">Count only, not balanced yet (optional)</p>
          <div id="dp-bananas" class="dp-grid"></div>
          <p id="dp-banana-note" class="note" hidden></p>
        </section>

        <section class="card">
          <label class="field-label" for="dp-who">Counted by (your name)</label>
          <input id="dp-who" type="text" maxlength="40" autocomplete="name" placeholder="Your name" />
        </section>

        <label class="replace-day" id="dp-correct-box" hidden>
          <input id="dp-correct" type="checkbox" />
          <span><strong>Correct this count</strong>
            <small>Masa or Pascal only. Every change is logged.</small>
          </span>
        </label>

        <button id="dp-save" class="save" type="submit">Save count</button>
        <p id="dp-save-msg" class="saved" role="status"></p>
        <p id="dp-save-err" class="form-hint" role="alert"></p>
      </form>

      <div id="dp-result" class="card" hidden style="margin-top:14px"></div>
    </div>
  `;

  const el = (id) => panel.querySelector('#dp-' + id);
  let dpState = null;
  let dpLoaded = '';
  let dpBusy = false;
  let dpSeq = 0;

  setupDateControl(el('date'), el('date-chips'), { min: DISPATCH_MIN_DATE, max: DISPATCH_MAX_DATE });

  function updateWarnings() {
    el('day-warnings').innerHTML = renderDayWarnings(el('date').value, '');
  }

  function renderResultHtml(rows, bananas) {
    let totE = 0, totC = 0, totG = 0, red = 0;
    const body = rows.map((r) => {
      totE += r.expected || 0;
      totC += r.counted || 0;
      totG += r.gap || 0;
      if (r.gap) red++;
      return `
        <tr>
          <td>${esc(displayName(r.name))}</td>
          <td>${num(r.expected)}</td>
          <td>${num(r.counted)}</td>
          <td class="${r.gap == null ? '' : r.gap ? 'dp-red' : 'dp-ok'}">${signed(r.gap)}</td>
        </tr>`;
    }).join('');
    const ban = (bananas || []).filter((b) => b.setUp).map((b) => `
      <tr>
        <td>${esc(b.name)}</td>
        <td class="dp-nt">—</td>
        <td>${b.counted == null ? '' : num(b.counted)}</td>
        <td class="dp-nt">not tracked yet</td>
      </tr>`).join('');
    return `
      <table class="dp-tbl">
        <tr><th>Product</th><th>Expected</th><th>Counted</th><th>Gap</th></tr>
        ${body}
        <tr class="dp-tot"><td>Total (${rows.length})</td><td>${num(totE)}</td><td>${num(totC)}</td><td>${signed(totG)}</td></tr>
        ${ban ? `<tr class="dp-sep"><td colspan="4">Count only, not in totals</td></tr>${ban}` : ''}
      </table>
      ${red
        ? `<p class="warn-banner" style="margin:8px 0 0">${red} product(s) don't balance (red). Check for a missed entry or miscount.</p>`
        : `<p class="note" style="margin:8px 0 0">All ${rows.length} products balance.</p>`}`;
  }

  function render() {
    const S = dpState;
    const locked = S.counted && !el('correct').checked;
    el('warnings').innerHTML = [
      S.windowNote ? `<p class="warn-banner">${esc(S.windowNote)}</p>` : '',
      ...(S.problems || []).map((p) => `<p class="warn-banner">${esc(p)}</p>`),
      ...(S.warnings || []).map((w) => `<p class="warn-banner">⚠ ${esc(w)} You can still save.</p>`)
    ].join('');

    const byName = {};
    (S.products || []).forEach((p) => { byName[p.name] = p; });
    const list = S.products?.length ? S.products.map((p) => p.name) : DISPATCH_PRODUCTS;
    el('required-h').textContent = `Count each product in the room (all ${list.length} required)`;

    el('rows').innerHTML = list.map((n) => {
      const p = byName[n] || {};
      const id = 'dp-q-' + n.replace(/\W/g, '');
      const isRec = p.counted != null;
      return `
        <label for="${id}" class="${isRec ? 'pname' : ''}" style="${isRec ? 'color:var(--red);font-weight:650' : ''}">
          ${esc(displayName(n))}
          ${isRec ? '<span class="already-tag" style="display:inline-block">already entered</span>' : ''}
        </label>
        <input id="${id}" data-dp="${esc(n)}" type="number" min="0" max="99999" step="1" inputmode="numeric" required value="${p.counted == null ? '' : p.counted}"${locked || !S.writable ? ' disabled' : ''} />`;
    }).join('');

    el('bananas').innerHTML = (S.bananas || []).map((b) => {
      const id = 'dp-b-' + b.name.replace(/\W/g, '');
      return `
        <label for="${id}">${esc(b.name)}</label>
        <input id="${id}" data-dpb="${esc(b.name)}" type="number" min="0" max="99999" step="1" inputmode="numeric" placeholder="optional" value="${b.counted == null ? '' : b.counted}"${locked || !S.writable || !b.setUp ? ' disabled' : ''} />`;
    }).join('');

    el('banana-note').hidden = !S.bananaNote;
    el('banana-note').textContent = S.bananaNote || '';
    el('correct-box').hidden = !S.counted;
    el('save').disabled = dpBusy || !S.writable || locked;
    el('save').textContent = S.counted ? 'Save correction' : 'Save count';

    if (S.counted && S.result) {
      el('result').hidden = false;
      el('result').innerHTML = `<h3>Saved count${S.name ? ` · counted by ${esc(S.name)}` : ''}</h3>${renderResultHtml(S.result, S.bananas)}`;
    } else {
      el('result').hidden = true;
      el('result').innerHTML = '';
    }
  }

  async function loadDispatch(force = false) {
    const date = el('date').value;
    updateWarnings();
    if (dpBusy || (!force && date === dpLoaded)) return;
    if (!date || date < DISPATCH_MIN_DATE || date > DISPATCH_MAX_DATE) {
      el('status').textContent = `The dispatch room count is set up for ${dmy(DISPATCH_MIN_DATE)}–${dmy(DISPATCH_MAX_DATE)} only.`;
      el('content').hidden = true;
      return;
    }

    const seq = ++dpSeq;
    dpBusy = true;
    dpState = null;
    dpLoaded = '';
    el('content').hidden = true;
    el('status').textContent = 'Loading dispatch room…';
    el('date').disabled = true;
    el('refresh').disabled = true;

    try {
      const data = await callApi('readDispatch', { date }, { isWrite: false });
      if (seq !== dpSeq) return;
      if (!data || !data.ok) {
        el('status').textContent = 'Could not load: ' + dmyText(data?.error || 'unknown error');
        return;
      }
      dpState = data;
      dpLoaded = date;
      el('correct').checked = false;
      if (!el('who').value.trim()) {
        el('who').value = getWho() || '';
      }
      render();
      el('content').hidden = false;
      el('status').textContent = `${dmy(date)} · ${data.counted ? `already counted${data.name ? ` by ${data.name}` : ''}` : 'not counted yet'}`;
    } catch (err) {
      if (seq !== dpSeq) return;
      el('status').textContent = err?.message || 'Could not load dispatch room. Tap Refresh to try again.';
    } finally {
      if (seq === dpSeq) {
        dpBusy = false;
        el('date').disabled = false;
        el('refresh').disabled = false;
        if (dpState) render();
      }
    }
  }

  el('date').addEventListener('change', () => loadDispatch(true));
  el('refresh').addEventListener('click', () => loadDispatch(true));
  el('correct').addEventListener('change', function () {
    el('save-err').classList.remove('show');
    if (this.checked && !isAdmin(el('who').value)) {
      this.checked = false;
      el('save-err').textContent = 'Only Masa or Pascal can correct a saved count. Type your name first.';
      el('save-err').classList.add('show');
      return;
    }
    render();
  });

  el('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (dpBusy || !dpState) return;
    el('save-msg').classList.remove('show');
    el('save-err').classList.remove('show');

    const who = el('who').value.trim();
    const counts = {};
    const bananas = {};
    const missing = [];
    el('rows').querySelectorAll('input[data-dp]').forEach((i) => {
      const v = i.value.trim();
      if (v === '') missing.push(i.dataset.dp);
      else counts[i.dataset.dp] = v;
    });
    el('bananas').querySelectorAll('input[data-dpb]').forEach((i) => {
      bananas[i.dataset.dpb] = i.value.trim();
    });

    if (missing.length) {
      el('save-err').textContent = `Enter a count for every product (0 if none): ${missing.join(', ')}.`;
      el('save-err').classList.add('show');
      return;
    }
    if (who.length < 2 || !/^[A-Za-z][A-Za-z .'\-]*$/.test(who)) {
      el('save-err').textContent = 'Type your name (letters only).';
      el('save-err').classList.add('show');
      el('who').focus();
      return;
    }

    const correction = !!(dpState.counted && el('correct').checked);
    const loaded = { counts: {}, name: dpState.name || '' };
    (dpState.products || []).forEach((p) => { loaded.counts[p.name] = p.counted; });

    dpBusy = true;
    el('save').disabled = true;
    el('save').textContent = 'Saving…';

    try {
      const res = await callApi('saveDispatchCount', {
        date: dpLoaded,
        who,
        counts,
        bananas,
        correction,
        loaded
      }, { isWrite: true });

      if (!res || !res.ok) {
        el('save-err').textContent = dmyText(res?.error || 'Could not save count.');
        el('save-err').classList.add('show');
        return;
      }

      dpState.counted = true;
      dpState.name = res.name;
      dpState.result = res.result;
      dpState.bananas = res.bananas;
      (dpState.products || []).forEach((p) => {
        const r = res.result.find((x) => x.name === p.name);
        if (r) p.counted = r.counted;
      });
      el('correct').checked = false;
      dpBusy = false;
      render();
      el('save-msg').textContent = `${res.type === 'correction' ? 'Correction saved' : 'Saved'} for ${dmy(res.date)} by ${res.name}.`;
      el('save-msg').classList.add('show');
      el('status').textContent = `${dmy(res.date)} · counted by ${res.name}`;
    } catch (err) {
      el('save-err').textContent = err?.message || 'Could not save count — try again.';
      el('save-err').classList.add('show');
    } finally {
      dpBusy = false;
      render();
    }
  });

  onWhoChange((name) => {
    const w = el('who');
    if (w && !dpState?.counted) w.value = name;
  });

  await loadDispatch(true);
}
