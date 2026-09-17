import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { busLabel } from "../busLabel.js";
import { t } from "../i18n.js";
import { activityClock, activityDay, activityInput, activityTimestamp, chronologicalLogs } from "../activityTime.js";
import SearchableSelect from "../components/SearchableSelect.jsx";
import Pagination from "../components/Pagination.jsx";
import PdfExportButton from "../components/PdfExportButton.jsx";
import { downloadReportPdf } from "../utils/reportPdf.js";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const startEmpty = { rotation_id: "", departure_time: "", price_per_seat: "" };
const ROTATION_PAGE_SIZE = 15;

// Which checkpoint event types each role is allowed to log — must match
// the backend's EVENT_ROLE_MAP in server/src/routes/activityLogs.js.
// Everyone gets exactly the one kind of entry that matches their job;
// Admin/Super Admin get everything plus the ability to edit/give a time.
const EVENT_OPTIONS_BY_ROLE = {
  [ROLES.CONTROL_COUNTER]: [
    { value: "stop_arrival", label: "Arrived at my counter" },
    { value: "stop_departure", label: "Left my counter" },
    { value: "note", label: "Note" },
  ],
  [ROLES.COUNTER]: [
    { value: "stop_arrival", label: "Arrived at my counter" },
    { value: "stop_departure", label: "Left my counter" },
    { value: "note", label: "Note" },
  ],
  [ROLES.HOTEL]: [
    { value: "hotel_break", label: "Hotel break" },
  ],
  [ROLES.PUMP_MANAGER]: [
    { value: "fuel", label: "Fuel taken" },
  ],
  [ROLES.ACCOUNTS]: [
    { value: "fuel", label: "Fuel taken" },
  ],
  [ROLES.PASSENGER_CHECKER]: [
    { value: "passenger_count", label: "Passenger count" },
    { value: "exceptional_passenger_count", label: "Exceptional passenger count" },
    { value: "additional_passenger_count", label: "Additional passenger" },
  ],
  [ROLES.ADMIN]: [
    { value: "left_counter", label: "Left counter" },
    { value: "stop_arrival", label: "Arrived at stop" },
    { value: "stop_departure", label: "Left stop" },
    { value: "hotel_break", label: "Hotel break" },
    { value: "fuel", label: "Fuel taken" },
    { value: "passenger_count", label: "Passenger count" },
    { value: "note", label: "Note" },
    { value: "exceptional_passenger_count", label: "Exceptional passenger count" },
    { value: "additional_passenger_count", label: "Additional passenger" },
  ],
};
EVENT_OPTIONS_BY_ROLE[ROLES.SUPER_ADMIN] = EVENT_OPTIONS_BY_ROLE[ROLES.ADMIN];

const eventLabel = {
  left_counter: "Left counter",
  stop_arrival: "Arrived at stop",
  stop_departure: "Left stop",
  hotel_break: "Hotel break",
  fuel: "Fuel taken",
  passenger_count: "Passenger count",
  exceptional_passenger_count: "Exceptional passenger count",
  additional_passenger_count: "Additional passenger",
  note: "Note",
};

const OTHER_PLACE = "__other__";

