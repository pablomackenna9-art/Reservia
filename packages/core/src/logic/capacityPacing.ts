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
