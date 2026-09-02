import { TABLE_ASSIGNMENT_WEIGHTS } from "./config";
import type { DayReservationForLookahead, ReservationForScoring, ScorableTable } from "./types";

/**
 * Is there a LATER reservation today, needing more seats than this one, that
 * only a table shaped like this candidate could serve? If so, seating today's
 * smaller party here now would strand that bigger party tonight — the "don't
 * burn the 6-top on a 4-top when a 4-top is free" rule from the spec.
 */
function hasFutureConflict(
  candidate: ScorableTable,
  reservation: ReservationForScoring,
  laterReservations: DayReservationForLookahead[],
): boolean {
  const startsAt = new Date(reservation.startsAt).getTime();
  return laterReservations.some((later) => {
    if (later.tableId && candidate.tableIds.includes(later.tableId)) return false;
    if (new Date(later.startsAt).getTime() <= startsAt) return false;
    if (later.partySize <= reservation.partySize) return false;
    return later.partySize >= candidate.capacityMin && later.partySize <= candidate.capacityMax;
  });
}

export function scoreTableForReservation(
  candidate: ScorableTable,
  reservation: ReservationForScoring,
  laterReservations: DayReservationForLookahead[],
): { score: number; reasons: string[] } {
  const w = TABLE_ASSIGNMENT_WEIGHTS;
  let score = w.baseScore;
  const reasons: string[] = [];

  const unusedSeats = candidate.capacityMax - reservation.partySize;
  if (unusedSeats === 0) {
    score += w.exactCapacityBonus;
    reasons.push("Capacidad exacta");
  } else {
    score -= unusedSeats * w.perUnusedSeatPenalty;
    if (unusedSeats <= 2) reasons.push("Buen aprovechamiento de capacidad");
  }

  if (reservation.preferredZoneId && candidate.zoneId === reservation.preferredZoneId) {
    score += w.zonePreferredBonus;
    reasons.push("Zona solicitada");
  }

  if (hasFutureConflict(candidate, reservation, laterReservations)) {
    score -= w.futureConflictPenalty;
    reasons.push("Podría hacer falta para una reserva más grande esta noche");
  } else {
    reasons.push("Sin conflicto con reservas posteriores");
  }

  if (candidate.isCombination) {
    score -= w.combinationPenalty;
    reasons.push("Combinación de mesas");
  } else {
    reasons.push("Una sola mesa");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}
