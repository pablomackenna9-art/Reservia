import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCheck, PosConnection } from "@reservia/core";
import type { PosAdapter, PosExternalTable } from "../adapter";
import { listTables } from "../../../tables";
import { mapPosCheck, mapPosConnection } from "../../../pos";

const OPEN_CHECK_STATUSES = ["open", "partially_paid", "paid"] as const;

/**
 * Fase 2: MockPOS. Corre 100% dentro de nuestra propia base — no hay ningún
 * proveedor externo detrás. Existe para probar la cadena completa
 * Reserva/Visita → Mesa → Cuenta → Pago sin depender de Lightspeed, Oracle
 * Simphony o ICG, que todavía no están conectados a nada real.
 *
 * Las mesas "externas" de MockPOS son, a propósito, las mismas mesas
 * internas (`externalTableId === table.id`) — no hay un sistema aparte que
 * mapear, así que `pos_table_mappings` no se usa para este provider.
 *
 * Abrir/agregar consumo/cobrar una cuenta mock no son parte de este
 * `PosAdapter` — un proveedor real nunca recibiría esas llamadas desde acá,
 * esas cuentas se manejan en su propia caja. Esas acciones, exclusivas de
 * MockPOS, viven en `./simulator`.
 */
export function createMockPosAdapter(supabase: SupabaseClient): PosAdapter {
  return {
    provider: "mock",

    async connect(restaurantId: string): Promise<PosConnection> {
      const { data, error } = await supabase
        .from("pos_connections")
        .upsert(
          {
            restaurant_id: restaurantId,
            provider: "mock",
            status: "connected",
            last_synced_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "restaurant_id,provider" },
        )
        .select("*")
        .single();

      if (error) throw error;
      return mapPosConnection(data);
    },

    async disconnect(connectionId: string): Promise<void> {
      const { error } = await supabase.from("pos_connections").update({ status: "disconnected" }).eq("id", connectionId);
      if (error) throw error;
    },

    async getTables(connectionId: string): Promise<PosExternalTable[]> {
      const { data, error } = await supabase
        .from("pos_connections")
        .select("restaurant_id")
        .eq("id", connectionId)
        .single();
      if (error) throw error;

      const tables = await listTables(supabase, data.restaurant_id as string);
      return tables.map((t) => ({ externalTableId: t.id, name: t.name }));
    },

    async getOpenChecks(connectionId: string): Promise<PosCheck[]> {
      const { data, error } = await supabase
        .from("pos_checks")
        .select("*")
        .eq("pos_connection_id", connectionId)
        .in("status", OPEN_CHECK_STATUSES);
      if (error) throw error;
      return (data ?? []).map(mapPosCheck);
    },

    async getCheck(connectionId: string, externalCheckId: string): Promise<PosCheck | null> {
      const { data, error } = await supabase
        .from("pos_checks")
        .select("*")
        .eq("pos_connection_id", connectionId)
        .eq("external_check_id", externalCheckId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPosCheck(data) : null;
    },
  };
}
