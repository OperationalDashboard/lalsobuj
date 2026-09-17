import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PARTS, getPartRepairs } from "../src/components/maintenance3d/model.js";
import { DEFAULT_ILLUSTRATED_PARTS, NEW_ILLUSTRATED_PARTS, validateIllustratedParts, migrateIllustratedParts, imagePoint, validateTemplate, upgradeIllustratedTemplate, partsForEngineLayout, editPartForLayout } from "../src/components/maintenance3d/illustrationModel.js";

test("illustrated templates validate known modules and finite normalized coordinates", () => {
  assert.equal(validateIllustratedParts(DEFAULT_ILLUSTRATED_PARTS), true);
  assert.equal(validateIllustratedParts([]), true);
  for (const patch of [{ busX: -1 }, { busY: 101 }, { faultX: Infinity }, { faultY: NaN }, { module: "unknown" }, { matchName: " " }, { label: "" }, { description: "x".repeat(201) }]) {
    assert.equal(validateIllustratedParts([{ ...DEFAULT_ILLUSTRATED_PARTS[0], ...patch }]), false);
  }
  assert.equal(validateIllustratedParts([...DEFAULT_ILLUSTRATED_PARTS, DEFAULT_ILLUSTRATED_PARTS[0]]), false);
  assert.equal(validateIllustratedParts(Array.from({ length: 51 }, (_, i) => ({ ...DEFAULT_ILLUSTRATED_PARTS[0], id: String(i) }))), false);
});

test("legacy migration preserves renamed part IDs and record links without mutating the old draft", () => {
  const legacy = structuredClone(DEFAULT_PARTS);
  legacy[0].label = "Main diesel engine";
  const original = JSON.stringify(legacy);
  const migrated = migrateIllustratedParts(legacy);
  assert.equal(JSON.stringify(legacy), original);
  assert.equal(migrated[0].id, legacy[0].id);
  assert.equal(migrated[0].label, legacy[0].label);
  assert.equal(migrated[0].module, "engine");
  assert.equal(migrated[0].busX, 13);
  assert.equal(migrated[1].module, "brakes");
  assert.equal(migrated[2].module, "cooling");
  assert.equal(validateIllustratedParts(migrated), true);
  const records = [{ id: 1, bus_id: 1, parts: [{ part_name: "Engine" }] }, { id: 2, bus_id: 2, parts: [{ part_name: "Engine" }] }];
  assert.deepEqual(getPartRepairs(migrated[0], records, "1").map((r) => r.id), [1]);
});

test("custom legacy parts receive an editable area view instead of the wrong module", () => {
  const migrated = migrateIllustratedParts([{ ...DEFAULT_PARTS[0], id: "custom-part", label: "Roof hatch", x: 6.5, y: 4 }]);
  assert.equal(migrated[0].module, "bus");
  assert.equal(validateIllustratedParts(migrated), true);
  assert.deepEqual(migrateIllustratedParts([]), []);
  const fallback = migrateIllustratedParts({ bad: true });
  assert.deepEqual(fallback, DEFAULT_ILLUSTRATED_PARTS);
  assert.notEqual(fallback[0], DEFAULT_ILLUSTRATED_PARTS[0]);
});

test("pointer positions scale independently of display size and clamp to the visible template", () => {
  assert.deepEqual(imagePoint(250, 200, { left: 100, top: 100, width: 300, height: 200 }), { x: 50, y: 50 });
  assert.deepEqual(imagePoint(450, 300, { left: 100, top: 100, width: 700, height: 400 }), { x: 50, y: 50 });
  assert.deepEqual(imagePoint(-50, 1000, { left: 100, top: 100, width: 300, height: 200 }), { x: 5, y: 95 });
  assert.equal(imagePoint(1, 1, { left: 0, top: 0, width: 0, height: 0 }), null);
});

test("editing highlights, renaming or removing a template part never mutates maintenance records", () => {
  const records = [{ id: 1, bus_id: 1, status: "open", parts: [{ part_name: "Engine" }], total_cost: 18500 }];
  const original = JSON.stringify(records);
  let draft = structuredClone(DEFAULT_ILLUSTRATED_PARTS);
  draft[0] = { ...draft[0], label: "Diesel assembly", faultX: 71, faultY: 65 };
  assert.equal(getPartRepairs(draft[0], records, 1).length, 1);
  draft = draft.filter((p) => p.id !== "engine");
  assert.equal(validateIllustratedParts(draft), true);
  assert.equal(JSON.stringify(records), original);
});

