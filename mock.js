import {
  PRODUCTS,
  TOWN_EXTRAS,
  ST_JOHN_PRODUCTS,
  EXPENSE_CATEGORIES,
  EXPENSE_USES,
  EXPENSE_SHOPS,
  EXPENSE_EDIT_DAYS_BACK,
  PRODUCTION_NAMES,
  PRODUCTION_MIN_DATE,
  PRODUCTION_MAX_DATE,
  DISPATCH_PRODUCTS,
  DISPATCH_BANANAS,
  DISPATCH_COIL,
  DISPATCH_COIL_FROM,
  DISPATCH_MIN_DATE,
  DISPATCH_MAX_DATE,
  DISPATCH_BACK_DAYS,
  DISPATCH_ADMINS
} from './config.js';
import { malawiToday, malawiNowLabel, dmy, addDays, daySerial, dowOf } from './api.js';

function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockDb = (() => {
  const today = malawiToday();
  const yesterday = addDays(today, -1);

  const wholesale = {};
  wholesale[`${today}|Town`] = {
    open: { Baguma: 15, Triangle: 10 },
    morning: { Baguma: { qty: 200, src: 'forum' }, Triangle: { qty: 120, src: 'forum' } },
    afternoon: {},
    stock: {},
    cash: null
  };
  wholesale[`${yesterday}|Town`] = {
    open: { Baguma: 20, Obama: 10 },
    morning: { Baguma: { qty: 250, src: 'forum' }, Obama: { qty: 100, src: 'forum' }, 'Bin Laden': { qty: 80, src: 'forum' } },
    afternoon: { Baguma: { qty: 50, src: 'forum' } },
    stock: { Baguma: { qty: 15, src: 'wholesale' }, Obama: { qty: 0, src: 'wholesale' } },
    cash: 195000
  };
  wholesale[`${today}|St John's`] = {
    morning: { Baguma: { qty: 60, src: 'wholesale' } },
    afternoon: {},
    prices: {
      Baguma: 500, Triangle: 500, Sultan: 500, Mandazi: 300,
      Obama: 500, Ntuwisa: 500, Pop: 300, 'Bin Laden': 500,
      Puff: 300, 'banana cup/swiss': 1000, 'small cake': 1500, Coil: 550
    },
    money: { broughtForward: 228000, paidAmount: null, balanceCalculated: true, manualBalance: null }
  };

  const expenses = {};
  expenses[today] = [
    { shop: 'Town', row: 18, labelCell: 'F18', amountCell: 'G18', label: 'Bakery: Fuel', amount: 25000, category: 'Fuel', name: '', use: 'Bakery', tagged: true, editable: true, sig: JSON.stringify(['Bakery: Fuel', 25000, '', '']) },
    { shop: 'Home', row: 18, labelCell: 'N18', amountCell: 'O18', label: 'Family: Lovemore', amount: 2000, category: 'Other', name: 'Lovemore', use: 'Family', tagged: true, editable: true, sig: JSON.stringify(['Family: Lovemore', 2000, '', '']) }
  ];

  const production = {};
  production[today] = {
    rows: PRODUCTION_NAMES.map((n) => ({
      name: n,
      day: n === 'Baguma' ? 300 : n === 'Obama' ? 180 : null,
      night: null
    })),
    inputs: {
      ok: true,
      locked: false,
      combined: false,
      total: 120500,
      rows: [
        { name: 'Flour (50kg bag)', day: 2, night: null, price: 52000, fixed: false, writable: true },
        { name: 'Cooking oil (L)', day: 5, night: null, price: 3300, fixed: false, writable: true },
        { name: 'Sugar (kg)', day: null, night: null, price: 2800, fixed: false, writable: true },
        { name: 'Yeast (pkt)', day: null, night: null, price: 4500, fixed: false, writable: true },
        { name: 'Electricity', day: 1, night: null, price: null, fixed: true, writable: true },
        { name: 'Breadbags', day: 1, night: null, price: null, fixed: true, writable: true }
      ]
    }
  };

  const dispatch = {};
  dispatch[yesterday] = {
    counted: true,
    name: 'Godfrey',
    counts: { Puff: 12, Mandazi: 0, Obama: 18, Triangle: 24, Sultan: 10, Pop: 30, Chintuwisa: 8, Baguma: 22, 'Bin Laden': 15, Coil: 6 },
    expected: { Puff: 12, Mandazi: 0, Obama: 20, Triangle: 24, Sultan: 10, Pop: 30, Chintuwisa: 8, Baguma: 22, 'Bin Laden': 15, Coil: 6 },
    bananas: { 'Banana cake': 4, 'Banana slice': 2 }
  };

  return { wholesale, expenses, production, dispatch, handoverIds: new Set() };
})();

