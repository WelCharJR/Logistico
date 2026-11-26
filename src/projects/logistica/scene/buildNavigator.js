import * as THREE from "three";
import { COLORS } from "./theme.js";
import { CONTENTS_LAYER } from "./binModel.js";

// "GPS" no chão do hangar: faixa da rota com setas correndo até o destino e o ponto "você".
//   const nav = createNavigator(scene, { reducedMotion })
//   nav.setRoute(segments | null)    -> desenha (ou apaga) a rota: [{ onRoad, points }]
//                                       na estrada = faixa azul cheia; caminho criado = faixa vazada tracejada
//   nav.setMe({ x, z, heading } | null)
//   nav.update(time, camera)          -> a cada quadro: anima setas e o halo
//   nav.dispose()
// Tudo fica na camada CONTENTS_LAYER: aparece na câmera, mas não entra no clique/hover.

const ROUTE_Y = 0.09;
const ROUTE_WIDTH = 0.62;
const ARROW_EVERY = 1.1; // metros entre setas

function arrowTexture(trail = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (trail) {
    // Caminho criado: fundo quase transparente com bordas tracejadas.
    ctx.fillStyle = "rgba(47, 85, 228, 0.12)";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(0, 0, 64, 6);
    ctx.fillRect(0, 58, 64, 6);
  } else {
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(0, 0, 128, 64);
  }
  // seta ">" apontando para +u (sentido da caminhada): branca na estrada, azul no caminho criado
  ctx.strokeStyle = trail ? COLORS.blue : "#ffffff";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(46, 14);
  ctx.lineTo(78, 32);
  ctx.lineTo(46, 50);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Faixa ao longo da polilinha: u = metros percorridos / ARROW_EVERY, v = 0..1 na largura.
// Nas curvas usa a bissetriz (miter) limitada, para a faixa não estrangular nem estourar.
export function ribbonGeometry(points, width, y = ROUTE_Y) {
  const positions = [],
    uvs = [],
    indices = [];
  let travelled = 0;
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    const inX = p.x - prev.x,
      inZ = p.z - prev.z,
      outX = next.x - p.x,
      outZ = next.z - p.z;
    const inLen = Math.hypot(inX, inZ) || 1,
      outLen = Math.hypot(outX, outZ) || 1;
    // normais (à esquerda) dos dois trechos
    const n1x = i ? -inZ / inLen : -outZ / outLen,
      n1z = i ? inX / inLen : outX / outLen;
    const n2x = i < points.length - 1 ? -outZ / outLen : n1x,
      n2z = i < points.length - 1 ? outX / outLen : n1z;
    let mx = n1x + n2x,
      mz = n1z + n2z;
    const mLen = Math.hypot(mx, mz) || 1;
    mx /= mLen;
    mz /= mLen;
    const scale = Math.min(2, 1 / Math.max(0.5, mx * n1x + mz * n1z));
    const half = (width / 2) * scale;
    if (i) travelled += inLen;
    positions.push(p.x + mx * half, y, p.z + mz * half, p.x - mx * half, y, p.z - mz * half);
    uvs.push(travelled / ARROW_EVERY, 1, travelled / ARROW_EVERY, 0);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const onLayer = (object) => {
  object.traverse((o) => o.layers.set(CONTENTS_LAYER));
  return object;
};

export function createNavigator(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = "navigator";
  scene.add(root);

  // ---- rota ----
  const texture = arrowTexture(false);
  const trailTexture = arrowTexture(true);
  const routeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const trailMat = new THREE.MeshBasicMaterial({ map: trailTexture, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const haloMat = new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  // Cada trecho: { mesh, halo, from, to } com from/to = fração da rota (para "desenhar" em sequência).
  let pieces = [],
    routeShownAt = 0,
    routeLength = 1;
  const goalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 40),
    new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  );
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.visible = false;
  root.add(goalRing);

  // ---- você ----
  const me = new THREE.Group();
  me.visible = false;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), new THREE.MeshBasicMaterial({ color: "#1f5cff" }));
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 32), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: "#1f5cff", transparent: true, opacity: 0.18, depthWrite: false }),
  );
  // Cone de direção (como o "farol" do GPS do celular).
  const beamShape = new THREE.Shape();
  beamShape.moveTo(0, 0.42);
  beamShape.absarc(0, 0, 1.25, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, false);
  beamShape.lineTo(0, 0.42);
  const beam = new THREE.Mesh(
    new THREE.ShapeGeometry(beamShape, 12),
    new THREE.MeshBasicMaterial({ color: "#1f5cff", transparent: true, opacity: 0.28, depthWrite: false }),
  );
  for (const [mesh, y] of [[halo, 0.1], [beam, 0.105], [rim, 0.11], [dot, 0.115]]) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = 3;
  }
  // O cone gira junto com a direção: fica num grupo próprio.
  const beamPivot = new THREE.Group();
  beamPivot.add(beam);
  beam.rotation.z = Math.PI; // ShapeGeometry aponta para +y do shape -> -z do mundo; vira para +z
  me.add(halo, beamPivot, rim, dot);
  // Marcador alto para achar o ponto de longe.
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), new THREE.MeshBasicMaterial({ color: "#1f5cff" }));
  stick.position.y = 0.75;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshStandardMaterial({ color: "#1f5cff", roughness: 0.3, emissive: "#1f5cff", emissiveIntensity: 0.25 }));
  ball.position.y = 1.5;
  me.add(stick, ball);
  root.add(onLayer(me));
  onLayer(goalRing);

  let meShownAt = 0;
  const clearRoute = () => {
    for (const { mesh, halo } of pieces)
      for (const m of [mesh, halo]) {
        root.remove(m);
        m.geometry.dispose();
      }
    pieces = [];
    goalRing.visible = false;
  };
  const lengthOf = (points) => points.reduce((s, p, i) => (i ? s + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) : 0), 0);

  return {
    setRoute(segments, time = performance.now()) {
      clearRoute();
      const parts = (segments || []).filter((s) => s.points?.length >= 2);
      if (!parts.length) return;
      routeLength = parts.reduce((sum, s) => sum + lengthOf(s.points), 0) || 1;
      let walked = 0;
      for (const s of parts) {
        const len = lengthOf(s.points);
        if (len < 0.01) continue;
        const mesh = new THREE.Mesh(ribbonGeometry(s.points, ROUTE_WIDTH), s.onRoad ? routeMat : trailMat);
        const halo = new THREE.Mesh(ribbonGeometry(s.points, ROUTE_WIDTH * (s.onRoad ? 2.1 : 1.6), ROUTE_Y - 0.01), haloMat);
        mesh.renderOrder = halo.renderOrder = 2;
        root.add(onLayer(halo), onLayer(mesh));
        pieces.push({ mesh, halo, from: walked / routeLength, to: (walked + len) / routeLength });
        walked += len;
      }
      // a faixa "se desenha" do início ao fim
      routeShownAt = time;
      const lastPoints = parts[parts.length - 1].points;
      const end = lastPoints[lastPoints.length - 1];
      goalRing.position.set(end.x, 0.1, end.z);
      goalRing.visible = true;
    },

    setMe(pose) {
      if (!pose) {
        me.visible = false;
        return;
      }
      if (!me.visible) meShownAt = performance.now();
      me.visible = true;
      me.position.set(pose.x, 0, pose.z);
      if (pose.heading !== undefined) beamPivot.rotation.y = pose.heading;
    },

    update(time, camera) {
      const t = time / 1000;
      if (pieces.length) {
        if (!reducedMotion) texture.offset.x = trailTexture.offset.x = -t * 1.2; // setas correm em direção ao destino
        // revelação: cada trecho cresce na sua vez, do início ao fim da rota
        const reveal = reducedMotion ? 1 : Math.min(1, (time - routeShownAt) / Math.min(1100, 250 + routeLength * 25));
        for (const { mesh, halo, from, to } of pieces) {
          const local = Math.min(1, Math.max(0, (reveal - from) / Math.max(1e-6, to - from)));
          const count = mesh.geometry.index.count;
          const visible = Math.ceil((count / 6) * local) * 6;
          mesh.geometry.setDrawRange(0, visible);
          halo.geometry.setDrawRange(0, visible);
        }
        const pulse = reducedMotion ? 0.5 : (t * 0.8) % 1;
        goalRing.scale.setScalar(0.8 + pulse * 0.6);
        goalRing.material.opacity = 0.65 * (1 - pulse) * (reveal >= 1 ? 1 : 0);
      }
      if (me.visible) {
        // De longe o ponto cresce um pouco para continuar visível.
        const far = camera ? Math.min(2.4, Math.max(1, camera.position.distanceTo(me.position) / 26)) : 1;
        const appear = reducedMotion ? 1 : Math.min(1, (time - meShownAt) / 300);
        me.scale.setScalar(far * (0.6 + 0.4 * appear));
        const pulse = reducedMotion ? 0.4 : (t * 0.9) % 1;
        halo.scale.setScalar(0.6 + pulse * 1.2);
        halo.material.opacity = 0.28 * (1 - pulse);
        ball.position.y = 1.5 + (reducedMotion ? 0 : Math.sin(t * 2.4) * 0.06);
      }
    },

    dispose() {
      clearRoute();
      scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && o.material !== routeMat && o.material !== trailMat && o.material !== haloMat) o.material.dispose?.();
      });
      routeMat.dispose();
      trailMat.dispose();
      haloMat.dispose();
      texture.dispose();
      trailTexture.dispose();
    },
  };
}
