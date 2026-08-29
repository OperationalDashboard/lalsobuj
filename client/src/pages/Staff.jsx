import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { t } from "../i18n.js";

const DESIGNATIONS = [
  { group: "Bus staff", options: ["driver", "supervisor", "bus_staff", "helper", "conductor", "mechanic"] },
  { group: "Counter staff", options: ["counter_manager", "assistant_counter_manager", "caller_man", "office"] },
  { group: "Admin & office staff", options: ["fourman", "checker", "accounts", "store_manager", "general_manager"] },
];
const COUNTER_DESIGNATIONS = DESIGNATIONS[1].options;
// Bus staff ride with the bus and are auto-checked-in/out from Live
// Activity/Rotation instead of clocking in through Time Management — see
// client/src/pages/Attendance.jsx.
export const BUS_DESIGNATIONS = DESIGNATIONS[0].options;
// Designations eligible to be put on a salary plan (Add Salary, per your
// list: counter managers, fourman, checker, callerman, accounts, store
// manager, GM). Anyone else can still be marked "No salary" explicitly.
export const SALARY_ELIGIBLE_DESIGNATIONS = ["counter_manager", "fourman", "checker", "caller_man", "accounts", "store_manager", "general_manager"];

const designationLabel = (d) => d.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const empty = { name: "", designation: "driver", phone: "", nid_number: "", joining_date: "", assigned_bus_id: "", counter_id: "", status: "active" };

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [buses, setBuses] = useState([]);
  const [counters, setCounters] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [statusEditId, setStatusEditId] = useState(null);
  const [postedEditId, setPostedEditId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(empty);

  function load() {
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/counters").then(setCounters).catch(() => {});
  }
  useEffect(load, []);

  const isCounterDesignation = COUNTER_DESIGNATIONS.includes(form.designation);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/staff", {
        ...form,
        assigned_bus_id: form.assigned_bus_id || null,
        counter_id: form.counter_id || null,
      });
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this staff member?")) return;
    await api.del(`/staff/${id}`);
    load();
  }
  function startEdit(member) {
    setEditingId(member.id);
    setEditForm({ ...empty, ...member, assigned_bus_id: member.assigned_bus_id || "", counter_id: member.counter_id || "", joining_date: member.joining_date || "" });
  }
  async function saveEdit() {
    setError("");
    try {
      await api.put(`/staff/${editingId}`, { ...editForm, assigned_bus_id: editForm.assigned_bus_id || null, counter_id: editForm.counter_id || null });
      setEditingId(null); load();
    } catch (err) { setError(err.message); }
  }

  // Changing status stamps status_changed_at with the current server time
  // automatically — there's no field to type a date into here.
  async function handleStatusChange(id, status) {
    setError("");
    try {
      await api.put(`/staff/${id}`, { status });
      setStatusEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Where a staff member is posted (their assigned bus, or their counter)
  // used to be fixed at creation time — this lets it be changed afterward
  // by toggling it, same pattern as the status badge above.
  async function handlePostedChange(staffMember, value) {
    setError("");
    try {
      const isCounter = COUNTER_DESIGNATIONS.includes(staffMember.designation);
      await api.put(`/staff/${staffMember.id}`, isCounter ? { counter_id: value || null } : { assigned_bus_id: value || null });
      setPostedEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const busName = (id) => buses.find((b) => b.id === id)?.reg_number || "—";
  const counterName = (id) => counters.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("staff_title")}</h1>
          <p>Bus staff (driver, supervisor, helper, conductor, mechanic) and counter staff (counter manager, assistant counter manager, caller man, office). See <Link to="/counters">{t("counters")}</Link> for who's posted where.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <form className="form-row" onSubmit={handleAdd}>
          <input placeholder={t("full_name")} value={form.name} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value, assigned_bus_id: "", counter_id: "" })}>
            {DESIGNATIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((d) => <option key={d} value={d}>{designationLabel(d)}</option>)}
              </optgroup>
            ))}
          </select>
          <input placeholder={t("phone")} value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder={t("nid_number")} value={form.nid_number}
            onChange={(e) => setForm({ ...form, nid_number: e.target.value })} />
          <input type="date" value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
          {isCounterDesignation ? (
            <select value={form.counter_id} onChange={(e) => setForm({ ...form, counter_id: e.target.value })}>
              <option value="">{t("assign_counter")}</option>
              {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <select value={form.assigned_bus_id} onChange={(e) => setForm({ ...form, assigned_bus_id: e.target.value })}>
              <option value="">{t("unassigned_bus")}</option>
              {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
            </select>
          )}
          <button className="primary" type="submit">{t("add_staff")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>{t("full_name")}</th><th>{t("designation")}</th><th>{t("phone")}</th><th>NID</th><th>{t("posted_at")}</th><th>{t("status")}</th><th>{t("since")}</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                {editingId === s.id ? <>
                  <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td><select value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value, assigned_bus_id: "", counter_id: "" })}>{DESIGNATIONS.map((group) => <optgroup key={group.group} label={group.group}>{group.options.map((option) => <option key={option} value={option}>{designationLabel(option)}</option>)}</optgroup>)}</select></td>
                  <td><input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td><input value={editForm.nid_number || ""} onChange={(e) => setEditForm({ ...editForm, nid_number: e.target.value })} /></td>
                  <td>{COUNTER_DESIGNATIONS.includes(editForm.designation) ? <select value={editForm.counter_id} onChange={(e) => setEditForm({ ...editForm, counter_id: e.target.value })}><option value="">No counter</option>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select> : <select value={editForm.assigned_bus_id} onChange={(e) => setEditForm({ ...editForm, assigned_bus_id: e.target.value })}><option value="">{t("unassigned_bus")}</option>{buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.reg_number}</option>)}</select>}</td>
                  <td><select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="active">active</option><option value="on_leave">on_leave</option><option value="terminated">terminated</option></select></td>
                  <td><input type="date" value={editForm.joining_date} onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })} /></td>
                  <td><button className="primary" onClick={saveEdit}>{t("save")}</button> <button className="link-danger" onClick={() => setEditingId(null)}>{t("cancel")}</button></td>
                </> : <>
                <td>{s.name}</td>
                <td>{designationLabel(s.designation)}</td>
                <td>{s.phone}</td>
                <td>{s.nid_number || "—"}</td>
                <td>
                  {postedEditId === s.id ? (
                    COUNTER_DESIGNATIONS.includes(s.designation) ? (
                      <select autoFocus defaultValue={s.counter_id || ""} onChange={(e) => handlePostedChange(s, e.target.value)} onBlur={() => setPostedEditId(null)}>
                        <option value="">{t("unassigned_bus")}</option>
                        {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <select autoFocus defaultValue={s.assigned_bus_id || ""} onChange={(e) => handlePostedChange(s, e.target.value)} onBlur={() => setPostedEditId(null)}>
                        <option value="">{t("unassigned_bus")}</option>
                        {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
                      </select>
                    )
                  ) : (
                    <span style={{ cursor: "pointer" }} onClick={() => setPostedEditId(s.id)} title={t("click_to_change")}>
                      {COUNTER_DESIGNATIONS.includes(s.designation) ? (s.counter_name || counterName(s.counter_id)) : busName(s.assigned_bus_id)} ✎
                    </span>
                  )}
                </td>
                <td>
                  {statusEditId === s.id ? (
                    <select autoFocus defaultValue={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)} onBlur={() => setStatusEditId(null)}>
                      <option value="active">{t("active")}</option>
                      <option value="on_leave">on_leave</option>
                      <option value="terminated">terminated</option>
                    </select>
                  ) : (
                    <span className={`badge ${s.status}`} style={{ cursor: "pointer" }} onClick={() => setStatusEditId(s.id)} title="Click to change (Admin only)">{s.status}</span>
                  )}
                </td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{new Date(s.status_changed_at).toLocaleString()}</td>
                <td><button className="link-danger" onClick={() => startEdit(s)}>{t("edit")}</button> <button className="link-danger" onClick={() => handleDelete(s.id)}>{t("remove")}</button></td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
