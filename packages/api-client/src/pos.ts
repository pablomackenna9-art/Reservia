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

export async function removePosTableMapping(supabase: SupabaseClient, posConnectionId: string, tableId: string): Promise<void> {
  const { error } = await supabase
    .from("pos_table_mappings")
    .delete()
    .eq("pos_connection_id", posConnectionId)
    .eq("table_id", tableId);
  if (error) throw error;
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
    apiKeyPrefix: (row.api_key_prefix as string) ?? null,
    lastEventAt: (row.last_event_at as string) ?? null,
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

// ---------------------------------------------------------------------------
// API universal: clave por restaurante + registro de lo que llega
// ---------------------------------------------------------------------------

export interface PosIngestLogEntry {
  id: string;
  receivedAt: string;
  ok: boolean;
  isTest: boolean;
  externalCheckId: string | null;
  tableLabel: string | null;
  total: number | null;
  checkStatus: string | null;
  message: string | null;
}

/** La conexión de la API universal del restaurante, o null si todavía no generó una clave. */
export async function getPosApiConnection(supabase: SupabaseClient, restaurantId: string): Promise<PosConnection | null> {
  const { data, error } = await supabase
    .from("pos_connections")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("provider", "api")
    .maybeSingle();
  if (error) throw error;
  return data && data.api_key_prefix ? mapPosConnection(data) : null;
}

/** Genera (o regenera) la clave. El texto completo solo se devuelve acá, una vez: en la base queda únicamente su hash. */
export async function generatePosApiKey(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<{ apiKey: string; prefix: string; connectionId: string }> {
  const { data, error } = await supabase.rpc("pos_api_generate_key", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return { apiKey: data.api_key, prefix: data.prefix, connectionId: data.connection_id };
}

export async function revokePosApiKey(supabase: SupabaseClient, restaurantId: string): Promise<void> {
  const { error } = await supabase.rpc("pos_api_revoke_key", { p_restaurant_id: restaurantId });
  if (error) throw error;
}

export async function sendPosApiTest(supabase: SupabaseClient, restaurantId: string): Promise<void> {
  const { error } = await supabase.rpc("pos_api_send_test", { p_restaurant_id: restaurantId });
  if (error) throw error;
}

export async function listPosIngestLog(supabase: SupabaseClient, restaurantId: string, limit = 25): Promise<PosIngestLogEntry[]> {
  const { data, error } = await supabase
    .from("pos_ingest_log")
    .select("id, received_at, ok, is_test, external_check_id, table_label, total, check_status, message")
    .eq("restaurant_id", restaurantId)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    receivedAt: row.received_at as string,
    ok: row.ok as boolean,
    isTest: row.is_test as boolean,
    externalCheckId: (row.external_check_id as string) ?? null,
    tableLabel: (row.table_label as string) ?? null,
    total: row.total == null ? null : Number(row.total),
    checkStatus: (row.check_status as string) ?? null,
    message: (row.message as string) ?? null,
  }));
}

/** Mesas con la cuenta pedida o pagada según el POS, con el monto -- para mostrarlas como "Pagando" en el plano. */
export async function listPayingTables(supabase: SupabaseClient, restaurantId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("visits")
    .select("table_id, pos_checks(total, status)")
    .eq("restaurant_id", restaurantId)
    .eq("status", "paying")
    .is("ended_at", null)
    .not("table_id", "is", null);
  if (error) throw error;

  const result = new Map<string, number>();
  for (const row of data ?? []) {
    const checks = (row.pos_checks ?? []) as { total: string | number; status: string }[];
    const live = checks.filter((c) => c.status !== "cancelled");
    result.set(row.table_id as string, live.reduce((sum, c) => sum + Number(c.total), 0));
  }
  return result;
}
