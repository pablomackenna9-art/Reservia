import type { Table } from "../../types/floorplan";
import type { ScorableTable } from "./types";

/**
 * Pairs of joinable tables in the same zone whose combined capacity could
 * seat the party. Callers must pass tables already filtered to active,
 * unblocked, joinable, and free for the requested window — this only
 * combines candidates, it doesn't check availability itself.
 *
 * v1 supports 2-table combinations only, per the product spec — a real
 * adjacency/geometry model (which tables can physically sit next to which)
 * doesn't exist yet, so "joinable in the same zone" is the whole rule.
 */
export function buildTablePairCombinations(
  joinableTables: Table[],
  partySize: number,
): Omit<ScorableTable, "isCombination">[] {
  const combos: Omit<ScorableTable, "isCombination">[] = [];

  for (let i = 0; i < joinableTables.length; i++) {
    for (let j = i + 1; j < joinableTables.length; j++) {
      const a = joinableTables[i]!;
      const b = joinableTables[j]!;
      if (a.zoneId !== b.zoneId) continue;

      const capacityMax = a.capacityMax + b.capacityMax;
      if (partySize > capacityMax) continue;

      combos.push({
        tableIds: [a.id, b.id],
        tableNames: [a.name, b.name],
        zoneId: a.zoneId,
        capacityMin: a.capacityMin + b.capacityMin,
        capacityMax,
      });
    }
  }

  return combos;
}
