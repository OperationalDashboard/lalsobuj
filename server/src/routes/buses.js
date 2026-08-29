const express = require("express");
const db = require("../db");
const { requireAuth, requireRole, requireModulePermission } = require("../middleware/auth");
const { FULL_ACCESS, ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireModulePermission("buses", "write");

const DEFAULT_BUS_CLASSES = ["AC", "Non AC", "Sleeper"];
const WRITABLE = ["reg_number", "model", "class_type", "capacity", "route", "status"];

function busClassTypes() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'bus_class_types'").get();
  try {
    const parsed = JSON.parse(row?.value || "null");
    return Array.isArray(parsed) && parsed.length ? parsed.map(String) : DEFAULT_BUS_CLASSES;
  } catch {
    return DEFAULT_BUS_CLASSES;
  }
}

function validateClassType(req, res) {
  if (req.body.class_type === undefined || req.body.class_type === null) return true;
  const classType = String(req.body.class_type).trim();
  if (classType && !busClassTypes().some((item) => item.toLowerCase() === classType.toLowerCase())) {
    res.status(400).json({ error: "Choose a bus class configured in Settings" });
    return false;
  }
  req.body.class_type = classType || null;
  return true;
}

// The bus's status is always computed fresh from open maintenance tickets
// at read time — not just trusted from the stored column. This makes it
// self-healing: a bus can never show "active" while it has an unresolved
// maintenance ticket, no matter which code path touched it last.
const STATUS_SELECT = `
  CASE
    WHEN b.status = 'retired' THEN 'retired'
    WHEN EXISTS (SELECT 1 FROM maintenance m WHERE m.bus_id = b.id AND m.status != 'resolved') THEN 'maintenance'
    ELSE 'active'
  END`;

router.get("/", (req, res) => {
  res.json(db.prepare(`SELECT b.*, ${STATUS_SELECT} as status FROM buses b ORDER BY b.reg_number ASC`).all());
});

router.get("/:id", (req, res) => {
  const row = db.prepare(`SELECT b.*, ${STATUS_SELECT} as status FROM buses b WHERE b.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/", guardWrite, (req, res) => {
  if (!validateClassType(req, res)) return;
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });
  const placeholders = present.map(() => "?").join(",");
  const values = present.map((c) => req.body[c]);
  const info = db.prepare(`INSERT INTO buses (${present.join(",")}) VALUES (${placeholders})`).run(...values);
  res.status(201).json(db.prepare("SELECT * FROM buses WHERE id = ?").get(info.lastInsertRowid));
});

router.put("/:id", guardWrite, (req, res) => {
  if (!validateClassType(req, res)) return;
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });
  const setClause = present.map((c) => `${c} = ?`).join(", ");
  const values = present.map((c) => req.body[c]);
  const info = db.prepare(`UPDATE buses SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM buses WHERE id = ?").get(req.params.id));
});

// Status-only change: Admin/Super Admin always, plus Maintenance (they're
// the ones who know when a bus is pulled off the road or back in service).
router.put("/:id/status", requireRole(...FULL_ACCESS, ROLES.MAINTENANCE), (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  const info = db.prepare("UPDATE buses SET status = ? WHERE id = ?").run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM buses WHERE id = ?").get(req.params.id));
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM buses WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
