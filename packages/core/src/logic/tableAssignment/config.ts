/** Centralized so nobody hardcodes a scoring weight inside a component. */
export const TABLE_ASSIGNMENT_WEIGHTS = {
  baseScore: 50,
  exactCapacityBonus: 25,
  perUnusedSeatPenalty: 6,
  zonePreferredBonus: 15,
  futureConflictPenalty: 35,
  combinationPenalty: 18,
  /** Combinación hecha con módulos juntos de la misma mesa larga: se prefiere sobre mesas sueltas. */
  sameLayoutBonus: 12,
} as const;
