const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission, requireAnyFeaturePermission } = require("../middleware/auth");
const { ROLES, FULL_ACCESS, OWN_BUS_ROLES } = require("../roles");
const { autoCheckIn, autoCheckOut } = require("../autoAttendance");

const router = express.Router();
router.use(requireAuth);

// A running trip whose route has a full_trip_minutes set is auto-completed
// once departure_time + full_trip_minutes has passed — Admin/Super Admin
// can still complete or edit it manually before then. This runs as a
// periodic sweep (see bottom of file) and also inline whenever /live is
// read, so it's never more than a few seconds stale either way.
function autoCompleteOverdueTrips() {
  const overdue = db
    .prepare(
      `SELECT t.id, t.departure_time, t.trip_date, r.full_trip_minutes
       FROM trips t
       JOIN routes r ON r.name = t.route
       WHERE t.status = 'running' AND t.deleted_at IS NULL
         AND r.full_trip_minutes IS NOT NULL AND t.departure_time IS NOT NULL`
    )
    .all();
  const now = new Date();
  for (const trip of overdue) {
    const departed = new Date(`${trip.trip_date}T${trip.departure_time}:00`);
    const dueBy = new Date(departed.getTime() + trip.full_trip_minutes * 60000);
    if (now >= dueBy) {
      const arrival = dueBy.toTimeString().slice(0, 5);
      db.prepare("UPDATE trips SET status = 'completed', arrival_time = ? WHERE id = ?").run(arrival, trip.id);
      const linkedRotation = db.prepare("SELECT * FROM rotations WHERE trip_id = ?").get(trip.id);
      db.prepare("UPDATE rotations SET shift_end = ?, status = 'completed' WHERE trip_id = ?").run(arrival, trip.id);
      if (linkedRotation) {
        autoCheckOut([linkedRotation.driver_id, linkedRotation.helper_id, linkedRotation.supervisor_id, linkedRotation.coach_id], trip.trip_date, arrival);
      }
    }
  }
}
// Sweep every minute so a trip flips to completed close to on-time even if
// nobody happens to load a page right when it's due.
setInterval(autoCompleteOverdueTrips, 60 * 1000).unref();

// GET /api/trips?date=2026-08-26&bus_id=&status=  -- open to any logged-in role
router.get("/", requireAnyFeaturePermission(["live_activity", "rotations", "accounts_bus", "reports", "trash"], "read"), (req, res) => {
  const { date, bus_id, status } = req.query;
  const clauses = ["t.deleted_at IS NULL"];
  const params = [];
  if (date) { clauses.push("t.trip_date = ?"); params.push(date); }
  if (bus_id) { clauses.push("t.bus_id = ?"); params.push(bus_id); }
  if (status) { clauses.push("t.status = ?"); params.push(status); }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = db
    .prepare(`SELECT t.* FROM trips t ${where} ORDER BY t.trip_date DESC, t.rotation_no DESC, t.id DESC`)
    .all(...params);
  res.json(rows);
});

// GET /api/trips/live -> currently running trips, each with its latest activity log
router.get("/live", requireAnyFeaturePermission(["dashboard", "live_activity"], "read"), (req, res) => {
  autoCompleteOverdueTrips();
  const rows = db
    .prepare(
      `SELECT t.*, b.reg_number, b.source_bus_number,
              (SELECT r.id FROM rotations r WHERE r.trip_id = t.id LIMIT 1) AS rotation_id,
              (SELECT event_type FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC LIMIT 1) as last_event,
              (SELECT location_name FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC LIMIT 1) as last_location,
              (SELECT recorded_at FROM activity_logs WHERE trip_id = t.id ORDER BY recorded_at DESC LIMIT 1) as last_update
       FROM trips t JOIN buses b ON b.id = t.bus_id
       WHERE t.status = 'running' AND t.deleted_at IS NULL
       ORDER BY t.departure_time DESC`
    )
    .all();
  res.json(rows);
});

