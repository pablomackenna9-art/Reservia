import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reservation, WaitlistEntry } from "@reservia/core";
import { listAvailableTables, mapReservation } from "./reservations";
import { mapWaitlistEntry } from "./waitlist";

export async function isSlotAvailable(
  supabase: SupabaseClient,
  params: { restaurantId: string; partySize: number; startsAt: string; endsAt: string; zoneId?: string | null },
): Promise<boolean> {
  const tables = await listAvailableTables(supabase, { ...params, zoneId: params.zoneId ?? undefined });
  return tables.length > 0;
}

export async function createPublicReservation(
  supabase: SupabaseClient,
  input: {
    restaurantSlug: string;
    partySize: number;
    startsAt: string;
    endsAt: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    notes?: string;
    zoneId?: string | null;
  },
): Promise<Reservation> {
  const { data, error } = await supabase.rpc("create_public_reservation", {
    p_restaurant_slug: input.restaurantSlug,
    p_party_size: input.partySize,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_notes: input.notes ?? null,
    p_zone_id: input.zoneId ?? null,
  });

  if (error) throw error;
  return mapReservation(data);
}

/** Para cuando `isSlotAvailable` (o la lista de horarios) da vacío -- anota al cliente en la lista de espera sin pasar por el Centro de Control. */
export async function createPublicWaitlistEntry(
  supabase: SupabaseClient,
  input: {
    restaurantSlug: string;
    partySize: number;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    notes?: string;
  },
): Promise<WaitlistEntry> {
  const { data, error } = await supabase.rpc("create_public_waitlist_entry", {
    p_restaurant_slug: input.restaurantSlug,
    p_party_size: input.partySize,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) throw error;
  return mapWaitlistEntry(data);
}

export interface PublicCustomerMatch {
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

/** ¿Ya reservó acá antes con este mail? Para saludarlo por nombre en la confirmación en vez de pedirle todo de nuevo. */
export async function lookupPublicCustomer(
  supabase: SupabaseClient,
  restaurantSlug: string,
  email: string,
): Promise<PublicCustomerMatch | null> {
  const { data, error } = await supabase.rpc("lookup_public_customer", {
    p_restaurant_slug: restaurantSlug,
    p_email: email,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { firstName: row.first_name, lastName: row.last_name ?? null, phone: row.phone ?? null };
}

export interface PublicZone {
  id: string;
  name: string;
  type: string;
}

/** Ubicaciones que el cliente puede pedir (salón, terraza...): solo zonas activas con mesas. */
export async function listPublicZones(supabase: SupabaseClient, restaurantSlug: string): Promise<PublicZone[]> {
  const { data, error } = await supabase.rpc("list_public_zones", { p_restaurant_slug: restaurantSlug });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({ id: row.id as string, name: row.name as string, type: row.type as string }));
}

export interface PublicReservationView {
  restaurantName: string;
  restaurantSlug: string;
  restaurantLogo: string | null;
  timezone: string;
  startsAt: string;
  partySize: number;
  status: string;
  customerResponse: "confirmed" | "declined" | null;
  firstName: string;
  zoneName: string | null;
}

/** La reserva detrás de un enlace de confirmación (el token es el "permiso": largo y aleatorio). */
export async function getReservationByToken(supabase: SupabaseClient, token: string): Promise<PublicReservationView | null> {
  const { data, error } = await supabase.rpc("get_reservation_by_token", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    restaurantName: row.restaurant_name,
    restaurantSlug: row.restaurant_slug,
    restaurantLogo: row.restaurant_logo ?? null,
    timezone: row.timezone,
    startsAt: row.starts_at,
    partySize: row.party_size,
    status: row.status,
    customerResponse: row.customer_response ?? null,
    firstName: row.first_name,
    zoneName: row.zone_name ?? null,
  };
}

/** El cliente re-confirma ("confirm") o avisa que no podrá ir ("decline": la reserva se cancela y la mesa queda libre). */
export async function respondToReservation(supabase: SupabaseClient, token: string, action: "confirm" | "decline"): Promise<"confirmed" | "declined"> {
  const { data, error } = await supabase.rpc("respond_to_reservation", { p_token: token, p_action: action });
  if (error) throw error;
  return data as "confirmed" | "declined";
}

export type DayAvailability = "available" | "waitlist" | "closed";

/** Disponibilidad de cada día de un mes, para pintar el calendario -- ver get_month_availability (0018). */
export async function getMonthAvailability(
  supabase: SupabaseClient,
  restaurantSlug: string,
  partySize: number,
  year: number,
  month: number, // 1-12
): Promise<Map<string, DayAvailability>> {
  const { data, error } = await supabase.rpc("get_month_availability", {
    p_restaurant_slug: restaurantSlug,
    p_party_size: partySize,
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  const map = new Map<string, DayAvailability>();
  for (const row of data ?? []) map.set(row.day as string, row.status as DayAvailability);
  return map;
}
