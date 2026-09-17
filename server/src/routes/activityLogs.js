const express = require("express");
const db = require("../db");
const { requireAuth, requireRole, requireFeaturePermission, requireAnyFeaturePermission } = require("../middleware/auth");
const { ROLES, FULL_ACCESS, OWN_COUNTER_ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// Which roles may log which checkpoint event type. Admin / Super Admin can
// always log (and edit/delete) anything — everyone else gets exactly one
// kind of entry, matching their job:
//   - Counter / Control Counter: arriving/leaving a stop, and leaving the
//     counter (their own place only — never a typed-in place).
//   - Hotel: hotel breaks only.
//   - Pump Manager / Accounts: fuel details only.
//   - Passenger Checker: passenger counts only, nothing else.
const EVENT_ROLE_MAP = {
  left_counter: [ROLES.CONTROL_COUNTER],
  stop_arrival: [ROLES.COUNTER, ROLES.CONTROL_COUNTER],
  stop_departure: [ROLES.COUNTER, ROLES.CONTROL_COUNTER],
  hotel_break: [ROLES.HOTEL],
  fuel: [ROLES.PUMP_MANAGER, ROLES.ACCOUNTS],
  passenger_count: [ROLES.PASSENGER_CHECKER],
  exceptional_passenger_count: [ROLES.PASSENGER_CHECKER],
  additional_passenger_count: [ROLES.PASSENGER_CHECKER],
  note: [ROLES.CONTROL_COUNTER, ROLES.COUNTER],
};

function canLogEvent(role, eventType) {
  if (FULL_ACCESS.includes(role)) return true;
  const allowed = EVENT_ROLE_MAP[eventType];
  return Boolean(allowed && allowed.includes(role));
}

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  if (typeof value !== "string") return false;
  const parts = value.match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  return Boolean(parts && validDay(parts[1]));
}

function sqlTimestamp(value) {
  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function paidPassengerError(entry) {
  if (!["exceptional_passenger_count", "additional_passenger_count"].includes(entry.event_type)) return null;
  const label = entry.event_type === "additional_passenger_count" ? "Additional passenger" : "Exceptional passenger";
  if (!Number.isInteger(Number(entry.passengers_count)) || Number(entry.passengers_count) <= 0) return `${label} count must be a positive whole number`;
  if (entry.price_per_seat == null || entry.price_per_seat === "" || !Number.isFinite(Number(entry.price_per_seat)) || Number(entry.price_per_seat) < 0) return `Enter a valid ${label.toLowerCase()} seat price`;
  if (entry.event_type === "exceptional_passenger_count" && (typeof entry.note !== "string" || !entry.note.trim())) return "A description is required for exceptional passengers";
  return null;
}

function entryError(entry) {
  for (const field of ["passengers_count", "price_per_seat", "fuel_liters", "fuel_cost"]) {
    const value = entry[field];
    if (value == null) continue;
    if (value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || (field === "passengers_count" && !Number.isInteger(Number(value)))) return `Enter a valid non-negative ${field.replace(/_/g, " ")}`;
  }
  if (entry.recorded_at !== undefined && !validTimestamp(entry.recorded_at)) return "Choose a valid checkpoint date and time";
  return paidPassengerError(entry);
}

// Admin history includes completed journeys without reopening them, running
// auto-completion, changing attendance, or touching posted accounts. Bounded
// pages keep large date ranges usable without fetching the entire history.
router.get("/journeys", requireRole(...FULL_ACCESS), (req, res) => {
  const { from, to, bus_id } = req.query;
  if (!validDay(from) || !validDay(to) || from > to) return res.status(400).json({ error: "Choose a valid journey date range" });
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: "Choose a valid page" });
  if (bus_id && (!Number.isSafeInteger(Number(bus_id)) || Number(bus_id) < 1)) return res.status(400).json({ error: "Choose a valid bus" });
  const clauses = ["t.deleted_at IS NULL", "t.trip_date BETWEEN ? AND ?"];
  const params = [from, to];
  if (bus_id) { clauses.push("t.bus_id = ?"); params.push(Number(bus_id)); }
  const where = clauses.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) AS total FROM trips t WHERE ${where}`).get(...params).total;
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = db.prepare(`SELECT t.*, b.reg_number, b.source_bus_number,
      (SELECT event_type FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC, id DESC LIMIT 1) AS last_event,
      (SELECT location_name FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC, id DESC LIMIT 1) AS last_location,
      (SELECT recorded_at FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC, id DESC LIMIT 1) AS last_update
    FROM trips t JOIN buses b ON b.id = t.bus_id
    WHERE ${where} ORDER BY t.trip_date DESC, t.departure_time DESC, t.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (currentPage - 1) * pageSize);
  res.set("Cache-Control", "private, no-store");
  res.json({ rows, total, page: currentPage, page_count: pageCount, page_size: pageSize });
});

