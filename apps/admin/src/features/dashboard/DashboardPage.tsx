import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listReservationsForDate, listTables, listZones, type ReservationWithDetails } from "@reservia/api-client";
import type { Table, Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "../plano/ZoneCanvas";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DashboardPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
    ]).then(([z, t, r]) => {
      if (cancelled) return;
      setZones(z);
      setTables(t);
      setReservations(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const tablesByZone = useMemo(() => {
    const map = new Map<string, Table[]>();
    for (const table of tables) map.set(table.zoneId, [...(map.get(table.zoneId) ?? []), table]);
    return map;
  }, [tables]);

  const active = reservations.filter((r) => r.status !== "cancelled");
  const indicators = [
    { label: "Reservas hoy", value: String(active.length) },
    { label: "Cubiertos reservados", value: String(active.reduce((sum, r) => sum + r.partySize, 0)) },
    { label: "Ocupación estimada", value: "—" },
    { label: "Ingresos estimados", value: "—" },
    { label: "No-shows", value: String(reservations.filter((r) => r.status === "no_show").length) },
  ];

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Centro de Control</h1>
          {current && <p className="text-sm text-ink-muted mt-0.5">{current.restaurant.name}</p>}
        </div>
        <Link to="/plano-de-mesas" className="text-sm text-accent">
          Ver plano completo →
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {indicators.map((indicator) => (
          <div key={indicator.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-faint">{indicator.label}</p>
            <p className={`text-xl font-semibold mt-1 ${indicator.value === "—" ? "text-ink-faint" : ""}`}>
              {indicator.value}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-line bg-surface min-h-[60vh] grid place-items-center">
          <p className="text-sm text-ink-muted">Cargando plano…</p>
        </div>
      ) : zones.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface min-h-[60vh] grid place-items-center">
          <p className="text-sm text-ink-muted">Todavía no hay zonas configuradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 h-[60vh] auto-rows-[minmax(220px,1fr)]">
          {[...zones]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((zone) => (
              <div key={zone.id} className="rounded-xl border border-line overflow-hidden">
                <ZoneCanvas
                  zone={zone}
                  tables={tablesByZone.get(zone.id) ?? []}
                  selectedTableId={null}
                  onSelectTable={() => {}}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