test("new glass, wiper, seat, mirror and second-engine presets upgrade without overwriting existing edits", () => {
  const old = structuredClone(DEFAULT_ILLUSTRATED_PARTS);
  old[0].label = "Our main engine";
  old[0].faultX = 64;
  old.splice(old.findIndex((part) => part.id === "gearbox"), 1);
  const snapshot = JSON.stringify(old);
  const template = upgradeIllustratedTemplate(old);
  assert.equal(validateTemplate(template), true);
  assert.equal(template.parts[0].label, "Our main engine");
  assert.equal(template.parts[0].faultX, 64);
  assert.equal(template.parts[0].matchName, "Engine");
  assert.equal(template.parts[0].engineRole, "primary");
  assert.equal(template.parts.some((part) => part.id === "gearbox"), false);
  for (const preset of NEW_ILLUSTRATED_PARTS) assert.equal(template.parts.filter((part) => part.id === preset.id).length, 1);
  assert.equal(JSON.stringify(old), snapshot);
  assert.equal(upgradeIllustratedTemplate(template.parts).parts.length, template.parts.length);
});

test("front/rear layouts use the same main engine ID; double shows two independently linked engines", () => {
  const { parts } = upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS);
  const rear = partsForEngineLayout(parts, "rear");
  const front = partsForEngineLayout(parts, "front");
  const double = partsForEngineLayout(parts, "double");
  assert.equal(rear.filter((part) => part.module === "engine").length, 1);
  assert.equal(front.filter((part) => part.module === "engine").length, 1);
  assert.equal(double.filter((part) => part.module === "engine").length, 2);
  assert.equal(rear.find((part) => part.id === "engine").engineLocation, "Rear");
  assert.equal(front.find((part) => part.id === "engine").engineLocation, "Front");
  assert.ok(front.find((part) => part.id === "engine").busX > rear.find((part) => part.id === "engine").busX);
  const tickets = [
    { id: 1, bus_id: 1, status: "open", parts: [{ part_name: "Engine" }] },
    { id: 2, bus_id: 1, status: "in_progress", parts: [{ part_name: "Front engine" }] },
    { id: 3, bus_id: 2, status: "open", parts: [{ part_name: "Engine" }] },
  ];
  assert.deepEqual(getPartRepairs(double.find((part) => part.id === "engine"), tickets, 1).map((record) => record.id), [1]);
  assert.deepEqual(getPartRepairs(double.find((part) => part.id === "engine-front"), tickets, 1).map((record) => record.id), [2]);
  assert.deepEqual(getPartRepairs(front.find((part) => part.id === "engine"), tickets, 1).map((record) => record.id), [1]);
});

test("layout-specific edits survive switching and saving without changing record keys", () => {
  const template = upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS);
  const original = template.parts[0];
  let engine = editPartForLayout(original, { busX: 80, busY: 57, faultX: 60 }, "front");
  engine = editPartForLayout(engine, { busX: 16 }, "rear");
  const rear = partsForEngineLayout([engine], "rear")[0];
  const front = partsForEngineLayout([engine], "front")[0];
  assert.equal(rear.busX, 16);
  assert.equal(rear.busY, original.busY);
  assert.equal(front.busX, 80);
  assert.equal(front.busY, 57);
  assert.equal(engine.id, original.id);
  assert.equal(engine.matchName, original.matchName);
  assert.equal(original.busX, 13);
  assert.equal(original.layoutPositions, undefined);
  template.parts[0] = engine;
  template.engineLayout = "front";
  const saved = JSON.parse(JSON.stringify(template));
  assert.equal(validateTemplate(saved), true);
  assert.equal(partsForEngineLayout(saved.parts, saved.engineLayout)[0].busX, 80);
  assert.equal(saved.parts[0].faultX, 60);
  assert.equal(partsForEngineLayout(saved.parts, "double")[0].busX, 13);
});

test("saved deletions remain deleted, and malformed layout settings are rejected", () => {
  const template = upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS);
  template.parts = template.parts.filter((part) => part.id !== "side-glass");
  const saved = JSON.parse(JSON.stringify(template));
  assert.equal(validateTemplate(saved), true);
  assert.equal(saved.parts.some((part) => part.id === "side-glass"), false);
  assert.equal(validateTemplate({ ...saved, engineLayout: "unknown" }), false);
  for (const layoutPositions of [{ rear: { busX: 200, busY: 50 } }, { rear: null }, { unknown: { busX: 50, busY: 50 } }, []]) {
    assert.equal(validateIllustratedParts([{ ...saved.parts[0], layoutPositions }]), false);
  }
});
