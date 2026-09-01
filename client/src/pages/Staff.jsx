import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { canUseFeature } from "../permissions.js";
import { busLabel } from "../busLabel.js";

const DEFAULT_STAFF_TYPES = [
  { key: "driver", label: "Driver", group: "bus" }, { key: "supervisor", label: "Supervisor", group: "bus" }, { key: "bus_staff", label: "Bus Staff", group: "bus" }, { key: "helper", label: "Helper", group: "bus" }, { key: "conductor", label: "Conductor", group: "bus" }, { key: "mechanic", label: "Mechanic", group: "bus" },
  { key: "counter_manager", label: "Counter Manager", group: "counter" }, { key: "assistant_counter_manager", label: "Assistant Counter Manager", group: "counter" }, { key: "caller_man", label: "Caller Man", group: "counter" }, { key: "office", label: "Office", group: "counter" },
  { key: "fourman", label: "Fourman", group: "office" }, { key: "checker", label: "Checker", group: "office" }, { key: "accounts", label: "Accounts", group: "office" }, { key: "store_manager", label: "Store Manager", group: "office" }, { key: "general_manager", label: "General Manager", group: "office" },
];
const GROUP_LABELS = { bus: "Bus staff", counter: "Counter staff", office: "Office staff", legacy: "Previous staff types" };

const empty = { name: "", designation: "driver", phone: "", nid_number: "", joining_date: "", assigned_bus_id: "", counter_id: "", status: "active" };

export default function Staff() {
  const canWrite = canUseFeature(getUser(), "staff", "write");
  const [staff, setStaff] = useState([]);
  const [buses, setBuses] = useState([]);
  const [counters, setCounters] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [statusEditId, setStatusEditId] = useState(null);
  const [postedEditId, setPostedEditId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(empty);
  const [staffTypes, setStaffTypes] = useState(DEFAULT_STAFF_TYPES);

  function load() {
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/counters").then(setCounters).catch(() => {});
    api.get("/settings").then((settings) => { try { const types = JSON.parse(settings.staff_types || "null"); if (Array.isArray(types) && types.length) setStaffTypes(types); } catch {} }).catch(() => {});
  }
  useEffect(load, []);

  const typeFor = (key) => staffTypes.find((type) => type.key === key) || { key, label: key?.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") || "Unspecified", group: "legacy" };
  const designationLabel = (key) => typeFor(key).label;
  const isCounterDesignation = typeFor(form.designation).group === "counter";
  const typeGroups = ["bus", "counter", "office", "legacy"].map((group) => ({ group, options: staffTypes.filter((type) => type.group === group) }));

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
      const isCounter = typeFor(staffMember.designation).group === "counter";
      await api.put(`/staff/${staffMember.id}`, isCounter ? { counter_id: value || null } : { assigned_bus_id: value || null });
      setPostedEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const busName = (id) => busLabel(buses.find((b) => b.id === id));
  const counterName = (id) => counters.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("staff_title")}</h1>
          <p>Bus staff (driver, supervisor, helper, conductor, mechanic) and counter staff (counter manager, assistant counter manager, caller man, office). See <Link to="/counters">{t("counters")}</Link> for who's posted where.</p>
        </div>
      </div>

      {canWrite && <div className="card" style={{ marginBottom: 20 }}>
        <form className="form-row" onSubmit={handleAdd}>
          <input placeholder={t("full_name")} value={form.name} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value, assigned_bus_id: "", counter_id: "" })}>
            {typeGroups.filter((group) => group.options.length).map((group) => (
              <optgroup key={group.group} label={GROUP_LABELS[group.group]}>
                {group.options.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
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
              {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
            </select>
          )}
          <button className="primary" type="submit">{t("add_staff")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>{t("full_name")}</th><th>{t("designation")}</th><th>{t("phone")}</th><th>NID</th><th>{t("posted_at")}</th><th>{t("status")}</th><th>{t("since")}</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                {canWrite && editingId === s.id ? <>
                  <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td><select value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value, assigned_bus_id: "", counter_id: "" })}>{typeGroups.filter((group) => group.options.length || group.group === "legacy").map((group) => <optgroup key={group.group} label={GROUP_LABELS[group.group]}>{group.options.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}{group.group === "legacy" && !group.options.some((type) => type.key === editForm.designation) && <option value={editForm.designation}>{designationLabel(editForm.designation)} (legacy)</option>}</optgroup>)}</select></td>
                  <td><input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td><input value={editForm.nid_number || ""} onChange={(e) => setEditForm({ ...editForm, nid_number: e.target.value })} /></td>
                  <td>{typeFor(editForm.designation).group === "counter" ? <select value={editForm.counter_id} onChange={(e) => setEditForm({ ...editForm, counter_id: e.target.value })}><option value="">No counter</option>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select> : <select value={editForm.assigned_bus_id} onChange={(e) => setEditForm({ ...editForm, assigned_bus_id: e.target.value })}><option value="">{t("unassigned_bus")}</option>{buses.map((bus) => <option key={bus.id} value={bus.id}>{busLabel(bus)}</option>)}</select>}</td>
                  <td><select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="active">active</option><option value="on_leave">on_leave</option><option value="terminated">terminated</option></select></td>
                  <td><input type="date" value={editForm.joining_date} onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })} /></td>
                  <td><button className="primary" onClick={saveEdit}>{t("save")}</button> <button className="link-danger" onClick={() => setEditingId(null)}>{t("cancel")}</button></td>
                </> : <>
                <td>{s.name}</td>
                <td>{designationLabel(s.designation)}</td>
                <td>{s.phone}</td>
                <td>{s.nid_number || "—"}</td>
                <td>
                  {canWrite && postedEditId === s.id ? (
                    typeFor(s.designation).group === "counter" ? (
                      <select autoFocus defaultValue={s.counter_id || ""} onChange={(e) => handlePostedChange(s, e.target.value)} onBlur={() => setPostedEditId(null)}>
                        <option value="">{t("unassigned_bus")}</option>
                        {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <select autoFocus defaultValue={s.assigned_bus_id || ""} onChange={(e) => handlePostedChange(s, e.target.value)} onBlur={() => setPostedEditId(null)}>
                        <option value="">{t("unassigned_bus")}</option>
                        {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
                      </select>
                    )
                  ) : (
                    <span style={canWrite ? { cursor: "pointer" } : undefined} onClick={() => canWrite && setPostedEditId(s.id)} title={canWrite ? t("click_to_change") : undefined}>
                      {typeFor(s.designation).group === "counter" ? (s.counter_name || counterName(s.counter_id)) : busName(s.assigned_bus_id)} {canWrite ? "✎" : ""}
                    </span>
                  )}
                </td>
                <td>
                  {canWrite && statusEditId === s.id ? (
                    <select autoFocus defaultValue={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)} onBlur={() => setStatusEditId(null)}>
                      <option value="active">{t("active")}</option>
                      <option value="on_leave">on_leave</option>
                      <option value="terminated">terminated</option>
                    </select>
                  ) : (
                    <span className={`badge ${s.status}`} style={canWrite ? { cursor: "pointer" } : undefined} onClick={() => canWrite && setStatusEditId(s.id)} title={canWrite ? "Click to change" : undefined}>{s.status}</span>
                  )}
                </td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{new Date(s.status_changed_at).toLocaleString()}</td>
                <td>{canWrite && <><button className="link-danger" onClick={() => startEdit(s)}>{t("edit")}</button> <button className="link-danger" onClick={() => handleDelete(s.id)}>{t("remove")}</button></>}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
