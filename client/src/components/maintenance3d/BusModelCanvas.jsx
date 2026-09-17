import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import busUrl from "../../assets/maintenance-preview/bus.obj?url";
import materialUrl from "../../assets/maintenance-preview/bus.mtl?url";
import { STATUS } from "./model.js";

export default function BusModelCanvas({ parts, selectedId, onSelect, placing, onPlace }) {
  const host = useRef(null), marks = useRef({}), sceneApi = useRef(null);
  const latest = useRef({ parts, placing, onPlace });
  latest.current = { parts, placing, onPlace };
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [rotating, setRotating] = useState(false), [view, setView] = useState("Overview");
  useEffect(() => {
    let dead = false, frame = 0, renderer, model, visible = true, dirty = true, previous = 0;
    const container = host.current, aborter = new AbortController();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    camera.position.set(12, 7.5, 16);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.domElement.setAttribute("aria-label", "Interactive 3D bus. Drag to rotate; scroll or pinch to zoom. Use the view buttons for keyboard navigation.");
      renderer.domElement.setAttribute("role", "img");
      container.prepend(renderer.domElement);
    } catch {
      setError("3D is not available in this browser. You can still select and edit parts from the list.");
      return;
    }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.35, 0);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 11;
    controls.maxDistance = 29;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.autoRotateSpeed = .65;
    controls.update();
    const invalidate = () => { dirty = true; };
    controls.addEventListener("change", invalidate);
    scene.add(new THREE.HemisphereLight(0xc9e5ff, 0x2c3545, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.5); key.position.set(5, 9, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x67e8c2, 2); rim.position.set(-7, 5, -5); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 80), new THREE.MeshBasicMaterial({ color: 0x263d50, transparent: true, opacity: .32, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.04; scene.add(floor);
    const grid = new THREE.GridHelper(18, 24, 0x385365, 0x22394a); grid.position.y = -.03;
    grid.material.transparent = true; grid.material.opacity = .32; scene.add(grid);
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false); dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; dirty = true; }); intersection.observe(container);
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), point = new THREE.Vector3();
    let pointerDown = null;
    const onDown = (e) => { pointerDown = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!latest.current.placing || !model || !pointerDown || Math.hypot(e.clientX-pointerDown[0], e.clientY-pointerDown[1]) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(model, true)[0];
      if (hit) latest.current.onPlace?.({ x: +hit.point.x.toFixed(2), y: +hit.point.y.toFixed(2), z: +hit.point.z.toFixed(2) });
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    sceneApi.current = { controls, camera, invalidate, reset: (name) => {
      const positions = { Overview: [12,7.5,16], Front: [20,5,0], Rear: [-20,5,0], Left: [0,7,-20], Right: [0,7,20] };
      camera.position.fromArray(positions[name] || positions.Overview);
      controls.target.set(0,1.35,0); controls.update(); dirty = true;
    } };
    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      if (dead || !visible || document.hidden || now - previous < 32) return;
      const delta = previous ? Math.min((now-previous)/1000,.1) : .032; previous = now;
      if (controls.autoRotate && !reducedMotion.matches && !latest.current.placing) controls.update(delta);
      if (dirty) { renderer.render(scene,camera); dirty = false; }
      // DOM labels remain actual keyboard-accessible buttons while anchored in 3D.
      for (const part of latest.current.parts) {
        const el = marks.current[part.id]; if (!el) continue;
        point.set(part.x,part.y,part.z).project(camera);
        el.style.left = `${(point.x*.5+.5)*container.clientWidth}px`;
        el.style.top = `${(-point.y*.5+.5)*container.clientHeight}px`;
        el.style.visibility = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1 ? "hidden" : "visible";
      }
    };
    frame = requestAnimationFrame(draw);
    (async () => {
      const responses = await Promise.all([fetch(busUrl,{signal:aborter.signal}),fetch(materialUrl,{signal:aborter.signal})]);
      if (responses.some((r) => !r.ok)) throw new Error("Model download failed");
      const [obj,mtl] = await Promise.all(responses.map((r)=>r.text()));
      if (dead) return;
      const materials = new MTLLoader().parse(mtl, ""); materials.preload();
      model = new OBJLoader().setMaterials(materials).parse(obj);
      const palette = { Body: "#d5e8e2", Windows: "#143f50", Tire: "#18252c", Metal: "#a9bdc6", Bolt: "#394a57", karmi: "#25343d", RearLights: "#e84258", FrontLights: "#faf0d3", Indicators: "#f9b65d" };
      model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
          const material = new THREE.MeshStandardMaterial({ color: palette[m.name] || "#ceddd5", metalness: m.name === "Metal" ? .7 : .18, roughness: m.name === "Windows" ? .22 : .55 });
          m.dispose(); return material;
        });
      });
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const scale = 12/size.x; model.scale.setScalar(scale);
      model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      scene.add(model); dirty = true; setLoaded(true);
    })().catch((err) => { if (!dead && err.name !== "AbortError") setError("The bus model could not load. Reload this preview, or use the parts list below."); });
    return () => {
      dead = true; aborter.abort(); cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      controls.dispose(); sceneApi.current = null;
      renderer.domElement.removeEventListener("pointerdown",onDown); renderer.domElement.removeEventListener("pointerup",onUp);
      const disposed = new Set();
      scene.traverse((object) => { object.geometry?.dispose(); if (object.material) for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (!disposed.has(m)) { disposed.add(m); m.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => { if (sceneApi.current) sceneApi.current.controls.autoRotate = rotating; }, [rotating]);
  return <div className="bus3d-stage-wrap">
    <div className="bus3d-stage-top"><span><i /> INTERACTIVE BUS VIEW</span><span>{placing ? "Click the bus to position this part" : "Drag to rotate · Scroll to zoom"}</span></div>
    <div className={`bus3d-stage ${placing ? "is-placing" : ""}`} ref={host}>
      {!loaded && !error && <div className="bus3d-loading" role="status">Loading bus model…</div>}
      {error && <div className="bus3d-loading" role="alert">{error}</div>}
      {loaded && !error && parts.map((p,index) => <button key={p.id} ref={(el) => { if (el) marks.current[p.id] = el; else delete marks.current[p.id]; }} className={`bus3d-marker ${p.id === selectedId ? "is-selected" : ""} ${p.status !== "clear" ? "has-repair" : ""}`} style={{ "--marker": STATUS[p.status || "clear"].color }} aria-label={`Inspect ${p.label}: ${STATUS[p.status || "clear"].label}`} aria-pressed={p.id === selectedId} onClick={()=>onSelect(p.id)}><span>{String(index+1).padStart(2,"0")}</span><b>{p.label}</b></button>)}
    </div>
    <div className="bus3d-camera-bar"><div role="group" aria-label="Camera views">{["Overview","Front","Rear","Left","Right"].map((name)=><button key={name} className={name===view?"active":""} aria-pressed={name===view} onClick={()=>{setView(name);sceneApi.current?.reset(name);}}>{name}</button>)}</div><button className="bus3d-rotate" aria-pressed={rotating} onClick={()=>setRotating(!rotating)}>{rotating ? "Ⅱ Pause rotation" : "↻ Auto rotate"}</button></div>
    <div className="bus3d-stage-caption">Illustrative template · Parts can be repositioned for your bus layout.</div>
  </div>;
}
