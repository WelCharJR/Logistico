import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { findOccluders, ownersOf } from "./occlusion.js";

const rack = (id, x, z, rotation = 0) => {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotation;
  g.userData.id = id;
  g.updateMatrixWorld(true);
  return g;
};

test("estante entre a câmera e o alvo é marcada como obstáculo", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const target = rack("ALVO", 0, 0);
  const front = rack("FRENTE", 0, 8);
  const side = rack("LADO", 15, 8);
  const hits = findOccluders(camera, [target], [target, front, side]);
  assert.deepEqual([...hits], ["FRENTE"]);
});

test("estante atrás do alvo não é obstáculo", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const target = rack("ALVO", 0, 0);
  const behind = rack("ATRAS", 0, -8);
  assert.equal(findOccluders(camera, [target], [target, behind]).size, 0);
});

test("estante cobrindo só a ponta do alvo também é obstáculo", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const target = rack("ALVO", 0, 0);
  const corner = rack("CANTO", 2, 8, Math.PI / 2);
  assert.ok(findOccluders(camera, [target], [target, corner]).has("CANTO"));
});

test("alvo como ponto no piso ignora a estante que contém o ponto", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const owner = rack("DONO", 0, 0);
  const front = rack("FRENTE", 0, 8);
  const hits = findOccluders(camera, [new THREE.Vector3(0, 0, 0)], [owner, front]);
  assert.deepEqual([...hits], ["FRENTE"]);
});

// ---- estante em foco nunca esmaece ----

test("estante em foco não esmaece para mostrar outro pino atrás dela", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const focused = rack("FOCO", 0, 8); // na frente
  const pinned = rack("PINO", 0, 0); // atrás, marcado pela busca
  assert.ok(findOccluders(camera, [focused, pinned], [focused, pinned]).has("FOCO")); // comportamento antigo
  assert.equal(findOccluders(camera, [focused, pinned], [focused, pinned], new Set(["FOCO"])).size, 0);
});

test("ponto mirado atrás da estante (meio do voo) não esmaece a estante do destino", () => {
  const camera = new THREE.Vector3(0, 6, 20);
  const destination = rack("DESTINO", 0, 8);
  const midFlight = new THREE.Vector3(0, 0, -2); // ponto ainda atrás da estante
  assert.ok(findOccluders(camera, [midFlight], [destination]).has("DESTINO")); // o problema
  assert.equal(findOccluders(camera, [midFlight], [destination], new Set(["DESTINO"])).size, 0);
});

test("ownersOf: estante que contém o ponto", () => {
  const a = rack("A", 0, 0), b = rack("B", 10, 0, Math.PI / 2);
  assert.deepEqual([...ownersOf(new THREE.Vector3(1, 0, 0.3), [a, b])], ["A"]);
  assert.deepEqual([...ownersOf(new THREE.Vector3(10.4, 2, 2), [a, b])], ["B"]); // girada: comprida em z
  assert.equal(ownersOf(new THREE.Vector3(5, 0, 5), [a, b]).size, 0);
});
