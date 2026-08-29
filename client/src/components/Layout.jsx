import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { api } from "../api.js";
import { getLanguage } from "../i18n.js";

// Every page reads its text via t(...) at render time, but a plain function
// call doesn't make a component re-render when the language changes —
// that's why switching to Bangla used to only update the Sidebar (which
// has its own language state) and leave every other page in English. This
// remounts the whole routed page (via `key`) whenever the language toggles,
// so every page's text is recomputed under the new language too.
export default function Layout() {
  const [lang, setLang] = useState(getLanguage());

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

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet key={lang} />
      </main>
    </div>
  );
}
