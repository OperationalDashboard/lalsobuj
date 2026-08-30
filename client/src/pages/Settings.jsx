import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const DEFAULT_BUS_CLASSES = ["AC", "Non AC", "Sleeper"];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [colors, setColors] = useState({ theme_primary_color: "#046a38", theme_accent_color: "#d21f3c" });
  const [callContact, setCallContact] = useState({ dedicated_call_name: "", dedicated_call_phone: "" });
  const [loginLook, setLoginLook] = useState({ app_name: "Lal Sabuj Paribahan", login_logo_data: "", login_background_data: "" });
  const [savedMsg, setSavedMsg] = useState("");
  const [busClasses, setBusClasses] = useState(DEFAULT_BUS_CLASSES);
  const [newBusClass, setNewBusClass] = useState("");

  const [hotels, setHotels] = useState([]);
  const [newHotel, setNewHotel] = useState("");

  const [parts, setParts] = useState([]);
  const [newPart, setNewPart] = useState({ name: "", description: "" });

  const [discountTypes, setDiscountTypes] = useState([]);
  const [newDiscountType, setNewDiscountType] = useState("");

  const [expensePlaces, setExpensePlaces] = useState([]);
  const [counters, setCounters] = useState([]);
  const [newPlace, setNewPlace] = useState("");
  const [existingCounterIds, setExistingCounterIds] = useState([]);
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [placeEdit, setPlaceEdit] = useState({ name: "", counterIds: [] });
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState("");

  function loadSettings() {
    api.get("/settings").then((s) => {
      setSettings(s);
      setColors({ theme_primary_color: s.theme_primary_color, theme_accent_color: s.theme_accent_color });
      setCallContact({ dedicated_call_name: s.dedicated_call_name, dedicated_call_phone: s.dedicated_call_phone });
      setLoginLook({ app_name: s.app_name || "Lal Sabuj Paribahan", login_logo_data: s.login_logo_data || "", login_background_data: s.login_background_data || "" });
      try {
        const parsed = JSON.parse(s.bus_class_types || "null");
        setBusClasses(Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BUS_CLASSES);
      } catch {
        setBusClasses(DEFAULT_BUS_CLASSES);
      }
    });
  }
  function loadHotels() { api.get("/hotels").then(setHotels); }
  function loadParts() { api.get("/maintenance/parts-catalog").then(setParts); }
  function loadLocations() { api.get("/maintenance/locations").then(setLocations); }
  function loadDiscountTypes() { api.get("/discount-types").then(setDiscountTypes); }
  function loadPlaceSettings() { api.get("/accounts/expense-places").then(setExpensePlaces); api.get("/counters").then(setCounters); }

  useEffect(() => { loadSettings(); loadHotels(); loadParts(); loadDiscountTypes(); loadPlaceSettings(); loadLocations(); }, []);

  async function saveAppearance(e) {
    e.preventDefault();
    await api.put("/settings", colors);
    document.documentElement.style.setProperty("--green", colors.theme_primary_color);
    document.documentElement.style.setProperty("--green-dark", colors.theme_primary_color);
    document.documentElement.style.setProperty("--red", colors.theme_accent_color);
    setSavedMsg("Appearance saved.");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  async function saveCallContact(e) {
    e.preventDefault();
    await api.put("/settings", callContact);
    setSavedMsg("Call contact saved.");
    setTimeout(() => setSavedMsg(""), 2000);
  }
  async function readLoginFile(field, file) {
    if (!file) return;
    const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
    setLoginLook((current) => ({ ...current, [field]: data }));
  }
  async function saveLoginLook(e) {
    e.preventDefault();
    await api.put("/settings", loginLook);
    setSavedMsg("Login branding saved."); setTimeout(() => setSavedMsg(""), 2000);
  }

  async function addBusClass(e) {
    e.preventDefault();
    const className = newBusClass.trim();
    if (!className || busClasses.some((item) => item.toLowerCase() === className.toLowerCase())) return;
    const next = [...busClasses, className];
    await api.put("/settings", { bus_class_types: JSON.stringify(next) });
    setBusClasses(next); setNewBusClass("");
    setSavedMsg("Bus classes saved."); setTimeout(() => setSavedMsg(""), 2000);
  }
  async function removeBusClass(className) {
    const next = busClasses.filter((item) => item !== className);
    await api.put("/settings", { bus_class_types: JSON.stringify(next) });
    setBusClasses(next);
    setSavedMsg("Bus classes saved."); setTimeout(() => setSavedMsg(""), 2000);
  }

  async function addHotel(e) {
    e.preventDefault();
    if (!newHotel.trim()) return;
    await api.post("/hotels", { name: newHotel.trim() });
    setNewHotel("");
    loadHotels();
  }
  async function removeHotel(id) {
    await api.del(`/hotels/${id}`);
    loadHotels();
  }

  async function addPart(e) {
    e.preventDefault();
    if (!newPart.name.trim()) return;
    await api.post("/maintenance/parts-catalog", { part_name: newPart.name.trim(), description: newPart.description.trim() });
    setNewPart({ name: "", description: "" });
    loadParts();
  }
  async function removePart(id) {
    await api.del(`/maintenance/parts-catalog/${id}`);
    loadParts();
  }

  async function addDiscountType(e) {
    e.preventDefault();
    if (!newDiscountType.trim()) return;
    await api.post("/discount-types", { name: newDiscountType.trim() });
    setNewDiscountType("");
    loadDiscountTypes();
  }
  async function removeDiscountType(id) {
    await api.del(`/discount-types/${id}`);
    loadDiscountTypes();
  }

  async function addExpensePlace(e) {
    e.preventDefault();
    if (!newPlace.trim()) return;
    const place = await api.post("/accounts/expense-places", { name: newPlace.trim() });
    await Promise.all(existingCounterIds.map((id) => api.put(`/counters/${id}`, { place_id: place.id })));
    setNewPlace("");
    setExistingCounterIds([]);
    loadPlaceSettings();
  }
  function toggleNewPlaceCounter(counterId) {
    const id = String(counterId);
    setExistingCounterIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleEditedPlaceCounter(counterId) {
    const id = String(counterId);
    setPlaceEdit((current) => ({
      ...current,
      counterIds: current.counterIds.includes(id) ? current.counterIds.filter((item) => item !== id) : [...current.counterIds, id],
    }));
  }
  async function removeExpensePlace(place) {
    if (!confirm(`Remove place '${place.name}'? Its counters will remain but no longer belong to this place. Existing account history is kept.`)) return;
    await api.del(`/accounts/expense-places/${place.id}`);
    loadPlaceSettings();
  }
  function startPlaceEdit(place) {
    setEditingPlaceId(place.id);
    setPlaceEdit({ name: place.name, counterIds: counters.filter((counter) => counter.place_id === place.id).map((counter) => String(counter.id)) });
  }
  async function savePlaceEdit(place) {
    if (!placeEdit.name.trim()) return;
    await api.put(`/accounts/expense-places/${place.id}`, { name: placeEdit.name.trim() });
    await Promise.all(counters.map((counter) => {
      const shouldBelong = placeEdit.counterIds.includes(String(counter.id));
      if (shouldBelong && counter.place_id !== place.id) return api.put(`/counters/${counter.id}`, { place_id: place.id });
      if (!shouldBelong && counter.place_id === place.id) return api.put(`/counters/${counter.id}`, { place_id: null });
      return null;
    }).filter(Boolean));
    setEditingPlaceId(null);
    loadPlaceSettings();
  }
  async function addLocation(e) {
    e.preventDefault(); if (!newLocation.trim()) return;
    await api.post("/maintenance/locations", { name: newLocation.trim() });
    setNewLocation(""); loadLocations();
  }
  async function removeLocation(id) { await api.del(`/maintenance/locations/${id}`); loadLocations(); }

  if (!settings) return null;
  const unassignedCounters = counters.filter((counter) => !counter.place_id);
  const assignedCounterCount = counters.length - unassignedCounters.length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Website appearance, favourite hotels, trackable parts, and the dedicated call contact</p>
        </div>
      </div>

      {savedMsg && <p style={{ color: "var(--green)", fontWeight: 600 }}>{savedMsg}</p>}

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Appearance</h3>
          <form onSubmit={saveAppearance}>
            <div className="form-row">
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", color: "var(--muted)" }}>
                Primary color
                <input type="color" value={colors.theme_primary_color}
                  onChange={(e) => setColors({ ...colors, theme_primary_color: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", color: "var(--muted)" }}>
                Accent color
                <input type="color" value={colors.theme_accent_color}
                  onChange={(e) => setColors({ ...colors, theme_accent_color: e.target.value })} />
              </label>
            </div>
            <button className="primary" type="submit">Save appearance</button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dedicated call contact</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Shown as a "Call" button in everyone's Chat Box.</p>
          <form onSubmit={saveCallContact}>
            <div className="form-row">
              <input placeholder="Name" value={callContact.dedicated_call_name}
                onChange={(e) => setCallContact({ ...callContact, dedicated_call_name: e.target.value })} />
              <input placeholder="Phone number" value={callContact.dedicated_call_phone}
                onChange={(e) => setCallContact({ ...callContact, dedicated_call_phone: e.target.value })} />
            </div>
            <button className="primary" type="submit">Save contact</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Login branding</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Upload a logo for the login heading and an optional background image. Images are stored in the app settings.</p>
        <form className="form-row" onSubmit={saveLoginLook}>
          <input placeholder="Company name" value={loginLook.app_name} onChange={(e) => setLoginLook({ ...loginLook, app_name: e.target.value })} />
          <label>Logo <input type="file" accept="image/*" onChange={(e) => readLoginFile("login_logo_data", e.target.files?.[0])} /></label>
          <label>Background <input type="file" accept="image/*" onChange={(e) => readLoginFile("login_background_data", e.target.files?.[0])} /></label>
          {loginLook.login_logo_data && <img src={loginLook.login_logo_data} alt="Logo preview" style={{ width: 48, height: 48, objectFit: "contain" }} />}
          <button className="primary" type="submit">Save login branding</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Bus class types</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>AC, Non AC, and Sleeper are built in. Add more classes here; custom classes can be removed without changing existing buses.</p>
        <form className="form-row" onSubmit={addBusClass}>
          <input placeholder="New class (e.g. Business Class)" value={newBusClass} onChange={(e) => setNewBusClass(e.target.value)} />
          <button className="primary" type="submit">Add class</button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {busClasses.map((className) => <span key={className} className="badge active">{className}{!DEFAULT_BUS_CLASSES.includes(className) && <> <button className="link-danger" onClick={() => removeBusClass(className)}>Remove</button></>}</span>)}
          {busClasses.length === 0 && <span style={{ color: "var(--muted)" }}>No bus classes configured.</span>}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Favourite hotels (Hotel Break list)</h3>
          <form className="form-row" onSubmit={addHotel}>
            <input placeholder="Hotel name" value={newHotel} onChange={(e) => setNewHotel(e.target.value)} />
            <button className="primary" type="submit">Add</button>
          </form>
          <table>
            <tbody>
              {hotels.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td style={{ textAlign: "right" }}><button className="link-danger" onClick={() => removeHotel(h.id)}>Remove</button></td>
                </tr>
              ))}
              {hotels.length === 0 && <tr><td>No hotels added yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Trackable parts catalog</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Used in Maintenance so part names stay consistent (e.g. Wheel, Engine Oil, Air Filter).</p>
          <form className="form-row" onSubmit={addPart}>
            <input placeholder="Part name" value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} />
            <input placeholder="Description (optional)" value={newPart.description} onChange={(e) => setNewPart({ ...newPart, description: e.target.value })} />
            <button className="primary" type="submit">Add</button>
          </form>
          <table>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.part_name}</strong>{p.description && <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.description}</div>}</td>
                  <td style={{ textAlign: "right" }}><button className="link-danger" onClick={() => removePart(p.id)}>Remove</button></td>
                </tr>
              ))}
              {parts.length === 0 && <tr><td>No parts added yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Income deduction types</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Options like Online or VIP that subtract from a ticket-sales entry's income in Accounts.</p>
        <form className="form-row" onSubmit={addDiscountType}>
          <input placeholder="Deduction type (e.g. Online)" value={newDiscountType} onChange={(e) => setNewDiscountType(e.target.value)} />
          <button className="primary" type="submit">Add</button>
        </form>
        <table>
          <tbody>
            {discountTypes.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td style={{ textAlign: "right" }}><button className="link-danger" onClick={() => removeDiscountType(d.id)}>Remove</button></td>
              </tr>
            ))}
            {discountTypes.length === 0 && <tr><td>No deduction types added yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card place-setup-card" style={{ marginTop: 20 }}>
        <div className="place-setup-header">
          <div>
            <span className="settings-eyebrow">ACCOUNTS STRUCTURE</span>
            <h3>Place &amp; counter setup</h3>
            <p>Create a parent place, then choose which counters operate under it. These groups are used in Place-wise Accounts and staff cover rules.</p>
          </div>
          <div className="place-setup-stats" aria-label="Place and counter summary">
            <span><strong>{expensePlaces.length}</strong> Places</span>
            <span><strong>{assignedCounterCount}</strong> Assigned</span>
            <span className={unassignedCounters.length ? "needs-attention" : ""}><strong>{unassignedCounters.length}</strong> Unassigned</span>
          </div>
        </div>

        <section className="place-create-panel">
          <div className="place-section-title">
            <span className="place-step">1</span>
            <div><strong>Create a parent place</strong><small>For example: Dhaka, Cumilla, or Chattogram</small></div>
          </div>
          <form className="place-create-form" onSubmit={addExpensePlace}>
            <label className="place-name-field">
              <span>Place name</span>
              <input placeholder="Enter place name" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} />
            </label>
            <div className="counter-picker">
              <div className="counter-picker-heading">
                <div><strong>Assign available counters</strong><small>Optional — tap any counter to select it</small></div>
                <span>{existingCounterIds.length} selected</span>
              </div>
              <div className="counter-option-grid">
                {unassignedCounters.map((counter) => {
                  const selected = existingCounterIds.includes(String(counter.id));
                  return <label key={counter.id} className={`counter-option${selected ? " selected" : ""}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleNewPlaceCounter(counter.id)} />
                    <span className="counter-check" aria-hidden="true">✓</span>
                    <span><strong>{counter.name}</strong><small>{counter.location || "No location added"}</small></span>
                  </label>;
                })}
                {unassignedCounters.length === 0 && <div className="counter-picker-empty">All existing counters are already assigned. You can move them by editing a place below.</div>}
              </div>
            </div>
            <div className="place-create-actions">
              <button className="primary" type="submit" disabled={!newPlace.trim()}>Create place</button>
              <Link className="place-secondary-action" to="/counters">Manage counters</Link>
            </div>
          </form>
        </section>

        <div className="place-list-heading">
          <div className="place-section-title">
            <span className="place-step">2</span>
            <div><strong>Review existing places</strong><small>Edit a place to move, add, or remove counters</small></div>
          </div>
        </div>

        <div className="place-card-grid">
          {expensePlaces.map((place) => {
            const placeCounters = counters.filter((counter) => counter.place_id === place.id);
            if (editingPlaceId === place.id) return <article key={place.id} className="place-card editing">
              <div className="place-card-edit-heading">
                <div><span className="place-card-icon" aria-hidden="true">⌖</span><strong>Edit place</strong></div>
                <button type="button" className="place-close-button" aria-label="Cancel editing" onClick={() => setEditingPlaceId(null)}>×</button>
              </div>
              <label className="place-name-field">
                <span>Place name</span>
                <input value={placeEdit.name} onChange={(e) => setPlaceEdit({ ...placeEdit, name: e.target.value })} />
              </label>
              <div className="counter-picker compact">
                <div className="counter-picker-heading">
                  <div><strong>Counters in this place</strong><small>Selecting a counter from another place will move it here</small></div>
                  <span>{placeEdit.counterIds.length} selected</span>
                </div>
                <div className="counter-option-grid">
                  {counters.map((counter) => {
                    const selected = placeEdit.counterIds.includes(String(counter.id));
                    return <label key={counter.id} className={`counter-option${selected ? " selected" : ""}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleEditedPlaceCounter(counter.id)} />
                      <span className="counter-check" aria-hidden="true">✓</span>
                      <span><strong>{counter.name}</strong><small>{counter.place_id === place.id ? "Currently here" : counter.place_name ? `Currently in ${counter.place_name}` : "Unassigned"}</small></span>
                    </label>;
                  })}
                  {counters.length === 0 && <div className="counter-picker-empty">No counters have been created yet.</div>}
                </div>
              </div>
              <div className="place-card-actions">
                <button type="button" className="primary" disabled={!placeEdit.name.trim()} onClick={() => savePlaceEdit(place)}>Save changes</button>
                <button type="button" className="place-secondary-action" onClick={() => setEditingPlaceId(null)}>Cancel</button>
              </div>
            </article>;

            return <article key={place.id} className="place-card">
              <div className="place-card-header">
                <div className="place-card-title">
                  <span className="place-card-icon" aria-hidden="true">⌖</span>
                  <div><h4>{place.name}</h4><span>{placeCounters.length} counter{placeCounters.length === 1 ? "" : "s"}</span></div>
                </div>
                <div className="place-card-menu">
                  <button type="button" onClick={() => startPlaceEdit(place)}>Edit</button>
                  <button type="button" className="danger" onClick={() => removeExpensePlace(place)}>Remove</button>
                </div>
              </div>
              <div className="place-counter-list">
                {placeCounters.map((counter) => <span key={counter.id} className="place-counter-chip"><span aria-hidden="true">●</span>{counter.name}</span>)}
                {placeCounters.length === 0 && <div className="place-empty-state"><strong>No counters assigned</strong><span>Use Edit to add an existing counter.</span></div>}
              </div>
            </article>;
          })}
          {expensePlaces.length === 0 && <div className="place-list-empty"><span aria-hidden="true">⌖</span><strong>No places yet</strong><p>Create your first parent place above to organize counters and accounts.</p></div>}
        </div>

        {unassignedCounters.length > 0 && <div className="unassigned-counter-note">
          <div><strong>{unassignedCounters.length} counter{unassignedCounters.length === 1 ? " is" : "s are"} still unassigned</strong><span>{unassignedCounters.map((counter) => counter.name).join(", ")}</span></div>
          <span>Assign them when creating or editing a place.</span>
        </div>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Places where repair happens</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>These places are available when logging bus maintenance.</p>
        <form className="form-row" onSubmit={addLocation}><input placeholder="Repair location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} /><button className="primary" type="submit">Add place</button></form>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{locations.map((location) => <span key={location.id} className="badge">{location.name} <button className="link-danger" onClick={() => removeLocation(location.id)}>Remove</button></span>)}{locations.length === 0 && <span style={{ color: "var(--muted)" }}>No repair places added yet.</span>}</div>
      </div>
    </div>
  );
}
