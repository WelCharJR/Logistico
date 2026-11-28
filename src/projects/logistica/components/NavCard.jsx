import { ArrowUp, CornerUpLeft, CornerUpRight, Crosshair, Flag, Footprints, LoaderCircle, Play, Route, Square, Waypoints, X } from "lucide-react";
import { walkSeconds } from "../scene/route.js";
import { STATUS } from "../data/stock.js";

const meters = (m) => (m < 10 ? m.toFixed(1).replace(".", ",") : Math.round(m)) + " m";
const duration = (m) => {
  if (m < 0.3) return "0 s";
  const s = Math.max(1, Math.round(walkSeconds(m)));
  return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
};

const TURN_ICON = { left: CornerUpLeft, right: CornerUpRight };
const STEP_ICON = { start: ArrowUp, left: CornerUpLeft, right: CornerUpRight, road: Route, trail: Waypoints, arrive: Flag };
const iconFor = (step) => (step.type === "road" || step.type === "trail" ? TURN_ICON[step.turn] || STEP_ICON[step.type] : STEP_ICON[step.type]);
const side = (turn) => (turn === "left" ? " à esquerda" : turn === "right" ? " à direita" : "");
export function stepText(step, destination) {
  if (step.type === "arrive") return "Chegou ao " + destination;
  const go = "siga " + meters(step.distance);
  if (step.type === "road") return "Pegue a estrada" + side(step.turn) + " e " + go;
  if (step.type === "trail") return "Saia da estrada" + side(step.turn) + " e " + go;
  if (step.type === "left") return "Vire à esquerda e " + go;
  if (step.type === "right") return "Vire à direita e " + go;
  return (step.onRoad ? "Siga pela estrada por " : "Siga em frente por ") + meters(step.distance);
}

// Passo atual da caminhada: o primeiro cujo trecho ainda não terminou.
function currentStep(steps, walked) {
  let end = 0;
  for (let i = 0; i < steps.length; i++) {
    end += steps[i].distance;
    if (walked < end - 0.05) return { index: i, left: end - walked };
  }
  return { index: steps.length - 1, left: 0 };
}

