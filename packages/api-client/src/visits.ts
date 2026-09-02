import type { SupabaseClient } from "@supabase/supabase-js";
import type { Visit } from "@reservia/core";

/**
 * Fase 1: infraestructura únicamente. Nada en la UI llama estas funciones
 * todavía — `visits` existe como entidad, pero ninguna reserva crea una
 * automáticamente. Eso queda para cuando el flujo de POS/plano en vivo se
 * construya (Fase 2+).
 */

export async function getOpenVisitForTable(supabase: SupabaseClient, tableId: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("table_id", tableId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapVisit(data) : null;
}

export async function listVisitsForReservation(supabase: SupabaseClient, reservationId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("started_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapVisit);
}

export async function createVisit(
  supabase: SupabaseClient,
  input: {
    restaurantId: string;
    tableId?: string | null;
    reservationId?: string | null;
    customerId?: string | null;
    partySize: number;
  },
): Promise<Visit> {
  const { data, error } = await supabase
    .from("visits")
    .insert({
      restaurant_id: input.restaurantId,
      table_id: input.tableId ?? null,
      reservation_id: input.reservationId ?? null,
      customer_id: input.customerId ?? null,
      party_size: input.partySize,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapVisit(data);
}

export async function closeVisit(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("visits")
    .update({ status: "closed", ended_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export function mapVisit(row: Record<string, unknown>): Visit {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    tableId: (row.table_id as string) ?? null,
    reservationId: (row.reservation_id as string) ?? null,
    customerId: (row.customer_id as string) ?? null,
    partySize: row.party_size as number,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? null,
    status: row.status as Visit["status"],
  };
}
