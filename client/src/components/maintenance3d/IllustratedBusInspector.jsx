import { useEffect, useState } from "react";
import { STATUS } from "./model.js";
import { imagePoint } from "./illustrationModel.js";
import busImage from "../../assets/maintenance-preview/bus-overview.png";
import engineImage from "../../assets/maintenance-preview/engine-module.png";
import brakesImage from "../../assets/maintenance-preview/brakes-module.png";
import coolingImage from "../../assets/maintenance-preview/cooling-module.png";
import frontGlassImage from "../../assets/maintenance-preview/front-glass-module.png";
import sideGlassImage from "../../assets/maintenance-preview/side-glass-module.png";
import wiperImage from "../../assets/maintenance-preview/wiper-module.png";
import seatImage from "../../assets/maintenance-preview/seat-module.png";
import mirrorImage from "../../assets/maintenance-preview/side-mirror-module.png";
import frontEngineBusImage from "../../assets/maintenance-preview/bus-front-engine.png";
import doubleEngineBusImage from "../../assets/maintenance-preview/bus-double-engine.png";

const ART = { engine: engineImage, brakes: brakesImage, cooling: coolingImage, "front-glass": frontGlassImage, "side-glass": sideGlassImage, wiper: wiperImage, seat: seatImage, "side-mirror": mirrorImage };
const BUS_ART = { rear: busImage, front: frontEngineBusImage, double: doubleEngineBusImage };

export default function IllustratedBusInspector({ parts, selected, view, onSelect, onBack, engineLayout = "rear", editor, placing, onPlace }) {
  const focused = view === "module" && Boolean(selected);
  const overview = BUS_ART[engineLayout] || busImage;
  const source = focused && selected.module !== "bus" ? ART[selected.module] : overview;
  const title = selected?.displayLabel || selected?.label;
  const [failedSource, setFailedSource] = useState("");
  const [loaded, setLoaded] = useState({});
  const status = STATUS[selected?.status] || STATUS.clear;
  const isArea = selected?.module === "bus";
  const zoomStyle = selected ? {
    transformOrigin: `${selected.busX}% ${selected.busY}%`,
    transform: `translate(${50 - selected.busX}%, ${50 - selected.busY}%) scale(2.8)`,
  } : {};
  useEffect(() => { setFailedSource(""); }, [source]);

  function place(event) {
    if (!placing || !selected || event.target.closest("button")) return;
    const point = imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (point) onPlace(focused ? { faultX: point.x, faultY: point.y } : { busX: point.x, busY: point.y });
  }
  return <div className={`bus-illustration ${focused ? "is-focused" : "is-overview"} ${parts.length > 5 ? "is-dense" : ""}`}>
    <div className="bus-illustration-top">
      {focused ? <button className="bus-illustration-back" onClick={onBack}>← Back to bus</button> : <span className="bus-illustration-view">BUS OVERVIEW</span>}
      <span className="bus-illustration-mode">{focused ? (isArea ? "Selected bus area" : "Component view") : "Illustrated component map"}</span>
    </div>
    <div className={`bus-illustration-drawing ${placing ? "is-placing" : ""}`} onClick={place} style={{ "--fault-color": status.color }}>
      <div className="bus-illustration-overview" style={focused ? zoomStyle : {}} aria-hidden={focused}>
        <img src={overview} alt={`Illustrated coach with ${engineLayout === "double" ? "separate front and rear engines" : `${engineLayout} engine`}, roof cooling unit, glass, seats and front axle`} draggable="false" onLoad={() => setLoaded((current) => ({ ...current, [overview]: true }))} onError={() => setFailedSource(overview)} />
      </div>
      {!focused && loaded[overview] && <div className="bus-illustration-hotspots">
        {parts.map((part, index) => <button type="button" key={part.id}
          className={`bus-illustration-pin ${part.busX > 70 ? "label-left" : ""} ${part.status !== "clear" ? "has-fault" : ""} ${selected?.id === part.id ? "is-selected" : ""}`}
          style={{ left: `${part.busX}%`, top: `${part.busY}%`, "--pin-color": STATUS[part.status].color }}
          aria-label={`Inspect ${part.displayLabel}: ${STATUS[part.status].label}`} onClick={() => onSelect(part.id)}>
          <span>{String(index + 1).padStart(2, "0")}</span><b>{part.displayLabel}<small>{editor ? "Edit part" : "Look inside"} ↗</small></b>
        </button>)}
      </div>}
      {focused && <div key={selected.id} className="bus-illustration-module">
        <img src={source} alt={isArea ? `Enlarged bus area for ${title}` : `Technical-style illustration of the ${title.toLowerCase()} module`} draggable="false" style={isArea ? zoomStyle : { padding: "5%", boxSizing: "border-box" }} onLoad={() => setLoaded((current) => ({ ...current, [source]: true }))} onError={() => setFailedSource(source)} />
        {loaded[source] && <div className={`bus-module-signal ${selected.status !== "clear" ? "has-fault" : ""}`}
          style={{ left: `${isArea ? 50 : selected.faultX}%`, top: `${isArea ? 50 : selected.faultY}%` }}>
          <span className="bus-module-signal-ring" /><span className="bus-module-signal-dot">{selected.status !== "clear" ? "!" : "+"}</span>
          <div className="bus-module-callout"><b>{title}</b><span>{editor ? "Highlight position" : selected.status === "clear" ? "No active repair" : "Reported problem"}</span></div>
        </div>}
      </div>}
      {(!loaded[source] || failedSource === source) && <div className="bus-illustration-loading" role="status">{failedSource === source ? "Illustration could not load. You can still select a part and read its repair details." : "Loading illustration…"}</div>}
      {placing && <div className="bus-illustration-placement" role="status">Click the illustration to place the {focused ? "problem highlight" : "bus marker"}. You can also use the position sliders.</div>}
    </div>
    <div className="bus-illustration-caption" aria-live="polite">
      <div><span className="bus-illustration-step">{focused ? "02" : "01"}</span><div><strong>{focused ? `${title} ${isArea ? "area" : "module"}` : "Choose a part to look inside"}</strong><p>{focused ? (editor ? "Place the highlight where this part should be indicated." : selected.status === "clear" ? "No active maintenance is linked to this part." : "The pulsing marker identifies the part linked to the repair.") : "Click a marker on the bus or choose a part below."}</p></div></div>
      {focused && <button className="bus-mini-overview" onClick={onBack} aria-label="Return to full bus illustration"><img src={overview} alt="" /><span>Full bus ↗</span></button>}
    </div>
  </div>;
}
