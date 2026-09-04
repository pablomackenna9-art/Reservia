import { describe, expect, it } from "vitest";
import { findTurnoverConflict } from "./tableStatus";
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
