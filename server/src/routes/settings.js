const express = require("express");
const db = require("../db");
const { requireAuth, requireRole, requireFeaturePermission } = require("../middleware/auth");
const { ROLES } = require("../roles");
const { DEFAULT_STAFF_TYPES, getStaffTypes } = require("../staffTypes");

const router = express.Router();

const NAV_ROUTES = [
  "/", "/live-activity", "/accounts", "/rotation", "/attendance", "/staff",
  "/online-accounts", "/buses", "/routes", "/counters", "/maintenance", "/reports", "/salary",
  "/trash", "/chat", "/users", "/settings",
];

const DEFAULTS = {
  theme_primary_color: "#046a38",
  theme_accent_color: "#d21f3c",
  app_name: "Lal Sabuj Paribahan",
  dedicated_call_name: "",
  dedicated_call_phone: "",
  login_logo_data: "",
  login_background_data: "",
  bus_class_types: JSON.stringify(["AC", "Non AC", "Sleeper"]),
  bus_categories: JSON.stringify(["Economy (AC)", "Economy (NON AC)", "Suite-Class AC (AC)", "Sleeper (AC)"]),
  staff_types: JSON.stringify(DEFAULT_STAFF_TYPES),
  sidebar_nav_order: JSON.stringify(NAV_ROUTES),
};

function getBusClasses() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'bus_class_types'").get();
  try {
    const parsed = JSON.parse(row?.value ?? DEFAULTS.bus_class_types);
    return Array.isArray(parsed) ? parsed.map(String) : JSON.parse(DEFAULTS.bus_class_types);
  } catch {
    return JSON.parse(DEFAULTS.bus_class_types);
  }
}

function getBusCategories() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'bus_categories'").get();
  try {
    const parsed = JSON.parse(row?.value ?? DEFAULTS.bus_categories);
    return Array.isArray(parsed) ? parsed.map(String) : JSON.parse(DEFAULTS.bus_categories);
  } catch {
    return JSON.parse(DEFAULTS.bus_categories);
  }
}

function cleanStaffTypeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function saveSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
}

function isValidNavOrder(order) {
  return Array.isArray(order)
    && order.length === NAV_ROUTES.length
    && new Set(order).size === NAV_ROUTES.length
    && NAV_ROUTES.every((route) => order.includes(route));
}

function normalizeNavOrder(order) {
  const normalized = [];
  const seen = new Set();
  for (const route of Array.isArray(order) ? order : []) {
    if (NAV_ROUTES.includes(route) && !seen.has(route)) {
      normalized.push(route);
      seen.add(route);
    }
  }
  for (const route of NAV_ROUTES) {
    if (!seen.has(route)) normalized.push(route);
  }
  return normalized;
}

function preventCaching(res) {
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
}

// Public login appearance only. It intentionally exposes no contact or
// financial settings before authentication.
router.get("/public", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('app_name','login_logo_data','login_background_data')").all();
  const result = { app_name: DEFAULTS.app_name, login_logo_data: "", login_background_data: "" };
  rows.forEach((row) => { result[row.key] = row.value; });
  res.json(result);
});

router.use(requireAuth);

