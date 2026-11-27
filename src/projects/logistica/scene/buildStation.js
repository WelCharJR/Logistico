import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS, mat } from "./theme.js";
import { FOOTPRINT, hasModel, sanitizeArea, stationFit } from "./stationLayout.js";

// Estação de montagem em 3D: gabarito + peça do avião (KC-390 ou Super Tucano) + entorno.
//   buildStationModel(area) -> THREE.Group posicionado/escalado dentro da área (ou null)
// A peça muda com a etapa: skeleton (estrutura em primer), skin (revestimento parcial), complete (pintada).
// Tudo é feito em código, com medidas aproximadas em metros, e no fim juntado por material.

const DS = THREE.DoubleSide;
const M = {
  jig: mat(COLORS.blue, { roughness: 0.45, metalness: 0.25 }),
  jigDark: mat(COLORS.blueDark, { roughness: 0.5, metalness: 0.25 }),
  pad: mat(COLORS.yellow, { roughness: 0.5 }),
  primer: mat("#b3c26b", { roughness: 0.55, metalness: 0.1, side: DS }),
  alu: mat("#c5ccd5", { roughness: 0.3, metalness: 0.75, side: DS }),
  paint: mat("#7b8691", { roughness: 0.5, metalness: 0.2, side: DS }),
  dark: mat("#363d4b", { roughness: 0.6 }),
  glass: mat("#86a9d6", { roughness: 0.08, metalness: 0.4, side: DS }),
  deck: mat("#dde3eb", { roughness: 0.75 }),
  steel: mat(COLORS.steel, { roughness: 0.4, metalness: 0.35 }),
  red: mat("#d64a3d", { roughness: 0.45 }),
  rubber: mat(COLORS.rubber, { roughness: 0.8 }),
};
export const STATION_MATERIALS = M;

// ---------------- utilitários ----------------

const X = new THREE.Vector3(1, 0, 0),
  Y = new THREE.Vector3(0, 1, 0),
  Z = new THREE.Vector3(0, 0, 1);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function put(group, geometry, material, { position, quaternion, scale } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  if (quaternion) mesh.quaternion.copy(quaternion);
  if (scale) mesh.scale.copy(scale);
  group.add(mesh);
  return mesh;
}
const box = (g, w, h, d, x, y, z, m) => put(g, new THREE.BoxGeometry(w, h, d), m, { position: v3(x, y, z) });

// Viga de seção w x h entre dois pontos; `up` define para onde aponta a altura da seção.
function beam(g, a, b, w, h, m, up = Y) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return;
  dir.normalize();
  let side = new THREE.Vector3().crossVectors(dir, up);
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3().crossVectors(dir, X.clone().equals(dir) ? Z : X);
  side.normalize();
  const upv = new THREE.Vector3().crossVectors(side, dir).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, upv, side));
  put(g, new THREE.BoxGeometry(len, h, w), m, { position: a.clone().add(b).multiplyScalar(0.5), quaternion: q });
}
// Tubo (cilindro) entre dois pontos.
function tube(g, a, b, r, m, seg = 6) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize());
  put(g, new THREE.CylinderGeometry(r, r, len, seg, 1, true), m, { position: a.clone().add(b).multiplyScalar(0.5), quaternion: q });
}

// ---------------- superfícies sustentadoras (asa, deriva, estabilizador) ----------------

// Perfil simétrico NACA 00xx: meia espessura em função da corda (0..1).
const naca = (u, t) => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
const U = Array.from({ length: 15 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / 14)); // mais pontos no bordo de ataque

