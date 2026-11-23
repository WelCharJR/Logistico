import { Box, Check, ChevronRight, LayoutGrid, MapPin, Rows3, Warehouse } from "lucide-react";

// Card "Localização do material" (canto inferior esquerdo): mostra o caminho até a caixa selecionada,
// do hangar até a posição exata na estante.
export default function TrackCard({ layout, selected, selectedSlotId, onOpenKanban }) {
  const kanban = layout.kanbans.find((k) => k.id === selected);
  const slot = kanban?.slots.find((s) => s.id === selectedSlotId);
  const [row, col] = slot ? slot.id.split("-") : [];
  const steps = [
    { icon: Warehouse, label: "Hangar", value: "Montagem" },
    { icon: LayoutGrid, label: "Kanban", value: kanban?.id },
    { icon: Rows3, label: "Fileira", value: row },
    { icon: MapPin, label: "Posição", value: col },
    { icon: Box, label: "Caixa", value: slot?.id },
  ];
  const reached = steps.filter((s) => s.value).length;

  return (
    <section className="log-card log-track-card">
      <div className="log-track-main">
        <header>
          <span className="log-eyebrow">Localização do material</span>
          <small>{kanban ? kanban.name : "Busque um material ou clique em uma caixa"}</small>
        </header>
        <ol className="log-steps">
          {steps.map(({ icon: Icon, label, value }, i) => {
            const state = i < reached - 1 ? "done" : i === reached - 1 ? "current" : "todo";
            return (
              <li key={label} className={state}>
                <span className="log-step-dot">{state === "done" ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}</span>
                <b>{label}</b>
                <small>{value || "—"}</small>
              </li>
            );
          })}
        </ol>
      </div>
      <div className={"log-track-item" + (slot?.code ? "" : " empty")}>
        <span className="log-track-icon">
          <Box size={20} />
        </span>
        {slot ? (
          <div>
            <b>{slot.code || "Caixa vazia"}</b>
            <span>{slot.code ? slot.name || "Sem descrição" : "Sem material cadastrado"}</span>
            {slot.code && (
              <em>
                {slot.qty} {slot.unit} · {kanban.id} · {slot.id}
              </em>
            )}
          </div>
        ) : (
          <div>
            <b>Nenhuma caixa</b>
            <span>Selecione uma caixa na estante</span>
          </div>
        )}
        {kanban && (
          <button onClick={() => onOpenKanban(kanban.id, slot?.id)} aria-label="Abrir caixas do kanban">
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
