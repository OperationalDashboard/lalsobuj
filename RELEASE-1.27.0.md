# Passenger checker — 1.27.0

## Scope and safety

New tab: Online Accounts → Passenger checker, beside Final report.
The checker reads `online_sales_entries` but never writes to it. Its only stored data are reviewed input rows, comparison snapshots and administrator decisions in two new isolated tables:
`online_passenger_checks` and `online_passenger_check_audit`.
Existing sales, bus records, accounts, database connection settings and other features must remain unchanged.

View permission for Online Accounts permits comparison and viewing saved checks.
Edit permission permits saving checks and editing one's own checks; Admin/Super Admin may edit any check and alone may record review decisions.
Rechecks reset decisions to pending and preserve earlier revisions. Result totals combine repeated bus/date rows only after explicit user verification. Short four-digit bus numbers match only a unique available registration. Comparisons use each row's journey date, not the sheet heading date.

## Document reader limitations

- PDF (up to 20 pages), JPEG, PNG and WebP, maximum 15 MB and 500 reviewed rows.
- Printed-text/local OCR uses English/Bengali data served by the website. It is loaded only on demand. Handwriting is NOT reliably recognized by this reader: the supplied handwritten Cumilla sample produced no reliable rows in the local test. The UI explicitly warns about this and allows manual entry next to the original preview.
- The optional handwriting reader uses the OpenAI Responses API with structured output. It is disabled by default, sends page images only after user consent and still requires manual verification. No real provider call or accuracy validation has been performed without an authorized API key.
- No original files are persisted. Keep original sheets separately. Partial/uncertain reads must be corrected before comparison.

To enable handwriting reading, an administrator must configure these **server environment variables in cPanel**, never in client code or Git:

```
CHECKER_OCR_ENABLED=true
CHECKER_OCR_API_KEY=<your API key>
CHECKER_OCR_MODEL=gpt-4.1-mini
```

API charges are separate from hosting and ChatGPT. Set a project budget/provider limits before enabling. The application caps requests at 2 concurrent pages, 30 pages/user/hour and 100 pages/process/hour; these counters reset on process restart, so provider-side controls are required for a spending limit. The provider call has a 90-second timeout and does not retry automatically. The UI discloses external processing. Request uses `store:false`; provider data policies still apply.

Documentation used: [image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Namecheap deployment

Do not use Render. Expected app root: `/home/lalsprog/lalsobuj`; served frontend: `/home/lalsprog/lalsobuj/client/dist`.

1. Build/test locally, commit, and build again so the Git revision displayed in Settings/sidebar matches the commit.
2. Back up the existing `server/src/index.js` and `client/dist/index.html` outside the served folder. Preserve all old hashed assets so existing browser sessions keep working. Back up the database using the existing Turso backup process; do not copy or replace `.env` or database files.
3. Extract the update archive to a new staging directory, not directly into the running application. Verify the archive's explicit file allowlist. No `.env`, database files, `node_modules`, or `db.js` belong in this update.
4. Copy new `server/src/passengerChecker.js`, `server/src/routes/passengerChecks.js`, `server/src/routes/passengerCheckerOcr.js` into the app. Copy new frontend assets and `checker-ocr` first. Then activate `server/src/index.js` and finally `client/dist/index.html`. Preserve old assets; do not delete the live folders.
5. Trigger the existing Passenger restart using `tmp/restart.txt` once the server files are in place. A shared-host restart can briefly interrupt requests; zero downtime cannot be guaranteed. Do not repeatedly restart an active service.
6. Verify `/api/health`, login, existing Online Accounts tabs, version 1.27.0, new checker endpoints and OCR assets. Use a disposable check, not test sales. Verify Admin/Super Admin review controls. Confirm saved check survives refresh and existing totals are unchanged.
7. Roll back only the backed-up server index and frontend index if needed, then restart. Leave the additive checker tables intact so checks/history are not lost.

No new server npm dependencies. Built OCR assets are included; running a client build elsewhere requires `npm ci` including dev dependencies and `npm run build` (prebuild prepares assets).

## Verification

Run `node --test server/test/passenger-checker.test.cjs server/test/rotation-trash.test.cjs server/test/settings-read-only.test.cjs` and `npm --prefix client run build`.
Tests use isolated memory databases and fake OCR responses, never production credentials or records.
Visual browser testing and a live handwriting-provider check remain required when those connections are available.
