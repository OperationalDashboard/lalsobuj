// Central list of roles. super_admin is never assignable through the API —
// it only ever exists on the account created by `npm run seed`. Beyond
// these, Admin can create additional custom roles at runtime (see
// routes/permissions.js) — those live in the custom_roles table, not here.
const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CONTROL_COUNTER: "control_counter",
  COUNTER: "counter",
  PASSENGER_CHECKER: "passenger_checker",
  MONITOR: "monitor",
  ACCOUNTS: "accounts",
  MAINTENANCE: "maintenance",
  HOTEL: "hotel",
  PUMP_MANAGER: "pump_manager",
  DRIVER: "driver",
  HELPER: "helper",
};

// Roles an Admin/Super Admin is allowed to assign to someone via the API,
// beyond whatever custom roles have been created.
const ASSIGNABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.CONTROL_COUNTER,
  ROLES.COUNTER,
  ROLES.PASSENGER_CHECKER,
  ROLES.MONITOR,
  ROLES.ACCOUNTS,
  ROLES.MAINTENANCE,
  ROLES.HOTEL,
  ROLES.PUMP_MANAGER,
  ROLES.DRIVER,
  ROLES.HELPER,
];

const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.CONTROL_COUNTER]: "Control Counter",
  [ROLES.COUNTER]: "Counter",
  [ROLES.PASSENGER_CHECKER]: "Passenger Checker",
  [ROLES.MONITOR]: "Monitor",
  [ROLES.ACCOUNTS]: "Accounts",
  [ROLES.MAINTENANCE]: "Maintenance",
  [ROLES.HOTEL]: "Hotel",
  [ROLES.PUMP_MANAGER]: "Pump Manager",
  [ROLES.DRIVER]: "Driver",
  [ROLES.HELPER]: "Helper",
};

// Roles whose "place" is always their own assigned counter (never freely
// typed) — Control Counter and Counter both post checkpoints under their
// own posted location only.
const OWN_COUNTER_ROLES = [ROLES.CONTROL_COUNTER, ROLES.COUNTER];

// Roles whose "place" is always their own assigned bus — Driver/Helper
// start a trip on the bus they're posted to, not an arbitrary one.
const OWN_BUS_ROLES = [ROLES.DRIVER, ROLES.HELPER];

const FULL_ACCESS = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

module.exports = { ROLES, ASSIGNABLE_ROLES, ROLE_LABELS, FULL_ACCESS, OWN_COUNTER_ROLES, OWN_BUS_ROLES };
