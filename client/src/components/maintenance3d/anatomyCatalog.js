import { FLEET_PAPER_MODELS } from "./fleetPaperProfiles.js";
// Researched reference data, never operational bus records or supplier quotations.
export const ANATOMY_VERSION = "1.26.0-preview.6";
export const RESEARCH_DATE = "2026-09-10";
export const ANATOMY_STORAGE_KEY = "lsp-local-bus-anatomy-v1";
export const SOURCES = {
  eicher: { name: "Eicher Bangladesh · 10.90L specifications", url: "https://www.eichertrucksandbuses.com/international-business/bangladesh/products/10.90-l-bus-chassis" },
  eicherRange: { name: "Eicher Bangladesh · bus range", url: "https://www.eichertrucksandbuses.com/international-business/bangladesh/products" },
  isuzu: { name: "Isuzu Bangladesh · MT Bus", url: "https://isuzu.com.bd/models/mt-bus" },
  al160: { name: "IFAD · B 1616 Super", url: "https://ifadautos.com/vehicles/b-1616-super" },
  al180: { name: "IFAD · 12M Prime EX", url: "https://ifadautos.com/vehicles/12m-prime-ex" },
  tata: { name: "Tata Bangladesh · published range", url: "https://www.tatamotors.com.bd/" },
  piston: { name: "MAHLE · piston systems (general reference)", url: "https://www.mahle.com/en/products-and-services/passenger-cars/piston-systems/" },
  cylinder: { name: "MAHLE · cylinder components (general reference)", url: "https://www.pl.mahle.com/en/products-and-services/passenger-cars/cylinder-components/" },
  engine: { name: "MAHLE · engine components", url: "https://www.mahle-aftermarket.com/eu/en/products/engine-components/" },
  injector: { name: "Bosch · injectors", url: "https://www.bosch-mobility.com/en/solutions/injectors/" },
  rail: { name: "Bosch · common-rail systems (general reference)", url: "https://www.bosch-mobility.com/en/solutions/powertrain/diesel/common-rail-system-piezo/" },
  filters: { name: "MAHLE · filtration", url: "https://www.mahle-aftermarket.com/eu/en/products/filters/" },
  thermal: { name: "DENSO · AC and engine cooling", url: "https://www.denso-am.eu/products/ac-engine-cooling" },
  electrical: { name: "DENSO · starters and alternators", url: "https://www.denso-am.eu/overview/starters-alternators" },
  suspension: { name: "ZF · commercial-vehicle suspension", url: "https://aftermarket.zf.com/en/aftermarket-portal/our-portfolio/trucks-trailers-buses/products/shock-absorbers-dampers/" },
  eicherParts: { name: "Eicher Bangladesh · Dial-A-Part", url: "https://www.eichertrucksandbuses.com/international-business/bangladesh/after-sales-services" },
};

export const MODELS = [
  { id: "eicher-1090", label: "Eicher 10.90L / 1090", make: "Eicher", status: "candidate", reference: "10.90L · Bangladesh specification", engine: "E483 TCI BS III", power: "110 HP", transmission: "ET35S5", cylinders: "4 in-line", fuelSystem: "unknown", suspension: "leaf", source: "eicher", note: "Published 10.90L specification. Confirm the suffix and year of your 1090 minibus before assigning parts." },
  { id: "isuzu-mt", label: "Isuzu MT", make: "Isuzu", status: "partial", reference: "MT Bus · Bangladesh listing", source: "isuzu", note: "MT is listed locally. Exact chassis suffix, engine code and year are still needed." },
  { id: "al-160", label: "Ashok Leyland 160", make: "Ashok Leyland", status: "candidate", reference: "Possible match: B 1616 Super", engine: "H-series · 5.7 L", power: "160 HP", transmission: "ZF · 6-speed overdrive", fuelSystem: "mechanical", source: "al160", note: "B 1616 Super is a candidate, not a confirmed match to your bus. Its published specification lists mechanical Bosch in-line injection." },
  { id: "al-1818", label: "Ashok Leyland 1818", make: "Ashok Leyland", status: "pending", note: "Exact chassis/engine specification not verified. No other 180 HP model has been substituted." },
  { id: "air-225", label: "225 Air Suspension", make: "Unconfirmed", status: "pending", suspension: "air-reported", note: "Air suspension is user-reported. Confirm manufacturer, chassis model and engine code; 225 alone is not a part identifier." },
  { id: "air-180", label: "180 Air Suspension", make: "Unconfirmed", status: "candidate", reference: "Possible match: Ashok Leyland 12M Prime EX", engine: "H-series · 5.7 L", power: "180 HP", transmission: "ZF · 6-speed overdrive", fuelSystem: "mechanical", suspension: "air", source: "al180", note: "Candidate only: IFAD lists the 12M Prime EX with Weveller-air suspension and mechanical in-line injection. Confirm your manufacturer and model." },
  { id: "tata-1680", label: "Tata 1680", make: "Tata", status: "pending", source: "tata", note: "The exact 1680 designation was not verified. We have not replaced it with 1616 or 1618." },
  { id: "eicher-1060", label: "Eicher 10.60G", make: "Eicher", status: "partial", source: "eicherRange", note: "Listed in the Bangladesh range. Included for research, not confirmed as a company-owned bus. Engine variant and year await confirmation." },
  { id: "eicher-2015m", label: "Eicher Skyline 20.15M", make: "Eicher", status: "partial", source: "eicherRange", note: "Listed in the Bangladesh range. This is a separate template from 20.15N; detailed equipment is not assigned yet." },
  { id: "eicher-2015n", label: "Eicher Skyline 20.15N", make: "Eicher", status: "partial", source: "eicherRange", note: "Listed in the Bangladesh range. Confirm which Eicher models your fleet actually operates." },
  { id: "hino-1j-160", label: "Hino 1J · 160 HP (reported)", make: "Hino", status: "pending", note: "1J and reported horsepower do not identify an exact engine. Chassis and engine plates are needed; no J08C variant has been assumed." },
  { id: "hino-1j-205", label: "Hino 1J · 205 HP (reported)", make: "Hino", status: "pending", note: "Kept separate from the reported 160 HP bus. Engine code, suffix, fuel system and replacement history remain unverified." },
  ...FLEET_PAPER_MODELS,
];

