// Conteúdo de exemplo para os kanbans (demonstração). Sem React nem Three.js, para testar no Node.
//
//   demoContents(kanbans) -> mesmos kanbans, com as 60 caixas preenchidas por materiais aeronáuticos
//
// Sempre o mesmo resultado para o mesmo kanban (a "sorte" vem do id). O nome do kanban puxa o
// tipo de material: "Ferramentas" ganha brocas e clecos, "Fixadores"/"asa" ganha rebites e porcas…
// Alguns materiais aparecem em mais de um kanban, para a busca mostrar situações diferentes.

import { emptySlots } from "./layout.js";
import { STOCK, demoStock } from "./stock.js";

// Material "de vitrine": aparece em todos os kanbans, cada um numa situação diferente
// (cheio, acabou, sem informação, acabando…), para a busca mostrar todos os avisos de uma vez.
export const SHOWCASE = { code: "MS21042L3", name: "Porca autofrenante" };
const SHOWCASE_CYCLE = ["full", "out", "unknown", "low"];

// tags: famílias que combinam com palavras do nome do kanban.
export const CATALOG = [
  { code: "NAS1097AD4-4", name: "Rebite escareado 1/8\"", tags: ["fix", "asa", "rebite"] },
  { code: "MS20470AD4-5", name: "Rebite cabeça universal", tags: ["fix", "fus", "rebite"] },
  { code: "MS20426AD3-4", name: "Rebite escareado 100°", tags: ["fix", "asa", "rebite"] },
  { code: "CR3213-4-2", name: "Rebite cego Cherrymax", tags: ["fix", "fus", "rebite"] },
  { code: "MS21042L3", name: "Porca autofrenante", tags: ["fix", "asa", "fus", "porca"] },
  { code: "AN365-428A", name: "Porca autofrenante nylon", tags: ["fix", "fus", "porca"] },
  { code: "AN310-4", name: "Porca castelo", tags: ["fix", "trem", "porca"] },
  { code: "HL70-6", name: "Colar Hi-Lok", tags: ["fix", "asa", "fus"] },
  { code: "HL10-6-4", name: "Pino Hi-Lok", tags: ["fix", "asa", "fus", "paraf"] },
  { code: "NAS6203-4", name: "Parafuso hexagonal", tags: ["fus", "trem", "paraf"] },
  { code: "AN3-5A", name: "Parafuso estrutural", tags: ["fus", "trem", "paraf"] },
  { code: "MS24694-S50", name: "Parafuso escareado", tags: ["fus", "pain", "paraf"] },
  { code: "MS27039-1-08", name: "Parafuso cabeça panela", tags: ["pain", "elet", "paraf"] },
  { code: "NAS1149F0363P", name: "Arruela plana", tags: ["fix", "fus", "arru"] },
  { code: "AN960C10", name: "Arruela de aço", tags: ["fix", "trem", "arru"] },
  { code: "NAS1611-012", name: "Anel O-ring", tags: ["hidr", "trem", "vedac"] },
  { code: "DR-30", name: "Broca 3,0 mm", tags: ["ferr", "brocas"] },
  { code: "DR-41", name: "Broca 4,1 mm", tags: ["ferr", "brocas"] },
  { code: "DR-48", name: "Broca 4,8 mm", tags: ["ferr", "brocas"] },
  { code: "CL-332", name: "Cleco 3/32\"", tags: ["ferr", "fix"] },
  { code: "CL-532", name: "Cleco 5/32\"", tags: ["ferr", "fix"] },
];

// Palavra no nome do kanban -> tag do catálogo.
const NAME_HINTS = [
  [/ferrament|tool|broca/i, "ferr"],
  [/fixad|fasten|rebit/i, "fix"],
  [/asa|wing/i, "asa"],
  [/fusel|estrut|montag/i, "fus"],
  [/trem|pouso|gear/i, "trem"],
  [/hidr|vedac/i, "hidr"],
  [/painel|panel|acab/i, "pain"],
  [/eletr|cabl|chicote/i, "elet"],
];

const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
// Gerador com semente (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Materiais escolhidos para um kanban: primeiro os que combinam com o nome, depois os outros,
// cada grupo embaralhado pela semente do kanban.
export function pickMaterials(kanban, count, rand) {
  const wanted = NAME_HINTS.filter(([re]) => re.test(kanban.name || "")).map(([, tag]) => tag);
  const shuffle = (list) => list.map((item) => [rand(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  const matching = CATALOG.filter((m) => m.tags.some((t) => wanted.includes(t)));
  const others = CATALOG.filter((m) => !matching.includes(m));
  // Sem dica no nome: mistura geral de fixadores (o mais comum numa linha de montagem).
  const base = matching.length ? matching : CATALOG.filter((m) => m.tags.includes("fix"));
  return [...shuffle(base), ...shuffle(others.filter((m) => !base.includes(m)))].slice(0, count);
}

export function demoContents(kanbans) {
  return kanbans.map((k) => {
    const rand = seeded(hash("conteudo:" + k.id));
    const slots = emptySlots();
    // 4 a 7 materiais por kanban, cada um com 2 a 8 caixas: ocupa ~35–80% das 60 posições.
    const others = pickMaterials(k, 4 + Math.floor(rand() * 4), rand).filter((m) => m.code !== SHOWCASE.code);
    const materials = [CATALOG.find((m) => m.code === SHOWCASE.code), ...others];
    let next = 0;
    for (const m of materials) {
      const boxes = m.code === SHOWCASE.code ? 2 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 7);
      for (let b = 0; b < boxes && next < slots.length; b++, next++) {
        slots[next] = { ...slots[next], code: m.code, name: m.name, qty: 10, unit: "un" };
      }
      // Às vezes pula uma posição: kanban real tem buracos entre materiais.
      if (rand() < 0.35) next++;
    }
    return { ...k, slots };
  });
}

// Hangar de exemplo completo: conteúdo + situações de estoque espalhadas + o material de vitrine
// com uma situação diferente em cada kanban (na ordem da lista de kanbans).
export function demoHangar(kanbans, now = Date.now()) {
  const day = 24 * 60 * 60 * 1000;
  return demoStock(demoContents(kanbans), now).map((k, i) => {
    const scenario = SHOWCASE_CYCLE[i % SHOWCASE_CYCLE.length];
    const recent = new Date(now - (1 + (i % 3)) * day).toISOString();
    const stale = new Date(now - (STOCK.staleDays + 20 + i * 7) * day).toISOString();
    return {
      ...k,
      slots: k.slots.map((slot) => {
        if (slot.code !== SHOWCASE.code) return slot;
        if (scenario === "full") return { ...slot, qty: 10, checkedAt: recent };
        if (scenario === "out") return { ...slot, qty: 0, checkedAt: recent };
        if (scenario === "low") return { ...slot, qty: 1, checkedAt: recent };
        return { ...slot, qty: 10, checkedAt: stale };
      }),
    };
  });
}
