import test from "node:test";
import assert from "node:assert/strict";
import { DAY_LENGTH_S, lampGrid, skyAt, stepClock } from "./dayNight.js";
import { COLORS } from "./theme.js";

test("meio-dia é a cena de sempre; meia-noite é escura com as luminárias acesas", () => {
  const noon = skyAt(0.5);
  assert.equal(noon.sky, COLORS.sky);
  assert.equal(noon.sun.intensity, 2.6);
  assert.deepEqual(noon.sun.position.map((v) => Math.round(v * 1000) / 1000), [-22, 38, 26]);
  assert.equal(noon.hemi.intensity, 1.9);
  assert.equal(noon.fill, 0.7);
  assert.equal(noon.lamps, 0);
  const night = skyAt(0);
  assert.ok(night.daylight === 0 && night.lamps === 1 && night.sun.intensity < 0.5 && night.hemi.intensity < 0.5);
  // entardecer: céu alaranjado e luzes acendendo
  const dusk = skyAt(0.725);
  assert.ok(dusk.dusk > 0.3 && dusk.lamps > 0 && dusk.lamps < 1, JSON.stringify(dusk));
  // o sol nasce de um lado e se põe do outro; à noite a luz vem da lua (outro lado)
  assert.ok(skyAt(0.3).sun.position[0] > skyAt(0.7).sun.position[0]);
  // contínuo: sem saltos de intensidade ao longo do dia
  for (let t = 0; t < 1; t += 0.005) {
    const a = skyAt(t), b = skyAt(t + 0.005);
    assert.ok(Math.abs(a.hemi.intensity - b.hemi.intensity) < 0.15 && Math.abs(a.lamps - b.lamps) < 0.15, "salto em " + t.toFixed(3));
  }
});

test("relógio: dia e noite andam para a frente até a hora pedida; ciclo dá a volta", () => {
  let h = 0.5;
  const seen = [];
  for (let i = 0; i < 200 && h !== 0; i++) seen.push((h = stepClock(h, "night", 0.05)));
  assert.equal(h, 0, "chegou à meia-noite");
  assert.ok(seen.length > 10 && seen.length < 100, "transição em alguns segundos, não instantânea: " + seen.length);
  assert.ok(seen.slice(0, -1).every((v, i) => i === 0 || v > seen[i - 1]), "passa pelo entardecer (sempre para a frente)");
  assert.equal(stepClock(0.5, "day", 0.05), 0.5, "já é dia: fica");
  assert.ok(Math.abs(stepClock(0.25, "cycle", DAY_LENGTH_S / 4) - 0.5) < 1e-9);
  assert.ok(Math.abs(stepClock(0.9, "cycle", DAY_LENGTH_S / 5) - 0.1) < 1e-9, "dá a volta na meia-noite");
});

test("luminárias cobrem o galpão em grade", () => {
  const b = { minX: -30, maxX: 30, minZ: -20, maxZ: 20, width: 60, depth: 40 };
  const lamps = lampGrid(b);
  assert.equal(lamps.length, 6 * 4);
  assert.ok(lamps.every((p) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ));
});
