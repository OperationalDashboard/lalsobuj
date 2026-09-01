import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { t } from "../i18n.js";
import { BUS_DESIGNATIONS } from "./Staff.jsx";
import { canUseFeature } from "../permissions.js";

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_CYCLE = ["present", "late", "absent", "leave"];

export default function Attendance() {
  const me = getUser();
  const canEditTimeAndStatus = canUseFeature(me, "attendance", "write");

  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ check_in: "", check_out: "" });

  // Covering-for-an-absent-colleague check-in.
  const [coverStaffId, setCoverStaffId] = useState("");
  const [coverForId, setCoverForId] = useState("");

  function load() {
    api.get("/attendance").then(setRows).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
  }
  useEffect(load, []);

  // Bus staff (driver, supervisor, bus staff, helper, conductor, mechanic)
  // don't check in/out manually — they're checked in/out automatically the
  // moment their bus starts/finishes a rotation on Live Activity. Only
  // counter and office staff show up here for manual attendance.
  const manualStaff = staff.filter((s) => !BUS_DESIGNATIONS.includes(s.designation));
  const busStaff = staff.filter((s) => BUS_DESIGNATIONS.includes(s.designation));

  const todaysRows = rows.filter((r) => r.work_date === today());
  const staffName = (id) => staff.find((s) => s.id === id)?.name || "—";
  const todaysRowFor = (staffId) => todaysRows.find((r) => r.staff_id === staffId && !r.representing_staff_id);
  const todaysCheckinCount = (staffId) => todaysRows.filter((r) => r.staff_id === staffId).length;
  const absentToday = manualStaff.filter((s) => !todaysRowFor(s.id) || todaysRowFor(s.id)?.status === "absent");
  const selectedCoveringStaff = manualStaff.find((s) => String(s.id) === String(coverStaffId));
  const samePlaceAbsentees = absentToday.filter((s) =>
    String(s.id) !== String(coverStaffId)
    && selectedCoveringStaff?.place_id
    && Number(s.place_id) === Number(selectedCoveringStaff.place_id)
  );
  const staffLocation = (s) => [s.counter_name, s.place_name].filter(Boolean).join(" — ") || "No counter/place assigned";

  async function handleCheckIn(staffId) {
    setError("");
    try {
      await api.post("/attendance/checkin", { staff_id: staffId });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCoverCheckIn(e) {
    e.preventDefault();
    setError("");
    if (!coverStaffId || !coverForId) { setError("Pick who's checking in and who they're covering for"); return; }
    try {
      await api.post("/attendance/checkin", { staff_id: coverStaffId, representing_staff_id: coverForId });
      setCoverStaffId(""); setCoverForId("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCheckOut(attendanceId) {
    setError("");
    try {
      await api.put(`/attendance/${attendanceId}/checkout`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reopenAttendance(attendanceId, stage) {
    setError("");
    try {
      await api.post(`/attendance/${attendanceId}/reopen`, { stage });
      load();
    } catch (err) { setError(err.message); }
  }

  async function handleMarkAbsent(staffId, status) {
    setError("");
    try {
      await api.post("/attendance", { staff_id: staffId, work_date: today(), status });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditValues({ check_in: row.check_in || "", check_out: row.check_out || "" });
  }

  async function saveEdit(row) {
    try {
      await api.put(`/attendance/${row.id}`, editValues);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Admin/Super Admin only: click a status badge to cycle it to the next
  // value — present -> late -> absent -> leave -> present. Only Admin/Super
  // Admin can change the TIME of a record too (see the Edit button below).
  async function toggleStatus(row) {
    if (!canEditTimeAndStatus) return;
    setError("");
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(row.status) + 1) % STATUS_CYCLE.length];
    try {
      await api.put(`/attendance/${row.id}/status`, { status: next });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("attendance_title")}</h1>
          <p>{t("attendance_subtitle")} Only Admin/Super Admin can change a record's time or status afterward.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Today — {today()}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Bus staff (driver, supervisor, bus staff, helper, conductor, mechanic) aren't listed here — they're checked
          in and out automatically whenever their bus starts or finishes a rotation on Live Activity.
        </p>
        {error && <p className="error-text">{error}</p>}
        <table>
          <thead><tr><th>Staff</th><th>{t("check_in")}</th><th>{t("check_out")}</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {manualStaff.map((s) => {
              const row = todaysRowFor(s.id);
              return (
                <tr key={s.id}>
                  <td>{s.name}{todaysCheckinCount(s.id) > 1 ? ` (${todaysCheckinCount(s.id)}x today)` : ""}</td>
                  <td>{row?.check_in || "—"}</td>
                  <td>{row?.check_out || "—"}</td>
                  <td>
                    {row ? (
                      <span
                        className={`badge ${row.status}`}
                        style={canEditTimeAndStatus ? { cursor: "pointer" } : undefined}
                        title={canEditTimeAndStatus ? t("toggle_status") : undefined}
                        onClick={() => toggleStatus(row)}
                      >
                        {t(row.status)}
                      </span>
                    ) : (
                      <span className="badge absent">{t("not_marked")}</span>
                    )}
                  </td>
                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canEditTimeAndStatus && !row?.check_in && <button className="primary" onClick={() => handleCheckIn(s.id)}>{t("check_in_now")}</button>}
                    {canEditTimeAndStatus && row?.check_in && !row?.check_out && <button className="primary" onClick={() => handleCheckOut(row.id)}>{t("check_out_now")}</button>}
                    {canEditTimeAndStatus && row && !row.check_in && <button className="link-danger" onClick={() => reopenAttendance(row.id, "checkin")}>Reopen check-in</button>}
                    {canEditTimeAndStatus && row?.check_in && row?.check_out && <button className="link-danger" onClick={() => reopenAttendance(row.id, "checkout")}>Reopen check-out</button>}
                    {!row && canEditTimeAndStatus && <><button className="link-danger" onClick={() => handleMarkAbsent(s.id, "absent")}>{t("mark_absent")}</button><button className="link-danger" onClick={() => handleMarkAbsent(s.id, "leave")}>Mark leave</button></>}
                  </td>
                </tr>
              );
            })}
            {manualStaff.length === 0 && <tr><td colSpan={5}>No counter/office staff to show attendance for.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Bus staff — Today (auto-tracked)</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Read-only. Filled in automatically when their bus starts or finishes a rotation on Live Activity.
        </p>
        <table>
          <thead><tr><th>Staff</th><th>{t("check_in")}</th><th>{t("check_out")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {busStaff.map((s) => {
              const row = todaysRowFor(s.id);
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{row?.check_in || "—"}</td>
                  <td>{row?.check_out || "—"}</td>
                  <td>{row ? <span className={`badge ${row.status}`}>{t(row.status)}</span> : <span className="badge absent">Not on a rotation yet</span>}</td>
                </tr>
              );
            })}
            {busStaff.length === 0 && <tr><td colSpan={4}>No bus staff on record.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Covering for an absent colleague</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          If someone is absent and another staff member is doing their job today, check that person in here as
          covering for them. Covering is allowed only between counters in the same parent place. The person who
          covers receives the absent staff member's configured salary amount as overtime.
        </p>
        <form className="form-row" onSubmit={handleCoverCheckIn}>
          <select value={coverStaffId} onChange={(e) => { setCoverStaffId(e.target.value); setCoverForId(""); }}>
            <option value="">Who's checking in</option>
            {manualStaff.map((s) => <option key={s.id} value={s.id}>{s.name} — {staffLocation(s)}</option>)}
          </select>
          <select value={coverForId} disabled={!selectedCoveringStaff?.place_id} onChange={(e) => setCoverForId(e.target.value)}>
            <option value="">Covering for (same place, absent today)</option>
            {samePlaceAbsentees.map((s) => <option key={s.id} value={s.id}>{s.name} — {staffLocation(s)}</option>)}
          </select>
          <button className="primary" type="submit">Check in as cover</button>
        </form>
        {coverStaffId && !selectedCoveringStaff?.place_id && <p className="error-text">Assign this staff member's counter to a parent place in Settings before using cover duty.</p>}
        {selectedCoveringStaff?.place_id && samePlaceAbsentees.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No absent staff from {selectedCoveringStaff.place_name} are currently available to cover.</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("all_records")}</h3>
        <table>
          <thead><tr><th>{t("date")}</th><th>Staff</th><th>Covering for</th><th>{t("check_in")}</th><th>{t("check_out")}</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.work_date}</td>
                <td>{staffName(r.staff_id)}</td>
                <td>{r.representing_staff_id ? staffName(r.representing_staff_id) : "—"}</td>
                {editingId === r.id ? (
                  <>
                    <td><input type="time" value={editValues.check_in} onChange={(e) => setEditValues({ ...editValues, check_in: e.target.value })} /></td>
                    <td><input type="time" value={editValues.check_out} onChange={(e) => setEditValues({ ...editValues, check_out: e.target.value })} /></td>
                    <td>
                      {/* Status itself is changed only via the Admin/Super-Admin toggle above, not here. */}
                      <span className={`badge ${r.status}`}>{t(r.status)}</span>
                    </td>
                    <td>
                      <button className="primary" style={{ marginRight: 8 }} onClick={() => saveEdit(r)}>{t("save")}</button>
                      <button className="link-danger" onClick={() => setEditingId(null)}>{t("cancel")}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{r.check_in || "—"}</td>
                    <td>{r.check_out || "—"}</td>
                    <td>
                      <span
                        className={`badge ${r.status}`}
                        style={canEditTimeAndStatus ? { cursor: "pointer" } : undefined}
                        title={canEditTimeAndStatus ? t("toggle_status") : undefined}
                        onClick={() => toggleStatus(r)}
                      >
                        {t(r.status)}
                      </span>
                    </td>
                    <td>{canEditTimeAndStatus && <><button className="link-danger" onClick={() => startEdit(r)}>{t("edit")}</button>{!r.check_in && <button className="link-danger" onClick={() => reopenAttendance(r.id, "checkin")}> Reopen check-in</button>}{r.check_in && r.check_out && <button className="link-danger" onClick={() => reopenAttendance(r.id, "checkout")}> Reopen check-out</button>}</>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
