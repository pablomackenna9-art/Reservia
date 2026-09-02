import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTableCandidates,
  type DayReservationForLookahead,
  type Reservation,
  type ReservationStatus,
  type Table,
  type TableAssignmentSource,
  type TableCandidate,
  type ZonePreferenceMode,
} from "@reservia/core";
import { mapCustomer } from "./customers";
import { mapTable } from "./tables";

export interface ReservationWithDetails extends Reservation {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  tableName: string | null;
}

function mapReservationWithDetails(row: Record<string, unknown>): ReservationWithDetails {
  const customer = mapCustomer(row.customers as Record<string, unknown>);
  const table = row.tables as { name: string } | null;
  return {
    ...mapReservation(row),
    customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
    customerPhone: customer.phone,
    customerEmail: customer.email,
    tableName: table?.name ?? null,
  };
}

export async function listReservationsForDate(
  supabase: SupabaseClient,
  restaurantId: string,
  date: string, // "YYYY-MM-DD", interpreted as the caller's local day
): Promise<ReservationWithDetails[]> {
  return listReservationsInRange(supabase, restaurantId, date, date);
}

export async function listReservationsInRange(
  supabase: SupabaseClient,
  restaurantId: string,
  startDate: string, // "YYYY-MM-DD", inclusive, caller's local day
  endDate: string, // "YYYY-MM-DD", inclusive, caller's local day
): Promise<ReservationWithDetails[]> {
  // Converted through Date so "local day" means the same thing here as it
  // does when a reservation is created — both go through `new Date(naive
  // string)`, which the JS engine parses in the browser's local timezone.
  // Sending "date + T00:00:00" straight to Postgres would instead be read
  // as a UTC boundary, silently hiding same-day reservations whenever the
  // browser isn't in UTC. (Real restaurant-timezone awareness — using
  // restaurants.timezone instead of the browser's — is still a gap here.)
  const startOfRange = new Date(`${startDate}T00:00:00`).toISOString();
  const endOfRange = new Date(`${endDate}T23:59:59.999`).toISOString();

  const { data, error } = await supabase
    .from("reservations")
    .select("*, customers(*), tables!reservations_table_id_fkey(name)")
    .eq("restaurant_id", restaurantId)
    .gte("starts_at", startOfRange)
    .lte("starts_at", endOfRange)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapReservationWithDetails);
}

/**
 * Reservations the owner still needs to act on: pending public-portal
 * requests awaiting a yes/no, and already-accepted reservations that don't
 * have a table yet. Powers the notifications bell — restaurant-wide, not
 * scoped to "today", since a request can be for next week.
 */
export async function listReservationsNeedingAttention(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<{ pendingApproval: ReservationWithDetails[]; unassignedTable: ReservationWithDetails[] }> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*, customers(*), tables!reservations_table_id_fkey(name)")
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "confirmed", "arriving"])
    .order("starts_at", { ascending: true });

  if (error) throw error;
  const mapped = (data ?? []).map(mapReservationWithDetails);

  return {
    pendingApproval: mapped.filter((r) => r.status === "pending"),
    unassignedTable: mapped.filter((r) => r.status !== "pending" && r.tableId === null),
  };
}

export async function listAvailableTables(
  supabase: SupabaseClient,
  params: { restaurantId: string; partySize: number; startsAt: string; endsAt: string; zoneId?: string },
): Promise<Table[]> {
  const { data, error } = await supabase.rpc("list_available_tables", {
    p_restaurant_id: params.restaurantId,
    p_party_size: params.partySize,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_zone_id: params.zoneId ?? null,
  });

  if (error) throw error;
  return (data ?? []).map(mapTable);
}

export async function createReservation(
  supabase: SupabaseClient,
  input: {
    restaurantId: string;
    customerId: string;
    tableId: string | null;
    startsAt: string;
    endsAt: string;
    partySize: number;
    notes?: string;
    createdBy: string;
    status?: ReservationStatus;
    source?: Reservation["source"];
    tableAssignmentSource?: TableAssignmentSource;
  },
): Promise<Reservation> {
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      restaurant_id: input.restaurantId,
      customer_id: input.customerId,
      table_id: input.tableId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      party_size: input.partySize,
      status: input.status ?? "confirmed",
      source: input.source ?? "admin",
      notes: input.notes ?? null,
      created_by: input.createdBy,
      table_assignment_source: input.tableId ? (input.tableAssignmentSource ?? "manual") : null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapReservation(data);
}

