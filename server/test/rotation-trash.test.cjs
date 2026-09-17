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
db.exec("ALTER TABLE activity_logs ADD COLUMN price_per_seat REAL");
db.exec("ALTER TABLE transactions ADD COLUMN leg_scope TEXT");
db.exec("ALTER TABLE transactions ADD COLUMN fuel_liters REAL");
db.exec("ALTER TABLE counters ADD COLUMN place_id INTEGER REFERENCES expense_places(id) ON DELETE SET NULL");
require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: db };
process.env.JWT_SECRET = "isolated-rotation-test-secret";
const app = express();
app.use(express.json());
app.use("/trips", require("../src/routes/trips"));
app.use("/rotations", require("../src/routes/rotations"));
app.use("/accounts", require("../src/routes/accounts"));
app.use("/activity-logs", require("../src/routes/activityLogs"));
app.use("/maintenance", require("../src/routes/maintenance"));
app.use("/salary", require("../src/routes/salary"));
app.use("/attendance", require("../src/routes/attendance"));
app.use("/chat", require("../src/routes/chat"));
app.use("/staff", require("../src/routes/staff"));
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
    DELETE FROM chat_messages; DELETE FROM salary_assignments; DELETE FROM maintenance_parts; DELETE FROM maintenance;
    DELETE FROM activity_logs; DELETE FROM transactions; DELETE FROM rotations; DELETE FROM trips;
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
test("salary for both legs is one whole-rotation expense, while fuel remains per leg", async () => {
  const body = { bus_id: 1, trip_id: 11, type: "expense", category: "salary", amount: 600, txn_date: "2026-09-06", apply_to_both: true };
  const salary = await request("/accounts", { method: "POST", body });
  assert.equal(salary.status, 201);
  const rows = db.prepare("SELECT * FROM transactions WHERE category='salary'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 600);
  assert.equal(rows[0].leg_scope, "both");
  assert.equal(rows[0].trip_id, 10);
  const fuel = await request("/accounts", { method: "POST", body: { ...body, category: "fuel", both_leg_amounts: { 10: 40, 11: 60 } } });
  assert.equal(fuel.status, 201);
  assert.equal(db.prepare("SELECT SUM(amount) AS total FROM transactions WHERE category='fuel'").get().total, 200);
});

test("normal, additional and fuel edits update Accounts prefill without rewriting posted accounts", async () => {
  const add = (body) => request("/activity-logs", { method: "POST", body: { trip_id: 10, bus_id: 1, ...body } });
  const normal = await add({ event_type: "passenger_count", passengers_count: 10 });
  const paid = await add({ event_type: "additional_passenger_count", passengers_count: 2, price_per_seat: 150 });
  const fuel = await add({ event_type: "fuel", fuel_liters: 5, fuel_cost: 500 });
  assert.equal(normal.status, 201); assert.equal(paid.status, 201); assert.equal(fuel.status, 201);
  assert.equal((await request("/trips/10/time", { method: "PUT", body: { departure_time: "09:15", price_per_seat: 200 } })).status, 200);
  assert.equal(db.prepare("SELECT shift_start FROM rotations WHERE trip_id=10").get().shift_start, "09:15");
  const edit = (id, body) => request(`/activity-logs/${id}`, { method: "PUT", body });
  assert.equal((await edit(normal.data.id, { passengers_count: 12, recorded_at: "2026-09-06 10:30:00", note: "Updated count" })).status, 200);
  assert.equal((await edit(paid.data.id, { passengers_count: 3, price_per_seat: 100 })).status, 200);
  assert.equal((await edit(fuel.data.id, { fuel_liters: 8.5, fuel_cost: 850, location_name: "Pump A" })).status, 200);
  let trip = (await request("/trips/for-accounts?bus_id=1")).data.find((r) => r.id === 10);
  assert.equal(trip.logged_passengers, 15); assert.equal(trip.logged_passenger_amount, 2700);
  assert.equal(trip.logged_fuel_cost, 850); assert.equal(trip.logged_fuel_liters, 8.5);
  assert.equal((await request(`/activity-logs/${paid.data.id}`, { method: "DELETE" })).status, 204);
  trip = (await request("/trips/for-accounts?bus_id=1")).data.find((r) => r.id === 10);
  assert.equal(trip.logged_passengers, 12); assert.equal(trip.logged_passenger_amount, 2400);
  assert.equal(db.prepare("SELECT amount FROM transactions WHERE id=1").get().amount, 500);
});

test("invalid log values, unknown events and mismatched buses are rejected", async () => {
  const body = { trip_id: 10, bus_id: 1, event_type: "passenger_count", passengers_count: 2 };
  for (const bad of [{ passengers_count: -1 }, { passengers_count: 2.5 }, { event_type: "invalid" }, { bus_id: 999 }, { recorded_at: "invalid" }, { fuel_cost: "NaN" }]) {
    assert.equal((await request("/activity-logs", { method: "POST", body: { ...body, ...bad } })).status, 400);
  }
  for (const bad of [{ price_per_seat: -1 }, { price_per_seat: "NaN" }, { departure_time: "25:00" }]) {
    assert.equal((await request("/trips/10/time", { method: "PUT", body: bad })).status, 400);
  }
  assert.equal((await request("/activity-logs", { method: "POST", role: "test_operator", body })).status, 403);
});

test("journey exports return more than 300 checkpoints", async () => {
  const insert = db.prepare("INSERT INTO activity_logs(trip_id,bus_id,event_type,note) VALUES(10,1,'note',?)");
  for (let i = 0; i < 305; i++) insert.run(`Checkpoint ${i}`);
  assert.equal((await request("/activity-logs?trip_id=10")).data.length, 305);
});

test("maintenance sections retain records and block a bus until all issues are resolved", async () => {
  const make = (status, issue) => request("/maintenance", { method: "POST", body: { bus_id: 1, issue, reported_date: "2026-09-06", status } });
  const a = await make("in_progress", "Engine repair");
  const b = await make("long_maintenance", "Extended gearbox repair");
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal(db.prepare("SELECT status FROM buses WHERE id=1").get().status, "maintenance");
  assert.equal((await request(`/maintenance/${a.data.id}`, { method: "PUT", body: { status: "resolved", resolved_date: "2026-09-08", issue: "Engine repaired" } })).status, 200);
  assert.equal((await request("/maintenance?status=resolved")).data.length, 1);
  assert.equal((await request("/maintenance?status=long_maintenance")).data.length, 1);
  assert.equal(db.prepare("SELECT status FROM buses WHERE id=1").get().status, "maintenance");
  assert.equal((await request(`/maintenance/${b.data.id}`, { method: "PUT", body: { status: "resolved", resolved_date: "2026-09-08" } })).status, 200);
  assert.equal(db.prepare("SELECT status FROM buses WHERE id=1").get().status, "active");
  assert.equal((await request("/maintenance?status=resolved")).data.length, 2);
});

test("admin-only removals retain posted salary history and reject ordinary roles", async () => {
  db.exec("INSERT INTO salary_assignments(staff_id,salary_type,amount) VALUES(1,'daily',500); INSERT INTO chat_messages(id,sender_id,message) VALUES(1,1,'Disposable test message')");
  for (const path of ["/salary/assignments/1", "/chat/1"]) {
    assert.equal((await request(path, { method: "DELETE", role: "test_operator" })).status, 403);
    assert.equal((await request(path, { method: "DELETE", role: "super_admin" })).status, 200);
    assert.equal((await request(path, { method: "DELETE" })).status, 404);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n, 5);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM staff").get().n, 2);
});

test("administrator can edit and remove closed bus and place-wise transactions", async () => {
  assert.equal((await request("/staff")).status, 200);
  db.exec("UPDATE trips SET accounts_status='done'");
  for (const id of [1, 5]) {
    assert.equal((await request(`/accounts/${id}`, { method: "PUT", body: { amount: 321, description: "Correction" } })).status, 200);
    assert.equal((await request(`/accounts/${id}`, { method: "DELETE", role: "super_admin" })).status, 204);
  }
});

test("exceptional passengers require a description and preserve normal counts", async () => {
  const body = { trip_id: 10, bus_id: 1, event_type: "exceptional_passenger_count", passengers_count: 3, price_per_seat: 200 };
  assert.equal((await request("/activity-logs", { method: "POST", body })).status, 400);
  const created = await request("/activity-logs", { method: "POST", body: { ...body, note: "Special fare" } });
  assert.equal(created.status, 201);
  assert.equal(created.data.price_per_seat, 200);
  assert.equal((await request(`/activity-logs/${created.data.id}`, { method: "PUT", body: { note: " " } })).status, 400);
  assert.equal((await request(`/activity-logs/${created.data.id}`, { method: "PUT", body: { passengers_count: 4, note: "Updated fare" } })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_logs WHERE event_type='passenger_count'").get().count, 0);
});

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

test("crew selections must match their designation on create and edit", async () => {
  db.exec("INSERT INTO staff(id, name, designation) VALUES(3, 'Helper', 'helper'), (4, 'Supervisor', 'supervisor'), (5, 'Mechanic', 'mechanic')");
  const body = { bus_id: 1, route: "Test route", duty_date: "2026-09-07", driver_id: 1, helper_id: 3, supervisor_id: 4 };
  for (const field of ["driver_id", "helper_id", "supervisor_id"]) {
    assert.equal((await request("/rotations", { method: "POST", body: { ...body, [field]: 5 } })).status, 400);
    assert.equal((await request("/rotations/20", { method: "PUT", body: { [field]: 5 } })).status, 400);
  }
  assert.equal((await request("/rotations", { method: "POST", body })).status, 201);
  assert.equal((await request("/rotations/20", { method: "PUT", body: { helper_id: 3, supervisor_id: 4 } })).status, 200);
  assert.equal((await request("/rotations/20", { method: "PUT", body: { driver_id: null } })).status, 200);
});

test("both administrators manage every checkpoint type on a completed closed journey at any timestamp", async () => {
  db.exec("UPDATE trips SET accounts_status='done'");
  const originalTrips = clean(db.prepare("SELECT * FROM trips ORDER BY id").all());
  const originalAccounts = clean(db.prepare("SELECT * FROM transactions ORDER BY id").all());
  const events = ["left_counter", "stop_arrival", "stop_departure", "hotel_break", "fuel", "passenger_count", "exceptional_passenger_count", "additional_passenger_count", "note"];
  for (const role of ["admin", "super_admin"]) {
    for (const event_type of events) {
      const body = { trip_id: 10, bus_id: 1, event_type, recorded_at: "2024-02-29T23:59:58", location_name: "Past counter", note: "Historical correction" };
      if (event_type.includes("passenger")) body.passengers_count = 3;
      if (["additional_passenger_count", "exceptional_passenger_count"].includes(event_type)) body.price_per_seat = 125;
      if (event_type === "fuel") Object.assign(body, { fuel_liters: 4.5, fuel_cost: 450 });
      const added = await request("/activity-logs", { method: "POST", role, body });
      assert.equal(added.status, 201, `${role} can add ${event_type}`);
      assert.equal(added.data.recorded_at, "2024-02-29 23:59:58");
      const edited = await request(`/activity-logs/${added.data.id}`, { method: "PUT", role, body: { recorded_at: "2030-01-01T00:00", note: "Edited later", location_name: "Updated counter" } });
      assert.equal(edited.status, 200);
      assert.equal(edited.data.id, added.data.id);
      assert.equal(edited.data.trip_id, 10);
      assert.equal(edited.data.recorded_at, "2030-01-01 00:00:00");
      assert.ok((await request("/activity-logs?trip_id=10")).data.some((row) => row.id === added.data.id));
      assert.equal((await request(`/activity-logs/${added.data.id}`, { method: "DELETE", role })).status, 204);
    }
  }
  assert.deepEqual(clean(db.prepare("SELECT * FROM trips ORDER BY id").all()), originalTrips);
  assert.deepEqual(clean(db.prepare("SELECT * FROM transactions ORDER BY id").all()), originalAccounts);
});

test("historical journey search is date/bus filtered, bounded and does not mutate live state", async () => {
  db.exec("INSERT INTO buses(id, reg_number, status) VALUES(2, 'UNAVAILABLE-200', 'unavailable'); UPDATE routes SET full_trip_minutes=1; UPDATE trips SET status='running' WHERE id=10");
  const insert = db.prepare("INSERT INTO trips(id,bus_id,route,trip_date,rotation_no,status,accounts_status,departure_time) VALUES(?,?,'Historical route',?,?,'completed','done','23:30')");
  for (let i = 0; i < 32; i++) insert.run(100 + i, 2, "2026-08-27", i + 1);
  db.exec("UPDATE trips SET deleted_at=datetime('now') WHERE id=131");
  const query = "/activity-logs/journeys?from=2026-08-27&to=2026-08-27&bus_id=2";
  const first = await request(query);
  assert.equal(first.status, 200);
  assert.equal(first.data.total, 31);
  assert.equal(first.data.rows.length, 15);
  assert.equal(first.data.page_count, 3);
  assert.ok(first.data.rows.every((trip) => trip.bus_id === 2 && trip.status === "completed" && trip.accounts_status === "done" && trip.reg_number === "UNAVAILABLE-200"));
  const second = (await request(query + "&page=2", { role: "super_admin" })).data;
  const last = (await request(query + "&page=99")).data;
  assert.equal(last.page, 3); assert.equal(last.rows.length, 1);
  assert.equal(new Set([...first.data.rows, ...second.rows, ...last.rows].map((row) => row.id)).size, 31);
  assert.equal((await request("/activity-logs/journeys?from=2026-08-01&to=2026-09-06&bus_id=1")).data.total, 2);
  assert.equal((await request("/activity-logs/journeys?from=2020-01-01&to=2020-01-01")).data.total, 0);
  assert.equal(db.prepare("SELECT status FROM trips WHERE id=10").get().status, "running");
});

test("non-admin roles cannot manage history or edit/delete checkpoints, but keep their entry creation", async () => {
  const added = await request("/activity-logs", { method: "POST", body: { trip_id: 10, bus_id: 1, event_type: "note", note: "Protected" } });
  for (const role of ["control_counter", "passenger_checker", "test_operator", "monitor"]) {
    assert.equal((await request("/activity-logs/journeys?from=2026-09-06&to=2026-09-06", { role })).status, 403);
    assert.equal((await request(`/activity-logs/${added.data.id}`, { method: "PUT", role, body: { note: "Forbidden" } })).status, 403);
    assert.equal((await request(`/activity-logs/${added.data.id}`, { method: "DELETE", role })).status, 403);
    assert.equal((await request("/trips/10/time", { method: "PUT", role, body: { departure_time: "05:00" } })).status, 403);
  }
  const ownEntry = await request("/activity-logs", { method: "POST", role: "passenger_checker", body: { trip_id: 10, bus_id: 1, event_type: "passenger_count", passengers_count: 7, recorded_at: "2020-01-01 12:00:00" } });
  assert.equal(ownEntry.status, 201);
  assert.notEqual(ownEntry.data.recorded_at, "2020-01-01 12:00:00", "ordinary roles cannot override timestamps");
  assert.equal(db.prepare("SELECT note FROM activity_logs WHERE id=?").get(added.data.id).note, "Protected");
});

test("changing checkpoint type retains identity and clears old fuel/passenger totals without changing accounts", async () => {
  const added = await request("/activity-logs", { method: "POST", body: { trip_id: 10, bus_id: 1, event_type: "fuel", fuel_liters: 5, fuel_cost: 550 } });
  const id = added.data.id;
  for (const event_type of [null, ["note"], "unknown"]) assert.equal((await request(`/activity-logs/${id}`, { method: "PUT", body: { event_type } })).status, 400);
  assert.equal((await request(`/activity-logs/${id}`, { method: "PUT", body: { event_type: "passenger_count" } })).status, 400);
  const changed = await request(`/activity-logs/${id}`, { method: "PUT", body: { event_type: "additional_passenger_count", passengers_count: 4, price_per_seat: 150 } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.id, id);
  assert.equal(changed.data.fuel_liters, null); assert.equal(changed.data.fuel_cost, null);
  let totals = (await request("/trips/for-accounts?bus_id=1")).data.find((row) => row.id === 10);
  assert.equal(totals.logged_passenger_amount, 600); assert.equal(Number(totals.logged_fuel_cost || 0), 0);
  const note = await request(`/activity-logs/${id}`, { method: "PUT", body: { event_type: "note", note: "Only a note" } });
  assert.equal(note.data.passengers_count, null); assert.equal(note.data.price_per_seat, null);
  totals = (await request("/trips/for-accounts?bus_id=1")).data.find((row) => row.id === 10);
  assert.equal(Number(totals.logged_passenger_amount || 0), 0);
  assert.equal(db.prepare("SELECT amount FROM transactions WHERE id=1").get().amount, 500);
});

test("invalid calendar dates, timestamps, ranges and pages are rejected", async () => {
  for (const recorded_at of ["2026-02-30 12:00:00", "2026-02-29 12:00:00", "2026-09-06T24:00:00", "2026-09-06T12:60:00", "2026-09-06T12:00:60", "", null]) {
    const result = await request("/activity-logs", { method: "POST", body: { trip_id: 10, bus_id: 1, event_type: "note", recorded_at } });
    assert.equal(result.status, 400, String(recorded_at));
  }
  for (const query of ["from=2026-02-30&to=2026-03-01", "from=2026-09-07&to=2026-09-06", "from=2026-09-06", "from=2026-09-06&to=2026-09-06&page=-1", "from=2026-09-06&to=2026-09-06&page=1.5", "from=2026-09-06&to=2026-09-06&bus_id=invalid"]) {
    assert.equal((await request(`/activity-logs/journeys?${query}`)).status, 400);
  }
});
