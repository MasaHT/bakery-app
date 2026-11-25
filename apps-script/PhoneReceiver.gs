/**
 * PhoneReceiver.gs — NOT DEPLOYED (Step 1 draft).
 *
 * When Masa approves going live, add this file to the Jumlop Bakery v40
 * Apps Script project and remove/replace the older doPost(e) in Code.gs
 * so only one doPost(e) exists in the project.
 *
 * Why text/plain?
 * The phone app (hosted on GitHub Pages) sends POST requests with
 * Content-Type: text/plain;charset=utf-8 and body
 * JSON.stringify({ action, payload, pin }).
 * Using text/plain avoids browser CORS preflight (OPTIONS), which Apps Script
 * Web Apps do not answer.
 *
 * Family PIN:
 * Set Script Properties key FAMILY_PIN to the 6-digit family PIN (never
 * hardcode it here). Every request must send a matching pin. If FAMILY_PIN
 * is missing or empty, every request is rejected (fail closed). A wrong or
 * missing pin returns { ok: false, error: 'wrong_pin' }.
 *
 * Security / safety notes:
 * - Only explicitly allowlisted actions can run.
 * - All business rules, sheet locks, blanks-only checks, and forum backups
 *   continue to run inside the existing v40 server functions.
 */

/** Reads FAMILY_PIN from Script Properties. Empty/unset means reject all. */
function familyPinExpected_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty('FAMILY_PIN');
    return v == null ? '' : String(v);
  } catch (e) {
    return '';
  }
}

/** Same-length XOR compare, then a final equality check. Fail closed on empty expected. */
function pinMatches_(given, expected) {
  expected = String(expected == null ? '' : expected);
  given = String(given == null ? '' : given);
  if (!expected) return false;
  var len = expected.length;
  var diff = expected.length === given.length ? 0 : 1;
  for (var i = 0; i < len; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i < given.length ? i : 0);
  }
  return diff === 0 && given === expected;
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '{}';
    var req = JSON.parse(raw);
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      return json_({ ok: false, error: 'invalid_request' });
    }

    if (!pinMatches_(req.pin, familyPinExpected_())) {
      return json_({ ok: false, error: 'wrong_pin' });
    }

    var action = String(req.action || '').trim();
    var payload = (req.payload && typeof req.payload === 'object' && !Array.isArray(req.payload)) ? req.payload : {};

    switch (action) {
      case 'ping':
        return json_({
          ok: true,
          malawiToday: malawiToday_(),
          timezone: 'Africa/Blantyre (CAT, UTC+2)'
        });

      // Wholesale Entry (Code.gs + Handover.gs)
      case 'dateHasEntries':
        return json_(dateHasEntries(String(payload.date || ''), String(payload.shop || 'Town')));

      case 'saveEntryWithHandovers':
        return json_(saveEntryWithHandovers(payload));

      case 'saveStJohnEntry':
        return json_(saveStJohnEntry(payload));

      // Expenses (Code.gs)
      case 'saveExpense':
        return json_(saveExpense(payload));

      case 'loadExpensesForEdit':
        return json_(loadExpensesForEdit(String(payload.date || '')));

      case 'saveExpenseEdit':
        return json_(saveExpenseEdit(payload));

      // Production (Production.gs)
      case 'readProduction':
        return json_(readProduction(String(payload.date || '')));

      case 'saveProduction':
        return json_(saveProduction(payload));

      // Dispatch room (Dispatch.gs)
      case 'readDispatch':
        return json_(readDispatch(String(payload.date || '')));

      case 'saveDispatchCount':
        return json_(saveDispatchCount(payload));

      // Backwards-compatible fallback if a legacy client posts { action: 'expense', ... } directly
      case 'expense':
        return json_(saveExpense_(req));

      default:
        // Legacy v40 doPost fallback when no explicit new action is given
        if (!action && (req.date || req.morning || req.afternoon || req.stock || req.cash)) {
          return json_(saveEntry_(req));
        }
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