export const SYSTEMS = [
  { id: "engine", label: "Engine", subtitle: "Power, fuel & lubrication", symbol: "01", groups: ["Core engine", "Valve train", "Fuel & intake", "Lubrication"] },
  { id: "cooling", label: "Engine cooling", subtitle: "Temperature & coolant", symbol: "02", groups: ["Coolant circuit"] },
  { id: "driveline", label: "Transmission & steering", subtitle: "From engine to wheels", symbol: "03", groups: ["Driveline", "Steering"] },
  { id: "brakes", label: "Brakes & air supply", subtitle: "Stopping & compressed air", symbol: "04", groups: ["Air supply", "Wheel brakes"] },
  { id: "suspension", label: "Suspension", subtitle: "Support & ride control", symbol: "05", groups: ["Springs", "Ride control"] },
  { id: "electrical", label: "Electrical", subtitle: "Starting, charging & lighting", symbol: "06", groups: ["Starting & charging", "Lighting"] },
  { id: "ac", label: "Air conditioning", subtitle: "Cabin cooling circuit", symbol: "07", groups: ["Refrigerant circuit"] },
  { id: "body", label: "Body & interior", subtitle: "Glass, seats & visibility", symbol: "08", groups: ["Glass & visibility", "Passenger cabin"] },
];

