// Jumlop Bakery PWA configuration (mirrors v40 live web app).
// Leave API_URL empty for Practice / Mock mode (step 1).
// When Masa approves going live, paste the Apps Script Web App /exec URL here.
export const API_URL = '';

export const DATA_MODE = API_URL ? 'live' : 'mock';
export const TIMEOUT_READ_MS = 15000;
export const TIMEOUT_WRITE_MS = 25000;
export const READ_RETRIES = 2;

export const SHOPS = [
  { value: 'Town', label: 'Town' },
  { value: 'Home', label: 'Home' },
  { value: 'Bypass/Wakawaka', label: 'Wakawaka' },
  { value: "St John's", label: "St. John's" }
];

export const PRODUCTS = [
  'Baguma',
  'Obama',
  'Ntuwisa',
  'Triangle',
  'Sultan',
  'Pop',
  'Bin Laden',
  'Puff',
  'Mandazi',
  'Crocodile',
  'banana slice',
  'banana cup/swiss',
  'small cake',
  'Coil'
];

export const DEFAULT_PRODUCTS = [
  'Baguma',
  'Obama',
  'Ntuwisa',
  'Triangle',
  'Sultan',
  'Pop',
  'Bin Laden'
];

export const TOWN_EXTRAS = ['Drinks', 'Milk', 'Coil'];

// Official key stays 'Bin Laden'; 4 Corner is shown as an alias so one row is used.
export const DISPLAY_NAMES = {
  'Bin Laden': 'Bin Laden (4 Corner)',
  'banana slice': 'banana slice (Banana slice cake)'
};

export const PRODUCT_ALIASES = {
  '4 corner': 'Bin Laden',
  '4corner': 'Bin Laden',
  'four corner': 'Bin Laden',
  'binladen': 'Bin Laden',
  'bin laden': 'Bin Laden',
  'donut': 'Mandazi',
  'donuts': 'Mandazi',
  'dons': 'Mandazi',
  'donald': 'Mandazi',
  'donalds': 'Mandazi',
  'yellow': 'Pop',
  'puffs': 'Puff',
  'ntwitsa': 'Ntuwisa',
  'twisa': 'Chintuwisa',
  'chintuwisa': 'Chintuwisa'
};

export const ST_JOHN_DEFAULTS = ['Baguma', 'Triangle', 'Sultan', 'Mandazi'];
export const ST_JOHN_PRODUCTS = [
  'Baguma', 'Triangle', 'Sultan', 'Mandazi',
  'Obama', 'Ntuwisa', 'Pop', 'Bin Laden',
  'Puff', 'banana cup/swiss', 'small cake', 'Coil'
];

export const HANDOVER_EXTRA = ['Drinks'];
export const HANDOVER_PRODUCTS = [...PRODUCTS, ...HANDOVER_EXTRA];
export const HANDOVER_DEFAULTS = ['Baguma', 'Triangle', 'Obama', 'Pop', 'Mandazi', 'Drinks'];
export const HANDOVER_LABELS = {
  Pop: 'Pop (yellow)',
  Triangle: 'Triangle (triangles)',
  'Bin Laden': 'Bin Laden (4 Corner)',
  'banana slice': 'banana slice (Banana slice cake)'
};
export const HANDOVER_SHOPS = ['Town', 'Home', 'Bypass/Wakawaka'];

export const EXPENSE_CATEGORIES = [
  'Fuel', 'Flour', 'Cooking oil', 'Sugar', 'Yeast', 'Packaging',
  'Transport', 'Electricity', 'Wages', 'Maintenance', 'Airtime', 'Other'
];
export const EXPENSE_USES = ['Bakery', 'Family', 'Farm'];
export const EXPENSE_USE_LABELS = {
  Bakery: 'Bakery operations',
  Family: 'Family',
  Farm: 'Farm'
};
export const EXPENSE_SHOPS = ['Home', 'Town', 'Wakawaka'];
export const EXPENSE_EDIT_DAYS_BACK = 3;

export const PRODUCTION_NAMES = [
  'Baguma', 'Obama', 'Ntuwisa', 'Triangle', 'Sultan', 'Pop', 'Bin Laden',
  'Puff', 'Mandazi', 'swizroll', 'banana cake', 'croisant', 'Coil'
];
export const PRODUCTION_DEFAULTS = PRODUCTION_NAMES.slice(0, 7);
export const PRODUCTION_MIN_DATE = '2026-11-07';
export const PRODUCTION_MAX_DATE = '2026-11-30';

export const DISPATCH_PRODUCTS = [
  'Puff', 'Mandazi', 'Obama', 'Triangle', 'Sultan',
  'Pop', 'Chintuwisa', 'Baguma', 'Bin Laden'
];
export const DISPATCH_BANANAS = ['Banana cake', 'Banana slice'];
export const DISPATCH_COIL = 'Coil';
export const DISPATCH_COIL_FROM = '2026-11-19';
export const DISPATCH_MIN_DATE = '2026-11-17';
export const DISPATCH_MAX_DATE = '2026-11-30';
export const DISPATCH_BACK_DAYS = 3;
export const DISPATCH_ADMINS = ['masa', 'masateru', 'pascal'];

export const WHO_QUICK_NAMES = ['Mummy', 'Papa', 'Pascal', 'Lovemore', 'Masa', 'Godfrey'];
