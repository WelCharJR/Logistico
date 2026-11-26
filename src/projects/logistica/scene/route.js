// Rotas a pé dentro do hangar ("GPS" da demonstração). Sem Three.js, para testar no Node.
//
//   const grid = buildGrid(bounds, kanbans)           // chão em células; estantes bloqueadas
//   const ranked = rankKanbans(grid, me, kanbans)     // todos os kanbans, do mais perto ao mais longe
//   ranked[0] -> { id, length, points: [{x,z}...] }   // rota já suavizada
//   routeSteps(points)                                 // instruções: siga / vire à esquerda / chegou
//   pointAlong(points, distance)                       // posição e direção para animar a caminhada

export const ROUTE = {
  cell: 0.5, // tamanho da célula da grade (m)
  rackHalfX: 2.7, // meia largura da estante (5,4 m)
  rackHalfZ: 0.78, // meia profundidade (1,55 m)
  clearance: 0.45, // folga para o corpo da pessoa
  wallMargin: 0.9, // distância mínima das paredes
  approach: 1.1, // onde a pessoa para, à frente da face da estante
  walkSpeed: 1.3, // m/s, passo normal
};

// ---------- grade ----------

export function buildGrid(bounds, kanbans = [], cell = ROUTE.cell) {
  // Origem alinhada à célula: rotas passam por coordenadas "redondas".
  const minX = Math.ceil((bounds.minX + ROUTE.wallMargin) / cell) * cell,
    minZ = Math.ceil((bounds.minZ + ROUTE.wallMargin) / cell) * cell;
  const cols = Math.max(1, Math.floor((bounds.maxX - ROUTE.wallMargin - minX) / cell) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxZ - ROUTE.wallMargin - minZ) / cell) + 1);
  const blocked = new Uint8Array(cols * rows);
  const hx = ROUTE.rackHalfX + ROUTE.clearance,
    hz = ROUTE.rackHalfZ + ROUTE.clearance;
  for (const k of kanbans) {
    const r = ((k.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(r),
      sin = Math.sin(r);
    // Retângulo girado: testa só as células dentro do círculo que o contém.
    const reach = Math.hypot(hx, hz);
    const c0 = Math.max(0, Math.floor((k.x - reach - minX) / cell)),
      c1 = Math.min(cols - 1, Math.ceil((k.x + reach - minX) / cell));
    const r0 = Math.max(0, Math.floor((k.z - reach - minZ) / cell)),
      r1 = Math.min(rows - 1, Math.ceil((k.z + reach - minZ) / cell));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        const dx = minX + col * cell - k.x,
          dz = minZ + row * cell - k.z;
        // Para o espaço local da estante (inverso do rotation.y do Three.js).
        const lx = dx * cos - dz * sin,
          lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) blocked[row * cols + col] = 1;
      }
  }
  return { cols, rows, minX, minZ, cell, blocked };
}

const cellOf = (grid, p) => {
  const col = Math.min(grid.cols - 1, Math.max(0, Math.round((p.x - grid.minX) / grid.cell)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.round((p.z - grid.minZ) / grid.cell)));
  return row * grid.cols + col;
};
const centerOf = (grid, i) => ({ x: grid.minX + (i % grid.cols) * grid.cell, z: grid.minZ + Math.floor(i / grid.cols) * grid.cell });

// Célula livre mais próxima (se o ponto caiu dentro de uma estante ou fora do chão).
export function nearestFree(grid, p) {
  const start = cellOf(grid, p);
  if (!grid.blocked[start]) return start;
  const seen = new Uint8Array(grid.blocked.length);
  const queue = [start];
  seen[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (!grid.blocked[i]) return i;
    const col = i % grid.cols,
      row = (i - col) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc,
        r = row + dr;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const n = r * grid.cols + c;
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return -1;
}

// ---------- distâncias a partir de um ponto (Dijkstra, 8 direções, sem cortar quina) ----------

function distanceField(grid, startIndex) {
  const n = grid.blocked.length;
  // Float64: com Float32 o arredondamento faz o Dijkstra pular ou repetir células.
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  // heap binário de [dist, índice]
  const heap = [];
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  dist[startIndex] = 0;
  push(0, startIndex);
  const { cols, rows, blocked, cell } = grid;
  const diag = Math.SQRT2 * cell;
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const col = i % cols,
      row = (i - col) / cols;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc,
          r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const j = r * cols + c;
        if (blocked[j]) continue;
        if (dr && dc && (blocked[row * cols + c] || blocked[r * cols + col])) continue; // não corta quina
        const nd = d + (dr && dc ? diag : cell);
        if (nd < dist[j]) {
          dist[j] = nd;
          prev[j] = i;
          push(nd, j);
        }
      }
  }
  return { dist, prev };
}

