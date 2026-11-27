// Estações de montagem dentro das áreas desenhadas. Sem Three.js, para testar no Node.
//
//   const area = sanitizeArea(raw)              // tipo, aeronave e etapa com valores válidos
//   const rect = orientedRect(area.points)      // retângulo justo da área: centro, direção, comprimento e largura
//   const fit = stationFit(area)                // { rect, scale, footprint } — onde e em que escala fica a estação

export const AREA_TYPES = {
  fuselage: { label: "Fuselagem", color: "#3d6bff", short: "FUSELAGEM" },
  wing: { label: "Asa", color: "#1fa37a", short: "ASA" },
  tail: { label: "Cauda (empenagem)", color: "#8b5cf6", short: "CAUDA" },
  final: { label: "Montagem final", color: "#f08c1a", short: "MONTAGEM FINAL" },
  jigs: { label: "Depósito de gabaritos", color: "#64748b", short: "GABARITOS" },
  generic: { label: "Área genérica", color: "#3d6bff", short: "" },
};

export const AIRCRAFT = {
  kc390: { label: "KC-390" },
  tucano: { label: "Super Tucano" },
};

export const STAGES = {
  skeleton: { label: "Esqueleto", hint: "cavernas, longarinas e nervuras" },
  skin: { label: "Revestimento", hint: "painéis sendo fixados" },
  complete: { label: "Completa", hint: "peça pronta e pintada" },
};

// Tipos que têm gabarito + peça (os outros só ganham piso e placa).
export const hasModel = (type) => type in AREA_TYPES && type !== "generic";
export const hasStage = (type) => hasModel(type) && type !== "jigs";

export function sanitizeArea(area = {}) {
  return {
    ...area,
    type: AREA_TYPES[area.type] ? area.type : "generic",
    aircraft: AIRCRAFT[area.aircraft] ? area.aircraft : "kc390",
    stage: STAGES[area.stage] ? area.stage : "skeleton",
  };
}

// Espaço ocupado pela estação em tamanho real (m): comprimento (eixo da peça) x largura,
// já contando gabarito, plataforma de trabalho e corredor em volta.
export const FOOTPRINT = {
  kc390: { fuselage: [11, 10], wing: [19, 7.5], tail: [10, 13.5], final: [36, 36], jigs: [11, 7] },
  tucano: { fuselage: [11.5, 4.8], wing: [8.5, 5.5], tail: [5, 6], final: [13, 13], jigs: [7, 4.5] },
};

// Retângulo orientado de área mínima que contém o polígono (testa a direção de cada aresta).
// angle: direção do lado comprido (rad, no plano XZ, a partir de +x); length >= width.
export function orientedRect(points) {
  if (!points?.length) return { cx: 0, cz: 0, angle: 0, length: 0, width: 0 };
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const theta = Math.atan2(b.z - a.z, b.x - a.x);
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const p of points) {
      const u = p.x * cos + p.z * sin,
        v = -p.x * sin + p.z * cos;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area - 1e-9) best = { area, theta, minU, maxU, minV, maxV };
  }
  const { theta, minU, maxU, minV, maxV } = best;
  const cu = (minU + maxU) / 2,
    cv = (minV + maxV) / 2;
  let angle = theta,
    length = maxU - minU,
    width = maxV - minV;
  if (width > length) {
    angle += Math.PI / 2;
    [length, width] = [width, length];
  }
  // normaliza para (-90°, 90°]: a peça "olha" para o mesmo lado em áreas parecidas
  while (angle <= -Math.PI / 2) angle += Math.PI;
  while (angle > Math.PI / 2) angle -= Math.PI;
  return {
    cx: cu * Math.cos(theta) - cv * Math.sin(theta),
    cz: cu * Math.sin(theta) + cv * Math.cos(theta),
    angle,
    length,
    width,
  };
}

const MARGIN = 0.6; // folga entre a estação e a borda (faixa zebrada)

