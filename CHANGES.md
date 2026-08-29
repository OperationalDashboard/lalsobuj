# Changes — round 3

## Rotation — Supervisor
- Added a **Supervisor** option to the Rotation duty roster, alongside Driver and Helper — pick from staff with the "Supervisor" designation. Shows as its own column, and carries over when starting a linked return trip.

## Place-wise Accounts — was only counting two categories
- Fixed: the Place-wise Accounts report (`GET /api/accounts/place-finance`, used on both the Accounts and Reports pages) only ever looked at transactions categorized `place_income`/`place_expense`. Counter rent/staff-salary/electricity expenses entered from the main bus entry form — or posted automatically from Salary — carry a place name too but a different category, so they were silently missing, making a place look income-only. It now includes **every** transaction that has a place name, regardless of category.
- The Accounts page's place table also now shows separate Income / Expense / Net columns instead of one combined "Expense total" cell.

## Time Management — Bus staff removed, auto-tracked instead
- Bus staff (Driver, Supervisor, Bus Staff, Helper, Conductor, Mechanic) no longer appear in Time Management for manual check-in/out — enforced server-side too, not just hidden in the UI.
- Instead, they're **checked in automatically** the moment their bus's rotation starts on Live Activity (same time as departure), and **checked out automatically** when that trip is marked completed (or auto-completed by route time) — driven by the rotation's Driver/Helper/Supervisor.
- Time Management shows a separate read-only "Bus staff — Today (auto-tracked)" table so this is still visible, just not editable there. Admin/Super Admin can still correct a record's time from "All records" as before.
- Counter and office staff are unaffected — still check in/out manually as before.

Everything below is on top of the round-1 CHANGES already listed further down. Organized against your latest message, point by point.