// spec: { origin, span (vetor da raiz à ponta, com comprimento), chordDir, thickDir,
//         root: { chord, lead }, tip: { chord, lead }, t (espessura relativa), ribs }
function lifting(g, spec, stage) {
  const { origin, span, chordDir, thickDir, root, tip, t } = spec;
  const spanLen = span.length();
  const spanDir = span.clone().normalize();
  const at = (s) => ({ chord: root.chord + (tip.chord - root.chord) * s, lead: root.lead + (tip.lead - root.lead) * s });
  const point = (s, u, v) => {
    const { chord, lead } = at(s);
    return origin.clone().addScaledVector(spanDir, s * spanLen).addScaledVector(chordDir, lead + u * chord).addScaledVector(thickDir, v * chord);
  };
  const ribCount = spec.ribs || Math.max(4, Math.round(spanLen / 0.75));
  if (stage !== "complete") {
    // Nervuras: contorno do perfil extrudado fininho, a cada ~75 cm.
    for (let i = 0; i <= ribCount; i++) {
      const s = i / ribCount;
      const { chord } = at(s);
      const shape = new THREE.Shape();
      U.forEach((u, k) => (k ? shape.lineTo(u * chord, naca(u, t) * chord) : shape.moveTo(0, 0)));
      [...U].reverse().forEach((u) => shape.lineTo(u * chord, -naca(u, t) * chord));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 1 });
      const basis = new THREE.Matrix4().makeBasis(chordDir, thickDir, spanDir).setPosition(point(s, 0, 0));
      geo.applyMatrix4(basis);
      put(g, geo, M.primer);
    }
    // Longarinas dianteira e traseira + bordos.
    for (const u of [0.18, 0.68]) {
      const h = naca(u, t) * 1.7;
      const a = point(0, u, 0),
        b = point(1, u, 0);
      beam(g, a, b, 0.05, h * root.chord * 0.9, M.primer, thickDir);
    }
    tube(g, point(0, 0, 0), point(1, 0, 0), 0.03, M.primer);
    tube(g, point(0, 1, 0), point(1, 1, 0), 0.02, M.primer);
  }
  // Revestimento: superfície em grade (spanwise x chordwise).
  const skin = (side, sFrom, sTo, material) => {
    const ns = Math.max(2, Math.round((sTo - sFrom) * 12)),
      positions = [],
      index = [];
    for (let i = 0; i <= ns; i++) {
      const s = sFrom + ((sTo - sFrom) * i) / ns;
      U.forEach((u) => {
        const p = point(s, u, side * naca(u, t));
        positions.push(p.x, p.y, p.z);
      });
    }
    const nu = U.length;
    for (let i = 0; i < ns; i++)
      for (let k = 0; k < nu - 1; k++) {
        const a = i * nu + k,
          b = a + 1,
          c = a + nu,
          d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    put(g, geo, material);
  };
  if (stage === "skin") {
    // painéis já fixados na metade perto da raiz, dos dois lados (visível de qualquer ângulo)
    skin(-1, 0, 0.55, M.alu);
    skin(1, 0, 0.55, M.alu);
  } else if (stage === "complete") {
    skin(-1, 0, 1, M.paint);
    skin(1, 0, 1, M.paint);
  }
  return { point, at };
}

// ---------------- fuselagem ----------------

