import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildHall } from "../scene/buildHall.js";
import { buildKanban, paintBins } from "../scene/buildKanban.js";
import { buildProps } from "../scene/buildProps.js";
import { createPins } from "../scene/buildPins.js";
import { COLORS, disposeTree } from "../scene/theme.js";
import { HALL_DEFAULT, hallBounds } from "../scene/hallSize.js";
import { disposeFadeClones, findOccluders, ownersOf, setRackOpacity } from "../scene/occlusion.js";
import { buildAreaMesh, buildPath } from "../scene/buildDrawn.js";
import { buildAreaDecor } from "../scene/buildAreaDecor.js";
import { buildStationModel, createTimelapse } from "../scene/buildStation.js";
import { stageChangePhases, sweepProgress, timelapsePhases } from "../scene/stageSweep.js";
import { applyPose, buildWorkers, workerPose } from "../scene/buildWorkers.js";
import { createDayNight } from "../scene/dayNight.js";
import { createPreview } from "../scene/createPreview.js";
import { createHoverFx } from "../scene/createHoverFx.js";
import { createFlight, flightAt } from "../scene/cameraFlight.js";
import { CONTENTS_LAYER } from "../scene/binModel.js";
import { createNavigator } from "../scene/buildNavigator.js";
import { pointAlong } from "../scene/route.js";
import { STATUS, slotStatus } from "../data/stock.js";
import { clampCenter, moveArea, orientedRect, sanitizeArea } from "../scene/stationLayout.js";
import { flowLinks, stationState, supplyLinks } from "../data/stationStatus.js";
import { buildSupply } from "../scene/buildSupply.js";
import { buildFlow } from "../scene/buildFlow.js";

// Cena Three.js do hangar: câmera, luzes, galpão, kanbans, áreas, caminhos e mouse.
// Só é recriada quando muda a posição dos kanbans, as áreas ou os caminhos (mesmas dependências de antes).
export const DEFAULT_VIEW = { x: 1, z: -7, radius: 52, angle: 0.63 };

// Quanto o galpão é maior que o padrão: usado para afastar a câmera e escalar névoa e sombra.
export const hallScale = (hall) => {
  const { width, depth } = hallBounds(hall);
  return Math.max(1, width / HALL_DEFAULT.width, depth / HALL_DEFAULT.depth);
};
export const overviewFor = (hall) => {
  const k = hallScale(hall);
  return { ...DEFAULT_VIEW, z: DEFAULT_VIEW.z * k, radius: DEFAULT_VIEW.radius * k };
};

