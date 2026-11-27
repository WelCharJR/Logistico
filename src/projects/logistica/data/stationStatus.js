// Estação "funcionando": situação, progresso por etapas, materiais ligados aos kanbans, gabarito
// com verificação periódica e fluxo da linha. Sem React nem Three.js, para testar no Node.
//
//   stationState(area, kanbans) -> { status, andon, reasons, warnings, materials, jig, step }
//     status: working (em montagem) · waiting (aguardando material) · stopped (parada) · idle (livre)
//   flowLinks(areas) -> [{ from, to }]  fuselagem/asa/cauda -> montagem final da mesma aeronave

import { kanbanStock, STATUS as STOCK_STATUS } from "./stock.js";
import { AREA_TYPES, hasModel, orientedRect, sanitizeArea } from "../scene/stationLayout.js";

export const STATION_STATUS = {
  working: { label: "Em montagem", andon: "green", tone: "green" },
  waiting: { label: "Aguardando material", andon: "yellow", tone: "amber" },
  stopped: { label: "Parada", andon: "red", tone: "red" },
  idle: { label: "Livre", andon: "off", tone: "gray" },
};

// Etapas de cada estação (o progresso 0–100% avança por elas).
export const STEPS = {
  fuselage: ["Posicionar cavernas no gabarito", "Fixar longarinas", "Furação dos painéis", "Rebitagem dos painéis", "Instalação de chicotes", "Inspeção de qualidade"],
  wing: ["Montar longarinas", "Fixar nervuras", "Furação do revestimento", "Rebitagem do revestimento", "Vedação do tanque", "Inspeção de qualidade"],
  tail: ["Montar longarinas", "Fixar nervuras", "Rebitagem do revestimento", "Superfícies de comando", "Inspeção de qualidade"],
  final: ["Junção asa-fuselagem", "Instalação da empenagem", "Trem de pouso", "Sistemas e chicotes", "Testes funcionais", "Inspeção final"],
  jigs: [],
  generic: [],
};

// Materiais típicos de cada estação (códigos como nos kanbans de exemplo).
export const DEFAULT_MATERIALS = {
  fuselage: { kc390: ["MS20470AD4-5", "CR3213-4-2", "NAS1149F0363P"], tucano: ["MS20470AD4-5", "MS21042L3"] },
  wing: { kc390: ["NAS1097AD4-4", "HL10-6-4", "HL70-6"], tucano: ["NAS1097AD4-4", "MS21042L3"] },
  tail: { kc390: ["MS20426AD3-4", "MS21042L3"], tucano: ["MS20426AD3-4", "MS21042L3"] },
  final: { kc390: ["NAS6203-4", "AN310-4", "NAS1611-012", "MS21042L3"], tucano: ["AN3-5A", "NAS1611-012", "MS21042L3"] },
};

export const JIG = { intervalDays: 180, warnDays: 15 };
const DAY = 24 * 60 * 60 * 1000;
const JIG_PREFIX = { fuselage: "GAB-FUS", wing: "GAB-ASA", tail: "GAB-EMP", final: "GAB-MF", jigs: "GAB-DEP" };

// Valores iniciais de uma estação nova (ou de uma área antiga ao escolher o tipo).
export function stationDefaults(type, aircraft, now = Date.now()) {
  if (!hasModel(type)) return {};
  return {
    status: type === "jigs" ? "idle" : "working",
    progress: 0,
    materials: [...(DEFAULT_MATERIALS[type]?.[aircraft] || [])],
    jig: { code: JIG_PREFIX[type] + "-" + (aircraft === "kc390" ? "390" : "ST") + "-01", checkedAt: new Date(now).toISOString(), intervalDays: JIG.intervalDays },
  };
}

// Etapa atual pelo progresso: { index, total, label } (index = 0-based; total 0 = sem etapas).
export function stepOf(rawArea) {
  const area = sanitizeArea(rawArea);
  const steps = STEPS[area.type] || [];
  if (!steps.length) return { index: 0, total: 0, label: "" };
  if (area.progress >= 100) return { index: steps.length - 1, total: steps.length, label: "Concluída", done: true };
  const index = Math.min(steps.length - 1, Math.floor((area.progress / 100) * steps.length));
  return { index, total: steps.length, label: steps[index] };
}

// Gabarito: em dia · vence logo · vencido · sem informação.
export function jigState(jig, now = Date.now()) {
  if (!jig) return { status: "none" };
  const t = jig.checkedAt ? Date.parse(jig.checkedAt) : NaN;
  if (!Number.isFinite(t)) return { status: "unknown", code: jig.code };
  const interval = Number(jig.intervalDays) > 0 ? Number(jig.intervalDays) : JIG.intervalDays;
  const days = Math.floor((now - t) / DAY);
  const left = interval - days;
  return { status: left < 0 ? "expired" : left <= JIG.warnDays ? "due" : "ok", code: jig.code, days, left, interval };
}

