import { lazy, Suspense, useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { busLabel } from "../busLabel.js";
import { canUseFeature } from "../permissions.js";
import SearchableSelect from "../components/SearchableSelect.jsx";
import PdfExportButton from "../components/PdfExportButton.jsx";
import { downloadReportPdf } from "../utils/reportPdf.js";

// Explicit preview build only: never switches on from a production URL parameter.
const Maintenance3DPreview = import.meta.env.VITE_MAINTENANCE_3D_PREVIEW === "1"
  ? lazy(() => import("../components/maintenance3d/Maintenance3DPreview.jsx")) : null;
const SharedBusAnatomy = lazy(() => import("../components/maintenance3d/SharedBusAnatomy.jsx"));

const ticketEmpty = { bus_id: "", issue: "", location: "", reported_date: "", status: "open" };
const partEmpty = { part_name: "", cost: "", changed_date: "" };
const sections = [
  { status: "open", title: "Open records", description: "New issues awaiting repair." },
  { status: "in_progress", title: "In progress", description: "Buses currently being repaired." },
  { status: "long_maintenance", title: "Under long maintenance", description: "Extended repairs — these buses remain unavailable for rotation." },
  { status: "resolved", title: "Resolved records", description: "Completed repairs and their full cost history." },
];

export default function Maintenance() {
  const canWrite = canUseFeature(getUser(), "maintenance", "write");
  const [tickets, setTickets] = useState([]);
  const [buses, setBuses] = useState([]);
  const [partsCatalog, setPartsCatalog] = useState([]);
  const [locations, setLocations] = useState([]);
  const [ticketForm, setTicketForm] = useState(ticketEmpty);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({ total: 0, resolved: 0, open: 0, inProgress: 0, longMaintenance: 0, perBus: [] });

  const [openTicketId, setOpenTicketId] = useState(null);
  const [partForm, setPartForm] = useState(partEmpty);
  const [repairForm, setRepairForm] = useState(partEmpty);
  const [editingPart, setEditingPart] = useState(null);

  const [reportBus, setReportBus] = useState("");
  const [partsReport, setPartsReport] = useState([]);
  const [editingTicket, setEditingTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showAnatomy, setShowAnatomy] = useState(false);

  async function change(action) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function load() {
    api.get("/maintenance").then(setTickets).catch(() => {});
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/maintenance/parts-catalog").then(setPartsCatalog).catch(() => {});
    api.get("/maintenance/locations").then(setLocations).catch(() => {});
    api.get("/maintenance/summary").then(setSummary).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    const q = reportBus ? `?bus_id=${reportBus}` : "";
    api.get(`/maintenance/parts-report${q}`).then(setPartsReport).catch(() => {});
  }, [reportBus, tickets]);

  async function handleCreateTicket(e) {
    e.preventDefault();
    setError("");
    if (!ticketForm.bus_id || !ticketForm.issue || !ticketForm.reported_date) {
      setError("Bus, issue and reported date are required");
      return;
    }
    try {
      await api.post("/maintenance", ticketForm);
      setTicketForm(ticketEmpty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateStatus(ticket, status) {
    const resolved_date = status === "resolved" ? new Date().toISOString().slice(0, 10) : null;
    await change(() => api.put(`/maintenance/${ticket.id}`, { status, resolved_date }));
  }

  async function handleDeleteTicket(id) {
    if (!confirm("Remove this maintenance ticket and its linked expense? (Admin only)")) return;
    try {
      await api.del(`/maintenance/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleTicket(id) {
    setOpenTicketId(openTicketId === id ? null : id);
    setPartForm(partEmpty);
    setRepairForm(partEmpty);
    setEditingPart(null);
  }

  async function handleAddPart(e, ticket) {
    e.preventDefault();
    setError("");
    if (!partForm.part_name || !partForm.cost || !partForm.changed_date) {
      setError("Part name, cost and changed date are required");
      return;
    }
    try {
      await api.post(`/maintenance/${ticket.id}/parts`, { ...partForm, cost: Number(partForm.cost) });
      setPartForm(partEmpty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemovePart(ticket, partId) {
    if (!confirm("Remove this repair/part and its cost from this ticket?")) return;
    await change(() => api.del(`/maintenance/${ticket.id}/parts/${partId}`));
  }
  async function handleAddRepair(e, ticket) {
    e.preventDefault();
    if (!repairForm.part_name || !repairForm.cost || !repairForm.changed_date) { setError("Repair name, cost and date are required"); return; }
    await change(async () => { await api.post(`/maintenance/${ticket.id}/parts`, { ...repairForm, cost: Number(repairForm.cost) }); setRepairForm(partEmpty); });
  }
  async function savePartEdit(ticket) {
    await change(async () => { await api.put(`/maintenance/${ticket.id}/parts/${editingPart.id}`, { part_name: editingPart.part_name, cost: Number(editingPart.cost), changed_date: editingPart.changed_date }); setEditingPart(null); });
  }

  const busName = (id) => busLabel(buses.find((b) => b.id === id));
  const matchingTickets = tickets.filter((ticket) => `${busName(ticket.bus_id)} ${ticket.issue} ${ticket.location || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const exportTickets = (rows, title) => downloadReportPdf({ filename: `maintenance-${title}`, title, subtitle: search ? `Search: ${search}` : "All buses", sections: [
    { title: "Maintenance records", columns: ["Bus", "Issue", "Repair location", "Reported", "Resolved", "Status", "Total cost (BDT)", "Notes"], rows: rows.map((ticket) => [busName(ticket.bus_id), ticket.issue, ticket.location, ticket.reported_date, ticket.resolved_date, sections.find((s) => s.status === ticket.status)?.title, ticket.total_cost, ticket.notes]) },
    { title: "Repair details", columns: ["Bus", "Issue", "Part / repair", "Date", "Cost (BDT)"], rows: rows.flatMap((ticket) => ticket.parts.map((part) => [busName(ticket.bus_id), ticket.issue, part.part_name, part.changed_date, part.cost])) },
  ] });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("maintenance_title")}</h1>
          <p>{t("maintenance_subtitle")}</p>
        </div>
        <PdfExportButton onExport={() => exportTickets(matchingTickets, "Maintenance report")} />
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}

      {Maintenance3DPreview && <Suspense fallback={<div className="card">Loading maintenance preview…</div>}><Maintenance3DPreview tickets={tickets} buses={buses} canEdit={canWrite} /></Suspense>}

      {!Maintenance3DPreview && <section className="card" style={{ marginBottom: 20 }} aria-label="Bus anatomy reference">
        <div className="settings-card-heading"><div><span className="settings-eyebrow">INTERACTIVE REFERENCE</span><h3>Explore bus anatomy</h3><p>Open a bus model and inspect its systems and components in 3D. This reference does not change repair records or accounts.</p></div><button type="button" className="primary" aria-expanded={showAnatomy} aria-controls="shared-bus-anatomy" onClick={() => setShowAnatomy(value => !value)}>{showAnatomy ? "Close anatomy" : "Open bus anatomy"}</button></div>
        {showAnatomy && <div id="shared-bus-anatomy"><Suspense fallback={<p role="status">Loading bus anatomy…</p>}><SharedBusAnatomy buses={buses} /></Suspense></div>}
      </section>}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card"><div className="stat-label">{t("total_tickets")}</div><div className="stat-value">{summary.total}</div></div>
        <div className="card stat-card income"><div className="stat-label">{t("resolved")}</div><div className="stat-value">{summary.resolved}</div></div>
        <div className="card stat-card expense"><div className="stat-label">{t("open_in_progress")}</div><div className="stat-value">{summary.open + summary.inProgress}</div></div>
        <div className="card stat-card long-maintenance-stat"><div className="stat-label">⚠ {t("under_long_maintenance")}</div><div className="stat-value">{summary.longMaintenance}</div></div>
      </div>

      {canWrite && <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("log_bus_maintenance")}</h3>
        <form className="form-row" onSubmit={handleCreateTicket}>
          <select value={ticketForm.bus_id} onChange={(e) => setTicketForm({ ...ticketForm, bus_id: e.target.value })}>
            <option value="">{t("select_bus")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
          </select>
          <input placeholder="Issue / problem" value={ticketForm.issue}
            onChange={(e) => setTicketForm({ ...ticketForm, issue: e.target.value })} />
          <select value={ticketForm.location} onChange={(e) => setTicketForm({ ...ticketForm, location: e.target.value })}>
            <option value="">{t("location")}</option>
            {locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
          </select>
          <input type="date" value={ticketForm.reported_date}
            onChange={(e) => setTicketForm({ ...ticketForm, reported_date: e.target.value })} />
          <select value={ticketForm.status} onChange={(e) => setTicketForm({ ...ticketForm, status: e.target.value })}>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="long_maintenance">{t("under_long_maintenance")}</option>
          </select>
          <button className="primary" type="submit">{t("log_bus_maintenance")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}

        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: 0 }}>Manage repair locations from Settings → Places where repair happens.</p>
      </div>}

      <label className="maintenance-search">Find a maintenance record<input type="search" placeholder="Search bus, issue or repair location" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className="maintenance-sections">
      {sections.map((section) => <section key={section.status} className={`card maintenance-record-section status-${section.status}`}>
        <div className="settings-card-heading"><div><span className="settings-eyebrow">{section.status === "resolved" ? "REPAIR HISTORY" : "MAINTENANCE"}</span><h3>{section.status === "long_maintenance" ? "⚠ " : ""}{section.title}</h3><p>{section.description}</p></div><span className="settings-count-pill">{matchingTickets.filter((ticket) => ticket.status === section.status).length}</span><PdfExportButton onExport={() => exportTickets(matchingTickets.filter((ticket) => ticket.status === section.status), section.title)} /></div>
        {!matchingTickets.some((ticket) => ticket.status === section.status) && <p className="empty">No {section.title.toLowerCase()} {search ? "match your search" : "yet"}.</p>}
        {matchingTickets.filter((ticket) => ticket.status === section.status).map((ticket) => (
          <div key={ticket.id} id={`maintenance-record-${ticket.id}`} className={ticket.status === "long_maintenance" ? "maintenance-ticket long-maintenance-warning" : "maintenance-ticket"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{busName(ticket.bus_id)}</strong> — {ticket.issue}
                {ticket.status === "long_maintenance" && <div className="long-maintenance-label">⚠ {t("long_maintenance_warning")}</div>}
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  {ticket.location || "No location set"} · {t("reported")} {ticket.reported_date}{ticket.resolved_date ? ` · Resolved ${ticket.resolved_date}` : ""} · {t("total_cost_so_far")}: ৳{ticket.total_cost.toLocaleString()}
                </div>
              </div>
              <div className="maintenance-ticket-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {canWrite && <select aria-label={`Status for ${busName(ticket.bus_id)}`} disabled={busy} value={ticket.status} onChange={(e) => handleUpdateStatus(ticket, e.target.value)}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="long_maintenance">{t("under_long_maintenance")}</option>
                  <option value="resolved">Resolved</option>
                </select>}
                {canWrite && <button className="settings-edit-button" disabled={busy} onClick={() => setEditingTicket({ ...ticket, location: ticket.location || "", notes: ticket.notes || "" })}>Edit record</button>}
                <button className="primary" onClick={() => toggleTicket(ticket.id)}>
                  {openTicketId === ticket.id ? t("hide_parts") : `${t("parts")} (${ticket.parts.length})`}
                </button>
                {canWrite && <button className="link-danger" disabled={busy} onClick={() => handleDeleteTicket(ticket.id)}>{t("delete")}</button>}
              </div>
            </div>
            {editingTicket?.id === ticket.id && <form className="maintenance-ticket-editor" onSubmit={(e) => { e.preventDefault(); change(async () => { await api.put(`/maintenance/${ticket.id}`, { issue: editingTicket.issue, location: editingTicket.location || null, reported_date: editingTicket.reported_date, resolved_date: ticket.status === "resolved" ? editingTicket.resolved_date || null : null, notes: editingTicket.notes }); setEditingTicket(null); }); }}>
              <label className="live-field"><span>Issue / problem</span><input required value={editingTicket.issue} onChange={(e) => setEditingTicket({ ...editingTicket, issue: e.target.value })} /></label>
              <label className="live-field"><span>Repair location</span><SearchableSelect id={`maintenance-location-${ticket.id}`} value={editingTicket.location} onChange={(location) => setEditingTicket({ ...editingTicket, location })} options={[...new Set([...locations.map((loc) => loc.name), ...(editingTicket.location ? [editingTicket.location] : [])])].map((name) => ({ value: name, label: name }))} /></label>
              <label className="live-field"><span>Reported date</span><input required type="date" value={editingTicket.reported_date} onChange={(e) => setEditingTicket({ ...editingTicket, reported_date: e.target.value })} /></label>
              {ticket.status === "resolved" && <label className="live-field"><span>Resolved date</span><input required type="date" value={editingTicket.resolved_date || ""} onChange={(e) => setEditingTicket({ ...editingTicket, resolved_date: e.target.value })} /></label>}
              <label className="live-field"><span>Notes</span><input value={editingTicket.notes} onChange={(e) => setEditingTicket({ ...editingTicket, notes: e.target.value })} /></label>
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>{busy ? "Saving…" : "Save changes"}</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditingTicket(null)}>Cancel</button>
            </form>}

            {openTicketId === ticket.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {canWrite && <><form className="form-row" onSubmit={(e) => handleAddPart(e, ticket)}>
                  <select value={partForm.part_name} onChange={(e) => setPartForm({ ...partForm, part_name: e.target.value })}>
                    <option value="">{t("select_part")}</option>
                    {partsCatalog.map((p) => <option key={p.id} value={p.part_name}>{p.part_name}</option>)}
                  </select>
                  <input placeholder={t("cost")} type="number" value={partForm.cost}
                    onChange={(e) => setPartForm({ ...partForm, cost: e.target.value })} />
                  <input type="date" value={partForm.changed_date} title="Date changed"
                    onChange={(e) => setPartForm({ ...partForm, changed_date: e.target.value })} />
                  <button className="primary" type="submit">{t("add_part")}</button>
                </form>
                <form className="form-row" onSubmit={(e) => handleAddRepair(e, ticket)}>
                  <input placeholder="Additional repair (e.g. Engine repair)" value={repairForm.part_name} onChange={(e) => setRepairForm({ ...repairForm, part_name: e.target.value })} />
                  <input placeholder={t("cost")} type="number" value={repairForm.cost} onChange={(e) => setRepairForm({ ...repairForm, cost: e.target.value })} />
                  <input type="date" value={repairForm.changed_date} onChange={(e) => setRepairForm({ ...repairForm, changed_date: e.target.value })} />
                  <button className="primary" type="submit">Add repair</button>
                </form>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{t("found_another_problem")}</p>
                </>}
                <table>
                  <thead><tr><th>{t("part")}</th><th>{t("cost")}</th><th>{t("changed_on")}</th><th></th></tr></thead>
                  <tbody>
                    {ticket.parts.map((p) => editingPart?.id === p.id ? <tr key={p.id}><td><input value={editingPart.part_name} onChange={(e) => setEditingPart({ ...editingPart, part_name: e.target.value })} /></td><td><input type="number" value={editingPart.cost} onChange={(e) => setEditingPart({ ...editingPart, cost: e.target.value })} /></td><td><input type="date" value={editingPart.changed_date} onChange={(e) => setEditingPart({ ...editingPart, changed_date: e.target.value })} /></td><td><button className="primary" onClick={() => savePartEdit(ticket)}>Save</button> <button className="link-danger" onClick={() => setEditingPart(null)}>Cancel</button></td></tr> : <tr key={p.id}><td>{p.part_name}</td><td>৳{p.cost.toLocaleString()}</td><td>{p.changed_date}</td><td>{canWrite && <><button className="settings-edit-button" disabled={busy} onClick={() => setEditingPart(p)}>Edit</button> <button className="link-danger" disabled={busy} onClick={() => handleRemovePart(ticket, p.id)}>{t("remove")}</button></>}</td></tr>)}
                    {ticket.parts.length === 0 && <tr><td colSpan={4}>{t("no_parts_logged")}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>)}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t("parts_service_history")}</h3>
          <PdfExportButton onExport={() => downloadReportPdf({ filename: "parts-service-history", title: "Parts service history", subtitle: reportBus ? busName(Number(reportBus)) : "All buses", sections: [{ title: "Service history", columns: ["Bus", "Part", "Last changed", "Total spent (BDT)"], rows: partsReport.map((r) => [busLabel(r), r.part_name, r.last_changed, r.total_spent]) }] })} />
          <select value={reportBus} onChange={(e) => setReportBus(e.target.value)}>
            <option value="">{t("all_buses")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
          </select>
        </div>
        <table>
          <thead><tr><th>{t("bus")}</th><th>{t("part")}</th><th>{t("last_changed")}</th><th>{t("total_spent")}</th></tr></thead>
          <tbody>
            {partsReport.map((r, i) => (
              <tr key={i}>
                <td>{busLabel(r)}</td>
                <td>{r.part_name}</td>
                <td>{r.last_changed}</td>
                <td>৳{r.total_spent.toLocaleString()}</td>
              </tr>
            ))}
            {partsReport.length === 0 && <tr><td colSpan={4}>{t("no_parts_logged")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
