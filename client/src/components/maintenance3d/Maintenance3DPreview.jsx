import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SearchableSelect from "../SearchableSelect.jsx";
import { busLabel } from "../../busLabel.js";
import IllustratedBusInspector from "./IllustratedBusInspector.jsx";
import { STORAGE_KEY, STATUS, getPartRepairs, partStatus } from "./model.js";
import { ILLUSTRATION_STORAGE_KEY, TEMPLATE_STORAGE_KEY, DEFAULT_ILLUSTRATED_PARTS, MODULES, ENGINE_LAYOUTS, validateIllustratedParts, migrateIllustratedParts, validateTemplate, upgradeIllustratedTemplate, partsForEngineLayout, editPartForLayout } from "./illustrationModel.js";
import { APP_VERSION } from "../../version.js";
import "./maintenance3d.css";
import BusAnatomyPreview from "./BusAnatomyPreview.jsx";

export default function MaintenancePreviewWorkspace(props) {
  const [mode, setMode] = useState(props.initialMode || (props.editor ? "illustration" : "anatomy"));
  return <>
    <div className="maintenance-preview-switch" role="group" aria-label="Maintenance preview workspace">
      <button aria-pressed={mode === "anatomy"} onClick={() => setMode("anatomy")}>3D anatomy & parts</button>
      <button aria-pressed={mode === "illustration"} onClick={() => setMode("illustration")}>{props.editor ? "Illustrated template editor" : "Illustrated repair preview"}</button>
    </div>
    {mode === "anatomy" ? <BusAnatomyPreview canEdit={props.canEdit === true} /> : <Maintenance3DPreview {...props} />}
  </>;
}

