import { useState, type ReactNode } from "react";
import { minutesSince, type ReservationStatus, type TableAssignmentSource, type TableCandidate } from "@reservia/core";
import { joinTables, type ReservationWithDetails } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { NEXT_STATUS_ACTIONS, RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "./statusStyles";
import { TableAssignmentPicker } from "./TableAssignmentPicker";
import { CustomerResponseTag } from "./CustomerResponseTag";
import { NotifyCustomerModal } from "./NotifyCustomerModal";

const SOURCE_LABEL: Record<ReservationWithDetails["source"], string> = {
  admin: "Cargada por el staff",
  public_portal: "Portal público",
  phone: "Teléfono",
  walk_in: "Walk-in",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ReservationDetailModal({
  reservation,
  restaurantId,
  zoneName,
  reservationsToday,
  onClose,
  onChangeStatus,
  onAssignTable,
  onSaveNotes,
}: {
  reservation: ReservationWithDetails;
  restaurantId: string;
  zoneName: string | null;
  /** Reservas del mismo día -- opcional, solo para mostrar quién ocupa la mesa ahora mismo. */
  reservationsToday?: ReservationWithDetails[];
  onClose: () => void;
  onChangeStatus: (id: string, status: ReservationStatus) => void | Promise<void>;
  onAssignTable: (reservationId: string, tableId: string, source?: TableAssignmentSource) => void | Promise<void>;
  onSaveNotes: (id: string, notes: string) => void | Promise<void>;
}) {
  const needsApproval = reservation.status === "pending";
  const needsTable = !needsApproval && reservation.tableId === null && ["confirmed", "arriving"].includes(reservation.status);
  const isFinal = ["cancelled", "completed", "no_show"].includes(reservation.status);
  const canPickTable = needsTable || (!needsApproval && !isFinal && !!reservation.tableId);

  const [internalNotes, setInternalNotes] = useState(reservation.internalNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [activeTab, setActiveTab] = useState<"detalle" | "mesa">(needsTable ? "mesa" : "detalle");

  const occupant =
    reservation.status !== "seated" && reservation.tableId
      ? (reservationsToday?.find((r) => r.tableId === reservation.tableId && r.id !== reservation.id && r.status === "seated") ?? null)
      : null;

  async function handlePickTable(candidate: TableCandidate, wasRecommended: boolean) {
    const source: TableAssignmentSource = wasRecommended ? "suggested" : "manual";
    await onAssignTable(reservation.id, candidate.tableIds[0]!, source);
    if (candidate.isCombination && candidate.tableIds.length > 1) {
      await joinTables(supabase, restaurantId, candidate.tableIds[0]!, candidate.tableIds[1]!, `Mesa ${candidate.tableNames.join("+")}`);
    }
    setActiveTab("detalle");
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
        className="w-full max-w-md rounded-2xl bg-surface p-5 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold">{reservation.customerName}</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span
            className="text-[13px] rounded-full px-2.5 py-1 border"
            style={{ color: RESERVATION_STATUS_COLOR[reservation.status], borderColor: RESERVATION_STATUS_COLOR[reservation.status] }}
          >
            {RESERVATION_STATUS_LABEL[reservation.status]}
          </span>
          <span className="text-[13px] text-ink-faint">{SOURCE_LABEL[reservation.source]}</span>
          <CustomerResponseTag reservation={reservation} />
        </div>

        {canPickTable && (
          <div className="flex gap-1 mb-4 border-b border-line">
            <TabButton label="Detalle" active={activeTab === "detalle"} onClick={() => setActiveTab("detalle")} />
            <TabButton
              label={needsTable ? "Asignar mesa" : "Cambiar de mesa"}
              active={activeTab === "mesa"}
              onClick={() => setActiveTab("mesa")}
            />
          </div>
        )}

        {activeTab === "mesa" ? (
          <TableAssignmentPicker
            restaurantId={restaurantId}
            partySize={reservation.partySize}
            startsAt={reservation.startsAt}
            endsAt={reservation.endsAt}
            excludeReservationId={reservation.id}
            showFloorPlanToggle={false}
            reservationsForSchedule={reservationsToday}
            onSelect={handlePickTable}
          />
        ) : (
          <>
            {needsApproval && (
              <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-[13px] text-accent mb-4">
                Solicitud del portal público — hace falta aceptarla o rechazarla.
              </div>
            )}
            {needsTable && (
              <div className="rounded-lg border border-status-arriving/50 bg-status-arriving/10 px-3 py-2 text-[13px] text-status-arriving mb-4">
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

            {["confirmed", "arriving"].includes(reservation.status) && reservation.confirmationToken && (
              <button
                onClick={() => setNotifying(true)}
                className="h-11 px-4 mb-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold hover:bg-line"
              >
                {reservation.customerResponse === "confirmed" ? "Reenviar confirmación" : "Avisar al cliente (WhatsApp)"}
              </button>
            )}

            {reservation.tableId && reservationsToday && (
              <div
                className={`rounded-lg border px-3 py-2 text-[13px] mb-4 ${
                  occupant ? "border-status-occupied/50 bg-status-occupied/10 text-status-occupied" : "border-status-available/50 bg-status-available/10 text-status-available"
                }`}
              >
                {occupant ? (
                  <>
                    Mesa {reservation.tableName} está ocupada ahora por{" "}
                    <span className="font-medium">{occupant.customerName}</span> ({occupant.partySize}p) — llegó a las{" "}
                    {formatTime(occupant.startsAt)}, hace {formatElapsed(minutesSince(occupant.startsAt))}.
                  </>
                ) : (
                  <>Mesa {reservation.tableName} está libre ahora mismo.</>
                )}
              </div>
            )}

            {reservation.notes && (
              <div className="rounded-[10px] bg-ground border border-line p-3 mb-4">
                <p className="text-[13px] text-ink-faint mb-1">Nota del cliente</p>
                <p className="text-sm">{reservation.notes}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[13px] text-ink-faint mb-1">Comentario interno</label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={2}
                placeholder="Visible solo para el staff…"
                className="w-full rounded-[10px] bg-ground border border-line px-3 py-2.5 text-[15px] outline-none focus:border-accent resize-none"
              />
              {internalNotes !== (reservation.internalNotes ?? "") && (
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="mt-1.5 text-[13px] text-accent disabled:opacity-60"
                >
                  {savingNotes ? "Guardando…" : "Guardar comentario"}
                </button>
              )}
            </div>

            {needsApproval && (
              <div className="flex gap-2">
                <button
                  onClick={() => onChangeStatus(reservation.id, "confirmed")}
                  className="flex-1 rounded-[10px] bg-accent text-accent-ink h-11 px-[18px] text-[15px] font-semibold"
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

            {!needsApproval && !isFinal && reservation.tableId && (
              <div className="flex flex-wrap gap-1.5">
                {NEXT_STATUS_ACTIONS[reservation.status]?.map((action) => (
                  <button
                    key={action.status}
                    onClick={() => onChangeStatus(reservation.id, action.status)}
                    className="rounded-[10px] bg-accent text-accent-ink px-2.5 py-1.5 text-[13px] font-semibold"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {notifying && (
        <NotifyCustomerModal reservation={reservation} zoneName={zoneName} accepted={false} onClose={() => setNotifying(false)} />
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? "border-accent text-ink font-medium" : "border-transparent text-ink-faint hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-faint text-[13px]">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
