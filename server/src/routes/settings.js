const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { FULL_ACCESS } = require("../roles");

const router = express.Router();

const DEFAULTS = {
  theme_primary_color: "#046a38",
  theme_accent_color: "#d21f3c",
  app_name: "Lal Sabuj Paribahan",
  dedicated_call_name: "",
  dedicated_call_phone: "",
  login_logo_data: "",
  login_background_data: "",
};

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
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = { ...DEFAULTS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
});

// Only Admin/Super Admin can change appearance or the dedicated call contact.
router.put("/", requireRole(...FULL_ACCESS), (req, res) => {
  const allowedKeys = Object.keys(DEFAULTS);
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
