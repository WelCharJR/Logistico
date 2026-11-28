import test from "node:test";
import assert from "node:assert/strict";
import { PIN, easeOutDrop, pinEnter, pinExit } from "./pinMotion.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("queda com um quique só, achatamento no toque e pino parado depois de pousar", () => {
  // curva: começa em 0, toca o 1 no contato, sobe um pouco (um quique) e termina em 1
  near(easeOutDrop(0), 0);
  near(easeOutDrop(PIN.contact), 1);
  near(easeOutDrop(1), 1);
  const mid = easeOutDrop((PIN.contact + 1) / 2);
  assert.ok(mid < 1 && mid >= 1 - PIN.bounce - 1e-9, "um quique baixo");
  let lows = 0;
  for (let x = 0.01, prev = 0, up = true; x <= 1; x += 0.01) {
    const v = easeOutDrop(x);
    if (up && v < prev - 1e-9) (lows++, (up = false));
    if (!up && v > prev + 1e-9) up = true;
    prev = v;
  }
  assert.equal(lows, 1, "só um quique");
  // pino nasce no alto, pousa e fica parado
  near(pinEnter(0).y, PIN.dropHeight);
  near(pinEnter(PIN.dropS).y, 0);
  for (let t = PIN.dropS; t < PIN.dropS + 4; t += 0.05) near(pinEnter(t).y, 0);
  assert.ok(PIN.dropS <= 0.5, "entrada curta: aparece em toda busca");
  // achata no toque, onda de choque a partir dele
  assert.ok(pinEnter(PIN.contact * PIN.dropS).squash > 0.2);
  assert.equal(pinEnter(0.05).shockOpacity, 0);
  assert.ok(pinEnter(PIN.contact * PIN.dropS + 0.05).shockOpacity > 0.5);
  assert.equal(pinEnter(5).shockOpacity, 0);
  // anéis só pulsam depois de pousar, em contrafase
  assert.equal(pinEnter(0.2).ringOpacity, 0);
  const pose = pinEnter(PIN.dropS + 1);
  assert.ok(pose.ringOpacity > 0 || pose.ring2Opacity > 0);
  assert.notEqual(pose.ringScale, pose.ring2Scale);
});

test("saída e movimento reduzido", () => {
  // saída encolhe até zero
  {
    near(pinExit(0), 1);
    assert.ok(pinExit(PIN.exitS / 2) > 0 && pinExit(PIN.exitS / 2) < 1);
    near(pinExit(PIN.exitS), 0);
    assert.ok(pinExit(PIN.exitS / 2) < 0.5, "ease-out: some rápido logo no começo");
  }
  // movimento reduzido: parado, sem quique nem saída animada
  {
    const pose = pinEnter(0, true);
    assert.equal(pose.y, 0);
    assert.equal(pose.squash, 0);
    assert.equal(pinExit(0, true), 0);
  }
});