export default function LiveActivity() {
  const me = getUser();
  const role = me?.role;
  const canStartTrip = role === ROLES.CONTROL_COUNTER || role === ROLES.DRIVER || role === ROLES.HELPER || isFullAccess(role);
  const canCompleteTrip = [ROLES.CONTROL_COUNTER, ROLES.COUNTER].includes(role) || isFullAccess(role);
  const isAdmin = isFullAccess(role);
  const eventOptions = EVENT_OPTIONS_BY_ROLE[role] || [];
  const canLogAnything = eventOptions.length > 0;
  // Counter/Control Counter's "place" is always their own assigned
  // counter — the server fills it in automatically, nothing to pick here.
  const placeIsAutoFilled = role === ROLES.COUNTER || role === ROLES.CONTROL_COUNTER;

  const [buses, setBuses] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [routesList, setRoutesList] = useState([]);
  const [openRotations, setOpenRotations] = useState([]);
  const [places, setPlaces] = useState([]);
  const [myCounterName, setMyCounterName] = useState("");
  const [myAssignedBus, setMyAssignedBus] = useState(null);
  const [liveTrips, setLiveTrips] = useState([]);
  const [activityView, setActivityView] = useState("live");
  const historyMode = isAdmin && activityView === "history";
  const [historyFilters, setHistoryFilters] = useState(() => ({ from: today(), to: today(), bus_id: "" }));
  const [historyQuery, setHistoryQuery] = useState(historyFilters);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState({ rows: [], total: 0, page: 1, page_count: 1 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const logRequest = useRef(0);
  const [rotationCounts, setRotationCounts] = useState([]);
  const [rotationPage, setRotationPage] = useState(1);
  const [startForm, setStartForm] = useState(startEmpty);
  const [startingTrip, setStartingTrip] = useState(false);
  const [error, setError] = useState("");

  const [openTripId, setOpenTripId] = useState(null);
  const [logForm, setLogForm] = useState(() => ({
    event_type: eventOptions[0]?.value || "note",
    location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: "",
  }));
  const [logsByTrip, setLogsByTrip] = useState({});
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogTime, setEditLogTime] = useState("");
  const [editExceptional, setEditExceptional] = useState({});

  // Inline "mark completed" time picker state, replacing a browser prompt()
  // so the arrival time is always chosen with a proper clock control.
  const [completingId, setCompletingId] = useState(null);
  const [completeTime, setCompleteTime] = useState("");
  const [editingTripTimeId, setEditingTripTimeId] = useState(null);
  const [editTripDeparture, setEditTripDeparture] = useState("");
  const [editTripArrival, setEditTripArrival] = useState("");
  const [editTripPrice, setEditTripPrice] = useState("");
  const [busy, setBusy] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  function loadReferenceData() {
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/hotels").then(setHotels).catch(() => {});
    api.get("/routes?active=1").then(setRoutesList).catch(() => {});
    if (placeIsAutoFilled) {
      api.get("/auth/me").then((r) => setMyCounterName(r.staff?.counter_name || "")).catch(() => {});
    }
    if (role === ROLES.DRIVER || role === ROLES.HELPER) {
      api.get("/auth/me").then((r) => setMyAssignedBus(r.staff || null)).catch(() => {});
    }
    if (isAdmin) {
      api.get("/activity-logs/places").then((r) => setPlaces(r.places)).catch(() => {});
    }
  }

  // Only live trip data needs frequent polling. Fleet, route, hotel, place,
  // and profile data stay unchanged while this page is open, so repeatedly
  // downloading them made Live Activity needlessly slow on shared hosting.
  function loadActivityData() {
    api.get("/rotations").then((rows) => setOpenRotations(rows.filter((r) => !r.trip_id && r.status === "scheduled" && r.bus_status === "active"))).catch(() => {});
    api.get("/trips/live").then(setLiveTrips).catch(() => {});
    api.get(`/trips/rotation-counts?date=${today()}`).then((r) => setRotationCounts(r.buses)).catch(() => {});
  }

  function load() {
    loadReferenceData();
    loadActivityData();
  }

  useEffect(() => {
    load();
    const interval = setInterval(loadActivityData, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!historyMode) { setHistoryLoading(false); return; }
    let cancelled = false;
    setHistoryLoading(true); setHistoryError("");
    const query = new URLSearchParams({ ...historyQuery, page: String(historyPage) });
    api.get(`/activity-logs/journeys?${query}`).then((result) => {
      if (!cancelled) setHistory(result);
    }).catch((err) => {
      if (!cancelled) { setHistoryError(err.message); setHistory({ rows: [], total: 0, page: 1, page_count: 1 }); }
    }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [historyMode, historyQuery, historyPage, historyRevision]);

  function closeEditors() {
    logRequest.current++;
    setOpenTripId(null); setEditingLogId(null); setEditingTripTimeId(null); setCompletingId(null);
    setError(""); setLogsLoading(false);
  }

  function refreshJourneys() {
    loadActivityData();
    if (historyMode) setHistoryRevision((value) => value + 1);
  }

  function findHistory(e) {
    e.preventDefault();
    if (busy) return;
    if (!historyFilters.from || !historyFilters.to || historyFilters.from > historyFilters.to) {
      setHistoryError("Choose a valid journey date range."); return;
    }
    closeEditors(); setHistoryPage(1); setHistoryQuery({ ...historyFilters });
  }

  const visibleTrips = historyMode ? (historyLoading ? [] : history.rows) : liveTrips;

  const rotationPageCount = Math.max(1, Math.ceil(rotationCounts.length / ROTATION_PAGE_SIZE));
  const currentRotationPage = Math.min(rotationPage, rotationPageCount);
  const visibleRotationCounts = rotationCounts.slice(
    (currentRotationPage - 1) * ROTATION_PAGE_SIZE,
    currentRotationPage * ROTATION_PAGE_SIZE,
  );

  async function handleStartTrip(e) {
    e.preventDefault();
    setError("");
    if (!startForm.rotation_id) { setError("Select an open rotation"); return; }
    if (!startForm.departure_time) { setError("Departure time is required to start a trip"); return; }
    setStartingTrip(true);
    try {
      const startedTrip = await api.post("/trips", {
        ...startForm,
        trip_date: today(),
        price_per_seat: startForm.price_per_seat ? Number(startForm.price_per_seat) : null,
      });
      // The create endpoint returns the same display-ready record as /trips/live.
      // Put it on screen immediately instead of waiting for a full page refresh.
      setLiveTrips((rows) => [startedTrip, ...rows.filter((trip) => Number(trip.id) !== Number(startedTrip.id))]);
      setOpenRotations((rows) => rows.filter((rotation) => Number(rotation.id) !== Number(startedTrip.rotation_id)));
      setRotationCounts((rows) => rows.map((bus) => Number(bus.bus_id) === Number(startedTrip.bus_id) ? {
        ...bus,
        rotations: Number(bus.rotations || 0) + (Number(startedTrip.leg_no) === 1 ? 1 : 0),
        running_now: Number(bus.running_now || 0) + 1,
      } : bus));
      setStartForm(startEmpty);
    } catch (err) {
      setError(err.message);
    } finally {
      setStartingTrip(false);
    }
  }

  function openCompleteFor(trip) {
    setCompletingId(trip.id);
    setCompleteTime(new Date().toTimeString().slice(0, 5));
  }

  async function submitComplete(e, trip) {
    e.preventDefault();
    try {
      await api.put(`/trips/${trip.id}/complete`, { arrival_time: completeTime || null });
      setCompletingId(null);
      refreshJourneys();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLiveTrip(trip) {
    if (busy || !confirm(`Move ${busLabel(trip)} — Rotation ${trip.rotation_no} to Trash, including its linked journeys and accounts? You can restore it from Trash.`)) return;
    setBusy(`remove-trip:${trip.id}`);
    try { await api.del(`/trips/${trip.id}/trash`); closeEditors(); refreshJourneys(); } catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  // Admin/Super Admin only: give or edit a trip's departure time directly,
  // any time — not just while starting or completing it.
  function openTripTimeEdit(trip) {
    setEditingTripTimeId(trip.id);
    setEditTripDeparture(trip.departure_time || "");
    setEditTripArrival(trip.arrival_time || "");
    setEditTripPrice(trip.price_per_seat ?? "");
  }
  async function saveTripTime(trip) {
    if (busy) return;
    setBusy(`trip:${trip.id}`); setError("");
    try {
      await api.put(`/trips/${trip.id}/time`, { departure_time: editTripDeparture || null, arrival_time: editTripArrival || null, price_per_seat: editTripPrice === "" ? null : Number(editTripPrice) });
      setEditingTripTimeId(null);
      refreshJourneys();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(""); }
  }

  function toggleTrip(trip) {
    if (busy) return;
    const tripId = trip.id;
    const requestId = ++logRequest.current;
    if (openTripId === tripId) { setOpenTripId(null); setLogsLoading(false); return; }
    setOpenTripId(tripId);
    setEditingLogId(null); setError(""); setLogsLoading(true);
    setLogForm({ event_type: eventOptions[0]?.value || "note", location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: historyMode ? `${trip.trip_date}T${(trip.departure_time || "00:00").slice(0, 5)}` : "" });
    api.get(`/activity-logs?trip_id=${tripId}`).then((rows) => {
      if (requestId === logRequest.current) setLogsByTrip((prev) => ({ ...prev, [tripId]: rows }));
    }).catch((err) => { if (requestId === logRequest.current) setError(err.message); })
      .finally(() => { if (requestId === logRequest.current) setLogsLoading(false); });
  }

  async function handleAddLog(e, trip) {
    e.preventDefault();
    if (busy) return;
    if (historyMode && !logForm.recorded_at) { setError("Choose the checkpoint date and time for this historical journey."); return; }
    if (!eventOptions.some((option) => option.value === logForm.event_type)) { setError("Select the entry type first."); return; }
    setBusy(`add:${trip.id}`);
    setError("");
    const location_name = logForm.location_name === OTHER_PLACE ? logForm.other_place : logForm.location_name;
    try {
      await api.post("/activity-logs", {
        trip_id: trip.id,
        bus_id: trip.bus_id,
        event_type: logForm.event_type,
        location_name: location_name || null,
        passengers_count: logForm.passengers_count ? Number(logForm.passengers_count) : null,
        price_per_seat: ["exceptional_passenger_count", "additional_passenger_count"].includes(logForm.event_type) ? Number(logForm.price_per_seat) : undefined,
        fuel_liters: logForm.fuel_liters ? Number(logForm.fuel_liters) : null,
        fuel_cost: logForm.fuel_cost ? Number(logForm.fuel_cost) : null,
        note: logForm.note || null,
        recorded_at: isAdmin && logForm.recorded_at ? activityTimestamp(logForm.recorded_at) : undefined,
      });
      setLogForm({ ...logForm, location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: historyMode ? logForm.recorded_at : "" });
      const rows = await api.get(`/activity-logs?trip_id=${trip.id}`);
      setLogsByTrip((prev) => ({ ...prev, [trip.id]: rows }));
      refreshJourneys();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(""); }
  }

  // Admin/Super Admin only: edit the recorded time of any past checkpoint entry.
  function startEditLogTime(log, trip) {
    setError("");
    setEditExceptional({ event_type: log.event_type, passengers_count: log.passengers_count ?? "", price_per_seat: log.price_per_seat ?? "", fuel_liters: log.fuel_liters ?? "", fuel_cost: log.fuel_cost ?? "", location_name: log.location_name || "", note: log.note || "" });
    setEditingLogId(log.id);
    setEditLogTime(activityInput(log.recorded_at, trip.trip_date, true));
  }
  async function saveLogTime(trip, log) {
    if (!editLogTime) { setError("Choose the checkpoint date and time"); return; }
    if (busy) return;
    setBusy(`edit:${log.id}`); setError("");
    try {
      const eventType = editExceptional.event_type;
      const changes = { event_type: eventType, recorded_at: activityTimestamp(editLogTime), note: editExceptional.note, location_name: editExceptional.location_name || null };
      if (["passenger_count", "exceptional_passenger_count", "additional_passenger_count"].includes(eventType)) changes.passengers_count = Number(editExceptional.passengers_count);
      if (["exceptional_passenger_count", "additional_passenger_count"].includes(eventType)) changes.price_per_seat = Number(editExceptional.price_per_seat);
      if (eventType === "fuel") { changes.fuel_liters = Number(editExceptional.fuel_liters); changes.fuel_cost = Number(editExceptional.fuel_cost); }
      await api.put(`/activity-logs/${log.id}`, changes);
      setEditingLogId(null);
      const rows = await api.get(`/activity-logs?trip_id=${trip.id}`);
      setLogsByTrip((prev) => ({ ...prev, [trip.id]: rows }));
      refreshJourneys();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(""); }
  }

  async function removeLog(trip, log) {
    if (busy || !confirm(`Remove this ${eventLabel[log.event_type] || "checkpoint"} entry? Its passenger/fuel values will be removed from the journey totals.`)) return;
    setBusy(`delete:${log.id}`); setError("");
    try {
      await api.del(`/activity-logs/${log.id}`);
      setLogsByTrip((prev) => ({ ...prev, [trip.id]: (prev[trip.id] || []).filter((row) => row.id !== log.id) }));
      setEditingLogId(null); refreshJourneys();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  async function exportJourney(trip) {
    const rows = await api.get(`/activity-logs?trip_id=${trip.id}`);
    return downloadReportPdf({ filename: `journey-${trip.id}`, title: `${busLabel(trip)} — Journey report`, subtitle: `${trip.route || "No route"} | ${trip.trip_date} | Rotation ${trip.rotation_no}`, sections: [{ title: "Journey checkpoints", columns: ["Date & time", "Event", "Place", "Passengers", "Seat price (BDT)", "Fuel (L)", "Fuel cost (BDT)", "Note"], rows: chronologicalLogs(rows, trip.trip_date).map((row) => [row.recorded_at, eventLabel[row.event_type], row.location_name, row.passengers_count, row.price_per_seat ?? (row.event_type === "passenger_count" ? trip.price_per_seat : null), row.fuel_liters, row.fuel_cost, row.note]) }] });
  }

  const isOwnPlaceEvent = ["stop_arrival", "stop_departure", "left_counter"].includes(logForm.event_type);
  const needsHotelDropdown = logForm.event_type === "hotel_break";
  const needsAdminPlacePicker = isAdmin && isOwnPlaceEvent;
  const needsPlainLocationText = !placeIsAutoFilled && !isAdmin && isOwnPlaceEvent;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("live_activity_title")}</h1>
          <p>{t("live_activity_subtitle")}</p>
        </div>
      </div>

      {isAdmin && <section className="card live-history-controls" aria-label="Manage activity by date">
        <div className="live-history-heading"><div><h3>Activity workspace</h3><p>Manage checkpoints for any journey date, including completed trips.</p></div>
          <div className="live-history-switch" role="group" aria-label="Activity view">
            <button type="button" className={historyMode ? "secondary" : "primary"} aria-pressed={!historyMode} disabled={Boolean(busy)} onClick={() => { closeEditors(); setActivityView("live"); }}>On the road</button>
            <button type="button" className={historyMode ? "primary" : "secondary"} aria-pressed={historyMode} disabled={Boolean(busy)} onClick={() => { closeEditors(); setActivityView("history"); }}>Manage by date</button>
          </div>
        </div>
        {historyMode && <>
          <form className="live-history-filters" onSubmit={findHistory}>
            <label className="live-field"><span>Journey date from</span><input type="date" required value={historyFilters.from} onChange={(e) => setHistoryFilters({ ...historyFilters, from: e.target.value })} /></label>
            <label className="live-field"><span>Journey date to</span><input type="date" required value={historyFilters.to} onChange={(e) => setHistoryFilters({ ...historyFilters, to: e.target.value })} /></label>
            <label className="live-field"><span>Bus number</span><SearchableSelect id="activity-history-bus" value={historyFilters.bus_id} onChange={(bus_id) => setHistoryFilters({ ...historyFilters, bus_id })} options={[{ value: "", label: "All buses" }, ...buses.map((bus) => ({ value: bus.id, label: busLabel(bus) }))]} placeholder="Search bus number" /></label>
            <button className="primary" type="submit" disabled={Boolean(busy) || historyLoading} aria-busy={historyLoading}>{historyLoading ? "Finding journeys…" : "Find journeys"}</button>
          </form>
          <p className="live-history-note">Choose the same date in both fields for one day. Open a journey below to add, edit or remove entries at any date and time. This does not reopen completed trips or change already-posted Accounts entries. Removed journeys must first be restored from Trash.</p>
          {historyError && <p className="error-text" role="alert">{historyError}</p>}
        </>}
      </section>}
      {error && !openTripId && !editingTripTimeId && <p className="error-text" role="alert">{error}</p>}

      {placeIsAutoFilled && (
        <div className="card" style={{ marginBottom: 20, background: "var(--surface-soft)" }}>
          <strong>{t("logging_as")}: {myCounterName || t("no_counter_assigned")}</strong>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Your arrival/departure entries are automatically recorded under your own counter's name.
          </p>
        </div>
      )}

      {(role === ROLES.DRIVER || role === ROLES.HELPER) && (
        <div className="card" style={{ marginBottom: 20, background: "var(--surface-soft)" }}>
          <strong>Your bus: {myAssignedBus?.assigned_bus_id ? busLabel(buses.find((b) => b.id === myAssignedBus.assigned_bus_id)) : "not assigned"}</strong>
        </div>
      )}

      {!historyMode && canStartTrip && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t("start_a_trip")}</h3>
          <form className="live-start-form" onSubmit={handleStartTrip}>
            <label className="live-field live-rotation-field"><span>Open rotation</span>
              <SearchableSelect id="live-start-rotation" value={startForm.rotation_id} onChange={(rotation_id) => setStartForm({ ...startForm, rotation_id })} required placeholder="Search bus or route" options={openRotations.filter((r) => ![ROLES.DRIVER, ROLES.HELPER].includes(role) || String(r.bus_id) === String(myAssignedBus?.assigned_bus_id)).map((r) => ({ value: r.id, label: `${busLabel(r)} — ${r.route || "no route"} — ${r.duty_date} — ${r.shift_start ? activityClock(r.shift_start, r.duty_date) : "Time not set"}` }))} />
            </label>
            <label className="live-field"><span>{t("departure_time")}</span>
              <input type="time" value={startForm.departure_time} required onChange={(e) => setStartForm({ ...startForm, departure_time: e.target.value })} />
            </label>
            <label className="live-field"><span>{t("price_per_seat")}</span>
              <input placeholder="৳ Optional" type="number" value={startForm.price_per_seat} onChange={(e) => setStartForm({ ...startForm, price_per_seat: e.target.value })} />
            </label>
            <button className="primary" type="submit" disabled={startingTrip} aria-busy={startingTrip}>
              <span className="online-button-content">
                {startingTrip && <span className="online-button-spinner" aria-hidden="true" />}
                {startingTrip ? "Starting trip…" : t("bus_left_counter")}
              </span>
            </button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "6px 0 0" }}>
            {t("price_used_by_accounts")}
          </p>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      {!historyMode && <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("todays_rotations")}</h3>
        <table>
          <thead><tr><th>{t("bus")}</th><th>{t("rotations_today")}</th><th>{t("running_now")}</th></tr></thead>
          <tbody>
            {visibleRotationCounts.map((r) => (
              <tr key={r.bus_id}>
                <td>{busLabel(r)}</td>
                <td>{r.rotations}</td>
                <td>{r.running_now > 0 ? <span className="badge maintenance">Yes</span> : <span className="badge active">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rotationCounts.length > ROTATION_PAGE_SIZE && <div className="bus-pagination">
          <span>Showing {(currentRotationPage - 1) * ROTATION_PAGE_SIZE + 1}–{Math.min(currentRotationPage * ROTATION_PAGE_SIZE, rotationCounts.length)} of {rotationCounts.length} buses</span>
          <Pagination page={currentRotationPage} pageCount={rotationPageCount} onPageChange={setRotationPage} label="today's buses" />
        </div>}
      </div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{historyMode ? "Journey activity records" : t("trips_on_the_road")}</h3>
        {historyMode && <p className="live-history-note">Journey dates {historyQuery.from} to {historyQuery.to} · {history.total} journeys · 15 per page</p>}
        {historyMode && historyLoading && <p role="status">Loading journey records…</p>}
        {visibleTrips.length === 0 && !historyLoading && <p style={{ color: "var(--muted)" }}>{historyMode ? "No journeys found for this date range and bus. Try a different journey date." : t("no_trips_running")}</p>}
        {visibleTrips.map((trip) => (
          <article key={trip.id} className="live-trip-card">
            <div className="live-trip-heading">
              <div className="live-trip-identity">
                <div className="live-trip-title"><strong>{busLabel(trip)}</strong><span className={`badge ${trip.status === "running" ? "running" : "active"}`}>{trip.status === "running" ? "On the road" : "Completed"}</span>{historyMode && trip.accounts_status === "done" && <span className="badge">Accounts posted</span>}</div>
                <p>{trip.route || "No route set"}</p>
                <div className="live-trip-meta"><span>Rotation {trip.rotation_no} · {trip.trip_date}</span><span>{trip.route || (trip.leg_no === 2 ? t("leg2") : t("leg1"))}</span>{trip.price_per_seat ? <span>৳{trip.price_per_seat}/seat</span> : null}</div>
              </div>
              <div className="live-trip-actions">
                <PdfExportButton onExport={() => exportJourney(trip)} />
                {isAdmin && <button className="link-danger" disabled={Boolean(busy)} onClick={() => removeLiveTrip(trip)}>{busy === `remove-trip:${trip.id}` ? "Removing…" : "Remove trip"}</button>}
                {(
                  <button className="primary" disabled={Boolean(busy)} onClick={() => toggleTrip(trip)}>
                    {openTripId === trip.id ? "Hide entries" : isAdmin ? "Add / edit / remove entries" : canLogAnything ? t("log_checkpoint") : "View entries"}
                  </button>
                )}
                {canCompleteTrip && trip.status === "running" && (
                  <button className="link-danger" onClick={() => openCompleteFor(trip)}>{t("mark_completed")}</button>
                )}
              </div>
            </div>

            <div className="live-timing-grid" aria-label="Trip timing">
              <div className="live-timing-item"><span className="live-timing-label">Trip date</span><strong>{activityDay(`${trip.trip_date}T12:00:00`)}</strong><small>{trip.leg_no === 2 ? "Return journey" : "Outbound journey"}</small></div>
              <div className="live-timing-item"><span className="live-timing-label">Departure</span><strong>{activityClock(trip.departure_time, trip.trip_date)}</strong>{isAdmin && <button className="live-time-edit" disabled={Boolean(busy)} onClick={() => openTripTimeEdit(trip)}>Edit times &amp; fare</button>}</div>
              <div className="live-timing-item"><span className="live-timing-label">Latest checkpoint</span><strong>{activityClock(trip.last_update, trip.trip_date)}</strong><small>{trip.last_event ? `${eventLabel[trip.last_event] || trip.last_event}${trip.last_location ? ` · ${trip.last_location}` : ""}` : "No checkpoint yet"}</small>{trip.last_update && <small>{activityDay(trip.last_update, trip.trip_date)}</small>}</div>
              <div className="live-timing-item"><span className="live-timing-label">Arrival</span><strong>{trip.arrival_time ? activityClock(trip.arrival_time, trip.trip_date) : "Pending"}</strong><small>{trip.arrival_time ? "Recorded arrival" : "Awaiting completion"}</small></div>
            </div>

            {editingTripTimeId === trip.id && <form className="live-time-editor" onSubmit={(e) => { e.preventDefault(); saveTripTime(trip); }}>
              <label className="live-field"><span>Departure time</span><input type="time" value={editTripDeparture} onChange={(e) => setEditTripDeparture(e.target.value)} /></label>
              <label className="live-field"><span>Arrival time</span><input type="time" value={editTripArrival} onChange={(e) => setEditTripArrival(e.target.value)} /></label>
              <label className="live-field"><span>Normal seat price (BDT)</span><input type="number" min="0" step="0.01" value={editTripPrice} onChange={(e) => setEditTripPrice(e.target.value)} /></label>
              <button className="primary" type="submit" disabled={Boolean(busy)} aria-busy={busy === `trip:${trip.id}`}>{busy === `trip:${trip.id}` ? "Saving…" : t("save")}</button><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setEditingTripTimeId(null)}>{t("cancel")}</button>
              {error && <p className="error-text" role="alert">{error}</p>}
            </form>}

            {completingId === trip.id && (
              <form className="live-time-editor" onSubmit={(e) => submitComplete(e, trip)}>
                <label className="live-field"><span>Arrival time</span><input type="time" value={completeTime} onChange={(e) => setCompleteTime(e.target.value)} /></label>
                <button className="primary" type="submit">{t("confirm_arrival")}</button>
                <button type="button" className="link-danger" onClick={() => setCompletingId(null)}>{t("cancel")}</button>
              </form>
            )}

            {openTripId === trip.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {canLogAnything && <form className={`form-row ${["exceptional_passenger_count", "additional_passenger_count"].includes(logForm.event_type) ? "paid-passenger-entry" : ""}`} onSubmit={(e) => handleAddLog(e, trip)}>
                  <label className="live-field"><span>Entry type</span><SearchableSelect id={`live-event-${trip.id}`} value={logForm.event_type} onChange={(event_type) => setLogForm({ event_type, location_name: "", other_place: "", passengers_count: "", price_per_seat: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: logForm.recorded_at })} options={eventOptions} required placeholder="Search entry type" /></label>
                  {isOwnPlaceEvent && placeIsAutoFilled && (
                    <span style={{ alignSelf: "center", fontSize: "0.85rem", color: "var(--muted)" }}>
                      Place: <strong>{myCounterName || "no counter assigned"}</strong>
                    </span>
                  )}
                  {needsAdminPlacePicker && (
                    <>
                      <SearchableSelect id={`live-place-${trip.id}`} value={logForm.location_name} onChange={(location_name) => setLogForm({ ...logForm, location_name })} placeholder="Search place" options={[...places.map((p) => ({ value: p, label: p })), { value: OTHER_PLACE, label: "Other (exception)…" }]} />
                      {logForm.location_name === OTHER_PLACE && (
                        <input placeholder="Type the place" value={logForm.other_place}
                          onChange={(e) => setLogForm({ ...logForm, other_place: e.target.value })} />
                      )}
                    </>
                  )}
                  {needsPlainLocationText && (
                    <input placeholder="Place (e.g. Padma Pump)" value={logForm.location_name}
                      onChange={(e) => setLogForm({ ...logForm, location_name: e.target.value })} />
                  )}
                  {needsHotelDropdown && (
                    <SearchableSelect id={`live-hotel-${trip.id}`} value={logForm.location_name} onChange={(location_name) => setLogForm({ ...logForm, location_name })} placeholder="Search hotel" options={hotels.map((h) => ({ value: h.name, label: h.name }))} />
                  )}
                  {logForm.event_type === "fuel" && (
                    <>
                      <input placeholder="Liters" type="number" value={logForm.fuel_liters}
                        onChange={(e) => setLogForm({ ...logForm, fuel_liters: e.target.value })} />
                      <input placeholder="Cost (৳)" type="number" value={logForm.fuel_cost}
                        onChange={(e) => setLogForm({ ...logForm, fuel_cost: e.target.value })} />
                    </>
                  )}
                  {logForm.event_type === "passenger_count" && (
                    <input placeholder="Number of passengers" type="number" value={logForm.passengers_count}
                      onChange={(e) => setLogForm({ ...logForm, passengers_count: e.target.value })} />
                  )}
                  {logForm.event_type === "note" && (
                    <input placeholder="Note" value={logForm.note}
                      onChange={(e) => setLogForm({ ...logForm, note: e.target.value })} />
                  )}
                  {["exceptional_passenger_count", "additional_passenger_count"].includes(logForm.event_type) && <div className="paid-passenger-fields">
                    <div className="paid-passenger-heading"><div><span className="paid-passenger-kicker">CUSTOM FARE ENTRY</span><strong>{logForm.event_type === "additional_passenger_count" ? "Additional passenger" : "Exceptional passenger"}</strong><small>Set the passenger quantity and seat price for this entry.</small></div><span className="paid-passenger-total">৳{(Number(logForm.passengers_count || 0) * Number(logForm.price_per_seat || 0)).toLocaleString()}<small>Total</small></span></div>
                    <div className="paid-passenger-grid">
                      <label className="live-field"><span>Passengers</span><input required min="1" step="1" type="number" value={logForm.passengers_count} onChange={(e) => setLogForm({ ...logForm, passengers_count: e.target.value })} /></label>
                      <label className="live-field"><span>Seat price (৳)</span><input required min="0" step="0.01" type="number" value={logForm.price_per_seat ?? ""} onChange={(e) => setLogForm({ ...logForm, price_per_seat: e.target.value })} /></label>
                      <label className="live-field paid-passenger-description"><span>Description / passenger type{logForm.event_type === "exceptional_passenger_count" ? "" : " (optional)"}</span><input required={logForm.event_type === "exceptional_passenger_count"} value={logForm.note} onChange={(e) => setLogForm({ ...logForm, note: e.target.value })} /></label>
                    </div>
                  </div>}
                  {isAdmin && (
                    <label className="live-field"><span>Checkpoint date &amp; time</span><input type="datetime-local" step="1" required={historyMode} value={logForm.recorded_at} onChange={(e) => setLogForm({ ...logForm, recorded_at: e.target.value })} /><small>{historyMode ? "Required · choose the actual event date and time" : "Optional · leave blank to record now"}</small></label>
                  )}
                  <button className="primary" type="submit" disabled={Boolean(busy)} aria-busy={busy === `add:${trip.id}`}>{busy === `add:${trip.id}` ? "Adding entry…" : "Add entry"}</button>
                </form>}
                {error && <p className="error-text">{error}</p>}

                <div className="live-timeline-heading"><h4>Journey timeline</h4><span>Earliest to latest · {(logsByTrip[trip.id] || []).length} checkpoints</span></div>
                {logsLoading && <p role="status">Loading entries…</p>}
                <ol className="live-timeline" aria-label="Journey checkpoints in time order">
                    {chronologicalLogs(logsByTrip[trip.id] || [], trip.trip_date).map((l) => (
                      <li key={l.id} className="live-timeline-entry">
                        <div className="live-timeline-clock"><strong>{activityClock(l.recorded_at, trip.trip_date)}</strong><small>{activityDay(l.recorded_at, trip.trip_date)}</small></div>
                        <div className="live-timeline-detail">
                          <div className="live-timeline-event"><strong>{eventLabel[l.event_type] || l.event_type}</strong>{isAdmin && editingLogId !== l.id && <><button className="settings-edit-button" disabled={Boolean(busy)} onClick={() => startEditLogTime(l, trip)}>Edit entry</button><button className="link-danger" disabled={Boolean(busy)} onClick={() => removeLog(trip, l)}>Remove</button></>}</div>
                          {l.location_name && <p>{l.location_name}</p>}
                          {["exceptional_passenger_count", "additional_passenger_count"].includes(l.event_type) && <p>৳{Number(l.price_per_seat).toLocaleString()} per passenger · Total ৳{(Number(l.passengers_count) * Number(l.price_per_seat)).toLocaleString()}</p>}
                          <div className="live-checkpoint-facts">{l.fuel_liters != null && <span>{l.fuel_liters} L · ৳{l.fuel_cost || 0}</span>}{l.passengers_count != null && <span>{l.passengers_count} passengers</span>}{l.note && <span>{l.note}</span>}</div>
                          {editingLogId === l.id ? (
                            <form className="live-time-editor" onSubmit={(e) => { e.preventDefault(); saveLogTime(trip, l); }}>
                              <label className="live-field"><span>Entry type</span><SearchableSelect id={`edit-event-${l.id}`} required value={editExceptional.event_type} options={eventOptions} onChange={(event_type) => setEditExceptional({ ...editExceptional, event_type })} /></label>
                              <label className="live-field"><span>Checkpoint date &amp; time</span><input type="datetime-local" step="1" required value={editLogTime} onChange={(e) => setEditLogTime(e.target.value)} /></label>
                              <label className="live-field"><span>Location</span><input value={editExceptional.location_name} onChange={(e) => setEditExceptional({ ...editExceptional, location_name: e.target.value })} /></label>
                              {editExceptional.event_type === "passenger_count" && <label className="live-field"><span>Normal passengers</span><input required type="number" min="0" step="1" value={editExceptional.passengers_count} onChange={(e) => setEditExceptional({ ...editExceptional, passengers_count: e.target.value })} /></label>}
                              {editExceptional.event_type === "fuel" && <><label className="live-field"><span>Fuel (liters)</span><input required type="number" min="0" step="0.01" value={editExceptional.fuel_liters} onChange={(e) => setEditExceptional({ ...editExceptional, fuel_liters: e.target.value })} /></label><label className="live-field"><span>Fuel amount (BDT)</span><input required type="number" min="0" step="0.01" value={editExceptional.fuel_cost} onChange={(e) => setEditExceptional({ ...editExceptional, fuel_cost: e.target.value })} /></label></>}
                              {!["exceptional_passenger_count", "additional_passenger_count"].includes(editExceptional.event_type) && <label className="live-field"><span>Note</span><input value={editExceptional.note} onChange={(e) => setEditExceptional({ ...editExceptional, note: e.target.value })} /></label>}
                              {["exceptional_passenger_count", "additional_passenger_count"].includes(editExceptional.event_type) && <>
                                <label className="live-field"><span>Passengers</span><input required type="number" min="1" step="1" value={editExceptional.passengers_count} onChange={(e) => setEditExceptional({ ...editExceptional, passengers_count: e.target.value })} /></label>
                                <label className="live-field"><span>Seat price (৳)</span><input required type="number" min="0" step="0.01" value={editExceptional.price_per_seat} onChange={(e) => setEditExceptional({ ...editExceptional, price_per_seat: e.target.value })} /></label>
                                <label className="live-field"><span>Description{editExceptional.event_type === "additional_passenger_count" ? " (optional)" : ""}</span><input required={editExceptional.event_type !== "additional_passenger_count"} value={editExceptional.note} onChange={(e) => setEditExceptional({ ...editExceptional, note: e.target.value })} /></label>
                              </>}
                              <button className="primary" type="submit" disabled={Boolean(busy)} aria-busy={busy === `edit:${l.id}`}>{busy === `edit:${l.id}` ? "Saving…" : t("save")}</button>
                              <button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setEditingLogId(null)}>{t("cancel")}</button>
                            </form>
                          ) : null}
                        </div>
                      </li>
                    ))}
                </ol>
                {!logsByTrip[trip.id]?.length && <p className="live-timeline-empty">No checkpoints recorded yet.</p>}
              </div>
            )}
          </article>
        ))}
        {historyMode && history.page_count > 1 && !historyLoading && <Pagination page={history.page} pageCount={history.page_count} onPageChange={(page) => { if (!busy) { closeEditors(); setHistoryPage(page); } }} label="historical journeys" />}
      </div>
    </div>
  );
}
