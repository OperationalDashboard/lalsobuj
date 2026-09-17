import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// CC0 “3D Bus” by ajanhallinta. See assets/maintenance-preview/ATTRIBUTION.md.
// Keep its authored wheel arches, nose, body panels and window apertures.
// The semantic groups below make the real mesh clickable, not just its labels.
export function installCoachExterior(kit, objText) {
  const source = new OBJLoader().parse(objText);
  const bounds = new THREE.Box3().setFromObject(source), center = bounds.getCenter(new THREE.Vector3());
  const scale = 12 / bounds.getSize(new THREE.Vector3()).x;
  const replaced = new Set(["zone-body", "zone-brakes", "windscreen", "side-glass", "lights", "door"]);
  kit.root.updateMatrixWorld(true);
  for (const m of kit.meshes) {
    // Bake nested fan/seat transforms before matching the coach height. Scaling
    // only leaf meshes leaves their parent groups floating above the roof.
    m.geometry.applyMatrix4(m.matrixWorld); m.geometry.scale(1, .77, .94);
    m.removeFromParent(); kit.parts.get(m.userData.partId).add(m);
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    if (replaced.has(m.userData.partId)) m.userData.replaced = true;
  }
  for (const g of kit.parts.values()) if (g.userData.anchor) { g.userData.anchor.y *= .77; g.userData.anchor.z *= .94; }
  const palettes = {
    Body: [0xd8dfda, .3, .29], Windows: [0x18313b, .4, .12], karmi: [0x22282a, .25, .5],
    Metal: [0xa9b0b2, .9, .23], Tire: [0x1c2021, .02, .86], Bolt: [0x777f82, .9, .22],
    RearLights: [0x9b2828, .2, .23], FrontLights: [0xe6e5da, .35, .16], Indicators: [0xb77525, .25, .27],
  };
  const buckets = new Map();
  source.traverse(object => {
    if (!object.isMesh) return;
    const geo = object.geometry, positions = geo.getAttribute("position"), normals = geo.getAttribute("normal");
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const ranges = geo.groups.length ? geo.groups : [{ start: 0, count: positions.count, materialIndex: 0 }];
    for (const range of ranges) {
      const material = materials[range.materialIndex]?.name || "Body";
      for (let i = range.start; i < range.start + range.count; i += 3) {
        const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, i + j));
        points.forEach(p => p.set((p.x - center.x) * scale, (p.y - bounds.min.y) * scale, (p.z - center.z) * scale));
        const c = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(3);
        let id = "zone-body";
        if (/wheel/i.test(object.name)) id = "zone-brakes";
        else if (material === "Windows") id = c.x > 5.45 ? "windscreen" : c.x > 4.1 && c.z > 1 ? "door" : "side-glass";
        else if (["RearLights", "FrontLights", "Indicators"].includes(material)) id = "lights";
        else if (material === "Body" && c.y < 1.4) {
          if (c.x < -4 && kit.parts.has("zone-engine-rear")) id = "zone-engine-rear";
          if (c.x > 4 && kit.parts.has("zone-engine-front")) id = "zone-engine-front";
        }
        const key = `${id}/${material}`;
        if (!buckets.has(key)) buckets.set(key, { id, material, positions: [], normals: [] });
        const bucket = buckets.get(key);
        for (let j = 0; j < 3; j++) {
          bucket.positions.push(...points[j].toArray());
          if (normals) bucket.normals.push(normals.getX(i + j), normals.getY(i + j), normals.getZ(i + j));
        }
      }
    }
    geo.dispose(); materials.forEach(m => m.dispose());
  });
  for (const { id, material, positions, normals } of buckets.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3)); else geometry.computeVertexNormals();
    const [color, metalness, roughness] = palettes[material] || palettes.Body;
    kit.mesh(kit.parts.get(id), geometry, [0, 0, 0], color, [0, 0, 0], {
      ghost: material === "Body" || material === "Windows", glass: material === "Windows",
      finish: { metalness, roughness }, flags: { authoredExterior: true, sourceMaterial: material },
    });
  }
  // Restrained fleet paint, separated luggage doors and rubber panel seals.
  const body = kit.parts.get("zone-body");
  for (const z of [-1.331, 1.331]) {
    kit.box(body, [8.2, .13, .012], [-.35, 1.27, z], 0x255c48, { ghost: true, finish: { metalness: .2, roughness: .28 } });
    for (const x of [-1.8, -.5, .8, 2.1]) {
      kit.box(body, [.012, .48, .014], [x, .97, z], 0x65736d, { ghost: true });
      kit.box(body, [.16, .025, .02], [x - .18, 1.13, z], 0x343d3b, { ghost: true });
    }
  }
  kit.root.userData.exteriorSource = "3D Bus / ajanhallinta / CC0";
  kit.update();
  return kit;
}
