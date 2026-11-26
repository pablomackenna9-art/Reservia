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

export const MAX_UNION_TABLES = 4;

/**
 * Uniones de 3 o 4 mesas (misma zona, todas "unibles") para un grupo grande que ni una mesa sola ni un
 * par pueden recibir -- ej. 9 personas con mesas libres de 2 + 4 + 4. Solo devuelve uniones MÍNIMAS
 * (si se saca la mesa más chica, el grupo ya no cabe), para no ofrecer mesas de sobra. Las más
 * compactas primero: menos mesas y menos asientos sobrantes.
 */
export function buildTableUnionCombinations(
  joinableTables: Table[],
  partySize: number,
  maxTables: number = MAX_UNION_TABLES,
): Omit<ScorableTable, "isCombination">[] {
  const byZone = new Map<string, Table[]>();
  for (const t of joinableTables) byZone.set(t.zoneId, [...(byZone.get(t.zoneId) ?? []), t]);

  const found: (Omit<ScorableTable, "isCombination"> & { excess: number })[] = [];

  for (const [zoneId, zoneTables] of byZone) {
    // Se limita el universo por zona para que la búsqueda siga siendo instantánea.
    const pool = [...zoneTables].sort((a, b) => b.capacityMax - a.capacityMax).slice(0, 14);

    function walk(start: number, chosen: Table[], capacity: number) {
      if (chosen.length >= 3 && capacity >= partySize) {
        const smallest = Math.min(...chosen.map((t) => t.capacityMax));
        if (capacity - smallest < partySize) {
          found.push({
            tableIds: chosen.map((t) => t.id),
            tableNames: chosen.map((t) => t.name),
            zoneId,
            capacityMin: chosen.reduce((s, t) => s + t.capacityMin, 0),
            capacityMax: capacity,
            excess: capacity - partySize,
          });
        }
        return; // agregar más mesas a una unión que ya alcanza no es mínimo
      }
      if (chosen.length >= maxTables) return;
      for (let i = start; i < pool.length; i++) {
        walk(i + 1, [...chosen, pool[i]!], capacity + pool[i]!.capacityMax);
      }
    }
    walk(0, [], 0);
  }

  return found
    .sort((a, b) => a.tableIds.length - b.tableIds.length || a.excess - b.excess)
    .slice(0, 6)
    .map(({ excess: _excess, ...combo }) => combo);
}
