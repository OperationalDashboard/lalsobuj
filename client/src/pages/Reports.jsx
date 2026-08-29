import { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

const today = () => new Date().toISOString().slice(0, 10);
const BUS_DESIGNATIONS = ["Driver", "Supervisor", "Bus Staff", "Helper", "Conductor", "Mechanic"];

export default function Reports() {
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());

  const [rotations, setRotations] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [attendance, setAttendance] = useState([]);
  const [staff, setStaff] = useState([]);
  const [maintenanceSummary, setMaintenanceSummary] = useState({ total: 0, resolved: 0, perBus: [] });
  const [openIssues, setOpenIssues] = useState([]);
  const [buses, setBuses] = useState([]);
  const [openGroupId, setOpenGroupId] = useState(null);
  const [openStatus, setOpenStatus] = useState(null);
  const [openExpenseGroupId, setOpenExpenseGroupId] = useState(null);
  const [placeFinance, setPlaceFinance] = useState([]);
  const [openPlaceFinance, setOpenPlaceFinance] = useState("");

  // Bus-wise report — toggle a bus to see its rotations across the date range.
  const [selectedBus, setSelectedBus] = useState("");
  const [busSummary, setBusSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [busTransactions, setBusTransactions] = useState([]);
  const [busRotations, setBusRotations] = useState([]);

  useEffect(() => {
    api.get(`/trips/rotations?from=${fromDate}&to=${toDate}`).then(setRotations).catch(() => {});
    api.get(`/accounts/summary?from=${fromDate}&to=${toDate}`).then(setSummary).catch(() => {});
    api.get("/attendance").then((rows) => setAttendance(rows.filter((r) => r.work_date >= fromDate && r.work_date <= toDate))).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/maintenance/summary").then(setMaintenanceSummary).catch(() => {});
    api.get("/maintenance").then((rows) => setOpenIssues(rows.filter((row) => row.status !== "resolved"))).catch(() => {});
    api.get("/buses").then(setBuses).catch(() => {});
    // Same selected date range as the main financial cards; automatic
    // counter salary rows use their actual posting date so they appear here.
    api.get(`/accounts/place-finance?from=${fromDate}&to=${toDate}`).then(setPlaceFinance).catch(() => {});
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!selectedBus) { setBusSummary({ income: 0, expense: 0, net: 0 }); setBusTransactions([]); setBusRotations([]); return; }
    api.get(`/accounts/summary?bus_id=${selectedBus}&from=${fromDate}&to=${toDate}`).then(setBusSummary).catch(() => {});
    api.get(`/accounts?bus_id=${selectedBus}&from=${fromDate}&to=${toDate}`).then(setBusTransactions).catch(() => {});
    api.get(`/trips/rotations?bus_id=${selectedBus}&from=${fromDate}&to=${toDate}`).then(setBusRotations).catch(() => {});
  }, [selectedBus, fromDate, toDate]);

  const busStaffIds = new Set(staff.filter((s) => BUS_DESIGNATIONS.includes(s.designation)).map((s) => s.id));
  const attendanceFor = (status, group) => attendance.filter((a) => a.status === status && (group === "bus" ? busStaffIds.has(a.staff_id) : group === "other" ? !busStaffIds.has(a.staff_id) : true));
  const presentToday = attendanceFor("present", "all").length + attendanceFor("late", "all").length;
  const totalRotations = rotations.length;
  const totalPassengers = rotations.reduce((s, g) => s + (g.passengers || 0), 0);
  const busName = (id) => buses.find((b) => b.id === id)?.reg_number || `Bus #${id}`;
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;
  const financialLabel = fromDate === toDate ? `Daily totals — ${fromDate}` : `Totals for ${rangeLabel}`;

  const staffByStatus = (status, group = "all") => {
    const staffIdsWithStatus = attendanceFor(status, group).map((a) => a.staff_id);
    return staff.filter((s) => staffIdsWithStatus.includes(s.id)).map((s) => s.name);
  };

  const staffName = (id) => staff.find((s) => s.id === id)?.name || "—";
  const maxMaintenanceCost = Math.max(1, ...maintenanceSummary.perBus.map((b) => b.total_cost));
  const busRotationPassengers = busRotations.reduce((s, g) => s + (g.passengers || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("reports_title")}</h1>
          <p>{t("reports_subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <span style={{ color: "var(--muted)" }}>{t("to_date")}</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="stat-label">{t("rotations_today")}</div>
          <div className="stat-value">{totalRotations}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{totalPassengers.toLocaleString()} passengers total</div>
        </div>
        <div className="card stat-card income">
          <div className="stat-label">Income — {financialLabel}</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>৳{summary.income.toLocaleString()}</div>
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">Expense — {financialLabel}</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>৳{summary.expense.toLocaleString()}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Net — {financialLabel}</div>
          <div className="stat-value" style={{ color: summary.net >= 0 ? "var(--green)" : "var(--red)" }}>৳{summary.net.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t("buses_ran_rotation")} — {rangeLabel}</h3>
          <table>
            <thead><tr><th>{t("bus")}</th><th>{t("rotation_details")}</th><th>Passengers</th><th>{t("income")}</th><th>{t("expense")}</th><th>{t("net")}</th><th>{t("running_now")}</th></tr></thead>
            <tbody>
              {rotations.map((g) => (
                <>
                  <tr key={g.group_id} style={{ cursor: "pointer" }} onClick={() => setOpenGroupId(openGroupId === g.group_id ? null : g.group_id)}>
                    <td><strong>{g.reg_number}</strong></td>
                    <td>Rotation #{g.rotation_no} — {g.legs.length === 2 ? "2 legs" : "1 leg"} {openGroupId === g.group_id ? "▲" : "▼"}</td>
                    <td>{g.passengers || 0}</td>
                    <td style={{ color: "var(--green)" }}>৳{g.income.toLocaleString()}</td>
                    <td style={{ color: "var(--red)" }}>৳{g.expense.toLocaleString()}</td>
                    <td style={{ color: g.net >= 0 ? "var(--green)" : "var(--red)" }}>৳{g.net.toLocaleString()}</td>
                    <td>{g.legs.some((l) => l.status === "running") ? <span className="badge maintenance">{t("on_the_road")}</span> : <span className="badge active">{t("idle")}</span>}</td>
                  </tr>
                  {openGroupId === g.group_id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--bg-soft, #f7f7f7)" }}>
                        <table>
                          <thead><tr><th>Leg</th><th>{t("route")}</th><th>{t("departure_time")}</th><th>Arrival</th><th>Passengers</th><th>{t("income")}</th></tr></thead>
                          <tbody>
                            {g.legs.map((leg) => (
                              <tr key={leg.id}>
                                <td>{leg.leg_no === 1 ? t("leg1") : t("leg2")}</td>
                                <td>{leg.route || "—"}</td>
                                <td>{leg.departure_time || "—"}</td>
                                <td>{leg.arrival_time || "—"}</td>
                                <td>{leg.passengers || 0}</td>
                                <td style={{ color: "var(--green)" }}>৳{(leg.income || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ fontSize: "0.85rem", marginTop: 6 }}>
                          <span style={{ color: "var(--green)" }}>{t("income")}: ৳{g.income.toLocaleString()}</span>
                          {" — "}
                          <span style={{ color: "var(--red)", cursor: "pointer" }} onClick={() => setOpenExpenseGroupId(openExpenseGroupId === g.group_id ? null : g.group_id)}>
                            {t("expense")} (shared): ৳{g.expense.toLocaleString()} {openExpenseGroupId === g.group_id ? "▲" : "▼"}
                          </span>
                        </div>
                        {openExpenseGroupId === g.group_id && (
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.82rem", color: "var(--muted)" }}>
                            {Object.entries(g.expenseBreakdown || {}).map(([cat, amt]) => (
                              <li key={cat}>{cat}: ৳{amt.toLocaleString()}</li>
                            ))}
                            {Object.keys(g.expenseBreakdown || {}).length === 0 && <li>No expenses recorded</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {rotations.length === 0 && <tr><td colSpan={7}>{t("no_rotation_today")}</td></tr>}
            </tbody>
            {rotations.length > 0 && (
              <tfoot>
                <tr><td colSpan={2} style={{ textAlign: "right" }}><strong>Total</strong></td><td><strong>{totalPassengers}</strong></td><td style={{ color: "var(--green)" }}><strong>৳{rotations.reduce((sum, row) => sum + row.income, 0).toLocaleString()}</strong></td><td style={{ color: "var(--red)" }}><strong>৳{rotations.reduce((sum, row) => sum + row.expense, 0).toLocaleString()}</strong></td><td colSpan={2}></td></tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t("attendance_today")} — {rangeLabel}</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{presentToday} attendance records in this period. Bus staff and counter/office staff are shown separately; click a status to see names.</p>
          <table>
            <thead><tr><th>{t("status")}</th><th>Bus staff</th><th>Counter / office staff</th><th>Total</th></tr></thead>
            <tbody>
              {["present", "late", "absent", "leave"].map((status) => (
                <tr key={status}>
                  <td>
                    <span className={`badge ${status}`} style={{ cursor: "pointer" }} onClick={() => setOpenStatus(openStatus === status ? null : status)}>
                      {t(status)} {openStatus === status ? "▲" : "▼"}
                    </span>
                  </td>
                  <td>{attendanceFor(status, "bus").length}</td>
                  <td>{attendanceFor(status, "other").length}</td>
                  <td>{attendanceFor(status, "all").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {openStatus && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: "0.85rem" }}>
              <strong>{t(openStatus)} — Bus staff:</strong> {staffByStatus(openStatus, "bus").join(", ") || "—"}<br />
              <strong>{t(openStatus)} — Counter / office:</strong> {staffByStatus(openStatus, "other").join(", ") || "—"}
            </div>
          )}
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>{t("date")}</th><th>Staff</th><th>{t("check_in")}</th><th>{t("check_out")}</th></tr></thead>
            <tbody>
              {attendance.filter((a) => a.check_in).map((a) => (
                <tr key={a.id}>
                  <td>{a.work_date}</td>
                  <td>{staffName(a.staff_id)}</td>
                  <td>{a.check_in || "—"}</td>
                  <td>{a.check_out || "—"}</td>
                </tr>
              ))}
              {attendance.filter((a) => a.check_in).length === 0 && <tr><td colSpan={4}>{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Place-wise Accounts — {rangeLabel}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Each parent place is summarized below. Open Details to see the separate counter-wise income, expenses, and posted staff salaries. These figures are included in the overall Report totals above.</p>
        <table><thead><tr><th>Place</th><th>Income</th><th>Expense</th><th>Net</th><th></th></tr></thead><tbody>
          {[...new Set(placeFinance.map((row) => row.place_name))].map((place) => { const rows = placeFinance.filter((row) => row.place_name === place); const income = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + row.amount, 0); const expense = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.amount, 0); return <><tr key={place}><td>{place}</td><td>৳{income.toLocaleString()}</td><td>৳{expense.toLocaleString()}</td><td>৳{(income - expense).toLocaleString()}</td><td><button className="link-danger" onClick={() => setOpenPlaceFinance(openPlaceFinance === place ? "" : place)}>Details</button></td></tr>{openPlaceFinance === place && <tr><td colSpan={5}><table><thead><tr><th>Date</th><th>Counter</th><th>Type</th><th>Amount</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.txn_date}</td><td>{row.counter_name || "Whole place"}</td><td>{row.type}</td><td>৳{row.amount.toLocaleString()}</td><td>{row.description}</td></tr>)}</tbody></table></td></tr>}</>; })}
          {placeFinance.length === 0 && <tr><td colSpan={5}>No place-wise income or expense for this date range.</td></tr>}
        </tbody></table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0 }}>{t("maintenance")} — {maintenanceSummary.resolved} {t("maintenance_resolved_of")} {maintenanceSummary.total}</h3>
        </div>
        <table>
          <thead><tr><th>{t("bus")}</th><th>{t("issue")}</th><th>{t("location")}</th><th>{t("reported")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {openIssues.map((m) => (
              <tr key={m.id}>
                <td>{busName(m.bus_id)}</td>
                <td><strong>{m.issue}</strong>{m.parts?.length > 0 && <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 3 }}>{m.parts.map((part) => `${part.part_name} (৳${part.cost.toLocaleString()})`).join(" · ")}</div>}</td>
                <td>{m.location || "—"}</td>
                <td>{m.reported_date}</td>
                <td><span className={`badge ${m.status}`}>{m.status}</span></td>
              </tr>
            ))}
            {openIssues.length === 0 && <tr><td colSpan={5}>{t("no_open_issues")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t("bus_wise_solo_report")} — {rangeLabel}</h3>
          <select value={selectedBus} onChange={(e) => setSelectedBus(e.target.value)}>
            <option value="">{t("select_bus")}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_number}</option>)}
          </select>
        </div>

        {selectedBus ? (
          <>
            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              <div className="card stat-card income">
                <div className="stat-label">{t("income")}</div>
                <div className="stat-value" style={{ color: "var(--green)" }}>৳{busSummary.income.toLocaleString()}</div>
              </div>
              <div className="card stat-card expense">
                <div className="stat-label">{t("expense")}</div>
                <div className="stat-value" style={{ color: "var(--red)" }}>৳{busSummary.expense.toLocaleString()}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-label">{busSummary.net >= 0 ? t("net_profit") : t("net_loss")}</div>
                <div className="stat-value" style={{ color: busSummary.net >= 0 ? "var(--green)" : "var(--red)" }}>৳{Math.abs(busSummary.net).toLocaleString()}</div>
              </div>
            </div>

            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              {busRotations.length} rotation{busRotations.length === 1 ? "" : "s"} in this period — {busRotationPassengers.toLocaleString()} passengers total.
            </p>

            <table>
              <thead><tr><th>{t("date")}</th><th>Type</th><th>{t("category")}</th><th>{t("amount")}</th><th>{t("description")}</th></tr></thead>
              <tbody>
                {busTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.txn_date}</td>
                    <td><span className={`badge ${tx.type === "income" ? "active" : "maintenance"}`}>{tx.type}</span></td>
                    <td>{tx.category}</td>
                    <td style={{ color: tx.type === "income" ? "var(--green)" : "var(--red)" }}>৳{tx.amount.toLocaleString()}</td>
                    <td>{tx.description}</td>
                  </tr>
                ))}
                {busTransactions.length === 0 && <tr><td colSpan={5}>{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </>
        ) : (
          <p style={{ color: "var(--muted)" }}>{t("pick_bus_breakdown")}</p>
        )}

        {maintenanceSummary.perBus.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4>{t("maintenance_cost_by_bus")}</h4>
            <svg viewBox={`0 0 500 ${maintenanceSummary.perBus.length * 34 + 10}`} width="100%" style={{ maxWidth: 600 }}>
              {maintenanceSummary.perBus.map((b, i) => {
                const barWidth = (b.total_cost / maxMaintenanceCost) * 360;
                const y = i * 34 + 6;
                return (
                  <g key={b.bus_id}>
                    <text x="0" y={y + 14} fontSize="12" fill="var(--ink)">{b.reg_number}</text>
                    <rect x="90" y={y} width={barWidth} height="20" rx="4" fill="var(--red)" />
                    <text x={90 + barWidth + 8} y={y + 14} fontSize="12" fill="var(--muted)">৳{b.total_cost.toLocaleString()}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
