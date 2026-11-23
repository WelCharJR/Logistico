import * as THREE from "three";
import { COLORS } from "./theme.js";

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

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 3.15, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 2;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  pin.userData.ring = ring;
  pin.userData.disc = disc;
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
    ground.add(pin.userData.ring, pin.userData.disc);
    ground.visible = false;
    scene.add(ground);
    pins.set(id, { pin, ground, shownAt: 0 });
  });
  return {
    update(time, marked, camera) {
      pins.forEach((entry, id) => {
        const rack = kanbanMeshes.get(id);
        const on = marked.has(id);
        if (on && !entry.pin.visible) entry.shownAt = time;
        entry.pin.visible = entry.ground.visible = on;
        if (!on || !rack) return;
        entry.pin.position.set(rack.position.x, 4.5, rack.position.z);
        entry.ground.position.set(rack.position.x, 0.03, rack.position.z);
        const t = (time - entry.shownAt) / 1000;
        const drop = Math.min(1, t / 0.45);
        const ease = 1 - Math.pow(1 - drop, 3);
        entry.pin.userData.float.position.y = (1 - ease) * 1.6 + (reducedMotion ? 0 : Math.sin(t * 2.4) * 0.12);
        entry.pin.userData.float.rotation.y = Math.atan2(camera.position.x - rack.position.x, camera.position.z - rack.position.z);
        const pulse = reducedMotion ? 0.5 : (t * 0.6) % 1;
        entry.pin.userData.ring.scale.setScalar(0.75 + pulse * 0.35);
        entry.pin.userData.ring.material.opacity = 0.55 * (1 - pulse);
      });
    },
  };
}
