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
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(empty);
  const [savingId, setSavingId] = useState(null);

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

  function startEdit(counter) {
    setError("");
    setReassigningId(null);
    setEditingId(counter.id);
    setEditForm({
      name: counter.name || "",
      location: counter.location || "",
      place_id: counter.place_id ? String(counter.place_id) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(empty);
  }

  async function handleSave(e, id) {
    e.preventDefault();
    setError("");
    if (!editForm.name.trim()) return;
    setSavingId(id);
    try {
      await api.put(`/counters/${id}`, {
        name: editForm.name.trim(),
        location: editForm.location.trim() || null,
        place_id: editForm.place_id || null,
      });
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
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
  const counterDesignationStaff = staff.filter((s) => s.staff_type_group === "counter");

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

      <div className="counter-management-list">
      {counters.map((c) => (
        <article key={c.id} className={`card counter-management-card${editingId === c.id ? " editing" : ""}`}>
          <div className="counter-management-header">
            <div className="counter-management-title">
              <span className="counter-management-icon" aria-hidden="true">⌖</span>
              <div><strong>{c.name}</strong><span>{c.place_name || "No parent place"}{c.location ? ` · ${c.location}` : " · No location"}</span></div>
            </div>
            <div className="counter-management-actions">
              <button type="button" className="settings-edit-button" onClick={() => startEdit(c)} disabled={savingId === c.id}>Edit details</button>
              <button type="button" className="link-danger" onClick={() => handleDelete(c.id)} disabled={savingId === c.id}>{t("remove")}</button>
            </div>
          </div>

          {editingId === c.id && <form className="counter-edit-panel" onSubmit={(e) => handleSave(e, c.id)}>
            <label><span>Counter name</span><input autoFocus value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
            <label><span>Location</span><input placeholder="e.g. Dhaka" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} /></label>
            <label><span>Parent place</span><select value={editForm.place_id} onChange={(e) => setEditForm({ ...editForm, place_id: e.target.value })}><option value="">No parent place</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
            <div className="counter-edit-actions">
              <button className="primary" type="submit" disabled={!editForm.name.trim() || savingId === c.id} aria-busy={savingId === c.id}>{savingId === c.id ? "Saving…" : "Save changes"}</button>
              <button className="place-secondary-action" type="button" onClick={cancelEdit} disabled={savingId === c.id}>Cancel</button>
            </div>
          </form>}

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
        </article>
      ))}
      </div>
      {counters.length === 0 && <div className="card">{t("no_counters_yet")}</div>}
    </div>
  );
}
