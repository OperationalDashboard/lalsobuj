# Changelog

Every production update is recorded here. The version shown in the website also includes the short Git build ID, which identifies the exact deployed code.

## 1.18.2 — 2026-09-01

- Made staff-type removal explicit and reliable: choose a replacement staff type in Settings, then use **Move & remove**. Any assigned staff are moved in the same save, and the removed type disappears completely.

## 1.18.1 — 2026-09-01

- Fixed Settings-managed bus categories so Add, Edit, and Remove now use the same verified save route.
- Staff-type save failures are now shown clearly instead of silently appearing to do nothing.
- When removing a staff type that is still assigned to staff, Settings now offers to move those staff to another type and removes the old type completely.

## 1.18.0 — 2026-09-01

- Added Settings-managed Staff Types: add, rename, group as Bus/Counter/Office staff, or remove old choices.
- Staff Details now uses those live types, so an authorized user can move any staff member to a different type while preserving their staff ID and all linked history.
- Made bus/counter attendance and posting follow the configured staff-type group rather than a fixed code list.

## 1.17.0 — 2026-09-01

- Limited the Dashboard fleet table to 15 buses per page, with clear Previous/Next paging and the visible range shown.
- Replaced every Rotation assignment picker with a searchable selector: bus, driver, helper, supervisor, route, and linked/exception return route can all be found by typing.

## 1.16.1 — 2026-09-01

- Applied one shared Bus Number display rule across Dashboard, Live Activity, Rotation, Staff, Maintenance, Reports, Trash, and Buses, so imported internal `FLEETS-### |` prefixes are never shown to users.
- Kept the internal fleet keys unchanged in the database, protecting duplicate fleet records and their existing history.

## 1.16.0 — 2026-09-01

- Rebuilt role permissions into a full feature-by-feature matrix with separate View and Edit choices for every sidebar section.
- Split Accounts permission into independent **Bus Accounts** and **Place-wise Accounts** access, enforced in both the interface and server APIs.
- Added view-only page behavior, so users can review authorized information without being offered edit controls they cannot use.
- Preserved the existing workspaces of built-in roles on upgrade; after an Admin saves a role, every selected and unselected permission is applied exactly as configured.

## 1.15.0 — 2026-09-01

- Replaced the crowded Accounts bus list with a dedicated Bus Number search and a boxed 10-bus-per-page browser.
- Made every bus label in Accounts show only the real Bus Number, hiding imported internal keys such as `FLEETS-001 | ...` while preserving each bus's separate identity and account history.
- Kept older and manually added buses searchable by their saved number when no separate imported Bus Number exists.

## 1.14.0 — 2026-08-31

- Imported the 62 route Titles from Route.pdf, treating every visible tick as active and supporting unticked source rows as inactive.
- Prevented duplicate routes even when capitalization, apostrophes, dash style, or spacing differ.
- Rebuilt route editing into an explicit responsive workflow for name, return route, full-trip time, and active/inactive status, with search and save progress.
- Route renaming now updates linked buses, rotations, and trips while preserving their IDs and operational history.

## 1.13.1 — 2026-08-31

- Added full counter-detail editing for the counter name, location, and parent place without replacing the counter or losing its linked staff and account history.
- Redesigned counter cards and edit controls with a clear responsive layout, premium edit action, save progress, and cancel controls.

## 1.13.0 — 2026-08-31

- Imported fleet rows 101–200 from Fleets-2.pdf using Reg Number, Type, Seat, Makers, and ticked/unticked Status only; 14 unticked buses are unavailable.
- Added Settings-managed bus categories with add, rename, and remove controls; renaming updates every bus already assigned to that category.
- Replaced the misleading class selector in the Buses Category column with the recognised category list, including Economy (AC), Economy (NON AC), Suite-Class AC (AC), and Sleeper (AC).
- Redesigned edit actions with a polished gradient, icon, shine, hover, and keyboard-focus treatment.

## 1.12.0 — 2026-08-31

- Imported the 100 visible fleet rows from Fleets.pdf using only Reg Number as Bus Number, Type as Category, Seat as Capacity, Makers as Manufacturer, and the ticked/unticked availability status.
- Marked the five unticked buses as unavailable and made unavailable a normal editable bus status.
- Kept unavailable buses out of Rotation and trip starts while allowing an authorized user to change their status later.
- Preserved the duplicate `12-5819` records independently using source-row-based internal keys.

