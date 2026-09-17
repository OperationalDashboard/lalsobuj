export const STORAGE_KEY = "lsp-maintenance-3d-local-preview-v1";
export const STATUS = {
  open: { label: "Open", color: "#fb7185" },
  in_progress: { label: "In progress", color: "#fb923c" },
  long_maintenance: { label: "Long maintenance", color: "#facc15" },
  resolved: { label: "Resolved", color: "#34d399" },
  clear: { label: "No active repair", color: "#91a6bd" },
};
export const DEFAULT_PARTS = [
  { id: "engine", label: "Engine", matchName: "Engine", x: -5.2, y: 1.15, z: 1.35, description: "Rear engine area — illustrative position" },
  { id: "brakes", label: "Front brakes", matchName: "Front brakes", x: 3.2, y: .55, z: 1.4, description: "Front axle and braking system" },
  { id: "ac", label: "Air conditioning", matchName: "Air conditioning", x: -.5, y: 3.1, z: .1, description: "Roof cooling unit — adjust for your bus" },
  { id: "gearbox", label: "Gearbox", matchName: "Gearbox", x: -3.8, y: .7, z: 1.2, description: "Transmission area" },
  { id: "front-wheel", label: "Front tyre", matchName: "Front tyre", x: 3.2, y: .55, z: -1.4, description: "Front tyre on the opposite side" },
  { id: "rear-wheel", label: "Rear tyre", matchName: "Rear tyre", x: -2.9, y: .55, z: 1.4, description: "Rear tyre and wheel" },
  { id: "lights", label: "Headlights", matchName: "Headlights", x: 5.9, y: .8, z: .8, description: "Front lighting" },
];
export const normalize = (value) => String(value || "").trim().toLocaleLowerCase();
export function validateParts(parts) {
  if (!Array.isArray(parts) || parts.length > 50) return false;
  const ids = new Set();
  return parts.every((p) => {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || typeof p.label !== "string" || !p.label.trim() || p.label.length > 80 || typeof p.matchName !== "string" || typeof p.description !== "string") return false;
    ids.add(p.id);
    return [[p.x,-6.5,6.5],[p.y,0,4],[p.z,-2,2]].every(([v,min,max]) => Number.isFinite(v) && v >= min && v <= max);
  });
}
export function getPartRepairs(part, tickets, busId) {
  return tickets.filter((t) => String(t.bus_id) === String(busId) && t.parts?.some((p) => normalize(p.part_name) === normalize(part.matchName)));
}
export function partStatus(records) {
  return ["long_maintenance", "open", "in_progress"].find((s) => records.some((r) => r.status === s)) || "clear";
}
