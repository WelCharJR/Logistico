// Movimento dos pinos de localização. Sem Three.js, para poder ser testado direto no Node.
//   pinEnter(t, reducedMotion) -> pose do pino t segundos depois de aparecer
//   pinExit(t, reducedMotion)  -> escala t segundos depois de ser desmarcado (0 = pode esconder)

export const PIN = {
  dropHeight: 3.2, // de quanto acima da estante o pino cai
  dropS: 0.8,
  exitS: 0.2,
  bobAmp: 0.12,
  bobSpeed: 2.4,
  pulsePeriod: 1.6,
  shockS: 0.7,
};

// Quique clássico (o mesmo easeOutBounce do CSS/GSAP): bate em 36%, 73% e 91% do tempo.
export function easeOutBounce(x) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

// Instantes (em s) em que o pino toca a estante, e quanto ele achata em cada toque.
const IMPACTS = [
  { at: (1 / 2.75) * PIN.dropS, amount: 0.28 },
  { at: (2 / 2.75) * PIN.dropS, amount: 0.12 },
  { at: (2.5 / 2.75) * PIN.dropS, amount: 0.05 },
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
  const bob = landed ? Math.sin((t - PIN.dropS) * PIN.bobSpeed) * PIN.bobAmp : 0;
  // Onda de choque no chão a partir do primeiro toque.
  const shock = (t - IMPACTS[0].at) / PIN.shockS;
  const shocking = shock >= 0 && shock <= 1;
  // Anéis pulsando em contrafase, só depois de pousar (e entrando aos poucos).
  const ringsIn = landed ? Math.min(1, (t - PIN.dropS) / 0.3) : 0;
  return {
    y: (1 - easeOutBounce(drop)) * PIN.dropHeight + bob,
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
  return 1 - x * x; // acelera ao sumir
}
