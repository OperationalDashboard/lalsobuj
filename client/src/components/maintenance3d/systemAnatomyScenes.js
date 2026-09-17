import * as THREE from "three";
import { createAnatomyScene, PALETTE as C } from "./anatomySceneKit.js";
import { buildEngineAnatomy } from "./engineAnatomyScene.js";
import { PARTS } from "./anatomyCatalog.js";
import { helixGeometry } from "./anatomyMaterials.js";

export const SYSTEM_3D_IDS = Object.fromEntries(["engine", "cooling", "driveline", "brakes", "suspension", "electrical", "ac", "body"].map(id => [id, PARTS.filter(p => p.system === id).map(p => p.id)]));

function seat(kit, g, pos = [0, 0, 0], scale = 1) {
  const { box, cyl, pipe } = kit, [x, y, z] = pos;
  const cloth = { finish: { metalness: 0, roughness: .94 }, radius: .09 * scale };
  box(g, [.85 * scale, .21 * scale, .79 * scale], [x, y + .65 * scale, z], C.blue, cloth);
  box(g, [.23 * scale, 1.08 * scale, .70 * scale], [x - .36 * scale, y + 1.15 * scale, z], C.blue, { ...cloth, rotation: [0, 0, -.13] });
  box(g, [.25 * scale, .30 * scale, .55 * scale], [x - .44 * scale, y + 1.77 * scale, z], C.blue, cloth);
  for (const dz of [-.32, .32]) {
    box(g, [.28 * scale, .98 * scale, .14 * scale], [x - .31 * scale, y + 1.15 * scale, z + dz * scale], C.dark, cloth);
    pipe(g, [[x - .21 * scale, y + .87 * scale, z + dz * scale], [x - .20 * scale, y + 1.15 * scale, z + dz * scale], [x - .28 * scale, y + 1.56 * scale, z + dz * scale]], .006 * scale, C.steel);
  }
  for (const dz of [-.20, 0, .20]) pipe(g, [[x - .29 * scale, y + .762 * scale, z + dz * scale], [x + .15 * scale, y + .762 * scale, z + dz * scale], [x + .38 * scale, y + .715 * scale, z + dz * scale]], .006 * scale, C.steel);
  for (const dz of [-.35, .35]) { cyl(g, .035 * scale, .58 * scale, [x, y + .3 * scale, z + dz * scale], C.steel); box(g, [.65 * scale, .06 * scale, .07 * scale], [x, y + .07 * scale, z + dz * scale], C.dark); box(g, [.65 * scale, .055 * scale, .07 * scale], [x, y + 1 * scale, z + dz * scale], C.dark); }
}
function battery(kit, g, pos = [0, 0, 0], scale = 1) {
  const { box, cyl } = kit, [x, y, z] = pos;
  box(g, [1.5 * scale, .9 * scale, .85 * scale], [x, y, z], C.dark);
  box(g, [1.55 * scale, .12 * scale, .9 * scale], [x, y + .48 * scale, z], C.green);
  for (let i = 0; i < 6; i++) cyl(g, .045 * scale, .03 * scale, [x - .56 * scale + i * .22 * scale, y + .565 * scale, z], C.dark);
  for (const dx of [-.63, .63]) box(g, [.045 * scale, .69 * scale, .89 * scale], [x + dx * scale, y, z], C.dark);
  cyl(g, .075 * scale, .13 * scale, [x - .55 * scale, y + .6 * scale, z], C.red);
  cyl(g, .075 * scale, .13 * scale, [x + .55 * scale, y + .6 * scale, z], C.blue);
}