// profile(x) -> { r, y } (raio e deslocamento vertical do eixo) para x em [x0, x1]; eixo da fuselagem = +x.
function fuselage(g, { x0, x1, axisY, profile, frameEvery = 0.55, stringers = 14, floor = false, windows = 0 }, stage) {
  const frames = Math.max(2, Math.round((x1 - x0) / frameEvery));
  const xs = Array.from({ length: frames + 1 }, (_, i) => x0 + ((x1 - x0) * i) / frames);
  const ring = (x, theta) => {
    const { r, y } = profile(x);
    return v3(x, axisY + y + r * Math.cos(theta), r * Math.sin(theta));
  };
  if (stage !== "complete") {
    // Cavernas (anéis) e longarinas (ao longo do comprimento).
    xs.forEach((x) => {
      const { r, y } = profile(x);
      if (r < 0.05) return;
      const torus = new THREE.TorusGeometry(r, Math.max(0.025, r * 0.022), 5, 28);
      torus.rotateY(Math.PI / 2);
      torus.translate(x, axisY + y, 0);
      put(g, torus, M.primer);
    });
    for (let k = 0; k < stringers; k++) {
      const theta = (Math.PI * 2 * k) / stringers;
      for (let i = 1; i < xs.length; i++) tube(g, ring(xs[i - 1], theta), ring(xs[i], theta), 0.02, M.primer, 4);
    }
  }
  if (floor) {
    // Piso de carga do KC-390 (aparece em todas as etapas: dá leitura de "fuselagem de transporte").
    const { r } = profile((x0 + x1) / 2);
    box(g, x1 - x0 - 0.2, 0.07, r * 1.55, (x0 + x1) / 2, axisY - r * 0.48, 0, M.dark);
  }
  // Revestimento: superfície de revolução (ou parte dela).
  const skin = (thetaFrom, thetaTo, xFrom, xTo, material) => {
    const nx = Math.max(2, Math.round((xTo - xFrom) / 0.35)),
      nt = Math.max(3, Math.round(((thetaTo - thetaFrom) / (Math.PI * 2)) * 36));
    const positions = [],
      index = [];
    for (let i = 0; i <= nx; i++) {
      const x = xFrom + ((xTo - xFrom) * i) / nx;
      for (let j = 0; j <= nt; j++) {
        const p = ring(x, thetaFrom + ((thetaTo - thetaFrom) * j) / nt);
        positions.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j,
          b = a + 1,
          c = a + nt + 1,
          d = c + 1;
        index.push(a, b, c, b, d, c);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    put(g, geo, material);
  };
  if (stage === "skin") {
    // painéis de baixo e das laterais já fixados (dos dois lados); em cima ainda é estrutura
    skin(Math.PI * 0.42, Math.PI * 1.58, x0, x0 + (x1 - x0) * 0.85, M.alu);
  } else if (stage === "complete") {
    skin(0, Math.PI * 2, x0, x1, M.paint);
    for (let i = 0; i < windows; i++) {
      const x = x0 + ((x1 - x0) * (i + 1)) / (windows + 1);
      const { r, y } = profile(x);
      for (const side of [-1, 1]) box(g, 0.32, 0.36, 0.06, x, axisY + y + r * 0.25, side * r * 0.97, M.dark);
    }
  }
  return { ring };
}

// ---------------- gabaritos e entorno ----------------

// Berço: base + duas sapatas inclinadas que abraçam a fuselagem.
function cradle(g, x, axisY, r, width = 0.35) {
  const baseY = Math.max(0.25, axisY - r - 0.35);
  box(g, width, baseY, r * 2.1, x, baseY / 2, 0, M.jig);
  for (const side of [-1, 1]) {
    const a = v3(x, baseY, side * r * 0.95),
      b = v3(x, axisY - r * 0.55, side * r * 0.85);
    beam(g, a, b, width * 0.8, 0.14, M.jig, X);
    box(g, width * 0.9, 0.08, 0.3, x, axisY - r * 0.9, side * r * 0.42, M.pad);
  }
}
// Pórtico: duas colunas e uma travessa por cima, com sapatas amarelas tocando a peça.
function portal(g, x, halfWidth, height, depth = 0.3, touchY = null) {
  for (const side of [-1, 1]) box(g, depth, height, 0.3, x, height / 2, side * halfWidth, M.jig);
  box(g, depth + 0.05, 0.32, halfWidth * 2 + 0.3, x, height + 0.16, 0, M.jig);
  if (touchY !== null) {
    tube(g, v3(x, height, 0), v3(x, touchY + 0.12, 0), 0.06, M.steel);
    box(g, 0.3, 0.08, 0.3, x, touchY + 0.08, 0, M.pad);
  }
}
// Moldura vertical (gabarito de asa/deriva): colunas, vigas de cima e de baixo, garras.
function frameJig(g, x0, x1, yLow, yHigh, zOffset, columns = 4) {
  for (let i = 0; i <= columns; i++) {
    const x = x0 + ((x1 - x0) * i) / columns;
    for (const side of [-1, 1]) box(g, 0.28, yHigh + 0.4, 0.28, x, (yHigh + 0.4) / 2, side * zOffset, M.jig);
    // garras no bordo de ataque (embaixo) e no de fuga (em cima)
    for (const y of [yLow, yHigh]) for (const side of [-1, 1]) box(g, 0.18, 0.18, zOffset * 0.6, x, y, side * zOffset * 0.55, M.pad);
  }
  for (const side of [-1, 1]) {
    box(g, x1 - x0 + 0.3, 0.26, 0.26, (x0 + x1) / 2, yHigh + 0.4, side * zOffset, M.jig);
    box(g, x1 - x0 + 0.3, 0.22, 0.26, (x0 + x1) / 2, 0.11, side * zOffset, M.jig);
  }
}
// Plataforma de trabalho com guarda-corpo e escada numa ponta.
function platform(g, x0, x1, z, depth, height) {
  const len = x1 - x0,
    cx = (x0 + x1) / 2,
    zOut = z + Math.sign(z || 1) * depth / 2;
  box(g, len, 0.08, depth, cx, height, z, M.deck);
  for (const x of [x0 + 0.1, x1 - 0.1]) for (const dz of [-depth / 2 + 0.08, depth / 2 - 0.08]) box(g, 0.08, height, 0.08, x, height / 2, z + dz, M.steel);
  // guarda-corpo do lado de fora
  box(g, len, 0.05, 0.05, cx, height + 1.0, zOut, M.pad);
  box(g, len, 0.04, 0.04, cx, height + 0.55, zOut, M.pad);
  for (let x = x0 + 0.1; x <= x1; x += 1.2) box(g, 0.05, 1.0, 0.05, x, height + 0.5, zOut, M.pad);
  // escada
  const steps = Math.max(2, Math.round(height / 0.22));
  for (let i = 0; i < steps; i++) {
    const y = (height * (i + 1)) / (steps + 1);
    box(g, 0.28, 0.05, depth * 0.8, x1 + 0.2 + (steps - i) * 0.26, y, z, M.steel);
  }
  box(g, steps * 0.26 + 0.3, 0.06, 0.06, x1 + 0.2 + (steps * 0.26) / 2, height / 2 + 0.5, z + depth * 0.42, M.pad);
}
function bench(g, x, z, rotation = 0) {
  const b = new THREE.Group();
  box(b, 1.8, 0.06, 0.7, 0, 0.9, 0, M.deck);
  for (const dx of [-0.82, 0.82]) for (const dz of [-0.28, 0.28]) box(b, 0.06, 0.9, 0.06, dx, 0.45, dz, M.steel);
  box(b, 1.7, 0.04, 0.6, 0, 0.25, 0, M.steel);
  box(b, 0.35, 0.18, 0.25, -0.5, 1.02, 0, M.red); // maleta
  b.position.set(x, 0, z);
  b.rotation.y = rotation;
  g.add(b);
}
function toolCart(g, x, z) {
  const c = new THREE.Group();
  box(c, 0.8, 0.85, 0.5, 0, 0.55, 0, M.red);
  for (let i = 0; i < 4; i++) box(c, 0.74, 0.02, 0.46, 0, 0.3 + i * 0.2, 0.26, M.dark); // gavetas
  for (const dx of [-0.32, 0.32]) for (const dz of [-0.18, 0.18]) put(c, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), M.rubber, { position: v3(dx, 0.06, dz), quaternion: new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2) });
  c.position.set(x, 0, z);
  g.add(c);
}

