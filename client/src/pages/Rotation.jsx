import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

const today = () => new Date().toISOString().slice(0, 10);
const empty = { bus_id: "", driver_id: "", helper_id: "", supervisor_id: "", coach_id: "", route: "", duty_date: today(), shift_start: "" };

export default function Rotation() {
  const [rows, setRows] = useState([]);
  const [buses, setBuses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [routesList, setRoutesList] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [returnModal, setReturnModal] = useState(null);
  const [returnRoute, setReturnRoute] = useState("");

  function load() {
    api.get("/rotations").then(setRows).catch(() => {});
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/routes?active=1").then(setRoutesList).catch(() => {});
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!form.bus_id || !form.duty_date) { setError("Bus and duty date are required"); return; }
    try {
      await api.post("/rotations", {
        ...form,
        driver_id: form.driver_id || null,
        helper_id: form.helper_id || null,
        supervisor_id: form.supervisor_id || null,
        coach_id: form.coach_id || null,
      });
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    await api.del(`/rotations/${id}`);
    load();
  }

  const linkedRouteFor = (routeName) => {
    const route = routesList.find((r) => r.name === routeName);
    return routesList.find((r) => r.id === route?.return_route_id) || null;
  };
  function openReturnModal(rotation) {
    const linked = linkedRouteFor(rotation.route);
    setReturnModal(rotation);
    setReturnRoute(linked?.name || "");
  }
  async function confirmReturnRotation() {
    if (!returnModal || !returnRoute) { setError("Choose a return route"); return; }
    try {
      await api.post("/rotations", {
        bus_id: returnModal.bus_id, driver_id: returnModal.driver_id || null, helper_id: returnModal.helper_id || null,
        supervisor_id: returnModal.supervisor_id || null,
        coach_id: returnModal.coach_id || null,
        route: returnRoute, duty_date: returnModal.duty_date || today(), shift_start: "", status: "scheduled",
      });
      setReturnModal(null); setReturnRoute(""); load();
    } catch (err) { setError(err.message); }
  }

  const drivers = staff.filter((s) => s.designation === "driver");
  const helpers = staff.filter((s) => s.designation === "helper");
  const supervisors = staff.filter((s) => s.designation === "supervisor");
  const coaches = staff.filter((s) => s.designation === "coach");
  const busName = (id) => buses.find((b) => b.id === id)?.reg_number || "—";
  const staffName = (id) => staff.find((s) => s.id === id)?.name || "—";
  const formLinkedRoute = linkedRouteFor(form.route);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("rotation_title")}</h1>
          <p>{t("rotation_subtitle")}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          This form is for scheduling a duty ahead of time. Once a bus actually leaves the counter on
          Live Activity, its rotation appears below automatically — no need to add it again here.
        </p>
        <form className="form-row" onSubmit={handleAdd}>
          <select value={form.bus_id} onChange={(e) => setForm({ ...form, bus_id: e.target.value })}>
            <option value="">{t("select_bus")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
          </select>
          <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
            <option value="">{t("driver")}</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={form.helper_id} onChange={(e) => setForm({ ...form, helper_id: e.target.value })}>
            <option value="">{t("helper")}</option>
            {helpers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
            <option value="">{t("supervisor")}</option>
            {supervisors.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
          </select>
          <select value={form.coach_id} onChange={(e) => setForm({ ...form, coach_id: e.target.value })}>
            <option value="">Coach</option>
            {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
          </select>
          <select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
            <option value="">{t("select_route")}</option>
            {routesList.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: "0.85rem" }}>Linked trip: <strong>{formLinkedRoute?.name || "No linked route"}</strong></span>
          <input type="date" value={form.duty_date}
            onChange={(e) => setForm({ ...form, duty_date: e.target.value })} />
          <input type="time" value={form.shift_start} title="Start time"
            onChange={(e) => setForm({ ...form, shift_start: e.target.value })} />
          <button className="primary" type="submit">{t("add_rotation")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>{t("date")}</th><th>{t("bus")}</th><th>{t("driver")}</th><th>{t("helper")}</th><th>{t("supervisor")}</th><th>Coach</th><th>{t("route")}</th><th>Linked trip</th><th>{t("shift")}</th><th>{t("status")}</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.duty_date}</td>
                <td>{r.reg_number || busName(r.bus_id)}{r.rotation_no ? ` — #${r.rotation_no}` : ""}</td>
                <td>{staffName(r.driver_id)}</td>
                <td>{staffName(r.helper_id)}</td>
                <td>{staffName(r.supervisor_id)}</td>
                <td>{staffName(r.coach_id)}</td>
                <td>{r.route}</td>
                <td>{linkedRouteFor(r.route)?.name || "—"}</td>
                <td>{r.shift_start || "—"} – {r.shift_end || "—"}{r.trip_id ? " (from trip)" : ""}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td><button className="primary" onClick={() => openReturnModal(r)} disabled={!linkedRouteFor(r.route)}>Start linked trip</button> <button className="link-danger" onClick={() => handleDelete(r.id)}>{t("remove")}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11}>{t("no_rotations_yet")}</td></tr>}
          </tbody>
        </table>
      </div>
      {returnModal && (
        <div className="card" style={{ position: "fixed", zIndex: 10, width: "min(560px, calc(100vw - 32px))", left: "50%", top: "25%", transform: "translateX(-50%)", boxShadow: "0 10px 35px #0005" }}>
          <h3 style={{ marginTop: 0 }}>Confirm linked trip</h3>
          <p>You are adding the next rotation for <strong>{busName(returnModal.bus_id)}</strong>. The configured linked route is shown first; choose another route only if this trip is an exception.</p>
          <select value={returnRoute} onChange={(e) => setReturnRoute(e.target.value)} style={{ width: "100%", marginBottom: 12 }}>
            <option value="">Choose linked or exceptional route</option>
            {linkedRouteFor(returnModal.route) && <option value={linkedRouteFor(returnModal.route).name}>{linkedRouteFor(returnModal.route).name} (linked trip)</option>}
            {routesList.filter((route) => route.name !== linkedRouteFor(returnModal.route)?.name).map((route) => <option key={route.id} value={route.name}>{route.name} (exception)</option>)}
          </select>
          <div style={{ display: "flex", gap: 8 }}><button className="primary" onClick={confirmReturnRotation}>Confirm and add rotation</button><button className="link-danger" onClick={() => setReturnModal(null)}>{t("cancel")}</button></div>
        </div>
      )}
    </div>
  );
}
