import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { findOccluders } from "./occlusion.js";

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
