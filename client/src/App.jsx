import { Routes, Route, Navigate } from "react-router-dom";
import { getToken, getUser } from "./auth.js";
import { canUseAnyFeature, firstPermittedRoute } from "./permissions.js";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import LiveActivity from "./pages/LiveActivity.jsx";
import Staff from "./pages/Staff.jsx";
import Buses from "./pages/Buses.jsx";
import RoutesPage from "./pages/Routes.jsx";
import Counters from "./pages/Counters.jsx";
import Rotation from "./pages/Rotation.jsx";
import Attendance from "./pages/Attendance.jsx";
import Accounts from "./pages/Accounts.jsx";
import Maintenance from "./pages/Maintenance.jsx";
import Chat from "./pages/Chat.jsx";
import Users from "./pages/Users.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import Salary from "./pages/Salary.jsx";
import Trash from "./pages/Trash.jsx";
import OnlineAccounts from "./pages/OnlineAccounts.jsx";

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
  );
}
