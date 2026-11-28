import { useState } from "react";
import { ClipboardCheck, Clapperboard, Navigation, Plus, RotateCcw, RotateCw, Square, Trash2, X } from "lucide-react";
import { AIRCRAFT, AREA_TYPES, STAGES, hasModel, hasStage, presetSize, sanitizeArea, stageFromProgress, stationFit } from "../scene/stationLayout.js";
import { STATION_STATUS, stationState } from "../data/stationStatus.js";
import { STATUS as STOCK_STATUS, checkedText } from "../data/stock.js";

const m = (v) => String(v).replace(".", ",");

// Texto curto de onde está o material (o melhor kanban) ou por que falta.
function materialText(mat) {
  if (mat.status === "missing") return "não está em nenhum kanban";
  const best = mat.where[0];
  if (mat.status === "out") return "acabou em " + mat.where.map((w) => w.kanbanId).join(", ");
  if (mat.status === "unknown") return best.kanbanId + " · " + checkedText(best.lastDays);
  return best.kanbanId + " · " + best.qty + " un" + (mat.where.length > 1 ? " (+" + (mat.where.length - 1) + " kanban)" : "");
}
const MATERIAL_TONE = { full: "green", ok: "green", low: "amber", unknown: "gray", out: "red", missing: "red" };
const MATERIAL_LABEL = { ...Object.fromEntries(Object.entries(STOCK_STATUS).map(([k, v]) => [k, v.label])), missing: "Não encontrado" };

