// Voo da câmera entre dois enquadramentos { x, z, angle, radius, y? } (y = altura do ponto mirado, padrão 0).
// Sem Three.js, para poder ser testado direto no Node.
//   createFlight(from, to, now, { reducedMotion }) -> voo (ou null quando não há o que animar)
//   flightAt(flight, now) -> { x, z, angle, radius, done }

export const FLIGHT = {
  minMs: 650,
  maxMs: 1500,
  msPerUnit: 14, // trajetos longos demoram um pouco mais
  hopFrom: 8, // abaixo disso não sobe no meio do caminho
  hopPerUnit: 0.35,
  maxHop: 28,
};

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Ângulo de chegada equivalente a `to`, mas pelo caminho mais curto a partir de `from`.
export function shortestAngle(from, to) {
  const turn = Math.PI * 2;
  let diff = (to - from) % turn;
  if (diff > Math.PI) diff -= turn;
  if (diff < -Math.PI) diff += turn;
  return from + diff;
}

export function createFlight(from, to, now, { reducedMotion = false } = {}) {
  const target = { ...to, y: to.y ?? 0, angle: shortestAngle(from.angle, to.angle) };
  from = { ...from, y: from.y ?? 0 };
  const distance = Math.hypot(target.x - from.x, target.z - from.z);
  const change = distance + Math.abs(target.y - from.y) + Math.abs(target.radius - from.radius) + Math.abs(target.angle - from.angle) * 10;
  if (reducedMotion || change < 0.01) return { from, to: target, start: now, duration: 0, hop: 0 };
  const duration = Math.min(FLIGHT.maxMs, Math.max(FLIGHT.minMs, FLIGHT.minMs + change * FLIGHT.msPerUnit));
  // Em trajetos longos a câmera sobe no meio do caminho, como um drone, e desce no destino.
  const hop = distance > FLIGHT.hopFrom ? Math.min(FLIGHT.maxHop, (distance - FLIGHT.hopFrom) * FLIGHT.hopPerUnit) : 0;
  return { from, to: target, start: now, duration, hop };
}

export function flightAt(flight, now) {
  const raw = flight.duration > 0 ? Math.min(1, Math.max(0, (now - flight.start) / flight.duration)) : 1;
  const e = easeInOutCubic(raw);
  const lerp = (a, b) => a + (b - a) * e;
  return {
    x: lerp(flight.from.x, flight.to.x),
    z: lerp(flight.from.z, flight.to.z),
    y: lerp(flight.from.y, flight.to.y),
    angle: lerp(flight.from.angle, flight.to.angle),
    radius: lerp(flight.from.radius, flight.to.radius) + flight.hop * Math.sin(Math.PI * raw),
    done: raw >= 1,
  };
}
