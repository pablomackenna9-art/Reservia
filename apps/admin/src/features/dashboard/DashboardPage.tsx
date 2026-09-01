import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listReservationsForDate,
  listTables,
  listZones,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { deriveTableStatus, type Table, type Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "../plano/ZoneCanvas";
import { NewReservationForm } from "../reservations/NewReservationForm";
import { RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewReservation, setShowNewReservation] = useState(false);

  async function reload() {
    if (!restaurantId) return;
    const [z, t, r] = await Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
    ]);
    setZones(z);
    setTables(t);
    setReservations(r);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, ReservationWithDetails[]>();
    for (const r of reservations) {
      if (!r.tableId) continue;
      map.set(r.tableId, [...(map.get(r.tableId) ?? []), r]);
    }
    return map;
  }, [reservations]);

  const getTableStatus = (tableId: string) => deriveTableStatus(reservationsByTable.get(tableId) ?? []);

  const active = reservations.filter((r) => r.status !== "cancelled");
  const now = new Date();
  const occupiedNow = tables.filter((t) => getTableStatus(t.id) === "occupied").length;
  const availableNow = tables.length - occupiedNow;
  const upcoming = active
    .filter((r) => new Date(r.startsAt) >= now && r.status !== "seated")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);

  const indicators = [
    { label: "Reservas hoy", value: String(active.length) },
    { label: "Cubiertos reservados", value: String(active.reduce((sum, r) => sum + r.partySize, 0)) },
    {
      label: "Ocupación estimada",
      value: tables.length ? `${Math.round((occupiedNow / tables.length) * 100)}%` : "—",
    },
    { label: "Mesas disponibles", value: tables.length ? String(availableNow) : "—" },
    { label: "No-shows", value: String(reservations.filter((r) => r.status === "no_show").length) },
    { label: "Hora actual", value: now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) },
  ];

  // Real, derived facts — not the fabricated "insights" a mock might show.
  const insights: string[] = [];
  if (active.length > 0) insights.push(`Tenés ${active.length} reserva${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"} hoy.`);
  if (tables.length > 0) insights.push(`${availableNow} de ${tables.length} mesas están libres ahora mismo.`);
  if (upcoming.length > 0) {
    insights.push(`La próxima reserva es a las ${formatTime(upcoming[0]!.startsAt)} — ${upcoming[0]!.customerName}.`);
  }
  if (insights.length === 0) insights.push("Sin reservas todavía — se llena a medida que entren.");

  const hourly = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const r of active) {
      const hour = new Date(r.startsAt).getHours();
      buckets.set(hour, (buckets.get(hour) ?? 0) + r.partySize);
    }
    const hours = [...buckets.keys()].sort((a, b) => a - b);
    const max = Math.max(1, ...buckets.values());
    return hours.map((hour) => ({ hour, covers: buckets.get(hour)!, pct: (buckets.get(hour)! / max) * 100 }));
  }, [active]);

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando…</div>;
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Centro de Control</h1>
          {current && (
            <p className="text-sm text-ink-muted mt-0.5">
              {current.restaurant.name} ·{" "}
              {now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/plano-de-mesas" className="text-sm text-accent">
            Editar plano →
          </Link>
          <button
            onClick={() => setShowNewReservation(true)}
            disabled={!restaurantId}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            + Nueva reserva
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {indicators.map((indicator) => (
          <div key={indicator.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-faint">{indicator.label}</p>
            <p className={`text-xl font-semibold mt-1 ${indicator.value === "—" ? "text-ink-faint" : ""}`}>
              {indicator.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 mb-4" style={{ height: "48vh" }}>
        <div className="rounded-xl border border-line overflow-hidden">
          {zones.length === 0 ? (
            <div className="h-full grid place-items-center">
              <p className="text-sm text-ink-muted">Este restaurante todavía no tiene zonas configuradas.</p>
            </div>
          ) : (
            <ZoneCanvas
              zones={zones}
              tables={tables}
              selectedTableId={null}
              onSelectTable={() => {}}
              getTableStatus={getTableStatus}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="rounded-xl border border-line bg-surface p-4 flex-1 min-h-0 overflow-y-auto">
            <h2 className="text-sm font-semibold mb-3">Próximas reservas</h2>
            {upcoming.length === 0 ? (
              <p className="text-xs text-ink-faint">No hay reservas próximas.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="w-12 text-xs tabular-nums text-ink-muted">{formatTime(r.startsAt)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{r.customerName}</p>
                      <p className="text-xs text-ink-faint">
                        {r.partySize}p{r.tableName ? ` · Mesa ${r.tableName}` : ""}
                      </p>
                    </div>
                    <span
                      className="text-[10px] rounded-full px-2 py-0.5 border shrink-0"
                      style={{ color: RESERVATION_STATUS_COLOR[r.status], borderColor: RESERVATION_STATUS_COLOR[r.status] }}
                    >
                      {RESERVATION_STATUS_LABEL[r.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold mb-2">Lista de espera</h2>
            <p className="text-xs text-ink-faint">Todavía no está construida — llega en Fase 5 del roadmap.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">Cubiertos por hora</h2>
          {hourly.length === 0 ? (
            <p className="text-xs text-ink-faint">Sin reservas hoy todavía.</p>
          ) : (
            <div className="space-y-1.5">
              {hourly.map(({ hour, covers, pct }) => (
                <div key={hour} className="flex items-center gap-2 text-xs">
                  <span className="w-9 tabular-nums text-ink-faint">{String(hour).padStart(2, "0")}:00</span>
                  <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 tabular-nums text-ink-faint text-right">{covers}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">Insights del día</h2>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="text-sm text-ink-muted">
                {insight}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 content-start">
          <StatTile label="Mesas ocupadas" value={String(occupiedNow)} />
          <StatTile label="Mesas libres" value={String(availableNow)} />
          <StatTile label="Completadas hoy" value={String(reservations.filter((r) => r.status === "completed").length)} />
          <StatTile label="Facturación" value="—" note="requiere integrar pagos" />
        </div>
      </div>

      {showNewReservation && restaurantId && (
        <NewReservationForm
          restaurantId={restaurantId}
          date={todayISO()}
          onCancel={() => setShowNewReservation(false)}
          onCreated={() => {
            setShowNewReservation(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${value === "—" ? "text-ink-faint" : ""}`}>{value}</p>
      {note && <p className="text-[10px] text-ink-faint mt-0.5">{note}</p>}
    </div>
  );
}
