import * as THREE from "three";
import { ribbonGeometry } from "./buildNavigator.js";
import { orientedRect } from "./stationLayout.js";

// Fluxo da linha de montagem: setas animadas no chão saindo de cada estação (fuselagem, asa, cauda)
// até a montagem final da mesma aeronave. links: [{ from, to, color }] (veja flowLinks).

const textures = new Map();
function chevrons(color) {
  if (textures.has(color)) return textures.get(color);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(44, 12);
  ctx.lineTo(80, 32);
  ctx.lineTo(44, 52);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(color, texture);
  return texture;
}

// Ponto onde o segmento centro->alvo sai do retângulo da área (+ uma folga).
function exitPoint(rect, toward, gap = 0.8) {
  const dx = toward.x - rect.cx,
    dz = toward.z - rect.cz;
  const c = Math.cos(rect.angle),
    s = Math.sin(rect.angle);
  const u = dx * c + dz * s,
    v = -dx * s + dz * c;
  const t = Math.min(Math.abs(u) > 1e-6 ? rect.length / 2 / Math.abs(u) : Infinity, Math.abs(v) > 1e-6 ? rect.width / 2 / Math.abs(v) : Infinity, 1);
  const len = Math.hypot(dx, dz) || 1;
  const k = t + gap / len;
  return { x: rect.cx + dx * k, z: rect.cz + dz * k };
}

export function buildFlow(areas, links, { reducedMotion = false } = {}) {
  const group = new THREE.Group();
  const byId = new Map(areas.map((a) => [a.id, a]));
  const mats = [];
  for (const link of links) {
    const a = byId.get(link.from),
      b = byId.get(link.to);
    if (!a || !b) continue;
    const ra = orientedRect(a.points),
      rb = orientedRect(b.points);
    const start = exitPoint(ra, { x: rb.cx, z: rb.cz });
    const end = exitPoint(rb, { x: ra.cx, z: ra.cz });
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    if (len < 1.5) continue;
    // curva suave (Bézier quadrática) com o meio puxado para o lado
    const mid = { x: (start.x + end.x) / 2 - ((end.z - start.z) / len) * len * 0.12, z: (start.z + end.z) / 2 + ((end.x - start.x) / len) * len * 0.12 };
    const points = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return { x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * mid.x + t * t * end.x, z: (1 - t) ** 2 * start.z + 2 * (1 - t) * t * mid.z + t * t * end.z };
    });
    const material = new THREE.MeshBasicMaterial({ map: chevrons(link.color), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    material.userData.shared = true; // a cena não descarta: o próprio fluxo descarta (a textura é do cache por cor)
    const mesh = new THREE.Mesh(ribbonGeometry(points, 0.9, 0.075), material);
    mesh.renderOrder = 2;
    group.add(mesh);
    mats.push(material);
  }
  return {
    group,
    update(time) {
      if (reducedMotion) return;
      // as texturas são compartilhadas por cor: mover uma move todas da mesma cor (é o que queremos)
      for (const t of textures.values()) t.offset.x = -(time / 1000) * 0.9;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      mats.forEach((m) => m.dispose()); // a textura (por cor) fica no cache
    },
  };
}
