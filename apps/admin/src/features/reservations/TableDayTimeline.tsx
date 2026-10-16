import type { ReservationWithDetails } from "@reservia/api-client";
import { minutesSince } from "@reservia/core";
import { RESERVATION_STATUS_LABEL } from "./statusStyles";
import { reservationVisualState, stateClass } from "../../lib/stateStyle";

const DEFAULT_RANGE_START_HOUR = 12;
const DEFAULT_RANGE_END_HOUR = 22;

function hourLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-CL", { hour: "2-digit", hourCycle: "h23" });
}

/**
 * Línea de tiempo de una mesa (o de una combinación): qué reservas tiene antes, quién está sentado y
 * qué viene después. Por defecto muestra el día de 12 a 22; con `window` muestra un tramo puntual (ej.
 * ±3 h alrededor de una solicitud) y con `proposed` dibuja la solicitud que se está por aceptar en su
 * propio carril, marcándola en rojo si se cruza con otra reserva.
 */
export function TableDayTimeline({
  reservations,
  now,
  window,
  proposed,
  emptyText,
}: {
  reservations: ReservationWithDetails[];
  now: Date;
  window?: { start: Date; end: Date };
  proposed?: { startsAt: string; endsAt: string; label: string };
  emptyText?: string;
}) {
  const rangeStart = window ? new Date(window.start) : new Date(now);
  const rangeEnd = window ? new Date(window.end) : new Date(now);
  if (!window) {
    rangeStart.setHours(DEFAULT_RANGE_START_HOUR, 0, 0, 0);
    rangeEnd.setHours(DEFAULT_RANGE_END_HOUR, 0, 0, 0);
  }
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const totalMs = Math.max(1, endMs - startMs);

  function pct(ms: number): number {
    return Math.min(100, Math.max(0, ((ms - startMs) / totalMs) * 100));
  }

  const stepMs = (totalMs > 9 * 3_600_000 ? 2 : 1) * 3_600_000;
  const hourMarks: number[] = [];
  const first = new Date(rangeStart);
  first.setMinutes(0, 0, 0);
  if (first.getTime() < startMs) first.setHours(first.getHours() + 1);
  for (let t = first.getTime(); t <= endMs; t += stepMs) hourMarks.push(t);

  const nowMs = now.getTime();
  const nowPct = nowMs >= startMs && nowMs <= endMs ? pct(nowMs) : null;

  const visible = reservations.filter((r) => new Date(r.endsAt).getTime() > startMs && new Date(r.startsAt).getTime() < endMs);

  const proposedStart = proposed ? new Date(proposed.startsAt).getTime() : 0;
  const proposedEnd = proposed ? new Date(proposed.endsAt).getTime() : 0;
  const conflict = proposed
    ? visible.some((r) => new Date(r.startsAt).getTime() < proposedEnd && new Date(r.endsAt).getTime() > proposedStart)
    : false;

  return (
    <div className="rounded-lg border border-line bg-ground overflow-hidden mt-1.5">
      <div className="relative h-5 border-b border-line">
        {hourMarks.map((t) => (
          <span key={t} className="absolute top-0.5 text-[13px] leading-none text-ink-faint -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
            {hourLabel(t)}
          </span>
        ))}
      </div>

      {proposed && (
        <div className="relative h-8 border-b border-line">
          {nowPct !== null && <div className="absolute top-0 bottom-0 w-px bg-accent z-10" style={{ left: `${nowPct}%` }} />}
          <div
            style={{ left: `${pct(proposedStart)}%`, width: `${Math.max(4, pct(proposedEnd) - pct(proposedStart))}%` }}
            className={`absolute top-1 bottom-1 rounded border-2 border-dashed px-1.5 flex items-center overflow-hidden ${
              conflict ? "border-status-occupied bg-status-occupied/15 text-status-occupied" : "border-accent bg-accent/15 text-accent"
            }`}
          >
            <span className="truncate text-[13px] font-semibold">{proposed.label}</span>
          </div>
        </div>
      )}

      <div className="relative h-12">
        {nowPct !== null && <div className="absolute top-0 bottom-0 w-px bg-accent z-10" style={{ left: `${nowPct}%` }} />}
        {visible.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-faint">{emptyText ?? "Sin reservas hoy en esta mesa"}</p>
        ) : (
          visible.map((r) => {
            const left = pct(new Date(r.startsAt).getTime());
            const right = pct(new Date(r.endsAt).getTime());
            const width = Math.max(3, right - left);
            return (
              <div
                key={r.id}
                title={`${r.customerName} · ${r.partySize}p · ${RESERVATION_STATUS_LABEL[r.status]}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                className={`${stateClass(reservationVisualState(r.status))} absolute top-0.5 bottom-0.5 rounded border-2 px-1 overflow-hidden`}
              >
                <span className="block truncate text-[13px] font-medium leading-tight">{r.customerName}</span>
                <span className="block truncate text-[13px] opacity-80 leading-tight">
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
