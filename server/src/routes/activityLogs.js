const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
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
  note: [ROLES.CONTROL_COUNTER, ROLES.COUNTER],
};

function canLogEvent(role, eventType) {
  if (FULL_ACCESS.includes(role)) return true;
  const allowed = EVENT_ROLE_MAP[eventType];
  return Boolean(allowed && allowed.includes(role));
}

// GET /api/activity-logs?trip_id=5  -- open to any logged-in role
router.get("/", (req, res) => {
  const { trip_id, bus_id } = req.query;
  const clauses = [];
  const params = [];
  if (trip_id) { clauses.push("trip_id = ?"); params.push(trip_id); }
  if (bus_id) { clauses.push("bus_id = ?"); params.push(bus_id); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM activity_logs ${where} ORDER BY recorded_at DESC LIMIT 300`)
    .all(...params);
  res.json(rows);
});

// GET /api/activity-logs/places -> the "place" picker for Admin/Super
// Admin: known stop locations plus every counter name, so they can name
// any arbitrary place when logging on someone's behalf — everyone else
// never sees this list, since their place is fixed to their own counter.
router.get("/places", requireRole(...FULL_ACCESS), (req, res) => {
  const stops = db.prepare("SELECT name FROM stop_locations ORDER BY name ASC").all().map((r) => r.name);
  const counters = db.prepare("SELECT name FROM counters ORDER BY name ASC").all().map((r) => r.name);
  res.json({ places: Array.from(new Set([...stops, ...counters])) });
});

router.post("/places", requireRole(...FULL_ACCESS), (req, res) => {
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
router.post("/", (req, res) => {
  const { trip_id, bus_id, event_type, passengers_count, fuel_liters, fuel_cost, note, recorded_at } = req.body;
  if (!trip_id || !bus_id || !event_type) {
    return res.status(400).json({ error: "trip_id, bus_id, event_type required" });
  }
  if (!canLogEvent(req.user.role, event_type)) {
    return res.status(403).json({ error: `Your role cannot log a '${event_type}' entry` });
  }
  const location_name = resolveLocationName(req, event_type, req.body.location_name);
  const isFullAccess = FULL_ACCESS.includes(req.user.role);
  const columns = ["trip_id", "bus_id", "event_type", "location_name", "passengers_count", "fuel_liters", "fuel_cost", "note", "recorded_by"];
  const values = [trip_id, bus_id, event_type, location_name, passengers_count ?? null, fuel_liters ?? null, fuel_cost ?? null, note || null, req.user.id];
  if (isFullAccess && recorded_at) {
    columns.push("recorded_at");
    values.push(recorded_at);
  }
  const info = db
    .prepare(`INSERT INTO activity_logs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...values);
  res.status(201).json(db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(info.lastInsertRowid));
});

// Admin/Super Admin can edit any part of any checkpoint entry after the
// fact — including giving/correcting its time.
router.put("/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const fields = ["location_name", "passengers_count", "fuel_liters", "fuel_cost", "note", "recorded_at"];
  const present = fields.filter((f) => req.body[f] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  const setClause = present.map((f) => `${f} = ?`).join(", ");
  const values = present.map((f) => req.body[f]);
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
