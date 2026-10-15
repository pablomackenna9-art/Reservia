import { useMemo } from "react";
import type { ReservationWithDetails } from "@reservia/api-client";
import { findTurnoverConflict, minutesSince, type Table, type Zone } from "@reservia/core";
import { RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";
import { reservationVisualState, stateClass } from "../../lib/stateStyle";

const ROW_HEIGHT = 48;

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

  // Ventana fija de 12:00 a 22:00 -- el rango dinámico (de la reserva más
  // temprana a la más tardía) quedaba angosto o carecía de horas sin
  // reservas todavía, y se veía distinto cada vez que se abría.
  const { rangeStart, rangeEnd } = useMemo(() => {
    const start = new Date(now);
    start.setHours(12, 0, 0, 0);
    const end = new Date(now);
    end.setHours(22, 0, 0, 0);
    return { rangeStart: start.getTime(), rangeEnd: end.getTime() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                className="absolute top-1 text-[13px] text-ink-faint -translate-x-1/2"
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
              <p className="px-3 py-1 text-[13px] uppercase tracking-wide text-ink-faint bg-surface-2/60 sticky left-0">
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
            <p className="text-[13px] text-ink-faint p-4">No hay mesas en esta zona.</p>
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
      <div className={`w-32 shrink-0 flex items-center px-3 ${highlight ? "text-accent text-[13px]" : "text-ink font-serif text-lg"}`}>
        {conflict && <span title="Alguien sentado y otra reserva por llegar pronto -- puede que haya que reasignarla.">⚠ </span>}
        {label}
      </div>
      <div className="relative flex-1">
        {reservations.map((r) => {
          const left = pct(new Date(r.startsAt).getTime());
          const right = pct(new Date(r.endsAt).getTime());
          const width = Math.max(3, right - left);
          return (
            <button
              key={r.id}
              onClick={() => onSelectReservation(r)}
              title={`${r.customerName} · ${r.partySize}p · ${RESERVATION_STATUS_LABEL[r.status]}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              className={`${stateClass(reservationVisualState(r.status))} absolute top-1 bottom-1 rounded-md border-2 px-1.5 text-left overflow-hidden hover:brightness-110`}
            >
              <span className="block truncate text-[13px] font-semibold leading-tight">{r.customerName}</span>
              <span className="block truncate text-[13px] opacity-80 leading-tight">
                {r.partySize}p{r.status === "seated" ? ` · hace ${minutesSince(r.startsAt, now)} min` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
