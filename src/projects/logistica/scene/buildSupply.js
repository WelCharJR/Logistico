import * as THREE from "three";
import { textTexture } from "./theme.js";
import { CONTENTS_LAYER } from "./binModel.js";

// Linhas de abastecimento (área selecionada): arco saindo do topo de cada kanban que tem material da
// estação até a estação, com traços correndo kanban -> estação, na cor da situação do estoque.
//   buildSupply(links, { from: id -> {x,z}, to: {x,z}, reducedMotion }) -> { group, update(time), dispose() }

export const SUPPLY_COLORS = { full: "#22a35a", ok: "#22a35a", low: "#f2b51d", unknown: "#98a2b3", out: "#e5484d" };
const RACK_TOP = 4.7;

let dashImage = null;
function dashes() {
  if (!dashImage) {
    dashImage = document.createElement("canvas");
    dashImage.width = 64;
    dashImage.height = 8;
    const ctx = dashImage.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 34, 8); // traço; o resto fica transparente
  }
  const texture = new THREE.CanvasTexture(dashImage);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildSupply(links, { from, to, reducedMotion = false }) {
  const group = new THREE.Group();
  const textures = [];
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  for (const link of links) {
    const k = from(link.kanbanId);
    if (!k) continue;
    const color = SUPPLY_COLORS[link.status] || SUPPLY_COLORS.unknown;
    const a = new THREE.Vector3(k.x, RACK_TOP, k.z);
    const b = new THREE.Vector3(to.x, 0.25, to.z);
    const dist = a.distanceTo(b);
    // arco: o meio sobe mais quanto mais longe for o kanban
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(RACK_TOP + 1.5 + dist * 0.18);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const length = curve.getLength();
    // base fraca contínua + traços animados por cima
    const base = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 48, 0.05, 6)), keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false })));
    const texture = dashes();
    texture.repeat.set(Math.max(1, length / 1.1), 1);
    textures.push(texture);
    const flow = new THREE.Mesh(
      keep(new THREE.TubeGeometry(curve, 64, 0.085, 8)),
      keep(new THREE.MeshBasicMaterial({ color, map: texture, transparent: true, depthWrite: false })),
    );
    disposables.push(texture);
    // bolinha no topo do kanban e anel no chão da estação
    const dot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 16, 10)), keep(new THREE.MeshBasicMaterial({ color })));
    dot.position.copy(a);
    // etiqueta com os códigos que esse kanban fornece para a estação
    const shown = link.codes.slice(0, 2).map((c) => c.code);
    const text = shown.join(" · ") + (link.codes.length > 2 ? " +" + (link.codes.length - 2) : "");
    const labelTex = keep(textTexture(text, { width: 640, height: 112, bg: color, fg: "#ffffff", font: "750 46px Inter, system-ui, sans-serif", radius: 56 }));
    const label = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true })));
    label.position.set(k.x, RACK_TOP + 0.75, k.z);
    label.scale.set(3.2, 0.56, 1);
    label.renderOrder = 6;
    group.add(base, flow, dot, label);
  }
  if (group.children.length) {
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.5, 0.75, 32)), keep(new THREE.MeshBasicMaterial({ color: "#2f55e4", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(to.x, 0.12, to.z);
    group.add(ring);
  }
  group.traverse((o) => o.layers.set(CONTENTS_LAYER)); // visível, mas fora do clique
  return {
    group,
    update(time) {
      if (reducedMotion) return;
      for (const t of textures) t.offset.x = -(time / 1000) * 1.4; // traços indo do kanban para a estação
    },
    dispose() {
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
