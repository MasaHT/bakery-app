import {
  SHOPS,
  PRODUCTS,
  DEFAULT_PRODUCTS,
  TOWN_EXTRAS,
  DISPLAY_NAMES,
  ST_JOHN_DEFAULTS,
  ST_JOHN_PRODUCTS,
  HANDOVER_PRODUCTS,
  HANDOVER_DEFAULTS,
  HANDOVER_LABELS
} from '../config.js';
import { callApi, malawiToday, dmy, dmyText } from '../api.js';
import { esc, kw, setupDateControl, renderDayWarnings, getWho } from '../app.js';

function displayName(n) {
  return DISPLAY_NAMES[n] || n;
}

function hoLabel(n) {
  return HANDOVER_LABELS[n] || displayName(n);
}

function hoId() {
  return 'ho-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export async function mount(panel) {
  const today = malawiToday();

  panel.innerHTML = `
    <form id="ws-entry" novalidate>
      <section class="card" aria-label="Date and shop">
        <div class="block">
          <label class="field-label" for="ws-date">Date (Malawi)</label>
          <div class="date-ctrl">
            <div class="date-top">
              <input id="ws-date" name="date" type="date" required value="${today}" />
              <button type="button" id="ws-refresh" class="btn-refresh" aria-label="Reload saved numbers">↻ Refresh</button>
            </div>
            <div id="ws-date-chips" class="date-chips"></div>
          </div>
          <p id="ws-date-err" class="hint" role="alert">Enter a date</p>
        </div>

        <div class="block" style="margin-bottom:4px">
          <label class="field-label" for="ws-shop">Shop</label>
          <select id="ws-shop" name="shop">
            ${SHOPS.map((s, idx) => `<option value="${esc(s.value)}"${idx === 0 ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div id="ws-day-warnings" style="margin-top:8px"></div>
        <p id="ws-date-recorded" class="hint" role="status">This day already has saved numbers. Existing numbers are kept unless you tick “Replace this day”.</p>
      </section>

      <section class="card" aria-labelledby="ws-morning-h">
        <h2 id="ws-morning-h">Morning delivery</h2>
        <p id="ws-morning-already" class="already-line" role="status"></p>
        <p id="ws-legacy-note" class="note">Enter morning deliveries for this shop. Leave unused rows blank.</p>
        <div id="ws-morning-rows"></div>
        <div class="add-product" data-add="morning">
          <label class="sr-only" for="ws-morning-add">Add product to morning</label>
          <select id="ws-morning-add" aria-label="Add product to morning"></select>
          <button type="button" id="ws-morning-add-btn" aria-label="Add product row to morning">Add</button>
        </div>

        <div id="ws-stjohn-delivery" hidden>
          <p class="note">Morning delivery. No closing stock for St. John's. Leave unused quantities blank.</p>
          <p id="ws-delivery-already" class="already-line" role="status"></p>
          <div id="ws-delivery-rows"></div>
          <div class="add-product" data-add="delivery">
            <label class="sr-only" for="ws-delivery-add">Add product to morning delivery</label>
            <select id="ws-delivery-add" aria-label="Add product to morning delivery"></select>
            <button type="button" id="ws-delivery-add-btn" aria-label="Add product row to morning delivery">Add</button>
          </div>
          <button type="button" id="ws-sj-pm-btn" class="sj-pm-btn">+ Add afternoon delivery</button>
          <div id="ws-sj-pm" hidden>
            <h3>Afternoon delivery</h3>
            <p id="ws-delivery2-already" class="already-line" role="status"></p>
            <div id="ws-delivery2-rows"></div>
            <div class="add-product" data-add="delivery2">
              <label class="sr-only" for="ws-delivery2-add">Add product to afternoon delivery</label>
              <select id="ws-delivery2-add" aria-label="Add product to afternoon delivery"></select>
              <button type="button" id="ws-delivery2-add-btn" aria-label="Add product row to afternoon delivery">Add</button>
            </div>
          </div>
          <div class="block" style="margin-top:10px">
            <label class="field-label" for="ws-paidAmount">Paid today (Kwacha)</label>
            <input id="ws-paidAmount" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 50000" />
            <p id="ws-sj-money-rec" class="note" role="status"></p>
          </div>
          <div id="ws-sj-balance" class="sj-balance" role="status" aria-live="polite"></div>
          <label class="sj-check"><input type="checkbox" id="ws-sj-replace-bal" /> <span>Replace balance (I disagree with the calculated balance)</span></label>
          <div id="ws-sj-replace-box" class="block" hidden>
            <label class="field-label" for="ws-balance">Correct current balance (Kwacha)</label>
            <input id="ws-balance" type="number" min="0" step="1" inputmode="numeric" />
          </div>
          <label class="sj-check" id="ws-sj-restore-wrap" hidden><input type="checkbox" id="ws-sj-restore" /> <span>Use the calculated balance again</span></label>
        </div>
      </section>

      <section class="card" aria-labelledby="ws-afternoon-h">
        <h2 id="ws-afternoon-h">Afternoon delivery</h2>
        <p id="ws-afternoon-already" class="already-line" role="status"></p>
        <p class="note">Same shop as morning. Enter 0 if none.</p>
        <div id="ws-afternoon-rows"></div>
        <div class="add-product" data-add="afternoon">
          <label class="sr-only" for="ws-afternoon-add">Add product to afternoon</label>
          <select id="ws-afternoon-add" aria-label="Add product to afternoon"></select>
          <button type="button" id="ws-afternoon-add-btn" aria-label="Add product row to afternoon">Add</button>
        </div>
      </section>

      <section class="card" aria-labelledby="ws-stock-h">
        <h2 id="ws-stock-h">Stock left</h2>
        <p class="note">Leave blank if not counted yet. Tick <strong>Out</strong> (or enter 0) if sold out.</p>
        <p id="ws-stock-avail-note" class="note" hidden>Available = opening + deliveries in sheet today (+ typed above).</p>
        <p id="ws-stock-already" class="already-line" role="status"></p>
        <div id="ws-stock-rows"></div>
        <div class="add-product" data-add="stock">
          <label class="sr-only" for="ws-stock-add">Add product to stock left</label>
          <select id="ws-stock-add" aria-label="Add product to stock"></select>
          <button type="button" id="ws-stock-add-btn" aria-label="Add product row to stock">Add</button>
        </div>
      </section>

      <section class="card cash-section" aria-labelledby="ws-cash-h">
        <h2 id="ws-cash-h">Cash</h2>
        <div class="block" style="margin-bottom:0">
          <label class="field-label" for="ws-cash">Amount (Kwacha)</label>
          <input id="ws-cash" name="cash" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 195000" />
        </div>
      </section>

      <section class="card" aria-labelledby="ws-ho-h">
        <h2 id="ws-ho-h">Handovers</h2>
        <div id="ws-ho-blocks"></div>
        <button type="button" id="ws-ho-add-btn" class="ho-add">+ Add handover</button>
        <p class="note" style="margin-bottom:0">Who handed bread or cash over to whom.</p>
      </section>

      <div id="ws-partial-warn" class="warn-banner" hidden></div>

      <label class="replace-day" for="ws-replace-day">
        <input type="checkbox" id="ws-replace-day" name="replaceDay" />
        <span><strong>Replace this day</strong>
          <small>Leave unticked to only fill empty cells. Tick to overwrite this day's numbers for this shop.</small>
        </span>
      </label>

      <button type="submit" class="save" id="ws-save-btn">Save</button>
      <p id="ws-form-err" class="form-hint" role="alert"></p>
      <p id="ws-saved" class="saved" role="status"></p>
      <p id="ws-wh-summary" class="wh-summary" role="status"></p>
    </form>
  `;

  const el = (id) => panel.querySelector('#ws-' + id);
  const SECTIONS = ['morning', 'afternoon', 'stock', 'delivery', 'delivery2'];
  let lastRecorded = null;
  let lastAvailable = null;
  let sjState = null;
  let recordedSeq = 0;
  let saving = false;

  setupDateControl(el('date'), el('date-chips'));

  const isSj = () => /st\.?\s*john/i.test(el('shop').value);
  const isTown = () => el('shop').value === 'Town';
  const isTownExtra = (name) => TOWN_EXTRAS.includes(name);
  const isSjKind = (kind) => kind === 'delivery' || kind === 'delivery2';

  function sectionProducts(kind) {
    const list = isSjKind(kind)
      ? ST_JOHN_PRODUCTS
      : (isTown() ? [...PRODUCTS, ...TOWN_EXTRAS] : PRODUCTS);
    return list.filter((n, i) => list.indexOf(n) === i);
  }

  function hasRow(kind, name) {
    return !!panel.querySelector(`.row[data-section="${kind}"][data-product="${CSS.escape(name)}"]`);
  }

  function rowHtml(name, kind) {
    if (kind === 'stock') {
      return `
        <div class="row stock" data-product="${esc(name)}" data-section="stock">
          <span class="pname">${esc(displayName(name))} <span class="already-tag"></span><small class="avail" data-avail="${esc(name)}"></small></span>
          <input type="number" min="0" step="1" inputmode="numeric" aria-label="${esc(name)} stock left" data-kind="stock" data-name="${esc(name)}" />
          <label class="sold"><input type="checkbox" data-soldout="${esc(name)}" /> Out</label>
        </div>`;
    }
    return `
      <div class="row" data-product="${esc(name)}" data-section="${kind}">
        <span class="pname">${esc(displayName(name))} <span class="already-tag"></span></span>
        <input type="number" min="0" step="1" inputmode="numeric" aria-label="${esc(name)} ${kind} qty" data-kind="${kind}" data-name="${esc(name)}" />
      </div>`;
  }

  function wireStockRow(row) {
    if (!row || row.getAttribute('data-section') !== 'stock') return;
    const numIn = row.querySelector('input[type="number"]');
    const outBox = row.querySelector('input[type="checkbox"]');
    const outLabel = row.querySelector('.sold');
    if (!numIn || !outBox || !outLabel) return;

    const syncLabel = () => outLabel.classList.toggle('is-out', outBox.checked);

    outBox.addEventListener('change', () => {
      if (outBox.checked) {
        if (numIn.value === '' || Number(numIn.value) > 0) numIn.value = '0';
      } else if (numIn.value === '0') {
        numIn.value = '';
      }
      syncLabel();
    });

    numIn.addEventListener('input', () => {
      if (numIn.value === '') {
        outBox.checked = false;
      } else if (Number(numIn.value) === 0) {
        outBox.checked = true;
      } else if (Number(numIn.value) > 0) {
        outBox.checked = false;
      }
      syncLabel();
    });
    syncLabel();
  }

  function refreshAddMenu(kind) {
    const sel = el(`${kind}-add`);
    const btn = el(`${kind}-add-btn`);
    if (!sel || !btn) return;
    const left = sectionProducts(kind).filter((n) => !hasRow(kind, n));
    sel.innerHTML = left.length
      ? `<option value="">Add product…</option>${left.map((n) => `<option value="${esc(n)}">${esc(displayName(n))}</option>`).join('')}`
      : '<option value="">All products shown</option>';
    sel.disabled = !left.length || !!sel.closest('[hidden]');
    btn.disabled = !left.length || !!btn.closest('[hidden]');
  }

  function addProductRow(kind, name, auto) {
    if (!sectionProducts(kind).includes(name) || hasRow(kind, name)) return null;
    const box = el(`${kind}-rows`);
    box.insertAdjacentHTML('beforeend', rowHtml(name, kind));
    const row = box.lastElementChild;
    row.setAttribute('data-extra', auto ? 'auto' : 'user');
    if (!isSjKind(kind) && isTownExtra(name)) row.setAttribute('data-town-extra', '');
    wireStockRow(row);
    refreshAddMenu(kind);
    return row;
  }

  function dropEmptyAutoRows() {
    panel.querySelectorAll('.row[data-extra="auto"]').forEach((row) => {
      const inp = row.querySelector('input[type="number"]');
      const so = row.querySelector('input[type="checkbox"]');
      if ((!inp || inp.value === '') && !(so && so.checked)) row.remove();
    });
    SECTIONS.forEach(refreshAddMenu);
  }

  function renderInitialRows() {
    SECTIONS.forEach((k) => {
      const defaults = isSjKind(k) ? ST_JOHN_DEFAULTS : DEFAULT_PRODUCTS;
      const box = el(`${k}-rows`);
      box.innerHTML = defaults.map((n) => rowHtml(n, k)).join('');
      if (k === 'stock') box.querySelectorAll('.row.stock').forEach(wireStockRow);
      refreshAddMenu(k);
      el(`${k}-add-btn`).addEventListener('click', () => {
        const sel = el(`${k}-add`);
        if (!sel.value) return;
        const row = addProductRow(k, sel.value, false);
        if (row) {
          applyCachedMark(k, row);
          renderAvailable();
          row.querySelector('input[type="number"]')?.focus();
        }
      });
    });
  }

  function qtyText(info) {
    if (!info) return '';
    if (info.qty === null || info.qty === undefined) return info.note || 'entered';
    return info.note ? `${info.qty} (${info.note})` : String(info.qty);
  }

  function applyCachedMark(kind, row) {
    const prod = row.getAttribute('data-product');
    const info = lastRecorded && lastRecorded[kind] && lastRecorded[kind][prod];
    if (!info) return;
    row.classList.add('recorded');
    const tag = row.querySelector('.already-tag');
    if (tag) tag.textContent = `already entered: ${qtyText(info)}`;
  }

  function clearRecordedMarks() {
    panel.querySelectorAll('.row.recorded').forEach((r) => r.classList.remove('recorded'));
    panel.querySelectorAll('.already-tag').forEach((t) => { t.textContent = ''; });
    ['morning-already', 'afternoon-already', 'stock-already', 'delivery-already', 'delivery2-already'].forEach((id) => {
      const line = el(id);
      if (line) { line.textContent = ''; line.classList.remove('show'); }
    });
    el('sj-money-rec').textContent = '';
    sjState = null;
    sjRender();
    el('date-recorded').classList.remove('show');
  }

  function markSection(kind, recordedMap, alreadyId, label) {
    const parts = [];
    (isSjKind(kind) ? ST_JOHN_PRODUCTS : sectionProducts(kind)).forEach((name) => {
      const info = recordedMap && recordedMap[name];
      if (!info) return;
      if (!hasRow(kind, name)) addProductRow(kind, name, true);
      const row = panel.querySelector(`.row[data-section="${kind}"][data-product="${CSS.escape(name)}"]`);
      if (row) {
        row.classList.add('recorded');
        const tag = row.querySelector('.already-tag');
        if (tag) tag.textContent = `already entered: ${qtyText(info)}`;
      }
      parts.push(`${name} ${qtyText(info)}`);
    });
    if (parts.length) {
      const line = el(alreadyId);
      if (line) {
        line.textContent = `${label}: ${parts.join(', ')}`;
        line.classList.add('show');
      }
    }
  }

  function typedDelivery(kind, name) {
    const inp = panel.querySelector(`input[data-kind="${kind}"][data-name="${CSS.escape(name)}"]`);
    if (!inp || inp.value === '' || !(Number(inp.value) > 0)) return 0;
    const rec = lastRecorded && lastRecorded[kind] && lastRecorded[kind][name];
    return rec ? 0 : Number(inp.value);
  }

  function availText(name) {
    if (!lastAvailable) return '';
    const a = lastAvailable[name];
    const typed = el('replace-day').checked ? 0 : typedDelivery('morning', name) + typedDelivery('afternoon', name);
    if (!a && !typed) return 'Available —';
    const base = a ? a.total : 0;
    return `Available ${base + typed}${typed ? ` (incl. ${typed} typed)` : ''}`;
  }

  function renderAvailable() {
    const on = !!lastAvailable && !isSj();
    el('stock-avail-note').hidden = !on;
    panel.querySelectorAll('[data-avail]').forEach((node) => {
      const t = on ? availText(node.getAttribute('data-avail')) : '';
      node.textContent = t;
      node.classList.toggle('avail-none', /—$/.test(t));
    });
  }

  function updateDayWarnings() {
    el('day-warnings').innerHTML = renderDayWarnings(el('date').value, el('shop').value);
    updatePartialHint();
  }

  function updatePartialHint() {
    const warn = el('partial-warn');
    if (isSj()) { warn.hidden = true; return; }
    const hasM = collect('morning', false).length > 0;
    const hasA = collect('afternoon', true).length > 0;
    const hasS = collectStock().length > 0;
    const hasC = Number(el('cash').value || 0) > 0;
    const partsCount = [hasM || hasA, hasS, hasC].filter(Boolean).length;
    if (partsCount > 0 && partsCount < 3) {
      warn.hidden = false;
      warn.textContent = 'Partial day: you can save just these sections now and enter the rest later.';
    } else {
      warn.hidden = true;
    }
  }

  // Handovers
  function hoRefreshAdd(block) {
    const sel = block.querySelector('.ho-add-sel');
    const have = Array.from(block.querySelectorAll('[data-ho-product]')).map((r) => r.getAttribute('data-ho-product'));
    const left = HANDOVER_PRODUCTS.filter((n) => !have.includes(n));
    sel.innerHTML = `<option value="">Add product…</option>${left.map((n) => `<option value="${esc(n)}">${esc(hoLabel(n))}</option>`).join('')}`;
    sel.disabled = !left.length;
  }

  function hoRenumber() {
    panel.querySelectorAll('#ws-ho-blocks .ho-block').forEach((b, i) => {
      b.querySelector('.ho-head strong').textContent = `Handover ${i + 1}`;
    });
  }

  function hoItemRow(name) {
    return `<div class="row" data-ho-product="${esc(name)}"><span class="pname">${esc(hoLabel(name))}</span><input type="number" min="0" step="1" inputmode="numeric" data-ho-qty="${esc(name)}" aria-label="${esc(name)} handed over" /></div>`;
  }

  function addHandoverBlock() {
    const box = el('ho-blocks');
    const id = hoId();
    const n = box.children.length + 1;
    box.insertAdjacentHTML('beforeend', `
      <div class="ho-block" data-ho-id="${id}">
        <div class="ho-head"><strong>Handover ${n}</strong><button type="button" class="ho-remove">✕ Remove</button></div>
        <label>Time <input type="time" class="ho-time" /></label>
        <div class="ho-pair">
          <label>Who gave <input type="text" maxlength="60" class="ho-giver" /></label>
          <label>Who received <input type="text" maxlength="60" class="ho-receiver" /></label>
        </div>
        <div class="ho-items">${HANDOVER_DEFAULTS.map(hoItemRow).join('')}</div>
        <select class="ho-add-sel" aria-label="Add product to handover"></select>
        <label>Cash handed over (Kwacha) <span class="ho-req">(required, 0 if none)</span> <input type="number" min="0" step="1" inputmode="numeric" class="ho-cash" placeholder="e.g. 45000 or 0" /></label>
        <label>Note (optional) <textarea maxlength="300" rows="2" class="ho-note"></textarea></label>
        <p class="ho-err" role="alert"></p>
      </div>`);
    const block = box.lastElementChild;
    hoRefreshAdd(block);
    block.querySelector('.ho-add-sel').addEventListener('change', function () {
      if (!this.value) return;
      block.querySelector('.ho-items').insertAdjacentHTML('beforeend', hoItemRow(this.value));
      hoRefreshAdd(block);
    });
    block.querySelector('.ho-remove').addEventListener('click', () => {
      block.remove();
      hoRenumber();
    });
    return block;
  }

  function hoBlank(h) {
    return !h.time && !h.giver && !h.receiver && !h.note && h.cash === '' && !h.items.length;
  }

  function collectHandovers() {
    return Array.from(panel.querySelectorAll('#ws-ho-blocks .ho-block')).map((b) => {
      const items = [];
      b.querySelectorAll('[data-ho-qty]').forEach((inp) => {
        if (inp.value !== '') items.push({ name: inp.getAttribute('data-ho-qty'), qty: inp.value });
      });
      return {
        id: b.getAttribute('data-ho-id'),
        time: (b.querySelector('.ho-time')?.value || '').trim(),
        giver: (b.querySelector('.ho-giver')?.value || '').trim(),
        receiver: (b.querySelector('.ho-receiver')?.value || '').trim(),
        cash: (b.querySelector('.ho-cash')?.value || '').trim(),
        note: (b.querySelector('.ho-note')?.value || '').trim(),
        items
      };
    });
  }

  function checkHandovers(list) {
    let bad = 0;
    panel.querySelectorAll('#ws-ho-blocks .ho-block').forEach((b, i) => {
      const h = list[i];
      const f = [];
      if (!hoBlank(h)) {
        if (!h.giver) f.push('who gave');
        if (!h.receiver) f.push('who received');
        if (h.cash === '') f.push('cash handed over (type 0 if no cash)');
        if (h.items.some((it) => !/^\d+$/.test(String(it.qty))) || (h.cash !== '' && !/^\d+$/.test(h.cash))) {
          f.push('whole numbers only');
        }
      }
      b.querySelector('.ho-err').textContent = f.length ? 'Needs: ' + f.join(', ') : '';
      if (f.length) bad++;
    });
    return bad;
  }

  // St. John's
  function sjShowPm() {
    el('sj-pm').hidden = false;
    el('sj-pm-btn').hidden = true;
    applyShopState();
  }

  function sjTyped(kind, name) {
    const i = panel.querySelector(`input[data-kind="${kind}"][data-name="${CSS.escape(name)}"]`);
    return i && i.value !== '' && Number(i.value) > 0 ? Number(i.value) : null;
  }

  function sjRender() {
    const box = el('sj-balance');
    if (!box) return;
    if (!isSj() || !sjState) {
      box.innerHTML = '';
      el('sj-restore-wrap').hidden = true;
      return;
    }
    const st = sjState;
    const prices = st.prices || {};
    const m = st.money || {};
    const replaceDay = el('replace-day').checked;
    const rec = { delivery: st.morning || st.delivery || {}, delivery2: st.afternoon || {} };
    let value = 0;
    const unpriced = [];
    ST_JOHN_PRODUCTS.forEach((name) => {
      ['delivery', 'delivery2'].forEach((k) => {
        const r = rec[k][name] && rec[k][name].qty;
        const t = sjTyped(k, name);
        const q = t != null && (replaceDay || r == null) ? t : (r || 0);
        if (!q) return;
        if (prices[name] == null) { if (!unpriced.includes(name)) unpriced.push(name); }
        else value += q * prices[name];
      });
    });
    const tp = el('paidAmount').value !== '' ? Number(el('paidAmount').value) : null;
    const paid = tp != null && (replaceDay || m.paidAmount == null) ? tp : (m.paidAmount || 0);
    const bf = m.broughtForward;
    const bal = bf == null ? null : bf + value - paid;
    let html = `
      <div><span>Brought forward</span><strong>${bf == null ? 'not set' : kw(bf)}</strong></div>
      <div><span>+ Today's deliveries</span><strong>${kw(value)}</strong></div>
      <div><span>− Paid today</span><strong>${kw(paid)}</strong></div>
      <div class="sj-total"><span>= Current balance</span><strong>${bal == null ? '—' : kw(bal)} <small>(calculated)</small></strong></div>`;
    if (unpriced.length) html += `<p class="hint show">No St. John's price yet for ${esc(unpriced.join(', '))}.</p>`;
    const overridden = m.balance != null && m.balanceCalculated === false;
    if (overridden) html += `<p class="note">Balance in sheet was replaced by hand: <strong>${kw(m.balance)}</strong></p>`;
    el('sj-restore-wrap').hidden = !overridden;
    box.innerHTML = html;
  }

  function applyShopState() {
    const sj = isSj();
    el('morning-h').textContent = sj ? "St. John's delivery" : 'Morning delivery';
    el('morning-rows').hidden = sj;
    el('legacy-note').hidden = sj;
    panel.querySelector('[data-add="morning"]').hidden = sj;
    ['afternoon-h', 'stock-h', 'cash-h', 'ho-h'].forEach((id) => {
      el(id).closest('section').hidden = sj;
    });
    el('stjohn-delivery').hidden = !sj;
    el('ho-add-btn').disabled = sj;

    panel.querySelectorAll('#ws-entry input, #ws-entry select, #ws-entry button').forEach((node) => {
      if (node.id !== 'ws-save-btn' && node.id !== 'ws-shop') {
        node.disabled = !!node.closest('[hidden]');
      }
    });
    if (!isTown()) {
      panel.querySelectorAll('.row[data-town-extra]').forEach((r) => r.remove());
    }
    SECTIONS.forEach(refreshAddMenu);
    updateDayWarnings();
    if (sj) sjRender();
  }

  function applyRecorded(res) {
    clearRecordedMarks();
    lastAvailable = res && !isSj() && res.available ? res.available : null;
    if (isSj() && res) {
      sjState = res;
      if (res.afternoon && Object.keys(res.afternoon).length) sjShowPm();
      sjRender();
    }
    lastRecorded = res && res.hasEntries ? res : null;
    if (lastAvailable) {
      sectionProducts('stock').forEach((name) => {
        if (lastAvailable[name] && lastAvailable[name].total > 0 && !hasRow('stock', name)) {
          addProductRow('stock', name, true);
        }
      });
    }
    renderAvailable();
    if (!res || !res.hasEntries) return;
    el('date-recorded').classList.add('show');
    if (isSj()) {
      markSection('delivery', res.morning || res.delivery, 'delivery-already', 'Already entered (morning)');
      markSection('delivery2', res.afternoon, 'delivery2-already', 'Already entered (afternoon)');
      const m = res.money || {};
      el('sj-money-rec').textContent = m.paidAmount != null ? `Paid today: ${kw(m.paidAmount)} already entered` : '';
      return;
    }
    markSection('morning', res.morning, 'morning-already', 'Already entered (morning)');
    markSection('afternoon', res.afternoon, 'afternoon-already', 'Already entered (afternoon)');
    markSection('stock', res.stock, 'stock-already', 'Already entered (stock)');
    renderAvailable();
  }

  async function checkDateRecorded() {
    const date = el('date').value;
    const shop = el('shop').value;
    const seq = ++recordedSeq;
    clearRecordedMarks();
    lastRecorded = null;
    lastAvailable = null;
    renderAvailable();
    dropEmptyAutoRows();
    updateDayWarnings();
    if (!date) return;
    try {
      const res = await callApi('dateHasEntries', { date, shop }, { isWrite: false });
      if (seq !== recordedSeq) return;
      if (res && (res.date !== date || res.shop !== shop)) return;
      applyRecorded(res);
    } catch (err) {
      if (seq === recordedSeq) clearRecordedMarks();
    }
  }

  function collect(kind, allowZero) {
    return Array.from(panel.querySelectorAll(`input[data-kind="${kind}"]`))
      .map((inp) => {
        const raw = inp.value;
        const qty = raw === '' ? NaN : Number(raw);
        return {
          name: inp.getAttribute('data-name'),
          qty: isFinite(qty) ? qty : 0,
          explicitZero: allowZero && raw !== '' && Number(raw) === 0
        };
      })
      .filter((r) => (allowZero ? r.qty > 0 || r.explicitZero : r.qty > 0));
  }

  function collectStock() {
    const out = [];
    sectionProducts('stock').forEach((name) => {
      const qtyEl = panel.querySelector(`input[data-kind="stock"][data-name="${CSS.escape(name)}"]`);
      const so = panel.querySelector(`input[data-soldout="${CSS.escape(name)}"]`);
      const raw = qtyEl ? qtyEl.value : '';
      const qty = raw === '' ? NaN : Number(raw);
      const sold_out = !!(so && so.checked) || (raw !== '' && qty === 0);
      if ((isFinite(qty) && qty > 0) || sold_out) {
        out.push({ name, qty: isFinite(qty) && qty > 0 ? qty : 0, sold_out });
      }
    });
    return out;
  }

  // Events
  el('refresh').addEventListener('click', checkDateRecorded);
  el('date').addEventListener('change', checkDateRecorded);
  el('shop').addEventListener('change', () => {
    applyShopState();
    checkDateRecorded();
  });
  el('replace-day').addEventListener('change', () => {
    renderAvailable();
    if (isSj()) sjRender();
  });
  el('entry').addEventListener('input', (e) => {
    const k = e.target?.getAttribute?.('data-kind');
    if (k === 'morning' || k === 'afternoon') renderAvailable();
    if (isSj()) sjRender();
    updatePartialHint();
  });
  el('ho-add-btn').addEventListener('click', () => {
    const b = addHandoverBlock();
    b.querySelector('.ho-time')?.focus();
  });
  el('sj-pm-btn').addEventListener('click', () => {
    sjShowPm();
    panel.querySelector('#ws-delivery2-rows input')?.focus();
  });
  el('sj-replace-bal').addEventListener('change', (e) => {
    el('sj-replace-box').hidden = !e.target.checked;
    if (e.target.checked) el('sj-restore').checked = false;
    applyShopState();
  });
  el('sj-restore').addEventListener('change', (e) => {
    if (e.target.checked) {
      el('sj-replace-bal').checked = false;
      el('sj-replace-box').hidden = true;
      applyShopState();
    }
  });

  el('entry').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;

    const formErr = el('form-err');
    const saved = el('saved');
    const summary = el('wh-summary');
    const btn = el('save-btn');
    saved.classList.remove('show');
    summary.classList.remove('show');
    formErr.classList.remove('show');

    const dateVal = el('date').value;
    if (!dateVal) {
      el('date-err').classList.add('show');
      el('date').focus();
      return;
    }
    el('date-err').classList.remove('show');

    const sj = isSj();
    const morning = collect('morning', false);
    const afternoon = collect('afternoon', true);
    const stock = collectStock();
    const cashVal = el('cash').value !== '' ? Number(el('cash').value) : 0;
    const hasCash = cashVal > 0;
    const sjRepl = sj && el('sj-replace-bal').checked;
    const sjRestore = sj && el('sj-restore').checked;

    if (sjRepl && el('balance').value === '') {
      formErr.textContent = 'Type the correct balance, or untick Replace balance.';
      formErr.classList.add('show');
      return;
    }

    const hasEntry = sj
      ? !!(collect('delivery', false).length || collect('delivery2', false).length || el('paidAmount').value !== '' || sjRepl || sjRestore)
      : !!(morning.length || afternoon.length || stock.length || hasCash);

    const allHo = sj ? [] : collectHandovers();
    const handovers = allHo.filter((h) => !hoBlank(h));
    const hoBad = sj ? 0 : checkHandovers(allHo);

    if (!hasEntry && !handovers.length) {
      formErr.textContent = sj ? 'Enter a delivery or Paid amount.' : 'Enter a delivery, stock left, Out, cash, or handover.';
      formErr.classList.add('show');
      return;
    }
    if (hoBad) {
      formErr.textContent = 'Fix the handover marked in red — nothing was saved.';
      formErr.classList.add('show');
      return;
    }

    const who = getWho() || 'entry-app';
    let body;
    if (sj) {
      body = {
        date: dateVal,
        who,
        shop: el('shop').value,
        morning: collect('delivery', false),
        afternoon: collect('delivery2', false),
        paidAmount: el('paidAmount').value,
        replaceDay: el('replace-day').checked,
        hasEntry,
        handovers: []
      };
      if (sjRepl) { body.replaceBalance = true; body.balance = el('balance').value; }
      if (sjRestore) body.restoreBalance = true;
    } else {
      body = {
        date: dateVal,
        who,
        shop: el('shop').value,
        morning,
        afternoon,
        stock,
        cash: hasCash ? cashVal : '',
        replaceDay: el('replace-day').checked,
        hasEntry,
        handovers
      };
    }

    saving = true;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const action = sj ? 'saveStJohnEntry' : 'saveEntryWithHandovers';
      const data = await callApi(action, body, { isWrite: true });

      const hoRes = (data && data.handovers) || { saved: [], alreadySaved: [] };
      const entrySaved = !!(data && (data.entry ? data.entry.ok : (data.ok && body.hasEntry)));

      (hoRes.saved || []).concat(hoRes.alreadySaved || []).forEach((id) => {
        panel.querySelector(`.ho-block[data-ho-id="${id}"]`)?.remove();
      });
      hoRenumber();

      if (!data || !data.ok) {
        formErr.classList.add('show');
        if (data?.error === 'handover_invalid') {
          (data.errors || []).forEach((er) => {
            const b = panel.querySelectorAll('#ws-ho-blocks .ho-block')[er.block - 1];
            if (b) b.querySelector('.ho-err').textContent = 'Needs: ' + er.fields.join(', ');
          });
          formErr.textContent = 'Fix the handover marked in red — nothing was saved.';
        } else if (entrySaved) {
          formErr.textContent = `Entry saved, but handovers were NOT saved (${dmyText(hoRes.error || 'error')}). Press Save again to retry handovers only.`;
        } else {
          formErr.textContent = dmyText(data?.error || 'Could not save — try again.');
        }
        if (!entrySaved) return;
      }

      const nHo = (hoRes.saved || []).length;
      const nDup = (hoRes.alreadySaved || []).length;
      saved.textContent = (entrySaved ? `Saved ${dmy(dateVal)} (${el('shop').selectedOptions[0].textContent})` : 'Saved')
        + (nHo ? ` · ${nHo} handover(s) logged` : '')
        + (nDup ? ` · ${nDup} handover(s) already logged` : '');
      saved.classList.add('show');

      if (entrySaved && data.wholesale) {
        const wh = data.wholesale;
        const w = (wh.written || []).length;
        const k = (wh.skipped || []).length;
        const parts = [`${w} item(s) saved${wh.mode === 'replace' ? ' (replaced)' : ''}`];
        if (k) {
          const names = wh.skipped.map((s) => s.product || s.field);
          parts.push(`${k} kept — already had a number (${names.slice(0, 5).join(', ')}). Tick Replace this day to overwrite.`);
        }
        (wh.notes || []).forEach((n) => parts.push(dmyText(n)));
        summary.textContent = parts.join(' · ');
        summary.classList.add('show');
      }

      // Clear typed values after successful save
      panel.querySelectorAll('#ws-entry input[type="number"]').forEach((inp) => { inp.value = ''; });
      panel.querySelectorAll('#ws-entry input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
        cb.closest('.sold')?.classList.remove('is-out');
      });
      if (sj && data.wholesale?.after && sjState) {
        sjState.money = data.wholesale.after;
        el('sj-replace-box').hidden = true;
        applyShopState();
      }
      updatePartialHint();
      await checkDateRecorded();
    } catch (err) {
      formErr.textContent = err?.message || 'Could not save — check internet and try again.';
      formErr.classList.add('show');
    } finally {
      saving = false;
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  renderInitialRows();
  applyShopState();
  await checkDateRecorded();
}
