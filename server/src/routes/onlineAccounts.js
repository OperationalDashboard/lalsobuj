const express = require("express");
const db = require("../db");
const { requireAuth, requireModulePermission } = require("../middleware/auth");
const { ROLES } = require("../roles");

const router = express.Router();
const CHANNELS = ["website", "android", "ios", "website_android", "cash"];
const ENTRY_CHANNELS = ["website", "android", "ios", "cash"];

router.use(requireAuth);

function requireOnlineAccounts(mode) {
  return (req, res, next) => {
    // Online Manager keeps its built-in full access. Every other non-admin
    // role is governed by the same role-permission matrix as other modules.
    if (req.user?.role === ROLES.ONLINE_MANAGER) return next();
    return requireModulePermission("online_accounts", mode)(req, res, next);
  };
}

const guardRead = requireOnlineAccounts("read");
const guardWrite = requireOnlineAccounts("write");

function cleanDate(value, field = "date") {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} must use YYYY-MM-DD`);
  return date;
}

function cleanNumber(value, field, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    throw new Error(`${field} must be a non-negative ${integer ? "whole number" : "number"}`);
  }
  return number;
}

function parseEntry(body) {
  const channel = String(body.channel || "").trim();
  if (!ENTRY_CHANNELS.includes(channel)) throw new Error("Choose Website, Android App, iOS App, or Cash");
  const coachNumber = String(body.coach_number || "").trim();
  const busNumber = String(body.bus_number || "").trim();
  if (!coachNumber) throw new Error("Coach number is required");

  let normalPassengers = 0;
  let longPassengers = 0;
  let passengerCount = 0;
  if (channel === "cash") {
    passengerCount = cleanNumber(body.passenger_count, "Passenger count", true);
  } else {
    normalPassengers = cleanNumber(body.normal_passengers, "Normal passengers", true);
    longPassengers = cleanNumber(body.long_passengers, "Long passengers", true);
    passengerCount = normalPassengers + longPassengers;
  }

  return {
    entryDate: cleanDate(body.entry_date, "Entry date"),
    channel,
    coachNumber,
    busNumber,
    normalPassengers,
    longPassengers,
    passengerCount,
    amount: cleanNumber(body.amount, "Amount"),
  };
}

function parseRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  const from = req.query.from ? cleanDate(req.query.from, "From date") : today;
  const to = req.query.to ? cleanDate(req.query.to, "To date") : from;
  if (from > to) throw new Error("From date cannot be after To date");
  return { from, to };
}

function entryById(id) {
  return db.prepare(
    `SELECT e.*, creator.full_name AS created_by_name, editor.full_name AS updated_by_name
     FROM online_sales_entries e
     LEFT JOIN users creator ON creator.id = e.created_by
     LEFT JOIN users editor ON editor.id = e.updated_by
     WHERE e.id = ?`
  ).get(id);
}

router.get("/entries", guardRead, (req, res) => {
  try {
    const { from, to } = parseRange(req);
    const channel = req.query.channel ? String(req.query.channel) : "";
    if (channel && !CHANNELS.includes(channel)) return res.status(400).json({ error: "Unknown channel" });
    const rows = db.prepare(
      `SELECT e.*, creator.full_name AS created_by_name, editor.full_name AS updated_by_name
       FROM online_sales_entries e
       LEFT JOIN users creator ON creator.id = e.created_by
       LEFT JOIN users editor ON editor.id = e.updated_by
       WHERE e.entry_date BETWEEN ? AND ? AND (? = '' OR e.channel = ?)
       ORDER BY e.entry_date DESC, e.id DESC`
    ).all(from, to, channel, channel);
    res.json(rows);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/entries", guardWrite, (req, res) => {
  try {
    const entry = parseEntry(req.body);
    const info = db.prepare(
      `INSERT INTO online_sales_entries
       (entry_date, channel, coach_number, bus_number, normal_passengers, long_passengers, passenger_count, amount, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entry.entryDate, entry.channel, entry.coachNumber, entry.busNumber, entry.normalPassengers, entry.longPassengers, entry.passengerCount, entry.amount, req.user.id, req.user.id);
    res.status(201).json(entryById(info.lastInsertRowid));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/entries/:id", guardWrite, (req, res) => {
  try {
    if (!entryById(req.params.id)) return res.status(404).json({ error: "Entry not found" });
    const entry = parseEntry(req.body);
    db.prepare(
      `UPDATE online_sales_entries SET entry_date = ?, channel = ?, coach_number = ?, bus_number = ?,
       normal_passengers = ?, long_passengers = ?, passenger_count = ?, amount = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(entry.entryDate, entry.channel, entry.coachNumber, entry.busNumber, entry.normalPassengers, entry.longPassengers, entry.passengerCount, entry.amount, req.user.id, req.params.id);
    res.json(entryById(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/entries/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM online_sales_entries WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Entry not found" });
  res.status(204).end();
});

router.get("/expense-categories", guardRead, (req, res) => {
  const rows = db.prepare(
    `SELECT c.*, COUNT(e.id) AS expense_count, COALESCE(SUM(e.amount), 0) AS lifetime_total
     FROM online_expense_categories c
     LEFT JOIN online_cash_expenses e ON e.category_id = c.id
     GROUP BY c.id ORDER BY c.active DESC, c.name COLLATE NOCASE`
  ).all();
  res.json(rows);
});

router.post("/expense-categories", guardWrite, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Category name required" });
  try {
    const info = db.prepare("INSERT INTO online_expense_categories (name, created_by) VALUES (?, ?)").run(name, req.user.id);
    res.status(201).json(db.prepare("SELECT * FROM online_expense_categories WHERE id = ?").get(info.lastInsertRowid));
  } catch {
    res.status(400).json({ error: "That expense category already exists" });
  }
});

router.put("/expense-categories/:id", guardWrite, (req, res) => {
  const current = db.prepare("SELECT * FROM online_expense_categories WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Category not found" });
  const name = req.body.name === undefined ? current.name : String(req.body.name || "").trim();
  const active = req.body.active === undefined ? current.active : (req.body.active ? 1 : 0);
  if (!name) return res.status(400).json({ error: "Category name required" });
  try {
    db.prepare("UPDATE online_expense_categories SET name = ?, active = ?, updated_at = datetime('now') WHERE id = ?").run(name, active, req.params.id);
    res.json(db.prepare("SELECT * FROM online_expense_categories WHERE id = ?").get(req.params.id));
  } catch {
    res.status(400).json({ error: "That expense category already exists" });
  }
});

router.delete("/expense-categories/:id", guardWrite, (req, res) => {
  const info = db.prepare("UPDATE online_expense_categories SET active = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Category not found" });
  res.status(204).end();
});

function expenseById(id) {
  return db.prepare(
    `SELECT e.*, c.name AS category_name, creator.full_name AS created_by_name, editor.full_name AS updated_by_name
     FROM online_cash_expenses e
     JOIN online_expense_categories c ON c.id = e.category_id
     LEFT JOIN users creator ON creator.id = e.created_by
     LEFT JOIN users editor ON editor.id = e.updated_by
     WHERE e.id = ?`
  ).get(id);
}

function parseExpense(body) {
  const categoryId = Number(body.category_id);
  const category = db.prepare("SELECT * FROM online_expense_categories WHERE id = ?").get(categoryId);
  if (!category) throw new Error("Choose an expense category");
  return {
    expenseDate: cleanDate(body.expense_date, "Expense date"),
    categoryId,
    description: String(body.description || "").trim() || null,
    amount: cleanNumber(body.amount, "Expense amount"),
  };
}

router.post("/import", guardWrite, (req, res) => {
  try {
    const destination = String(req.body.destination || "").trim();
    const rows = req.body.rows;
    if (!["digital", "cash", "expense"].includes(destination)) throw new Error("Choose Digital Sales, Cash Sales, or Daily Cash Costs");
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Choose at least one row to import");
    if (rows.length > 500) throw new Error("Import no more than 500 rows at a time");

    const parsed = rows.map((row, index) => {
      try {
        if (destination === "expense") return parseExpense(row);
        const entry = parseEntry(destination === "cash" ? { ...row, channel: "cash" } : row);
        if (destination === "digital" && entry.channel === "cash") throw new Error("Choose Website, Android App, or iOS App");
        return entry;
      } catch (error) {
        throw new Error(`Row ${index + 1}: ${error.message}`);
      }
    });

    const insertEntry = db.prepare(
      `INSERT INTO online_sales_entries
       (entry_date, channel, coach_number, bus_number, normal_passengers, long_passengers, passenger_count, amount, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertExpense = db.prepare(
      `INSERT INTO online_cash_expenses (expense_date, category_id, description, amount, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const importRows = db.transaction(() => parsed.map((row) => {
      if (destination === "expense") {
        return insertExpense.run(row.expenseDate, row.categoryId, row.description, row.amount, req.user.id, req.user.id).lastInsertRowid;
      }
      return insertEntry.run(row.entryDate, row.channel, row.coachNumber, row.busNumber, row.normalPassengers, row.longPassengers, row.passengerCount, row.amount, req.user.id, req.user.id).lastInsertRowid;
    }));
    const ids = importRows();
    res.status(201).json({ imported: ids.length, destination });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/expenses", guardRead, (req, res) => {
  try {
    const { from, to } = parseRange(req);
    const rows = db.prepare(
      `SELECT e.*, c.name AS category_name, creator.full_name AS created_by_name, editor.full_name AS updated_by_name
       FROM online_cash_expenses e
       JOIN online_expense_categories c ON c.id = e.category_id
       LEFT JOIN users creator ON creator.id = e.created_by
       LEFT JOIN users editor ON editor.id = e.updated_by
       WHERE e.expense_date BETWEEN ? AND ?
       ORDER BY e.expense_date DESC, e.id DESC`
    ).all(from, to);
    res.json(rows);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/expenses", guardWrite, (req, res) => {
  try {
    const expense = parseExpense(req.body);
    const info = db.prepare(
      `INSERT INTO online_cash_expenses (expense_date, category_id, description, amount, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(expense.expenseDate, expense.categoryId, expense.description, expense.amount, req.user.id, req.user.id);
    res.status(201).json(expenseById(info.lastInsertRowid));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/expenses/:id", guardWrite, (req, res) => {
  try {
    if (!expenseById(req.params.id)) return res.status(404).json({ error: "Expense not found" });
    const expense = parseExpense(req.body);
    db.prepare(
      `UPDATE online_cash_expenses SET expense_date = ?, category_id = ?, description = ?, amount = ?,
       updated_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(expense.expenseDate, expense.categoryId, expense.description, expense.amount, req.user.id, req.params.id);
    res.json(expenseById(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/expenses/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM online_cash_expenses WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Expense not found" });
  res.status(204).end();
});

router.get("/report", guardRead, (req, res) => {
  try {
    const { from, to } = parseRange(req);
    const entries = db.prepare("SELECT * FROM online_sales_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date, id").all(from, to);
    const expenses = db.prepare(
      `SELECT e.*, c.name AS category_name FROM online_cash_expenses e
       JOIN online_expense_categories c ON c.id = e.category_id
       WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date, e.id`
    ).all(from, to);

    const platformMap = Object.fromEntries(CHANNELS.map((channel) => [channel, {
      channel,
      normal_passengers: 0,
      long_passengers: 0,
      passenger_count: 0,
      sales: 0,
    }]));
    const dailyMap = new Map();
    const getDay = (date) => {
      if (!dailyMap.has(date)) dailyMap.set(date, { date, website_sales: 0, android_sales: 0, ios_sales: 0, website_android_sales: 0, cash_sales: 0, online_passengers: 0, cash_passengers: 0, expenses: 0, final_cash: 0 });
      return dailyMap.get(date);
    };

    for (const entry of entries) {
      const platform = platformMap[entry.channel];
      platform.normal_passengers += Number(entry.normal_passengers || 0);
      platform.long_passengers += Number(entry.long_passengers || 0);
      platform.passenger_count += Number(entry.passenger_count || 0);
      platform.sales += Number(entry.amount || 0);
      const day = getDay(entry.entry_date);
      day[`${entry.channel}_sales`] += Number(entry.amount || 0);
      if (entry.channel === "cash") day.cash_passengers += Number(entry.passenger_count || 0);
      else day.online_passengers += Number(entry.passenger_count || 0);
    }

    const categoryMap = new Map();
    for (const expense of expenses) {
      const amount = Number(expense.amount || 0);
      const day = getDay(expense.expense_date);
      day.expenses += amount;
      const category = categoryMap.get(expense.category_id) || { category_id: expense.category_id, category_name: expense.category_name, total: 0, entry_count: 0, days: new Set() };
      category.total += amount;
      category.entry_count += 1;
      category.days.add(expense.expense_date);
      categoryMap.set(expense.category_id, category);
    }

    const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    for (const platform of Object.values(platformMap)) platform.sales = round(platform.sales);
    const digitalPlatforms = CHANNELS.filter((channel) => channel !== "cash");
    const onlineSale = digitalPlatforms.reduce((sum, channel) => sum + platformMap[channel].sales, 0);
    const cashSale = platformMap.cash.sales;
    const totalExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({
      ...day,
      website_sales: round(day.website_sales),
      android_sales: round(day.android_sales),
      website_android_sales: round(day.website_android_sales),
      ios_sales: round(day.ios_sales),
      cash_sales: round(day.cash_sales),
      expenses: round(day.expenses),
      final_cash: round(day.cash_sales - day.expenses),
    }));

    res.json({
      from,
      to,
      platforms: Object.values(platformMap).filter((platform) => platform.channel !== "website_android" || platform.passenger_count > 0 || platform.sales > 0),
      has_legacy_entries: platformMap.website_android.passenger_count > 0 || platformMap.website_android.sales > 0,
      totals: {
        online_sale: round(onlineSale),
        cash_sale: round(cashSale),
        combined_sale: round(onlineSale + cashSale),
        total_expense: round(totalExpense),
        final_cash: round(cashSale - totalExpense),
        online_passengers: digitalPlatforms.reduce((sum, channel) => sum + platformMap[channel].passenger_count, 0),
        cash_passengers: platformMap.cash.passenger_count,
      },
      expense_categories: [...categoryMap.values()].map((category) => ({ ...category, total: round(category.total), days_used: category.days.size, days: undefined })).sort((a, b) => b.total - a.total),
      daily,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
