import { useEffect, useState, type ReactNode } from "react";
import { minutesSince, type ReservationStatus, type TableAssignmentSource, type TableCandidate, type Zone } from "@reservia/core";
import { acceptReservationWithTable, assignCandidateToReservation, getSmartTableCandidates, listZones, type ReservationWithDetails } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { NEXT_STATUS_ACTIONS, RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "./statusStyles";
import { TableAssignmentPicker } from "./TableAssignmentPicker";
import { CustomerResponseTag } from "./CustomerResponseTag";
import { Tag } from "../../components/ui";
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
  onAccepted,
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
  /** Se llama después de aceptar una solicitud desde acá (ya con mesa asignada), para que la pantalla se refresque. */
  onAccepted?: () => void | Promise<void>;
}) {
  const needsApproval = reservation.status === "pending";
  const needsTable = !needsApproval && reservation.tableId === null && ["confirmed", "arriving"].includes(reservation.status);
  const isFinal = ["cancelled", "completed", "no_show"].includes(reservation.status);
  const canPickTable = needsTable || (!needsApproval && !isFinal && !!reservation.tableId);
  const showTabs = canPickTable || needsApproval;

  const [internalNotes, setInternalNotes] = useState(reservation.internalNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notifying, setNotifying] = useState<null | "accepted" | "resend">(null);
  const [zones, setZones] = useState<Zone[]>([]);
  // Solicitud pendiente: la mesa que se le pondrá, visible ANTES de aceptar.
  const [suggested, setSuggested] = useState<TableCandidate | null | undefined>(undefined);
  const [chosen, setChosen] = useState<{ candidate: TableCandidate; isTop: boolean } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    listZones(supabase, restaurantId)
      .then(setZones)
      .catch(() => setZones([]));
  }, [restaurantId]);

  useEffect(() => {
    if (!needsApproval) return;
    let cancelled = false;
    setSuggested(undefined);
    getSmartTableCandidates(supabase, {
      restaurantId,
      partySize: reservation.partySize,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      preferredZoneId: reservation.preferredZoneId ?? null,
      zonePreference: "preferred",
      excludeReservationId: reservation.id,
    })
      .then((list) => {
        if (!cancelled) setSuggested(list[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setSuggested(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsApproval, reservation.id, reservation.startsAt, reservation.partySize, reservation.preferredZoneId]);

  const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));
  const requestedZoneName = reservation.preferredZoneId ? (zoneNameById.get(reservation.preferredZoneId) ?? "…") : "Me da lo mismo";
  const plannedTable = chosen ?? (suggested ? { candidate: suggested, isTop: true } : null);

  async function acceptWithTable() {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptReservationWithTable(supabase, reservation, plannedTable?.candidate ?? null, plannedTable?.isTop ?? false);
      setNotifying("accepted");
      if (onAccepted) await onAccepted();
      else await onChangeStatus(reservation.id, "confirmed");
    } catch (err) {
      setAcceptError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudo aceptar.");
    } finally {
      setAccepting(false);
    }
  }
  const [activeTab, setActiveTab] = useState<"detalle" | "mesa">(needsTable ? "mesa" : "detalle");

  const occupant =
    reservation.status !== "seated" && reservation.tableId
      ? (reservationsToday?.find((r) => r.tableId === reservation.tableId && r.id !== reservation.id && r.status === "seated") ?? null)
      : null;

  async function handlePickTable(candidate: TableCandidate, wasRecommended: boolean) {
    const source: TableAssignmentSource = wasRecommended ? "suggested" : "manual";
    // Con varias mesas se arma primero la unión (número + mesas bloqueadas) y después la pantalla se refresca.
    if (candidate.tableIds.length > 1) await assignCandidateToReservation(supabase, reservation.id, candidate, source);
    await onAssignTable(reservation.id, candidate.tableIds[0]!, source);
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
          {reservation.unionNumber != null && <Tag tone="accent">Unión N° {reservation.unionNumber}</Tag>}
        </div>

        {showTabs && (
          <div className="flex gap-1 mb-4 border-b border-line">
            <TabButton label="Detalle" active={activeTab === "detalle"} onClick={() => setActiveTab("detalle")} />
            <TabButton
              label={needsApproval ? "Elegir mesa" : needsTable ? "Asignar mesa" : "Cambiar de mesa"}
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
            preferredZoneId={reservation.preferredZoneId ?? null}
            zonePreference="preferred"
            onSelect={
              needsApproval
                ? (candidate, wasRecommended) => {
                    setChosen({ candidate, isTop: wasRecommended });
                    setActiveTab("detalle");
                  }
                : handlePickTable
            }
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
                {reservation.tableName
                  ? reservation.extraTableNames && reservation.extraTableNames.length > 0
                    ? `Unión N° ${reservation.unionNumber ?? "?"} · Mesas ${[reservation.tableName, ...reservation.extraTableNames].join(" + ")}`
                    : `${zoneName ? `${zoneName} · ` : ""}Mesa ${reservation.tableName}`
                  : "Sin mesa asignada"}
              </Row>
              {(needsApproval || reservation.preferredZoneId) && <Row label="Ubicación pedida">{requestedZoneName}</Row>}
              <Row label="Teléfono">{reservation.customerPhone ?? "—"}</Row>
              <Row label="Email">{reservation.customerEmail ?? "—"}</Row>
            </dl>

            {needsApproval && (
              <div className="rounded-lg border border-line bg-ground px-3 py-2.5 mb-4">
                <p className="text-[13px] text-ink-faint mb-1">Mesa en la que la pondrás</p>
                {suggested === undefined ? (
                  <p className="text-[15px] text-ink-muted">Buscando la mejor mesa…</p>
                ) : plannedTable ? (
                  <>
                    <p className="text-[15px] font-semibold">
                      {plannedTable.candidate.tableIds.length > 1 ? "Unión de mesas " : "Mesa "}
                      {plannedTable.candidate.tableNames.join(" + ")}
                      <span className="font-normal text-ink-muted">
                        {" "}
                        · {zoneNameById.get(plannedTable.candidate.zoneId) ?? "…"} · hasta {plannedTable.candidate.capacityMax} personas
                      </span>
                    </p>
                    {plannedTable.candidate.tableIds.length > 1 && (
                      <p className="text-[13px] text-status-arriving mt-1">
                        🔗 Ninguna mesa sola alcanza para {reservation.partySize} personas. Se unirían {plannedTable.candidate.tableIds.length} mesas libres (
                        {plannedTable.candidate.capacityMax} asientos) y la reserva recibirá un número de unión para identificar la mesa y su cuenta.
                      </p>
                    )}
                    {reservation.preferredZoneId && plannedTable.candidate.zoneId !== reservation.preferredZoneId && (
                      <p className="text-[13px] text-status-arriving mt-1">
                        ⚠ El cliente pidió {requestedZoneName}, pero no hay mesa libre ahí a esa hora.
                      </p>
                    )}
                    {!chosen && <p className="text-[13px] text-ink-faint mt-1">Recomendada por el sistema. Puedes cambiarla antes de aceptar.</p>}
                  </>
                ) : (
                  <p className="text-[15px] text-status-occupied">
                    No hay mesa libre a esa hora para {reservation.partySize} personas. Puedes aceptar y asignarla después, o pasarla a lista de espera.
                  </p>
                )}
                <button onClick={() => setActiveTab("mesa")} className="mt-2 text-[13px] font-semibold text-accent">
                  {plannedTable ? "Ver línea de tiempo y elegir otra mesa →" : "Ver mesas →"}
                </button>
              </div>
            )}

            {["confirmed", "arriving"].includes(reservation.status) && reservation.confirmationToken && (
              <button
                onClick={() => setNotifying("resend")}
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

            {needsApproval && acceptError && <p className="text-[13px] text-status-occupied mb-2">{acceptError}</p>}
            {needsApproval && (
              <div className="flex gap-2">
                <button
                  onClick={acceptWithTable}
                  disabled={accepting || suggested === undefined}
                  className="flex-1 rounded-[10px] bg-accent text-accent-ink h-11 px-[18px] text-[15px] font-semibold disabled:opacity-60"
                >
                  {accepting
                    ? "Aceptando…"
                    : plannedTable
                      ? plannedTable.candidate.tableIds.length > 1
                        ? `Unir ${plannedTable.candidate.tableIds.length} mesas y aceptar`
                        : `Aceptar en Mesa ${plannedTable.candidate.tableNames.join("+")}`
                      : "Aceptar reserva"}
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
        <NotifyCustomerModal
          reservation={reservation}
          zoneName={zoneName ?? (reservation.preferredZoneId ? (zoneNameById.get(reservation.preferredZoneId) ?? null) : null)}
          accepted={notifying === "accepted"}
          onClose={() => {
            const wasAccepted = notifying === "accepted";
            setNotifying(null);
            if (wasAccepted) onClose();
          }}
        />
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