function readTemplate() {
  try {
    const current = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY));
    if (validateTemplate(current)) return current;
    const value = JSON.parse(localStorage.getItem(ILLUSTRATION_STORAGE_KEY));
    if (validateIllustratedParts(value)) return upgradeIllustratedTemplate(value);
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (legacy) return upgradeIllustratedTemplate(migrateIllustratedParts(legacy));
  } catch { /* Preview works when storage is unavailable. */ }
  return upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS);
}
const money = (n) => `৳${Number(n || 0).toLocaleString("en-BD")}`;
function Maintenance3DPreview({ tickets = [], buses = [], editor = false, canEdit = true }) {
  const [template,setTemplate] = useState(readTemplate);
  const {parts,engineLayout} = template;
  function setParts(next) { setTemplate((current)=>({...current,parts:typeof next==="function"?next(current.parts):next})); }
  const [selectedId,setSelectedId] = useState(parts[0]?.id || "");
  const [busId,setBusId] = useState("1");
  const [showAll,setShowAll] = useState(false);
  const [placing,setPlacing] = useState(false);
  const [view,setView] = useState("bus");
  const [notice,setNotice] = useState("");
  const [dirty,setDirty] = useState(false);
  const mapped = useMemo(()=>partsForEngineLayout(parts,engineLayout).map((p)=>{const repairs = getPartRepairs(p,tickets,busId);return {...p,repairs,status:editor?"clear":partStatus(repairs)};}),[parts,engineLayout,tickets,busId,editor]);
  const visible = mapped.filter((p)=>editor || showAll || p.status!=="clear");
  const selected = mapped.find((p)=>p.id===selectedId && visible.some((v)=>v.id===p.id)) || visible[0];
  const activeTickets = tickets.filter((t)=>String(t.bus_id)===String(busId) && t.status!=="resolved");
  function updatePart(patch) { if (!canEdit || !selected) return; setParts((list)=>list.map((p)=>p.id===selected.id?editPartForLayout(p,patch,engineLayout):p));setDirty(true);setNotice(""); }
  function changeLayout(layout) {
    if (!editor || !canEdit) return;
    setTemplate((current)=>({...current,engineLayout:layout}));setView("bus");setPlacing(false);setNotice("");
    if (editor) setDirty(true);
  }
  function save() {
    if (!validateTemplate(template)) {setNotice("Give each part a name, maintenance link and illustration. Keep positions between 5% and 95%.");return;}
    try {localStorage.setItem(TEMPLATE_STORAGE_KEY,JSON.stringify(template));setDirty(false);setPlacing(false);setNotice("Illustrated template and engine layout saved in this local preview. Live settings were not changed.");} catch {setNotice("This browser could not save the template. Please allow local storage.");}
  }
  function addPart() {
    if (parts.length >= 50) {setNotice("This preview supports up to 50 parts per template.");return;}
    const part = {id:crypto.randomUUID(),label:"New part",matchName:`New part ${parts.length+1}`,description:"",module:"bus",busX:50,busY:60,faultX:50,faultY:50};
    setParts([...parts,part]);setSelectedId(part.id);setView("bus");setPlacing(false);setDirty(true);setNotice("");
  }
  function removePart() {
    setParts(parts.filter((p)=>p.id!==selected.id));setSelectedId("");setView("bus");setPlacing(false);setDirty(true);setNotice("Part removed from the draft template only. Maintenance records are retained.");
  }
  function selectPart(id) { setSelectedId(id); setPlacing(false); if (!editor) setView("module"); }
  return <section className="bus3d-workspace bus-illustrated-workspace" aria-label={editor?"Illustrated bus template settings":"Illustrated maintenance preview"}>
    <div className="bus3d-preview-note"><span>LOCAL PREVIEW</span><p>Sample records only. Nothing here changes your live website.</p><span className="bus3d-preview-version">{APP_VERSION}</span></div>
    <div className="bus3d-heading">
      <div><span className="bus3d-eyebrow">{editor?"SETTINGS / MAINTENANCE":"MAINTENANCE / PART INSPECTOR"}</span><h2>{editor?"Illustrated bus template":"Look inside the problem"}</h2><p>{editor?"Connect each part to an illustration and position its highlight.":"Choose a problem. Zoom into the part. See what needs attention."}</p></div>
      {editor ? <Link className="settings-edit-button" to="/maintenance">← Maintenance preview</Link> : <Link className="settings-edit-button" to="/settings">⚙ Edit illustrated template</Link>}
    </div>
    <div className="bus3d-toolbar">
      {editor ? <div className="bus3d-template-name"><strong>Standard coach illustration</strong><span>{parts.length} editable parts · Generic layout</span></div> : <label className="bus3d-bus-picker"><span>Inspect bus</span><SearchableSelect id="maintenance-3d-bus" value={busId} onChange={(id)=>{setBusId(id);setSelectedId("");setView("bus");}} options={buses.map((b)=>({value:String(b.id),label:busLabel(b)}))} placeholder="Search bus number" /></label>}
      <div className="bus3d-toolbar-end">{editor ? <><span>{dirty?"Unsaved changes":"Local template"}</span>{canEdit && <button className="primary" onClick={save}>Save template</button>}</> : <><span className="bus3d-issue-count"><b>{activeTickets.length}</b> active repair{activeTickets.length!==1?"s":""}</span><div className="bus3d-filter" role="group" aria-label="Displayed parts"><button aria-pressed={!showAll} className={!showAll?"active":""} onClick={()=>{setShowAll(false);setView("bus");}}>Needs attention</button><button aria-pressed={showAll} className={showAll?"active":""} onClick={()=>{setShowAll(true);setView("bus");}}>All parts</button></div></>}</div>
    </div>
    {editor ? <div className="bus-engine-layout">
      <div className="bus-engine-layout-heading"><strong>Engine type</strong><span>Saved with this local template</span></div>
      <div className="bus-engine-layout-options" role="group" aria-label="Engine type">{ENGINE_LAYOUTS.map((layout)=><button type="button" key={layout.value} className={engineLayout===layout.value?"active":""} aria-pressed={engineLayout===layout.value} disabled={!canEdit} onClick={()=>changeLayout(layout.value)}><span className="bus-engine-layout-check" aria-hidden="true">{engineLayout===layout.value?"✓":""}</span><span><strong>{layout.label}</strong><small>{layout.description}</small></span></button>)}</div>
      {engineLayout==="double" && <p>Front and rear engines have separate part links and highlights. A repair on one engine is not copied to the other.</p>}
    </div> : <div className="bus-engine-readonly"><strong>{ENGINE_LAYOUTS.find((layout)=>layout.value===engineLayout)?.label}</strong><span>Engine type is managed in Settings</span></div>}
    {notice && <div className="bus3d-notice" role="status">{notice}</div>}
    <div className="bus3d-inspector">
      <IllustratedBusInspector parts={visible} selected={selected} view={view} engineLayout={engineLayout} editor={editor} onSelect={selectPart} onBack={()=>{setView("bus");setPlacing(false);}} placing={placing && editor && canEdit} onPlace={(position)=>{updatePart(position);setPlacing(false);}} />
      <aside className="bus3d-detail" aria-label={editor?"Part position editor":"Selected repair details"}>
        <div className="bus3d-detail-top"><span className="bus3d-eyebrow">{editor?"PART EDITOR":"REPAIR DETAILS"}</span>{editor && canEdit && <button className="settings-edit-button" onClick={addPart}>+ Add part</button>}</div>
        {!selected && <div className="bus3d-empty"><h3>{editor?"Add your first part":"No active mapped repairs"}</h3><p>{editor?"Create a part, then choose its position on the illustration.":"Use All parts to inspect the template. Unmapped records remain in the maintenance lists below."}</p></div>}
        {selected && (editor ? <div className="bus3d-editor-fields">
          {selected.engineLocation && <div className="bus-engine-location">{selected.engineLocation} engine · {ENGINE_LAYOUTS.find((layout)=>layout.value===engineLayout)?.label} layout</div>}
          <label>Part name<input maxLength={80} disabled={!canEdit} value={selected.label} onChange={(e)=>updatePart({label:e.target.value})} /></label>
          <label>Description<input maxLength={200} disabled={!canEdit} value={selected.description} onChange={(e)=>updatePart({description:e.target.value})} placeholder="Describe this part or its location" /></label>
          <label>Linked maintenance part<input maxLength={80} disabled={!canEdit} value={selected.matchName} onChange={(e)=>updatePart({matchName:e.target.value})} placeholder="Part name used in maintenance records" /></label>
          <label>Component illustration<SearchableSelect id="illustrated-part-module" disabled={!canEdit} value={selected.module} options={MODULES} onChange={(module)=>{if (MODULES.some((m)=>m.value===module)) {updatePart({module,...(module!=="engine"?{engineRole:undefined}:{})});setPlacing(false);}}} /></label>
          {selected.module==="engine" && <label>Engine assignment<SearchableSelect id="illustrated-engine-assignment" disabled={!canEdit} value={selected.engineRole || "fixed"} options={[{value:"primary",label:"Main engine — follows layout"},{value:"secondary",label:"Second engine — double layout only"},{value:"fixed",label:"Manual position — all layouts"}]} onChange={(role)=>{if (["primary","secondary","fixed"].includes(role)) {updatePart({engineRole:role==="fixed"?undefined:role});if(role==="secondary") changeLayout("double");}}} /></label>}
          <div className="bus3d-filter" role="group" aria-label="Position to edit"><button className={view==="bus"?"active":""} aria-pressed={view==="bus"} onClick={()=>{setView("bus");setPlacing(false);}}>Bus location</button><button className={view==="module"?"active":""} aria-pressed={view==="module"} onClick={()=>{setView("module");setPlacing(false);}}>Module highlight</button></div>
          {view==="module" && selected.module==="bus" ? <p className="bus3d-editor-hint">This part zooms into its bus location. Choose a separate component illustration to position an internal highlight.</p> : <>
            <button className={`bus3d-place-button ${placing?"active":""}`} disabled={!canEdit} aria-pressed={placing} onClick={()=>setPlacing(!placing)}>{placing?"Cancel placement":"⌖ Place highlight on illustration"}</button>
            {(view==="bus" ? [['busX','Horizontal position'],['busY','Vertical position']] : [['faultX','Horizontal position'],['faultY','Vertical position']]).map(([axis,label])=><label className="bus3d-axis" key={axis}><span>{label}<output>{selected[axis].toFixed(1)}%</output></span><input disabled={!canEdit} aria-label={label} type="range" min="5" max="95" step="0.5" value={selected[axis]} onChange={(e)=>updatePart({[axis]:Number(e.target.value)})} /></label>)}
          </>}
          {canEdit && <button className="link-danger bus3d-remove" onClick={removePart}>Remove part from template</button>}
          <p className="bus3d-editor-hint">Bus positions are saved for this engine layout. Renaming preserves this marker’s ID and sample repair links. Removing a marker does not delete a repair.</p>
        </div> : <div className="bus3d-repair-details">
          <span className="bus3d-status" style={{"--status-color":STATUS[selected.status].color}}><i />{STATUS[selected.status].label}</span>
          <h3>{selected.displayLabel}</h3><p>{selected.description}</p>
          {view==="bus" && <button className="bus-module-open" onClick={()=>setView("module")}>Look inside {selected.label.toLowerCase()} ↗</button>}
          {selected.repairs.filter((r)=>r.status!=="resolved").map((r)=><article className="bus3d-repair-card" key={r.id}><strong>{r.issue}</strong><dl><div><dt>Workshop</dt><dd>{r.location || "Not assigned"}</dd></div><div><dt>Reported</dt><dd>{r.reported_date}</dd></div><div><dt>Repair status</dt><dd>{STATUS[r.status]?.label}</dd></div><div className="bus3d-cost"><dt>Recorded cost</dt><dd>{money(r.total_cost)}</dd></div></dl><button className="bus3d-record-link" onClick={()=>document.getElementById(`maintenance-record-${r.id}`)?.scrollIntoView({behavior:"smooth",block:"center"})}>View maintenance record ↗</button></article>)}
          {selected.status==="clear" && <p className="bus3d-empty-message">No active repair is linked to this part. Completed work stays in Resolved records below.</p>}
          {selected.status==="long_maintenance" && <div className="bus3d-warning">⚠ Extended repair. Keep this bus out of rotation until cleared.</div>}
        </div>)}
      </aside>
    </div>
    <div className="bus3d-bottom">
      <div className="bus3d-parts-list" role="group" aria-label="Bus parts">{visible.map((p)=><button key={p.id} aria-pressed={p.id===selected?.id} className={p.id===selected?.id?"active":""} onClick={()=>selectPart(p.id)}><i style={{background:STATUS[p.status].color}} />{p.displayLabel}<span aria-hidden="true">↗</span></button>)}</div>
      {!editor && <div className="bus3d-legend">{['open','in_progress','long_maintenance'].map((s)=><span key={s}><i style={{background:STATUS[s].color}} />{STATUS[s].label}</span>)}</div>}
    </div>
    <div className="bus3d-credit">Illustrated template · Highlights show the recorded part, not an automatic diagnosis. Actual component layouts vary by bus.</div>
  </section>;
}
