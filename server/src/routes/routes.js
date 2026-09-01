const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireFeaturePermission("routes", "write");

function routeNameKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function findEquivalentRoute(name, excludeId = null) {
  const key = routeNameKey(name);
  return db.prepare("SELECT id, name FROM routes").all().find((route) => (
    String(route.id) !== String(excludeId ?? "") && routeNameKey(route.name) === key
  ));
}

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
  const cleanName = name.trim();
  if (findEquivalentRoute(cleanName)) return res.status(400).json({ error: "That route already exists" });
  try {
    const info = db
      .prepare("INSERT INTO routes (name, return_route_id, full_trip_minutes) VALUES (?,?,?)")
      .run(cleanName, return_route_id || null, full_trip_minutes || null);
    res.status(201).json(db.prepare("SELECT * FROM routes WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That route already exists" });
  }
});

router.put("/:id", guardWrite, (req, res) => {
  const { name, is_active, return_route_id, full_trip_minutes } = req.body;
  const current = db.prepare("SELECT * FROM routes WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  const present = [];
  const values = [];
  let cleanName = current.name;
  if (name !== undefined) {
    cleanName = String(name).trim();
    if (!cleanName) return res.status(400).json({ error: "name required" });
    if (findEquivalentRoute(cleanName, req.params.id)) return res.status(400).json({ error: "That route already exists" });
    present.push("name = ?");
    values.push(cleanName);
  }
  if (is_active !== undefined) { present.push("is_active = ?"); values.push(is_active ? 1 : 0); }
  if (return_route_id !== undefined) { present.push("return_route_id = ?"); values.push(return_route_id || null); }
  if (full_trip_minutes !== undefined) { present.push("full_trip_minutes = ?"); values.push(full_trip_minutes || null); }
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  try {
    db.prepare(`UPDATE routes SET ${present.join(", ")} WHERE id = ?`).run(...values, req.params.id);
    let updatedLinkedRecords = 0;
    if (name !== undefined && cleanName !== current.name) {
      updatedLinkedRecords += db.prepare("UPDATE buses SET route = ? WHERE route = ?").run(cleanName, current.name).changes;
      updatedLinkedRecords += db.prepare("UPDATE rotations SET route = ? WHERE route = ?").run(cleanName, current.name).changes;
      updatedLinkedRecords += db.prepare("UPDATE trips SET route = ? WHERE route = ?").run(cleanName, current.name).changes;
    }
    res.json({ ...db.prepare("SELECT * FROM routes WHERE id = ?").get(req.params.id), updated_linked_records: updatedLinkedRecords });
  } catch (err) {
    const duplicateName = String(err?.message || "").toLowerCase().includes("unique");
    res.status(400).json({ error: duplicateName ? "That route already exists" : "Could not update route details" });
  }
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM routes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
