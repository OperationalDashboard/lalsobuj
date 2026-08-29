const express = require("express");
const db = require("../db");
const { requireAuth, requireModulePermission } = require("../middleware/auth");
const { FULL_ACCESS, ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// Accounts role always has write access to this module; other roles need
// an explicit grant from Admin via Users & Permissions.
function guardWrite(req, res, next) {
  if (FULL_ACCESS.includes(req.user.role) || req.user.role === ROLES.ACCOUNTS) return next();
  return requireModulePermission("accounts", "write")(req, res, next);
}

// Separate place-wise operating-expense setup. Accounts, Admin and Super
// Admin can manage this sector; each saved expense uses one place only.
router.get("/expense-places", (req, res) => {
  res.json(db.prepare("SELECT * FROM expense_places ORDER BY name").all());
});
router.post("/expense-places", guardWrite, (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Place name required" });
  try {
    const info = db.prepare("INSERT INTO expense_places (name) VALUES (?)").run(name);
    res.status(201).json(db.prepare("SELECT * FROM expense_places WHERE id = ?").get(info.lastInsertRowid));
  } catch { res.status(400).json({ error: "That place already exists" }); }
});
router.put("/expense-places/:id", guardWrite, (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Place name required" });
  try {
    const info = db.prepare("UPDATE expense_places SET name = ? WHERE id = ?").run(name, req.params.id);
    if (!info.changes) return res.status(404).json({ error: "Not found" });
    res.json(db.prepare("SELECT * FROM expense_places WHERE id = ?").get(req.params.id));
  } catch { res.status(400).json({ error: "That place already exists" }); }
});
router.delete("/expense-places/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM expense_places WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});
router.get("/expense-types", (req, res) => {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM expense_types").get();
  if (!existing.c) db.transaction(() => ["Counter Rent", "Counter Staff Salary", "Counter Electricity Bill"].forEach((name) => db.prepare("INSERT OR IGNORE INTO expense_types (name) VALUES (?)").run(name)))();
  res.json(db.prepare("SELECT * FROM expense_types ORDER BY name").all());
});
router.post("/expense-types", guardWrite, (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Expense type required" });
  try {
    const info = db.prepare("INSERT INTO expense_types (name) VALUES (?)").run(name);
    res.status(201).json(db.prepare("SELECT * FROM expense_types WHERE id = ?").get(info.lastInsertRowid));
  } catch { res.status(400).json({ error: "That expense type already exists" }); }
});
router.delete("/expense-types/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM expense_types WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// Dedicated Place-wise Accounts report — every transaction tied to a Place
// (not just the manually-added Commission/Other-income and place-expense
// entries added from the Place-wise Accounts sector below, but also
// counter rent/staff-salary/electricity entries recorded from the main
// bus entry form with a Counter/place name, and automatic counter-staff
// salary postings from Salary — see salary.js). Filtering by category
// alone used to leave those out, making this look income-only whenever a
// place's costs were entered as one of those other categories instead of
// "place_expense".
router.get("/place-finance", (req, res) => {
  const { from, to } = req.query;
  const clauses = ["place_name IS NOT NULL", "place_name != ''"];
  const params = [];
  if (from) { clauses.push("txn_date >= ?"); params.push(from); }
  if (to) { clauses.push("txn_date <= ?"); params.push(to); }
  const rows = db.prepare(`SELECT tx.*, c.name AS counter_name FROM transactions tx LEFT JOIN counters c ON c.id = tx.counter_id WHERE ${clauses.join(" AND ")} ORDER BY tx.place_name, tx.txn_date DESC, tx.id DESC`).all(...params);
  res.json(rows);
});

// GET /api/accounts?bus_id=3&from=2026-08-01&to=2026-08-31&trip_id=
router.get("/", (req, res) => {
  const { bus_id, from, to, type, trip_id } = req.query;
  const clauses = [];
  const params = [];
  if (bus_id) { clauses.push("bus_id = ?"); params.push(bus_id); }
  if (trip_id) { clauses.push("trip_id = ?"); params.push(trip_id); }
  if (type) { clauses.push("type = ?"); params.push(type); }
  if (from) { clauses.push("txn_date >= ?"); params.push(from); }
  if (to) { clauses.push("txn_date <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM transactions ${where} ORDER BY txn_date DESC, id DESC`).all(...params);
  res.json(rows);
});

// GET /api/accounts/by-bus — every bus with its running income/expense/net,
// for the reorganized "accounts per bus" view.
router.get("/by-bus", (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.id as bus_id, b.reg_number,
              COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
              COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as expense
       FROM buses b LEFT JOIN transactions t ON t.bus_id = b.id
       GROUP BY b.id ORDER BY b.reg_number ASC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, net: r.income - r.expense })));
});

// GET /api/accounts/summary?bus_id=3&from=&to= -> totals for quick dashboard
// cards and for the bus-wise solo report (net income/loss per bus), over
// an optional date range (defaults to all time when no range given).
router.get("/summary", (req, res) => {
  const { bus_id, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (bus_id) { clauses.push("bus_id = ?"); params.push(bus_id); }
  if (from) { clauses.push("txn_date >= ?"); params.push(from); }
  if (to) { clauses.push("txn_date <= ?"); params.push(to); }
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const incomeTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='income' ${where}`).get(...params).total;
  const expenseTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' ${where}`).get(...params).total;
  res.json({ income: incomeTotal, expense: expenseTotal, net: incomeTotal - expenseTotal });
});

const INCOME_CATEGORIES = ["ticket_sales", "additional_sale", "place_income"];

// Ticket-sales income is passengers_count * price_per_seat, minus an
// optional deduction. The deduction itself is never typed directly — it's
// always deducted_passengers * price_per_seat, computed server-side, so it
// can never drift from the actual per-seat price.
function computeAmount(body) {
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") return Number(body.amount);
  if (body.category === "ticket_sales" && body.passengers_count != null && body.price_per_seat != null) {
    const gross = Number(body.passengers_count) * Number(body.price_per_seat);
    const deduction = body.deducted_passengers ? Number(body.deducted_passengers) * Number(body.price_per_seat) : 0;
    return gross - deduction;
  }
  return body.amount;
}

function computeDeductionAmount(body) {
  if (body.category === "ticket_sales" && body.deducted_passengers && body.price_per_seat != null) {
    return Number(body.deducted_passengers) * Number(body.price_per_seat);
  }
  return null;
}

// Income is only ever Ticket Sales or Additional Sale — everything else
// (fuel, salary, repair, toll, other...) is an expense. Additional Sale
// must explain itself with a description.
function validateCategory(type, category, description) {
  if (type === "income") {
    if (!INCOME_CATEGORIES.includes(category)) {
      return "Income can only be 'ticket_sales' or 'additional_sale'";
    }
    if ((category === "additional_sale" || category === "place_income") && !(description && description.trim())) {
      return "Additional sale requires a description";
    }
  } else if (type === "expense" && INCOME_CATEGORIES.includes(category)) {
    return "This category is an income category, not expense";
  }
  return null;
}

router.post("/", guardWrite, (req, res) => {
  const { bus_id, trip_id, type, category, description, txn_date, passengers_count, price_per_seat, deduction_type, deducted_passengers, leg_scope, place_name, counter_id, attachment_name, attachment_data, apply_to_both, both_leg_amounts } = req.body;
  const amount = computeAmount(req.body);
  if (!type || !category || amount === undefined || amount === null || !txn_date) {
    return res.status(400).json({ error: "type, category, amount (or passengers_count+price_per_seat), txn_date required" });
  }
  const categoryError = validateCategory(type, category, description);
  if (categoryError) return res.status(400).json({ error: categoryError });

  // Can't add a new entry against a rotation whose accounts are already
  // closed — unless you're Admin/Super Admin.
  if (trip_id && !FULL_ACCESS.includes(req.user.role)) {
    const trip = db.prepare("SELECT accounts_status FROM trips WHERE id = ?").get(trip_id);
    if (trip && trip.accounts_status === "done") {
      return res.status(403).json({ error: "This rotation's accounts are already closed" });
    }
  }

  const deduction_amount = computeDeductionAmount(req.body);
  const insert = db.prepare(
      `INSERT INTO transactions
        (bus_id, trip_id, type, category, amount, passengers_count, price_per_seat, deduction_type, deduction_amount, deducted_passengers, description, txn_date, leg_scope, place_name, counter_id, attachment_name, attachment_data, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const add = (targetTripId, entryAmount = amount) => insert.run(bus_id || null, targetTripId || null,
      type,
      category,
      entryAmount,
      passengers_count ?? null,
      price_per_seat ?? null,
      deduction_type || null,
      deduction_amount,
      deducted_passengers ?? null,
      description || null,
      txn_date,
      leg_scope || null, place_name || null, counter_id || null, attachment_name || null, attachment_data || null,
      req.user.id
    );
  let info;
  if (apply_to_both && trip_id) {
    const legs = db.prepare("SELECT id FROM trips WHERE group_id = (SELECT group_id FROM trips WHERE id = ?)").all(trip_id);
    if (legs.length !== 2) return res.status(400).json({ error: "Both legs are not available for this rotation" });
    const results = db.transaction(() => legs.map((leg) => add(leg.id, both_leg_amounts?.[leg.id] ?? amount)))();
    info = results[0];
  } else info = add(trip_id);
  res.status(201).json(db.prepare("SELECT * FROM transactions WHERE id = ?").get(info.lastInsertRowid));
});

router.put("/:id", guardWrite, (req, res) => {
  const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isFullAccess = FULL_ACCESS.includes(req.user.role);

  // Locked once its rotation's accounts are closed — Admin/Super Admin only past this point.
  if (existing.trip_id && !isFullAccess) {
    const trip = db.prepare("SELECT accounts_status FROM trips WHERE id = ?").get(existing.trip_id);
    if (trip && trip.accounts_status === "done") {
      return res.status(403).json({ error: "This rotation's accounts are closed — ask Admin to reopen it first" });
    }
  }

  const nextType = req.body.type !== undefined ? req.body.type : existing.type;
  const nextCategory = req.body.category !== undefined ? req.body.category : existing.category;
  const nextDescription = req.body.description !== undefined ? req.body.description : existing.description;
  const categoryError = validateCategory(nextType, nextCategory, nextDescription);
  if (categoryError) return res.status(400).json({ error: categoryError });

  const fields = ["bus_id", "trip_id", "type", "category", "description", "txn_date", "passengers_count", "price_per_seat", "deduction_type", "deducted_passengers"];
  const present = fields.filter((f) => req.body[f] !== undefined);
  const amount = computeAmount(req.body);
  const hasAmount = amount !== undefined && amount !== null;
  const deduction_amount = computeDeductionAmount(req.body);
  const hasDeductedPassengers = req.body.deducted_passengers !== undefined;

  // Accounts role changing the actual amount must give a reason. Admin is
  // exempt (they can already do anything).
  const amountChanging = hasAmount && amount !== existing.amount;
  if (amountChanging && req.user.role === ROLES.ACCOUNTS && !req.body.edit_note) {
    return res.status(400).json({ error: "Changing the amount requires a note explaining why" });
  }

  if (!present.length && !hasAmount) return res.status(400).json({ error: "No valid fields" });

  const setClauses = present.map((f) => `${f} = ?`);
  const values = present.map((f) => req.body[f]);
  if (hasAmount) { setClauses.push("amount = ?"); values.push(amount); }
  if (hasDeductedPassengers) { setClauses.push("deduction_amount = ?"); values.push(deduction_amount); }
  if (req.body.edit_note) {
    setClauses.push("edit_note = ?", "last_edited_by = ?", "last_edited_at = datetime('now')");
    values.push(req.body.edit_note, req.user.id);
  }

  const info = db.prepare(`UPDATE transactions SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id));
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
