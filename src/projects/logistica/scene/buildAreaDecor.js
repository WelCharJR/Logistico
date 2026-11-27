import * as THREE from "three";
import { mat, textTexture } from "./theme.js";
import { ribbonGeometry } from "./buildNavigator.js";
import { AIRCRAFT, AREA_TYPES, hasModel, orientedRect, sanitizeArea } from "./stationLayout.js";

const STATION_LABEL = { working: "Em montagem", waiting: "Aguardando material", stopped: "Parada", idle: "Livre" };


// Identidade da área no piso: faixa zebrada de segurança na borda, nome pintado no chão e um
// totem com andon (torre de luz) + placa. Usa canvas (texturas), então só roda no navegador.

let zebraTexture = null;
function zebra() {
  if (zebraTexture) return zebraTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f2b51d";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#1d2433";
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 16, 0);
    ctx.fill();
  }
  zebraTexture = new THREE.CanvasTexture(canvas);
  zebraTexture.wrapS = THREE.RepeatWrapping;
  zebraTexture.colorSpace = THREE.SRGBColorSpace;
  zebraTexture.anisotropy = 4;
  return zebraTexture;
}
const zebraMat = () => {
  const m = new THREE.MeshStandardMaterial({ map: zebra(), roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  m.userData.shared = true; // a textura é compartilhada entre áreas
  return m;
};
let sharedZebraMat = null;

// Texto do piso e da placa.
export function areaLabel(rawArea) {
  const area = sanitizeArea(rawArea);
  if (!hasModel(area.type)) return { floor: (area.name || "ÁREA").toUpperCase(), sign: area.name || "Área" };
  const aircraft = AIRCRAFT[area.aircraft].label;
  return { floor: AREA_TYPES[area.type].short + " · " + aircraft.toUpperCase(), sign: area.name || AREA_TYPES[area.type].label };
}

// Placa do totem: nome em cima e, embaixo, a situação e o progresso.
function signTexture(title, subtitle, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 224, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 54px Inter, system-ui, sans-serif";
  ctx.fillText(title, 256, subtitle ? 82 : 112, 470);
  if (subtitle) {
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "650 36px Inter, system-ui, sans-serif";
    ctx.fillText(subtitle, 256, 158, 470);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const LAMPS = { red: "#ef4444", yellow: "#f5b014", green: "#22c55e" };

// state (opcional): resultado de stationState — acende o andon e escreve a situação na placa.
export function buildAreaDecor(rawArea, state = null) {
  const area = sanitizeArea(rawArea);
  const group = new THREE.Group();
  if (!area.points || area.points.length < 3) return group;
  const color = AREA_TYPES[area.type].color;

  // faixa zebrada fechando o polígono
  const loop = [...area.points, area.points[0]];
  sharedZebraMat ??= zebraMat();
  const stripe = new THREE.Mesh(ribbonGeometry(loop, 0.32, 0.06), sharedZebraMat);
  stripe.receiveShadow = true;
  group.add(stripe);

  const rect = orientedRect(area.points);
  const cos = Math.cos(rect.angle),
    sin = Math.sin(rect.angle);
  // ponto do retângulo da área em coordenadas locais (u ao longo do comprimento, v na largura)
  const at = (u, v) => new THREE.Vector3(rect.cx + u * cos - v * sin, 0, rect.cz + u * sin + v * cos);
  const { floor, sign } = areaLabel(area);

  // nome pintado no chão, junto à borda da frente (lado +v), lido de fora da área
  if (rect.length > 3 && rect.width > 2) {
    const tex = textTexture(floor, { width: 1024, height: 128, bg: "rgba(0,0,0,0)", fg: color, font: "800 76px Inter, system-ui, sans-serif" });
    const w = Math.min(rect.length * 0.8, Math.max(3, floor.length * 0.5));
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    plane.rotation.order = "YXZ";
    plane.rotation.set(-Math.PI / 2, -rect.angle, 0);
    plane.position.copy(at(0, rect.width / 2 - 0.4 - w / 16)).setY(0.065);
    group.add(plane);
  }

  // totem com andon no canto da frente
  const totem = new THREE.Group();
  const pole = mat("#c9d1dd", { roughness: 0.4, metalness: 0.35 });
  const add = (geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    totem.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat("#363d4b", { roughness: 0.6 }), 0, 0.04, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 10), pole, 0, 1.25, 0);
  // luzes de cima para baixo: vermelha (parada), amarela (aguardando), verde (em montagem).
  // A acesa vem da situação; vermelha e amarela piscam (a cena anima quem tem userData.blink).
  const lit = state ? state.andon : hasModel(area.type) ? "green" : "off";
  ["red", "yellow", "green"].forEach((name, i) => {
    const on = lit === name;
    const lamp = add(
      new THREE.CylinderGeometry(0.13, 0.13, 0.2, 16),
      new THREE.MeshStandardMaterial({
        color: on ? LAMPS[name] : new THREE.Color(LAMPS[name]).multiplyScalar(0.28),
        emissive: on ? LAMPS[name] : "#000000",
        emissiveIntensity: on ? 1.4 : 0,
        roughness: 0.35,
      }),
      0,
      2.6 + (2 - i) * 0.22,
      0,
    );
    if (on && name !== "green") lamp.userData.blink = true;
  });
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16), pole, 0, 3.3, 0);
  // placa com o nome, a situação e o progresso (nas duas faces)
  const subtitle = state && hasModel(area.type) ? (STATION_LABEL[state.status] || "") + (area.type !== "jigs" ? " · " + Math.round(area.progress) + "%" : "") : "";
  const signTex = signTexture(sign, subtitle, color);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  for (const side of [1, -1]) {
    const panel = add(new THREE.PlaneGeometry(1.5, 0.66), signMat, 0, 1.75, side * 0.035);
    panel.rotation.y = side > 0 ? 0 : Math.PI;
  }
  add(new THREE.BoxGeometry(1.56, 0.72, 0.06), mat("#ffffff", { roughness: 0.5 }), 0, 1.75, 0);
  const corner = at(rect.length / 2 - 0.55, rect.width / 2 - 0.55);
  totem.position.copy(corner);
  totem.rotation.y = -rect.angle; // placa voltada para a frente da área (+v)
  group.add(totem);
  return group;
}
