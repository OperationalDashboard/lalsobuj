import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, setUser } from "../api.js";
import { homeRouteFor, isFullAccess } from "../roles.js";
import BusIcon from "../components/BusIcon.jsx";

function PortalGlyph({ admin }) {
  return admin ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5.5 21c.7-4.1 3-6.1 6.5-6.1s5.8 2 6.5 6.1" /></svg>;
}

export default function Login() {
  const [portal, setPortal] = useState("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("lsp_theme") || "light");
  const [branding, setBranding] = useState({ app_name: "Lal Sabuj Paribahan", login_logo_data: "", login_background_data: "" });
  const navigate = useNavigate();
  useEffect(() => { api.get("/settings/public").then(setBranding).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("lsp_theme", theme); }, [theme]);
  async function handleSubmit(e) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await api.post("/auth/login", { username, password });
      const admin = isFullAccess(data.user.role);
      if ((portal === "admin") !== admin) { setError(admin ? "Use the Admin Portal on the left." : "Use the Staff Portal on the right."); return; }
      setToken(data.token); setUser(data.user);
      try { const me = await api.get("/auth/me"); if (me.permissions) setUser({ ...data.user, permissions: me.permissions }); } catch { /* optional navigation data */ }
      navigate(homeRouteFor(data.user.role));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  const admin = portal === "admin";
  const background = branding.login_background_data ? { backgroundImage: `linear-gradient(115deg, rgba(7,20,34,.86), rgba(12,57,39,.66)), url(${branding.login_background_data})` } : undefined;
  return <main className="portal-login" style={background}>
    <section className="portal-showcase">
      <div className="portal-brand">{branding.login_logo_data ? <img src={branding.login_logo_data} alt="Company logo" /> : <BusIcon size={42} />}<div><strong>{branding.app_name}</strong><span>Operations platform</span></div></div>
      <button type="button" className="portal-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
        <span>{theme === "dark" ? "☀" : "◐"}</span>{theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <div className="portal-copy"><span className="portal-kicker">SECURE OPERATIONS</span><h1>One route.<br />Every operation.</h1><p>Live fleet activity, accounts, staff and counter operations in one secure workspace.</p><div className="portal-stat"><b>24/7</b><span>Operational visibility</span></div></div>
    </section>
    <section className="portal-access">
      <div className="portal-switch"><button type="button" className={admin ? "selected" : ""} onClick={() => { setPortal("admin"); setError(""); }}>Admin Portal</button><button type="button" className={!admin ? "selected" : ""} onClick={() => { setPortal("staff"); setError(""); }}>Staff Portal</button></div>
      <form className={`portal-card ${admin ? "admin" : "staff"}`} onSubmit={handleSubmit}>
        <div className="portal-emblem"><PortalGlyph admin={admin} /></div><span className="portal-kicker">{admin ? "ADMIN & SUPER ADMIN" : "TEAM MEMBER ACCESS"}</span>
        <h2>{admin ? "Command center" : "Welcome back"}</h2><p>{admin ? "Secure access to financial controls, users and company settings." : "Sign in to continue with your assigned operational work."}</p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="primary portal-submit" type="submit" disabled={loading}>{loading ? "Authenticating…" : "Secure sign in"}</button>{error && <p className="error-text">{error}</p>}
      </form>
    </section>
  </main>;
}