// ---------------- aeronaves ----------------

// Perfis de fuselagem (x = 0 no nariz, crescendo para trás; depois centralizamos).
const KC390 = {
  R: 2.35,
  // fuselagem inteira: nariz arredondado, corpo constante e cauda subindo (rampa de carga)
  full: (len) => (x) => {
    const t = x / len;
    if (t < 0.12) return { r: 2.35 * Math.sqrt(Math.max(0.02, t / 0.12)) * 0.98 + 0.05, y: -0.35 * (1 - t / 0.12) };
    if (t < 0.7) return { r: 2.35, y: 0 };
    const k = (t - 0.7) / 0.3;
    return { r: 2.35 * (1 - 0.72 * k), y: 1.25 * k };
  },
};
const TUCANO = {
  // fuselagem fina: capô do motor, cabine (mais larga) e cone de cauda
  full: (len) => (x) => {
    const t = x / len;
    if (t < 0.08) return { r: 0.32 + 0.25 * (t / 0.08), y: 0 };
    if (t < 0.45) return { r: 0.57 + 0.06 * Math.sin(((t - 0.08) / 0.37) * Math.PI), y: 0.02 };
    const k = (t - 0.45) / 0.55;
    return { r: 0.57 * (1 - 0.72 * k), y: 0.1 * k };
  },
};

