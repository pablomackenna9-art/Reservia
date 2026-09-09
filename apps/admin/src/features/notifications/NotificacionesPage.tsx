import { useEffect, useState } from "react";
import {
  acceptReservation,
  addToWaitlist,
  getAveragePurchaseByCustomer,
  getCustomerConsumptionStats,
  getReservationRules,
  getSmartTableCandidates,
  joinTables,
  listCustomers,
  listReservationsForDate,
  listReservationsNeedingAttention,
  listTables,
  listZones,
  updateReservationNotes,
  updateReservationStatus,
  updateReservationTable,
  type CustomerConsumptionStats,
  type ReservationWithDetails,
} from "@reservia/api-client";
import {
  compareTableNames,
  estimateOccupancyAt,
  reservationsActiveInWindow,
  type Customer,
  type ReservationRules,
  type TableAssignmentSource,
  type TableCandidate,
  type Zone,
} from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ReservationDetailModal } from "../reservations/ReservationDetailModal";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const NEARBY_SCHEDULE_HOURS = 3;

/**
 * Qué hay en una mesa puntual cerca del horario pedido -- si hay alguien
 * sentado ahí ahora mismo (sin importar cuándo empezó) más lo que arranca
 * dentro de las 3 horas antes/después, para decidir si conviene asignarla.
 */
