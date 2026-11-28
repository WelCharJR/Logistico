import test from "node:test";
import assert from "node:assert/strict";
import { WORKER_HEIGHT, applyPose, buildWorker, buildWorkers, staffing, workerPose } from "./buildWorkers.js";
import { stationSpots } from "./buildStation.js";

const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

test("quantos operadores cada situação põe na estação", () => {
  const spots = [{ kind: "platform" }, { kind: "platform" }, { kind: "platform" }, { kind: "bench" }];
  assert.equal(staffing(spots, "working").length, 3);
  assert.equal(staffing(spots, "waiting").length, 2);
  assert.deepEqual(staffing(spots, "stopped"), [spots[3]], "parada: um só, na bancada");
  assert.deepEqual(staffing(spots, "idle"), []);
  assert.equal(staffing(spots.slice(0, 2), "stopped").length, 1, "sem bancada fica na plataforma");
});

test("pose: trabalhando bate a rebitadeira com faíscas; esperando olha em volta; parado fica quieto", () => {
  const frames = (mode, opts) => Array.from({ length: 200 }, (_, i) => workerPose(mode, i * 0.05, 1, opts));
  const work = frames("work");
  assert.ok(work.every((p) => p.armR < -0.9), "braço da ferramenta levantado");
  assert.ok(work.some((p) => p.spark) && work.some((p) => !p.spark), "faísca pisca");
  const swing = Math.max(...work.map((p) => p.armR)) - Math.min(...work.map((p) => p.armR));
  assert.ok(swing > 0.2, "braço batendo");
  const wait = frames("wait");
  assert.ok(wait.every((p) => !p.spark && p.armR > -0.3), "braços abaixados");
  const look = Math.max(...wait.map((p) => Math.abs(p.turn)));
  assert.ok(look > 0.15 && look <= 0.4, "olha para os lados, sem girar demais: " + look);
  const stand = frames("stand");
  assert.ok(stand.every((p) => !p.spark && p.turn === 0 && Math.abs(p.bob) < 0.01));
  // reduzir movimento: pose fixa e sem faísca
  const still = frames("work", { reducedMotion: true });
  assert.ok(still.every((p) => !p.spark && p.armR === still[0].armR));
});

test("boneco em tamanho real, montado na estação conforme a situação", () => {
  const w = buildWorker(0);
  w.updateMatrixWorld(true);
  let top = 0;
  w.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    top = Math.max(top, o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).max.y);
  });
  assert.ok(Math.abs(top - WORKER_HEIGHT) < 0.15, "altura " + top.toFixed(2));
  applyPose(w, workerPose("work", 0.1, 0));
  assert.ok(w.userData.worker.armR.rotation.x < -1);

  const area = { type: "fuselage", aircraft: "kc390", points: rect(0, 0, 11, 10) };
  const visible = (status) => buildWorkers(area, status).children.filter((c) => c.visible).length;
  assert.equal(buildWorkers(area, "idle").children.length, Math.min(4, stationSpots(area).length), "todos os lugares têm boneco (o timelapse acende)");
  assert.ok(visible("working") > visible("waiting") && visible("waiting") > visible("stopped") && visible("stopped") === 1);
  assert.equal(visible("idle"), 0);
  // maquete pequena demais: sem pessoas em tamanho real
  assert.equal(buildWorkers({ ...area, type: "final", points: rect(0, 0, 8, 6) }, "working").children.length, 0);
});