## Live Activity — place picker, per-role checkpoint restrictions, admin overrides
- Admin/Super Admin now get a **place dropdown + "Other" free-text option** when logging an "arrived/left stop" checkpoint, backed by a new manageable `stop_locations` list (`GET/POST /api/activity-logs/places`).
- Counter and Control Counter can now **only** log "arrived at my counter" / "left my counter" (their own assigned counter, never typed) and a note — matching "Counter and control counter only post with their designated place."
- New **Hotel** role: can only log hotel breaks.
- New **Pump Manager** role (plus Accounts, as you asked): can only log fuel details.
- Passenger Checker: unchanged — passenger count only, nothing else.
- Admin/Super Admin: every checkpoint type, **plus** the ability to set an explicit time when creating an entry, and to **edit the time of any past entry** (✎ next to each log line and next to a trip's departure time).
- **Driver and Helper** are new roles that can start a trip — restricted to their own assigned bus (set on their Staff record), matching "Give driver and helper option to Start a trip section."

## Routes
- Route **name is now editable inline** (click the name, type, save).
- Added a **Full trip time (minutes)** field per route.

## Auto-complete by route time
- When a route's full trip time is set, a running trip on it is **automatically marked completed** once that much time has passed since departure — checked every minute in the background, and instantly whenever Live Activity is loaded.

## Maintenance → bus status (the "not yet solved" bug)
- Rebuilt this to be **self-healing**: a bus's status is now always computed live from whether it has an unresolved maintenance ticket, rather than trusted from a stored value that could drift out of sync. A bus can no longer show "active" anywhere in the app while it has an open ticket, regardless of which screen touched it last.

## Accounts — passenger/fuel prefill, both-legs option
- When you pick a rotation leg on the entry form, **passenger count now prefills from the Passenger Checker's own logged count** for that leg, and **fuel cost prefills from the Pump Manager's logged fuel entry** — both stay editable (Accounts/Admin/Super Admin only reach this page in the first place).
- Added a **"Both outbound and return leg"** option in the rotation picker for expense entries, so a shared cost like fuel can be attached to the whole rotation explicitly instead of picking one leg.
- Multiple fuel entries per rotation already just works — add another entry the same way for a second fill-up; a note on the form calls this out.

## Time Management
- **Only Admin/Super Admin can change a record's time or status now** (previously status was Super-Admin-only and time was open to more roles — both are now aligned to Admin+Super Admin, per your message).
- A staff member can **check in up to 3 times a day**.
- New **"Covering for an absent colleague"** flow: pick who's checking in and who they're representing — this feeds Salary's payroll calculation.

## Salary (new)
- New **Salary** page (Admin/Super Admin only): set each eligible staff member's plan — **Monthly** (fixed amount regardless of attendance) or **Daily** (paid per day actually worked), or explicitly **No salary**.
- New designations added for this: **Fourman, Checker, Store Manager, General Manager** (Counter Manager, Caller Man, Accounts already existed).
- **Payroll** view for any month: monthly staff get their fixed amount; daily staff get amount × distinct days worked; **covering for an absent colleague pays that colleague's own daily rate as overtime**, on top of the covering staff's normal pay — matching your Staff A/Staff B (500/450) example exactly.

## Reports
- Date picker is now a **From/To range** (pick one day by leaving them the same, or a real range).
- **Buses that ran a rotation** now shows **passenger count per rotation and a running total**, and clicking the expense line shows a **category-by-category breakdown** (fuel, salary, repair, toll, other).
- Income and expense are now **color-coded** (green/red) throughout, including in the bus-wise transaction table.
- The bus-wise report also shows **how many rotations that bus had** in the selected range with its total passengers.

## Rotation / Accounts / Trash (the "still shows on Report after removing" bug)
- Found the real cause: deleting a rotation on the Rotation page only ever removed the duty-roster row — it never touched the underlying trip/accounting record, so Accounts and Reports (which read from trips, not the duty roster) never noticed.
- Fixed with a proper **soft-delete + Trash**: Admin/Super Admin removing a rotation that has a live trip now moves **both legs, and everything Accounts recorded against them,** out of Rotation, Accounts, and Reports at once — into a new **Trash** page (Admin/Super Admin only), where it can be **restored** (brings it back everywhere) or its **report pulled without restoring it**.

## Known simplifications
- The "place" list for Admin/Super Admin's stop-checkpoint picker starts empty except for existing counter names — add stop names to it the first time you need them (same pattern as the Maintenance places list from round 1).
- Salary's "representing" rate uses whatever amount is on the absent colleague's salary plan record, regardless of whether their own plan is daily or monthly — set every eligible staff member's plan for this to compute correctly.
- As before, I couldn't run `npm install`/start the app in this environment — verified by careful review and syntax checking every changed file, not a live click-through. Test the rotation trash/restore, the payroll numbers, and the checkpoint permission matrix first.


This documents everything changed from the original build, organized by
your original request list.

## 1. Reports — buses that ran a rotation today
- Added a date picker at the top of Reports (defaults to today) — every
  section on the page (rotations, income/expense, attendance, maintenance,
  bus-wise report) now reflects that date, not just "today".
- "Buses that ran a rotation" is now expandable per row and shows full
  detail: both legs (outbound/return) with their route, departure/arrival
  time and price per seat, plus the rotation's net income/loss pulled from
  Accounts.

## 2. Maintenance headings + manageable places
- "Log a repair ticket" / "log ticket" renamed to bus-maintenance wording
  throughout ("Log bus maintenance", "Bus maintenance records", etc).
- Added a "Places where repair happens" manager on the Maintenance page —
  add/remove entries, replacing the old hardcoded location list. Backed by
  a new `maintenance_locations` table (`GET/POST/DELETE /api/maintenance/locations`).

## 3. Starting a trip
- Departure time is now **required** — the form won't submit and the API
  rejects the request without it.
- Buses under maintenance or retired no longer appear in the "start a
  trip" bus picker, and the server independently rejects starting a trip
  on a non-active bus even if the request is crafted directly.
- Starting a trip **automatically creates its Rotation entry** — no more
  manually duplicating it on the Rotation page. Accounts works against
  that same rotation.

## 4. Rotations = two paired legs
- A route can now name its "return route" (Routes page). When a bus starts
  a trip on that return route after completing the outbound leg, the two
  legs automatically merge into **one rotation** (same rotation number,
  shared expense, one Done/close state) — matching the
  Dhaka→Cumilla→Noakhali / Noakhali→Cumilla→Dhaka example.
- Income is tracked per leg (since price can differ), but expense and the
  accounts-closed state apply to the whole rotation.
- Accounts, Admin and Super Admin can correct the pairing by hand ("Fix
  pairing" on the Accounts page) if a bus takes an unexpected route back.

## 5 & 6. Accounts — income categories and deduction
- Income entries can now only be **Ticket Sales** or **Additional Sale**
  (Additional Sale requires a description). Every other category
  (fuel, salary, repair, toll, other) is expense-only — enforced both in
  the UI and on the server.
- Deduction is now "Deducted passengers" — the amount is always computed
  as `deducted_passengers × price_per_seat`, never typed directly.
- Rotations in Accounts are labeled with the bus number, e.g.
  "BUS-1 — Rotation #2", not just "#2".

## 7. Time Management
- Check-in/out status can now be changed after the fact, but only by
  Super Admin, via a click-to-toggle status badge (cycles
  present → late → absent → leave). Everyone else's status stays fixed
  once recorded, same as before.

## 8. Counters — "Staff posted at"
- Posted-at is now editable in place, both from Staff Details (toggle next
  to each staff member) and from the Counters page (assign/unassign
  directly under each counter).

## 9. Maintenance ↔ bus status
- Creating a maintenance ticket now automatically sets the bus's status to
  **maintenance**. It reverts to **active** automatically once every
  ticket for that bus is resolved. A bus can no longer show "active" while
  it has an open repair ticket.

## 10. Reports — date option everywhere
- One date picker drives every section: rotations, attendance (with a
  check-in → check-out table), maintenance, and the bus-wise solo report.

## 11. Edit permissions bug — found and fixed
- The actual bug: `server/src/routes/attendance.js` had every write route
  hardcoded to Admin/Super Admin only, completely ignoring the
  role-permission grants made from Users & Permissions. So granting
  "Time Management" write access to a custom role never worked. Fixed —
  it now checks granted permissions like every other module.

## 12. Bus imagery
- Added a small inline bus icon (`BusIcon.jsx`, no external image needed)
  used in the sidebar brand, the login screen, the Dashboard header, and
  next to each row on the Buses page (dimmed for non-active buses).

## 13. Full-site language
- Found the actual bug: the page area (`<Outlet>` in `Layout.jsx`) never
  re-rendered when the language was switched — only the Sidebar did,
  because it had its own listener. Fixed by remounting the active page on
  language change.
- Expanded the translation dictionary substantially and wired `t()` into
  every page (Dashboard, Live Activity, Accounts, Rotation, Time
  Management, Staff, Buses, Maintenance, Reports, Routes, Counters,
  Login, Sidebar) so switching to Bangla now changes the whole site, not
  just the sidebar.

## Database
All of the above needed schema changes — they're applied automatically
the next time the server starts (existing databases upgrade in place, no
manual migration needed):
- `routes.return_route_id`
- `trips.group_id`, `trips.leg_no`
- `transactions.deducted_passengers`
- new `maintenance_locations` table

## Known simplifications / things worth testing
- Rotation auto-pairing matches on route name via `return_route_id` — make
  sure each route's return route is set on the Routes page for this to
  work; otherwise every leg is treated as its own rotation (which was the
  old behavior, so nothing breaks — pairing just won't be automatic for
  that route).
- The bus-status "maintenance" auto-sync only reacts to maintenance
  ticket changes; manually setting a bus to "maintenance" from the Buses
  page without a ticket will get reset to "active" once any maintenance
  ticket for that bus is later resolved.
- I couldn't run `npm install` / `npm run dev` in this environment
  (network access is disabled here), so this has been verified by syntax
  checking every changed file, not by clicking through a running app —
  please test the flows above once you run it locally, especially the
  rotation pairing and the accounts Done/reopen workflow.
