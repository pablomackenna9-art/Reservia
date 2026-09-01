import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reservation, ReservationStatus, Table } from "@reservia/core";
import { mapCustomer } from "./customers";
import { mapTable } from "./tables";

export interface ReservationWithDetails extends Reservation {
  customerName: string;
  customerPhone: string | null;
  tableName: string | null;
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
    .select("*, customers(*), tables(name)")
    .eq("restaurant_id", restaurantId)
    .gte("starts_at", startOfRange)
    .lte("starts_at", endOfRange)
    .order("starts_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const customer = mapCustomer(row.customers as Record<string, unknown>);
    const table = row.tables as { name: string } | null;
    return {
      ...mapReservation(row),
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      customerPhone: customer.phone,
      tableName: table?.name ?? null,
    };
  });
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
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapReservation(data);
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

function mapReservation(row: Record<string, unknown>): Reservation {
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
  };
}
