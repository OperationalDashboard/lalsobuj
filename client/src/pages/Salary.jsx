import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { isFullAccess } from "../roles.js";
import { canUseFeature } from "../permissions.js";
import PdfExportButton from "../components/PdfExportButton.jsx";
import { downloadReportPdf } from "../utils/reportPdf.js";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const designationLabel = (d) => (d || "").split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

export default function Salary() {
  const canWrite = canUseFeature(getUser(), "salary", "write");
  const canRemove = isFullAccess(getUser()?.role);
  const [assignments, setAssignments] = useState([]);
  const [month, setMonth] = useState(thisMonth());
  const [payroll, setPayroll] = useState({ month: thisMonth(), staff: [] });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editType, setEditType] = useState("none");
  const [editAmount, setEditAmount] = useState("");

  function load() {
    api.get("/salary/assignments").then(setAssignments).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    api.get(`/salary/payroll?month=${month}`).then(setPayroll).catch(() => {});
  }, [month, assignments]);

  function startEdit(row) {
    setEditingId(row.staff_id);
    setEditType(row.salary_type || "none");
    setEditAmount(row.amount || "");
  }

  async function saveEdit(staffId) {
    setError("");
    try {
      await api.put(`/salary/assignments/${staffId}`, {
        salary_type: editType,
        amount: editType === "none" ? null : Number(editAmount),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  async function postPlacePayroll() {
    setError("");
    try { const result = await api.post("/salary/post-place-expenses", { month }); alert(`${result.posted} counter-staff salary expense(s) posted to Place-wise Accounts.`); } catch (err) { setError(err.message); }
  }

  const totalPayroll = payroll.staff.reduce((s, r) => s + r.total_pay, 0);

  async function removePlan(row) {
    if (!confirm(`Remove ${row.name}'s salary plan? Posted account expenses will be kept. Future computed payroll will no longer include this plan.`)) return;
    try { await api.del(`/salary/assignments/${row.staff_id}`); setEditingId(null); load(); }
    catch (err) { setError(err.message); }
  }
  async function exportPayroll() {
    const data = await api.get(`/salary/payroll?month=${month}`);
    await downloadReportPdf({ filename: `payroll-${data.month}`, title: "Staff payroll", subtitle: `Month: ${data.month} | All amounts in BDT`, summary: [{ label: "Total payroll", value: data.staff.reduce((sum, r) => sum + r.total_pay, 0) }], sections: [{ title: "Salary and covering duty", columns: ["Staff", "Plan", "Days", "Base pay", "Overtime", "Covering for", "Total"], rows: data.staff.map((r) => [r.name, r.salary_type, r.days_worked, r.base_pay, r.overtime_pay, r.covering_names?.join(", "), r.total_pay]) }] });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Salary</h1>
          <p>Direct salary plans are for counter-assigned staff and are included in their Place-wise Accounts. Bus staff are paid as a rotation expense by Accounts, not through this page. Monthly staff get their fixed amount; daily staff are paid per day actually worked.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Salary plans</h3>
        {error && <p className="error-text">{error}</p>}
        <table>
          <thead><tr><th>Staff</th><th>Designation</th><th>Plan</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.staff_id}>
                <td>{a.name}</td>
                <td>{designationLabel(a.designation)}</td>
                {editingId === a.staff_id ? (
                  <>
                    <td>
                      <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                        <option value="none">No salary</option>
                        <option value="monthly">Monthly (fixed)</option>
                        <option value="daily">Daily (per day worked)</option>
                      </select>
                    </td>
                    <td>
                      {editType !== "none" && (
                        <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ width: 100 }} placeholder="৳" />
                      )}
                    </td>
                    <td>
                      <button className="primary" style={{ marginRight: 8 }} onClick={() => saveEdit(a.staff_id)}>Save</button>
                      <button className="link-danger" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span className={`badge ${a.salary_type === "none" ? "on_leave" : "active"}`}>
                        {a.salary_type === "monthly" ? "Monthly" : a.salary_type === "daily" ? "Daily" : "No salary"}
                      </span>
                    </td>
                    <td>{a.salary_type !== "none" ? `৳${a.amount?.toLocaleString()}` : "—"}</td>
                    <td>{canWrite && <button className="settings-edit-button" onClick={() => startEdit(a)}>Edit</button>} {canRemove && a.salary_type !== "none" && <button className="link-danger" onClick={() => removePlan(a)}>Remove plan</button>}</td>
                  </>
                )}
              </tr>
            ))}
            {assignments.length === 0 && <tr><td colSpan={5}>No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Payroll</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />{canWrite && <button className="primary" onClick={postPlacePayroll}>Post counter salaries to Place Accounts</button>}<PdfExportButton onExport={exportPayroll} /></div>
        </div>
        <table>
          <thead>
            <tr><th>Staff</th><th>Plan</th><th>Days worked</th><th>Base pay</th><th>Overtime (covering others)</th><th>Total</th></tr>
          </thead>
          <tbody>
            {payroll.staff.map((r) => (
              <tr key={r.staff_id}>
                <td>{r.name}</td>
                <td>{r.salary_type === "monthly" ? "Monthly" : r.salary_type === "daily" ? "Daily" : "—"}</td>
                <td>{r.days_worked ?? "—"}</td>
                <td>৳{r.base_pay.toLocaleString()}</td>
                <td>{r.overtime_pay > 0 ? <>৳{r.overtime_pay.toLocaleString()} ({r.overtime_days} day{r.overtime_days === 1 ? "" : "s"})<div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Covering: {r.covering_names?.join(", ")}</div></> : "—"}</td>
                <td><strong>৳{r.total_pay.toLocaleString()}</strong></td>
              </tr>
            ))}
            {payroll.staff.length === 0 && <tr><td colSpan={6}>Nobody is on a salary plan yet.</td></tr>}
          </tbody>
          {payroll.staff.length > 0 && (
            <tfoot>
              <tr><td colSpan={5} style={{ textAlign: "right" }}><strong>Total payroll</strong></td><td><strong>৳{totalPayroll.toLocaleString()}</strong></td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
