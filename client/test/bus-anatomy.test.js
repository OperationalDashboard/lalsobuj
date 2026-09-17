import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ANATOMY_VERSION, ANATOMY_STORAGE_KEY, MODELS, SYSTEMS, PARTS, SOURCES, partsForModel, catalogForModel, validEdit, readAnatomyDraft } from "../src/components/maintenance3d/anatomyCatalog.js";
import { FLEET_PAPER_MODELS, PAPER_SOURCES } from "../src/components/maintenance3d/fleetPaperProfiles.js";

test("reference catalogue IDs, provenance and compatibility stay consistent", () => {
  assert.equal(new Set(MODELS.map(m => m.id)).size, MODELS.length);
  assert.equal(new Set(PARTS.map(p => p.id)).size, PARTS.length);
  assert.equal(MODELS.length, 20);
  assert.equal(SYSTEMS.length, 8);
  for (const p of PARTS) {
    assert.ok(SYSTEMS.some(s => s.id === p.system && s.groups.includes(p.group)));
    if (p.source) assert.ok(SOURCES[p.source]?.url.startsWith("https://"));
    assert.equal(p.price, undefined);
    assert.equal(p.partNumber, undefined);
  }
  const mechanical = partsForModel(MODELS.find(m => m.id === "al-160"));
  assert.ok(mechanical.some(p => p.id === "injection-pump"));
  assert.ok(!mechanical.some(p => p.id === "common-rail"));
  const eicher = partsForModel(MODELS[0]);
  assert.ok(!eicher.some(p => p.id === "air-spring"));
  assert.ok(eicher.some(p => p.id === "leaf-spring"));
  assert.equal(MODELS.find(m => m.id === "tata-1680").engine, undefined);
  assert.equal(MODELS.find(m => m.id === "hino-1j-160").engine, undefined);
});

test("local edits retain IDs, survive reload, isolate models and restore hidden parts", () => {
  const original = PARTS.find(p => p.id === "piston");
  const edit = { modelId: MODELS[0].id, partId: "piston", system: "engine", name: "Workshop piston name", purpose: "Local explanation", note: "Check our engine plate", hidden: true, custom: false };
  assert.ok(validEdit(edit));
  const custom = { ...edit, partId: "custom-fixture", name: "Custom bracket", hidden: false, custom: true };
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  storage.setItem(ANATOMY_STORAGE_KEY, JSON.stringify({ version: 1, edits: [edit, custom] }));
  const read = readAnatomyDraft(storage);
  assert.equal(read.length, 2);
  const first = catalogForModel(MODELS[0], read).find(p => p.id === "piston");
  assert.equal(first.id, original.id); assert.equal(first.hidden, true); assert.equal(first.source, original.source);
  assert.equal(catalogForModel(MODELS[1], read).find(p => p.id === "piston").name, original.name);
  assert.ok(!catalogForModel(MODELS[1], read).some(p => p.id === "custom-fixture"));
  assert.equal(catalogForModel(MODELS[0], [{ ...edit, hidden: false }]).find(p => p.id === "piston").hidden, false);
  assert.equal(original.name, "Piston");
});

test("corrupt drafts and unsafe reference overrides are discarded", () => {
  assert.deepEqual(readAnatomyDraft({ getItem() { throw Error("blocked"); } }), []);
  assert.deepEqual(readAnatomyDraft({ getItem: () => "not json" }), []);
  const item = { modelId: MODELS[0].id, partId: "piston", system: "engine", name: "Local piston", purpose: "Description", note: "", hidden: false, custom: false, source: "fake", requires: "air" };
  const edits = readAnatomyDraft({ getItem: () => JSON.stringify({ version: 1, edits: [item, { ...item, name: "Newest" }, { ...item, custom: true }] }) });
  assert.equal(edits.length, 1); assert.equal(edits[0].name, "Newest");
  assert.equal(edits[0].source, undefined); assert.equal(edits[0].requires, undefined);
  assert.ok(!validEdit({ ...item, name: " " }));
  assert.ok(!validEdit({ ...item, system: "bad" }));
});

