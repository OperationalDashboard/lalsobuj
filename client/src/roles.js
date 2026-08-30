export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CONTROL_COUNTER: "control_counter",
  COUNTER: "counter",
  PASSENGER_CHECKER: "passenger_checker",
  MONITOR: "monitor",
  ACCOUNTS: "accounts",
  ONLINE_MANAGER: "online_manager",
  MAINTENANCE: "maintenance",
  HOTEL: "hotel",
  PUMP_MANAGER: "pump_manager",
  DRIVER: "driver",
  HELPER: "helper",
};

export const ASSIGNABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.CONTROL_COUNTER,
  ROLES.COUNTER,
  ROLES.PASSENGER_CHECKER,
  ROLES.MONITOR,
  ROLES.ACCOUNTS,
  ROLES.ONLINE_MANAGER,
  ROLES.MAINTENANCE,
  ROLES.HOTEL,
  ROLES.PUMP_MANAGER,
  ROLES.DRIVER,
  ROLES.HELPER,
];

// Roles that must be linked to a staff record when their login is created.
export const ROLES_REQUIRING_STAFF_LINK = [ROLES.CONTROL_COUNTER, ROLES.COUNTER, ROLES.DRIVER, ROLES.HELPER];

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.CONTROL_COUNTER]: "Control Counter",
  [ROLES.COUNTER]: "Counter",
  [ROLES.PASSENGER_CHECKER]: "Passenger Checker",
  [ROLES.MONITOR]: "Monitor",
  [ROLES.ACCOUNTS]: "Accounts",
  [ROLES.ONLINE_MANAGER]: "Online Manager",
  [ROLES.MAINTENANCE]: "Maintenance",
  [ROLES.HOTEL]: "Hotel",
  [ROLES.PUMP_MANAGER]: "Pump Manager",
  [ROLES.DRIVER]: "Driver",
  [ROLES.HELPER]: "Helper",
};

export function isFullAccess(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
}

// Where each role should land right after login. Custom roles (not in
// this list) fall through to Live Activity as a safe default.
export function homeRouteFor(role) {
  if (role === ROLES.MONITOR) return "/reports";
  if (role === ROLES.ACCOUNTS) return "/accounts";
  if (role === ROLES.ONLINE_MANAGER) return "/online-accounts";
  if (role === ROLES.MAINTENANCE) return "/maintenance";
  if (isFullAccess(role)) return "/";
  return "/live-activity";
}
