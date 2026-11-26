import { useEffect, useMemo, useRef, useState } from "react";
import "./logistica.css";
import { COLS, KEY, ROWS, pathTypes } from "./constants.js";
import { emptySlots, loadLayout } from "./data/layout.js";
import { overviewFor, useHangarScene } from "./hooks/useHangarScene.js";
import { hallBounds, sanitizeHall } from "./scene/hallSize.js";
import { ROUTE, buildGrid, rankKanbans, routeSteps } from "./scene/route.js";
import NavCard from "./components/NavCard.jsx";
import { STATUS, demoStock, groupResults } from "./data/stock.js";
import { samplePath } from "./scene/buildDrawn.js";
import HallSizeCard from "./components/HallSizeCard.jsx";
import TopBar from "./components/TopBar.jsx";
import ScenePanel from "./components/ScenePanel.jsx";
import KanbanModal from "./components/KanbanModal.jsx";
import KpiCards from "./components/KpiCards.jsx";
import DetailCard from "./components/DetailCard.jsx";
import ListCard from "./components/ListCard.jsx";
import TrackCard from "./components/TrackCard.jsx";
import InventoryDrawer from "./components/InventoryDrawer.jsx";

export default function Logistica() {
  const canvas = useRef(null);
  const [layout, setLayout] = useState(loadLayout);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("Arraste os kanbans para reorganizar o hangar.");
  const [tool, setTool] = useState("select");
  const [pathType, setPathType] = useState("pedestrian");
  const pathTypeRef = useRef("pedestrian");
  const [draft, setDraft] = useState([]);
  const [cursorWorld, setCursorWorld] = useState(null);
  const [cursorScreen, setCursorScreen] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const snapRef = useRef(false);
  const clearPreviewRef = useRef(() => {});
  const toolRef = useRef("select");
  const draftRef = useRef([]);
  const [viewOnly, setViewOnly] = useState(false);
  const viewOnlyRef = useRef(false);
  const [showStructure, setShowStructure] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const layerRefs = useRef({});
  const zoomRef = useRef(() => {});
  const focusRef = useRef(() => {});
  const viewRef = useRef(null);
  const [query, setQuery] = useState("");
  const [inspectedKanban, setInspectedKanban] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [focusedSlotId, setFocusedSlotId] = useState(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [hallOpen, setHallOpen] = useState(false);
  const resetView = () => {
    const view = overviewFor(layout.hall);
    focusRef.current(view.x, view.z, view.radius, view.angle);
  };
  const applyHall = (size) => {
    viewRef.current = { reset: true }; // a cena é recriada já enquadrando o novo tamanho
    setLayout((p) => ({ ...p, hall: sanitizeHall(size) }));
    setHallOpen(false);
    setNotice(`Hangar redimensionado para ${size.width} × ${size.depth} m.`);
  };
  const marksRef = useRef(new Set());
  // Pedido para abrir uma caixa no 3D (resultado da busca); a cena atende no próximo quadro.
  const openSlotRef = useRef(null);
  // GPS: a cena lê rota/posição/caminhada daqui a cada quadro.
  const navRef = useRef({});
  const term = query.trim().toLocaleLowerCase();
  const searchResults = term
    ? layout.kanbans.flatMap((k) =>
        (k.slots || [])
          .filter((s) => s.code && (s.code + " " + s.name).toLocaleLowerCase().includes(term))
          .map((s) => ({ kanban: k, slot: s })),
      )
    : [];
  // Busca agrupada por kanban, com a situação do estoque (cheio, acabando, acabou, sem informação).
  const searchGroups = groupResults(searchResults);
  // Pinos no 3D: kanban selecionado + kanbans com resultado da busca.
  marksRef.current = new Set([selected, ...searchResults.map((r) => r.kanban.id)].filter((id) => layout.kanbans.some((k) => k.id === id)));
  const kanbanPositions = layout.kanbans.map(({ id, x, z, rotation }) => id + ":" + x + ":" + z + ":" + (rotation || 0)).join("|");

  // ---------- GPS (demonstração) ----------
  // A localização é simulada: começa na entrada do hangar e pode ser trocada clicando no chão.
  const DEMO_SPEED = 3; // a caminhada anima 3x mais rápido que o passo real
  const [navOpen, setNavOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [me, setMe] = useState(null);
  const [picking, setPicking] = useState(false);
  const [destId, setDestId] = useState(null);
  const [walk, setWalk] = useState(null);
  const [walked, setWalked] = useState(0);
  const skipFitRef = useRef(false); // na chegada a câmera vai até a caixa, sem reenquadrar a rota
  const hall = sanitizeHall(layout.hall);
  // Estradas de pessoas: o GPS prefere andar nelas (as rotas logísticas são das empilhadeiras).
  const roadsKey = JSON.stringify(layout.paths.filter((p) => p.type === "pedestrian").map((p) => [p.points, p.width]));
  const grid = useMemo(() => {
    const roads = layout.paths
      .filter((p) => p.type === "pedestrian" && p.points?.length >= 2)
      .map((p) => ({ points: samplePath(p.points).map(({ x, z }) => ({ x, z })), width: p.width || pathTypes.pedestrian.width }));
    return buildGrid(hallBounds(hall), layout.kanbans, roads);
  }, [kanbanPositions, roadsKey, hall.width, hall.depth]); // eslint-disable-line react-hooks/exhaustive-deps
  // Com uma busca ativa, o destino é o kanban mais perto que tem o material.
  // Situação do produto em cada kanban (o melhor, se o kanban tiver mais de um código que bate).
  const stockByKanban = new Map();
  for (const g of searchGroups)
    if (!stockByKanban.has(g.kanban.id) || STATUS[g.stock.status].order < STATUS[stockByKanban.get(g.kanban.id)].order)
      stockByKanban.set(g.kanban.id, g.stock.status);
  // GPS vai só onde tem o produto; "sem informação" só se nenhum tiver; onde acabou fica de fora.
  const available = [...stockByKanban].filter(([, st]) => st === "full" || st === "ok" || st === "low").map(([id]) => id);
  const uncertain = [...stockByKanban].filter(([, st]) => st === "unknown").map(([id]) => id);
  const hitIds = available.length ? available : uncertain;
  const skipped = [...stockByKanban].filter(([id]) => !hitIds.includes(id)).map(([id, st]) => ({ id, status: st }));
  const navTerm = stockByKanban.size ? query.trim() : "";
  const candidatesKey = navTerm ? "q:" + hitIds.join("|") : "";
  const ranked = useMemo(() => {
    if (!navOpen || !me || locating) return [];
    const pool = navTerm ? layout.kanbans.filter((k) => hitIds.includes(k.id)) : layout.kanbans;
    return rankKanbans(grid, me, pool);
  }, [navOpen, me, locating, grid, candidatesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const destination = ranked.find((r) => r.id === destId) || ranked[0] || null;
  const steps = useMemo(() => (destination ? routeSteps(destination) : []), [destination]);
  const entrance = () => {
    const b = hallBounds(hall);
    return { x: b.maxX - 9, z: b.maxZ - 2.5 }; // abertura da mureta, no canto direito da frente
  };
  const openNav = () => {
    setHallOpen(false);
    setNavOpen(true);
    setWalk(null);
    setLocating(true);
    // "Procurando sinal": um instante de espera deixa a demonstração com cara de GPS.
    setTimeout(() => {
      setMe((prev) => prev || entrance());
      setLocating(false);
    }, 1200);
  };
  const closeNav = () => {
    setNavOpen(false);
    setPicking(false);
    setWalk(null);
    setDestId(null);
  };
  const fitRoute = (points) => {
    const xs = points.map((p) => p.x),
      zs = points.map((p) => p.z);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    focusRef.current((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2, Math.min(70, Math.max(24, extent * 1.75)), 0.63);
  };
  const startWalk = () => {
    if (!destination) return;
    setPicking(false);
    setWalked(0);
    setWalk({ startedAt: performance.now(), speed: ROUTE.walkSpeed * DEMO_SPEED });
  };
  const arrive = () => {
    if (!destination) return;
    const end = destination.points[destination.points.length - 1];
    const kanban = layout.kanbans.find((k) => k.id === destination.id);
    setWalk(null);
    skipFitRef.current = true;
    setMe({ x: end.x, z: end.z });
    setDestId(destination.id);
    // Chegou: com busca ativa, já abre a caixa do material; senão, aproxima do kanban.
    const hit = searchGroups.find((g) => g.kanban.id === destination.id); // caixa com material, se houver
    if (hit) pickResult(hit.kanban, hit.slot);
    else if (kanban) focusRef.current(kanban.x, kanban.z, 11, ((kanban.rotation || 0) * Math.PI) / 180);
    setNotice("Você chegou ao " + destination.id + (hit ? " · caixa " + hit.slot.id : ""));
  };
  navRef.current = {
    me: navOpen && !locating ? me : null,
    route: navOpen && destination ? destination.points : null,
    segments: navOpen && destination ? destination.segments : null,
    walk: navOpen ? walk : null,
    picking: navOpen && picking,
    onPick: (point) => {
      setMe(point);
      setPicking(false);
      setWalk(null);
    },
    onProgress: setWalked,
    onArrive: arrive,
  };
  // Destino novo: marca o kanban (pino) e enquadra a rota inteira.
  useEffect(() => {
    if (!navOpen || !destination || walk) return;
    setSelected(destination.id);
    if (skipFitRef.current) skipFitRef.current = false;
    else fitRoute(destination.points);
  }, [navOpen, destination?.id, me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(layout));
  }, [layout]);

  useHangarScene({
    canvas,
    layout,
    kanbanPositions,
    showStructure,
    showGrid,
    refs: {
      toolRef,
      draftRef,
      pathTypeRef,
      snapRef,
      layerRefs,
      clearPreviewRef,
      zoomRef,
      focusRef,
      viewRef,
      viewOnlyRef,
      marksRef,
      openSlotRef,
      navRef,
    },
    setters: {
      setLayout,
      setSelected,
      setSelectedSlotId,
      setNotice,
      setDraft,
      setCursorWorld,
      setCursorScreen,
    },
  });

  const addKanban = () => {
    if (viewOnly) return;
    const enteredName = window.prompt("Nome do kanban (deixe vazio para usar o nome genérico):", "");
    if (enteredName === null) return;
    const name = enteredName.trim() || "Novo kanban";
    const id = "K-" + String(Date.now()).slice(-4);
    setLayout((p) => ({
      ...p,
      kanbans: [...p.kanbans, { id, name, x: 0, z: 0, rotation: 0, slots: emptySlots() }],
    }));
    setSelected(id);
    setNotice("Kanban adicionado. Arraste-o para o local desejado.");
  };
  const rotateKanban = (id, delta) => {
    if (viewOnly) return;
    setLayout((p) => ({ ...p, kanbans: p.kanbans.map((k) => k.id === id ? { ...k, rotation: ((k.rotation || 0) + delta + 360) % 360 } : k) }));
  };
  const exportBackup = () => {
    const backup = { format: "hangar-logistica", version: 1, exportedAt: new Date().toISOString(), layout };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "backup-hangar-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Backup do hangar exportado.");
  };
  const importBackup = async (file) => {
    if (viewOnly) return;
    try {
      const backup = JSON.parse(await file.text());
      const data = backup?.format === "hangar-logistica" && backup?.version === 1 ? backup.layout : null;
      const valid = data && Array.isArray(data.kanbans) && Array.isArray(data.areas) && Array.isArray(data.paths)
        && data.kanbans.every((k) => typeof k.id === "string" && typeof k.name === "string" && Number.isFinite(k.x) && Number.isFinite(k.z) && Array.isArray(k.slots) && k.slots.length === 60);
      if (!valid) throw new Error("Arquivo inválido");
      viewRef.current = { reset: true };
      setLayout({ ...data, hall: sanitizeHall(data.hall), kanbans: data.kanbans.map((k) => ({ ...k, rotation: Number(k.rotation) || 0 })) });
      setSelected(null);
      setInspectedKanban(null);
      setNotice("Backup restaurado. Os dados foram salvos neste navegador.");
    } catch {
      setNotice("Não foi possível restaurar o arquivo. Escolha um backup JSON do hangar.");
    }
  };
  const openKanban = (id, slotId = null) => {
    const k = layout.kanbans.find((item) => item.id === id);
    if (!k) return;
    setSelected(id);
    setInspectedKanban(id);
    setSelectedSlotId(slotId || k.slots?.find((s) => s.code)?.id || k.slots?.[0]?.id || null);
    setFocusedSlotId(slotId);
    focusRef.current(k.x, k.z, 9, (k.rotation || 0) * Math.PI / 180);
  };
  const updateSlot = (field, value) => {
    if (viewOnly) return;
    setLayout((p) => ({
      ...p,
      kanbans: p.kanbans.map((k) =>
        k.id !== inspectedKanban
          ? k
          : {
              ...k,
              slots: k.slots.map((slot) =>
                slot.id !== selectedSlotId
                  ? slot
                  : {
                      ...slot,
                      // "check": só registra a conferência. qty/min/capacity são números;
                      // mudar a quantidade também conta como conferência (alguém olhou a caixa).
                      ...(field === "check"
                        ? { checkedAt: new Date().toISOString() }
                        : field === "qty"
                          ? { qty: Math.max(0, Number(value) || 0), checkedAt: new Date().toISOString() }
                          : field === "min" || field === "capacity"
                            ? { [field]: value === "" ? undefined : Math.max(field === "capacity" ? 1 : 0, Number(value) || 0) }
                            : { [field]: value }),
                      // caixa nova (sem código ainda) começa cheia; uma que acabou continua em 0
                      ...((field === "code" || field === "name") && value && !slot.code
                        ? { qty: 10, checkedAt: new Date().toISOString() }
                        : {}),
                    },
              ),
            },
      ),
    }));
  };
  const addItem = (item) => {
    if (viewOnly) return;
    const kanban = layout.kanbans.find((k) => k.id === item.kanbanId);
    const slot = kanban?.slots.find((s) => item.slotId ? s.id === item.slotId && !s.code : !s.code);
    if (!slot) { setNotice("Kanban sem caixas livres."); return; }
    setLayout((p) => ({ ...p, kanbans: p.kanbans.map((k) => k.id !== kanban.id ? k : { ...k, slots: k.slots.map((s) => s.id !== slot.id ? s : { ...s, code: item.code, name: item.name, qty: item.qty, unit: item.unit, checkedAt: new Date().toISOString() }) }) }));
    setNotice(item.code + " adicionado em " + kanban.id + " · " + slot.id);
  };
  const renameKanban = (id, name) => {
    if (viewOnly) return;
    setLayout((p) => ({ ...p, kanbans: p.kanbans.map((k) => k.id === id ? { ...k, name } : k) }));
  };
  const removeItem = (kanbanId, slotId) => {
    if (viewOnly) return;
    setLayout((p) => ({ ...p, kanbans: p.kanbans.map((k) => k.id !== kanbanId ? k : { ...k, slots: k.slots.map((s) => s.id !== slotId ? s : { ...s, code: "", name: "", qty: 0, unit: "un" }) }) }));
  };
  const inspected = layout.kanbans.find((k) => k.id === inspectedKanban);
  const chooseTool = (next) => {
    toolRef.current = next;
    setTool(next);
    draftRef.current = [];
    setDraft([]);
    setCursorWorld(null);
    setCursorScreen(null);
    clearPreviewRef.current();
    setNotice(
      next === "area"
        ? "Clique no piso para marcar os vértices da área."
        : "Clique no piso para traçar o caminho.",
    );
  };
  const choosePathType = (next) => {
    pathTypeRef.current = next;
    setPathType(next);
    clearPreviewRef.current();
  };
  const finishDrawing = () => {
    if (viewOnly) return;
    const points = draftRef.current;
    if (toolRef.current === "area" && points.length >= 3) {
      const id = "A-" + String(Date.now()).slice(-4);
      setLayout((p) => ({
        ...p,
        areas: [...p.areas, { id, name: "Área " + (p.areas.length + 1), points }],
      }));
      setSelected(id);
      setNotice("Área adicionada ao layout.");
    } else if (toolRef.current === "path" && points.length >= 2) {
      const id = "R-" + String(Date.now()).slice(-4);
      const config = pathTypes[pathTypeRef.current];
      setLayout((p) => ({
        ...p,
        paths: [
          ...p.paths,
          {
            id,
            name:
              (pathTypeRef.current === "pedestrian" ? "Estrada " : "Rota logística ") +
              (p.paths.length + 1),
            type: pathTypeRef.current,
            points,
            width: config.width,
          },
        ],
      }));
      setSelected(id);
      setNotice("Caminho adicionado ao layout.");
    }
    draftRef.current = [];
    setDraft([]);
    setCursorWorld(null);
    setCursorScreen(null);
    clearPreviewRef.current();
    toolRef.current = "select";
    setTool("select");
  };
  const cancelDrawing = () => {
    draftRef.current = [];
    setDraft([]);
    setCursorWorld(null);
    setCursorScreen(null);
    clearPreviewRef.current();
    toolRef.current = "select";
    setTool("select");
  };
  const removeSelected = () => {
    if (viewOnly) return;
    setLayout((p) => ({
      ...p,
      areas: p.areas.filter((x) => x.id !== selected),
      paths: p.paths.filter((x) => x.id !== selected),
    }));
    setSelected(null);
  };
  const closeKanban = () => {
    setInspectedKanban(null);
    setFocusedSlotId(null);
    resetView();
  };
  const setPathWidth = (id, width) => {
    if (viewOnly) return;
    setLayout((p) => ({ ...p, paths: p.paths.map((x) => (x.id === id ? { ...x, width } : x)) }));
  };

  const toggleViewOnly = () => {
    const next = !viewOnly;
    viewOnlyRef.current = next;
    setViewOnly(next);
    if (next) {
      toolRef.current = "select";
      setTool("select");
      draftRef.current = [];
      setDraft([]);
      setCursorWorld(null);
      setCursorScreen(null);
      clearPreviewRef.current();
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName))) return;
      if (viewOnly || tool !== "select" || !selected || event.altKey || event.ctrlKey || event.metaKey) return;
      const kanban = layout.kanbans.find((item) => item.id === selected);
      if (!kanban) return;
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        rotateKanban(selected, event.shiftKey ? -15 : 15);
        setNotice(`Rotação: ${((kanban.rotation || 0) + (event.shiftKey ? -15 : 15) + 360) % 360}°`);
        return;
      }
      const step = event.shiftKey ? 1 : 0.25;
      const moves = {
        w: [0, -step], arrowup: [0, -step],
        s: [0, step], arrowdown: [0, step],
        a: [-step, 0], arrowleft: [-step, 0],
        d: [step, 0], arrowright: [step, 0],
      };
      const move = moves[key];
      if (!move) return;
      event.preventDefault();
      setLayout((previous) => ({
        ...previous,
        kanbans: previous.kanbans.map((item) =>
          item.id === selected ? { ...item, x: item.x + move[0], z: item.z + move[1] } : item,
        ),
      }));
      setNotice(`Kanban movido · X ${(kanban.x + move[0]).toFixed(2)} · Z ${(kanban.z + move[1]).toFixed(2)} m`);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layout.kanbans, rotateKanban, selected, setNotice, tool, viewOnly]);

  useEffect(() => {
    if (focusedSlotId)
      document
        .getElementById("slot-" + focusedSlotId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedSlotId, inspectedKanban]);
  const toggleSnap = () => {
    snapRef.current = !snapRef.current;
    setSnapToGrid(snapRef.current);
  };
  const toggleLayer = (name, setter, value) => {
    if (layerRefs.current[name]) layerRefs.current[name].visible = !value;
    setter(!value);
  };
  const pickResult = (kanban, slot) => {
    document.activeElement?.blur?.();
    // Voa até a estante e abre a caixa no 3D; a janela do kanban fica no botão "Ampliar e ver caixas".
    setSelected(kanban.id);
    setSelectedSlotId(slot.id);
    setFocusedSlotId(slot.id);
    openSlotRef.current = { kanbanId: kanban.id, slotId: slot.id };
    // Mira na prateleira da caixa e chega perto, olhando de cima para dentro dela.
    const row = Math.max(0, ROWS.indexOf(slot.id.split("-")[0]));
    const shelfY = 0.51 + (ROWS.length - 1 - row) * 0.52;
    // Centraliza na coluna da caixa (a estante tem 5,4 m de largura).
    const rotation = (kanban.rotation || 0) * Math.PI / 180;
    const column = Number(slot.id.split("-")[1]) || 1;
    const offset = (column - 1 - (COLS - 1) / 2) * 0.5;
    focusRef.current(kanban.x + offset * Math.cos(rotation), kanban.z - offset * Math.sin(rotation), 5.5, rotation, shelfY);
    setNotice(slot.code + " · " + kanban.id + " · caixa " + slot.id);
  };
  // Seleciona pela lista e leva a câmera até o item.
  const pickFromList = (id) => {
    setSelected(id);
    const kanban = layout.kanbans.find((k) => k.id === id);
    const shape = layout.areas.find((a) => a.id === id) || layout.paths.find((p) => p.id === id);
    if (kanban) {
      setSelectedSlotId(kanban.slots.find((s) => s.code)?.id || null);
      focusRef.current(kanban.x, kanban.z, 24, 0.63);
      setNotice(kanban.name + " · dois cliques na estante para aproximar");
    } else if (shape?.points.length) {
      const cx = shape.points.reduce((sum, p) => sum + p.x, 0) / shape.points.length;
      const cz = shape.points.reduce((sum, p) => sum + p.z, 0) / shape.points.length;
      focusRef.current(cx, cz, 30, 0.63);
    }
  };
  return (
    <div className={viewOnly ? "log-app log-view-only" : "log-app"}>
      <TopBar
        query={query}
        onQuery={setQuery}
        searchResults={searchResults}
        searchGroups={searchGroups}
        onPickResult={pickResult}
        notice={notice}
        viewOnly={viewOnly}
        onToggleViewOnly={toggleViewOnly}
        showGrid={showGrid}
        showStructure={showStructure}
        onToggleGrid={() => toggleLayer("grid", setShowGrid, showGrid)}
        onToggleStructure={() => toggleLayer("structure", setShowStructure, showStructure)}
        onAddKanban={addKanban}
        onOpenInventory={() => setInventoryOpen(true)}
        onOpenHall={() => {
          setHallOpen((open) => !open);
          setNavOpen(false);
        }}
        hallOpen={hallOpen}
        onOpenNav={() => (navOpen ? closeNav() : openNav())}
        navOpen={navOpen}
      />
      <ScenePanel
        canvasRef={canvas}
        viewOnly={viewOnly}
        tool={tool}
        pathType={pathType}
        snapToGrid={snapToGrid}
        draft={draft}
        cursorWorld={cursorWorld}
        cursorScreen={cursorScreen}
        onChooseTool={chooseTool}
        onChoosePathType={choosePathType}
        onToggleSnap={toggleSnap}
        onFinish={finishDrawing}
        onCancel={cancelDrawing}
        onZoom={(amount) => zoomRef.current(amount)}
        onResetView={() => resetView()}
      />
      <KpiCards layout={layout} />
      <div className="log-cards">
        <DetailCard
          layout={layout}
          selected={selected}
          viewOnly={viewOnly}
          selectedSlotId={selectedSlotId}
          onClose={() => setSelected(null)}
          onRenameKanban={renameKanban}
          onRotateKanban={rotateKanban}
          onOpenKanban={openKanban}
          onPathWidth={setPathWidth}
          onRemove={removeSelected}
        />
        <TrackCard layout={layout} selected={selected} selectedSlotId={selectedSlotId} onOpenKanban={openKanban} />
        <ListCard layout={layout} selected={selected} onPick={pickFromList} />
      </div>
      {navOpen && (
        <NavCard
          locating={locating}
          me={me}
          picking={picking}
          ranked={ranked}
          destination={destination}
          steps={steps}
          walking={!!walk}
          walked={walked}
          searchTerm={navTerm}
          hasRoads={grid.hasRoads}
          stockOf={(id) => stockByKanban.get(id)}
          skipped={skipped}
          kanbanName={(id) => layout.kanbans.find((k) => k.id === id)?.name || ""}
          onPickPosition={() => setPicking((p) => !p)}
          onChooseDestination={(id) => setDestId(id)}
          onStart={startWalk}
          onStop={() => setWalk(null)}
          onClose={closeNav}
        />
      )}
      {hallOpen && !viewOnly && <HallSizeCard layout={layout} onApply={applyHall} onClose={() => setHallOpen(false)} />}
      {inventoryOpen && (
        <InventoryDrawer
          layout={layout}
          viewOnly={viewOnly}
          onClose={() => setInventoryOpen(false)}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
          onDemoStock={() => {
            setLayout((p) => ({ ...p, kanbans: demoStock(p.kanbans) }));
            setNotice("Estoque de exemplo aplicado: caixas cheias, acabando, vazias e sem conferência.");
          }}
          onOpenKanban={(id, slotId) => {
            setInventoryOpen(false);
            openKanban(id, slotId);
          }}
        />
      )}
      {inspected && (
        <KanbanModal
          inspected={inspected}
          viewOnly={viewOnly}
          selectedSlotId={selectedSlotId}
          focusedSlotId={focusedSlotId}
          onClose={closeKanban}
          onSelectSlot={setSelectedSlotId}
          onUpdateSlot={updateSlot}
        />
      )}
    </div>
  );
}
