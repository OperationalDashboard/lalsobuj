import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [colors, setColors] = useState({ theme_primary_color: "#046a38", theme_accent_color: "#d21f3c" });
  const [callContact, setCallContact] = useState({ dedicated_call_name: "", dedicated_call_phone: "" });
  const [loginLook, setLoginLook] = useState({ app_name: "Lal Sabuj Paribahan", login_logo_data: "", login_background_data: "" });
  const [savedMsg, setSavedMsg] = useState("");

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

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Place and counter setup</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Create parent places for Place-wise Accounts, then optionally group existing counters under the correct place. Income and expenses are entered later from Accounts.</p>
        <form className="form-row" onSubmit={addExpensePlace}>
          <input placeholder="Parent place name (e.g. Dhaka)" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} />
          <select multiple value={existingCounterIds} onChange={(e) => setExistingCounterIds([...e.target.selectedOptions].map((option) => option.value))} title="Optional: assign existing counters under this place">
            {counters.filter((counter) => !counter.place_id).map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}
          </select>
          <button className="primary" type="submit">Add parent place</button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: 0 }}>Use Ctrl (or Cmd) to select more than one existing counter. Counters can also be created from the Counters page.</p>
        <table>
          <thead><tr><th>Parent place</th><th>Counters</th><th></th></tr></thead>
          <tbody>
            {expensePlaces.map((place) => editingPlaceId === place.id ? <tr key={place.id}><td><input value={placeEdit.name} onChange={(e) => setPlaceEdit({ ...placeEdit, name: e.target.value })} /></td><td><select multiple value={placeEdit.counterIds} onChange={(e) => setPlaceEdit({ ...placeEdit, counterIds: [...e.target.selectedOptions].map((option) => option.value) })}>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select></td><td style={{ textAlign: "right" }}><button className="primary" onClick={() => savePlaceEdit(place)}>Save</button> <button className="link-danger" onClick={() => setEditingPlaceId(null)}>Cancel</button></td></tr> : <tr key={place.id}><td>{place.name}</td><td>{counters.filter((counter) => counter.place_id === place.id).map((counter) => counter.name).join(", ") || "No counter assigned"}</td><td style={{ textAlign: "right" }}><button className="link-danger" onClick={() => startPlaceEdit(place)}>Edit</button> <button className="link-danger" onClick={() => removeExpensePlace(place)}>Remove place</button></td></tr>)}
            {expensePlaces.length === 0 && <tr><td colSpan={3}>No parent places added yet.</td></tr>}
          </tbody>
        </table>
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
