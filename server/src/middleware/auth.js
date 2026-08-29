const jwt = require("jsonwebtoken");
const db = require("../db");
const { FULL_ACCESS } = require("../roles");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Usage: requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Usage: requireModulePermission('buses', 'write')
// Admin/Super Admin always pass. Everyone else is checked against the
// role_permissions table Admin manages from Users & Permissions, so
// Admin can grant a built-in or custom role access to a module without
// a code change.
function requireModulePermission(moduleName, mode = "write") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Missing token" });
    if (FULL_ACCESS.includes(req.user.role)) return next();

    const row = db
      .prepare("SELECT can_read, can_write FROM role_permissions WHERE role = ? AND module = ?")
      .get(req.user.role, moduleName);
    const allowed = row && (mode === "read" ? row.can_read : row.can_write);
    if (!allowed) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

module.exports = { requireAuth, requireRole, requireModulePermission };
