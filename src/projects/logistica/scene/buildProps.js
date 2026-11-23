import * as THREE from "three";
import { COLORS, addBox, mat, textTexture } from "./theme.js";
import { DOCKS, HALL } from "./buildHall.js";

// Objetos decorativos (não clicáveis): caminhões, empilhadeiras, paletes, carregador e árvores.
// Ficam num grupo próprio, fora do raycast, para não interferir na edição do layout.

const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
wheelGeo.rotateZ(Math.PI / 2);
wheelGeo.userData.shared = true;

function wheel(parent, x, y, z, radius, width) {
  const tire = new THREE.Mesh(wheelGeo, mat(COLORS.rubber, { roughness: 0.85 }));
  tire.scale.set(width, radius, radius);
  tire.position.set(x, y, z);
  tire.castShadow = true;
  parent.add(tire);
  const hub = new THREE.Mesh(wheelGeo, mat("#c9d1dd", { roughness: 0.3, metalness: 0.6 }));
  hub.scale.set(width + 0.02, radius * 0.45, radius * 0.45);
  hub.position.set(x, y, z);
  parent.add(hub);
}

let logoTexture = null;
const logo = () => (logoTexture ??= textTexture("HANGAR", { width: 512, height: 128, bg: "#ffffff", fg: COLORS.blue, font: "800 84px Inter, system-ui, sans-serif" }));

// Caminhão com baú. Origem no centro do conjunto; a cabine aponta para +z.
export function buildTruck({ trailerLength = 8 } = {}) {
  const truck = new THREE.Group();
  const blue = mat(COLORS.blue, { roughness: 0.35, metalness: 0.2 });
  const white = mat("#ffffff", { roughness: 0.45 });
  const glass = mat("#24335c", { roughness: 0.1, metalness: 0.5 });
  const dark = mat("#3a4252", { roughness: 0.6 });

  const cabZ = trailerLength / 2 + 1.2;
  addBox(truck, 2.5, 0.35, trailerLength + 3, 0, 0.75, 0.9, dark, { radius: 0.05 });
  addBox(truck, 2.5, 2.3, 2.2, 0, 2.0, cabZ, blue, { radius: 0.32 });
  addBox(truck, 2.3, 0.9, 0.08, 0, 2.55, cabZ + 1.1, glass, { radius: 0.04, cast: false });
  [-1, 1].forEach((s) => addBox(truck, 0.08, 0.7, 1, s * 1.26, 2.55, cabZ + 0.3, glass, { radius: 0.03, cast: false }));
  addBox(truck, 2.3, 0.3, 0.12, 0, 1.15, cabZ + 1.12, mat("#e8edf6"), { radius: 0.05 });
  [-0.85, 0.85].forEach((x) => addBox(truck, 0.4, 0.18, 0.06, x, 1.15, cabZ + 1.19, mat("#fff6cc", { emissive: "#fff2b0", emissiveIntensity: 0.6 }), { radius: 0.04, cast: false }));

  // Baú branco com faixa azul e logo nas laterais
  addBox(truck, 2.6, 2.8, trailerLength, 0, 2.55, 0, white, { radius: 0.12 });
  addBox(truck, 2.64, 0.35, trailerLength - 0.1, 0, 1.35, 0, blue, { radius: 0.06 });
  [-1, 1].forEach((s) => {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: logo(), toneMapped: false }));
    plate.position.set(s * 1.31, 2.75, 0);
    plate.rotation.y = s * Math.PI / 2;
    truck.add(plate);
  });

  [cabZ + 0.2, -trailerLength / 2 + 1.1, -trailerLength / 2 + 2.3].forEach((z) =>
    [-1.05, 1.05].forEach((x) => wheel(truck, x, 0.5, z, 0.5, 0.42)),
  );
  return truck;
}

