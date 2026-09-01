const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission, requireAnyFeaturePermission } = require("../middleware/auth");
const { isBusStaffType } = require("../staffTypes");

const router = express.Router();
router.use(requireAuth);

// Checking someone in/out, or marking them absent, is open to any role
// Admin has granted "attendance" write access to (Users & Permissions),
// same as every other module — this used to be hardcoded to Admin/Super
// Admin only, which meant granted permissions were silently ignored.
const guardRead = requireAnyFeaturePermission(["attendance", "reports"], "read");
const guardWrite = requireFeaturePermission("attendance", "write");

const MAX_CHECKINS_PER_DAY = 3;

function nowTime() {
  // HH:MM in server local time
  return new Date().toTimeString().slice(0, 5);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Bus staff (driver/helper/supervisor/bus_staff/conductor/mechanic) don't
// check in/out here — their attendance is derived automatically from their
// bus's rotation on Live Activity (see routes/trips.js). Block it
// server-side too, since the frontend hiding the button isn't the actual
// security boundary.
function isBusStaff(staffId) {
  const staff = db.prepare("SELECT designation FROM staff WHERE id = ?").get(staffId);
  return staff && isBusStaffType(staff.designation);
}
function getStaffPlace(staffId) {
  return db.prepare(
    `SELECT s.id, s.name, s.counter_id, c.name AS counter_name,
            c.place_id, p.name AS place_name
     FROM staff s
     LEFT JOIN counters c ON c.id = s.counter_id
     LEFT JOIN expense_places p ON p.id = c.place_id
     WHERE s.id = ?`
  ).get(staffId);
}
function clearForAbsence(staffId, workDate, status = "absent") {
  const current = db.prepare("SELECT * FROM attendance WHERE staff_id = ? AND work_date = ? ORDER BY id DESC LIMIT 1").get(staffId, workDate);
  if (current) db.prepare("UPDATE attendance SET status = ?, check_in = NULL, check_out = NULL WHERE id = ?").run(status, current.id);
  else db.prepare("INSERT INTO attendance (staff_id, work_date, status) VALUES (?,?,?)").run(staffId, workDate, status);
  const staff = db.prepare("SELECT name FROM staff WHERE id = ?").get(staffId);
  if (staff) {
    const month = workDate.slice(0, 7);
    db.prepare("DELETE FROM transactions WHERE category = 'place_expense' AND (description = ? OR description = ?)")
      .run(`Counter Staff Salary — ${staff.name} — ${month}`, `Automatic Counter Staff Salary — ${staff.name} — ${month}`);
  }
}

router.get("/", guardRead, (req, res) => {
  res.json(db.prepare("SELECT * FROM attendance ORDER BY work_date DESC, id DESC").all());
});

// Check a staff member in RIGHT NOW — the time is always the current
// server clock, never typed in. A staff member can be checked in up to
// MAX_CHECKINS_PER_DAY separate times in one day (e.g. covering a split
// shift, or standing in for an absent colleague more than once).
//
// representing_staff_id: pass this when staff_id is covering FOR someone
// else who's absent. Both staff members must belong to counters grouped
// under the same parent place. The person who actually works receives an
// overtime credit at the absent staff member's configured salary rate.
router.post("/checkin", guardWrite, (req, res) => {
  const { staff_id, representing_staff_id } = req.body;
  if (!staff_id) return res.status(400).json({ error: "staff_id required" });
  if (isBusStaff(staff_id)) {
    return res.status(400).json({ error: "Bus staff are checked in/out automatically from Live Activity/Rotation, not here" });
  }

  let coverPlace = null;
  if (representing_staff_id) {
    if (String(staff_id) === String(representing_staff_id)) return res.status(400).json({ error: "A staff member cannot cover their own shift" });
    const covering = getStaffPlace(staff_id);
    const covered = getStaffPlace(representing_staff_id);
    if (!covering) return res.status(404).json({ error: "Covering staff member not found" });
    if (!covered) return res.status(404).json({ error: "Covered staff member not found" });
    if (!covering.counter_id || !covered.counter_id || !covering.place_id || !covered.place_id) {
      return res.status(400).json({ error: "Both staff members must be assigned to counters grouped under a parent place" });
    }
    if (Number(covering.place_id) !== Number(covered.place_id)) {
      return res.status(400).json({ error: `Covering is only allowed between counters in the same place. ${covering.name} belongs to ${covering.place_name}; ${covered.name} belongs to ${covered.place_name}.` });
    }
    coverPlace = covering.place_id;
  }

  const { c } = db
    .prepare("SELECT COUNT(*) as c FROM attendance WHERE staff_id = ? AND work_date = ?")
    .get(staff_id, today());
  if (c >= MAX_CHECKINS_PER_DAY) {
    return res.status(400).json({ error: `This staff member has already checked in ${MAX_CHECKINS_PER_DAY} times today` });
  }

  // If they're not covering for anyone and haven't clocked out of an
  // earlier check-in today, just re-open that one rather than adding a
  // duplicate open row.
  if (!representing_staff_id) {
    const openRow = db
      .prepare("SELECT * FROM attendance WHERE staff_id = ? AND work_date = ? AND check_out IS NULL AND representing_staff_id IS NULL")
      .get(staff_id, today());
    if (openRow) {
      db.prepare("UPDATE attendance SET check_in = ?, status = 'present' WHERE id = ?").run(nowTime(), openRow.id);
      return res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(openRow.id));
    }
  }

  if (representing_staff_id && coverPlace) clearForAbsence(representing_staff_id, today());

  const info = db
    .prepare(
      "INSERT INTO attendance (staff_id, work_date, check_in, status, representing_staff_id) VALUES (?,?,?, 'present', ?)"
    )
    .run(staff_id, today(), nowTime(), representing_staff_id || null);
  res.status(201).json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(info.lastInsertRowid));
});

