import { useState } from "react";
import { currentOrNextReservation, tableStatusLabel, type ReservationStatus, type Table, type TableLiveStatusValue } from "@reservia/core";
import type { ReservationWithDetails } from "@reservia/api-client";
import { STATUS_COLORS } from "./statusColors";

const SHAPE_LABEL: Record<Table["shape"], string> = {
  round: "Redonda",
  square: "Cuadrada",
  rectangle: "Rectangular",
};

const NEXT_STATUS: Partial<Record<ReservationStatus, { label: string; status: ReservationStatus }[]>> = {
  pending: [{ label: "Confirmar", status: "confirmed" }],
  confirmed: [
    { label: "Marcar llegada", status: "arriving" },
    { label: "Cancelar", status: "cancelled" },
  ],
  arriving: [
    { label: "Sentar", status: "seated" },
    { label: "No-show", status: "no_show" },
  ],
  seated: [{ label: "Completar", status: "completed" }],
};

export function TableDetailPanel({
  table,
  zoneName,
  status,
  reservationsToday,
  editable,
  onClose,
  onDelete,
  onChangeReservationStatus,
  onSeatWalkIn,
}: {
  table: Table;
  zoneName: string;
  status: TableLiveStatusValue;
  reservationsToday: ReservationWithDetails[];
  editable: boolean;
  onClose: () => void;
  onDelete: () => void;
  onChangeReservationStatus: (reservationId: string, status: ReservationStatus) => void;
  onSeatWalkIn: (partySize: number, name: string) => void;
}) {
  const reservation = currentOrNextReservation(reservationsToday);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("Walk-in");
  const [walkInSize, setWalkInSize] = useState(Math.min(2, table.capacityMax));

  return (
    <aside className="w-72 shrink-0 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-ink-faint uppercase tracking-wide">{zoneName}</p>
          <h2 className="text-lg font-semibold">Mesa {table.name}</h2>
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <span
        className="inline-block text-xs rounded-full px-2.5 py-1 border mb-4"
        style={{ color: STATUS_COLORS[status], borderColor: STATUS_COLORS[status] }}
      >
        {tableStatusLabel(status)}
      </span>

      {reservation ? (
        <div className="rounded-lg bg-ground border border-line p-3 mb-4">
          <p className="text-sm font-medium">{reservation.customerName}</p>
          <p className="text-xs text-ink-faint mt-0.5">
            {new Date(reservation.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {reservation.partySize} personas
            {reservation.customerPhone ? ` · ${reservation.customerPhone}` : ""}
          </p>
          {NEXT_STATUS[reservation.status] && (
            <div className="flex gap-1.5 mt-3">
              {NEXT_STATUS[reservation.status]!.map((action) => (
                <button
                  key={action.status}
                  onClick={() => onChangeReservationStatus(reservation.id, action.status)}
                  className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : showWalkIn ? (
        <div className="rounded-lg bg-ground border border-line p-3 mb-4 space-y-2">
          <input
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-faint">Personas</label>
            <input
              type="number"
              min={1}
              max={table.capacityMax}
              value={walkInSize}
              onChange={(e) => setWalkInSize(Number(e.target.value))}
              className="w-16 rounded-lg bg-surface border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                onSeatWalkIn(walkInSize, walkInName.trim() || "Walk-in");
                setShowWalkIn(false);
              }}
              className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
            >
              Sentar ahora
            </button>
            <button onClick={() => setShowWalkIn(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-ink-muted">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm text-ink-muted mb-2">Sin reservas para hoy en esta mesa.</p>
          <button
            onClick={() => setShowWalkIn(true)}
            className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-ink hover:border-accent"
          >
            + Sentar walk-in
          </button>
        </div>
      )}

      <dl className="space-y-2.5 text-sm">
        <Row label="Forma" value={SHAPE_LABEL[table.shape]} />
        <Row label="Capacidad" value={`${table.capacityMin}–${table.capacityMax} personas`} />
        <Row label="Combinable" value={table.joinable ? "Sí" : "No"} />
      </dl>

      {editable && (
        <button
          onClick={onDelete}
          className="w-full mt-6 pt-4 border-t border-line text-sm text-status-occupied hover:opacity-80 text-left"
        >
          Eliminar mesa
        </button>
      )}
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
