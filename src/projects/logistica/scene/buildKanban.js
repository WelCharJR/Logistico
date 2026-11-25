import * as THREE from "three";
import { COLS, ROWS } from "../constants.js";
import { COLORS, addBox, mat, roundedBox, textTexture } from "./theme.js";

// Materiais das caixas: azul forte = ocupada, azul claro = vazia.
export const binMaterials = {
  filled: mat("#3a63ef", { roughness: 0.42 }),
  empty: mat("#cfd9f3", { roughness: 0.6 }),
};

// Troca a cor das caixas conforme o conteúdo atual, sem recriar a cena.
export function paintBins(slotGroups, kanbans) {
  const byId = new Map(kanbans.map((k) => [k.id, k]));
  slotGroups.forEach((bin) => {
    const slot = byId.get(bin.userData.kanbanId)?.slots?.find((s) => s.id === bin.userData.slotId);
    const crate = bin.userData.crate;
    if (!crate) return;
    const next = slot?.code ? binMaterials.filled : binMaterials.empty;
    // Estante esmaecida: troca só o material-base; o esmaecimento reaplica a cópia transparente.
    if (crate.userData.baseMat && crate.material !== crate.userData.baseMat) {
      crate.userData.baseMat = next;
      const rack = bin.parent;
      if (rack) rack.userData.fadeDirty = true;
    }
    else crate.material = crate.userData.baseMat = next;
  });
}

// Estante kanban: base, colunas azuis, prateleiras brancas e 2 x 60 caixas (frente e verso).
// Cada caixa é um grupo com userData.slotId / kanbanId (usado pela seleção e pelo efeito de hover).
export function buildKanban(k) {
  const group = new THREE.Group();
  group.position.set(k.x, 0, k.z);
  group.rotation.y = THREE.MathUtils.degToRad(k.rotation || 0);
  group.userData.id = k.id;

  const base = mat("#c5cedb", { roughness: 0.55, metalness: 0.2 });
  const upright = mat(COLORS.blue, { roughness: 0.4, metalness: 0.2 });
  const shelf = mat("#f4f6fa", { roughness: 0.45, metalness: 0.1 });
  const lipMat = mat(COLORS.blueDark, { roughness: 0.5 });
  const tagMat = mat("#ffffff", { roughness: 0.5 });

  addBox(group, 5.4, 0.16, 1.55, 0, 0.08, 0, base, { radius: 0.05 });
  for (const x of [-2.6, 2.6]) for (const z of [-0.64, 0.64]) addBox(group, 0.12, 3.7, 0.12, x, 1.87, z, upright, { radius: 0.04 });
  for (const x of [-2.6, 2.6]) addBox(group, 0.1, 0.1, 1.35, x, 3.68, 0, upright, { radius: 0.03 });

  const crateGeo = roundedBox(0.44, 0.4, 0.72, 0.06);
  const lipGeo = roundedBox(0.46, 0.07, 0.08, 0.02);
  const tagGeo = roundedBox(0.28, 0.12, 0.025, 0.01);
  for (let row = 0; row < ROWS.length; row++) {
    const y = 0.28 + (ROWS.length - 1 - row) * 0.52;
    addBox(group, 5.12, 0.07, 1.3, 0, y, -0.02, shelf, { radius: 0.025 });
    for (let col = 0; col < COLS; col++) {
      const id = `${ROWS[row]}-${col + 1}`;
      const slot = k.slots?.find((item) => item.id === id);
      const x = (col - (COLS - 1) / 2) * 0.5;
      const makeBin = (z, direction) => {
        const bin = new THREE.Group();
        bin.position.set(x, y + 0.23, z);
        if (direction < 0) bin.rotation.y = Math.PI;
        bin.userData.slotId = id;
        bin.userData.kanbanId = k.id;
        bin.userData.pullDirection = direction;
        const crate = new THREE.Mesh(crateGeo, slot?.code ? binMaterials.filled : binMaterials.empty);
        crate.castShadow = true;
        crate.receiveShadow = true;
        bin.userData.crate = crate;
        const lip = new THREE.Mesh(lipGeo, lipMat);
        lip.position.set(0, -0.11, 0.39);
        const tag = new THREE.Mesh(tagGeo, tagMat);
        tag.position.set(0, -0.09, 0.377);
        bin.add(crate, lip, tag);
        group.add(bin);
      };
      makeBin(0.25, 1);
      makeBin(-0.25, -1);
    }
  }
  for (let i = 0; i < 3; i++) addBox(group, 5.2, 0.06, 0.08, 0, 0.35 + i * 1.04, -0.72, shelf, { radius: 0.02 });

  // Placa no topo com o código do kanban (dos dois lados)
  addBox(group, 5.3, 0.08, 0.08, 0, 3.7, 0, upright, { radius: 0.03 });
  addBox(group, 0.06, 0.3, 0.06, 0, 3.86, 0, upright, { radius: 0.02 });
  const signGeo = new THREE.PlaneGeometry(1.5, 0.48);
  const signMat = new THREE.MeshBasicMaterial({ map: textTexture(k.id, { width: 320, height: 102, font: "800 62px Inter, system-ui, sans-serif" }), toneMapped: false });
  [0, Math.PI].forEach((turn, i) => {
    const sign = new THREE.Mesh(i ? signGeo.clone() : signGeo, signMat);
    sign.position.set(0, 4.2, i ? -0.02 : 0.02);
    sign.rotation.y = turn;
    group.add(sign);
  });
  return group;
}