function mockDateHasEntries(date, shop) {
  if (!date) return { hasEntries: false, date: '', shop: shop || 'Town', morning: {}, afternoon: {}, stock: {} };
  const key = `${date}|${shop}`;
  if (/st\.?\s*john/i.test(shop)) {
    const rec = mockDb.wholesale[key] || {
      morning: {}, afternoon: {},
      prices: { Baguma: 500, Triangle: 500, Sultan: 500, Mandazi: 300, Obama: 500, Ntuwisa: 500, Pop: 300, 'Bin Laden': 500, Puff: 300, 'banana cup/swiss': 1000, 'small cake': 1500, Coil: 550 },
      money: { broughtForward: 228000, paidAmount: null, balanceCalculated: true, manualBalance: null }
    };
    let dv = 0;
    ST_JOHN_PRODUCTS.forEach((n) => {
      const m = rec.morning[n]?.qty || 0;
      const a = rec.afternoon[n]?.qty || 0;
      if (rec.prices[n] != null) dv += (m + a) * rec.prices[n];
    });
    const paid = rec.money.paidAmount || 0;
    const calcBal = rec.money.broughtForward != null ? rec.money.broughtForward + dv - paid : null;
    const hasEntries = Object.keys(rec.morning).length > 0 || Object.keys(rec.afternoon).length > 0 || rec.money.paidAmount != null || !rec.money.balanceCalculated;
    return {
      hasEntries, date, shop,
      morning: { ...rec.morning }, afternoon: { ...rec.afternoon }, delivery: { ...rec.morning },
      prices: { ...rec.prices },
      money: {
        broughtForward: rec.money.broughtForward, deliveryValue: dv, paidAmount: rec.money.paidAmount,
        balance: rec.money.balanceCalculated ? calcBal : rec.money.manualBalance, balanceCalculated: rec.money.balanceCalculated
      }
    };
  }

  const rec = mockDb.wholesale[key] || { open: {}, morning: {}, afternoon: {}, stock: {}, cash: null };
  const catalog = shop === 'Town' ? [...PRODUCTS, ...TOWN_EXTRAS.filter((x) => !PRODUCTS.includes(x))] : PRODUCTS;
  const available = {};
  catalog.forEach((name) => {
    const o = rec.open?.[name] ?? null;
    const m = rec.morning?.[name]?.qty ?? null;
    const a = rec.afternoon?.[name]?.qty ?? null;
    const add = m != null || a != null ? (m || 0) + (a || 0) : null;
    if (o != null || add != null) available[name] = { open: o, add, total: (o || 0) + (add || 0) };
  });
  const hasEntries = Object.keys(rec.morning).length > 0 || Object.keys(rec.afternoon).length > 0 || Object.keys(rec.stock).length > 0 || rec.cash != null;
  return { hasEntries, date, shop, morning: { ...rec.morning }, afternoon: { ...rec.afternoon }, stock: { ...rec.stock }, available };
}

