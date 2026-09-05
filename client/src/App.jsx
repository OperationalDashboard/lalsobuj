import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getToken, getUser } from "./auth.js";
import { canUseAnyFeature, firstPermittedRoute } from "./permissions.js";
import Login from "./pages/Login.jsx";

// Load only the current workspace instead of shipping every management page
// with the login screen. Vite emits one cached chunk per page and React loads
// it when the user opens that section.
const Layout = lazy(() => import("./components/Layout.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const LiveActivity = lazy(() => import("./pages/LiveActivity.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const Buses = lazy(() => import("./pages/Buses.jsx"));
const RoutesPage = lazy(() => import("./pages/Routes.jsx"));
const Counters = lazy(() => import("./pages/Counters.jsx"));
const Rotation = lazy(() => import("./pages/Rotation.jsx"));
const Attendance = lazy(() => import("./pages/Attendance.jsx"));
const Accounts = lazy(() => import("./pages/Accounts.jsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.jsx"));
const Chat = lazy(() => import("./pages/Chat.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Salary = lazy(() => import("./pages/Salary.jsx"));
const Trash = lazy(() => import("./pages/Trash.jsx"));
const OnlineAccounts = lazy(() => import("./pages/OnlineAccounts.jsx"));

function Protected({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

// Extra guard for pages a role shouldn't see even by typing the URL.
// The backend already enforces this on every request; this just keeps
// the UI from showing pages that would only error out. `moduleName`, if
// given, lets a custom role in via its granted permissions even when it
// doesn't match any of the fixed built-in checks.
function PermissionGate({ features, children }) {
  const user = getUser();
  if (!canUseAnyFeature(user, features, "read")) return <Navigate to={firstPermittedRoute(user)} replace />;
  const hasEditableFeature = features.some((feature) => !["dashboard", "reports"].includes(feature));
  const canWrite = canUseAnyFeature(user, features, "write");
  return <>{hasEditableFeature && !canWrite && <p className="permission-readonly-note">View-only access: this role can review this section, but changes are disabled by the server.</p>}{children}</>;
}

function IndexRedirect() {
  const user = getUser();
  const home = firstPermittedRoute(user);
  if (home === "/") return <Dashboard />;
  return <Navigate to={home} replace />;
}

function NoAccess() {
  return <div className="card permission-empty-state"><h2>No features assigned</h2><p>Ask an Admin to enable View permission for at least one website feature.</p></div>;
}

export default function App() {
  return (
    <Suspense fallback={<div className="route-loading" role="status"><span />Loading workspace…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<IndexRedirect />} />
          <Route path="live-activity" element={<PermissionGate features={["live_activity"]}><LiveActivity /></PermissionGate>} />
          <Route path="chat" element={<PermissionGate features={["chat"]}><Chat /></PermissionGate>} />
          <Route path="accounts" element={<PermissionGate features={["accounts_bus", "accounts_place"]}><Accounts /></PermissionGate>} />
          <Route path="online-accounts" element={<PermissionGate features={["online_accounts"]}><OnlineAccounts /></PermissionGate>} />
          <Route path="rotation" element={<PermissionGate features={["rotations"]}><Rotation /></PermissionGate>} />
          <Route path="attendance" element={<PermissionGate features={["attendance"]}><Attendance /></PermissionGate>} />
          <Route path="staff" element={<PermissionGate features={["staff"]}><Staff /></PermissionGate>} />
          <Route path="buses" element={<PermissionGate features={["buses"]}><Buses /></PermissionGate>} />
          <Route path="routes" element={<PermissionGate features={["routes"]}><RoutesPage /></PermissionGate>} />
          <Route path="counters" element={<PermissionGate features={["counters"]}><Counters /></PermissionGate>} />
          <Route path="maintenance" element={<PermissionGate features={["maintenance"]}><Maintenance /></PermissionGate>} />
          <Route path="users" element={<PermissionGate features={["users"]}><Users /></PermissionGate>} />
          <Route path="settings" element={<PermissionGate features={["settings"]}><Settings /></PermissionGate>} />
          <Route path="reports" element={<PermissionGate features={["reports"]}><Reports /></PermissionGate>} />
          <Route path="salary" element={<PermissionGate features={["salary"]}><Salary /></PermissionGate>} />
          <Route path="trash" element={<PermissionGate features={["trash"]}><Trash /></PermissionGate>} />
          <Route path="no-access" element={<NoAccess />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
