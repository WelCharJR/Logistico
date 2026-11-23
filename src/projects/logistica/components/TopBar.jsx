import { useEffect, useState } from "react";
import { Boxes, Eye, Grid3x3, Layers, Package, Plus, Search, X } from "lucide-react";

// Barra superior: marca, busca de material, mensagem de status, relógio e ações de camada.
export default function TopBar({
  query,
  onQuery,
  searchResults,
  onPickResult,
  notice,
  viewOnly,
  onToggleViewOnly,
  showGrid,
  showStructure,
  onToggleGrid,
  onToggleStructure,
  onAddKanban,
  onOpenInventory,
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="log-top">
      <div className="log-brand">
        <span className="log-logo" aria-hidden="true">
          <Boxes size={18} strokeWidth={2.4} />
        </span>
        <div>
          <b>Hangar Digital</b>
          <small>Layout de materiais</small>
        </div>
      </div>

      <div className="log-search">
        <Search size={16} aria-hidden="true" />
        <input
          id="log-search-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onQuery("")}
          placeholder="Buscar material por código ou descrição…"
          aria-label="Localizar material"
          autoComplete="off"
        />
        {query && (
          <button className="log-search-clear" onClick={() => onQuery("")} aria-label="Limpar busca">
            <X size={14} />
          </button>
        )}
        {query.trim() && (
          <div className="log-search-results">
            <span className="log-eyebrow">
              {searchResults.length ? `${searchResults.length} resultado${searchResults.length > 1 ? "s" : ""}` : "Sem resultados"}
            </span>
            {searchResults.length ? (
              searchResults.slice(0, 8).map(({ kanban, slot }) => (
                <button key={kanban.id + "-" + slot.id} onMouseDown={(e) => e.preventDefault()} onClick={() => onPickResult(kanban, slot)}>
                  <span className="log-result-icon">
                    <Package size={15} />
                  </span>
                  <span>
                    <b>{slot.code}</b>
                    <small>{slot.name || "Sem descrição"}</small>
                  </span>
                  <em>
                    {kanban.id} · {slot.id}
                    <small>
                      {slot.qty} {slot.unit}
                    </small>
                  </em>
                </button>
              ))
            ) : (
              <small className="log-empty">Nenhum material encontrado.</small>
            )}
          </div>
        )}
      </div>

      <p className="log-notice" role="status" title={notice}>
        {notice}
      </p>

      <div className="log-site">
        <span className="log-site-badge">HG</span>
        <span>
          <b>Hangar · Montagem</b>
          <small>Salvo neste navegador</small>
        </span>
      </div>
      <span className="log-live">
        <i /> Local · {time}
      </span>

      <div className="log-actions">
        <button className={"log-icon-btn" + (showGrid ? " on" : "")} onClick={onToggleGrid} aria-pressed={showGrid} title={showGrid ? "Ocultar grade" : "Mostrar grade"}>
          <Grid3x3 size={17} />
        </button>
        <button className={"log-icon-btn" + (showStructure ? " on" : "")} onClick={onToggleStructure} aria-pressed={showStructure} title={showStructure ? "Ocultar estrutura" : "Mostrar estrutura"}>
          <Layers size={17} />
        </button>
        <button className={"log-icon-btn" + (viewOnly ? " on view" : "")} onClick={onToggleViewOnly} aria-pressed={viewOnly} title={viewOnly ? "Sair do modo visualização" : "Modo visualização"}>
          <Eye size={17} />
        </button>
        <button className="log-btn ghost" onClick={onOpenInventory}>
          <Package size={16} /> <span>Materiais</span>
        </button>
        {!viewOnly && (
          <button className="log-btn primary" onClick={onAddKanban}>
            <Plus size={16} /> <span>Kanban</span>
          </button>
        )}
      </div>
    </header>
  );
}