// Card de uma área/estação de montagem: situação (andon), progresso, materiais, gabarito, rota.
export default function AreaCard({ area: rawArea, kanbans, viewOnly, onClose, onUpdate, onRotate, onFit, onRoute, onRemove, timelapse = null, onTimelapse = () => {}, onStopTimelapse = () => {} }) {
  const [newCode, setNewCode] = useState("");
  const a = sanitizeArea(rawArea);
  const fit = stationFit(a);
  const type = AREA_TYPES[a.type];
  const state = stationState(a, kanbans);
  const model = hasModel(a.type);
  const codes = [...new Set(kanbans.flatMap((k) => k.slots.filter((s) => s.code).map((s) => s.code)))].sort();
  const addMaterial = () => {
    const code = newCode.trim().toUpperCase();
    if (!code || (a.materials || []).includes(code)) return setNewCode("");
    onUpdate(a.id, { materials: [...(a.materials || []), code] });
    setNewCode("");
  };
  const jig = state.jig;
  const jigText =
    jig.status === "expired"
      ? `Vencida há ${-jig.left} dias`
      : jig.status === "due"
        ? `Vence em ${jig.left} dias`
        : jig.status === "ok"
          ? `Em dia · vence em ${jig.left} dias`
          : "Sem registro de verificação";
  const jigTone = { expired: "red", due: "amber", ok: "green" }[jig.status] || "gray";

  return (
    <aside className="log-card log-detail-card log-area-card">
      <header>
        <span className="log-card-icon area" style={{ background: type.color }}>
          A
        </span>
        <div>
          <span className="log-eyebrow">
            {model ? type.label + " · " + AIRCRAFT[a.aircraft].label : "Área"} · {a.id}
          </span>
          {viewOnly ? (
            <h3>{a.name}</h3>
          ) : (
            <input className="log-title-input" value={a.name} onChange={(e) => onUpdate(a.id, { name: e.target.value })} aria-label="Nome da área" />
          )}
        </div>
        <button className="log-close" onClick={onClose} aria-label="Fechar detalhes">
          <X size={16} />
        </button>
      </header>

      {model && (
        <div className={"log-andon-banner tone-" + STATION_STATUS[state.status].tone}>
          <span className="log-andon" aria-hidden="true">
            {["red", "yellow", "green"].map((c) => (
              <i key={c} className={c + (state.andon === c ? " on" : "")} />
            ))}
          </span>
          <div>
            <b>{STATION_STATUS[state.status].label}</b>
            {state.status !== state.manual && <small>definida automaticamente:</small>}
            {state.reasons.map((r) => (
              <small key={r} className="reason">
                {r}
              </small>
            ))}
            {state.warnings.map((w) => (
              <small key={w}>{w}</small>
            ))}
          </div>
        </div>
      )}

      <div className="log-area-form">
        <label>
          <span>Estação</span>
          <select disabled={viewOnly} value={a.type} onChange={(e) => onUpdate(a.id, { type: e.target.value })}>
            {Object.entries(AREA_TYPES).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {model && (
          <label>
            <span>Aeronave</span>
            <div className="log-seg">
              {Object.entries(AIRCRAFT).map(([key, ac]) => (
                <button key={key} type="button" disabled={viewOnly} className={a.aircraft === key ? "on" : ""} onClick={() => onUpdate(a.id, { aircraft: key })}>
                  {ac.label}
                </button>
              ))}
            </div>
          </label>
        )}
        {model && (
          <label>
            <span>Situação</span>
            <div className="log-seg log-seg-wrap">
              {Object.entries(STATION_STATUS).map(([key, st]) => (
                <button key={key} type="button" disabled={viewOnly} className={state.manual === key ? "on" : ""} onClick={() => onUpdate(a.id, { status: key })}>
                  <i className={"log-stock-dot tone-" + st.tone} />
                  {st.label}
                </button>
              ))}
            </div>
          </label>
        )}
        {hasStage(a.type) && (
          <label>
            <span>
              Progresso · <b>{Math.round(a.progress)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              disabled={viewOnly}
              value={a.progress}
              onChange={(e) => onUpdate(a.id, { progress: Number(e.target.value) })}
            />
            <small>
              {state.step.done ? "Concluída" : `Etapa ${state.step.index + 1} de ${state.step.total} · ${state.step.label}`} · peça em 3D: {STAGES[a.stage].label.toLowerCase()}
            </small>
          </label>
        )}
      </div>

      {model && a.type !== "jigs" && (
        <section className="log-area-section">
          <span className="log-eyebrow">Materiais da estação</span>
          <ul className="log-mat-list">
            {state.materials.map((mat) => (
              <li key={mat.code} className={"tone-" + MATERIAL_TONE[mat.status]}>
                <i className={"log-stock-dot tone-" + MATERIAL_TONE[mat.status]} title={MATERIAL_LABEL[mat.status]} />
                <b>{mat.code}</b>
                <span>{materialText(mat)}</span>
                {!viewOnly && (
                  <button onClick={() => onUpdate(a.id, { materials: a.materials.filter((c) => c !== mat.code) })} aria-label={"Remover " + mat.code}>
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
            {!state.materials.length && <li className="empty">Nenhum material ligado a esta estação.</li>}
          </ul>
          {!viewOnly && (
            <div className="log-mat-add">
              <input
                list="log-material-codes"
                value={newCode}
                placeholder="Código do material"
                onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMaterial()}
              />
              <datalist id="log-material-codes">
                {codes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button className="log-btn ghost" onClick={addMaterial} aria-label="Adicionar material">
                <Plus size={15} />
              </button>
            </div>
          )}
        </section>
      )}

      {model && (
        <section className="log-area-section">
          <span className="log-eyebrow">Gabarito</span>
          <div className={"log-jig tone-" + jigTone}>
            <div>
              <b>{a.jig?.code || "Sem código"}</b>
              <small>
                <span className="log-stock-badge">{jigText}</span>
              </small>
            </div>
            {!viewOnly && (
              <button
                onClick={() => onUpdate(a.id, { jig: { ...(a.jig || {}), code: a.jig?.code || "GAB-" + a.id, checkedAt: new Date().toISOString() } })}
                title="Registrar que o gabarito foi verificado hoje"
              >
                <ClipboardCheck size={14} /> Verifiquei
              </button>
            )}
          </div>
          {!viewOnly && (
            <label className="log-jig-interval">
              Verificar a cada
              <select value={a.jig?.intervalDays || 180} onChange={(e) => onUpdate(a.id, { jig: { ...(a.jig || {}), intervalDays: Number(e.target.value) } })}>
                {[90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <dl className="log-facts">
        <div>
          <dt>Tamanho</dt>
          <dd>
            {m(fit.rect.length.toFixed(1))} × {m(fit.rect.width.toFixed(1))} m
          </dd>
        </div>
        <div>
          <dt>Direção</dt>
          <dd className="log-rotate">
            {!viewOnly && (
              <button onClick={() => onRotate(a.id, -15)} aria-label="Girar a área 15 graus para a esquerda">
                <RotateCcw size={14} />
              </button>
            )}
            <span>{Math.round(((((fit.rect.angle * 180) / Math.PI) % 180) + 180) % 180)}°</span>
            {!viewOnly && (
              <button onClick={() => onRotate(a.id, 15)} aria-label="Girar a área 15 graus para a direita">
                <RotateCw size={14} />
              </button>
            )}
          </dd>
        </div>
        {fit.scale > 0 && (
          <div>
            <dt>Modelo</dt>
            <dd>{fit.scale >= 0.999 ? "tamanho real" : "maquete " + Math.round(fit.scale * 100) + "%"}</dd>
          </div>
        )}
      </dl>

      {model && a.type !== "jigs" && (
        <div className="log-timelapse">
          {timelapse ? (
            <>
              <div className="log-timelapse-head">
                <span>
                  Timelapse · <b>{Math.round(timelapse.progress)}%</b> · {STAGES[stageFromProgress(timelapse.progress)].label}
                </span>
                <button className="log-btn ghost small" onClick={onStopTimelapse}>
                  <Square size={13} /> Parar
                </button>
              </div>
              <div className="log-timelapse-bar">
                <i style={{ clipPath: `inset(0 ${100 - (timelapse.progress)}% 0 0 round 99px)` }} />
                <span style={{ left: "34%" }} />
                <span style={{ left: "80%" }} />
              </div>
            </>
          ) : (
            <button className="log-btn ghost wide" onClick={() => onTimelapse(a.id)} title="Mostra a peça sendo montada de 0 a 100% (não muda o progresso salvo)">
              <Clapperboard size={15} /> Timelapse da montagem
            </button>
          )}
        </div>
      )}
      <button className="log-btn primary wide" onClick={() => onRoute(a.id)}>
        <Navigation size={15} /> Rota até a estação
      </button>
      {!viewOnly &&
        model &&
        (() => {
          const [l, w] = presetSize(a.type, a.aircraft);
          const off = Math.abs(fit.rect.length - l) > 0.3 || Math.abs(fit.rect.width - w) > 0.3;
          return off ? (
            <button className="log-btn ghost wide" onClick={() => onFit(a.id)} title="Refaz a área como retângulo no tamanho certo para a peça, no mesmo lugar">
              Ajustar ao tamanho da estação ({m(l)} × {m(w)} m)
            </button>
          ) : null;
        })()}
      {!viewOnly && <p className="log-hall-note">Com a área selecionada: arraste para mover, WASD empurra, R gira.</p>}
      {!viewOnly && (
        <button className="log-btn danger wide" onClick={onRemove}>
          <Trash2 size={15} /> Remover área
        </button>
      )}
    </aside>
  );
}