function aircraftFuselage(g, aircraft, stage, { x0, len, axisY, section = false }) {
  if (aircraft === "kc390") {
    // seção de fuselagem (cilindro) ou fuselagem inteira
    const prof = section ? () => ({ r: KC390.R, y: 0 }) : (x) => KC390.full(len)(x - x0);
    return fuselage(g, { x0, x1: x0 + len, axisY, profile: prof, frameEvery: section ? 0.5 : 0.75, stringers: section ? 16 : 12, floor: true, windows: section ? 3 : 8 }, stage);
  }
  const prof = (x) => TUCANO.full(len)(x - x0);
  const f = fuselage(g, { x0, x1: x0 + len, axisY, profile: prof, frameEvery: 0.4, stringers: 10 }, stage);
  if (stage === "complete") {
    // cabine em tandem (bolha) + hélice de 5 pás no nariz (x0 = nariz)
    const canopy = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    canopy.scale(len * 0.17, 0.48, 0.42);
    canopy.translate(x0 + len * 0.3, axisY + 0.48, 0);
    put(g, canopy, M.glass);
    const spinner = new THREE.ConeGeometry(0.22, 0.55, 14);
    spinner.rotateZ(Math.PI / 2);
    spinner.translate(x0 - 0.25, axisY, 0);
    put(g, spinner, M.dark);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tip = v3(x0 - 0.15, axisY + Math.cos(a) * 1.2, Math.sin(a) * 1.2);
      beam(g, v3(x0 - 0.15, axisY, 0), tip, 0.04, 0.16, M.dark, X);
    }
  }
  return f;
}

// Asa: orientação genérica via vetores. root na raiz, span até a ponta.
const WINGS = {
  kc390: { span: 15.2, root: 5.4, tip: 2.0, sweep: 1.9, t: 0.13 },
  tucano: { span: 5.3, root: 2.3, tip: 1.25, sweep: 0.35, t: 0.15 },
};
const FINS = {
  kc390: { height: 6.0, root: 5.2, tip: 3.3, sweep: 2.3, t: 0.11, stab: { span: 6.2, root: 3.2, tip: 1.6, sweep: 1.2 } },
  tucano: { height: 1.9, root: 1.8, tip: 0.9, sweep: 0.8, t: 0.12, stab: { span: 2.3, root: 1.2, tip: 0.7, sweep: 0.3 } },
};

// ---------------- estações por tipo ----------------

