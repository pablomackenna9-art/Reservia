import type { SupabaseClient } from "@supabase/supabase-js";
import type { Restaurant, RestaurantRole } from "@reservia/core";

export interface MyRestaurant {
  restaurant: Restaurant;
  role: RestaurantRole;
}

/** Restaurants the signed-in user belongs to, via restaurant_users — never a bare `select *` on restaurants. */
export async function listMyRestaurants(supabase: SupabaseClient): Promise<MyRestaurant[]> {
  const { data, error } = await supabase
    .from("restaurant_users")
    .select("role, restaurants(*)")
    .eq("status", "active");

  if (error) throw error;

  return (data ?? []).map((row) => {
    // Supabase infers restaurant_users -> restaurants as to-many by default;
    // the FK is actually one-to-one, so it's always exactly one row here.
    const restaurantRow = (Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants) as Record<
      string,
      unknown
    >;
    return { restaurant: mapRestaurant(restaurantRow), role: row.role as RestaurantRole };
  });
}

export async function getRestaurantBySlug(supabase: SupabaseClient, slug: string): Promise<Restaurant | null> {
  const { data, error } = await supabase.from("restaurants").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? mapRestaurant(data) : null;
}

export async function createRestaurant(
  supabase: SupabaseClient,
  input: { name: string; slug: string },
): Promise<Restaurant> {
  // The RLS insert policy requires created_by = auth.uid() — the trigger that
  // makes the creator the restaurant's owner in restaurant_users relies on
  // this same column, so it has to be set explicitly, not left to a default.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay una sesión activa.");

  const { data, error } = await supabase
    .from("restaurants")
    .insert({ ...input, created_by: user.id })
    .select("*")
    .single();
  if (error) throw error;
  return mapRestaurant(data);
}

function mapRestaurant(row: Record<string, unknown>): Restaurant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    timezone: row.timezone as string,
    currency: row.currency as string,
    locale: row.locale as string,
    phone: (row.phone as string) ?? null,
    address: (row.address as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
    status: row.status as Restaurant["status"],
    plan: row.plan as string,
    showGuestsOnFloorplan: row.show_guests_on_floorplan as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
