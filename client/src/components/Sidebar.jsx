import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, getUser, setToken, setUser } from "../api.js";
import { ROLES, ROLE_LABELS, isFullAccess } from "../roles.js";
import { t, getLanguage, setLanguage } from "../i18n.js";
import { APP_REVISION, APP_VERSION } from "../version.js";
import BusIcon from "./BusIcon.jsx";

const MODULE_ROUTES = {
  buses: { to: "/buses", key: "buses" },
  staff: { to: "/staff", key: "staff_details" },
  rotations: { to: "/rotation", key: "rotation" },
  attendance: { to: "/attendance", key: "time_management" },
  accounts: { to: "/accounts", key: "accounts" },
  online_accounts: { to: "/online-accounts", label: "Online Accounts" },
  maintenance: { to: "/maintenance", key: "maintenance" },
};
const NAV_ICONS = { "/": "home", "/live-activity": "pulse", "/accounts": "wallet", "/online-accounts": "cloud", "/rotation": "rotate", "/attendance": "clock", "/staff": "people", "/buses": "bus", "/routes": "route", "/counters": "pin", "/maintenance": "tool", "/reports": "chart", "/salary": "money", "/trash": "trash", "/chat": "chat", "/users": "shield", "/settings": "gear" };
const SIDEBAR_ORDER_STORAGE_KEY = "lsp_sidebar_order";

function readStoredSidebarOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(SIDEBAR_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storeSidebarOrder(order) {
  try { localStorage.setItem(SIDEBAR_ORDER_STORAGE_KEY, JSON.stringify(order)); } catch { /* server copy remains authoritative */ }
}

function NavIcon({ name }) {
  const paths = { home: "M3 11.5 12 4l9 7.5v7.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 19.3z M9 21v-6h6v6", pulse: "M3 12h4l2-5 4 10 2-5h6", wallet: "M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7zm0 4h18M16 16h.01", cloud: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 8.1 5 5 0 0 0 7 18zm5-7v6m-3-3 3 3 3-3", rotate: "M20 11a8 8 0 1 0 1 4M20 4v7h-7", clock: "M12 6v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", people: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75", bus: "M5 17h14V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2zm0-7h14M7 21h.01M17 21h.01", route: "M5 4h.01M19 20h.01M5 4a3 3 0 1 0 0 6c5 0 2 7 9 7h5M19 20a3 3 0 1 0 0-6", pin: "M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12zm0-9h.01", tool: "m14.7 6.3 3 3M4 20l7.5-7.5a4.2 4.2 0 0 0 5.5-5.5l-3 3-3-3 3-3a4.2 4.2 0 0 0-5.5 5.5L1 17z", chart: "M4 20V10M10 20V4M16 20v-7M22 20H2", money: "M12 3v18M16 7.5c-.7-1.1-2-1.7-4-1.7-2.2 0-3.8 1.1-3.8 2.8 0 4.2 7.6 1.8 7.6 5.7 0 1.8-1.7 3-4 3-1.8 0-3.2-.6-4-1.8", trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3", chat: "M20 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z", shield: "M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z M9 12l2 2 4-4", gear: "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.7.3a1.7 1.7 0 0 0-1 1.5v.2h-2.8v-.2a1.7 1.7 0 0 0-1-1.5l-.7-.3a1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1A1.7 1.7 0 0 0 6 15l-.3-.7a1.7 1.7 0 0 0-1.5-1H4v-2.8h.2a1.7 1.7 0 0 0 1.5-1L6 8.8a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3l.7-.3a1.7 1.7 0 0 0 1-1.5V3h2.8v.4a1.7 1.7 0 0 0 1 1.5l.7.3a1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9l.3.7a1.7 1.7 0 0 0 1.5 1h.2v2.8h-.2a1.7 1.7 0 0 0-1.5 1z" };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.home} /></svg>;
}

// Which nav links each role sees. Full-access roles (admin/super_admin)
// get everything; other built-in roles get just what their job needs.
// Custom roles are built dynamically from their granted permissions
// (passed in as `permissions`, fetched from /auth/me).
function withGrantedLinks(links, permissions) {
  if (!permissions) return links;
  const next = [...links];
  Object.entries(permissions).forEach(([module, grant]) => {
    const route = MODULE_ROUTES[module];
    if (grant.can_read && route && !next.some((link) => link.to === route.to)) {
      next.push({ to: route.to, label: route.label || t(route.key) });
    }
  });
  return next;
}

function linksFor(role, permissions) {
  if (isFullAccess(role)) {
    return [
      { to: "/", label: t("dashboard"), end: true },
      { to: "/live-activity", label: t("live_activity") },
      { to: "/accounts", label: t("accounts") },
      { to: "/online-accounts", label: "Online Accounts" },
      { to: "/rotation", label: t("rotation") },
      { to: "/attendance", label: t("time_management") },
      { to: "/staff", label: t("staff_details") },
      { to: "/buses", label: t("buses") },
      { to: "/routes", label: t("routes") },
      { to: "/counters", label: t("counters") },
      { to: "/maintenance", label: t("maintenance") },
      { to: "/reports", label: t("reports") },
      { to: "/salary", label: "Salary" },
      { to: "/trash", label: "Trash" },
      { to: "/chat", label: t("chat_box") },
      { to: "/users", label: t("users_permissions") },
      { to: "/settings", label: t("settings") },
    ];
  }
  if (role === ROLES.MONITOR) {
    return withGrantedLinks([
      { to: "/reports", label: t("reports"), end: true },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.ACCOUNTS) {
    return withGrantedLinks([
      { to: "/accounts", label: t("accounts"), end: true },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.ONLINE_MANAGER) {
    return withGrantedLinks([
      { to: "/online-accounts", label: "Online Accounts", end: true },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.MAINTENANCE) {
    return withGrantedLinks([
      { to: "/maintenance", label: t("maintenance"), end: true },
      { to: "/buses", label: t("buses") },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.CONTROL_COUNTER) {
    return withGrantedLinks([
      { to: "/live-activity", label: t("live_activity"), end: true },
      { to: "/rotation", label: t("rotation") },
      { to: "/routes", label: t("routes") },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.COUNTER || role === ROLES.PASSENGER_CHECKER) {
    return withGrantedLinks([
      { to: "/live-activity", label: t("live_activity"), end: true },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }
  if (role === ROLES.HOTEL || role === ROLES.PUMP_MANAGER || role === ROLES.DRIVER || role === ROLES.HELPER) {
    return withGrantedLinks([
      { to: "/live-activity", label: t("live_activity"), end: true },
      { to: "/chat", label: t("chat_box") },
    ], permissions);
  }

  // Custom role: build links from whatever modules Admin granted read
  // access to, plus Live Activity/Chat which every role can at least view.
  const links = [
    { to: "/live-activity", label: t("live_activity"), end: true },
    { to: "/chat", label: t("chat_box") },
  ];
  return withGrantedLinks(links, permissions);
}

export default function Sidebar({ isOpen = false, onNavigate = () => {} }) {
  const navigate = useNavigate();
  const user = getUser();
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const [lang, setLang] = useState(getLanguage());
  const [theme, setTheme] = useState(() => localStorage.getItem("lsp_theme") || "light");
  const [navOrder, setNavOrder] = useState(() => isSuperAdmin ? readStoredSidebarOrder() : []);
  const [draggedPath, setDraggedPath] = useState("");
  const [dropTarget, setDropTarget] = useState({ path: "", position: "" });
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");

  useEffect(() => {
    const handler = () => setLang(getLanguage());
    window.addEventListener("lsp-lang-change", handler);
    return () => window.removeEventListener("lsp-lang-change", handler);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lsp_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get("/settings/sidebar-order").then((result) => {
      if (Array.isArray(result.order)) {
        setNavOrder(result.order);
        storeSidebarOrder(result.order);
      }
    }).catch(() => {});
  }, [isSuperAdmin]);

  const baseLinks = linksFor(user?.role, user?.permissions);
  const links = isSuperAdmin && navOrder.length
    ? [...baseLinks].sort((a, b) => {
      const aIndex = navOrder.indexOf(a.to);
      const bIndex = navOrder.indexOf(b.to);
      return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
    })
    : baseLinks;

  function handleDragStart(event, path) {
    if (!isSuperAdmin) return;
    setDraggedPath(path);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", path);
  }

  function handleDragOver(event, path) {
    if (!isSuperAdmin || path === draggedPath) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
    setDropTarget({ path, position });
  }

  async function handleDrop(event, targetPath) {
    if (!isSuperAdmin) return;
    event.preventDefault();
    event.stopPropagation();
    const sourcePath = draggedPath || event.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === targetPath) {
      setDraggedPath("");
      setDropTarget({ path: "", position: "" });
      return;
    }
    const currentOrder = links.map((link) => link.to);
    const nextOrder = currentOrder.filter((path) => path !== sourcePath);
    let targetIndex = nextOrder.indexOf(targetPath);
    if (dropTarget.position === "after") targetIndex += 1;
    nextOrder.splice(targetIndex, 0, sourcePath);
    setNavOrder(nextOrder);
    storeSidebarOrder(nextOrder);
    setDraggedPath("");
    setDropTarget({ path: "", position: "" });
    setSavingOrder(true);
    setOrderStatus("");
    try {
      const result = await api.put("/settings/sidebar-order", { order: nextOrder });
      const savedOrder = Array.isArray(result.order) ? result.order : nextOrder;
      setNavOrder(savedOrder);
      storeSidebarOrder(savedOrder);
      setOrderStatus("Menu order saved");
    } catch {
      setNavOrder(currentOrder);
      storeSidebarOrder(currentOrder);
      setOrderStatus("Could not save menu order");
    } finally {
      setSavingOrder(false);
      setTimeout(() => setOrderStatus(""), 2400);
    }
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    onNavigate();
    navigate("/login");
  }

  function toggleLanguage() {
    setLanguage(lang === "en" ? "bn" : "en");
  }

  return (
    <aside id="app-sidebar" className={`sidebar${isOpen ? " mobile-open" : ""}`}>
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BusIcon size={30} />
        <div>
          Lal Sabuj Paribahan
          <span>Operations Dashboard</span>
        </div>
      </div>
      <nav>
        {isSuperAdmin && <div className={`sidebar-order-hint${orderStatus.startsWith("Could") ? " error" : orderStatus ? " saved" : ""}`}>{savingOrder ? "Saving menu order…" : orderStatus || "Drag menu items to reorder"}</div>}
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onNavigate}
            draggable={isSuperAdmin}
            onDragStart={(event) => handleDragStart(event, l.to)}
            onDragOver={(event) => handleDragOver(event, l.to)}
            onDrop={(event) => handleDrop(event, l.to)}
            onDragEnd={() => { setDraggedPath(""); setDropTarget({ path: "", position: "" }); }}
            title={isSuperAdmin ? "Drag to reorder this menu item" : undefined}
            className={({ isActive }) => [
              "nav-link",
              isActive ? "active" : "",
              isSuperAdmin ? "draggable" : "",
              draggedPath === l.to ? "dragging" : "",
              dropTarget.path === l.to ? `drop-${dropTarget.position}` : "",
            ].filter(Boolean).join(" ")}
          >
            {isSuperAdmin && <span className="nav-drag-handle" aria-hidden="true">⋮⋮</span>}
            <span className="nav-icon"><NavIcon name={NAV_ICONS[l.to]} /></span>{l.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div>{user?.full_name}</div>
        <div style={{ opacity: 0.7, fontSize: "0.78rem" }}>{ROLE_LABELS[user?.role] || user?.role}</div>
        <div className="sidebar-version" title={`Build ${APP_REVISION}`}>Version {APP_VERSION}<span>{APP_REVISION}</span></div>
        <button className="logout-btn" style={{ background: "rgba(255,255,255,0.15)", marginTop: 10 }} onClick={toggleLanguage}>
          {lang === "en" ? "বাংলা" : "English"}
        </button>
        <button className="logout-btn" style={{ background: "rgba(255,255,255,0.15)" }} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀ Light mode" : "◐ Dark mode"}
        </button>
        <button className="logout-btn" onClick={handleLogout}>{t("log_out")}</button>
      </div>
    </aside>
  );
}
