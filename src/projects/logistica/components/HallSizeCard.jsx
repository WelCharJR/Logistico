import { useState } from "react";
import { Check, X } from "lucide-react";
import { HALL_LIMITS, HALL_PRESETS, minHallFor, sanitizeHall } from "../scene/hallSize.js";

// Card para escolher o tamanho do galpão. O mínimo é o necessário para caber tudo o que já
// está posicionado, então nada fica para fora ao diminuir.
export default function HallSizeCard({ layout, onApply, onClose }) {
  const current = sanitizeHall(layout.hall);
  const min = minHallFor(layout);
  const [size, setSize] = useState(current);
  const fits = (s) => s.width >= min.width && s.depth >= min.depth;
  const set = (key, value) => setSize((prev) => ({ ...prev, [key]: Math.max(min[key], Number(value)) }));
  const changed = size.width !== current.width || size.depth !== current.depth;
  const area = size.width * size.depth;

  return (
    <aside className="log-card log-hall-card" aria-label="Tamanho do hangar">
      <header>
        <div>
          <span className="log-eyebrow">Hangar</span>
          <h3>Tamanho do galpão</h3>
        </div>
        <button className="log-close" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
      </header>

      <div className="log-presets">
        {HALL_PRESETS.map((p) => (
          <button
            key={p.label}
            className={p.width === size.width && p.depth === size.depth ? "active" : ""}
            disabled={!fits(p)}
            onClick={() => setSize({ width: p.width, depth: p.depth })}
            title={fits(p) ? "" : "Pequeno demais para o que já está posicionado"}
          >
            <b>{p.label}</b>
            <small>
              {p.width} × {p.depth} m
            </small>
          </button>
        ))}
      </div>

      {[
        ["width", "Largura"],
        ["depth", "Profundidade"],
      ].map(([key, label]) => (
        <label className="log-range" key={key}>
          <span>
            {label} <b>{size[key]} m</b>
          </span>
          <input type="range" min={HALL_LIMITS[key][0]} max={HALL_LIMITS[key][1]} step="2" value={size[key]} onChange={(e) => set(key, e.target.value)} />
        </label>
      ))}

      <p className="log-hall-note">
        {area.toLocaleString("pt-BR")} m² · mínimo para o layout atual: {min.width} × {min.depth} m
      </p>
      <button className="log-btn primary wide" disabled={!changed} onClick={() => onApply(size)}>
        <Check size={15} /> Aplicar tamanho
      </button>
    </aside>
  );
}
