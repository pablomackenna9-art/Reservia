import { useEffect, useMemo, useState } from "react";
import { listTables, listZones } from "@reservia/api-client";
import type { Table, Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "./ZoneCanvas";
import { TableDetailPanel } from "./TableDetailPanel";

export function PlanoDeMesasPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeZoneId, setActiveZoneId] = useState<string | "all">("all");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listZones(supabase, restaurantId), listTables(supabase, restaurantId)]).then(([z, t]) => {
      if (cancelled) return;
      setZones(z);
      setTables(t);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const tablesByZone = useMemo(() => {
    const map = new Map<string, Table[]>();
    for (const table of tables) {
      const list = map.get(table.zoneId) ?? [];
      list.push(table);
      map.set(table.zoneId, list);
    }
    return map;
  }, [tables]);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableZone = selectedTable ? zones.find((z) => z.id === selectedTable.zoneId) ?? null : null;

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando plano…</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-line bg-surface min-h-[80vh] grid place-items-center">
          <div className="text-center max-w-sm px-4">
            <h1 className="text-lg font-semibold mb-2">Todavía no hay zonas</h1>
            <p className="text-ink-muted text-sm">
              El editor de plano llega en Fase 6. Por ahora, las zonas y mesas de este restaurante se cargan por
              seed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen flex flex-col">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Plano de mesas</h1>
        <div className="flex gap-1.5">
          <ZoneTab label="Todo" active={activeZoneId === "all"} onClick={() => setActiveZoneId("all")} />
          {[...zones]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((zone) => (
              <ZoneTab
                key={zone.id}
                label={zone.name}
                active={activeZoneId === zone.id}
                onClick={() => setActiveZoneId(zone.id)}
              />
            ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0">
          {activeZoneId === "all" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 h-full auto-rows-[minmax(280px,1fr)] overflow-y-auto pr-1">
              {[...zones]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((zone) => (
                  <div key={zone.id} className="rounded-xl border border-line overflow-hidden">
                    <ZoneCanvas
                      zone={zone}
                      tables={tablesByZone.get(zone.id) ?? []}
                      selectedTableId={selectedTableId}
                      onSelectTable={setSelectedTableId}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <div className="rounded-xl border border-line overflow-hidden h-full">
              <ZoneCanvas
                zone={zones.find((z) => z.id === activeZoneId)!}
                tables={tablesByZone.get(activeZoneId) ?? []}
                selectedTableId={selectedTableId}
                onSelectTable={setSelectedTableId}
              />
            </div>
          )}
        </div>

        {selectedTable && (
          <TableDetailPanel
            table={selectedTable}
            zoneName={selectedTableZone?.name ?? ""}
            onClose={() => setSelectedTableId(null)}
          />
        )}
      </div>
    </div>
  );
}

function ZoneTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted hover:text-ink border border-line"
      }`}
    >
      {label}
    </button>
  );
}
