import { PARTS, SYSTEMS } from "./anatomyCatalog.js";
import { TEMPLATE_STORAGE_KEY, validateTemplate } from "./illustrationModel.js";

export function readAnatomyLayout(storage) {
  try { const data = JSON.parse((storage || globalThis.localStorage)?.getItem(TEMPLATE_STORAGE_KEY)); if (validateTemplate(data)) return data.engineLayout; } catch { /* Optional local template. */ }
  return "rear";
}

// Names and regions are a generic navigation map, not measured fleet locations.
export function busTargets(layout = "rear") {
  const engines = layout === "double" ? ["front", "rear"] : [layout === "front" ? "front" : "rear"];
  return [
    ...engines.map(end => ({ id: `zone-engine-${end}`, name: `${end === "front" ? "Front" : "Rear"} engine`, system: "engine", partId: "piston", location: `${end} engine bay` })),
    { id: "zone-cooling", name: "Engine cooling", system: "cooling", partId: "radiator", location: "engine-bay cooling pack" },
    { id: "zone-driveline", name: "Transmission & steering", system: "driveline", partId: "propshaft", location: "underfloor driveline" },
    { id: "zone-brakes", name: "Wheel brakes", system: "brakes", partId: "brake-friction", location: "wheel-end brake assembly" },
    { id: "zone-suspension", name: "Suspension", system: "suspension", partId: "damper", location: "axle suspension" },
    { id: "zone-electrical", name: "Battery & electrical", system: "electrical", partId: "battery", location: "illustrative electrical bay" },
    { id: "zone-ac", name: "Air conditioning", system: "ac", partId: "evaporator", location: "illustrative roof-mounted AC unit" },
    { id: "zone-body", name: "Body & interior", system: "body", partId: "seat", location: "passenger cabin and body" },
    ...["windscreen", "side-glass", "wiper", "mirror", "seat", "door", "lights"].map(id => {
      const part = PARTS.find(p => p.id === id);
      return { id, name: part.name, system: part.system, partId: id, location: ({ windscreen: "front windscreen", "side-glass": "passenger-side window", wiper: "front windscreen wiper", mirror: "front exterior mirror", seat: "passenger cabin", door: "passenger entrance", lights: "front lighting unit" })[id], direct: true };
    }),
  ];
}

export function availableBusTargets(catalog, layout) {
  return busTargets(layout).flatMap(target => {
    const available = catalog.filter(p => !p.hidden && p.system === target.system);
    const part = available.find(p => p.id === target.partId) || (!target.direct && available[0]);
    return part ? [{ ...target, partId: part.id, purpose: `Open ${SYSTEMS.find(s => s.id === target.system)?.label}. Illustrative location: ${target.location}.` }] : [];
  });
}

export function resolveBusTarget(id, catalog, layout) {
  return availableBusTargets(catalog, layout).find(t => t.id === id) || null;
}

export function locatePartOnBus(part, catalog, layout, preferredTarget) {
  if (!part) return null;
  const available = availableBusTargets(catalog, layout);
  return available.find(t => t.id === part.id) || available.find(t => t.id === preferredTarget && t.system === part.system)
    || available.find(t => t.system === part.system) || null;
}
