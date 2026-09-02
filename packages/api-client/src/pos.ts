import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosConnection, PosProvider, PosTableMapping } from "@reservia/core";

/**
 * Fase 1: infraestructura únicamente. Sin proveedor real conectado, estas
 * funciones no tienen ningún caller en la UI todavía — quedan listas para
 * cuando exista una pantalla de Configuración → Integraciones (Fase 3+) y un
 * `PosAdapter` real (Fase 2+, ver `./integrations/pos/adapter`).
 */

export async function listPosConnections(supabase: SupabaseClient, restaurantId: string): Promise<PosConnection[]> {
  const { data, error } = await supabase.from("pos_connections").select("*").eq("restaurant_id", restaurantId);

  if (error) throw error;
  return (data ?? []).map(mapPosConnection);
}

export async function listPosTableMappings(supabase: SupabaseClient, posConnectionId: string): Promise<PosTableMapping[]> {
  const { data, error } = await supabase.from("pos_table_mappings").select("*").eq("pos_connection_id", posConnectionId);

  if (error) throw error;
  return (data ?? []).map(mapPosTableMapping);
}

export async function setPosTableMapping(
  supabase: SupabaseClient,
  input: { restaurantId: string; posConnectionId: string; tableId: string; externalTableId: string },
): Promise<PosTableMapping> {
  const { data, error } = await supabase
    .from("pos_table_mappings")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        pos_connection_id: input.posConnectionId,
        table_id: input.tableId,
        external_table_id: input.externalTableId,
      },
      { onConflict: "pos_connection_id,table_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return mapPosTableMapping(data);
}

export function mapPosConnection(row: Record<string, unknown>): PosConnection {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    provider: row.provider as PosProvider,
    externalLocationId: (row.external_location_id as string) ?? null,
    status: row.status as PosConnection["status"],
    lastSyncedAt: (row.last_synced_at as string) ?? null,
    lastError: (row.last_error as string) ?? null,
  };
}

export function mapPosTableMapping(row: Record<string, unknown>): PosTableMapping {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    posConnectionId: row.pos_connection_id as string,
    tableId: row.table_id as string,
    externalTableId: row.external_table_id as string,
  };
}