// Mesmo material com ou sem sufixo ("MS21042" no kanban x "MS21042L3" na estação).
const norm = (c) => String(c || "").trim().toUpperCase();
export function sameMaterial(a, b) {
  const x = norm(a),
    y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(short);
}

// Situação de um material no hangar: o melhor kanban onde ele está.
// missing = não está em nenhum kanban.
export function materialState(code, kanbans, now = Date.now()) {
  const where = [];
  for (const k of kanbans) {
    const slots = (k.slots || []).filter((s) => sameMaterial(s.code, code));
    if (!slots.length) continue;
    where.push({ kanbanId: k.id, ...kanbanStock(slots, now) });
  }
  if (!where.length) return { code, status: "missing", where };
  where.sort((a, b) => STOCK_STATUS[a.status].order - STOCK_STATUS[b.status].order);
  return { code, status: where[0].status, where };
}

// Estado completo da estação. A situação escolhida vale, a não ser que algo impeça o trabalho:
// gabarito vencido -> parada; material que acabou/não existe -> aguardando material.
export function stationState(rawArea, kanbans = [], now = Date.now()) {
  const area = sanitizeArea(rawArea);
  const step = stepOf(area);
  if (!hasModel(area.type)) return { status: "idle", andon: "off", reasons: [], warnings: [], materials: [], jig: { status: "none" }, step };
  const manual = STATION_STATUS[area.status] ? area.status : area.type === "jigs" ? "idle" : "working";
  const materials = (area.materials || []).map((code) => materialState(code, kanbans, now));
  const jig = jigState(area.jig, now);
  const reasons = [],
    warnings = [];
  let status = manual;
  if (manual === "working" || manual === "waiting") {
    if (jig.status === "expired") {
      status = "stopped";
      reasons.push(`Gabarito ${jig.code} com verificação vencida há ${-jig.left} dias`);
    }
    const lacking = materials.filter((m) => m.status === "out" || m.status === "missing");
    if (lacking.length && status !== "stopped") status = "waiting";
    lacking.forEach((m) => reasons.push(m.status === "missing" ? `${m.code} não está em nenhum kanban` : `${m.code} acabou em todos os kanbans`));
  }
  if (status !== "idle") {
    materials.filter((m) => m.status === "low").forEach((m) => warnings.push(`${m.code} está acabando`));
    materials.filter((m) => m.status === "unknown").forEach((m) => warnings.push(`${m.code} sem conferência recente`));
    if (jig.status === "due") warnings.push(`Verificação do gabarito vence em ${jig.left} dias`);
  }
  return { status, manual, andon: STATION_STATUS[status].andon, reasons, warnings, materials, jig, step };
}

// Fluxo da linha: cada fuselagem/asa/cauda segue para a montagem final mais perto da mesma aeronave.
export function flowLinks(areas) {
  const list = areas.map(sanitizeArea).filter((a) => a.points?.length >= 3);
  const finals = list.filter((a) => a.type === "final");
  const center = (a) => {
    const r = orientedRect(a.points);
    return { x: r.cx, z: r.cz };
  };
  const links = [];
  for (const a of list) {
    if (!["fuselage", "wing", "tail"].includes(a.type)) continue;
    const c = center(a);
    const target = finals
      .filter((f) => f.aircraft === a.aircraft)
      .sort((f, g) => Math.hypot(center(f).x - c.x, center(f).z - c.z) - Math.hypot(center(g).x - c.x, center(g).z - c.z))[0];
    if (target) links.push({ from: a.id, to: target.id, aircraft: a.aircraft, color: AREA_TYPES[a.type].color });
  }
  return links;
}

// Linhas de abastecimento: de cada kanban que tem material da estação até a estação.
// [{ kanbanId, codes: [{ code, status, qty }], status }] — status do kanban = o melhor entre os materiais
// (verde se algum tem estoque); kanbans onde o material acabou também aparecem (linha vermelha).
export function supplyLinks(rawArea, kanbans = [], now = Date.now()) {
  const area = sanitizeArea(rawArea);
  if (!hasModel(area.type)) return [];
  const byKanban = new Map();
  for (const code of area.materials || []) {
    const state = materialState(code, kanbans, now);
    for (const w of state.where) {
      if (!byKanban.has(w.kanbanId)) byKanban.set(w.kanbanId, []);
      byKanban.get(w.kanbanId).push({ code, status: w.status, qty: w.qty });
    }
  }
  const order = (s) => STOCK_STATUS[s]?.order ?? 9;
  return [...byKanban]
    .map(([kanbanId, codes]) => ({ kanbanId, codes, status: codes.map((c) => c.status).sort((a, b) => order(a) - order(b))[0] }))
    .sort((a, b) => a.kanbanId.localeCompare(b.kanbanId));
}