function fuselageStation(g, aircraft, stage) {
  if (aircraft === "kc390") {
    const len = 8,
      R = KC390.R,
      axisY = R + 0.9;
    aircraftFuselage(g, aircraft, stage, { x0: -len / 2, len, axisY, section: true });
    for (const x of [-len / 2 + 0.8, 0, len / 2 - 0.8]) cradle(g, x, axisY, R);
    for (const x of [-len / 2 - 0.6, len / 2 + 0.6]) portal(g, x, R + 0.55, axisY + R + 0.7, 0.32, axisY + R);
    platform(g, -len / 2 + 0.3, len / 2 - 1.2, R + 1.4, 1.2, axisY - 0.4);
    bench(g, -1.5, -(R + 1.6), Math.PI);
    toolCart(g, 2.2, -(R + 1.5));
    return;
  }
  const len = 9.6,
    axisY = 1.35;
  aircraftFuselage(g, aircraft, stage, { x0: -len / 2, len, axisY });
  for (const x of [-len / 2 + 1.2, -0.4, len / 2 - 2]) cradle(g, x, axisY, 0.55, 0.25);
  portal(g, -len / 2 + 2.6, 1.0, 2.6, 0.25, axisY + 0.6);
  platform(g, -len / 2 + 0.6, 1.4, 1.5, 0.9, 0.7);
  toolCart(g, 2.8, -1.5);
}

function wingStation(g, aircraft, stage) {
  const w = WINGS[aircraft];
  const base = aircraft === "kc390" ? 1.0 : 0.8;
  // asa de pé: envergadura em x, corda subindo (bordo de ataque embaixo), espessura em z
  lifting(g, {
    origin: v3(-w.span / 2, base, 0),
    span: v3(w.span, 0, 0),
    chordDir: Y.clone(),
    thickDir: Z.clone(),
    root: { chord: w.root, lead: 0 },
    tip: { chord: w.tip, lead: w.sweep },
    t: w.t,
  }, stage);
  const zOff = w.root * w.t * 0.75 + 0.45;
  frameJig(g, -w.span / 2 - 0.4, w.span / 2 + 0.4, base - 0.1, base + w.root + 0.15, zOff, aircraft === "kc390" ? 5 : 3);
  platform(g, -w.span / 2 + 0.5, w.span / 2 - 2.2, zOff + 1.2, 1.1, aircraft === "kc390" ? base + w.root * 0.45 : 0.8);
  bench(g, 0, -(zOff + 1.4), Math.PI);
  toolCart(g, w.span / 2 - 1, -(zOff + 1.3));
}

function tailStation(g, aircraft, stage) {
  const f = FINS[aircraft];
  const base = aircraft === "kc390" ? 0.9 : 0.6;
  // deriva de pé: altura em y, corda em x (bordo de ataque para -x), espessura em z
  const fin = lifting(g, {
    origin: v3(-f.root / 2, base, 0),
    span: v3(0, f.height, 0),
    chordDir: X.clone(),
    thickDir: Z.clone(),
    root: { chord: f.root, lead: 0 },
    tip: { chord: f.tip, lead: f.sweep },
    t: f.t,
  }, stage);
  if (stage === "complete") {
    // estabilizador horizontal: no topo (T) no KC-390, na base no Super Tucano
    const s = f.stab;
    const top = aircraft === "kc390";
    const y = top ? base + f.height : base + 0.05;
    const lead = top ? f.sweep + 0.3 : 0.25;
    for (const side of [-1, 1])
      lifting(g, {
        origin: v3(-f.root / 2 + lead, y, 0),
        span: v3(0, 0, side * s.span),
        chordDir: X.clone(),
        thickDir: Y.clone(),
        root: { chord: s.root, lead: 0 },
        tip: { chord: s.tip, lead: s.sweep },
        t: 0.1,
        ribs: 4,
      }, stage);
  }
  const zOff = f.root * f.t * 0.7 + 0.4;
  frameJig(g, -f.root / 2 - 0.4, f.root / 2 + f.sweep + 0.3, base - 0.1, base + f.height * 0.92, zOff, 2);
  box(g, f.root + 0.6, base, 0.9, 0, base / 2, 0, M.jigDark); // berço da raiz
  platform(g, -f.root / 2, f.root / 2, zOff + 1.1, 1.0, Math.max(0.6, base + f.height * 0.35));
  toolCart(g, f.root / 2 + 0.6, -(zOff + 1.2));
  return fin;
}

