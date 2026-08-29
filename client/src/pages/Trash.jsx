import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Trash() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [reportTx, setReportTx] = useState({});

  function load() {
    api.get("/trips/trash").then(setItems).catch(() => {});
  }
  useEffect(load, []);

  async function handleRestore(groupId) {
    setError("");
    try {
      await api.post(`/trips/${groupId}/restore`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleOpen(item) {
    if (openId === item.group_id) { setOpenId(null); return; }
    setOpenId(item.group_id);
    if (!reportTx[item.group_id]) {
      const legIds = item.legs.map((l) => l.id);
      const rows = await Promise.all(legIds.map((id) => api.get(`/accounts?trip_id=${id}`).catch(() => [])));
      setReportTx((prev) => ({ ...prev, [item.group_id]: rows.flat() }));
    }
  }
  async function handlePermanentDelete(item) {
    if (!confirm(`Permanently delete Rotation #${item.rotation_no}? This cannot be undone.`)) return;
    try { await api.del(`/trips/${item.group_id}/permanent`); load(); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Trash</h1>
          <p>Rotations removed from Rotation, Accounts and Reports. Restore one to bring it back everywhere, or expand it to pull its report without restoring it. Admin/Super Admin only.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {items.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing in the trash.</p>}
        {items.map((item) => (
          <div key={item.group_id} style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{item.reg_number}</strong> — Rotation #{item.rotation_no} ({item.trip_date})
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Removed {new Date(item.deleted_at).toLocaleString()}{item.deleted_by_name ? ` by ${item.deleted_by_name}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" onClick={() => toggleOpen(item)}>{openId === item.group_id ? "Hide report" : "View report"}</button>
                <button className="link-danger" onClick={() => handleRestore(item.group_id)}>Restore</button>
                <button className="link-danger" onClick={() => handlePermanentDelete(item)}>Permanently delete</button>
              </div>
            </div>
            {openId === item.group_id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Description</th></tr></thead>
                  <tbody>
                    {(reportTx[item.group_id] || []).map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.txn_date}</td>
                        <td><span className={`badge ${tx.type === "income" ? "active" : "maintenance"}`}>{tx.type}</span></td>
                        <td>{tx.category}</td>
                        <td>৳{tx.amount.toLocaleString()}</td>
                        <td>{tx.description}</td>
                      </tr>
                    ))}
                    {(reportTx[item.group_id] || []).length === 0 && <tr><td colSpan={5}>No transactions were recorded for this rotation.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