// Empilhadeira amarela com proteção superior e garfo. A frente (garfo) aponta para +z.
export function buildForklift({ load = false } = {}) {
  const f = new THREE.Group();
  const yellow = mat(COLORS.yellow, { roughness: 0.4, metalness: 0.1 });
  const dark = mat("#2e3440", { roughness: 0.5, metalness: 0.4 });
  const seat = mat("#1f2530", { roughness: 0.8 });

  addBox(f, 1.15, 0.75, 1.7, 0, 0.62, -0.1, yellow, { radius: 0.16 });
  addBox(f, 1.1, 0.5, 0.5, 0, 0.75, -0.95, dark, { radius: 0.12 }); // contrapeso
  addBox(f, 0.6, 0.45, 0.5, 0, 1.15, -0.25, seat, { radius: 0.12 });
  [[-0.5, 0.45], [0.5, 0.45], [-0.5, -0.75], [0.5, -0.75]].forEach(([x, z]) => addBox(f, 0.07, 1.25, 0.07, x, 1.6, z, dark, { radius: 0.025 }));
  addBox(f, 1.15, 0.08, 1.35, 0, 2.24, -0.15, dark, { radius: 0.03 });
  // Torre e garfo
  [-0.32, 0.32].forEach((x) => addBox(f, 0.1, 2.1, 0.1, x, 1.15, 0.85, dark, { radius: 0.03 }));
  addBox(f, 0.85, 0.5, 0.06, 0, 0.45, 0.93, dark, { radius: 0.02 });
  [-0.25, 0.25].forEach((x) => addBox(f, 0.1, 0.05, 1.1, x, 0.18, 1.45, mat("#5a6272", { metalness: 0.6, roughness: 0.4 }), { radius: 0.015 }));
  // Luz giratória
  const beacon = addBox(f, 0.14, 0.12, 0.14, 0, 2.34, -0.5, mat("#ffb020", { emissive: "#ff9a00", emissiveIntensity: 0.9 }), { radius: 0.05, cast: false });
  f.userData.beacon = beacon;
  wheel(f, -0.55, 0.3, 0.45, 0.3, 0.22);
  wheel(f, 0.55, 0.3, 0.45, 0.3, 0.22);
  wheel(f, -0.5, 0.24, -0.8, 0.24, 0.2);
  wheel(f, 0.5, 0.24, -0.8, 0.24, 0.2);
  if (load) {
    const pallet = buildPallet({ layers: 2, cols: 2, rows: 2 });
    pallet.position.set(0, 0.22, 1.5);
    f.add(pallet);
  }
  return f;
}

// Palete de madeira com caixas de papelão (ou carga envolta em filme azul).
export function buildPallet({ cols = 2, rows = 2, layers = 2, wrapped = false, seed = 1 } = {}) {
  const p = new THREE.Group();
  const wood = mat(COLORS.wood, { roughness: 0.8 });
  for (const z of [-0.5, 0, 0.5]) addBox(p, 1.2, 0.1, 0.18, 0, 0.05, z, wood, { radius: 0.02 });
  for (let i = 0; i < 5; i++) addBox(p, 0.2, 0.04, 1.2, -0.48 + i * 0.24, 0.12, 0, wood, { radius: 0.01 });
  if (wrapped) {
    addBox(p, 1.15, 0.95, 1.15, 0, 0.62, 0, mat("#3a63ef", { roughness: 0.25, metalness: 0.1 }), { radius: 0.1 });
    for (let y = 0.3; y < 1.05; y += 0.24) addBox(p, 1.18, 0.03, 1.18, 0, y, 0, mat("#5b7ff5", { roughness: 0.2 }), { radius: 0.02, cast: false });
    return p;
  }
  let n = seed;
  const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const bw = 1.15 / cols,
    bd = 1.15 / rows,
    bh = 0.38;
  for (let l = 0; l < layers; l++)
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        if (l === layers - 1 && rand() < 0.18) continue;
        const shade = rand() < 0.5 ? COLORS.cardboard : COLORS.cardboardDark;
        const x = -0.575 + bw * (c + 0.5),
          z = -0.575 + bd * (r + 0.5),
          y = 0.14 + bh / 2 + l * bh;
        addBox(p, bw - 0.03, bh - 0.02, bd - 0.03, x, y, z, mat(shade, { roughness: 0.85 }), { radius: 0.03 });
        addBox(p, bw - 0.02, 0.012, 0.08, x, y + bh / 2 - 0.004, z, mat("#e8d3a8", { roughness: 0.6 }), { radius: 0.004, cast: false });
      }
  return p;
}

function buildCharger() {
  const c = new THREE.Group();
  addBox(c, 0.7, 1.6, 0.45, 0, 0.8, 0, mat("#f4f6fa", { roughness: 0.4 }), { radius: 0.1 });
  addBox(c, 0.5, 0.35, 0.04, 0, 1.2, 0.23, mat("#1d2433", { roughness: 0.2 }), { radius: 0.04, cast: false });
  addBox(c, 0.5, 0.06, 0.05, 0, 1.45, 0.23, mat(COLORS.green, { emissive: COLORS.green, emissiveIntensity: 0.8 }), { radius: 0.02, cast: false });
  addBox(c, 0.8, 0.1, 0.55, 0, 0.05, 0, mat(COLORS.blue), { radius: 0.03 });
  return c;
}

