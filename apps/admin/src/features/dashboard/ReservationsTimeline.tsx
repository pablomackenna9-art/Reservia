import { useMemo } from "react";
import type { ReservationWithDetails } from "@reservia/api-client";
import { findTurnoverConflict, minutesSince, type Table, type Zone } from "@reservia/core";
import { RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";

const ROW_HEIGHT = 44;

/**
 * Vista mesa × hora, estilo Cover Manager: una fila por mesa mostrando qué
 * reserva la ocupa a qué hora, cuánta gente, y si ya está sentada hace
 * cuánto. Clic en cualquier bloque abre `ReservationDetailModal` (que ya
 * trae "Cambiar de mesa" con recomendación incluida) -- no duplica esa
 * lógica, solo la dispara.
 */
export function ReservationsTimeline({
  zones,
  visibleTables,
  reservationsToday,
  now,
  onSelectReservation,
}: {
  zones: Zone[];
  visibleTables: Table[];
  reservationsToday: ReservationWithDetails[];
  now: Date;
  onSelectReservation: (r: ReservationWithDetails) => void;
}) {
  const active = reservationsToday.filter((r) => r.status !== "cancelled");
  const unassigned = active.filter((r) => !r.tableId);

  // Rango horario: de la reserva más temprana a la más tardía de hoy, con
  // 30min de margen a cada lado. Sin reservas, una ventana chica alrededor
  // de ahora para que la grilla no quede vacía.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (active.length === 0) {
      return { rangeStart: now.getTime() - 60 * 60_000, rangeEnd: now.getTime() + 4 * 60 * 60_000 };
    }
    const starts = active.map((r) => new Date(r.startsAt).getTime());
    const ends = active.map((r) => new Date(r.endsAt).getTime());
    return { rangeStart: Math.min(...starts) - 30 * 60_000, rangeEnd: Math.max(...ends) + 30 * 60_000 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationsToday]);

  const totalMs = Math.max(1, rangeEnd - rangeStart);
  function pct(ms: number): number {
    return Math.min(100, Math.max(0, ((ms - rangeStart) / totalMs) * 100));
  }

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const first = new Date(rangeStart);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < rangeStart) first.setHours(first.getHours() + 1);
    for (let t = first.getTime(); t <= rangeEnd; t += 60 * 60_000) marks.push(t);
    return marks;
  }, [rangeStart, rangeEnd]);

  const nowPct = now.getTime() >= rangeStart && now.getTime() <= rangeEnd ? pct(now.getTime()) : null;

  const rowGroups = zones
    .map((zone) => ({ zone, tables: visibleTables.filter((t) => t.zoneId === zone.id) }))
    .filter((g) => g.tables.length > 0);

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[720px]">
        {/* Eje de horas */}
        <div className="flex sticky top-0 z-10 bg-surface-2 border-b border-line" style={{ height: 24 }}>
          <div className="w-32 shrink-0" />
          <div className="relative flex-1">
            {hourMarks.map((t) => (
              <span
                key={t}
                className="absolute top-1 text-[10px] text-ink-faint -translate-x-1/2"
                style={{ left: `${pct(t)}%` }}
              >
                {new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Línea vertical de "ahora", cruzando todas las filas */}
          {nowPct !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-accent z-10 pointer-events-none"
              style={{ left: `calc(8rem + (100% - 8rem) * ${nowPct / 100})` }}
            />
          )}

          {unassigned.length > 0 && (
            <TimelineRow
              label="Sin mesa asignada"
              highlight
              reservations={unassigned}
              pct={pct}
              now={now}
              onSelectReservation={onSelectReservation}
            />
          )}

          {rowGroups.map(({ zone, tables }) => (
            <div key={zone.id}>
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-faint bg-surface-2/60 sticky left-0">
                {zone.name}
              </p>
              {tables.map((table) => {
                const tableReservations = active.filter((r) => r.tableId === table.id);
                const conflict = findTurnoverConflict(tableReservations, now);
                return (
                  <TimelineRow
                    key={table.id}
                    label={`Mesa ${table.name}`}
                    conflict={!!conflict}
                    reservations={tableReservations}
                    pct={pct}
                    now={now}
                    onSelectReservation={onSelectReservation}
                  />
                );
              })}
            </div>
          ))}

          {rowGroups.length === 0 && unassigned.length === 0 && (
            <p className="text-xs text-ink-faint p-4">No hay mesas en esta zona.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  reservations,
  pct,
  now,
  onSelectReservation,
  highlight,
  conflict,
}: {
  label: string;
  reservations: ReservationWithDetails[];
  pct: (ms: number) => number;
  now: Date;
  onSelectReservation: (r: ReservationWithDetails) => void;
  highlight?: boolean;
  conflict?: boolean;
}) {
  return (
    <div className="flex border-b border-line" style={{ height: ROW_HEIGHT }}>
      <div className={`w-32 shrink-0 flex items-center px-3 text-xs ${highlight ? "text-accent" : "text-ink-muted"}`}>
        {conflict && <span title="Alguien sentado y otra reserva por llegar pronto -- puede que haya que reasignarla.">⚠ </span>}
        {label}
      </div>
      <div className="relative flex-1">
        {reservations.map((r) => {
          const left = pct(new Date(r.startsAt).getTime());
          const right = pct(new Date(r.endsAt).getTime());
          const width = Math.max(3, right - left);
          const color = RESERVATION_STATUS_COLOR[r.status];
          return (
            <button
              key={r.id}
              onClick={() => onSelectReservation(r)}
              title={`${r.customerName} · ${r.partySize}p · ${RESERVATION_STATUS_LABEL[r.status]}`}
              style={{ left: `${left}%`, width: `${width}%`, borderColor: color }}
              className="absolute top-1 bottom-1 rounded-md border bg-surface px-1.5 text-left overflow-hidden hover:brightness-125"
            >
              <span className="block truncate text-[11px] font-medium leading-tight">{r.customerName}</span>
              <span className="block truncate text-[10px] text-ink-faint leading-tight">
                {r.partySize}p{r.status === "seated" ? ` · hace ${minutesSince(r.startsAt, now)} min` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
