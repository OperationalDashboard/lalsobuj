import * as THREE from "three";
import { FINISH, workshopMaterial, roundedBox, toothedGearGeometry, fanBladeGeometry, latheProfile } from "./anatomyMaterials.js";

export const PALETTE = FINISH;
const vec = array => new THREE.Vector3(...array);

// Shared geometry/interaction contract for every schematic system and the bus.
export function createAnatomyScene(name) {
  const root = new THREE.Group(); root.name = name;
  const parts = new Map(), meshes = [], geometries = new Set(), materials = new Set();
  function part(id, pos = [0, 0, 0], explode = [0, 0, 0]) {
    const group = new THREE.Group(); group.name = id; group.position.copy(vec(pos));
    group.userData = { partId: id, assembled: group.position.clone(), explode: vec(explode) };
    parts.set(id, group); root.add(group); return group;
  }
  function mesh(group, geometry, pos, color, rotation = [0, 0, 0], options = {}) {
    const material = workshopMaterial(color, { ...(options.glass ? { metalness: .25, roughness: .13 } : {}), ...options.finish });
    const m = new THREE.Mesh(geometry, material); m.position.copy(vec(pos)); m.rotation.set(...rotation);
    m.userData = { partId: group.name, baseColor: color, ghost: !!options.ghost, glass: !!options.glass, context: !!options.context, pickable: !options.context, ...options.flags };
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); meshes.push(m); geometries.add(geometry); materials.add(material); return m;
  }
  const box = (g, size, pos = [0, 0, 0], color = PALETTE.steel, options = {}) => mesh(g, roundedBox(size, options.radius), pos, color, options.rotation || [0, 0, 0], options);
  const cyl = (g, r, length, pos = [0, 0, 0], color = PALETTE.steel, axis = "y", options = {}) => mesh(g, new THREE.CylinderGeometry(r, options.bottomRadius ?? r, length, 28, 1, !!options.open, options.start || 0, options.arc || Math.PI * 2), pos, color, axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0], options);
  const ring = (g, r, tube, pos = [0, 0, 0], color = PALETTE.steel, axis = "y", arc = Math.PI * 2) => mesh(g, new THREE.TorusGeometry(r, tube, 8, 32, arc), pos, color, axis === "y" ? [Math.PI / 2, 0, 0] : axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0]);
  function pipe(g, points, radius = .05, color = PALETTE.steel) {
    return mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vec)), 24, radius, 8, false), [0, 0, 0], color);
  }
  function fan(g, pos = [0, 0, 0], radius = .75, axis = "z") {
    const fanGroup = new THREE.Group(); fanGroup.name = g.name; fanGroup.position.copy(vec(pos)); g.add(fanGroup);
    if (axis === "y") fanGroup.rotation.x = -Math.PI / 2;
    if (axis === "x") fanGroup.rotation.y = Math.PI / 2;
    cyl(fanGroup, radius * .18, .22, [0, 0, 0], PALETTE.dark, "z");
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      mesh(fanGroup, fanBladeGeometry(radius), [0, 0, 0], PALETTE.dark, [0, .12, angle]);
    }
  }
  function finPack(g, size = [2.5, 2, .35], pos = [0, 0, 0], color = PALETTE.steel) {
    const [w, h, d] = size, [x, y, z] = pos;
    box(g, [w, h, d * .65], pos, PALETTE.dark);
    for (let i = 0; i < 28; i++) box(g, [w, .018, d], [x, y - h / 2 + i * h / 27, z], color);
    for (const dx of [-w / 2, w / 2]) box(g, [.13, h + .1, d + .04], [x + dx, y, z], PALETTE.dark);
  }
  function gear(g, radius, pos, axis = "x") {
    mesh(g, toothedGearGeometry(radius), pos, PALETTE.steel, axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0]);
    ring(g, radius * .35, .025, pos, PALETTE.dark, axis);
  }
  const lathe = (g, profile, pos, color = PALETTE.steel, axis = "y", options = {}) => mesh(g, latheProfile(profile), pos, color, axis === "x" ? [0, 0, -Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0], options);
  function update({ explode = 0, selectedId = "", hoveredId = "", xray = true, isolate = false, warning = false, allowedIds = [...parts.keys()], suspension = "leaf" } = {}) {
    const allowed = new Set(allowedIds), amount = Number.isFinite(explode) ? THREE.MathUtils.clamp(explode, 0, 1) : 0;
    const useAir = ["air-spring", "levelling"].includes(selectedId) || (selectedId !== "leaf-spring" && ["air", "air-reported"].includes(suspension) && allowed.has("air-spring"));
    for (const [id, group] of parts) {
      const alternative = id === "leaf-spring" ? useAir : ["air-spring", "levelling"].includes(id) && !useAir;
      group.visible = (id === "context" || allowed.has(id)) && !alternative && (!isolate || !parts.has(selectedId) || id === selectedId);
      group.position.copy(group.userData.assembled).addScaledVector(group.userData.explode, amount);
    }
    for (const m of meshes) {
      m.visible = !m.userData.replaced;
      const selected = m.userData.partId === selectedId, hovered = m.userData.partId === hoveredId;
      const ghost = xray && m.userData.ghost && !selected;
      const transparent = ghost || m.userData.glass;
      if (transparent !== m.material.transparent) { m.material.transparent = transparent; m.material.needsUpdate = true; }
      m.material.opacity = ghost ? .06 : m.userData.glass ? .84 : 1; m.material.depthWrite = !transparent;
      m.userData.pickable = !m.userData.context && !ghost && !m.userData.replaced;
      m.material.color.setHex(selected && warning ? 0xc38951 : m.userData.baseColor);
      m.material.emissive.setHex(selected ? warning ? 0xcf411c : 0x137658 : hovered ? 0x257284 : 0);
      m.material.emissiveIntensity = selected || hovered ? .13 : 0;
    }
    root.updateMatrixWorld(true);
  }
  function bounds(id) {
    if (parts.get(id)?.visible) return new THREE.Box3().setFromObject(parts.get(id));
    const result = new THREE.Box3();
    for (const group of parts.values()) if (group.visible) result.union(new THREE.Box3().setFromObject(group));
    return result.isEmpty() ? new THREE.Box3(vec([-3, -2, -2]), vec([3, 3, 2])) : result;
  }
  function pick(raycaster) {
    const visible = m => { let node = m; while (node && node !== root) { if (!node.visible) return false; node = node.parent; } return true; };
    return raycaster.intersectObjects(meshes.filter(m => m.userData.pickable && visible(m)), false)[0]?.object.userData.partId || null;
  }
  function dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear(); }
  return { root, parts, meshes, part, mesh, box, cyl, ring, pipe, fan, finPack, gear, lathe, update, bounds, pick, dispose };
}
