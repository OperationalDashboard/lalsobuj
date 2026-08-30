const express = require("express");
const db = require("../db");
const { requireAuth, requireRole, requireModulePermission } = require("../middleware/auth");
const { FULL_ACCESS, ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);
const MAINTENANCE_STATUSES = ["open", "in_progress", "long_maintenance", "resolved"];

function validateMaintenanceStatus(req, res) {
  if (req.body.status === undefined) return true;
  if (!MAINTENANCE_STATUSES.includes(req.body.status)) {
    res.status(400).json({ error: "Choose a valid maintenance status" });
    return false;
  }
  return true;
}

// Maintenance role always has write access here; other roles need an
// explicit grant from Admin via Users & Permissions.
function guardWrite(req, res, next) {
  if (FULL_ACCESS.includes(req.user.role) || req.user.role === ROLES.MAINTENANCE) return next();
  return requireModulePermission("maintenance", "write")(req, res, next);
}

// Posting/removing a ticket's cost as a bus expense is a deliberate
// accounting decision — Admin/Super Admin or the Accounts role only.
const guardExpense = requireRole(...FULL_ACCESS, ROLES.ACCOUNTS);

function withParts(ticket) {
  const parts = db
    .prepare("SELECT * FROM maintenance_parts WHERE maintenance_id = ? ORDER BY changed_date DESC, id DESC")
    .all(ticket.id);
  const total_cost = parts.reduce((sum, p) => sum + p.cost, 0);
  return { ...ticket, parts, total_cost };
}

// A bus can't be shown/used as "active" anywhere while it has an open or
// in-progress maintenance ticket — this keeps that in sync automatically
// whenever a ticket is created, resolved, reopened, or deleted. Retired
// buses are left alone (maintenance doesn't un-retire a bus).
function syncBusStatus(busId) {
  const { openCount } = db
    .prepare("SELECT COUNT(*) as openCount FROM maintenance WHERE bus_id = ? AND status != 'resolved'")
    .get(busId);
  if (openCount > 0) {
    db.prepare("UPDATE buses SET status = 'maintenance' WHERE id = ? AND status != 'retired'").run(busId);
  } else {
    db.prepare("UPDATE buses SET status = 'active' WHERE id = ? AND status = 'maintenance'").run(busId);
  }
}

// --- Maintenance locations (admin/maintenance-managed list, replaces the
// old hardcoded LOCATIONS array on the client) --------------------------
router.get("/locations", (req, res) => {
  res.json(db.prepare("SELECT * FROM maintenance_locations ORDER BY name ASC").all());
});

router.post("/locations", guardWrite, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const info = db.prepare("INSERT INTO maintenance_locations (name) VALUES (?)").run(name.trim());
    res.status(201).json(db.prepare("SELECT * FROM maintenance_locations WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That place is already on the list" });
  }
});

router.put("/locations/:id", requireRole(ROLES.SUPER_ADMIN), (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const current = db.prepare("SELECT * FROM maintenance_locations WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  try {
    let updatedTickets = 0;
    db.transaction(() => {
      db.prepare("UPDATE maintenance_locations SET name = ? WHERE id = ?").run(name, req.params.id);
      updatedTickets = db.prepare("UPDATE maintenance SET location = ? WHERE lower(location) = lower(?)").run(name, current.name).changes;
    })();
    res.json({ ...db.prepare("SELECT * FROM maintenance_locations WHERE id = ?").get(req.params.id), updated_tickets: updatedTickets });
  } catch {
    res.status(400).json({ error: "That place is already on the list" });
  }
});

