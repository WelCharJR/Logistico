import * as THREE from "three";
import { COLORS, addBox, mat, textTexture } from "./theme.js";
import { HALL_DEFAULT, hallBounds } from "./hallSize.js";

// Galpão centrado na origem; o tamanho vem do layout (padrão 60 x 44 m).
// Paredes altas ao fundo (z = -22) e à esquerda (x = -30), que ficam de frente para a câmera;
// mureta baixa com grade nos lados mais próximos, para não esconder o interior.
// O piso e as marcações ficam sempre visíveis; paredes, portas e pilares vão para structureLayer.
const WALL_HEIGHT = 7;

export function buildHall(scene, structureLayer, bounds = hallBounds(HALL_DEFAULT)) {
  const { minX, maxX, minZ, maxZ, width, depth, docks: DOCKS } = bounds;
  const wallHeight = WALL_HEIGHT;

  // ---- terreno, laje e marcações (sempre visíveis) ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 220, depth + 220),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  scene.add(ground);

  const slab = addBox(scene, width + 1.2, 0.22, depth + 1.2, 0, -0.11, 0, mat(COLORS.floorEdge, { roughness: 0.9 }), { radius: 0.08, cast: false });
  slab.receiveShadow = true;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  const markings = new THREE.Group();
  scene.add(markings);
  const paint = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const yellowPaint = paint(COLORS.yellow);
  const stripe = (x, z, w, d, material = yellowPaint) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    markings.add(m);
    return m;
  };
  // Faixa de segurança tracejada em frente às docas
  for (let x = minX + 1; x < maxX - 1; x += 1.6) stripe(x + 0.4, minZ + 6.4, 0.8, 0.12);
  // Vagas demarcadas diante de cada doca
  DOCKS.forEach((x) => {
    stripe(x - 1.9, minZ + 3.2, 0.1, 5.2);
    stripe(x + 1.9, minZ + 3.2, 0.1, 5.2);
    stripe(x, minZ + 5.8, 3.9, 0.1);
  });
  // Faixa de pedestres junto à parede esquerda
  const white = paint("#ffffff");
  for (let i = 0; i < 7; i++) stripe(minX + 2.6, 4 + i * 0.7, 2.6, 0.34, white);
  // Zona de recarga das empilhadeiras (canto esquerdo)
  const zoneZ = maxZ - 9.5;
  const zone = stripe(minX + 4.2, zoneZ, 5, 3.6, paint("#bfe7cf"));
  zone.material.opacity = 0.75;
  [[minX + 1.7, zoneZ, 0.08, 3.6], [minX + 6.7, zoneZ, 0.08, 3.6], [minX + 4.2, zoneZ - 1.8, 5, 0.08], [minX + 4.2, zoneZ + 1.8, 5, 0.08]].forEach(
    ([x, z, w, d]) => stripe(x, z, w, d, paint(COLORS.green)),
  );

  // ---- estrutura (pode ser ocultada) ----
  const wallMat = mat(COLORS.wall, { roughness: 0.7 });
  const ribMat = mat(COLORS.wallRib, { roughness: 0.6 });
  const blueMat = mat(COLORS.blue, { roughness: 0.45, metalness: 0.15 });
  const steelMat = mat(COLORS.steel, { roughness: 0.4, metalness: 0.35 });

  // Parede do fundo com nervuras verticais e faixa azul no topo
  addBox(structureLayer, width + 0.4, wallHeight, 0.4, 0, wallHeight / 2, minZ - 0.2, wallMat, { radius: 0.05 });
  for (let x = minX + 1; x < maxX; x += 2) {
    if (Math.abs(x) < 5.2 || DOCKS.some((d) => Math.abs(d - x) < 2.4)) continue;
    addBox(structureLayer, 0.12, wallHeight - 0.8, 0.08, x, wallHeight / 2 - 0.2, minZ + 0.04, ribMat, { radius: 0.02, cast: false });
  }
  addBox(structureLayer, width + 0.5, 0.45, 0.5, 0, wallHeight + 0.05, minZ - 0.2, blueMat, { radius: 0.08 });

  // Parede esquerda com janelas em fita
  addBox(structureLayer, 0.4, wallHeight, depth + 0.4, minX - 0.2, wallHeight / 2, 0, wallMat, { radius: 0.05 });
  addBox(structureLayer, 0.5, 0.45, depth + 0.5, minX - 0.2, wallHeight + 0.05, 0, blueMat, { radius: 0.08 });
  const glassMat = mat(COLORS.glass, { roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.75 });
  for (let z = minZ + 4; z < maxZ - 2; z += 6) {
    addBox(structureLayer, 0.1, 1.1, 4.4, minX + 0.02, wallHeight - 1.6, z, glassMat, { radius: 0.04, cast: false });
  }

  // Portas de doca: moldura azul, porta de enrolar e nivelador escuro no piso
  const shutterMat = mat("#eef1f6", { roughness: 0.5 });
  const grooveMat = mat("#d7dde7", { roughness: 0.5 });
  const rubberMat = mat(COLORS.rubber, { roughness: 0.8 });
  DOCKS.forEach((x, i) => {
    const doorW = 3.4,
      doorH = 4.2,
      z = minZ + 0.02;
    addBox(structureLayer, 0.35, doorH + 0.35, 0.35, x - doorW / 2 - 0.17, (doorH + 0.35) / 2, z + 0.12, blueMat, { radius: 0.06 });
    addBox(structureLayer, 0.35, doorH + 0.35, 0.35, x + doorW / 2 + 0.17, (doorH + 0.35) / 2, z + 0.12, blueMat, { radius: 0.06 });
    addBox(structureLayer, doorW + 0.7, 0.4, 0.4, x, doorH + 0.35, z + 0.12, blueMat, { radius: 0.06 });
    addBox(structureLayer, doorW, doorH, 0.08, x, doorH / 2, z + 0.02, shutterMat, { radius: 0.02, cast: false });
    for (let y = 0.4; y < doorH; y += 0.38) addBox(structureLayer, doorW - 0.04, 0.04, 0.03, x, y, z + 0.08, grooveMat, { radius: 0.01, cast: false });
    addBox(structureLayer, doorW - 0.2, 0.05, 1.8, x, 0.03, minZ + 0.9, mat("#9aa3b2", { roughness: 0.6, metalness: 0.4 }), { radius: 0.02, cast: false });
    [-1, 1].forEach((s) => addBox(structureLayer, 0.35, 0.5, 0.25, x + s * 1.55, 0.6, minZ + 0.15, rubberMat, { radius: 0.05 }));
    // Placa com o número da doca
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.5),
      new THREE.MeshBasicMaterial({ toneMapped: false, map: textTexture("D" + (i + 1), { width: 256, height: 116, font: "800 72px Inter, system-ui, sans-serif" }) }),
    );
    plate.position.set(x, doorH + 0.95, minZ + 0.03);
    structureLayer.add(plate);
  });

  // Letreiro no centro da parede do fundo
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.6),
    new THREE.MeshBasicMaterial({ toneMapped: false, map: textTexture("HANGAR DIGITAL", { width: 1024, height: 182, bg: "#ffffff", fg: COLORS.blue, font: "800 104px Inter, system-ui, sans-serif", radius: 26 }) }),
  );
  sign.position.set(0, 4.6, minZ + 0.03);
  structureLayer.add(sign);
  addBox(structureLayer, 0.5, 0.5, 0.06, -5.2, 4.6, minZ + 0.04, blueMat, { radius: 0.08, cast: false });

  // Pilares nas paredes altas
  // Pilares a cada ~8 m, sem cobrir portas nem o letreiro
  const pillars = [];
  for (let x = minX + 4; x <= maxX - 4; x += 2) {
    const clear = DOCKS.every((d) => Math.abs(d - x) > 3) && Math.abs(x) > 5.5;
    if (clear && (!pillars.length || x - pillars[pillars.length - 1] >= 7)) pillars.push(x);
  }
  for (const x of pillars) addBox(structureLayer, 0.45, wallHeight, 0.45, x, wallHeight / 2, minZ + 0.25, steelMat, { radius: 0.06 });
  for (let z = minZ + 8; z < maxZ; z += 8) addBox(structureLayer, 0.45, wallHeight, 0.45, minX + 0.25, wallHeight / 2, z, steelMat, { radius: 0.06 });

  // Mureta com grade na frente (z = 22) e à direita (x = 30), com abertura para entrada
  const curbMat = mat("#e9edf3", { roughness: 0.7 });
  const fenceMat = mat("#b8c2d0", { roughness: 0.4, metalness: 0.5 });
  const panelMat = mat("#dfe5ee", { roughness: 0.5, transparent: true, opacity: 0.55 });
  const fence = (x, z, length, alongX) => {
    const w = alongX ? length : 0.3,
      d = alongX ? 0.3 : length;
    addBox(structureLayer, w, 0.5, d, x, 0.25, z, curbMat, { radius: 0.06 });
    addBox(structureLayer, alongX ? length : 0.06, 1, alongX ? 0.06 : length, x, 1, z, panelMat, { radius: 0.02, cast: false });
    addBox(structureLayer, alongX ? length : 0.08, 0.08, alongX ? 0.08 : length, x, 1.52, z, fenceMat, { radius: 0.03 });
    const posts = Math.max(1, Math.round(length / 2.5));
    for (let i = 0; i <= posts; i++) {
      const t = -length / 2 + (i * length) / posts;
      addBox(structureLayer, 0.1, 1.6, 0.1, alongX ? x + t : x, 0.8, alongX ? z : z + t, fenceMat, { radius: 0.03 });
    }
  };
  // entrada de 18 m no canto direito da frente
  fence((minX + maxX - 18) / 2, maxZ + 0.15, width - 18, true);
  fence(maxX + 0.15, (minZ + maxZ - 8) / 2, depth - 8, false);
  fence(maxX + 0.15, maxZ - 1.5, 3, false);
}