// GET /api/trips/rotation-counts?date=2026-08-26 -> how many ROTATIONS
// (round trips, i.e. distinct group_id — not individual legs) each bus has
// done on that date.
router.get("/rotation-counts", requireAnyFeaturePermission(["dashboard", "live_activity", "rotations", "reports"], "read"), (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT b.id as bus_id, b.reg_number, b.source_bus_number,
              COUNT(DISTINCT t.group_id) as rotations,
              SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END) as running_now
       FROM buses b
       LEFT JOIN trips t ON t.bus_id = b.id AND t.trip_date = ? AND t.deleted_at IS NULL
       GROUP BY b.id
       ORDER BY b.reg_number ASC`
    )
    .all(date);
  res.json({ date, buses: rows });
});

// GET /api/trips/rotations?date=2026-08-26  or  ?from=2026-08-01&to=2026-08-26
// -> one row per ROTATION (both legs merged), with each leg's own income
// from Accounts (broken out by category so Reports can show passenger
// counts and a fuel/expense breakdown) and one shared expense total — used
// by Reports ("buses that ran a rotation") and the Rotation/Accounts pages.
// Falls back to today when no date/range is given. Deleted (trashed)
// rotations never appear here.
router.get("/rotations", requireAnyFeaturePermission(["rotations", "accounts_bus", "reports"], "read"), (req, res) => {
  const { bus_id } = req.query;
  const from = req.query.from || req.query.date || new Date().toISOString().slice(0, 10);
  const to = req.query.to || req.query.date || from;

  const clauses = ["t.deleted_at IS NULL", "t.trip_date BETWEEN ? AND ?"];
  const params = [from, to];
  if (bus_id) { clauses.push("t.bus_id = ?"); params.push(bus_id); }

  const legs = db
    .prepare(
      `SELECT t.*, b.reg_number, b.source_bus_number,
              duty.driver_id, driver.name AS driver_name,
              duty.helper_id, helper.name AS helper_name,
              duty.supervisor_id, supervisor.name AS supervisor_name,
              duty.coach_id,
              COALESCE(NULLIF(duty.coach_name, ''), coach.name) AS coach_name
       FROM trips t JOIN buses b ON b.id = t.bus_id
       LEFT JOIN rotations duty ON duty.id = (SELECT MIN(r.id) FROM rotations r WHERE r.trip_id = t.id)
       LEFT JOIN staff driver ON driver.id = duty.driver_id
       LEFT JOIN staff helper ON helper.id = duty.helper_id
       LEFT JOIN staff supervisor ON supervisor.id = duty.supervisor_id
       LEFT JOIN staff coach ON coach.id = duty.coach_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY t.bus_id ASC, t.group_id ASC, t.leg_no ASC`
    )
    .all(...params);

  const legIds = legs.map((l) => l.id);
  const txByTrip = new Map();
  if (legIds.length) {
    const placeholders = legIds.map(() => "?").join(",");
    const txRows = db
      .prepare(`SELECT * FROM transactions WHERE trip_id IN (${placeholders})`)
      .all(...legIds);
    for (const tx of txRows) {
      if (!txByTrip.has(tx.trip_id)) txByTrip.set(tx.trip_id, []);
      txByTrip.get(tx.trip_id).push(tx);
    }
  }

  const groups = new Map();
  for (const leg of legs) {
    if (!groups.has(leg.group_id)) {
      groups.set(leg.group_id, {
        group_id: leg.group_id,
        bus_id: leg.bus_id,
        reg_number: leg.reg_number,
        source_bus_number: leg.source_bus_number,
        rotation_no: leg.rotation_no,
        trip_date: leg.trip_date,
        accounts_status: leg.accounts_status,
        legs: [],
        passengers: 0,
        income: 0,
        expense: 0,
        expenseBreakdown: {},
      });
    }
    const g = groups.get(leg.group_id);
    const legTx = txByTrip.get(leg.id) || [];
    const legIncome = legTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const legPassengers = legTx
      .filter((t) => t.category === "ticket_sales")
      .reduce((s, t) => s + (t.passengers_count || 0) - (t.deducted_passengers || 0), 0);
    g.legs.push({ ...leg, income: legIncome, passengers: legPassengers });
    g.income += legIncome;
    g.passengers += legPassengers;
    for (const tx of legTx) {
      if (tx.type === "expense") {
        g.expense += tx.amount;
        g.expenseBreakdown[tx.category] = (g.expenseBreakdown[tx.category] || 0) + tx.amount;
      }
    }
    if (leg.accounts_status === "open") g.accounts_status = "open";
  }
  const result = Array.from(groups.values()).map((g) => ({ ...g, net: g.income - g.expense }));
  res.json(result);
});

// GET /api/trips/for-accounts?bus_id=3 -> trips (legs) available for the
// Accounts page to attach entries to (open) or review (done), for one bus.
// Includes the bus's reg_number so rotations can be labeled "BUS-1 —
// Rotation #2" instead of just "#2", plus this leg's logged passenger
// count and fuel total (from Passenger Checker / Pump Manager checkpoint
// entries) so Accounts can prefill from the source of truth.
router.get("/for-accounts", requireFeaturePermission("accounts_bus", "read"), (req, res) => {
  const { bus_id } = req.query;
  if (!bus_id) return res.status(400).json({ error: "bus_id required" });
  const rows = db
    .prepare(
      `SELECT t.*, b.reg_number, b.source_bus_number,
              (SELECT r.id FROM rotations r WHERE r.trip_id = t.id LIMIT 1) AS rotation_id,
              (SELECT SUM(passengers_count) FROM activity_logs WHERE trip_id = t.id AND event_type = 'passenger_count') as logged_passengers,
              (SELECT SUM(fuel_cost) FROM activity_logs WHERE trip_id = t.id AND event_type = 'fuel') as logged_fuel_cost,
              (SELECT SUM(fuel_liters) FROM activity_logs WHERE trip_id = t.id AND event_type = 'fuel') as logged_fuel_liters
       FROM trips t JOIN buses b ON b.id = t.bus_id
       WHERE t.bus_id = ? AND t.deleted_at IS NULL
       ORDER BY t.trip_date DESC, t.rotation_no DESC, t.leg_no ASC`
    )
    .all(bus_id);
  res.json(rows);
});

// GET /api/trips/trash -> Admin/Super Admin only. Every rotation (grouped,
// both legs) that's been removed from Rotation/Accounts/Reports, so it can
// be restored, or its report pulled without restoring it.
router.get("/trash", requireFeaturePermission("trash", "read"), (req, res) => {
  const legs = db
    .prepare(
      `SELECT t.*, b.reg_number, b.source_bus_number, u.full_name as deleted_by_name
       FROM trips t JOIN buses b ON b.id = t.bus_id
       LEFT JOIN users u ON u.id = t.deleted_by
       WHERE t.deleted_at IS NOT NULL
       ORDER BY t.deleted_at DESC`
    )
    .all();
  const groups = new Map();
  for (const leg of legs) {
    if (!groups.has(leg.group_id)) {
      groups.set(leg.group_id, {
        group_id: leg.group_id, bus_id: leg.bus_id, reg_number: leg.reg_number, source_bus_number: leg.source_bus_number,
        rotation_no: leg.rotation_no, trip_date: leg.trip_date,
        deleted_at: leg.deleted_at, deleted_by_name: leg.deleted_by_name, legs: [],
      });
    }
    groups.get(leg.group_id).legs.push(leg);
  }
  res.json(Array.from(groups.values()));
});

// Restore a trashed rotation (both legs) back into Rotation/Accounts/Reports.
router.post("/:id/restore", requireFeaturePermission("trash", "write"), (req, res) => {
  const info = db
    .prepare(
      "UPDATE trips SET deleted_at = NULL, deleted_by = NULL WHERE group_id = (SELECT group_id FROM trips WHERE id = ?)"
    )
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });

  // The duty-roster (Rotation page) row was removed when this was trashed —
  // recreate it pointing at leg 1, same as when the trip first started.
  const leg1 = db.prepare("SELECT * FROM trips WHERE group_id = (SELECT group_id FROM trips WHERE id = ?) AND leg_no = 1").get(req.params.id);
  if (leg1) {
    const existingRotation = db.prepare("SELECT id FROM rotations WHERE trip_id = ?").get(leg1.id);
    if (!existingRotation) {
      db.prepare(
        `INSERT INTO rotations (bus_id, route, duty_date, shift_start, shift_end, status, trip_id)
         VALUES (?,?,?,?,?,?,?)`
      ).run(leg1.bus_id, leg1.route || null, leg1.trip_date, leg1.departure_time, leg1.arrival_time, leg1.status === "completed" ? "completed" : "running", leg1.id);
    }
  }

  res.json({ restored: true });
});

// Start a trip = bus leaves the Control Counter. Control Counter, Driver,
// Helper, Admin, Super Admin may do this. Driver/Helper can only start a
// trip on their OWN assigned bus — bus_id they submit is ignored in favor
// of their staff record's assigned_bus_id.
router.post("/", requireFeaturePermission("live_activity", "write"), (req, res) => {
  let { bus_id, route, trip_date, departure_time, price_per_seat, rotation_id } = req.body;
  if (!rotation_id) return res.status(400).json({ error: "Select an open rotation before starting a trip" });
  const selectedRotation = db.prepare("SELECT * FROM rotations WHERE id = ?").get(rotation_id);
  if (!selectedRotation) return res.status(404).json({ error: "Rotation not found" });
  if (selectedRotation.trip_id || selectedRotation.status !== "scheduled") {
    return res.status(400).json({ error: "Only an open rotation can be started" });
  }
  // A live trip always inherits its bus, route and date from the planned
  // Rotation. Adding a rotation alone therefore never makes it appear on
  // “Trips currently on the road”.
  bus_id = selectedRotation.bus_id;
  route = selectedRotation.route;
  trip_date = selectedRotation.duty_date;
  departure_time = departure_time || selectedRotation.shift_start;

  if (!route?.trim()) {
    return res.status(400).json({ error: "This rotation has no route. Create the rotation again and select a route before starting the trip." });
  }

  if (OWN_BUS_ROLES.includes(req.user.role)) {
    if (!req.user.staff_id) return res.status(403).json({ error: "Your account isn't linked to a staff record" });
    const staff = db.prepare("SELECT assigned_bus_id FROM staff WHERE id = ?").get(req.user.staff_id);
    if (!staff?.assigned_bus_id) return res.status(403).json({ error: "You're not assigned to a bus" });
    bus_id = staff.assigned_bus_id;
  }
  if (Number(bus_id) !== Number(selectedRotation.bus_id)) {
    return res.status(403).json({ error: "You can only start an open rotation for your assigned bus" });
  }

  if (!bus_id || !trip_date) return res.status(400).json({ error: "bus_id and trip_date required" });
  // Departure time is mandatory — a trip can't be started without the exact time.
  if (!departure_time) return res.status(400).json({ error: "Departure time is required to start a trip" });

  const bus = db.prepare("SELECT * FROM buses WHERE id = ?").get(bus_id);
  if (!bus) return res.status(404).json({ error: "Bus not found" });
  const runningTrip = db.prepare(
    "SELECT id, route FROM trips WHERE bus_id = ? AND status = 'running' AND deleted_at IS NULL LIMIT 1"
  ).get(bus_id);
  if (runningTrip) return res.status(409).json({ error: `This bus is already running on ${runningTrip.route || "another route"}. Complete that trip before starting another rotation.` });
  const { openCount } = db.prepare("SELECT COUNT(*) as openCount FROM maintenance WHERE bus_id = ? AND status != 'resolved'").get(bus_id);
  // A bus that's under maintenance or retired can't start a trip.
  if (bus.status === "retired") return res.status(400).json({ error: "This bus is retired and can't start a trip" });
  if (bus.status === "unavailable") return res.status(400).json({ error: "This bus is unavailable and can't start a trip" });
  if (openCount > 0) return res.status(400).json({ error: "This bus is currently under maintenance and can't start a trip" });

  // --- Rotation pairing ---------------------------------------------------
  // A rotation is an outbound leg + its return leg. If the route being
  // started now is the configured return route of the SAME bus's most
  // recent completed, not-yet-paired leg today, this is leg 2 of that
  // rotation — same rotation_no, same group_id, no new rotation created.
  // Otherwise this is a fresh rotation (leg 1).
  let rotation_no, group_id, leg_no, pairedLeg;
  if (route) {
    pairedLeg = db
      .prepare(
        `SELECT t.* FROM trips t
         JOIN routes r ON r.name = t.route
         JOIN routes r2 ON r2.name = ?
         WHERE t.bus_id = ? AND t.trip_date = ? AND t.leg_no = 1 AND t.deleted_at IS NULL
           AND t.status = 'completed' AND r.return_route_id = r2.id
           AND NOT EXISTS (SELECT 1 FROM trips t2 WHERE t2.group_id = t.group_id AND t2.leg_no = 2)
         ORDER BY t.id DESC LIMIT 1`
      )
      .get(route, bus_id, trip_date);
  }
  if (pairedLeg) {
    rotation_no = pairedLeg.rotation_no;
    group_id = pairedLeg.group_id;
    leg_no = 2;
  } else {
    const { c } = db
      .prepare("SELECT COUNT(DISTINCT group_id) as c FROM trips WHERE bus_id = ? AND trip_date = ? AND deleted_at IS NULL")
      .get(bus_id, trip_date);
    rotation_no = c + 1;
    leg_no = 1;
    group_id = null; // set to own id right after insert
  }

  const info = db
    .prepare(
      `INSERT INTO trips (bus_id, route, trip_date, rotation_no, group_id, leg_no, departure_time, price_per_seat, status, created_by)
       VALUES (?,?,?,?,?,?,?,?, 'running', ?)`
    )
    .run(bus_id, route || null, trip_date, rotation_no, group_id, leg_no, departure_time, price_per_seat ?? null, req.user.id);

  if (group_id === null) {
    db.prepare("UPDATE trips SET group_id = ? WHERE id = ?").run(info.lastInsertRowid, info.lastInsertRowid);
  }

  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(info.lastInsertRowid);

  db.prepare(
    `INSERT INTO activity_logs (trip_id, bus_id, event_type, note, recorded_by) VALUES (?,?,?,?,?)`
  ).run(trip.id, bus_id, "left_counter", "Left counter", req.user.id);

  // Leg 1 automatically shows up on the Rotation (duty roster) page — no
  // need to add a separate rotation entry by hand. Leg 2 shares the same
  // rotation row (updated below) since it's the same rotation.
  if (leg_no === 1) {
    db.prepare("UPDATE rotations SET trip_id = ?, status = 'running', shift_start = ? WHERE id = ?")
      .run(trip.id, departure_time, selectedRotation.id);
  } else {
    // The return leg has its own planned rotation, so make that selected
    // row live instead of silently reusing the previous leg's roster row.
    db.prepare("UPDATE rotations SET trip_id = ?, status = 'running', shift_start = ? WHERE id = ?")
      .run(trip.id, departure_time, selectedRotation.id);
  }

  // Bus staff (driver/helper/supervisor) don't check in manually in Time
  // Management — the moment their bus actually leaves the counter on this
  // rotation, they're checked in automatically, timestamped with the same
  // departure time.
  autoCheckIn([selectedRotation.driver_id, selectedRotation.helper_id, selectedRotation.supervisor_id, selectedRotation.coach_id], trip_date, departure_time);

  res.status(201).json(trip);
});

// Admin/Accounts-only override: correct which two trips form a rotation,
// for when a bus took an unexpected route back. Pairs `id` with
// `paired_trip_id` (both legs must belong to the same bus and date).
router.put("/:id/pair", requireFeaturePermission("accounts_bus", "write"), (req, res) => {
  const { paired_trip_id } = req.body;
  const a = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  const b = paired_trip_id ? db.prepare("SELECT * FROM trips WHERE id = ?").get(paired_trip_id) : null;
  if (!a) return res.status(404).json({ error: "Trip not found" });
  if (!b) return res.status(400).json({ error: "paired_trip_id required and must exist" });
  if (a.bus_id !== b.bus_id || a.trip_date !== b.trip_date) {
    return res.status(400).json({ error: "Both legs must be the same bus, same date" });
  }
  const groupId = Math.min(a.id, b.id);
  const rotationNo = Math.min(a.rotation_no, b.rotation_no);
  db.prepare("UPDATE trips SET group_id = ?, rotation_no = ?, leg_no = 1 WHERE id = ?").run(groupId, rotationNo, groupId);
  const otherId = groupId === a.id ? b.id : a.id;
  db.prepare("UPDATE trips SET group_id = ?, rotation_no = ?, leg_no = 2 WHERE id = ?").run(groupId, rotationNo, otherId);
  res.json({ paired: true, group_id: groupId });
});

// Mark a trip completed (bus reached destination / rotation finished).
// Control Counter and Counter can both close a trip out.
router.put(
  "/:id/complete",
  requireFeaturePermission("live_activity", "write"),
  (req, res) => {
    const { arrival_time } = req.body;
    const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
    if (!trip) return res.status(404).json({ error: "Not found" });
    db.prepare("UPDATE trips SET status = 'completed', arrival_time = ? WHERE id = ?")
      .run(arrival_time || null, req.params.id);

    // If a duty-roster entry is linked to this trip, its shift_end and
    // status follow the trip automatically — no more getting stuck on
    // "scheduled" after the bus has actually finished.
    const linkedRotation = db.prepare("SELECT * FROM rotations WHERE trip_id = ?").get(req.params.id);
    db.prepare("UPDATE rotations SET shift_end = ?, status = 'completed' WHERE trip_id = ?")
      .run(arrival_time || null, req.params.id);

    // Same crew that was auto-checked-in when this rotation's bus left the
    // counter is auto-checked-out now that it's finished, same time as the
    // trip's own arrival time.
    if (linkedRotation) {
      autoCheckOut([linkedRotation.driver_id, linkedRotation.helper_id, linkedRotation.supervisor_id, linkedRotation.coach_id], trip.trip_date, arrival_time);
    }

    res.json(db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id));
  }
);

// Admin/Super Admin can give or edit the departure/arrival time for ANY
// trip, at any point — not just while starting or completing it.
router.put("/:id/time", requireFeaturePermission("live_activity", "write"), (req, res) => {
  const { departure_time, arrival_time } = req.body;
  const present = [];
  const values = [];
  if (departure_time !== undefined) { present.push("departure_time = ?"); values.push(departure_time); }
  if (arrival_time !== undefined) { present.push("arrival_time = ?"); values.push(arrival_time); }
  if (!present.length) return res.status(400).json({ error: "departure_time or arrival_time required" });
  const info = db.prepare(`UPDATE trips SET ${present.join(", ")} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id));
});