function finalStation(g, aircraft, stage) {
  const kc = aircraft === "kc390";
  const len = kc ? 33 : 11.4;
  const axisY = kc ? 3.3 : 1.45;
  const x0 = -len / 2;
  // nariz em -x (x0); fuselagem completa
  const f = aircraftFuselage(g, aircraft, stage, { x0, len, axisY });
  const w = WINGS[aircraft];
  // asa: alta no KC-390, baixa no Super Tucano; bordo de ataque para o nariz (-x), corda para trás (+x)
  const wingY = kc ? axisY + KC390.R * 0.82 : axisY - 0.42;
  const wingX = kc ? x0 + len * 0.36 : x0 + len * 0.27;
  for (const side of [-1, 1]) {
    const halfFuse = kc ? KC390.R * 0.6 : 0.4;
    lifting(g, {
      origin: v3(wingX, wingY, side * halfFuse),
      span: v3(0, kc ? -0.4 : 0.35, side * w.span),
      chordDir: X.clone(),
      thickDir: Y.clone(),
      root: { chord: w.root, lead: 0 },
      tip: { chord: w.tip, lead: w.sweep },
      t: w.t,
      ribs: kc ? 14 : 7,
    }, stage);
    if (kc) {
      // motores sob a asa
      const nacelle = new THREE.CylinderGeometry(0.95, 0.85, 4.6, 18, 1, false);
      nacelle.rotateZ(Math.PI / 2);
      nacelle.translate(wingX - 1.2, wingY - 1.25, side * 6.6);
      put(g, nacelle, stage === "complete" ? M.paint : M.alu);
      beam(g, v3(wingX + 0.4, wingY - 0.4, side * 6.6), v3(wingX + 0.4, wingY - 0.15, side * 6.6), 0.3, 1.4, M.dark);
    }
  }
  // empenagem na cauda
  const fin = FINS[aircraft];
  const tailX = x0 + len - fin.root - (kc ? 0.6 : 0.2);
  const tail = f.ring(tailX + fin.root * 0.4, 0);
  lifting(g, {
    origin: v3(tailX, tail.y - 0.2, 0),
    span: v3(0, fin.height, 0),
    chordDir: X.clone(),
    thickDir: Z.clone(),
    root: { chord: fin.root, lead: 0 },
    tip: { chord: fin.tip, lead: fin.sweep },
    t: fin.t,
  }, stage);
  const s = fin.stab;
  const stabY = kc ? tail.y - 0.2 + fin.height : tail.y - 0.35;
  const stabX = kc ? tailX + fin.sweep + 0.3 : tailX + 0.1;
  for (const side of [-1, 1])
    lifting(g, {
      origin: v3(stabX, stabY, 0),
      span: v3(0, 0, side * s.span),
      chordDir: X.clone(),
      thickDir: Y.clone(),
      root: { chord: s.root, lead: 0 },
      tip: { chord: s.tip, lead: s.sweep },
      t: 0.1,
      ribs: 5,
    }, stage);
  // trem de pouso (rodas) e macacos de apoio
  const wheel = (x, z, r) => put(g, new THREE.CylinderGeometry(r, r, r * 0.6, 16), M.rubber, { position: v3(x, r, z), quaternion: new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2) });
  if (kc) {
    for (const side of [-1, 1]) for (const dx of [-0.8, 0.8]) wheel(wingX + 2 + dx, side * 1.9, 0.55);
    wheel(x0 + 3.2, 0, 0.45);
    for (const side of [-1, 1]) box(g, 4.2, 1.2, 0.9, wingX + 2, 1.2, side * 2.0, M.paint); // carenagem do trem
  } else {
    for (const side of [-1, 1]) {
      wheel(wingX + 0.8, side * 1.6, 0.3);
      tube(g, v3(wingX + 0.8, 0.3, side * 1.6), v3(wingX + 0.8, wingY, side * 1.2), 0.05, M.steel);
    }
    wheel(x0 + 1.4, 0, 0.2);
  }
  // macacos amarelos sob as asas (aeronave em montagem)
  for (const side of [-1, 1]) {
    const jx = wingX + w.root * 0.4,
      jz = side * w.span * 0.55;
    tube(g, v3(jx, 0, jz), v3(jx, wingY - 0.15, jz), kc ? 0.12 : 0.05, M.pad);
    box(g, kc ? 1 : 0.5, 0.15, kc ? 1 : 0.5, jx, 0.07, jz, M.pad);
  }
  // plataformas nas laterais da fuselagem
  const pH = kc ? axisY + 0.4 : 0.6;
  platform(g, x0 + len * 0.55, x0 + len * 0.72, (kc ? KC390.R : 0.6) + 1.3, 1.2, pH);
  bench(g, x0 + len * 0.12, (kc ? 6 : 2.6), 0);
  toolCart(g, x0 + len * 0.2, (kc ? 6.2 : 2.8));
}