function buildTree(scale = 1) {
  const t = new THREE.Group();
  addBox(t, 0.22, 1.2, 0.22, 0, 0.6, 0, mat("#9c7a55", { roughness: 0.9 }), { radius: 0.05 });
  const leaf = mat(COLORS.leaf, { roughness: 0.9, flatShading: true });
  [[0, 1.9, 0, 0.95], [0.25, 2.55, 0.1, 0.7]].forEach(([x, y, z, r]) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
    crown.position.set(x, y, z);
    crown.castShadow = true;
    t.add(crown);
  });
  t.scale.setScalar(scale);
  return t;
}

export function buildProps(scene, { reducedMotion = false } = {}) {
  const props = new THREE.Group();
  props.userData.decor = true;
  scene.add(props);
  const { minX, maxX, minZ, maxZ } = HALL;

  // Caminhão encostado na doca 4
  const truck = buildTruck();
  truck.position.set(DOCKS[3], 0, minZ + 4.6);
  props.add(truck);

  // Paletes nas vagas das docas 1 e 2 e ao lado da doca 3, e uma carga azul envolta em filme
  [[DOCKS[0] - 0.8, minZ + 3.4, {}], [DOCKS[0] + 0.8, minZ + 4.2, { layers: 3, seed: 4 }], [DOCKS[1] - 0.7, minZ + 3.6, { wrapped: true }], [DOCKS[1] + 0.9, minZ + 4.6, { seed: 7 }], [DOCKS[2] + 3.2, minZ + 1.6, { layers: 1, seed: 3 }]].forEach(
    ([x, z, opts]) => {
      const pallet = buildPallet(opts);
      pallet.position.set(x, 0, z);
      pallet.rotation.y = (x * 7) % 0.3;
      props.add(pallet);
    },
  );

  // Empilhadeiras: uma carregando na doca 3, uma no carregador e uma circulando
  const parked = buildForklift({ load: true });
  parked.position.set(DOCKS[2], 0, minZ + 4.2);
  parked.rotation.y = Math.PI;
  props.add(parked);

  const charger = buildCharger();
  charger.position.set(minX + 2.6, 0, 10.9);
  props.add(charger);
  const charging = buildForklift();
  charging.position.set(minX + 4.6, 0, 12.6);
  charging.rotation.y = -Math.PI / 2;
  props.add(charging);

  const mover = buildForklift({ load: true });
  props.add(mover);
  // A empilhadeira que circula vai e volta na faixa em frente às docas (fora da área dos kanbans).
  const lane = { from: -24, to: 9, z: minZ + 8.6, travel: 14, turn: 3 };

  // Lado de fora: rua com faixa tracejada, caminhão passando e árvores
  const road = new THREE.Mesh(new THREE.PlaneGeometry(260, 7), mat("#cbd3df", { roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.2, maxZ + 7);
  road.receiveShadow = true;
  props.add(road);
  const dash = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  for (let x = -120; x < 120; x += 4) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.18), dash);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, -0.19, maxZ + 7);
    props.add(d);
  }
  const passing = buildTruck({ trailerLength: 9 });
  passing.rotation.y = Math.PI / 2;
  passing.position.set(-60, -0.2, maxZ + 8.6);
  props.add(passing);

  [[minX - 4, -14, 1.2], [minX - 5, -2, 1], [minX - 4, 10, 1.3], [minX - 3, 30, 1.1], [-12, maxZ + 13, 1.2], [6, maxZ + 12.5, 1], [maxX + 4, 26, 1.3], [maxX + 5, -6, 1.1], [maxX + 4, -18, 1]].forEach(([x, z, s]) => {
    const tree = buildTree(s);
    tree.position.set(x, -0.2, z);
    props.add(tree);
  });

  props.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });

  const lifts = [parked, charging, mover];
  const smooth = (t) => t * t * (3 - 2 * t);
  return {
    group: props,
    update(time) {
      const t = time / 1000;
      lifts.forEach((lift, i) => {
        lift.userData.beacon.visible = Math.sin(t * 6 + i) > -0.2;
      });
      mover.position.z = lane.z;
      if (reducedMotion) {
        mover.position.x = lane.from;
        mover.rotation.y = Math.PI / 2;
        return;
      }
      // ciclo: ida, giro, volta, giro
      const cycle = 2 * (lane.travel + lane.turn);
      const c = t % cycle;
      const leg = lane.travel + lane.turn;
      const back = c >= leg;
      const local = back ? c - leg : c;
      const [a, b] = back ? [lane.to, lane.from] : [lane.from, lane.to];
      const heading = back ? -Math.PI / 2 : Math.PI / 2;
      if (local < lane.travel) {
        mover.position.x = a + (b - a) * smooth(local / lane.travel);
        mover.rotation.y = heading;
      } else {
        mover.position.x = b;
        mover.rotation.y = heading + Math.PI * smooth((local - lane.travel) / lane.turn);
      }
      passing.position.x = ((t * 4.5) % 200) - 100;
    },
  };
}
