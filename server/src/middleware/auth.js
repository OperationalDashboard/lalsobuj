const jwt = require("jsonwebtoken");
const db = require("../db");
const { FULL_ACCESS } = require("../roles");
const { hasFeaturePermission, hasAnyFeaturePermission } = require("../permissionCatalog");

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
  return requireFeaturePermission(moduleName, mode);
}

function requireFeaturePermission(featureKey, mode = "write") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Missing token" });
    if (!hasFeaturePermission(db, req.user.role, featureKey, mode)) {
      return res.status(403).json({ error: `You do not have ${mode === "write" ? "Edit" : "View"} permission for this feature` });
    }
    next();
  };
}

function requireAnyFeaturePermission(featureKeys, mode = "write") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Missing token" });
    if (!hasAnyFeaturePermission(db, req.user.role, featureKeys, mode)) {
      return res.status(403).json({ error: `You do not have ${mode === "write" ? "Edit" : "View"} permission for this feature` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireModulePermission, requireFeaturePermission, requireAnyFeaturePermission };
