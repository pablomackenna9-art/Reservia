import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_RESERVATION_RULES, type ReservationRules } from "@reservia/core";

export async function getReservationRules(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<ReservationRules> {
  const { data, error } = await supabase
    .from("reservation_rules")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { restaurantId, ...DEFAULT_RESERVATION_RULES };
  return mapReservationRules(data);
}

/** Restaurants don't get a reservation_rules row by default — upsert creates it the first time. */
export async function setAverageTicketPerPerson(
  supabase: SupabaseClient,
  restaurantId: string,
  averageTicketPerPerson: number,
): Promise<void> {
  const current = await getReservationRules(supabase, restaurantId);
  const { error } = await supabase.from("reservation_rules").upsert(
    {
      restaurant_id: restaurantId,
      default_duration_minutes: current.defaultDurationMinutes,
      buffer_minutes: current.bufferMinutes,
      min_party_size: current.minPartySize,
      max_party_size: current.maxPartySize,
      min_advance_hours: current.minAdvanceHours,
      max_advance_days: current.maxAdvanceDays,
      allow_online_booking: current.allowOnlineBooking,
      average_ticket_per_person: averageTicketPerPerson,
    },
    { onConflict: "restaurant_id" },
  );
  if (error) throw error;
}

function mapReservationRules(row: Record<string, unknown>): ReservationRules {
  return {
    restaurantId: row.restaurant_id as string,
    defaultDurationMinutes: row.default_duration_minutes as number,
    bufferMinutes: row.buffer_minutes as number,
    minPartySize: row.min_party_size as number,
    maxPartySize: row.max_party_size as number,
    minAdvanceHours: row.min_advance_hours as number,
    maxAdvanceDays: row.max_advance_days as number,
    allowOnlineBooking: row.allow_online_booking as boolean,
    averageTicketPerPerson: Number(row.average_ticket_per_person ?? 0),
  };
}