// Check out RIGHT NOW, same rule — always the current server clock.
router.put("/:id/checkout", guardWrite, (req, res) => {
  const row = db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (["absent", "leave"].includes(row.status)) return res.status(400).json({ error: "Absent or leave staff cannot be checked out" });
  const info = db.prepare("UPDATE attendance SET check_out = ? WHERE id = ?").run(nowTime(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id));
});

// Admin/Super Admin can reopen a completed checkout, or reopen a missed
// check-in. This deliberately resets the record to an active present shift
// instead of allowing ordinary attendance roles to alter past records.
router.post("/:id/reopen", guardWrite, (req, res) => {
  const row = db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const stage = req.body.stage || "checkout";
  if (!['checkin', 'checkout'].includes(stage)) return res.status(400).json({ error: "stage must be checkin or checkout" });
  if (stage === "checkin") {
    db.prepare("UPDATE attendance SET check_in = ?, check_out = NULL, status = 'present' WHERE id = ?").run(nowTime(), row.id);
  } else {
    db.prepare("UPDATE attendance SET check_out = NULL WHERE id = ?").run(row.id);
  }
  res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(row.id));
});

// Manually mark absent/leave for a staff member on a given date (no time
// involved, so typing is fine here).
router.post("/", guardWrite, (req, res) => {
  const { staff_id, work_date, status } = req.body;
  if (!staff_id || !work_date || !status) return res.status(400).json({ error: "staff_id, work_date, status required" });
  if (isBusStaff(staff_id)) {
    return res.status(400).json({ error: "Bus staff are tracked automatically from Live Activity/Rotation, not here" });
  }
  if (["absent", "leave"].includes(status)) {
    clearForAbsence(staff_id, work_date, status);
    return res.status(201).json(db.prepare("SELECT * FROM attendance WHERE staff_id = ? AND work_date = ? ORDER BY id DESC LIMIT 1").get(staff_id, work_date));
  }
  const info = db
    .prepare("INSERT INTO attendance (staff_id, work_date, status) VALUES (?,?,?)")
    .run(staff_id, work_date, status);
  res.status(201).json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(info.lastInsertRowid));
});

// Correcting a recorded check_in/check_out TIME after the fact — Admin/
// Super Admin only. Everyone else can change WHO checked in/out (via
// checkin/checkout above) but never edit a stamped time directly.
router.put("/:id", guardWrite, (req, res) => {
  const fields = ["check_in", "check_out"];
  const present = fields.filter((f) => req.body[f] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  const setClause = present.map((f) => `${f} = ?`).join(", ");
  const values = present.map((f) => req.body[f]);
  const info = db.prepare(`UPDATE attendance SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id));
});

// Changing the STATUS of an already checked-in/out record (present, late,
// absent, leave) is Admin/Super Admin only.
router.put("/:id/status", guardWrite, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  const row = db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (["absent", "leave"].includes(status)) {
    clearForAbsence(row.staff_id, row.work_date, status);
    return res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(row.id));
  }
  const info = db.prepare("UPDATE attendance SET status = ? WHERE id = ?").run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.id));
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM attendance WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
