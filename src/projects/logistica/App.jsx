import { useEffect, useRef, useState } from "react";
import "./logistica.css";
import { COLS, KEY, ROWS, pathTypes } from "./constants.js";
import { emptySlots, loadLayout } from "./data/layout.js";
import { overviewFor, useHangarScene } from "./hooks/useHangarScene.js";
import { sanitizeHall } from "./scene/hallSize.js";
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
  const term = query.trim().toLocaleLowerCase();
  const searchResults = term
    ? layout.kanbans.flatMap((k) =>
        (k.slots || [])
          .filter((s) => s.code && (s.code + " " + s.name).toLocaleLowerCase().includes(term))
          .map((s) => ({ kanban: k, slot: s })),
      )
    : [];
  // Pinos no 3D: kanban selecionado + kanbans com resultado da busca.
  marksRef.current = new Set([selected, ...searchResults.map((r) => r.kanban.id)].filter((id) => layout.kanbans.some((k) => k.id === id)));
  const kanbanPositions = layout.kanbans.map(({ id, x, z, rotation }) => id + ":" + x + ":" + z + ":" + (rotation || 0)).join("|");

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
                      [field]: field === "qty" ? Math.max(0, Number(value) || 0) : value,
                      ...((field === "code" || field === "name") && value && !slot.qty
                        ? { qty: 10 }
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
    setLayout((p) => ({ ...p, kanbans: p.kanbans.map((k) => k.id !== kanban.id ? k : { ...k, slots: k.slots.map((s) => s.id !== slot.id ? s : { ...s, code: item.code, name: item.name, qty: item.qty, unit: item.unit }) }) }));
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
        onOpenHall={() => setHallOpen((open) => !open)}
        hallOpen={hallOpen}
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
