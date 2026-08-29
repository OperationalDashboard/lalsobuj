import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

const ticketEmpty = { bus_id: "", issue: "", location: "", reported_date: "", status: "open" };
const partEmpty = { part_name: "", cost: "", changed_date: "" };

export default function Maintenance() {
  const [tickets, setTickets] = useState([]);
  const [buses, setBuses] = useState([]);
  const [partsCatalog, setPartsCatalog] = useState([]);
  const [locations, setLocations] = useState([]);
  const [ticketForm, setTicketForm] = useState(ticketEmpty);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({ total: 0, resolved: 0, perBus: [] });

  const [openTicketId, setOpenTicketId] = useState(null);
  const [partForm, setPartForm] = useState(partEmpty);
  const [repairForm, setRepairForm] = useState(partEmpty);
  const [editingPart, setEditingPart] = useState(null);

  const [reportBus, setReportBus] = useState("");
  const [partsReport, setPartsReport] = useState([]);

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
    await api.put(`/maintenance/${ticket.id}`, { status, resolved_date });
    load();
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
    await api.del(`/maintenance/${ticket.id}/parts/${partId}`);
    load();
  }
  async function handleAddRepair(e, ticket) {
    e.preventDefault();
    if (!repairForm.part_name || !repairForm.cost || !repairForm.changed_date) { setError("Repair name, cost and date are required"); return; }
    await api.post(`/maintenance/${ticket.id}/parts`, { ...repairForm, cost: Number(repairForm.cost) });
    setRepairForm(partEmpty); load();
  }
  async function savePartEdit(ticket) {
    await api.put(`/maintenance/${ticket.id}/parts/${editingPart.id}`, { part_name: editingPart.part_name, cost: Number(editingPart.cost), changed_date: editingPart.changed_date });
    setEditingPart(null); load();
  }

  const busName = (id) => buses.find((b) => b.id === id)?.reg_number || "—";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("maintenance_title")}</h1>
          <p>{t("maintenance_subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card"><div className="stat-label">{t("total_tickets")}</div><div className="stat-value">{summary.total}</div></div>
        <div className="card stat-card income"><div className="stat-label">{t("resolved")}</div><div className="stat-value">{summary.resolved}</div></div>
        <div className="card stat-card expense"><div className="stat-label">{t("open_in_progress")}</div><div className="stat-value">{summary.total - summary.resolved}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("log_bus_maintenance")}</h3>
        <form className="form-row" onSubmit={handleCreateTicket}>
          <select value={ticketForm.bus_id} onChange={(e) => setTicketForm({ ...ticketForm, bus_id: e.target.value })}>
            <option value="">{t("select_bus")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
          </select>
          <input placeholder="Issue / problem" value={ticketForm.issue}
            onChange={(e) => setTicketForm({ ...ticketForm, issue: e.target.value })} />
          <select value={ticketForm.location} onChange={(e) => setTicketForm({ ...ticketForm, location: e.target.value })}>
            <option value="">{t("location")}</option>
            {locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
          </select>
          <input type="date" value={ticketForm.reported_date}
            onChange={(e) => setTicketForm({ ...ticketForm, reported_date: e.target.value })} />
          <button className="primary" type="submit">{t("log_bus_maintenance")}</button>
        </form>
        {error && <p className="error-text">{error}</p>}

        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: 0 }}>Manage repair locations from Settings → Places where repair happens.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("bus_maintenance_records")}</h3>
        {tickets.length === 0 && <p style={{ color: "var(--muted)" }}>{t("no_maintenance_tickets")}</p>}
        {tickets.map((ticket) => (
          <div key={ticket.id} style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{busName(ticket.bus_id)}</strong> — {ticket.issue}
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  {ticket.location || "No location set"} · {t("reported")} {ticket.reported_date}{ticket.resolved_date ? ` · Resolved ${ticket.resolved_date}` : ""} · {t("total_cost_so_far")}: ৳{ticket.total_cost.toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={ticket.status} onChange={(e) => handleUpdateStatus(ticket, e.target.value)}>
                  <option value="open">{t("open")}</option>
                  <option value="in_progress">{t("in_progress")}</option>
                  <option value="resolved">{t("resolved")}</option>
                </select>
                <button className="primary" onClick={() => toggleTicket(ticket.id)}>
                  {openTicketId === ticket.id ? t("hide_parts") : `${t("parts")} (${ticket.parts.length})`}
                </button>
                <button className="link-danger" onClick={() => handleDeleteTicket(ticket.id)}>{t("delete")}</button>
              </div>
            </div>

            {openTicketId === ticket.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <form className="form-row" onSubmit={(e) => handleAddPart(e, ticket)}>
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
                <table>
                  <thead><tr><th>{t("part")}</th><th>{t("cost")}</th><th>{t("changed_on")}</th><th></th></tr></thead>
                  <tbody>
                    {ticket.parts.map((p) => editingPart?.id === p.id ? <tr key={p.id}><td><input value={editingPart.part_name} onChange={(e) => setEditingPart({ ...editingPart, part_name: e.target.value })} /></td><td><input type="number" value={editingPart.cost} onChange={(e) => setEditingPart({ ...editingPart, cost: e.target.value })} /></td><td><input type="date" value={editingPart.changed_date} onChange={(e) => setEditingPart({ ...editingPart, changed_date: e.target.value })} /></td><td><button className="primary" onClick={() => savePartEdit(ticket)}>Save</button> <button className="link-danger" onClick={() => setEditingPart(null)}>Cancel</button></td></tr> : <tr key={p.id}><td>{p.part_name}</td><td>৳{p.cost.toLocaleString()}</td><td>{p.changed_date}</td><td><button className="link-danger" onClick={() => setEditingPart(p)}>Edit</button> <button className="link-danger" onClick={() => handleRemovePart(ticket, p.id)}>{t("remove")}</button></td></tr>)}
                    {ticket.parts.length === 0 && <tr><td colSpan={4}>{t("no_parts_logged")}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t("parts_service_history")}</h3>
          <select value={reportBus} onChange={(e) => setReportBus(e.target.value)}>
            <option value="">{t("all_buses")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
          </select>
        </div>
        <table>
          <thead><tr><th>{t("bus")}</th><th>{t("part")}</th><th>{t("last_changed")}</th><th>{t("total_spent")}</th></tr></thead>
          <tbody>
            {partsReport.map((r, i) => (
              <tr key={i}>
                <td>{r.reg_number}</td>
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
