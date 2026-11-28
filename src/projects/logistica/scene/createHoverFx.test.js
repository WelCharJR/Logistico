import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHoverFx } from "./createHoverFx.js";
import { MOTION } from "./hoverMotion.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const rand = () => 0.5;
const BASE = 0.25;

function setup(options = {}) {
  const scene = new THREE.Scene();
  const makeBin = (slotId = "A-1", x = 0) => {
    const bin = new THREE.Group();
    bin.position.set(x, 1, BASE);
    bin.userData.kanbanId = "K-01";
    bin.userData.slotId = slotId;
    scene.add(bin);
    return bin;
  };
  const fx = createHoverFx(scene, { isFilled: () => true, rand, ...options });
  const visible = () => scene.children.filter((o) => o.userData.fx && o.visible).length;
  const fxObjects = () => scene.children.filter((o) => o.userData.fx).length;
  // avança o relógio em passos de 20 ms, como o laço de render faria
  const run = (from, to) => { for (let t = from; t <= to; t += 20) fx.update(t); };
  return { scene, fx, makeBin, visible, fxObjects, run };
}

test("hover: puxa a caixa, devolve ao sair e troca de caixa sem salto", () => {
  // hover puxa a caixa 0,28 para frente em 180 ms
  {
    const { fx, makeBin } = setup();
    const bin = makeBin();
    fx.hover(bin, 0);
    fx.update(0);
    assert.equal(bin.position.z, BASE);
    fx.update(180);
    near(bin.position.z, BASE + MOTION.pullDistance);
  }
  // sair devolve exatamente à posição original
  {
    const { fx, makeBin } = setup();
    const bin = makeBin();
    fx.hover(bin, 0); fx.update(0); fx.update(180);
    fx.hover(null, 200); fx.update(200); fx.update(380);
    assert.equal(bin.position.z, BASE);
  }
  // trocar de caixa no meio do movimento não dá salto
  {
    const { fx, makeBin } = setup();
    const a = makeBin("A-1", 0), b = makeBin("A-2", 1);
    fx.hover(a, 0); fx.update(0); fx.update(90);
    const zA = a.position.z;
    fx.hover(b, 90); fx.update(90);
    near(a.position.z, zA, 1e-9);
    assert.equal(b.position.z, BASE);
    fx.update(270);
    assert.equal(a.position.z, BASE);
    near(b.position.z, BASE + MOTION.pullDistance);
  }
});

