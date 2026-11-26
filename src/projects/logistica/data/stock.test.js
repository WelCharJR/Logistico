import test from "node:test";
import assert from "node:assert/strict";
import { STOCK, checkedText, countStatus, daysSince, demoStock, groupResults, kanbanStock, minOf, slotStatus, stockAlerts } from "./stock.js";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const box = (qty, days, extra = {}) => ({ id: "A-1", code: "MS21042", name: "Porca", unit: "un", qty, checkedAt: days === null ? undefined : ago(days), ...extra });

test("situação da caixa", () => {
  assert.equal(slotStatus({ code: "" }, NOW).status, "empty");
  assert.equal(slotStatus(box(10, 2), NOW).status, "full");
  assert.equal(slotStatus(box(7, 2), NOW).status, "ok");
  assert.equal(slotStatus(box(3, 2), NOW).status, "low"); // mínimo padrão = 3 (30% de 10)
  assert.equal(slotStatus(box(0, 2), NOW).status, "out");
  assert.equal(slotStatus(box(8, null), NOW).status, "unknown"); // nunca conferida
  assert.equal(slotStatus(box(8, STOCK.staleDays + 1), NOW).status, "unknown"); // conferência velha
  assert.equal(slotStatus(box(8, STOCK.staleDays), NOW).status, "ok"); // no limite ainda vale
});

test("mínimo e capacidade configuráveis", () => {
  assert.equal(minOf({}), 3);
  assert.equal(minOf({ capacity: 50 }), 15);
  assert.equal(minOf({ min: 0 }), 0);
  assert.equal(slotStatus(box(5, 1, { min: 5 }), NOW).status, "low");
  assert.equal(slotStatus(box(20, 1, { capacity: 20 }), NOW).status, "full");
});

test("dias desde a conferência", () => {
  assert.equal(daysSince(undefined, NOW), null);
  assert.equal(daysSince(ago(3), NOW), 3);
  assert.equal(checkedText(null), "nunca conferida");
  assert.equal(checkedText(0), "conferida hoje");
  assert.equal(checkedText(45), "conferida há 45 dias");
});

test("kanban soma só as caixas conferidas", () => {
  const k = kanbanStock([box(10, 1), box(10, 1), box(10, 90)], NOW);
  assert.equal(k.status, "full");
  assert.equal(k.qty, 20);
  assert.equal(k.staleBoxes, 1);
  assert.equal(kanbanStock([box(0, 1), box(0, 4)], NOW).status, "out");
  assert.equal(kanbanStock([box(2, 1), box(1, 1)], NOW).status, "low");
  const unknown = kanbanStock([box(10, 60), box(10, null)], NOW);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.lastDays, 60);
});

test("busca: um item por kanban, com estoque primeiro e 'acabou' por último", () => {
  const k = (id) => ({ id, name: id });
  const results = [
    { kanban: k("K-02"), slot: box(0, 1, { id: "A-1" }) },
    { kanban: k("K-03"), slot: box(9, 80, { id: "B-2" }) },
    { kanban: k("K-01"), slot: box(10, 1, { id: "A-1" }) },
    { kanban: k("K-01"), slot: box(10, 2, { id: "A-2" }) },
  ];
  const groups = groupResults(results, NOW);
  assert.deepEqual(groups.map((g) => [g.kanban.id, g.stock.status]), [["K-01", "full"], ["K-03", "unknown"], ["K-02", "out"]]);
  assert.equal(groups[0].slots.length, 2);
  assert.deepEqual(countStatus(groups), { full: 1, ok: 0, low: 0, out: 1, unknown: 1 });
});

test("caixa escolhida para abrir é uma com material", () => {
  const k = { id: "K-01", name: "" };
  const [g] = groupResults([{ kanban: k, slot: box(0, 1, { id: "A-1" }) }, { kanban: k, slot: box(6, 1, { id: "A-2" }) }], NOW);
  assert.equal(g.slot.id, "A-2");
});

test("alertas do hangar contam por caixa", () => {
  const kanbans = [{ slots: [box(0, 1), box(2, 1), box(9, 1), box(9, null), { id: "B-1", code: "" }] }];
  assert.deepEqual(stockAlerts(kanbans, NOW), { full: 0, ok: 1, low: 1, out: 1, unknown: 1 });
});

test("exemplo de demonstração: variado, repetível e não mexe em caixas vazias", () => {
  const slots = Array.from({ length: 60 }, (_, i) => ({ id: "S" + i, code: "P" + (i % 5), qty: 10, unit: "un" }));
  slots.push({ id: "X", code: "", qty: 0 });
  const kanbans = [{ id: "K-01", slots }];
  const a = demoStock(kanbans, NOW),
    b = demoStock(kanbans, NOW);
  assert.deepEqual(a, b);
  const counts = stockAlerts(a, NOW);
  for (const status of ["full", "low", "out", "unknown"]) assert.ok(counts[status] + (status === "full" ? counts.ok : 0) > 0, status);
  assert.deepEqual(a[0].slots.at(-1), { id: "X", code: "", qty: 0 });
});
