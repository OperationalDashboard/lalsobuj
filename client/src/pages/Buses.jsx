import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { t } from "../i18n.js";
import BusIcon from "../components/BusIcon.jsx";

const empty = { reg_number: "", model: "", capacity: "", route: "", status: "active" };

export default function Buses() {
  const me = getUser();
  const canEditFull = isFullAccess(me?.role);
  const canEditStatus = canEditFull || me?.role === ROLES.MAINTENANCE;

  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [statusEditId, setStatusEditId] = useState(null);

  function load() {
    api.get("/buses").then(setBuses).catch(() => {});
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/buses", { ...form, capacity: form.capacity ? Number(form.capacity) : null });
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this bus?")) return;
    await api.del(`/buses/${id}`);
    load();
  }

  async function handleStatusChange(id, status) {
    try {
      await api.put(`/buses/${id}/status`, { status });
      setStatusEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <BusIcon size={40} />
          <div>
            <h1>{t("buses_title")}</h1>
            <p>{t("buses_subtitle")}</p>
          </div>
        </div>
      </div>

      {canEditFull && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-row" onSubmit={handleAdd}>
            <input placeholder={t("reg_number")} value={form.reg_number} required
              onChange={(e) => setForm({ ...form, reg_number: e.target.value })} />
            <input placeholder={t("model")} value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input placeholder={t("capacity")} type="number" value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            <input placeholder={t("route")} value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">{t("active")}</option>
              <option value="maintenance">maintenance</option>
              <option value="retired">{t("retired")}</option>
            </select>
            <button className="primary" type="submit">{t("add_bus")}</button>
          </form>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th></th><th>{t("reg_number")}</th><th>{t("model")}</th><th>{t("capacity")}</th><th>{t("route")}</th><th>{t("status")}</th>{canEditFull && <th></th>}</tr>
          </thead>
          <tbody>
            {buses.map((b) => (
              <tr key={b.id}>
                <td><BusIcon size={24} muted={b.status !== "active"} /></td>
                <td>{b.reg_number}</td>
                <td>{b.model}</td>
                <td>{b.capacity}</td>
                <td>{b.route}</td>
                <td>
                  {canEditStatus && statusEditId === b.id ? (
                    <select autoFocus defaultValue={b.status} onChange={(e) => handleStatusChange(b.id, e.target.value)} onBlur={() => setStatusEditId(null)}>
                      <option value="active">{t("active")}</option>
                      <option value="maintenance">maintenance</option>
                      <option value="retired">{t("retired")}</option>
                    </select>
                  ) : (
                    <span className={`badge ${b.status}`}
                      style={canEditStatus ? { cursor: "pointer" } : undefined}
                      title={canEditStatus ? "Click to change status" : undefined}
                      onClick={() => canEditStatus && setStatusEditId(b.id)}>
                      {b.status}
                    </span>
                  )}
                </td>
                {canEditFull && <td><button className="link-danger" onClick={() => handleDelete(b.id)}>{t("remove")}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
