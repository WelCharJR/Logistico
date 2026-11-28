// Movimento dos pinos de localização. Sem Three.js, para poder ser testado direto no Node.
//   pinEnter(t, reducedMotion) -> pose do pino t segundos depois de aparecer
//   pinExit(t, reducedMotion)  -> escala t segundos depois de ser desmarcado (0 = pode esconder)

import { easeOut } from "./hoverMotion.js";

export const PIN = {
  dropHeight: 1.6, // de quanto acima da estante o pino cai
  dropS: 0.45,
  contact: 0.7, // fração da queda em que toca a estante pela primeira vez
  bounce: 0.12, // altura do único quique (fração da queda)
  exitS: 0.15,
  pulsePeriod: 1.6,
  shockS: 0.6,
};

// Queda com um único quique suave: cai acelerando até tocar (em contact) e dá um pulinho só.
// Um painel de operação pede algo firme; três quiques ficavam brincalhões demais.
export function easeOutDrop(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x < PIN.contact) return (x / PIN.contact) ** 2;
  const u = (x - PIN.contact) / (1 - PIN.contact);
  return 1 - PIN.bounce * 4 * u * (1 - u);
}

// Instantes (em s) em que o pino toca a estante, e quanto ele achata em cada toque.
const IMPACTS = [
  { at: PIN.contact * PIN.dropS, amount: 0.22 },
  { at: PIN.dropS, amount: 0.06 },
];

const fadeOut = (x) => Math.max(0, Math.min(1, 1 - x));

export function pinEnter(t, reducedMotion = false) {
  const pulse = (k) => ((t / PIN.pulsePeriod + k) % 1);
  if (reducedMotion) {
    return { y: 0, squash: 0, ringScale: 0.9, ringOpacity: 0.4, ring2Scale: 0.9, ring2Opacity: 0, shockScale: 1, shockOpacity: 0 };
  }
  const drop = Math.min(1, t / PIN.dropS);
  const landed = t >= PIN.dropS;
  // Achatamento: um "soquinho" curto em cada toque, cada vez menor.
  const squash = IMPACTS.reduce((sum, hit) => sum + hit.amount * Math.exp(-Math.pow((t - hit.at) / 0.045, 2)), 0);
  // Onda de choque no chão a partir do primeiro toque.
  const shock = (t - IMPACTS[0].at) / PIN.shockS;
  const shocking = shock >= 0 && shock <= 1;
  // Depois de pousar o pino fica parado; os anéis pulsando bastam para dizer "está aqui".
  const ringsIn = landed ? Math.min(1, (t - PIN.dropS) / 0.3) : 0;
  return {
    y: (1 - easeOutDrop(drop)) * PIN.dropHeight,
    squash,
    ringScale: 0.7 + pulse(0) * 0.45,
    ringOpacity: 0.55 * fadeOut(pulse(0)) * ringsIn,
    ring2Scale: 0.7 + pulse(0.5) * 0.45,
    ring2Opacity: 0.55 * fadeOut(pulse(0.5)) * ringsIn,
    shockScale: shocking ? 0.25 + (1 - Math.pow(1 - shock, 3)) * 1.1 : 1,
    shockOpacity: shocking ? 0.7 * (1 - shock) : 0,
  };
}

export function pinExit(t, reducedMotion = false) {
  if (reducedMotion) return 0;
  const x = Math.min(1, t / PIN.exitS);
  return 1 - easeOut(x); // sai rápido no começo (ease-out), sem atrasar o sumiço
}
