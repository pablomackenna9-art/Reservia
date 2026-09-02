import { useEffect, useMemo, useState } from "react";
import { listReservationsInRange, type ReservationWithDetails } from "@reservia/api-client";
import type { ReservationSource } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

const SOURCE_LABEL: Record<ReservationSource, string> = {
  admin: "Centro de Control",
  public_portal: "Portal público",
  phone: "Teléfono",
  walk_in: "Walk-in",
};

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

const RANGES = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
];

export function ReportesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [rangeDays, setRangeDays] = useState(7);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const endDate = dateToISO(new Date());
  const startDate = dateToISO(new Date(Date.now() - (rangeDays - 1) * 86_400_000));

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    listReservationsInRange(supabase, restaurantId, startDate, endDate).then((r) => {
      setReservations(r);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, rangeDays]);

  const notCancelled = reservations.filter((r) => r.status !== "cancelled");
  const completed = reservations.filter((r) => r.status === "completed");
  const noShows = reservations.filter((r) => r.status === "no_show");
  const cancelled = reservations.filter((r) => r.status === "cancelled");
  const revenue = completed.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
  const withAmount = completed.filter((r) => r.totalAmount != null);
  const avgTicket = withAmount.length ? revenue / withAmount.length : null;

  const byDay = useMemo(() => {
    const buckets = new Map<string, { reservas: number; cubiertos: number }>();
    for (let i = 0; i < rangeDays; i++) {
      const d = dateToISO(new Date(Date.now() - (rangeDays - 1 - i) * 86_400_000));
      buckets.set(d, { reservas: 0, cubiertos: 0 });
    }
    for (const r of notCancelled) {
      const d = dateToISO(new Date(r.startsAt));
      const bucket = buckets.get(d);
      if (bucket) {
        bucket.reservas += 1;
        bucket.cubiertos += r.partySize;
      }
    }
    const max = Math.max(1, ...[...buckets.values()].map((b) => b.cubiertos));
    return [...buckets.entries()].map(([date, b]) => ({ date, ...b, pct: (b.cubiertos / max) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, rangeDays]);

  const bySource = useMemo(() => {
    const buckets = new Map<ReservationSource, number>();
    for (const r of notCancelled) buckets.set(r.source, (buckets.get(r.source) ?? 0) + 1);
    const max = Math.max(1, ...buckets.values());
    return (Object.keys(SOURCE_LABEL) as ReservationSource[])
      .map((source) => ({ source, count: buckets.get(source) ?? 0, pct: ((buckets.get(source) ?? 0) / max) * 100 }))
      .filter((s) => s.count > 0);
  }, [notCancelled]);

  const byHour = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const r of notCancelled) {
      const hour = new Date(r.startsAt).getHours();
      buckets.set(hour, (buckets.get(hour) ?? 0) + r.partySize);
    }
    const hours = [...buckets.keys()].sort((a, b) => a - b);
    const max = Math.max(1, ...buckets.values());
    return hours.map((hour) => ({ hour, covers: buckets.get(hour)!, pct: (buckets.get(hour)! / max) * 100 }));
  }, [notCancelled]);

  const topTables = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const r of notCancelled) {
      if (!r.tableName) continue;
      buckets.set(r.tableName, (buckets.get(r.tableName) ?? 0) + 1);
    }
    const max = Math.max(1, ...buckets.values());
    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count, pct: (count / max) * 100 }));
  }, [notCancelled]);

  const assigned = notCancelled.filter((r) => r.tableId);
  const assignmentBreakdown = useMemo(() => {
    const counts = { automatic: 0, suggested: 0, manual: 0, none: 0 };
    for (const r of assigned) {
      if (r.tableAssignmentSource === "automatic") counts.automatic += 1;
      else if (r.tableAssignmentSource === "suggested") counts.suggested += 1;
      else if (r.tableAssignmentSource === "manual") counts.manual += 1;
      else counts.none += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations]);

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reportes</h1>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                rangeDays === r.days ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted border border-line"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <StatTile label="Reservas" value={String(notCancelled.length)} />
            <StatTile label="Cubiertos" value={String(notCancelled.reduce((s, r) => s + r.partySize, 0))} />
            <StatTile label="Completadas" value={String(completed.length)} />
            <StatTile label="No-shows" value={String(noShows.length)} />
            <StatTile label="Canceladas" value={String(cancelled.length)} />
            <StatTile
              label="Facturación"
              value={withAmount.length ? formatCLP(revenue) : "—"}
              note={withAmount.length ? undefined : "sin montos cargados"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-3">Cubiertos por día</h2>
              <div className="space-y-1.5">
                {byDay.map(({ date, reservas, cubiertos, pct }) => (
                  <div key={date} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-ink-faint shrink-0">
                      {new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-20 tabular-nums text-ink-faint text-right shrink-0">
                      {cubiertos}p · {reservas}r
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-3">Reservas por canal</h2>
              {bySource.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin datos en este período.</p>
              ) : (
                <div className="space-y-2">
                  {bySource.map(({ source, count, pct }) => (
                    <div key={source} className="flex items-center gap-2 text-xs">
                      <span className="w-32 text-ink-faint shrink-0">{SOURCE_LABEL[source]}</span>
                      <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 tabular-nums text-ink-faint text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 mb-4">
            <StatTile
              label="Ticket promedio"
              value={avgTicket != null ? formatCLP(avgTicket) : "—"}
            />
            <StatTile
              label="Tasa de no-show"
              value={notCancelled.length ? `${Math.round((noShows.length / notCancelled.length) * 100)}%` : "—"}
            />
            <StatTile
              label="Tasa de cancelación"
              value={reservations.length ? `${Math.round((cancelled.length / reservations.length) * 100)}%` : "—"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-3">Ocupación por hora</h2>
              {byHour.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin datos en este período.</p>
              ) : (
                <div className="space-y-1.5">
                  {byHour.map(({ hour, covers, pct }) => (
                    <div key={hour} className="flex items-center gap-2 text-xs">
                      <span className="w-9 tabular-nums text-ink-faint shrink-0">{String(hour).padStart(2, "0")}:00</span>
                      <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 tabular-nums text-ink-faint text-right shrink-0">{covers}p</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-3">Mesas más usadas</h2>
              {topTables.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin datos en este período.</p>
              ) : (
                <div className="space-y-1.5">
                  {topTables.map(({ name, count, pct }) => (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-ink-faint shrink-0 truncate">Mesa {name}</span>
                      <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 tabular-nums text-ink-faint text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 mt-4">
            <h2 className="text-sm font-semibold mb-1">Asignación de mesas</h2>
            <p className="text-xs text-ink-faint mb-3">
              De {assigned.length} reserva{assigned.length === 1 ? "" : "s"} con mesa, cuántas las asignó el Smart Table
              Engine (solo o sugiriendo) vs. a mano.
            </p>
            {assigned.length === 0 ? (
              <p className="text-xs text-ink-faint">Sin datos en este período.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Automática" value={String(assignmentBreakdown.automatic)} />
                <StatTile label="Sugerida (aceptada)" value={String(assignmentBreakdown.suggested)} />
                <StatTile label="Manual" value={String(assignmentBreakdown.manual)} />
                <StatTile label="Sin registrar" value={String(assignmentBreakdown.none)} note="reservas de antes de esta función" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${value === "—" ? "text-ink-faint" : ""}`}>{value}</p>
      {note && <p className="text-[10px] text-ink-faint mt-0.5">{note}</p>}
    </div>
  );
}
