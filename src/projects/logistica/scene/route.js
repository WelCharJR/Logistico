// Rotas a pé dentro do hangar ("GPS" da demonstração). Sem Three.js, para testar no Node.
//
//   const grid = buildGrid(bounds, kanbans, roads)    // chão em células; estantes bloqueadas; estradas marcadas
//   const ranked = rankKanbans(grid, me, kanbans)     // todos os kanbans, do mais perto ao mais longe
//   ranked[0] -> { id, length, roadLength, points, segments: [{ onRoad, points, length }] }
//   routeSteps(route)                                  // instruções: siga / vire / pegue a estrada / saia / chegou
//   pointAlong(points, distance)                       // posição e direção para animar a caminhada
//
// Estradas: andar sobre elas "custa" roadFactor do normal. A rota faz um desvio curto para pegar uma
// estrada perto; se a estrada está longe (ou não existe), ela cria o próprio caminho por fora.

export const ROUTE = {
  cell: 0.5, // tamanho da célula da grade (m)
  rackHalfX: 2.7, // meia largura da estante (5,4 m)
  rackHalfZ: 0.78, // meia profundidade (1,55 m)
  clearance: 0.45, // folga para o corpo da pessoa
  wallMargin: 0.9, // distância mínima das paredes
  approach: 1.1, // onde a pessoa para, à frente da face da estante
  walkSpeed: 1.3, // m/s, passo normal
  roadFactor: 0.5, // custo de andar na estrada (0.5 = vale um desvio de até ~2x para usá-la)
  minRoadRun: 3, // trechos de estrada mais curtos que isso (só atravessar) contam como caminho criado
  minStep: 1, // instruções com menos que isso (m) são juntadas com a vizinha
};

// ---------- grade ----------

const distToSegment = (px, pz, a, b) => {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2)) : 0;
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
};

// roads: [{ points: [{x,z}...], width }] — já amostradas na curva que aparece na tela.
export function buildGrid(bounds, kanbans = [], roads = [], cell = ROUTE.cell) {
  // Origem alinhada à célula: rotas passam por coordenadas "redondas".
  const minX = Math.ceil((bounds.minX + ROUTE.wallMargin) / cell) * cell,
    minZ = Math.ceil((bounds.minZ + ROUTE.wallMargin) / cell) * cell;
  const cols = Math.max(1, Math.floor((bounds.maxX - ROUTE.wallMargin - minX) / cell) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxZ - ROUTE.wallMargin - minZ) / cell) + 1);
  const blocked = new Uint8Array(cols * rows);
  const road = new Uint8Array(cols * rows);
  const span = (lo, hi) => [
    [Math.max(0, Math.floor((lo.x - minX) / cell)), Math.min(cols - 1, Math.ceil((hi.x - minX) / cell))],
    [Math.max(0, Math.floor((lo.z - minZ) / cell)), Math.min(rows - 1, Math.ceil((hi.z - minZ) / cell))],
  ];

  // kanbans: estantes (tamanho padrão). Outros obstáculos (estações) trazem halfX/halfZ próprios.
  for (const k of kanbans) {
    const hx = (k.halfX ?? ROUTE.rackHalfX) + ROUTE.clearance,
      hz = (k.halfZ ?? ROUTE.rackHalfZ) + ROUTE.clearance;
    const r = ((k.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(r),
      sin = Math.sin(r);
    const reach = Math.hypot(hx, hz);
    const [[c0, c1], [r0, r1]] = span({ x: k.x - reach, z: k.z - reach }, { x: k.x + reach, z: k.z + reach });
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

  for (const { points = [], width = 2.4 } of roads) {
    const half = width / 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const [[c0, c1], [r0, r1]] = span(
        { x: Math.min(a.x, b.x) - half, z: Math.min(a.z, b.z) - half },
        { x: Math.max(a.x, b.x) + half, z: Math.max(a.z, b.z) + half },
      );
      for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++)
          if (distToSegment(minX + col * cell, minZ + row * cell, a, b) <= half) road[row * cols + col] = 1;
    }
  }
  for (let i = 0; i < road.length; i++) if (blocked[i]) road[i] = 0;
  return { cols, rows, minX, minZ, cell, blocked, road, hasRoads: road.some(Boolean) };
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

// ---------- custos a partir de um ponto (Dijkstra, 8 direções, sem cortar quina) ----------

function distanceField(grid, startIndex) {
  const n = grid.blocked.length;
  // Float64: com Float32 o arredondamento faz o Dijkstra pular ou repetir células.
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = []; // heap binário de [custo, índice]
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
  const { cols, rows, blocked, road, cell } = grid;
  const weight = (i) => (road[i] ? ROUTE.roadFactor : 1);
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
        const step = (dr && dc ? Math.SQRT2 : 1) * cell * ((weight(i) + weight(j)) / 2);
        const nd = d + step;
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

// onRoad: o atalho também precisa ficar dentro da estrada (senão "corta" a curva por fora).
function clearLine(grid, a, b, onRoad = false) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.cell * 0.35));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const col = (a.x + (b.x - a.x) * t - grid.minX) / grid.cell,
      row = (a.z + (b.z - a.z) * t - grid.minZ) / grid.cell;
    if (onRoad) {
      const c = Math.round(col),
        r = Math.round(row);
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows || !grid.road[r * grid.cols + c]) return false;
    }
    // checa a célula e as vizinhas para manter a folga em diagonais
    for (const c of [Math.floor(col), Math.ceil(col)])
      for (const r of [Math.floor(row), Math.ceil(row)]) {
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return false;
        if (grid.blocked[r * grid.cols + c]) return false;
      }
  }
  return true;
}

