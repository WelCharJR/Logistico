import * as THREE from "three";
import { CONTENTS_LAYER } from "./binModel.js";
import { COLORS, mat } from "./theme.js";

// Dia e noite: hora do dia em fração (0 = meia-noite, 0,5 = meio-dia, 0,75 = 18 h).
//   skyAt(t)               -> luzes e cores daquela hora (puro, testável)
//   stepClock(clock, mode, dt) -> avança o relógio (dia, noite ou ciclo)
//   createDayNight(...)    -> luminárias e manchas de luz no piso + update(dt, mode)
// Ao meio-dia os valores são exatamente os da cena original.

export const DAY_MODES = ["day", "night", "cycle"];
export const DAY_LENGTH_S = 120; // um dia inteiro em 2 minutos no modo ciclo
const NOON = 0.5,
  MIDNIGHT = 0;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const NIGHT_SKY = new THREE.Color("#101a2e"),
  DUSK_SKY = new THREE.Color("#f2b68a"),
  DAY_SKY = new THREE.Color(COLORS.sky),
  DUSK_SUN = new THREE.Color("#ffb070"),
  MOON = new THREE.Color("#9db4ff"),
  WHITE = new THREE.Color("#ffffff");

export function skyAt(t) {
  const hour = ((t % 1) + 1) % 1;
  const angle = (hour - 0.25) * Math.PI * 2;
  const elevation = Math.sin(angle); // 1 ao meio-dia, 0 às 6 h e 18 h, -1 à meia-noite
  const east = Math.cos(angle); // 1 às 6 h, -1 às 18 h
  const daylight = smooth(-0.15, 0.4, elevation);
  const dusk = Math.max(0, 1 - Math.abs(elevation) / 0.32) * (1 - 0.6 * (1 - daylight));
  const lamps = 1 - smooth(-0.05, 0.35, elevation);
  const sky = NIGHT_SKY.clone().lerp(DAY_SKY, daylight).lerp(DUSK_SKY, dusk * 0.55);
  const sunUp = elevation > -0.05;
  const sunColor = sunUp ? WHITE.clone().lerp(DUSK_SUN, dusk * 0.8) : MOON.clone();
  return {
    hour,
    elevation,
    daylight,
    dusk,
    lamps,
    sky: "#" + sky.getHexString(),
    sun: {
      color: "#" + sunColor.getHexString(),
      intensity: sunUp ? 2.6 * smooth(-0.05, 0.3, elevation) : 0.32,
      // posição relativa (multiplicada pela escala do galpão na cena); meio-dia = (-22, 38, 26)
      position: sunUp ? [-22 + east * 34, 4 + 34 * Math.max(0, elevation), 26] : [24, 32, -18],
    },
    hemi: { intensity: mix(0.32, 1.9, daylight), sky: daylight > 0.5 ? "#ffffff" : "#3a4a70", ground: daylight > 0.5 ? "#c4cee0" : "#1b2233" },
    fill: mix(0.08, 0.7, daylight),
    exposure: mix(1.0, 1.05, daylight),
  };
}

// Relógio: no modo dia/noite caminha até a hora pedida (sempre para a frente, como o sol), no
// ciclo avança um dia a cada DAY_LENGTH_S.
export function stepClock(clock, mode, dt, { transitionS = 3 } = {}) {
  const h = ((clock % 1) + 1) % 1;
  if (mode === "cycle") return (h + dt / DAY_LENGTH_S) % 1;
  const goal = mode === "night" ? MIDNIGHT : NOON;
  let ahead = (goal - h + 1) % 1; // quanto falta andando para a frente
  if (ahead < 1e-4 || ahead > 1 - 1e-4) return goal;
  const step = Math.max(dt / transitionS, 0) * 1; // um dia em transitionS no máximo
  return ahead <= step ? goal : (h + step) % 1;
}

// Textura de mancha de luz (radial) para o piso.
function poolTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,236,200,1)");
  grad.addColorStop(0.5, "rgba(255,226,180,0.45)");
  grad.addColorStop(1, "rgba(255,220,170,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Pontos das luminárias: grade de ~10 m dentro do galpão.
export function lampGrid(bounds, spacing = 10) {
  const out = [];
  const nx = Math.max(1, Math.round(bounds.width / spacing)),
    nz = Math.max(1, Math.round(bounds.depth / spacing));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++)
      out.push({ x: bounds.minX + ((i + 0.5) * bounds.width) / nx, z: bounds.minZ + ((j + 0.5) * bounds.depth) / nz });
  return out;
}

