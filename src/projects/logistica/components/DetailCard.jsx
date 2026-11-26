import { Maximize2, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { pathTypes } from "../constants.js";

const occupancy = (k) => k.slots.filter((s) => s.code).length;

// Card de detalhes (canto superior direito): kanban, caminho ou área selecionada.
// Sem seleção, mostra a legenda da cena.
export default function DetailCard({
  layout,
  selected,
  viewOnly,
  selectedSlotId,
  onClose,
  onRenameKanban,
  onRotateKanban,
  onOpenKanban,
  onPathWidth,
  onRemove,
}) {
  const kanban = layout.kanbans.find((k) => k.id === selected);
  const path = layout.paths.find((p) => p.id === selected);
  const area = layout.areas.find((a) => a.id === selected);

  if (kanban) {
    const used = occupancy(kanban);
    const pct = Math.round((used / kanban.slots.length) * 100);
    const materials = Object.values(
      kanban.slots
        .filter((s) => s.code)
        .reduce((acc, s) => {
          const key = s.code;
          acc[key] ??= { code: s.code, name: s.name, qty: 0, unit: s.unit, boxes: 0 };
          acc[key].qty += Number(s.qty) || 0;
          acc[key].boxes++;
          return acc;
        }, {}),
    ).sort((a, b) => b.boxes - a.boxes);
    return (
      <aside className="log-card log-detail-card">
        <header>
          <span className="log-card-icon">K</span>
          <div>
            <span className="log-eyebrow">Kanban · {kanban.id}</span>
            {viewOnly ? (
              <h3>{kanban.name}</h3>
            ) : (
              <input className="log-title-input" value={kanban.name} onChange={(e) => onRenameKanban(kanban.id, e.target.value)} aria-label="Nome do kanban" />
            )}
          </div>
          <button className="log-close" onClick={onClose} aria-label="Fechar detalhes">
            <X size={16} />
          </button>
        </header>
        <div className="log-meter">
          <div>
            <span>Caixas ocupadas</span>
            <b>
              {used}/{kanban.slots.length} · {pct}%
            </b>
          </div>
          <span className="log-bar">
            <i style={{ width: pct + "%" }} />
          </span>
        </div>
        <dl className="log-facts">
          <div>
            <dt>Posição</dt>
            <dd>
              X {kanban.x.toFixed(1)} · Z {kanban.z.toFixed(1)} m
            </dd>
          </div>
          <div>
            <dt>Orientação</dt>
            <dd className="log-rotate">
              {!viewOnly && (
                <button onClick={() => onRotateKanban(kanban.id, -15)} aria-label="Girar 15 graus para a esquerda">
                  <RotateCcw size={14} />
                </button>
              )}
              <span>{kanban.rotation || 0}°</span>
              {!viewOnly && (
                <button onClick={() => onRotateKanban(kanban.id, 15)} aria-label="Girar 15 graus para a direita">
                  <RotateCw size={14} />
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt>Materiais diferentes</dt>
            <dd>{materials.length}</dd>
          </div>
        </dl>
        {materials.length > 0 && (
          <ul className="log-mini-list">
            {materials.slice(0, 4).map((m) => (
              <li key={m.code}>
                <b>{m.code}</b>
                <span>{m.name || "Sem descrição"}</span>
                <em>
                  {m.qty} {m.unit}
                </em>
              </li>
            ))}
            {materials.length > 4 && <li className="log-more">+{materials.length - 4} materiais</li>}
          </ul>
        )}
        <button className="log-btn primary wide" onClick={() => onOpenKanban(kanban.id, selectedSlotId)}>
          <Maximize2 size={15} /> Ampliar e ver caixas
        </button>
      </aside>
    );
  }

  if (path || area) {
    const item = path || area;
    return (
      <aside className="log-card log-detail-card">
        <header>
          <span className={"log-card-icon " + (path ? "path" : "area")}>{path ? "R" : "A"}</span>
          <div>
            <span className="log-eyebrow">
              {path ? "Caminho" : "Área"} · {item.id}
            </span>
            <h3>{item.name}</h3>
          </div>
          <button className="log-close" onClick={onClose} aria-label="Fechar detalhes">
            <X size={16} />
          </button>
        </header>
        <dl className="log-facts">
          {path && (
            <div>
              <dt>Tipo</dt>
              <dd>{pathTypes[path.type]?.label || "Rota logística"}</dd>
            </div>
          )}
          <div>
            <dt>{path ? "Pontos" : "Vértices"}</dt>
            <dd>{item.points.length}</dd>
          </div>
          {path && (
            <div>
              <dt>Largura</dt>
              <dd>
                {viewOnly ? (
                  path.width + " m"
                ) : (
                  <label className="log-width">
                    <input type="number" min=".2" max="4" step=".1" value={path.width} onChange={(e) => onPathWidth(path.id, Number(e.target.value))} aria-label="Largura do caminho" /> m
                  </label>
                )}
              </dd>
            </div>
          )}
        </dl>
        {!viewOnly && (
          <button className="log-btn danger wide" onClick={onRemove}>
            <Trash2 size={15} /> Remover {path ? "caminho" : "área"}
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="log-card log-detail-card log-legend">
      <header>
        <div>
          <span className="log-eyebrow">Como usar</span>
          <h3>Selecione um kanban</h3>
        </div>
      </header>
      <p>Clique em uma estante ou em uma caixa para ver os detalhes. Dois cliques aproximam a câmera.</p>
      <ul>
        <li>
          <i className="sw filled" /> Caixa com material
        </li>
        <li>
          <i className="sw empty" /> Caixa vazia
        </li>
        <li>
          <i className="sw tag-low" /> Etiqueta: acabando
        </li>
        <li>
          <i className="sw tag-out" /> Etiqueta: acabou
        </li>
        <li>
          <i className="sw tag-unknown" /> Sem conferência
        </li>
        <li>
          <i className="sw route" /> Rota logística
        </li>
        <li>
          <i className="sw road" /> Estrada · pessoas
        </li>
        <li>
          <i className="sw area" /> Área demarcada
        </li>
      </ul>
    </aside>
  );
}
