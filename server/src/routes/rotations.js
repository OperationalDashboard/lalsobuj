const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireFeaturePermission("rotations", "write");

// Coach is deliberately a free-text rotation detail, not a Staff record.
// coach_id remains readable for older rotations created before this change.
const WRITABLE = ["bus_id", "driver_id", "helper_id", "supervisor_id", "coach_name", "route", "duty_date", "shift_start", "shift_end", "status", "trip_id"];

// Keep the Rotation rules in sync with the Buses and Maintenance pages.
// The stored buses.status value is not enough on its own because any
// unresolved maintenance ticket must take the bus off the road immediately.
const BUS_STATUS_SELECT = `
  CASE
    WHEN b.status IN ('retired', 'unavailable') THEN b.status
    WHEN EXISTS (SELECT 1 FROM maintenance m WHERE m.bus_id = b.id AND m.status != 'resolved') THEN 'maintenance'
    ELSE 'active'
  END`;

function requireActiveBus(busId, res) {
  if (!busId) {
    res.status(400).json({ error: "Bus is required" });
    return false;
  }
  const bus = db
    .prepare(`SELECT b.id, b.reg_number, ${BUS_STATUS_SELECT} AS status FROM buses b WHERE b.id = ?`)
    .get(busId);
  if (!bus) {
    res.status(404).json({ error: "Bus not found" });
    return false;
  }
  if (bus.status === "maintenance") {
    res.status(400).json({ error: `${bus.reg_number} is under maintenance and cannot be added to Rotation` });
    return false;
  }
  if (bus.status === "retired") {
    res.status(400).json({ error: `${bus.reg_number} is retired and cannot be added to Rotation` });
    return false;
  }
  if (bus.status === "unavailable") {
    res.status(400).json({ error: `${bus.reg_number} is unavailable and cannot be added to Rotation` });
    return false;
  }
  return true;
}

function requireActiveRoute(req, res) {
  const routeName = String(req.body.route || "").trim();
  if (!routeName) {
    res.status(400).json({ error: "Route selection is required" });
    return false;
  }
  const route = db.prepare("SELECT name FROM routes WHERE lower(name) = lower(?) AND is_active = 1").get(routeName);
  if (!route) {
    res.status(400).json({ error: "Choose an active route from the route list" });
    return false;
  }
  req.body.route = route.name;
  return true;
}

// Duty roster, with the linked Trip's live status/times folded in when
// present — that's what keeps this page from getting stuck on "scheduled"
// after the bus has actually completed its run. A row with a trip_id was
// created automatically the moment that trip's bus left the counter (see
// POST /api/trips) — Rotation no longer needs a duplicate manual entry for
// a rotation that's already on the road; Accounts does its accounting
// against that same rotation. Rows whose linked trip has been moved to
// Trash (see /api/trips/trash) are excluded — removing a rotation removes
// it everywhere, not just here.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, b.reg_number, ${BUS_STATUS_SELECT} AS bus_status,
              t.rotation_no as trip_rotation_no, t.status as trip_status,
              t.departure_time as trip_departure_time, t.arrival_time as trip_arrival_time
       FROM rotations r
       LEFT JOIN trips t ON t.id = r.trip_id
       LEFT JOIN buses b ON b.id = r.bus_id
       WHERE r.trip_id IS NULL OR t.deleted_at IS NULL
       ORDER BY r.duty_date DESC, r.id DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      ...r,
      // Effective status: if linked to a trip, mirror the trip; otherwise
      // fall back to whatever was set manually.
      status: r.trip_id ? (r.trip_status === "completed" ? "completed" : "running") : r.status,
      shift_end: r.trip_id && r.trip_arrival_time ? r.trip_arrival_time : r.shift_end,
      rotation_no: r.trip_id ? r.trip_rotation_no : null,
    }))
  );
});

router.post("/", guardWrite, (req, res) => {
  if (!requireActiveBus(req.body.bus_id, res)) return;
  if (!requireActiveRoute(req, res)) return;
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });
  const placeholders = present.map(() => "?").join(",");
  const values = present.map((c) => req.body[c]);
  const info = db.prepare(`INSERT INTO rotations (${present.join(",")}) VALUES (${placeholders})`).run(...values);
  res.status(201).json(db.prepare("SELECT * FROM rotations WHERE id = ?").get(info.lastInsertRowid));
});

router.put("/:id", guardWrite, (req, res) => {
  if (req.body.bus_id !== undefined && !requireActiveBus(req.body.bus_id, res)) return;
  if (req.body.route !== undefined && !requireActiveRoute(req, res)) return;
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });
  const setClause = present.map((c) => `${c} = ?`).join(", ");
  const values = present.map((c) => req.body[c]);
  const info = db.prepare(`UPDATE rotations SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM rotations WHERE id = ?").get(req.params.id));
});

// Removing a rotation that's linked to a real trip is Admin/Super Admin
// only, because it takes the whole rotation — both legs, and everything
// Accounts recorded against it — out of Accounts AND Reports at once,
// moving it to Trash instead of just unlisting it here. A plain scheduled
// entry with no linked trip can still be removed by anyone with rotation
// write access, same as before.
router.delete("/:id", guardWrite, (req, res) => {
  const row = db.prepare("SELECT * FROM rotations WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  if (row.trip_id) {
    db.prepare(
      "UPDATE trips SET deleted_at = datetime('now'), deleted_by = ? WHERE group_id = (SELECT group_id FROM trips WHERE id = ?)"
    ).run(req.user.id, row.trip_id);
  }

  db.prepare("DELETE FROM rotations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
