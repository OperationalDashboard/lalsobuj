import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { canUseFeature } from "../permissions.js";
import { busLabel } from "../busLabel.js";
import SearchableSelect from "../components/SearchableSelect.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const empty = { bus_id: "", driver_id: "", helper_id: "", supervisor_id: "", coach_name: "", route: "", duty_date: today(), shift_start: "" };

export default function Rotation() {
  const canWrite = canUseFeature(getUser(), "rotations", "write");
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
    if (!form.bus_id || !form.route || !form.duty_date) { setError("Bus, route, and duty date are required"); return; }
    try {
      await api.post("/rotations", {
        ...form,
        driver_id: form.driver_id || null,
        helper_id: form.helper_id || null,
        supervisor_id: form.supervisor_id || null,
        coach_name: form.coach_name.trim() || null,
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
        coach_name: returnModal.coach_name || null,
        route: returnRoute, duty_date: returnModal.duty_date || today(), shift_start: "", status: "scheduled",
      });
      setReturnModal(null); setReturnRoute(""); load();
    } catch (err) { setError(err.message); }
  }

  const drivers = staff.filter((s) => s.designation === "driver" || s.staff_type_group === "bus");
  const helpers = staff.filter((s) => s.designation === "helper" || s.staff_type_group === "bus");
  const supervisors = staff.filter((s) => s.designation === "supervisor" || s.staff_type_group === "bus");
  const activeBuses = buses.filter((b) => b.status === "active");
  // Keep completed/running history visible, but an unstarted duty for a bus
  // that has gone into maintenance must disappear until the bus is active.
  const visibleRows = rows.filter((r) => r.trip_id || r.status !== "scheduled" || r.bus_status === "active");
  const hiddenUnavailableCount = rows.length - visibleRows.length;
  const busName = (id) => busLabel(buses.find((b) => b.id === id));
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

      {canWrite && <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          This form is for scheduling a duty ahead of time. Once a bus actually leaves the counter on
          Live Activity, its rotation appears below automatically — no need to add it again here.
        </p>
        <form className="form-row" onSubmit={handleAdd}>
          <SearchableSelect id="rotation-bus" value={form.bus_id} onChange={(bus_id) => setForm({ ...form, bus_id })} options={activeBuses.map((b) => ({ value: b.id, label: busLabel(b) }))} placeholder="Search bus number" required />
          <SearchableSelect id="rotation-driver" value={form.driver_id} onChange={(driver_id) => setForm({ ...form, driver_id })} options={drivers.map((driver) => ({ value: driver.id, label: driver.name }))} placeholder="Search driver (optional)" />
          <SearchableSelect id="rotation-helper" value={form.helper_id} onChange={(helper_id) => setForm({ ...form, helper_id })} options={helpers.map((helper) => ({ value: helper.id, label: helper.name }))} placeholder="Search helper (optional)" />
          <SearchableSelect id="rotation-supervisor" value={form.supervisor_id} onChange={(supervisor_id) => setForm({ ...form, supervisor_id })} options={supervisors.map((supervisor) => ({ value: supervisor.id, label: supervisor.name }))} placeholder="Search supervisor (optional)" />
          <input placeholder="Coach" value={form.coach_name}
            onChange={(e) => setForm({ ...form, coach_name: e.target.value })} />
          <SearchableSelect id="rotation-route" value={form.route} onChange={(route) => setForm({ ...form, route })} options={routesList.map((route) => ({ value: route.name, label: route.name }))} placeholder="Search route" required />
          <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: "0.85rem" }}>Linked trip: <strong>{formLinkedRoute?.name || "No linked route"}</strong></span>
          <input type="date" value={form.duty_date}
            onChange={(e) => setForm({ ...form, duty_date: e.target.value })} />
          <input type="time" value={form.shift_start} title="Start time"
            onChange={(e) => setForm({ ...form, shift_start: e.target.value })} />
          <button className="primary" type="submit">{t("add_rotation")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>}

      <div className="card">
        {hiddenUnavailableCount > 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
            {hiddenUnavailableCount} scheduled rotation{hiddenUnavailableCount === 1 ? " is" : "s are"} hidden because the bus is under maintenance or retired.
          </p>
        )}
        <table>
          <thead>
            <tr><th>{t("date")}</th><th>{t("bus")}</th><th>{t("driver")}</th><th>{t("helper")}</th><th>{t("supervisor")}</th><th>Coach</th><th>{t("route")}</th><th>Linked trip</th><th>{t("shift")}</th><th>{t("status")}</th><th></th></tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id}>
                <td>{r.duty_date}</td>
                <td>{busLabel(r) || busName(r.bus_id)}{r.rotation_no ? ` — #${r.rotation_no}` : ""}</td>
                <td>{staffName(r.driver_id)}</td>
                <td>{staffName(r.helper_id)}</td>
                <td>{staffName(r.supervisor_id)}</td>
                <td>{r.coach_name || staffName(r.coach_id)}</td>
                <td>{r.route}</td>
                <td>{linkedRouteFor(r.route)?.name || "—"}</td>
                <td>{r.shift_start || "—"} – {r.shift_end || "—"}{r.trip_id ? " (from trip)" : ""}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{canWrite && <><button className="primary" onClick={() => openReturnModal(r)} disabled={!linkedRouteFor(r.route) || r.bus_status !== "active"} title={r.bus_status !== "active" ? "This bus is unavailable" : ""}>Start linked trip</button> <button className="link-danger" onClick={() => handleDelete(r.id)}>{t("remove")}</button></>}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && <tr><td colSpan={11}>{t("no_rotations_yet")}</td></tr>}
          </tbody>
        </table>
      </div>
      {canWrite && returnModal && (
        <div className="card" style={{ position: "fixed", zIndex: 10, width: "min(560px, calc(100vw - 32px))", left: "50%", top: "25%", transform: "translateX(-50%)", boxShadow: "0 10px 35px #0005" }}>
          <h3 style={{ marginTop: 0 }}>Confirm linked trip</h3>
          <p>You are adding the next rotation for <strong>{busName(returnModal.bus_id)}</strong>. The configured linked route is shown first; choose another route only if this trip is an exception.</p>
          <SearchableSelect id="rotation-return-route" value={returnRoute} onChange={setReturnRoute} className="rotation-return-picker" options={routesList.map((route) => ({ value: route.name, label: route.name === linkedRouteFor(returnModal.route)?.name ? `${route.name} (linked trip)` : `${route.name} (exception)` }))} placeholder="Search linked or exceptional route" />
          <div style={{ display: "flex", gap: 8 }}><button className="primary" onClick={confirmReturnRotation}>Confirm and add rotation</button><button className="link-danger" onClick={() => setReturnModal(null)}>{t("cancel")}</button></div>
        </div>
      )}
    </div>
  );
}