function buildBus(layout) {
  const k = createAnatomyScene("Clickable generic coach anatomy"), { part, box, cyl, ring, pipe, fan } = k;
  const frame = part("zone-driveline");
  for (const z of [-.7, .7]) box(frame, [11, .16, .15], [0, .8, z], C.dark);
  cyl(frame, .1, 6, [-.1, .73, 0], C.gold, "x");
  box(frame, [1.1, .4, .5], [-3.8, .8, 0], C.steel);
  const shell = part("zone-body");
  box(shell, [11.6, .18, 2.75], [0, 1.35, 0], C.dark, { ghost: true });
  for (const z of [-1.37, 1.37]) {
    box(shell, [11.6, .7, .065], [0, 1.8, z], C.green);
    box(shell, [11.6, .09, .085], [0, 2.16, z], C.gold);
    box(shell, [11.6, .1, .1], [0, 3.66, z], C.steel);
    for (let x = -5.7; x <= 5.7; x += 1.14) box(shell, [.05, 1.5, .07], [x, 2.93, z], C.dark);
  }
  box(shell, [11.6, .15, 2.8], [0, 3.75, 0], C.steel, { ghost: true });
  box(shell, [.12, 2.35, 2.7], [-5.75, 2.52, 0], C.green, { ghost: true });
  box(shell, [.13, .7, 2.65], [5.75, 1.8, 0], C.green);
  for (const x of [-5.8, 5.8]) box(shell, [.15, .14, 2.7], [x, 1.35, 0], C.dark);
  const brake = part("zone-brakes");
  for (const x of [-3.5, 3.7]) for (const z of [-1.38, 1.38]) {
    cyl(brake, .74, .32, [x, .75, z], C.dark, "z"); cyl(brake, .44, .35, [x, .75, z], C.steel, "z");
    ring(brake, .53, .03, [x, .75, z + Math.sign(z) * .19], C.gold, "z");
    cyl(brake, .16, .4, [x, .75, z], C.dark, "z");
    for (let i = 0; i < 6; i++) cyl(brake, .035, .37, [x + Math.cos(i * Math.PI / 3) * .31, .75 + Math.sin(i * Math.PI / 3) * .31, z], C.gold, "z");
  }
  const suspension = part("zone-suspension");
  for (const x of [-3.5, 3.7]) { cyl(suspension, .15, 2.5, [x, .77, 0], C.dark, "z"); for (const z of [-.85, .85]) { cyl(suspension, .19, .5, [x, 1.02, z], C.blue); box(suspension, [1.5, .08, .14], [x, 1.06, z], C.gold); } }
  const engineEnds = layout === "double" ? ["front", "rear"] : [layout === "front" ? "front" : "rear"];
  for (const end of engineEnds) {
    const x = end === "front" ? 4.55 : -4.55, g = part(`zone-engine-${end}`);
    box(g, [1.5, .7, 1.05], [x, 1.36, 0], C.copper); box(g, [1.55, .17, 1.1], [x, 1.83, 0], C.steel);
    for (let i = 0; i < 4; i++) cyl(g, .12, .2, [x - .5 + i * .34, 2, 0], C.gold);
    cyl(g, .25, .75, [x, 1.35, .8], C.blue, "x");
  }
  const cooling = part("zone-cooling"), engineX = layout === "front" ? 4.95 : -5.2;
  k.finPack(cooling, [1.3, .9, .1], [engineX, 1.45, -1.1], C.blue);
  fan(cooling, [engineX, 1.45, -1.2], .38);
  const electric = part("zone-electrical"); battery(k, electric, [1, 1, .55], .75);
  const ac = part("zone-ac"); box(ac, [2.8, .32, 1.65], [-.7, 3.98, 0], C.steel);
  for (const x of [-1.4, .1]) { ring(ac, .43, .04, [x, 4.17, 0], C.dark); fan(ac, [x, 4.18, 0], .39, "y"); }
  const glass = part("windscreen"); box(glass, [.065, 1.45, 2.5], [5.8, 2.87, 0], C.glass, { glass: true });
  box(glass, [.08, 1.5, .045], [5.85, 2.87, 0], C.dark);
  const sides = part("side-glass");
  for (let x = -5.1; x < 4.3; x += 1.14) for (const z of [-1.38, 1.38]) box(sides, [1.04, 1.33, .035], [x, 2.91, z], C.glass, { glass: true });
  const wiper = part("wiper");
  for (const z of [-.7, .7]) { pipe(wiper, [[5.88, 2.15, z], [5.92, 2.55, z - .1], [5.92, 2.85, z + .12]], .025, C.dark); box(wiper, [.06, .7, .035], [5.94, 2.85, z + .12], C.dark); }
  const mirror = part("mirror");
  for (const z of [-1.75, 1.75]) { pipe(mirror, [[5.5, 3.3, Math.sign(z) * 1.3], [5.95, 3.3, z], [6.05, 2.9, z]], .045, C.dark); box(mirror, [.2, .5, .26], [6.05, 2.7, z], C.dark); box(mirror, [.04, .42, .21], [5.93, 2.7, z], C.glass); }
  const chairs = part("seat");
  for (let x = -3.4; x < 4.3; x += 1.18) for (const z of [-.85, .85]) seat(k, chairs, [x, 1.46, z], .6);
  const door = part("door");
  for (const x of [4.75, 5.2]) { box(door, [.42, 1.75, .07], [x, 2.33, 1.4], C.dark); box(door, [.35, 1.5, .08], [x, 2.37, 1.42], C.glass, { glass: true }); }
  const lights = part("lights");
  for (const z of [-.92, .92]) { box(lights, [.08, .22, .53], [5.85, 1.8, z], C.steel); cyl(lights, .1, .1, [5.92, 1.8, z], C.gold, "x"); }
  // Marker anchors pick one representative physical location, not the midpoint
  // between repeated axles/glass panels. Multiple engine bays stay separate.
  const anchors = { "zone-brakes": [3.7, .75, 1.6], "zone-suspension": [-3.5, 1.1, 1.1], "zone-driveline": [-.7, .9, .1], "zone-electrical": [1, 1.5, .5], "zone-cooling": [engineX, 1.6, -1.1], "zone-ac": [-.7, 4.3, 0], "zone-body": [-1.5, 2.7, 0] };
  for (const [id, point] of Object.entries(anchors)) k.parts.get(id).userData.anchor = new THREE.Vector3(...point);
  k.update(); return k;
}

