import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { STATION_MATERIALS as M, buildStationModel, createTimelapse, stationSpots } from "./buildStation.js";
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

// Quantos vértices de uma malha o plano de corte deixa visíveis (normal·p + constante >= 0).
function keptRatio(root) {
  root.updateMatrixWorld(true);
  let kept = 0, total = 0;
  const p = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.parent.visible || !o.material.clippingPlanes?.length) return;
    const plane = o.material.clippingPlanes[0];
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 5) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      total++;
      if (plane.distanceToPoint(p) >= 0) kept++;
    }
  });
  return { kept, total };
}
const layersOf = (tl) => tl.group.children[0].children.filter((c) => c.userData.plane);

test("timelapse: a peça nasce do gabarito, troca de etapa sem buracos e termina completa", () => {
  const points = rotated(4, -3, 22, 14, 0.7);
  for (const aircraft of ["kc390", "tucano"])
    for (const type of ["fuselage", "wing", "tail", "final"]) {
      const what = `${aircraft} · ${type}`;
      const tl = createTimelapse({ id: "A", type, aircraft, points });
      const layers = layersOf(tl);
      assert.equal(layers.length, 4, what + ": gabarito + 3 etapas");
      // gabarito sem peça: nenhuma superfície de primer/alumínio/pintura na camada 0
      layers[0].traverse((o) => o.isMesh && assert.ok(![M.primer, M.alu, M.paint].some((m) => m.color.equals(o.material.color) && m.roughness === o.material.roughness), what + ": camada 0 só gabarito"));
      tl.setProgress(0);
      assert.deepEqual(layers.map((l) => l.visible), [true, true, false, false], what + " 0%");
      assert.equal(keptRatio(layers[1]).kept, 0, what + ": esqueleto ainda não apareceu");
      tl.setProgress(17); // metade do esqueleto
      const half = keptRatio(layers[1]);
      assert.ok(half.kept > 0 && half.kept < half.total, what + ": esqueleto pela metade");
      tl.setProgress(57);
      assert.deepEqual(layers.map((l) => l.visible), [false, true, true, false], what + " 57%");
      // a etapa nova e a anterior se complementam: nada some e nada fica duplicado no corte
      const [a, b] = [layers[1].userData.plane, layers[2].userData.plane];
      assert.ok(a.normal.clone().add(b.normal).length() < 1e-6 && Math.abs(a.constant + b.constant) < 1e-6, what + ": planos complementares");
      tl.setProgress(100);
      assert.equal(tl.stage, "complete");
      const done = keptRatio(layers[3]);
      assert.equal(done.kept, done.total, what + ": 100% mostra a peça inteira");
      assertInside(tl.group, points);
      tl.dispose();
    }
  assert.equal(createTimelapse({ type: "jigs", points }), null, "depósito de gabaritos não tem montagem");
  assert.equal(createTimelapse({ type: "generic", points }), null);
});

test("as etapas usam a mesma moldura: o gabarito não sai do lugar quando a etapa muda", () => {
  const points = rotated(0, 0, 40, 40, 0.3);
  const jigBox = (stage) => {
    const root = buildStationModel({ type: "tail", aircraft: "kc390", stage, points });
    root.updateMatrixWorld(true);
    const mesh = root.children[0].children.find((m) => m.material === M.jig);
    return new THREE.Box3().setFromObject(mesh);
  };
  const ref = jigBox("skeleton");
  for (const stage of ["skin", "complete"]) {
    const box3 = jigBox(stage);
    assert.ok(box3.min.distanceTo(ref.min) < 1e-3 && box3.max.distanceTo(ref.max) < 1e-3, stage + ": gabarito mudou de lugar");
  }
});

test("lugares dos operadores ficam dentro da área e olham para a peça", () => {
  const points = rotated(10, 5, 22, 14, 0.5);
  for (const aircraft of ["kc390", "tucano"])
    for (const type of ["fuselage", "wing", "tail", "final", "jigs"]) {
      const area = { type, aircraft, points };
      const spots = stationSpots(area);
      const what = `${aircraft} · ${type}`;
      assert.ok(spots.length >= 1, what + ": sem lugar de trabalho");
      if (type !== "jigs") assert.ok(spots.some((s) => s.kind === "platform"), what + ": falta lugar na plataforma");
      const rect = orientedRect(points);
      for (const s of spots) {
        const dx = s.x - rect.cx, dz = s.z - rect.cz;
        const u = dx * Math.cos(rect.angle) + dz * Math.sin(rect.angle);
        const v = -dx * Math.sin(rect.angle) + dz * Math.cos(rect.angle);
        assert.ok(Math.abs(u) <= rect.length / 2 && Math.abs(v) <= rect.width / 2, `${what}: operador fora da área (${u.toFixed(1)}, ${v.toFixed(1)})`);
        if (s.kind === "platform") {
          // olhando para o eixo da peça: o passo à frente aproxima do centro
          const ahead = Math.hypot(s.x + Math.sin(s.heading) - rect.cx, s.z + Math.cos(s.heading) - rect.cz);
          assert.ok(ahead < Math.hypot(dx, dz) + 0.6, what + ": operador de costas para a peça");
        }
      }
    }
  assert.deepEqual(stationSpots({ type: "generic", points }), []);
});
