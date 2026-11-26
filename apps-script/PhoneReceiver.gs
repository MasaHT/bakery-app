/**
 * PhoneReceiver.gs — Jumlop Bakery phone app (PWA) receiver (v44: + read-only report actions).
 *
 * Called by doPost(e) in Code.gs via handlePhoneRequest_(body) when
 * isPhoneRequest_(body) detects a phone-app POST request. Do NOT define a
 * second doPost(e) here; Code.gs owns the single doPost(e) entrypoint.
 *
 * Cross-origin pattern:
 * The PWA on https://masaht.github.io sends POST requests with
 * Content-Type: text/plain;charset=utf-8 and body
 * JSON.stringify({ action, payload, pin }), with no custom headers so the
 * browser sends a simple POST without an OPTIONS preflight. doPost wraps the
 * returned object in json_(...) (ContentService JSON + Apps Script 302
 * redirect to script.googleusercontent.com with Access-Control-Allow-Origin).
 *
 * Family PIN:
 * Set Script Properties key FAMILY_PIN in Project Settings -> Script
 * Properties (never hardcode it in files). Every phone request must send a
 * matching pin. If FAMILY_PIN is missing or empty, every request is rejected
 * (fail closed) with { ok: false, error: 'wrong_pin' }.
 */

/** Reads FAMILY_PIN from Script Properties. Empty/unset means reject all. */
function familyPinExpected_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty('FAMILY_PIN');
    return v == null ? '' : String(v).trim();
  } catch (e) {
    return '';
  }
}

/** Constant-time-ish XOR compare, then equality check. Fails closed on empty expected. */
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

/** Handles phone-app JSON requests after doPost parses the body. Returns plain object for json_(). */
function handlePhoneRequest_(body) {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, error: 'invalid_request' };
    }

    if (!pinMatches_(body.pin, familyPinExpected_())) {
      return { ok: false, error: 'wrong_pin' };
    }

    var action = String(body.action || '').trim();
    var payload = (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) ? body.payload : {};

    switch (action) {
      case 'ping':
        return {
          ok: true,
          malawiToday: malawiToday_(),
          timezone: 'Africa/Blantyre (CAT, UTC+2)'
        };

      // Wholesale Entry (Code.gs + Handover.gs)
      case 'dateHasEntries':
        return dateHasEntries(String(payload.date || ''), String(payload.shop || 'Town'));

      case 'saveEntryWithHandovers':
        return saveEntryWithHandovers(payload);

      case 'saveStJohnEntry':
        return saveStJohnEntry(payload);

      // Expenses (Code.gs)
      case 'saveExpense':
        return saveExpense(payload);

      case 'loadExpensesForEdit':
        return loadExpensesForEdit(String(payload.date || ''));

      case 'saveExpenseEdit':
        return saveExpenseEdit(payload);

      // Production (Production.gs)
      case 'readProduction':
        return readProduction(String(payload.date || ''));

      case 'saveProduction':
        return saveProduction(payload);

      // Dispatch room (Dispatch.gs)
      case 'readDispatch':
        return readDispatch(String(payload.date || ''));

      case 'saveDispatchCount':
        return saveDispatchCount(payload);

      // Daily report (Report.gs, v44). Read-only; both share the getDailyReport cache.
      case 'readReportSummary':
        return readReportSummary(String(payload.date || ''), payload.force === true);

      case 'readReportFull':
        return readReportFull(String(payload.date || ''), payload.force === true);

      // Legacy expense shape when called with a valid PIN
      case 'expense':
        return saveExpense_(body);

      default:
        return { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
