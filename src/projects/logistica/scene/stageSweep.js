// Varreduras da peça (o mesmo plano de corte do timelapse), em fases. Sem Three.js, testável.
//   progressShowing(stage)            -> progresso em que a varredura mostra exatamente o modelo da etapa
//   timelapsePhases(stage, opts)      -> monta de 0 a 100%, segura e rebobina até a etapa real
//   stageChangePhases(from, to)       -> troca curta de uma etapa para outra (controle de progresso)
//   sweepProgress(phases, elapsedMs)  -> { progress, done }
import { cubicBezier, easeOut } from "./hoverMotion.js";

const EASE = { linear: (t) => t, out: easeOut, inOut: cubicBezier(0.77, 0, 0.175, 1) };

export const SWEEP_MS = { build: 14000, hold: 1500, rewind: 600, stage: 400 };

// Logo antes do fim da etapa a varredura dela está completa: é igual ao modelo da etapa.
const SHOWING = { skeleton: 33.999, skin: 79.999, complete: 100 };
export const progressShowing = (stage) => SHOWING[stage] ?? 100;

export function timelapsePhases(realStage, { ms = SWEEP_MS.build, reducedMotion = false } = {}) {
  const phases = [
    { from: 0, to: 100, ms, ease: "linear" },
    { from: 100, to: 100, ms: SWEEP_MS.hold, ease: "linear" }, // segura a peça pronta
  ];
  // rebobina até a etapa real, para a troca pelo modelo de verdade não dar salto
  const end = progressShowing(realStage);
  if (!reducedMotion && end < 100) phases.push({ from: 100, to: end, ms: SWEEP_MS.rewind, ease: "inOut" });
  return phases;
}

export function stageChangePhases(fromStage, toStage) {
  if (!fromStage || !toStage || fromStage === toStage) return [];
  return [{ from: progressShowing(fromStage), to: progressShowing(toStage), ms: SWEEP_MS.stage, ease: "out" }];
}

export function sweepProgress(phases, elapsed) {
  let t = Math.max(0, elapsed);
  for (const phase of phases) {
    if (t < phase.ms) {
      const k = (EASE[phase.ease] || EASE.linear)(t / phase.ms);
      return { progress: phase.from + (phase.to - phase.from) * k, done: false };
    }
    t -= phase.ms;
  }
  const last = phases[phases.length - 1];
  return { progress: last ? last.to : 100, done: true };
}