// ---------- suavização: liga pontos que se enxergam (linhas retas em vez de "escadinha") ----------

function clearLine(grid, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.cell * 0.35));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    // checa a célula e as vizinhas para manter a folga em diagonais
    const col = (p.x - grid.minX) / grid.cell,
      row = (p.z - grid.minZ) / grid.cell;
    for (const c of [Math.floor(col), Math.ceil(col)])
      for (const r of [Math.floor(row), Math.ceil(row)]) {
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return false;
        if (grid.blocked[r * grid.cols + c]) return false;
      }
  }
  return true;
}

export function smooth(grid, points) {
  if (points.length <= 2) return points.slice();
  const out = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--)
      if (clearLine(grid, points[anchor], points[k])) {
        next = k;
        break;
      }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}

export const routeLength = (points) => points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) : 0), 0);

// Pontos onde a pessoa para: à frente das duas faces da estante (frente e verso têm caixas).
export function accessPoints(k) {
  const r = ((k.rotation || 0) * Math.PI) / 180;
  const nx = Math.sin(r),
    nz = Math.cos(r); // +z local da estante no mundo
  const d = ROUTE.rackHalfZ + ROUTE.approach;
  return [
    { x: k.x + nx * d, z: k.z + nz * d, face: "front" },
    { x: k.x - nx * d, z: k.z - nz * d, face: "back" },
  ];
}

// Todos os kanbans ordenados pela distância a pé a partir de `from`.
// Kanbans sem caminho possível (cercados) ficam de fora.
export function rankKanbans(grid, from, kanbans) {
  const start = nearestFree(grid, from);
  if (start < 0) return [];
  const { dist, prev } = distanceField(grid, start);
  const ranked = [];
  for (const k of kanbans) {
    let best = null;
    for (const access of accessPoints(k)) {
      const goal = nearestFree(grid, access);
      if (goal < 0 || !Number.isFinite(dist[goal])) continue;
      if (!best || dist[goal] < best.cost) best = { cost: dist[goal], goal, face: access.face };
    }
    if (!best) continue;
    const cells = [];
    for (let i = best.goal; i !== -1; i = prev[i]) cells.push(centerOf(grid, i));
    cells.reverse();
    const raw = [{ x: from.x, z: from.z }, ...cells.slice(1)];
    if (cells.length === 1) raw.push(cells[0]);
    const points = smooth(grid, raw);
    ranked.push({ id: k.id, face: best.face, points, length: routeLength(points) });
  }
  return ranked.sort((a, b) => a.length - b.length);
}

// ---------- instruções e caminhada ----------

const TURN_MIN = (25 * Math.PI) / 180; // abaixo disso é "siga em frente"

// [{ type: "start" | "left" | "right" | "arrive", distance }] — distance = metros até o próximo passo.
export function routeSteps(points) {
  if (points.length < 2) return [{ type: "arrive", distance: 0 }];
  const steps = [{ type: "start", distance: 0 }];
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    steps[steps.length - 1].distance += seg;
    if (i === points.length - 1) break;
    const ax = points[i].x - points[i - 1].x,
      az = points[i].z - points[i - 1].z;
    const bx = points[i + 1].x - points[i].x,
      bz = points[i + 1].z - points[i].z;
    const angle = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
    if (Math.abs(angle) < TURN_MIN) continue;
    // Visto de cima (y para cima), cruz positiva = virar à direita.
    steps.push({ type: angle > 0 ? "right" : "left", distance: 0 });
  }
  steps.push({ type: "arrive", distance: 0 });
  return steps;
}

// Posição a `distance` metros do início, com a direção (rad, como rotation.y) do trecho.
export function pointAlong(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (left <= seg || i === points.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading, done: left >= seg && i === points.length - 1 };
    }
    left -= seg;
  }
  const p = points[points.length - 1] || { x: 0, z: 0 };
  return { x: p.x, z: p.z, heading: 0, done: true };
}

export const walkSeconds = (meters) => meters / ROUTE.walkSpeed;
