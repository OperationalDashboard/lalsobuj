import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { t } from "../i18n.js";
import BusIcon from "../components/BusIcon.jsx";

const DEFAULT_BUS_CLASSES = ["AC", "Non AC", "Sleeper"];
const empty = { reg_number: "", model: "", class_type: "", capacity: "", route: "", status: "active" };

export default function Buses() {
  const me = getUser();
  const canEditFull = isFullAccess(me?.role);
  const canEditStatus = canEditFull || me?.role === ROLES.MAINTENANCE;

  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(empty);
  const [busClasses, setBusClasses] = useState(DEFAULT_BUS_CLASSES);
  const [error, setError] = useState("");
  const [statusEditId, setStatusEditId] = useState(null);

  function load() {
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/settings").then((settings) => {
      try {
        const parsed = JSON.parse(settings.bus_class_types || "null");
        setBusClasses(Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BUS_CLASSES);
      } catch {
        setBusClasses(DEFAULT_BUS_CLASSES);
      }
    }).catch(() => {});
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

  async function handleClassChange(id, classType) {
    try {
      await api.put(`/buses/${id}`, { class_type: classType || null });
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
            <select value={form.class_type} onChange={(e) => setForm({ ...form, class_type: e.target.value })}>
              <option value="">Select bus class</option>
              {busClasses.map((classType) => <option key={classType} value={classType}>{classType}</option>)}
            </select>
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
            <tr><th></th><th>{t("reg_number")}</th><th>{t("model")}</th><th>Class</th><th>{t("capacity")}</th><th>{t("route")}</th><th>{t("status")}</th>{canEditFull && <th></th>}</tr>
          </thead>
          <tbody>
            {buses.map((b) => (
              <tr key={b.id}>
                <td><BusIcon size={24} muted={b.status !== "active"} /></td>
                <td>{b.reg_number}</td>
                <td>{b.model}</td>
                <td>{canEditFull ? <select value={b.class_type || ""} onChange={(e) => handleClassChange(b.id, e.target.value)}><option value="">No class</option>{b.class_type && !busClasses.includes(b.class_type) && <option value={b.class_type}>{b.class_type} (legacy)</option>}{busClasses.map((classType) => <option key={classType} value={classType}>{classType}</option>)}</select> : (b.class_type || "—")}</td>
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
