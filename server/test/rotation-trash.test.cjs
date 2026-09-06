const assert = require("node:assert/strict");
const { before, after, beforeEach, test } = require("node:test");
const { readFileSync } = require("node:fs");
const express = require("express");
const jwt = require("jsonwebtoken");
const Database = require("libsql");

// Use the actual base schema and route handlers, but never load the production
// connection module, environment file, migrations, or business records.
const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
const dbModule = require.resolve("../src/db");
const schema = readFileSync(dbModule, "utf8").match(/db\.exec\(`([\s\S]*?)`\);/)[1];
assert.ok(!schema.includes("${"), "Base schema must be literal SQL");
db.exec(schema);
// This report column is added by the existing schema migration.
db.exec("ALTER TABLE transactions ADD COLUMN counter_id INTEGER REFERENCES counters(id) ON DELETE SET NULL");
require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: db };
process.env.JWT_SECRET = "isolated-rotation-test-secret";
const app = express();
app.use(express.json());
app.use("/trips", require("../src/routes/trips"));
app.use("/rotations", require("../src/routes/rotations"));
app.use("/accounts", require("../src/routes/accounts"));
let server;
let base;
const clean = (value) => JSON.parse(JSON.stringify(value, (key, item) => key === "_metadata" ? undefined : item));

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});
beforeEach(() => {
  db.exec(`
    DELETE FROM transactions; DELETE FROM rotations; DELETE FROM trips;
    DELETE FROM staff; DELETE FROM buses; DELETE FROM counters;
    DELETE FROM users; DELETE FROM routes; DELETE FROM role_permissions;
    INSERT INTO users(id, username, password_hash, full_name, role)
      VALUES(1, 'test', 'unused', 'Test admin', 'admin');
    INSERT INTO buses(id, reg_number) VALUES(1, 'TEST-100');
    INSERT INTO staff(id, name, designation) VALUES(1, 'Outbound driver', 'driver'), (2, 'Return driver', 'driver');
    INSERT INTO routes(id, name) VALUES(1, 'Test route');
    INSERT INTO trips(id, bus_id, route, trip_date, group_id, leg_no, status, departure_time, arrival_time)
      VALUES(10, 1, 'Test route', '2026-09-06', 10, 1, 'completed', '08:00', '12:00'),
            (11, 1, 'Test return', '2026-09-06', 10, 2, 'completed', '14:00', '18:00');
    INSERT INTO rotations(id, bus_id, driver_id, coach_name, route, duty_date, shift_start, shift_end, status, trip_id)
      VALUES(20, 1, 1, 'Coach A', 'Test route', '2026-09-06', '08:00', '12:00', 'completed', 10),
            (21, 1, 2, 'Coach B', 'Test return', '2026-09-06', '14:00', '18:00', 'completed', 11);
    INSERT INTO transactions(id, bus_id, trip_id, txn_date, type, category, amount, place_name)
      VALUES(1, 1, 10, '2026-09-06', 'income', 'ticket_sales', 500, NULL),
            (2, 1, 11, '2026-09-06', 'income', 'ticket_sales', 700, NULL),
            (3, 1, 11, '2026-09-06', 'expense', 'fuel', 100, 'Test place'),
            (4, 1, NULL, '2026-09-06', 'income', 'additional_sale', 50, NULL),
            (5, NULL, NULL, '2026-09-06', 'expense', 'place_expense', 20, 'Test place');
    INSERT INTO role_permissions(role, module, can_read, can_write)
      VALUES('test_operator', 'rotations', 1, 1), ('test_operator', 'reports', 1, 1);
  `);
});
async function request(path, { method = "GET", role = "admin", body } = {}) {
  const token = jwt.sign({ id: 1, role }, process.env.JWT_SECRET);
  const res = await fetch(base + path, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}
test("both administrator roles can remove and restore both legs with identical roster data", async () => {
  const originalRoster = clean(db.prepare("SELECT * FROM rotations ORDER BY id").all());
  for (const role of ["admin", "super_admin"]) {
    assert.equal((await request("/trips/11/trash", { method: "DELETE", role })).status, 204);
    assert.equal((await request("/rotations")).data.length, 0);
    assert.equal((await request("/trips/rotations?date=2026-09-06")).data.length, 0);
    assert.equal((await request("/trips/trash")).data[0].legs.length, 2);
    assert.equal((await request("/trips/10/restore", { method: "POST", role })).status, 200);
    assert.deepEqual(clean(db.prepare("SELECT * FROM rotations ORDER BY id").all()), originalRoster);
    const restored = (await request("/trips/rotations?date=2026-09-06")).data[0];
    assert.deepEqual(restored.legs.map((leg) => leg.driver_name), ["Outbound driver", "Return driver"]);
    assert.deepEqual(restored.legs.map((leg) => leg.coach_name), ["Coach A", "Coach B"]);
  }
});
test("trashed trips leave active financial totals while their history remains available", async () => {
  assert.deepEqual((await request("/accounts/summary")).data, { income: 1250, expense: 120, net: 1130 });
  assert.equal((await request("/trips/10/trash", { method: "DELETE" })).status, 204);
  assert.deepEqual((await request("/accounts/summary")).data, { income: 50, expense: 20, net: 30 });
  assert.deepEqual((await request("/accounts/summary?bus_id=1&from=2026-09-06&to=2026-09-06")).data, { income: 50, expense: 0, net: 50 });
  assert.deepEqual((await request("/accounts")).data.map((row) => row.id), [5, 4]);
  assert.deepEqual((await request("/accounts/place-finance?from=2026-09-06&to=2026-09-06")).data.map((row) => row.id), [5]);
  assert.equal((await request("/accounts/by-bus")).data[0].net, 50);
  assert.equal((await request("/accounts?trip_id=11")).data.length, 2);
  assert.equal(db.prepare("SELECT count(*) AS count FROM transactions").get().count, 5);
  assert.equal((await request("/trips/10/restore", { method: "POST" })).status, 200);
  assert.deepEqual((await request("/accounts/summary")).data, { income: 1250, expense: 120, net: 1130 });
});
test("rotation write permission cannot remove a linked trip without an administrator role", async () => {
  for (const path of ["/trips/10/trash", "/rotations/20"]) {
    assert.equal((await request(path, { method: "DELETE", role: "test_operator" })).status, 403);
  }
  assert.equal((await request("/trips/rotations?date=2026-09-06")).data.length, 1);
  assert.equal((await request("/rotations/20", { method: "DELETE" })).status, 204);
  assert.equal(db.prepare("SELECT count(*) AS count FROM rotations").get().count, 2);
  assert.equal((await request("/trips/trash")).data[0].legs.length, 2);
});
test("preserved archived roster does not block a new schedule on the same route", async () => {
  db.prepare("UPDATE trips SET status = 'running' WHERE id = 11").run();
  const body = { bus_id: 1, route: "Test route", duty_date: "2026-09-06" };
  assert.equal((await request("/rotations", { method: "POST", body })).status, 409);
  assert.equal((await request("/trips/10/trash", { method: "DELETE" })).status, 204);
  assert.equal((await request("/rotations", { method: "POST", body })).status, 201);
});
test("legacy missing roster is rebuilt for both legs without duplicating existing rows", async () => {
  db.exec("DELETE FROM rotations; UPDATE trips SET deleted_at = datetime('now')");
  assert.equal((await request("/trips/10/restore", { method: "POST" })).status, 200);
  assert.deepEqual(db.prepare("SELECT trip_id FROM rotations ORDER BY trip_id").all().map((row) => row.trip_id), [10, 11]);
  await request("/trips/10/restore", { method: "POST" });
  assert.equal(db.prepare("SELECT count(*) AS count FROM rotations").get().count, 2);
});
