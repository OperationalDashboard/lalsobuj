import assert from "node:assert/strict";
import { test } from "node:test";
import { activityInput, activityTimestamp, chronologicalLogs } from "../src/activityTime.js";

test("admin date/time round trips preserve seconds without timezone conversion", () => {
  assert.equal(activityInput("2026-08-27 23:59:58", "", true), "2026-08-27T23:59:58");
  assert.equal(activityTimestamp("2026-08-27T23:59:58"), "2026-08-27 23:59:58");
  assert.equal(activityTimestamp("2026-08-27T23:59"), "2026-08-27 23:59:00");
  assert.equal(activityInput("08:30:42", "2026-08-27", true), "2026-08-27T08:30:42");
  assert.equal(activityInput("08:30:42", "2026-08-27"), "2026-08-27T08:30");
});
test("historical overnight checkpoints retain chronological order", () => {
  const rows = [{ id: 2, recorded_at: "2026-08-28 00:01:00" }, { id: 1, recorded_at: "2026-08-27 23:59:58" }];
  assert.deepEqual(chronologicalLogs(rows, "2026-08-27").map((row) => row.id), [1, 2]);
  assert.equal(rows[0].id, 2);
});
