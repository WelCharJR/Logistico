import { useRef, useState } from "react";
import { Download, FlaskConical, LayoutGrid, Package, Plane, Upload, X } from "lucide-react";

// Gaveta "Materiais": cadastro de itens, backup e lista completa do estoque.
export default function InventoryDrawer({ layout, viewOnly, onClose, onAddItem, onRemoveItem, onExportBackup, onImportBackup, onDemoStock, onDemoContents, onDemoAreas, onOpenKanban }) {
  // Botões de exemplo pedem um segundo clique: "stock" | "contents" | null
  const [confirmDemo, setConfirmDemo] = useState(null);
  // Linhas saindo: encolhem (200 ms) e só então o item é removido, para a lista não pular.
  const [leaving, setLeaving] = useState(() => new Set());
  const pending = useRef(new Map()); // chave -> timer de garantia
  const finishRemove = (kanbanId, slotId) => {
    const key = kanbanId + slotId;
    if (!pending.current.has(key)) return; // já removido (as duas transições terminam)
    clearTimeout(pending.current.get(key));
    pending.current.delete(key);
    onRemoveItem(kanbanId, slotId);
    setLeaving((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };
  const startRemove = (kanbanId, slotId) => {
    const key = kanbanId + slotId;
    if (pending.current.has(key)) return;
    pending.current.set(key, setTimeout(() => finishRemove(kanbanId, slotId), 400)); // garantia se o transitionend não vier
    setLeaving((s) => new Set(s).add(key));
  };
  const demoButton = (kind, Icon, label, title, action) => (
    <button
      type="button"
      className={"log-btn " + (confirmDemo === kind ? "danger" : "ghost")}
      onClick={() => {
        if (confirmDemo !== kind) return setConfirmDemo(kind);
        setConfirmDemo(null);
        action();
      }}
      onBlur={() => setConfirmDemo(null)}
      title={title}
    >
      <Icon size={15} /> {confirmDemo === kind ? "Clique de novo para aplicar" : label}
    </button>
  );
  const [kanbanId, setKanbanId] = useState(layout.kanbans[0]?.id || "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("10");
  const [unit, setUnit] = useState("un");
  const [slotChoice, setSlotChoice] = useState("next");
  const inventory = layout.kanbans.flatMap((kanban) => kanban.slots.filter((slot) => slot.code).map((slot) => ({ kanban, slot })));
  const submitItem = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    onAddItem({
      kanbanId,
      slotId: slotChoice === "next" ? null : slotChoice,
      code: code.trim(),
      name: name.trim(),
      qty: Math.max(0, Number(qty) || 0),
      unit: unit.trim() || "un",
    });
    setCode("");
    setName("");
    setSlotChoice("next");
  };

  return (
    <div className="log-drawer-backdrop" onClick={onClose}>
      <aside className="log-drawer" onClick={(e) => e.stopPropagation()} aria-label="Materiais">
        <header>
          <div>
            <span className="log-eyebrow">{viewOnly ? "Somente leitura" : "Gerenciar"}</span>
            <h3>Materiais</h3>
          </div>
          <button className="log-close" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        {!viewOnly && (
          <form className="log-form" onSubmit={submitItem}>
            <label>
              Kanban
              <select
                value={kanbanId}
                onChange={(e) => {
                  setKanbanId(e.target.value);
                  setSlotChoice("next");
                }}
              >
                {layout.kanbans.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.id} · {k.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Caixa
              <select value={slotChoice} onChange={(e) => setSlotChoice(e.target.value)}>
                <option value="next">Próxima caixa livre</option>
                {layout.kanbans
                  .find((k) => k.id === kanbanId)
                  ?.slots.filter((s) => !s.code)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="span">
              Código
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: NAS1097" required />
            </label>
            <label className="span">
              Descrição
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Rebite escareado" />
            </label>
            <label>
              Quantidade
              <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label>
              Unidade
              <input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <button type="submit" className="log-btn primary wide span">
              <Package size={15} /> Adicionar material
            </button>
          </form>
        )}

        <div className="log-backup">
          <button type="button" className="log-btn ghost" onClick={onExportBackup}>
            <Download size={15} /> Exportar backup
          </button>
          {!viewOnly && (
            <label className="log-btn ghost">
              <Upload size={15} /> Restaurar backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportBackup(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {!viewOnly &&
            onDemoContents &&
            demoButton(
              "contents",
              LayoutGrid,
              "Simular conteúdo dos kanbans",
              "Troca o conteúdo de todas as caixas por materiais de exemplo (rebites, porcas, parafusos, brocas…)",
              onDemoContents,
            )}
          {!viewOnly && onDemoAreas && (
            <button type="button" className="log-btn ghost" onClick={onDemoAreas} title="Acrescenta uma estação de fuselagem do KC-390 e uma de montagem final do Super Tucano">
              <Plane size={15} /> Criar estações de exemplo
            </button>
          )}
          {!viewOnly &&
            onDemoStock &&
            demoButton(
              "stock",
              FlaskConical,
              "Simular estoque de exemplo",
              "Muda quantidades e datas de conferência para mostrar todas as situações de estoque",
              onDemoStock,
            )}
        </div>

        <span className="log-eyebrow">Estoque · {inventory.length} caixas</span>
        <div className="log-inventory">
          {inventory.length ? (
            inventory.map(({ kanban, slot }) => (
              <div
                key={kanban.id + slot.id}
                className="log-inv-row"
                data-leaving={leaving.has(kanban.id + slot.id) || undefined}
                onTransitionEnd={(e) => e.target === e.currentTarget && leaving.has(kanban.id + slot.id) && finishRemove(kanban.id, slot.id)}
              >
                <div className="log-inv-cols">
                <button className="log-inv-main" onClick={() => onOpenKanban(kanban.id, slot.id)}>
                  <b>{slot.code}</b>
                  <small>
                    {slot.name || "Sem descrição"} · {kanban.id} · {slot.id}
                  </small>
                </button>
                <em>
                  {slot.qty} {slot.unit}
                </em>
                {!viewOnly && (
                  <button className="log-inv-remove" aria-label={"Remover " + slot.code + " de " + slot.id} onClick={() => startRemove(kanban.id, slot.id)} disabled={leaving.has(kanban.id + slot.id)}>
                    <X size={14} />
                  </button>
                )}
                </div>
              </div>
            ))
          ) : (
            <p className="log-empty">Nenhum material cadastrado.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
