import type { SupabaseClient } from "@supabase/supabase-js";
import type { Zone } from "@reservia/core";

export async function listZones(supabase: SupabaseClient, restaurantId: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from("zones")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapZone);
}

function mapZone(row: Record<string, unknown>): Zone {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    type: row.type as string,
    sortOrder: row.sort_order as number,
    width: row.width as number,
    height: row.height as number,
    active: row.active as boolean,
  };
}
