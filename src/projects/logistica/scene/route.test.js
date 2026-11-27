import test from "node:test";
import assert from "node:assert/strict";
import { ROUTE, accessPoints, buildGrid, nearestFree, pointAlong, rankKanbans, routeLength, routeSteps } from "./route.js";

const bounds = { minX: -30, maxX: 30, minZ: -22, maxZ: 22 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// Toda a rota fica fora das estantes (com a folga) e dentro do hangar.
function assertClear(points, kanbans) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps, z = a.z + ((b.z - a.z) * s) / steps;
      assert.ok(x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ, "fora do hangar");
      for (const k of kanbans) {
        const r = ((k.rotation || 0) * Math.PI) / 180, dx = x - k.x, dz = z - k.z;
        const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
        assert.ok(!(Math.abs(lx) < ROUTE.rackHalfX && Math.abs(lz) < ROUTE.rackHalfZ), `atravessa ${k.id} em (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
  }
}

// ---------- estradas ----------

const straightRoad = (z, x0 = -25, x1 = 25) => ({ points: [{ x: x0, z }, { x: x1, z }], width: 2.4 });

test("rota reta, desvio de estante (inclusive girada) e chegada pela face mais perto", () => {
  // sem obstáculo: linha reta, distância = distância em linha reta
  {
    const k = { id: "K", x: 0, z: -10 };
    const grid = buildGrid(bounds, [k]);
    const [r] = rankKanbans(grid, { x: 0, z: 10 }, [k]);
    assert.equal(r.face, "front");
    assert.equal(r.points.length, 2);
    // de z=10 até a frente da estante (z = -10 + meia profundidade + aproximação)
    near(r.length, 20 - (ROUTE.rackHalfZ + ROUTE.approach), 0.3);
  }
  // estante no meio do caminho: desvia sem atravessar
  {
    const wall = { id: "W", x: 0, z: 0 };
    const target = { id: "T", x: 0, z: -12 };
    const kanbans = [wall, target];
    const grid = buildGrid(bounds, kanbans);
    const route = rankKanbans(grid, { x: 0, z: 8 }, kanbans).find((r) => r.id === "T");
    assert.ok(route.points.length > 2, "deveria contornar");
    assertClear(route.points, kanbans);
    assert.ok(route.length > 20 - 1.88);
  }
  // estante girada também bloqueia
  {
    const k = { id: "R", x: 0, z: 0, rotation: 90 };
    const grid = buildGrid(bounds, [k]);
    const col = Math.round((0 - grid.minX) / grid.cell), rowAt = (z) => Math.round((z - grid.minZ) / grid.cell);
    assert.equal(grid.blocked[rowAt(2) * grid.cols + col], 1); // ao longo de z agora
    assert.equal(grid.blocked[rowAt(0) * grid.cols + col + Math.round(2 / grid.cell)], 0); // e livre em x
  }
  // chega pela face mais perto
  {
    const k = { id: "K", x: 0, z: 0 };
    const grid = buildGrid(bounds, [k]);
    assert.equal(rankKanbans(grid, { x: 0, z: -15 }, [k])[0].face, "back");
    const [front, back] = accessPoints({ x: 0, z: 0, rotation: 90 });
    near(front.x, ROUTE.rackHalfZ + ROUTE.approach); near(back.x, -(ROUTE.rackHalfZ + ROUTE.approach));
  }
});

test("vários kanbans: ordem por distância, partida dentro de estante e hangar grande", () => {
  // ordena do mais perto ao mais longe e nunca atravessa estantes
  {
    const kanbans = [
      { id: "K-01", x: -12, z: -5 }, { id: "K-02", x: 6, z: -11, rotation: 30 },
      { id: "K-03", x: 14, z: 6 }, { id: "K-04", x: -2, z: 8, rotation: 90 },
    ];
    const grid = buildGrid(bounds, kanbans);
    const ranked = rankKanbans(grid, { x: 20, z: 19 }, kanbans);
    assert.equal(ranked.length, 4);
    for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i].length >= ranked[i - 1].length);
    ranked.forEach((r) => assertClear(r.points, kanbans));
  }
  // partida dentro de uma estante: começa na célula livre mais perto
  {
    const k = { id: "K", x: 0, z: 0 };
    const grid = buildGrid(bounds, [k]);
    assert.equal(grid.blocked[nearestFree(grid, { x: 0, z: 0 })], 0);
  }
  // hangar grande continua rápido
  {
    const big = { minX: -80, maxX: 80, minZ: -60, maxZ: 60 };
    const kanbans = Array.from({ length: 24 }, (_, i) => ({ id: "K" + i, x: -60 + (i % 6) * 22, z: -45 + Math.floor(i / 6) * 28, rotation: (i * 15) % 90 }));
    const t = performance.now();
    const ranked = rankKanbans(buildGrid(big, kanbans), { x: 70, z: 55 }, kanbans);
    const ms = performance.now() - t;
    assert.equal(ranked.length, 24);
    assert.ok(ms < 2000, "demorou " + ms.toFixed(0) + " ms"); // pega travamento, sem falhar em máquina lenta
  }
});

test("instruções e caminhada", () => {
  // instruções: siga, vire à esquerda/direita, chegou
  {
    // Andando para -z (para o fundo), depois para +x: visto de cima é virar à direita.
    const steps = routeSteps([{ x: 0, z: 0 }, { x: 0, z: -8 }, { x: 5, z: -8 }]);
    assert.deepEqual(steps.map((s) => s.type), ["start", "right", "arrive"]);
    near(steps[0].distance, 8); near(steps[1].distance, 5);
    assert.equal(routeSteps([{ x: 0, z: 0 }, { x: 0, z: -8 }, { x: -5, z: -8 }])[1].type, "left");
    // desvio pequeno não vira instrução
    assert.deepEqual(routeSteps([{ x: 0, z: 0 }, { x: 0, z: -8 }, { x: 1, z: -16 }]).map((s) => s.type), ["start", "arrive"]);
  }
  // caminhada percorre a rota e termina no destino
  {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -4 }, { x: 3, z: -4 }];
    const mid = pointAlong(pts, 5);
    near(mid.x, 1); near(mid.z, -4); assert.equal(mid.done, false);
    near(mid.heading, Math.PI / 2);
    const end = pointAlong(pts, routeLength(pts) + 1);
    near(end.x, 3); near(end.z, -4); assert.equal(end.done, true);
  }
  // passos com menos de 1 m são juntados ao vizinho
  {
    const steps = routeSteps([{ x: 0, z: 0 }, { x: 0, z: -0.5 }, { x: 4, z: -0.5 }, { x: 4, z: -8 }]);
    assert.ok(steps.every((s) => s.type === "arrive" || s.distance >= 1), JSON.stringify(steps));
    near(steps.reduce((sum, s) => sum + s.distance, 0), 0.5 + 4 + 7.5);
    assert.equal(steps.at(-1).type, "arrive");
  }
});

test("estradas: perto usa, longe cria caminho, sem estrada e atravessar não conta", () => {
  // estrada perto: a rota pega a estrada e sai dela no fim
  {
    const k = { id: "K", x: 20, z: 6 };
    const grid = buildGrid(bounds, [k], [straightRoad(0)]);
    const [r] = rankKanbans(grid, { x: -20, z: 3 }, [k]);
    assert.ok(r.roadLength > 30, "andou só " + r.roadLength.toFixed(1) + " m na estrada");
    assert.deepEqual(r.segments.map((s) => s.onRoad), [false, true, false]);
    const types = routeSteps(r).map((s) => s.type);
    assert.ok(types.includes("road") && types.includes("trail"), types.join(","));
    assert.equal(types.at(-1), "arrive");
    // a distância informada é a real, não o "custo" com desconto
    near(r.length, routeLength(r.points));
  }
  // estrada longe: cria o próprio caminho
  {
    const k = { id: "K", x: 20, z: 6 };
    const grid = buildGrid(bounds, [k], [straightRoad(-20)]);
    const [r] = rankKanbans(grid, { x: -20, z: 3 }, [k]);
    assert.equal(r.roadLength, 0);
    assert.ok(r.segments.every((s) => !s.onRoad));
    assert.ok(!routeSteps(r).some((s) => s.type === "road"));
  }
  // sem estrada nenhuma: tudo é caminho criado
  {
    const k = { id: "K", x: 0, z: -10 };
    const grid = buildGrid(bounds, [k]);
    assert.equal(grid.hasRoads, false);
    const [r] = rankKanbans(grid, { x: 0, z: 10 }, [k]);
    assert.equal(r.segments.length, 1);
    assert.equal(r.segments[0].onRoad, false);
  }
  // atravessar uma estrada não vira 'pegue a estrada'
  {
    const k = { id: "K", x: 0, z: -10 };
    const grid = buildGrid(bounds, [k], [straightRoad(0)]);
    const [r] = rankKanbans(grid, { x: 0, z: 10 }, [k]);
    assert.equal(r.roadLength, 0);
    assert.ok(!routeSteps(r).some((s) => s.type === "road"));
  }
});

test("na estrada em L a rota segue a curva por dentro, sem cortar caminho por fora", () => {
  const road = { points: [{ x: -20, z: 15 }, { x: -20, z: -15 }, { x: 20, z: -15 }], width: 2.4 };
  const k = { id: "K", x: 20, z: -11 }; // frente virada para +z
  const grid = buildGrid(bounds, [k], [road]);
  const [r] = rankKanbans(grid, { x: -20, z: 14 }, [k]);
  assert.ok(r.roadLength > 50, "estrada: " + r.roadLength.toFixed(1));
  const half = road.width / 2 + grid.cell; // tolerância de uma célula
  for (const s of r.segments.filter((s) => s.onRoad))
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1], b = s.points[i];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const d = Math.min(Math.abs(x + 20) + Math.max(0, z - 15) + Math.max(0, -15 - z), Math.abs(z + 15) + Math.max(0, -20 - x) + Math.max(0, x - 20));
        assert.ok(d <= half, `saiu da estrada em (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  assert.ok(routeSteps(r).some((s) => s.type === "left" || s.type === "right" || (s.type === "road" && s.turn)), "deveria ter a curva");
});
