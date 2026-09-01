import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";
import { busLabel } from "../busLabel.js";
import BusIcon from "../components/BusIcon.jsx";

export default function Dashboard() {
  const [buses, setBuses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [openIssues, setOpenIssues] = useState(0);

  useEffect(() => {
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/accounts/summary").then(setSummary).catch(() => {});
    api.get("/maintenance").then((rows) => setOpenIssues(rows.filter((r) => r.status !== "resolved").length)).catch(() => {});
  }, []);

  const activeBuses = buses.filter((b) => b.status === "active").length;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <BusIcon size={40} />
          <div>
            <h1>{t("dashboard")}</h1>
            <p>{t("dashboard_subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="stat-label">{t("buses_active")}</div>
          <div className="stat-value">{activeBuses} / {buses.length}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">{t("staff_on_record")}</div>
          <div className="stat-value">{staff.length}</div>
        </div>
        <div className="card stat-card income">
          <div className="stat-label">{t("total_income")}</div>
          <div className="stat-value">৳{summary.income.toLocaleString()}</div>
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">{t("open_maintenance_issues")}</div>
          <div className="stat-value">{openIssues}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("fleet")}</h3>
        <table>
          <thead>
            <tr><th>{t("reg_number")}</th><th>{t("model")}</th><th>{t("route")}</th><th>{t("status")}</th></tr>
          </thead>
          <tbody>
            {buses.map((b) => (
              <tr key={b.id}>
                <td>{busLabel(b)}</td>
                <td>{b.model}</td>
                <td>{b.route}</td>
                <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              </tr>
            ))}
            {buses.length === 0 && <tr><td colSpan={4}>{t("no_buses_add_one")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