/**
 * Assigns a table via the `assign_reservation_table` RPC instead of a plain
 * update — it re-checks availability and takes a per-table advisory lock
 * server-side, so two hosts assigning the same table at the same instant
 * can't both "win". Same signature as before; every existing caller gets
 * the race protection for free.
 */
export async function updateReservationTable(
  supabase: SupabaseClient,
  reservationId: string,
  tableId: string,
  source: TableAssignmentSource = "manual",
): Promise<void> {
  const { error } = await supabase.rpc("assign_reservation_table", {
    p_reservation_id: reservationId,
    p_table_id: tableId,
    p_source: source,
  });
  if (error) throw error;
}

export async function checkTableAvailability(
  supabase: SupabaseClient,
  tableId: string,
  startsAt: string,
  endsAt: string,
  excludeReservationId?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_table_availability", {
    p_table_id: tableId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_exclude_reservation_id: excludeReservationId ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * The Smart Table Engine's entry point for the UI: fetches everything the
 * pure `buildTableCandidates` needs (available single tables via the
 * existing `list_available_tables` RPC, joinable tables checked
 * individually for the same window, and the day's other reservations for
 * look-ahead scoring) and hands back a ranked, explained shortlist.
 */
export async function getSmartTableCandidates(
  supabase: SupabaseClient,
  params: {
    restaurantId: string;
    partySize: number;
    startsAt: string;
    endsAt: string;
    preferredZoneId?: string | null;
    zonePreference?: ZonePreferenceMode;
    excludeReservationId?: string;
  },
): Promise<TableCandidate[]> {
  const dayStart = new Date(params.startsAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(params.startsAt);
  dayEnd.setHours(23, 59, 59, 999);

  const [availableSingleTables, allTables, dayReservations] = await Promise.all([
    listAvailableTables(supabase, {
      restaurantId: params.restaurantId,
      partySize: params.partySize,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
    }),
    listTablesForAssignment(supabase, params.restaurantId),
    supabase
      .from("reservations")
      .select("id, table_id, party_size, starts_at, status")
      .eq("restaurant_id", params.restaurantId)
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString())
      .not("status", "in", "(cancelled,no_show)")
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);

  const joinableCandidates = allTables.filter(
    (t) => t.active && !t.blocked && t.joinable && (!params.preferredZoneId || params.zonePreference !== "required" || t.zoneId === params.preferredZoneId),
  );
  const joinableAvailability = await Promise.all(
    joinableCandidates.map((t) =>
      checkTableAvailability(supabase, t.id, params.startsAt, params.endsAt, params.excludeReservationId),
    ),
  );
  const availableJoinableTables = joinableCandidates.filter((_, i) => joinableAvailability[i]);

  const laterReservations: DayReservationForLookahead[] = dayReservations
    .filter((r) => r.id !== params.excludeReservationId)
    .map((r) => ({
      tableId: r.table_id as string | null,
      partySize: r.party_size as number,
      startsAt: r.starts_at as string,
    }));

  return buildTableCandidates({
    reservation: {
      partySize: params.partySize,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      preferredZoneId: params.preferredZoneId ?? null,
      zonePreference: params.zonePreference,
    },
    availableSingleTables,
    availableJoinableTables,
    laterReservations,
  });
}

async function listTablesForAssignment(supabase: SupabaseClient, restaurantId: string): Promise<Table[]> {
  const { data, error } = await supabase.from("tables").select("*").eq("restaurant_id", restaurantId).eq("active", true);
  if (error) throw error;
  return (data ?? []).map(mapTable);
}

export async function updateReservationNotes(
  supabase: SupabaseClient,
  id: string,
  internalNotes: string,
): Promise<void> {
  const { error } = await supabase.from("reservations").update({ internal_notes: internalNotes }).eq("id", id);
  if (error) throw error;
}

export async function updateReservationStatus(
  supabase: SupabaseClient,
  id: string,
  status: ReservationStatus,
  totalAmount?: number,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (totalAmount !== undefined) patch.total_amount = totalAmount;
  const { error } = await supabase.from("reservations").update(patch).eq("id", id);
  if (error) throw error;
}

export function mapReservation(row: Record<string, unknown>): Reservation {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    customerId: row.customer_id as string,
    tableId: (row.table_id as string) ?? null,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    partySize: row.party_size as number,
    status: row.status as Reservation["status"],
    source: row.source as Reservation["source"],
    notes: (row.notes as string) ?? null,
    internalNotes: (row.internal_notes as string) ?? null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    createdAt: row.created_at as string,
    suggestedTableId: (row.suggested_table_id as string) ?? null,
    tableAssignmentSource: (row.table_assignment_source as TableAssignmentSource) ?? null,
  };
}
