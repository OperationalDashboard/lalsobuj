// Automatic attendance for bus-side crew (driver/helper/supervisor),
// driven by their rotation's Live Activity status instead of a manual
// check-in/out. Called from routes/trips.js when a trip starts (crew
// checked in) and when it's marked completed, including the automatic
// overdue sweep (crew checked out).
const db = require("./db");

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

// Checks in each staff id at `time` on `workDate`. Reopens today's
// existing row instead of adding a duplicate if one's already open,
// matching the manual checkin behaviour in routes/attendance.js.
function autoCheckIn(staffIds, workDate, time) {
  const ids = [...new Set((staffIds || []).filter(Boolean))];
  const stampTime = time || nowTime();
  for (const staffId of ids) {
    const openRow = db
      .prepare(
        "SELECT * FROM attendance WHERE staff_id = ? AND work_date = ? AND check_out IS NULL AND representing_staff_id IS NULL"
      )
      .get(staffId, workDate);
    if (openRow) {
      db.prepare("UPDATE attendance SET check_in = ?, status = 'present' WHERE id = ?").run(stampTime, openRow.id);
    } else {
      db.prepare(
        "INSERT INTO attendance (staff_id, work_date, check_in, status) VALUES (?,?,?, 'present')"
      ).run(staffId, workDate, stampTime);
    }
  }
}

// Checks out each staff id's currently open row for that date, if any.
// If there's no open row (e.g. the rotation didn't have an auto check-in
// for some reason), there's nothing to close — Admin can still add or
// correct a record by hand.
function autoCheckOut(staffIds, workDate, time) {
  const ids = [...new Set((staffIds || []).filter(Boolean))];
  const stampTime = time || nowTime();
  for (const staffId of ids) {
    const openRow = db
      .prepare("SELECT * FROM attendance WHERE staff_id = ? AND work_date = ? AND check_out IS NULL ORDER BY id DESC LIMIT 1")
      .get(staffId, workDate);
    if (openRow) {
      db.prepare("UPDATE attendance SET check_out = ? WHERE id = ?").run(stampTime, openRow.id);
    }
  }
}

module.exports = { autoCheckIn, autoCheckOut };
