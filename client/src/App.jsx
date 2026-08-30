import { Routes, Route, Navigate } from "react-router-dom";
import { getToken, getUser } from "./auth.js";
import { ROLES, isFullAccess, homeRouteFor } from "./roles.js";
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
function RoleGate({ allow, moduleName, children }) {
  const user = getUser();
  const grantedByPermission = moduleName && user?.permissions?.[moduleName]?.can_read;
  if (!allow(user?.role) && !grantedByPermission) return <Navigate to={homeRouteFor(user?.role)} replace />;
  return children;
}

function IndexRedirect() {
  const user = getUser();
  const home = homeRouteFor(user?.role);
  if (home === "/") return <Dashboard />;
  return <Navigate to={home} replace />;
}

const canSeeAccounts = (r) => isFullAccess(r) || r === ROLES.ACCOUNTS;
const canSeeMaintenance = (r) => isFullAccess(r) || r === ROLES.MAINTENANCE;
const canSeeReports = (r) => isFullAccess(r) || r === ROLES.MONITOR;
const canSeeBuses = (r) => isFullAccess(r) || r === ROLES.MAINTENANCE;
const canSeeRoutes = (r) => isFullAccess(r) || r === ROLES.CONTROL_COUNTER;
const canSeeRotation = (r) => isFullAccess(r) || r === ROLES.CONTROL_COUNTER;
const canSeeOnlineAccounts = (r) => isFullAccess(r) || r === ROLES.ONLINE_MANAGER;

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
        <Route path="live-activity" element={<LiveActivity />} />
        <Route path="chat" element={<Chat />} />
        <Route path="accounts" element={<RoleGate allow={canSeeAccounts} moduleName="accounts"><Accounts /></RoleGate>} />
        <Route path="online-accounts" element={<RoleGate allow={canSeeOnlineAccounts}><OnlineAccounts /></RoleGate>} />
        <Route path="rotation" element={<RoleGate allow={canSeeRotation} moduleName="rotations"><Rotation /></RoleGate>} />
        <Route path="attendance" element={<RoleGate allow={isFullAccess} moduleName="attendance"><Attendance /></RoleGate>} />
        <Route path="staff" element={<RoleGate allow={isFullAccess} moduleName="staff"><Staff /></RoleGate>} />
        <Route path="buses" element={<RoleGate allow={canSeeBuses} moduleName="buses"><Buses /></RoleGate>} />
        <Route path="routes" element={<RoleGate allow={canSeeRoutes}><RoutesPage /></RoleGate>} />
        <Route path="counters" element={<RoleGate allow={isFullAccess}><Counters /></RoleGate>} />
        <Route path="maintenance" element={<RoleGate allow={canSeeMaintenance} moduleName="maintenance"><Maintenance /></RoleGate>} />
        <Route path="users" element={<RoleGate allow={isFullAccess}><Users /></RoleGate>} />
        <Route path="settings" element={<RoleGate allow={isFullAccess}><Settings /></RoleGate>} />
        <Route path="reports" element={<RoleGate allow={canSeeReports}><Reports /></RoleGate>} />
        <Route path="salary" element={<RoleGate allow={isFullAccess}><Salary /></RoleGate>} />
        <Route path="trash" element={<RoleGate allow={isFullAccess}><Trash /></RoleGate>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
