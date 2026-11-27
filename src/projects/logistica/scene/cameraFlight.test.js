import test from "node:test";
import assert from "node:assert/strict";
import { FLIGHT, createFlight, flightAt, shortestAngle } from "./cameraFlight.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const A = { x: 0, z: 0, angle: 0.63, radius: 52 };
const B = { x: 30, z: -20, angle: 0, radius: 9 };

test("começa no ponto atual, termina no destino, duração limitada", () => {
  // começa no ponto atual e termina exatamente no destino
  {
    const f = createFlight(A, B, 1000);
    const start = flightAt(f, 1000);
    near(start.x, A.x); near(start.z, A.z); near(start.radius, A.radius); near(start.angle, A.angle);
    const end = flightAt(f, 1000 + f.duration);
    assert.equal(end.done, true);
    near(end.x, B.x); near(end.z, B.z); near(end.radius, B.radius); near(end.angle, B.angle);
  }
  // duração fica entre o mínimo e o máximo
  {
    assert.ok(createFlight(A, { ...A, x: 1 }, 0).duration >= FLIGHT.minMs);
    assert.ok(createFlight(A, { ...B, x: 500 }, 0).duration <= FLIGHT.maxMs);
  }
});

test("trajeto: sobe em voos longos, gira pelo lado mais curto e sem saltos", () => {
  // trajeto longo sobe no meio do caminho; curto não
  {
    const long = createFlight({ ...A, radius: 20 }, { ...A, x: 60, radius: 20 }, 0);
    assert.ok(long.hop > 0);
    assert.ok(flightAt(long, long.duration / 2).radius > 20 + long.hop * 0.9);
    const short = createFlight(A, { ...A, x: 3 }, 0);
    assert.equal(short.hop, 0);
  }
  // gira pelo lado mais curto
  {
    near(shortestAngle(0.1, Math.PI * 2 - 0.1), -0.1);
    near(shortestAngle(10 * Math.PI + 0.2, 0.3), 10 * Math.PI + 0.3);
    const f = createFlight({ ...A, angle: 0.1 }, { ...A, angle: -0.1 + Math.PI * 2 }, 0);
    near(flightAt(f, f.duration).angle, -0.1);
  }
  // movimento é suave: sem saltos entre quadros
  {
    const f = createFlight(A, B, 0);
    let prev = flightAt(f, 0);
    for (let t = 16; t <= f.duration; t += 16) {
      const cur = flightAt(f, t);
      assert.ok(Math.hypot(cur.x - prev.x, cur.z - prev.z) < 1.5, "salto em " + t);
      prev = cur;
    }
  }
});

test("movimento reduzido: chega na hora", () => {
  const f = createFlight(A, B, 0, { reducedMotion: true });
  const now = flightAt(f, 0);
  assert.equal(now.done, true);
  near(now.x, B.x); near(now.radius, B.radius);
});
