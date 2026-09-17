import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import SearchableSelect from "../SearchableSelect.jsx";
import { ANATOMY_VERSION, ANATOMY_STORAGE_KEY, MODELS, SYSTEMS, SOURCES, RESEARCH_DATE, PARTS, catalogForModel, readAnatomyDraft, validEdit, fitmentLabel } from "./anatomyCatalog.js";
import { readAnatomyLayout, resolveBusTarget, locatePartOnBus, availableBusTargets } from "./anatomyNavigation.js";
import { FLEET_PAPER_MODELS, FLEET_DRAFT_STORAGE_KEY, PAPER_BATCH_DATE, PAPER_BATCH_SUMMARY, PAPER_SOURCES, paperFacts, readFleetDraft, validFleetDraft, makeFleetProfile } from "./fleetPaperProfiles.js";
import "./busAnatomy.css";

const EngineAnatomy3D = lazy(() => import("./EngineAnatomy3D.jsx"));

const STATUS = { candidate: "Candidate specification", partial: "Partial reference", pending: "Identity needed", documented: "From your bus papers" };
const emptyEditor = { name: "", purpose: "", note: "" };
const emptyFleet = { registration: "", templateId: FLEET_PAPER_MODELS[0].id, seats: "", note: "" };
const ENGINE_PATHS = [
  { title: "Air path", ids: ["air-filter", "turbo", "intercooler", "valves"] },
  { title: "Power path", ids: ["piston", "rod", "crankshaft"] },
  { title: "Oil circulation", ids: ["sump", "oil-pump", "oil-filter", "bearings"] },
];

const EMPTY_EDITS = [];

