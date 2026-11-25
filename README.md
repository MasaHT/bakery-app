# Cake Palace Bakery Phone App

A simple, fast phone app for the Cake Palace team to record daily bakery work in Malawi time (`CAT`).

## What it does
- **Wholesale Entry**: Morning delivery, afternoon delivery, stock left (with **Out** for sold out), cash, and handovers for **Town**, **Home**, **Wakawaka**, and **St. John's**.
- **Expenses**: Record daily expenses (with **Paid from** shop and **Bakery / Family / Farm** split) or fix mistakes from the last 3 days.
- **Production**: Record Day and Night production plus inputs used.
- **Dispatch room**: Evening count for the dispatch room (9 products, plus **Coil** from 19/11, and optional banana items).

## Practice mode (Step 1)
Right now the app runs in **Practice mode** (`API_URL` in `config.js` is blank).
- Saves pretend to work (~0.5 seconds) so everyone can test the screens safely on a phone.
- Nothing is sent to Google Sheets or WHOLESALE 2026.

## Going live later (after Masa approves)
1. Add `apps-script/PhoneReceiver.gs` to the Apps Script project (replacing the old `doPost` in `Code.gs`) and deploy a new Web App version.
2. Put the Web App `/exec` URL into `API_URL` in `config.js`.
3. Push to `main` so GitHub Pages updates the phone app.
