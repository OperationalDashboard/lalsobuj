import { Component, useEffect, useMemo, useRef, useState } from "react";
import { api, getUser } from "../../api.js";
import { busLabel } from "../../busLabel.js";
import SearchableSelect from "../SearchableSelect.jsx";
import BusAnatomyPreview from "./BusAnatomyPreview.jsx";
import { MODELS } from "./anatomyCatalog.js";

const normalize = value => String(value || "").trim().toLocaleLowerCase();

// This boundary keeps an optional graphics failure separate from the repair workflow.
class AnatomyBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="card" role="alert"><h3>3D reference could not be displayed</h3><p>Your maintenance records are still available below. Close and reopen this reference to try again.</p></div>;
    return this.props.children;
  }
}

export default function SharedBusAnatomy({ buses = [] }) {
  const [catalog, setCatalog] = useState(null);
  const catalogRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busId, setBusId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = getUser()?.role === "super_admin";

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api.get("/settings/bus-models").then(data => {
      if (!data || !Array.isArray(data.models)) throw new Error("The shared model catalog is unavailable.");
      if (!cancelled) { catalogRef.current = data; setCatalog(data); }
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const bus = buses.find(item => String(item.id) === busId);
  const model = catalog?.models.find(item => item.id === bus?.model || [item.name, ...(item.aliases || [])].some(name => normalize(name) === normalize(bus?.model) && normalize(name)));
  const template = model && MODELS.find(item => item.id === model.templateId);
  const referenceModels = useMemo(() => {
    if (!model || !template) return [];
    // A template is not proof that another vehicle has the paper donor's exact equipment.
    // Keep registration, chassis numbers and other donor-bus identity fields out of this view.
    const isPaperTemplate = !!template.paperBacked;
    return [{
      id: model.id, label: model.name, make: template.make,
      reference: `Assigned reference: ${template.label}`,
      status: "partial", paperBacked: false,
      engine: isPaperTemplate ? "Model-specific verification required" : template.engine,
      power: isPaperTemplate ? "Not verified for this bus" : template.power,
      cylinders: isPaperTemplate ? "Not verified for this bus" : template.cylinders,
      cylinderCount: isPaperTemplate ? undefined : template.cylinderCount,
      cylinderEvidence: isPaperTemplate ? undefined : template.cylinderEvidence,
      transmission: isPaperTemplate ? "Not verified for this bus" : template.transmission,
      suspension: isPaperTemplate ? undefined : template.suspension,
      source: isPaperTemplate ? undefined : template.source,
      note: "All buses assigned to this model share the same reference components. Engine layout is configured by Super Admin. Shapes, positions and fitment remain illustrative until verified against the actual bus and manufacturer documentation.",
    }];
  }, [model, template]);

  async function saveEdits(edits) {
    if (!canEdit || !model) throw new Error("Only Super Admin can edit model components.");
    const current = catalogRef.current;
    const currentModel = current?.models.find(item => item.id === model.id);
    if (!currentModel) throw new Error("The model is no longer available. Reload the reference.");
    const data = await api.put(`/settings/bus-models/${encodeURIComponent(model.id)}`, {
      ...currentModel, revision: current.revision,
      edits: edits.filter(item => item.modelId === model.id),
    });
    if (!data || !Array.isArray(data.models)) throw new Error("Could not verify the saved model. Reload before making further changes.");
    catalogRef.current = data; setCatalog(data);
  }

  return <AnatomyBoundary key={reloadKey}>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="settings-card-heading"><div><span className="settings-eyebrow">MODEL REFERENCE</span><h3>Choose a bus to explore</h3><p>Select its model when adding or editing the bus on the Buses page. Buses assigned to the same model share component changes.</p></div></div>
      <label className="live-field"><span>Bus number</span><SearchableSelect id="shared-anatomy-bus" value={busId} placeholder="Search and select a bus" options={buses.map(item => ({ value: String(item.id), label: `${busLabel(item)}${item.model ? ` · ${item.model}` : " · No model assigned"}` }))} onChange={setBusId} /></label>
      {loading && <p role="status">Loading shared models…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="secondary" disabled={loading} onClick={() => setReloadKey(value => value + 1)}>Reload model reference</button>
      {!loading && !error && bus && !model && <p role="status">This bus has no linked model reference yet. Choose a shared model in Buses → Edit bus. Super Admin can add or edit model templates there.</p>}
      {!loading && !error && model && !template && <p role="status">This model needs a supported reference template. Super Admin can edit it in Buses → Manage model templates.</p>}
      {!loading && !error && model?.archived && <p role="status">This model is removed from new-bus choices. Its existing bus links and reference history remain available.</p>}
    </div>
    {!loading && !error && bus && model && template && <BusAnatomyPreview key={model.id} shared canEdit={canEdit}
      suppliedModels={referenceModels} initialModel={model.id} suppliedEdits={model.edits || []}
      suppliedEngineLayout={model.engineLayout} onSaveEdits={saveEdits} />}
  </AnatomyBoundary>;
}
