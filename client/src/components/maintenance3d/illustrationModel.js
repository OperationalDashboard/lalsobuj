import { DEFAULT_PARTS as LEGACY_PARTS, validateParts as validateLegacyParts } from "./model.js";

export const ILLUSTRATION_STORAGE_KEY = "lsp-maintenance-illustration-local-preview-v2";
export const TEMPLATE_STORAGE_KEY = "lsp-maintenance-illustration-local-preview-v3";
export const ENGINE_LAYOUTS = [
  { value: "rear", label: "Rear engine", description: "One engine at the back" },
  { value: "front", label: "Front engine", description: "One engine at the front" },
  { value: "double", label: "Double engine", description: "Separate front and rear engines" },
];
export const MODULES = [
  { value: "engine", label: "Engine module" },
  { value: "brakes", label: "Brake module" },
  { value: "cooling", label: "Air-conditioning module" },
  { value: "front-glass", label: "Front glass / windshield" },
  { value: "side-glass", label: "Side glass / window" },
  { value: "wiper", label: "Wiper assembly" },
  { value: "seat", label: "Interior seat" },
  { value: "side-mirror", label: "Side mirror" },
  { value: "bus", label: "Bus area (no separate module)" },
];
const POSITIONS = {
  engine: { module: "engine", busX: 13, busY: 53, faultX: 51, faultY: 47 },
  brakes: { module: "brakes", busX: 73, busY: 66, faultX: 65, faultY: 50 },
  ac: { module: "cooling", busX: 47, busY: 21, faultX: 50, faultY: 51 },
  gearbox: { module: "bus", busX: 28, busY: 63, faultX: 50, faultY: 50 },
  "front-wheel": { module: "bus", busX: 73, busY: 73, faultX: 50, faultY: 50 },
  "rear-wheel": { module: "bus", busX: 28, busY: 62, faultX: 50, faultY: 50 },
  lights: { module: "bus", busX: 91, busY: 62, faultX: 50, faultY: 50 },
};
export const DEFAULT_ILLUSTRATED_PARTS = LEGACY_PARTS.map((part) => ({
  ...part, ...POSITIONS[part.id],
  description: part.id === "engine" ? "Rear engine module" : part.description,
}));

export const NEW_ILLUSTRATED_PARTS = [
  { id: "front-glass", label: "Front glass", matchName: "Front glass", module: "front-glass", description: "Front windshield glass and frame", busX: 91, busY: 44, faultX: 50, faultY: 46 },
  { id: "side-glass", label: "Side glass", matchName: "Side glass", module: "side-glass", description: "Passenger-side window glass and frame", busX: 48, busY: 33, faultX: 50, faultY: 45 },
  { id: "wiper", label: "Wiper", matchName: "Wiper", module: "wiper", description: "Windshield wiper blade, arm and linkage", busX: 94, busY: 52, faultX: 54, faultY: 31 },
  { id: "interior-seat", label: "Interior seat", matchName: "Interior seat", module: "seat", description: "Passenger seat, upholstery and mounting base", busX: 63, busY: 37, faultX: 60, faultY: 40 },
  { id: "side-mirror", label: "Side mirror", matchName: "Side mirror", module: "side-mirror", description: "Exterior mirror glass, housing and support arm", busX: 93, busY: 34, faultX: 37, faultY: 40 },
  { id: "engine-front", label: "Second engine", matchName: "Front engine", module: "engine", engineRole: "secondary", description: "Front engine in a double-engine layout; linked separately from the main engine", busX: 89, busY: 64, faultX: 51, faultY: 47 },
];

const isCoordinate = (value) => Number.isFinite(value) && value >= 5 && value <= 95;

