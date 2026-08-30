# Changelog

Every production update is recorded here. The version shown in the website also includes the short Git build ID, which identifies the exact deployed code.

## 1.6.0 — 2026-08-30

- Redesigned the Online Accounts daily sales graph with a cleaner focused layout and improved visual hierarchy.
- Added Digital and Cash selectors so only one sales graph is shown at a time.
- Added the matching daily passenger count as a separate dotted line with its own scale, period total, and exact per-day chart details.

## 1.5.0 — 2026-08-30

- Added a daily line graph to the Online Accounts final report with separate Digital Sales and Cash Sales lines.
- Combined Website, Android App, iOS App, and legacy digital amounts only for the Digital Sales graph line while leaving every existing report calculation unchanged.
- Added responsive mobile scrolling, exact per-day chart tooltips, totals in the legend, and print-friendly chart styling.

## 1.4.1 — 2026-08-30

- Fixed confirmed document imports failing on the live Turso database after import history was introduced.
- Moved import tracking into a separate link table so Digital Sales, Cash Sales, and Daily Cash Costs continue using their proven save path while retaining full history controls.
- Preserved and automatically linked any import batches that were successfully created by v1.4.0.

## 1.4.0 — 2026-08-30

- Added persistent document-import history for the 50 most recent Online Accounts uploads, including the file, detected sheet/table, destination, uploader, record dates, and remaining record count.
- Added expandable batch details with Change and Delete actions for individual imported entries.
- Added safe batch deletion that removes only the records created by that upload, without affecting manually entered data or other imports.
- Import history begins with uploads confirmed after this version because older imported records cannot be safely distinguished from manual entries.

## 1.3.1 — 2026-08-30

- Fixed document-import dates so schedule headings and values such as `27-08-26` are recognized, converted to `2026-08-27`, and opened automatically after import.
- Made Bus Number optional for Digital Sales, Cash Sales, editable import previews, and bulk imports.

## 1.3.0 — 2026-08-30

- Added a configurable document importer to Online Accounts for searchable PDF tables, Excel (.xlsx), CSV, TSV, and text tables.
- Added automatic column suggestions, destination selection for Digital Sales, Cash Sales, or Daily Cash Costs, and per-column field mapping.
- Added an editable row-by-row preview with skip controls, validation, and confirmation before saving anything.
- Added a validated bulk-import endpoint that prevents partial imports when any selected row is invalid.

## 1.2.5 — 2026-08-30

- Added animated loading indicators and progress text to Online Accounts sale, cash, expense, and expense-category action buttons.
- Disabled related actions while a save is in progress to prevent accidental duplicate entries.

## 1.2.4 — 2026-08-30

- Made the Digital Sales, Cash Sales, and Daily Cash Costs date selectors change the active Daily Collection Sheet day and immediately load that day’s records.
- Preserved independent date changes while editing an existing sale or expense so records can still be moved to another day.

## 1.2.3 — 2026-08-30

- Added passenger totals to every daily sale summary in Online Accounts.
- Added separate Website, Android App, and iOS App daily cards showing total passengers plus Normal and Long passenger counts.
- Added passenger totals to the daily Online Total and Cash Sale cards.
- Synchronized the Expense date with the Cash Sale entry date so both daily records stay on the same selected day.

## 1.2.2 — 2026-08-30

- Split Digital Sales into separate Website, Android App, and iOS App platforms for entry, totals, daily reports, PDF/share summaries, and Excel-compatible exports.
- Preserved older combined Website/Android entries as a clearly marked legacy category until they are edited and assigned to the correct platform.

## 1.2.1 — 2026-08-30

- Added Online Accounts to the Users & Permissions module checklist so it can be granted to any built-in or custom role.
- Added separate View and Edit enforcement in both the interface and server API.
- Fixed granted modules not appearing in the sidebar for several built-in roles.
- Changed unsaved permission rows to correctly default to no access; enabling Edit now automatically enables View.

## 1.2.0 — 2026-08-30

- Added a standalone Online Accounts module for Super Admin, Admin, and the new Online Manager role.
- Added editable daily Website/Android App, iOS, and Cash sales with coach, bus, passenger, and amount details.
- Added editable cash expenses and reusable expense categories with safe archive/restore behavior.
- Added an in-module final report with platform passenger/sales totals, day-by-day cash, clustered expenses, and Final Cash calculation.
- Added Print, PDF, Share, and Excel-compatible export actions.
- Kept all Online Accounts data separate from the existing Accounts and Reports modules.

## 1.1.1 — 2026-08-30

- Fixed Super Admin sidebar ordering reverting after a page refresh.
- Added a dedicated uncached server read, verified save response, local refresh fallback, and visible saved/error feedback.

## 1.1.0 — 2026-08-30

- Added the visible app version and exact build ID to Settings and the sidebar.
- Added Copy version for easier support reporting.
- Added Clear cache & refresh without removing login details or database data.
- Started enforced release tracking for future updates.

## 1.0.0 — Baseline

- Initial tracked release of the Lal Sabuj Paribahan Operations Dashboard.
