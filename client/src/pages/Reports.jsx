import { Fragment, useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { busLabel } from "../busLabel.js";
import { isFullAccess } from "../roles.js";

const today = () => new Date().toISOString().slice(0, 10);
const ROTATIONS_PER_PAGE = 25;
const ROTATION_STAFF_FIELDS = [
  ["Driver", "driver_name", "D"],
  ["Helper", "helper_name", "H"],
  ["Supervisor", "supervisor_name", "S"],
  ["Coach", "coach_name", "C"],
];

function RotationStaffDetails({ legs, compact = false }) {
  const crew = ROTATION_STAFF_FIELDS.map(([label, field, shortLabel]) => {
    const names = [...new Set(legs.map((leg) => leg[field]).filter(Boolean))];
    return names.length ? { label, shortLabel, names: names.join(", ") } : null;
  }).filter(Boolean);

  if (!crew.length) return <span className="rotation-staff-empty">No bus staff recorded</span>;
  if (compact) return (
    <span className="rotation-crew-summary" title={crew.map((member) => `${member.label}: ${member.names}`).join(" | ")}>
      {crew.map((member, index) => <Fragment key={member.label}>{index > 0 && <span className="rotation-crew-divider">·</span>}<b>{member.shortLabel}:</b> {member.names}</Fragment>)}
    </span>
  );
  return <div className="rotation-staff-list">
    {crew.map((member) => <span key={member.label}><small>{member.label}</small><strong>{member.names}</strong></span>)}
  </div>;
}

function WorkplaceGroups({ groups, type }) {
  if (!groups.length) return <span className="rotation-staff-empty">No staff recorded</span>;
  return <div className="report-workplace-list">
    {groups.map((group) => (
      <span className={`report-workplace-group ${type}`} key={group.workplace}>
        <span className="report-workplace-icon" aria-hidden="true">{type === "bus" ? "BUS" : "CTR"}</span>
        <span>
          <strong>{group.workplace}</strong>
          <small>({group.names.join(", ")})</small>
        </span>
      </span>
    ))}
  </div>;
}

export default function Reports() {
  const canRemoveRotations = isFullAccess(getUser()?.role);
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());

  const [rotations, setRotations] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [attendance, setAttendance] = useState([]);
  const [staff, setStaff] = useState([]);
  const [maintenanceSummary, setMaintenanceSummary] = useState({ total: 0, resolved: 0, open: 0, inProgress: 0, longMaintenance: 0, perBus: [] });
  const [openIssues, setOpenIssues] = useState([]);
  const [longMaintenanceIssues, setLongMaintenanceIssues] = useState([]);
  const [buses, setBuses] = useState([]);
  const [openGroupId, setOpenGroupId] = useState(null);
  const [openStatus, setOpenStatus] = useState(null);
  const [openExpenseGroupId, setOpenExpenseGroupId] = useState(null);
  const [rotationPage, setRotationPage] = useState(1);
  const [placeFinance, setPlaceFinance] = useState([]);
  const [openPlaceFinance, setOpenPlaceFinance] = useState("");
  const [removingGroupId, setRemovingGroupId] = useState(null);
  const [reportError, setReportError] = useState("");

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
    api.get("/maintenance").then((rows) => {
      setOpenIssues(rows.filter((row) => row.status === "open" || row.status === "in_progress"));
      setLongMaintenanceIssues(rows.filter((row) => row.status === "long_maintenance"));
    }).catch(() => {});
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

  const busStaffIds = new Set(staff.filter((s) => s.staff_type_group === "bus").map((s) => s.id));
  const attendanceFor = (status, group) => attendance.filter((a) => a.status === status && (group === "bus" ? busStaffIds.has(a.staff_id) : group === "other" ? !busStaffIds.has(a.staff_id) : true));
  const presentToday = attendanceFor("present", "all").length + attendanceFor("late", "all").length;
  const totalRotations = rotations.length;
  const totalRotationPages = Math.max(1, Math.ceil(totalRotations / ROTATIONS_PER_PAGE));
  const rotationStart = (rotationPage - 1) * ROTATIONS_PER_PAGE;
  const visibleRotations = rotations.slice(rotationStart, rotationStart + ROTATIONS_PER_PAGE);
  const totalPassengers = rotations.reduce((s, g) => s + (g.passengers || 0), 0);
  const busName = (id) => busLabel(buses.find((b) => b.id === id)) || `Bus #${id}`;
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;
  const financialLabel = fromDate === toDate ? `Daily totals — ${fromDate}` : `Totals for ${rangeLabel}`;
  const staffById = new Map(staff.map((member) => [Number(member.id), member]));
  const busesById = new Map(buses.map((bus) => [Number(bus.id), bus]));
  const rotationBusAssignments = new Map();
  for (const rotation of rotations) {
    const workingBus = busLabel(rotation);
    for (const leg of rotation.legs) {
      for (const staffId of [leg.driver_id, leg.helper_id, leg.supervisor_id, leg.coach_id].filter(Boolean)) {
        const key = Number(staffId);
        if (!rotationBusAssignments.has(key)) rotationBusAssignments.set(key, new Set());
        rotationBusAssignments.get(key).add(workingBus);
      }
    }
  }

  const staffByStatus = (status, group = "all") => {
    const staffIdsWithStatus = new Set(attendanceFor(status, group).map((a) => Number(a.staff_id)));
    return staff.filter((s) => staffIdsWithStatus.has(Number(s.id)));
  };

  const staffRecord = (id) => staffById.get(Number(id));
  const staffName = (id) => staffRecord(id)?.name || "—";
  const maxMaintenanceCost = Math.max(1, ...maintenanceSummary.perBus.map((b) => b.total_cost));
  const busRotationPassengers = busRotations.reduce((s, g) => s + (g.passengers || 0), 0);

  const rotationBusesForStaff = (staffId) => [...(rotationBusAssignments.get(Number(staffId)) || [])].filter(Boolean);

  const workplacesForStaff = (member) => {
    if (!member) return [];
    if (member.staff_type_group === "bus") {
      const rotationBuses = rotationBusesForStaff(member.id);
      if (rotationBuses.length) return rotationBuses;
      const assignedBus = busesById.get(Number(member.assigned_bus_id));
      return [assignedBus ? busLabel(assignedBus) : "Bus not assigned"];
    }
    return [member.counter_name || "Counter not assigned"];
  };

  const workplaceGroupsFor = (status, group) => {
    const grouped = new Map();
    for (const member of staffByStatus(status, group)) {
      for (const workplace of workplacesForStaff(member)) {
        if (!grouped.has(workplace)) grouped.set(workplace, new Set());
        grouped.get(workplace).add(member.name);
      }
    }
    return [...grouped.entries()].map(([workplace, names]) => ({ workplace, names: [...names].sort() }))
      .sort((left, right) => left.workplace.localeCompare(right.workplace));
  };

  async function removeRotationFromReport(rotation, event) {
    event.stopPropagation();
    const label = `${busLabel(rotation)} — Rotation #${rotation.rotation_no}`;
    if (!confirm(`Move ${label} to Trash?\n\nBoth trip legs will be removed from Accounts and Reports. Admin or Super Admin can restore it from Trash.`)) return;
    setReportError("");
    setRemovingGroupId(rotation.group_id);
    try {
      await api.del(`/trips/${rotation.legs[0].id}/trash`);
      setRotations((rows) => rows.filter((row) => Number(row.group_id) !== Number(rotation.group_id)));
      setOpenGroupId(null);
      setOpenExpenseGroupId(null);
      if (String(selectedBus) === String(rotation.bus_id)) {
        setBusRotations((rows) => rows.filter((row) => Number(row.group_id) !== Number(rotation.group_id)));
      }
    } catch (err) {
      setReportError(err.message);
    } finally {
      setRemovingGroupId(null);
    }
  }

  useEffect(() => {
    setRotationPage((page) => Math.min(page, totalRotationPages));
  }, [totalRotationPages]);

  const changeRotationPage = (page) => {
    setRotationPage(page);
    setOpenGroupId(null);
    setOpenExpenseGroupId(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("reports_title")}</h1>
          <p>{t("reports_subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setRotationPage(1); }} />
          <span style={{ color: "var(--muted)" }}>{t("to_date")}</span>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setRotationPage(1); }} />
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

      <div className="grid reports-rotation-attendance-grid" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="rotation-report-heading">
            <div>
              <h3>{t("buses_ran_rotation")} — {rangeLabel}</h3>
              <p>{totalRotations ? `Showing ${rotationStart + 1}–${Math.min(rotationStart + ROTATIONS_PER_PAGE, totalRotations)} of ${totalRotations} rotations` : "No rotations in this period"}</p>
            </div>
            {totalRotationPages > 1 && <div className="rotation-report-pagination" aria-label="Rotation report pages">
              <button type="button" disabled={rotationPage === 1} onClick={() => changeRotationPage(rotationPage - 1)}>Previous</button>
              <span>Page {rotationPage} of {totalRotationPages}</span>
              <button type="button" disabled={rotationPage === totalRotationPages} onClick={() => changeRotationPage(rotationPage + 1)}>Next</button>
            </div>}
          </div>
          {reportError && <p className="error-text report-action-error">{reportError}</p>}
          <table>
            <thead><tr><th>{t("bus")}</th><th>{t("rotation_details")}</th><th>Bus staff</th><th>Passengers</th><th>{t("income")}</th><th>{t("expense")}</th><th>{t("net")}</th><th>{t("running_now")}</th>{canRemoveRotations && <th>Action</th>}</tr></thead>
            <tbody>
              {visibleRotations.map((g) => (
                <Fragment key={g.group_id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setOpenGroupId(openGroupId === g.group_id ? null : g.group_id)}>
                    <td><strong className="rotation-report-bus">{busLabel(g)}</strong></td>
                    <td><strong className="rotation-report-title">#{g.rotation_no} · {g.legs.length} {g.legs.length === 1 ? "leg" : "legs"} {openGroupId === g.group_id ? "▲" : "▼"}</strong></td>
                    <td><RotationStaffDetails legs={g.legs} compact /></td>
                    <td>{g.passengers || 0}</td>
                    <td style={{ color: "var(--green)" }}>৳{g.income.toLocaleString()}</td>
                    <td style={{ color: "var(--red)" }}>৳{g.expense.toLocaleString()}</td>
                    <td style={{ color: g.net >= 0 ? "var(--green)" : "var(--red)" }}>৳{g.net.toLocaleString()}</td>
                    <td>{g.legs.some((l) => l.status === "running") ? <span className="badge maintenance">{t("on_the_road")}</span> : <span className="badge active">{t("idle")}</span>}</td>
                    {canRemoveRotations && <td>
                      <button className="report-remove-rotation" type="button" disabled={removingGroupId === g.group_id} aria-busy={removingGroupId === g.group_id} onClick={(event) => removeRotationFromReport(g, event)}>
                        {removingGroupId === g.group_id ? "Moving…" : "Move to Trash"}
                      </button>
                    </td>}
                  </tr>
                  {openGroupId === g.group_id && (
                    <tr>
                      <td colSpan={canRemoveRotations ? 9 : 8} style={{ background: "var(--bg-soft, #f7f7f7)" }}>
                        <table>
                          <thead><tr><th>Leg</th><th>{t("route")}</th><th>Bus staff</th><th>{t("departure_time")}</th><th>Arrival</th><th>Passengers</th><th>{t("income")}</th></tr></thead>
                          <tbody>
                            {g.legs.map((leg) => (
                              <tr key={leg.id}>
                                <td>{leg.leg_no === 1 ? t("leg1") : t("leg2")}</td>
                                <td>{leg.route || "—"}</td>
                                <td><RotationStaffDetails legs={[leg]} /></td>
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
                </Fragment>
              ))}
              {rotations.length === 0 && <tr><td colSpan={canRemoveRotations ? 9 : 8}>{t("no_rotation_today")}</td></tr>}
            </tbody>
            {rotations.length > 0 && (
              <tfoot>
                <tr><td colSpan={3} style={{ textAlign: "right" }}><strong>Total</strong></td><td><strong>{totalPassengers}</strong></td><td style={{ color: "var(--green)" }}><strong>৳{rotations.reduce((sum, row) => sum + row.income, 0).toLocaleString()}</strong></td><td style={{ color: "var(--red)" }}><strong>৳{rotations.reduce((sum, row) => sum + row.expense, 0).toLocaleString()}</strong></td><td colSpan={canRemoveRotations ? 3 : 2}></td></tr>
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
            <div className="report-staff-workplaces">
              <section>
                <h4>{t(openStatus)} — Bus staff by working bus</h4>
                <WorkplaceGroups groups={workplaceGroupsFor(openStatus, "bus")} type="bus" />
              </section>
              <section>
                <h4>{t(openStatus)} — Counter / office staff</h4>
                <WorkplaceGroups groups={workplaceGroupsFor(openStatus, "other")} type="counter" />
              </section>
            </div>
          )}
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>{t("date")}</th><th>Staff</th><th>Workplace</th><th>{t("check_in")}</th><th>{t("check_out")}</th></tr></thead>
            <tbody>
              {attendance.filter((a) => a.check_in).map((a) => (
                <tr key={a.id}>
                  <td>{a.work_date}</td>
                  <td>{staffName(a.staff_id)}</td>
                  <td><div className="attendance-workplace-cell">{workplacesForStaff(staffRecord(a.staff_id)).map((workplace) => <span key={workplace}>{workplace}</span>)}</div></td>
                  <td>{a.check_in || "—"}</td>
                  <td>{a.check_out || "—"}</td>
                </tr>
              ))}
              {attendance.filter((a) => a.check_in).length === 0 && <tr><td colSpan={5}>{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Place-wise Accounts — {rangeLabel}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Each parent place is summarized below. Open Details to see the separate counter-wise income, expenses, and posted staff salaries. These figures are included in the overall Report totals above.</p>
        <table><thead><tr><th>Place</th><th>Income</th><th>Expense</th><th>Net</th><th></th></tr></thead><tbody>
          {[...new Set(placeFinance.map((row) => row.place_name))].map((place) => { const rows = placeFinance.filter((row) => row.place_name === place); const income = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + row.amount, 0); const expense = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.amount, 0); return <Fragment key={place}><tr><td>{place}</td><td>৳{income.toLocaleString()}</td><td>৳{expense.toLocaleString()}</td><td>৳{(income - expense).toLocaleString()}</td><td><button className="link-danger" onClick={() => setOpenPlaceFinance(openPlaceFinance === place ? "" : place)}>Details</button></td></tr>{openPlaceFinance === place && <tr><td colSpan={5}><table><thead><tr><th>Date</th><th>Counter</th><th>Type</th><th>Amount</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.txn_date}</td><td>{row.counter_name || "Whole place"}</td><td>{row.type}</td><td>৳{row.amount.toLocaleString()}</td><td>{row.description}</td></tr>)}</tbody></table></td></tr>}</Fragment>; })}
          {placeFinance.length === 0 && <tr><td colSpan={5}>No place-wise income or expense for this date range.</td></tr>}
        </tbody></table>
      </div>

      {longMaintenanceIssues.length > 0 && (
        <div className="card long-maintenance-report" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>⚠ {t("under_long_maintenance")} — {longMaintenanceIssues.length}</h3>
          <p>{t("long_maintenance_report_hint")}</p>
          <table>
            <thead><tr><th>{t("bus")}</th><th>{t("issue")}</th><th>{t("location")}</th><th>{t("reported")}</th><th>{t("status")}</th></tr></thead>
            <tbody>
              {longMaintenanceIssues.map((m) => (
                <tr key={m.id}>
                  <td><strong>{busName(m.bus_id)}</strong></td>
                  <td><strong>{m.issue}</strong>{m.parts?.length > 0 && <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 3 }}>{m.parts.map((part) => `${part.part_name} (৳${part.cost.toLocaleString()})`).join(" · ")}</div>}</td>
                  <td>{m.location || "—"}</td>
                  <td>{m.reported_date}</td>
                  <td><span className="badge long_maintenance">⚠ {t("under_long_maintenance")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0 }}>{t("open_in_progress_issues")} — {openIssues.length}</h3>
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
            {buses.map((b) => <option key={b.id} value={b.id}>{busLabel(b)}</option>)}
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
                    <text x="0" y={y + 14} fontSize="12" fill="var(--ink)">{busLabel(b)}</text>
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