function mockSaveEntryWithHandovers(data) {
  if (!data?.date) return { ok: false, error: 'date_required' };
  const shop = data.shop || 'Town';
  if (/st\.?\s*john/i.test(shop)) return { ok: false, error: 'shop_not_configured' };

  const hoList = Array.isArray(data.handovers) ? data.handovers : [];
  const hoErrors = [];
  hoList.forEach((h, i) => {
    const f = [];
    if (!h.giver) f.push('who gave');
    if (!h.receiver) f.push('who received');
    if (h.cash === '' || h.cash == null) f.push('cash handed over (type 0 if no cash)');
    if (f.length) hoErrors.push({ block: i + 1, fields: f });
  });
  if (hoErrors.length) return { ok: false, error: 'handover_invalid', errors: hoErrors };

  const hasEntry = !!data.hasEntry;
  if (!hasEntry && !hoList.length) return { ok: false, error: 'qty_required' };

  let wholesale = null;
  let rows = 0;
  if (hasEntry) {
    const key = `${data.date}|${shop}`;
    const rec = mockDb.wholesale[key] || (mockDb.wholesale[key] = { open: {}, morning: {}, afternoon: {}, stock: {}, cash: null });
    const written = [], skipped = [];
    const replace = !!data.replaceDay;
    const dow = dowOf(data.date);

    (data.morning || []).forEach((it) => {
      if (!(Number(it.qty) > 0)) return;
      if (rec.morning[it.name] && !replace && shop === 'Home') skipped.push({ product: it.name, field: 'morning' });
      else if (rec.morning[it.name] && !replace) {
        rec.morning[it.name] = { qty: rec.morning[it.name].qty + Number(it.qty), src: 'forum' };
        written.push({ product: it.name, field: 'morning' });
      } else {
        rec.morning[it.name] = { qty: Number(it.qty), src: 'forum' };
        written.push({ product: it.name, field: 'morning' });
      }
      rows++;
    });

    (data.afternoon || []).forEach((it) => {
      const q = Number(it.qty);
      if (!(q > 0) && !it.explicitZero) return;
      if (rec.afternoon[it.name] && !replace && shop === 'Home') skipped.push({ product: it.name, field: 'afternoon' });
      else { rec.afternoon[it.name] = { qty: q, src: 'forum' }; written.push({ product: it.name, field: 'afternoon' }); }
      rows++;
    });

    (data.stock || []).forEach((it) => {
      const q = it.sold_out && !(Number(it.qty) > 0) ? 0 : Number(it.qty);
      if (rec.stock[it.name] && !replace) skipped.push({ product: it.name, field: 'close' });
      else { rec.stock[it.name] = { qty: q, src: 'wholesale' }; written.push({ product: it.name, field: 'close' }); }
      rows++;
    });

    if (data.cash !== '' && Number(data.cash) > 0) {
      if (rec.cash != null && !replace) skipped.push({ field: 'cash' });
      else { rec.cash = Number(data.cash); written.push({ field: 'cash' }); }
      rows++;
    }

    const notes = [];
    if (dow === 1 && shop === 'Town') notes.push('Monday — no Town opening stock');
    if (shop === 'Town' && (data.stock || []).length) {
      const nextDow = dowOf(addDays(data.date, 1));
      if (nextDow === 0 || nextDow === 1) notes.push(`Closing not carried to ${addDays(data.date, 1)} (no Town opening on Sunday/Monday)`);
    }
    wholesale = { ok: true, mode: replace ? 'replace' : 'blanks-only', date: data.date, shop, written, skipped, notes };
  }

  const savedHo = [], alreadySavedHo = [];
  hoList.forEach((h) => {
    if (mockDb.handoverIds.has(h.id)) alreadySavedHo.push(h.id);
    else { mockDb.handoverIds.add(h.id); savedHo.push(h.id); }
  });

  return {
    ok: true, entry: hasEntry ? { ok: true, rows, wholesale } : null, wholesale, rows,
    handovers: { ok: true, saved: savedHo, alreadySaved: alreadySavedHo, savedAt: malawiNowLabel().replace(' CAT', '') }
  };
}

function mockSaveStJohnEntry(data) {
  if (!data?.date) return { ok: false, error: 'date_required' };
  const key = `${data.date}|St John's`;
  const rec = mockDb.wholesale[key] || (mockDb.wholesale[key] = {
    morning: {}, afternoon: {},
    prices: { Baguma: 500, Triangle: 500, Sultan: 500, Mandazi: 300, Obama: 500, Ntuwisa: 500, Pop: 300, 'Bin Laden': 500, Puff: 300, 'banana cup/swiss': 1000, 'small cake': 1500, Coil: 550 },
    money: { broughtForward: 228000, paidAmount: null, balanceCalculated: true, manualBalance: null }
  });
  const replace = !!data.replaceDay;
  const written = [], skipped = [];
  (data.morning || []).forEach((it) => {
    const q = Number(it.qty); if (!(q > 0)) return;
    if (rec.morning[it.name] && !replace) skipped.push({ product: it.name, field: 'morning' });
    else { rec.morning[it.name] = { qty: q, src: 'wholesale' }; written.push({ product: it.name, field: 'morning' }); }
  });
  (data.afternoon || []).forEach((it) => {
    const q = Number(it.qty); if (!(q > 0)) return;
    if (rec.afternoon[it.name] && !replace) skipped.push({ product: it.name, field: 'afternoon' });
    else { rec.afternoon[it.name] = { qty: q, src: 'wholesale' }; written.push({ product: it.name, field: 'afternoon' }); }
  });
  if (data.paidAmount !== '' && data.paidAmount != null) {
    if (rec.money.paidAmount != null && !replace) skipped.push({ field: 'paidAmount' });
    else { rec.money.paidAmount = Number(data.paidAmount); written.push({ field: 'paidAmount' }); }
  }
  if (data.replaceBalance) { rec.money.balanceCalculated = false; rec.money.manualBalance = Number(data.balance); written.push({ field: 'balance' }); }
  else if (data.restoreBalance) { rec.money.balanceCalculated = true; rec.money.manualBalance = null; written.push({ field: 'balance' }); }
  return { ok: true, rows: written.length, wholesale: { ok: true, mode: replace ? 'replace' : 'blanks-only', written, skipped, notes: [], after: mockDateHasEntries(data.date, "St John's").money } };
}

