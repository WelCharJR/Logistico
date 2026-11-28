import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { pathTypes } from "../constants.js";
import { AIRCRAFT, AREA_TYPES, hasModel, hasStage, sanitizeArea } from "../scene/stationLayout.js";
import { STATION_STATUS, stationState } from "../data/stationStatus.js";

// Lista do layout em abas (canto inferior direito). Clicar seleciona e leva a câmera até o item.
export default function ListCard({ layout, selected, onPick }) {
  const [tab, setTab] = useState("kanbans");
  const tabs = [
    ["kanbans", "Kanbans", layout.kanbans.length],
    ["areas", "Áreas", layout.areas.length],
    ["paths", "Caminhos", layout.paths.length],
  ];
  let rows = [];
  if (tab === "kanbans")
    rows = layout.kanbans.map((k) => {
      const used = k.slots.filter((s) => s.code).length;
      const pct = Math.round((used / k.slots.length) * 100);
      return {
        id: k.id,
        name: k.name,
        sub: `${used} caixas ocupadas`,
        pill: pct + "%",
        tone: pct >= 75 ? "high" : pct > 0 ? "mid" : "low",
        bar: pct,
      };
    });
  if (tab === "areas")
    rows = layout.areas.map((raw) => {
      // estação: tipo, aeronave, progresso e a situação (cor do andon) no selo
      const a = sanitizeArea(raw);
      if (!hasModel(a.type)) return { id: a.id, name: a.name, sub: `${a.points.length} vértices`, pill: "Área", tone: "area" };
      const st = stationState(a, layout.kanbans);
      return {
        id: a.id,
        name: a.name,
        sub: AREA_TYPES[a.type].label + " · " + AIRCRAFT[a.aircraft].label + (hasStage(a.type) ? " · " + Math.round(a.progress) + "%" : ""),
        pill: STATION_STATUS[st.status].label,
        tone: "st-" + STATION_STATUS[st.status].tone,
      };
    });
  if (tab === "paths")
    rows = layout.paths.map((p) => ({
      id: p.id,
      name: p.name,
      sub: `${pathTypes[p.type]?.label || "Rota logística"} · ${p.width} m`,
      pill: p.type === "pedestrian" ? "Pessoas" : "Logística",
      tone: p.type === "pedestrian" ? "road" : "route",
    }));

  return (
    <section className="log-card log-list-card">
      <div className="log-tabs" role="tablist">
        {tabs.map(([key, label, count]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label} <em>{count}</em>
          </button>
        ))}
      </div>
      <div className="log-rows">
        {rows.length ? (
          rows.map((r) => (
            <button key={r.id} className={"log-row" + (selected === r.id ? " active" : "")} onClick={() => onPick(r.id)}>
              <span className="log-row-id">{r.id}</span>
              <span className="log-row-main">
                <b>{r.name}</b>
                <small>{r.sub}</small>
              </span>
              {r.bar !== undefined && (
                <span className="log-row-bar" aria-hidden="true">
                  <i style={{ clipPath: `inset(0 ${100 - (r.bar)}% 0 0 round 99px)` }} />
                </span>
              )}
              <span className={"log-pill " + r.tone}>{r.pill}</span>
              <ChevronRight size={15} className="log-row-chevron" />
            </button>
          ))
        ) : (
          <p className="log-empty">{tab === "areas" ? "Nenhuma área desenhada. Use a ferramenta Área." : "Nenhum caminho desenhado. Use a ferramenta Caminho."}</p>
        )}
      </div>
    </section>
  );
}
