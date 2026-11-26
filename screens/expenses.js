import {
  EXPENSE_CATEGORIES,
  EXPENSE_USES,
  EXPENSE_USE_LABELS,
  EXPENSE_SHOPS,
  EXPENSE_EDIT_DAYS_BACK
} from '../config.js';
import { callApi, malawiToday, dmy, dmyText, daySerial } from '../api.js';
import { esc, kw, setupDateControl, renderDayWarnings, getWho, onWhoChange, notifySaved } from '../app.js';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&()\/-]*$/;

export async function mount(panel) {
  const today = malawiToday();

  panel.innerHTML = `
    <form id="exp-entry">
      <h2>Expenses</h2>
      <div class="block">
        <label class="field-label" for="exp-date">Date (Malawi)</label>
        <div class="date-ctrl">
          <div class="date-top">
            <input id="exp-date" type="date" required value="${today}" />
          </div>
          <div id="exp-date-chips" class="date-chips"></div>
        </div>
        <div id="exp-day-warnings"></div>
      </div>

      <div id="exp-rows"></div>
      <button id="exp-add-btn" type="button" class="btn-add-row" aria-label="Add expense row">+ Add another expense</button>

      <p class="note">Fill category, amount, which shop's cash paid it (<strong>Paid from</strong>), and who it was for (<strong>Bakery operations</strong>, <strong>Family</strong>, or <strong>Farm</strong>). Leave unused rows blank — existing entries are never replaced.</p>

      <button class="save" id="exp-save-btn" type="submit">Save all expenses</button>
      <p id="exp-status" class="saved" role="status" aria-live="polite" style="display:none"></p>
      <p id="exp-err" class="form-hint" role="alert"></p>

      <div class="exp-edit-entry" id="exp-edit-entry">
        <button type="button" class="link-btn" id="exp-edit-btn">Edit this day's expenses</button>
        <p class="exp-edit-lock" id="exp-edit-lock" hidden></p>
      </div>
    </form>

    <section id="exp-edit-panel" class="card" aria-labelledby="exp-edit-h" hidden>
      <h3 id="exp-edit-h">Editing expenses</h3>
      <p class="note" id="exp-edit-summary"></p>
      <div class="block">
        <label class="field-label" for="exp-edit-who">Your name <span style="font-weight:400;opacity:.75">(for the change log)</span></label>
        <input id="exp-edit-who" type="text" maxlength="40" autocomplete="name" placeholder="Pascal, Papa, Mummy…" />
      </div>
      <div id="exp-edit-rows"></div>
      <button type="button" class="link-btn" id="exp-edit-add">+ Add a line</button>
      <div class="edit-review" id="exp-edit-review" hidden></div>
      <div class="edit-actions">
        <button type="button" class="link-btn" id="exp-edit-cancel">Cancel</button>
        <button type="button" class="save" id="exp-edit-next">Review changes</button>
      </div>
      <p id="exp-edit-status" class="form-hint" role="alert"></p>
    </section>
  `;

  const el = (id) => panel.querySelector('#exp-' + id);
  let editState = { data: null, reviewing: false, busy: false };
  let saving = false;

  setupDateControl(el('date'), el('date-chips'));

  function updateWarnings() {
    el('day-warnings').innerHTML = renderDayWarnings(el('date').value, '');
  }

  function addExpenseRow() {
    const box = el('rows');
    const n = box.children.length + 1;
    const fs = document.createElement('fieldset');
    fs.className = 'expense-row';
    fs.innerHTML = `
      <legend>Expense ${n}</legend>
      <div class="expense-fields">
        <label class="expense-category-field">Category
          <select data-expense="category">
            <option value="">Choose category</option>
            ${EXPENSE_CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
        </label>
        <label>Amount (K)
          <input data-expense="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="e.g. 25000" />
        </label>
        <label>Paid from
          <select data-expense="shop">
            <option value="">Which shop?</option>
            ${EXPENSE_SHOPS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </label>
        <label class="expense-use-field">For
          <select data-expense="use">
            <option value="">Bakery, Family or Farm?</option>
            ${EXPENSE_USES.map((u) => `<option value="${esc(u)}">${esc(EXPENSE_USE_LABELS[u] || u)}</option>`).join('')}
          </select>
        </label>
        <label class="expense-name-field" hidden>Expense name
          <input data-expense="name" type="text" maxlength="40" autocomplete="off" placeholder="e.g. Mama, Lunch, Water" />
        </label>
      </div>`;

    const sel = fs.querySelector('[data-expense="category"]');
    const nameField = fs.querySelector('.expense-name-field');
    const nameInput = fs.querySelector('[data-expense="name"]');
    sel.addEventListener('change', () => {
      const other = sel.value === 'Other';
      nameField.hidden = !other;
      nameInput.required = other;
      if (!other) nameInput.value = '';
    });
    box.appendChild(fs);
  }

  function resetRows() {
    el('rows').innerHTML = '';
    for (let i = 0; i < 4; i++) addExpenseRow();
  }

  function editLockReason(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Pick a date first.';
    const d = daySerial(date);
    const t = daySerial(malawiToday());
    if (d > t) return 'Future dates cannot be edited.';
    if (t - d > EXPENSE_EDIT_DAYS_BACK) {
      return `Locked: only today and the ${EXPENSE_EDIT_DAYS_BACK} days before can be edited.`;
    }
    return '';
  }

  function refreshEditEntry() {
    const lock = editLockReason(el('date').value);
    el('edit-btn').disabled = !!lock || editState.busy;
    el('edit-lock').hidden = !lock;
    el('edit-lock').textContent = lock;
  }

  function expOptions(list, val, blank, labels) {
    return `<option value="">${esc(blank)}</option>` + list.map((v) =>
      `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc((labels && labels[v]) || v)}</option>`
    ).join('');
  }

  function setEditMode(on) {
    ['rows', 'add-btn', 'save-btn', 'edit-entry'].forEach((id) => { el(id).hidden = on; });
    const note = panel.querySelector('#exp-entry > p.note');
    if (note) note.hidden = on;
    el('edit-panel').hidden = !on;
    if (!on) {
      editState = { data: null, reviewing: false, busy: false };
      el('edit-rows').innerHTML = '';
      el('edit-review').hidden = true;
      el('edit-next').textContent = 'Review changes';
      refreshEditEntry();
    }
  }

  function backToRows() {
    editState.reviewing = false;
    el('edit-review').hidden = true;
    el('edit-next').textContent = 'Review changes';
  }

  function editFields(fs) {
    const q = (k) => fs.querySelector(`[data-edit="${k}"]`)?.value || '';
    const cat = q('category');
    return { category: cat, amount: q('amount'), shop: q('shop'), use: q('use'), name: cat === 'Other' ? q('name').trim() : '' };
  }

  function editOp(fs) {
    const r = fs._row;
    if (r.loaded && !r.editable) return 'keep';
    if (fs._removed) return r.loaded ? 'remove' : 'blank';
    const f = editFields(fs);
    if (!r.loaded) return (f.category || f.amount || f.use || f.shop || f.name) ? 'add' : 'blank';
    const same = f.category === r.category &&
      Number(f.amount) === r.amount &&
      String(f.amount).trim() !== '' &&
      f.shop === r.shop &&
      f.use === (r.use || '') &&
      (f.category !== 'Other' || f.name.replace(/\s+/g, ' ') === String(r.name || '').replace(/\s+/g, ' ').trim());
    return same ? 'keep' : 'update';
  }

  function markEditRow(fs) {
    const op = editOp(fs);
    const badge = fs.querySelector('[data-edit="badge"]');
    fs.classList.toggle('changed', op === 'update' || op === 'add');
    fs.classList.toggle('removed', op === 'remove');
    if (badge) {
      badge.textContent = op === 'update' ? '· changed' : op === 'remove' ? '· will be removed' : op === 'add' ? '· new' : '';
    }
    const rm = fs.querySelector('[data-edit="remove"]');
    if (rm && fs._row.loaded) rm.textContent = fs._removed ? 'Undo remove' : 'Remove this line';
    if (editState.reviewing) backToRows();
  }

  function addEditRow(r) {
    const box = el('edit-rows');
    const fs = document.createElement('fieldset');
    fs.className = 'expense-row edit-row';
    fs._row = r;
    fs._removed = false;
    const cats = EXPENSE_CATEGORIES.slice();
    if (r.category && !cats.includes(r.category)) cats.push(r.category);
    const n = box.querySelectorAll('.edit-row:not([data-loaded])').length + 1;
    fs.innerHTML = `
      <legend>${r.loaded ? `${esc(r.shop)} ${esc(r.labelCell)}` : `New line ${n}`}<span class="edit-badge" data-edit="badge"></span></legend>
      ${r.loaded ? `<p class="edit-was">Now in sheet: ${esc(r.label || '(no label)')} · ${r.amount == null ? 'no amount' : kw(r.amount)}${r.tagged ? '' : ' · Not split'}</p>` : ''}
      <div class="expense-fields">
        <label class="expense-category-field">Category
          <select data-edit="category">${expOptions(cats, r.category || '', 'Choose category')}</select>
        </label>
        <label>Amount (K)
          <input data-edit="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${r.amount == null ? '' : esc(r.amount)}" />
        </label>
        <label>Paid from
          <select data-edit="shop">${expOptions(EXPENSE_SHOPS, r.shop || '', 'Which shop?')}</select>
        </label>
        <label class="expense-use-field">For
          <select data-edit="use">${expOptions(EXPENSE_USES, r.use || '', r.loaded && !r.tagged ? 'Not split (pick if changing)' : 'Bakery, Family or Farm?', EXPENSE_USE_LABELS)}</select>
        </label>
        <label class="expense-name-field"${r.category === 'Other' ? '' : ' hidden'}>Expense name
          <input data-edit="name" type="text" maxlength="40" autocomplete="off" value="${esc(r.name || '')}" />
        </label>
      </div>
      <div class="edit-tools"><button type="button" class="link-btn" data-edit="remove">${r.loaded ? 'Remove this line' : 'Clear'}</button></div>`;
    if (r.loaded) fs.setAttribute('data-loaded', `${r.shop}|${r.row}`);
    const cat = fs.querySelector('[data-edit="category"]');
    cat.addEventListener('change', () => {
      fs.querySelector('.expense-name-field').hidden = cat.value !== 'Other';
    });
    fs.addEventListener('input', () => markEditRow(fs));
    fs.addEventListener('change', () => markEditRow(fs));
    fs.querySelector('[data-edit="remove"]').addEventListener('click', () => {
      if (r.loaded) fs._removed = !fs._removed;
      else fs.querySelectorAll('input,select').forEach((x) => { x.value = ''; });
      markEditRow(fs);
    });
    box.appendChild(fs);
  }

  function collectEditChanges() {
    const rows = [];
    const problems = [];
    panel.querySelectorAll('#exp-edit-rows .edit-row').forEach((fs) => {
      const op = editOp(fs);
      const r = fs._row;
      if (op === 'keep' || op === 'blank') return;
      const where = r.loaded ? `${r.shop} ${r.labelCell}` : 'New line';
      if (op === 'remove') {
        rows.push({ op: 'remove', origShop: r.shop, origRow: r.row, sig: r.sig, _el: fs });
        return;
      }
      const f = editFields(fs);
      const miss = [];
      if (!f.category) miss.push('category');
      if (!(Number(f.amount) > 0)) miss.push('amount');
      if (!f.shop) miss.push('Paid from');
      if (!f.use) miss.push('For (Bakery, Family or Farm)');
      if (f.category === 'Other' && !(f.name.length >= 2 && f.name.length <= 40 && NAME_RE.test(f.name))) {
        miss.push('expense name (2–40 chars)');
      }
      if (miss.length) problems.push(`${where}: ${miss.join(', ')}`);
      const row = { op, category: f.category, amount: f.amount, shop: f.shop, use: f.use, name: f.name, _el: fs };
      if (r.loaded) { row.origShop = r.shop; row.origRow = r.row; row.sig = r.sig; }
      rows.push(row);
    });
    return { rows, problems };
  }

  // Events
  el('add-btn').addEventListener('click', addExpenseRow);
  el('date').addEventListener('change', () => {
    updateWarnings();
    if (editState.data && !editState.busy) setEditMode(false);
    refreshEditEntry();
  });

  el('entry').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const form = el('entry');
    if (!form.reportValidity()) return;

    const status = el('status');
    const errEl = el('err');
    const btn = el('save-btn');
    status.style.display = 'none';
    errEl.classList.remove('show');

    const expenses = Array.from(el('rows').children).map((row) => ({
      category: row.querySelector('[data-expense="category"]').value,
      amount: row.querySelector('[data-expense="amount"]').value,
      use: row.querySelector('[data-expense="use"]').value,
      shop: row.querySelector('[data-expense="shop"]').value,
      name: row.querySelector('[data-expense="category"]').value === 'Other'
        ? row.querySelector('[data-expense="name"]').value.trim()
        : ''
    }));

    const hasAny = expenses.some((x) => x.category || x.amount || x.use || x.shop || x.name);
    if (!hasAny) {
      errEl.textContent = 'Enter at least one expense row.';
      errEl.classList.add('show');
      return;
    }

    saving = true;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const data = await callApi('saveExpense', {
        action: 'expense',
        date: el('date').value,
        who: getWho() || 'entry-app',
        expenses
      }, { isWrite: true });

      if (!data || !data.ok) {
        errEl.textContent = dmyText(data?.error || 'Could not save expenses.');
        errEl.classList.add('show');
        return;
      }

      const written = data.wholesale?.written || [];
      const byShop = {};
      written.forEach((x) => { if (x?.shop) byShop[x.shop] = (byShop[x.shop] || 0) + 1; });
      const shopTxt = Object.keys(byShop).map((k) => `${k} ${byShop[k]}`).join(', ');
      status.textContent = `Saved ${data.rows} expense row(s) for ${dmy(el('date').value)}${shopTxt ? ` (${shopTxt})` : ''}.`;
      status.style.display = 'block';
      notifySaved(status.textContent);
      resetRows();
    } catch (err) {
      errEl.textContent = err?.message || 'Could not save expenses — try again.';
      errEl.classList.add('show');
    } finally {
      saving = false;
      btn.disabled = false;
      btn.textContent = 'Save all expenses';
    }
  });

  el('edit-btn').addEventListener('click', async () => {
    const date = el('date').value;
    if (editLockReason(date)) { refreshEditEntry(); return; }
    const errEl = el('err');
    errEl.classList.remove('show');
    el('edit-btn').disabled = true;
    el('edit-btn').textContent = 'Loading…';

    try {
      const data = await callApi('loadExpensesForEdit', { date }, { isWrite: false });
      if (!data || !data.ok || !data.editable) {
        errEl.textContent = dmyText(data?.note || data?.error || 'Could not load expenses.');
        errEl.classList.add('show');
        return;
      }
      editState = { data, reviewing: false, busy: false };
      el('edit-rows').innerHTML = '';
      let total = 0;
      data.rows.forEach((r) => { r.loaded = true; if (r.amount != null) total += r.amount; addEditRow(r); });
      if (!data.rows.length) addEditRow({ loaded: false });
      el('edit-summary').textContent = `Editing ${dmy(data.date)}: ${data.rows.length} line(s), total ${kw(total)}.`;
      if (!el('edit-who').value) el('edit-who').value = getWho();
      el('edit-status').classList.remove('show');
      setEditMode(true);
    } catch (err) {
      errEl.textContent = err?.message || 'Could not load expenses — try again.';
      errEl.classList.add('show');
    } finally {
      el('edit-btn').textContent = "Edit this day's expenses";
      refreshEditEntry();
    }
  });

  el('edit-add').addEventListener('click', () => {
    addEditRow({ loaded: false });
    if (editState.reviewing) backToRows();
  });

  el('edit-cancel').addEventListener('click', () => {
    if (!editState.busy) setEditMode(false);
  });

  el('edit-next').addEventListener('click', async () => {
    if (editState.busy) return;
    const st = el('edit-status');
    st.classList.remove('show');
    const who = el('edit-who').value.trim();
    const c = collectEditChanges();
    if (!c.rows.length) { st.textContent = 'Nothing changed yet.'; st.classList.add('show'); backToRows(); return; }
    if (c.problems.length) { st.textContent = 'Fill in: ' + c.problems.join('; '); st.classList.add('show'); backToRows(); return; }
    if (who.length < 2) { st.textContent = 'Type your name for the change log.'; st.classList.add('show'); el('edit-who').focus(); return; }

    if (!editState.reviewing) {
      const items = c.rows.map((x) => {
        if (x.op === 'remove') return `<li>Remove ${esc(x._el._row.label)} · ${kw(x._el._row.amount)}</li>`;
        const lbl = `${x.use}: ${x.category === 'Other' ? x.name : x.category}`;
        if (x.op === 'add') return `<li>Add to ${esc(x.shop)}: ${esc(lbl)} · ${kw(x.amount)}</li>`;
        return `<li>${esc(x._el._row.shop)}: ${esc(x._el._row.label)} → ${esc(lbl)} · ${kw(x.amount)}</li>`;
      }).join('');
      el('edit-review').innerHTML = `<strong>Check before saving</strong><ul>${items}</ul>`;
      el('edit-review').hidden = false;
      editState.reviewing = true;
      el('edit-next').textContent = 'Confirm & overwrite';
      return;
    }

    editState.busy = true;
    el('edit-next').disabled = true;
    el('edit-next').textContent = 'Saving…';

    try {
      const payload = {
        date: editState.data.date,
        who,
        rows: c.rows.map(({ _el, ...rest }) => rest)
      };
      const res = await callApi('saveExpenseEdit', payload, { isWrite: true });
      if (!res || !res.ok) {
        st.textContent = dmyText(res?.note || res?.error || 'Could not save changes.');
        st.classList.add('show');
        backToRows();
        return;
      }
      setEditMode(false);
      el('status').textContent = `Saved ${res.changes} change(s) for ${dmy(payload.date)}.`;
      el('status').style.display = 'block';
      notifySaved(el('status').textContent);
    } catch (err) {
      st.textContent = err?.message || 'Could not save changes — try again.';
      st.classList.add('show');
    } finally {
      editState.busy = false;
      el('edit-next').disabled = false;
      if (editState.reviewing) el('edit-next').textContent = 'Confirm & overwrite';
    }
  });

  onWhoChange((name) => {
    const whoIn = el('edit-who');
    if (whoIn && !whoIn.value) whoIn.value = name;
  });

  resetRows();
  updateWarnings();
  refreshEditEntry();
}
