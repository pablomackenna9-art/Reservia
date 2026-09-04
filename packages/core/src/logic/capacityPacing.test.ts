import { describe, expect, it } from "vitest";
import { computeCapacityPacing } from "./capacityPacing";
import type { Reservation } from "../types/reservations";

let idCounter = 0;
function makeReservation(overrides: Partial<Reservation>): Reservation {
  idCounter += 1;
  return {
    id: overrides.id ?? `r-${idCounter}`,
    restaurantId: "restaurant-1",
    customerId: "customer-1",
    tableId: overrides.tableId ?? "table-1",
    startsAt: overrides.startsAt ?? "2026-01-01T10:00:00.000Z",
    endsAt: overrides.endsAt ?? "2026-01-01T11:30:00.000Z",
    partySize: 2,
    status: "confirmed",
    source: "admin",
    notes: null,
    internalNotes: null,
    totalAmount: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    suggestedTableId: null,
    tableAssignmentSource: null,
    ...overrides,
  };
}

const NOW = new Date("2026-01-01T18:00:00.000Z");

describe("computeCapacityPacing", () => {
  it("counts a table occupied for every slot its reservation overlaps", () => {
    const r = makeReservation({ tableId: "t1", startsAt: "2026-01-01T18:00:00.000Z", endsAt: "2026-01-01T19:30:00.000Z" });
    const slots = computeCapacityPacing(2, [r], NOW, { slotMinutes: 30, horizonMinutes: 120, bufferMinutes: 0 });

    // 18:00, 18:30, 19:00 slots overlap [18:00,19:30); 19:30 does not.
    expect(slots.map((s) => s.occupiedTables)).toEqual([1, 1, 1, 0]);
    expect(slots.map((s) => s.freeTables)).toEqual([1, 1, 1, 2]);
  });

  it("applies the buffer minutes after a reservation ends before freeing the table", () => {
    const r = makeReservation({ tableId: "t1", startsAt: "2026-01-01T18:00:00.000Z", endsAt: "2026-01-01T18:40:00.000Z" });
    const slots = computeCapacityPacing(1, [r], NOW, { slotMinutes: 30, horizonMinutes: 90, bufferMinutes: 15 });

    // Reservation ends 18:40 + 15min buffer = 18:55 -> still occupies the 18:30 slot (ends 19:00).
    expect(slots.map((s) => s.occupiedTables)).toEqual([1, 1, 0]);
  });

  it("counts newArrivals only for reservations starting in that exact slot", () => {
    const r1 = makeReservation({ id: "a", tableId: "t1", startsAt: "2026-01-01T18:00:00.000Z" });
    const r2 = makeReservation({ id: "b", tableId: "t2", startsAt: "2026-01-01T18:15:00.000Z" });
    const r3 = makeReservation({ id: "c", tableId: "t3", startsAt: "2026-01-01T18:30:00.000Z" });
    const slots = computeCapacityPacing(3, [r1, r2, r3], NOW, { slotMinutes: 30, horizonMinutes: 60, bufferMinutes: 0 });

    expect(slots[0]!.newArrivals).toBe(2); // r1 and r2 both fall in [18:00,18:30)
    expect(slots[1]!.newArrivals).toBe(1); // r3
  });

  it("ignores cancelled and no_show reservations", () => {
    const cancelled = makeReservation({ tableId: "t1", status: "cancelled" });
    const noShow = makeReservation({ tableId: "t2", status: "no_show" });
    const slots = computeCapacityPacing(2, [cancelled, noShow], NOW, { slotMinutes: 30, horizonMinutes: 30 });
    expect(slots[0]!.occupiedTables).toBe(0);
  });

  it("ignores reservations without a table assigned", () => {
    const noTable = makeReservation({ tableId: null });
    const slots = computeCapacityPacing(1, [noTable], NOW, { slotMinutes: 30, horizonMinutes: 30 });
    expect(slots[0]!.occupiedTables).toBe(0);
  });
});