## 1.11.1 — 2026-08-31

- Removed only the 201 fleet rows imported from the superseded Book 1.pdf, leaving all pre-existing and manually created bus records untouched.
- Kept the expanded bus-detail fields and interface ready for a corrected source document.

## 1.11.0 — 2026-08-31

- Imported all 201 bus records from Book 1.pdf with fleet serial, printed bus number, category, configured class, capacity description, manufacturer, country, model year, and every readable registration date.
- Preserved repeated printed bus numbers as separate fleet records by using the document serial in each internal registration key.
- Marked 176 registration dates as unavailable because the source PDF renders those cells as `######`, without inventing missing values.
- Expanded the Buses page with detailed fields, full-record editing, search, and 25-row pagination for the larger fleet register.

## 1.10.0 — 2026-08-31

- Added an accessible Show / Hide control to the login password field for both Admin and Staff portals.
- Styled the password control for desktop, mobile, light mode, dark mode, mouse, and keyboard use.

## 1.9.3 — 2026-08-30

- Fixed newly granted modules, including Buses, not appearing for an already-signed-in Control Counter user.
- Added automatic permission refresh every 30 seconds and whenever a user returns to the website tab, without requiring sign-out.
- Updated the permission-save confirmation to explain when signed-in users receive their changed menu.

## 1.9.2 — 2026-08-30

- Fixed the Turso server error when saving Buses or other module permissions for a role.
- Removed the same incompatible database transaction wrapper from editable Settings lists, two-leg Accounts entries, trip pairing and account closing, permanent rotation deletion, and Online Accounts record/history deletion.
- Made document imports Turso-compatible with validated sequential inserts and automatic cleanup if an import fails partway through.
- Verified page reads and write workflows across Permissions, Buses, Staff, Attendance, Salary, Settings, Routes, Rotations, Accounts, Maintenance, Online Accounts, and Chat without server errors.

## 1.9.1 — 2026-08-30

- Simplified rotation rows to a single compact crew line instead of four large staff badges.
- Added 25-rotation pagination with a clear showing count, page number, and Previous / Next controls for busy daily reports.
- Kept full Driver, Helper, Supervisor, and Coach details inside the expanded leg view.

## 1.9.0 — 2026-08-30

- Added Driver, Helper, Supervisor, and Coach details to each rotation shown in Reports.
- Added each leg's assigned crew to the expanded rotation view, including staff changes between outbound and return trips.
- Gave the rotation and attendance report tables full-width rows so the added staff details remain clear and do not overlap financial columns.
- Added a clear note for historical rotations that do not have bus staff recorded.

## 1.8.3 — 2026-08-30

- Fixed the Turso server error that prevented counter staff salary amounts from posting to Place-wise Accounts.
- Kept salary posting idempotent so retrying updates the same staff/month entries without creating duplicates.
- Made the Accounts-page salary button use the selected entry date so the posted amount appears in that day's Place-wise totals.
- Added a visible “Posting salary…” state and disabled repeated clicks while the request is being processed.

## 1.8.2 — 2026-08-30

- Made route selection mandatory when scheduling a rotation, with validation in both the page and server.
- Prevented route-less legacy rotations from starting a live trip until a valid active route is selected on a new rotation.

## 1.8.1 — 2026-08-30

- Changed the Place-wise Accounts totals and counter details to show the selected day instead of combining every available date.
- Added a clear Selected day / Date range control so users can view any single date or choose a From and To date.
- Linked the place-entry date to the daily summary, so selecting an entry date immediately shows that day's figures below.

## 1.8.0 — 2026-08-30

- Added a Super-Admin-only “Currently active users” dashboard in Users & Permissions, with live session refresh and one card for each signed-in device.
- Added live user-session presence tracking with a lightweight heartbeat and automatic inactivity after two minutes.
- Added structured device detection for Windows, Mac, iPhone, Android, iPad, and other computer devices without storing IP addresses or raw browser identifiers.
- Added immediate presence removal on Log out and backward-compatible tracking for sessions created before this release.

## 1.7.0 — 2026-08-30

- Made every date point on the Online Accounts sales and passenger graph clickable and keyboard accessible.
- Added an Exact Date Report below the graph with selected sales, passenger counts, Website/Android/iOS breakdown, cash collection, expenses, and final cash.
- Added a selected-date guide, clearer click instruction, close control, and responsive detail cards for mobile screens.

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
