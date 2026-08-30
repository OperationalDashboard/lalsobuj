import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

const destinationLabels = {
  digital: "Digital Sales",
  cash: "Cash Sales",
  expense: "Daily Cash Costs",
};

const channelLabels = {
  website: "Website",
  android: "Android App",
  ios: "iOS App",
  website_android: "Website / Android App (legacy)",
  cash: "Cash",
};

const money = (value) => `BDT ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function readableTime(value) {
  if (!value) return "Unknown time";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function dateRange(batch) {
  if (!batch.first_date) return "No records remain";
  return batch.first_date === batch.last_date ? batch.first_date : `${batch.first_date} to ${batch.last_date}`;
}

function ImportRows({ detail, canWrite, onChangeRow, onDeleteRow, busy }) {
  const { batch, rows } = detail;
  const expense = batch.destination === "expense";
  const digital = batch.destination === "digital";

  return <div className="online-import-history-detail">
    <div className="online-table-scroll">
      <table className="online-import-history-table">
        <thead><tr>
          <th>Date</th>
          {digital && <th>Platform</th>}
          {!expense && <><th>Coach</th><th>Bus</th><th>Passengers</th></>}
          {expense && <><th>Category</th><th>Note</th></>}
          <th>Amount</th>
          {canWrite && <th>Actions</th>}
        </tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.id}>
            <td><strong>{expense ? row.expense_date : row.entry_date}</strong></td>
            {digital && <td><span className={`online-channel-badge ${row.channel}`}>{channelLabels[row.channel] || row.channel}</span></td>}
            {!expense && <><td>{row.coach_number}</td><td>{row.bus_number || "—"}</td><td>{digital ? <span>{row.passenger_count} <small>({row.normal_passengers} normal · {row.long_passengers} long)</small></span> : row.passenger_count}</td></>}
            {expense && <><td>{row.category_name}</td><td>{row.description || "—"}</td></>}
            <td><strong>{money(row.amount)}</strong></td>
            {canWrite && <td><div className="online-row-actions"><button type="button" className="settings-edit-button" onClick={() => onChangeRow(batch, row)}>Change</button><button type="button" className="link-danger" disabled={busy === `row:${row.id}`} onClick={() => onDeleteRow(batch, row)}>{busy === `row:${row.id}` ? "Deleting…" : "Delete"}</button></div></td>}
          </tr>)}
          {rows.length === 0 && <tr><td colSpan={expense ? (canWrite ? 4 : 3) : digital ? (canWrite ? 7 : 6) : (canWrite ? 6 : 5)}>All records from this import have already been deleted.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}

export default function OnlineAccountsImportHistory({ canWrite, onChangeRow, onChanged }) {
  const [batches, setBatches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBatches(await api.get("/online-accounts/imports"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  async function toggleBatch(batch) {
    if (expandedId === batch.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setBusy(`open:${batch.id}`);
    setError("");
    try {
      setDetail(await api.get(`/online-accounts/imports/${batch.id}`));
      setExpandedId(batch.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function deleteRow(batch, row) {
    if (!window.confirm("Delete this imported entry? The import history will remain.")) return;
    setBusy(`row:${row.id}`);
    setError("");
    try {
      await api.del(batch.destination === "expense" ? `/online-accounts/expenses/${row.id}` : `/online-accounts/entries/${row.id}`);
      const [nextDetail] = await Promise.all([
        api.get(`/online-accounts/imports/${batch.id}`),
        loadBatches(),
        onChanged?.(),
      ]);
      setDetail(nextDetail);
      setNotice("Imported entry deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function deleteBatch(batch) {
    const remaining = Number(batch.current_count || 0);
    if (!window.confirm(`Delete this import history and its ${remaining} remaining ${remaining === 1 ? "record" : "records"}?`)) return;
    setBusy(`batch:${batch.id}`);
    setError("");
    try {
      await api.del(`/online-accounts/imports/${batch.id}`);
      if (expandedId === batch.id) {
        setExpandedId(null);
        setDetail(null);
      }
      await Promise.all([loadBatches(), onChanged?.()]);
      setNotice("Import and its remaining records deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return <section className="online-import-history">
    <div className="card online-import-history-heading">
      <div><span className="settings-eyebrow">IMPORT AUDIT</span><h3>Document import history</h3><p>The 50 most recent uploads are kept here. Open one to review, change, or delete its saved records.</p></div>
      <button type="button" className="settings-edit-button" onClick={loadBatches} disabled={loading}>{loading ? "Refreshing…" : "Refresh history"}</button>
    </div>

    {error && <p className="error-text online-notice" role="alert">{error}</p>}
    {notice && <p className="success-text online-notice" aria-live="polite">{notice}</p>}
    {loading && batches.length === 0 && <p className="online-loading">Loading import history…</p>}

    <div className="online-import-history-list">
      {batches.map((batch) => {
        const removed = Math.max(0, Number(batch.imported_count) - Number(batch.current_count));
        return <article className={`card online-import-history-card ${expandedId === batch.id ? "expanded" : ""}`} key={batch.id}>
          <div className="online-import-history-summary">
            <div className="online-import-history-file"><span className="online-import-history-icon" aria-hidden="true">↥</span><div><strong>{batch.file_name}</strong><small>{batch.source_name || "Detected table"} · {destinationLabels[batch.destination]}</small></div></div>
            <div className="online-import-history-meta"><span>Imported</span><strong>{batch.imported_count} records</strong><small>{batch.current_count} remaining{removed ? ` · ${removed} deleted` : ""}</small></div>
            <div className="online-import-history-meta"><span>Record dates</span><strong>{dateRange(batch)}</strong><small>By {batch.created_by_name || "Deleted user"}</small></div>
            <div className="online-import-history-meta"><span>Uploaded</span><strong>{readableTime(batch.created_at)}</strong><small>Batch #{batch.id}</small></div>
            <div className="online-import-history-actions">
              <button type="button" className="settings-edit-button" aria-expanded={expandedId === batch.id} onClick={() => toggleBatch(batch)} disabled={Boolean(busy)}>{busy === `open:${batch.id}` ? "Opening…" : expandedId === batch.id ? "Close details" : "View & change"}</button>
              {canWrite && <button type="button" className="link-danger" onClick={() => deleteBatch(batch)} disabled={Boolean(busy)}>{busy === `batch:${batch.id}` ? "Deleting import…" : "Delete import"}</button>}
            </div>
          </div>
          {expandedId === batch.id && detail?.batch?.id === batch.id && <ImportRows detail={detail} canWrite={canWrite} onChangeRow={onChangeRow} onDeleteRow={deleteRow} busy={busy} />}
        </article>;
      })}
      {!loading && batches.length === 0 && <div className="card online-import-history-empty"><strong>No import history yet</strong><p>Your next confirmed PDF, Excel, CSV, TSV, or text import will appear here.</p></div>}
    </div>
  </section>;
}
