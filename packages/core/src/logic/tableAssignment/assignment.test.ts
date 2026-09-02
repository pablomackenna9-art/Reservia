import { describe, expect, it } from "vitest";
import type { Table } from "../../types/floorplan";
import { buildTableCandidates } from "./assignment";
import type { DayReservationForLookahead, ReservationForScoring } from "./types";

let tableCounter = 0;
function makeTable(overrides: Partial<Table>): Table {
  tableCounter += 1;
  return {
    id: overrides.id ?? `table-${tableCounter}`,
    restaurantId: "restaurant-1",
    zoneId: "zone-salon",
    name: overrides.name ?? `M${tableCounter}`,
    number: null,
    shape: "square",
    capacityMin: 1,
    capacityMax: 4,
    positionX: 50,
    positionY: 50,
    width: 80,
    height: 80,
    rotation: 0,
    active: true,
    joinable: false,
    blocked: false,
    blockedReason: null,
    ...overrides,
  };
}

const STARTS_AT = "2026-01-01T21:00:00.000Z";
const ENDS_AT = "2026-01-01T22:30:00.000Z";

function makeReservation(overrides: Partial<ReservationForScoring>): ReservationForScoring {
  return { partySize: 2, startsAt: STARTS_AT, endsAt: ENDS_AT, ...overrides };
}

