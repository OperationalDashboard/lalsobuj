const db = require("./db");

const DEFAULT_STAFF_TYPES = [
  { key: "driver", label: "Driver", group: "bus" },
  { key: "supervisor", label: "Supervisor", group: "bus" },
  { key: "bus_staff", label: "Bus Staff", group: "bus" },
  { key: "helper", label: "Helper", group: "bus" },
  { key: "conductor", label: "Conductor", group: "bus" },
  { key: "mechanic", label: "Mechanic", group: "bus" },
  { key: "counter_manager", label: "Counter Manager", group: "counter" },
  { key: "assistant_counter_manager", label: "Assistant Counter Manager", group: "counter" },
  { key: "caller_man", label: "Caller Man", group: "counter" },
  { key: "office", label: "Office", group: "counter" },
  { key: "fourman", label: "Fourman", group: "office" },
  { key: "checker", label: "Checker", group: "office" },
  { key: "accounts", label: "Accounts", group: "office" },
  { key: "store_manager", label: "Store Manager", group: "office" },
  { key: "general_manager", label: "General Manager", group: "office" },
];

function cleanKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Staff types were originally saved as simple names. Keep those existing
// settings usable by upgrading each item into the current key/label/group
// shape instead of making Edit and Remove operate on an undefined key.
function normalizeStaffTypes(value) {
  if (!Array.isArray(value)) return DEFAULT_STAFF_TYPES;
  const used = new Set();
  const normalized = value.flatMap((item) => {
    const source = typeof item === "string" ? { label: item } : (item || {});
    const label = String(source.label || source.name || source.key || "").trim();
    const key = cleanKey(source.key || label);
    if (!label || !key || used.has(key)) return [];
    const known = DEFAULT_STAFF_TYPES.find((type) => type.key === key || type.label.toLowerCase() === label.toLowerCase());
    const group = ["bus", "counter", "office"].includes(source.group) ? source.group : (known?.group || "office");
    used.add(key);
    return [{ key, label, group }];
  });
  return normalized.length ? normalized : DEFAULT_STAFF_TYPES;
}

function getStaffTypes() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'staff_types'").get();
  try { return normalizeStaffTypes(JSON.parse(row?.value || "null")); } catch { return DEFAULT_STAFF_TYPES; }
}

function staffTypeFor(key) {
  return getStaffTypes().find((type) => type.key === key) || { key, label: String(key || "Unspecified"), group: "legacy" };
}

function isBusStaffType(key) {
  return staffTypeFor(key).group === "bus";
}

module.exports = { DEFAULT_STAFF_TYPES, getStaffTypes, normalizeStaffTypes, staffTypeFor, isBusStaffType };
