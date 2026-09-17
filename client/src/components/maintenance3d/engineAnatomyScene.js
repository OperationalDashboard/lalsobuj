import * as THREE from "three";
import { FINISH, workshopMaterial, roundedBox, latheProfile, helixGeometry, toothedGearGeometry, fanBladeGeometry } from "./anatomyMaterials.js";

// Original procedural teaching model, not manufacturer CAD or verified fitment.
// Repeated cylinders illustrate relationships, not manufacturer-specific geometry.
export const ENGINE_3D_IDS = ["block", "liner", "piston", "rings", "pin", "rod", "bearings", "crankshaft", "head", "gasket", "valves", "camshaft", "timing", "injector", "injection-pump", "common-rail", "air-filter", "fuel-filter", "turbo", "intercooler", "oil-pump", "oil-filter", "oil-cooler", "sump"];
const C = { ...FINISH, metal: FINISH.steel, shell: 0x69716e };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildEngineAnatomy({ cylinderCount = 4 } = {}) {
  const count = cylinderCount === 6 ? 6 : 4;
  const extra = (count - 4) * 1.2, halfExtra = extra / 2;
  const cylinderX = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 1.2);
  const supports = Array.from({ length: count + 1 }, (_, i) => (i - count / 2) * 1.2);
  const root = new THREE.Group();
  root.name = `Generic ${count}-cylinder educational engine`;
  root.userData.cylinderCount = count;
  const parts = new Map(), meshes = [], geometries = new Set(), materials = new Set();
  function part(id, position, explode) {
    const group = new THREE.Group(); group.name = id; group.position.set(...position);
    group.userData = { partId: id, assembled: group.position.clone(), explode: V(...explode) };
    root.add(group); parts.set(id, group); return group;
  }
  function mesh(group, geometry, position, color = C.metal, rotation = [0, 0, 0], ghost = false) {
    const material = workshopMaterial(color);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position); object.rotation.set(...rotation);
    object.userData = { partId: group.name, baseColor: color, ghost, pickable: true };
    object.castShadow = true; object.receiveShadow = true;
    group.add(object); meshes.push(object); geometries.add(geometry); materials.add(material); return object;
  }
  const box = (g, size, pos, color = C.metal, ghost = false) => mesh(g, roundedBox(size), pos, color, [0, 0, 0], ghost);
  const cyl = (g, r, length, pos, color = C.metal, axis = "y", open = false, arc = Math.PI * 2, ghost = false) => mesh(g, new THREE.CylinderGeometry(r, r, length, 32, 1, open, 0, arc), pos, color, axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0], ghost);
  const ring = (g, r, tube, pos, color = C.metal, axis = "y") => mesh(g, new THREE.TorusGeometry(r, tube, 8, 40), pos, color, axis === "y" ? [Math.PI / 2, 0, 0] : axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0]);
  function pipe(g, points, radius, color) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => V(...p)));
    return mesh(g, new THREE.TubeGeometry(curve, 24, radius, 8, false), [0, 0, 0], color);
  }
  function plateWithBores(g, y, depth, color, ghost = false) {
    const shape = new THREE.Shape();
    const end = 2.5 + halfExtra;
    shape.moveTo(-end, -.74); shape.lineTo(end, -.74); shape.lineTo(end, .74); shape.lineTo(-end, .74); shape.closePath();
    for (const x of cylinderX) { const hole = new THREE.Path(); hole.absarc(x, 0, .48, 0, Math.PI * 2, true); shape.holes.push(hole); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
    mesh(g, geo, [0, y, 0], color, [Math.PI / 2, 0, 0], ghost);
  }
  function bolt(g, pos, axis = "y", ghost = false) {
    mesh(g, new THREE.CylinderGeometry(.055, .055, .06, 6), pos, C.metal, axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0], ghost);
  }
  function forgedRod() {
    const shape = new THREE.Shape();
    shape.moveTo(-.21, -.38); shape.bezierCurveTo(-.36, -.78, .36, -.78, .21, -.38);
    shape.lineTo(.09, .3); shape.bezierCurveTo(.26, .64, -.26, .64, -.09, .3); shape.closePath();
    for (const [y, r] of [[-.48, .16], [.43, .10]]) { const hole = new THREE.Path(); hole.absarc(0, y, r, 0, Math.PI * 2, true); shape.holes.push(hole); }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelSize: .025, bevelThickness: .02, bevelSegments: 2, curveSegments: 16 });
    geometry.translate(0, 0, -.06); return geometry;
  }
  function scrollHousing(z, color) {
    const positions = [], indices = [], steps = 56, sides = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = .25 + t * Math.PI * 2, r = .26 + t * .16, tube = .07 + t * .095;
      for (let j = 0; j <= sides; j++) {
        const b = j / sides * Math.PI * 2;
        positions.push(Math.cos(a) * (r + tube * Math.cos(b)), Math.sin(a) * (r + tube * Math.cos(b)), tube * Math.sin(b));
        if (i < steps && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    mesh(turbo, geo, [0, 0, z], color);
  }

  const block = part("block", [0, 0, 0], [0, 0, -1.7]);
  plateWithBores(block, 1.35, .13, C.shell, true);
  box(block, [5.15 + extra, 2.1, .16], [0, .25, -.82], C.shell, true);
  box(block, [5.15 + extra, 2.1, .16], [0, .25, .82], C.shell, true);
  for (const x of [-2.6 - halfExtra, 2.6 + halfExtra]) box(block, [.16, 2.1, 1.7], [x, .25, 0], C.shell, true);
  for (const x of supports) box(block, [.13, .8, 1.5], [x, -.5, 0], C.shell, true);
  for (const x of cylinderX) for (const z of [-.925, .925]) {
    box(block, [.075, 1.6, .075], [x, .25, z], C.shell, true);
    bolt(block, [x, 1.05, z], "z", true);
  }
  for (const x of cylinderX) {
    cyl(block, .21, .045, [x, .48, .93], C.shell, "z", false, Math.PI * 2, true);
    cyl(block, .165, .05, [x, .48, .955], C.dark, "z", false, Math.PI * 2, true);
  }

  const liner = part("liner", [0, .68, 0], [0, .4, 1.4]);
  for (const x of cylinderX) cyl(liner, .49, 1.3, [x, 0, 0], C.dark, "y", true, Math.PI * 1.35, true);
  const piston = part("piston", [0, .93, 0], [0, 1.7, 0]);
  const rings = part("rings", [0, .93, 0], [0, 2.5, 0]);
  const pin = part("pin", [0, .77, 0], [0, 1.5, 1.5]);
  const rod = part("rod", [0, .1, 0], [0, .5, 1.55]);
  cylinderX.forEach((x, i) => {
    const offset = i === 0 || i === count - 1 ? 0 : -.42;
    const profile = [[.34,-.25],[.415,-.25],[.435,-.17],[.435,.065],[.415,.073],[.415,.103],[.435,.11],[.435,.13],[.415,.137],[.415,.167],[.435,.174],[.435,.19],[.415,.197],[.415,.223],[.435,.23],[.42,.26],[.26,.26],[.23,.235],[.20,.13],[0,.13]];
    mesh(piston, latheProfile(profile), [x, offset, 0], C.metal);
    for (const y of [.088, .152, .21]) ring(rings, .423, .013, [x, y + offset, 0], C.dark);
    mesh(pin, latheProfile([[.055,-.48],[.082,-.48],[.088,-.43],[.088,.43],[.082,.48],[.055,.48],[.055,-.48]]), [x, offset, 0], C.metal, [Math.PI / 2, 0, 0]);
    mesh(rod, forgedRod(), [x, offset, 0], C.shell);
    box(rod, [.065, .63, .035], [x, offset, .09], C.metal);
    ring(rod, .17, .025, [x, -.48 + offset, .09], C.metal, "z");
    for (const dx of [-.19, .19]) bolt(rod, [x + dx, -.5 + offset, .08], "z");
  });
  const crank = part("crankshaft", [0, -.75, 0], [0, -.8, 0]);
  cyl(crank, .19, 6.1 + extra, [0, 0, 0], C.metal, "x");
  cylinderX.forEach((x, i) => {
    const sign = i === 0 || i === count - 1 ? 1 : -1;
    for (const dx of [-.28, .28]) {
      const shape = new THREE.Shape(); shape.absarc(0, 0, .44, Math.PI * .06, Math.PI * .94, false);
      shape.lineTo(-.20, -.23); shape.quadraticCurveTo(0, -.32, .2, -.23); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 2, curveSegments: 18 });
      const weight = mesh(crank, geo, [x + dx, sign * .1, 0], C.shell, [0, Math.PI / 2, 0]); weight.rotation.x = sign < 0 ? Math.PI : 0;
    }
    cyl(crank, .18, .58, [x, sign * .45, 0], C.metal, "x");
  });
  // A flange is part of this shaft illustration, not a separately claimed flywheel.
  cyl(crank, .68, .12, [3 + halfExtra, 0, 0], C.dark, "x");
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(crank, new THREE.CylinderGeometry(.045, .045, .05, 6), [3.075 + halfExtra, Math.cos(a) * .49, Math.sin(a) * .49], C.metal, [0, 0, Math.PI / 2]); }
  const bearings = part("bearings", [0, -.75, 0], [0, -.85, 1.6]);
  for (const x of supports) {
    const shell = new THREE.LatheGeometry([new THREE.Vector2(.202, -.11), new THREE.Vector2(.235, -.11), new THREE.Vector2(.235, .11), new THREE.Vector2(.202, .11)], 24, 0, Math.PI);
    mesh(bearings, shell, [x, 0, 0], C.metal, [0, 0, Math.PI / 2]);
  }

  const head = part("head", [0, 1.5, 0], [0, 3, -.45]);
  box(head, [5.25 + extra, .45, 1.65], [0, .2, 0], C.shell, true);
  mesh(head, roundedBox([4.98 + extra, .75, 1.36], .18), [0, .7, -.08], C.dark, [0, 0, 0], true);
  for (const z of [-.45, -.15, .15, .45]) box(head, [4.55 + extra, .04, .045], [0, 1.09, z - .08], C.shell, true);
  cyl(head, .18, .08, [1.6, 1.16, -.06], C.dark);
  // Visible port runners and plenum give the cylinder head a cast, assembled
  // silhouette. Their routing is illustrative, not a service diagram.
  for (const x of cylinderX) pipe(head, [[x, .23, -.7], [x, .22, -1.07], [x + .10, -.10, -1.35]], .11, C.shell);
  pipe(head, [[cylinderX[0], -.10, -1.35], [0, -.10, -1.38], [cylinderX.at(-1) + .1, -.2, -1.35]], .17, C.copper);
  for (const x of supports) for (const z of [-.68, .68]) cyl(head, .065, .1, [x, .46, z], C.metal);
  const gasket = part("gasket", [0, 1.47, 0], [0, 2.5, -1.3]);
  plateWithBores(gasket, 0, .035, C.gold);
  const valves = part("valves", [0, 1.6, 0], [0, 2.2, 1.5]);
  for (const x of cylinderX) for (const z of [-.22, .22]) {
    cyl(valves, .16, .055, [x, -.05, z], C.gold);
    cyl(valves, .04, .6, [x, .25, z], C.metal);
    mesh(valves, helixGeometry(.084, .3, 6, .014), [x, .38, z], C.dark);
    cyl(valves, .10, .04, [x, .55, z], C.metal);
  }
  const cam = part("camshaft", [0, 2.35, -.28], [0, 3, 1.2]);
  cyl(cam, .08, 5.3 + extra, [0, 0, 0], C.metal, "x");
  for (const x of cylinderX) for (const dx of [-.16, .16]) {
    const lobe = cyl(cam, .17, .1, [x + dx, .035, 0], C.gold, "x"); lobe.scale.y = 1.35;
  }
  const timing = part("timing", [-2.95 - halfExtra, -.25, 0], [-1.75, 0, 0]);
  for (const [y, r] of [[-.5, .36], [2.6, .25], [1, .43]]) {
    mesh(timing, toothedGearGeometry(r, .14, 28), [0, y, 0], C.metal, [0, Math.PI / 2, 0]);
  }
  pipe(timing, [[0, -.5, -.4], [0, 1, -.48], [0, 2.6, -.3], [0, 2.85, 0], [0, 2.6, .3], [0, 1, .48], [0, -.5, .4], [0, -.9, 0], [0, -.5, -.4]], .045, C.dark);
  const injector = part("injector", [0, 2.05, .3], [0, 4, .45]);
  for (const x of cylinderX) { cyl(injector, .085, .65, [x, 0, 0], C.blue); cyl(injector, .034, .28, [x, -.42, 0], C.gold); box(injector, [.18, .12, .22], [x, .34, 0], C.dark); }
  const pump = part("injection-pump", [0, .55, 1.55], [0, 0, 2.5]);
  box(pump, [2.9 + extra * .65, .52, .52], [0, 0, 0], C.dark);
  for (const x of cylinderX) { cyl(pump, .07, .2, [x * .65, .35, 0], C.gold); pipe(pump, [[x * .65, .44, 0], [x * .9, .9, -.3], [x, 1.5, -1.25]], .024, C.copper); }
  const rail = part("common-rail", [0, 1.85, 1.15], [0, 1, 2.5]);
  cyl(rail, .11, 4.3 + extra, [0, 0, 0], C.blue, "x");
  box(rail, [.5, .5, .6], [-2.2 - halfExtra, -.55, 0], C.dark);
  for (const x of cylinderX) pipe(rail, [[x, 0, 0], [x, .25, -.4], [x, .4, -.8]], .03, C.gold);
  const air = part("air-filter", [-1.25, 1.1, -1.85], [-.6, .7, -2]);
  cyl(air, .38, 1.4, [0, 0, 0], C.green, "x");
  for (const x of [-.72, .72]) cyl(air, .41, .07, [x, 0, 0], C.dark, "x");
  pipe(air, [[.7, 0, 0], [1.5, .1, 0], [2.3, -.1, 0]], .13, C.dark);
  const fuel = part("fuel-filter", [-1.85, .45, 1.8], [-2.2, .4, 2.1]);
  cyl(fuel, .21, .68, [0, 0, 0], C.blue); cyl(fuel, .24, .1, [0, .39, 0], C.dark); cyl(fuel, .15, .15, [0, -.4, 0], C.gold);
  const turbo = part("turbo", [1.45, .8, -1.75], [1.5, .6, -1.5]);
  scrollHousing(0, C.metal); scrollHousing(-.55, C.copper);
  mesh(turbo, latheProfile([[.16,-.08],[.23,-.08],[.27,.03],[.20,.18],[.17,.29],[.19,.3],[.19,.35],[.14,.35],[.14,.12]]), [0, 0, .15], C.metal, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 9; i++) mesh(turbo, fanBladeGeometry(.17), [0, 0, .42], C.metal, [0, .15, i * Math.PI * 2 / 9]);
  ring(turbo, .18, .022, [0, 0, .48], C.metal, "z");
  cyl(turbo, .11, .7, [0, 0, -.28], C.dark, "z");
  pipe(turbo, [[.32, 0, 0], [.62, .2, 0], [.68, .65, 0]], .13, C.metal);
  ring(turbo, .145, .025, [.68, .64, 0], C.dark);
  box(turbo, [.43, .1, .42], [0, -.5, -.55], C.copper);
  pipe(turbo, [[.68, .65, 0], [.9, .8, -.05], [1.35, .75, .1], [2.45, .5, .15], [2.45, -.55, .15]], .12, C.dark);
  const cooler = part("intercooler", [3.9 + halfExtra, .65, -.7], [1.7, .5, -1]);
  box(cooler, [.24, 1.55, 1.75], [0, 0, 0], C.dark);
  for (let n = 0; n < 13; n++) box(cooler, [.29, .035, 1.5], [0, -.65 + n * .11, 0], C.metal);
  for (const z of [-.9, .9]) cyl(cooler, .14, 1.6, [0, 0, z], C.blue);
  const oilPump = part("oil-pump", [-1.8, -1.2, .2], [-1.2, -1.7, 1.1]);
  box(oilPump, [.5, .32, .52], [0, 0, 0], C.gold);
  pipe(oilPump, [[0, 0, 0], [.5, -.3, 0], [1.2, -.3, 0]], .07, C.metal);
  cyl(oilPump, .22, .09, [1.2, -.36, 0], C.dark);
  const oilFilter = part("oil-filter", [.75, -.3, 1.35], [1.2, -.8, 2]);
  cyl(oilFilter, .23, .72, [0, 0, 0], C.green); cyl(oilFilter, .26, .08, [0, .38, 0], C.dark);
  const oilCooler = part("oil-cooler", [1.9, -.3, 1.4], [2.1, -.8, 1.7]);
  for (let n = 0; n < 7; n++) box(oilCooler, [.75, .045, .5], [0, n * .09, 0], n % 2 ? C.dark : C.metal);
  const sump = part("sump", [0, -1.55, 0], [0, -2, -.3]);
  box(sump, [5.1 + extra, .12, 1.7], [0, 0, 0], C.dark);
  box(sump, [5.1 + extra, .65, .1], [0, .32, -.8], C.dark);
  box(sump, [5.1 + extra, .65, .1], [0, .32, .8], C.dark);
  for (const x of [-2.5 - halfExtra, 2.5 + halfExtra]) box(sump, [.1, .65, 1.6], [x, .32, 0], C.dark);
  mesh(sump, roundedBox([2.6, .45, 1.55], .16), [1.06, -.23, 0], C.dark);
  cyl(sump, .09, .12, [1.8, -.1, 0], C.gold);

  function update({ explode = 0, selectedId = "", hoveredId = "", xray = true, isolate = false, warning = false, allowedIds = ENGINE_3D_IDS } = {}) {
    const allowed = new Set(allowedIds);
    const amount = Number.isFinite(explode) ? THREE.MathUtils.clamp(explode, 0, 1) : 0;
    for (const [id, group] of parts) {
      // Alternatives are never presented as two simultaneous fuel systems.
      const fuelAlternative = id === "common-rail" ? selectedId !== "common-rail" : id === "injection-pump" && selectedId === "common-rail";
      group.visible = allowed.has(id) && !fuelAlternative && (!isolate || !parts.has(selectedId) || id === selectedId);
      group.position.copy(group.userData.assembled).addScaledVector(group.userData.explode, amount);
    }
    for (const object of meshes) {
      const selected = object.userData.partId === selectedId;
      const hovered = object.userData.partId === hoveredId;
      const translucent = xray && object.userData.ghost && !selected;
      const material = object.material;
      const nextTransparent = translucent;
      if (material.transparent !== nextTransparent) { material.transparent = nextTransparent; material.needsUpdate = true; }
      material.opacity = translucent ? .13 : 1;
      material.depthWrite = !translucent;
      material.color.setHex(selected && warning ? 0xc38951 : object.userData.baseColor);
      material.emissive.setHex(selected ? warning ? 0xe84e23 : 0x158764 : hovered ? 0x257284 : 0x000000);
      material.emissiveIntensity = selected || hovered ? .13 : 0;
      object.userData.pickable = !translucent;
    }
    root.updateMatrixWorld(true);
  }
  function bounds(id) {
    const target = id && parts.get(id);
    if (target?.visible) return new THREE.Box3().setFromObject(target);
    const result = new THREE.Box3();
    for (const group of parts.values()) if (group.visible) result.union(new THREE.Box3().setFromObject(group));
    // Graceful framing when every local component has been removed.
    return result.isEmpty() ? new THREE.Box3(V(-3, -2, -2), V(3, 3, 2)) : result;
  }
  function pick(raycaster) {
    const targets = meshes.filter(m => m.parent.visible && m.userData.pickable);
    return raycaster.intersectObjects(targets, false)[0]?.object.userData.partId || null;
  }
  function dispose() { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); root.clear(); }
  update();
  return { root, parts, meshes, update, bounds, pick, dispose };
}
