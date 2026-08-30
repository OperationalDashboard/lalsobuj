import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import BusIcon from "./BusIcon.jsx";
import { api, getUser, setUser } from "../api.js";
import { getLanguage } from "../i18n.js";

// Every page reads its text via t(...) at render time, but a plain function
// call doesn't make a component re-render when the language changes —
// that's why switching to Bangla used to only update the Sidebar (which
// has its own language state) and leave every other page in English. This
// remounts the whole routed page (via `key`) whenever the language toggles,
// so every page's text is recomputed under the new language too.
export default function Layout() {
  const [lang, setLang] = useState(getLanguage());
  const [navOpen, setNavOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState(getUser);

  useEffect(() => {
    const handler = () => setLang(getLanguage());
    window.addEventListener("lsp-lang-change", handler);
    return () => window.removeEventListener("lsp-lang-change", handler);
  }, []);

  useEffect(() => {
    api.get("/settings").then((s) => {
      if (s.theme_primary_color) {
        document.documentElement.style.setProperty("--green", s.theme_primary_color);
        document.documentElement.style.setProperty("--green-dark", s.theme_primary_color);
      }
      if (s.theme_accent_color) {
        document.documentElement.style.setProperty("--red", s.theme_accent_color);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const heartbeat = () => {
      if (!active || document.visibilityState === "hidden") return;
      api.post("/auth/presence/heartbeat").catch(() => {});
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 45_000);
    const onFocus = () => heartbeat();
    const onVisibility = () => { if (document.visibilityState === "visible") heartbeat(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshPermissions = async () => {
      if (!active || document.visibilityState === "hidden" || !getUser()) return;
      try {
        const profile = await api.get("/auth/me");
        if (!active) return;
        const currentUser = getUser();
        if (!currentUser) return;
        const nextUser = { ...currentUser, permissions: profile.permissions ?? null };
        setUser(nextUser);
        setSessionUser(nextUser);
      } catch {
        // Keep the last known grants during a temporary network interruption.
      }
    };

    refreshPermissions();
    const interval = window.setInterval(refreshPermissions, 30_000);
    const onFocus = () => refreshPermissions();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshPermissions();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!navOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.body.classList.add("mobile-nav-open");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("mobile-nav-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [navOpen]);

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open navigation menu"
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="mobile-brand">
          <BusIcon size={28} />
          <span>Lal Sabuj Paribahan</span>
        </div>
      </header>
      <Sidebar user={sessionUser} isOpen={navOpen} onNavigate={() => setNavOpen(false)} />
      <button
        type="button"
        className={`mobile-backdrop${navOpen ? " visible" : ""}`}
        aria-label="Close navigation menu"
        onClick={() => setNavOpen(false)}
      />
      <main className="main" id="main-content">
        <Outlet key={lang} />
      </main>
    </div>
  );
}
