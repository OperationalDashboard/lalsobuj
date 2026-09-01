// Imported fleet rows retain a unique internal key (for example
// "FLEETS-001 | 14-6868") so duplicate printed numbers do not collide.
// This helper is the one display rule for the application: staff always see
// the actual Bus Number, never the internal import prefix.
export function busLabel(bus) {
  const source = String(bus?.source_bus_number ?? "").trim();
  if (source) return source;
  const internal = String(bus?.reg_number ?? "").trim();
  const imported = internal.match(/^FLEETS-\d+\s*\|\s*(.+)$/i);
  return imported?.[1]?.trim() || internal || "—";
}
