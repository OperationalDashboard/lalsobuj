import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Neutral workshop materials. Selection adds a subtle glow, not a coat of neon paint.
export const FINISH = { steel: 0xb3b8b9, dark: 0x303638, green: 0x33594e, blue: 0x586773, gold: 0xa08a59, copper: 0x916e53, glass: 0x213d48, red: 0x81352d };
export function workshopMaterial(color, options = {}) {
  const dark = color === FINISH.dark;
  return new THREE.MeshStandardMaterial({
    color, metalness: options.glass ? .25 : dark ? .18 : .72,
    roughness: options.glass ? .13 : dark ? .65 : .32,
    side: THREE.DoubleSide, ...options,
  });
}
export function roundedBox(size, radius = Math.min(...size) * .15) {
  return new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) / 2));
}
export function latheProfile(points, segments = 40) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}
export function helixGeometry(radius, height, turns = 6, wire = .02) {
  const points = Array.from({ length: turns * 16 + 1 }, (_, i) => {
    const t = i / (turns * 16), a = t * turns * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 20, wire, 6, false);
}
export function toothedGearGeometry(radius, depth = .18, teeth = 24) {
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const a = i / (teeth * 4) * Math.PI * 2;
    const r = radius * ([0, 3].includes(i % 4) ? .91 : 1.035);
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(r, 0);
  }
  shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, radius * .22, 0, Math.PI * 2, true); shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 1, curveSegments: 16 });
  geometry.translate(0, 0, -depth / 2); return geometry;
}
export function fanBladeGeometry(radius) {
  const shape = new THREE.Shape();
  shape.moveTo(.12 * radius, -.035 * radius);
  shape.bezierCurveTo(.35 * radius, -.23 * radius, .78 * radius, -.23 * radius, radius, -.09 * radius);
  shape.quadraticCurveTo(.96 * radius, .23 * radius, .8 * radius, .25 * radius);
  shape.quadraticCurveTo(.45 * radius, .06 * radius, .12 * radius, .07 * radius);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .035 * radius, bevelEnabled: true, bevelSize: .012 * radius, bevelThickness: .008 * radius, bevelSegments: 1, curveSegments: 12 });
}
