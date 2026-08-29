const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { FULL_ACCESS } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// Anyone logged in can read the list (needed for the Hotel Break dropdown).
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM hotels ORDER BY name ASC").all());
});

// Only Admin/Super Admin manage which hotels appear in that dropdown.
router.post("/", requireRole(...FULL_ACCESS), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const info = db.prepare("INSERT INTO hotels (name) VALUES (?)").run(name.trim());
    res.status(201).json(db.prepare("SELECT * FROM hotels WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "That hotel is already on the list" });
  }
});

router.delete("/:id", requireRole(...FULL_ACCESS), (req, res) => {
  const info = db.prepare("DELETE FROM hotels WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

module.exports = router;
