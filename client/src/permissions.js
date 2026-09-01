import { isFullAccess } from "./roles.js";

export function canUseFeature(user, featureKey, mode = "read") {
  if (isFullAccess(user?.role)) return true;
  const grant = user?.permissions?.[featureKey];
  return mode === "write" ? Boolean(grant?.can_write) : Boolean(grant?.can_read || grant?.can_write);
}

export function canUseAnyFeature(user, featureKeys, mode = "read") {
  return featureKeys.some((featureKey) => canUseFeature(user, featureKey, mode));
}

const HOME_ROUTES = [
  { route: "/", features: ["dashboard"] },
  { route: "/live-activity", features: ["live_activity"] },
  { route: "/accounts", features: ["accounts_bus", "accounts_place"] },
  { route: "/online-accounts", features: ["online_accounts"] },
  { route: "/rotation", features: ["rotations"] },
  { route: "/attendance", features: ["attendance"] },
  { route: "/staff", features: ["staff"] },
  { route: "/buses", features: ["buses"] },
  { route: "/routes", features: ["routes"] },
  { route: "/counters", features: ["counters"] },
  { route: "/maintenance", features: ["maintenance"] },
  { route: "/reports", features: ["reports"] },
  { route: "/salary", features: ["salary"] },
  { route: "/trash", features: ["trash"] },
  { route: "/chat", features: ["chat"] },
  { route: "/users", features: ["users"] },
  { route: "/settings", features: ["settings"] },
];

export function firstPermittedRoute(user) {
  if (isFullAccess(user?.role)) return "/";
  return HOME_ROUTES.find((item) => canUseAnyFeature(user, item.features, "read"))?.route || "/no-access";
}
