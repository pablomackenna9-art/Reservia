import { useState, type ReactNode } from "react";
import type { ReservationStatus, Table } from "@reservia/core";
import { listAvailableTables, type ReservationWithDetails } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { NEXT_STATUS_ACTIONS, RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "./statusStyles";

const SOURCE_LABEL: Record<ReservationWithDetails["source"], string> = {
  admin: "Cargada por el staff",
  public_portal: "Portal público",
  phone: "Teléfono",
  walk_in: "Walk-in",
};

export function ReservationDetailModal({
  reservation,
  restaurantId,
  zoneName,
  onClose,
  onChangeStatus,
  onAssignTable,
  onSaveNotes,
}: {
  reservation: ReservationWithDetails;
  restaurantId: string;
  zoneName: string | null;
  onClose: () => void;
  onChangeStatus: (id: string, status: ReservationStatus) => void | Promise<void>;
  onAssignTable: (reservationId: string, tableId: string) => void | Promise<void>;
  onSaveNotes: (id: string, notes: string) => void | Promise<void>;
}) {
  const [internalNotes, setInternalNotes] = useState(reservation.internalNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [pickerTables, setPickerTables] = useState<Table[] | null>(null);

  const needsApproval = reservation.status === "pending";
  const needsTable = !needsApproval && reservation.tableId === null && ["confirmed", "arriving"].includes(reservation.status);
  const isFinal = ["cancelled", "completed", "no_show"].includes(reservation.status);

  async function openTablePicker() {
    setShowTablePicker(true);
    setPickerTables(
      await listAvailableTables(supabase, {
        restaurantId,
        partySize: reservation.partySize,
        startsAt: reservation.startsAt,
        endsAt: reservation.endsAt,
      }),
    );
  }

  async function saveNotes() {
    setSavingNotes(true);
    await onSaveNotes(reservation.id, internalNotes.trim());
    setSavingNotes(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-5 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold">{reservation.customerName}</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span
            className="text-xs rounded-full px-2.5 py-1 border"
            style={{ color: RESERVATION_STATUS_COLOR[reservation.status], borderColor: RESERVATION_STATUS_COLOR[reservation.status] }}
          >
            {RESERVATION_STATUS_LABEL[reservation.status]}
          </span>
          <span className="text-xs text-ink-faint">{SOURCE_LABEL[reservation.source]}</span>
        </div>

        {needsApproval && (
          <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-accent mb-4">
            Solicitud del portal público — hace falta aceptarla o rechazarla.
          </div>
        )}
        {needsTable && (
          <div className="rounded-lg border border-status-arriving/50 bg-status-arriving/10 px-3 py-2 text-xs text-status-arriving mb-4">
            Aceptada, todavía sin mesa asignada.
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm mb-4">
          <Row label="Hora">
            {new Date(reservation.startsAt).toLocaleString("es-CL", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Row>
          <Row label="Personas">{reservation.partySize}</Row>
          <Row label="Lugar">
            {reservation.tableName ? `${zoneName ? `${zoneName} · ` : ""}Mesa ${reservation.tableName}` : "Sin mesa asignada"}
          </Row>
          <Row label="Teléfono">{reservation.customerPhone ?? "—"}</Row>
          <Row label="Email">{reservation.customerEmail ?? "—"}</Row>
        </dl>

        {reservation.notes && (
          <div className="rounded-lg bg-ground border border-line p-3 mb-4">
            <p className="text-xs text-ink-faint mb-1">Nota del cliente</p>
            <p className="text-sm">{reservation.notes}</p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-ink-faint mb-1">Comentario interno</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="Visible solo para el staff…"
            className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent resize-none"
          />
          {internalNotes !== (reservation.internalNotes ?? "") && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-1.5 text-xs text-accent disabled:opacity-60"
            >
              {savingNotes ? "Guardando…" : "Guardar comentario"}
            </button>
          )}
        </div>

        {needsApproval && (
          <div className="flex gap-2">
            <button
              onClick={() => onChangeStatus(reservation.id, "confirmed")}
              className="flex-1 rounded-lg bg-accent text-accent-ink px-3 py-2 text-sm font-medium"
            >
              Aceptar reserva
            </button>
            <button
              onClick={() => onChangeStatus(reservation.id, "cancelled")}
              className="flex-1 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm text-status-occupied hover:border-status-occupied"
            >
              Rechazar
            </button>
          </div>
        )}

        {needsTable && !showTablePicker && (
          <button
            onClick={openTablePicker}
            className="w-full rounded-lg bg-accent text-accent-ink px-3 py-2 text-sm font-medium"
          >
            Asignar mesa
          </button>
        )}

        {!needsApproval && !isFinal && reservation.tableId && (
          <div className="flex flex-wrap gap-1.5">
            {NEXT_STATUS_ACTIONS[reservation.status]?.map((action) => (
              <button
                key={action.status}
                onClick={() => onChangeStatus(reservation.id, action.status)}
                className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={openTablePicker}
              className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-ink hover:border-accent"
            >
              Cambiar de mesa
            </button>
          </div>
        )}

        {showTablePicker && (
          <div className="mt-2.5 pt-2.5 border-t border-line">
            {pickerTables === null ? (
              <p className="text-xs text-ink-faint">Buscando mesas disponibles…</p>
            ) : pickerTables.length === 0 ? (
              <p className="text-xs text-ink-faint">Ninguna mesa libre a esa hora para {reservation.partySize} personas.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pickerTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onAssignTable(reservation.id, t.id);
                      setShowTablePicker(false);
                    }}
                    className="rounded-lg bg-ground border border-line px-2 py-1 text-xs hover:border-accent"
                  >
                    Mesa {t.name} · {t.capacityMax}p
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowTablePicker(false)} className="text-xs text-ink-faint mt-1.5">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-faint text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
