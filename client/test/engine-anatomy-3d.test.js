import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { readFileSync } from "node:fs";
import { installCoachExterior } from "../src/components/maintenance3d/coachExteriorScene.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildEngineAnatomy, ENGINE_3D_IDS } from "../src/components/maintenance3d/engineAnatomyScene.js";
import { PARTS, MODELS, partsForModel } from "../src/components/maintenance3d/anatomyCatalog.js";
import { buildSystemAnatomy, SYSTEM_3D_IDS } from "../src/components/maintenance3d/systemAnatomyScenes.js";
import { busTargets, availableBusTargets, resolveBusTarget, locatePartOnBus, readAnatomyLayout } from "../src/components/maintenance3d/anatomyNavigation.js";
import { upgradeIllustratedTemplate, DEFAULT_ILLUSTRATED_PARTS } from "../src/components/maintenance3d/illustrationModel.js";

function rayTowardSurface(mesh) {
  const positions = mesh.geometry.getAttribute("position"), indices = mesh.geometry.index;
  // Aim at a real triangle, not the empty centre of a ring or bent pipe.
  for (let i = 0; i < (indices?.count || positions.count); i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i) : i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-10) continue;
    const center = a.add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrixWorld);
    normal.transformDirection(mesh.matrixWorld);
    return new THREE.Raycaster(center.clone().addScaledVector(normal, 20), normal.negate());
  }
  throw Error("No nondegenerate triangle");
}

test("six-cylinder paper profiles create six clickable pistons and matching liners", () => {
  for (const count of [4, 6]) {
    const scene = buildSystemAnatomy("engine", { cylinderCount: count });
    assert.equal(scene.root.userData.cylinderCount, count);
    assert.equal(scene.parts.get("piston").children.length, count);
    assert.equal(scene.parts.get("liner").children.length, count);
    assert.equal(scene.parts.get("injector").children.length, count * 3);
    scene.update({ selectedId: "piston", isolate: true });
    for (const piston of scene.parts.get("piston").children) assert.equal(scene.pick(rayTowardSurface(piston)), "piston");
    for (const mesh of scene.meshes) for (const value of mesh.geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
    scene.update({ selectedId: "head", explode: 1 });
    assert.ok(scene.bounds().getSize(new THREE.Vector3()).length() < 25);
    scene.dispose();
  }
});

test("every core engine reference has real, finite, bounded 3D mesh geometry", () => {
  const model = buildEngineAnatomy();
  assert.deepEqual(new Set(model.parts.keys()), new Set(PARTS.filter(p => p.system === "engine").map(p => p.id)));
  assert.equal(model.parts.size, 24);
  let vertices = 0;
  for (const m of model.meshes) {
    assert.ok(m.isMesh); assert.ok(ENGINE_3D_IDS.includes(m.userData.partId));
    const position = m.geometry.getAttribute("position"); vertices += position.count;
    assert.ok(position.count > 0);
    for (const value of position.array) assert.ok(Number.isFinite(value));
  }
  assert.ok(model.meshes.length < 400, `mesh count ${model.meshes.length}`);
  assert.ok(vertices < 180000, `vertex count ${vertices}`);
  assert.ok(model.bounds().getSize(new THREE.Vector3()).length() < 20);
  model.dispose();
});

test("exploded transforms are reversible, clamp input, and keep every component frameable", () => {
  const model = buildEngineAnatomy();
  const origin = new Map([...model.parts].map(([id, group]) => [id, group.position.clone()]));
  model.update({ explode: 1 });
  for (const [id, group] of model.parts) assert.ok(group.position.distanceTo(origin.get(id)) > .1, id);
  const head = model.parts.get("head").position.clone();
  model.update({ explode: 999 }); assert.ok(model.parts.get("head").position.equals(head));
  for (const id of ENGINE_3D_IDS) {
    model.update({ explode: 1, selectedId: id, isolate: true });
    assert.ok(model.parts.get(id).visible);
    const bounds = model.bounds(id); assert.ok(!bounds.isEmpty());
    assert.ok(bounds.getSize(new THREE.Vector3()).length() < 20);
  }
  model.update({ explode: NaN });
  for (const [id, group] of model.parts) assert.ok(group.position.equals(origin.get(id)));
  model.dispose();
});

test("fuel alternatives, model compatibility and local removal are respected in the scene", () => {
  const model = buildEngineAnatomy();
  assert.equal(model.parts.get("common-rail").visible, false);
  model.update({ selectedId: "common-rail" });
  assert.equal(model.parts.get("common-rail").visible, true);
  assert.equal(model.parts.get("injection-pump").visible, false);
  for (const profile of MODELS) {
    const allowedIds = partsForModel(profile).filter(p => p.system === "engine" && p.id !== "piston").map(p => p.id);
    model.update({ selectedId: "head", allowedIds });
    assert.equal(model.parts.get("piston").visible, false);
    for (const [id, group] of model.parts) if (group.visible) assert.ok(allowedIds.includes(id));
  }
  model.update({ allowedIds: [] }); assert.ok(!model.bounds().isEmpty());
  model.dispose();
});

test("click raycasting selects only visible geometry and x-ray housings do not swallow selection", () => {
  const model = buildEngineAnatomy();
  model.update({ selectedId: "piston", isolate: true });
  const piston = model.parts.get("piston").children[0];
  const point = piston.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0, 10)), new THREE.Vector3(0, 0, -1));
  assert.equal(model.pick(ray), "piston");
  model.update({ xray: true, selectedId: "piston" });
  const housing = model.meshes.filter(m => m.userData.partId === "block");
  assert.ok(housing.every(m => m.material.opacity < 1 && !m.userData.pickable));
  model.update({ selectedId: "block", xray: true });
  assert.ok(housing.every(m => m.material.opacity === 1 && m.userData.pickable));
  model.update({ allowedIds: [] }); assert.equal(model.pick(ray), null);
  model.dispose();
});

