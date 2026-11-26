import { useState } from "react";
import { Download, FlaskConical, Package, Upload, X } from "lucide-react";

// Gaveta "Materiais": cadastro de itens, backup e lista completa do estoque.
export default function InventoryDrawer({ layout, viewOnly, onClose, onAddItem, onRemoveItem, onExportBackup, onImportBackup, onDemoStock, onOpenKanban }) {
  const [confirmDemo, setConfirmDemo] = useState(false);
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
          {!viewOnly && onDemoStock && (
            <button
              type="button"
              className={"log-btn " + (confirmDemo ? "danger" : "ghost")}
              onClick={() => {
                if (!confirmDemo) return setConfirmDemo(true);
                setConfirmDemo(false);
                onDemoStock();
              }}
              onBlur={() => setConfirmDemo(false)}
              title="Muda quantidades e datas de conferência para mostrar todas as situações de estoque"
            >
              <FlaskConical size={15} /> {confirmDemo ? "Clique de novo para aplicar" : "Simular estoque de exemplo"}
            </button>
          )}
        </div>

        <span className="log-eyebrow">Estoque · {inventory.length} caixas</span>
        <div className="log-inventory">
          {inventory.length ? (
            inventory.map(({ kanban, slot }) => (
              <div key={kanban.id + slot.id}>
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
                  <button className="log-inv-remove" aria-label={"Remover " + slot.code + " de " + slot.id} onClick={() => onRemoveItem(kanban.id, slot.id)}>
                    <X size={14} />
                  </button>
                )}
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
