import { useMemo, useState } from "react";
import { api } from "../api.js";
import SearchableSelect from "./SearchableSelect.jsx";
import { MODELS } from "./maintenance3d/anatomyCatalog.js";
import "./BusModelManager.css";

const blank = { name: "", templateId: "", engineLayout: "front" };
const normalize = (value) => String(value || "").trim().toLowerCase();
export function findSharedBusModel(models, name) {
  if (!name) return null;
  const key = normalize(name);
  return models.find((model) => [model.name, ...(model.aliases || [])].some((alias) => normalize(alias) === key)) || null;
}

export default function BusModelManager({ catalog, buses, onCatalogChange }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(blank);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const template = MODELS.find((item) => item.id === draft.templateId);
  const options = MODELS.map((model) => ({ value: model.id, label: model.label }));
  const models = catalog.models || [];
  const visible = useMemo(() => models.filter((model) => (showArchived || !model.archived) &&
    [model.name, ...(model.aliases || [])].some((name) => normalize(name).includes(normalize(search)))), [models, search, showArchived]);

  function edit(model) {
    setEditingId(model.id);
    setDraft({ name: model.name, templateId: model.templateId, engineLayout: model.engineLayout });
    setError("");
    setNotice("");
  }
  function cancel() { setEditingId(null); setDraft(blank); setError(""); }

  async function mutate(id, changes) {
    setBusy(id || "new"); setError(""); setNotice("");
    try {
      const payload = { revision: catalog.revision, ...changes };
      const result = id ? await api.put(`/settings/bus-models/${encodeURIComponent(id)}`, payload) : await api.post("/settings/bus-models", payload);
      onCatalogChange(result);
      return true;
    } catch (err) {
      setError(err.message || "The model could not be saved. Please try again.");
      // Refresh the revision after a concurrent edit; keep the draft for review.
      try { onCatalogChange(await api.get("/settings/bus-models")); } catch { /* Original error remains visible. */ }
      return false;
    } finally { setBusy(""); }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!draft.name.trim() || !template) { setError("Enter a model name and select its reference template."); return; }
    if (await mutate(editingId, { ...draft, name: draft.name.trim() })) {
      setNotice(editingId ? "Model updated for all linked buses. Previous names still identify their records." : "Shared model added. You can now select it when adding a bus.");
      setEditingId(null); setDraft(blank);
    }
  }
  async function archive(model) {
    if (busy) return;
    if (!model.archived && !window.confirm(`Remove ${model.name} from new bus choices? Existing buses and maintenance records will be kept. You can restore this model later.`)) return;
    if (await mutate(model.id, { archived: !model.archived })) {
      setNotice(model.archived ? `${model.name} restored to bus choices.` : `${model.name} archived. Existing buses and records are unchanged.`);
    }
  }

  return <section className="card shared-model-manager" aria-labelledby="shared-model-title">
    <header className="shared-model-heading">
      <div><span className="shared-model-eyebrow">Super Admin · shared fleet setup</span><h2 id="shared-model-title">Bus model templates</h2><p>Choose one model for all matching buses. Its anatomy, engine position and part changes are shared across those buses.</p></div>
      <span className="shared-model-count">{models.filter((model) => !model.archived).length} active models</span>
    </header>
    <form onSubmit={save} className="shared-model-form" aria-label={editingId ? "Edit shared model" : "Add shared model"}>
      <label>Model name / number<input value={draft.name} maxLength={120} required disabled={Boolean(busy)} placeholder="e.g. Ashok Leyland 1818" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Maintenance reference template<SearchableSelect id="shared-model-reference" value={draft.templateId} options={options} required disabled={Boolean(busy)} placeholder="Search reference templates…" onChange={(value) => setDraft({ ...draft, templateId: value })} /></label>
      <label>Engine position<select value={draft.engineLayout} disabled={Boolean(busy)} onChange={(event) => setDraft({ ...draft, engineLayout: event.target.value })}><option value="front">Front engine</option><option value="rear">Rear engine</option><option value="double">Front and rear engines</option></select></label>
      <div className="shared-model-form-actions"><button type="submit" className="primary" disabled={Boolean(busy)} aria-busy={Boolean(busy)}>{busy === (editingId || "new") ? <><span className="shared-model-spinner" aria-hidden="true" /> Saving…</> : editingId ? "Save model changes" : "+ Add shared model"}</button>{editingId && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={cancel}>Cancel editing</button>}</div>
      <p className="shared-model-reference-note">{template ? `${template.label}: ${template.note || "Use this reference only after checking the actual bus specification."}` : "Reference illustrations are not a guarantee of exact part fitment. Confirm chassis, engine and replacement-part specifications before use."}</p>
    </form>
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p className="shared-model-notice" role="status">{notice}</p>}
    <div className="shared-model-toolbar"><input type="search" aria-label="Search model templates" placeholder="Search model names…" value={search} onChange={(event) => setSearch(event.target.value)} /><label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived models</label></div>
    <div className="shared-model-cards">{visible.map((model) => {
      const reference = MODELS.find((item) => item.id === model.templateId);
      const linked = buses.filter((bus) => findSharedBusModel([model], bus.model)).length;
      return <article key={model.id} className={`shared-model-card${model.archived ? " is-archived" : ""}${editingId === model.id ? " is-editing" : ""}`}>
        <div className="shared-model-card-heading"><h3>{model.name}</h3>{model.archived && <span className="badge">Archived</span>}</div>
        <p>{reference?.label || "Reference unavailable"}</p><div className="shared-model-metadata"><span>{model.engineLayout === "double" ? "Front + rear engines" : model.engineLayout === "rear" ? "Rear engine" : "Front engine"}</span><span>{linked} linked {linked === 1 ? "bus" : "buses"}</span></div>
        {(model.aliases || []).length > 0 && <small>Previous names retained: {model.aliases.join(", ")}</small>}
        <div className="shared-model-card-actions"><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => edit(model)}>Edit model</button><button type="button" className={model.archived ? "secondary" : "link-danger"} disabled={Boolean(busy)} aria-busy={busy === model.id} onClick={() => archive(model)}>{busy === model.id ? "Saving…" : model.archived ? "Restore model" : "Remove from choices"}</button></div>
      </article>;
    })}</div>
    {!visible.length && <p className="empty">{search ? "No models match your search." : "No models here yet. Add a shared model above."}</p>}
    <p className="shared-model-footer">Removing a model archives it; it never deletes buses or historical data. To edit its parts, open the linked bus in Maintenance → Bus anatomy.</p>
  </section>;
}
