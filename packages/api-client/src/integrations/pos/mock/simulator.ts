import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosCheck, PosCheckItem } from "@reservia/core";
import { mapPosCheck, mapPosCheckItem } from "../../../pos";
import { closeVisit, createVisit } from "../../../visits";

/**
 * Acciones exclusivas de MockPOS para simular el flujo Mesa → Cuenta →
 * Consumo → Pago → Cierre desde Configuración → Integraciones, sin ningún
 * proveedor real conectado. Un adapter real nunca implementaría estas
 * funciones — las cuentas se abren y cobran en la caja del restaurante, no
 * desde Reservia — por eso viven separadas de `PosAdapter`.
 */

const OPEN_CHECK_STATUSES = ["open", "partially_paid", "paid"] as const;

export async function openMockCheck(
  supabase: SupabaseClient,
  input: { restaurantId: string; posConnectionId: string; tableId: string; partySize: number },
): Promise<PosCheck> {
  const visit = await createVisit(supabase, {
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    partySize: input.partySize,
  });

  const { data, error } = await supabase
    .from("pos_checks")
    .insert({
      restaurant_id: input.restaurantId,
      pos_connection_id: input.posConnectionId,
      visit_id: visit.id,
      external_check_id: `mock-${visit.id}`,
      external_table_id: input.tableId,
      guest_count: input.partySize,
      status: "open",
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapPosCheck(data);
}

export async function addMockCheckItem(
  supabase: SupabaseClient,
  input: { restaurantId: string; checkId: string; name: string; quantity: number; unitPrice: number },
): Promise<void> {
  const total = input.quantity * input.unitPrice;
  const { error: itemError } = await supabase.from("pos_check_items").insert({
    restaurant_id: input.restaurantId,
    check_id: input.checkId,
    name: input.name,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    total,
  });
  if (itemError) throw itemError;

  await recomputeMockCheckTotals(supabase, input.checkId);
}

async function recomputeMockCheckTotals(supabase: SupabaseClient, checkId: string): Promise<void> {
  const { data: items, error } = await supabase.from("pos_check_items").select("total").eq("check_id", checkId);
  if (error) throw error;
  const subtotal = (items ?? []).reduce((sum, item) => sum + Number(item.total), 0);

  const { error: updateError } = await supabase.from("pos_checks").update({ subtotal, total: subtotal }).eq("id", checkId);
  if (updateError) throw updateError;
}

export async function registerMockPayment(
  supabase: SupabaseClient,
  input: { restaurantId: string; checkId: string; amount: number },
): Promise<void> {
  const { error: paymentError } = await supabase.from("pos_payments").insert({
    restaurant_id: input.restaurantId,
    check_id: input.checkId,
    amount: input.amount,
    payment_method: "mock",
  });
  if (paymentError) throw paymentError;

  const { data: check, error: checkError } = await supabase
    .from("pos_checks")
    .select("total, paid_amount")
    .eq("id", input.checkId)
    .single();
  if (checkError) throw checkError;

  const paidAmount = Number(check.paid_amount) + input.amount;
  const total = Number(check.total);
  const status = total > 0 && paidAmount >= total ? "paid" : "partially_paid";

  const { error: updateError } = await supabase
    .from("pos_checks")
    .update({ paid_amount: paidAmount, status })
    .eq("id", input.checkId);
  if (updateError) throw updateError;
}

export async function closeMockCheck(supabase: SupabaseClient, checkId: string, visitId: string | null): Promise<void> {
  const { error } = await supabase
    .from("pos_checks")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", checkId);
  if (error) throw error;

  if (visitId) await closeVisit(supabase, visitId);
}

export async function listOpenMockChecks(supabase: SupabaseClient, restaurantId: string): Promise<PosCheck[]> {
  const { data, error } = await supabase
    .from("pos_checks")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", OPEN_CHECK_STATUSES)
    .order("opened_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapPosCheck);
}

export async function listMockCheckItems(supabase: SupabaseClient, checkId: string): Promise<PosCheckItem[]> {
  const { data, error } = await supabase
    .from("pos_check_items")
    .select("*")
    .eq("check_id", checkId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapPosCheckItem);
}
