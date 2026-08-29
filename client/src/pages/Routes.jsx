import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [name, setName] = useState("");
  const [returnRouteId, setReturnRouteId] = useState("");
  const [fullTripMinutes, setFullTripMinutes] = useState("");
  const [error, setError] = useState("");
  const [editingReturnId, setEditingReturnId] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");

  function load() {
    api.get("/routes").then(setRoutes).catch(() => {});
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return;
    try {
      await api.post("/routes", {
        name: name.trim(),
        return_route_id: returnRouteId || null,
        full_trip_minutes: fullTripMinutes ? Number(fullTripMinutes) : null,
      });
      setName("");
      setReturnRouteId("");
      setFullTripMinutes("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(route) {
    await api.put(`/routes/${route.id}`, { is_active: route.is_active ? 0 : 1 });
    load();
  }

  async function handleSetReturnRoute(route, value) {
    await api.put(`/routes/${route.id}`, { return_route_id: value || null });
    setEditingReturnId(null);
    load();
  }

  function startEditName(route) {
    setEditingNameId(route.id);
    setEditingNameValue(route.name);
  }
  async function saveEditName(route) {
    if (!editingNameValue.trim()) return;
    try {
      await api.put(`/routes/${route.id}`, { name: editingNameValue.trim() });
      setEditingNameId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditTime(route) {
    setEditingTimeId(route.id);
    setEditingTimeValue(route.full_trip_minutes || "");
  }
  async function saveEditTime(route) {
    await api.put(`/routes/${route.id}`, { full_trip_minutes: editingTimeValue ? Number(editingTimeValue) : null });
    setEditingTimeId(null);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Remove this route?")) return;
    await api.del(`/routes/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("routes_title")}</h1>
          <p>{t("routes_subtitle")}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <form className="form-row" onSubmit={handleAdd}>
          <input placeholder={t("route_name")} value={name} onChange={(e) => setName(e.target.value)} />
          <select value={returnRouteId} onChange={(e) => setReturnRouteId(e.target.value)}>
            <option value="">{t("return_route")} — {t("none")}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input placeholder="Full trip time (minutes)" type="number" value={fullTripMinutes}
            onChange={(e) => setFullTripMinutes(e.target.value)} />
          <button className="primary" type="submit">{t("add_route")}</button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "6px 0 0" }}>
          Setting a return route (e.g. Dhaka-Cumilla-Noakhali → Noakhali-Cumilla-Dhaka) lets the second
          leg auto-join the first into one rotation when a bus starts it. Full trip time is optional —
          when set, a running trip on this route is automatically marked completed once that much time
          has passed since departure.
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead><tr><th>{t("route")}</th><th>{t("return_route")}</th><th>Full trip time</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>
                  {editingNameId === r.id ? (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <input autoFocus value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} style={{ width: 180 }} />
                      <button className="primary" style={{ padding: "2px 8px" }} onClick={() => saveEditName(r)}>{t("save")}</button>
                      <button className="link-danger" style={{ padding: "2px 8px" }} onClick={() => setEditingNameId(null)}>{t("cancel")}</button>
                    </span>
                  ) : (
                    <span style={{ cursor: "pointer" }} onClick={() => startEditName(r)} title={t("click_to_change")}>
                      {r.name} ✎
                    </span>
                  )}
                </td>
                <td>
                  {editingReturnId === r.id ? (
                    <select autoFocus defaultValue={r.return_route_id || ""} onChange={(e) => handleSetReturnRoute(r, e.target.value)} onBlur={() => setEditingReturnId(null)}>
                      <option value="">{t("none")}</option>
                      {routes.filter((o) => o.id !== r.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : (
                    <span style={{ cursor: "pointer" }} onClick={() => setEditingReturnId(r.id)} title={t("click_to_change")}>
                      {r.return_route_name || t("none")} ✎
                    </span>
                  )}
                </td>
                <td>
                  {editingTimeId === r.id ? (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <input autoFocus type="number" value={editingTimeValue} onChange={(e) => setEditingTimeValue(e.target.value)} style={{ width: 80 }} placeholder="minutes" />
                      <button className="primary" style={{ padding: "2px 8px" }} onClick={() => saveEditTime(r)}>{t("save")}</button>
                      <button className="link-danger" style={{ padding: "2px 8px" }} onClick={() => setEditingTimeId(null)}>{t("cancel")}</button>
                    </span>
                  ) : (
                    <span style={{ cursor: "pointer" }} onClick={() => startEditTime(r)} title={t("click_to_change")}>
                      {r.full_trip_minutes ? `${r.full_trip_minutes} min` : t("none")} ✎
                    </span>
                  )}
                </td>
                <td><span className={`badge ${r.is_active ? "active" : "on_leave"}`}>{r.is_active ? t("active") : t("inactive")}</span></td>
                <td>
                  <button className="link-danger" style={{ marginRight: 12 }} onClick={() => toggleActive(r)}>
                    {r.is_active ? t("deactivate") : t("activate")}
                  </button>
                  <button className="link-danger" onClick={() => handleDelete(r.id)}>{t("remove")}</button>
                </td>
              </tr>
            ))}
            {routes.length === 0 && <tr><td colSpan={5}>{t("no_data")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
