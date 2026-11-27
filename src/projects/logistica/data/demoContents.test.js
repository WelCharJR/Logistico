import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, SHOWCASE, demoContents, demoHangar, pickMaterials } from "./demoContents.js";
import { groupResults } from "./stock.js";
import { contentKind } from "../scene/binModel.js";

const kanbans = [
  { id: "K-01", name: "Fixadores asa", x: -12, z: -5, rotation: 15, slots: [] },
  { id: "K-02", name: "Montagem fuselagem", x: 0, z: 4, slots: [] },
  { id: "K-03", name: "Ferramentas", x: 12, z: -5, slots: [] },
  { id: "K-04", name: "Kanban 4", x: 20, z: 10, slots: [] },
];

test("estrutura dos kanbans, repetível e com ocupação realista", () => {
  // mantém posição/nome e sempre 60 caixas com ids A-1..F-10
  {
    const out = demoContents(kanbans);
    out.forEach((k, i) => {
      assert.equal(k.id, kanbans[i].id);
      assert.equal(k.rotation, kanbans[i].rotation);
      assert.equal(k.slots.length, 60);
      assert.equal(k.slots[0].id, "A-1");
      assert.equal(k.slots[59].id, "F-10");
    });
  }
  // repetível e com ocupação realista
  {
    assert.deepEqual(demoContents(kanbans), demoContents(kanbans));
    for (const k of demoContents(kanbans)) {
      const filled = k.slots.filter((s) => s.code).length;
      assert.ok(filled >= 8 && filled <= 60, k.id + ": " + filled);
      for (const s of k.slots.filter((s) => s.code)) assert.ok(CATALOG.some((m) => m.code === s.code && m.name === s.name));
    }
  }
});

test("materiais: nome do kanban puxa o tipo, há repetidos e todos têm peça definida", () => {
  // nome do kanban puxa o tipo de material
  {
    const tools = demoContents(kanbans).find((k) => k.id === "K-03");
    const codes = new Set(tools.slots.filter((s) => s.code).map((s) => s.code));
    assert.ok([...codes].some((c) => c.startsWith("DR-") || c.startsWith("CL-")), [...codes].join(","));
    let i = 0;
    const first = pickMaterials({ name: "Ferramentas" }, 3, () => (i++ % 7) / 7);
    assert.ok(first.every((m) => m.tags.includes("ferr")));
  }
  // algum material aparece em mais de um kanban (para a busca)
  {
    const where = new Map();
    for (const k of demoContents(kanbans)) for (const s of k.slots) if (s.code) where.set(s.code, new Set([...(where.get(s.code) || []), k.id]));
    assert.ok([...where.values()].some((ids) => ids.size > 1));
  }
  // todo material do catálogo tem um tipo de peça definido (não cai no sorteio)
  {
    const sorteio = CATALOG.filter((m) => !/NAS1149|AN960|NAS1611|MS2104|AN365|AN310|HL7|NAS1097|MS20470|MS20426|CR32|CL-|NAS6|AN3|MS2469|MS2703|HL1|DR-/.test(m.code));
    assert.deepEqual(sorteio, []);
    assert.equal(contentKind("NAS1611-012"), "washers");
    assert.equal(contentKind("HL70-6"), "nuts");
    assert.equal(contentKind("HL10-6-4"), "bolts");
    assert.equal(contentKind("CL-532"), "rivets");
  }
});

test("material de vitrine: em todos os kanbans, cada um numa situação", () => {
  const out = demoHangar(kanbans, Date.parse("2026-11-26T12:00:00Z"));
  const results = out.flatMap((k) => k.slots.filter((s) => s.code === SHOWCASE.code).map((slot) => ({ kanban: k, slot })));
  const byKanban = Object.fromEntries(groupResults(results, Date.parse("2026-11-26T12:00:00Z")).map((g) => [g.kanban.id, g.stock.status]));
  assert.deepEqual(byKanban, { "K-01": "full", "K-02": "out", "K-03": "unknown", "K-04": "low" });
});