describe("buildTableCandidates", () => {
  it("CASO 1: reserva de 2 prefiere la mesa de 2 antes que 4 o 6", () => {
    const m2 = makeTable({ id: "m2", name: "M2", capacityMin: 1, capacityMax: 2 });
    const m4 = makeTable({ id: "m4", name: "M4", capacityMin: 2, capacityMax: 4 });
    const m6 = makeTable({ id: "m6", name: "M6", capacityMin: 2, capacityMax: 6 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 2 }),
      availableSingleTables: [m2, m4, m6],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates[0]!.tableIds).toEqual(["m2"]);
  });

  it("CASO 2: reserva de 4 prefiere la mesa de 4 antes que 6", () => {
    const m4 = makeTable({ id: "m4", name: "M4", capacityMin: 2, capacityMax: 4 });
    const m6 = makeTable({ id: "m6", name: "M6", capacityMin: 2, capacityMax: 6 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [m4, m6],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates[0]!.tableIds).toEqual(["m4"]);
  });

  it("CASO 3: si la mesa de 4 está ocupada (no viene en la lista), elige la siguiente alternativa compatible", () => {
    const m6 = makeTable({ id: "m6", name: "M6", capacityMin: 2, capacityMax: 6 });

    // M4 no se incluye — simula que ya está tomada a esa hora (el caller la
    // excluyó al consultar disponibilidad real antes de llamar al motor).
    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [m6],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates[0]!.tableIds).toEqual(["m6"]);
  });

  it("CASO 4: protege la mesa de 6 si más tarde hay una reserva de 6 y existe alternativa para la de 4", () => {
    const m4 = makeTable({ id: "m4", name: "M4", capacityMin: 2, capacityMax: 4 });
    const m6 = makeTable({ id: "m6", name: "M6", capacityMin: 2, capacityMax: 6 });

    const laterReservations: DayReservationForLookahead[] = [
      { tableId: null, partySize: 6, startsAt: "2026-01-01T21:30:00.000Z" },
    ];

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [m4, m6],
      availableJoinableTables: [],
      laterReservations,
    });

    expect(candidates[0]!.tableIds).toEqual(["m4"]);
    const m6Candidate = candidates.find((c) => c.tableIds[0] === "m6")!;
    expect(m6Candidate.score).toBeLessThan(candidates[0]!.score);
  });

  it("CASO 5: zona PREFERRED prioriza esa zona sin descartar el resto", () => {
    const salon = makeTable({ id: "salon", name: "S1", zoneId: "zone-salon", capacityMin: 2, capacityMax: 4 });
    const terraza = makeTable({ id: "terraza", name: "T1", zoneId: "zone-terraza", capacityMin: 2, capacityMax: 4 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4, preferredZoneId: "zone-terraza", zonePreference: "preferred" }),
      availableSingleTables: [salon, terraza],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates[0]!.tableIds).toEqual(["terraza"]);
    expect(candidates.some((c) => c.tableIds[0] === "salon")).toBe(true);
  });

  it("CASO 6: zona REQUIRED descarta por completo las mesas de otra zona", () => {
    const salon = makeTable({ id: "salon", name: "S1", zoneId: "zone-salon", capacityMin: 2, capacityMax: 4 });
    const terraza = makeTable({ id: "terraza", name: "T1", zoneId: "zone-terraza", capacityMin: 2, capacityMax: 4 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4, preferredZoneId: "zone-terraza", zonePreference: "required" }),
      availableSingleTables: [salon, terraza],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates.map((c) => c.tableIds[0])).toEqual(["terraza"]);
  });

  it("CASO 7: dos reservas superpuestas no comparten mesa (la mesa ocupada llega excluida del input)", () => {
    const free = makeTable({ id: "free", name: "M-libre", capacityMin: 2, capacityMax: 4 });

    // La detección de solapes reales vive en check_table_availability (SQL,
    // ya existente y reusado) — acá solo confirmamos que el motor nunca
    // "inventa" disponibilidad para una mesa que el caller no le pasó.
    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [free],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.tableIds).toEqual(["free"]);
  });

  it("CASO 8: una reserva posterior en la MISMA mesa (consecutiva, con buffer respetado) no cuenta como conflicto", () => {
    const m4 = makeTable({ id: "m4", name: "M4", capacityMin: 2, capacityMax: 4 });

    const laterReservations: DayReservationForLookahead[] = [
      { tableId: "m4", partySize: 4, startsAt: "2026-01-01T23:00:00.000Z" },
    ];

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [m4],
      availableJoinableTables: [],
      laterReservations,
    });

    expect(candidates[0]!.reasons).toContain("Sin conflicto con reservas posteriores");
  });

  it("CASO 9: una mesa bloqueada nunca aparece como candidata", () => {
    const blocked = makeTable({ id: "blocked", name: "M-bloqueada", capacityMin: 2, capacityMax: 4, blocked: true });
    const free = makeTable({ id: "free", name: "M-libre", capacityMin: 2, capacityMax: 4 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [blocked, free],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates.map((c) => c.tableIds[0])).not.toContain("blocked");
  });

  it("CASO 10: siempre devuelve más de una alternativa cuando existen, para permitir el override manual", () => {
    const a = makeTable({ id: "a", capacityMin: 2, capacityMax: 4 });
    const b = makeTable({ id: "b", capacityMin: 2, capacityMax: 6 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [a, b],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates.length).toBeGreaterThan(1);
    // El maître puede elegir cualquiera de las dos, no solo la recomendada.
    expect(candidates.map((c) => c.tableIds[0])).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("CASO 11: una mesa inactiva nunca aparece como candidata", () => {
    const inactive = makeTable({ id: "inactive", capacityMin: 2, capacityMax: 4, active: false });
    const free = makeTable({ id: "free", capacityMin: 2, capacityMax: 4 });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [inactive, free],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates.map((c) => c.tableIds[0])).not.toContain("inactive");
  });

  it("CASO 12: sin ninguna mesa disponible, el motor devuelve una lista vacía sin fallar (la reserva puede quedar sin mesa)", () => {
    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [],
      availableJoinableTables: [],
      laterReservations: [],
    });

    expect(candidates).toEqual([]);
  });

  it("CASO 13: combina dos mesas de 2 unibles cuando no hay una mesa única que alcance, y evalúa la combinación con el mismo motor", () => {
    const half1 = makeTable({ id: "half1", name: "M1", capacityMin: 1, capacityMax: 2, joinable: true });
    const half2 = makeTable({ id: "half2", name: "M2", capacityMin: 1, capacityMax: 2, joinable: true });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [],
      availableJoinableTables: [half1, half2],
      laterReservations: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.isCombination).toBe(true);
    expect(candidates[0]!.tableIds.sort()).toEqual(["half1", "half2"]);
    expect(candidates[0]!.capacityMax).toBe(4);
    expect(candidates[0]!.reasons).toContain("Combinación de mesas");
  });

  it("prefiere una mesa única de 4 antes que combinar dos mesas de 2 cuando ambas alcanzan", () => {
    const single4 = makeTable({ id: "single4", capacityMin: 2, capacityMax: 4 });
    const half1 = makeTable({ id: "half1", capacityMin: 1, capacityMax: 2, joinable: true });
    const half2 = makeTable({ id: "half2", capacityMin: 1, capacityMax: 2, joinable: true });

    const candidates = buildTableCandidates({
      reservation: makeReservation({ partySize: 4 }),
      availableSingleTables: [single4],
      availableJoinableTables: [half1, half2],
      laterReservations: [],
    });

    expect(candidates[0]!.isCombination).toBe(false);
    expect(candidates[0]!.tableIds).toEqual(["single4"]);
  });
});