// Anyone logged in can read settings (colors need to render for every role,
// the call contact needs to show in everyone's chat box).
router.get("/", (req, res) => {
  preventCaching(res);
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = { ...DEFAULTS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
});

// A dedicated no-cache read prevents the browser from restoring an older
// order after a successful drag-and-drop save.
router.get("/sidebar-order", requireRole(ROLES.SUPER_ADMIN), (req, res) => {
  preventCaching(res);
  const row = db.prepare("SELECT value, updated_at FROM settings WHERE key = 'sidebar_nav_order'").get();
  let order = NAV_ROUTES;
  try {
    const parsed = JSON.parse(row?.value || DEFAULTS.sidebar_nav_order);
    order = normalizeNavOrder(parsed);
  } catch {
    order = NAV_ROUTES;
  }
  if (row && row.value !== JSON.stringify(order)) saveSetting("sidebar_nav_order", JSON.stringify(order));
  res.json({ order, updated_at: row?.updated_at || null });
});

// Sidebar order is global for the full-access navigation, but only the
// Super Admin may change it. Other users continue to see their role-specific
// links in the normal fixed order.
router.put("/sidebar-order", requireRole(ROLES.SUPER_ADMIN), (req, res) => {
  const order = req.body.order;
  if (!isValidNavOrder(order)) return res.status(400).json({ error: "Sidebar order must contain every navigation item exactly once" });
  saveSetting("sidebar_nav_order", JSON.stringify(order));
  const saved = db.prepare("SELECT value, updated_at FROM settings WHERE key = 'sidebar_nav_order'").get();
  preventCaching(res);
  res.json({ order: JSON.parse(saved.value), updated_at: saved.updated_at });
});

// Super Admin can rename or remove any configured bus class, including the
// original defaults. Renaming also updates buses already using that class;
// removing only removes it from future choices and keeps existing bus data.
router.put("/bus-classes", requireFeaturePermission("settings", "write"), (req, res) => {
  const { action, currentName } = req.body;
  const classes = getBusClasses();
  const index = classes.findIndex((item) => item.toLowerCase() === String(currentName || "").trim().toLowerCase());
  if (index < 0) return res.status(404).json({ error: "Bus class not found" });

  if (action === "rename") {
    const newName = String(req.body.newName || "").trim();
    if (!newName) return res.status(400).json({ error: "New bus class name required" });
    if (classes.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === newName.toLowerCase())) {
      return res.status(400).json({ error: "That bus class already exists" });
    }
    const oldName = classes[index];
    const next = [...classes];
    next[index] = newName;
    saveSetting("bus_class_types", JSON.stringify(next));
    const updatedBuses = db.prepare("UPDATE buses SET class_type = ? WHERE lower(class_type) = lower(?)").run(newName, oldName).changes;
    return res.json({ bus_classes: next, updated_buses: updatedBuses });
  }

  if (action === "remove") {
    const oldName = classes[index];
    const next = classes.filter((_, itemIndex) => itemIndex !== index);
    saveSetting("bus_class_types", JSON.stringify(next));
    const busesUsingClass = db.prepare("SELECT COUNT(*) AS count FROM buses WHERE lower(class_type) = lower(?)").get(oldName).count;
    return res.json({ bus_classes: next, buses_using_removed_class: busesUsingClass });
  }

  return res.status(400).json({ error: "Choose rename or remove" });
});

// Categories are independent from the technical bus class. Type values from
// the fleet PDFs are stored here, and renaming a category updates every bus
// already assigned to it so the setting remains the single source of truth.
router.put("/bus-categories", requireFeaturePermission("settings", "write"), (req, res) => {
  const { action, currentName } = req.body;
  const categories = getBusCategories();
  if (action === "add") {
    const newName = String(req.body.newName || req.body.name || "").trim();
    if (!newName) return res.status(400).json({ error: "Bus category name required" });
    if (categories.some((item) => item.toLowerCase() === newName.toLowerCase())) return res.status(400).json({ error: "That bus category already exists" });
    const next = [...categories, newName];
    saveSetting("bus_categories", JSON.stringify(next));
    return res.status(201).json({ bus_categories: next });
  }
  const index = categories.findIndex((item) => item.toLowerCase() === String(currentName || "").trim().toLowerCase());
  if (index < 0) return res.status(404).json({ error: "Bus category not found" });

  if (action === "rename") {
    const newName = String(req.body.newName || "").trim();
    if (!newName) return res.status(400).json({ error: "New bus category name required" });
    if (categories.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === newName.toLowerCase())) {
      return res.status(400).json({ error: "That bus category already exists" });
    }
    const oldName = categories[index];
    const next = [...categories];
    next[index] = newName;
    saveSetting("bus_categories", JSON.stringify(next));
    const updatedBuses = db.prepare("UPDATE buses SET category = ? WHERE lower(category) = lower(?)").run(newName, oldName).changes;
    return res.json({ bus_categories: next, updated_buses: updatedBuses });
  }

  if (action === "remove") {
    const oldName = categories[index];
    const next = categories.filter((_, itemIndex) => itemIndex !== index);
    saveSetting("bus_categories", JSON.stringify(next));
    const busesUsingCategory = db.prepare("SELECT COUNT(*) AS count FROM buses WHERE lower(category) = lower(?)").get(oldName).count;
    return res.json({ bus_categories: next, buses_using_removed_category: busesUsingCategory });
  }

  return res.status(400).json({ error: "Choose add, rename, or remove" });
});