function mockSaveExpense(data) {
  const list = (data?.expenses || []).filter((r) => r && (r.category || r.amount || r.use || r.shop || r.name));
  if (!list.length) return { ok: false, error: 'Enter at least one expense' };
  const errors = [];
  list.forEach((r, i) => {
    const f = [];
    if (!EXPENSE_CATEGORIES.includes(r.category)) f.push('category');
    if (!(Number(r.amount) > 0)) f.push('positive amount');
    if (!EXPENSE_USES.includes(r.use)) f.push(EXPENSE_USES.join('/'));
    if (!EXPENSE_SHOPS.includes(r.shop)) f.push('Paid from');
    if (r.category === 'Other' && (!r.name || r.name.trim().length < 2)) f.push('expense name');
    if (f.length) errors.push({ row: i + 1, fields: f });
  });
  if (errors.length) return { ok: false, error: 'Invalid expense rows: ' + errors.map((e) => `${e.row} (${e.fields.join(', ')})`).join('; ') };

  const cur = mockDb.expenses[data.date] || (mockDb.expenses[data.date] = []);
  const written = [];
  list.forEach((r, idx) => {
    const rowNum = 18 + cur.length;
    const label = `${r.use}: ${r.category === 'Other' ? r.name.trim() : r.category}`;
    const amt = Number(r.amount);
    cur.push({ shop: r.shop, row: rowNum, labelCell: `${r.shop[0]}${rowNum}`, amountCell: `${r.shop[0]}amt${rowNum}`, label, amount: amt, category: r.category, name: r.category === 'Other' ? r.name.trim() : '', use: r.use, tagged: true, editable: true, sig: JSON.stringify([label, amt, '', '']) });
    written.push({ row: idx + 1, shop: r.shop, label, amount: amt });
  });
  return { ok: true, rows: list.length, forum: { ok: true, rows: list.length }, wholesale: { ok: true, written, skipped: [], notes: [] } };
}

function mockLoadExpensesForEdit(date) {
  const today = malawiToday();
  const diff = daySerial(today) - daySerial(date);
  const oldest = addDays(today, -EXPENSE_EDIT_DAYS_BACK);
  if (diff < 0) return { ok: true, date, editable: false, note: 'Future dates cannot be edited.', oldest, rows: [], ledgers: {} };
  if (diff > EXPENSE_EDIT_DAYS_BACK) return { ok: true, date, editable: false, note: `Locked: only today and the ${EXPENSE_EDIT_DAYS_BACK} days before can be edited (from ${dmy(oldest)}).`, oldest, rows: [], ledgers: {} };
  return { ok: true, date, editable: true, oldest, rows: (mockDb.expenses[date] || []).map((r) => ({ ...r })), ledgers: { Home: { found: true, free: 5, editable: true }, Town: { found: true, free: 5, editable: true }, Wakawaka: { found: true, free: 5, editable: true } } };
}

