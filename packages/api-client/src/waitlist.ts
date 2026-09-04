import type { SupabaseClient } from "@supabase/supabase-js";
import type { WaitlistEntry, WaitlistStatus } from "@reservia/core";
import { mapCustomer } from "./customers";

export interface WaitlistEntryWithCustomer extends WaitlistEntry {
  customerName: string;
  customerPhone: string | null;
  /** Para poder anteponer clientes frecuentes en la lista -- mismo umbral que "Frecuente" en Notificaciones. */
  customerTotalVisits: number;
}

/** `statuses` por default solo trae lo activo (esperando/notificado) -- pasar la lista completa para incluir canceladas/atendidas. */
export async function listWaitlist(
  supabase: SupabaseClient,
  restaurantId: string,
  statuses: WaitlistStatus[] = ["waiting", "notified"],
): Promise<WaitlistEntryWithCustomer[]> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("*, customers(*)")
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .order("priority", { ascending: false })
    .order("requested_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const customer = mapCustomer(row.customers as Record<string, unknown>);
    return {
      ...mapWaitlistEntry(row),
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      customerPhone: customer.phone,
      customerTotalVisits: customer.totalVisits,
    };
  });
}

export async function addToWaitlist(
  supabase: SupabaseClient,
  input: {
    restaurantId: string;
    customerId: string;
    partySize: number;
    estimatedWaitMinutes?: number;
    notes?: string;
    priority?: number;
  },
): Promise<WaitlistEntry> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .insert({
      restaurant_id: input.restaurantId,
      customer_id: input.customerId,
      party_size: input.partySize,
      estimated_wait_minutes: input.estimatedWaitMinutes ?? null,
      notes: input.notes ?? null,
      priority: input.priority ?? 0,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapWaitlistEntry(data);
}

export async function updateWaitlistStatus(supabase: SupabaseClient, id: string, status: WaitlistStatus): Promise<void> {
  const { error } = await supabase.from("waitlist_entries").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function setWaitlistPriority(supabase: SupabaseClient, id: string, priority: number): Promise<void> {
  const { error } = await supabase.from("waitlist_entries").update({ priority }).eq("id", id);
  if (error) throw error;
}

export async function updateWaitlistEntry(
  supabase: SupabaseClient,
  id: string,
  patch: { partySize?: number; notes?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("waitlist_entries")
    .update({
      ...(patch.partySize !== undefined && { party_size: patch.partySize }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
    })
    .eq("id", id);
  if (error) throw error;
}

export function mapWaitlistEntry(row: Record<string, unknown>): WaitlistEntry {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    customerId: row.customer_id as string,
    partySize: row.party_size as number,
    requestedAt: row.requested_at as string,
    estimatedWaitMinutes: (row.estimated_wait_minutes as number) ?? null,
    status: row.status as WaitlistStatus,
    preferredZoneId: (row.preferred_zone_id as string) ?? null,
    notes: (row.notes as string) ?? null,
    priority: (row.priority as number) ?? 0,
  };
}
