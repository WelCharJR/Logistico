import { useEffect, useState } from "react";
import { Boxes, CircleHelp, Eye, Grid3x3, Layers, Navigation, Package, PackageCheck, PackageX, Plus, Ruler, Search, TriangleAlert, X } from "lucide-react";
import { STATUS, checkedText, countStatus } from "../data/stock.js";

const STATUS_ICON = { full: PackageCheck, ok: PackageCheck, low: TriangleAlert, out: PackageX, unknown: CircleHelp };
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

// Detalhe de um kanban na busca: quanto tem e o aviso quando não dá para confiar no número.
function stockDetail({ stock, unit }) {
  if (stock.status === "unknown") return checkedText(stock.lastDays) + " · pode não ter mais";
  if (stock.status === "out") return "Caixa vazia · " + checkedText(stock.lastDays);
  const stale = stock.staleBoxes ? " · " + plural(stock.staleBoxes, "caixa sem conferência", "caixas sem conferência") : "";
  return stock.qty + " " + (unit || "un") + " em " + plural(stock.boxes - stock.staleBoxes, "caixa", "caixas") + stale;
}

// Barra superior: marca, busca de material, mensagem de status, relógio e ações de camada.
export default function TopBar({
  query,
  onQuery,
  searchResults,
  searchGroups = [],
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
  onOpenHall,
  hallOpen,
  onOpenNav,
  navOpen,
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
            <SearchSummary results={searchResults} groups={searchGroups} />
            {searchGroups.length ? (
              searchGroups.slice(0, 10).map((g) => {
                const Icon = STATUS_ICON[g.stock.status] || Package;
                const status = STATUS[g.stock.status];
                return (
                  <button
                    key={g.kanban.id + "-" + g.code}
                    className={"tone-" + status.tone}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPickResult(g.kanban, g.slot)}
                  >
                    <span className="log-result-icon">
                      <Icon size={15} />
                    </span>
                    <span>
                      <b>
                        {g.kanban.id} · {g.code}
                      </b>
                      <small>{stockDetail(g)}</small>
                    </span>
                    <em>
                      <span className="log-stock-badge">{status.label}</span>
                    </em>
                  </button>
                );
              })
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
        {!viewOnly && (
          <button className={"log-icon-btn" + (hallOpen ? " on" : "")} onClick={onOpenHall} aria-pressed={hallOpen} title="Tamanho do hangar">
            <Ruler size={17} />
          </button>
        )}
        <button className={"log-btn ghost" + (navOpen ? " on" : "")} onClick={onOpenNav} aria-pressed={navOpen} title="Rota até o kanban mais perto (GPS)">
          <Navigation size={16} /> <span>Rota</span>
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

// Topo da busca: "MS21042 em 3 kanbans" + contagem por situação.
function SearchSummary({ results, groups }) {
  if (!results.length) return <span className="log-eyebrow">Sem resultados</span>;
  const codes = new Set(groups.map((g) => g.code));
  const counts = countStatus(groups);
  const parts = [
    [counts.full + counts.ok, "com estoque", "green"],
    [counts.low, "acabando", "amber"],
    [counts.unknown, "sem informação", "gray"],
    [counts.out, "acabou", "red"],
  ].filter(([n]) => n);
  return (
    <div className="log-search-summary">
      <span className="log-eyebrow">
        {codes.size === 1 ? [...codes][0] + " em " + plural(groups.length, "kanban", "kanbans") : plural(groups.length, "resultado", "resultados")}
      </span>
      <div>
        {parts.map(([n, label, tone]) => (
          <span key={label} className={"log-stock-badge tone-" + tone}>
            {n} {label}
          </span>
        ))}
      </div>
      {counts.unknown > 0 && <small>Onde está "sem informação", ninguém conferiu há mais de 30 dias: confira antes de ir.</small>}
    </div>
  );
}
