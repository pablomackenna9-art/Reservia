"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createTableRequest, getTableRequestsPublic, type PublicMenu } from "@reservia/api-client";
import { formatCLP, requestStatusText, requestTotal, TABLE_REQUEST_LABEL, type MenuCategory, type MenuDish, type TableRequest } from "@reservia/core";
import { supabase } from "../../lib/supabase";

/** Un plato elegido, con su opción y su nota (ej. "sin ajo"). Cada línea tiene su propio id: dos notas distintas no se mezclan. */
interface CartLine {
  id: string;
  dish: MenuDish;
  variant: string | null;
  qty: number;
  note: string;
}

let lineCounter = 0;
const newLineId = () => `l${Date.now().toString(36)}${(lineCounter++).toString(36)}`;

function unitPrice(dish: MenuDish, variant: string | null): number {
  if (variant) return dish.variants.find((v) => v.name === variant)?.price ?? dish.price;
  return dish.price;
}

function fromPrice(dish: MenuDish): number {
  return dish.variants.length > 0 ? Math.min(...dish.variants.map((v) => v.price)) : dish.price;
}

function errorText(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;
}

/**
 * La carta del restaurante, con fotos grandes. Sin `table` es solo para mirar. Con `table` (el cliente escaneó el QR
 * de su mesa) toca un plato para verlo en grande y pedirlo con una nota, o avisa al mozo, pide la cuenta o agua.
 */
