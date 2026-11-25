import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BIN, CONTENT_KINDS, INSIDE, PILE, binGeometry, contentKind, contentsGeometry, pileHeight, seeded } from "./binModel.js";

test("tipo de peça é sempre o mesmo para o mesmo código", () => {
  assert.equal(contentKind("ABC-123"), contentKind("ABC-123"));
  assert.ok(CONTENT_KINDS.includes(contentKind("XYZ")));
});

test("códigos conhecidos viram a peça certa", () => {
  assert.equal(contentKind("MS21042"), "nuts");
  assert.equal(contentKind("NAS1097"), "rivets");
  assert.equal(contentKind("NAS660"), "bolts");
  assert.equal(contentKind("arruela lisa"), "washers");
});

test("monte é mais alto atrás e fica abaixo da borda da frente", () => {
  assert.ok(pileHeight(INSIDE.minZ) > pileHeight(INSIDE.maxZ));
  assert.equal(pileHeight(INSIDE.maxZ), PILE.front);
  assert.ok(INSIDE.floor + PILE.front + 0.04 < BIN.bottom + BIN.frontHeight);
});

test("aleatório com semente se repete", () => {
  const a = seeded(7), b = seeded(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test("caixa: aberta em cima e dentro das medidas", () => {
  const g = binGeometry();
  g.computeBoundingBox();
  const box = g.boundingBox;
  assert.ok(Math.abs(box.max.x - BIN.width / 2) < 1e-6);
  assert.ok(Math.abs(box.min.y - BIN.bottom) < 1e-6);
  assert.ok(Math.abs(box.max.y - (BIN.bottom + BIN.backHeight)) < 1e-6);
  // Nenhuma face horizontal no topo: um raio de cima no meio da caixa só acerta o fundo.
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(mesh);
  assert.ok(Math.abs(hits[0].point.y - (BIN.bottom + BIN.wall)) < 1e-6);
  assert.equal(binGeometry(), g); // compartilhada
});

test("peças de todos os tipos ficam dentro da caixa", () => {
  for (const kind of CONTENT_KINDS) {
    const g = contentsGeometry(kind);
    g.computeBoundingBox();
    const box = g.boundingBox;
    assert.ok(box.min.x >= -BIN.width / 2 && box.max.x <= BIN.width / 2, kind + " x");
    assert.ok(box.min.z >= -BIN.depth / 2 && box.max.z <= BIN.depth / 2, kind + " z");
    assert.ok(box.min.y >= BIN.bottom && box.max.y <= BIN.bottom + BIN.backHeight, kind + " y");
    assert.ok(g.userData.shared, kind + " compartilhada");
    assert.ok(g.attributes.position.count / 3 < 7000, kind + " leve: " + g.attributes.position.count / 3 + " triângulos");
  }
});

test("caixas da frente e do verso não se sobrepõem e cabem na prateleira", () => {
  const frontBinBack = BIN.rackOffset - BIN.depth / 2;
  assert.ok(frontBinBack > 0, "folga entre as costas: " + frontBinBack);
  // Prateleira vai de z = -0.67 a 0.63 (buildKanban): a frente da caixa não passa da borda.
  assert.ok(BIN.rackOffset + BIN.depth / 2 <= 0.63 + 1e-9);
});