// Staff types are administrator-managed. Removing a type only removes it
// from future choices; existing staff keep their stored type/history until
// an administrator moves them to another type on the Staff page.
router.put("/staff-types", requireFeaturePermission("settings", "write"), (req, res) => {
  const types = getStaffTypes();
  const { action } = req.body;
  if (action === "add") {
    const label = String(req.body.label || "").trim();
    const group = ["bus", "counter", "office"].includes(req.body.group) ? req.body.group : "office";
    const key = cleanStaffTypeKey(req.body.key || label);
    if (!label || !key) return res.status(400).json({ error: "Staff type name required" });
    if (types.some((type) => type.key === key || type.label.toLowerCase() === label.toLowerCase())) return res.status(400).json({ error: "That staff type already exists" });
    const next = [...types, { key, label, group }];
    saveSetting("staff_types", JSON.stringify(next));
    return res.status(201).json({ staff_types: next });
  }

  const currentKey = String(req.body.currentKey || "");
  const index = types.findIndex((type) => type.key === currentKey);
  if (index < 0) return res.status(404).json({ error: "Staff type not found" });
  if (action === "rename") {
    const label = String(req.body.label || "").trim();
    const group = ["bus", "counter", "office"].includes(req.body.group) ? req.body.group : types[index].group;
    if (!label) return res.status(400).json({ error: "Staff type name required" });
    if (types.some((type, typeIndex) => typeIndex !== index && type.label.toLowerCase() === label.toLowerCase())) return res.status(400).json({ error: "That staff type already exists" });
    const next = [...types];
    next[index] = { ...next[index], label, group };
    saveSetting("staff_types", JSON.stringify(next));
    return res.json({ staff_types: next });
  }
  if (action === "remove") {
    const assigned = db.prepare("SELECT COUNT(*) AS count FROM staff WHERE designation = ?").get(currentKey).count;
    const next = types.filter((type) => type.key !== currentKey);
    if (!next.length) return res.status(400).json({ error: "Keep at least one staff type" });
    let replacementKey = String(req.body.replacementKey || "");
    // Older open browser tabs did not send a replacement key. Complete those
    // removals safely as well, preferring another type in the same group.
    // Newer tabs always let the administrator choose the destination.
    if (assigned && !next.some((type) => type.key === replacementKey)) {
      replacementKey = next.find((type) => type.group === types[index].group)?.key || next[0].key;
    }
    if (assigned) db.prepare("UPDATE staff SET designation = ? WHERE designation = ?").run(replacementKey, currentKey);
    saveSetting("staff_types", JSON.stringify(next));
    return res.json({ staff_types: next, assigned_staff: assigned, replacement_key: replacementKey || null });
  }
  return res.status(400).json({ error: "Choose add, rename, or remove" });
});

// Only Admin/Super Admin can change appearance or the dedicated call contact.
router.put("/", requireFeaturePermission("settings", "write"), (req, res) => {
  const allowedKeys = Object.keys(DEFAULTS).filter((key) => key !== "sidebar_nav_order");
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  const applied = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      upsert.run(key, String(req.body[key]));
      applied[key] = req.body[key];
    }
  }
  res.json({ updated: applied });
});

module.exports = router;
