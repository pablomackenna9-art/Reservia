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
    coverUrl?: string | null;
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
      ...(patch.coverUrl !== undefined && { cover_url: patch.coverUrl }),
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

/** Sube la foto de portada (misma bucket pública que el logo, ruta "{restaurant_id}/cover.<ext>") y devuelve su URL pública; el caller guarda `cover_url`. */
export async function uploadRestaurantCover(supabase: SupabaseClient, restaurantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${restaurantId}/cover.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("restaurant-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("restaurant-logos").getPublicUrl(path);
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

// ---------------------------------------------------------------------------
// Administrador de plataforma: alta de clientes y accesos (funciones admin_* de la base, que verifican el rol).
// ---------------------------------------------------------------------------

export interface NewClientInput {
  name: string;
  slug: string;
  ownerEmail?: string;
  ownerPassword?: string;
  ownerName?: string;
  /** Restaurante del que se copian zonas, plano de mesas, horarios y reglas. null = vacío. */
  templateRestaurantId?: string | null;
  activate?: boolean;
}

export interface NewClientResult {
  restaurantId: string;
  slug: string;
  ownerEmail: string | null;
  ownerCreated: boolean;
  template: { zones: number; tables: number; hours: number } | null;
}

export async function adminCreateClient(supabase: SupabaseClient, input: NewClientInput): Promise<NewClientResult> {
  const { data, error } = await supabase.rpc("admin_create_client", {
    p_name: input.name,
    p_slug: input.slug,
    p_owner_email: input.ownerEmail?.trim() || null,
    p_owner_password: input.ownerPassword || null,
    p_owner_name: input.ownerName?.trim() || null,
    p_template: input.templateRestaurantId ?? null,
    p_activate: input.activate ?? true,
  });
  if (error) throw error;
  return {
    restaurantId: data.restaurant_id,
    slug: data.slug,
    ownerEmail: data.owner_email ?? null,
    ownerCreated: Boolean(data.owner_created),
    template: data.template ?? null,
  };
}

export async function adminApplyTemplate(supabase: SupabaseClient, restaurantId: string, templateRestaurantId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_apply_template", { p_restaurant: restaurantId, p_template: templateRestaurantId });
  if (error) throw error;
}

/** Da acceso de dueño a un restaurante existente; si el correo es nuevo crea la cuenta con esa clave. */
export async function adminAddOwner(
  supabase: SupabaseClient,
  input: { restaurantId: string; email: string; password?: string; name?: string },
): Promise<{ email: string; created: boolean }> {
  const { data, error } = await supabase.rpc("admin_add_owner", {
    p_restaurant: input.restaurantId,
    p_email: input.email,
    p_password: input.password || null,
    p_name: input.name?.trim() || null,
  });
  if (error) throw error;
  return { email: data.email, created: Boolean(data.created) };
}

export async function adminSetUserPassword(supabase: SupabaseClient, email: string, password: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_user_password", { p_email: email, p_password: password });
  if (error) throw error;
}

/** Quita el acceso de una persona a un restaurante (su cuenta sigue existiendo). */
export async function adminRemoveAccess(supabase: SupabaseClient, restaurantId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("admin_remove_access", { p_restaurant: restaurantId, p_email: email });
  if (error) throw error;
}

/**
 * Elimina un restaurante y todo lo suyo. Exige escribir su nombre corto. Antes borra sus imágenes
 * (logo y portada) del bucket público; si eso falla no bloquea el borrado.
 */
export async function adminDeleteRestaurant(supabase: SupabaseClient, restaurantId: string, confirmSlug: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_restaurant", { p_restaurant: restaurantId, p_confirm_slug: confirmSlug });
  if (error) throw error;
  try {
    const { data: files } = await supabase.storage.from("restaurant-logos").list(restaurantId);
    if (files && files.length > 0) {
      await supabase.storage.from("restaurant-logos").remove(files.map((f) => `${restaurantId}/${f.name}`));
    }
  } catch {
    // Las imágenes huérfanas no afectan a nadie; no se interrumpe el flujo.
  }
}

export interface RestaurantAccess {
  email: string;
  role: string;
  status: string;
  lastSignInAt: string | null;
}

export async function listRestaurantAccess(supabase: SupabaseClient, restaurantId: string): Promise<RestaurantAccess[]> {
  const { data, error } = await supabase.rpc("admin_restaurant_owners", { p_restaurant: restaurantId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    email: row.email as string,
    role: row.role as string,
    status: row.status as string,
    lastSignInAt: (row.last_sign_in_at as string) ?? null,
  }));
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
    coverUrl: (row.cover_url as string) ?? null,
    status: row.status as Restaurant["status"],
    plan: row.plan as string,
    showGuestsOnFloorplan: row.show_guests_on_floorplan as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
