import type { TableLiveStatusValue } from "../types/floorplan";
import type { Reservation } from "../types/reservations";

export const ARRIVING_WINDOW_MINUTES = 15;

/** True once a confirmed reservation's start time falls within the "arriving soon" window. */
export function isArrivingSoon(startsAt: string, now: Date = new Date()): boolean {
  const minutesUntil = (new Date(startsAt).getTime() - now.getTime()) / 60_000;
  return minutesUntil <= ARRIVING_WINDOW_MINUTES && minutesUntil >= 0;
}

export function minutesSince(timestamp: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(timestamp).getTime()) / 60_000);
}

const STATUS_LABELS_ES: Record<TableLiveStatusValue, string> = {
  available: "Disponible",
  reserved: "Reservada",
  arriving: "Por llegar",
  occupied: "Ocupada",
  paying: "Pagando",
  blocked: "Bloqueada",
};

export function tableStatusLabel(status: TableLiveStatusValue): string {
  return STATUS_LABELS_ES[status];
}

/**
 * Derives a table's live status from its reservations, since there's no
 * `table_live_status` table yet (that's Fase 4) — "paying" and "blocked"
 * aren't reachable this way, they need a host's manual input to exist at
 * all, and are left for that later table.
 */
export function deriveTableStatus(reservationsForTable: Reservation[], now: Date = new Date()): TableLiveStatusValue {
  const active = reservationsForTable.filter((r) => !["cancelled", "no_show", "completed"].includes(r.status));

  if (active.some((r) => r.status === "seated")) return "occupied";
  if (active.some((r) => r.status === "arriving" || isArrivingSoon(r.startsAt, now))) return "arriving";
  if (active.some((r) => new Date(r.startsAt) > now)) return "reserved";
  return "available";
}

/** The reservation a table-detail panel should foreground: the one in progress, or the next one today. */
export function currentOrNextReservation<T extends Reservation>(reservationsForTable: T[], now: Date = new Date()): T | null {
  const active = reservationsForTable.filter((r) => !["cancelled", "no_show", "completed"].includes(r.status));
  const inProgress = active.find((r) => r.status === "seated");
  if (inProgress) return inProgress;

  const upcoming = active
    .filter((r) => new Date(r.startsAt) >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return upcoming[0] ?? null;
}
