// Situação do estoque das caixas. Sem React nem Three.js, para testar no Node.
//
// Cada caixa com material pode ter:
//   qty        quantidade cadastrada
//   capacity   quanto cabe (padrão 10)
//   min        nível mínimo: igual ou abaixo disso está "acabando" (padrão 30% da capacidade)
//   checkedAt  data (ISO) da última conferência; sem ela, ou velha demais, não dá para confiar na qty
//
// Situações: full (cheia) · ok (com estoque) · low (acabando) · out (acabou) · unknown (sem informação)

export const STOCK = { staleDays: 30, capacity: 10, minRatio: 0.3 };
const DAY = 24 * 60 * 60 * 1000;

export const STATUS = {
  full: { label: "Cheio", tone: "green", order: 0 },
  ok: { label: "Com estoque", tone: "green", order: 1 },
  low: { label: "Acabando", tone: "amber", order: 2 },
  unknown: { label: "Sem informação", tone: "gray", order: 3 },
  out: { label: "Acabou", tone: "red", order: 4 },
};

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
export const capacityOf = (slot) => (num(slot?.capacity) > 0 ? num(slot.capacity) : STOCK.capacity);
export const minOf = (slot) => (num(slot?.min) >= 0 ? num(slot.min) : Math.ceil(capacityOf(slot) * STOCK.minRatio));

// Dias desde a data (inteiro, arredondado para baixo); null se nunca.
export function daysSince(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export function slotStatus(slot, now = Date.now()) {
  if (!slot?.code) return { status: "empty", days: null };
  const days = daysSince(slot.checkedAt, now);
  const qty = Math.max(0, Number(slot.qty) || 0);
  const capacity = capacityOf(slot),
    min = minOf(slot);
  const base = { qty, capacity, min, days };
  if (days === null || days > STOCK.staleDays) return { ...base, status: "unknown" };
  if (qty <= 0) return { ...base, status: "out" };
  if (qty <= min) return { ...base, status: "low" };
  if (qty >= capacity) return { ...base, status: "full" };
  return { ...base, status: "ok" };
}

// Situação de um produto dentro de um kanban, somando as caixas dele.
// Caixas sem conferência recente ficam de fora da soma (a qty delas pode não ser verdade)
// e aparecem em `staleBoxes`; se todas estão assim, o kanban fica "sem informação".
export function kanbanStock(slots, now = Date.now()) {
  const states = slots.map((s) => slotStatus(s, now)).filter((s) => s.status !== "empty");
  const fresh = states.filter((s) => s.status !== "unknown");
  const lastDays = states.reduce((min, s) => (s.days === null ? min : min === null ? s.days : Math.min(min, s.days)), null);
  const result = {
    boxes: states.length,
    staleBoxes: states.length - fresh.length,
    qty: fresh.reduce((sum, s) => sum + s.qty, 0),
    capacity: fresh.reduce((sum, s) => sum + s.capacity, 0),
    min: fresh.reduce((sum, s) => sum + s.min, 0),
    lastDays, // dias desde a conferência mais recente entre as caixas (null = nunca)
  };
  if (!fresh.length) return { ...result, status: "unknown" };
  if (result.qty <= 0) return { ...result, status: "out" };
  if (result.qty <= result.min) return { ...result, status: "low" };
  if (result.qty >= result.capacity) return { ...result, status: "full" };
  return { ...result, status: "ok" };
}

// Resultados da busca (por caixa) -> um item por kanban + produto, com a situação somada.
// Ordem: primeiro onde tem material, depois "sem informação", por último onde acabou.
export function groupResults(results, now = Date.now()) {
  const groups = new Map();
  for (const { kanban, slot } of results) {
    const key = kanban.id + "|" + slot.code;
    if (!groups.has(key)) groups.set(key, { kanban, code: slot.code, name: slot.name, unit: slot.unit, slots: [] });
    groups.get(key).slots.push(slot);
  }
  return [...groups.values()]
    .map((g) => {
      const stock = kanbanStock(g.slots, now);
      // Caixa para abrir ao escolher: uma com material conferido; senão, a primeira.
      const pick = g.slots.find((s) => ["full", "ok", "low"].includes(slotStatus(s, now).status)) || g.slots[0];
      return { ...g, stock, slot: pick };
    })
    .sort((a, b) => STATUS[a.stock.status].order - STATUS[b.stock.status].order || a.kanban.id.localeCompare(b.kanban.id));
}

// Contagem por situação: { full, ok, low, out, unknown }.
export function countStatus(items, pick = (i) => i.stock.status) {
  const counts = { full: 0, ok: 0, low: 0, out: 0, unknown: 0 };
  for (const item of items) counts[pick(item)]++;
  return counts;
}

// Alertas do hangar inteiro, por caixa.
export function stockAlerts(kanbans, now = Date.now()) {
  const states = kanbans.flatMap((k) => (k.slots || []).map((s) => slotStatus(s, now))).filter((s) => s.status !== "empty");
  return countStatus(states, (s) => s.status);
}

// Selo da barra de cima: alertas (acabando + acabou) com a cor da pior situação.
export function alertBadge({ low = 0, out = 0, unknown = 0 } = {}) {
  const n = low + out;
  if (n) return { label: n + (n === 1 ? " alerta" : " alertas"), tone: out ? "red" : "amber" };
  if (unknown) return { label: unknown + " sem conferência", tone: "gray" };
  return { label: "Estoque ok", tone: "ok" };
}

// Texto curto da última conferência.
export function checkedText(days) {
  if (days === null || days === undefined) return "nunca conferida";
  if (days === 0) return "conferida hoje";
  if (days === 1) return "conferida ontem";
  return "conferida há " + days + " dias";
}

// ---------- exemplo para a demonstração ----------

const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
const isoDaysAgo = (days, now) => new Date(now - days * DAY).toISOString();

// Espalha situações variadas pelas caixas com material (sempre as mesmas para o mesmo layout):
// ~45% em dia, ~15% acabando, ~10% acabou, ~30% sem conferência recente.
export function demoStock(kanbans, now = Date.now()) {
  return kanbans.map((k) => ({
    ...k,
    slots: (k.slots || []).map((slot) => {
      if (!slot.code) return slot;
      const h = hash(k.id + slot.id + slot.code);
      const roll = h % 100;
      const capacity = capacityOf(slot);
      const recent = isoDaysAgo((h >> 8) % 12, now);
      if (roll < 45) return { ...slot, qty: Math.max(minOf(slot) + 1, capacity - ((h >> 4) % 4)), checkedAt: recent };
      if (roll < 60) return { ...slot, qty: 1 + ((h >> 4) % Math.max(1, minOf(slot))), checkedAt: recent };
      if (roll < 70) return { ...slot, qty: 0, checkedAt: recent };
      return { ...slot, checkedAt: (h >> 4) % 3 ? isoDaysAgo(STOCK.staleDays + 5 + ((h >> 8) % 60), now) : undefined };
    }),
  }));
}
