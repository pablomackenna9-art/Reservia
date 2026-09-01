import type { SupabaseClient } from "@supabase/supabase-js";
import type { Table } from "@reservia/core";

export async function listTables(supabase: SupabaseClient, restaurantId: string): Promise<Table[]> {
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);

  if (error) throw error;
  return (data ?? []).map(mapTable);
}

export function mapTable(row: Record<string, unknown>): Table {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    number: (row.number as number) ?? null,
    shape: row.shape as Table["shape"],
    capacityMin: row.capacity_min as number,
    capacityMax: row.capacity_max as number,
    positionX: Number(row.pos_x),
    positionY: Number(row.pos_y),
    width: Number(row.width),
    height: Number(row.height),
    rotation: Number(row.rotation ?? 0),
    active: row.active as boolean,
    joinable: Boolean(row.joinable),
  };
}
