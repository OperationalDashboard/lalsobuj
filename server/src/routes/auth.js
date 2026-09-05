const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireRole, requireFeaturePermission } = require("../middleware/auth");
const { ROLES, ASSIGNABLE_ROLES, FULL_ACCESS } = require("../roles");
const { permissionsForRole } = require("../permissionCatalog");

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

function signToken(user, sessionId) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, staff_id: user.staff_id || null, session_id: sessionId },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "12h" }
  );
}

function detectDevice(userAgent = "") {
  const ua = String(userAgent);
  let deviceType = "Computer";
  let deviceName = "Other";
  if (/iPhone|iPod/i.test(ua)) { deviceType = "Phone"; deviceName = "iPhone"; }
  else if (/iPad/i.test(ua)) { deviceType = "Tablet"; deviceName = "iPad"; }
  else if (/Android/i.test(ua)) { deviceType = /Mobile/i.test(ua) ? "Phone" : "Tablet"; deviceName = "Android"; }
  else if (/Windows/i.test(ua)) deviceName = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) deviceName = "Mac";
  else if (/Linux/i.test(ua)) deviceName = "Linux";

  let browserName = "Browser";
  if (/Edg\//i.test(ua)) browserName = "Microsoft Edge";
  else if (/OPR\//i.test(ua)) browserName = "Opera";
  else if (/CriOS|Chrome\//i.test(ua)) browserName = "Google Chrome";
  else if (/FxiOS|Firefox\//i.test(ua)) browserName = "Firefox";
  else if (/Safari\//i.test(ua)) browserName = "Safari";
  return { deviceType, deviceName, browserName };
}

function requestSessionId(req) {
  if (req.user?.session_id) return req.user.session_id;
  const fingerprint = crypto.createHash("sha256").update(String(req.headers["user-agent"] || "unknown")).digest("hex").slice(0, 18);
  return `legacy-${req.user.id}-${fingerprint}`;
}

function updatePresence(req, sessionId, userId = req.user?.id, signedIn = false) {
  const device = detectDevice(req.headers["user-agent"]);
  db.prepare(
    `INSERT INTO user_presence (session_id, user_id, device_type, device_name, browser_name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       user_id = excluded.user_id,
       device_type = excluded.device_type,
       device_name = excluded.device_name,
       browser_name = excluded.browser_name,
       last_seen_at = datetime('now'),
       signed_out_at = NULL`
  ).run(sessionId, userId, device.deviceType, device.deviceName, device.browserName);
  if (signedIn) {
    db.prepare("UPDATE user_presence SET signed_in_at = datetime('now'), last_seen_at = datetime('now'), signed_out_at = NULL WHERE session_id = ?").run(sessionId);
  }
}

router.post("/login", loginRateLimit, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  db.prepare("DELETE FROM user_presence WHERE last_seen_at < datetime('now', '-30 days')").run();
  const sessionId = crypto.randomUUID();
  updatePresence(req, sessionId, user.id, true);
  const token = signToken(user, sessionId);
  attempts.delete(req.ip || "unknown");
  const permissions = FULL_ACCESS.includes(user.role) ? null : permissionsForRole(db, user.role);
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, staff_id: user.staff_id, permissions },
  });
});

// Authenticated users can change only their own sign-in credentials. Requiring
// the current password keeps even an unattended admin session from silently
// changing the account owner. A fresh token is returned because the username
// is embedded in the session token.
router.put("/credentials", requireAuth, (req, res) => {
  const currentPassword = String(req.body.current_password || "");
  const username = String(req.body.username || "").trim();
  const newPassword = String(req.body.new_password || "");

  if (!currentPassword) return res.status(400).json({ error: "Current password is required" });
  if (!username && !newPassword) return res.status(400).json({ error: "Enter a new username or password" });

  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!current || !bcrypt.compareSync(currentPassword, current.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const updates = [];
  const values = [];

  if (username) {
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3–40 characters using letters, numbers, dot, underscore, or dash" });
    }
    const existing = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, req.user.id);
    if (existing) return res.status(400).json({ error: "That username is already in use" });
    updates.push("username = ?");
    values.push(username);
  }

  if (newPassword) {
    if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
    updates.push("password_hash = ?");
    values.push(bcrypt.hashSync(newPassword, 10));
  }

  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values, req.user.id);
  const user = db.prepare("SELECT id, username, full_name, role, staff_id FROM users WHERE id = ?").get(req.user.id);
  const sessionId = requestSessionId(req);
  updatePresence(req, sessionId, req.user.id);
  res.json({ token: signToken(user, sessionId), user });
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
    permissions = permissionsForRole(db, req.user.role);
  }

  res.json({ user: req.user, staff, permissions });
});

// Every authenticated page sends a small heartbeat. Older tokens issued
// before presence tracking receive a stable per-user/device fallback session
// so deployment does not force everyone to sign in again.
router.post("/presence/heartbeat", requireAuth, (req, res) => {
  updatePresence(req, requestSessionId(req), req.user.id);
  res.json({ ok: true });
});

router.post("/presence/logout", requireAuth, (req, res) => {
  db.prepare("UPDATE user_presence SET signed_out_at = datetime('now'), last_seen_at = datetime('now') WHERE session_id = ?").run(requestSessionId(req));
  res.json({ ok: true });
});

router.get("/presence", requireAuth, requireRole(ROLES.SUPER_ADMIN), (req, res) => {
  const rows = db.prepare(
    `SELECT p.session_id, p.user_id, u.username, u.full_name, u.role,
            p.device_type, p.device_name, p.browser_name,
            p.signed_in_at, p.last_seen_at,
            CAST((julianday('now') - julianday(p.last_seen_at)) * 86400 AS INTEGER) AS seconds_since_seen
     FROM user_presence p
     JOIN users u ON u.id = p.user_id
     WHERE p.signed_out_at IS NULL
       AND p.last_seen_at >= datetime('now', '-2 minutes')
     ORDER BY p.last_seen_at DESC, p.signed_in_at DESC`
  ).all();
  res.json(rows);
});

// --- User / role management -------------------------------------------
// Only Admin and Super Admin can view or manage the user list.
router.use("/users", requireAuth);

router.get("/users", requireFeaturePermission("users", "read"), (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.staff_id, u.created_at, s.name as staff_name
       FROM users u LEFT JOIN staff s ON s.id = u.staff_id`
    )
    .all();
  res.json(users);
});

router.post("/users", requireFeaturePermission("users", "write"), (req, res) => {
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
router.put("/users/:id", requireFeaturePermission("users", "write"), (req, res) => {
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
router.delete("/users/:id", requireFeaturePermission("users", "write"), (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: "The Super Admin account cannot be deleted" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
