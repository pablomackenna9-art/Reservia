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
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(8);

  if (error) throw error;
  return (data ?? []).map(mapCustomer);
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
