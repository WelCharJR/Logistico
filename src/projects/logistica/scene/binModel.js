import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Caixa bin de estante (como as de almoxarifado): aberta em cima, fundo inteiro, traseira alta,
// laterais inclinadas e frente baixa para pegar as peças. Medidas locais da caixa:
//   largura 0.44 (x), profundidade 0.60 (z, frente em +z), altura 0.40 atrás e 0.20 na frente.
// Cada posição da estante tem duas caixas costas com costas (frente e verso), a rackOffset do meio:
// a profundidade precisa caber em 2 x rackOffset para uma não entrar na outra.
export const BIN = {
  width: 0.44,
  depth: 0.6,
  rackOffset: 0.32,
  backHeight: 0.4,
  frontHeight: 0.2,
  wall: 0.022,
  bottom: -0.2, // y do fundo (o grupo da caixa fica no meio da altura traseira)
};

// Interior onde as peças ficam (com folga das paredes).
export const INSIDE = {
  minX: -BIN.width / 2 + BIN.wall + 0.012,
  maxX: BIN.width / 2 - BIN.wall - 0.012,
  minZ: -BIN.depth / 2 + BIN.wall + 0.012,
  maxZ: BIN.depth / 2 - BIN.wall - 0.012,
  floor: BIN.bottom + BIN.wall,
};

// Altura do monte de peças acima do fundo: mais alto atrás, mais baixo na frente (como na caixa real),
// sempre abaixo da borda da frente para nada "flutuar" para fora.
export const PILE = { front: 0.065, back: 0.15 };
export const pileHeight = (z) => {
  const back = (INSIDE.maxZ - z) / (INSIDE.maxZ - INSIDE.minZ);
  return PILE.front + (PILE.back - PILE.front) * Math.min(1, Math.max(0, back));
};

// Gerador pseudoaleatório com semente: o mesmo material gera sempre o mesmo monte.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tipo de peça mostrado na caixa: decidido pelo código do material (sempre o mesmo para o mesmo código).
export const CONTENT_KINDS = ["nuts", "bolts", "washers", "rivets"];
export function contentKind(code = "") {
  const text = String(code).toUpperCase();
  // Palavras óbvias primeiro; o resto vai pelo "hash" do código.
  if (/WASHER|ARRUELA|NAS1149|AN960|NAS1611/.test(text)) return "washers"; // NAS1611 = anel O-ring
  if (/NUT|PORCA|MS2104|AN365|AN310|HL7/.test(text)) return "nuts"; // HL70 = colar Hi-Lok
  if (/RIVET|REBITE|NAS1097|MS20470|MS20426|CR32|CL-/.test(text)) return "rivets"; // CL- = cleco
  if (/BOLT|PARAF|SCREW|NAS6|AN3|MS2469|MS2703|HL1|DR-/.test(text)) return "bolts"; // HL10 = pino Hi-Lok; DR- = broca
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CONTENT_KINDS[hash % CONTENT_KINDS.length];
}

// ---------- geometria ----------

// Prepara uma geometria para juntar com outras: sem índice, sem uv, com cor por vértice.
function prep(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute("uv");
  if (!g.attributes.normal) g.computeVertexNormals();
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

// Prisma a partir de um perfil lateral (pontos [z, y]) com a espessura em x centrada em `x`.
function sideProfile(points, thickness, x) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // perfil (u, v) -> (z, y); extrusão vai para -x
  g.translate(x + thickness / 2, 0, 0);
  return g;
}

const white = new THREE.Color("#ffffff");

const sharedGeometries = new Map();
const shared = (key, build) => {
  if (!sharedGeometries.has(key)) {
    const g = build();
    g.userData.shared = true;
    g.computeBoundingSphere();
    sharedGeometries.set(key, g);
  }
  return sharedGeometries.get(key);
};

// Corpo da caixa (uma geometria só, compartilhada por todas as caixas).
export function binGeometry() {
  return shared("bin", () => {
    const { width, depth, backHeight, frontHeight, wall, bottom } = BIN;
    const top = bottom + backHeight;
    const front = depth / 2, back = -depth / 2;
    const parts = [];
    const box = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      parts.push(g);
    };
    box(width, wall, depth, 0, bottom + wall / 2, 0); // fundo
    box(width, backHeight, wall, 0, bottom + backHeight / 2, back + wall / 2); // traseira
    box(width, frontHeight, wall, 0, bottom + frontHeight / 2, front - wall / 2); // frente baixa
    // Laterais: altas atrás, descendo em rampa até a frente.
    const profile = [
      [back, bottom],
      [front, bottom],
      [front, bottom + frontHeight],
      [front - 0.16, bottom + frontHeight + 0.02],
      [back + 0.14, top],
      [back, top],
    ];
    for (const side of [-1, 1]) parts.push(sideProfile(profile, wall, side * (width / 2 - wall / 2)));
    const merged = mergeGeometries(parts.map((p) => prep(p, white)));
    parts.forEach((p) => p.dispose());
    return merged;
  });
}

