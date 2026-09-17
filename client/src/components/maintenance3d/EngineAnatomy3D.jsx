import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import coachObj from "../../assets/maintenance-preview/bus.obj?raw";
import { installCoachExterior } from "./coachExteriorScene.js";
import { buildSystemAnatomy, SYSTEM_3D_IDS } from "./systemAnatomyScenes.js";
import { availableBusTargets } from "./anatomyNavigation.js";
import { SYSTEMS } from "./anatomyCatalog.js";
import "./engineAnatomy3D.css";

export default function EngineAnatomy3D({ selected, parts, onSelect, modelLabel, systemId = "engine", engineLayout = "rear", suspension, cylinderCount, cylinderEvidence, onBack, onLocate, initialFocus = false }) {
  const mount = useRef(null), api = useRef(null), latest = useRef({ onSelect });
  const [status, setStatus] = useState("loading"), [retry, setRetry] = useState(0);
  const [explode, setExplode] = useState(0), [xray, setXray] = useState(systemId === "engine" || systemId === "driveline");
  const [isolate, setIsolate] = useState(false), [spin, setSpin] = useState(false), [warning, setWarning] = useState(false);
  const [hover, setHover] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const markerRefs = useRef(new Map());
  const isBus = systemId === "bus";
  const choices = isBus ? availableBusTargets(parts, engineLayout) : parts;
  const ids = isBus ? choices.map(p => p.id) : parts.filter(p => !p.hidden && SYSTEM_3D_IDS[systemId]?.includes(p.id)).map(p => p.id);
  const allowedKey = ids.join("|");
  const mapped = ids.includes(selected?.id);
  const usable = status === "ready";
  latest.current = { onSelect, selectedId: selected?.id, hoveredId: hover, explode: isBus ? 0 : explode, xray, isolate: !isBus && isolate && mapped, spin, warning: !isBus && warning && mapped, allowedIds: ids, suspension, initialFocus, showLabels };

  useEffect(() => {
    const host = mount.current;
    let renderer, engine, controls, observer, resize, floor, environment;
    let frame = 0, disposed = false, inView = true, contextLost = false, dirty = true, lastTime = 0;
    let cameraTween = null, animation = null, currentExplode = latest.current.explode;
    let previousSelected, previousModel, previousExplode, previousIsolate, previousFocus;
    let pointerStart = null, pendingNavigation = null;
    const activePointers = new Set();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .05, 150);
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const cleanup = [];
    function listen(target, name, handler, options) { target.addEventListener(name, handler, options); cleanup.push(() => target.removeEventListener(name, handler, options)); }
    const schedule = () => { dirty = true; if (!disposed && !frame && !document.hidden && inView && !contextLost) frame = requestAnimationFrame(draw); };
    function updateScene() { engine.update({ ...latest.current, explode: currentExplode }); if (floor) floor.position.y = engine.bounds().min.y - .025; }
    function fit(id, view) {
      if (!engine || !controls) return;
      const bounds = engine.bounds(id), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      const direction = view === "top" ? new THREE.Vector3(.05, 1, .05) : view === "side" ? new THREE.Vector3(0, .15, 1)
        : view === "home" ? new THREE.Vector3(isBus ? .95 : 1.3, isBus ? .65 : .85, 1.55) : camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < .01) direction.set(1, .65, 1.5);
      direction.normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      let distance = 2.3;
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        const corner = new THREE.Vector3(size.x * x, size.y * y, size.z * z), depth = corner.dot(direction);
        distance = Math.max(distance, Math.abs(corner.dot(right)) / (tangent * camera.aspect) + depth, Math.abs(corner.dot(up)) / tangent + depth);
      }
      distance = THREE.MathUtils.clamp(distance * 1.17, 2.3, 70);
      const position = center.clone().addScaledVector(direction, distance);
      cameraTween = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: position, toTarget: center };
      if (reducedMotion.matches) { camera.position.copy(position); controls.target.copy(center); cameraTween = null; controls.update(); }
      schedule();
    }
    function draw(now) {
      frame = 0;
      if (disposed || contextLost || document.hidden || !inView) return;
      const dt = Math.min(.05, lastTime ? (now - lastTime) / 1000 : 0); lastTime = now;
      if (animation) {
        const t = Math.min(1, (now - animation.start) / 420), eased = 1 - (1 - t) ** 3;
        currentExplode = THREE.MathUtils.lerp(animation.from, animation.to, eased); updateScene(); dirty = true;
        if (t === 1) animation = null;
      }
      if (cameraTween) {
        const t = Math.min(1, (now - cameraTween.start) / 520), eased = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
        controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
        controls.update(); dirty = true; if (t === 1) cameraTween = null;
      }
      if (latest.current.spin && !reducedMotion.matches && !pointerStart && !cameraTween) {
        const relative = camera.position.clone().sub(controls.target); relative.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * .16);
        camera.position.copy(controls.target).add(relative); controls.update(); dirty = true;
      }
      if (latest.current.warning && !reducedMotion.matches) {
        const intensity = .3 + .18 * (1 + Math.sin(now / 250));
        for (const m of engine.meshes) if (m.userData.partId === latest.current.selectedId) m.material.emissiveIntensity = intensity;
        dirty = true;
      }
      if (dirty) {
        renderer.render(scene, camera);
        if (isBus) for (const [id, node] of markerRefs.current) {
          const group = engine.parts.get(id);
          if (!group?.visible || !latest.current.showLabels) { node.style.visibility = "hidden"; continue; }
          const point = (group.userData.anchor?.clone() || engine.bounds(id).getCenter(new THREE.Vector3())).project(camera);
          node.style.visibility = point.z < 1 && point.z > -1 && Math.abs(point.x) < .97 && Math.abs(point.y) < .94 ? "visible" : "hidden";
          node.style.left = `${(point.x * .5 + .5) * 100}%`;
          node.style.top = `${(-point.y * .5 + .5) * 100}%`;
        }
        dirty = false;
      }
      if (animation || cameraTween || ((latest.current.spin || latest.current.warning) && !reducedMotion.matches)) schedule();
    }
    function pick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera); return engine.pick(raycaster);
    }
    function command(action) {
      if (action === "reset") { fit(null, "home"); return; }
      if (action === "focus") { fit(latest.current.selectedId); return; }
      if (action === "top" || action === "side") { fit(latest.current.isolate ? latest.current.selectedId : null, action); return; }
      cameraTween = null;
      const offset = camera.position.clone().sub(controls.target);
      if (action === "in" || action === "out") offset.multiplyScalar(action === "in" ? .8 : 1.25).clampLength(controls.minDistance, controls.maxDistance);
      else if (action === "left" || action === "right") offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), action === "left" ? -.25 : .25);
      camera.position.copy(controls.target).add(offset); controls.update(); schedule();
    }
    try {
      setStatus("loading");
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.tabIndex = 0; canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Interactive 3D ${isBus ? "bus: click a part to open its system" : systemId}. Drag to rotate, pinch or scroll to zoom. Keyboard controls and part lists are also available.`);
      host.appendChild(canvas);
      camera.position.set(10, 7, 11);
      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = false; controls.enablePan = true; controls.minDistance = 1.5; controls.maxDistance = 75;
      controls.maxPolarAngle = Math.PI * .95; controls.target.set(0, .3, 0);
      listen(controls, "change", schedule);
      listen(controls, "start", () => { cameraTween = null; });
      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .65;
      room.dispose(); pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xe6edf5, 0x4c504f, 1.1));
      for (const [color, strength, position] of [[0xfff5e7, 3, [5, 10, 7]], [0xc6d8ec, 1.2, [-5, 4, -5]]]) {
        const light = new THREE.DirectionalLight(color, strength); light.position.set(...position);
        if (strength === 3) {
          light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
          Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .1, far: 40 });
          light.shadow.bias = -.001; light.shadow.normalBias = .025;
          cleanup.push(() => light.shadow.dispose());
        }
        scene.add(light);
      }
      engine = buildSystemAnatomy(systemId, { engineLayout, cylinderCount });
      if (isBus) installCoachExterior(engine, coachObj);
      scene.add(engine.root); updateScene();
      floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ color: 0x02070b, opacity: .28 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = engine.bounds().min.y - .025; floor.receiveShadow = true; scene.add(floor);
      function onResize() {
        const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
        fit(latest.current.isolate || latest.current.initialFocus ? latest.current.selectedId : null, "home");
      }
      resize = new ResizeObserver(onResize); resize.observe(host); onResize();
      observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) { lastTime = 0; schedule(); } }, { rootMargin: "60px" }); observer.observe(host);
      listen(document, "visibilitychange", () => { if (!document.hidden) { lastTime = 0; schedule(); } });
      listen(reducedMotion, "change", () => { if (reducedMotion.matches && animation) { currentExplode = animation.to; animation = null; updateScene(); } schedule(); });
      listen(canvas, "pointerdown", e => {
        activePointers.add(e.pointerId);
        if (pendingNavigation) { clearTimeout(pendingNavigation); pendingNavigation = null; }
        pointerStart = activePointers.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false } : null;
      });
      listen(canvas, "pointerup", e => {
        if (activePointers.size === 1 && pointerStart?.id === e.pointerId && !pointerStart.moved && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) < 6) {
          const id = pick(e); if (id) {
            fit(id);
            if (isBus && !reducedMotion.matches) pendingNavigation = setTimeout(() => { if (!disposed) latest.current.onSelect(id); }, 360);
            else latest.current.onSelect(id);
          }
        }
        activePointers.delete(e.pointerId); pointerStart = null;
      });
      listen(canvas, "pointercancel", e => { activePointers.delete(e.pointerId); pointerStart = null; });
      listen(canvas, "pointerleave", () => { setHover(""); });
      listen(canvas, "pointermove", e => {
        if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6) pointerStart.moved = true;
        if (!activePointers.size && e.pointerType !== "touch") { const id = pick(e); setHover(id || ""); canvas.style.cursor = id ? "pointer" : "grab"; }
      });
      listen(canvas, "keydown", e => {
        const action = { ArrowLeft: "left", ArrowRight: "right", "+": "in", "=": "in", "-": "out", Home: "reset", Enter: "focus" }[e.key];
        if (action) { e.preventDefault(); command(action); }
      });
      listen(canvas, "webglcontextlost", e => { e.preventDefault(); contextLost = true; setStatus("lost"); if (frame) cancelAnimationFrame(frame); frame = 0; });
      listen(canvas, "webglcontextrestored", () => { if (!disposed) setRetry(n => n + 1); });
      api.current = {
        command,
        update(model) {
          if (disposed || contextLost) return;
          const next = latest.current;
          const changedExplode = previousExplode !== undefined && previousExplode !== next.explode;
          if (changedExplode && !reducedMotion.matches) animation = { start: performance.now(), from: currentExplode, to: next.explode };
          else if (changedExplode) { currentExplode = next.explode; animation = null; }
          updateScene();
          if (changedExplode) {
            engine.update(next); fit(next.isolate ? next.selectedId : null); updateScene();
          } else if (previousModel !== undefined && previousModel !== model) fit(null, "home");
          else if (previousSelected !== undefined && previousSelected !== next.selectedId) fit(next.selectedId);
          else if (!previousFocus && next.initialFocus) fit(next.selectedId);
          else if (previousIsolate !== next.isolate) fit(next.isolate ? next.selectedId : null);
          previousSelected = next.selectedId; previousModel = model; previousExplode = next.explode; previousIsolate = next.isolate; previousFocus = next.initialFocus;
          schedule();
        },
      };
      setStatus("ready"); schedule();
    } catch {
      contextLost = true; api.current = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      setStatus("error");
    }
    return () => {
      disposed = true; api.current = null;
      if (pendingNavigation) clearTimeout(pendingNavigation);
      if (frame) cancelAnimationFrame(frame);
      cleanup.forEach(fn => fn()); observer?.disconnect(); resize?.disconnect(); controls?.dispose(); engine?.dispose();
      if (floor) { floor.geometry.dispose(); floor.material.dispose(); }
      environment?.dispose();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
      scene.clear();
    };
  }, [retry, systemId, engineLayout, cylinderCount]);

  useEffect(() => { api.current?.update(modelLabel); }, [selected?.id, explode, xray, isolate, spin, warning, hover, allowedKey, modelLabel, retry, status, systemId, engineLayout, suspension, showLabels, initialFocus]);
  const hovered = choices.find(p => p.id === hover);
  const send = action => api.current?.command(action);
  const title = isBus ? "Click a part on the bus" : SYSTEMS.find(s => s.id === systemId)?.label || "Engine";

  return <section className={`engine3d${isBus ? " engine3d-bus" : ""}`} aria-label={`Interactive 3D ${systemId} anatomy`}>
    <header className="engine3d-heading"><div><span>{isBus ? "BUS → SYSTEM → COMPONENT" : "3D COMPONENTS"}</span><h3>{title}</h3><p>{isBus ? "Click the bus or a numbered marker to open that area." : "Click a component to zoom in. Its name and purpose appear here."}</p></div><span className="engine3d-reference">{isBus ? `${engineLayout === "double" ? "Front + rear" : engineLayout === "front" ? "Front" : "Rear"} engine layout · illustrative` : systemId === "engine" ? cylinderCount === 6 ? "6-cylinder schematic · count from paper" : "Generic 4-cylinder schematic" : systemId === "brakes" ? "Disc-brake example" : "Illustrative assembly"}</span></header>
    <div className="engine3d-toolbar">
      {onBack && <button className="engine3d-back" onClick={onBack}>← Back to bus</button>}
      {!isBus && <div role="group" aria-label="Assembly view"><button disabled={!usable} aria-pressed={explode === 0} onClick={() => setExplode(0)}>Assembled</button><button disabled={!usable} aria-pressed={explode > 0} onClick={() => setExplode(1)}>Exploded view</button><button disabled={!usable || !mapped} aria-pressed={isolate && mapped} onClick={() => setIsolate(!isolate)}>Isolate part</button></div>}
      <button disabled={!usable} aria-pressed={xray} onClick={() => setXray(!xray)}>{isBus ? "Open body" : "See inside"}</button>
      {isBus && <button disabled={!usable} aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}>Location markers</button>}
    </div>
    <div className="engine3d-stage">
      <div className="engine3d-viewport" ref={mount} />
      {status !== "ready" && <div className="engine3d-fallback" role="status"><strong>{status === "loading" ? `Building the 3D ${isBus ? "bus" : "assembly"}…` : "3D rendering is unavailable"}</strong><p>{status === "loading" ? "Preparing the interactive component model." : "Your browser could not start or retain WebGL. The component buttons and descriptions still work."}</p>{status !== "loading" && <button onClick={() => setRetry(n => n + 1)}>Retry 3D viewer</button>}</div>}
      <div className="engine3d-corner"><span className="engine3d-dot" />{warning && mapped ? "DEMO FAULT HIGHLIGHT · NOT A REPAIR RECORD" : "LOCAL ANATOMY PREVIEW"}</div>
      {usable && <>
        {isBus && <div className="engine3d-bus-markers" aria-label="Bus location markers">{choices.map((target, index) => target.id.startsWith("zone-") && target.id !== "zone-body" && <button key={target.id} ref={node => { if (node) markerRefs.current.set(target.id, node); else markerRefs.current.delete(target.id); }} aria-label={`Open ${target.name}`} title={target.name} style={{ visibility: "hidden" }} onMouseEnter={() => setHover(target.id)} onMouseLeave={() => setHover("")} onFocus={() => setHover(target.id)} onBlur={() => setHover("")} onClick={() => onSelect(target.id)}><b>{index + 1}</b><span>{target.name}</span></button>)}</div>}
        <div className="engine3d-hover" aria-hidden="true">{hovered ? `${hovered.name} · click to ${isBus ? "open" : "inspect"}` : "Drag to orbit · scroll / pinch to zoom"}</div>
        <div className="engine3d-camera" role="group" aria-label="3D camera controls"><button onClick={() => send("left")} aria-label="Rotate left">↶</button><button onClick={() => send("right")} aria-label="Rotate right">↷</button><button onClick={() => send("in")} aria-label="Zoom in">+</button><button onClick={() => send("out")} aria-label="Zoom out">−</button><button onClick={() => send("reset")}>Reset view</button></div>
      </>}
    </div>
    {isBus ? <div className="engine3d-location-buttons" aria-label="Clickable bus locations">{choices.map((target, index) => <button key={target.id} aria-pressed={selected?.id === target.id} onClick={() => onSelect(target.id)}>{target.id.startsWith("zone-") && target.id !== "zone-body" && <span>{index + 1}</span>}{target.name}</button>)}</div>
      : <div className="engine3d-inspection" aria-live="polite"><div><span>{mapped ? "SELECTED COMPONENT" : "COMPONENT GEOMETRY"}</span><strong>{selected?.name || "Choose a component"}</strong><p>{mapped ? selected.purpose : "No 3D shape has been assigned to this user-added component. Its written details remain available below."}</p></div><div className="engine3d-inspection-actions"><button disabled={!usable || !mapped} onClick={() => send("focus")}>Zoom to part ↗</button>{onLocate && <button onClick={onLocate}>Locate on bus</button>}</div></div>}
    <footer className="engine3d-footer"><details className="engine3d-more"><summary>More view controls</summary><div role="group" aria-label="Camera presets"><button disabled={!usable} onClick={() => send("side")}>Side view</button><button disabled={!usable} onClick={() => send("top")}>Top view</button><button disabled={!usable} aria-pressed={spin} onClick={() => setSpin(!spin)}>{spin ? "Pause rotation" : "Auto rotate"}</button>{!isBus && <button disabled={!usable || !mapped} aria-pressed={warning} onClick={() => setWarning(!warning)}>Demo fault highlight</button>}</div>{!isBus && <label className="engine3d-spread">Spread <input type="range" aria-label="Exploded view separation" min="0" max="100" value={Math.round(explode * 100)} disabled={!usable} onChange={e => setExplode(Number(e.target.value) / 100)} /><output>{Math.round(explode * 100)}%</output></label>}</details><p>{isBus ? <>Generic bus layout, not the exact chassis of your bus. Engine position follows the local template in Settings. Exterior adapted from <a href="https://opengameart.org/content/3d-bus" target="_blank" rel="noreferrer">3D Bus by ajanhallinta · CC0</a>.</> : `Illustrative anatomy, not manufacturer CAD. ${systemId === "engine" ? cylinderEvidence === "paper" ? "Cylinder count follows the supplied paper; valve layout, crank arrangement and component shapes are " : "Cylinder count and valve layout are " : "Dimensions and mounting locations are "}not verified for your bus. Alternative equipment is shown separately.`}</p></footer>
  </section>;
}
