import type { TableLiveStatusValue } from "../types/floorplan";

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