router.delete("/locations/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM maintenance_locations WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// --- Parts catalog (admin-managed master list) --------------------------
router.get("/parts-catalog", (req, res) => {
  res.json(db.prepare("SELECT * FROM parts_catalog ORDER BY part_name ASC").all());
});

router.post("/parts-catalog", requireRole(...FULL_ACCESS), (req, res) => {
  const { part_name, description } = req.body;
  if (!part_name || !part_name.trim()) return res.status(400).json({ error: "part_name required" });
  try {
    const info = db.prepare("INSERT INTO parts_catalog (part_name, description) VALUES (?,?)").run(part_name.trim(), description?.trim() || null);
    res.status(201).json(db.prepare("SELECT * FROM parts_catalog WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That part is already on the list" });
  }
});
router.put("/parts-catalog/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const { part_name, description } = req.body;
  if (!part_name?.trim()) return res.status(400).json({ error: "part_name required" });
  const current = db.prepare("SELECT * FROM parts_catalog WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  try {
    let updatedRecords = 0;
    db.transaction(() => {
      db.prepare("UPDATE parts_catalog SET part_name = ?, description = ? WHERE id = ?").run(part_name.trim(), description?.trim() || null, req.params.id);
      updatedRecords = db.prepare("UPDATE maintenance_parts SET part_name = ? WHERE lower(part_name) = lower(?)").run(part_name.trim(), current.part_name).changes;
    })();
    res.json({ ...db.prepare("SELECT * FROM parts_catalog WHERE id = ?").get(req.params.id), updated_records: updatedRecords });
  } catch { res.status(400).json({ error: "That part already exists" }); }
});

router.delete("/parts-catalog/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const info = db.prepare("DELETE FROM parts_catalog WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// --- "Last changed" report per part, per bus -----------------------------
router.get("/parts-report", (req, res) => {
  const { bus_id } = req.query;
  const clause = bus_id ? "WHERE m.bus_id = ?" : "";
  const params = bus_id ? [bus_id] : [];
  const rows = db
    .prepare(
      `SELECT m.bus_id, b.reg_number, mp.part_name, MAX(mp.changed_date) as last_changed, SUM(mp.cost) as total_spent
       FROM maintenance_parts mp
       JOIN maintenance m ON m.id = mp.maintenance_id
       JOIN buses b ON b.id = m.bus_id
       ${clause}
       GROUP BY m.bus_id, mp.part_name
       ORDER BY b.reg_number ASC, mp.part_name ASC`
    )
    .all(...params);
  res.json(rows);
});

// --- Maintenance tickets --------------------------------------------------
router.get("/", (req, res) => {
  const { bus_id, status } = req.query;
  const clauses = [];
  const params = [];
  if (bus_id) { clauses.push("bus_id = ?"); params.push(bus_id); }
  if (status) { clauses.push("status = ?"); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const tickets = db
    .prepare(`SELECT m.*, b.reg_number FROM maintenance m JOIN buses b ON b.id = m.bus_id ${where} ORDER BY m.reported_date DESC, m.id DESC`)
    .all(...params);
  res.json(tickets.map(withParts));
});

// Summary stats for the Reports page: total tickets, resolved count, per bus.
router.get("/summary", (req, res) => {
  const counts = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'long_maintenance' THEN 1 ELSE 0 END) AS long_maintenance
     FROM maintenance`
  ).get();
  const perBus = db
    .prepare(
      `SELECT b.id as bus_id, b.reg_number,
              COUNT(m.id) as ticket_count,
              SUM(CASE WHEN m.status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
              COALESCE((SELECT SUM(mp.cost) FROM maintenance_parts mp WHERE mp.maintenance_id IN (SELECT id FROM maintenance WHERE bus_id = b.id)), 0) as total_cost
       FROM buses b LEFT JOIN maintenance m ON m.bus_id = b.id
       GROUP BY b.id HAVING ticket_count > 0
       ORDER BY total_cost DESC`
    )
    .all();
  res.json({
    total: counts.total,
    resolved: counts.resolved || 0,
    open: counts.open || 0,
    inProgress: counts.in_progress || 0,
    longMaintenance: counts.long_maintenance || 0,
    perBus,
  });
});

router.get("/:id", (req, res) => {
  const ticket = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  res.json(withParts(ticket));
});

router.post("/", guardWrite, (req, res) => {
  if (!validateMaintenanceStatus(req, res)) return;
  const { bus_id, issue, location, reported_date, status, notes } = req.body;
  if (!bus_id || !issue || !reported_date) {
    return res.status(400).json({ error: "bus_id, issue, reported_date required" });
  }
  const info = db
    .prepare(
      `INSERT INTO maintenance (bus_id, issue, location, reported_date, status, notes)
       VALUES (?,?,?,?,?,?)`
    )
    .run(bus_id, issue, location || null, reported_date, status || "open", notes || null);
  syncBusStatus(bus_id);
  res.status(201).json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(info.lastInsertRowid)));
});

router.put("/:id", guardWrite, (req, res) => {
  if (!validateMaintenanceStatus(req, res)) return;
  const fields = ["issue", "location", "reported_date", "resolved_date", "status", "notes"];
  const present = fields.filter((f) => req.body[f] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  const ticket = db.prepare("SELECT bus_id FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  const setClause = present.map((f) => `${f} = ?`).join(", ");
  const values = present.map((f) => req.body[f]);
  const info = db.prepare(`UPDATE maintenance SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  syncBusStatus(ticket.bus_id);
  res.json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});

// Deleting a whole ticket also removes its linked expense — kept to
// Admin/Super Admin only, since it touches the financial trail.
router.delete("/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const ticket = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.linked_transaction_id) {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(ticket.linked_transaction_id);
  }
  db.prepare("DELETE FROM maintenance WHERE id = ?").run(req.params.id);
  syncBusStatus(ticket.bus_id);
  res.status(204).end();
});

