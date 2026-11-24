import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecorKind, ZoneDecor } from "@reservia/core";

function mapDecor(row: Record<string, unknown>): ZoneDecor {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    zoneId: row.zone_id as string,
    kind: row.kind as DecorKind,
    positionX: Number(row.pos_x),
    positionY: Number(row.pos_y),
    width: Number(row.width),
    height: Number(row.height),
    rotation: Number(row.rotation ?? 0),
  };
}

export async function listDecor(supabase: SupabaseClient, restaurantId: string): Promise<ZoneDecor[]> {
  const { data, error } = await supabase.from("zone_decor").select("*").eq("restaurant_id", restaurantId);
  if (error) throw error;
  return (data ?? []).map(mapDecor);
}

export async function createDecor(
  supabase: SupabaseClient,
  input: Omit<ZoneDecor, "id" | "rotation"> & { rotation?: number },
): Promise<ZoneDecor> {
  const { data, error } = await supabase
    .from("zone_decor")
    .insert({
      restaurant_id: input.restaurantId,
      zone_id: input.zoneId,
      kind: input.kind,
      pos_x: input.positionX,
      pos_y: input.positionY,
      width: input.width,
      height: input.height,
      rotation: input.rotation ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapDecor(data);
}

export async function updateDecor(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<ZoneDecor, "positionX" | "positionY" | "width" | "height" | "rotation">>,
): Promise<void> {
  const { error } = await supabase
    .from("zone_decor")
    .update({
      ...(patch.positionX !== undefined && { pos_x: patch.positionX }),
      ...(patch.positionY !== undefined && { pos_y: patch.positionY }),
      ...(patch.width !== undefined && { width: patch.width }),
      ...(patch.height !== undefined && { height: patch.height }),
      ...(patch.rotation !== undefined && { rotation: patch.rotation }),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDecor(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("zone_decor").delete().eq("id", id);
  if (error) throw error;
}
