import { test } from "node:test";
import assert from "node:assert/strict";
import { activityClock, activityInput, chronologicalLogs } from "./activityTime.js";

test("checkpoint times handle SQL, older time-only values, and missing values", () => {
  assert.equal(activityClock("2026-09-06 14:05:00"), "02:05 PM");
  assert.equal(activityClock("08:30", "2026-09-06"), "08:30 AM");
  assert.equal(activityClock("invalid"), "—");
  assert.equal(activityInput("08:30", "2026-09-06"), "2026-09-06T08:30");
});
test("timeline orders dates across midnight and preserves the source records", () => {
  const rows = [{ id: 2, recorded_at: "2026-09-07 00:10:00" }, { id: 1, recorded_at: "23:50" }];
  assert.deepEqual(chronologicalLogs(rows, "2026-09-06").map((row) => row.id), [1, 2]);
  assert.deepEqual(rows.map((row) => row.id), [2, 1]);
});
