# Cake Palace Bakery Phone App

A simple, fast phone app for the Cake Palace team to record daily bakery work in Malawi time (`CAT`).

## What it does
- **Wholesale Entry**: Morning delivery, afternoon delivery, stock left (with **Out** for sold out), cash, and handovers for **Town**, **Home**, **Wakawaka**, and **St. John's**.
- **Expenses**: Record daily expenses (with **Paid from** shop and **Bakery / Family / Farm** split) or fix mistakes from the last 3 days.
- **Production**: Record Day and Night production plus inputs used.
- **Dispatch room**: Evening count for the dispatch room (9 products, plus **Coil** from 19/11, and optional banana items).

## Family PIN
The app asks for a 6-digit Family PIN once on each phone (ask Masa for it). The phone remembers it and sends it with every save or load. If a phone is lost, or someone has the wrong PIN, Masa can change the PIN in Apps Script → Project Settings → Script Properties (`FAMILY_PIN`); that phone will be asked for the new PIN.

## Practice mode (Step 1)
Right now the app runs in **Practice mode** (`API_URL` in `config.js` is blank).
- Saves pretend to work (~0.5 seconds) so everyone can test the screens safely on a phone.
- Nothing is sent to Google Sheets or WHOLESALE 2026.
- Practice mode accepts any 6-digit PIN (use `000000` to try the “wrong PIN” message).

## Going live later (after Masa approves)
1. Add `apps-script/PhoneReceiver.gs` to the Apps Script project (replacing the old `doPost` in `Code.gs`) and deploy a new Web App version.
2. Set Script Properties key `FAMILY_PIN` to the 6-digit family PIN (the app will reject every request until this is set).
3. Put the Web App `/exec` URL into `API_URL` in `config.js`.
4. Push to `main` so GitHub Pages updates the phone app.