function nearbySchedule(dayReservations: ReservationWithDetails[], tableIds: string[], requestStartsAt: string): ReservationWithDetails[] {
  const requestMs = new Date(requestStartsAt).getTime();
  const windowMs = NEARBY_SCHEDULE_HOURS * 60 * 60_000;
  return dayReservations
    .filter((r) => r.tableId && tableIds.includes(r.tableId) && r.status !== "cancelled")
    .filter((r) => r.status === "seated" || Math.abs(new Date(r.startsAt).getTime() - requestMs) <= windowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

interface RequestInsight {
  topCandidate: TableCandidate | null;
  /** Todo lo que devolvió el motor de recomendación, no solo la primera -- para mostrar "las mesas libres para este grupo". */
  candidates: TableCandidate[];
  zoneName: string | null;
  occupiedPct: number;
  freeTables: number;
  totalTables: number;
  /** Quién más tiene mesa a esa misma hora, para revisar antes de aceptar. */
  reservationsAtThatHour: ReservationWithDetails[];
  /** Todas las reservas del día -- para armar el horario de una mesa puntual cuando el staff elige un candidato. */
  dayReservations: ReservationWithDetails[];
}

/** Cuánto se demoró en cargar cada solicitud -- las que caen en la misma fecha comparten el fetch de reservas/mesas de ese día. */
async function buildInsight(
  restaurantId: string,
  reservation: ReservationWithDetails,
  zones: Zone[],
  tablesCountByDate: Map<string, number>,
  reservationsByDate: Map<string, ReservationWithDetails[]>,
): Promise<RequestInsight> {
  const dateISO = dateToISO(new Date(reservation.startsAt));

  const [candidates] = await Promise.all([
    getSmartTableCandidates(supabase, {
      restaurantId,
      partySize: reservation.partySize,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
    }),
  ]);

  const dayReservations = reservationsByDate.get(dateISO) ?? [];
  const totalTables = tablesCountByDate.get(dateISO) ?? 0;
  const startsAt = new Date(reservation.startsAt);
  const endsAt = new Date(reservation.endsAt);
  const occ = estimateOccupancyAt(totalTables, dayReservations, startsAt, endsAt);
  const reservationsAtThatHour = reservationsActiveInWindow(dayReservations, startsAt, endsAt)
    .filter((r) => r.id !== reservation.id)
    .sort((a, b) => compareTableNames(a.tableName ?? "", b.tableName ?? ""));

  const top = candidates[0] ?? null;
  const zoneName = top ? zones.find((z) => z.id === top.zoneId)?.name ?? null : null;
  const sortedCandidates = [...candidates].sort((a, b) => compareTableNames(a.tableNames[0]!, b.tableNames[0]!));

  return {
    topCandidate: top,
    candidates: sortedCandidates,
    zoneName,
    occupiedPct: occ.pctOccupied,
    freeTables: occ.freeTables,
    totalTables: occ.totalTables,
    reservationsAtThatHour,
    dayReservations,
  };
}

export function NotificacionesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [pendingApproval, setPendingApproval] = useState<ReservationWithDetails[]>([]);
  const [unassignedTable, setUnassignedTable] = useState<ReservationWithDetails[]>([]);
  const [rules, setRules] = useState<ReservationRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailReservation, setDetailReservation] = useState<ReservationWithDetails | null>(null);
  const [insights, setInsights] = useState<Map<string, RequestInsight>>(new Map());
  const [customersById, setCustomersById] = useState<Map<string, Customer>>(new Map());
  const [avgPurchase, setAvgPurchase] = useState<Map<string, number>>(new Map());
  const [consumption, setConsumption] = useState<Map<string, CustomerConsumptionStats>>(new Map());
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());
  const [selectedCandidateByRequest, setSelectedCandidateByRequest] = useState<Map<string, TableCandidate>>(new Map());

  function toggleExpanded(id: string) {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reload() {
    if (!restaurantId) return;
    const [{ pendingApproval: p, unassignedTable: u }, rr, zones, customers, avg, cons] = await Promise.all([
      listReservationsNeedingAttention(supabase, restaurantId),
      getReservationRules(supabase, restaurantId),
      listZones(supabase, restaurantId),
      listCustomers(supabase, restaurantId),
      getAveragePurchaseByCustomer(supabase, restaurantId),
      getCustomerConsumptionStats(supabase, restaurantId),
    ]);
    setPendingApproval(p);
    setUnassignedTable(u);
    setRules(rr);
    setCustomersById(new Map(customers.map((c) => [c.id, c])));
    setAvgPurchase(avg);
    setConsumption(cons);
    setLoading(false);

    // Solo hace falta recomendación de mesa + capacidad para lo pendiente de
    // aprobar -- lo que ya tiene mesa asignada (unassignedTable es al
    // revés, sin mesa) no la necesita del mismo modo.
    const relevant = p;
    if (relevant.length === 0) {
      setInsights(new Map());
      return;
    }

    const uniqueDates = [...new Set(relevant.map((r) => dateToISO(new Date(r.startsAt))))];
    const [tables, reservationsPerDate] = await Promise.all([
      listTables(supabase, restaurantId),
      Promise.all(uniqueDates.map((d) => listReservationsForDate(supabase, restaurantId, d))),
    ]);
    const tablesCountByDate = new Map(uniqueDates.map((d) => [d, tables.length]));
    const reservationsByDate = new Map(uniqueDates.map((d, i) => [d, reservationsPerDate[i]!]));

    const entries = await Promise.all(
      relevant.map(async (r) => [r.id, await buildInsight(restaurantId, r, zones, tablesCountByDate, reservationsByDate)] as const),
    );
    setInsights(new Map(entries));
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  /** Acepta con la mesa que el staff eligió (o la recomendada, si no tocó nada) -- no vuelve a pedirle candidatos al motor, ya los tenemos de buildInsight. */
  async function handleAccept(reservation: ReservationWithDetails) {
    await updateReservationStatus(supabase, reservation.id, "confirmed");

    const insight = insights.get(reservation.id);
    const chosen = selectedCandidateByRequest.get(reservation.id) ?? insight?.topCandidate ?? null;
    if (chosen) {
      const source: TableAssignmentSource = chosen === insight?.topCandidate ? "suggested" : "manual";
      await updateReservationTable(supabase, reservation.id, chosen.tableIds[0]!, source);
      if (chosen.isCombination && chosen.tableIds.length > 1) {
        await joinTables(
          supabase,
          reservation.restaurantId,
          chosen.tableIds[0]!,
          chosen.tableIds[1]!,
          `Mesa ${chosen.tableNames.join("+")}`,
        );
      }
    }
    await reload();
  }

  async function handleReject(id: string) {
    if (!confirm("¿Rechazar esta solicitud de reserva?")) return;
    await updateReservationStatus(supabase, id, "cancelled");
    await reload();
  }

  /** No hay mesa para ese horario -- en vez de rechazar sin más, la pasamos a lista de espera con la hora que quería guardada en las notas (waitlist_entries no tiene columna de horario propia). */
  async function handleSendToWaitlist(reservation: ReservationWithDetails) {
    if (!restaurantId) return;
    if (!confirm(`¿Anotar a ${reservation.customerName} en la lista de espera para ${formatWhen(reservation.startsAt)}?`)) return;
    await addToWaitlist(supabase, {
      restaurantId,
      customerId: reservation.customerId,
      partySize: reservation.partySize,
      notes: `Quería venir el ${formatWhen(reservation.startsAt)}`,
      source: "reservation",
    });
    await updateReservationStatus(supabase, reservation.id, "cancelled");
    await reload();
  }

  async function handleChangeStatus(id: string, status: Parameters<typeof updateReservationStatus>[2]) {
    const reservation = [...pendingApproval, ...unassignedTable].find((r) => r.id === id);
    if (status === "confirmed" && reservation?.status === "pending" && rules) {
      await acceptReservation(supabase, reservation, rules.tableAssignmentMode);
    } else {
      await updateReservationStatus(supabase, id, status);
    }
    await reload();
    setDetailReservation(null);
  }

  async function handleAssignTable(id: string, tableId: string, source?: TableAssignmentSource) {
    await updateReservationTable(supabase, id, tableId, source);
    await reload();
    setDetailReservation(null);
  }

  async function handleSaveNotes(id: string, notes: string) {
    await updateReservationNotes(supabase, id, notes);
    await reload();
  }

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando…</div>;
  }

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Notificaciones</h1>
        <p className="text-sm text-ink-muted mt-0.5">Lo que necesita tu decisión antes de que llegue el cliente.</p>
      </header>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
          Pendientes de aprobación
          {pendingApproval.length > 0 && (
            <span className="rounded-full bg-accent text-accent-ink text-[11px] px-2 py-0.5">{pendingApproval.length}</span>
          )}
        </h2>
        {pendingApproval.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
            <p className="text-sm text-ink-faint">No hay solicitudes esperando respuesta.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {pendingApproval.map((r) => {
              const insight = insights.get(r.id);
              const customer = customersById.get(r.customerId);
              const spend = avgPurchase.get(r.customerId) ?? consumption.get(r.customerId)?.totalSpent ?? null;
              const occupancyLevel =
                insight == null ? null : insight.occupiedPct >= 90 ? "occupied" : insight.occupiedPct >= 70 ? "arriving" : "available";
              const occupancyColorClass =
                occupancyLevel === "occupied"
                  ? "text-status-occupied"
                  : occupancyLevel === "arriving"
                    ? "text-status-arriving"
                    : "text-status-available";
              const occupancyVerdict =
                occupancyLevel === "occupied"
                  ? "muy ocupado a esa hora"
                  : occupancyLevel === "arriving"
                    ? "va a estar ajustado"
                    : "hay espacio de sobra";

              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setDetailReservation(r)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {r.customerName}
                        {customer && customer.totalVisits >= 5 && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/40 shrink-0">
                            Frecuente
                          </span>
                        )}
                        {customer && customer.noShowCount >= 2 && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 text-status-occupied border border-status-occupied/40 shrink-0">
                            Riesgo no-show
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {formatWhen(r.startsAt)} · {r.partySize} personas
                        {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                      </p>
                    </button>
                    <button
                      onClick={() => handleAccept(r)}
                      className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium shrink-0"
                    >
                      Aceptar
                    </button>
                    <button
                      onClick={() => handleSendToWaitlist(r)}
                      className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-accent hover:border-accent shrink-0"
                    >
                      Lista de espera
                    </button>
                    <button
                      onClick={() => handleReject(r.id)}
                      className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-status-occupied hover:border-status-occupied shrink-0"
                    >
                      Rechazar
                    </button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                    {insight?.topCandidate ? (
                      <span>
                        🎯 Recomendada: <span className="text-ink">Mesa {insight.topCandidate.tableNames.join("+")}</span>
                        {insight.zoneName ? ` (${insight.zoneName})` : ""}
                        {insight.topCandidate.reasons[0] ? ` — ${insight.topCandidate.reasons[0]}` : ""}
                      </span>
                    ) : (
                      <span>Sin mesa disponible para ese horario todavía</span>
                    )}
                    {insight && insight.totalTables > 0 && (
                      <span className={occupancyColorClass}>
                        {insight.occupiedPct}% ocupado a esa hora ({insight.freeTables} libres) — {occupancyVerdict}
                      </span>
                    )}
                    {spend != null && <span>💰 Gasta ~{formatCLP(spend)} en promedio</span>}
                    {customer?.blacklisted && <span className="text-status-occupied">🚫 Cliente bloqueado</span>}
                  </div>

                  {insight && (insight.reservationsAtThatHour.length > 0 || insight.candidates.length > 0) && (
                    <div className="mt-2 pt-2 border-t border-line">
                      <button
                        onClick={() => toggleExpanded(r.id)}
                        className="text-[11px] text-accent hover:underline"
                      >
                        {expandedRequestIds.has(r.id) ? "▾ Minimizar" : "▸ Ver reservas y mesas de esa hora"}
                      </button>

                      {expandedRequestIds.has(r.id) && (
                        <>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">
                              Reservas a esa hora ({insight.reservationsAtThatHour.length})
                            </p>
                            {insight.reservationsAtThatHour.length === 0 ? (
                              <p className="text-[11px] text-ink-faint">Ninguna otra mesa ocupada a esa hora.</p>
                            ) : (
                              <ul className="flex flex-wrap gap-1">
                                {insight.reservationsAtThatHour.map((other) => (
                                  <li
                                    key={other.id}
                                    className="rounded-md bg-ground border border-line px-1.5 py-0.5 text-[11px]"
                                    title={`${other.customerName} · ${other.partySize}p`}
                                  >
                                    {other.tableName ? `Mesa ${other.tableName}` : "Sin mesa"} · {other.customerName}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">
                              Mesas libres para {r.partySize}p ({insight.candidates.length}) — clic para elegir cuál asignar
                            </p>
                            {insight.candidates.length === 0 ? (
                              <p className="text-[11px] text-ink-faint">Ninguna mesa libre para ese grupo a esa hora.</p>
                            ) : (
                              <ul className="flex flex-wrap gap-1">
                                {insight.candidates.map((c) => {
                                  const chosen = selectedCandidateByRequest.get(r.id) ?? insight.topCandidate;
                                  const isChosen = chosen?.tableIds.join("+") === c.tableIds.join("+");
                                  return (
                                    <li key={c.tableIds.join("+")}>
                                      <button
                                        onClick={() =>
                                          setSelectedCandidateByRequest((prev) => new Map(prev).set(r.id, c))
                                        }
                                        title={c.reasons.join(" · ")}
                                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                                          isChosen
                                            ? "bg-accent/15 border-accent text-accent"
                                            : "bg-ground border-line hover:border-accent"
                                        }`}
                                      >
                                        Mesa {c.tableNames.join("+")} · {c.capacityMax}p
                                        {c.isCombination && " 🔗 combinada"}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>

                        {(() => {
                          const chosen = selectedCandidateByRequest.get(r.id) ?? insight.topCandidate;
                          if (!chosen) return null;
                          const schedule = nearbySchedule(insight.dayReservations, chosen.tableIds, r.startsAt);
                          return (
                            <div className="mt-3 pt-2 border-t border-line">
                              <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">
                                Horario de Mesa {chosen.tableNames.join("+")} (±{NEARBY_SCHEDULE_HOURS}h de la hora pedida)
                              </p>
                              {schedule.length === 0 ? (
                                <p className="text-[11px] text-ink-faint">Sin nada cerca de esa hora -- mesa tranquila.</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {schedule.map((s) => (
                                    <li key={s.id} className="text-[11px] text-ink-muted">
                                      {formatTime(s.startsAt)} · {s.customerName} · {s.partySize}p
                                      {s.status === "seated" && <span className="text-status-occupied"> · sentados ahora</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })()}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
          Sin mesa asignada
          {unassignedTable.length > 0 && (
            <span className="rounded-full bg-status-arriving text-accent-ink text-[11px] px-2 py-0.5">
              {unassignedTable.length}
            </span>
          )}
        </h2>
        {unassignedTable.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
            <p className="text-sm text-ink-faint">Todas las reservas aceptadas tienen mesa.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {unassignedTable.map((r) => (
              <button
                key={r.id}
                onClick={() => setDetailReservation(r)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.customerName}</p>
                  <p className="text-xs text-ink-faint">
                    {formatWhen(r.startsAt)} · {r.partySize} personas
                  </p>
                </div>
                <span className="text-xs text-accent shrink-0">Asignar mesa →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {detailReservation && restaurantId && (
        <ReservationDetailModal
          reservation={
            [...pendingApproval, ...unassignedTable].find((r) => r.id === detailReservation.id) ?? detailReservation
          }
          restaurantId={restaurantId}
          zoneName={null}
          onClose={() => setDetailReservation(null)}
          onChangeStatus={handleChangeStatus}
          onAssignTable={handleAssignTable}
          onSaveNotes={handleSaveNotes}
        />
      )}
    </div>
  );
}
