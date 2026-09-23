const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const { validate, compare } = require("../src/passengerChecker");
const sale = (bus, date, count, channel = "android", id = 1) => ({ id, bus_number: bus, entry_date: date, passenger_count: count, channel });
const input = (rows, channel = "digital") => validate({ rows, channel, confirmed: true, filename: "test" });
const row = (bus, passengers, date = "2026-09-20") => ({ bus, passengers, date });

test("Bengali bus/count and platform totals; cash excluded from digital", () => {
  const result = compare(input([row("৫৩১৫", "৪")]), [sale("DHAKA METRO-BA-15-5315", "2026-09-20", 3), sale("DHAKA METRO-BA-15-5315", "2026-09-20", 1, "ios", 2), sale("DHAKA METRO-BA-15-5315", "2026-09-20", 9, "cash", 3)]);
  assert.equal(result.results[0].status, "matched"); assert.equal(result.results[0].actual, 4);
});
test("journey dates remain distinct; wrong date is missing even when count is zero", () => {
  const result = compare(input([row("5315", 4), row("5315", 0, "2026-09-21")]), [sale("5315", "2026-09-20", 4)]);
  assert.deepEqual(result.results.map(r => r.status), ["matched", "missing"]);
});
test("duplicate sections aggregate, mismatch is signed and empty records are missing", () => {
  const result = compare(input([row("5315", 3), row("5315", 4), row("9999", 1)]), [sale("5315", "2026-09-20", 6)]);
  assert.equal(result.results[0].expected, 7); assert.equal(result.results[0].difference, -1); assert.equal(result.summary.flagged, 2);
});
test("ambiguous suffix never chooses a bus or a passenger amount", () => {
  const result = compare(input([row("5315", 4)]), [sale("15-5315", "2026-09-20", 4), sale("12-5315", "2026-09-20", 8)]);
  assert.equal(result.results[0].status, "ambiguous"); assert.equal(result.results[0].actual, null);
  assert.equal(compare(input([row("15-5315", 4)]), [sale("15-5315", "2026-09-20", 4), sale("12-5315", "2026-09-20", 8)]).results[0].status, "matched");
  assert.equal(compare(input([row("5315",4)]),[sale("5315","2026-09-20",4),sale("15-5315","2026-09-20",8)]).results[0].status,"ambiguous");
});
test("missing confirmation, invalid calendar dates, blank counts and oversized input fail", () => {
  for (const body of [ { rows:[row("1", 1)], channel:"digital" }, {rows:[row("1",1,"2026-02-30")], channel:"digital",confirmed:true}, {rows:[row("1", "")],channel:"digital",confirmed:true}, {rows:Array(501).fill(row("1",1)),channel:"digital",confirmed:true}, {rows:[row("1", -1)],channel:"digital",confirmed:true} ]) assert.throws(() => validate(body));
});
test("source parsing respects Bengali row dates, user-corrected 5315 and skips totals", async () => {
  const { suggestPassengerRows } = await import("../../client/src/utils/passengerSheet.js");
  const rows = suggestPassengerRows("তারিখ ২১/৯/২৬\n১ ২০/৯/২৬ ৫৩১৫ ০৪ - ০৪\n২ ২১/৯/২৬ ৪০৮৬ ০৩ - ০৩\nসর্বমোট ০৭");
  assert.equal(rows.length,2); assert.equal(rows[0].bus,"5315"); assert.equal(rows[0].date,"2026-09-20"); assert.equal(rows[1].date,"2026-09-21");
});

