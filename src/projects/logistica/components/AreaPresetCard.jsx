import { PenLine, RotateCcw, RotateCw, X } from "lucide-react";
import { AIRCRAFT, AREA_TYPES, presetSize } from "../scene/stationLayout.js";

const PRESET_TYPES = ["fuselage", "wing", "tail", "final", "jigs"];
const m = (v) => String(v).replace(".", ",");

// Ferramenta de área: escolher uma estação pronta (tamanho certo para a peça) e clicar no chão para
// colocar; ou desenhar livre, vértice por vértice, como antes.
export default function AreaPresetCard({ preset, onChoose, onRotate, onClose }) {
  const aircraft = preset?.aircraft || "kc390";
  return (
    <aside className="log-card log-preset-card" aria-label="Estações prontas">
      <header>
        <div>
          <span className="log-eyebrow">Nova área</span>
          <h3>Estação pronta</h3>
        </div>
        <button className="log-close" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
      </header>
      <div className="log-seg">
        {Object.entries(AIRCRAFT).map(([key, ac]) => (
          <button key={key} type="button" className={aircraft === key && preset ? "on" : ""} onClick={() => onChoose({ type: preset?.type || "fuselage", aircraft: key })}>
            {ac.label}
          </button>
        ))}
      </div>
      <div className="log-preset-grid">
        {PRESET_TYPES.map((type) => {
          const [l, w] = presetSize(type, aircraft);
          const on = preset?.type === type && preset?.aircraft === aircraft;
          return (
            <button key={type} type="button" className={on ? "on" : ""} onClick={() => onChoose({ type, aircraft })} style={{ "--tone": AREA_TYPES[type].color }}>
              <i aria-hidden="true" />
              <b>{AREA_TYPES[type].label}</b>
              <small>
                {m(l)} × {m(w)} m
              </small>
            </button>
          );
        })}
        <button type="button" className={"free" + (preset ? "" : " on")} onClick={() => onChoose(null)}>
          <PenLine size={16} />
          <b>Desenhar livre</b>
          <small>vértice por vértice</small>
        </button>
      </div>
      {preset ? (
        <div className="log-preset-foot">
          <div className="log-rotate">
            <button onClick={() => onRotate(-15)} aria-label="Girar 15 graus para a esquerda">
              <RotateCcw size={14} />
            </button>
            <span>{preset.angle}°</span>
            <button onClick={() => onRotate(15)} aria-label="Girar 15 graus para a direita">
              <RotateCw size={14} />
            </button>
          </div>
          <small>Clique no chão para colocar · R gira</small>
        </div>
      ) : (
        <small className="log-hall-note">Clique no piso para marcar os vértices e finalize para criar a área.</small>
      )}
    </aside>
  );
}
