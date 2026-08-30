# Lal Sabuj Paribahan — Operations Dashboard

A database-backed internal management system, separate from the public
ticket-selling website. Covers Live Activity, Accounts (organized by bus,
with a Done/close workflow), Rotation, Time Management, Staff Details,
Buses, Routes, Counters, Maintenance (with parts tracking), Reports, a
Chat Box, and Settings (appearance, language, favourite hotels, deduction
types).

## Stack

- **Backend:** Node.js + Express + SQLite (via `better-sqlite3`) + JWT auth
- **Frontend:** React + Vite, React Router
- SQLite was chosen so you can run this immediately with zero external
  database setup. It's a single file (`server/data/lsp.db`) — easy to swap
  for MySQL/Postgres later if the company scales up without changing the
  API routes much.

## Project layout

```
lal-sabuj-paribahan/
  server/     Express API + SQLite database
  client/     React admin dashboard
```

## 1. Backend setup

```bash
cd server
cp .env.example .env      # edit JWT_SECRET to a random string
npm install
npm run seed               # creates the Super Admin login + sample data
npm run dev                 # starts API on http://localhost:4000
```

Seeded login: **username `admin` / password `admin123`**, role Super Admin —
change this immediately via the "Users & Permissions" page (Admin/Super
Admin only) or directly in the DB. See "Roles & permissions" below for
what each role can do.

If you're upgrading an existing install rather than starting fresh, just
run `npm install && npm run dev` — the server adds any new database
columns/tables automatically on startup without touching your existing data.

## 2. Frontend setup

In a second terminal:

```bash
cd client
npm install
npm run dev                 # starts dashboard on http://localhost:5173
```

Open http://localhost:5173 and log in with the seeded admin account.
Vite is configured to proxy `/api` requests to the backend automatically.
A language toggle (English/বাংলা) is in the sidebar footer.

## Release identification

The current release is shown in the sidebar and under **Settings → System & Updates**. It combines the semantic version from `client/package.json` with the exact Git build ID. Every production change must also be recorded in `CHANGELOG.md`; see `AGENTS.md` for the release rules.

## Roles & permissions

