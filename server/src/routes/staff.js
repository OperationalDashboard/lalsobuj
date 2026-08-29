const express = require("express");
const db = require("../db");
const { requireAuth, requireModulePermission } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireModulePermission("staff", "write");

const WRITABLE = ["name", "designation", "phone", "nid_number", "joining_date", "assigned_bus_id", "counter_id", "status"];

router.get("/", (req, res) => {
  res.json(
    db.prepare(
      `SELECT s.*, c.name as counter_name FROM staff s LEFT JOIN counters c ON c.id = s.counter_id ORDER BY s.name ASC`
    ).all()
  );
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// By default only Admin/Super Admin can add or change staff — Admin can
// extend this to other roles via Users & Permissions.
router.post("/", guardWrite, (req, res) => {
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });
  const placeholders = present.map(() => "?").join(",");
  const values = present.map((c) => req.body[c]);
  const info = db
    .prepare(`INSERT INTO staff (${present.join(",")}, status_changed_at) VALUES (${placeholders}, datetime('now'))`)
    .run(...values);
  res.status(201).json(db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid));
});

// If `status` changes, status_changed_at is stamped with the current
// server time automatically — it's never something you type in.
router.put("/:id", guardWrite, (req, res) => {
  const present = WRITABLE.filter((c) => req.body[c] !== undefined);
  if (!present.length) return res.status(400).json({ error: "No valid fields provided" });

  const current = db.prepare("SELECT status FROM staff WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });

  const setClauses = present.map((c) => `${c} = ?`);
  const values = present.map((c) => req.body[c]);
  if (req.body.status !== undefined && req.body.status !== current.status) {
    setClauses.push("status_changed_at = datetime('now')");
  }

  db.prepare(`UPDATE staff SET ${setClauses.join(", ")} WHERE id = ?`).run(...values, req.params.id);
  res.json(db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id));
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM staff WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
