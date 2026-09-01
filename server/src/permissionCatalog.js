const { ROLES, ASSIGNABLE_ROLES, FULL_ACCESS } = require("./roles");

// One permission row for every user-facing area in the sidebar. Accounts is
// deliberately split because Bus Accounts and Place-wise Accounts are separate
// jobs even though they share one page and some reference data.
const PERMISSION_FEATURES = [
  { key: "dashboard", label: "Dashboard", group: "Overview & communication", description: "Company overview cards and fleet activity summary", can_edit: false, route: "/" },
  { key: "live_activity", label: "Live Activity", group: "Overview & communication", description: "Running trips, checkpoints, passenger and fuel activity", can_edit: true, route: "/live-activity" },
  { key: "chat", label: "Chat Box", group: "Overview & communication", description: "Read or send staff coordination messages", can_edit: true, route: "/chat" },
  { key: "accounts_bus", label: "Accounts — Buses", group: "Accounts", description: "Bus income, expenses, rotations and maintenance posting", can_edit: true, route: "/accounts" },
  { key: "accounts_place", label: "Accounts — Place-wise", group: "Accounts", description: "Place/counter income, expenses and daily summaries", can_edit: true, route: "/accounts" },
  { key: "online_accounts", label: "Online Accounts", group: "Accounts", description: "Digital sales, cash sales, costs, imports and final reports", can_edit: true, route: "/online-accounts" },
  { key: "rotations", label: "Rotation", group: "Fleet operations", description: "View or schedule bus duties and linked return trips", can_edit: true, route: "/rotation" },
  { key: "buses", label: "Buses", group: "Fleet operations", description: "Fleet records, categories, status and availability", can_edit: true, route: "/buses" },
  { key: "routes", label: "Routes", group: "Fleet operations", description: "Route directory, return links, times and active status", can_edit: true, route: "/routes" },
  { key: "maintenance", label: "Maintenance", group: "Fleet operations", description: "Repair tickets, parts, status and maintenance reports", can_edit: true, route: "/maintenance" },
  { key: "attendance", label: "Time Management", group: "People & counters", description: "Attendance, cover duty, check-in and check-out records", can_edit: true, route: "/attendance" },
  { key: "staff", label: "Staff Details", group: "People & counters", description: "Staff records, posting, status and assignments", can_edit: true, route: "/staff" },
  { key: "counters", label: "Counters", group: "People & counters", description: "Counter details and staff posting", can_edit: true, route: "/counters" },
  { key: "salary", label: "Salary", group: "People & counters", description: "Salary plans, payroll and Place-wise posting", can_edit: true, route: "/salary" },
  { key: "reports", label: "Reports", group: "Reports & administration", description: "Financial, rotation, attendance and maintenance reports", can_edit: false, route: "/reports" },
  { key: "trash", label: "Trash", group: "Reports & administration", description: "Removed rotations, restore and permanent deletion", can_edit: true, route: "/trash" },
  { key: "users", label: "Users & Permissions", group: "Reports & administration", description: "User accounts, roles and this permission matrix", can_edit: true, route: "/users" },
  { key: "settings", label: "Settings", group: "Reports & administration", description: "Branding, fleet lists, places, hotels and system settings", can_edit: true, route: "/settings" },
];

const FEATURE_BY_KEY = new Map(PERMISSION_FEATURES.map((feature) => [feature.key, feature]));

// Before granular permissions, both Accounts sections used one `accounts`
// row. Use it only when a new feature row has not been saved yet.
const LEGACY_PERMISSION_KEYS = {
  accounts_bus: "accounts",
  accounts_place: "accounts",
};

// Preserve each built-in role's existing workspace when this release first
// goes live. The permission screen shows these defaults and saving the role
// writes explicit rows, so Admin can then remove or change any one of them.
const DEFAULT_ROLE_MODES = {
  [ROLES.CONTROL_COUNTER]: { live_activity: "write", rotations: "write", routes: "write", chat: "write" },
  [ROLES.COUNTER]: { live_activity: "write", chat: "write" },
  [ROLES.PASSENGER_CHECKER]: { live_activity: "write", chat: "write" },
  [ROLES.MONITOR]: { reports: "read", chat: "read" },
  [ROLES.ACCOUNTS]: { accounts_bus: "write", accounts_place: "write", chat: "write" },
  [ROLES.ONLINE_MANAGER]: { online_accounts: "write", chat: "write" },
  [ROLES.MAINTENANCE]: { maintenance: "write", buses: "write", chat: "write" },
  [ROLES.HOTEL]: { live_activity: "write", chat: "write" },
  [ROLES.PUMP_MANAGER]: { live_activity: "write", chat: "write" },
  [ROLES.DRIVER]: { live_activity: "write", chat: "write" },
  [ROLES.HELPER]: { live_activity: "write", chat: "write" },
};

const CUSTOM_ROLE_DEFAULTS = { live_activity: "read", chat: "write" };

function defaultGrant(role, featureKey) {
  const modes = DEFAULT_ROLE_MODES[role] || (!ASSIGNABLE_ROLES.includes(role) ? CUSTOM_ROLE_DEFAULTS : {});
  const mode = modes[featureKey];
  return { can_read: mode === "read" || mode === "write", can_write: mode === "write" };
}

function rowGrant(row) {
  if (!row) return null;
  const canWrite = Boolean(row.can_write);
  return { can_read: Boolean(row.can_read) || canWrite, can_write: canWrite };
}

function permissionForRole(db, role, featureKey) {
  if (FULL_ACCESS.includes(role)) return { can_read: true, can_write: true };
  if (!FEATURE_BY_KEY.has(featureKey)) return { can_read: false, can_write: false };

  const exact = db.prepare("SELECT can_read, can_write FROM role_permissions WHERE role = ? AND module = ?").get(role, featureKey);
  if (exact) return rowGrant(exact);

  const legacyKey = LEGACY_PERMISSION_KEYS[featureKey];
  if (legacyKey) {
    const legacy = db.prepare("SELECT can_read, can_write FROM role_permissions WHERE role = ? AND module = ?").get(role, legacyKey);
    if (legacy) return rowGrant(legacy);
  }

  return defaultGrant(role, featureKey);
}

function permissionsForRole(db, role) {
  const permissions = {};
  PERMISSION_FEATURES.forEach((feature) => {
    const grant = permissionForRole(db, role, feature.key);
    permissions[feature.key] = {
      can_read: grant.can_read,
      can_write: feature.can_edit ? grant.can_write : false,
    };
  });
  return permissions;
}

function hasFeaturePermission(db, role, featureKey, mode = "read") {
  const grant = permissionForRole(db, role, featureKey);
  return mode === "write" ? grant.can_write : grant.can_read || grant.can_write;
}

function hasAnyFeaturePermission(db, role, featureKeys, mode = "read") {
  return featureKeys.some((featureKey) => hasFeaturePermission(db, role, featureKey, mode));
}

module.exports = {
  PERMISSION_FEATURES,
  FEATURE_BY_KEY,
  DEFAULT_ROLE_MODES,
  permissionsForRole,
  hasFeaturePermission,
  hasAnyFeaturePermission,
};