// Accounts "Done" workflow: close out one or more trips (rotations) for a
// bus once their accounts entries are recorded. Once done, no new
// transaction can reference these trips and existing ones lock — except
// for Admin/Super Admin. Accounts role and Admin/Super Admin can do this.
router.post(
  "/close-accounts",
  requireFeaturePermission("accounts_bus", "write"),
  (req, res) => {
    const { trip_ids } = req.body;
    if (!Array.isArray(trip_ids) || trip_ids.length === 0) {
      return res.status(400).json({ error: "trip_ids (array) required" });
    }
    // Closing any leg closes the whole rotation (both legs share one
    // expense and one Done/close state) — expand each id to its group.
    const update = db.prepare(
      "UPDATE trips SET accounts_status = 'done', accounts_closed_by = ?, accounts_closed_at = datetime('now') WHERE group_id = (SELECT group_id FROM trips WHERE id = ?) AND accounts_status = 'open'"
    );
    const results = trip_ids.map((id) => update.run(req.user.id, id).changes);
    res.json({ closed: results.reduce((s, c) => s + c, 0) });
  }
);

// Admin/Accounts-only reopen, for corrections — reopens the whole rotation.
router.post("/:id/reopen-accounts", requireFeaturePermission("accounts_bus", "write"), (req, res) => {
  const info = db
    .prepare(
      "UPDATE trips SET accounts_status = 'open', accounts_closed_by = NULL, accounts_closed_at = NULL WHERE group_id = (SELECT group_id FROM trips WHERE id = ?)"
    )
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAnyFeaturePermission(["live_activity", "rotations"], "write"), (req, res) => {
  const info = db.prepare("DELETE FROM trips WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// Permanent deletion is intentionally only available from Trash and removes
// every leg, checkpoint, transaction and roster row of the selected rotation.
router.delete("/:id/permanent", requireFeaturePermission("trash", "write"), (req, res) => {
  const trip = db.prepare("SELECT group_id FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "Not found" });
  const ids = db.prepare("SELECT id FROM trips WHERE group_id = ?").all(trip.group_id).map((r) => r.id);
  const marks = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM rotations WHERE trip_id IN (${marks})`).run(...ids);
  db.prepare(`DELETE FROM transactions WHERE trip_id IN (${marks})`).run(...ids);
  db.prepare("DELETE FROM trips WHERE group_id = ?").run(trip.group_id);
  res.status(204).end();
});

module.exports = router;
