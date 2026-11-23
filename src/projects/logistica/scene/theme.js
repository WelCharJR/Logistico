import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Paleta da cena: tons claros, azul como cor de destaque e amarelo para segurança.
export const COLORS = {
  sky: "#e4ebf5",
  ground: "#d7dfea",
  floor: "#eceff5",
  floorEdge: "#cfd7e3",
  wall: "#f7f8fb",
  wallRib: "#e3e8f0",
  steel: "#c9d1dd",
  blue: "#2f55e4",
  blueDark: "#1f3aa8",
  blueSoft: "#d6def5",
  yellow: "#f2b51d",
  ink: "#1d2433",
  rubber: "#2a2f3a",
  cardboard: "#d6a566",
  cardboardDark: "#bf8c4f",
  wood: "#caa577",
  glass: "#9fb6e8",
  leaf: "#7cc27a",
  green: "#2fb36b",
};

// Materiais compartilhados: criados sob demanda e reaproveitados em toda a cena.
const materialCache = new Map();
export function mat(color, { roughness = 0.6, metalness = 0, ...rest } = {}) {
  const key = color + "|" + roughness + "|" + metalness + "|" + JSON.stringify(rest);
  if (!materialCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });
    m.userData.shared = true;
    materialCache.set(key, m);
  }
  return materialCache.get(key);
}

const geometryCache = new Map();
// Caixa com cantos arredondados (raio limitado ao menor lado) e geometria compartilhada.
export function roundedBox(w, h, d, radius = 0.06, segments = 2) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
  const key = [w, h, d, r, segments].join("|");
  if (!geometryCache.has(key)) {
    const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, segments, r) : new THREE.BoxGeometry(w, h, d);
    g.userData.shared = true;
    geometryCache.set(key, g);
  }
  return geometryCache.get(key);
}

export function addBox(parent, w, h, d, x, y, z, material, { radius = 0.04, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(roundedBox(w, h, d, radius), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

// Libera da GPU tudo o que não é compartilhado (geometrias, materiais e texturas criados por objeto).
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      if (m.userData.shared) return;
      m.map?.dispose();
      m.dispose();
    });
  });
}

// Textura de texto desenhada em canvas (placas, letreiros).
export function textTexture(text, { width = 512, height = 128, bg = COLORS.blue, fg = "#ffffff", font = "700 64px Inter, system-ui, sans-serif", radius = 18 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 2, width - 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
