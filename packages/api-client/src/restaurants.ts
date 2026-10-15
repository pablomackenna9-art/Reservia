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
  input: { name: string; slug: string; createdBy: string },
): Promise<Restaurant> {
  // The RLS insert policy requires created_by = auth.uid() — the trigger that
  // makes the creator the restaurant's owner in restaurant_users relies on
  // this same column, so it has to be set explicitly, not left to a default.
  // The caller passes the already-authenticated user id (from context) rather
  // than us re-fetching it here: a fresh supabase.auth.getUser() call is a
  // network round-trip that can transiently fail even with a valid session.
  const { name, slug, createdBy } = input;
  const { data, error } = await supabase
    .from("restaurants")
    .insert({ name, slug, created_by: createdBy })
    .select("*")
    .single();
  if (error) throw error;
  return mapRestaurant(data);
}

export async function updateRestaurant(
  supabase: SupabaseClient,
  id: string,
  patch: {
    name?: string;
    slug?: string;
    status?: Restaurant["status"];
    address?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  },
): Promise<Restaurant> {
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.slug !== undefined && { slug: patch.slug }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.logoUrl !== undefined && { logo_url: patch.logoUrl }),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRestaurant(data);
}

/** Sube el logo al bucket público "restaurant-logos" (ver 0018) y devuelve la URL pública -- no actualiza `restaurants.logo_url` sola, el caller decide cuándo guardarla. */
export async function uploadRestaurantLogo(supabase: SupabaseClient, restaurantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${restaurantId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("restaurant-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("restaurant-logos").getPublicUrl(path);
  // Cache-bust: mismo nombre de archivo en cada reemplazo, así que sin esto
  // el navegador (o un CDN) podría seguir sirviendo el logo viejo.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** ¿Es administrador de plataforma (ve y gestiona TODOS los restaurantes, no solo aquellos donde es miembro)? */
export async function isPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return Boolean(data);
}

/** Lo que las reglas de acceso dejen ver: todos los restaurantes para un administrador de plataforma, solo los propios para el resto. */
export async function listAllRestaurants(supabase: SupabaseClient): Promise<Restaurant[]> {
  const { data, error } = await supabase.from("restaurants").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRestaurant);
}

export interface RestaurantOverview {
  tableCount: number;
  reservationsToday: number;
  posKeyActive: boolean;
  posLastEventAt: string | null;
}

/** Números rápidos para la tarjeta de cada restaurante en el panel de administración. */
export async function getRestaurantOverview(supabase: SupabaseClient, restaurantId: string): Promise<RestaurantOverview> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);

  const [tables, reservations, pos] = await Promise.all([
    supabase.from("tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("active", true),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString()),
    supabase
      .from("pos_connections")
      .select("api_key_prefix, last_event_at")
      .eq("restaurant_id", restaurantId)
      .eq("provider", "api")
      .maybeSingle(),
  ]);

  return {
    tableCount: tables.count ?? 0,
    reservationsToday: reservations.count ?? 0,
    posKeyActive: Boolean(pos.data?.api_key_prefix),
    posLastEventAt: (pos.data?.last_event_at as string) ?? null,
  };
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
