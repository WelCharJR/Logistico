import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { STATION_MATERIALS as M, buildStationModel } from "./buildStation.js";
import { orientedRect } from "./stationLayout.js";

const rectPts = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const rotated = (cx, cz, l, w, angle) =>
  rectPts(-l / 2, -w / 2, l / 2, w / 2).map((p) => ({ x: cx + p.x * Math.cos(angle) - p.z * Math.sin(angle), z: cz + p.x * Math.sin(angle) + p.z * Math.cos(angle) }));

const materialsOf = (root) => {
  const set = new Set();
  root.traverse((o) => o.isMesh && set.add(o.material));
  return set;
};
const triangles = (root) => {
  let n = 0;
  root.traverse((o) => o.isMesh && (n += o.geometry.attributes.position.count / 3));
  return n;
};

// Todos os vértices, no espaço da área (desfeita a rotação), ficam dentro do retângulo.
function assertInside(root, points) {
  const rect = orientedRect(points);
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const dx = p.x - rect.cx, dz = p.z - rect.cz;
      const u = dx * Math.cos(rect.angle) + dz * Math.sin(rect.angle);
      const v = -dx * Math.sin(rect.angle) + dz * Math.cos(rect.angle);
      assert.ok(Math.abs(u) <= rect.length / 2 + 0.05 && Math.abs(v) <= rect.width / 2 + 0.05, `fora da área: u=${u.toFixed(2)} v=${v.toFixed(2)}`);
      assert.ok(p.y >= -0.05, "abaixo do piso");
    }
  });
}

// Todas as combinações (2 aeronaves x 5 estações x etapas) num teste só; a mensagem diz qual falhou.
test("toda estação cabe na área, é leve e usa os materiais da etapa", () => {
  const points = rotated(4, -3, 22, 14, 0.4);
  for (const aircraft of ["kc390", "tucano"])
    for (const type of ["fuselage", "wing", "tail", "final", "jigs"])
      for (const stage of type === "jigs" ? ["skeleton"] : ["skeleton", "skin", "complete"]) {
        const what = `${aircraft} · ${type} · ${stage}`;
        const root = buildStationModel({ id: "A", type, aircraft, stage, points });
        assert.ok(root, what + ": deveria criar o modelo");
        assertInside(root, points);
        const tris = triangles(root);
        assert.ok(tris > 200 && tris < 90000, `${what}: ${tris} triângulos`);
        const mats = materialsOf(root);
        assert.ok(mats.size <= 13, `${what}: ${mats.size} materiais`);
        if (type === "jigs") continue;
        assert.equal(mats.has(M.paint), stage === "complete" || (type === "final" && aircraft === "kc390"), what + ": pintura só na peça completa");
        assert.equal(mats.has(M.primer), stage !== "complete", what + ": estrutura em primer antes de completar");
        if (stage === "skin") assert.ok(mats.has(M.alu), what + ": revestimento em alumínio");
      }
});

test("área pequena vira maquete dentro da área; genérica ou sem pontos não tem modelo", () => {
  const points = rectPts(0, 0, 8, 6);
  const root = buildStationModel({ type: "final", aircraft: "kc390", stage: "complete", points });
  assert.ok(root.userData.station.scale < 0.25);
  assertInside(root, points);
  assert.equal(buildStationModel({ type: "generic", points: rectPts(0, 0, 5, 5) }), null);
  assert.equal(buildStationModel({ type: "wing", points: [] }), null);
});

test("cache: estações iguais reaproveitam as geometrias, que não podem ser descartadas com a cena", () => {
  const first = buildStationModel({ type: "final", aircraft: "kc390", stage: "skin", points: rectPts(100, 100, 140, 140) });
  const second = buildStationModel({ type: "final", aircraft: "kc390", stage: "skin", points: rectPts(0, 0, 40, 40) });
  const geos = (r) => {
    const out = [];
    r.traverse((o) => o.isMesh && out.push(o.geometry));
    return out;
  };
  assert.deepEqual(geos(first), geos(second));
  assert.ok(geos(first).every((g) => g.userData.shared));
});
