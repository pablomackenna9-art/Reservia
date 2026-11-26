import { describe, expect, it } from "vitest";
import type { Table, Zone } from "../types/floorplan";
import { buildTableGroups, groupAcceptsParty, snapToNeighbor } from "./tableGroups";
import { buildTableCandidates } from "./tableAssignment/assignment";

const zone: Zone = { id: "z", restaurantId: "r", name: "Salón", type: "salon", sortOrder: 0, width: 1000, height: 700, active: true };

function table(id: string, name: string, x: number, y: number, over: Partial<Table> = {}): Table {
  return {
    id,
    restaurantId: "r",
    zoneId: "z",
    name,
    number: null,
    shape: "rectangle",
    capacityMin: 1,
    capacityMax: 4,
    positionX: x,
    positionY: y,
    width: 56,
    height: 50,
    rotation: 0,
    active: true,
    joinable: true,
    blocked: false,
    blockedReason: null,
    ...over,
  };
}

// Mesa larga vertical (rotación 90) hecha de dos módulos de 4: 5-A arriba y 5-B abajo, pegados.
const A = table("a", "5-A", 20, 50, { layoutId: "L5", rotation: 90 });
const B = table("b", "5-B", 20, 50 + (56 / 700) * 100, { layoutId: "L5", rotation: 90 });

describe("buildTableGroups", () => {
  it("junta los módulos pegados como una sola mesa con el número de la mesa y la suma de asientos", () => {
    const { groups, byTable } = buildTableGroups([A, B], [zone]);
    expect(groups).toHaveLength(1);
    expect(byTable.get("a")!.label).toBe("5");
    expect(byTable.get("a")!.capacity).toBe(8);
    expect(byTable.get("a")!.merged).not.toBeNull();
  });

  it("un módulo apartado deja de ser parte del grupo", () => {
    const far = { ...B, positionX: 60 };
    const { groups } = buildTableGroups([A, far], [zone]);
    expect(groups).toHaveLength(2);
  });

  it("un módulo pegado a una mesa normal (aunque gire distinto) pasa a ser de esa mesa", () => {
    const four = table("4", "4", 50, 50, { shape: "square", width: 52, height: 52, capacityMax: 2, joinable: true });
    // módulo con rotación 90 (56x50 -> en el plano ocupa 50 de ancho y 56 de alto) pegado a la derecha de la mesa 4
    const mod = table("m", "5-A", 50 + ((52 / 2 + 50 / 2) / 1000) * 100, 50, { layoutId: "L5", rotation: 90 });
    const { byTable } = buildTableGroups([four, mod], [zone]);
    expect(byTable.get("m")!.label).toBe("4");
    expect(byTable.get("m")!.capacity).toBe(6);
  });
});

describe("snapToNeighbor", () => {
  it("al soltar un módulo cerca del borde de otra mesa, queda pegado", () => {
    const four = table("4", "4", 50, 50, { shape: "square", width: 52, height: 52 });
    const mod = table("m", "5-A", 60, 50, { layoutId: "L5" });
    const near = { x: 500 + 26 + 28 + 9, y: 350 + 3 };
    const snapped = snapToNeighbor(mod, near, [four, mod], zone);
    expect(snapped).not.toBeNull();
    expect(snapped!.x).toBeCloseTo(500 + 26 + 28, 5);
    expect(snapped!.y).toBeCloseTo(350, 5);
  });
});

describe("mesas pegadas en el motor", () => {
  const reservation = (partySize: number) => ({ partySize, startsAt: "2026-01-01T21:00:00.000Z", endsAt: "2026-01-01T22:30:00.000Z" });
  const four = table("t4", "9", 10, 10, { shape: "square", capacityMax: 4 });

  it("un grupo de 4 no se sienta en una mesa armada de 8: el grupo pegado cuenta como una mesa de 8", () => {
    const { groups } = buildTableGroups([A, B], [zone]);
    const g = groups[0]!;
    expect(groupAcceptsParty(g, 4)).toBe(false);
    expect(groupAcceptsParty(g, 6)).toBe(true);
    expect(groupAcceptsParty(g, 9)).toBe(false);
    const result = buildTableCandidates({
      reservation: reservation(4),
      availableSingleTables: [four],
      availableJoinableTables: [],
      laterReservations: [],
      availableGroups: groupAcceptsParty(g, 4) ? [{ id: g.id, tableIds: ["a", "b"], label: "5", zoneId: "z", capacityMin: 1, capacityMax: 8 }] : [],
    });
    expect(result.map((c) => c.tableIds)).toEqual([["t4"]]);
  });

  it("para 6 personas el grupo de 8 se ofrece como UNA mesa (todos sus módulos juntos)", () => {
    const result = buildTableCandidates({
      reservation: reservation(6),
      availableSingleTables: [],
      availableJoinableTables: [],
      laterReservations: [],
      availableGroups: [{ id: "a", tableIds: ["a", "b"], label: "5", zoneId: "z", capacityMin: 1, capacityMax: 8 }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.tableIds).toEqual(["a", "b"]);
    expect(result[0]!.tableNames).toEqual(["5"]);
  });
});
