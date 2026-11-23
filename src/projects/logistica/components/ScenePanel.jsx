import { Check, Home, Magnet, Minus, MousePointer2, Plus, Spline, Square, X } from "lucide-react";

// Área da cena: canvas 3D, barra de ferramentas de desenho, controles de câmera e cursor.
export default function ScenePanel({
  canvasRef,
  viewOnly,
  tool,
  pathType,
  snapToGrid,
  draft,
  cursorWorld,
  cursorScreen,
  onChooseTool,
  onChoosePathType,
  onToggleSnap,
  onFinish,
  onCancel,
  onZoom,
  onResetView,
}) {
  const drawing = !viewOnly && tool !== "select";
  return (
    <section className="log-stage">
      <div className="log-canvas" ref={canvasRef} />

      <nav className="log-rail log-tools" aria-label="Ferramentas">
        <button className={tool === "select" ? "active" : ""} onClick={() => onChooseTool("select")} title="Selecionar e arrastar">
          <MousePointer2 size={18} />
          <span>Selecionar</span>
        </button>
        {!viewOnly && (
          <>
            <button className={tool === "area" ? "active" : ""} onClick={() => onChooseTool("area")} title="Desenhar área">
              <Square size={18} />
              <span>Área</span>
            </button>
            <button className={tool === "path" ? "active" : ""} onClick={() => onChooseTool("path")} title="Desenhar caminho">
              <Spline size={18} />
              <span>Caminho</span>
            </button>
            <i className="log-rail-sep" />
            <button className={snapToGrid ? "active soft" : ""} onClick={onToggleSnap} aria-pressed={snapToGrid} title={snapToGrid ? "Malha de 1 m ligada" : "Malha de 1 m desligada"}>
              <Magnet size={18} />
              <span>Malha 1 m</span>
            </button>
          </>
        )}
      </nav>

      {drawing && (
        <div className="log-draw-card">
          <span className="log-eyebrow">{tool === "area" ? "Nova área" : "Novo caminho"}</span>
          {tool === "path" && (
            <select className="log-path-type" aria-label="Tipo de caminho" value={pathType} onChange={(e) => onChoosePathType(e.target.value)}>
              <option value="pedestrian">Estrada · pessoas</option>
              <option value="logistics">Rota logística</option>
            </select>
          )}
          <p>{tool === "area" ? "Clique no piso para marcar os vértices." : "Clique no piso para traçar o caminho."}</p>
          <div className="log-draft-points">
            {draft.length ? (
              draft.map((p, i) => (
                <span key={i}>
                  P{i + 1} <small>({p.x.toFixed(1)}, {p.z.toFixed(1)})</small>
                </span>
              ))
            ) : (
              <small>Nenhum ponto ainda</small>
            )}
          </div>
          <div className="log-draw-actions">
            <button className="log-btn primary" onClick={onFinish} disabled={draft.length < (tool === "area" ? 3 : 2)}>
              <Check size={15} /> Concluir
            </button>
            <button className="log-btn ghost" onClick={onCancel}>
              <X size={15} /> Cancelar
            </button>
          </div>
        </div>
      )}

      <nav className="log-rail log-view-rail" aria-label="Câmera">
        <button onClick={() => onZoom(-8)} aria-label="Aproximar" title="Aproximar">
          <Plus size={18} />
        </button>
        <button onClick={() => onZoom(8)} aria-label="Afastar" title="Afastar">
          <Minus size={18} />
        </button>
        <i className="log-rail-sep" />
        <button onClick={onResetView} aria-label="Enquadrar o hangar" title="Enquadrar o hangar">
          <Home size={18} />
        </button>
      </nav>

      <div className="log-key-help">
        {viewOnly ? "Visualização · clique para selecionar · dois cliques para enquadrar" : "Arraste kanbans · R girar · WASD mover · Shift passo maior"}
      </div>

      {drawing && cursorScreen && (
        <div className="log-crosshair" style={{ left: cursorScreen.x, top: cursorScreen.y }}>
          <i />
          <span>
            X {cursorWorld?.x.toFixed(1)} · Z {cursorWorld?.z.toFixed(1)} m
          </span>
        </div>
      )}
    </section>
  );
}
