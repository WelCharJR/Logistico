import * as THREE from "three";

// Caixa envolvente de uma estante kanban no espaço local (inclui a placa no topo).
export const RACK_BOX = new THREE.Box3(new THREE.Vector3(-2.8, 0, -0.85), new THREE.Vector3(2.8, 4.5, 0.85));

const ray = new THREE.Ray();
const local = new THREE.Ray();
const inverse = new THREE.Matrix4();
const hit = new THREE.Vector3();
const point = new THREE.Vector3();
const axis = new THREE.Vector3();

// Pontos que precisam ficar visíveis num alvo: estante (centro e pontas) ou um ponto qualquer.
function samplePoints(target) {
  if (target.isVector3) return [target.clone().setY(Math.max(target.y, 1.5))];
  axis.set(1, 0, 0).applyQuaternion(target.quaternion);
  const center = target.position.clone().setY(1.8);
  return [center, center.clone().addScaledVector(axis, 2.2), center.clone().addScaledVector(axis, -2.2)];
}

// Devolve os ids das estantes que ficam na frente de algum alvo, vistas da câmera.
// `targets`: estantes (THREE.Object3D com userData.id) ou pontos (THREE.Vector3).
export function findOccluders(cameraPosition, targets, racks) {
  const occluders = new Set();
  targets.forEach((target) => {
    const ownerIds = new Set(target.isVector3 ? [] : [target.userData.id]);
    const samples = samplePoints(target);
    if (target.isVector3) {
      // Um ponto dentro de uma estante pertence a ela: essa não deve sumir.
      racks.forEach((r) => {
        inverse.copy(r.matrixWorld).invert();
        if (RACK_BOX.containsPoint(point.copy(target).setY(1).applyMatrix4(inverse))) ownerIds.add(r.userData.id);
      });
    }
    samples.forEach((sample) => {
      const distance = cameraPosition.distanceTo(sample);
      ray.set(cameraPosition, sample.clone().sub(cameraPosition).normalize());
      racks.forEach((r) => {
        const id = r.userData.id;
        if (ownerIds.has(id) || occluders.has(id)) return;
        inverse.copy(r.matrixWorld).invert();
        local.copy(ray).applyMatrix4(inverse);
        if (local.intersectBox(RACK_BOX, hit) && hit.applyMatrix4(r.matrixWorld).distanceTo(cameraPosition) < distance - 0.3) occluders.add(id);
      });
    });
  });
  return occluders;
}

// Esmaece uma estante trocando os materiais por cópias transparentes (criadas uma vez por estante).
// alpha = 1 devolve os materiais originais.
export function setRackOpacity(group, alpha) {
  const clones = (group.userData.fadeClones ??= new Map());
  group.traverse((o) => {
    if (!o.isMesh) return;
    const base = (o.userData.baseMat ??= o.material);
    if (alpha >= 0.999) {
      o.material = base;
      return;
    }
    let faded = clones.get(base);
    if (!faded) {
      faded = base.clone();
      faded.transparent = true;
      faded.depthWrite = false;
      clones.set(base, faded);
    }
    faded.opacity = alpha * (base.transparent ? base.opacity : 1);
    o.material = faded;
  });
}

export function disposeFadeClones(group) {
  group.userData.fadeClones?.forEach((m) => m.dispose());
  group.userData.fadeClones?.clear();
}
