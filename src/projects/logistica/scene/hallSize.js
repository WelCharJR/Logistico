// Tamanho do galpão: valores padrão, limites, predefinições e geometria derivada (bordas e docas).
export const HALL_DEFAULT = { width: 60, depth: 44 };
export const HALL_LIMITS = { width: [40, 160], depth: [30, 120] };
export const HALL_PRESETS = [
  { label: "Compacto", width: 60, depth: 44 },
  { label: "Médio", width: 80, depth: 56 },
  { label: "Grande", width: 100, depth: 70 },
  { label: "Extra", width: 140, depth: 90 },
];

const even = (n) => Math.ceil(n / 2) * 2;
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

export function sanitizeHall(hall) {
  const pick = (value, key) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(even(n), HALL_LIMITS[key]) : HALL_DEFAULT[key];
  };
  return { width: pick(hall?.width, "width"), depth: pick(hall?.depth, "depth") };
}

// Bordas centradas na origem e posição (x) das docas na parede do fundo.
// As docas ficam a cada 8 m a partir dos cantos, deixando o centro livre para o letreiro.
export function hallBounds(hall) {
  const { width, depth } = sanitizeHall(hall);
  const half = width / 2;
  const side = [];
  for (let x = half - 8; x > 9; x -= 8) side.push(x);
  const docks = [...side.map((x) => -x), ...side.slice().reverse()].sort((a, b) => a - b);
  return { width, depth, minX: -half, maxX: half, minZ: -depth / 2, maxZ: depth / 2, docks };
}

// Menor galpão que ainda contém tudo o que foi posicionado (com folga para a estante e o contorno).
export function minHallFor(layout) {
  let x = 0,
    z = 0;
  layout.kanbans.forEach((k) => {
    x = Math.max(x, Math.abs(k.x) + 3);
    z = Math.max(z, Math.abs(k.z) + 3);
  });
  [...layout.areas, ...layout.paths].forEach((shape) =>
    shape.points.forEach((p) => {
      x = Math.max(x, Math.abs(p.x) + 1);
      z = Math.max(z, Math.abs(p.z) + 1);
    }),
  );
  return {
    width: clamp(even(2 * x), HALL_LIMITS.width),
    depth: clamp(even(2 * z), HALL_LIMITS.depth),
  };
}
