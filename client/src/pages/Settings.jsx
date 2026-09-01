import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../api.js";
import { APP_RELEASE, APP_REVISION, APP_VERSION, clearAppCacheAndRefresh } from "../version.js";
import { canUseFeature } from "../permissions.js";

const DEFAULT_BUS_CLASSES = ["AC", "Non AC", "Sleeper"];
const DEFAULT_BUS_CATEGORIES = ["Economy (AC)", "Economy (NON AC)", "Suite-Class AC (AC)", "Sleeper (AC)"];

export default function Settings() {
  const user = getUser();
  const canWrite = canUseFeature(user, "settings", "write");
  const [settings, setSettings] = useState(null);
  const [colors, setColors] = useState({ theme_primary_color: "#046a38", theme_accent_color: "#d21f3c" });
  const [callContact, setCallContact] = useState({ dedicated_call_name: "", dedicated_call_phone: "" });
  const [loginLook, setLoginLook] = useState({ app_name: "Lal Sabuj Paribahan", login_logo_data: "", login_background_data: "" });
  const [savedMsg, setSavedMsg] = useState("");
  const [busClasses, setBusClasses] = useState(DEFAULT_BUS_CLASSES);
  const [newBusClass, setNewBusClass] = useState("");
  const [busCategories, setBusCategories] = useState(DEFAULT_BUS_CATEGORIES);
  const [newBusCategory, setNewBusCategory] = useState("");

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
  const [editingItem, setEditingItem] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  function loadSettings() {
    api.get("/settings").then((s) => {
      setSettings(s);
      setColors({ theme_primary_color: s.theme_primary_color, theme_accent_color: s.theme_accent_color });
      setCallContact({ dedicated_call_name: s.dedicated_call_name, dedicated_call_phone: s.dedicated_call_phone });
      setLoginLook({ app_name: s.app_name || "Lal Sabuj Paribahan", login_logo_data: s.login_logo_data || "", login_background_data: s.login_background_data || "" });
      try {
        const parsed = JSON.parse(s.bus_class_types || "null");
        setBusClasses(Array.isArray(parsed) ? parsed : DEFAULT_BUS_CLASSES);
      } catch {
        setBusClasses(DEFAULT_BUS_CLASSES);
      }
      try {
        const parsed = JSON.parse(s.bus_categories || "null");
        setBusCategories(Array.isArray(parsed) ? parsed : DEFAULT_BUS_CATEGORIES);
      } catch {
        setBusCategories(DEFAULT_BUS_CATEGORIES);
      }
    });
  }
  function loadHotels() { api.get("/hotels").then(setHotels); }
  function loadParts() { api.get("/maintenance/parts-catalog").then(setParts); }
  function loadLocations() { api.get("/maintenance/locations").then(setLocations); }
  function loadDiscountTypes() { api.get("/discount-types").then(setDiscountTypes); }
  function loadPlaceSettings() { api.get("/accounts/expense-places").then(setExpensePlaces); api.get("/counters").then(setCounters); }

  useEffect(() => { loadSettings(); loadHotels(); loadParts(); loadDiscountTypes(); loadPlaceSettings(); loadLocations(); }, []);

  function flashMessage(message) {
    setSavedMsg(message);
    setTimeout(() => setSavedMsg(""), 2600);
  }

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
    if (!confirm(`Remove '${className}' from the bus class choices? Existing buses will keep the class as historical data.`)) return;
    if (canWrite) {
      const result = await api.put("/settings/bus-classes", { action: "remove", currentName: className });
      setBusClasses(result.bus_classes);
      flashMessage(result.buses_using_removed_class
        ? `Class removed from choices. ${result.buses_using_removed_class} existing bus record(s) kept it as legacy data.`
        : "Bus class removed.");
      return;
    }
    const next = busClasses.filter((item) => item !== className);
    await api.put("/settings", { bus_class_types: JSON.stringify(next) });
    setBusClasses(next);
    flashMessage("Bus classes saved.");
  }

  async function saveBusClass(className) {
    const newName = editingItem?.value?.trim();
    if (!newName) return;
    const result = await api.put("/settings/bus-classes", { action: "rename", currentName: className, newName });
    setBusClasses(result.bus_classes);
    setEditingItem(null);
    flashMessage(result.updated_buses ? `Bus class renamed on ${result.updated_buses} bus record(s).` : "Bus class renamed.");
  }

  async function addBusCategory(e) {
    e.preventDefault();
    const categoryName = newBusCategory.trim();
    if (!categoryName || busCategories.some((item) => item.toLowerCase() === categoryName.toLowerCase())) return;
    const next = [...busCategories, categoryName];
    await api.put("/settings", { bus_categories: JSON.stringify(next) });
    setBusCategories(next);
    setNewBusCategory("");
    flashMessage("Bus category added.");
  }

  async function removeBusCategory(categoryName) {
    if (!confirm(`Remove '${categoryName}' from the bus category choices? Existing buses will keep the category as historical data.`)) return;
    if (canWrite) {
      const result = await api.put("/settings/bus-categories", { action: "remove", currentName: categoryName });
      setBusCategories(result.bus_categories);
      flashMessage(result.buses_using_removed_category
        ? `Category removed from choices. ${result.buses_using_removed_category} existing bus record(s) kept it as legacy data.`
        : "Bus category removed.");
      return;
    }
    const next = busCategories.filter((item) => item !== categoryName);
    await api.put("/settings", { bus_categories: JSON.stringify(next) });
    setBusCategories(next);
    flashMessage("Bus category removed.");
  }

  async function saveBusCategory(categoryName) {
    const newName = editingItem?.value?.trim();
    if (!newName) return;
    const result = await api.put("/settings/bus-categories", { action: "rename", currentName: categoryName, newName });
    setBusCategories(result.bus_categories);
    setEditingItem(null);
    flashMessage(result.updated_buses ? `Bus category renamed on ${result.updated_buses} bus record(s).` : "Bus category renamed.");
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
  async function saveHotel(id) {
    const name = editingItem?.value?.trim();
    if (!name) return;
    const result = await api.put(`/hotels/${id}`, { name });
    setEditingItem(null); loadHotels();
    flashMessage(result.updated_logs ? `Hotel renamed in ${result.updated_logs} activity record(s).` : "Hotel renamed.");
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
  async function savePart(id) {
    const partName = editingItem?.value?.trim();
    if (!partName) return;
    const result = await api.put(`/maintenance/parts-catalog/${id}`, { part_name: partName, description: editingItem.description?.trim() || "" });
    setEditingItem(null); loadParts();
    flashMessage(result.updated_records ? `Part renamed in ${result.updated_records} maintenance record(s).` : "Part updated.");
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
  async function saveDiscountType(id) {
    const name = editingItem?.value?.trim();
    if (!name) return;
    const result = await api.put(`/discount-types/${id}`, { name });
    setEditingItem(null); loadDiscountTypes();
    flashMessage(result.updated_transactions ? `Deduction type renamed in ${result.updated_transactions} transaction(s).` : "Deduction type renamed.");
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
  async function saveLocation(id) {
    const name = editingItem?.value?.trim();
    if (!name) return;
    const result = await api.put(`/maintenance/locations/${id}`, { name });
    setEditingItem(null); loadLocations();
    flashMessage(result.updated_tickets ? `Repair place renamed in ${result.updated_tickets} maintenance ticket(s).` : "Repair place renamed.");
  }

  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(APP_RELEASE);
      flashMessage("Version copied.");
    } catch {
      flashMessage(APP_RELEASE);
    }
  }

  async function clearCache() {
    setClearingCache(true);
    try {
      await clearAppCacheAndRefresh();
    } catch {
      setClearingCache(false);
      flashMessage("Cache could not be cleared. Please refresh the page manually.");
    }
  }

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
      {canWrite && <div className="super-admin-control-note">
        <span aria-hidden="true">◆</span>
        <div><strong>Super Admin editing enabled</strong><p>You can rename every Settings list item. Linked records are updated automatically so reports keep their data.</p></div>
      </div>}

      <section className="card system-maintenance-card" aria-labelledby="system-maintenance-title">
        <div className="system-version-info">
          <span className="settings-eyebrow">SYSTEM &amp; UPDATES</span>
          <h3 id="system-maintenance-title">Version {APP_VERSION}</h3>
          <p>Build <strong>{APP_REVISION}</strong> identifies the exact update currently running.</p>
        </div>
        <div className="system-maintenance-actions">
          <button type="button" className="place-secondary-action" onClick={copyVersion}>Copy version</button>
          <button type="button" className="primary" disabled={clearingCache} onClick={clearCache}>{clearingCache ? "Clearing…" : "Clear cache & refresh"}</button>
        </div>
        <p className="system-cache-note">This refreshes website files only. Database records, uploaded settings, and your login stay safe.</p>
      </section>

      {!canWrite && <p className="permission-readonly-note">View-only access: settings are visible, but all configuration controls are locked.</p>}
      <fieldset className="permission-fieldset" disabled={!canWrite}>

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
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>Add classes for the Buses page. Super Admin can rename or remove any class; renaming also updates buses already using it.</p>
        <form className="form-row" onSubmit={addBusClass}>
          <input placeholder="New class (e.g. Business Class)" value={newBusClass} onChange={(e) => setNewBusClass(e.target.value)} />
          <button className="primary" type="submit">Add class</button>
        </form>
        <div className="settings-managed-list">
          {busClasses.map((className) => editingItem?.type === "busClass" && editingItem.id === className
            ? <div key={className} className="settings-managed-item editing">
              <input aria-label="Bus class name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} />
              <div className="settings-item-actions"><button type="button" className="primary" onClick={() => saveBusClass(className)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div>
            </div>
            : <div key={className} className="settings-managed-item">
              <div><strong>{className}</strong>{DEFAULT_BUS_CLASSES.includes(className) && <small>Original class</small>}</div>
              <div className="settings-item-actions">
                {canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "busClass", id: className, value: className })}>Edit</button>}
                {canWrite && <button type="button" className="link-danger" onClick={() => removeBusClass(className)}>Remove</button>}
              </div>
            </div>)}
          {busClasses.length === 0 && <div className="settings-list-empty">No bus classes configured. Add one above.</div>}
        </div>
      </div>

      <div className="card bus-category-settings" style={{ marginBottom: 20 }}>
        <div className="settings-card-heading">
          <div><span className="settings-eyebrow">FLEET ORGANISATION</span><h3>Bus categories</h3><p>Type values from fleet imports appear here. Add more categories at any time; Super Admin can rename them across every matching bus.</p></div>
          <span className="settings-count-pill">{busCategories.length} categories</span>
        </div>
        <form className="settings-inline-create" onSubmit={addBusCategory}>
          <input placeholder="New category (e.g. Economy AC)" value={newBusCategory} onChange={(e) => setNewBusCategory(e.target.value)} />
          <button className="primary" type="submit">Add category</button>
        </form>
        <div className="settings-managed-list">
          {busCategories.map((categoryName) => editingItem?.type === "busCategory" && editingItem.id === categoryName
            ? <div key={categoryName} className="settings-managed-item editing">
              <input aria-label="Bus category name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} />
              <div className="settings-item-actions"><button type="button" className="primary" onClick={() => saveBusCategory(categoryName)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div>
            </div>
            : <div key={categoryName} className="settings-managed-item category-item">
              <div><span className="category-marker" aria-hidden="true"/><strong>{categoryName}</strong>{DEFAULT_BUS_CATEGORIES.includes(categoryName) && <small>Recognised fleet category</small>}</div>
              <div className="settings-item-actions">
                {canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "busCategory", id: categoryName, value: categoryName })}>Edit</button>}
                {canWrite && <button type="button" className="link-danger" onClick={() => removeBusCategory(categoryName)}>Remove</button>}
              </div>
            </div>)}
          {busCategories.length === 0 && <div className="settings-list-empty">No bus categories configured. Add one above.</div>}
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
              {hotels.map((h) => editingItem?.type === "hotel" && editingItem.id === h.id
                ? <tr key={h.id} className="settings-edit-row"><td><input aria-label="Hotel name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} /></td><td><div className="settings-item-actions"><button type="button" className="primary" onClick={() => saveHotel(h.id)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div></td></tr>
                : <tr key={h.id}>
                  <td>{h.name}</td>
                  <td style={{ textAlign: "right" }}><div className="settings-item-actions right">{canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "hotel", id: h.id, value: h.name })}>Edit</button>}{canWrite && <button type="button" className="link-danger" onClick={() => removeHotel(h.id)}>Remove</button>}</div></td>
                </tr>)}
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
              {parts.map((p) => editingItem?.type === "part" && editingItem.id === p.id
                ? <tr key={p.id} className="settings-edit-row"><td><div className="settings-edit-fields"><input aria-label="Part name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} /><input aria-label="Part description" placeholder="Description (optional)" value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} /></div></td><td><div className="settings-item-actions"><button type="button" className="primary" onClick={() => savePart(p.id)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div></td></tr>
                : <tr key={p.id}>
                  <td><strong>{p.part_name}</strong>{p.description && <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.description}</div>}</td>
                  <td style={{ textAlign: "right" }}><div className="settings-item-actions right">{canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "part", id: p.id, value: p.part_name, description: p.description || "" })}>Edit</button>}{canWrite && <button type="button" className="link-danger" onClick={() => removePart(p.id)}>Remove</button>}</div></td>
                </tr>)}
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
            {discountTypes.map((d) => editingItem?.type === "discount" && editingItem.id === d.id
              ? <tr key={d.id} className="settings-edit-row"><td><input aria-label="Deduction type name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} /></td><td><div className="settings-item-actions"><button type="button" className="primary" onClick={() => saveDiscountType(d.id)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div></td></tr>
              : <tr key={d.id}>
                <td>{d.name}</td>
                <td style={{ textAlign: "right" }}><div className="settings-item-actions right">{canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "discount", id: d.id, value: d.name })}>Edit</button>}{canWrite && <button type="button" className="link-danger" onClick={() => removeDiscountType(d.id)}>Remove</button>}</div></td>
              </tr>)}
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
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>These places are available when logging bus maintenance. Super Admin renaming also updates existing maintenance tickets.</p>
        <form className="form-row" onSubmit={addLocation}><input placeholder="Repair location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} /><button className="primary" type="submit">Add place</button></form>
        <table><tbody>
          {locations.map((location) => editingItem?.type === "location" && editingItem.id === location.id
            ? <tr key={location.id} className="settings-edit-row"><td><input aria-label="Repair place name" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} /></td><td><div className="settings-item-actions"><button type="button" className="primary" onClick={() => saveLocation(location.id)}>Save</button><button type="button" className="place-secondary-action" onClick={() => setEditingItem(null)}>Cancel</button></div></td></tr>
            : <tr key={location.id}><td>{location.name}</td><td style={{ textAlign: "right" }}><div className="settings-item-actions right">{canWrite && <button type="button" className="settings-edit-button" onClick={() => setEditingItem({ type: "location", id: location.id, value: location.name })}>Edit</button>}{canWrite && <button type="button" className="link-danger" onClick={() => removeLocation(location.id)}>Remove</button>}</div></td></tr>)}
          {locations.length === 0 && <tr><td>No repair places added yet.</td></tr>}
        </tbody></table>
      </div>
      </fieldset>
    </div>
  );
}