function jigsStation(g, aircraft) {
  // depósito: gabaritos vazios guardados em fila (dimensões do KC-390; o Super Tucano usa 0,6x)
  const k = aircraft === "kc390" ? 1 : 0.6;
  const holder = new THREE.Group();
  frameJig(holder, -4.5, 0.5, 0.8, 4.2, 0.55, 3);
  for (const x of [2.4, 3.4, 4.4]) cradle(holder, x, 2.6, 1.7, 0.35);
  portal(holder, 1.2, 1.4, 3.6, 0.3);
  // pilha de travessas e sapatas
  for (let i = 0; i < 4; i++) box(holder, 3.2, 0.22, 0.26, -2, 0.12 + i * 0.24, -2.6 + (i % 2) * 0.05, M.jig);
  for (let i = 0; i < 6; i++) box(holder, 0.3, 0.1, 0.3, -0.4 + i * 0.4, 0.05, -2.6, M.pad);
  bench(holder, 3.3, -2.6, 0);
  holder.scale.setScalar(k);
  g.add(holder);
}

// ---------------- junção por material (menos chamadas de desenho) ----------------

export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    o.geometry.dispose();
  });
  const merged = new THREE.Group();
  buckets.forEach((geos, material) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    merged.add(mesh);
  });
  return merged;
}

// ---------------- entrada ----------------

const BUILDERS = { fuselage: fuselageStation, wing: wingStation, tail: tailStation, final: finalStation, jigs: jigsStation };

export function buildStationModel(rawArea) {
  const area = sanitizeArea(rawArea);
  if (!hasModel(area.type) || !area.points?.length) return null;
  const local = new THREE.Group();
  BUILDERS[area.type](local, area.aircraft, area.stage);
  // centraliza o conjunto no retângulo da área (o modelo pode não ser simétrico)
  const bounds = new THREE.Box3().setFromObject(local);
  const center = bounds.getCenter(new THREE.Vector3());
  local.position.set(-center.x, 0, -center.z);
  const model = mergeByMaterial(local);
  const { rect, scale } = stationFit(area);
  // escala pelo tamanho de verdade do conjunto (garante caber mesmo se o desenho passar do previsto)
  const size = bounds.getSize(new THREE.Vector3());
  const [needL, needW] = FOOTPRINT[area.aircraft][area.type];
  const fitScale = Math.min(scale, (scale * needL) / Math.max(needL, size.x), (scale * needW) / Math.max(needW, size.z));
  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(fitScale);
  root.position.set(rect.cx, 0, rect.cz);
  root.rotation.y = -rect.angle;
  root.userData.station = { type: area.type, aircraft: area.aircraft, stage: area.stage, scale: fitScale };
  return root;
}
