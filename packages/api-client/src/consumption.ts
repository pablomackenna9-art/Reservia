import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCheck, PosCheckItem } from "@reservia/core";
import { mapPosCheck, mapPosCheckItem } from "./pos";

/**
 * Seguimiento de consumo en vivo mientras una mesa está sentada -- distinto
 * del simulador de MockPOS (ese existe para probar un proveedor externo).
 * Acá el "proveedor" es el propio staff cargando lo que va pidiendo la
 * mesa, en tiempo real, con la misma infraestructura (visits/pos_checks/
 * pos_check_items) para que alimente el mismo consumo total/productos
 * favoritos del cliente apenas se completa la reserva.
 */

export async function getOpenCheckForReservation(
  supabase: SupabaseClient,
  reservationId: string,
): Promise<PosCheck | null> {
  const { data: visit } = await supabase
    .from("visits")
    .select("id")
    .eq("reservation_id", reservationId)
    .is("ended_at", null)
    .maybeSingle();
  if (!visit) return null;

  const { data: check, error } = await supabase
    .from("pos_checks")
    .select("*")
    .eq("visit_id", visit.id)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return check ? mapPosCheck(check) : null;
}

/** Reutiliza la cuenta abierta de esta reserva si ya existe; si no, la crea vacía. */
export async function ensureOpenCheck(
  supabase: SupabaseClient,
  reservation: { id: string; restaurantId: string; tableId: string | null; customerId: string; partySize: number; startsAt: string },
): Promise<PosCheck> {
  const existing = await getOpenCheckForReservation(supabase, reservation.id);
  if (existing) return existing;

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .insert({
      restaurant_id: reservation.restaurantId,
      table_id: reservation.tableId,
      reservation_id: reservation.id,
      customer_id: reservation.customerId,
      party_size: reservation.partySize,
      started_at: reservation.startsAt,
      status: "seated",
    })
    .select("id")
    .single();
  if (visitError) throw visitError;

  const { data: check, error: checkError } = await supabase
    .from("pos_checks")
    .insert({
      restaurant_id: reservation.restaurantId,
      visit_id: visit.id,
      external_check_id: `manual-${reservation.id}`,
      opened_at: reservation.startsAt,
      subtotal: 0,
      total: 0,
      paid_amount: 0,
      guest_count: reservation.partySize,
      status: "open",
    })
    .select("*")
    .single();
  if (checkError) throw checkError;
  return mapPosCheck(check);
}

export async function listConsumptionItems(supabase: SupabaseClient, checkId: string): Promise<PosCheckItem[]> {
  const { data, error } = await supabase
    .from("pos_check_items")
    .select("*")
    .eq("check_id", checkId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPosCheckItem);
}

async function recomputeCheckTotal(supabase: SupabaseClient, checkId: string): Promise<number> {
  const { data: items, error } = await supabase.from("pos_check_items").select("total").eq("check_id", checkId);
  if (error) throw error;
  const subtotal = (items ?? []).reduce((sum, item) => sum + Number(item.total), 0);
  const { error: updateError } = await supabase.from("pos_checks").update({ subtotal, total: subtotal }).eq("id", checkId);
  if (updateError) throw updateError;
  return subtotal;
}

export async function addConsumptionItem(
  supabase: SupabaseClient,
  input: { restaurantId: string; checkId: string; name: string; quantity: number; unitPrice: number },
): Promise<number> {
  const total = input.quantity * input.unitPrice;
  const { error } = await supabase.from("pos_check_items").insert({
    restaurant_id: input.restaurantId,
    check_id: input.checkId,
    name: input.name,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    total,
  });
  if (error) throw error;
  return recomputeCheckTotal(supabase, input.checkId);
}

export async function removeConsumptionItem(supabase: SupabaseClient, itemId: string, checkId: string): Promise<number> {
  const { error } = await supabase.from("pos_check_items").delete().eq("id", itemId);
  if (error) throw error;
  return recomputeCheckTotal(supabase, checkId);
}
