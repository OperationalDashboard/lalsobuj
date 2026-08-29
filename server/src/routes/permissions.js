const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES, ASSIGNABLE_ROLES, ROLE_LABELS, FULL_ACCESS } = require("../roles");

const router = express.Router();
router.use(requireAuth);

// Modules whose write access can be granted via role_permissions.
// (Live Activity's per-checkpoint rules stay fixed in activityLogs.js.)
const PERMISSION_MODULES = ["buses", "staff", "rotations", "attendance", "accounts", "maintenance"];

// GET /api/roles — every role the system knows about (built-in + custom),
// for populating role dropdowns.
router.get("/", (req, res) => {
  const custom = db.prepare("SELECT slug, label FROM custom_roles ORDER BY label ASC").all();
  const builtIn = ASSIGNABLE_ROLES.map((slug) => ({ slug, label: ROLE_LABELS[slug] }));
  res.json({ builtIn, custom, modules: PERMISSION_MODULES });
});

// Only Admin/Super Admin can create new roles.
router.post("/", requireRole(...FULL_ACCESS), (req, res) => {
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

router.delete("/:slug", requireRole(...FULL_ACCESS), (req, res) => {
  const inUse = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = ?").get(req.params.slug).c;
  if (inUse > 0) return res.status(400).json({ error: "Can't delete a role that's still assigned to a user" });
  db.prepare("DELETE FROM role_permissions WHERE role = ?").run(req.params.slug);
  const info = db.prepare("DELETE FROM custom_roles WHERE slug = ?").run(req.params.slug);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// GET /api/roles/:role/permissions — current module grants for a role.
router.get("/:role/permissions", requireRole(...FULL_ACCESS), (req, res) => {
  const rows = db.prepare("SELECT module, can_read, can_write FROM role_permissions WHERE role = ?").all(req.params.role);
  const byModule = {};
  PERMISSION_MODULES.forEach((m) => { byModule[m] = { can_read: true, can_write: false }; });
  rows.forEach((r) => { byModule[r.module] = { can_read: !!r.can_read, can_write: !!r.can_write }; });
  res.json(byModule);
});

// PUT /api/roles/:role/permissions — bulk upsert: { buses: {can_read, can_write}, ... }
router.put("/:role/permissions", requireRole(...FULL_ACCESS), (req, res) => {
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, module, can_read, can_write) VALUES (?,?,?,?)
     ON CONFLICT(role, module) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write`
  );
  const tx = db.transaction((grants) => {
    for (const module of PERMISSION_MODULES) {
      const grant = grants[module];
      if (!grant) continue;
      upsert.run(req.params.role, module, grant.can_read ? 1 : 0, grant.can_write ? 1 : 0);
    }
  });
  tx(req.body || {});
  res.json({ updated: true });
});

module.exports = router;
