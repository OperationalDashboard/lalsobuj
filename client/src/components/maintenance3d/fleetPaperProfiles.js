// LOCAL PREVIEW ONLY. Technical readings from the user's 2026-09-10 photo batch.
// Do not seed operational buses from these records or publish the paper images.
// Full VINs, serials, owners, addresses, signatures and payment data stay out.
export const PAPER_BATCH_DATE = "2026-09-10";
export const FLEET_DRAFT_STORAGE_KEY = "lsp-local-bus-fleet-v1";
export const PAPER_BATCH_SUMMARY = "12 photos · 8 identified buses · supporting/duplicate papers grouped · 1 handwritten form unassigned";
export const PAPER_SOURCES = {
  "01": "Tax-payment certificate · 11.39.32 PM.jpeg",
  "02": "Fitness certificate · 11.39.33 PM (1).jpeg",
  "03": "Fitness certificate · 11.39.33 PM.jpeg",
  "04": "Fitness certificate · 11.39.34 PM (1).jpeg",
  "05": "Registration acknowledgement · 11.39.34 PM.jpeg",
  "06": "Duplicate fitness photo · 11.39.35 PM.jpeg",
  "07": "Tax token · 11.39.36 PM (1).jpeg",
  "09": "Fitness certificate · 11.39.37 PM (1).jpeg",
  "10": "Tax token · 11.39.37 PM (2).jpeg",
  "11": "Route-permit certificate · 11.39.37 PM.jpeg",
  "12": "Tax token · 11.39.38 PM.jpeg",
};

const leyland = {
  make: "Ashok Leyland", engine: "Exact engine model not printed",
  cylinderCount: 6, cylinders: "6 · recorded on paper", cylinderEvidence: "paper",
  displacementCc: 5759,
  note: "Six cylinders and 5,759 cc are recorded. This does not establish which Leyland 160, 1818, 180-air or 225-air variant is fitted. Horsepower, injection type, suspension and engine position remain unverified.",
};
const vehicles = [
  { ...leyland, registration: "12-1834", body: "Omnibus (medium)", year: "2022 · vehicle description", seats: 41, papers: ["01"] },
  { ...leyland, registration: "15-8092", body: "Omnibus (large)", year: "2020 · manufacture", seats: 33, includesDriver: true, papers: ["02", "05"] },
  { ...leyland, registration: "12-1833", body: "Omnibus (medium)", year: "2022 · vehicle description", seats: 41, papers: ["03"] },
  { ...leyland, registration: "12-2557", body: "Omnibus (large)", year: "2022 · vehicle description", seats: 41, papers: ["04", "06"] },
  { registration: "15-5217", make: "Isuzu", reference: "MT134 chassis-family reading", chassisFamily: "JALMT134", engine: "Exact engine model not printed",
    cylinderCount: 6, cylinders: "6 · recorded on paper", cylinderEvidence: "paper", displacementCc: 7790,
    body: "Omnibus (large)", year: "2018 · vehicle description", seats: 41, papers: ["07", "11"],
    note: "The MT134 chassis prefix and 7,790 cc narrow the model research. The numeric engine serial does not identify its model. Exact engine suffix, horsepower, suspension and engine position remain unverified." },
  { registration: "14-6184", make: "Hino", reference: "AK1J chassis / J08C engine family", chassisFamily: "AK1JMKA", engine: "J08C family · J08C-F prefix",
    cylinderCount: 6, cylinders: "6 · recorded on paper", cylinderEvidence: "paper", displacementCc: 7961,
    body: "Omnibus (medium)", year: "2011 · vehicle description (photo reading)", seats: 37, papers: ["09"],
    note: "The paper identifies Hino, a J08C engine-number prefix, six cylinders and 7,961 cc. It does not distinguish the company's reported 160 HP and 205 HP variants or confirm the current installation." },
  { registration: "14-6183", make: "Hino-family reading", reference: "AK1JMKA / J08C-F identifiers", chassisFamily: "AK1JMKA", engine: "J08C family · J08C-F prefix",
    cylinders: "Not printed on this tax token", body: "Not printed", year: "18 Oct 2011 · registration, not manufacture", seats: 37, papers: ["10"],
    note: "The chassis and engine prefixes support Hino/J08C-family research. This token does not separately print the make, cylinder count or displacement. Do not copy the adjacent bus's specifications or assign 160/205 HP." },
  { registration: "15-8505", make: "Make / model unconfirmed", reference: "Bus identity needs more evidence", engine: "Exact engine model not printed",
    cylinders: "Not printed on this tax token", body: "Not printed", year: "09 Nov 2021 · registration, not manufacture", seats: 41, papers: ["12"],
    note: "The tax token confirms this registration and recorded seats, but not the exact bus or engine model. No Leyland variant, engine displacement, cylinder count, suspension or installation has been assigned." },
];

export const FLEET_PAPER_MODELS = vehicles.map(vehicle => ({
  ...vehicle,
  id: `paper-${vehicle.registration}`,
  label: `${vehicle.registration} · ${vehicle.make}`,
  fullRegistration: `DHAKA METRO-BA-${vehicle.registration}`,
  status: "documented",
  reference: vehicle.reference || `${vehicle.make} · ${vehicle.body}`,
  paperBacked: true,
}));

export function paperFacts(model) {
  return [
    ["Bus number", model.fullRegistration],
    ["Make / family reading", model.make],
    ["Engine / family reading", model.engine],
    ["Cylinders on paper", model.cylinders],
    ["Engine capacity on paper", model.displacementCc ? `${model.displacementCc.toLocaleString("en-US")} cc` : "Not printed"],
    ["Seats on paper", `${model.seats}${model.includesDriver ? " · including driver" : " · driver inclusion not established"}`],
    ["Year evidence", model.year],
    ["Body description", model.body],
  ];
}

export function validFleetDraft(item) {
  return item && typeof item.id === "string" && item.id.startsWith("fleet-")
    && /^[A-Za-z0-9][A-Za-z0-9 .\/-]{1,39}$/.test(String(item.registration || "").trim())
    && FLEET_PAPER_MODELS.some(m => m.id === item.templateId)
    && Number.isInteger(item.seats) && item.seats > 0 && item.seats <= 200
    && typeof item.note === "string" && item.note.length <= 500;
}

export function readFleetDraft(storage) {
  try {
    const raw = (storage || globalThis.localStorage)?.getItem(FLEET_DRAFT_STORAGE_KEY);
    const data = JSON.parse(raw || "[]");
    return Array.isArray(data) ? data.filter(validFleetDraft) : [];
  } catch { return []; }
}

export function makeFleetProfile(template, registration, seats, note = "") {
  const clean = String(registration).trim();
  return { ...template, id: `fleet-${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
    registration: clean, fullRegistration: `DHAKA METRO-BA-${clean}`, label: `${clean} · ${template.make}`,
    seats: Number(seats), includesDriver: false, papers: [], paperBacked: true, customFleet: true,
    templateId: template.id, note: note.trim() || `Added locally using ${template.label} as the anatomy template. Confirm this bus's plates before ordering parts.` };
}
