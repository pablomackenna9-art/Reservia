import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCheck, PosCheckItem, PosCheckStatus, PosConnection, PosProvider, PosTableMapping } from "@reservia/core";

/**
 * CRUD genérico sobre las tablas de POS — independiente de qué proveedor
 * (mock o real) haya escrito cada fila. La lógica específica de MockPOS
 * (abrir/cerrar cuentas, sumar consumo) vive en `./integrations/pos/mock`.
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

/** Columnas `numeric` de Postgres vuelven como string por PostgREST — nunca castear directo, siempre convertir. */
export function mapPosCheck(row: Record<string, unknown>): PosCheck {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    posConnectionId: (row.pos_connection_id as string) ?? null,
    visitId: (row.visit_id as string) ?? null,
    externalCheckId: row.external_check_id as string,
    externalTableId: (row.external_table_id as string) ?? null,
    openedAt: row.opened_at as string,
    closedAt: (row.closed_at as string) ?? null,
    subtotal: Number(row.subtotal),
    taxes: Number(row.taxes),
    discounts: Number(row.discounts),
    total: Number(row.total),
    paidAmount: Number(row.paid_amount),
    guestCount: (row.guest_count as number) ?? null,
    status: row.status as PosCheckStatus,
  };
}

export function mapPosCheckItem(row: Record<string, unknown>): PosCheckItem {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    checkId: row.check_id as string,
    externalItemId: (row.external_item_id as string) ?? null,
    name: row.name as string,
    category: (row.category as string) ?? null,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
  };
}
