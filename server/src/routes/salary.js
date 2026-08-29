const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { FULL_ACCESS } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// GET /api/salary/assignments -> every staff member with their salary plan
// (staff who don't have a row yet show as salary_type 'none' / unassigned —
// "No salary staff" is a deliberate, visible choice, not a missing entry).
router.get("/assignments", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id as staff_id, s.name, s.designation, s.status,
              sa.salary_type, sa.amount
       FROM staff s LEFT JOIN salary_assignments sa ON sa.staff_id = s.id
       WHERE s.counter_id IS NOT NULL
       ORDER BY s.name ASC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, salary_type: r.salary_type || "none" })));
});

// Admin/Super Admin only: set or change a staff member's salary plan.
// salary_type: 'monthly' (fixed amount every payroll run regardless of
// attendance), 'daily' (amount per day actually worked), or 'none'
// (explicitly not on payroll here).
router.put("/assignments/:staffId", requireRole(...FULL_ACCESS), (req, res) => {
  const { salary_type, amount } = req.body;
  if (!["monthly", "daily", "none"].includes(salary_type)) {
    return res.status(400).json({ error: "salary_type must be monthly, daily, or none" });
  }
  if (salary_type !== "none" && (amount === undefined || amount === null || Number(amount) <= 0)) {
    return res.status(400).json({ error: "amount is required for a monthly or daily salary" });
  }
  const staff = db.prepare("SELECT id FROM staff WHERE id = ?").get(req.params.staffId);
  if (!staff) return res.status(404).json({ error: "Staff not found" });
  const counterStaff = db.prepare("SELECT counter_id FROM staff WHERE id = ?").get(req.params.staffId);
  if (!counterStaff?.counter_id) return res.status(400).json({ error: "Direct salary plans are only for staff assigned to a counter. Bus staff salary is recorded by Accounts per rotation." });

  const existing = db.prepare("SELECT id FROM salary_assignments WHERE staff_id = ?").get(req.params.staffId);
  if (existing) {
    db.prepare("UPDATE salary_assignments SET salary_type = ?, amount = ?, updated_at = datetime('now') WHERE staff_id = ?")
      .run(salary_type, salary_type === "none" ? null : Number(amount), req.params.staffId);
  } else {
    db.prepare("INSERT INTO salary_assignments (staff_id, salary_type, amount) VALUES (?,?,?)")
      .run(req.params.staffId, salary_type, salary_type === "none" ? null : Number(amount));
  }
  // Keep designated counter staff visible automatically in the separate
  // Place-wise Accounts sector. Updating a salary updates its one current
  // month entry instead of creating duplicates.
  const staffPlace = db.prepare(
    `SELECT s.name, s.counter_id, c.name AS counter_name, p.name AS place_name
     FROM staff s JOIN counters c ON c.id = s.counter_id JOIN expense_places p ON p.id = c.place_id
     WHERE s.id = ?`
  ).get(req.params.staffId);
  if (staffPlace && salary_type !== "none") {
    const month = new Date().toISOString().slice(0, 7);
    const description = `Counter Staff Salary — ${staffPlace.name} — ${month}`;
    const existingExpense = db.prepare("SELECT id FROM transactions WHERE description = ? AND category = 'place_expense'").get(description);
    if (existingExpense) {
      db.prepare("UPDATE transactions SET amount = ?, txn_date = ?, place_name = ?, counter_id = ? WHERE id = ?").run(Number(amount), new Date().toISOString().slice(0, 10), staffPlace.place_name, staffPlace.counter_id, existingExpense.id);
    } else {
      db.prepare("INSERT INTO transactions (type, category, amount, description, txn_date, place_name, counter_id, created_by) VALUES ('expense','place_expense',?,?,?,?,?,?)")
        .run(Number(amount), description, new Date().toISOString().slice(0, 10), staffPlace.place_name, staffPlace.counter_id, req.user.id);
    }
  }
  res.json(db.prepare("SELECT * FROM salary_assignments WHERE staff_id = ?").get(req.params.staffId));
});

