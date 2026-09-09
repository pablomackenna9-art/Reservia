import type { Reservation } from "../types/reservations";

const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed", "arriving", "seated"];

export interface CapacitySlot {
  startsAt: string;
  occupiedTables: number;
  freeTables: number;
  newArrivals: number;
  pctOccupied: number;
}

/**
 * Para cada franja de `slotMinutes` desde ahora hasta `horizonMinutes` más
 * adelante, cuántas mesas van a estar ocupadas (por una reserva que ya
 * empezó y todavía no debería haber liberado la mesa, o una que arranca en
 * esa franja) vs. libres de verdad. `bufferMinutes` es el mismo colchón que
 * usa el motor de disponibilidad real -- una mesa no se considera libre
 * hasta ese rato después de que termine la reserva anterior.
 */
export function computeCapacityPacing(
  totalTables: number,
  reservations: Pick<Reservation, "tableId" | "startsAt" | "endsAt" | "status">[],
  now: Date,
  options: { slotMinutes?: number; horizonMinutes?: number; bufferMinutes?: number } = {},
): CapacitySlot[] {
  const slotMinutes = options.slotMinutes ?? 30;
  const horizonMinutes = options.horizonMinutes ?? 240;
  const bufferMinutes = options.bufferMinutes ?? 15;
  const slotMs = slotMinutes * 60_000;
  const bufferMs = bufferMinutes * 60_000;

  const active = reservations.filter((r) => r.tableId && ACTIVE_RESERVATION_STATUSES.includes(r.status));

  // floor, no ceil -- la franja en curso tiene que ser la primera de la
  // lista, no solo las que vienen (si son las 13:47 con slots de 30min, el
  // primer bloque debe ser 13:30, no saltar directo a 14:00).
  const firstSlotStart = Math.floor(now.getTime() / slotMs) * slotMs;
  const slotCount = Math.max(0, Math.floor(horizonMinutes / slotMinutes));

  const slots: CapacitySlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const slotStart = firstSlotStart + i * slotMs;
    const slotEnd = slotStart + slotMs;

    const occupiedTableIds = new Set<string>();
    let newArrivals = 0;
    for (const r of active) {
      const startMs = new Date(r.startsAt).getTime();
      const endMs = new Date(r.endsAt).getTime();
      // Misma prueba de solape que check_table_availability, con el mismo colchón.
      if (startMs < slotEnd && endMs + bufferMs > slotStart) {
        occupiedTableIds.add(r.tableId!);
      }
      if (startMs >= slotStart && startMs < slotEnd) newArrivals++;
    }

    const occupiedTables = occupiedTableIds.size;
    const freeTables = Math.max(0, totalTables - occupiedTables);
    slots.push({
      startsAt: new Date(slotStart).toISOString(),
      occupiedTables,
      freeTables,
      newArrivals,
      pctOccupied: totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0,
    });
  }

  return slots;
}

/**
 * Igual que el solape que ya usan `computeCapacityPacing`/`estimateOccupancyAt`,
 * pero devolviendo la lista real de reservas en vez de solo el conteo --
 * para mostrar quién tiene mesa a esa hora, no solo cuántas.
 */
export function reservationsActiveInWindow<
  T extends Pick<Reservation, "tableId" | "startsAt" | "endsAt" | "status">,
>(reservations: T[], windowStart: Date, windowEnd: Date, bufferMinutes = 15): T[] {
  const bufferMs = bufferMinutes * 60_000;
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  return reservations.filter((r) => {
    if (!r.tableId || !ACTIVE_RESERVATION_STATUSES.includes(r.status)) return false;
    const rStart = new Date(r.startsAt).getTime();
    const rEnd = new Date(r.endsAt).getTime();
    return rStart < endMs && rEnd + bufferMs > startMs;
  });
}

/**
 * Qué hay en una mesa puntual cerca de un horario de referencia -- si hay
 * alguien sentado ahí ahora mismo (sin importar cuándo empezó) más lo que
 * arranca dentro de `windowHours` antes/después, para decidir si conviene
 * asignarla. Usado tanto en Notificaciones (candidato elegido) como en
 * TableAssignmentPicker (cada candidato a la vez).
 */
export function nearbyTableSchedule<T extends Pick<Reservation, "id" | "tableId" | "startsAt" | "status">>(
  dayReservations: T[],
  tableIds: string[],
  referenceStartsAt: string,
  options: { excludeId?: string; windowHours?: number } = {},
): T[] {
  const windowHours = options.windowHours ?? 3;
  const referenceMs = new Date(referenceStartsAt).getTime();
  const windowMs = windowHours * 60 * 60_000;

  return dayReservations
    .filter((r) => r.tableId && tableIds.includes(r.tableId) && r.status !== "cancelled" && r.id !== options.excludeId)
    .filter((r) => r.status === "seated" || Math.abs(new Date(r.startsAt).getTime() - referenceMs) <= windowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export interface OccupancyEstimate {
  occupiedTables: number;
  totalTables: number;
  freeTables: number;
  pctOccupied: number;
}

/**
 * Cuántas mesas van a estar ocupadas por otra actividad ya confirmada en un
 * horario puntual -- para evaluar una solicitud pendiente antes de
 * aceptarla, sin tener que mirar franja por franja.
 */
export function estimateOccupancyAt(
  totalTables: number,
  reservations: Pick<Reservation, "tableId" | "startsAt" | "endsAt" | "status">[],
  targetStart: Date,
  targetEnd: Date,
  bufferMinutes = 15,
): OccupancyEstimate {
  const bufferMs = bufferMinutes * 60_000;
  const active = reservations.filter((r) => r.tableId && ACTIVE_RESERVATION_STATUSES.includes(r.status));

  const occupiedTableIds = new Set<string>();
  const targetStartMs = targetStart.getTime();
  const targetEndMs = targetEnd.getTime();
  for (const r of active) {
    const startMs = new Date(r.startsAt).getTime();
    const endMs = new Date(r.endsAt).getTime();
    if (startMs < targetEndMs && endMs + bufferMs > targetStartMs) occupiedTableIds.add(r.tableId!);
  }

  const occupiedTables = occupiedTableIds.size;
  const freeTables = Math.max(0, totalTables - occupiedTables);
  return {
    occupiedTables,
    totalTables,
    freeTables,
    pctOccupied: totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0,
  };
}
