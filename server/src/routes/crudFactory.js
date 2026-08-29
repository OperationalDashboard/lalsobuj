const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * Builds a standard list/get/create/update/delete router for a table.
 *
 * table        - table name
 * columns      - array of writable column names (excludes id/created_at)
 * orderBy      - default ORDER BY clause
 * writeRoles   - if provided, only these roles may POST/PUT/DELETE.
 *                GET stays open to any authenticated user.
 */
function crudRouter({ table, columns, orderBy = "id DESC", writeRoles }) {
  const router = express.Router();
  router.use(requireAuth);

  const guardWrite = writeRoles && writeRoles.length ? requireRole(...writeRoles) : (req, res, next) => next();

  router.get("/", (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
    res.json(rows);
  });

  router.get("/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  router.post("/", guardWrite, (req, res) => {
    const present = columns.filter((c) => req.body[c] !== undefined);
    if (present.length === 0) return res.status(400).json({ error: "No valid fields provided" });
    const placeholders = present.map(() => "?").join(",");
    const values = present.map((c) => req.body[c]);
    const info = db
      .prepare(`INSERT INTO ${table} (${present.join(",")}) VALUES (${placeholders})`)
      .run(...values);
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
  });

  router.put("/:id", guardWrite, (req, res) => {
    const present = columns.filter((c) => req.body[c] !== undefined);
    if (present.length === 0) return res.status(400).json({ error: "No valid fields provided" });
    const setClause = present.map((c) => `${c} = ?`).join(", ");
    const values = present.map((c) => req.body[c]);
    const info = db
      .prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`)
      .run(...values, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id));
  });

  router.delete("/:id", guardWrite, (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  });

  return router;
}

module.exports = crudRouter;
