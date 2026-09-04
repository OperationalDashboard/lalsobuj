import { useEffect, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { busLabel } from "../busLabel.js";
import { t } from "../i18n.js";

const today = () => new Date().toISOString().slice(0, 10);

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
  ],
  [ROLES.ADMIN]: [
    { value: "stop_arrival", label: "Arrived at stop" },
    { value: "stop_departure", label: "Left stop" },
    { value: "hotel_break", label: "Hotel break" },
    { value: "fuel", label: "Fuel taken" },
    { value: "passenger_count", label: "Passenger count" },
    { value: "note", label: "Note" },
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
  const [rotationCounts, setRotationCounts] = useState([]);
  const [rotationPage, setRotationPage] = useState(1);
  const [startForm, setStartForm] = useState(startEmpty);
  const [error, setError] = useState("");

  const [openTripId, setOpenTripId] = useState(null);
  const [logForm, setLogForm] = useState(() => ({
    event_type: eventOptions[0]?.value || "note",
    location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: "",
  }));
  const [logsByTrip, setLogsByTrip] = useState({});
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogTime, setEditLogTime] = useState("");

  // Inline "mark completed" time picker state, replacing a browser prompt()
  // so the arrival time is always chosen with a proper clock control.
  const [completingId, setCompletingId] = useState(null);
  const [completeTime, setCompleteTime] = useState("");
  const [editingTripTimeId, setEditingTripTimeId] = useState(null);
  const [editTripDeparture, setEditTripDeparture] = useState("");

  function load() {
    api.get("/buses").then(setBuses).catch(() => {});
    api.get("/hotels").then(setHotels).catch(() => {});
    api.get("/routes?active=1").then(setRoutesList).catch(() => {});
    api.get("/rotations").then((rows) => setOpenRotations(rows.filter((r) => !r.trip_id && r.status === "scheduled" && r.bus_status === "active"))).catch(() => {});
    api.get("/trips/live").then(setLiveTrips).catch(() => {});
    api.get(`/trips/rotation-counts?date=${today()}`).then((r) => setRotationCounts(r.buses)).catch(() => {});
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

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

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
    try {
      await api.post("/trips", {
        ...startForm,
        trip_date: today(),
        price_per_seat: startForm.price_per_seat ? Number(startForm.price_per_seat) : null,
      });
      setStartForm(startEmpty);
      load();
    } catch (err) {
      setError(err.message);
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
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLiveTrip(trip) {
    if (!confirm(`Remove ${busLabel(trip)}'s running trip?`)) return;
    try { await api.del(`/trips/${trip.id}`); load(); } catch (err) { setError(err.message); }
  }

  // Admin/Super Admin only: give or edit a trip's departure time directly,
  // any time — not just while starting or completing it.
  function openTripTimeEdit(trip) {
    setEditingTripTimeId(trip.id);
    setEditTripDeparture(trip.departure_time || "");
  }
  async function saveTripTime(trip) {
    try {
      await api.put(`/trips/${trip.id}/time`, { departure_time: editTripDeparture || null });
      setEditingTripTimeId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleTrip(tripId) {
    if (openTripId === tripId) { setOpenTripId(null); return; }
    setOpenTripId(tripId);
    setLogForm({ event_type: eventOptions[0]?.value || "note", location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: "" });
    api.get(`/activity-logs?trip_id=${tripId}`).then((rows) =>
      setLogsByTrip((prev) => ({ ...prev, [tripId]: rows }))
    );
  }

  async function handleAddLog(e, trip) {
    e.preventDefault();
    setError("");
    const location_name = logForm.location_name === OTHER_PLACE ? logForm.other_place : logForm.location_name;
    try {
      await api.post("/activity-logs", {
        trip_id: trip.id,
        bus_id: trip.bus_id,
        event_type: logForm.event_type,
        location_name: location_name || null,
        passengers_count: logForm.passengers_count ? Number(logForm.passengers_count) : null,
        fuel_liters: logForm.fuel_liters ? Number(logForm.fuel_liters) : null,
        fuel_cost: logForm.fuel_cost ? Number(logForm.fuel_cost) : null,
        note: logForm.note || null,
        recorded_at: isAdmin && logForm.recorded_at ? logForm.recorded_at : undefined,
      });
      setLogForm({ ...logForm, location_name: "", other_place: "", passengers_count: "", fuel_liters: "", fuel_cost: "", note: "", recorded_at: "" });
      const rows = await api.get(`/activity-logs?trip_id=${trip.id}`);
      setLogsByTrip((prev) => ({ ...prev, [trip.id]: rows }));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Admin/Super Admin only: edit the recorded time of any past checkpoint entry.
  function startEditLogTime(log) {
    setEditingLogId(log.id);
    setEditLogTime(new Date(log.recorded_at).toTimeString().slice(0, 5));
  }
  async function saveLogTime(trip, log) {
    try {
      const datePart = log.recorded_at.slice(0, 10);
      await api.put(`/activity-logs/${log.id}`, { recorded_at: `${datePart} ${editLogTime}:00` });
      setEditingLogId(null);
      const rows = await api.get(`/activity-logs?trip_id=${trip.id}`);
      setLogsByTrip((prev) => ({ ...prev, [trip.id]: rows }));
    } catch (err) {
      setError(err.message);
    }
  }

  const isOwnPlaceEvent = logForm.event_type === "stop_arrival" || logForm.event_type === "stop_departure";
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

      {canStartTrip && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t("start_a_trip")}</h3>
          <form className="form-row" onSubmit={handleStartTrip}>
            <select value={startForm.rotation_id} onChange={(e) => setStartForm({ ...startForm, rotation_id: e.target.value })}>
              <option value="">Select open rotation</option>
              {openRotations.filter((r) => ![ROLES.DRIVER, ROLES.HELPER].includes(role) || String(r.bus_id) === String(myAssignedBus?.assigned_bus_id)).map((r) => (
                <option key={r.id} value={r.id}>{busLabel(r)} — {r.route || "no route"} — {r.duty_date}</option>
              ))}
            </select>
            <input type="time" value={startForm.departure_time} title={t("departure_time")} required
              onChange={(e) => setStartForm({ ...startForm, departure_time: e.target.value })} />
            <input placeholder={t("price_per_seat")} type="number" value={startForm.price_per_seat}
              onChange={(e) => setStartForm({ ...startForm, price_per_seat: e.target.value })} />
            <button className="primary" type="submit">{t("bus_left_counter")}</button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "6px 0 0" }}>
            {t("price_used_by_accounts")}
          </p>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
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
          <div>
            <button className="secondary" type="button" disabled={currentRotationPage === 1} onClick={() => setRotationPage((page) => Math.max(1, page - 1))}>Previous</button>
            <strong>Page {currentRotationPage} of {rotationPageCount}</strong>
            <button className="secondary" type="button" disabled={currentRotationPage === rotationPageCount} onClick={() => setRotationPage((page) => Math.min(rotationPageCount, page + 1))}>Next</button>
          </div>
        </div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t("trips_on_the_road")}</h3>
        {liveTrips.length === 0 && <p style={{ color: "var(--muted)" }}>{t("no_trips_running")}</p>}
        {liveTrips.map((trip) => (
          <div key={trip.id} style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{busLabel(trip)}</strong> — Rotation #{trip.rotation_no} ({trip.leg_no === 2 ? t("leg2") : t("leg1")}) — {trip.route || "no route set"}
                {trip.price_per_seat ? ` — ৳${trip.price_per_seat}/seat` : ""}
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  {editingTripTimeId === trip.id ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      Departed <input type="time" value={editTripDeparture} onChange={(e) => setEditTripDeparture(e.target.value)} />
                      <button className="primary" style={{ padding: "2px 8px" }} onClick={() => saveTripTime(trip)}>{t("save")}</button>
                      <button className="link-danger" style={{ padding: "2px 8px" }} onClick={() => setEditingTripTimeId(null)}>{t("cancel")}</button>
                    </span>
                  ) : (
                    <>
                      Departed {trip.departure_time || "—"}
                      {isAdmin && <button className="link-danger" style={{ marginLeft: 6, fontSize: "0.78rem" }} onClick={() => openTripTimeEdit(trip)}>✎ edit time</button>}
                    </>
                  )}
                  {" "}· Last update: {trip.last_event ? `${eventLabel[trip.last_event]}${trip.last_location ? " @ " + trip.last_location : ""}` : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isAdmin && <button className="link-danger" onClick={() => removeLiveTrip(trip)}>Remove trip</button>}
                {canLogAnything && (
                  <button className="primary" onClick={() => toggleTrip(trip.id)}>
                    {openTripId === trip.id ? t("hide_log") : t("log_checkpoint")}
                  </button>
                )}
                {canCompleteTrip && (
                  <button className="link-danger" onClick={() => openCompleteFor(trip)}>{t("mark_completed")}</button>
                )}
              </div>
            </div>

            {completingId === trip.id && (
              <form className="form-row" onSubmit={(e) => submitComplete(e, trip)} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <input type="time" value={completeTime} onChange={(e) => setCompleteTime(e.target.value)} />
                <button className="primary" type="submit">{t("confirm_arrival")}</button>
                <button type="button" className="link-danger" onClick={() => setCompletingId(null)}>{t("cancel")}</button>
              </form>
            )}

            {openTripId === trip.id && canLogAnything && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <form className="form-row" onSubmit={(e) => handleAddLog(e, trip)}>
                  <select value={logForm.event_type} onChange={(e) => setLogForm({ ...logForm, event_type: e.target.value })}>
                    {eventOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  {isOwnPlaceEvent && placeIsAutoFilled && (
                    <span style={{ alignSelf: "center", fontSize: "0.85rem", color: "var(--muted)" }}>
                      Place: <strong>{myCounterName || "no counter assigned"}</strong>
                    </span>
                  )}
                  {needsAdminPlacePicker && (
                    <>
                      <select value={logForm.location_name} onChange={(e) => setLogForm({ ...logForm, location_name: e.target.value })}>
                        <option value="">Select place</option>
                        {places.map((p) => <option key={p} value={p}>{p}</option>)}
                        <option value={OTHER_PLACE}>Other (exception)…</option>
                      </select>
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
                    <select value={logForm.location_name} onChange={(e) => setLogForm({ ...logForm, location_name: e.target.value })}>
                      <option value="">Select hotel</option>
                      {hotels.map((h) => <option key={h.id} value={h.name}>{h.name}</option>)}
                    </select>
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
                  {isAdmin && (
                    <input type="time" title="Set a specific time for this entry (optional — defaults to now)" value={logForm.recorded_at}
                      onChange={(e) => setLogForm({ ...logForm, recorded_at: e.target.value })} />
                  )}
                  <button className="primary" type="submit">Add entry</button>
                </form>
                {error && <p className="error-text">{error}</p>}

                <table>
                  <thead><tr><th>Time</th><th>Event</th><th>Details</th>{isAdmin && <th></th>}</tr></thead>
                  <tbody>
                    {(logsByTrip[trip.id] || []).map((l) => (
                      <tr key={l.id}>
                        <td>
                          {editingLogId === l.id ? (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <input type="time" value={editLogTime} onChange={(e) => setEditLogTime(e.target.value)} />
                              <button className="primary" style={{ padding: "2px 8px" }} onClick={() => saveLogTime(trip, l)}>{t("save")}</button>
                              <button className="link-danger" style={{ padding: "2px 8px" }} onClick={() => setEditingLogId(null)}>{t("cancel")}</button>
                            </span>
                          ) : (
                            <>
                              {new Date(l.recorded_at).toLocaleTimeString()}
                              {isAdmin && <button className="link-danger" style={{ marginLeft: 6, fontSize: "0.78rem" }} onClick={() => startEditLogTime(l)}>✎</button>}
                            </>
                          )}
                        </td>
                        <td>{eventLabel[l.event_type]}</td>
                        <td>
                          {l.location_name && `${l.location_name} `}
                          {l.fuel_liters ? `${l.fuel_liters}L / ৳${l.fuel_cost || 0} ` : ""}
                          {l.passengers_count ? `${l.passengers_count} passengers ` : ""}
                          {l.note}
                        </td>
                      </tr>
                    ))}
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
