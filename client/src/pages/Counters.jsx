import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

const empty = { name: "", location: "", place_id: "" };

export default function Counters() {
  const [counters, setCounters] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [reassigningId, setReassigningId] = useState(null);
  const [places, setPlaces] = useState([]);

  function load() {
    api.get("/counters").then(setCounters).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/accounts/expense-places").then(setPlaces).catch(() => {});
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return;
    try {
      await api.post("/counters", form);
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this counter? Staff assigned to it will become unassigned.")) return;
    await api.del(`/counters/${id}`);
    load();
  }

  // Move a staff member to this counter (or unassign them) — the toggle
  // requested for "Staff posted at": Counter staff assignment used to be
  // fixed once set, this makes it changeable right from here too.
  async function handleReassign(staffId, counterId) {
    setError("");
    try {
      await api.put(`/staff/${staffId}`, { counter_id: counterId || null });
      setReassigningId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const staffAt = (counterId) => staff.filter((s) => s.counter_id === counterId);
  const counterDesignationStaff = staff.filter((s) =>
    ["counter_manager", "assistant_counter_manager", "caller_man", "office"].includes(s.designation)
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("counters_title")}</h1>
          <p>{t("counters_subtitle")}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <form className="form-row" onSubmit={handleAdd}>
          <input placeholder={t("counter_name")} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder={`${t("location")} (e.g. Dhaka)`} value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select value={form.place_id} onChange={(e) => setForm({ ...form, place_id: e.target.value })}><option value="">No parent place</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
          <button className="primary" type="submit">{t("add_counter")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {counters.map((c) => (
        <div key={c.id} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{c.name}</strong>{c.place_name ? ` — ${c.place_name}` : c.location ? ` — ${c.location}` : ""}
            </div>
            <button className="link-danger" onClick={() => handleDelete(c.id)}>{t("remove")}</button>
          </div>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>{t("staff_posted_here")}</th><th>{t("designation")}</th><th></th></tr></thead>
            <tbody>
              {staffAt(c.id).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.designation}</td>
                  <td><button className="link-danger" onClick={() => handleReassign(s.id, null)}>Unassign</button></td>
                </tr>
              ))}
              {staffAt(c.id).length === 0 && <tr><td colSpan={3}>{t("no_staff_assigned")}</td></tr>}
            </tbody>
          </table>
          {reassigningId === c.id ? (
            <div className="form-row" style={{ marginTop: 10 }}>
              <select autoFocus onChange={(e) => e.target.value && handleReassign(e.target.value, c.id)} onBlur={() => setReassigningId(null)}>
                <option value="">Pick staff to post here</option>
                {counterDesignationStaff.filter((s) => s.counter_id !== c.id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.designation})</option>)}
              </select>
            </div>
          ) : (
            <button className="link-danger" style={{ marginTop: 8 }} onClick={() => setReassigningId(c.id)}>+ Post staff here</button>
          )}
        </div>
      ))}
      {counters.length === 0 && <div className="card">{t("no_counters_yet")}</div>}
    </div>
  );
}