function mockSaveExpenseEdit(data) {
  const rows = data?.rows || [];
  if (!rows.length) return { ok: false, error: 'No changes to save' };
  const list = mockDb.expenses[data.date] || (mockDb.expenses[data.date] = []);
  const written = [];
  rows.forEach((ch) => {
    if (ch.op === 'remove') {
      const idx = list.findIndex((r) => r.shop === ch.origShop && r.row === ch.origRow);
      if (idx >= 0) { written.push({ range: list[idx].labelCell }); list.splice(idx, 1); }
    } else if (ch.op === 'add') {
      const rowNum = 18 + list.length, label = `${ch.use}: ${ch.category === 'Other' ? ch.name : ch.category}`, amt = Number(ch.amount), cell = `${ch.shop[0]}${rowNum}`;
      list.push({ shop: ch.shop, row: rowNum, labelCell: cell, amountCell: cell, label, amount: amt, category: ch.category, name: ch.name || '', use: ch.use, tagged: true, editable: true, sig: JSON.stringify([label, amt, '', '']) });
      written.push({ range: cell });
    } else if (ch.op === 'update') {
      const idx = list.findIndex((r) => r.shop === ch.origShop && r.row === ch.origRow);
      if (idx >= 0) {
        const label = `${ch.use}: ${ch.category === 'Other' ? ch.name : ch.category}`, amt = Number(ch.amount);
        list[idx] = { ...list[idx], shop: ch.shop, label, amount: amt, category: ch.category, name: ch.name || '', use: ch.use, tagged: true, sig: JSON.stringify([label, amt, '', '']) };
        written.push({ range: list[idx].labelCell });
      }
    }
  });
  return { ok: true, changes: rows.length, wholesale: { ok: true, written }, backup: { ok: true, rows: rows.length } };
}

function mockReadProduction(date) {
  if (!date || date < PRODUCTION_MIN_DATE || date > PRODUCTION_MAX_DATE) return { ok: false, error: 'Choose 07/11/2026–30/11/2026.' };
  let state = mockDb.production[date];
  if (!state) {
    state = {
      rows: PRODUCTION_NAMES.map((n) => ({ name: n, day: null, night: null })),
      inputs: {
        ok: true, locked: false, combined: false, total: 0,
        rows: [
          { name: 'Flour (50kg bag)', day: null, night: null, price: 52000, fixed: false, writable: true },
          { name: 'Cooking oil (L)', day: null, night: null, price: 3300, fixed: false, writable: true },
          { name: 'Sugar (kg)', day: null, night: null, price: 2800, fixed: false, writable: true },
          { name: 'Yeast (pkt)', day: null, night: null, price: 4500, fixed: false, writable: true },
          { name: 'Electricity', day: 1, night: null, price: null, fixed: true, writable: true },
          { name: 'Breadbags', day: 1, night: null, price: null, fixed: true, writable: true }
        ]
      }
    };
    mockDb.production[date] = state;
  }
  const totals = PRODUCTION_NAMES.map((n) => {
    const r = state.rows.find((x) => x.name === n) || { day: null, night: null };
    const baseDay = n === 'Baguma' ? 2400 : n === 'Obama' ? 1600 : n === 'Triangle' ? 1400 : null;
    const d = r.day != null ? (baseDay || 0) + r.day : baseDay;
    const ni = r.night != null ? r.night : (n === 'Baguma' ? 950 : null);
    return { name: n, day: d, night: ni, total: d != null || ni != null ? (d || 0) + (ni || 0) : null };
  });
  return { ok: true, date, rows: state.rows.map((r) => ({ ...r })), inputs: { ...state.inputs, rows: state.inputs.rows.map((r) => ({ ...r })) }, totals, problems: [], writable: true, readMs: 120 };
}

function mockSaveProduction(data) {
  const st = mockDb.production[data.date];
  if (!st) return { ok: false, error: 'Load the date first.' };
  const replace = !!data.replace, written = [], skipped = [];
  (data.items || []).forEach((it) => {
    const row = st.rows.find((r) => r.name === it.name); if (!row) return;
    ['day', 'night'].forEach((s) => {
      if (it[s] === '' || it[s] == null) return;
      if (row[s] !== null && !replace) skipped.push(`${it.name} ${s}`);
      else { row[s] = Number(it[s]); written.push(`${it.name} ${s}`); }
    });
  });
  (data.inputs || []).forEach((it) => {
    const row = st.inputs.rows.find((r) => r.name === it.name); if (!row) return;
    ['day', 'night'].forEach((s) => {
      if (it[s] === '' || it[s] == null) return;
      if (row[s] !== null && !replace) skipped.push(`${it.name} ${s}`);
      else { row[s] = Number(it[s]); written.push(`${it.name} ${s}`); }
    });
  });
  if (!written.length) return { ok: false, error: skipped.length ? 'Those numbers are already recorded. Tick Replace this day to overwrite.' : 'Nothing entered.', skipped };
  return { ok: true, written, skipped };
}

