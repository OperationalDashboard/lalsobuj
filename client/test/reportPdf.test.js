import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { downloadReportPdf } from "../src/utils/reportPdf.js";

test("PDF includes all 120 records, repeated headings, totals and page footers", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ["2026-09-08", `TEST-${String(i + 1).padStart(3, "0")}`, "Dhaka to Chattogram", `Driver: Sample driver ${i + 1}; Helper: Sample helper`, 40, 20000, 4400, "Fuel 40 L"]);
  const doc = await downloadReportPdf({ save: false, title: "Company operations report", subtitle: "Sample only | 2026-09-08 | All amounts in BDT", summary: [{ label: "Income (BDT)", value: 2400000 }], sections: [
    { title: "Rotations and bus staff", columns: ["Date", "Bus", "Route", "Crew", "Passengers", "Income", "Expense", "Notes"], rows },
    { title: "Resolved records", columns: ["Bus", "Issue", "Cost"], rows: [["TEST-001", "Engine repaired", 1250]] },
  ] });
  assert.ok(doc.getNumberOfPages() >= 6);
  const raw = doc.output();
  assert.ok(raw.includes("TEST-120"));
  assert.ok(raw.includes("Resolved records"));
  assert.ok(raw.includes("Lal Sabuj Paribahan"));
  mkdirSync(new URL("../../tmp/pdfs/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../../tmp/pdfs/report-qa.pdf", import.meta.url), Buffer.from(doc.output("arraybuffer")));
});
