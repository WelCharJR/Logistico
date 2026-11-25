import test from "node:test";
import assert from "node:assert/strict";
import { PIN, easeOutBounce, pinEnter, pinExit } from "./pinMotion.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("quique começa em 0, termina em 1 e toca o 1 no primeiro impacto", () => {
  near(easeOutBounce(0), 0);
  near(easeOutBounce(1), 1);
  near(easeOutBounce(1 / 2.75), 1, 1e-3);
  assert.ok(easeOutBounce(0.55) < 1); // subiu de novo depois do primeiro toque
});

test("pino nasce no alto e pousa na estante", () => {
  near(pinEnter(0).y, PIN.dropHeight);
  near(pinEnter(PIN.dropS).y, 0);
});

test("achata no primeiro toque e quase nada longe dele", () => {
  assert.ok(pinEnter((1 / 2.75) * PIN.dropS).squash > 0.25);
  assert.ok(pinEnter(0.1).squash < 0.01);
  assert.ok(pinEnter(3).squash < 0.001);
});

test("onda de choque só depois do primeiro toque, e some", () => {
  assert.equal(pinEnter(0.1).shockOpacity, 0);
  assert.ok(pinEnter((1 / 2.75) * PIN.dropS + 0.05).shockOpacity > 0.5);
  assert.equal(pinEnter(5).shockOpacity, 0);
});

test("anéis só pulsam depois de pousar, em contrafase", () => {
  assert.equal(pinEnter(0.3).ringOpacity, 0);
  const t = PIN.dropS + 1;
  const pose = pinEnter(t);
  assert.ok(pose.ringOpacity > 0 || pose.ring2Opacity > 0);
  assert.notEqual(pose.ringScale, pose.ring2Scale);
});

test("depois de pousar, flutua sem passar de bobAmp", () => {
  for (let t = PIN.dropS; t < PIN.dropS + 4; t += 0.05) assert.ok(Math.abs(pinEnter(t).y) <= PIN.bobAmp + 1e-9);
});

test("saída encolhe até zero", () => {
  near(pinExit(0), 1);
  assert.ok(pinExit(PIN.exitS / 2) > 0 && pinExit(PIN.exitS / 2) < 1);
  near(pinExit(PIN.exitS), 0);
});

test("movimento reduzido: parado, sem quique nem saída animada", () => {
  const pose = pinEnter(0, true);
  assert.equal(pose.y, 0);
  assert.equal(pose.squash, 0);
  assert.equal(pinExit(0, true), 0);
});