// Escala para a estação caber na área: nunca maior que o tamanho real; a montagem final do
// KC-390 (36 m) vira uma maquete numa área pequena.
// modelAngle: direção do eixo x do modelo. Peças mais largas que compridas (cauda em T) giram 90°
// para o lado maior da peça ficar no lado maior da área. footprint segue os eixos do modelo.
export function stationFit(rawArea) {
  const area = sanitizeArea(rawArea);
  const rect = orientedRect(area.points);
  if (!hasModel(area.type)) return { rect, scale: 0, footprint: [0, 0], modelAngle: rect.angle };
  const [needL, needW] = FOOTPRINT[area.aircraft][area.type];
  const turn = needW > needL;
  const alongLength = turn ? needW : needL,
    alongWidth = turn ? needL : needW;
  const scale = Math.max(0.12, Math.min(1, (rect.length - 2 * MARGIN) / alongLength, (rect.width - 2 * MARGIN) / alongWidth));
  return { rect, scale, footprint: [needL * scale, needW * scale], modelAngle: rect.angle + (turn ? Math.PI / 2 : 0) };
}

// Obstáculo para o GPS: o retângulo ocupado pela estação (pessoas contornam o gabarito).
// rotation em graus no mesmo sentido do rotation.y das estantes (a estação usa rotation.y = -angle).
export function stationObstacle(rawArea) {
  const fit = stationFit(rawArea);
  if (!fit.scale) return null;
  return {
    id: rawArea.id,
    x: fit.rect.cx,
    z: fit.rect.cz,
    rotation: (-fit.modelAngle * 180) / Math.PI,
    halfX: fit.footprint[0] / 2 - 0.3,
    halfZ: fit.footprint[1] / 2 - 0.3,
  };
}

// ---------------- posicionamento: tamanhos prontos, mover, girar, ajustar ----------------

const half = (v) => Math.ceil(v * 2) / 2; // arredonda para cima em 0,5 m

// Tamanho pronto de uma área para a estação (comprimento x largura, já com a folga da faixa).
export function presetSize(type, aircraft) {
  const need = FOOTPRINT[aircraft]?.[type];
  if (!need) return null;
  return [half(Math.max(...need) + 2 * MARGIN), half(Math.min(...need) + 2 * MARGIN)];
}

// Retângulo (4 vértices) com centro, comprimento, largura e direção (rad).
export function rectPoints(cx, cz, length, width, angle = 0) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const round = (v) => Math.round(v * 100) / 100;
  return [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ].map(([u, v]) => ({ x: round(cx + u * c - v * s), z: round(cz + u * s + v * c) }));
}

// Mantém o retângulo inteiro dentro do hangar (com 0,5 m das paredes).
export function clampCenter(cx, cz, length, width, angle, bounds, wall = 0.5) {
  const c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  const hx = (length * c + width * s) / 2,
    hz = (length * s + width * c) / 2;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(cx, bounds.minX + wall + hx, bounds.maxX - wall - hx),
    z: clamp(cz, bounds.minZ + wall + hz, bounds.maxZ - wall - hz),
  };
}

export const moveArea = (points, dx, dz) => points.map((p) => ({ x: Math.round((p.x + dx) * 100) / 100, z: Math.round((p.z + dz) * 100) / 100 }));

// Gira os vértices em torno do centro do retângulo da área (graus; positivo = sentido horário visto de cima).
export function rotateArea(points, degrees) {
  const { cx, cz } = orientedRect(points);
  const a = (degrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return points.map((p) => {
    const dx = p.x - cx,
      dz = p.z - cz;
    return { x: Math.round((cx + dx * c - dz * s) * 100) / 100, z: Math.round((cz + dx * s + dz * c) * 100) / 100 };
  });
}

// Refaz a área como retângulo no tamanho pronto da estação, no mesmo lugar e direção.
export function fitAreaToStation(rawArea) {
  const area = sanitizeArea(rawArea);
  const size = presetSize(area.type, area.aircraft);
  if (!size) return area.points;
  const { cx, cz, angle } = orientedRect(area.points);
  return rectPoints(cx, cz, size[0], size[1], angle);
}
