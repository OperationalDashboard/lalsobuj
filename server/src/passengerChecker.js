// Pure comparison logic. This module never writes operational records.
const digits = value => String(value ?? "").replace(/[০-৯]/g, digit => "০১২৩৪৫৬৭৮৯".indexOf(digit));
const busKey = value => digits(value).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
const suffix = value => digits(value).match(/(\d{4})\s*$/)?.[1];
const CHANNELS = ["digital", "all", "website", "android", "ios", "website_android", "cash"];
function validate(input) {
  if (!input || !CHANNELS.includes(input.channel)) throw new Error("Choose a comparison platform.");
  if (input.confirmed !== true) throw new Error("Confirm every extracted row against the document first.");
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 500) throw new Error("Provide 1–500 reviewed rows.");
  const rows = input.rows.map((row, index) => {
    const date = String(row.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Row ${index + 1}: valid journey date required.`);
    const bus = String(row.bus || "").trim();
    if (!busKey(bus) || bus.length > 80) throw new Error(`Row ${index + 1}: bus number required.`);
    const passengers = Number(digits(row.passengers));
    if (String(row.passengers ?? "").trim() === "" || !Number.isSafeInteger(passengers) || passengers < 0 || passengers > 100000) throw new Error(`Row ${index + 1}: enter a whole passenger count.`);
    return { date, bus, passengers, source: String(row.source || "").slice(0, 160) };
  });
  return { rows, channel: input.channel, confirmed: true, filename: String(input.filename || "Manual check").slice(0, 200) };
}
function compare(input, sales) {
  const selected = sales.filter(s => input.channel === "all" || (input.channel === "digital" ? s.channel !== "cash" : s.channel === input.channel));
  // Match full numbers first. A short number is accepted only if it identifies
  // exactly one number across the queried dates, not just the current day.
  const names = new Map();
  selected.forEach(s => { if (busKey(s.bus_number)) names.set(busKey(s.bus_number), s.bus_number); });
  const groups = new Map();
  for (const [index, row] of input.rows.entries()) {
    const key = busKey(row.bus);
    const candidates = /^\d{4}$/.test(key) ? [...names.keys()].filter(k => suffix(k) === key) : names.has(key) ? [key] : [];
    const resolved = candidates.length === 1 ? candidates[0] : key;
    const groupKey = `${row.date}|${resolved}`;
    const group = groups.get(groupKey) || { date: row.date, bus: names.get(resolved) || row.bus, key: resolved, expected: 0, sourceRows: [], candidates: candidates.map(k => names.get(k)) };
    group.expected += row.passengers;
    group.sourceRows.push(index + 1);
    groups.set(groupKey, group);
  }
  const results = [...groups.values()].map(group => {
    const entries = selected.filter(s => s.entry_date === group.date && busKey(s.bus_number) === group.key);
    const actual = entries.reduce((sum, s) => sum + Number(s.passenger_count || 0), 0);
    const status = group.candidates.length > 1 ? "ambiguous" : !entries.length ? "missing" : actual === group.expected ? "matched" : "mismatch";
    return { ...group, actual: status === "ambiguous" ? null : actual, difference: status === "ambiguous" ? null : actual - group.expected, status, entryIds: entries.map(s => s.id) };
  });
  return { checkedAt: new Date().toISOString(), results, summary: { buses: results.length, sheetPassengers: input.rows.reduce((sum, r) => sum + r.passengers, 0), flagged: results.filter(r => r.status !== "matched").length }, scope: "Only uploaded rows are checked. Other report buses are not flagged." };
}
module.exports = { validate, compare, busKey };
