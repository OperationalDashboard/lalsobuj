// Central database connection + schema definition.
// Uses better-sqlite3 for a zero-config, file-based database that's easy to
// run locally and easy to later swap for MySQL/Postgres if the company grows.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "lsp.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema — one table per module. Kept intentionally simple so each module
// can be extended later without breaking the others.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS counters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  location   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff', -- super_admin | admin | ...assignable/custom roles
  staff_id      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number    TEXT UNIQUE NOT NULL,
  model         TEXT,
  capacity      INTEGER,
  route         TEXT,
  status        TEXT NOT NULL DEFAULT 'active', -- active | maintenance | retired
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- designation covers both bus-side staff (driver, supervisor, bus_staff,
-- helper, conductor, mechanic) and counter-side staff (counter_manager,
-- assistant_counter_manager, caller_man, office). counter_id applies to
-- counter-side staff — which physical counter they're posted at.
CREATE TABLE IF NOT EXISTS staff (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  designation     TEXT NOT NULL,
  phone           TEXT,
  nid_number      TEXT,
  joining_date    TEXT,
  assigned_bus_id INTEGER REFERENCES buses(id) ON DELETE SET NULL,
  counter_id      INTEGER REFERENCES counters(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | on_leave | terminated
  status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The full point-to-point time a route is expected to take, in minutes.
-- When set, a running trip on this route is auto-marked completed once
-- departure_time + full_trip_minutes has passed (see the sweep in
-- trips.js) — Admin/Super Admin can always override manually before then.
CREATE TABLE IF NOT EXISTS routes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT UNIQUE NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 1,
  return_route_id  INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  full_trip_minutes INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rotation / duty roster: which driver+helper run which bus on which shift.
-- Optionally linked to a live Trip — when linked, shift_end and status are
-- kept in sync automatically from that trip (see trips.js /complete).
CREATE TABLE IF NOT EXISTS rotations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id        INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  helper_id     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  supervisor_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  route       TEXT,
  duty_date   TEXT NOT NULL,
  shift_start TEXT,
  shift_end   TEXT,
  status      TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | running | completed | cancelled
  trip_id     INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Time management: daily attendance. check_in / check_out are always
-- server-timestamped at the moment of the action (see /api/attendance/checkin
-- and /checkout) — never freely typed; only Admin/Super Admin can correct
-- a recorded TIME afterward, and only Admin/Super Admin can change STATUS.
-- A staff member can check in up to 3 times in one day (multiple separate
-- rows), e.g. covering a split shift or standing in for someone twice.
-- representing_staff_id: when someone works IN PLACE of an absent
-- colleague, this row is filed under the person who actually showed up,
-- but points at whose duty they covered — daily salary is then paid to
-- the person named here (the absent staff member's own rate), not to
-- staff_id. NULL means "worked their own shift" as normal.
CREATE TABLE IF NOT EXISTS attendance (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date  TEXT NOT NULL,
  check_in   TEXT,
  check_out  TEXT,
  status     TEXT NOT NULL DEFAULT 'present', -- present | absent | late | leave
  representing_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-managed list of income deduction types (Online, VIP, ...) that
-- subtract from a ticket-sales entry's income.
CREATE TABLE IF NOT EXISTS discount_types (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dedicated operating-expense sector for each physical place/counter.
-- A single entry belongs to exactly one place; reporting still totals these
-- entries with all other company expenses.
CREATE TABLE IF NOT EXISTS expense_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS expense_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts: every income/expense entry, optionally tied to a specific bus
-- and a specific Trip (rotation) — "buswise accounts" groups by bus_id,
-- and the Done workflow closes out a trip's accounting via trips.accounts_status.
-- For ticket_sales income, amount = (passengers_count * price_per_seat) -
-- deduction_amount, computed server-side. Editing an already-saved amount
-- as the Accounts role requires edit_note explaining why.
CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id           INTEGER REFERENCES buses(id) ON DELETE SET NULL,
  trip_id          INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  type             TEXT NOT NULL, -- income | expense
  category         TEXT NOT NULL, -- ticket_sales | fuel | salary | repair | toll | other
  amount           REAL NOT NULL,
  passengers_count INTEGER,
  price_per_seat   REAL,
  deduction_type   TEXT,
  deduction_amount REAL,
  deducted_passengers INTEGER, -- deduction_amount = deducted_passengers * price_per_seat, computed server-side
  description      TEXT,
  txn_date         TEXT NOT NULL,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_maintenance_id INTEGER REFERENCES maintenance(id) ON DELETE SET NULL,
  edit_note        TEXT,
  last_edited_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_edited_at   TEXT,
  place_name       TEXT,
  attachment_name  TEXT,
  attachment_data  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A maintenance ticket for a bus. Total cost is the sum of its parts
-- (see maintenance_parts). Whether it counts as a bus expense is a
-- deliberate choice by Accounts/Admin (see /:id/post-expense), not
-- automatic — linked_transaction_id is only set once that's done.
CREATE TABLE IF NOT EXISTS maintenance (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id         INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  issue          TEXT NOT NULL,
  location       TEXT, -- e.g. "Dhaka", "Chattogram" -- where the work is being done
  reported_date  TEXT NOT NULL,
  resolved_date  TEXT,
  status         TEXT NOT NULL DEFAULT 'open', -- open | in_progress | resolved
  notes          TEXT,
  linked_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual parts replaced/serviced within a maintenance ticket. Each
-- carries its own changed_date so "when was the air filter last changed"
-- reports are possible per bus per part.
CREATE TABLE IF NOT EXISTS maintenance_parts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  maintenance_id INTEGER NOT NULL REFERENCES maintenance(id) ON DELETE CASCADE,
  part_name      TEXT NOT NULL,
  cost           REAL NOT NULL DEFAULT 0,
  changed_date   TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-managed master list of trackable part names (Wheel, Engine Oil,
-- Air Filter, Oil Filter, Brake Pads, ...) so entries stay consistent.
CREATE TABLE IF NOT EXISTS parts_catalog (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  part_name  TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-managed list of favourite/preferred hotels for the "Hotel Break"
-- checkpoint in Live Activity.
CREATE TABLE IF NOT EXISTS hotels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin/Maintenance managed list of places where repair work happens
-- (replaces the old hardcoded location list on the Maintenance page).
CREATE TABLE IF NOT EXISTS maintenance_locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-managed list of named stops/places for the "Arrive at stop" /
-- "Leave stop" checkpoint, offered as a dropdown to Admin/Super Admin
-- (who may also type a free-text "Other" place for an exception).
-- Counter/Control Counter never see this list — their place is always
-- their own assigned counter, resolved server-side.
CREATE TABLE IF NOT EXISTS stop_locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per staff member's pay setup. type='monthly' pays the fixed
-- amount every payroll run regardless of attendance. type='daily' pays
-- amount for each day they (or whoever they represented) actually
-- checked in. type='none' means this person isn't on payroll here at all
-- (a placeholder so "no salary" is a deliberate, visible choice, not a
-- missing row). Only Admin/Super Admin manage this.
CREATE TABLE IF NOT EXISTS salary_assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id    INTEGER UNIQUE NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  salary_type TEXT NOT NULL DEFAULT 'none', -- monthly | daily | none
  amount      REAL, -- monthly: fixed amount per month. daily: amount per day worked.
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Live Activity / Rotation tracking: a "trip" is one LEG of a bus's run —
-- created when it leaves the counter, closed when it returns/arrives.
-- A "rotation" is a pair of legs (outbound + its return) that together
-- make one round trip — e.g. Dhaka-Cumilla-Noakhali out, then
-- Noakhali-Cumilla-Dhaka back. rotation_no is that bus's ROTATION count
-- for the day (1st, 2nd... round trip) — both legs of a rotation share
-- the same rotation_no and the same group_id (the first leg's own id).
-- leg_no is 1 for the outbound leg, 2 for the return leg. Pairing is done
-- automatically from the route's return_route_id when the second leg is
-- started, but can be corrected by Accounts/Admin/Super Admin (see
-- PUT /:id/pair) if the bus took an unexpected route back.
-- price_per_seat is set by Control Counter when each leg starts, and is
-- what Accounts uses to compute ticket_sales income for that leg — the two
-- legs of a rotation can have different prices, but share one expense.
-- accounts_status tracks the Done workflow: once 'done', no new
-- transactions can reference this trip and existing ones lock, except
-- for Admin/Super Admin. Closing one leg of a rotation closes both.
-- deleted_at: Admin/Super Admin can remove a rotation from Rotation and
-- Accounts entirely — this soft-deletes BOTH legs (same group_id) rather
-- than hard-deleting, so the whole rotation (and its transactions) moves
-- to a Trash that only Admin/Super Admin can see/restore/pull reports
-- from. Every other query in the app filters deleted_at IS NULL.
CREATE TABLE IF NOT EXISTS trips (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id          INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  route           TEXT,
  trip_date       TEXT NOT NULL,
  rotation_no     INTEGER NOT NULL DEFAULT 1,
  group_id        INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  leg_no          INTEGER NOT NULL DEFAULT 1,
  departure_time  TEXT,
  arrival_time    TEXT,
  price_per_seat  REAL,
  status          TEXT NOT NULL DEFAULT 'running', -- running | completed
  accounts_status TEXT NOT NULL DEFAULT 'open', -- open | done
  accounts_closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accounts_closed_at TEXT,
  deleted_at      TEXT,
  deleted_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Checkpoint entries logged by staff during a trip: leaving the counter,
-- arriving/leaving a stop, a hotel break, fuel taken, passenger count, note.
CREATE TABLE IF NOT EXISTS activity_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id          INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  bus_id           INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL, -- left_counter | stop_arrival | stop_departure | hotel_break | fuel | passenger_count | note
  location_name    TEXT,          -- e.g. "Hotel Rajdhani", "Padma Pump", or a Counter user's own counter name
  passengers_count INTEGER,
  fuel_liters      REAL,
  fuel_cost        REAL,
  note             TEXT,
  recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple global key/value settings: appearance colors, dedicated call
-- contact for the chat box, etc. Only Admin/Super Admin can write.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-created custom roles, beyond the fixed set in server/src/roles.js.
-- A custom role's actual access is entirely driven by role_permissions.
CREATE TABLE IF NOT EXISTS custom_roles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT UNIQUE NOT NULL,
  label      TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Module-level read/write grants, editable by Admin for both custom roles
-- and the built-in assignable roles. super_admin/admin always have full
-- access regardless of what's here. This governs Buses, Staff, Rotation,
-- Attendance, Accounts, Maintenance — Live Activity's per-checkpoint rules
-- for Control Counter/Counter/Passenger Checker stay fixed in code, since
-- they're tied to the physical checkpoint workflow rather than plain CRUD.
CREATE TABLE IF NOT EXISTS role_permissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role       TEXT NOT NULL,
  module     TEXT NOT NULL, -- buses | staff | rotations | attendance | accounts | maintenance
  can_read   INTEGER NOT NULL DEFAULT 1,
  can_write  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(role, module)
);

CREATE INDEX IF NOT EXISTS idx_rotations_date ON rotations(duty_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_bus ON transactions(bus_id);
CREATE INDEX IF NOT EXISTS idx_transactions_trip ON transactions(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(trip_date, bus_id);
CREATE INDEX IF NOT EXISTS idx_activity_trip ON activity_logs(trip_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_parts ON maintenance_parts(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_bus ON maintenance(bus_id);
`);

// ---------------------------------------------------------------------------
// Lightweight migration helper: adds a column to a table that already
// existed from an earlier version of this project, without touching data.
// Safe to run every time the server starts.
// ---------------------------------------------------------------------------
function addColumnIfMissing(table, columnName, columnDef) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasColumn = existing.some((c) => c.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

addColumnIfMissing("staff", "status_changed_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
addColumnIfMissing("staff", "counter_id", "INTEGER REFERENCES counters(id) ON DELETE SET NULL");
addColumnIfMissing("users", "staff_id", "INTEGER REFERENCES staff(id) ON DELETE SET NULL");
addColumnIfMissing("transactions", "passengers_count", "INTEGER");
addColumnIfMissing("transactions", "price_per_seat", "REAL");
addColumnIfMissing("transactions", "linked_maintenance_id", "INTEGER REFERENCES maintenance(id) ON DELETE SET NULL");
addColumnIfMissing("transactions", "trip_id", "INTEGER REFERENCES trips(id) ON DELETE SET NULL");
addColumnIfMissing("transactions", "deduction_type", "TEXT");
addColumnIfMissing("transactions", "deduction_amount", "REAL");
addColumnIfMissing("transactions", "edit_note", "TEXT");
addColumnIfMissing("transactions", "last_edited_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
addColumnIfMissing("transactions", "last_edited_at", "TEXT");
addColumnIfMissing("maintenance", "location", "TEXT");
addColumnIfMissing("maintenance", "linked_transaction_id", "INTEGER REFERENCES transactions(id) ON DELETE SET NULL");
addColumnIfMissing("trips", "price_per_seat", "REAL");
addColumnIfMissing("trips", "accounts_status", "TEXT NOT NULL DEFAULT 'open'");
addColumnIfMissing("trips", "accounts_closed_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
addColumnIfMissing("trips", "accounts_closed_at", "TEXT");
addColumnIfMissing("rotations", "trip_id", "INTEGER REFERENCES trips(id) ON DELETE SET NULL");
addColumnIfMissing("rotations", "supervisor_id", "INTEGER REFERENCES staff(id) ON DELETE SET NULL");
addColumnIfMissing("routes", "return_route_id", "INTEGER REFERENCES routes(id) ON DELETE SET NULL");
addColumnIfMissing("trips", "group_id", "INTEGER REFERENCES trips(id) ON DELETE SET NULL");
addColumnIfMissing("trips", "leg_no", "INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("transactions", "deducted_passengers", "INTEGER");
addColumnIfMissing("routes", "full_trip_minutes", "INTEGER");
addColumnIfMissing("trips", "deleted_at", "TEXT");
addColumnIfMissing("trips", "deleted_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
addColumnIfMissing("attendance", "representing_staff_id", "INTEGER REFERENCES staff(id) ON DELETE SET NULL");
addColumnIfMissing("transactions", "leg_scope", "TEXT"); // outbound | return | both — informational label for fuel/expense entries
addColumnIfMissing("transactions", "place_name", "TEXT");
addColumnIfMissing("transactions", "attachment_name", "TEXT");
addColumnIfMissing("transactions", "attachment_data", "TEXT");
addColumnIfMissing("transactions", "counter_id", "INTEGER REFERENCES counters(id) ON DELETE SET NULL");
addColumnIfMissing("counters", "place_id", "INTEGER REFERENCES expense_places(id) ON DELETE SET NULL");
addColumnIfMissing("parts_catalog", "description", "TEXT");

// Earlier automatic counter-salary postings used the first day of the
// month, which could hide them from a selected daily report. Treat those
// legacy rows as posted today, matching the current automatic behavior.
db.prepare("UPDATE transactions SET txn_date = date('now') WHERE category = 'place_expense' AND description LIKE 'Automatic Counter Staff Salary — %' AND txn_date LIKE '%-01'").run();

// Backfill: any pre-existing trip without a group_id belongs to its own
// (single-leg) rotation group.
db.exec(`UPDATE trips SET group_id = id WHERE group_id IS NULL`);

module.exports = db;