test("peças: só em caixa ocupada, 6 por disparo, pausa por caixa e pool limitado", () => {
  // passar o mouse não solta nada (o hover acontece centenas de vezes)
  {
    const { fx, makeBin, visible } = setup();
    fx.hover(makeBin(), 0);
    assert.equal(visible(), 0);
  }
  // abrir uma caixa ocupada solta 6 peças (3 porcas e 3 parafusos), sem repetir na mesma caixa aberta
  {
    const { fx, makeBin, visible } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    assert.equal(visible(), 6);
    fx.open(bin, 10);
    assert.equal(visible(), 6);
  }
  // caixa vazia não puxa no hover e não solta nada ao abrir
  {
    const { fx, makeBin, visible } = setup({ isFilled: () => false });
    const bin = makeBin();
    fx.hover(bin, 0); fx.update(0); fx.update(200);
    assert.equal(bin.position.z, BASE);
    fx.open(bin, 300);
    assert.equal(visible(), 0);
  }
  // pausa de 600 ms por caixa entre disparos
  {
    const { fx, makeBin, visible } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    fx.open(null, 100);
    fx.open(bin, 200);
    assert.equal(visible(), 6);
    fx.open(null, 300);
    fx.open(bin, 700);
    assert.equal(visible(), 12);
  }
  // pool de 30 peças: o sexto disparo simultâneo é ignorado
  {
    const { fx, makeBin, visible, fxObjects } = setup();
    const bins = Array.from({ length: 6 }, (_, i) => makeBin(`A-${i + 1}`, i));
    bins.forEach((bin, i) => fx.open(bin, i * 10));
    assert.equal(visible(), 30);
    assert.equal(fxObjects(), 30);
  }
  // peças voltam ao pool depois da vida e podem ser reutilizadas
  {
    const { fx, makeBin, visible, fxObjects, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    run(0, 1600);
    assert.equal(visible(), 0);
    fx.open(null, 1700);
    fx.open(bin, 2000);
    assert.equal(visible(), 6);
    assert.equal(fxObjects(), 30);
  }
});

test("peças: nascem acima da caixa, caem e somem com fade", () => {
  // peças somem com fade no fim da vida
  {
    const { scene, fx, makeBin, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    run(0, 1300);
    const opacities = [];
    scene.children.filter((o) => o.userData.fx && o.visible).forEach((o) =>
      o.traverse((c) => { if (c.isMesh) opacities.push(c.material.opacity); }));
    assert.ok(opacities.length > 0);
    assert.ok(opacities.every((v) => v > 0 && v < 1), `opacidades: ${opacities}`);
  }
  // peças nascem acima da caixa e caem com a gravidade
  {
    const { scene, fx, makeBin, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    const first = scene.children.find((o) => o.userData.fx && o.visible);
    fx.update(0);
    assert.ok(first.position.y > 1.1, `y inicial ${first.position.y}`);
    run(20, 1000);
    assert.ok(first.position.y < 0.5, `y depois de cair ${first.position.y}`);
  }
});

test("movimento reduzido e tela de toque", () => {
  // reducedMotion: puxada menor e nenhuma peça
  {
    const { fx, makeBin, visible } = setup({ reducedMotion: true });
    const bin = makeBin();
    fx.hover(bin, 0); fx.update(0); fx.update(180);
    near(bin.position.z, BASE + MOTION.reducedPullDistance);
    assert.equal(visible(), 0);
  }
  // enabled:false não cria objetos nem mexe na caixa
  {
    const { scene, fx, makeBin } = setup({ enabled: false });
    const bin = makeBin();
    const before = scene.children.length;
    fx.hover(bin, 0); fx.update(0); fx.update(200); fx.hover(null, 300); fx.dispose();
    assert.equal(scene.children.length, before);
    assert.equal(bin.position.z, BASE);
  }
  // enabled:false (toque): sem hover, mas abrir funciona
  {
    const { scene, fx, makeBin, run } = setup({ enabled: false });
    const before = scene.children.length;
    const bin = makeBin();
    fx.hover(bin, 0); run(0, 200);
    assert.equal(bin.position.z, BASE);
    fx.open(bin, 200); run(200, 600);
    near(bin.position.z, BASE + MOTION.openDistance);
    assert.equal(scene.children.length, before + 1); // só a caixa, nenhuma peça
  }
});

test("abrir caixa: sai, sobe e inclina; uma aberta por vez; hover não recolhe; verso inclina para o lado dele", () => {
  // abrir: a caixa sai mais que no hover, sobe e inclina; fechar devolve tudo
  {
    const { fx, makeBin, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    run(0, MOTION.openMs + 20);
    near(bin.position.z, BASE + MOTION.openDistance);
    near(bin.position.y, 1 + MOTION.openLift);
    near(bin.rotation.x, MOTION.openTilt);
    assert.equal(fx.opened(), bin);
    fx.open(null, 400);
    run(400, 400 + MOTION.openMs + 20);
    assert.equal(bin.position.z, BASE);
    assert.equal(bin.position.y, 1);
    assert.equal(bin.rotation.x, 0);
    assert.equal(fx.opened(), null);
  }
  // hover numa caixa aberta não a recolhe
  {
    const { fx, makeBin, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0);
    fx.hover(bin, 0);
    run(0, 400);
    fx.hover(null, 400);
    run(400, 800);
    near(bin.position.z, BASE + MOTION.openDistance);
  }
  // abrir outra caixa fecha a anterior
  {
    const { fx, makeBin, run } = setup();
    const a = makeBin("A-1"), b = makeBin("A-2", 0.5);
    fx.open(a, 0); run(0, 400);
    fx.open(b, 400); run(400, 800);
    assert.equal(a.position.z, BASE);
    near(b.position.z, BASE + MOTION.openDistance);
  }
  // caixa do verso inclina para o lado dela
  {
    const { fx, makeBin, run } = setup();
    const bin = makeBin();
    bin.userData.pullDirection = -1;
    fx.open(bin, 0); run(0, 400);
    near(bin.position.z, BASE - MOTION.openDistance);
    near(bin.rotation.x, -MOTION.openTilt);
  }
});

test("dispose e hover(null) devolvem tudo ao lugar", () => {
  // dispose remove os objetos e devolve a caixa à posição original
  {
    const { fx, makeBin, fxObjects } = setup();
    const bin = makeBin();
    fx.hover(bin, 0); fx.update(0); fx.update(100);
    assert.notEqual(bin.position.z, BASE);
    fx.dispose();
    assert.equal(fxObjects(), 0);
    assert.equal(bin.position.z, BASE);
  }
  // hover(null) sem nada em andamento não quebra
  {
    const { fx } = setup();
    assert.doesNotThrow(() => { fx.hover(null, 0); fx.update(0); fx.dispose(); });
  }
  // dispose devolve a caixa aberta à posição original
  {
    const { fx, makeBin, run } = setup();
    const bin = makeBin();
    fx.open(bin, 0); run(0, 200);
    fx.dispose();
    assert.equal(bin.position.z, BASE);
    assert.equal(bin.position.y, 1);
    assert.equal(bin.rotation.x, 0);
  }
});
