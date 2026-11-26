import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MenuCategory,
  MenuDish,
  MenuStation,
  MenuVariant,
  Table,
  TableRequest,
  TableRequestItem,
  TableRequestKind,
  TableRequestStatus,
  Zone,
} from "@reservia/core";
import { mapTable } from "./tables";
import { mapZone } from "./zones";

// ---------------------------------------------------------------- mapeos

function mapCategory(row: Record<string, unknown>): MenuCategory {
  return {
    id: row.id as string,
    restaurantId: (row.restaurant_id as string) ?? "",
    name: row.name as string,
    description: (row.description as string) ?? "",
    station: ((row.station as string) ?? "cocina") as MenuStation,
    sortOrder: Number(row.sort_order ?? 0),
    active: row.active !== false,
  };
}

function mapDish(row: Record<string, unknown>): MenuDish {
  return {
    id: row.id as string,
    restaurantId: (row.restaurant_id as string) ?? "",
    categoryId: row.category_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    price: Number(row.price ?? 0),
    variants: Array.isArray(row.variants) ? (row.variants as MenuVariant[]).map((v) => ({ name: String(v.name), price: Number(v.price) })) : [],
    tags: (row.tags as string[]) ?? [],
    allergens: (row.allergens as string[]) ?? [],
    soldOut: Boolean(row.sold_out),
    featured: Boolean(row.featured),
    imageUrl: (row.image_url as string) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    active: row.active !== false,
  };
}

function mapRequest(row: Record<string, unknown>): TableRequest {
  const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  return {
    id: row.id as string,
    restaurantId: (row.restaurant_id as string) ?? "",
    tableId: (row.table_id as string) ?? "",
    kind: row.kind as TableRequestKind,
    station: (row.station as MenuStation) ?? null,
    items: items.map(
      (i): TableRequestItem => ({
        dishId: String(i.dish_id ?? ""),
        name: String(i.name ?? ""),
        price: Number(i.price ?? 0),
        qty: Number(i.qty ?? 1),
        variant: (i.variant as string) ?? null,
        note: (i.note as string) ?? null,
      }),
    ),
    note: (row.note as string) ?? null,
    status: row.status as TableRequestStatus,
    createdAt: row.created_at as string,
    handledAt: (row.handled_at as string) ?? null,
  };
}

// ---------------------------------------------------------------- panel: carta

export async function listMenu(supabase: SupabaseClient, restaurantId: string): Promise<{ categories: MenuCategory[]; dishes: MenuDish[] }> {
  const [cats, dishes] = await Promise.all([
    supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("sort_order").order("created_at"),
    supabase.from("menu_dishes").select("*").eq("restaurant_id", restaurantId).order("sort_order").order("created_at"),
  ]);
  if (cats.error) throw cats.error;
  if (dishes.error) throw dishes.error;
  return { categories: (cats.data ?? []).map(mapCategory), dishes: (dishes.data ?? []).map(mapDish) };
}

export async function createMenuCategory(
  supabase: SupabaseClient,
  input: { restaurantId: string; name: string; description?: string; station?: MenuStation; sortOrder?: number },
): Promise<MenuCategory> {
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({ restaurant_id: input.restaurantId, name: input.name.trim(), description: input.description ?? "", station: input.station ?? "cocina", sort_order: input.sortOrder ?? 0 })
    .select("*")
    .single();
  if (error) throw error;
  return mapCategory(data);
}

export async function updateMenuCategory(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<MenuCategory, "name" | "description" | "station" | "sortOrder" | "active">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.station !== undefined) row.station = patch.station;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await supabase.from("menu_categories").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteMenuCategory(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("menu_categories").delete().eq("id", id);
  if (error) throw error;
}

export type MenuDishInput = Pick<MenuDish, "categoryId" | "name" | "description" | "price" | "variants" | "tags" | "allergens" | "soldOut" | "featured" | "imageUrl" | "active"> & { sortOrder?: number };

function dishRow(input: Partial<MenuDishInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.categoryId !== undefined) row.category_id = input.categoryId;
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.description !== undefined) row.description = input.description;
  if (input.price !== undefined) row.price = Math.max(0, Math.round(input.price));
  if (input.variants !== undefined) row.variants = input.variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), price: Math.max(0, Math.round(v.price)) }));
  if (input.tags !== undefined) row.tags = input.tags;
  if (input.allergens !== undefined) row.allergens = input.allergens;
  if (input.soldOut !== undefined) row.sold_out = input.soldOut;
  if (input.featured !== undefined) row.featured = input.featured;
  if (input.imageUrl !== undefined) row.image_url = input.imageUrl;
  if (input.active !== undefined) row.active = input.active;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  return row;
}