export function smooth(grid, points, onRoad = false) {
  if (points.length <= 2) return points.slice();
  const out = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--)
      if (clearLine(grid, points[anchor], points[k], onRoad)) {
        next = k;
        break;
      }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}

export const routeLength = (points) => points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) : 0), 0);

// Divide o caminho (células) em trechos "na estrada" / "caminho criado" e suaviza cada um.
function splitRuns(grid, cells, from) {
  const runs = [];
  cells.forEach((i, n) => {
    const onRoad = !!grid.road[i];
    const point = n === 0 ? { x: from.x, z: from.z } : centerOf(grid, i);
    const last = runs[runs.length - 1];
    if (last && last.onRoad === onRoad) last.points.push(point);
    // o trecho novo começa onde o anterior terminou (sem buraco na linha)
    else runs.push({ onRoad, points: last ? [last.points[last.points.length - 1], point] : [point] });
  });
  // Atravessar uma estrada (trecho curto) não é "pegar a estrada": junta com os vizinhos.
  const merged = [];
  for (const run of runs) {
    const onRoad = run.onRoad && routeLength(run.points) >= ROUTE.minRoadRun;
    const prev = merged[merged.length - 1];
    if (prev && prev.onRoad === onRoad) prev.points.push(...run.points.slice(1));
    else merged.push({ onRoad, points: run.points.slice() });
  }
  const segments = merged
    .map((run) => {
      const pts = run.points.length === 1 ? [run.points[0], run.points[0]] : run.points;
      const points = smooth(grid, pts, run.onRoad);
      return { onRoad: run.onRoad, points, length: routeLength(points) };
    })
    .filter((run) => run.length > 0.01);
  return segments.length ? segments : [{ onRoad: false, points: [{ x: from.x, z: from.z }, centerOf(grid, cells[cells.length - 1])], length: 0 }];
}

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
    for (let i = best.goal; i !== -1; i = prev[i]) cells.push(i);
    cells.reverse();
    if (cells.length === 1) cells.push(cells[0]);
    const segments = splitRuns(grid, cells, from);
    const points = segments.flatMap((s, i) => (i ? s.points.slice(1) : s.points));
    ranked.push({
      id: k.id,
      face: best.face,
      points,
      segments,
      length: routeLength(points),
      roadLength: segments.filter((s) => s.onRoad).reduce((sum, s) => sum + s.length, 0),
    });
  }
  // "Mais perto" = menor distância a pé de verdade (o custo da estrada só escolhe o trajeto).
  return ranked.sort((a, b) => a.length - b.length);
}

// ---------- instruções e caminhada ----------

const TURN_MIN = (25 * Math.PI) / 180; // abaixo disso é "siga em frente"

const turnAt = (a, b, c) => {
  const ax = b.x - a.x,
    az = b.z - a.z,
    bx = c.x - b.x,
    bz = c.z - b.z;
  const angle = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
  if (Math.abs(angle) < TURN_MIN) return null;
  // Visto de cima (y para cima), cruz positiva = virar à direita.
  return angle > 0 ? "right" : "left";
};

// Aceita a rota ({ segments }) ou só a lista de pontos.
// [{ type: "start" | "left" | "right" | "road" | "trail" | "arrive", turn?, onRoad, distance }]
//   road = pegar a estrada aqui; trail = sair dela (caminho criado). distance = metros até o próximo passo.
export function routeSteps(route) {
  const segments = Array.isArray(route) ? [{ onRoad: false, points: route }] : route.segments;
  const points = [],
    roadAt = []; // roadAt[i]: o trecho que termina em points[i] está na estrada
  segments.forEach((s, si) =>
    s.points.forEach((p, pi) => {
      if (si && !pi) return; // ponto de junção já está na lista
      points.push(p);
      roadAt.push(s.onRoad);
    }),
  );
  if (points.length < 2) return [{ type: "arrive", onRoad: false, distance: 0 }];
  const steps = [{ type: "start", onRoad: roadAt[1], distance: 0 }];
  for (let i = 1; i < points.length; i++) {
    steps[steps.length - 1].distance += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    if (i === points.length - 1) break;
    const turn = turnAt(points[i - 1], points[i], points[i + 1]);
    if (roadAt[i + 1] !== roadAt[i]) steps.push({ type: roadAt[i + 1] ? "road" : "trail", turn, onRoad: roadAt[i + 1], distance: 0 });
    else if (turn) steps.push({ type: turn, turn, onRoad: roadAt[i + 1], distance: 0 });
  }
  steps.push({ type: "arrive", onRoad: false, distance: 0 });
  // Passos minúsculos (< 1 m) só poluem as instruções: somam no vizinho.
  const tidy = [];
  for (const step of steps) {
    const prev = tidy[tidy.length - 1];
    if (prev && prev.type !== "arrive" && prev.distance < ROUTE.minStep && step.type !== "arrive") {
      // o passo curto some; o seguinte herda a distância. Entrar/sair da estrada vale mais que a curva:
      // "pegue a estrada" seguido de "vire à direita" logo depois vira "pegue a estrada à direita".
      const event = prev.type === "road" || prev.type === "trail";
      tidy[tidy.length - 1] = event
        ? { ...step, type: prev.type, turn: step.turn || prev.turn, distance: step.distance + prev.distance }
        : { ...step, distance: step.distance + prev.distance };
    } else if (prev && step.type !== "arrive" && step.distance < ROUTE.minStep && step.type !== "road" && step.type !== "trail") {
      prev.distance += step.distance;
    } else tidy.push({ ...step });
  }
  return tidy;
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