// Short original educational descriptions. References explain component families;
// they do NOT establish fitment, part numbers or exact locations on any bus.
const part = (id, system, group, name, purpose, source, options = {}) => ({ id, system, group, name, purpose, source, ...options });
export const PARTS = [
  part("piston", "engine", "Core engine", "Piston", "Receives combustion force and passes it through the connecting rod to the crankshaft.", "piston"),
  part("rings", "engine", "Core engine", "Piston rings", "Help seal combustion gases and control oil on the cylinder wall.", "cylinder"),
  part("pin", "engine", "Core engine", "Piston pin", "Joins the piston to the connecting rod while allowing relative movement.", "cylinder"),
  part("rod", "engine", "Core engine", "Connecting rod", "Transfers force and movement between the piston and crankshaft.", "cylinder"),
  part("liner", "engine", "Core engine", "Cylinder liner / bore", "Provides the running surface for the piston and rings. Liner construction depends on the engine.", "cylinder"),
  part("bearings", "engine", "Core engine", "Main & connecting-rod bearings", "Support moving shafts and rods while working with an oil film to limit friction.", "cylinder"),
  part("crankshaft", "engine", "Core engine", "Crankshaft", "Converts piston movement into rotation delivered to the driveline.", null),
  part("block", "engine", "Core engine", "Cylinder block", "Forms the main engine structure, supporting cylinders and crankshaft bearing locations.", null),
  part("head", "engine", "Valve train", "Cylinder head", "Closes the cylinder tops and carries combustion, valve and gas-passage features.", "engine"),
  part("gasket", "engine", "Valve train", "Head gasket", "Seals the joint between head and block, separating combustion, coolant and oil passages.", "engine"),
  part("valves", "engine", "Valve train", "Intake & exhaust valves", "Control when fresh air enters and exhaust gas leaves the cylinder.", "engine"),
  part("camshaft", "engine", "Valve train", "Camshaft & valve actuation", "Times valve movement. The shaft location and actuation arrangement vary by engine.", "engine"),
  part("timing", "engine", "Valve train", "Timing drive", "Keeps crankshaft and valve timing coordinated; drive type must be checked for the exact engine.", null),
  part("injector", "engine", "Fuel & intake", "Fuel injector / nozzle", "Meters and atomizes fuel for combustion. Mechanical and electronic designs are not interchangeable.", "injector"),
  part("injection-pump", "engine", "Fuel & intake", "In-line injection pump", "Pressurizes and meters diesel for the injectors in a mechanical injection system.", "al160", { requires: "mechanical" }),
  part("common-rail", "engine", "Fuel & intake", "Common rail & high-pressure pump", "The pump supplies pressurized fuel; the rail distributes it to electronically controlled injectors.", "rail", { requires: "common-rail" }),
  part("air-filter", "engine", "Fuel & intake", "Air filter", "Removes particles from incoming engine air to reduce wear.", "filters"),
  part("fuel-filter", "engine", "Fuel & intake", "Fuel filter / water separator", "Filters contamination from fuel; water-separating designs also collect water before injection equipment.", "filters"),
  part("turbo", "engine", "Fuel & intake", "Turbocharger", "Uses exhaust energy to compress intake air. Presence and specification require engine confirmation.", null),
  part("intercooler", "engine", "Fuel & intake", "Intercooler", "Cools compressed intake air between the turbocharger and engine.", "thermal"),
  part("oil-pump", "engine", "Lubrication", "Oil pump", "Circulates oil through engine lubrication passages to moving components.", null),
  part("oil-filter", "engine", "Lubrication", "Oil filter", "Removes particles from circulating oil to protect lubricated engine components.", "filters"),
  part("oil-cooler", "engine", "Lubrication", "Oil cooler", "Transfers heat out of lubricating oil. Cooling medium and layout depend on the engine.", null),
  part("sump", "engine", "Lubrication", "Oil sump", "Collects and stores returning engine oil in a wet-sump system.", null),
  part("radiator", "cooling", "Coolant circuit", "Radiator", "Transfers heat from the engine coolant into outside air.", "thermal"),
  part("water-pump", "cooling", "Coolant circuit", "Coolant pump", "Circulates coolant through the engine and cooling circuit.", null),
  part("thermostat", "cooling", "Coolant circuit", "Thermostat", "Regulates coolant flow according to temperature to support the engine's operating temperature.", null),
  part("fan", "cooling", "Coolant circuit", "Cooling fan", "Moves air through the cooling pack when natural airflow is insufficient.", "thermal"),
  part("clutch", "driveline", "Driveline", "Clutch", "Connects or separates engine torque from the gearbox during starting and gear changes.", null),
  part("gearbox", "driveline", "Driveline", "Gearbox", "Selects ratios to balance wheel torque and road speed.", null),
  part("propshaft", "driveline", "Driveline", "Propeller shaft", "Transmits torque between separated driveline assemblies.", null),
  part("differential", "driveline", "Driveline", "Differential", "Lets driven wheels turn at different speeds while transmitting torque.", null),
  part("steering", "driveline", "Steering", "Steering gear & linkage", "Transfers the driver's steering input to the road wheels.", null),
  part("compressor", "brakes", "Air supply", "Air compressor", "Supplies compressed air for pneumatic systems; brake-system design must be verified.", null),
  part("air-dryer", "brakes", "Air supply", "Air dryer", "Reduces moisture in compressed-air systems.", "filters"),
  part("reservoir", "brakes", "Air supply", "Air reservoir", "Stores compressed air for pneumatic brake operation.", null),
  part("brake-chamber", "brakes", "Wheel brakes", "Brake chamber", "Converts air pressure into mechanical movement at the wheel brake.", null),
  part("brake-friction", "brakes", "Wheel brakes", "Brake shoes / pads", "Apply friction to a drum or disc to slow the wheel. Do not assume both brake types are fitted.", null),
  part("leaf-spring", "suspension", "Springs", "Leaf spring", "Supports load and flexes to absorb road movement.", null, { requires: "leaf" }),
  part("air-spring", "suspension", "Springs", "Air spring / bellows", "Uses a pressurized air chamber to support the vehicle and accommodate suspension movement.", "suspension", { requires: "air" }),
  part("levelling", "suspension", "Ride control", "Ride-height control", "Adjusts air-suspension pressure to maintain the intended vehicle height.", "suspension", { requires: "air" }),
  part("damper", "suspension", "Ride control", "Shock absorber", "Damps suspension oscillation so the bus settles after road disturbances.", "suspension"),
  part("antiroll", "suspension", "Ride control", "Anti-roll bar", "Resists unequal suspension movement to help limit body roll.", null),
  part("starter", "electrical", "Starting & charging", "Starter motor", "Cranks the engine so combustion can begin.", "electrical"),
  part("alternator", "electrical", "Starting & charging", "Alternator", "Generates electrical power while the engine runs and supports battery charging.", "electrical"),
  part("battery", "electrical", "Starting & charging", "Battery", "Stores electrical energy for starting and other electrical loads.", null),
  part("lights", "electrical", "Lighting", "Headlamps & signal lamps", "Provide forward visibility and communicate vehicle movement or warnings.", null),
  part("ac-compressor", "ac", "Refrigerant circuit", "AC compressor", "Compresses and circulates refrigerant through the cabin cooling circuit.", "thermal"),
  part("condenser", "ac", "Refrigerant circuit", "Condenser", "Rejects refrigerant heat to outside air.", "thermal"),
  part("expansion", "ac", "Refrigerant circuit", "Expansion device", "Controls refrigerant flow into the evaporator and lowers its pressure.", "thermal"),
  part("evaporator", "ac", "Refrigerant circuit", "Evaporator & blower", "The evaporator absorbs cabin heat; the blower moves air across it.", "thermal"),
  part("windscreen", "body", "Glass & visibility", "Front glass", "Provides forward visibility and a weather barrier; dimensions depend on the body builder.", null),
  part("side-glass", "body", "Glass & visibility", "Side glass", "Provides side visibility and passenger-cabin weather protection.", null),
  part("wiper", "body", "Glass & visibility", "Wiper & washer", "Clear water and dirt from the driver's viewing area.", null),
  part("mirror", "body", "Glass & visibility", "Side mirror", "Provides rearward and side views; mounting and mirror dimensions vary by body.", null),
  part("seat", "body", "Passenger cabin", "Passenger seat", "Supports the passenger; frame, mounting and restraint arrangement depend on the fitted seat.", null),
  part("door", "body", "Passenger cabin", "Passenger door", "Controls passenger entry and exit; manual and powered mechanisms require different parts.", null),
];

