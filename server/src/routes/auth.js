const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES, ASSIGNABLE_ROLES, FULL_ACCESS } = require("../roles");

const router = express.Router();
const attempts = new Map();
function loginRateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, started: now };
  if (now - record.started > 15 * 60 * 1000) { record.count = 0; record.started = now; }
  if (record.count >= 10) return res.status(429).json({ error: "Too many login attempts. Try again in a few minutes." });
  record.count += 1; attempts.set(key, record);
  next();
}

function isValidRole(role) {
  if (ASSIGNABLE_ROLES.includes(role)) return true;
  const custom = db.prepare("SELECT 1 FROM custom_roles WHERE slug = ?").get(role);
  return Boolean(custom);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, staff_id: user.staff_id || null },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "12h" }
  );
}

router.post("/login", loginRateLimit, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken(user);
  attempts.delete(req.ip || "unknown");
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, staff_id: user.staff_id },
  });
});

// Includes the linked staff record + counter name, so the frontend can
// show "logging as: <counter name>" for Counter-role users. For roles
// that aren't Admin/Super Admin/one of the special built-ins, also
// includes their own module permissions so the UI can build nav links —
// this is the one thing a non-Admin is allowed to read from role_permissions,
// and only for their own role.
router.get("/me", requireAuth, (req, res) => {
  let staff = null;
  if (req.user.staff_id) {
    staff = db
      .prepare(
        `SELECT s.*, c.name as counter_name FROM staff s
         LEFT JOIN counters c ON c.id = s.counter_id
         WHERE s.id = ?`
      )
      .get(req.user.staff_id);
  }

  let permissions = null;
  if (!FULL_ACCESS.includes(req.user.role)) {
    const rows = db.prepare("SELECT module, can_read, can_write FROM role_permissions WHERE role = ?").all(req.user.role);
    permissions = {};
    rows.forEach((r) => { permissions[r.module] = { can_read: !!r.can_read, can_write: !!r.can_write }; });
  }

  res.json({ user: req.user, staff, permissions });
});

// --- User / role management -------------------------------------------
// Only Admin and Super Admin can view or manage the user list.
router.use("/users", requireAuth, requireRole(...FULL_ACCESS));

router.get("/users", (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.staff_id, u.created_at, s.name as staff_name
       FROM users u LEFT JOIN staff s ON s.id = u.staff_id`
    )
    .all();
  res.json(users);
});

router.post("/users", (req, res) => {
  const { username, password, full_name, role, staff_id } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: "username, password, full_name, role required" });
  }
  if (!isValidRole(role)) {
    return res.status(400).json({ error: "Unknown role" });
  }
  if (staff_id) {
    const staff = db.prepare("SELECT id FROM staff WHERE id = ?").get(staff_id);
    if (!staff) return res.status(400).json({ error: "That staff member doesn't exist" });
    const alreadyLinked = db.prepare("SELECT id FROM users WHERE staff_id = ?").get(staff_id);
    if (alreadyLinked) return res.status(400).json({ error: "That staff member already has a login" });
  }
  const password_hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare("INSERT INTO users (username, password_hash, full_name, role, staff_id) VALUES (?,?,?,?,?)")
      .run(username, password_hash, full_name, role, staff_id || null);
    res.status(201).json(
      db.prepare("SELECT id, username, full_name, role, staff_id, created_at FROM users WHERE id = ?").get(info.lastInsertRowid)
    );
  } catch (err) {
    res.status(400).json({ error: "Username may already exist" });
  }
});

// Change a user's role, name, staff link, or password. The Super Admin
// account is completely protected — it can't be edited through the API
// by anyone, including another Admin.
router.put("/users/:id", (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: "The Super Admin account cannot be modified" });
  }

  const { role, full_name, password, staff_id } = req.body;
  const updates = [];
  const values = [];

  if (role !== undefined) {
    if (!isValidRole(role)) return res.status(400).json({ error: "Unknown role" });
    updates.push("role = ?");
    values.push(role);
  }
  if (full_name !== undefined) {
    updates.push("full_name = ?");
    values.push(full_name);
  }
  if (password) {
    updates.push("password_hash = ?");
    values.push(bcrypt.hashSync(password, 10));
  }
  if (staff_id !== undefined) {
    if (staff_id) {
      const alreadyLinked = db.prepare("SELECT id FROM users WHERE staff_id = ? AND id != ?").get(staff_id, req.params.id);
      if (alreadyLinked) return res.status(400).json({ error: "That staff member already has a login" });
    }
    updates.push("staff_id = ?");
    values.push(staff_id || null);
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields provided" });

  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values, req.params.id);
  res.json(db.prepare("SELECT id, username, full_name, role, staff_id, created_at FROM users WHERE id = ?").get(req.params.id));
});

// Same Super Admin protection applies to deletion.
router.delete("/users/:id", (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: "The Super Admin account cannot be deleted" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