export function createDayNight({ scene, renderer, sun, hemi, fill, bounds, k = 1, structureLayer, reducedMotion = false }) {
  const group = new THREE.Group();
  scene.add(group);
  const height = 7.6;
  const spots = lampGrid(bounds);
  const housing = mat("#d4dae4", { roughness: 0.45, metalness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: "#ffe2a8", emissiveIntensity: 0, side: THREE.DoubleSide });
  const tex = poolTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: tex, color: "#ffe3b0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  // brilho em volta da luminária (visto de cima a lâmpada fica escondida pela cúpula)
  const haloMat = new THREE.MeshBasicMaterial({ map: tex, color: "#ffe9c4", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const disposables = [glow, poolMat, haloMat, tex].filter(Boolean);
  const keep = (g) => (disposables.push(g), g);
  const shadeGeo = keep(new THREE.CylinderGeometry(0.25, 0.55, 0.35, 16));
  const haloGeo = keep(new THREE.PlaneGeometry(2.4, 2.4));
  const lensGeo = keep(new THREE.CircleGeometry(0.52, 16));
  const cableGeo = keep(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4));
  const poolGeo = keep(new THREE.PlaneGeometry(9, 9));
  const fixtures = new THREE.Group();
  structureLayer.add(fixtures); // somem junto com a estrutura
  for (const p of spots) {
    const shade = new THREE.Mesh(shadeGeo, housing);
    shade.position.set(p.x, height, p.z);
    const lens = new THREE.Mesh(lensGeo, glow);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(p.x, height - 0.17, p.z);
    const cable = new THREE.Mesh(cableGeo, housing);
    cable.position.set(p.x, height + 0.87, p.z);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(p.x, height + 0.2, p.z);
    halo.renderOrder = 2;
    fixtures.add(shade, lens, cable, halo);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, 0.03, p.z);
    pool.renderOrder = 1;
    group.add(pool);
  }
  // luz de cima (as luminárias acesas): direcional quente, sem sombra
  const overhead = new THREE.DirectionalLight("#ffe7c2", 0);
  overhead.position.set(0, 30 * k, 0);
  scene.add(overhead);
  // janelas acendem à noite (mesmo material da fita de janelas do galpão)
  const windows = mat(COLORS.glass, { roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.75 });
  const windowEmissive = windows.emissive.clone();
  group.traverse((o) => o.layers.set(CONTENTS_LAYER));
  fixtures.traverse((o) => o.layers.set(CONTENTS_LAYER));

  let clock = NOON;
  let applied = -1;
  const sky = new THREE.Color();
  const apply = (s) => {
    sky.set(s.sky);
    scene.background.copy(sky);
    scene.fog?.color.copy(sky);
    sun.color.set(s.sun.color);
    sun.intensity = s.sun.intensity;
    sun.position.set(s.sun.position[0] * k, s.sun.position[1] * k, s.sun.position[2] * k);
    hemi.intensity = s.hemi.intensity;
    hemi.color.set(s.hemi.sky);
    hemi.groundColor.set(s.hemi.ground);
    fill.intensity = s.fill;
    renderer.toneMappingExposure = s.exposure;
    overhead.intensity = 1.5 * s.lamps;
    glow.emissiveIntensity = 2.2 * s.lamps;
    poolMat.opacity = 0.32 * s.lamps;
    haloMat.opacity = 0.9 * s.lamps;
    group.visible = fixtures.visible = s.lamps > 0.01;
    windows.emissive.copy(windowEmissive).lerp(new THREE.Color("#ffd28a"), s.lamps * 0.7);
  };
  return {
    get hour() {
      return clock;
    },
    update(dt, mode) {
      clock = reducedMotion && mode !== "cycle" ? (mode === "night" ? MIDNIGHT : NOON) : stepClock(clock, mode, dt);
      if (Math.abs(clock - applied) < 1e-5) return;
      applied = clock;
      apply(skyAt(clock));
    },
    dispose() {
      windows.emissive.copy(windowEmissive);
      renderer.toneMappingExposure = 1.05;
      scene.remove(group, overhead);
      structureLayer.remove(fixtures);
      disposables.forEach((d) => d.dispose());
    },
  };
}