export function buildSystemAnatomy(systemId, { engineLayout = "rear", cylinderCount } = {}) {
  if (systemId === "engine") return buildEngineAnatomy({ cylinderCount });
  if (systemId === "bus") return buildBus(engineLayout);
  if (!SYSTEM_3D_IDS[systemId]) throw new Error("Unknown anatomy system");
  const k = createAnatomyScene(`Generic ${systemId} teaching assembly`), { part, box, cyl, ring, pipe, fan, finPack, gear, lathe, mesh } = k;
  if (systemId === "cooling") {
    const radiator = part("radiator", [-1, .5, 0], [-1.8, .7, -1.3]);
    finPack(radiator, [2.8, 2.6, .4]); for (const x of [-1.5, 1.5]) cyl(radiator, .18, 2.65, [x, 0, 0], C.dark);
    cyl(radiator, .11, .13, [1.5, 1.47, 0], C.gold);
    const f = part("fan", [-1, .5, .62], [0, 0, 2.1]); ring(f, 1.08, .045, [0, 0, 0], C.dark, "z"); fan(f, [0, 0, 0], 1);
    const pump = part("water-pump", [1.8, -.55, 1], [1.8, -.8, 1.1]);
    cyl(pump, .4, .45, [0, 0, 0], C.blue, "z"); gear(pump, .23, [0, 0, .3], "z");
    pipe(pump, [[.3, 0, 0], [.65, -.3, 0], [1, -.3, 0]], .1, C.steel);
    const thermostat = part("thermostat", [1.7, 1.4, 0], [1.6, 1.5, -.5]);
    cyl(thermostat, .3, .12); cyl(thermostat, .12, .55, [0, -.15, 0], C.gold);
    mesh(thermostat, helixGeometry(.17, .39, 6, .019), [0, -.2, 0], C.steel);
    cyl(thermostat, .24, .025, [0, -.46, 0], C.steel);
  }
  if (systemId === "driveline") {
    const clutch = part("clutch", [-3.4, .3, 0], [-2, 0, 0]);
    for (const [x, r, color] of [[-.3, .8, C.dark], [0, .7, C.copper], [.3, .77, C.steel]]) { cyl(clutch, r, .15, [x, 0, 0], color, "x"); ring(clutch, r * .7, .035, [x + .09, 0, 0], C.gold, "x"); }
    const gearbox = part("gearbox", [-1.8, .3, 0], [-.3, 1.3, 0]);
    box(gearbox, [1.9, 1.5, 1.5], [0, 0, 0], C.blue, { ghost: true });
    for (const x of [-.8, -.4, 0, .4, .8]) box(gearbox, [.055, 1.57, 1.57], [x, 0, 0], C.steel, { ghost: true });
    cyl(gearbox, .74, .43, [-1.15, 0, 0], C.steel, "x", { bottomRadius: .55, ghost: true });
    for (const y of [-.3, .3]) { cyl(gearbox, .085, 2.05, [0, y, 0], C.steel, "x"); for (const [i, r] of [.26, .38, .48].entries()) gear(gearbox, y < 0 ? .74 - r : r, [i * .55 - .6, y, 0]); }
    const shaft = part("propshaft", [.8, .3, 0], [0, -.8, 1.6]); cyl(shaft, .14, 3.3, [0, 0, 0], C.steel, "x");
    for (const x of [-1.7, 1.7]) { cyl(shaft, .3, .12, [x, 0, 0], C.dark, "x"); box(shaft, [.3, .1, .48], [x, 0, 0], C.gold); }
    const diff = part("differential", [3.2, .3, 0], [1.6, 0, -.8]);
    cyl(diff, .65, .85, [0, 0, 0], C.blue, "z", { ghost: true }); gear(diff, .52, [0, 0, 0], "z");
    cyl(diff, .13, 3.7, [0, 0, 0], C.steel, "z");
    const steering = part("steering", [1, .3, -2.4], [0, 1.4, -1.3]);
    cyl(steering, .09, 2.4, [0, 0, 0], C.steel, "z"); box(steering, [.7, .45, .65], [0, 0, -.6], C.dark);
    pipe(steering, [[0, 0, -.6], [-.4, 1.5, -.6], [-.5, 1.9, -.6]], .07, C.steel); ring(steering, .38, .04, [-.5, 1.9, -.6], C.dark);
  }
  if (systemId === "brakes") {
    const compressor = part("compressor", [-3, .5, 0], [-1.7, 0, -.7]);
    box(compressor, [.9, .7, .75], [0, 0, 0], C.dark);
    for (const x of [-.23, .23]) { cyl(compressor, .2, .6, [x, .55, 0], C.steel); for (let i = 0; i < 5; i++) ring(compressor, .22, .022, [x, .35 + i * .1, 0], C.steel); }
    cyl(compressor, .34, .13, [0, 0, .48], C.gold, "z");
    const dryer = part("air-dryer", [-1.4, .55, .2], [-.8, 1.3, .7]); cyl(dryer, .34, .85, [0, 0, 0], C.blue); box(dryer, [.8, .16, .65], [0, -.5, 0], C.dark);
    const tank = part("reservoir", [.4, .3, -.3], [0, -.8, -1.5]);
    lathe(tank, [[0,-1.1],[.22,-1.07],[.40,-1],[.49,-.86],[.5,-.70],[.5,.7],[.49,.86],[.4,1],[.22,1.07],[0,1.1]], [0, 0, 0], C.dark, "x");
    for (const x of [-.7, .7]) ring(tank, .515, .04, [x, 0, 0], C.dark, "x");
    cyl(tank, .055, .18, [0, -.55, 0], C.gold);
    const chamber = part("brake-chamber", [2.2, .7, -.3], [1, 1.1, -1.4]);
    cyl(chamber, .42, .55, [0, 0, 0], C.dark, "z"); ring(chamber, .43, .04, [0, 0, 0], C.gold, "z"); cyl(chamber, .06, .8, [0, 0, .65], C.steel, "z");
    const pads = part("brake-friction", [2.25, .6, 1], [1.3, 0, 1.3]);
    cyl(pads, .87, .2, [0, 0, -.1], C.steel, "z"); ring(pads, .67, .055, [0, 0, .03], C.dark, "z");
    cyl(pads, .29, .25, [0, 0, .035], C.dark, "z");
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; cyl(pads, .045, .06, [Math.cos(a) * .39, Math.sin(a) * .39, .07], C.dark, "z"); }
    for (let i = 0; i < 28; i++) { const a = i * Math.PI / 14; box(pads, [.075, .014, .18], [Math.cos(a) * .84, Math.sin(a) * .84, -.1], C.dark, { rotation: [0, 0, a] }); }
    for (const z of [-.25, .25]) box(pads, [.32, .65, .1], [.6, 0, z], C.copper);
    box(pads, [.55, .83, .58], [.71, 0, 0], C.blue, { ghost: true });
    for (const y of [-.31, .31]) cyl(pads, .07, .7, [.75, y, 0], C.steel, "z");
  }
  if (systemId === "suspension") {
    const leaf = part("leaf-spring", [-1.2, .15, 0], [-1.5, -.2, 1]);
    for (let i = 0; i < 6; i++) {
      const half = 1.8 - i * .2, profile = new THREE.Shape();
      profile.moveTo(-half, .3 - i * .035); profile.quadraticCurveTo(0, -.28 - i * .075, half, .3 - i * .035);
      profile.lineTo(half, .255 - i * .035); profile.quadraticCurveTo(0, -.325 - i * .075, -half, .255 - i * .035); profile.closePath();
      const geo = new THREE.ExtrudeGeometry(profile, { depth: .26, bevelEnabled: false, curveSegments: 20 }); geo.translate(0, 0, -.13);
      mesh(leaf, geo, [0, 0, 0], C.dark);
    }
    for (const x of [-1.8, 1.8]) ring(leaf, .16, .055, [x, .3, 0], C.dark, "z"); box(leaf, [.3, .7, .4], [0, -.1, 0], C.gold);
    const air = part("air-spring", [-1.2, .5, 0], [-1.5, .2, .6]);
    const bellows = [[.48,-.6],[.58,-.56]];
    for (let i = 0; i <= 40; i++) { const y = -.52 + i * .026; bellows.push([.50 + .13 * Math.sin(i / 40 * Math.PI * 3) ** 2, y]); }
    bellows.push([.58,.56],[.48,.6]); lathe(air, bellows, [0, 0, 0], C.dark, "y", { finish: { metalness: 0, roughness: .89 } });
    for (const y of [-.65, .6]) cyl(air, .68, .12, [0, y, 0], C.steel);
    const levelling = part("levelling", [.15, 1.2, -.65], [0, 1.6, -.7]);
    box(levelling, [.5, .55, .4], [0, 0, 0], C.blue); pipe(levelling, [[0, 0, .3], [.75, 0, .3], [.8, -1.2, .3]], .045, C.gold);
    const damper = part("damper", [1.5, .7, .4], [1.2, .7, 1.4]);
    cyl(damper, .19, 1.3, [0, -.2, 0], C.blue); cyl(damper, .065, .8, [0, .65, 0], C.steel);
    for (const y of [-.95, 1.13]) ring(damper, .14, .07, [0, y, 0], C.dark, "z");
    const antiroll = part("antiroll", [0, -.55, -1.6], [0, -.8, -1.5]);
    pipe(antiroll, [[-2, 0, 1], [-2, 0, 0], [-1.5, 0, -.2], [1.5, 0, -.2], [2, 0, 0], [2, 0, 1]], .11, C.gold);
    for (const x of [-1.4, 1.4]) box(antiroll, [.26, .32, .33], [x, 0, -.2], C.dark);
  }
  if (systemId === "electrical") {
    const b = part("battery", [-1.6, .45, 0], [-1.5, .2, 0]); battery(k, b);
    const starter = part("starter", [.8, .4, -.55], [1, 0, -1.3]);
    cyl(starter, .37, 1.15, [0, 0, 0], C.dark, "x"); cyl(starter, .17, .65, [0, .4, 0], C.blue, "x"); gear(starter, .2, [.8, 0, 0]);
    const alternator = part("alternator", [.8, .65, 1], [.9, .7, 1.3]);
    cyl(alternator, .48, .6, [0, 0, 0], C.steel, "x", { open: true }); cyl(alternator, .34, .63, [0, 0, 0], C.copper, "x");
    for (const x of [-.35, .35]) { cyl(alternator, .5, .08, [x, 0, 0], C.dark, "x"); ring(alternator, .42, .035, [x, 0, 0], C.steel, "x"); }
    cyl(alternator, .25, .15, [.55, 0, 0], C.gold, "x");
    for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; box(alternator, [.4, .025, .10], [0, .485 * Math.cos(a), .485 * Math.sin(a)], C.dark, { rotation: [a, 0, 0] }); }
    for (const x of [-.26, .26]) box(alternator, [.18, .22, .25], [x, -.52, 0], C.steel);
    const lamps = part("lights", [-1.2, .5, 2], [-1.2, .4, 1.5]);
    box(lamps, [1.8, .75, .3], [0, 0, 0], C.dark);
    for (const x of [-.4, .2]) { cyl(lamps, .24, .24, [x, 0, .2], C.steel, "z"); cyl(lamps, .18, .025, [x, 0, .35], C.glass, "z"); }
    box(lamps, [.28, .5, .1], [.7, 0, .23], C.gold);
  }
  if (systemId === "ac") {
    const compressor = part("ac-compressor", [-2.6, .4, .4], [-1.7, -.3, .7]);
    cyl(compressor, .43, 1.1, [0, 0, 0], C.steel, "x"); cyl(compressor, .47, .16, [.65, 0, 0], C.dark, "x");
    for (const z of [-.25, .25]) cyl(compressor, .08, .25, [0, .48, z], C.gold);
    const condenser = part("condenser", [-1, 1.4, -1], [-.7, 1.3, -1]); finPack(condenser, [2.4, 1.6, .28]); fan(condenser, [0, 0, .3], .6);
    const expansion = part("expansion", [1.35, .8, -.1], [1.1, .8, 0]); box(expansion, [.42, .4, .45], [0, 0, 0], C.gold);
    cyl(expansion, .2, .14, [0, .3, 0], C.steel); pipe(expansion, [[.2, 0, 0], [.6, 0, 0], [.7, -.3, 0]], .06, C.copper);
    const evaporator = part("evaporator", [2.4, .6, 1], [1.1, -.2, 1.5]); finPack(evaporator, [1.6, 1.25, .4]);
    cyl(evaporator, .35, 1.65, [0, .9, 0], C.dark, "x", { open: true });
    for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; box(evaporator, [1.65, .035, .1], [0, .9 + .34 * Math.cos(a), .34 * Math.sin(a)], C.blue, { rotation: [a, 0, 0] }); }
  }
  if (systemId === "body") {
    const screen = part("windscreen", [3.2, 1.5, 0], [1.6, .4, -.5]);
    box(screen, [.09, 2.4, 3], [0, 0, 0], C.glass, { glass: true });
    for (const y of [-1.2, 1.2]) box(screen, [.12, .09, 3.1], [0, y, 0], C.dark);
    for (const z of [-1.5, 1.5]) box(screen, [.12, 2.5, .08], [0, 0, z], C.dark);
    const glass = part("side-glass", [-.6, 1.8, -1.45], [-.7, .6, -1.3]);
    for (const x of [-1.1, 1.1]) { box(glass, [2.1, 1.6, .06], [x, 0, 0], C.glass, { glass: true }); for (const y of [-.82, .82]) box(glass, [2.15, .065, .09], [x, y, 0], C.dark); box(glass, [.065, 1.7, .09], [x - 1.07, 0, 0], C.dark); }
    const wiper = part("wiper", [3.35, .9, 0], [2, -.6, 1]);
    for (const z of [-.8, .8]) { cyl(wiper, .07, .12, [0, 0, z], C.steel, "x"); pipe(wiper, [[0, 0, z], [.05, .4, z - .12], [.05, .85, z + .1]], .04, C.dark); box(wiper, [.06, .85, .065], [.1, .85, z + .1], C.dark); }
    for (const z of [-.8, .8]) {
      pipe(wiper, [[.15,.45,z + .1],[.21,.67,z + .1],[.24,.85,z + .1],[.21,1.03,z + .1],[.15,1.25,z + .1]], .018, C.steel);
      for (const y of [.55, .78, 1.02, 1.16]) box(wiper, [.13, .015, .075], [.15, y, z + .1], C.dark);
    }
    box(wiper, [.5, .35, .5], [-.35, -.1, 0], C.blue); pipe(wiper, [[-.3, 0, -.8], [-.3, 0, .8]], .035, C.steel);
    const mirror = part("mirror", [3.25, 2, 2], [1.5, .8, 1.1]);
    pipe(mirror, [[-.6, .6, -.5], [0, .6, -.2], [.1, .1, 0]], .06, C.dark); box(mirror, [.24, .95, .5], [0, -.3, 0], C.dark);
    box(mirror, [.025, .58, .4], [-.14, -.17, 0], C.steel, { finish: { metalness: 1, roughness: .08 } });
    box(mirror, [.025, .21, .4], [-.14, -.60, 0], C.steel, { finish: { metalness: 1, roughness: .12 } });
    const chair = part("seat", [-1.3, -.1, .35], [-.8, -.3, 1.5]); seat(k, chair, [0, 0, 0], 1.1);
    const door = part("door", [1, 1.05, 1.5], [0, .1, 2]);
    for (const x of [-.4, .4]) { box(door, [.78, 2.5, .1], [x, 0, 0], C.dark); box(door, [.65, 1.85, .12], [x, .2, .03], C.glass, { glass: true }); }
    for (const y of [-1, 1]) cyl(door, .065, .25, [-.82, y, 0], C.gold);
    pipe(door, [[-.25, -.4, .14], [-.25, .15, .14]], .035, C.steel);
  }
  k.update(); return k;
}
