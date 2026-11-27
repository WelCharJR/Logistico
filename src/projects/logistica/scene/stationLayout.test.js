import test from "node:test";
import assert from "node:assert/strict";
import { FOOTPRINT, hasModel, hasStage, orientedRect, sanitizeArea, stationFit, stationObstacle } from "./stationLayout.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const rectPts = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

test("área sem tipo vira genérica; valores inválidos voltam ao padrão", () => {
  const a = sanitizeArea({ id: "A-1", points: [] });
  assert.equal(a.type, "generic");
  assert.equal(a.aircraft, "kc390");
  assert.equal(a.stage, "skeleton");
  assert.equal(sanitizeArea({ type: "xyz", aircraft: "boeing", stage: "?" }).type, "generic");
  assert.equal(hasModel("generic"), false);
  assert.equal(hasStage("jigs"), false);
  assert.equal(hasStage("wing"), true);
});

test("retângulo alinhado: centro, comprimento e largura", () => {
  const r = orientedRect(rectPts(0, 0, 12, 6));
  near(r.cx, 6); near(r.cz, 3); near(r.length, 12); near(r.width, 6); near(Math.abs(r.angle) % Math.PI, 0);
});

test("lado comprido em z vira a direção da peça", () => {
  const r = orientedRect(rectPts(0, 0, 4, 10));
  near(r.length, 10); near(r.width, 4); near(Math.abs(r.angle), Math.PI / 2);
});

test("área girada 30°: acha a direção e o tamanho certos", () => {
  const t = Math.PI / 6, c = Math.cos(t), s = Math.sin(t);
  const local = rectPts(-7, -3, 7, 3);
  const pts = local.map((p) => ({ x: 5 + p.x * c - p.z * s, z: -2 + p.x * s + p.z * c }));
  const r = orientedRect(pts);
  near(r.length, 14, 1e-6); near(r.width, 6, 1e-6); near(r.angle, t, 1e-6); near(r.cx, 5, 1e-6); near(r.cz, -2, 1e-6);
});

test("escala: tamanho real quando cabe, maquete quando não cabe", () => {
  const big = stationFit({ type: "fuselage", aircraft: "tucano", points: rectPts(0, 0, 20, 10) });
  assert.equal(big.scale, 1);
  const small = stationFit({ type: "final", aircraft: "kc390", points: rectPts(0, 0, 16, 10) });
  assert.ok(small.scale < 0.5 && small.scale >= 0.12);
  // a estação escalada cabe dentro da área (com a folga)
  assert.ok(small.footprint[0] <= 16 - 1.2 + 1e-9 && small.footprint[1] <= 10 - 1.2 + 1e-9);
  assert.equal(stationFit({ type: "generic", points: rectPts(0, 0, 5, 5) }).scale, 0);
});

test("todo tipo com modelo tem tamanho para as duas aeronaves", () => {
  for (const aircraft of ["kc390", "tucano"])
    for (const type of ["fuselage", "wing", "tail", "final", "jigs"]) assert.equal(FOOTPRINT[aircraft][type].length, 2, aircraft + "/" + type);
});

test("obstáculo do GPS acompanha a estação", () => {
  const o = stationObstacle({ type: "fuselage", aircraft: "tucano", points: rectPts(0, 0, 20, 10) });
  near(o.x, 10); near(o.z, 5); near(Math.abs(o.rotation) % 180, 0);
  assert.ok(o.halfX > 3 && o.halfZ > 1.5);
  assert.equal(stationObstacle({ type: "generic", points: rectPts(0, 0, 5, 5) }), null);
});

test("obstáculo de estação girada bloqueia a grade do GPS no lugar certo", async () => {
  const { buildGrid } = await import("./route.js");
  const t = Math.PI / 4;
  const pts = [[-8, -3], [8, -3], [8, 3], [-8, 3]].map(([u, v]) => ({ x: u * Math.cos(t) - v * Math.sin(t), z: u * Math.sin(t) + v * Math.cos(t) }));
  const o = stationObstacle({ type: "fuselage", aircraft: "tucano", points: pts });
  const grid = buildGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, [o]);
  const cell = (x, z) => grid.blocked[Math.round((z - grid.minZ) / grid.cell) * grid.cols + Math.round((x - grid.minX) / grid.cell)];
  assert.equal(cell(3.5, 3.5), 1); // ao longo da diagonal (eixo da área)
  assert.equal(cell(3.5, -3.5), 0); // perpendicular: livre
});
