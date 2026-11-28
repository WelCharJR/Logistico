import test from "node:test";
import assert from "node:assert/strict";
import { SWEEP_MS, progressShowing, stageChangePhases, sweepProgress, timelapsePhases } from "./stageSweep.js";
import { stageFromProgress, sweepAt } from "./stationLayout.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("progresso que mostra cada etapa inteira (igual ao modelo de verdade)", () => {
  for (const stage of ["skeleton", "skin", "complete"]) {
    const s = sweepAt(progressShowing(stage));
    assert.equal(s.stage, stage);
    assert.equal(stageFromProgress(progressShowing(stage)), stage);
    assert.ok(s.f > 0.999, stage + ": etapa varrida por inteiro");
  }
});

test("timelapse: monta de 0 a 100, segura e rebobina até a etapa real", () => {
  const phases = timelapsePhases("skin");
  const at = (ms) => sweepProgress(phases, ms);
  near(at(0).progress, 0);
  near(at(SWEEP_MS.build / 2).progress, 50); // montagem linear
  near(at(SWEEP_MS.build + 10).progress, 100); // segurando a peça pronta
  const rewindStart = SWEEP_MS.build + SWEEP_MS.hold;
  const mid = at(rewindStart + SWEEP_MS.rewind / 2).progress;
  assert.ok(mid < 100 && mid > progressShowing("skin"), "rebobinando");
  const end = at(rewindStart + SWEEP_MS.rewind + 1);
  assert.ok(end.done);
  near(end.progress, progressShowing("skin"));
  // peça já completa ou movimento reduzido: não rebobina (troca direto no fim)
  assert.equal(timelapsePhases("complete").length, 2);
  assert.equal(timelapsePhases("skin", { reducedMotion: true }).length, 2);
  assert.ok(sweepProgress(timelapsePhases("skin", { reducedMotion: true }), 1e9).done);
});

test("troca de etapa: varredura curta e com ease-out, só quando a etapa muda", () => {
  assert.deepEqual(stageChangePhases("skin", "skin"), []);
  assert.deepEqual(stageChangePhases(undefined, "skin"), []);
  const up = stageChangePhases("skeleton", "skin");
  assert.equal(up[0].ms, SWEEP_MS.stage);
  assert.ok(SWEEP_MS.stage < 500);
  near(sweepProgress(up, 0).progress, progressShowing("skeleton"));
  near(sweepProgress(up, SWEEP_MS.stage + 1).progress, progressShowing("skin"));
  // ease-out: na metade do tempo já andou bem mais que a metade
  const half = sweepProgress(up, SWEEP_MS.stage / 2).progress;
  assert.ok(half > (progressShowing("skeleton") + progressShowing("skin")) / 2 + 10);
  // voltando (completa -> revestimento) também funciona
  const down = stageChangePhases("complete", "skin");
  near(sweepProgress(down, 1e9).progress, progressShowing("skin"));
  assert.ok(sweepProgress(down, 1e9).done);
});