export async function createMenuDish(supabase: SupabaseClient, restaurantId: string, input: MenuDishInput): Promise<MenuDish> {
  const { data, error } = await supabase
    .from("menu_dishes")
    .insert({ restaurant_id: restaurantId, ...dishRow(input) })
    .select("*")
    .single();
  if (error) throw error;
  return mapDish(data);
}

export async function updateMenuDish(supabase: SupabaseClient, id: string, patch: Partial<MenuDishInput>): Promise<void> {
  const { error } = await supabase.from("menu_dishes").update(dishRow(patch)).eq("id", id);
  if (error) throw error;
}

export async function deleteMenuDish(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("menu_dishes").delete().eq("id", id);
  if (error) throw error;
}

/** Sube la foto de un plato (bucket público del restaurante, carpeta "{restaurant_id}/menu") y devuelve su URL. */
export async function uploadDishImage(supabase: SupabaseClient, restaurantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${restaurantId}/menu/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("restaurant-logos").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("restaurant-logos").getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------- panel: QR y solicitudes

/** Código del QR de cada mesa física (tableId → código). */
export async function listTableQrTokens(supabase: SupabaseClient, restaurantId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("table_qr_tokens").select("table_id, token").eq("restaurant_id", restaurantId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.table_id as string, r.token as string]));
}

/** Solicitudes de los clientes que el personal todavía no termina de atender. */
export async function listOpenTableRequests(supabase: SupabaseClient, restaurantId: string): Promise<TableRequest[]> {
  const { data, error } = await supabase
    .from("table_requests")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "seen", "preparing", "ready"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

export async function updateTableRequestStatus(supabase: SupabaseClient, id: string, status: TableRequestStatus, userId?: string): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "done" || status === "cancelled") {
    patch.handled_at = new Date().toISOString();
    if (userId) patch.handled_by = userId;
  }
  const { error } = await supabase.from("table_requests").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- público (sin sesión)

export interface PublicMenu {
  restaurant: { id: string; name: string; slug: string; logoUrl: string | null };
  categories: MenuCategory[];
  dishes: MenuDish[];
}

export async function getPublicMenu(supabase: SupabaseClient, slug: string): Promise<PublicMenu | null> {
  const { data, error } = await supabase.rpc("get_public_menu", { p_slug: slug });
  if (error) throw error;
  if (!data) return null;
  const r = data.restaurant as Record<string, unknown>;
  return {
    restaurant: { id: r.id as string, name: r.name as string, slug: r.slug as string, logoUrl: (r.logo_url as string) ?? null },
    categories: ((data.categories as Record<string, unknown>[]) ?? []).map(mapCategory),
    dishes: ((data.dishes as Record<string, unknown>[]) ?? []).map(mapDish),
  };
}

export interface ResolvedTableQr {
  restaurant: { id: string; name: string; slug: string; logoUrl: string | null };
  tableId: string;
  /** El plano del restaurante: sirve para calcular el número que ve el personal (mesas pegadas o separadas). */
  tables: Table[];
  zones: Zone[];
}

export async function resolveTableQr(supabase: SupabaseClient, token: string): Promise<ResolvedTableQr | null> {
  const { data, error } = await supabase.rpc("resolve_table_qr", { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const r = data.restaurant as Record<string, unknown>;
  return {
    restaurant: { id: r.id as string, name: r.name as string, slug: r.slug as string, logoUrl: (r.logo_url as string) ?? null },
    tableId: data.table_id as string,
    tables: ((data.tables as Record<string, unknown>[]) ?? []).map(mapTable),
    zones: ((data.zones as Record<string, unknown>[]) ?? []).map(mapZone),
  };
}

export interface OrderLineInput {
  dishId: string;
  qty: number;
  variant?: string | null;
  note?: string | null;
}

export async function createTableRequest(
  supabase: SupabaseClient,
  token: string,
  input: { kind: TableRequestKind; items?: OrderLineInput[]; note?: string },
): Promise<void> {
  const { error } = await supabase.rpc("create_table_request", {
    p_token: token,
    p_kind: input.kind,
    p_items: (input.items ?? []).map((i) => ({ dish_id: i.dishId, qty: i.qty, variant: i.variant ?? null, note: i.note ?? null })),
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

export async function getTableRequestsPublic(supabase: SupabaseClient, token: string): Promise<TableRequest[]> {
  const { data, error } = await supabase.rpc("get_table_requests_public", { p_token: token });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) ?? []).map(mapRequest);
}
