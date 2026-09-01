import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reservation } from "@reservia/core";
import { listAvailableTables, mapReservation } from "./reservations";

export async function isSlotAvailable(
  supabase: SupabaseClient,
  params: { restaurantId: string; partySize: number; startsAt: string; endsAt: string },
): Promise<boolean> {
  const tables = await listAvailableTables(supabase, params);
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
  });

  if (error) throw error;
  return mapReservation(data);
}