export function MenuScreen({ menu, table }: { menu: PublicMenu; table?: { token: string; label: string } }) {
  const ordering = Boolean(table);
  const categories = useMemo(() => menu.categories.filter((c) => menu.dishes.some((d) => d.categoryId === c.id)), [menu]);
  const [activeCat, setActiveCat] = useState<string | null>(categories[0]?.id ?? null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [detail, setDetail] = useState<MenuDish | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [generalNote, setGeneralNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [cooldown, setCooldown] = useState<Record<string, number>>({});
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Lo que ya pidió esta mesa: se refresca mientras la pantalla está abierta.
  useEffect(() => {
    if (!table) return;
    let cancelled = false;
    const load = () =>
      getTableRequestsPublic(supabase, table.token)
        .then((r) => !cancelled && setRequests(r))
        .catch(() => undefined);
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [table]);

  // El pedido se guarda en el teléfono por si se recarga la página.
  useEffect(() => {
    if (!table) return;
    try {
      const raw = sessionStorage.getItem(`cart:${table.token}`);
      if (!raw) return;
      const saved = JSON.parse(raw) as { dishId: string; variant: string | null; qty: number; note: string }[];
      const restored: CartLine[] = [];
      for (const s of saved) {
        const dish = menu.dishes.find((d) => d.id === s.dishId);
        if (dish && !dish.soldOut) restored.push({ id: newLineId(), dish, variant: s.variant, qty: s.qty, note: s.note });
      }
      setCart(restored);
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }, [table, menu]);

  useEffect(() => {
    if (!table) return;
    try {
      sessionStorage.setItem(`cart:${table.token}`, JSON.stringify(cart.map((l) => ({ dishId: l.dish.id, variant: l.variant, qty: l.qty, note: l.note }))));
    } catch {
      // sin almacenamiento
    }
  }, [cart, table]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const total = cart.reduce((s, l) => s + unitPrice(l.dish, l.variant) * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const open = requests.filter((r) => r.status !== "done" && r.status !== "cancelled");

  function add(dish: MenuDish, variant: string | null, qty = 1, note = "") {
    const cleanNote = note.trim();
    setCart((cur) => {
      const same = cur.find((l) => l.dish.id === dish.id && l.variant === variant && l.note.trim() === cleanNote);
      if (same) return cur.map((l) => (l.id === same.id ? { ...l, qty: Math.min(20, l.qty + qty) } : l));
      return [...cur, { id: newLineId(), dish, variant, qty, note: cleanNote }];
    });
    setDetail(null);
    setToast(`${dish.name} agregado`);
  }

  function change(id: string, delta: number) {
    setCart((cur) => cur.flatMap((l) => (l.id !== id ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: Math.min(20, l.qty + delta) }])));
  }

  const qtyOf = (dishId: string) => cart.filter((l) => l.dish.id === dishId).reduce((s, l) => s + l.qty, 0);

  async function sendQuick(kind: "waiter" | "bill" | "water", note?: string) {
    if (!table || busy) return;
    setBusy(true);
    try {
      await createTableRequest(supabase, table.token, { kind, note });
      setToast(kind === "bill" ? "Pedimos la cuenta. Ya viene." : kind === "waiter" ? "Avisamos al mozo. Ya viene." : "Listo, ya te llevan agua o hielo.");
      setCooldown((c) => ({ ...c, [kind]: Date.now() + 45_000 }));
      setRequests(await getTableRequestsPublic(supabase, table.token));
    } catch (err) {
      setToast(errorText(err, "No pudimos enviar el aviso. Intenta de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function sendOther() {
    if (!otherText.trim()) return;
    await sendQuick("waiter", otherText.trim());
    setOtherOpen(false);
    setOtherText("");
  }

  async function sendOrder() {
    if (!table || cart.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTableRequest(supabase, table.token, {
        kind: "order",
        items: cart.map((l) => ({ dishId: l.dish.id, qty: l.qty, variant: l.variant, note: l.note.trim() || null })),
        note: generalNote.trim() || undefined,
      });
      setCart([]);
      setGeneralNote("");
      setShowCart(false);
      setToast("¡Pedido enviado! Te lo llevamos a la mesa.");
      setRequests(await getTableRequestsPublic(supabase, table.token));
    } catch (err) {
      setError(errorText(err, "No pudimos enviar el pedido. Intenta de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  function goTo(catId: string) {
    setActiveCat(catId);
    sectionRefs.current.get(catId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // La pestaña activa sigue al desplazamiento.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.getAttribute("data-cat"));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const waiting = (kind: string) => (cooldown[kind] ?? 0) > Date.now();

  return (
    <div className="relative min-h-screen pb-28">
      {/* El logo del local, enorme y muy suave, de fondo. */}
      {menu.restaurant.logoUrl && <LogoWatermark src={menu.restaurant.logoUrl} />}

      <div className="relative z-10">
        <header className="px-4 pt-6 pb-3 text-center">
          {menu.restaurant.logoUrl ? (
            <img src={menu.restaurant.logoUrl} alt={menu.restaurant.name} className="mx-auto h-16 w-auto max-w-[70%] object-contain" />
          ) : (
            <h1 className="font-serif text-[36px] leading-none">{menu.restaurant.name}</h1>
          )}
          {table ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface-2/90 border border-line px-3.5 py-1.5 text-[13px] font-semibold uppercase tracking-[0.12em]">
              <span className="h-2 w-2 rounded-full bg-status-available" aria-hidden />
              Mesa {table.label}
            </p>
          ) : (
            <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Nuestra carta</p>
          )}
        </header>

        {table && (
          <section className="px-4 max-w-3xl mx-auto" aria-label="Avisos rápidos">
            <div className="grid grid-cols-3 gap-2">
              <QuickButton label="Llamar al mozo" done={waiting("waiter")} onClick={() => sendQuick("waiter")} disabled={busy} />
              <QuickButton label="Pedir la cuenta" done={waiting("bill")} onClick={() => sendQuick("bill")} disabled={busy} />
              <QuickButton label="Agua o hielo" done={waiting("water")} onClick={() => sendQuick("water")} disabled={busy} />
            </div>
            {otherOpen ? (
              <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
                <label className="text-[13px] font-semibold" htmlFor="other">
                  ¿Qué necesitas?
                </label>
                <textarea
                  id="other"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Ej: una silla para niños, la clave del wifi…"
                  className="mt-1 w-full rounded-lg border border-line-strong bg-ground p-2.5 text-[16px]"
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={sendOther} disabled={busy || !otherText.trim()} className="h-11 flex-1 rounded-[10px] bg-accent text-accent-ink font-semibold disabled:opacity-50">
                    Enviar
                  </button>
                  <button onClick={() => setOtherOpen(false)} className="h-11 px-4 rounded-[10px] text-ink-muted font-semibold">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setOtherOpen(true)} className="mt-1 w-full text-center text-[13px] font-semibold uppercase tracking-[0.1em] text-accent py-2">
                Pedir otra cosa
              </button>
            )}

            {open.length > 0 && (
              <ul className="mt-1 space-y-1.5">
                {open.map((r) => (
                  <li key={r.id} className="rounded-xl bg-surface-2/95 border border-line px-3.5 py-2.5 text-[14px] flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold">{r.kind === "order" ? (r.station === "barra" ? "Pedido de barra" : "Pedido de cocina") : TABLE_REQUEST_LABEL[r.kind]}</span>
                      {r.kind === "order" && (
                        <span className="text-ink-muted">
                          {" "}
                          · {r.items.reduce((s, i) => s + i.qty, 0)} · {formatCLP(requestTotal(r.items))}
                        </span>
                      )}
                    </span>
                    <span className={`text-[13px] font-semibold shrink-0 ${r.status === "ready" ? "text-status-available" : "text-status-arriving"}`}>{requestStatusText(r)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {categories.length > 0 && (
          <nav className="sticky top-0 z-20 mt-3 bg-ground/95 backdrop-blur border-b border-line" aria-label="Categorías">
            <ul className="flex gap-6 overflow-x-auto px-5 max-w-6xl mx-auto [scrollbar-width:none]">
              {categories.map((c) => (
                <li key={c.id} className="shrink-0">
                  <button
                    onClick={() => goTo(c.id)}
                    className={`h-12 border-b-2 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors ${activeCat === c.id ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main className="max-w-6xl mx-auto px-3 sm:px-5">
          {categories.length === 0 && <p className="py-16 text-center text-ink-muted">La carta todavía está en preparación.</p>}
          {categories.map((cat) => (
            <section
              key={cat.id}
              data-cat={cat.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(cat.id, el);
              }}
              className="pt-9 scroll-mt-14"
            >
              <h2 className="font-serif text-[32px] leading-none px-1">{cat.name}</h2>
              {cat.description && <p className="mt-1.5 text-[14px] text-ink-muted px-1">{cat.description}</p>}
              <ul className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 items-start">
                {menu.dishes
                  .filter((d) => d.categoryId === cat.id)
                  .map((dish) => (
                    <li key={dish.id}>
                      <DishCard
                        dish={dish}
                        inCart={qtyOf(dish.id)}
                        quickAdd={ordering && !dish.soldOut && dish.variants.length === 0 ? () => add(dish, null) : undefined}
                        onOpen={() => setDetail(dish)}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <p className="mt-12 text-center text-[12px] text-ink-faint">Precios en pesos chilenos, IVA incluido.</p>
        </main>
      </div>

      {ordering && count > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setShowCart(true)}
            className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between rounded-2xl bg-ink px-5 text-on-dark shadow-lg active:scale-[0.99] transition-transform"
          >
            <span className="font-semibold">
              Ver mi pedido <span className="ml-1.5 rounded-full bg-on-dark/15 px-2 py-0.5 text-[13px]">{count}</span>
            </span>
            <span className="font-semibold tabular-nums">{formatCLP(total)}</span>
          </button>
        </div>
      )}

      {detail && (
        <DishDetail
          dish={detail}
          category={categories.find((c) => c.id === detail.categoryId) ?? null}
          ordering={ordering}
          onClose={() => setDetail(null)}
          onAdd={(variant, qty, note) => add(detail, variant, qty, note)}
        />
      )}

      {showCart && (
        <Sheet onClose={() => setShowCart(false)} title="Tu pedido">
          <ul className="divide-y divide-line">
            {cart.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{l.dish.name}</p>
                    {l.variant && <p className="text-[13px] text-ink-muted">{l.variant}</p>}
                    <p className="text-[14px] tabular-nums text-ink-muted">{formatCLP(unitPrice(l.dish, l.variant) * l.qty)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => change(l.id, -1)} className="h-10 w-10 rounded-full bg-surface text-lg font-bold" aria-label="Quitar uno">
                      −
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                    <button onClick={() => change(l.id, 1)} className="h-10 w-10 rounded-full bg-surface text-lg font-bold" aria-label="Agregar uno">
                      +
                    </button>
                  </div>
                </div>
                <input
                  value={l.note}
                  onChange={(e) => setCart((cur) => cur.map((x) => (x.id === l.id ? { ...x, note: e.target.value.slice(0, 200) } : x)))}
                  placeholder="Nota para este plato: sin ajo, sin cebolla…"
                  className="mt-2 h-11 w-full rounded-lg border border-line-strong bg-ground px-3 text-[16px]"
                />
              </li>
            ))}
          </ul>
          <label className="mt-3 block text-[13px] font-semibold" htmlFor="general">
            ¿Algo más para todo el pedido?
          </label>
          <textarea
            id="general"
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Ej: alergia a los frutos secos"
            className="mt-1 w-full rounded-lg border border-line-strong bg-ground p-2.5 text-[16px]"
          />
          {error && <p className="mt-2 text-[14px] text-status-occupied">{error}</p>}
          <button onClick={sendOrder} disabled={busy} className="mt-4 flex h-14 w-full items-center justify-between rounded-2xl bg-accent px-5 text-accent-ink font-semibold disabled:opacity-60">
            <span>{busy ? "Enviando…" : "Enviar pedido"}</span>
            <span className="tabular-nums">{formatCLP(total)}</span>
          </button>
          <p className="mt-2 text-center text-[12px] text-ink-faint">El pedido le llega a cocina y barra. La cuenta se paga al final.</p>
        </Sheet>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-on-dark shadow-lg">{toast}</p>
        </div>
      )}
    </div>
  );
}

/**
 * El logo como marca de agua. Si el logo tiene fondo oscuro (letras claras sobre negro) se invierte antes de mezclarlo,
 * así el fondo desaparece y solo queda el dibujo, en vez de verse un rectángulo.
 */
function LogoWatermark({ src }: { src: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        // Se mira solo el borde: ahí está el fondo del logo, no el dibujo.
        let sum = 0;
        let n = 0;
        for (let y = 0; y < 24; y++) {
          for (let x = 0; x < 24; x++) {
            if (x > 1 && x < 22 && y > 1 && y < 22) continue;
            const i = (y * 24 + x) * 4;
            if ((data[i + 3] ?? 255) < 40) continue; // transparente: no cuenta
            sum += (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) / 255;
            n++;
          }
        }
        setDark(n > 0 && sum / n < 0.45);
      } catch {
        // si el navegador no deja leer la imagen, se deja como está
      }
    };
    img.src = src;
  }, [src]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 grid place-items-center overflow-hidden">
      <img src={src} alt="" className={`w-[90vmin] max-w-none opacity-[0.1] mix-blend-multiply grayscale ${dark ? "invert" : ""}`} />
    </div>
  );
}

/** Tarjeta de un plato: foto grande, nombre y precio, descripción corta y etiquetas. */
function DishCard({ dish, inCart, quickAdd, onOpen }: { dish: MenuDish; inCart: number; quickAdd?: () => void; onOpen: () => void }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-surface-2 transition-shadow hover:shadow-md ${dish.soldOut ? "opacity-60" : ""}`}>
      <button onClick={onOpen} className="block w-full text-left" aria-label={`Ver ${dish.name}`}>
        {dish.imageUrl && (
          <div className="relative aspect-[4/3] bg-surface">
            <img src={dish.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            {dish.soldOut && <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-on-dark">Agotado</span>}
          </div>
        )}
        <div className="p-3">
          <div className={`flex items-baseline justify-between gap-2 ${!dish.imageUrl && quickAdd ? "pr-10" : ""}`}>
            <h3 className="font-serif text-[19px] leading-tight">{dish.name}</h3>
            <p className="shrink-0 text-[13px] tabular-nums text-accent font-semibold">
              {dish.variants.length > 0 ? "desde " : ""}
              {formatCLP(fromPrice(dish))}
            </p>
          </div>
          {dish.description && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-ink-muted">{dish.description}</p>}
          {(dish.tags.length > 0 || (dish.soldOut && !dish.imageUrl)) && (
            <p className="mt-2 flex flex-wrap gap-1">
              {dish.soldOut && !dish.imageUrl && <span className="rounded bg-status-occupied px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Agotado</span>}
              {dish.tags.map((t) => (
                <span key={t} className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-dark">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
      </button>
      {inCart > 0 && <span className="absolute left-2 top-2 rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-accent-ink shadow">{inCart}</span>}
      {quickAdd && (
        <button
          onClick={quickAdd}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-ground/95 text-xl font-bold text-accent shadow active:scale-95 transition-transform"
          aria-label={`Agregar ${dish.name}`}
        >
          +
        </button>
      )}
    </div>
  );
}

/** El plato en grande: foto de portada con el nombre y el precio encima; abajo, descripción, opciones, nota y "Agregar". */
function DishDetail({
  dish,
  category,
  ordering,
  onClose,
  onAdd,
}: {
  dish: MenuDish;
  category: MenuCategory | null;
  ordering: boolean;
  onClose: () => void;
  onAdd: (variant: string | null, qty: number, note: string) => void;
}) {
  const [variant, setVariant] = useState<string | null>(dish.variants[0]?.name ?? null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const price = unitPrice(dish, variant);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 md:items-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-label={dish.name} onClick={(e) => e.stopPropagation()} className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-ground md:rounded-3xl">
        <div className="overflow-y-auto">
          {dish.imageUrl ? (
            <div className="relative h-72 sm:h-96">
              <img src={dish.imageUrl} alt={dish.name} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/30" />
              <button onClick={onClose} className="absolute left-4 top-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-dark/90">
                ← Volver a la carta
              </button>
              <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-ground/90 text-lg">
                ✕
              </button>
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-on-dark">
                {category && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-dark/80">{category.name}</p>}
                <h2 className="mt-1 font-serif text-[40px] leading-[0.95] sm:text-[56px]">{dish.name}</h2>
                <p className="mt-2 text-[13px] tracking-[0.14em] text-on-dark/80">
                  CLP <span className="font-serif text-[28px] tracking-normal text-on-dark">{formatCLP(price)}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-7 pb-0">
              <div className="flex items-start justify-between gap-3">
                <button onClick={onClose} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  ← Volver a la carta
                </button>
                <button onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full bg-surface text-lg">
                  ✕
                </button>
              </div>
              {category && <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{category.name}</p>}
              <h2 className="mt-1 font-serif text-[40px] leading-[0.95]">{dish.name}</h2>
              <p className="mt-2 text-[13px] tracking-[0.14em] text-ink-muted">
                CLP <span className="font-serif text-[28px] tracking-normal text-ink">{formatCLP(price)}</span>
              </p>
            </div>
          )}

          <div className="p-5 sm:p-7 space-y-5">
            {dish.description && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">El plato</p>
                <p className="mt-2 text-[17px] leading-relaxed">{dish.description}</p>
              </div>
            )}

            {(dish.tags.length > 0 || dish.allergens.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {dish.tags.map((t) => (
                  <span key={t} className="rounded bg-ink px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-on-dark">
                    {t}
                  </span>
                ))}
                {dish.allergens.length > 0 && <span className="text-[13px] text-ink-muted">Contiene: {dish.allergens.join(", ")}</span>}
              </div>
            )}

            {dish.soldOut ? (
              <p className="rounded-xl bg-surface p-4 text-[15px] font-semibold text-status-occupied">Este plato se agotó por hoy.</p>
            ) : ordering ? (
              <div className="space-y-4">
                {dish.variants.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Elige una opción</p>
                    <ul className="mt-2 space-y-2">
                      {dish.variants.map((v) => (
                        <li key={v.name}>
                          <button
                            onClick={() => setVariant(v.name)}
                            aria-pressed={variant === v.name}
                            className={`flex h-14 w-full items-center justify-between rounded-xl border px-4 font-semibold transition-colors ${variant === v.name ? "border-accent bg-accent/10" : "border-line-strong bg-surface-2"}`}
                          >
                            <span>{v.name}</span>
                            <span className="tabular-nums">{formatCLP(v.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <label htmlFor="dish-note" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                    ¿Algo que cambiar?
                  </label>
                  <input
                    id="dish-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    placeholder="Ej: sin ajo, sin cebolla, bien cocido…"
                    className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-[16px]"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-full bg-surface p-1">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 rounded-full text-xl font-bold" aria-label="Menos">
                      −
                    </button>
                    <span className="w-8 text-center text-[17px] font-semibold tabular-nums">{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(20, q + 1))} className="h-11 w-11 rounded-full text-xl font-bold" aria-label="Más">
                      +
                    </button>
                  </div>
                  <button onClick={() => onAdd(variant, qty, note)} className="flex h-14 flex-1 items-center justify-between rounded-2xl bg-accent px-5 font-semibold text-accent-ink active:scale-[0.99] transition-transform">
                    <span>Agregar al pedido</span>
                    <span className="tabular-nums">{formatCLP(price * qty)}</span>
                  </button>
                </div>
              </div>
            ) : (
              dish.variants.length > 0 && (
                <ul className="space-y-1.5">
                  {dish.variants.map((v) => (
                    <li key={v.name} className="flex justify-between border-b border-line pb-1.5 text-[15px]">
                      <span>{v.name}</span>
                      <span className="tabular-nums font-semibold">{formatCLP(v.price)}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
            {!ordering && <p className="text-[13px] text-ink-faint">Para pedir desde tu mesa, escanea el QR que está sobre ella.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickButton({ label, done, onClick, disabled }: { label: string; done: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || done}
      className={`h-14 rounded-xl px-2 text-[12px] font-semibold uppercase leading-tight tracking-[0.08em] transition-colors active:scale-[0.98] ${
        done ? "bg-surface text-status-available" : "border border-line-strong bg-surface-2/95 hover:border-accent"
      } disabled:opacity-90`}
    >
      {done ? "Avisado ✓" : label}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-ground p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-[28px] leading-none">{title}</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-surface text-lg" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