export function partsForModel(model, parts = PARTS) {
  return parts.filter(p => !(model.fuelSystem === "mechanical" && p.requires === "common-rail")
    && !(model.suspension === "leaf" && p.requires === "air"));
}
export function fitmentLabel(model, part) {
  if (part.custom) return "User-added · not independently verified";
  if (part.requires === "mechanical" && model.fuelSystem !== "mechanical") return "Alternative system · fitment unconfirmed";
  if (part.requires === "common-rail") return "Alternative system · fitment unconfirmed";
  if (part.requires === "air" && !["air", "air-reported"].includes(model.suspension)) return "If equipped · air suspension unconfirmed";
  return "General anatomy · exact fitment unverified";
}
export function readAnatomyDraft(storage) {
  try {
    const data = JSON.parse((storage || globalThis.localStorage)?.getItem(ANATOMY_STORAGE_KEY));
    if (data?.version === 1 && Array.isArray(data.edits)) {
      // Only known editable fields survive reload; source/fitment metadata is immutable.
      const unique = new Map();
      for (const edit of data.edits.filter(validEdit)) {
        const { modelId, partId, name, purpose, note, system, hidden, custom, updatedAt } = edit;
        unique.set(`${modelId}/${partId}`, { modelId, partId, name, purpose, note, system, hidden, custom: custom === true, updatedAt: typeof updatedAt === "string" ? updatedAt : "" });
      }
      return [...unique.values()];
    }
  } catch { /* A corrupt local draft must not prevent inspection. */ }
  return [];
}
export function validEdit(edit) {
  return edit && (MODELS.some(m => m.id === edit.modelId) || (typeof edit.modelId === "string" && edit.modelId.startsWith("fleet-"))) && typeof edit.partId === "string"
    && edit.partId.length < 100 && typeof edit.name === "string" && edit.name.trim().length > 0
    && edit.name.length <= 90 && typeof edit.purpose === "string" && edit.purpose.length <= 800
    && typeof edit.note === "string" && edit.note.length <= 1200
    && SYSTEMS.some(s => s.id === edit.system) && typeof edit.hidden === "boolean"
    && ((edit.custom === true && edit.partId.startsWith("custom-")) || (!edit.custom && PARTS.some(p => p.id === edit.partId && p.system === edit.system)));
}
export function catalogForModel(model, edits) {
  const own = edits.filter(e => e.modelId === model.id);
  const base = PARTS.map(p => { const e = own.find(x => x.partId === p.id && !x.custom); return e ? { ...p, ...e, id: p.id, edited: true } : p; });
  const custom = own.filter(e => e.custom).map(e => ({ ...e, id: e.partId, group: "Your components", source: null }));
  return partsForModel(model, [...base, ...custom]);
}
