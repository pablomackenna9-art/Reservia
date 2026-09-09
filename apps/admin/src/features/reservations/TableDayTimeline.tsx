import type { ReservationWithDetails } from "@reservia/api-client";
import { minutesSince } from "@reservia/core";
import { RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "./statusStyles";

const RANGE_START_HOUR = 12;
const RANGE_END_HOUR = 22;

/**
 * Mini Gantt de un día para una sola mesa (o una combinación) -- misma idea
 * que ReservationsTimeline pero para un candidato puntual dentro del
 * TableAssignmentPicker, así el staff ve el día completo antes de asignar
 * en vez de solo el resumen en texto de nearbyTableSchedule.
 */
export function TableDayTimeline({
  reservations,
  now,
}: {
  reservations: ReservationWithDetails[];
  now: Date;
}) {
  const rangeStart = new Date(now);
  rangeStart.setHours(RANGE_START_HOUR, 0, 0, 0);
  const rangeEnd = new Date(now);
  rangeEnd.setHours(RANGE_END_HOUR, 0, 0, 0);
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const totalMs = Math.max(1, endMs - startMs);

  function pct(ms: number): number {
    return Math.min(100, Math.max(0, ((ms - startMs) / totalMs) * 100));
  }

  const hourMarks: number[] = [];
  const first = new Date(rangeStart);
  first.setMinutes(0, 0, 0);
  if (first.getTime() < startMs) first.setHours(first.getHours() + 1);
  for (let t = first.getTime(); t <= endMs; t += 2 * 60 * 60_000) hourMarks.push(t);

  const nowMs = now.getTime();
  const nowPct = nowMs >= startMs && nowMs <= endMs ? pct(nowMs) : null;

  return (
    <div className="rounded-lg border border-line bg-ground overflow-hidden mt-1.5">
      <div className="relative h-4 border-b border-line">
        {hourMarks.map((t) => (
          <span key={t} className="absolute top-0 text-[9px] text-ink-faint -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
            {new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit" })}
          </span>
        ))}
      </div>
      <div className="relative h-8">
        {nowPct !== null && <div className="absolute top-0 bottom-0 w-px bg-accent z-10" style={{ left: `${nowPct}%` }} />}
        {reservations.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-[10px] text-ink-faint">Sin reservas hoy en esta mesa</p>
        ) : (
          reservations.map((r) => {
            const left = pct(new Date(r.startsAt).getTime());
            const right = pct(new Date(r.endsAt).getTime());
            const width = Math.max(3, right - left);
            const color = RESERVATION_STATUS_COLOR[r.status];
            return (
              <div
                key={r.id}
                title={`${r.customerName} · ${r.partySize}p · ${RESERVATION_STATUS_LABEL[r.status]}`}
                style={{ left: `${left}%`, width: `${width}%`, borderColor: color }}
                className="absolute top-0.5 bottom-0.5 rounded border bg-surface px-1 overflow-hidden"
              >
                <span className="block truncate text-[9px] font-medium leading-tight">{r.customerName}</span>
                <span className="block truncate text-[8px] text-ink-faint leading-tight">
                  {r.partySize}p{r.status === "seated" ? ` · hace ${minutesSince(r.startsAt, now)} min` : ""}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
