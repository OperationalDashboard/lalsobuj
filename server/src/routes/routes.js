const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { FULL_ACCESS, ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireRole(...FULL_ACCESS, ROLES.CONTROL_COUNTER);

// GET /api/routes?active=1 — anyone logged in can read (needed for the
// route dropdown when starting a trip or building the duty roster).
// Includes the return route's name so the UI can show "returns via X".
router.get("/", (req, res) => {
  const { active } = req.query;
  const where = active ? "WHERE r.is_active = 1" : "";
  res.json(
    db
      .prepare(
        `SELECT r.*, ret.name as return_route_name
         FROM routes r LEFT JOIN routes ret ON ret.id = r.return_route_id
         ${where} ORDER BY r.name ASC`
      )
      .all()
  );
});

// A route optionally names its own return_route_id — the route a bus is
// expected to come back on. This is what lets two trips auto-pair into a
// single rotation (see trips.js). Setting A's return route to B does NOT
// automatically set B's return route to A — that's a deliberate choice
// left to Admin/Control Counter, since not every route is a clean mirror.
router.post("/", guardWrite, (req, res) => {
  const { name, return_route_id, full_trip_minutes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const info = db
      .prepare("INSERT INTO routes (name, return_route_id, full_trip_minutes) VALUES (?,?,?)")
      .run(name.trim(), return_route_id || null, full_trip_minutes || null);
    res.status(201).json(db.prepare("SELECT * FROM routes WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That route already exists" });
  }
});

router.put("/:id", guardWrite, (req, res) => {
  const { name, is_active, return_route_id, full_trip_minutes } = req.body;
  const present = [];
  const values = [];
  if (name !== undefined) { present.push("name = ?"); values.push(name); }
  if (is_active !== undefined) { present.push("is_active = ?"); values.push(is_active ? 1 : 0); }
  if (return_route_id !== undefined) { present.push("return_route_id = ?"); values.push(return_route_id || null); }
  if (full_trip_minutes !== undefined) { present.push("full_trip_minutes = ?"); values.push(full_trip_minutes || null); }
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  const info = db.prepare(`UPDATE routes SET ${present.join(", ")} WHERE id = ?`).run(...values, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json(db.prepare("SELECT * FROM routes WHERE id = ?").get(req.params.id));
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM routes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
