import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpeningHours, RestaurantHours } from "@reservia/core";

export async function listHours(supabase: SupabaseClient, restaurantId: string): Promise<RestaurantHours[]> {
  const { data, error } = await supabase
    .from("restaurant_hours")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapHours);
}

export async function addHours(
  supabase: SupabaseClient,
  input: { restaurantId: string; dayOfWeek: number; serviceName: string; opensAt: string; closesAt: string },
): Promise<RestaurantHours> {
  const { data, error } = await supabase
    .from("restaurant_hours")
    .insert({
      restaurant_id: input.restaurantId,
      day_of_week: input.dayOfWeek,
      service_name: input.serviceName,
      opens_at: input.opensAt,
      closes_at: input.closesAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapHours(data);
}

export async function removeHours(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("restaurant_hours").delete().eq("id", id);
  if (error) throw error;
}

function mapHours(row: Record<string, unknown>): RestaurantHours {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    dayOfWeek: row.day_of_week as number,
    serviceName: row.service_name as string,
    opensAt: row.opens_at as string,
    closesAt: row.closes_at as string,
  };
}

export async function listOpeningHours(supabase: SupabaseClient, restaurantId: string): Promise<OpeningHours[]> {
  const { data, error } = await supabase
    .from("restaurant_opening_hours")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week", { ascending: true })
    .order("opens_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    dayOfWeek: row.day_of_week as number,
    label: row.label as string,
    opensAt: row.opens_at as string,
    closesAt: row.closes_at as string,
  }));
}

/** Agrega el mismo tramo de atención a varios días de una sola vez. */
export async function addOpeningHours(
  supabase: SupabaseClient,
  input: { restaurantId: string; days: number[]; label: string; opensAt: string; closesAt: string },
): Promise<void> {
  const { error } = await supabase.from("restaurant_opening_hours").insert(
    input.days.map((day) => ({
      restaurant_id: input.restaurantId,
      day_of_week: day,
      label: input.label,
      opens_at: input.opensAt,
      closes_at: input.closesAt,
    })),
  );
  if (error) throw error;
}

export async function removeOpeningHours(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("restaurant_opening_hours").delete().eq("id", id);
  if (error) throw error;
}