| Role | Can do |
|---|---|
| **Super Admin** (1 account, seeded) | Everything. Cannot be edited, demoted, or deleted by anyone through the app. |
| **Admin** | Full read/write everywhere. Creates users, creates new custom roles, and sets which modules each role can view/edit from Users & Permissions. |
| **Control Counter** | Must be linked to a staff member. Starts a trip ("bus left counter" — assigns the day's rotation number, sets per-seat price and route). Can mark a trip completed. Can log a hotel break, fuel, or a note. Can manage the Routes list and the duty roster. |
| **Counter** (intermediate stop) | Must be linked to a staff member. Logging an arrival/departure automatically uses their own assigned counter's name — they can't type a different place. Can also log hotel break, fuel/notes, and mark a trip completed. |
| **Passenger Checker** | Logs passenger-count entries on a running trip. Nothing else. |
| **Accounts** | Full read/write on Accounts (income/expense, ticket pricing, the Done/close workflow, deciding whether a maintenance ticket counts as an expense). Changing an already-saved amount requires a note explaining why. |
| **Maintenance** | Logs repair tickets and parts for any bus, and can change a bus's active/maintenance/retired status. Cannot post a ticket's cost as an expense — that's Admin/Accounts. |
| **Monitor** | Read-only. Lands on a Reports page — no create/edit/delete anywhere, including chat. |
| **Custom roles** (Admin-created) | Start with no access; Admin grants view/edit per module (Buses, Staff, Rotation, Time Management, Accounts, Maintenance) from Users & Permissions. Live Activity's checkpoint rules stay fixed regardless. |

Every write endpoint enforces this server-side — the frontend just hides
buttons a role can't use; it isn't the actual security boundary.

**Login accounts and staff records are linked.** Control Counter and
Counter logins must be tied to an existing Staff Details entry when
created — this is who they're checking in as, and how their own counter's
name gets attached to their checkpoint entries automatically.

## Modules included

| Module | What it does |
|---|---|
| Dashboard | Fleet + staff + income/expense summary cards |
| Live Activity | Checkpoints per trip: left counter, hotel break, arrived/left a stop, fuel, passenger count. A Counter user's "place" is always their own assigned counter, filled in automatically. Control Counter sets the route (from the Routes list) and per-seat price when starting a trip |
| Accounts | Organized by bus, not by entry date — pick a bus to see its running total and record entries against it. Ticket-sales income = passengers × price-per-seat, minus an optional deduction (Online/VIP/...). Select which rotation(s) an entry covers, then **Mark Done** to close that rotation's accounting — a closed rotation can't be reused or edited without Admin. Maintenance tickets for the bus show up here so Accounts/Admin can choose whether to post their cost as an expense |
| Rotation | Duty roster — driver/helper per bus per date, using the shared Routes list. Optionally link a duty entry to a live trip and its shift-end time and status follow that trip automatically, so it doesn't stay stuck on "scheduled" |
| Time Management | Check-in/out are always the current server time, captured with a single click — never typed. Only Admin can correct a record afterward |
| Staff Details | Bus staff (driver, supervisor, bus staff, helper, conductor, mechanic) and counter staff (counter manager, assistant counter manager, caller man, office) — counter staff are assigned to a specific Counter. Status changes are timestamped automatically |
| Buses | Fleet register. Full edit is Admin only; status (active/maintenance/retired) can also be changed by the Maintenance role |
| Routes | The shared route list used when starting a trip or building the duty roster — managed by Admin and Control Counter |
| Counters | Physical counter/office locations and who's posted at each — managed by Admin |
| Maintenance | Repair tickets per bus with a location and a running list of parts, each with its own cost and changed-date. A "parts service history" report shows when each part was last changed, per bus. A summary shows how many tickets are resolved |
| Reports | Read-only: only buses that ran a rotation today appear; attendance status counts expand to show staff names; a bus-wise solo report shows full income/expense detail, net profit or loss, and a maintenance-cost-by-bus chart |
| Chat Box | Shared office channel with a one-tap "Call" button to a dedicated contact |
| Settings | Admin-only: accent colors, favourite-hotels list, trackable-parts catalog, income deduction types (Online/VIP/...), and the dedicated call contact |
| Users & Permissions | Admin-only: create logins (linked to staff where required), create custom roles, and set module-level view/edit access per role |

## API overview

All routes except `/api/auth/login` and `/api/health` require
`Authorization: Bearer <token>`.

- `POST /api/auth/login`, `GET /api/auth/me` (includes linked staff + counter name)
- `GET/POST/PUT/DELETE /api/auth/users` — Admin/Super Admin only; Control
  Counter/Counter creation requires `staff_id`
- `GET /api/roles` — built-in + custom roles; `POST/DELETE /api/roles` —
  create/delete a custom role (Admin only); `GET/PUT /api/roles/:role/permissions`
  — per-module view/edit grants (Admin only)
- `GET/POST/PUT/DELETE /api/buses` — write is Admin, or Maintenance for
  `PUT /api/buses/:id/status` only
- `GET/POST/PUT/DELETE /api/staff` — includes `counter_id`
- `GET/POST/PUT/DELETE /api/routes` — write is Admin/Control Counter
- `GET/POST/PUT/DELETE /api/counters` — write is Admin only
- `GET/POST/PUT/DELETE /api/rotations` — supports an optional `trip_id` link
- `GET /api/attendance`, `POST /api/attendance/checkin`, `PUT /api/attendance/:id/checkout`
- `GET/POST/PUT/DELETE /api/accounts` — supports `?bus_id=&trip_id=&from=&to=&type=`;
  `GET /api/accounts/by-bus` for the per-bus overview; `GET /api/accounts/summary?bus_id=`
  for totals. Ticket-sales sends `passengers_count` + `price_per_seat` (+ optional
  `deduction_type`/`deduction_amount`) instead of `amount`. Changing a saved
  amount as the Accounts role requires `edit_note`
- `GET /api/trips/live`, `POST /api/trips` (Control Counter, accepts
  `price_per_seat`), `PUT /api/trips/:id/complete`, `GET /api/trips/for-accounts?bus_id=`,
  `POST /api/trips/close-accounts { trip_ids }` (Accounts/Admin — the Done workflow),
  `POST /api/trips/:id/reopen-accounts` (Admin only)
- `GET/POST /api/activity-logs?trip_id=` — `hotel_break` added; a Counter
  user's `stop_arrival`/`stop_departure` location is server-filled from
  their own counter, ignoring anything submitted
- `GET/POST/DELETE /api/hotels`, `/api/discount-types` — Admin-managed lists
- `GET/POST/PUT/DELETE /api/maintenance`, `/parts`, `/parts-catalog`,
  `/parts-report`, `/summary` (total/resolved counts, per-bus cost);
  `POST/DELETE /api/maintenance/:id/post-expense` — the deliberate
  "count this as a bus expense" step (Admin/Accounts only)
- `GET/PUT /api/settings` — appearance, dedicated call contact (Admin only to write)
- `GET/POST /api/chat`

## Notes for the next stage

- **Custom role permissions are module-level**, not field-level — a role
  either can or can't write to Buses/Staff/Rotation/Time Management/Accounts/
  Maintenance as a whole. Live Activity's checkpoint rules (who can log what)
  stay fixed in code since they're tied to the physical workflow.
- **Language coverage**: the Bengali toggle currently translates navigation,
  page headers, and common buttons. Form field labels and table content are
  still English — extending `client/src/i18n.js` with more keys covers more
  of the UI over time.
- **Per-user bus assignment**: Accounts and Maintenance roles currently have
  access to every bus. Restricting a specific person to specific buses would
  need a small `user_bus_assignments` table.
- **Real calling**: the Chat Box "Call" button uses a `tel:` link, opening
  the device's own phone app — no in-browser VoIP.
- **Deployment**: for production, put the backend behind HTTPS, set a
  strong `JWT_SECRET`, and build the frontend with `npm run build` in
  `client/` then serve the `dist/` folder from any static host or from
  Express itself.