// GET /api/salary/payroll?month=2026-08 -> computed payroll for that month.
//
// - monthly staff: paid their fixed amount regardless of attendance.
// - daily staff: paid amount x number of DISTINCT days they worked their
//   OWN shift that month (multiple check-ins the same day count once).
// - "representing" credit: when staff_id checked in with
//   representing_staff_id set (covering an absent colleague), that's an
//   overtime credit paid to staff_id, valued at the REPRESENTED staff's
//   own daily rate — not the covering staff's rate — per instance, on top
//   of their normal pay. This matches "Staff B covers absent Staff A and
//   gets Staff A's day rate (500) as overtime, in addition to their own pay."
router.get("/payroll", requireRole(...FULL_ACCESS), (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // "2026-08"

  const assignments = db.prepare("SELECT * FROM salary_assignments").all();
  const assignmentByStaff = new Map(assignments.map((a) => [a.staff_id, a]));

  const staffRows = db.prepare("SELECT id, name, designation, status FROM staff WHERE counter_id IS NOT NULL").all();

  const monthRows = db
    .prepare(
      `SELECT * FROM attendance
       WHERE work_date LIKE ? AND check_in IS NOT NULL AND status IN ('present','late')`
    )
    .all(`${month}%`);

  const result = staffRows.map((s) => {
    const plan = assignmentByStaff.get(s.id);
    const salary_type = plan?.salary_type || "none";
    const amount = plan?.amount || 0;

    // Own distinct worked days this month (their own shift, not a cover).
    const ownDays = new Set(
      monthRows.filter((r) => r.staff_id === s.id && !r.representing_staff_id).map((r) => r.work_date)
    );

    // Overtime credits earned BY this staff member for covering others —
    // one credit per (representing_staff_id, work_date) instance, valued
    // at that represented staff's own daily rate.
    const coverCredits = monthRows.filter((r) => r.staff_id === s.id && r.representing_staff_id);
    const overtimePay = coverCredits.reduce((sum, r) => {
      const representedPlan = assignmentByStaff.get(r.representing_staff_id);
      return sum + (representedPlan?.amount || 0);
    }, 0);

    let basePay = 0;
    if (salary_type === "monthly") basePay = amount;
    else if (salary_type === "daily") basePay = amount * ownDays.size;

    const covers = coverCredits.map((r) => staffRows.find((staffRow) => staffRow.id === r.representing_staff_id)?.name).filter(Boolean);
    return {
      staff_id: s.id,
      name: s.name,
      designation: s.designation,
      salary_type,
      amount,
      days_worked: salary_type === "daily" ? ownDays.size : null,
      base_pay: basePay,
      overtime_pay: overtimePay,
      overtime_days: coverCredits.length,
      covering_names: covers,
      total_pay: basePay + overtimePay,
    };
  });

  res.json({ month, staff: result.filter((r) => r.salary_type !== "none" || r.overtime_pay > 0) });
});

// Post the calculated base payroll of counter-assigned staff into the
// separate Place-wise Accounts sector. One staff/month entry is created at
// most once, so it cannot duplicate a place expense on repeated clicks.
router.post("/post-place-expenses", requireRole(...FULL_ACCESS), (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  const counterId = req.body.counter_id || null;
  const staffRows = db.prepare(
    `SELECT s.id, s.name, s.counter_id, sa.salary_type, sa.amount, c.name AS counter_name, p.name AS place_name
     FROM staff s JOIN salary_assignments sa ON sa.staff_id = s.id
     JOIN counters c ON c.id = s.counter_id JOIN expense_places p ON p.id = c.place_id
     WHERE sa.salary_type IN ('monthly','daily') AND sa.amount > 0 ${counterId ? "AND s.counter_id = ?" : ""}`
  ).all(...(counterId ? [counterId] : []));
  const countDays = db.prepare("SELECT COUNT(DISTINCT work_date) AS days FROM attendance WHERE staff_id = ? AND representing_staff_id IS NULL AND check_in IS NOT NULL AND status IN ('present','late') AND work_date LIKE ?");
  const exists = db.prepare("SELECT id FROM transactions WHERE category = 'place_expense' AND description = ? LIMIT 1");
  const insert = db.prepare("INSERT INTO transactions (type, category, amount, description, txn_date, place_name, counter_id, created_by) VALUES ('expense','place_expense',?,?,?,?,?,?)");
  let posted = 0;
  const work = db.transaction(() => staffRows.forEach((staff) => {
    const amount = staff.salary_type === 'monthly' ? staff.amount : staff.amount * countDays.get(staff.id, `${month}%`).days;
    const description = `Counter Staff Salary — ${staff.name} — ${month}`;
    const old = exists.get(description);
    if (!amount) { if (old) db.prepare("DELETE FROM transactions WHERE id = ?").run(old.id); return; }
    if (old) db.prepare("UPDATE transactions SET amount = ?, txn_date = ?, place_name = ?, counter_id = ? WHERE id = ?").run(amount, `${month}-01`, staff.place_name, staff.counter_id, old.id);
    else { insert.run(amount, description, `${month}-01`, staff.place_name, staff.counter_id, req.user.id); posted += 1; }
  }));
  work();
  res.json({ posted, month, counter_id: counterId, total: staffRows.reduce((sum, staff) => sum + (staff.salary_type === "monthly" ? staff.amount : staff.amount * countDays.get(staff.id, `${month}%`).days), 0) });
});

module.exports = router;
