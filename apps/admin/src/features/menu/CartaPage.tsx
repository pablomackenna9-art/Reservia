import { useEffect, useMemo, useState } from "react";
import {
  createMenuCategory,
  createMenuDish,
  deleteMenuCategory,
  deleteMenuDish,
  listMenu,
  updateMenuCategory,
  updateMenuDish,
  type MenuDishInput,
} from "@reservia/api-client";
import { formatCLP, type MenuCategory, type MenuDish, type MenuStation } from "@reservia/core";
import { CopyButton } from "../../components/ui";
import { menuUrlFor } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { DishModal } from "./DishModal";

const STARTER_CATEGORIES: { name: string; station: MenuStation }[] = [
  { name: "Entradas", station: "cocina" },
  { name: "Platos principales", station: "cocina" },
  { name: "Postres", station: "cocina" },
  { name: "Bebidas", station: "barra" },
];

function errorText(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;
}

/** La carta del restaurante: categorías y platos. Es la que ven los clientes al escanear el QR de su mesa. */
export function CartaPage() {
  const { current } = useRestaurant();
  const restaurant = current?.restaurant;
  const canEdit = current?.role === "owner" || current?.role === "administrator";
  const canToggleSoldOut = canEdit || current?.role === "host" || current?.role === "waiter";

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [dishes, setDishes] = useState<MenuDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuDish | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!restaurant) return;
    try {
      const menu = await listMenu(supabase, restaurant.id);
      setCategories(menu.categories);
      setDishes(menu.dishes);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, "No se pudo cargar la carta."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  useEffect(() => {
    if (!selectedId || !categories.some((c) => c.id === selectedId)) setSelectedId(categories[0]?.id ?? null);
  }, [categories, selectedId]);

  const selected = categories.find((c) => c.id === selectedId) ?? null;
  const dishesOfSelected = useMemo(() => dishes.filter((d) => d.categoryId === selectedId), [dishes, selectedId]);
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dishes) map.set(d.categoryId, (map.get(d.categoryId) ?? 0) + 1);
    return map;
  }, [dishes]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorText(err, fallback));
    }
  }

  if (!restaurant) return null;

  const publicUrl = menuUrlFor(restaurant.slug);
  const nextOrder = (list: { sortOrder: number }[]) => (list.length ? Math.max(...list.map((x) => x.sortOrder)) + 1 : 0);

  async function addCategory(name: string, station: MenuStation = "cocina") {
    if (!restaurant || !name.trim()) return;
    await run(async () => {
      const created = await createMenuCategory(supabase, { restaurantId: restaurant.id, name, station, sortOrder: nextOrder(categories) });
      setSelectedId(created.id);
    }, "No se pudo crear la categoría.");
  }

  async function move(list: { id: string; sortOrder: number }[], id: string, delta: -1 | 1, kind: "category" | "dish") {
    const index = list.findIndex((x) => x.id === id);
    const other = list[index + delta];
    if (index < 0 || !other) return;
    const mine = list[index]!;
    // Se renumera la lista completa para que el orden quede estable aunque haya valores repetidos.
    const ordered = [...list];
    ordered[index] = other;
    ordered[index + delta] = mine;
    await run(
      () => Promise.all(ordered.map((x, i) => (kind === "category" ? updateMenuCategory(supabase, x.id, { sortOrder: i }) : updateMenuDish(supabase, x.id, { sortOrder: i })))),
      "No se pudo cambiar el orden.",
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <h1 className="font-serif text-4xl font-normal leading-tight">Carta</h1>
      <p className="text-[15px] text-ink-muted mt-1 mb-5 max-w-2xl">
        Tus platos y precios (en pesos, IVA incluido). Los clientes la ven al escanear el QR de su mesa y desde ahí pueden pedir, con notas como "sin ajo".
      </p>

      <div className="rounded-xl bg-surface p-3 sm:p-4 mb-5 max-w-3xl flex flex-wrap items-center gap-2">
        <p className="font-mono text-[14px] bg-ground rounded-lg px-3 py-2 break-all flex-1 min-w-[200px]">{publicUrl}</p>
        <CopyButton text={publicUrl} label="Copiar enlace" />
        <a href={publicUrl} target="_blank" rel="noreferrer" className="h-11 px-4 inline-flex items-center rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold">
          Ver carta ↗
        </a>
      </div>

      {loadError && (
        <div className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 p-4 mb-5 max-w-3xl">
          <p className="text-[15px] font-semibold">No se pudo cargar la carta.</p>
          <p className="text-[15px] text-ink-muted mt-1">{loadError}. Si es lo primero que ves, falta aplicar la migración 0037 en Supabase.</p>
        </div>
      )}
      {error && <p className="text-[15px] text-status-occupied mb-3">{error}</p>}

      {loading ? (
        <p className="text-ink-muted">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
          <aside className="rounded-2xl bg-surface p-3 sm:p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-faint mb-2">Categorías</h2>
            {categories.length === 0 && canEdit && (
              <div className="mb-3">
                <p className="text-[14px] text-ink-muted mb-2">Empieza con las típicas y cámbialas después:</p>
                <button
                  onClick={() =>
                    run(async () => {
                      for (const [i, c] of STARTER_CATEGORIES.entries()) await createMenuCategory(supabase, { restaurantId: restaurant.id, name: c.name, station: c.station, sortOrder: i });
                    }, "No se pudieron crear las categorías.")
                  }
                  className="h-11 w-full rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
                >
                  Crear Entradas, Principales, Postres y Bebidas
                </button>
              </div>
            )}
            <ul className="space-y-1">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center justify-between gap-2 rounded-[10px] px-3 h-11 text-[15px] text-left transition-colors ${selectedId === c.id ? "bg-ground font-semibold" : "hover:bg-surface-2"} ${c.active ? "" : "opacity-55"}`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[13px] text-ink-faint tabular-nums">{countByCategory.get(c.id) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCategory(newCategory);
                  setNewCategory("");
                }}
              >
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nueva categoría" className="h-11 min-w-0 flex-1 rounded-[10px] bg-ground border border-line px-3 text-[15px] outline-none focus:border-accent" />
                <button type="submit" disabled={!newCategory.trim()} className="h-11 px-3 rounded-[10px] bg-surface-2 font-semibold disabled:opacity-50" aria-label="Agregar categoría">
                  +
                </button>
              </form>
            )}
          </aside>

          <section className="rounded-2xl bg-surface p-3 sm:p-5 min-w-0">
            {!selected ? (
              <p className="text-[15px] text-ink-muted">Crea una categoría para empezar a agregar platos.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {renaming === selected.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value;
                        run(() => updateMenuCategory(supabase, selected.id, { name: value }), "No se pudo renombrar.");
                        setRenaming(null);
                      }}
                    >
                      <input name="name" defaultValue={selected.name} autoFocus className="h-11 rounded-[10px] bg-ground border border-line px-3 text-[15px] outline-none focus:border-accent" />
                      <button className="h-11 px-4 rounded-[10px] bg-accent text-accent-ink font-semibold">Guardar</button>
                    </form>
                  ) : (
                    <h2 className="font-serif text-3xl leading-none mr-auto">{selected.name}</h2>
                  )}
                  {canEdit && renaming !== selected.id && (
                    <>
                      <button onClick={() => setRenaming(selected.id)} className="h-10 px-3 rounded-[10px] bg-surface-2 text-[14px] font-semibold">
                        Renombrar
                      </button>
                      <button
                        onClick={() => run(() => updateMenuCategory(supabase, selected.id, { station: selected.station === "cocina" ? "barra" : "cocina" }), "No se pudo cambiar.")}
                        className="h-10 px-3 rounded-[10px] bg-surface-2 text-[14px] font-semibold"
                        title="A dónde llegan los pedidos de esta categoría"
                      >
                        Va a: {selected.station === "cocina" ? "Cocina" : "Barra"}
                      </button>
                      <button onClick={() => move(categories, selected.id, -1, "category")} className="h-10 w-10 rounded-[10px] bg-surface-2 font-semibold" aria-label="Subir categoría">
                        ↑
                      </button>
                      <button onClick={() => move(categories, selected.id, 1, "category")} className="h-10 w-10 rounded-[10px] bg-surface-2 font-semibold" aria-label="Bajar categoría">
                        ↓
                      </button>
                      <button
                        onClick={() => run(() => updateMenuCategory(supabase, selected.id, { active: !selected.active }), "No se pudo cambiar.")}
                        className="h-10 px-3 rounded-[10px] bg-surface-2 text-[14px] font-semibold"
                      >
                        {selected.active ? "Ocultar" : "Mostrar"}
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`¿Eliminar la categoría "${selected.name}" y sus ${dishesOfSelected.length} platos? No se puede deshacer.`)) return;
                          run(() => deleteMenuCategory(supabase, selected.id), "No se pudo eliminar.");
                        }}
                        className="h-10 px-3 rounded-[10px] text-[14px] font-semibold text-status-occupied"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
                {!selected.active && <p className="text-[14px] text-status-arriving mb-3">Esta categoría está oculta: los clientes no la ven.</p>}

                {dishesOfSelected.length === 0 ? (
                  <p className="text-[15px] text-ink-muted py-6">Todavía no hay platos en {selected.name}.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {dishesOfSelected.map((d) => (
                      <li key={d.id} className={`py-3 flex items-center gap-3 ${d.active ? "" : "opacity-55"}`}>
                        {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" /> : <div className="h-14 w-14 rounded-lg bg-ground shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-[16px] font-semibold truncate">
                            {d.name}
                            {d.featured && <span className="ml-2 text-[12px] text-accent font-bold uppercase">Del chef</span>}
                          </p>
                          <p className="text-[14px] text-ink-muted tabular-nums">
                            {d.variants.length > 0 ? `${d.variants.length} opciones · desde ${formatCLP(Math.min(...d.variants.map((v) => v.price)))}` : formatCLP(d.price)}
                            {!d.active && " · oculto"}
                          </p>
                        </div>
                        {canToggleSoldOut && (
                          <button
                            onClick={() => run(() => updateMenuDish(supabase, d.id, { soldOut: !d.soldOut }), "No se pudo cambiar.")}
                            aria-pressed={d.soldOut}
                            className={`h-10 px-3 rounded-[10px] text-[14px] font-semibold shrink-0 ${d.soldOut ? "bg-status-occupied text-white" : "bg-surface-2"}`}
                          >
                            {d.soldOut ? "Agotado" : "Hay"}
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button onClick={() => move(dishesOfSelected, d.id, -1, "dish")} className="h-10 w-9 rounded-[10px] bg-surface-2 font-semibold hidden sm:block" aria-label="Subir">
                              ↑
                            </button>
                            <button onClick={() => move(dishesOfSelected, d.id, 1, "dish")} className="h-10 w-9 rounded-[10px] bg-surface-2 font-semibold hidden sm:block" aria-label="Bajar">
                              ↓
                            </button>
                            <button onClick={() => setEditing(d)} className="h-10 px-3 rounded-[10px] bg-surface-2 text-[14px] font-semibold shrink-0">
                              Editar
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEdit && (
                  <button onClick={() => setEditing("new")} className="mt-3 h-12 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold">
                    + Agregar un plato
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {editing && selected && (
        <DishModal
          restaurantId={restaurant.id}
          categories={categories}
          dish={editing === "new" ? null : editing}
          defaultCategoryId={editing === "new" ? selected.id : editing.categoryId}
          onClose={() => setEditing(null)}
          onSave={async (input: MenuDishInput) => {
            if (editing === "new") await createMenuDish(supabase, restaurant.id, { ...input, sortOrder: nextOrder(dishes.filter((d) => d.categoryId === input.categoryId)) });
            else await updateMenuDish(supabase, editing.id, input);
            await reload();
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  await deleteMenuDish(supabase, editing.id);
                  await reload();
                }
          }
        />
      )}
    </div>
  );
}
