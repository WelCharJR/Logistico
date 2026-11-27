import test from "node:test";
import assert from "node:assert/strict";
import { flowLinks, jigState, materialState, sameMaterial, stationDefaults, stationState, stepOf } from "./stationStatus.js";
import { sanitizeArea } from "../scene/stationLayout.js";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const box = (code, qty, days = 1) => ({ id: "A-1", code, qty, unit: "un", checkedAt: ago(days) });
const kanbans = [
  { id: "K-01", slots: [box("MS21042", 10), box("NAS1097AD4-4", 2)] },
  { id: "K-02", slots: [box("MS21042L3", 0), box("HL10-6-4", 0)] },
  { id: "K-03", slots: [box("CR3213-4-2", 8, 90)] },
];
const station = (extra = {}) => ({ id: "A", type: "wing", aircraft: "kc390", points: rect(0, 0, 20, 9), status: "working", progress: 40, materials: [], jig: { code: "GAB", checkedAt: ago(10), intervalDays: 180 }, ...extra });

test("progresso define a etapa e a peça em 3D", () => {
  assert.equal(sanitizeArea(station({ progress: 10 })).stage, "skeleton");
  assert.equal(sanitizeArea(station({ progress: 50 })).stage, "skin");
  assert.equal(sanitizeArea(station({ progress: 90 })).stage, "complete");
  assert.equal(sanitizeArea({ stage: "skin" }).progress, 55); // área antiga: progresso vem da etapa
  const s = stepOf(station({ progress: 55 }));
  assert.deepEqual([s.index, s.total, s.label], [3, 6, "Rebitagem do revestimento"]);
  assert.equal(stepOf(station({ progress: 100 })).label, "Concluída");
});

test("mesmo material com/sem sufixo", () => {
  assert.ok(sameMaterial("MS21042", "ms21042L3"));
  assert.ok(!sameMaterial("AN3", "AN365-428A")); // prefixo curto demais não vale
  assert.ok(!sameMaterial("NAS1097", "NAS6203-4"));
});

test("material: melhor kanban, acabou e não encontrado", () => {
  const m = materialState("MS21042L3", kanbans, NOW);
  assert.equal(m.status, "full");
  assert.deepEqual(m.where.map((w) => w.kanbanId), ["K-01", "K-02"]);
  assert.equal(materialState("HL10-6-4", kanbans, NOW).status, "out");
  assert.equal(materialState("NAS1611-012", kanbans, NOW).status, "missing");
  assert.equal(materialState("CR3213-4-2", kanbans, NOW).status, "unknown");
});

test("gabarito: em dia, vence logo, vencido", () => {
  assert.equal(jigState({ checkedAt: ago(10) }, NOW).status, "ok");
  assert.equal(jigState({ checkedAt: ago(170) }, NOW).status, "due");
  const exp = jigState({ code: "G", checkedAt: ago(200), intervalDays: 180 }, NOW);
  assert.deepEqual([exp.status, exp.left], ["expired", -20]);
  assert.equal(jigState({ checkedAt: undefined }, NOW).status, "unknown");
});

test("situação: em montagem quando está tudo certo", () => {
  const s = stationState(station({ materials: ["MS21042L3"] }), kanbans, NOW);
  assert.deepEqual([s.status, s.andon, s.reasons.length], ["working", "green", 0]);
});

test("falta de material -> aguardando material (amarelo), com o motivo", () => {
  const s = stationState(station({ materials: ["MS21042L3", "HL10-6-4", "NAS1611-012"] }), kanbans, NOW);
  assert.deepEqual([s.status, s.andon], ["waiting", "yellow"]);
  assert.ok(s.reasons.some((r) => r.includes("HL10-6-4") && r.includes("acabou")));
  assert.ok(s.reasons.some((r) => r.includes("NAS1611-012") && r.includes("nenhum kanban")));
});

test("gabarito vencido -> parada (vermelho), mesmo com material", () => {
  const s = stationState(station({ materials: ["HL10-6-4"], jig: { code: "GAB-1", checkedAt: ago(200), intervalDays: 180 } }), kanbans, NOW);
  assert.deepEqual([s.status, s.andon], ["stopped", "red"]);
  assert.ok(s.reasons[0].includes("GAB-1"));
});

test("avisos: material acabando, sem conferência, gabarito perto de vencer", () => {
  const s = stationState(station({ materials: ["NAS1097AD4-4", "CR3213-4-2"], jig: { code: "G", checkedAt: ago(170) } }), kanbans, NOW);
  assert.equal(s.status, "working");
  assert.equal(s.warnings.length, 3);
});

test("livre e parada escolhidas valem; livre apaga o andon", () => {
  assert.equal(stationState(station({ status: "idle", materials: ["HL10-6-4"] }), kanbans, NOW).andon, "off");
  assert.equal(stationState(station({ status: "stopped" }), kanbans, NOW).andon, "red");
  assert.equal(stationState({ type: "generic", points: rect(0, 0, 5, 5) }, kanbans, NOW).andon, "off");
});

test("estação nova vem com materiais e gabarito em dia", () => {
  const d = stationDefaults("wing", "kc390", NOW);
  assert.deepEqual(d.materials, ["NAS1097AD4-4", "HL10-6-4", "HL70-6"]);
  assert.equal(jigState(d.jig, NOW).status, "ok");
  assert.deepEqual(stationDefaults("generic", "kc390"), {});
});

test("fluxo: fuselagem, asa e cauda vão para a montagem final da mesma aeronave", () => {
  const areas = [
    { id: "F", type: "fuselage", aircraft: "kc390", points: rect(0, 0, 10, 10) },
    { id: "W", type: "wing", aircraft: "kc390", points: rect(20, 0, 40, 9) },
    { id: "T", type: "tail", aircraft: "tucano", points: rect(0, 20, 5, 26) },
    { id: "M1", type: "final", aircraft: "kc390", points: rect(50, 0, 80, 30) },
    { id: "M2", type: "final", aircraft: "tucano", points: rect(-30, 20, -15, 35) },
  ];
  assert.deepEqual(flowLinks(areas).map((l) => l.from + ">" + l.to), ["F>M1", "W>M1", "T>M2"]);
  assert.deepEqual(flowLinks(areas.filter((a) => a.type !== "final")), []);
});

test("abastecimento: uma linha por kanban, com os materiais que ele fornece", async () => {
  const { supplyLinks } = await import("./stationStatus.js");
  const links = supplyLinks(station({ materials: ["MS21042L3", "HL10-6-4", "NAS1097AD4-4", "NAS1611-012"] }), kanbans, NOW);
  assert.deepEqual(
    links.map((l) => [l.kanbanId, l.status, l.codes.map((c) => c.code).join(",")]),
    [
      ["K-01", "full", "MS21042L3,NAS1097AD4-4"], // melhor situação entre os materiais do kanban
      ["K-02", "out", "MS21042L3,HL10-6-4"], // vazio: linha vermelha
    ],
  );
  assert.deepEqual(supplyLinks({ type: "generic", points: rect(0, 0, 5, 5), materials: ["MS21042"] }, kanbans, NOW), []);
});
