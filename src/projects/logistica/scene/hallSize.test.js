import { test } from "node:test";
import assert from "node:assert/strict";
import { HALL_DEFAULT, hallBounds, minHallFor, sanitizeHall } from "./hallSize.js";

test("tamanho padrão mantém as docas originais", () => {
  const b = hallBounds(HALL_DEFAULT);
  assert.deepEqual([b.minX, b.maxX, b.minZ, b.maxZ], [-30, 30, -22, 22]);
  assert.deepEqual(b.docks, [-22, -14, 14, 22]);
});

test("galpão maior ganha mais docas, sempre longe do letreiro central", () => {
  const b = hallBounds({ width: 100, depth: 70 });
  assert.ok(b.docks.length > 4);
  assert.ok(b.docks.every((x) => Math.abs(x) > 9 && Math.abs(x) < 50));
});

test("sanitizeHall aceita só números dentro dos limites e arredonda para par", () => {
  assert.deepEqual(sanitizeHall(undefined), HALL_DEFAULT);
  assert.deepEqual(sanitizeHall({ width: "abc", depth: 9999 }), { width: HALL_DEFAULT.width, depth: 120 });
  assert.deepEqual(sanitizeHall({ width: 81, depth: 10 }), { width: 82, depth: 30 });
});

test("minHallFor cobre kanbans, áreas e caminhos", () => {
  const layout = {
    kanbans: [{ x: 35, z: -4 }],
    areas: [{ points: [{ x: 0, z: 0 }, { x: 2, z: 27 }] }],
    paths: [],
  };
  const min = minHallFor(layout);
  assert.ok(min.width >= 2 * 38);
  assert.ok(min.depth >= 2 * 28);
  assert.equal(min.width % 2, 0);
});
