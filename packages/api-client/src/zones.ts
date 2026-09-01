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

export async function createZone(
  supabase: SupabaseClient,
  input: { restaurantId: string; name: string; type?: string; width?: number; height?: number; sortOrder: number },
): Promise<Zone> {
  const { data, error } = await supabase
    .from("zones")
    .insert({
      restaurant_id: input.restaurantId,
      name: input.name,
      type: input.type ?? "salon",
      width: input.width ?? 1000,
      height: input.height ?? 700,
      sort_order: input.sortOrder,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapZone(data);
}

export async function renameZone(supabase: SupabaseClient, id: string, name: string): Promise<void> {
  const { error } = await supabase.from("zones").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deactivateZone(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("zones").update({ active: false }).eq("id", id);
  if (error) throw error;
}

export async function setZoneSortOrder(supabase: SupabaseClient, id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from("zones").update({ sort_order: sortOrder }).eq("id", id);
  if (error) throw error;
}

export function mapZone(row: Record<string, unknown>): Zone {
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
