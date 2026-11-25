/**
 * PhoneReceiver.gs — NOT DEPLOYED (Step 1 draft).
 *
 * When Masa approves going live, add this file to the Cake Palace v40
 * Apps Script project and remove/replace the older doPost(e) in Code.gs
 * so only one doPost(e) exists in the project.
 *
 * Why text/plain?
 * The phone app (hosted on GitHub Pages) sends POST requests with
 * Content-Type: text/plain;charset=utf-8 and body JSON.stringify({ action, payload }).
 * Using text/plain avoids browser CORS preflight (OPTIONS), which Apps Script
 * Web Apps do not answer.
 *
 * Security / safety notes:
 * - Only explicitly allowlisted actions can run.
 * - All business rules, sheet locks, blanks-only checks, and forum backups
 *   continue to run inside the existing v40 server functions.
 */

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '{}';
    var req = JSON.parse(raw);
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      return json_({ ok: false, error: 'invalid_request' });
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