function mockReadDispatch(date) {
  if (!date || date < DISPATCH_MIN_DATE || date > DISPATCH_MAX_DATE) return { ok: false, error: 'The dispatch room count is set up for 17/11/2026–30/11/2026 only.' };
  const today = malawiToday(), diff = daySerial(today) - daySerial(date);
  let windowNote = '';
  if (diff < 0) windowNote = 'This date is in the future. Count today’s room or up to 3 days back.';
  else if (diff > DISPATCH_BACK_DAYS) windowNote = 'Counts can be entered for today and up to 3 days back only.';

  const list = date >= DISPATCH_COIL_FROM ? [...DISPATCH_PRODUCTS, DISPATCH_COIL] : [...DISPATCH_PRODUCTS];
  const saved = mockDb.dispatch[date];
  const products = list.map((name) => ({ name, counted: saved ? (saved.counts[name] ?? null) : null }));
  const bananas = DISPATCH_BANANAS.map((name) => ({ name, setUp: true, counted: saved ? (saved.bananas[name] ?? null) : null }));
  const counted = !!(saved && saved.counted);
  const out = {
    ok: true, date, layoutOk: true, problems: [], writable: !windowNote, windowNote, products, bananas, bananaNote: '',
    counted, complete: counted && products.every((p) => p.counted != null), name: saved ? saved.name : '', admins: ['Masa', 'Masateru', 'Pascal'],
    warnings: counted ? [] : [`Night production ${dmy(addDays(date, -1))} check: make sure night & day production are entered before final gap check.`], readMs: 110
  };
  if (counted) out.result = list.map((name) => ({ name, expected: saved.expected[name] ?? 0, counted: saved.counts[name] ?? 0, gap: (saved.counts[name] ?? 0) - (saved.expected[name] ?? 0) }));
  return out;
}

function mockSaveDispatchCount(data) {
  const date = data?.date; if (!date) return { ok: false, error: 'Date required.' };
  const who = String(data.who || '').trim();
  if (who.length < 2) return { ok: false, error: 'Type your name (letters only, 2–40 characters).' };
  const list = date >= DISPATCH_COIL_FROM ? [...DISPATCH_PRODUCTS, DISPATCH_COIL] : [...DISPATCH_PRODUCTS];
  const existing = mockDb.dispatch[date];
  if (existing?.counted && !data.correction) return { ok: false, error: `This day is already counted${existing.name ? ' by ' + existing.name : ''}.` };
  if (data.correction && !DISPATCH_ADMINS.includes(norm(who))) return { ok: false, error: 'Only Masa or Pascal can correct a saved count.' };
  const counts = {}, expected = {};
  list.forEach((n, idx) => { const c = Number(data.counts?.[n] ?? 0); counts[n] = c; expected[n] = existing?.expected?.[n] ?? (idx === 2 ? c + 2 : c); });
  const bananas = {}; DISPATCH_BANANAS.forEach((b) => { const raw = data.bananas?.[b]; bananas[b] = raw === '' || raw == null ? null : Number(raw); });
  const type = existing?.counted ? 'correction' : 'save';
  mockDb.dispatch[date] = { counted: true, name: who, counts, expected, bananas };
  return {
    ok: true, type, date, name: who, written: ['mock'],
    result: list.map((n) => ({ name: n, expected: expected[n], counted: counts[n], gap: counts[n] - expected[n] })),
    bananas: DISPATCH_BANANAS.map((b) => ({ name: b, setUp: true, counted: bananas[b], gap: 'not tracked yet' })),
    bananaNote: '', warnings: [], log: { ok: true, rows: list.length }
  };
}

export async function runMock(action, payload) {
  await sleep(480);
  switch (action) {
    case 'dateHasEntries': return mockDateHasEntries(payload.date, payload.shop);
    case 'saveEntryWithHandovers': return mockSaveEntryWithHandovers(payload);
    case 'saveStJohnEntry': return mockSaveStJohnEntry(payload);
    case 'saveExpense': return mockSaveExpense(payload);
    case 'loadExpensesForEdit': return mockLoadExpensesForEdit(payload.date);
    case 'saveExpenseEdit': return mockSaveExpenseEdit(payload);
    case 'readProduction': return mockReadProduction(payload.date);
    case 'saveProduction': return mockSaveProduction(payload);
    case 'readDispatch': return mockReadDispatch(payload.date);
    case 'saveDispatchCount': return mockSaveDispatchCount(payload);
    default: return { ok: false, error: `Unknown mock action: ${action}` };
  }
}
