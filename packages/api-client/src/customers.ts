import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@reservia/core";

export async function searchCustomers(
  supabase: SupabaseClient,
  restaurantId: string,
  query: string,
): Promise<Customer[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8);

  if (error) throw error;
  return (data ?? []).map(mapCustomer);
}

export async function listCustomers(supabase: SupabaseClient, restaurantId: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("last_visit_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapCustomer);
}

/** Average of `total_amount` across each customer's completed reservations that have a real amount charged. */
export async function getAveragePurchaseByCustomer(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("reservations")
    .select("customer_id, total_amount")
    .eq("restaurant_id", restaurantId)
    .eq("status", "completed")
    .not("total_amount", "is", null);

  if (error) throw error;

  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of data ?? []) {
    const customerId = row.customer_id as string;
    const amount = Number(row.total_amount);
    const entry = totals.get(customerId) ?? { sum: 0, count: 0 };
    entry.sum += amount;
    entry.count += 1;
    totals.set(customerId, entry);
  }

  const averages = new Map<string, number>();
  for (const [customerId, { sum, count }] of totals) averages.set(customerId, sum / count);
  return averages;
}

export async function updateCustomer(
  supabase: SupabaseClient,
  id: string,
  patch: { firstName?: string; lastName?: string | null; phone?: string | null; email?: string | null; notes?: string | null },
): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers")
    .update({
      ...(patch.firstName !== undefined && { first_name: patch.firstName }),
      ...(patch.lastName !== undefined && { last_name: patch.lastName }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapCustomer(data);
}

export async function createCustomer(
  supabase: SupabaseClient,
  input: { restaurantId: string; firstName: string; lastName?: string; phone?: string; email?: string },
): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      restaurant_id: input.restaurantId,
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapCustomer(data);
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    firstName: row.first_name as string,
    lastName: (row.last_name as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    birthday: (row.birthday as string) ?? null,
    notes: (row.notes as string) ?? null,
    totalVisits: row.total_visits as number,
    noShowCount: row.no_show_count as number,
    cancellationCount: row.cancellation_count as number,
    lastVisitAt: (row.last_visit_at as string) ?? null,
  };
}