export function validateIllustratedParts(parts) {
  if (!Array.isArray(parts) || parts.length > 50) return false;
  const ids = new Set();
  return parts.every((p) => {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || typeof p.label !== "string" || !p.label.trim() || p.label.length > 80 || typeof p.matchName !== "string" || !p.matchName.trim() || typeof p.description !== "string" || p.description.length > 200 || !MODULES.some((m) => m.value === p.module)) return false;
    ids.add(p.id);
    if (p.engineRole !== undefined && !["primary", "secondary"].includes(p.engineRole)) return false;
    if (p.layoutPositions !== undefined && (!p.layoutPositions || typeof p.layoutPositions !== "object" || Array.isArray(p.layoutPositions) || !Object.entries(p.layoutPositions).every(([key, point]) => ENGINE_LAYOUTS.some((layout) => layout.value === key) && point && isCoordinate(point.busX) && isCoordinate(point.busY)))) return false;
    return [p.busX, p.busY, p.faultX, p.faultY].every(isCoordinate);
  });
}

export function validateTemplate(template) {
  return template?.version === 3 && ENGINE_LAYOUTS.some((layout) => layout.value === template.engineLayout) && validateIllustratedParts(template.parts);
}

export function upgradeIllustratedTemplate(oldParts) {
  const parts = structuredClone(validateIllustratedParts(oldParts) ? oldParts : DEFAULT_ILLUSTRATED_PARTS);
  const primary = parts.find((part) => part.id === "engine" && part.module === "engine");
  if (primary) {
    primary.engineRole = "primary";
    if (["Rear engine module", "Rear engine area — illustrative position"].includes(primary.description)) primary.description = "Main engine module — position follows the selected engine layout";
  }
  // Add only the newly requested presets, once. Never recreate a deleted old
  // marker, overwrite an edited ID/label, or discard a user's existing draft.
  for (const preset of NEW_ILLUSTRATED_PARTS) {
    if (parts.length < 50 && !parts.some((part) => part.id === preset.id)) parts.push(structuredClone(preset));
  }
  return { version: 3, engineLayout: "rear", parts };
}

export function partsForEngineLayout(parts, layout) {
  return parts.filter((part) => part.engineRole !== "secondary" || layout === "double").map((part) => {
    const engineLocation = part.module === "engine" && part.engineRole
      ? (part.engineRole === "secondary" || layout === "front" ? "Front" : "Rear") : "";
    const position = part.layoutPositions?.[layout] || (part.engineRole === "primary" && layout === "front" ? { busX: 89, busY: 62 } : {});
    return { ...part, ...position, engineLocation, displayLabel: engineLocation ? `${part.label} · ${engineLocation}` : part.label };
  });
}

export function editPartForLayout(part, patch, layout) {
  if (!part || !ENGINE_LAYOUTS.some((item) => item.value === layout)) return part;
  const { busX, busY, ...fields } = patch;
  if (busX === undefined && busY === undefined) return { ...part, ...fields };
  const shown = partsForEngineLayout([part], layout)[0] || part;
  return { ...part, ...fields, layoutPositions: { ...part.layoutPositions, [layout]: {
    busX: busX ?? shown.busX, busY: busY ?? shown.busY,
  } } };
}

// The previous local draft remains untouched; keep IDs/names and migrate only
// its display configuration into a new, independently saved preview template.
export function migrateIllustratedParts(legacy) {
  if (!validateLegacyParts(legacy)) return structuredClone(DEFAULT_ILLUSTRATED_PARTS);
  return legacy.map((part) => ({ ...part, ...(POSITIONS[part.id] || {
    module: "bus", busX: Math.max(5, Math.min(95, 50 + part.x * 6.5)),
    busY: Math.max(5, Math.min(95, 80 - part.y * 16)), faultX: 50, faultY: 50,
  }) }));
}

export function imagePoint(clientX, clientY, rect) {
  if (!rect.width || !rect.height) return null;
  const clamp = (n) => Math.round(Math.max(5, Math.min(95, n)) * 10) / 10;
  return { x: clamp((clientX - rect.left) / rect.width * 100), y: clamp((clientY - rect.top) / rect.height * 100) };
}
