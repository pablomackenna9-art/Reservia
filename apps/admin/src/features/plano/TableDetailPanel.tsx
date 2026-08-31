import type { Table } from "@reservia/core";

const SHAPE_LABEL: Record<Table["shape"], string> = {
  round: "Redonda",
  square: "Cuadrada",
  rectangle: "Rectangular",
};

export function TableDetailPanel({
  table,
  zoneName,
  onClose,
}: {
  table: Table;
  zoneName: string;
  onClose: () => void;
}) {
  return (
    <aside className="w-64 shrink-0 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-ink-faint uppercase tracking-wide">{zoneName}</p>
          <h2 className="text-lg font-semibold">{table.name}</h2>
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <dl className="space-y-2.5 text-sm">
        <Row label="Forma" value={SHAPE_LABEL[table.shape]} />
        <Row label="Capacidad" value={`${table.capacityMin}–${table.capacityMax} personas`} />
        <Row label="Combinable" value={table.joinable ? "Sí" : "No"} />
      </dl>

      <p className="text-xs text-ink-faint mt-6 pt-4 border-t border-line">
        Reservas, tiempo ocupada y acciones rápidas llegan en Fase 3–4.
      </p>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  );
}
