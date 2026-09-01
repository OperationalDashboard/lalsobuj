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

function getStaffTypes() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'staff_types'").get();
  try {
    const types = JSON.parse(row?.value || "null");
    if (Array.isArray(types) && types.length && types.every((type) => type?.key && type?.label && type?.group)) return types;
  } catch { /* use defaults */ }
  return DEFAULT_STAFF_TYPES;
}

function staffTypeFor(key) {
  return getStaffTypes().find((type) => type.key === key) || { key, label: String(key || "Unspecified"), group: "legacy" };
}

function isBusStaffType(key) {
  return staffTypeFor(key).group === "bus";
}

module.exports = { DEFAULT_STAFF_TYPES, getStaffTypes, staffTypeFor, isBusStaffType };
