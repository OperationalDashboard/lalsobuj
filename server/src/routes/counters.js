const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission, requireAnyFeaturePermission } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const guardWrite = requireFeaturePermission("counters", "write");
const guardCounterOrSettingsWrite = requireAnyFeaturePermission(["counters", "settings"], "write");

// GET /api/counters — anyone logged in can read (needed to display/assign
// which counter a staff member is posted at).
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT c.*, p.name AS place_name FROM counters c LEFT JOIN expense_places p ON p.id = c.place_id ORDER BY p.name, c.name").all());
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM counters WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/", guardWrite, (req, res) => {
  const { name, location, place_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const info = db.prepare("INSERT INTO counters (name, location, place_id) VALUES (?,?,?)").run(name.trim(), location || null, place_id || null);
    res.status(201).json(db.prepare("SELECT * FROM counters WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That counter already exists" });
  }
});

router.put("/:id", guardCounterOrSettingsWrite, (req, res) => {
  const { name, location, place_id } = req.body;
  const present = [];
  const values = [];
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) return res.status(400).json({ error: "name required" });
    present.push("name = ?");
    values.push(cleanName);
  }
  if (location !== undefined) {
    const cleanLocation = String(location || "").trim();
    present.push("location = ?");
    values.push(cleanLocation || null);
  }
  if (place_id !== undefined) { present.push("place_id = ?"); values.push(place_id || null); }
  if (!present.length) return res.status(400).json({ error: "No valid fields" });
  try {
    const info = db.prepare(`UPDATE counters SET ${present.join(", ")} WHERE id = ?`).run(...values, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json(db.prepare("SELECT * FROM counters WHERE id = ?").get(req.params.id));
  } catch (err) {
    const duplicateName = String(err?.message || "").toLowerCase().includes("unique");
    res.status(400).json({ error: duplicateName ? "That counter name is already in use" : "Could not update counter details" });
  }
});

router.delete("/:id", guardWrite, (req, res) => {
  const info = db.prepare("DELETE FROM counters WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
