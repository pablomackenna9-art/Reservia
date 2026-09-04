import { useEffect, useState } from "react";
import {
  acceptReservation,
  getAveragePurchaseByCustomer,
  getCustomerConsumptionStats,
  getReservationRules,
  getSmartTableCandidates,
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
import { estimateOccupancyAt, type Customer, type ReservationRules, type TableAssignmentSource, type TableCandidate, type Zone } from "@reservia/core";
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

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RequestInsight {
  topCandidate: TableCandidate | null;
  zoneName: string | null;
  occupiedPct: number;
  freeTables: number;
  totalTables: number;
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
  const occ = estimateOccupancyAt(totalTables, dayReservations, new Date(reservation.startsAt), new Date(reservation.endsAt));

  const top = candidates[0] ?? null;
  const zoneName = top ? zones.find((z) => z.id === top.zoneId)?.name ?? null : null;

  return { topCandidate: top, zoneName, occupiedPct: occ.pctOccupied, freeTables: occ.freeTables, totalTables: occ.totalTables };
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

  async function handleAccept(reservation: ReservationWithDetails) {
    if (rules) await acceptReservation(supabase, reservation, rules.tableAssignmentMode);
    else await updateReservationStatus(supabase, reservation.id, "confirmed");
    await reload();
  }

  async function handleReject(id: string) {
    if (!confirm("¿Rechazar esta solicitud de reserva?")) return;
    await updateReservationStatus(supabase, id, "cancelled");
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