const root = fileURLToPath(new URL("..", import.meta.url));
const result = await build({ absWorkingDir: root, entryPoints: ["src/components/maintenance3d/BusAnatomyPreview.jsx"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty", ".obj": "text" }, plugins: [{ name: "reference-assets", setup(b) { b.onLoad({ filter: /\.png$/ }, a => ({ contents: `export default ${JSON.stringify(a.path)}`, loader: "js" })); } }] });
const compiled = new Module(path.join(root, "test/virtual-anatomy.cjs"));
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(result.outputFiles[0].text, compiled.id);
const render = props => renderToStaticMarkup(createElement(compiled.exports.default, props));

test("real UI renders overview, all models and clear reference limitations", () => {
  const html = render({ initialSystem: "" });
  assert.ok(html.includes(ANATOMY_VERSION));
  assert.ok(html.includes("manufacturer exploded diagrams"));
  for (const m of MODELS) assert.ok(html.includes(m.label.replaceAll("&", "&amp;")));
  assert.ok(html.includes("Bus systems"));
  assert.ok(html.includes("Interactive 3D"));
});
test("anatomy opens the clickable bus and every system has a 3D viewer", () => {
  const overview = render({});
  assert.ok(overview.includes("Loading interactive 3D bus") || overview.includes("Interactive 3D bus anatomy"));
  for (const system of SYSTEMS) {
    const html = render({ initialSystem: system.id });
    assert.ok(html.includes("Loading interactive 3D components") || html.includes(`Interactive 3D ${system.id} anatomy`));
    assert.ok(!html.includes("Interactive 3D is available in Engine"));
    assert.ok(html.includes("anatomy-visual-workspace"));
  }
});
test("engine UI provides details, functional map and honest disconnected pricing", () => {
  const html = render({ initialSystem: "engine", canEdit: true });
  for (const text of ["Piston", "What it does", "Power path", "Search components", "Price unavailable", "Not performed", "Add component", "Edit local details", "Remove from local view"]) assert.ok(html.includes(text), text);
  const readOnly = render({ initialSystem: "engine", canEdit: false });
  assert.ok(!readOnly.includes("Edit local details"));
  assert.ok(!readOnly.includes("Add component"));
  assert.ok(!readOnly.includes("Remove from local view"));
});
test("all model/system combinations render without guessing part numbers", () => {
  for (const m of MODELS) for (const system of SYSTEMS) {
    const html = render({ initialModel: m.id, initialSystem: system.id });
    assert.ok(html.includes("OEM part number"));
    assert.ok(html.includes("Not verified — do not order by name alone"));
  }
});

test("normal Maintenance and Settings builds exclude the entire preview module", async () => {
  for (const page of ["Maintenance", "Settings"]) {
    const output = await build({ absWorkingDir: root, entryPoints: [`src/pages/${page}.jsx`], bundle: true, write: false, platform: "browser", format: "esm", packages: "external", jsx: "automatic", define: { "import.meta.env.VITE_MAINTENANCE_3D_PREVIEW": '"0"', __APP_VERSION__: '"production-test"', __APP_REVISION__: '"test"' }, loader: { ".css": "empty" } });
    const text = output.outputFiles.map(f => f.text).join("\n");
    assert.ok(!text.includes(ANATOMY_STORAGE_KEY));
    assert.ok(!text.includes("Bus anatomy reference module"));
    assert.ok(!text.includes("bus-overview.png"));
    assert.ok(!text.includes("Local reference lab"));
    assert.ok(!text.includes("engineAnatomyScene"));
    assert.ok(!text.includes("Generic four-cylinder educational engine"));
    assert.ok(!text.includes("paper-12-1834"));
    assert.ok(!text.includes("From your bus papers"));
  }
});

test("paper profiles deduplicate vehicles without guessing undocumented specifications", () => {
  assert.equal(FLEET_PAPER_MODELS.length, 8);
  assert.equal(new Set(FLEET_PAPER_MODELS.map(m => m.registration)).size, 8);
  assert.equal(FLEET_PAPER_MODELS.filter(m => m.cylinderCount === 6).length, 6);
  for (const model of FLEET_PAPER_MODELS) {
    assert.ok(model.papers.every(id => PAPER_SOURCES[id]));
    for (const field of ["power", "suspension", "fuelSystem", "transmission", "engineLayout", "engineSerial", "owner"]) assert.equal(model[field], undefined);
    const html = render({ initialModel: model.id });
    assert.ok(html.includes(model.fullRegistration));
    assert.ok(html.includes("Source papers"));
    assert.ok(!html.includes("No fleet bus has been assigned"));
  }
  const unknown = FLEET_PAPER_MODELS.find(m => m.registration === "15-8505");
  assert.equal(unknown.displacementCc, undefined);
  assert.equal(unknown.cylinderCount, undefined);
  const hino = FLEET_PAPER_MODELS.find(m => m.registration === "14-6183");
  assert.equal(hino.cylinderCount, undefined);
  assert.ok(render({ initialModel: hino.id }).includes("registration, not manufacture"));
  assert.ok(render({ initialModel: "paper-15-8092" }).includes("33 · including driver"));
});
