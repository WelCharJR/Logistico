import { Boxes, Gauge, LayoutGrid, Package } from "lucide-react";

// Indicadores do hangar calculados a partir do layout salvo.
export default function KpiCards({ layout }) {
  const slots = layout.kanbans.flatMap((k) => k.slots);
  const filled = slots.filter((s) => s.code);
  const occupancy = slots.length ? Math.round((filled.length / slots.length) * 100) : 0;
  const materials = new Set(filled.map((s) => s.code.trim().toUpperCase())).size;
  const units = filled.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

  const cards = [
    { icon: Boxes, label: "Caixas ocupadas", value: filled.length, sub: `de ${slots.length} posições` },
    { icon: Gauge, label: "Ocupação", value: occupancy + "%", sub: "média dos kanbans", bar: occupancy },
    { icon: Package, label: "Materiais", value: materials, sub: units.toLocaleString("pt-BR") + " unidades" },
    { icon: LayoutGrid, label: "Kanbans", value: layout.kanbans.length, sub: `${layout.areas.length} áreas · ${layout.paths.length} caminhos` },
  ];
  return (
    <div className="log-kpis">
      {cards.map(({ icon: Icon, label, value, sub, bar }) => (
        <div className="log-kpi" key={label}>
          <span className="log-kpi-icon" aria-hidden="true">
            <Icon size={17} />
          </span>
          <div>
            <small>{label}</small>
            <b>{value}</b>
            {bar !== undefined ? (
              <span className="log-kpi-bar" aria-hidden="true">
                <i style={{ width: bar + "%" }} />
              </span>
            ) : (
              <em>{sub}</em>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
