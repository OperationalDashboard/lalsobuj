const assert = require("node:assert/strict");
const { before, after, beforeEach, test } = require("node:test");
const express = require("express");

// Exercise the real router and staff-type normalizer with an isolated database
// double. Never import the production connection, migrations or credentials.
const rows = new Map();
let writes = 0;
let failWrites = true;
const db = {
  prepare(sql) {
    const key = sql.match(/WHERE key = '([^']+)'/)?.[1];
    return {
      all() {
        assert.match(sql, /^SELECT /);
        return [...rows].filter(([name]) => !sql.includes("WHERE key IN") || ["app_name", "login_logo_data", "login_background_data"].includes(name))
          .map(([name, row]) => ({ key: name, ...row }));
      },
      get() {
        assert.match(sql, /^SELECT /);
        assert.ok(key, `Unexpected query: ${sql}`);
        return rows.get(key);
      },
      run(name, value) {
        assert.match(sql, /INSERT INTO settings/);
        writes++;
        if (failWrites) throw new Error("Simulated unavailable remote primary");
        rows.set(name, { value, updated_at: "2026-09-09 12:00:00" });
        return { changes: 1 };
      },
    };
  },
};
const stubModule = (path, exports) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stubModule("../src/db", db);
// Authentication/permissions are deliberately out of scope for these router
// regression tests; no real login, token or operational user is created.
const allow = (req, res, next) => next();
stubModule("../src/middleware/auth", { requireAuth: allow, requireRole: () => allow, requireFeaturePermission: () => allow });
const app = express();
app.use(express.json());
app.use("/settings", require("../src/routes/settings"));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
let server;
let base;
before(async () => {
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/settings`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => { rows.clear(); writes = 0; failWrites = true; });
async function request(path = "", body) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: response.status, cache: response.headers.get("cache-control"), data: await response.json() };
}

test("legacy staff-type reads return stable editable IDs without writing", async () => {
  const legacy = JSON.stringify(["Driver", { name: "Ticket Checker", group: "counter" }]);
  rows.set("staff_types", { value: legacy });
  for (let index = 0; index < 2; index++) {
    const result = await request();
    assert.equal(result.status, 200);
    assert.match(result.cache, /no-store/);
    assert.deepEqual(JSON.parse(result.data.staff_types), [
      { key: "driver", label: "Driver", group: "bus" },
      { key: "ticket_checker", label: "Ticket Checker", group: "counter" },
    ]);
  }
  assert.equal(writes, 0);
  assert.equal(rows.get("staff_types").value, legacy);
});
test("missing and malformed staff settings recover defaults without writes", async () => {
  for (const value of [undefined, "invalid JSON", "[]", "null"]) {
    rows.clear();
    if (value !== undefined) rows.set("staff_types", { value });
    const result = await request();
    assert.equal(result.status, 200);
    assert.ok(JSON.parse(result.data.staff_types).some((item) => item.key === "driver"));
  }
  assert.equal(writes, 0);
});
test("sidebar reads preserve saved order, append missing routes and never write", async () => {
  const value = JSON.stringify(["/salary", "/trash", "/salary", "/old-route"]);
  rows.set("sidebar_nav_order", { value, updated_at: "original" });
  const result = await request("/sidebar-order");
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.order.slice(0, 2), ["/salary", "/trash"]);
  assert.equal(result.data.order.length, 17);
  assert.equal(new Set(result.data.order).size, 17);
  assert.ok(!result.data.order.includes("/old-route"));
  assert.equal(result.data.updated_at, "original");
  assert.match(result.cache, /no-store/);
  assert.equal(rows.get("sidebar_nav_order").value, value);
  assert.equal(writes, 0);
});
test("missing and invalid sidebar settings use defaults without writes", async () => {
  for (const value of [undefined, "invalid JSON", "null"]) {
    rows.clear();
    if (value !== undefined) rows.set("sidebar_nav_order", { value });
    const result = await request("/sidebar-order");
    assert.equal(result.status, 200);
    assert.equal(result.data.order.length, 17);
  }
  assert.equal(writes, 0);
});
test("public branding remains read-only and excludes private settings", async () => {
  rows.set("app_name", { value: "Test company" });
  rows.set("dedicated_call_phone", { value: "PRIVATE" });
  const result = await request("/public");
  assert.equal(result.status, 200);
  assert.equal(result.data.app_name, "Test company");
  assert.equal(result.data.dedicated_call_phone, undefined);
  assert.equal(writes, 0);
});
test("explicit sidebar save persists and remains ordered after reload", async () => {
  failWrites = false;
  const order = (await request("/sidebar-order")).data.order.reverse();
  assert.equal((await request("/sidebar-order", { order })).status, 200);
  assert.deepEqual((await request("/sidebar-order")).data.order, order);
  assert.equal(writes, 1);
  assert.equal((await request("/sidebar-order", { order: ["/salary"] })).status, 400);
  assert.equal(writes, 1);
});
test("renaming a legacy staff type persists without changing its ID", async () => {
  rows.set("staff_types", { value: JSON.stringify(["Driver", "Helper"]) });
  failWrites = false;
  const result = await request("/staff-types", { action: "rename", currentKey: "driver", label: "Senior Driver", group: "bus" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.staff_types[0], { key: "driver", label: "Senior Driver", group: "bus" });
  assert.deepEqual(JSON.parse((await request()).data.staff_types), result.data.staff_types);
  assert.equal(writes, 1);
});
test("explicit save still reports remote failure, never pretends it was saved", async () => {
  const result = await request("", { app_name: "Unsaved company" });
  assert.equal(result.status, 500);
  assert.equal(writes, 1);
  assert.equal(rows.has("app_name"), false);
});
