const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ROLES } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// Simple shared office chat room, kept to the last 100 messages.
// Frontend polls this every few seconds. Swap for websockets later if
// real-time delivery becomes important.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.message, c.created_at, u.id as sender_id, u.full_name as sender_name
       FROM chat_messages c JOIN users u ON u.id = c.sender_id
       ORDER BY c.id DESC LIMIT 100`
    )
    .all();
  res.json(rows.reverse());
});

router.post("/", (req, res) => {
  if (req.user.role === ROLES.MONITOR) {
    return res.status(403).json({ error: "Monitor role is read-only" });
  }
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: "message required" });
  const info = db
    .prepare("INSERT INTO chat_messages (sender_id, message) VALUES (?,?)")
    .run(req.user.id, message.trim());
  const row = db
    .prepare(
      `SELECT c.id, c.message, c.created_at, u.id as sender_id, u.full_name as sender_name
       FROM chat_messages c JOIN users u ON u.id = c.sender_id WHERE c.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

module.exports = router;
