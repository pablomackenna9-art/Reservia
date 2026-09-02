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
}

export interface TableCandidate extends ScorableTable {
  score: number;
  reasons: string[];
}
