export type ZonePreferenceMode = "preferred" | "required";

export interface ReservationForScoring {
  partySize: number;
  startsAt: string;
  endsAt: string;
  preferredZoneId?: string | null;
  zonePreference?: ZonePreferenceMode;
}

/** A slim view of another same-day reservation, used only for look-ahead scoring. */
export interface DayReservationForLookahead {
  tableId: string | null;
  partySize: number;
  startsAt: string;
}

export interface ScorableTable {
  tableIds: string[];
  tableNames: string[];
  zoneId: string;
  capacityMin: number;
  capacityMax: number;
  isCombination: boolean;
  /** Id del conjunto de mesas pegadas en el plano (ya forman UNA mesa): no se penaliza como una combinación. */
  groupId?: string | null;
}

/** Mesas pegadas en el plano que funcionan como una sola mesa del tamaño total (ej. 7-A + 7-B = mesa 7 de 8). */
export interface PreJoinedGroup {
  id: string;
  tableIds: string[];
  label: string;
  zoneId: string;
  capacityMin: number;
  capacityMax: number;
}

export interface TableCandidate extends ScorableTable {
  score: number;
  reasons: string[];
}