// --- Parts used within a ticket -------------------------------------------
// Adding another part just extends the same ticket's total cost — this is
// what answers "a second problem turned up after the bus was already in
// for maintenance". It does NOT automatically touch Accounts anymore —
// see /post-expense below for that deliberate step.
router.post("/:id/parts", guardWrite, (req, res) => {
  const { part_name, cost, changed_date } = req.body;
  if (!part_name || cost === undefined || !changed_date) {
    return res.status(400).json({ error: "part_name, cost, changed_date required" });
  }
  const ticket = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Maintenance ticket not found" });

  db.prepare(
    "INSERT INTO maintenance_parts (maintenance_id, part_name, cost, changed_date) VALUES (?,?,?,?)"
  ).run(req.params.id, part_name, Number(cost), changed_date);

  res.status(201).json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});

router.delete("/:id/parts/:partId", guardWrite, (req, res) => {
  const info = db
    .prepare("DELETE FROM maintenance_parts WHERE id = ? AND maintenance_id = ?")
    .run(req.params.partId, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});
router.put("/:id/parts/:partId", guardWrite, (req, res) => {
  const { part_name, cost, changed_date } = req.body;
  if (!part_name || cost === undefined || !changed_date) return res.status(400).json({ error: "part_name, cost, changed_date required" });
  const info = db.prepare("UPDATE maintenance_parts SET part_name = ?, cost = ?, changed_date = ? WHERE id = ? AND maintenance_id = ?").run(part_name, Number(cost), changed_date, req.params.partId, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Repair record not found" });
  res.json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});

// --- Posting a ticket's cost as a bus expense, on purpose -----------------
// This is the "pop up as an option in the bus's accounts for the
// accountant to decide" step — Accounts/Admin choose whether a ticket's
// cost counts against that bus, rather than it happening automatically.
router.post("/:id/post-expense", guardExpense, (req, res) => {
  const ticket = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  const { total } = db
    .prepare("SELECT COALESCE(SUM(cost),0) as total FROM maintenance_parts WHERE maintenance_id = ?")
    .get(req.params.id);
  if (total <= 0) return res.status(400).json({ error: "This ticket has no part costs yet" });

  if (ticket.linked_transaction_id) {
    db.prepare("UPDATE transactions SET amount = ?, description = ? WHERE id = ?")
      .run(total, `Maintenance: ${ticket.issue}`, ticket.linked_transaction_id);
  } else {
    const info = db
      .prepare(
        `INSERT INTO transactions (bus_id, type, category, amount, description, txn_date, linked_maintenance_id, created_by)
         VALUES (?, 'expense', 'repair', ?, ?, ?, ?, ?)`
      )
      .run(ticket.bus_id, total, `Maintenance: ${ticket.issue}`, ticket.reported_date, req.params.id, req.user.id);
    db.prepare("UPDATE maintenance SET linked_transaction_id = ? WHERE id = ?").run(info.lastInsertRowid, req.params.id);
  }
  res.json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});

router.delete("/:id/post-expense", guardExpense, (req, res) => {
  const ticket = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.linked_transaction_id) {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(ticket.linked_transaction_id);
    db.prepare("UPDATE maintenance SET linked_transaction_id = NULL WHERE id = ?").run(req.params.id);
  }
  res.json(withParts(db.prepare("SELECT * FROM maintenance WHERE id = ?").get(req.params.id)));
});

module.exports = router;
