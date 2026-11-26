import { KEY, ROWS, COLS } from "../constants.js";
import { HALL_DEFAULT, sanitizeHall } from "../scene/hallSize.js";

export const emptySlots = () =>
  ROWS.flatMap((row) =>
    Array.from({ length: COLS }, (_, i) => ({
      id: `${row}-${i + 1}`,
      code: "",
      name: "",
      qty: 0,
      unit: "un",
    })),
  );
// Espalha cada item em caixas de até 10 unidades. checkedDaysAgo: dias desde a última conferência
// (null = nunca conferido); qty 0 cria uma caixa vazia com o material (acabou).
function makeSlots(items = []) {
  const slots = emptySlots();
  let next = 0;
  items.forEach((item) => {
    const days = item.checkedDaysAgo === undefined ? 1 : item.checkedDaysAgo;
    const checkedAt = days === null ? undefined : new Date(Date.now() - days * 86400000).toISOString();
    const fill = (qty) => {
      slots[next] = {
        ...slots[next],
        code: item.code || "",
        name: item.name || "",
        qty,
        unit: item.unit || "un",
        ...(checkedAt ? { checkedAt } : {}),
      };
      next++;
    };
    if (Number(item.qty) === 0) {
      if (next < slots.length) fill(0);
      return;
    }
    let remaining = Number(item.qty) || 10;
    while (remaining > 0 && next < slots.length) {
      const qty = Math.min(10, remaining);
      fill(qty);
      remaining -= qty;
    }
  });
  return slots;
}
const initial = {
  kanbans: [
    {
      id: "K-01",
      name: "Fixadores asa",
      x: -12,
      z: -5,
      items: [
        { code: "NAS1097", name: "Rebite escareado", qty: 240, unit: "un", checkedDaysAgo: 3 },
        { code: "MS21042", name: "Porca autofrenante", qty: 80, unit: "un", checkedDaysAgo: 1 },
      ],
    },
    {
      id: "K-02",
      name: "Montagem fuselagem",
      x: 0,
      z: 4,
      items: [
        { code: "NAS660", name: "Parafuso estrutural", qty: 115, unit: "un", checkedDaysAgo: 2 },
        { code: "MS21042", name: "Porca autofrenante", qty: 0, unit: "un", checkedDaysAgo: 2 },
      ],
    },
    {
      id: "K-03",
      name: "Ferramentas",
      x: 12,
      z: -5,
      items: [
        { code: "DR-48", name: "Broca 4.8 mm", qty: 12, unit: "un", checkedDaysAgo: 4 },
        { code: "MS21042", name: "Porca autofrenante", qty: 20, unit: "un", checkedDaysAgo: 60 },
      ],
    },
  ].map(({ items, ...kanban }) => ({ ...kanban, slots: makeSlots(items) })),
  areas: [],
  paths: [],
  hall: { ...HALL_DEFAULT },
};

export function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return initial;
    return {
      ...saved,
      kanbans: (saved.kanbans || []).map((k) => {
        const savedSlots = Array.isArray(k.slots)
          ? emptySlots().map((empty) => k.slots.find((slot) => slot.id === empty.id) || empty)
          : null;
        const { items, ...kanban } = k;
        return {
          ...kanban,
          slots: savedSlots?.some((slot) => slot.code) ? savedSlots : makeSlots(items || []),
        };
      }),
      areas: saved.areas || [],
      paths: saved.paths || [],
      hall: sanitizeHall(saved.hall),
    };
  } catch {
    return initial;
  }
}
