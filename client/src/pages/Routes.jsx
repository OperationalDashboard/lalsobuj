import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { canUseFeature } from "../permissions.js";

export default function Routes() {
  const canWrite = canUseFeature(getUser(), "routes", "write");
  const [routes, setRoutes] = useState([]);
  const [name, setName] = useState("");
  const [returnRouteId, setReturnRouteId] = useState("");
  const [fullTripMinutes, setFullTripMinutes] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", return_route_id: "", full_trip_minutes: "", is_active: "1" });
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  function load() {
    api.get("/routes").then(setRoutes).catch(() => {});
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return;
    setAdding(true);
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
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(route) {
    await api.put(`/routes/${route.id}`, { is_active: route.is_active ? 0 : 1 });
    load();
  }

  function startEdit(route) {
    setError("");
    setEditingId(route.id);
    setEditForm({
      name: route.name,
      return_route_id: route.return_route_id ? String(route.return_route_id) : "",
      full_trip_minutes: route.full_trip_minutes || "",
      is_active: route.is_active ? "1" : "0",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", return_route_id: "", full_trip_minutes: "", is_active: "1" });
  }

  async function saveEdit(route) {
    if (!editForm.name.trim()) return;
    setSavingId(route.id);
    try {
      await api.put(`/routes/${route.id}`, {
        name: editForm.name.trim(),
        return_route_id: editForm.return_route_id || null,
        full_trip_minutes: editForm.full_trip_minutes ? Number(editForm.full_trip_minutes) : null,
        is_active: editForm.is_active === "1" ? 1 : 0,
      });
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this route?")) return;
    await api.del(`/routes/${id}`);
    load();
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRoutes = normalizedQuery
    ? routes.filter((route) => route.name.toLowerCase().includes(normalizedQuery))
    : routes;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("routes_title")}</h1>
          <p>{t("routes_subtitle")}</p>
        </div>
      </div>

      {canWrite && <div className="card" style={{ marginBottom: 20 }}>
        <form className="form-row" onSubmit={handleAdd}>
          <input placeholder={t("route_name")} value={name} onChange={(e) => setName(e.target.value)} />
          <select value={returnRouteId} onChange={(e) => setReturnRouteId(e.target.value)}>
            <option value="">{t("return_route")} — {t("none")}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input placeholder="Full trip time (minutes)" type="number" value={fullTripMinutes}
            onChange={(e) => setFullTripMinutes(e.target.value)} />
          <button className="primary" type="submit" disabled={adding} aria-busy={adding}>{adding ? "Adding…" : t("add_route")}</button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "6px 0 0" }}>
          Setting a return route (e.g. Dhaka-Cumilla-Noakhali → Noakhali-Cumilla-Dhaka) lets the second
          leg auto-join the first into one rotation when a bus starts it. Full trip time is optional —
          when set, a running trip on this route is automatically marked completed once that much time
          has passed since departure.
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>}

      <div className="card routes-management-card">
        <div className="routes-list-header">
          <div><span className="settings-eyebrow">ROUTE DIRECTORY</span><strong>{routes.length} unique routes</strong><small>Use Edit route to change every saved detail without losing linked operations.</small></div>
          <input aria-label="Search routes" placeholder="Search route…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-scroll">
        <table className="routes-table">
          <thead><tr><th>{t("route")}</th><th>{t("return_route")}</th><th>Full trip time</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {visibleRoutes.map((r) => (
              <tr key={r.id} className={editingId === r.id ? "route-edit-row" : ""}>
                <td>
                  {editingId === r.id
                    ? <input className="route-edit-control route-name-control" autoFocus value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    : <strong className="route-name-cell">{r.name}</strong>}
                </td>
                <td>
                  {editingId === r.id ? (
                    <select className="route-edit-control" value={editForm.return_route_id} onChange={(e) => setEditForm({ ...editForm, return_route_id: e.target.value })}>
                      <option value="">{t("none")}</option>
                      {routes.filter((o) => o.id !== r.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : <span>{r.return_route_name || t("none")}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input className="route-edit-control route-time-control" type="number" min="1" value={editForm.full_trip_minutes} onChange={(e) => setEditForm({ ...editForm, full_trip_minutes: e.target.value })} placeholder="minutes" />
                    : <span>{r.full_trip_minutes ? `${r.full_trip_minutes} min` : t("none")}</span>}
                </td>
                <td>{editingId === r.id
                  ? <select className="route-edit-control route-status-control" value={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value })}><option value="1">{t("active")}</option><option value="0">{t("inactive")}</option></select>
                  : <span className={`badge ${r.is_active ? "active" : "on_leave"}`}>{r.is_active ? t("active") : t("inactive")}</span>}</td>
                <td>
                  {canWrite && (editingId === r.id ? <div className="route-actions"><button className="primary" type="button" disabled={!editForm.name.trim() || savingId === r.id} aria-busy={savingId === r.id} onClick={() => saveEdit(r)}>{savingId === r.id ? "Saving…" : t("save")}</button><button className="place-secondary-action" type="button" disabled={savingId === r.id} onClick={cancelEdit}>{t("cancel")}</button></div>
                    : <div className="route-actions"><button className="settings-edit-button" type="button" onClick={() => startEdit(r)}>Edit route</button><button className="link-danger" type="button" onClick={() => toggleActive(r)}>{r.is_active ? t("deactivate") : t("activate")}</button><button className="link-danger" type="button" onClick={() => handleDelete(r.id)}>{t("remove")}</button></div>)}
                </td>
              </tr>
            ))}
            {visibleRoutes.length === 0 && <tr><td colSpan={5}>{normalizedQuery ? "No routes match your search." : t("no_data")}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