test("selection and demo warning have distinct material states and dispose releases resources", () => {
  const model = buildEngineAnatomy();
  model.update({ selectedId: "piston", warning: false });
  const piston = model.parts.get("piston").children[0];
  const regular = piston.material.color.getHex();
  model.update({ selectedId: "piston", warning: true }); assert.notEqual(piston.material.color.getHex(), regular);
  model.update({ selectedId: "head" }); assert.equal(piston.material.color.getHex(), piston.userData.baseColor);
  let disposedGeometry = 0, disposedMaterial = 0;
  for (const m of model.meshes) { m.geometry.addEventListener("dispose", () => disposedGeometry++); m.material.addEventListener("dispose", () => disposedMaterial++); }
  model.dispose();
  assert.equal(disposedGeometry, model.meshes.length); assert.equal(disposedMaterial, model.meshes.length);
  assert.equal(model.root.children.length, 0);
});

const root = fileURLToPath(new URL("..", import.meta.url));
const output = await build({ absWorkingDir: root, entryPoints: ["src/components/maintenance3d/EngineAnatomy3D.jsx"], bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react/*"], jsx: "automatic", loader: { ".css": "empty", ".obj": "text" } });
const compiled = new Module(path.join(root, "test/virtual-engine3d.cjs")); compiled.paths = Module._nodeModulePaths(root); compiled._compile(output.outputFiles[0].text, compiled.id);
test("3D UI renders camera, exploration, fallback and honest schematic controls without requiring WebGL", () => {
  const props = { selected: PARTS.find(p => p.id === "piston"), parts: PARTS.filter(p => p.system === "engine"), modelLabel: "Local reference", onSelect() {} };
  const html = renderToStaticMarkup(createElement(compiled.exports.default, props));
  for (const text of ["Interactive 3D engine anatomy", "Assembled", "Exploded view", "See inside", "Isolate part", "Zoom to part", "Auto rotate", "Demo fault highlight", "Generic 4-cylinder schematic", "not verified for your bus"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("Building the 3D assembly"));
  const custom = renderToStaticMarkup(createElement(compiled.exports.default, { ...props, selected: { id: "custom-test", name: "Local bracket", purpose: "Local addition" } }));
  assert.ok(custom.includes("No 3D shape has been assigned"));
});

test("all 57 built-in components across all eight systems have usable 3D geometry", () => {
  let count = 0;
  for (const [system, expected] of Object.entries(SYSTEM_3D_IDS)) {
    const scene = buildSystemAnatomy(system);
    assert.deepEqual([...scene.parts.keys()].sort(), [...expected].sort(), system);
    count += scene.parts.size;
    const originals = new Map([...scene.parts].map(([id, group]) => [id, group.position.clone()]));
    for (const id of expected) {
      scene.update({ selectedId: id, isolate: true, explode: 1 });
      assert.ok(scene.parts.get(id).visible, `${system}/${id}`);
      assert.ok(!scene.bounds(id).isEmpty());
      assert.ok(scene.parts.get(id).position.distanceTo(originals.get(id)) > .1, `explosion ${id}`);
      const mesh = scene.meshes.find(m => m.userData.partId === id && m.userData.pickable);
      assert.ok(mesh, `clickable ${id}`);
      assert.equal(scene.pick(rayTowardSurface(mesh)), id, `raycast ${id}`);
    }
    for (const m of scene.meshes) for (const value of m.geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
    scene.update({ explode: 0 });
    for (const [id, group] of scene.parts) assert.ok(group.position.equals(originals.get(id)));
    scene.dispose();
  }
  assert.equal(count, 57);
});

test("actual bus mesh targets route to the correct system and preserve front/rear engine context", () => {
  for (const layout of ["front", "rear", "double"]) {
    const bus = buildSystemAnatomy("bus", { engineLayout: layout });
    const targets = busTargets(layout);
    assert.deepEqual([...bus.parts.keys()].sort(), targets.map(t => t.id).sort());
    assert.equal(targets.filter(t => t.system === "engine").length, layout === "double" ? 2 : 1);
    for (const target of targets) {
      const destination = resolveBusTarget(target.id, PARTS, layout);
      assert.equal(destination.system, PARTS.find(p => p.id === destination.partId).system);
      const located = locatePartOnBus(PARTS.find(p => p.id === destination.partId), PARTS, layout, target.id);
      assert.equal(located.system, target.system);
      if (target.system === "engine" || target.direct) assert.equal(located.id, target.id);
      bus.update({ selectedId: target.id, isolate: true, xray: false, allowedIds: targets.map(t => t.id) });
      const mesh = bus.meshes.find(m => m.userData.partId === target.id);
      mesh.geometry.computeBoundingBox();
      const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const directions = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)];
      assert.ok(directions.some(dir => bus.pick(new THREE.Raycaster(center.clone().addScaledVector(dir, -20), dir)) === target.id), `${layout}/${target.id}`);
    }
    bus.dispose();
  }
});

test("local layout settings, hidden components and absent systems cannot create invalid navigation", () => {
  const template = { ...upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS), engineLayout: "double" };
  assert.equal(readAnatomyLayout({ getItem: () => JSON.stringify(template) }), "double");
  assert.equal(readAnatomyLayout({ getItem() { throw Error("blocked"); } }), "rear");
  assert.equal(readAnatomyLayout({ getItem: () => JSON.stringify({ ...template, engineLayout: "side" }) }), "rear");
  const removed = PARTS.map(p => ({ ...p, hidden: p.system === "engine" || p.id === "windscreen" }));
  assert.ok(!availableBusTargets(removed, "double").some(t => t.system === "engine" || t.id === "windscreen"));
  assert.equal(resolveBusTarget("missing", PARTS, "rear"), null);
  assert.equal(locatePartOnBus(null, PARTS, "rear"), null);
  assert.equal(locatePartOnBus({ system: "unknown" }, PARTS, "rear"), null);
});

test("suspension alternatives and scene removal honor the selected research profile", () => {
  const scene = buildSystemAnatomy("suspension");
  scene.update({ suspension: "air", selectedId: "damper" });
  assert.equal(scene.parts.get("leaf-spring").visible, false);
  assert.equal(scene.parts.get("air-spring").visible, true);
  scene.update({ suspension: "air", selectedId: "leaf-spring" });
  assert.equal(scene.parts.get("air-spring").visible, false);
  const ids = partsForModel(MODELS[0]).filter(p => p.system === "suspension").map(p => p.id);
  scene.update({ allowedIds: ids });
  assert.equal(scene.parts.get("air-spring").visible, false);
  scene.update({ allowedIds: [] });
  assert.equal([...scene.parts.values()].filter(g => g.visible).length, 0);
  assert.ok(!scene.bounds().isEmpty()); scene.dispose();
});

test("each 3D system exposes back/locate navigation and bus has keyboard-accessible location buttons", () => {
  for (const systemId of Object.keys(SYSTEM_3D_IDS)) {
    const parts = PARTS.filter(p => p.system === systemId);
    const html = renderToStaticMarkup(createElement(compiled.exports.default, { systemId, parts, selected: parts[0], onSelect() {}, onBack() {}, onLocate() {} }));
    assert.ok(html.includes(`Interactive 3D ${systemId} anatomy`));
    for (const label of ["Back to bus", "Locate on bus", "Isolate part", "More view controls"]) assert.ok(html.includes(label));
  }
  const bus = renderToStaticMarkup(createElement(compiled.exports.default, { systemId: "bus", engineLayout: "double", parts: PARTS, onSelect() {} }));
  for (const label of ["Clickable bus locations", "Front engine", "Rear engine", "Side mirror", "Passenger seat", "Open body"]) assert.ok(bus.includes(label), label);
});

test("authored coach preserves semantic picking, finite geometry and local removals for each engine layout", () => {
  const obj = readFileSync(new URL("../src/assets/maintenance-preview/bus.obj", import.meta.url), "utf8");
  for (const engineLayout of ["front", "rear", "double"]) {
    const bus = installCoachExterior(buildSystemAnatomy("bus", { engineLayout }), obj);
    assert.match(bus.root.userData.exteriorSource, /CC0/);
    const targets = busTargets(engineLayout);
    assert.deepEqual([...bus.parts.keys()].sort(), targets.map(t => t.id).sort());
    for (const { id } of targets) {
      bus.update({ selectedId: id, isolate: true, xray: false });
      const m = bus.meshes.find(m => m.userData.partId === id && m.visible && m.userData.pickable);
      assert.ok(m, `visible coach region ${engineLayout}/${id}`);
      assert.equal(bus.pick(rayTowardSurface(m)), id);
    }
    bus.update({ xray: true });
    const body = bus.meshes.filter(m => m.userData.authoredExterior && m.userData.sourceMaterial === "Body");
    assert.ok(body.length > 0 && body.every(m => m.material.opacity < 1 && !m.userData.pickable));
    assert.ok(bus.meshes.filter(m => m.userData.replaced).every(m => !m.visible && !m.userData.pickable));
    for (const m of bus.meshes) for (const value of m.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    bus.update({ allowedIds: [] });
    assert.equal([...bus.parts.values()].filter(g => g.visible).length, 0);
    bus.dispose();
  }
});

test("coach roof attachments stay mounted after normalizing nested transforms", () => {
  const obj = readFileSync(new URL("../src/assets/maintenance-preview/bus.obj", import.meta.url), "utf8");
  const bus = installCoachExterior(buildSystemAnatomy("bus"), obj);
  const ac = bus.bounds("zone-ac");
  assert.ok(ac.max.y < 3.5, `rooftop parts cannot float at original height: ${ac.max.y}`);
  assert.ok(ac.min.y > 2.8);
  bus.dispose();
});

test("mechanical selection preserves base finishes; workshop rubber and metal remain distinct", () => {
  const scene = buildSystemAnatomy("suspension");
  scene.update({ selectedId: "air-spring", suspension: "air" });
  const rubber = scene.meshes.find(m => m.userData.partId === "air-spring" && m.geometry.type === "LatheGeometry");
  assert.equal(rubber.material.metalness, 0);
  assert.ok(rubber.material.roughness > .8);
  assert.equal(rubber.material.color.getHex(), rubber.userData.baseColor);
  scene.dispose();
});