// Peças individuais (bem simples: poucas faces, já que são muitas).
const PIECES = {
  nuts: { count: 105, build: () => new THREE.CylinderGeometry(0.03, 0.03, 0.019, 6) },
  bolts: {
    count: 115,
    build: () => {
      const head = new THREE.CylinderGeometry(0.022, 0.022, 0.014, 6);
      head.translate(0, 0.047, 0);
      const shaft = new THREE.CylinderGeometry(0.009, 0.009, 0.085, 6, 1, true);
      const g = mergeGeometries([prep(head, white), prep(shaft, white)]);
      g.rotateX(Math.PI / 2); // deitado
      return g;
    },
  },
  washers: { count: 95, build: () => new THREE.TorusGeometry(0.023, 0.009, 3, 9).rotateX(Math.PI / 2) },
  rivets: {
    count: 165,
    build: () => {
      const head = new THREE.SphereGeometry(0.019, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
      head.translate(0, 0.026, 0);
      const shaft = new THREE.CylinderGeometry(0.0085, 0.0085, 0.055, 5, 1, true);
      const g = mergeGeometries([prep(head, white), prep(shaft, white)]);
      g.rotateX(Math.PI / 2);
      return g;
    },
  },
};

const METAL = { nuts: "#c7ccd3", bolts: "#b9c0c9", washers: "#d6dade", rivets: "#c9ccd0" };

// Monte de peças de um tipo: uma "cama" escura em rampa + as peças espalhadas por cima,
// tudo numa geometria só (uma chamada de desenho por caixa).
export function contentsGeometry(kind) {
  return shared("contents:" + kind, () => {
    const spec = PIECES[kind] || PIECES.nuts;
    const rand = seeded(CONTENT_KINDS.indexOf(kind) * 977 + 13);
    const base = new THREE.Color(METAL[kind] || METAL.nuts);
    const parts = [];
    // Cama: preenche o volume sob as peças para a caixa parecer cheia.
    const { minX, maxX, minZ, maxZ, floor } = INSIDE;
    const sink = 0.014;
    const bed = sideProfile(
      [
        [minZ, floor],
        [maxZ, floor],
        [maxZ, floor + pileHeight(maxZ) - sink],
        [minZ, floor + pileHeight(minZ) - sink],
      ],
      maxX - minX,
      0,
    );
    parts.push(prep(bed, base.clone().multiplyScalar(0.8)));
    const piece = prep(spec.build(), white);
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), euler = new THREE.Euler();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < spec.count; i++) {
      const z = minZ + 0.02 + rand() * (maxZ - minZ - 0.04);
      const x = minX + 0.02 + rand() * (maxX - minX - 0.04);
      // Peças afundam um pouco na cama em alturas diferentes: parece um monte, não uma camada.
      pos.set(x, floor + pileHeight(z) - rand() * 0.022, z);
      euler.set((rand() - 0.5) * 0.9, rand() * Math.PI * 2, (rand() - 0.5) * 0.9);
      quat.setFromEuler(euler);
      const s = 0.85 + rand() * 0.3;
      scale.set(s, s, s);
      matrix.compose(pos, quat, scale);
      const g = piece.clone().applyMatrix4(matrix);
      // Leve variação de brilho por peça (zincado novo x mais fosco).
      const shade = 0.82 + rand() * 0.28;
      const colors = g.attributes.color.array;
      for (let c = 0; c < colors.length; c += 3) colors.set([base.r * shade, base.g * shade, base.b * shade], c);
      parts.push(g);
    }
    piece.dispose();
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  });
}

export const contentsMaterial = (() => {
  let material = null;
  return () => {
    if (!material) {
      material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.38 });
      material.userData.shared = true;
    }
    return material;
  };
})();

// Peças ficam numa camada própria: aparecem na câmera, mas o clique/hover não testa milhares de faces.
export const CONTENTS_LAYER = 1;
