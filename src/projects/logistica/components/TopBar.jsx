import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, CircleCheck, CircleHelp, Eye, Grid3x3, Layers, Moon, Navigation, Package, PackageCheck, PackageX, Plus, Ruler, Search, SlidersHorizontal, Sun, SunMoon, TriangleAlert, X } from "lucide-react";

const DAY = {
  day: { icon: Sun, label: "Dia" },
  night: { icon: Moon, label: "Noite" },
  cycle: { icon: SunMoon, label: "Ciclo dia e noite" },
};

// Painel que abre abaixo de um botão: fecha com Esc ou clique fora (sem desmarcar nada na cena).
function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);
  return ref;
}
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
  dayMode = "day",
  onCycleDayMode = () => {},
  onToggleGrid,
  onToggleStructure,
  onAddKanban,
  onOpenInventory,
  onOpenHall,
  hallOpen,
  onOpenNav,
  navOpen,
  badge = { label: "Estoque ok", tone: "ok" },
  kpiPanel = null,
  helpOpen = false,
  onToggleHelp = () => {},
}) {
  const [kpiOpen, setKpiOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const kpiRef = useDismiss(kpiOpen, () => setKpiOpen(false));
  const viewRef = useDismiss(viewOpen, () => setViewOpen(false));
  const BadgeIcon = badge.tone === "ok" ? CircleCheck : TriangleAlert;
  const DayIcon = (DAY[dayMode] || DAY.day).icon;
  const viewItems = [
    { icon: Grid3x3, label: "Grade", on: showGrid, run: onToggleGrid },
    { icon: Layers, label: "Estrutura do galpão", on: showStructure, run: onToggleStructure },
    { icon: DayIcon, label: (DAY[dayMode] || DAY.day).label, hint: "clique para trocar", on: dayMode !== "day", run: onCycleDayMode },
    { icon: Eye, label: "Modo visualização", hint: "sem edição", on: viewOnly, run: onToggleViewOnly },
    ...(viewOnly ? [] : [{ icon: Ruler, label: "Tamanho do hangar", on: hallOpen, run: () => (setViewOpen(false), onOpenHall()) }]),
  ];
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
                      <span className="log-result-head">
                        <b>
                          {g.kanban.id} · {g.code}
                        </b>
                        <span className="log-stock-badge">{status.label}</span>
                      </span>
                      <small>{stockDetail(g)}</small>
                    </span>
                  </button>
                );
              })
            ) : (
              <small className="log-empty">Nenhum material encontrado.</small>
            )}
          </div>
        )}
      </div>

      {/* indicadores: um selo com a pior situação; clique abre os cards */}
      <div className="log-pop-anchor" ref={kpiRef}>
        <button className={"log-badge tone-" + badge.tone + (kpiOpen ? " on" : "")} onClick={() => setKpiOpen((o) => !o)} aria-expanded={kpiOpen} title="Indicadores do hangar">
          <BadgeIcon size={15} /> <span>{badge.label}</span>
        </button>
        {kpiOpen && <div className="log-pop log-kpi-pop">{kpiPanel}</div>}
      </div>

      <p className="log-notice" role="status" title={notice} key={notice}>
        {notice}
      </p>

      <div className="log-site">
        <span className="log-site-badge">HG</span>
        <span>
          <b>Hangar · Montagem</b>
          <small>Salvo neste navegador · {time}</small>
        </span>
      </div>

      <div className="log-actions">
        <div className="log-pop-anchor" ref={viewRef}>
          <button className={"log-btn ghost log-view-btn" + (viewOpen ? " on" : "") + (viewOnly ? " view" : "")} onClick={() => setViewOpen((o) => !o)} aria-expanded={viewOpen} title="Opções de visualização">
            <SlidersHorizontal size={16} /> <span>Visualização</span> <ChevronDown size={14} className="log-chev" />
          </button>
          {viewOpen && (
            <div className="log-pop log-menu" role="menu">
              {viewItems.map(({ icon: Icon, label, hint, on, run }) => (
                <button key={label} role="menuitemcheckbox" aria-checked={!!on} className={on ? "on" : ""} onClick={run}>
                  <Icon size={16} />
                  <span>
                    {label}
                    {hint && <small>{hint}</small>}
                  </span>
                  {on && <Check size={15} className="log-menu-check" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={"log-icon-btn" + (helpOpen ? " on" : "")} onClick={onToggleHelp} aria-pressed={helpOpen} title="Como usar" aria-label="Como usar">
          <CircleHelp size={17} />
        </button>
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
