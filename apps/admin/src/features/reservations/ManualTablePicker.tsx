import { useState } from "react";
import { checkTableAvailability, listTables, listZones, type ReservationWithDetails } from "@reservia/api-client";
import { compareTableNames, reservationUsesAnyTable, type Table, type TableCandidate, type Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";

interface Loaded {
  zones: Zone[];
  tables: Table[];
  free: Map<string, boolean>;
}

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/**
 * "Elegir yo la mesa": todas las mesas del restaurante, no solo las recomendadas. Las libres a esa hora se
 * pueden tocar (una o varias: con varias se UNEN); las ocupadas o bloqueadas se ven, con el motivo, pero no
 * se pueden elegir -- así nadie queda con una mesa pisada por otra reserva.
 */
export function ManualTablePicker({
  restaurantId,
  partySize,
  startsAt,
  endsAt,
  excludeReservationId,
  reservationsForSchedule,
  onSelect,
}: {
  restaurantId: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  excludeReservationId?: string;
  reservationsForSchedule?: ReservationWithDetails[];
  onSelect: (candidate: TableCandidate, wasRecommended: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function openList() {
    setOpen(true);
    if (loaded) return;
    try {
      const [zones, allTables] = await Promise.all([listZones(supabase, restaurantId), listTables(supabase, restaurantId)]);
      const tables = allTables.filter((t) => t.active);
      const results = await Promise.all(tables.map((t) => checkTableAvailability(supabase, t.id, startsAt, endsAt, excludeReservationId)));
      setLoaded({ zones, tables, free: new Map(tables.map((t, i) => [t.id, results[i]!])) });
    } catch {
      setError("No pudimos cargar las mesas. Intenta de nuevo.");
    }
  }

  function occupantOf(tableId: string): ReservationWithDetails | null {
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    return (
      (reservationsForSchedule ?? []).find(
        (r) =>
          r.id !== excludeReservationId &&
          r.status !== "cancelled" &&
          r.status !== "no_show" &&
          reservationUsesAnyTable(r, [tableId]) &&
          new Date(r.startsAt).getTime() < endMs &&
          new Date(r.endsAt).getTime() > startMs,
      ) ?? null
    );
  }

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const chosenTables = loaded ? selected.map((id) => loaded.tables.find((t) => t.id === id)!).filter(Boolean) : [];
  const totalCapacity = chosenTables.reduce((s, t) => s + t.capacityMax, 0);

  function confirmSelection() {
    if (chosenTables.length === 0) return;
    if (totalCapacity < partySize && !confirm(`Las mesas elegidas son para ${totalCapacity} personas y el grupo es de ${partySize}. ¿Mover igual?`)) return;
    const candidate: TableCandidate = {
      tableIds: chosenTables.map((t) => t.id),
      tableNames: chosenTables.map((t) => t.name),
      zoneId: chosenTables[0]!.zoneId,
      capacityMin: chosenTables.reduce((s, t) => s + t.capacityMin, 0),
      capacityMax: totalCapacity,
      isCombination: chosenTables.length > 1,
      score: 0,
      reasons: ["Elegida por ti"],
    };
    onSelect(candidate, false);
  }

  if (!open) {
    return (
      <button type="button" onClick={openList} className="mt-3 h-11 px-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold hover:bg-line">
        Elegir yo la mesa (ver todas)
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-ground p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-[15px] font-semibold">Elige la mesa que quieras</p>
          <p className="text-[13px] text-ink-faint">Toca una mesa libre. Si tocas varias, se unen (la reserva recibe número de unión).</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-ink-faint shrink-0">
          Cerrar
        </button>
      </div>

      {error && <p className="text-[13px] text-status-occupied">{error}</p>}
      {!loaded && !error && <p className="text-[13px] text-ink-faint">Revisando qué mesas están libres a esa hora…</p>}

      {loaded && (
        <div className="space-y-3 max-h-[46dvh] overflow-y-auto pr-1">
          {loaded.zones
            .map((z) => ({ zone: z, tables: loaded.tables.filter((t) => t.zoneId === z.id).sort((a, b) => compareTableNames(a.name, b.name)) }))
            .filter((g) => g.tables.length > 0)
            .map(({ zone, tables }) => (
              <div key={zone.id}>
                <p className="text-[13px] uppercase tracking-wide text-ink-faint mb-1">{zone.name}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {tables.map((t) => {
                    const isFree = loaded.free.get(t.id) === true && !t.blocked;
                    const occupant = !isFree && !t.blocked ? occupantOf(t.id) : null;
                    const isSelected = selected.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!isFree}
                        onClick={() => toggle(t.id)}
                        className={`rounded-[10px] border px-2.5 py-1.5 text-left min-h-[56px] ${
                          isSelected
                            ? "border-accent bg-accent/15"
                            : isFree
                              ? "border-line bg-surface hover:border-accent"
                              : "border-line bg-surface opacity-55 cursor-not-allowed"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-1">
                          <span className="font-serif text-lg leading-tight">{t.name}</span>
                          <span className="text-[13px] text-ink-faint">hasta {t.capacityMax}</span>
                        </span>
                        <span
                          className={`block text-[13px] leading-tight truncate ${
                            isSelected ? "text-accent font-semibold" : isFree ? (t.capacityMax < partySize ? "text-status-arriving" : "text-status-available") : "text-status-occupied"
                          }`}
                        >
                          {isSelected
                            ? "Elegida ✓"
                            : t.blocked
                              ? "Bloqueada"
                              : isFree
                                ? t.capacityMax < partySize
                                  ? "Libre · chica para el grupo"
                                  : "Libre"
                                : occupant
                                  ? `Ocupada · ${occupant.customerName.split(" ")[0]} ${hm(occupant.startsAt)}`
                                  : "Ocupada a esa hora"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {chosenTables.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px]">
            {chosenTables.length > 1 ? "Unir " : "Mesa "}
            <span className="font-semibold">{chosenTables.map((t) => t.name).join(" + ")}</span>
            <span className="text-ink-muted"> · hasta {totalCapacity} personas</span>
          </p>
          <button
            type="button"
            onClick={confirmSelection}
            className="h-11 px-4 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
          >
            {chosenTables.length > 1 ? `Unir ${chosenTables.length} mesas y mover` : "Mover a esta mesa"}
          </button>
        </div>
      )}
    </div>
  );
}