// Real SQLite + real routes/auth, all isolated from live db.js and .env.
const Database = require("libsql");
const db = new Database(":memory:");
db.exec(`CREATE TABLE online_sales_entries(id INTEGER PRIMARY KEY,entry_date TEXT,channel TEXT,bus_number TEXT,passenger_count INTEGER);
CREATE TABLE role_permissions(role TEXT,module TEXT,can_read INTEGER,can_write INTEGER,PRIMARY KEY(role,module));
INSERT INTO online_sales_entries VALUES(1,'2026-09-20','android','5315',4);`);
const dbId = require.resolve("../src/db");
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: db };
// Feature permissions are separately tested by the repository; exercise
// router-level auth and authorization boundaries with an explicit test gate.
const authId = require.resolve("../src/middleware/auth");
const actualAuth = require(authId);
require.cache[authId].exports = { ...actualAuth, requireFeaturePermission: (_, mode) => (req,res,next) => req.user.role === "denied" || (mode === "write" && req.user.role === "viewer") ? res.status(403).json({error:"Denied"}) : next() };
const express = require("express"), jwt = require("jsonwebtoken");
const app = express(); app.use(express.json()); app.use("/checks", require("../src/routes/passengerChecks"));
app.use("/ocr", require("../src/routes/passengerCheckerOcr"));
const realFetch = global.fetch;
let server, base;
before(async () => { await new Promise(resolve => { server = app.listen(0,"127.0.0.1",resolve); }); base = `http://127.0.0.1:${server.address().port}/checks`; });
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
async function request(path, method = "GET", body, role = "admin", id = 1) {
  const response = await realFetch(base + path, { method, headers: { "Content-Type":"application/json", ...(role ? { Authorization:`Bearer ${jwt.sign({id,role},process.env.JWT_SECRET || "dev_secret")}` } : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status: response.status, data: await response.json() };
}
test("saved checks/edit/review retain ID, guard revisions and never change sales", async () => {
  const beforeSales = db.prepare("SELECT * FROM online_sales_entries").all();
  const body = input([row("5315", 3)]);
  const created = await request("", "POST", body); assert.equal(created.status,201);
  const id = created.data.id;
  const deniedReview = await request(`/${id}/review`,"PUT",{revision:1,status:"reviewed",note:"Not allowed"},"online_manager"); assert.equal(deniedReview.status,403);
  const review = await request(`/${id}/review`,"PUT",{revision:1,status:"follow_up",note:"Check the handwritten count"}); assert.equal(review.status,200);
  assert.equal((await request(`/${id}`,"PUT",{...body,revision:1})).status,409);
  assert.equal((await request(`/${id}`,"PUT",{...body,revision:2},"online_manager",2)).status,403);
  const updated = await request(`/${id}`,"PUT",{...input([row("5315",4)]),revision:2}); assert.equal(updated.status,200); assert.equal(updated.data.id,id); assert.equal(updated.data.review_status,"pending"); assert.equal(updated.data.result.results[0].status,"matched");
  assert.equal(db.prepare("SELECT count(*) AS n FROM online_passenger_check_audit").get().n,2);
  assert.deepEqual(db.prepare("SELECT * FROM online_sales_entries").all(),beforeSales);
});
test("anonymous/no access rejected; viewer can compare but cannot save", async () => {
  assert.equal((await request("","GET",null,null)).status,401);
  assert.equal((await request("","GET",null,"denied")).status,403);
  assert.equal((await request("/compare","POST",input([row("5315",4)]),"viewer")).status,200);
  assert.equal((await request("","POST",input([row("5315",4)]),"viewer")).status,403);
});
test("optional handwriting service requires setup, edit permission and explicit consent; never trusts external URLs", async () => {
  const previousEnabled = process.env.CHECKER_OCR_ENABLED, previousKey = process.env.CHECKER_OCR_API_KEY;
  let called = 0;
  try {
    process.env.CHECKER_OCR_ENABLED = "false";
    assert.equal((await request("/../ocr/read", "POST", {consent:true,image:"data:image/png;base64,AAAA"})).status,503);
    process.env.CHECKER_OCR_ENABLED = "true"; process.env.CHECKER_OCR_API_KEY = "test-only-not-real";
    global.fetch = async (url, options) => {
      called++; assert.equal(url,"https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body); assert.equal(body.store,false); assert.equal(body.text.format.strict,true);
      return {ok:true,json:async()=>({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({rows:[{date:"2026-09-20",bus:"5315",passengers:"4",source:"Row 1"}],warning:"Verify"})}]}]})};
    };
    assert.equal((await request("/../ocr/read", "POST", {consent:true,image:"data:image/png;base64,AAAA"},"viewer")).status,403);
    assert.equal((await request("/../ocr/read", "POST", {image:"data:image/png;base64,AAAA"})).status,400);
    assert.equal((await request("/../ocr/read", "POST", {consent:true,image:"https://private-server/secret"})).status,400);
    assert.equal(called,0);
    const result = await request("/../ocr/read", "POST", {consent:true,image:"data:image/png;base64,AAAA"});
    assert.equal(result.status,200); assert.equal(result.data.rows[0].bus,"5315"); assert.equal(called,1);
    global.fetch = async () => ({ok:true,json:async()=>({status:"incomplete"})});
    assert.equal((await request("/../ocr/read", "POST", {consent:true,image:"data:image/png;base64,AAAA"})).status,502);
    assert.equal(db.prepare("SELECT passenger_count FROM online_sales_entries WHERE id=1").get().passenger_count,4);
  } finally {
    global.fetch = realFetch;
    for (const [name,value] of [["CHECKER_OCR_ENABLED",previousEnabled],["CHECKER_OCR_API_KEY",previousKey]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
