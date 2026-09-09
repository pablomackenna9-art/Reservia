import { describe, expect, it } from "vitest";
import { computeCapacityPacing, estimateOccupancyAt, nearbyTableSchedule, reservationsActiveInWindow } from "./capacityPacing";
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
    feedbackRating: null,
    feedbackComment: null,
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

describe("estimateOccupancyAt", () => {
  it("counts tables whose reservation overlaps the target window", () => {
    const overlapping = makeReservation({ tableId: "t1", startsAt: "2026-01-01T20:00:00.000Z", endsAt: "2026-01-01T21:30:00.000Z" });
    const notOverlapping = makeReservation({ tableId: "t2", startsAt: "2026-01-01T22:00:00.000Z", endsAt: "2026-01-01T23:00:00.000Z" });
    const est = estimateOccupancyAt(
      4,
      [overlapping, notOverlapping],
      new Date("2026-01-01T20:30:00.000Z"),
      new Date("2026-01-01T22:00:00.000Z"),
      0,
    );
    expect(est.occupiedTables).toBe(1);
    expect(est.freeTables).toBe(3);
    expect(est.pctOccupied).toBe(25);
  });

  it("returns 0% when there are no tables", () => {
    const est = estimateOccupancyAt(0, [], new Date("2026-01-01T20:00:00.000Z"), new Date("2026-01-01T21:00:00.000Z"));
    expect(est.pctOccupied).toBe(0);
  });
});

describe("reservationsActiveInWindow", () => {
  it("returns reservations overlapping the window", () => {
    const overlapping = makeReservation({ id: "in", tableId: "t1", startsAt: "2026-01-01T20:00:00.000Z", endsAt: "2026-01-01T21:30:00.000Z" });
    const notOverlapping = makeReservation({ id: "out", tableId: "t2", startsAt: "2026-01-01T22:00:00.000Z", endsAt: "2026-01-01T23:00:00.000Z" });
    const result = reservationsActiveInWindow(
      [overlapping, notOverlapping],
      new Date("2026-01-01T20:30:00.000Z"),
      new Date("2026-01-01T22:00:00.000Z"),
      0,
    );
    expect(result.map((r) => r.id)).toEqual(["in"]);
  });

  it("excludes reservations without a table or in a non-active status", () => {
    const noTable = makeReservation({ id: "no-table", tableId: null, startsAt: "2026-01-01T20:00:00.000Z" });
    const cancelled = makeReservation({ id: "cancelled", tableId: "t1", status: "cancelled", startsAt: "2026-01-01T20:00:00.000Z" });
    const result = reservationsActiveInWindow(
      [noTable, cancelled],
      new Date("2026-01-01T19:00:00.000Z"),
      new Date("2026-01-01T21:00:00.000Z"),
    );
    expect(result).toEqual([]);
  });

  it("applies the buffer minutes like the other overlap checks", () => {
    const r = makeReservation({ id: "r", tableId: "t1", startsAt: "2026-01-01T18:00:00.000Z", endsAt: "2026-01-01T18:40:00.000Z" });
    // Ends 18:40 + 15min buffer = 18:55 -> still overlaps a window starting at 18:50.
    const result = reservationsActiveInWindow([r], new Date("2026-01-01T18:50:00.000Z"), new Date("2026-01-01T19:20:00.000Z"), 15);
    expect(result.map((x) => x.id)).toEqual(["r"]);
  });
});

describe("nearbyTableSchedule", () => {
  const REQUEST_STARTS_AT = "2026-01-01T13:00:00.000Z"; // 1pm target reservation

  it("flags a table as occupied right now even if it's far from the requested time and never marked seated", () => {
    // Reproduces the reported bug: a "confirmed" reservation from 9am-12:30pm is
    // still physically at the table at 12:19 (nowMs), but nobody clicked "sentar"
    // and 9am is more than 3h away from the 1pm request -- must still show up.
    const active = makeReservation({
      id: "active-now",
      tableId: "t1",
      status: "confirmed",
      startsAt: "2026-01-01T09:00:00.000Z",
      endsAt: "2026-01-01T12:30:00.000Z",
    });
    const now = new Date("2026-01-01T12:19:00.000Z");
    const result = nearbyTableSchedule([active], ["t1"], REQUEST_STARTS_AT, { now });
    expect(result.map((r) => r.id)).toEqual(["active-now"]);
  });

  it("includes a seated reservation regardless of how far it is from the requested time", () => {
    const seated = makeReservation({
      id: "seated-far",
      tableId: "t1",
      status: "seated",
      startsAt: "2026-01-01T08:00:00.000Z",
      endsAt: "2026-01-01T09:30:00.000Z",
    });
    const result = nearbyTableSchedule([seated], ["t1"], REQUEST_STARTS_AT, { now: new Date("2026-01-01T12:19:00.000Z") });
    expect(result.map((r) => r.id)).toEqual(["seated-far"]);
  });

  it("includes reservations starting within the window of the requested time even if not currently active", () => {
    const soon = makeReservation({
      id: "soon",
      tableId: "t1",
      status: "confirmed",
      startsAt: "2026-01-01T14:00:00.000Z",
      endsAt: "2026-01-01T15:30:00.000Z",
    });
    const result = nearbyTableSchedule([soon], ["t1"], REQUEST_STARTS_AT, { now: new Date("2026-01-01T12:19:00.000Z"), windowHours: 3 });
    expect(result.map((r) => r.id)).toEqual(["soon"]);
  });

  it("excludes reservations that are neither active now, seated, nor near the requested time", () => {
    const irrelevant = makeReservation({
      id: "irrelevant",
      tableId: "t1",
      status: "confirmed",
      startsAt: "2026-01-01T19:00:00.000Z",
      endsAt: "2026-01-01T20:30:00.000Z",
    });
    const result = nearbyTableSchedule([irrelevant], ["t1"], REQUEST_STARTS_AT, { now: new Date("2026-01-01T12:19:00.000Z") });
    expect(result).toEqual([]);
  });

  it("excludes cancelled reservations and the reservation being reassigned", () => {
    const cancelled = makeReservation({ id: "cancelled", tableId: "t1", status: "cancelled" });
    const self = makeReservation({ id: "self", tableId: "t1", status: "seated" });
    const result = nearbyTableSchedule([cancelled, self], ["t1"], REQUEST_STARTS_AT, { excludeId: "self" });
    expect(result).toEqual([]);
  });
});
