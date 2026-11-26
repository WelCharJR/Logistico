import * as THREE from "three";
import { COLS, ROWS } from "../constants.js";
import { COLORS, addBox, mat, roundedBox, textTexture } from "./theme.js";
import { BIN, CONTENTS_LAYER, INSIDE, binGeometry, contentKind, contentsGeometry, contentsMaterial } from "./binModel.js";
import { slotStatus } from "../data/stock.js";

// Materiais das caixas: azul forte = ocupada, azul claro = vazia.
export const binMaterials = {
  filled: mat("#3a63ef", { roughness: 0.42, side: THREE.DoubleSide }),
  empty: mat("#cfd9f3", { roughness: 0.6, side: THREE.DoubleSide }),
};

// Etiqueta da frente pela situação do estoque: branca normal, amarela acabando, vermelha acabou,
// cinza sem informação (ninguém conferiu há mais de 30 dias).
export const tagMaterials = {
  normal: mat("#ffffff", { roughness: 0.5 }),
  low: mat("#f7c33a", { roughness: 0.45, emissive: "#8a5c00", emissiveIntensity: 0.25 }),
  out: mat("#ef4d53", { roughness: 0.45, emissive: "#7a0d12", emissiveIntensity: 0.25 }),
  unknown: mat("#6f7888", { roughness: 0.6 }),
};
const tagFor = (status) => tagMaterials[status] || tagMaterials.normal;

// Troca o material de uma peça da caixa. Numa estante esmaecida troca só o material-base
// e pede para o esmaecimento reaplicar a cópia transparente.
function swapMaterial(mesh, next, bin) {
  if (!mesh || mesh.userData.baseMat === next || (!mesh.userData.baseMat && mesh.material === next)) return;
  if (mesh.userData.baseMat && mesh.material !== mesh.userData.baseMat) {
    mesh.userData.baseMat = next;
    if (bin.parent) bin.parent.userData.fadeDirty = true;
  } else mesh.material = mesh.userData.baseMat = next;
}

// Peças dentro da caixa: aparecem só nas ocupadas e com quantidade; o monte baixa conforme
// a quantidade (caixa quase vazia = monte raso). O tipo de peça vem do código do material.
function setContents(bin, slot) {
  const contents = bin.userData.contents;
  if (!contents) return;
  const state = slotStatus(slot);
  contents.visible = !!slot?.code && state.qty > 0;
  if (!contents.visible) return;
  // escala só a altura, a partir do fundo da caixa
  const s = 0.4 + 0.6 * Math.min(1, state.qty / state.capacity);
  contents.scale.y = s;
  contents.position.y = INSIDE.floor * (1 - s);
  const kind = contentKind(slot.code);
  if (contents.userData.kind !== kind) {
    contents.userData.kind = kind;
    contents.geometry = contentsGeometry(kind);
  }
}

// Troca a cor das caixas conforme o conteúdo atual, sem recriar a cena.
export function paintBins(slotGroups, kanbans) {
  const byId = new Map(kanbans.map((k) => [k.id, k]));
  slotGroups.forEach((bin) => {
    const slot = byId.get(bin.userData.kanbanId)?.slots?.find((s) => s.id === bin.userData.slotId);
    const crate = bin.userData.crate;
    if (!crate) return;
    setContents(bin, slot);
    swapMaterial(crate, slot?.code ? binMaterials.filled : binMaterials.empty, bin);
    swapMaterial(bin.userData.tag, tagFor(slotStatus(slot).status), bin);
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

  const crateGeo = binGeometry();
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
        // Porta-etiqueta na frente baixa da caixa.
        const lip = new THREE.Mesh(lipGeo, lipMat);
        lip.position.set(0, -0.16, BIN.depth / 2 + 0.025);
        const tag = new THREE.Mesh(tagGeo, slot?.code ? tagFor(slotStatus(slot).status) : tagMat);
        tag.position.set(0, -0.075, BIN.depth / 2 + 0.012);
        bin.userData.tag = tag;
        const contents = new THREE.Mesh(contentsGeometry("nuts"), contentsMaterial());
        contents.layers.set(CONTENTS_LAYER);
        contents.receiveShadow = true;
        bin.userData.contents = contents;
        setContents(bin, slot);
        bin.add(crate, contents, lip, tag);
        group.add(bin);
      };
      makeBin(BIN.rackOffset, 1);
      makeBin(-BIN.rackOffset, -1);
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
