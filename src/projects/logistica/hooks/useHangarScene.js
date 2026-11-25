import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildHall } from "../scene/buildHall.js";
import { buildKanban, paintBins } from "../scene/buildKanban.js";
import { buildProps } from "../scene/buildProps.js";
import { createPins } from "../scene/buildPins.js";
import { COLORS, disposeTree } from "../scene/theme.js";
import { HALL_DEFAULT, hallBounds } from "../scene/hallSize.js";
import { disposeFadeClones, findOccluders, setRackOpacity } from "../scene/occlusion.js";
import { buildAreaMesh, buildPath } from "../scene/buildDrawn.js";
import { createPreview } from "../scene/createPreview.js";
import { createHoverFx } from "../scene/createHoverFx.js";
import { createFlight, flightAt } from "../scene/cameraFlight.js";

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
  showStructure,
  showGrid,
  refs,
  setters,
}) {
  const { toolRef, draftRef, pathTypeRef, snapRef, layerRefs, clearPreviewRef, zoomRef, focusRef, viewRef, viewOnlyRef, marksRef, openSlotRef } =
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
  // Recolore as caixas quando o conteúdo muda (cadastro, remoção, edição), sem recriar a cena.
  const slotsKey = layout.kanbans.map((k) => k.id + ":" + k.slots.map((s) => (s.code ? 1 : 0)).join("")).join("|");
  useEffect(() => {
    paintBins(slotGroupsRef.current, layoutRef.current.kanbans);
  }, [slotsKey]);

  const hallKey = (layout.hall?.width || "") + "x" + (layout.hall?.depth || "");
  useEffect(() => {
    const host = canvas.current;
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    // Luz do céu + sol com sombra suave + luz de preenchimento sem sombra.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc4cee0, 1.9));
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
    layout.areas.forEach((area) => {
      const mesh = buildAreaMesh(area);
      scene.add(mesh);
      drawnMeshes.push(mesh);
    });
    layout.paths.forEach((path) => {
      if (path.points.length < 2) return;
      const group = buildPath(path);
      scene.add(group);
      drawnMeshes.push(group);
    });
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
        controls.radius * 0.9,
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
      const key = [bin.userData.kanbanId, item.id, item.code, item.name, item.qty, item.unit].join("|");
      if (key !== labelKey) {
        labelKey = key;
        labelContext.clearRect(0, 0, 512, 144);
        labelContext.fillStyle = "#ffffff";
        labelContext.beginPath(); labelContext.roundRect(4, 4, 504, 136, 22); labelContext.fill();
        labelContext.strokeStyle = "#dfe5ef";
        labelContext.lineWidth = 3;
        labelContext.stroke();
        labelContext.fillStyle = item.code ? "#2f55e4" : "#aab6cc";
        labelContext.beginPath(); labelContext.roundRect(22, 26, 8, 92, 4); labelContext.fill();
        labelContext.textAlign = "left";
        labelContext.fillStyle = "#1d2433";
        labelContext.font = "800 31px Inter, system-ui, sans-serif";
        labelContext.fillText(item.code || "Caixa vazia", 46, 50, 440);
        labelContext.fillStyle = "#5b6578";
        labelContext.font = "500 23px Inter, system-ui, sans-serif";
        labelContext.fillText(item.name || "Sem material cadastrado", 46, 84, 440);
        labelContext.fillStyle = "#2f55e4";
        labelContext.font = "700 20px Inter, system-ui, sans-serif";
        labelContext.fillText(bin.userData.kanbanId + " · " + item.id + " · " + item.qty + " " + item.unit, 46, 116, 440);
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
    focusRef.current = (x, z, radius = 10, angle = 0.63) => {
      const from = { x: controls.target.x, z: controls.target.z, angle: controls.angle, radius: controls.radius };
      controls.flight = createFlight(from, { x, z, angle, radius: overview(radius) }, performance.now(), { reducedMotion });
      const to = controls.flight.to;
      controls.targetGoal.set(to.x, 0, to.z);
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
          renderer.domElement.style.cursor = hoveredSlot ? "pointer" : "grab";
        }
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
    renderer.domElement.addEventListener("pointerleave", () => { hoveredSlot = null; updateLabel(null); renderer.domElement.style.cursor = "grab"; hoverFx.hover(null, performance.now()); });
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
    // Esmaecimento: estantes entre a câmera e o que está em foco (selecionada, resultado da busca
    // ou o ponto que a câmera mira quando está perto) ficam translúcidas.
    const racks = [...kanbanMeshes.values()];
    const focusPoint = new THREE.Vector3();
    const updateOcclusion = (damping) => {
      const targets = [...(marksRef?.current || [])].map((id) => kanbanMeshes.get(id)).filter(Boolean);
      if (controls.radius < 30) targets.push(focusPoint.copy(controls.target));
      const hidden = targets.length ? findOccluders(camera.position, targets, racks) : new Set();
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
        const s = 0.75 + 0.25 * (1 - Math.pow(1 - pop, 3));
        labelSprite.scale.set(3.2 * s, 0.9 * s, 1);
        labelMaterial.opacity = pop;
      }
      const damping = 1 - Math.exp(-5 * timer.getDelta());
      if (controls.flight) {
        const view = flightAt(controls.flight, time);
        controls.target.set(view.x, 0, view.z);
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
      timer.dispose();
      scene.remove(labelSprite);
      labelTexture.dispose();
      labelMaterial.dispose();
      window.removeEventListener("resize", resize);
      clearPreview();
      clearPreviewRef.current = () => {};
      racks.forEach((g) => {
        setRackOpacity(g, 1);
        disposeFadeClones(g);
      });
      disposeTree(scene);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [kanbanPositions, layout.areas, layout.paths, hallKey]);
}