// GET /api/activity-logs?trip_id=5  -- open to any logged-in role
router.get("/", requireAnyFeaturePermission(["dashboard", "live_activity", "reports"], "read"), (req, res) => {
  const { trip_id, bus_id } = req.query;
  const clauses = [];
  const params = [];
  if (trip_id) { clauses.push("trip_id = ?"); params.push(trip_id); }
  if (bus_id) { clauses.push("bus_id = ?"); params.push(bus_id); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM activity_logs ${where} ORDER BY recorded_at DESC ${trip_id ? "" : "LIMIT 300"}`)
    .all(...params);
  res.json(rows);
});

// GET /api/activity-logs/places -> the "place" picker for Admin/Super
// Admin: known stop locations plus every counter name, so they can name
// any arbitrary place when logging on someone's behalf — everyone else
// never sees this list, since their place is fixed to their own counter.
router.get("/places", requireAnyFeaturePermission(["live_activity", "settings"], "read"), (req, res) => {
  const stops = db.prepare("SELECT name FROM stop_locations ORDER BY name ASC").all().map((r) => r.name);
  const counters = db.prepare("SELECT name FROM counters ORDER BY name ASC").all().map((r) => r.name);
  res.json({ places: Array.from(new Set([...stops, ...counters])) });
});

router.post("/places", requireAnyFeaturePermission(["live_activity", "settings"], "write"), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    db.prepare("INSERT INTO stop_locations (name) VALUES (?)").run(name.trim());
  } catch (err) {
    // already exists — fine, treat as idempotent
  }
  res.status(201).json({ ok: true });
});

// For stop_arrival/stop_departure, a Counter/Control Counter user's
// location is always their own assigned counter — never freely typed.
// Only Admin/Super Admin can name an arbitrary place (with "Other" as a
// free-text fallback for an exception not on the list).
function resolveLocationName(req, event_type, submittedLocation) {
  const isOwnPlaceEvent = event_type === "stop_arrival" || event_type === "stop_departure" || event_type === "left_counter";
  if (isOwnPlaceEvent && OWN_COUNTER_ROLES.includes(req.user.role)) {
    if (!req.user.staff_id) return null;
    const staff = db
      .prepare(`SELECT c.name as counter_name FROM staff s LEFT JOIN counters c ON c.id = s.counter_id WHERE s.id = ?`)
      .get(req.user.staff_id);
    return staff?.counter_name || null;
  }
  return submittedLocation || null;
}

// event_type: left_counter | stop_arrival | stop_departure | hotel_break | fuel | passenger_count | note
// recorded_at: Admin/Super Admin may set an explicit time when creating an
// entry (e.g. logging something after the fact on someone's behalf) —
// everyone else is always stamped with the current server time.
router.post("/", requireFeaturePermission("live_activity", "write"), (req, res) => {
  const { trip_id, bus_id, event_type, passengers_count, fuel_liters, fuel_cost, note, recorded_at } = req.body;
  if (!trip_id || !bus_id || !event_type) {
    return res.status(400).json({ error: "trip_id, bus_id, event_type required" });
  }
  if (!canLogEvent(req.user.role, event_type)) {
    return res.status(403).json({ error: `Your role cannot log a '${event_type}' entry` });
  }
  if (typeof event_type !== "string" || !Object.hasOwn(EVENT_ROLE_MAP, event_type)) return res.status(400).json({ error: "Unknown entry type" });
  const trip = db.prepare("SELECT bus_id FROM trips WHERE id = ?").get(trip_id);
  if (!trip || Number(trip.bus_id) !== Number(bus_id)) return res.status(400).json({ error: "Choose a valid trip for this bus" });
  const validationError = entryError(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const location_name = resolveLocationName(req, event_type, req.body.location_name);
  const isFullAccess = FULL_ACCESS.includes(req.user.role);
  const columns = ["trip_id", "bus_id", "event_type", "location_name", "passengers_count", "fuel_liters", "fuel_cost", "note", "recorded_by"];
  const values = [trip_id, bus_id, event_type, location_name, passengers_count ?? null, fuel_liters ?? null, fuel_cost ?? null, note || null, req.user.id];
  if (["exceptional_passenger_count", "additional_passenger_count"].includes(event_type)) {
    columns.push("price_per_seat");
    values.push(Number(req.body.price_per_seat));
  }
  if (isFullAccess && recorded_at) {
    columns.push("recorded_at");
    values.push(sqlTimestamp(recorded_at));
  }
  const info = db
    .prepare(`INSERT INTO activity_logs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...values);
  res.status(201).json(db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(info.lastInsertRowid));
});

// Admin/Super Admin can edit any part of any checkpoint entry after the
// fact — including giving/correcting its time.
router.put("/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const existing = db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const eventType = req.body.event_type === undefined ? existing.event_type : req.body.event_type;
  if (typeof eventType !== "string" || !Object.hasOwn(EVENT_ROLE_MAP, eventType)) return res.status(400).json({ error: "Unknown entry type" });
  const changes = { ...req.body };
  if (eventType !== existing.event_type) {
    // Remove fields belonging to the old event so changing a fuel/passenger
    // record into a note cannot leave ghost amounts in journey summaries.
    if (!["passenger_count", "exceptional_passenger_count", "additional_passenger_count"].includes(eventType)) changes.passengers_count = null;
    if (!["exceptional_passenger_count", "additional_passenger_count"].includes(eventType)) changes.price_per_seat = null;
    if (eventType !== "fuel") { changes.fuel_liters = null; changes.fuel_cost = null; }
    const required = eventType === "passenger_count" ? ["passengers_count"] : eventType === "fuel" ? ["fuel_liters", "fuel_cost"] : [];
    if (required.some((field) => changes[field] == null || changes[field] === "")) return res.status(400).json({ error: "Enter the quantities for the new entry type" });
  }
  const validationError = entryError({ ...existing, ...changes, recorded_at: changes.recorded_at, event_type: eventType });
  if (validationError) return res.status(400).json({ error: validationError });
  if (changes.recorded_at !== undefined) changes.recorded_at = sqlTimestamp(changes.recorded_at);
  const fields = ["event_type", "location_name", "passengers_count", "price_per_seat", "fuel_liters", "fuel_cost", "note", "recorded_at"];
  const present = fields.filter((f) => changes[f] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  const setClause = present.map((f) => `${f} = ?`).join(", ");
  const values = present.map((f) => changes[f]);
  const info = db.prepare(`UPDATE activity_logs SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const info = db.prepare("DELETE FROM activity_logs WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