export function useHangarScene({
  canvas,
  layout,
  kanbanPositions,
  selectedId = null,
  showStructure,
  showGrid,
  refs,
  setters,
}) {
  const { toolRef, draftRef, pathTypeRef, snapRef, layerRefs, clearPreviewRef, zoomRef, focusRef, viewRef, viewOnlyRef, marksRef, openSlotRef, navRef, selectedRef, presetRef, dayModeRef, timelapseRef } =
    refs;
  const {
    setLayout,
    setSelected,
    setSelectedSlotId,
    setNotice,
    setDraft,
    setCursorWorld,
    setCursorScreen,
  } = setters;

  // Sempre o layout mais recente (a cena não é recriada ao adicionar ou editar itens).
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const slotGroupsRef = useRef([]);
  // Recolore as caixas quando o conteúdo muda (cadastro, remoção, quantidade, conferência), sem recriar a cena.
  const slotsKey = layout.kanbans
    .map((k) => k.id + ":" + k.slots.map((s) => (s.code ? [s.code, s.qty, s.min, s.capacity, s.checkedAt].join(",") : "")).join(";"))
    .join("|");
  useEffect(() => {
    paintBins(slotGroupsRef.current, layoutRef.current.kanbans);
  }, [slotsKey]);

  // A cena só é recriada quando entram/saem kanbans ou muda o tamanho do hangar. Mover/girar um
  // kanban e editar áreas/caminhos atualiza só o que mudou (recriar tudo dava uma travada).
  const sceneApiRef = useRef(null);
  const kanbanIds = layout.kanbans.map((k) => k.id).join("|");
  useEffect(() => {
    sceneApiRef.current?.placeKanbans(layout.kanbans);
  }, [kanbanPositions]); // eslint-disable-line react-hooks/exhaustive-deps
  // Área selecionada: linhas de abastecimento dos kanbans que têm os materiais dela.
  useEffect(() => {
    sceneApiRef.current?.showSupply(selectedId);
  }, [selectedId, slotsKey, layout.areas, kanbanPositions]); // eslint-disable-line react-hooks/exhaustive-deps
  // slotsKey também: uma caixa que acaba pode deixar uma estação "aguardando material".
  useEffect(() => {
    sceneApiRef.current?.syncDrawn(layout.areas, layout.paths);
  }, [layout.areas, layout.paths, slotsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hallKey = (layout.hall?.width || "") + "x" + (layout.hall?.depth || "");
  useEffect(() => {
    const host = canvas.current;
    const layout = layoutRef.current; // o mais recente (a cena não depende mais das posições)
    const bounds = hallBounds(layout.hall);
    const k = hallScale(layout.hall);
    const overviewView = overviewFor(layout.hall);
    const maxRadius = 100 * k;
    // { reset: true } pede para enquadrar o galpão inteiro em vez de manter a câmera anterior.
    const savedView = viewRef.current?.reset ? null : viewRef.current;
    viewRef.current = savedView;
    const scene = new THREE.Scene();
    const previewGroup = new THREE.Group();
    scene.add(previewGroup);
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(COLORS.sky, 110 * k, 230 * k);
    // Câmera com abertura pequena: perspectiva quase isométrica, como uma maquete.
    const camera = new THREE.PerspectiveCamera(30, host.clientWidth / host.clientHeight, 0.5, 400 * k);
    camera.layers.enable(CONTENTS_LAYER); // peças dentro das caixas (fora do raycast)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true; // timelapse da montagem corta a peça com planos
    host.appendChild(renderer.domElement);

    // Luz do céu + sol com sombra suave + luz de preenchimento sem sombra.
    const hemi = new THREE.HemisphereLight(0xffffff, 0xc4cee0, 1.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-22 * k, 38 * k, 26 * k);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -bounds.width / 2 - 18, right: bounds.width / 2 + 18, top: bounds.depth / 2 + 18, bottom: -bounds.depth / 2 - 18, near: 1, far: 140 * k });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe7ff, 0.7);
    fill.position.set(30, 18, -10);
    scene.add(fill);

    const gridLayer = new THREE.Group();
    scene.add(gridLayer);
    const grid = new THREE.GridHelper(bounds.width, bounds.width, "#b6c3db", "#d9e0ec");
    grid.scale.z = bounds.depth / bounds.width;
    grid.position.y = 0.008;
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    grid.material.depthWrite = false;
    gridLayer.add(grid);
    const structureLayer = new THREE.Group();
    structureLayer.visible = showStructure;
    scene.add(structureLayer);
    gridLayer.visible = showGrid;
    layerRefs.current = { structure: structureLayer, grid: gridLayer };
    buildHall(scene, structureLayer, bounds);
    const hasMatchMedia = typeof window.matchMedia === "function";
    const media = (query) => hasMatchMedia && window.matchMedia(query).matches;
    const reducedMotion = media("(prefers-reduced-motion: reduce)");
    const props = buildProps(scene, { reducedMotion, bounds });
    const dayNight = createDayNight({ scene, renderer, sun, hemi, fill, bounds, k, structureLayer, reducedMotion });
    structureLayer.add(props.group); // enfeites somem junto com a estrutura
    const kanbanMeshes = new Map();
    const slotGroups = [];
    slotGroupsRef.current = slotGroups;
    const drawnMeshes = [];
    layout.kanbans.forEach((k) => {
      const group = buildKanban(k);
      group.traverse((object) => { if (object.userData.slotId) slotGroups.push(object); });
      scene.add(group);
      kanbanMeshes.set(k.id, group);
    });
    // Áreas e caminhos: cada um é refeito só quando os próprios dados mudam.
    // Área = piso colorido + faixa zebrada/nome/andon + estação (gabarito e peça), num grupo só:
    // clicar em qualquer parte seleciona a área.
    const drawnById = new Map(); // "area:A-1" -> { key, root }
    const blinking = new Set(); // luzes do andon que piscam (amarela/vermelha)
    const workers = new Set(); // operadores nas estações (animados no draw)
    let flow = null,
      flowKey = "";
    const removeDrawn = (id) => {
      const entry = drawnById.get(id);
      if (!entry) return;
      entry.root.traverse((o) => {
        blinking.delete(o);
        workers.delete(o);
      });
      scene.remove(entry.root);
      disposeTree(entry.root);
      drawnMeshes.splice(drawnMeshes.indexOf(entry.root), 1);
      drawnById.delete(id);
    };
    const putDrawn = (id, key, build) => {
      const current = drawnById.get(id);
      if (current && current.key === key) return;
      removeDrawn(id);
      const root = build();
      if (!root) return;
      root.traverse((o) => {
        if (o.userData.blink) blinking.add(o);
        if (o.userData.worker) workers.add(o);
      });
      scene.add(root);
      drawnMeshes.push(root);
      drawnById.set(id, { key, root });
    };
    // Varreduras da peça (plano de corte): o timelapse pedido pelo app (timelapseRef: { id, ms,
    // onTick, onDone }) e a troca curta de etapa quando o progresso cruza 34% ou 80%. Enquanto
    // varre, o modelo de verdade some e entra o modelo cortado; no fim, volta o de verdade.
    const sweeps = new Map(); // id da área -> { model, phases, start, request?, lastTick }
    const stationOf = (root) => root?.children.find((c) => c.userData.station);
    const endSweep = (id, finished) => {
      const sweep = sweeps.get(id);
      if (!sweep) return;
      scene.remove(sweep.model.group);
      sweep.model.dispose();
      const station = stationOf(drawnById.get("area:" + id)?.root);
      if (station) station.visible = true;
      sweeps.delete(id);
      if (finished) sweep.request?.onDone?.();
    };
    const startSweep = (area, phases, request = null) => {
      endSweep(area.id, false);
      const model = phases.length ? createTimelapse(area) : null;
      if (!model) return false;
      scene.add(model.group);
      sweeps.set(area.id, { model, phases, start: performance.now(), request, lastTick: 0 });
      return true;
    };
    let timelapseRequest = null;
    const updateSweeps = (time) => {
      const request = timelapseRef?.current || null;
      if (request !== timelapseRequest) {
        if (timelapseRequest && sweeps.get(timelapseRequest.id)?.request === timelapseRequest) endSweep(timelapseRequest.id, false);
        timelapseRequest = request;
        const area = request && layoutRef.current.areas.find((a) => a.id === request.id);
        const real = area && sanitizeArea(area).stage;
        if (request && !(area && startSweep(area, timelapsePhases(real, { ms: request.ms, reducedMotion }), request))) {
          timelapseRef.current = timelapseRequest = null;
          request.onDone?.();
        }
      }
      sweeps.forEach((sweep, id) => {
        const station = stationOf(drawnById.get("area:" + id)?.root); // a área pode ter sido refeita no meio
        if (station) station.visible = false;
        const { progress, done } = sweepProgress(sweep.phases, time - sweep.start);
        sweep.model.setProgress(progress);
        sweep.model.update(time, { reducedMotion });
        if (sweep.request && (time - sweep.lastTick > 100 || done)) {
          sweep.lastTick = time;
          sweep.request.onTick?.(progress);
        }
        if (done) endSweep(id, true);
      });
    };
    const syncDrawn = (areas, paths) => {
      const seen = new Set();
      const kanbans = layoutRef.current.kanbans;
      areas.forEach((area) => {
        const id = "area:" + area.id;
        seen.add(id);
        const a = sanitizeArea(area);
        const state = stationState(area, kanbans);
        const before = stationOf(drawnById.get(id)?.root)?.userData.station;
        // refaz a área só se mudar algo que aparece: forma, peça, etapa, nome, progresso ou andon
        putDrawn(id, JSON.stringify([a.points, a.type, a.aircraft, a.stage, a.name, Math.round(a.progress), state.status]), () => {
          const root = new THREE.Group();
          root.userData.id = area.id;
          root.userData.kind = "area";
          root.add(buildAreaMesh(area), buildAreaDecor(area, state));
          const station = buildStationModel(area);
          if (station) root.add(station, buildWorkers(area, state.status));
          return root;
        });
        // cruzou de etapa (ex.: esqueleto -> revestimento): varredura curta em vez de trocar seco
        const sameModel = before && before.type === a.type && before.aircraft === a.aircraft;
        if (!reducedMotion && sameModel && before.stage !== a.stage && !sweeps.get(area.id)?.request) startSweep(area, stageChangePhases(before.stage, a.stage));
      });
      paths.forEach((path) => {
        if (path.points.length < 2) return;
        const id = "path:" + path.id;
        seen.add(id);
        putDrawn(id, JSON.stringify(path), () => buildPath(path));
      });
      [...drawnById.keys()].filter((id) => !seen.has(id)).forEach(removeDrawn);
      // setas do fluxo da linha (fuselagem/asa/cauda -> montagem final)
      const links = flowLinks(areas);
      const key = JSON.stringify([links, links.flatMap((l) => [l.from, l.to]).map((lid) => areas.find((x) => x.id === lid)?.points)]);
      if (key !== flowKey) {
        flowKey = key;
        if (flow) {
          scene.remove(flow.group);
          flow.dispose();
        }
        flow = links.length ? buildFlow(areas, links, { reducedMotion }) : null;
        if (flow) scene.add(flow.group);
      }
    };
    syncDrawn(layout.areas, layout.paths);
    const drawnRoot = (id) => drawnById.get("area:" + id)?.root;
    let supply = null;
    const showSupply = (id) => {
      if (supply) {
        scene.remove(supply.group);
        supply.dispose();
        supply = null;
      }
      const area = id && layoutRef.current.areas.find((a) => a.id === id);
      if (!area) return;
      const links = supplyLinks(area, layoutRef.current.kanbans);
      if (!links.length) return;
      const r = orientedRect(area.points);
      supply = buildSupply(links, {
        from: (kid) => kanbanMeshes.get(kid)?.position,
        to: { x: r.cx, z: r.cz },
        reducedMotion,
      });
      scene.add(supply.group);
    };
    showSupply(selectedRef?.current);
    sceneApiRef.current = {
      showSupply,
      syncDrawn,
      // mover/girar kanban: só reposiciona a estante (a que está sendo arrastada fica com o mouse)
      placeKanbans: (kanbans) =>
        kanbans.forEach((k) => {
          const m = kanbanMeshes.get(k.id);
          if (!m || controls.dragging === k.id) return;
          m.position.set(k.x, 0, k.z);
          m.rotation.y = THREE.MathUtils.degToRad(k.rotation || 0);
        }),
    };
    // Telas em pé (celular) precisam de mais distância para caber o galpão.
    const overview = (r) => (r === overviewView.radius && host.clientWidth < host.clientHeight ? r * 1.6 : r);
    const controls = {
      down: false,
      lastX: 0,
      lastY: 0,
      angle: savedView?.angle ?? 0.63,
      angleGoal: savedView?.angle ?? 0.63,
      radius: savedView?.radius ?? overview(overviewView.radius),
      radiusGoal: savedView?.radius ?? overview(overviewView.radius),
      target: new THREE.Vector3(savedView?.x ?? overviewView.x, 0, savedView?.z ?? overviewView.z),
      targetGoal: new THREE.Vector3(savedView?.x ?? overviewView.x, 0, savedView?.z ?? overviewView.z),
      dragging: null,
      flight: null, // voo em andamento (focusRef); interrompido por qualquer gesto do usuário
    };
    // Para o voo onde a câmera está agora: os gestos seguintes partem daí.
    const stopFlight = () => {
      if (!controls.flight) return;
      controls.flight = null;
      controls.targetGoal.copy(controls.target);
      controls.angleGoal = controls.angle;
      controls.radiusGoal = controls.radius;
    };
    let hoveredSlot = null;
    let clickStart = null;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const activePointers = new Map();
    let pinchDistance = 0;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit = new THREE.Vector3();
    const updatePointer = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    function cameraUpdate() {
      camera.position.set(
        controls.target.x + Math.sin(controls.angle) * controls.radius,
        controls.target.y + controls.radius * 0.9,
        controls.target.z + Math.cos(controls.angle) * controls.radius,
      );
      camera.lookAt(controls.target);
    }
    cameraUpdate();
    // Estantes esmaecidas (na frente do que se quer ver) não recebem cliques nem hover:
    // o clique passa para a estante de trás.
    const pickableRacks = () => [...kanbanMeshes.values()].filter((g) => (g.userData.fadeGoal ?? 1) === 1);
    const snapPoint = (x, z) =>
      snapRef.current
        ? { x: Math.round(x), z: Math.round(z) }
        : { x: Number(x.toFixed(1)), z: Number(z.toFixed(1)) };
    const preview = createPreview(previewGroup, toolRef, pathTypeRef);
    const clearPreview = preview.clear,
      refreshPreview = preview.refresh;
    clearPreviewRef.current = clearPreview;
    // Prévia da estação pronta (ferramenta de área com tamanho escolhido): retângulo que segue o mouse.
    const ghost = new THREE.Group();
    ghost.visible = false;
    const ghostFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    );
    ghostFill.rotation.x = -Math.PI / 2;
    ghostFill.position.y = 0.08;
    const ghostEdge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => new THREE.Vector3(x, 0.09, z))),
      new THREE.LineBasicMaterial({ color: COLORS.blue }),
    );
    // seta na ponta "da frente" (eixo comprido), para ver para onde a peça aponta ao girar
    const ghostArrow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 3), new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.7 }));
    ghostArrow.rotation.x = -Math.PI / 2;
    ghost.add(ghostFill, ghostEdge, ghostArrow);
    scene.add(ghost);
    // Mostra a prévia centrada no ponto (presa dentro do hangar); devolve o centro usado.
    const showGhost = (point) => {
      const p = presetRef?.current;
      if (!p) return (ghost.visible = false), null;
      const c = clampCenter(point.x, point.z, p.length, p.width, p.angle, bounds);
      ghost.position.set(c.x, 0, c.z);
      ghost.rotation.y = -p.angle;
      ghostFill.scale.set(p.length, p.width, 1);
      ghostEdge.scale.set(p.length, 1, p.width);
      ghostArrow.position.set(p.length / 2 - 1, 0.1, 0);
      for (const m of [ghostFill.material, ghostEdge.material, ghostArrow.material]) m.color.set(p.color || COLORS.blue);
      ghost.visible = true;
      return c;
    };
    // Puxada da caixa e porcas/parafusos no hover: só com mouse e respeitando "reduzir movimento".
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 144;
    const labelContext = labelCanvas.getContext("2d");
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const labelSprite = new THREE.Sprite(labelMaterial);
    labelSprite.scale.set(3.2, 0.9, 1);
    labelSprite.renderOrder = 20;
    labelSprite.visible = false;
    scene.add(labelSprite);
    const labelWorldPosition = new THREE.Vector3();
    let labelKey = "";
    let labelBin = null;
    let labelShownAt = 0;
    const updateLabel = (bin) => {
      if (!bin) { labelSprite.visible = false; labelKey = ""; return; }
      const item = layoutRef.current.kanbans.find((k) => k.id === bin.userData.kanbanId)?.slots.find((slot) => slot.id === bin.userData.slotId);
      if (!item) return;
      const state = slotStatus(item);
      const key = [bin.userData.kanbanId, item.id, item.code, item.name, item.qty, item.unit, state.status].join("|");
      // cor da situação do estoque (barra lateral e última linha)
      const toneColor = { green: "#16884a", amber: "#a86b00", red: "#d1343a", gray: "#5d6778" }[STATUS[state.status]?.tone] || "#2f55e4";
      if (key !== labelKey) {
        labelKey = key;
        labelContext.clearRect(0, 0, 512, 144);
        labelContext.fillStyle = "#ffffff";
        labelContext.beginPath(); labelContext.roundRect(4, 4, 504, 136, 22); labelContext.fill();
        labelContext.strokeStyle = "#dfe5ef";
        labelContext.lineWidth = 3;
        labelContext.stroke();
        labelContext.fillStyle = item.code ? toneColor : "#aab6cc";
        labelContext.beginPath(); labelContext.roundRect(22, 26, 8, 92, 4); labelContext.fill();
        labelContext.textAlign = "left";
        labelContext.fillStyle = "#1d2433";
        labelContext.font = "800 31px Inter, system-ui, sans-serif";
        labelContext.fillText(item.code || "Caixa vazia", 46, 50, 440);
        labelContext.fillStyle = "#5b6578";
        labelContext.font = "500 23px Inter, system-ui, sans-serif";
        labelContext.fillText(item.name || "Sem material cadastrado", 46, 84, 440);
        labelContext.fillStyle = item.code ? toneColor : "#2f55e4";
        labelContext.font = "700 20px Inter, system-ui, sans-serif";
        const where = bin.userData.kanbanId + " · " + item.id;
        labelContext.fillText(item.code ? where + " · " + item.qty + " " + item.unit + " · " + STATUS[state.status].label : where, 46, 116, 440);
        labelTexture.needsUpdate = true;
      }
      labelSprite.visible = true;
    };
    const hoverFx = createHoverFx(scene, {
      enabled: !hasMatchMedia || media("(hover: hover)"),
      reducedMotion,
      isFilled: (kanbanId, slotId) =>
        !!layoutRef.current.kanbans
          .find((k) => k.id === kanbanId)
          ?.slots?.find((slot) => slot.id === slotId)?.code,
    });
    zoomRef.current = (amount) => {
      stopFlight();
      controls.radiusGoal = Math.max(9, Math.min(maxRadius, controls.radiusGoal + amount));
    };
    // y: altura do ponto mirado (0 = chão; a busca mira na prateleira da caixa).
    focusRef.current = (x, z, radius = 10, angle = 0.63, y = 0) => {
      const from = { x: controls.target.x, z: controls.target.z, y: controls.target.y, angle: controls.angle, radius: controls.radius };
      controls.flight = createFlight(from, { x, z, y, angle, radius: y > 0 ? radius : overview(radius) }, performance.now(), { reducedMotion });
      const to = controls.flight.to;
      controls.targetGoal.set(to.x, to.y, to.z);
      controls.angleGoal = to.angle;
      controls.radiusGoal = to.radius;
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stopFlight();
      if (activePointers.size > 1) {
        controls.dragging = null;
        controls.down = true;
        const points = [...activePointers.values()];
        pinchDistance = Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y);
        renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
      hoverFx.hover(null, performance.now());
      hoveredSlot = null;
      controls.down = true;
      clickStart = { x: e.clientX, y: e.clientY, bin: null };
      controls.lastX = e.clientX;
      controls.lastY = e.clientY;
      const screen = updatePointer(e);
      setCursorScreen(screen);
      raycaster.setFromCamera(pointer, camera);
      // GPS: escolhendo "minha posição" — o clique no chão vira a localização.
      if (navRef?.current?.picking && raycaster.ray.intersectPlane(plane, hit)) {
        navRef.current.onPick?.({ x: hit.x, z: hit.z });
        controls.down = false;
        clickStart = null;
        return;
      }
      // Estação pronta: um clique coloca a área no tamanho escolhido.
      if (!viewOnlyRef.current && toolRef.current === "area" && presetRef?.current) {
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const c = showGhost(snapPoint(hit.x, hit.z));
          if (c) presetRef.current.onPlace?.(c);
        }
        controls.down = false;
        return;
      }
      if (!viewOnlyRef.current && (toolRef.current === "area" || toolRef.current === "path")) {
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const point = snapPoint(hit.x, hit.z);
          const next = [...draftRef.current, point];
          draftRef.current = next;
          setDraft(next);
          setCursorWorld(point);
          refreshPreview(next, null);
        }
        controls.down = false;
        return;
      }
      const hits = raycaster.intersectObjects([...pickableRacks(), ...drawnMeshes], true);
      if (hits.length) {
        const hitObject = hits[0].object;
        let slotOwner = null;
        let o = hitObject;
        while (o.parent && !o.userData.id) {
          if (o.userData.slotId) slotOwner = o;
          o = o.parent;
        }
        controls.dragging = viewOnlyRef.current || o.userData.kind ? null : o.userData.id;
        // Área já selecionada: arrastar move a área (a primeira vez só seleciona, para não atrapalhar a câmera).
        if (!viewOnlyRef.current && o.userData.kind === "area" && selectedRef?.current === o.userData.id && raycaster.ray.intersectPlane(plane, hit)) {
          controls.draggingArea = { id: o.userData.id, root: o, start: snapPoint(hit.x, hit.z), dx: 0, dz: 0 };
        }
        setSelected(o.userData.id);
        if (clickStart) clickStart.bin = slotOwner;
        if (slotOwner) {
          setSelectedSlotId(slotOwner.userData.slotId);
          setNotice(`${o.userData.id} · caixa ${slotOwner.userData.slotId}`);
        } else {
          setSelectedSlotId(null);
        }
      }
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size > 1) {
        const points = [...activePointers.values()];
        const nextDistance = Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y);
        controls.radiusGoal = Math.max(9, Math.min(maxRadius, controls.radiusGoal + (pinchDistance-nextDistance)*0.08));
        pinchDistance = nextDistance;
        return;
      }
      if (!controls.down) {
        if (toolRef.current === "select") {
          updatePointer(e);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(pickableRacks(), true)[0]?.object;
          let owner = hit;
          while (owner && !owner.userData.slotId) owner = owner.parent;
          const nextHoveredSlot = owner || null;
          if (nextHoveredSlot !== hoveredSlot) {
            hoveredSlot = nextHoveredSlot;
            updateLabel(hoveredSlot);
          }
          hoverFx.hover(hoveredSlot, performance.now());
          renderer.domElement.style.cursor = navRef?.current?.picking ? "crosshair" : hoveredSlot ? "pointer" : "grab";
        }
        if (toolRef.current === "area" && presetRef?.current) {
          hoverFx.hover(null, performance.now());
          updatePointer(e);
          raycaster.setFromCamera(pointer, camera);
          if (raycaster.ray.intersectPlane(plane, hit)) showGhost(snapPoint(hit.x, hit.z));
          renderer.domElement.style.cursor = "copy";
          return;
        }
        ghost.visible = false;
        if (toolRef.current === "area" || toolRef.current === "path") {
          hoverFx.hover(null, performance.now());
          const screen = updatePointer(e);
          setCursorScreen(screen);
          raycaster.setFromCamera(pointer, camera);
          if (raycaster.ray.intersectPlane(plane, hit)) {
            const point = snapPoint(hit.x, hit.z);
            setCursorWorld((prev) =>
              !prev || prev.x !== point.x || prev.z !== point.z ? point : prev,
            );
            refreshPreview(draftRef.current, point);
          }
        }
        return;
      }
      const dx = e.clientX - controls.lastX,
        dy = e.clientY - controls.lastY;
      controls.lastX = e.clientX;
      controls.lastY = e.clientY;
      if (controls.draggingArea) {
        updatePointer(e);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const drag = controls.draggingArea;
          const p = snapPoint(hit.x, hit.z);
          drag.dx = p.x - drag.start.x;
          drag.dz = p.z - drag.start.z;
          drag.root.position.set(drag.dx, 0, drag.dz);
        }
        return;
      }
      if (controls.dragging) {
        updatePointer(e);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const m = kanbanMeshes.get(controls.dragging);
          const point = snapPoint(hit.x, hit.z);
          m.position.x = point.x;
          m.position.z = point.z;
        }
      } else {
        controls.angleGoal -= dx * 0.006;
        controls.radiusGoal = Math.max(28, Math.min(maxRadius, controls.radiusGoal + dy * 0.08));
      }
    };
    const onUp = (e) => {
      activePointers.delete(e.pointerId);
      // Clique sem arrastar: abre a caixa clicada (de novo na mesma fecha; no vazio, fecha).
      if (clickStart && !activePointers.size && Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) < 6) {
        const bin = clickStart.bin;
        hoverFx.open(bin && bin !== hoverFx.opened() ? bin : null, performance.now());
      }
      clickStart = null;
      if (activePointers.size) { controls.down = true; return; }
      if (controls.draggingArea) {
        const { id, dx, dz } = controls.draggingArea;
        controls.draggingArea = null;
        if (dx || dz) {
          // salva a área no lugar novo; a cena troca o grupo deslocado pelo refeito nos pontos novos
          setLayout((prev) => ({ ...prev, areas: prev.areas.map((a) => (a.id === id ? { ...a, points: moveArea(a.points, dx, dz) } : a)) }));
          setNotice("Área movida.");
        }
      }
      if (controls.dragging) {
        const id = controls.dragging,
          m = kanbanMeshes.get(id);
        setLayout((prev) => ({
          ...prev,
          kanbans: prev.kanbans.map((k) =>
            k.id === id ? { ...k, x: m.position.x, z: m.position.z } : k,
          ),
        }));
        controls.dragging = null;
        setNotice("Posição salva neste navegador.");
      }
      controls.down = false;
    };
    const onDoubleClick = (e) => {
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickableRacks(), true)[0]?.object;
      let rack = hit;
      while (rack && !rack.userData.id) rack = rack.parent;
      const kanban = layoutRef.current.kanbans.find((item) => item.id === rack?.userData.id);
      if (!kanban) return;
      setSelected(kanban.id);
      focusRef.current(kanban.x, kanban.z, 11, THREE.MathUtils.degToRad(kanban.rotation || 0));
      setNotice(kanban.name + " · passe o cursor sobre uma caixa para ver o conteúdo");
    };
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    renderer.domElement.addEventListener("pointerleave", () => { ghost.visible = false; hoveredSlot = null; updateLabel(null); renderer.domElement.style.cursor = "grab"; hoverFx.hover(null, performance.now()); });
    // Cada posição tem duas caixas (frente e verso): abre a que está virada para a câmera.
    const binWorld = new THREE.Vector3(), binFacing = new THREE.Vector3(), toCamera = new THREE.Vector3();
    const openFromSearch = ({ kanbanId, slotId }, time) => {
      const candidates = slotGroups.filter((b) => b.userData.kanbanId === kanbanId && b.userData.slotId === slotId);
      const rack = kanbanMeshes.get(kanbanId);
      if (!candidates.length || !rack) return;
      // Usa o destino do voo (para onde a câmera vai), não onde ela está agora.
      const view = controls.flight?.to || { x: controls.target.x, z: controls.target.z, angle: controls.angle, radius: controls.radius };
      const camera2d = { x: view.x + Math.sin(view.angle) * view.radius, z: view.z + Math.cos(view.angle) * view.radius };
      rack.updateMatrixWorld(true);
      const score = (bin) => {
        bin.getWorldPosition(binWorld);
        bin.getWorldDirection(binFacing); // o +z local já aponta para fora nos dois lados (o verso é girado 180°)
        toCamera.set(camera2d.x - binWorld.x, 0, camera2d.z - binWorld.z);
        return binFacing.dot(toCamera);
      };
      const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
      hoverFx.open(best, time);
    };
    const pins = createPins(scene, kanbanMeshes, { reducedMotion });
    const navigator = createNavigator(scene, { reducedMotion });
    // Estado do GPS já desenhado (para só refazer a faixa quando a rota muda).
    let navRoute = null,
      navLastProgress = 0,
      navArrived = null;
    // Esmaecimento: estantes entre a câmera e o que está em foco (selecionada, resultado da busca
    // ou o ponto que a câmera mira quando está perto) ficam translúcidas.
    const racks = [...kanbanMeshes.values()];
    const focusPoint = new THREE.Vector3();
    const updateOcclusion = (damping) => {
      const targets = [...(marksRef?.current || [])].map((id) => kanbanMeshes.get(id)).filter(Boolean);
      // Durante um voo, o ponto mirado passa por trás da estante de destino: usa o destino final,
      // senão a própria estante em foco "tapa" o ponto e esmaece.
      const to = controls.flight?.to;
      const near = (to ? to.radius : controls.radius) < 30;
      if (to) focusPoint.set(to.x, to.y ?? 0, to.z);
      else focusPoint.copy(controls.target);
      if (near) targets.push(focusPoint);
      // Nunca esmaecem: o kanban selecionado e a estante onde a câmera está mirando.
      const keep = near ? ownersOf(focusPoint, racks) : new Set();
      if (selectedRef?.current) keep.add(selectedRef.current);
      const hidden = targets.length ? findOccluders(camera.position, targets, racks, keep) : new Set();
      racks.forEach((g) => {
        if (g.userData.id === controls.dragging) hidden.delete(g.userData.id);
        g.userData.fadeGoal = hidden.has(g.userData.id) ? 0.16 : 1;
        const current = g.userData.fade ?? 1;
        if (current === g.userData.fadeGoal && !g.userData.fadeDirty) return;
        g.userData.fadeDirty = false;
        let next = current + (g.userData.fadeGoal - current) * Math.min(1, damping * 2.2);
        if (Math.abs(next - g.userData.fadeGoal) < 0.01) next = g.userData.fadeGoal;
        g.userData.fade = next;
        setRackOpacity(g, next);
      });
    };
    const noMarks = new Set();
    const timer = new THREE.Timer();
    timer.connect(document);
    const draw = (time) => {
      timer.update(time);
      hoverFx.update(time);
      props.update(time);
      const request = openSlotRef?.current;
      if (request) {
        openSlotRef.current = null;
        openFromSearch(request, time);
      }
      // Etiqueta: a caixa sob o mouse tem prioridade; senão, a caixa aberta.
      const shown = hoveredSlot || hoverFx.opened();
      if (shown !== labelBin) { labelBin = shown; labelShownAt = time; }
      updateLabel(shown);
      if (shown) {
        shown.localToWorld(labelWorldPosition.set(0, 1.0, 0.55)); // acima da caixa, sem cobri-la
        labelSprite.position.copy(labelWorldPosition);
        const pop = reducedMotion ? 1 : Math.min(1, (time - labelShownAt) / 220);
        // Tamanho acompanha a distância: de perto a etiqueta não cobre as caixas vizinhas.
        const near = Math.min(1.25, Math.max(0.42, camera.position.distanceTo(labelWorldPosition) / 22));
        const s = near * (0.75 + 0.25 * (1 - Math.pow(1 - pop, 3)));
        labelSprite.scale.set(3.2 * s, 0.9 * s, 1);
        labelMaterial.opacity = pop;
      }
      const damping = 1 - Math.exp(-5 * timer.getDelta());
      if (controls.flight) {
        const view = flightAt(controls.flight, time);
        controls.target.set(view.x, view.y, view.z);
        controls.angle = view.angle;
        controls.radius = view.radius;
        if (view.done) controls.flight = null;
      } else {
        controls.target.lerp(controls.targetGoal, damping);
        controls.angle += (controls.angleGoal - controls.angle) * damping;
        controls.radius += (controls.radiusGoal - controls.radius) * damping;
      }
      slotGroups.forEach((object) => {
        const scale = object === hoveredSlot ? 1.08 : 1;
        object.scale.setScalar(object.scale.x + (scale - object.scale.x) * damping);
      });
      cameraUpdate();
      camera.updateMatrixWorld();
      racks.forEach((g) => g.updateMatrixWorld());
      updateOcclusion(damping);
      pins.update(time, marksRef?.current || noMarks, camera);
      const nav = navRef?.current;
      if (nav) {
        if (nav.route !== navRoute) {
          navRoute = nav.route;
          navigator.setRoute(nav.segments || (navRoute ? [{ onRoad: false, points: navRoute }] : null), time);
        }
        let pose = nav.me;
        if (nav.walk && navRoute) {
          // Caminhada: o ponto "você" percorre a rota; o app recebe o progresso e a chegada.
          const walked = Math.max(0, ((time - nav.walk.startedAt) / 1000) * nav.walk.speed);
          pose = pointAlong(navRoute, walked);
          if (time - navLastProgress > 120 || pose.done) {
            navLastProgress = time;
            nav.onProgress?.(walked);
          }
          if (pose.done && navArrived !== nav.walk) {
            navArrived = nav.walk;
            nav.onArrive?.();
          }
        } else if (pose && navRoute?.length > 1) {
          pose = { ...pose, heading: Math.atan2(navRoute[1].x - navRoute[0].x, navRoute[1].z - navRoute[0].z) };
        }
        navigator.setMe(pose);
      }
      navigator.update(time, camera);
      flow?.update(time);
      supply?.update(time);
      dayNight.update(Math.min(0.1, timer.getDelta()), dayModeRef?.current || "day");
      updateSweeps(time);
      if (workers.size) {
        const t = time / 1000;
        workers.forEach((w) => {
          const data = w.userData.worker;
          const busy = timelapseRequest && sweeps.get(timelapseRequest.id)?.request && w.parent?.parent === drawnRoot(timelapseRequest.id);
          w.visible = busy || data.staffed;
          if (w.visible) applyPose(w, workerPose(busy ? "work" : data.mode, t, data.seed, { reducedMotion }));
        });
      }
      if (blinking.size) {
        // andon piscando devagar (aceso/meio apagado), sem piscar se "reduzir movimento"
        const k = reducedMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((time / 1000) * Math.PI * 1.6));
        blinking.forEach((lamp) => (lamp.material.emissiveIntensity = 1.5 * k));
      }
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(draw);
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      if (!viewRef.current?.reset) viewRef.current = { angle: controls.angle, radius: controls.radius, x: controls.target.x, z: controls.target.z };
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      hoverFx.dispose();
      navigator.dispose();
      timer.dispose();
      scene.remove(labelSprite);
      labelTexture.dispose();
      labelMaterial.dispose();
      window.removeEventListener("resize", resize);
      clearPreview();
      clearPreviewRef.current = () => {};
      sceneApiRef.current = null;
      if (flow) flow.dispose();
      if (supply) supply.dispose();
      [...sweeps.keys()].forEach((id) => endSweep(id, false));
      dayNight.dispose();
      racks.forEach((g) => {
        setRackOpacity(g, 1);
        disposeFadeClones(g);
      });
      disposeTree(scene);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [kanbanIds, hallKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
