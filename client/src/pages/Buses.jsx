import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { t } from "../i18n.js";
import BusIcon from "../components/BusIcon.jsx";

const DEFAULT_BUS_CLASSES = ["AC", "Non AC", "Sleeper"];
const DEFAULT_BUS_CATEGORIES = ["Economy (AC)", "Economy (NON AC)", "Suite-Class AC (AC)", "Sleeper (AC)"];
const empty = {
  reg_number: "", model: "", class_type: "", capacity: "", route: "", status: "active",
  fleet_serial: "", source_bus_number: "", category: "", capacity_label: "",
  manufacturer: "", manufacturer_country: "", model_year: "", registration_date: "", source_note: "",
};
const PAGE_SIZE = 25;

export default function Buses() {
  const me = getUser();
  const canEditFull = isFullAccess(me?.role);
  const canEditStatus = canEditFull || me?.role === ROLES.MAINTENANCE;

  const [buses, setBuses] = useState([]);
  const [form, setForm] = useState(empty);
  const [busClasses, setBusClasses] = useState(DEFAULT_BUS_CLASSES);
  const [busCategories, setBusCategories] = useState(DEFAULT_BUS_CATEGORIES);
  const [error, setError] = useState("");
  const [statusEditId, setStatusEditId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function load() {
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/settings").then((settings) => {
      try {
        const parsed = JSON.parse(settings.bus_class_types || "null");
        setBusClasses(Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BUS_CLASSES);
      } catch {
        setBusClasses(DEFAULT_BUS_CLASSES);
      }
      try {
        const parsed = JSON.parse(settings.bus_categories || "null");
        setBusCategories(Array.isArray(parsed) ? parsed : DEFAULT_BUS_CATEGORIES);
      } catch {
        setBusCategories(DEFAULT_BUS_CATEGORIES);
      }
    }).catch(() => {});
  }
  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : null,
        fleet_serial: form.fleet_serial ? Number(form.fleet_serial) : null,
        model_year: form.model_year ? Number(form.model_year) : null,
      };
      if (editingId) await api.put(`/buses/${editingId}`, payload);
      else await api.post("/buses", payload);
      setForm(empty);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(bus) {
    setEditingId(bus.id);
    setShowForm(true);
    setForm(Object.fromEntries(Object.keys(empty).map((key) => [key, bus[key] ?? ""])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(empty);
    setError("");
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

  async function handleCategoryChange(id, category) {
    try {
      await api.put(`/buses/${id}`, { category: category || null });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredBuses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return buses;
    return buses.filter((bus) => [
      bus.fleet_serial, bus.source_bus_number, bus.reg_number, bus.category,
      bus.class_type, bus.capacity, bus.capacity_label, bus.manufacturer,
      bus.manufacturer_country, bus.model, bus.model_year, bus.registration_date,
      bus.route, bus.status,
    ].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [buses, search]);
  const pageCount = Math.max(1, Math.ceil(filteredBuses.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleBuses = filteredBuses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

      {canEditFull && !showForm && <div className="bus-add-launch"><button type="button" className="primary" onClick={() => { setEditingId(null); setForm(empty); setShowForm(true); }}>+ Add bus</button></div>}
      {canEditFull && showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="bus-form-heading"><div><strong>{editingId ? "Edit bus details" : "Add a bus"}</strong><span>All detailed fields are optional except the unique registration key.</span></div>{editingId && <button type="button" className="secondary" onClick={cancelEdit}>Cancel editing</button>}</div>
          <form className="bus-form-grid" onSubmit={handleSubmit}>
            <label>Internal unique key<input placeholder="Internal unique key" value={form.reg_number} required onChange={(e) => setForm({ ...form, reg_number: e.target.value })} /></label>
            <label>Fleet serial<input type="number" placeholder="e.g. 25" value={form.fleet_serial} onChange={(e) => setForm({ ...form, fleet_serial: e.target.value })} /></label>
            <label>Bus number<input placeholder="Bus number" value={form.source_bus_number} onChange={(e) => setForm({ ...form, source_bus_number: e.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select category</option>
              {form.category && !busCategories.includes(form.category) && <option value={form.category}>{form.category} (legacy)</option>}
              {busCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select></label>
            <label>Configured class<select value={form.class_type} onChange={(e) => setForm({ ...form, class_type: e.target.value })}>
              <option value="">Select bus class</option>
              {busClasses.map((classType) => <option key={classType} value={classType}>{classType}</option>)}
            </select></label>
            <label>Capacity<input placeholder={t("capacity")} type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
            <label>Capacity description<input placeholder="e.g. 43 Seater (28 B + 15 S)" value={form.capacity_label} onChange={(e) => setForm({ ...form, capacity_label: e.target.value })} /></label>
            <label>Manufacturer<input placeholder="e.g. HINO 1J" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></label>
            <label>Country<input placeholder="e.g. Japan" value={form.manufacturer_country} onChange={(e) => setForm({ ...form, manufacturer_country: e.target.value })} /></label>
            <label>Model year<input type="number" placeholder="e.g. 2024" value={form.model_year} onChange={(e) => setForm({ ...form, model_year: e.target.value })} /></label>
            <label>Registration date<input type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} /></label>
            <label>Route<input placeholder={t("route")} value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">{t("active")}</option>
              <option value="unavailable">unavailable</option>
              <option value="maintenance">maintenance</option>
              <option value="retired">{t("retired")}</option>
            </select></label>
            <label className="bus-form-wide">Source note<input placeholder="Optional note about the source data" value={form.source_note} onChange={(e) => setForm({ ...form, source_note: e.target.value })} /></label>
            <button className="primary" type="submit">{editingId ? "Save bus details" : t("add_bus")}</button>
          </form>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      <div className="card">
        <div className="bus-toolbar"><div><strong>{filteredBuses.length} buses</strong><span>{search ? ` matching “${search}”` : " in the fleet register"}</span></div><input type="search" placeholder="Search number, class, maker, year or route" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="table-scroll"><table className="bus-details-table">
          <thead>
            <tr><th>Fleet</th><th>Bus number</th><th>Category</th><th>Capacity</th><th>Manufacturer</th><th>Year / registration</th><th>{t("route")}</th><th>{t("status")}</th>{canEditFull && <th></th>}</tr>
          </thead>
          <tbody>
            {visibleBuses.map((b) => (
              <tr key={b.id}>
                <td><div className="bus-fleet-cell"><BusIcon size={24} muted={b.status !== "active"} /><strong>{b.fleet_serial || "—"}</strong></div></td>
                <td><strong>{b.source_bus_number || b.reg_number}</strong></td>
                <td>{canEditFull ? <select className="bus-category-select" value={b.category || ""} onChange={(e) => handleCategoryChange(b.id, e.target.value)}><option value="">No category</option>{b.category && !busCategories.includes(b.category) && <option value={b.category}>{b.category} (legacy)</option>}{busCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select> : <strong>{b.category || "—"}</strong>}</td>
                <td><strong>{b.capacity ?? "—"}</strong>{b.capacity_label && <small>{b.capacity_label}</small>}</td>
                <td><strong>{b.manufacturer || b.model || "—"}</strong>{b.manufacturer_country && <small>{b.manufacturer_country}</small>}</td>
                <td><strong>{b.model_year || "—"}</strong><small>{b.registration_date || (b.source_note?.includes("unavailable") ? "Date unavailable in PDF" : "No registration date")}</small></td>
                <td>{b.route || "—"}</td>
                <td>
                  {canEditStatus && statusEditId === b.id ? (
                    <select autoFocus defaultValue={b.status} onChange={(e) => handleStatusChange(b.id, e.target.value)} onBlur={() => setStatusEditId(null)}>
                      <option value="active">{t("active")}</option>
                      <option value="unavailable">unavailable</option>
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
                {canEditFull && <td><div className="bus-row-actions"><button className="bus-edit-button" onClick={() => startEdit(b)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8L17.6 5a2 2 0 0 0-2.8 0L4 15.8V20Z"/><path d="m13.5 6.3 4.2 4.2M4 20l4.6-1"/></svg><span>Edit</span></button><button className="link-danger" onClick={() => handleDelete(b.id)}>{t("remove")}</button></div></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
        {!visibleBuses.length && <p className="empty">No buses match this search.</p>}
        {pageCount > 1 && <div className="bus-pagination"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredBuses.length)} of {filteredBuses.length}</span><div><button className="secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>Page {currentPage} of {pageCount}</strong><button className="secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>}
      </div>
    </div>
  );
}
