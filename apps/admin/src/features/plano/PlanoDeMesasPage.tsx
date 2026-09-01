import { useEffect, useMemo, useState } from "react";
import {
  deactivateTable,
  listReservationsForDate,
  listTables,
  listZones,
  updateReservationStatus,
  updateTablePosition,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { deriveTableStatus, type ReservationStatus, type Table, type Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "./ZoneCanvas";
import { TableDetailPanel } from "./TableDetailPanel";
import { NewTableForm } from "./NewTableForm";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlanoDeMesasPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeZoneId, setActiveZoneId] = useState<string | "all">("all");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showNewTable, setShowNewTable] = useState(false);

  async function reload() {
    if (!restaurantId) return;
    const [z, t, r] = await Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
    ]);
    setZones(z);
    setTables(t);
    setReservationsToday(r);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, ReservationWithDetails[]>();
    for (const r of reservationsToday) {
      if (!r.tableId) continue;
      map.set(r.tableId, [...(map.get(r.tableId) ?? []), r]);
    }
    return map;
  }, [reservationsToday]);

  function getTableStatus(tableId: string) {
    return deriveTableStatus(reservationsByTable.get(tableId) ?? []);
  }

  async function handleMoveTable(tableId: string, positionX: number, positionY: number) {
    // Optimistic — the drag already shows the new spot; this just makes it stick.
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, positionX, positionY } : t)));
    await updateTablePosition(supabase, tableId, positionX, positionY);
  }

  async function handleDeleteTable(tableId: string) {
    if (!confirm("¿Eliminar esta mesa? Se puede volver a crear, pero no se recupera esta.")) return;
    setSelectedTableId(null);
    await deactivateTable(supabase, tableId);
    reload();
  }

  async function handleChangeReservationStatus(reservationId: string, status: ReservationStatus) {
    await updateReservationStatus(supabase, reservationId, status);
    reload();
  }

  const visibleZones = activeZoneId === "all" ? zones : zones.filter((z) => z.id === activeZoneId);
  const visibleTables =
    activeZoneId === "all" ? tables : tables.filter((t) => t.zoneId === activeZoneId);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableZone = selectedTable ? zones.find((z) => z.id === selectedTable.zoneId) ?? null : null;

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando plano…</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-line bg-surface min-h-[80vh] grid place-items-center">
          <p className="text-sm text-ink-muted">Este restaurante todavía no tiene zonas configuradas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen flex flex-col">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Plano de mesas</h1>
        <div className="flex items-center gap-2">
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
          {editMode && (
            <button
              onClick={() => setShowNewTable(true)}
              className="rounded-lg bg-accent text-accent-ink px-3 py-1.5 text-sm font-medium"
            >
              + Agregar mesa
            </button>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              editMode ? "bg-accent text-accent-ink border-accent" : "bg-surface text-ink-muted border-line"
            }`}
          >
            {editMode ? "Listo" : "Editar plano"}
          </button>
        </div>
      </header>

      {editMode && (
        <p className="text-xs text-ink-faint mb-3">
          Arrastrá una mesa para moverla — se guarda sola. Tocá una mesa para eliminarla.
        </p>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0 rounded-xl border border-line overflow-hidden">
          <ZoneCanvas
            zones={visibleZones}
            tables={visibleTables}
            selectedTableId={selectedTableId}
            onSelectTable={setSelectedTableId}
            editable={editMode}
            onMoveTable={handleMoveTable}
            getTableStatus={getTableStatus}
          />
        </div>

        {selectedTable && selectedTableZone && (
          <TableDetailPanel
            table={selectedTable}
            zoneName={selectedTableZone.name}
            status={getTableStatus(selectedTable.id)}
            reservationsToday={reservationsByTable.get(selectedTable.id) ?? []}
            editable={editMode}
            onClose={() => setSelectedTableId(null)}
            onDelete={() => handleDeleteTable(selectedTable.id)}
            onChangeReservationStatus={handleChangeReservationStatus}
          />
        )}
      </div>

      {showNewTable && restaurantId && (
        <NewTableForm
          restaurantId={restaurantId}
          zones={zones}
          defaultZoneId={activeZoneId === "all" ? zones[0]!.id : activeZoneId}
          onCancel={() => setShowNewTable(false)}
          onCreated={() => {
            setShowNewTable(false);
            reload();
          }}
        />
      )}
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
