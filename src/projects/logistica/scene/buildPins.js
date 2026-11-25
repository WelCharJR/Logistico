import * as THREE from "three";
import { COLORS } from "./theme.js";
import { pinEnter, pinExit } from "./pinMotion.js";

// Pino de localização: cabeça azul com miolo branco, ponta para baixo e anel pulsando no piso.
function makePin() {
  const pin = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.3, metalness: 0.1, emissive: COLORS.blue, emissiveIntensity: 0.15 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), blue);
  head.position.y = 1.05;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 24), blue);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.52;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  dot.position.set(0, 1.08, 0.32);
  dot.scale.z = 0.4;
  [head, tip].forEach((m) => (m.castShadow = true));
  const float = new THREE.Group();
  float.add(head, tip, dot);
  pin.add(float);
  pin.userData.float = float;
  pin.userData.dot = dot;

  // Dois anéis pulsando em contrafase + onda de choque mais fina no momento do pouso.
  const makeRing = (inner, outer) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    return ring;
  };
  const ring = makeRing(2.9, 3.15);
  const ring2 = makeRing(2.9, 3.15);
  const shock = makeRing(3.05, 3.2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  Object.assign(pin.userData, { ring, ring2, shock, disc });
  return pin;
}

// Um pino por kanban, todos ocultos até serem marcados (seleção ou resultado de busca).
export function createPins(scene, kanbanMeshes, { reducedMotion = false } = {}) {
  const pins = new Map();
  kanbanMeshes.forEach((_, id) => {
    const pin = makePin();
    pin.visible = false;
    scene.add(pin);
    const ground = new THREE.Group();
    ground.add(pin.userData.ring, pin.userData.ring2, pin.userData.shock, pin.userData.disc);
    ground.visible = false;
    scene.add(ground);
    pins.set(id, { pin, ground, shownAt: 0, hiddenAt: null });
  });
  return {
    update(time, marked, camera) {
      pins.forEach((entry, id) => {
        const rack = kanbanMeshes.get(id);
        const on = marked.has(id) && !!rack;
        const { pin, ground } = entry;
        const { float, ring, ring2, shock, disc } = pin.userData;
        if (on && (!pin.visible || entry.hiddenAt !== null)) {
          // Aparecendo (ou remarcado no meio da saída): começa a queda de novo.
          entry.shownAt = time;
          entry.hiddenAt = null;
        }
        if (!on) {
          if (!pin.visible) return;
          if (entry.hiddenAt === null) entry.hiddenAt = time;
          // Saída: o pino e o chão encolhem juntos até sumir.
          const scale = pinExit((time - entry.hiddenAt) / 1000, reducedMotion);
          if (scale <= 0) {
            pin.visible = ground.visible = false;
            entry.hiddenAt = null;
            return;
          }
          pin.scale.setScalar(scale);
          ground.scale.setScalar(scale);
          return;
        }
        pin.visible = ground.visible = true;
        pin.scale.setScalar(1);
        ground.scale.setScalar(1);
        pin.position.set(rack.position.x, 4.5, rack.position.z);
        ground.position.set(rack.position.x, 0.03, rack.position.z);
        const pose = pinEnter((time - entry.shownAt) / 1000, reducedMotion);
        float.position.y = pose.y;
        float.scale.set(1 + pose.squash * 0.6, 1 - pose.squash, 1 + pose.squash * 0.6);
        float.rotation.y = Math.atan2(camera.position.x - rack.position.x, camera.position.z - rack.position.z);
        ring.scale.setScalar(pose.ringScale);
        ring.material.opacity = pose.ringOpacity;
        ring2.scale.setScalar(pose.ring2Scale);
        ring2.material.opacity = pose.ring2Opacity;
        shock.scale.setScalar(pose.shockScale);
        shock.material.opacity = pose.shockOpacity;
        shock.visible = pose.shockOpacity > 0;
        disc.material.opacity = 0.08 * Math.min(1, (time - entry.shownAt) / 400);
      });
    },
  };
}
