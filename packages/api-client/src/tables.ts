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

export async function createTable(
  supabase: SupabaseClient,
  input: {
    restaurantId: string;
    zoneId: string;
    name: string;
    shape: Table["shape"];
    capacityMin: number;
    capacityMax: number;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  },
): Promise<Table> {
  const { data, error } = await supabase
    .from("tables")
    .insert({
      restaurant_id: input.restaurantId,
      zone_id: input.zoneId,
      name: input.name,
      shape: input.shape,
      capacity_min: input.capacityMin,
      capacity_max: input.capacityMax,
      pos_x: input.positionX,
      pos_y: input.positionY,
      width: input.width,
      height: input.height,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapTable(data);
}

export async function updateTablePosition(
  supabase: SupabaseClient,
  id: string,
  positionX: number,
  positionY: number,
): Promise<void> {
  const { error } = await supabase.from("tables").update({ pos_x: positionX, pos_y: positionY }).eq("id", id);
  if (error) throw error;
}

export async function updateTable(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    name: string;
    shape: Table["shape"];
    capacityMin: number;
    capacityMax: number;
    width: number;
    height: number;
    rotation: number;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.shape !== undefined) update.shape = patch.shape;
  if (patch.capacityMin !== undefined) update.capacity_min = patch.capacityMin;
  if (patch.capacityMax !== undefined) update.capacity_max = patch.capacityMax;
  if (patch.width !== undefined) update.width = patch.width;
  if (patch.height !== undefined) update.height = patch.height;
  if (patch.rotation !== undefined) update.rotation = patch.rotation;

  const { error } = await supabase.from("tables").update(update).eq("id", id);
  if (error) throw error;
}

/** Soft-delete — matches `deleted_at`/`active`-style removal used elsewhere, not a hard DELETE. */
export async function deactivateTable(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("tables").update({ active: false }).eq("id", id);
  if (error) throw error;
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