// Card do "GPS" da demonstração: localização simulada, kanban mais perto e a rota passo a passo.
export default function NavCard({
  locating,
  me,
  picking,
  ranked,
  destination,
  steps,
  walking,
  walked,
  searchTerm,
  hasRoads,
  stockOf = () => null,
  title = null,
  skipped = [],
  kanbanName,
  onPickPosition,
  onChooseDestination,
  onStart,
  onStop,
  onClose,
}) {
  const route = destination;
  const remaining = route ? Math.max(0, route.length - (walking ? walked : 0)) : 0;
  const arrived = !!route && remaining < 0.3;
  const now = route && walking ? currentStep(steps, walked) : { index: 0, left: steps[0]?.distance || 0 };
  const active = arrived ? { type: "arrive", distance: 0 } : steps[now.index];
  const ActiveIcon = active ? iconFor(active) : ArrowUp;
  const roadShare = route && route.length > 0 ? route.roadLength / route.length : 0;

  return (
    <aside className="log-card log-nav-card" aria-label="Rota até o kanban">
      <header>
        <div>
          <span className="log-eyebrow">GPS · demonstração</span>
          <h3>{title || (searchTerm ? "Kanban mais perto com " + searchTerm : "Kanban mais perto")}</h3>
        </div>
        <button className="log-close" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
      </header>

      {locating ? (
        <div className="log-nav-locating" role="status">
          <LoaderCircle size={18} className="log-spin" />
          <div>
            <b>Obtendo sua localização…</b>
            <small>Procurando sinal dentro do hangar</small>
          </div>
        </div>
      ) : (
        <>
          <div className={"log-nav-me" + (picking ? " picking" : "")}>
            <span className="log-nav-dot" aria-hidden="true" />
            <div>
              <b>{picking ? "Clique no chão do hangar" : "Você está aqui"}</b>
              <small>{picking ? "para mudar sua posição" : me ? `X ${me.x.toFixed(1)} · Z ${me.z.toFixed(1)} · precisão ±3 m` : "Sem localização"}</small>
            </div>
            <button className="log-nav-mini" onClick={onPickPosition} aria-pressed={picking} title="Mudar minha posição">
              {picking ? <X size={15} /> : <Crosshair size={15} />}
              <span>{picking ? "Cancelar" : "Mudar"}</span>
            </button>
          </div>

          {!route ? (
            <p className="log-hall-note">
              {searchTerm
                ? skipped.length
                  ? "O material acabou em todos os kanbans que o têm."
                  : "Nenhum kanban com esse material tem caminho livre até você."
                : "Nenhum kanban alcançável no hangar."}
            </p>
          ) : (
            <>
              <div className="log-nav-banner" aria-live="polite">
                <span className="log-nav-turn">
                  <ActiveIcon size={22} />
                </span>
                <div>
                  <b>{walking ? stepText({ ...active, distance: now.left }, route.id) : stepText(active, route.id)}</b>
                  <small>
                    {route.id} · {kanbanName(route.id)}
                    {stockOf(route.id) && " · " + STATUS[stockOf(route.id)].label}
                  </small>
                </div>
              </div>

              <div className="log-nav-stats">
                <div>
                  <small>Distância</small>
                  <b>{meters(remaining)}</b>
                </div>
                <div>
                  <small>A pé</small>
                  <b>≈ {duration(remaining)}</b>
                </div>
                {walking ? (
                  <button className="log-btn ghost" onClick={onStop}>
                    <Square size={15} /> Parar
                  </button>
                ) : (
                  <button className="log-btn primary" onClick={onStart} disabled={remaining < 0.3}>
                    <Play size={15} /> Iniciar
                  </button>
                )}
              </div>

              <div className="log-nav-mix">
                <div className="log-nav-mixbar" aria-hidden="true">
                  <span style={{ clipPath: `inset(0 ${100 - (roadShare * 100)}% 0 0 round 99px)` }} />
                </div>
                <small>
                  <i className="road" /> Pela estrada {meters(route.roadLength)}
                  <i className="trail" /> Caminho criado {meters(Math.max(0, route.length - route.roadLength))}
                </small>
                {route.roadLength < 0.5 && (
                  <small className="log-nav-hint">
                    {hasRoads
                      ? "Nenhuma estrada perto: criei um caminho direto até o kanban."
                      : "Não há estradas desenhadas: criei um caminho. Desenhe estradas com a ferramenta de caminho."}
                  </small>
                )}
              </div>

              {steps.length > 2 && !walking && (
                <ol className="log-nav-steps">
                  {steps.map((step, i) => {
                    const Icon = iconFor(step);
                    return (
                      <li key={i}>
                        <Icon size={14} />
                        <span>{stepText(step, route.id)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {stockOf(route.id) === "unknown" && (
                <p className="log-nav-warn tone-gray">Ninguém confere esse kanban há mais de 30 dias: pode não ter mais o material.</p>
              )}
              {stockOf(route.id) === "low" && <p className="log-nav-warn tone-amber">O material está acabando nesse kanban.</p>}

              {ranked.length > 1 && (
                <div className="log-nav-others">
                  <small>{searchTerm ? "Outros kanbans com o material" : "Outros kanbans"}</small>
                  {ranked.map((r) => (
                    <button key={r.id} className={r.id === route.id ? "active" : ""} onClick={() => onChooseDestination(r.id)} disabled={walking}>
                      <b>{r.id}</b>
                      <span>
                        {stockOf(r.id) ? <i className={"log-stock-dot tone-" + STATUS[stockOf(r.id)].tone} title={STATUS[stockOf(r.id)].label} /> : null}
                        {kanbanName(r.id)}
                      </span>
                      <em>{meters(r.length)}</em>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {skipped.length > 0 && (
            <p className="log-hall-note">
              Fora da rota: {skipped.map((s) => s.id + " (" + STATUS[s.status].label.toLowerCase() + ")").join(", ")}.
            </p>
          )}
          <p className="log-hall-note">
            <Footprints size={12} /> Localização simulada para a demonstração. Num galpão real, a posição viria de QR codes no chão ou
            beacons, já que o GPS do celular não funciona bem dentro de prédios.
          </p>
        </>
      )}
    </aside>
  );
}