export default function BusAnatomyPreview({ canEdit = false, initialSystem = "", initialModel = FLEET_PAPER_MODELS[0].id,
  shared = false, suppliedModels, suppliedEdits = EMPTY_EDITS, suppliedEngineLayout = "rear", onSaveEdits }) {
  const [modelId, setModelId] = useState(initialModel);
  const [systemId, setSystemId] = useState(initialSystem);
  const [selectedId, setSelectedId] = useState("piston");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [edits, setEdits] = useState(() => shared ? suppliedEdits : readAnatomyDraft());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyEditor);
  const [notice, setNotice] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [localEngineLayout] = useState(() => shared ? "rear" : readAnatomyLayout());
  const engineLayout = shared ? suppliedEngineLayout : localEngineLayout;
  const [originTarget, setOriginTarget] = useState("");
  const [busFocus, setBusFocus] = useState("");
  const [focusSelection, setFocusSelection] = useState(false);
  const [fleetDrafts, setFleetDrafts] = useState(() => shared ? [] : readFleetDraft());
  const [addingFleet, setAddingFleet] = useState(false);
  const [fleetForm, setFleetForm] = useState(emptyFleet);
  const detailRef = useRef(null);
  const viewerRef = useRef(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (shared) setEdits(suppliedEdits); }, [shared, suppliedEdits]);
  const allModels = useMemo(() => shared && suppliedModels?.length ? suppliedModels : [...MODELS, ...fleetDrafts], [shared, suppliedModels, fleetDrafts]);
  const model = allModels.find(m => m.id === modelId) || allModels[0];
  const system = SYSTEMS.find(s => s.id === systemId);
  const catalog = useMemo(() => catalogForModel(model, edits), [model, edits]);
  const visible = catalog.filter(p => showHidden || !p.hidden);
  const matches = visible.filter(p => (!system || p.system === system.id) && (!group || p.group === group)
    && `${p.name} ${p.purpose} ${p.note || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = matches.find(p => p.id === selectedId) || matches[0];
  const groups = system ? [...new Set(visible.filter(p => p.system === system.id).map(p => p.group))] : [];
  const original = PARTS.find(p => p.id === selected?.id);
  const origin = resolveBusTarget(originTarget, catalog, engineLayout);
  const located = availableBusTargets(catalog, engineLayout).find(t => t.id === busFocus);

  function resetSelection(nextModel) {
    if (!allModels.some(m => m.id === nextModel)) return;
    setModelId(nextModel); setQuery(""); setGroup(""); setSelectedId("piston"); setEditing(null); setNotice(""); setOriginTarget(""); setBusFocus(""); setFocusSelection(false);
  }
  function saveFleet(e) {
    e.preventDefault();
    const template = FLEET_PAPER_MODELS.find(m => m.id === fleetForm.templateId);
    const registration = fleetForm.registration.trim();
    const seats = Number(fleetForm.seats);
    if (!template || !validFleetDraft({ id: "fleet-new", registration, templateId: template.id, seats, note: fleetForm.note })) { setNotice("Enter a unique bus number, choose a model and enter seats from 1 to 200."); return; }
    const duplicate = allModels.some(m => (m.registration || "").toLowerCase() === registration.toLowerCase());
    if (duplicate) { setNotice("That bus number already exists in this local reference list."); return; }
    const profile = makeFleetProfile(template, registration, seats, fleetForm.note);
    const next = [...fleetDrafts, profile];
    try { localStorage.setItem(FLEET_DRAFT_STORAGE_KEY, JSON.stringify(next.map(({ id, registration, templateId, seats, note }) => ({ id, registration, templateId, seats, note })))); } catch { setNotice("Could not save this bus in the browser."); return; }
    setFleetDrafts(next); setModelId(profile.id); setAddingFleet(false); setFleetForm(emptyFleet); setNotice(`${profile.fullRegistration} added locally using ${template.label} as its anatomy template.`);
  }
  function chooseSystem(id) {
    setSystemId(id); setQuery(""); setGroup(""); setEditing(null); setNotice("");
    setSelectedId(visible.find(p => p.system === id)?.id || "");
    setOriginTarget(""); setFocusSelection(false);
  }
  function choosePart(id, focus = false) {
    setSelectedId(id); setEditing(null); setFocusSelection(true);
    if (focus) requestAnimationFrame(() => viewerRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }
  function openBusTarget(id) {
    const target = resolveBusTarget(id, catalog, engineLayout);
    if (!target) return;
    setSystemId(target.system); setSelectedId(target.partId); setOriginTarget(id); setQuery(""); setGroup(""); setEditing(null); setNotice(""); setFocusSelection(!!target.direct);
  }
  function locateSelected() {
    const target = locatePartOnBus(selected, catalog, engineLayout, originTarget);
    setBusFocus(target?.id || ""); setSystemId(""); setQuery(""); setGroup(""); setEditing(null);
  }
  async function commit(next, message) {
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true);
    try {
      if (shared) {
        if (!onSaveEdits) throw new Error("Shared model saving is unavailable.");
        await onSaveEdits(next);
      } else localStorage.setItem(ANATOMY_STORAGE_KEY, JSON.stringify({ version: 1, edits: next }));
      setEdits(next); setNotice(message); return true;
    } catch (error) { setNotice(shared ? `${error.message || "Could not save this model."} Your changes have not been saved; the editor is still open.` : "Could not save in this browser. Your changes have not been saved; the editor is still open."); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }
  function editPart(add = false) {
    if (!canEdit || !system) return;
    setEditing(add ? "new" : selected.id);
    setDraft(add ? { ...emptyEditor } : { name: selected.name, purpose: selected.purpose, note: selected.note || "" });
    setNotice("");
  }
  async function saveEdit(e) {
    e.preventDefault(); if (!canEdit || !editing || !system || savingRef.current) return;
    const id = editing === "new" ? `custom-${crypto.randomUUID()}` : editing;
    const entry = { modelId: model.id, partId: id, name: draft.name.trim(), purpose: draft.purpose.trim(), note: draft.note.trim(),
      system: system.id, hidden: false, custom: editing === "new" || Boolean(selected?.custom), updatedAt: new Date().toISOString() };
    if (!validEdit(entry) || !entry.purpose) { setNotice("Enter a component name and a short explanation before saving."); return; }
    const next = edits.filter(x => !(x.modelId === model.id && x.partId === id)).concat(entry);
    if (await commit(next, shared ? "Saved for every bus assigned to this model. Existing repair and account records are unchanged." : "Saved for this model in this browser only. Live data is unchanged.")) {
      setSelectedId(id); setEditing(null); setQuery(""); setGroup("");
    }
  }
  async function toggleHidden() {
    if (!canEdit || !selected || savingRef.current) return;
    const entry = { modelId: model.id, partId: selected.id, system: selected.system, name: selected.name, purpose: selected.purpose,
      note: selected.note || "", hidden: !selected.hidden, custom: Boolean(selected.custom), updatedAt: new Date().toISOString() };
    if (await commit(edits.filter(x => !(x.modelId === model.id && x.partId === selected.id)).concat(entry), entry.hidden
      ? `Removed from this model's ${shared ? "shared" : "local"} view. Use Show removed to restore it. No maintenance history was deleted.`
      : `Component restored to this model's ${shared ? "shared" : "local"} view.`)) setEditing(null);
  }
  function backToOverview() { setSystemId(""); setQuery(""); setGroup(""); setEditing(null); setBusFocus(""); }

  const viewer = <Suspense fallback={<div className="engine3d-shell" role="status">Loading interactive 3D {system ? "components" : "bus"}…</div>}><EngineAnatomy3D key={`${system?.id || "bus"}/${engineLayout}/${model.id}`} systemId={system?.id || "bus"} engineLayout={engineLayout} suspension={model.suspension} cylinderCount={model.cylinderCount} cylinderEvidence={model.cylinderEvidence}
    selected={system ? selected : located} parts={system ? catalog.filter(p => p.system === system.id) : catalog} modelLabel={model.label} initialFocus={system ? focusSelection : !!located}
    onSelect={system ? id => { setGroup(""); setQuery(""); choosePart(id); } : openBusTarget} onBack={system ? backToOverview : undefined} onLocate={system && selected ? locateSelected : undefined} /></Suspense>;

  return <section className="anatomy" aria-label="Bus anatomy reference module">
    <header className="anatomy-header">
      <div><span className="anatomy-eyebrow">{shared ? "SHARED MODEL REFERENCE" : "LOCAL REFERENCE LAB"} {!shared && <span>{ANATOMY_VERSION}</span>}</span><h2>Bus anatomy</h2><p>Click the bus. Open a system. Inspect its parts in 3D.</p></div>
      <span className="anatomy-local-badge">{shared ? "Repair records remain unchanged" : "Live website untouched"}</span>
    </header>
    <div className="anatomy-controls">
      {shared ? <div><span className="anatomy-eyebrow">ASSIGNED MODEL</span><strong>{model.label}</strong></div> : <label htmlFor="anatomy-model">Bus number / research template<SearchableSelect id="anatomy-model" value={model.id} options={allModels.map(m => ({ value: m.id, label: m.label, group: m.customFleet ? "Your added buses" : m.paperBacked ? "Your bus papers" : "Research templates" }))} onChange={resetSelection} /></label>}
      {canEdit && !shared && <button className="anatomy-action anatomy-add-bus" type="button" onClick={() => { setAddingFleet(v => !v); setNotice(""); }}>{addingFleet ? "Cancel" : "+ Add another bus"}</button>}
      <div className="anatomy-coverage"><strong>{SYSTEMS.length}</strong><span>systems</span><strong>{visible.length}</strong><span>reference components</span></div>
    </div>
    {addingFleet && <form className="anatomy-fleet-editor" onSubmit={saveFleet} aria-label="Add another bus"><div><span className="anatomy-eyebrow">LOCAL BUS LIST</span><h3>Add another bus using an existing model</h3><p>This creates a separate local bus number and reuses the selected model's anatomy. It does not create an operational bus record.</p></div><label>Bus number<input required maxLength={40} placeholder="Example: 16-1234" value={fleetForm.registration} onChange={e => setFleetForm({ ...fleetForm, registration: e.target.value })} /></label><label>Use anatomy from<SearchableSelect id="fleet-template" value={fleetForm.templateId} options={FLEET_PAPER_MODELS.map(m => ({ value: m.id, label: `${m.registration} · ${m.make}` }))} onChange={templateId => setFleetForm({ ...fleetForm, templateId })} /></label><label>Seats on paper<input required type="number" min="1" max="200" value={fleetForm.seats} onChange={e => setFleetForm({ ...fleetForm, seats: e.target.value })} /></label><label>Note (optional)<input maxLength={500} placeholder="Body or workshop note" value={fleetForm.note} onChange={e => setFleetForm({ ...fleetForm, note: e.target.value })} /></label><button className="anatomy-action" type="submit">Add bus locally</button></form>}
    {model.paperBacked && <section className="anatomy-paper-profile" aria-label="Selected bus paper details">
      <div className="anatomy-paper-title"><div><span className="anatomy-eyebrow">YOUR BUS · LOCAL MAINTENANCE REFERENCE</span><h3>{model.fullRegistration}</h3><p>{model.reference}</p></div><span className="anatomy-local-badge">Paper details linked</span></div>
      <div className="anatomy-paper-stats">{paperFacts(model).filter(([label]) => ["Cylinders on paper", "Engine capacity on paper", "Seats on paper", "Year evidence"].includes(label)).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p>{model.cylinderCount === 6 ? "Engine view uses six cylinders to match this paper. Other component shapes and positions are illustrative." : "Cylinder count is not on this paper. Engine view remains a generic teaching example, not this bus's confirmed engine."}</p>
    </section>}
    <details key={model.id} className="anatomy-identity">
      <summary><span className="anatomy-status">{STATUS[model.status]}</span><span>{model.reference || model.label}</span><span className="anatomy-identity-more">Identity & sources</span></summary>
      <div className="anatomy-identity-body"><p>{model.note}</p>
        <dl className="anatomy-specs">{(model.paperBacked ? paperFacts(model) : [["Engine", model.engine], ["Power", model.power], ["Cylinders", model.cylinders], ["Transmission", model.transmission]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not verified"}</dd></div>)}</dl>
        {model.paperBacked ? <><p>These are readings from your supplied papers, not verification of the equipment fitted today. Horsepower, gearbox, fuel system, suspension and engine position are not confirmed. Old document dates do not set current availability.</p><h4>Source papers · {PAPER_BATCH_DATE}</h4><ul>{model.papers.map(id => <li key={id}>{PAPER_SOURCES[id]}</li>)}</ul><small>{PAPER_BATCH_SUMMARY}. Original photographs and private identity/payment details are not included in the website.</small></> : <p>{shared ? "This reference template was assigned by your team. Assignment does not verify the parts fitted to this bus, its engine position or compatible replacement parts." : "These are published reference specifications, not confirmation of equipment fitted to your buses. No fleet bus has been assigned to this research template."}</p>}
        {model.source && <SourceLink id={model.source} />}
        <small>Research checked {RESEARCH_DATE}. Exact anatomy, part numbers and fitment still need chassis/engine confirmation. Eicher coverage is the available Bangladesh range, not every worldwide model.</small>
      </div>
    </details>
    <div className="anatomy-caution">Illustrations and component maps are conceptual. They are not manufacturer exploded diagrams, a complete parts catalogue, or repair instructions.</div>
    {notice && <p className="anatomy-notice" role="status">{notice}</p>}
    <nav className="anatomy-breadcrumb" aria-label="Anatomy navigation"><button type="button" onClick={backToOverview} aria-current={!system ? "page" : undefined}>Bus overview</button>{system && <><span aria-hidden="true">/</span><span>{origin?.name || system.label}</span>{selected && <><span aria-hidden="true">/</span><strong>{selected.name}</strong></>}</>}</nav>

    {!system ? <div className="anatomy-overview-3d">
      <div ref={viewerRef}>{viewer}</div>
      <div className="anatomy-systems anatomy-system-shortcuts" aria-label="Bus systems">{SYSTEMS.map(s => <button type="button" key={s.id} onClick={() => chooseSystem(s.id)}><span className="anatomy-system-number">{s.symbol}</span><span><strong>{s.label}</strong><small>{visible.filter(p => p.system === s.id).length} components · Interactive 3D</small></span></button>)}</div>
    </div> : <>
      <div className="anatomy-system-bar"><label htmlFor="anatomy-system">System<SearchableSelect id="anatomy-system" value={system.id} options={SYSTEMS.map(s => ({ value: s.id, label: s.label }))} onChange={id => { if (SYSTEMS.some(s => s.id === id)) chooseSystem(id); }} /></label><label htmlFor="anatomy-search">Search components<input id="anatomy-search" type="search" placeholder="Name, function or your note…" value={query} onChange={e => { setQuery(e.target.value); setEditing(null); }} /></label>{canEdit && <button className="anatomy-action" onClick={() => editPart(true)}>+ Add component</button>}</div>
      <div className="anatomy-group-filters" aria-label="Component groups"><button aria-pressed={!group} onClick={() => { setGroup(""); setEditing(null); }}>All groups</button>{groups.map(g => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setEditing(null); }}>{g}</button>)}{canEdit && <label><input type="checkbox" checked={showHidden} onChange={e => { setShowHidden(e.target.checked); setEditing(null); }} />Show removed</label>}</div>
      <div className="anatomy-visual-workspace">
        <div className="anatomy-component-list" aria-label="Reference components"><div className="anatomy-list-title">{matches.length} components <span>SELECT TO INSPECT</span></div>{matches.map((p, i) => <button key={p.id} aria-pressed={selected?.id === p.id} onClick={() => choosePart(p.id, true)}><span>{String(i + 1).padStart(2, "0")}</span><div><strong>{p.name}</strong><small>{p.hidden ? "Removed · restorable" : p.custom ? "Your component" : p.group}</small></div></button>)}{!matches.length && <p className="anatomy-empty">No components match. Clear the search or choose another group.</p>}</div>
        <div ref={viewerRef}>{viewer}</div>
      </div>
      <div className="anatomy-explorer anatomy-reference-details">
        <div className="anatomy-detail" ref={detailRef} tabIndex={-1} aria-label="Component information">
          {editing ? <form className="anatomy-editor" onSubmit={saveEdit}><span className="anatomy-eyebrow">{shared ? "SHARED MODEL EDIT" : "LOCAL EDIT"} · {model.label}</span><h3>{editing === "new" ? "Add component" : "Edit component"}</h3><label>Component name<input autoFocus required disabled={saving} maxLength={90} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>What it does<textarea required disabled={saving} rows={4} maxLength={800} value={draft.purpose} onChange={e => setDraft({ ...draft, purpose: e.target.value })} /></label><label>Your workshop note<textarea disabled={saving} rows={3} maxLength={1200} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label><p>{shared ? "Saved for every bus assigned to this model. Only Super Admin can change these shared component details." : "Saved only for this model in this browser."} Original references and maintenance history are retained.</p><div className="anatomy-editor-actions"><button className="anatomy-action" disabled={saving} aria-busy={saving} type="submit">{saving ? "Saving…" : shared ? "Save for this model" : "Save locally"}</button><button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></div></form>
          : selected ? <article key={`${model.id}-${selected.id}`} className="anatomy-component-card"><span className="anatomy-eyebrow">{system.label} / {selected.group}</span><h3>{selected.name}</h3><span className="anatomy-fitment">{fitmentLabel(model, selected)}</span><h4>What it does</h4><p className="anatomy-purpose">{selected.purpose}</p>{selected.note && <div className="anatomy-workshop-note"><h4>Your workshop note</h4><p>{selected.note}</p></div>}
              {selected.edited && <details className="anatomy-reference-original"><summary>Original reference description</summary><p>{original?.purpose}</p></details>}
              <div className="anatomy-facts"><div><span>Bus location · illustrative</span><strong>{locatePartOnBus(selected, catalog, engineLayout, originTarget)?.location || "Not assigned"}</strong><small>Exact location awaits a verified model diagram.</small></div><div><span>OEM part number</span><strong>Not verified — do not order by name alone</strong></div></div>
              {selected.source ? <div className="anatomy-source"><SourceLink id={selected.source} /><small>General component reference; not proof of fitment or manufacturer supply to this bus.</small></div> : <p className="anatomy-source">General mechanical explanation. Model-specific documentation is still needed.</p>}
              {canEdit && <div className="anatomy-editor-actions"><button disabled={saving} onClick={() => editPart()}>{shared ? "Edit model details" : "Edit local details"}</button><button disabled={saving} aria-busy={saving} onClick={toggleHidden}>{saving ? "Saving…" : selected.hidden ? "Restore component" : shared ? "Remove from model" : "Remove from local view"}</button></div>}
            </article> : <p className="anatomy-empty">Choose a component from the list.</p>}
          {system.id === "engine" && !editing && <div className="anatomy-flow"><h4>How the engine systems connect</h4><p>Functional paths only; optional equipment and actual routing depend on the engine.</p>{ENGINE_PATHS.map(path => <div className="anatomy-flow-row" key={path.title}><span>{path.title}</span><div>{path.ids.map(id => catalog.find(p => p.id === id && !p.hidden)).filter(Boolean).map((p, i) => <button key={p.id} aria-pressed={selected?.id === p.id} onClick={() => { setGroup(""); setQuery(""); choosePart(p.id); }}>{i > 0 && <span aria-hidden="true">→ </span>}{p.name}</button>)}</div></div>)}</div>}
        </div>
        <aside className="anatomy-market" aria-label="Bangladesh parts pricing"><span className="anatomy-eyebrow">BANGLADESH MARKET</span><h3>Replacement pricing</h3><span className="anatomy-price-empty">Price unavailable</span><p>No compatible local supplier price feed is connected for this component.</p><dl><div><dt>Automatic updates</dt><dd>Not connected</dd></div><div><dt>Last price check</dt><dd>Not performed</dd></div><div><dt>Currency</dt><dd>BDT</dd></div></dl><p className="anatomy-market-note">No guessed prices, overseas conversions or sample quotations are shown. Published reference costs will never change your recorded expenses.</p>{model.make === "Eicher" && <div className="anatomy-supplier"><SourceLink id="eicherParts" /><small>Supplier enquiry resource. Dial-A-Part is not an automated price feed.</small></div>}<details><summary>What is needed to connect pricing?</summary><p>Verified part numbers and a supplier's permitted website access, API or digital price list. New, aftermarket and reconditioned prices must remain separate.</p></details></aside>
      </div>
    </>}
    <footer className="anatomy-footer"><span>Reference library · {RESEARCH_DATE}{!shared && " · 8 bus-paper profiles"}</span><span>{shared ? "Shared model reference · Repair history and accounts are unchanged" : "Local drafts only · No live repairs, bus assignments or account changes"}</span></footer>
  </section>;
}

function SourceLink({ id }) {
  const source = SOURCES[id];
  return source ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a> : null;
}
