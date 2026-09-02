import type { Table } from "../../types/floorplan";
import { buildTablePairCombinations } from "./combinations";
import { scoreTableForReservation } from "./scoring";
import type { DayReservationForLookahead, ReservationForScoring, TableCandidate } from "./types";

const MAX_CANDIDATES = 8;

export interface BuildTableCandidatesInput {
  reservation: ReservationForScoring;
  /** Active, unblocked, capacity-fits, and free-for-the-window single tables (e.g. from list_available_tables). */
  availableSingleTables: Table[];
  /** Active, unblocked, joinable tables free for the window, regardless of individual capacity — used to build 2-table combos. Pass [] to skip combos. */
  availableJoinableTables: Table[];
  /** Other reservations the same day (excluding the one being scored), for look-ahead scoring. */
  laterReservations: DayReservationForLookahead[];
}

/**
 * The engine's single entry point: turns "what's physically available" into
 * a ranked, explained shortlist. Pure and synchronous on purpose — all I/O
 * (fetching tables, checking availability, loading the day's reservations)
 * happens in the caller (packages/api-client), so this stays trivially
 * testable and reusable from anywhere (web today, a future mobile app).
 */
export function buildTableCandidates(input: BuildTableCandidatesInput): TableCandidate[] {
  const { reservation, availableSingleTables, availableJoinableTables, laterReservations } = input;
  const zoneRequired = reservation.zonePreference === "required" && reservation.preferredZoneId;

  const candidates: TableCandidate[] = [];

  for (const table of availableSingleTables) {
    if (!table.active || table.blocked) continue;
    if (zoneRequired && table.zoneId !== reservation.preferredZoneId) continue;
    const base = {
      tableIds: [table.id],
      tableNames: [table.name],
      zoneId: table.zoneId,
      capacityMin: table.capacityMin,
      capacityMax: table.capacityMax,
      isCombination: false as const,
    };
    const { score, reasons } = scoreTableForReservation(base, reservation, laterReservations);
    candidates.push({ ...base, score, reasons });
  }

  const eligibleJoinableTables = availableJoinableTables.filter((t) => t.active && !t.blocked && t.joinable);
  for (const combo of buildTablePairCombinations(eligibleJoinableTables, reservation.partySize)) {
    if (zoneRequired && combo.zoneId !== reservation.preferredZoneId) continue;
    const base = { ...combo, isCombination: true as const };
    const { score, reasons } = scoreTableForReservation(base, reservation, laterReservations);
    candidates.push({ ...base, score, reasons });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
}
