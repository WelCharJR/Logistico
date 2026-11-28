import * as THREE from "three";
import { mat } from "./theme.js";
import { stationSpots } from "./buildStation.js";

// Operadores nas estações: bonequinhos simples (capacete, colete, rebitadeira) nos lugares de
// trabalho da estação. O que eles fazem mostra a situação só de olhar:
//   working  -> trabalhando: braço com a rebitadeira batendo e faíscas
//   waiting  -> parados, olhando em volta (esperando o material chegar)
//   stopped  -> um só, de pé e parado ao lado da bancada
//   idle     -> estação vazia
// buildWorkers(area, status) -> THREE.Group (filhos com userData.worker; a cena anima com applyPose)

export const WORKER_HEIGHT = 1.75;
const MIN_SCALE = 0.55; // em maquete muito reduzida não cabem pessoas em tamanho real

// Quantos e quais lugares ficam ocupados em cada situação.
export function staffing(spots, status) {
  const platforms = spots.filter((s) => s.kind === "platform");
  const benches = spots.filter((s) => s.kind === "bench");
  if (status === "working") return [...platforms.slice(0, 2), ...benches.slice(0, 1)];
  if (status === "waiting") return [...benches.slice(0, 1), ...platforms.slice(0, 1)];
  if (status === "stopped") return benches.length ? benches.slice(0, 1) : platforms.slice(0, 1);
  return [];
}

// Pose no instante t (s). seed desencontra os operadores. Ângulos em radianos;
// braço negativo = levantado para a frente.
export function workerPose(mode, t, seed = 0, { reducedMotion = false } = {}) {
  const time = reducedMotion ? 0 : t;
  if (mode === "work") {
    const hit = Math.sin(time * 9 + seed * 2.1);
    return {
      bob: reducedMotion ? 0 : 0.015 * Math.abs(Math.sin(time * 4.5 + seed)),
      lean: 0.14,
      armR: -1.25 + 0.18 * hit,
      armL: -0.55 + 0.05 * Math.sin(time * 1.3 + seed),
      turn: 0.18 * Math.sin(time * 0.45 + seed * 3),
      spark: !reducedMotion && hit > 0.55,
    };
  }
  if (mode === "wait") {
    return { bob: 0, lean: 0, armR: -0.08, armL: -0.08, turn: 0.35 * Math.sin(time * 0.35 + seed * 1.7), spark: false };
  }
  // parado: quase imóvel, só a respiração
  return { bob: 0.006 * Math.sin(time * 1.6 + seed), lean: -0.02, armR: 0, armL: 0, turn: 0, spark: false };
}

// ---- modelo (geometrias e materiais compartilhados) ----
let parts = null;
function shared() {
  if (parts) return parts;
  const keep = (g) => ((g.userData.shared = true), g);
  parts = {
    leg: keep(new THREE.BoxGeometry(0.15, 0.86, 0.17)),
    torso: keep(new THREE.CapsuleGeometry(0.2, 0.34, 4, 10)),
    head: keep(new THREE.SphereGeometry(0.115, 14, 10)),
    helmet: keep(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    brim: keep(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16)),
    arm: keep(new THREE.CapsuleGeometry(0.055, 0.42, 3, 8)),
    tool: keep(new THREE.BoxGeometry(0.08, 0.1, 0.24)),
    spark: keep(new THREE.SphereGeometry(0.06, 8, 6)),
    pants: mat("#2b3446", { roughness: 0.8 }),
    skin: mat("#d9a982", { roughness: 0.7 }),
    tool_: mat("#363d4b", { roughness: 0.5, metalness: 0.4 }),
    vests: [mat("#f97316", { roughness: 0.6 }), mat("#2f55e4", { roughness: 0.6 }), mat("#16a34a", { roughness: 0.6 })],
    helmets: [mat("#facc15", { roughness: 0.4 }), mat("#ffffff", { roughness: 0.4 })],
    sparkMat: new THREE.MeshBasicMaterial({ color: "#ffd98a", toneMapped: false }),
  };
  parts.sparkMat.userData.shared = true;
  return parts;
}

export function buildWorker(seed = 0) {
  const p = shared();
  const worker = new THREE.Group();
  const body = new THREE.Group(); // tudo acima do quadril (inclina e balança)
  worker.add(body);
  const add = (parent, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const x of [-0.1, 0.1]) add(worker, p.leg, p.pants, x, 0.43, 0);
  body.position.y = 0.86;
  add(body, p.torso, p.vests[seed % p.vests.length], 0, 0.32, 0);
  add(body, p.head, p.skin, 0, 0.78, 0);
  add(body, p.helmet, p.helmets[seed % p.helmets.length], 0, 0.8, 0);
  add(body, p.brim, p.helmets[seed % p.helmets.length], 0, 0.8, 0.02);
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.26, 0.55, 0);
    add(pivot, p.arm, p.vests[seed % p.vests.length], 0, -0.26, 0);
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-1),
    armR = arm(1);
  add(armR, p.tool, p.tool_, 0, -0.52, 0.08);
  const spark = add(armR, p.spark, p.sparkMat, 0, -0.55, 0.24);
  spark.castShadow = false;
  spark.visible = false;
  worker.userData.worker = { body, armL, armR, spark, seed, mode: "stand" };
  return worker;
}

export function applyPose(worker, pose) {
  const w = worker.userData.worker;
  w.body.position.y = 0.86 + pose.bob;
  w.body.rotation.x = pose.lean;
  w.body.rotation.y = pose.turn;
  w.armR.rotation.x = pose.armR;
  w.armL.rotation.x = pose.armL;
  w.spark.visible = pose.spark;
  if (pose.spark) w.spark.scale.setScalar(0.6 + Math.random() * 0.8);
}

const MODE = { working: "work", waiting: "wait", stopped: "stand" };

// Grupo com os operadores da estação. Todos os lugares ganham um boneco; os que a situação não
// usa ficam escondidos (o timelapse acende todos trabalhando).
export function buildWorkers(area, status) {
  const group = new THREE.Group();
  const spots = stationSpots(area).filter((s) => s.scale >= MIN_SCALE).slice(0, 4);
  const staffed = new Set(staffing(spots, status));
  spots.forEach((s, i) => {
    const worker = buildWorker(i);
    worker.position.set(s.x, s.y, s.z);
    worker.rotation.y = s.heading;
    worker.userData.worker.mode = MODE[status] || "stand";
    worker.userData.worker.staffed = staffed.has(s);
    worker.visible = staffed.has(s);
    group.add(worker);
  });
  return group;
}
