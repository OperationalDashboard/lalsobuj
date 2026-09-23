const express = require("express");
const db = require("../db");
const { requireAuth, requireFeaturePermission, requireRole } = require("../middleware/auth");
const { validate, compare } = require("../passengerChecker");
const router = express.Router();
// Additive, isolated storage. No changes to sales, bus or accounting tables.
db.exec(`CREATE TABLE IF NOT EXISTS online_passenger_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL,
  input_json TEXT NOT NULL, result_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'pending', review_note TEXT NOT NULL DEFAULT '',
  created_by INTEGER, updated_by INTEGER, reviewed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS online_passenger_check_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, check_id INTEGER NOT NULL,
  revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(check_id, revision)
);`);
router.use(requireAuth, requireFeaturePermission("online_accounts", "read"));
const write = requireFeaturePermission("online_accounts", "write");
const admin = requireRole("admin", "super_admin");
const unpack = row => ({ ...row, input: JSON.parse(row.input_json), result: JSON.parse(row.result_json), input_json: undefined, result_json: undefined });
function build(body) {
  const input = validate(body);
  // Query each selected date rather than scanning years between sparse dates.
  const dates = [...new Set(input.rows.map(r => r.date))];
  const sales = db.prepare(`SELECT id,entry_date,channel,bus_number,passenger_count FROM online_sales_entries WHERE entry_date IN (${dates.map(() => "?").join(",")})`).all(...dates);
  return { input, result: compare(input, sales) };
}
function archive(row) {
  db.prepare("INSERT OR IGNORE INTO online_passenger_check_audit(check_id,revision,snapshot) VALUES(?,?,?)").run(row.id, row.revision, JSON.stringify(unpack(row)));
}
router.post("/compare", (req, res, next) => {
  try { res.json(build(req.body)); } catch (error) { if (error.code) return next(error); res.status(400).json({ error: error.message }); }
});
router.get("/", (req, res) => {
  const offset = Math.floor(Math.max(0, Math.min(1000000, Number(req.query.offset) || 0)));
  res.json(db.prepare("SELECT id,filename,revision,review_status,created_at,updated_at FROM online_passenger_checks ORDER BY id DESC LIMIT 20 OFFSET ?").all(offset));
});
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Check not found." });
  res.json(unpack(row));
});
router.get("/:id/audit", (req, res) => {
  res.json(db.prepare("SELECT snapshot FROM online_passenger_check_audit WHERE check_id=? ORDER BY revision DESC LIMIT 50").all(req.params.id).map(row => JSON.parse(row.snapshot)));
});
router.post("/", write, (req, res, next) => {
  try {
    const { input, result } = build(req.body);
    const added = db.prepare("INSERT INTO online_passenger_checks(filename,input_json,result_json,created_by,updated_by) VALUES(?,?,?,?,?)").run(input.filename, JSON.stringify(input), JSON.stringify(result), req.user.id, req.user.id);
    res.status(201).json(unpack(db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(Number(added.lastInsertRowid))));
  } catch (error) { if (error.code) return next(error); res.status(400).json({ error: error.message }); }
});
router.put("/:id", write, (req, res, next) => {
  try {
    const row = db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Check not found." });
    if (!["admin", "super_admin"].includes(req.user.role) && row.created_by !== req.user.id) return res.status(403).json({ error: "Only the creator or an administrator can edit this check." });
    if (req.body.revision !== row.revision) return res.status(409).json({ error: "This check changed. Reopen it before editing." });
    const { input, result } = build(req.body);
    archive(row);
    const changed = db.prepare("UPDATE online_passenger_checks SET filename=?,input_json=?,result_json=?,revision=revision+1,review_status='pending',review_note='',reviewed_by=NULL,updated_by=?,updated_at=datetime('now') WHERE id=? AND revision=?").run(input.filename, JSON.stringify(input), JSON.stringify(result), req.user.id, row.id, row.revision);
    if (!changed.changes) return res.status(409).json({ error: "This check changed. Reopen it." });
    res.json(unpack(db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(row.id)));
  } catch (error) { if (error.code) return next(error); res.status(400).json({ error: error.message }); }
});
router.put("/:id/review", admin, (req, res) => {
  const row = db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Check not found." });
  if (req.body.revision !== row.revision) return res.status(409).json({ error: "This check changed. Reopen it before reviewing." });
  if (!["pending", "reviewed", "follow_up"].includes(req.body.status)) return res.status(400).json({ error: "Invalid decision." });
  const note = String(req.body.note || "").trim();
  if (!note || note.length > 2000) return res.status(400).json({ error: "Enter a decision note (up to 2,000 characters)." });
  archive(row);
  const changed = db.prepare("UPDATE online_passenger_checks SET review_status=?,review_note=?,reviewed_by=?,revision=revision+1,updated_at=datetime('now') WHERE id=? AND revision=?").run(req.body.status, note, req.user.id, row.id, row.revision);
  if (!changed.changes) return res.status(409).json({ error: "This check changed. Reopen it." });
  res.json(unpack(db.prepare("SELECT * FROM online_passenger_checks WHERE id=?").get(row.id)));
});
module.exports = router;
