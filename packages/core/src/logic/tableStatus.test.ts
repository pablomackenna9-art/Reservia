import { describe, expect, it } from "vitest";
import { deriveTableStatus, findLateArrivals, findTurnoverConflict } from "./tableStatus";
import type { Reservation } from "../types/reservations";

let idCounter = 0;
function makeReservation(overrides: Partial<Reservation>): Reservation {
  idCounter += 1;
  return {
    id: overrides.id ?? `r-${idCounter}`,
    restaurantId: "restaurant-1",
    customerId: "customer-1",
    tableId: "table-1",
    startsAt: overrides.startsAt ?? "2026-01-01T10:00:00.000Z",
    endsAt: overrides.endsAt ?? "2026-01-01T11:30:00.000Z",
    partySize: 2,
    status: "seated",
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

const NOW = new Date("2026-01-01T10:55:00.000Z");

describe("deriveTableStatus", () => {
  it("returns occupied when someone is seated", () => {
    const seated = makeReservation({ status: "seated", startsAt: "2026-01-01T10:00:00.000Z" });
    expect(deriveTableStatus([seated], NOW)).toBe("occupied");
  });

  it("returns arriving when the reservation starts within 15 minutes (10:55 now, 11:05 confirmed)", () => {
    const soon = makeReservation({ status: "confirmed", startsAt: "2026-01-01T11:05:00.000Z" });
    expect(deriveTableStatus([soon], NOW)).toBe("arriving");
  });

  it("returns reserved when the reservation starts within the hour but past the arriving window (10:55 now, 11:45 confirmed)", () => {
    const withinHour = makeReservation({ status: "confirmed", startsAt: "2026-01-01T11:45:00.000Z" });
    expect(deriveTableStatus([withinHour], NOW)).toBe("reserved");
  });

  it("returns available when the reservation is more than an hour out -- a table shouldn't look claimed hours ahead of time (10:55 now, 15:00 confirmed)", () => {
    const hoursOut = makeReservation({ status: "confirmed", startsAt: "2026-01-01T15:00:00.000Z" });
    expect(deriveTableStatus([hoursOut], NOW)).toBe("available");
  });

  it("returns available with no reservations at all", () => {
    expect(deriveTableStatus([], NOW)).toBe("available");
  });

  it("ignores cancelled, no_show and completed reservations", () => {
    const cancelled = makeReservation({ status: "cancelled", startsAt: "2026-01-01T11:05:00.000Z" });
    const noShow = makeReservation({ status: "no_show", startsAt: "2026-01-01T09:00:00.000Z" });
    const completed = makeReservation({ status: "completed", startsAt: "2026-01-01T09:00:00.000Z" });
    expect(deriveTableStatus([cancelled, noShow, completed], NOW)).toBe("available");
  });
});

describe("findTurnoverConflict", () => {
  it("flags a seated table with a reservation starting within the threshold (10:55 now, 11:30 reserved)", () => {
    const seated = makeReservation({ id: "seated", status: "seated", startsAt: "2026-01-01T09:30:00.000Z" });
    const incoming = makeReservation({ id: "incoming", status: "confirmed", startsAt: "2026-01-01T11:30:00.000Z" });

    const conflict = findTurnoverConflict([seated, incoming], NOW);
    expect(conflict?.id).toBe("incoming");
  });

  it("does not flag when nobody is currently seated", () => {
    const incoming = makeReservation({ id: "incoming", status: "confirmed", startsAt: "2026-01-01T11:30:00.000Z" });
    expect(findTurnoverConflict([incoming], NOW)).toBeNull();
  });

  it("does not flag when the next reservation is well outside the threshold", () => {
    const seated = makeReservation({ id: "seated", status: "seated", startsAt: "2026-01-01T09:30:00.000Z" });
    const farOut = makeReservation({ id: "far", status: "confirmed", startsAt: "2026-01-01T14:00:00.000Z" });
    expect(findTurnoverConflict([seated, farOut], NOW)).toBeNull();
  });

  it("ignores cancelled reservations", () => {
    const seated = makeReservation({ id: "seated", status: "seated", startsAt: "2026-01-01T09:30:00.000Z" });
    const cancelled = makeReservation({ id: "cancelled", status: "cancelled", startsAt: "2026-01-01T11:00:00.000Z" });
    expect(findTurnoverConflict([seated, cancelled], NOW)).toBeNull();
  });
});

describe("findLateArrivals", () => {
  it("flags a confirmed reservation whose start time is past the threshold (10:55 now, 10:30 confirmed)", () => {
    const late = makeReservation({ id: "late", status: "confirmed", startsAt: "2026-01-01T10:30:00.000Z" });
    expect(findLateArrivals([late], NOW).map((r) => r.id)).toEqual(["late"]);
  });

  it("does not flag a reservation still within the threshold", () => {
    const almostLate = makeReservation({ id: "almost", status: "confirmed", startsAt: "2026-01-01T10:45:00.000Z" });
    expect(findLateArrivals([almostLate], NOW)).toEqual([]);
  });

  it("does not flag a reservation that's already seated", () => {
    const seated = makeReservation({ id: "seated", status: "seated", startsAt: "2026-01-01T10:00:00.000Z" });
    expect(findLateArrivals([seated], NOW)).toEqual([]);
  });

  it("ignores cancelled, no_show and completed reservations", () => {
    const cancelled = makeReservation({ id: "cancelled", status: "cancelled", startsAt: "2026-01-01T10:00:00.000Z" });
    const noShow = makeReservation({ id: "no_show", status: "no_show", startsAt: "2026-01-01T10:00:00.000Z" });
    const completed = makeReservation({ id: "completed", status: "completed", startsAt: "2026-01-01T10:00:00.000Z" });
    expect(findLateArrivals([cancelled, noShow, completed], NOW)).toEqual([]);
  });

  it("sorts the latest arrivals first by scheduled time", () => {
    const a = makeReservation({ id: "a", status: "pending", startsAt: "2026-01-01T10:00:00.000Z" });
    const b = makeReservation({ id: "b", status: "confirmed", startsAt: "2026-01-01T10:20:00.000Z" });
    expect(findLateArrivals([b, a], NOW).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
