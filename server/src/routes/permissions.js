const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission } = require("../middleware/auth");
const { ROLES, ASSIGNABLE_ROLES, ROLE_LABELS, FULL_ACCESS } = require("../roles");
const { PERMISSION_FEATURES, permissionsForRole } = require("../permissionCatalog");

const router = express.Router();
router.use(requireAuth);

// GET /api/roles — every role the system knows about (built-in + custom),
// for populating role dropdowns.
router.get("/", requireFeaturePermission("users", "read"), (req, res) => {
  const custom = db.prepare("SELECT slug, label FROM custom_roles ORDER BY label ASC").all();
  const builtIn = ASSIGNABLE_ROLES.map((slug) => ({ slug, label: ROLE_LABELS[slug] }));
  res.json({ builtIn, custom, features: PERMISSION_FEATURES });
});

// Only Admin/Super Admin can create new roles.
router.post("/", requireFeaturePermission("users", "write"), (req, res) => {
  const { slug, label } = req.body;
  if (!slug || !label) return res.status(400).json({ error: "slug and label required" });
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!cleanSlug) return res.status(400).json({ error: "slug must contain letters or numbers" });
  if (ASSIGNABLE_ROLES.includes(cleanSlug) || cleanSlug === ROLES.SUPER_ADMIN) {
    return res.status(400).json({ error: "That role name is already built in" });
  }
  try {
    const info = db
      .prepare("INSERT INTO custom_roles (slug, label, created_by) VALUES (?,?,?)")
      .run(cleanSlug, label.trim(), req.user.id);
    res.status(201).json(db.prepare("SELECT * FROM custom_roles WHERE id = ?").get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: "A role with that name already exists" });
  }
});

router.delete("/:slug", requireFeaturePermission("users", "write"), (req, res) => {
  const inUse = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = ?").get(req.params.slug).c;
  if (inUse > 0) return res.status(400).json({ error: "Can't delete a role that's still assigned to a user" });
  db.prepare("DELETE FROM role_permissions WHERE role = ?").run(req.params.slug);
  const info = db.prepare("DELETE FROM custom_roles WHERE slug = ?").run(req.params.slug);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// GET /api/roles/:role/permissions — current module grants for a role.
router.get("/:role/permissions", requireFeaturePermission("users", "read"), (req, res) => {
  res.json(permissionsForRole(db, req.params.role));
});

// PUT /api/roles/:role/permissions — bulk upsert: { buses: {can_read, can_write}, ... }
router.put("/:role/permissions", requireFeaturePermission("users", "write"), (req, res) => {
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, module, can_read, can_write) VALUES (?,?,?,?)
     ON CONFLICT(role, module) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write`
  );
  // Turso's embedded-replica driver can reject the synchronous
  // db.transaction() wrapper before any statement runs. Each upsert is
  // independently idempotent, so saving the grants sequentially is safe to
  // retry and works for both local SQLite and the production Turso database.
  const grants = req.body || {};
  for (const feature of PERMISSION_FEATURES) {
    const grant = grants[feature.key] || {};
    const canWrite = feature.can_edit && Boolean(grant.can_write);
    const canRead = Boolean(grant.can_read) || canWrite;
    upsert.run(req.params.role, feature.key, canRead ? 1 : 0, canWrite ? 1 : 0);
  }
  res.json({ updated: true });
});

module.exports = router;
