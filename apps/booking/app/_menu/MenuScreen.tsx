"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTableRequest,
  getTableRequestsPublic,
  type PublicMenu,
} from "@reservia/api-client";
import { formatCLP, TABLE_REQUEST_LABEL, requestTotal, type MenuDish, type TableRequest } from "@reservia/core";
import { supabase } from "../../lib/supabase";

/** Un plato elegido (con su opción y su nota, ej. "sin ajo"). */
interface CartLine {
  key: string;
  dish: MenuDish;
  variant: string | null;
  qty: number;
  note: string;
}

const STATUS_TEXT: Record<TableRequest["status"], string> = {
  pending: "Enviado al restaurante",
  seen: "Lo están atendiendo",
  done: "Listo",
  cancelled: "Cancelado",
};

function lineKey(dishId: string, variant: string | null) {
  return `${dishId}|${variant ?? ""}`;
}

function unitPrice(dish: MenuDish, variant: string | null): number {
  if (variant) return dish.variants.find((v) => v.name === variant)?.price ?? dish.price;
  return dish.price;
}

function errorText(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;
}

/**
 * La carta del restaurante. Sin `table`, es solo para mirar. Con `table` (el cliente escaneó el QR de su mesa),
 * además puede pedir platos con notas, llamar al mozo, pedir la cuenta o agua.
 */
export function MenuScreen({ menu, table }: { menu: PublicMenu; table?: { token: string; label: string } }) {
  const ordering = Boolean(table);
  const categories = useMemo(() => menu.categories.filter((c) => menu.dishes.some((d) => d.categoryId === c.id)), [menu]);
  const [activeCat, setActiveCat] = useState<string | null>(categories[0]?.id ?? null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuDish | null>(null);
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

  // Lo que ya pidió esta mesa: se refresca mientras haya algo abierto.
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
    }, 15_000);
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
        if (dish && !dish.soldOut) restored.push({ key: lineKey(dish.id, s.variant), dish, variant: s.variant, qty: s.qty, note: s.note });
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
  const open = requests.filter((r) => r.status === "pending" || r.status === "seen");

  function add(dish: MenuDish, variant: string | null) {
    const key = lineKey(dish.id, variant);
    setCart((cur) => {
      const existing = cur.find((l) => l.key === key);
      if (existing) return cur.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...cur, { key, dish, variant, qty: 1, note: "" }];
    });
    setPicking(null);
  }

  function change(key: string, delta: number) {
    setCart((cur) => cur.flatMap((l) => (l.key !== key ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: Math.min(20, l.qty + delta) }])));
  }

  function qtyOf(dishId: string) {
    return cart.filter((l) => l.dish.id === dishId).reduce((s, l) => s + l.qty, 0);
  }

  function pressDish(dish: MenuDish) {
    if (!ordering || dish.soldOut) return;
    if (dish.variants.length > 0) setPicking(dish);
    else add(dish, null);
  }

  async function sendQuick(kind: "waiter" | "bill" | "water", note?: string) {
    if (!table || busy) return;
    setBusy(true);
    setError(null);
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
    <div className="min-h-screen pb-28">
      <header className="px-4 pt-6 pb-4 text-center">
        {menu.restaurant.logoUrl ? (
          <img src={menu.restaurant.logoUrl} alt={menu.restaurant.name} className="mx-auto h-16 w-auto max-w-[70%] object-contain" />
        ) : (
          <h1 className="font-serif text-[34px] leading-none">{menu.restaurant.name}</h1>
        )}
        {table ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface-2 border border-line px-3.5 py-1.5 text-[14px] font-semibold">
            <span className="h-2 w-2 rounded-full bg-status-available" aria-hidden />
            Mesa {table.label}
          </p>
        ) : (
          <p className="mt-2 text-[14px] text-ink-muted">Nuestra carta</p>
        )}
      </header>

      {table && (
        <section className="px-4 max-w-2xl mx-auto" aria-label="Avisos rápidos">
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
            <button onClick={() => setOtherOpen(true)} className="mt-2 w-full text-center text-[14px] font-semibold text-accent py-2">
              Pedir otra cosa
            </button>
          )}

          {open.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {open.map((r) => (
                <li key={r.id} className="rounded-xl bg-surface-2 border border-line px-3.5 py-2.5 text-[14px] flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold">{TABLE_REQUEST_LABEL[r.kind]}</span>
                    {r.kind === "order" && <span className="text-ink-muted"> · {r.items.reduce((s, i) => s + i.qty, 0)} platos · {formatCLP(requestTotal(r.items))}</span>}
                  </span>
                  <span className="text-[13px] font-semibold text-status-arriving shrink-0">{STATUS_TEXT[r.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {categories.length > 1 && (
        <nav className="sticky top-0 z-20 mt-4 bg-ground/95 backdrop-blur border-b border-line" aria-label="Categorías">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2 max-w-2xl mx-auto [scrollbar-width:none]">
            {categories.map((c) => (
              <li key={c.id} className="shrink-0">
                <button
                  onClick={() => goTo(c.id)}
                  className={`h-10 px-4 rounded-full text-[14px] font-semibold transition-colors ${activeCat === c.id ? "bg-ink text-ground" : "text-ink-muted hover:bg-surface"}`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="max-w-2xl mx-auto px-4">
        {categories.length === 0 && <p className="py-16 text-center text-ink-muted">La carta todavía está en preparación.</p>}
        {categories.map((cat) => (
          <section
            key={cat.id}
            data-cat={cat.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
            }}
            className="pt-8 scroll-mt-16"
          >
            <h2 className="font-serif text-[30px] leading-none">{cat.name}</h2>
            {cat.description && <p className="mt-1.5 text-[14px] text-ink-muted">{cat.description}</p>}
            <ul className="mt-3 divide-y divide-line">
              {menu.dishes
                .filter((d) => d.categoryId === cat.id)
                .map((dish) => {
                  const inCart = qtyOf(dish.id);
                  const from = dish.variants.length > 0 ? Math.min(...dish.variants.map((v) => v.price)) : dish.price;
                  return (
                    <li key={dish.id} className={`py-4 flex gap-3 ${dish.soldOut ? "opacity-55" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <h3 className="text-[17px] font-semibold leading-snug">{dish.name}</h3>
                          {dish.featured && <span className="mt-0.5 shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">Del chef</span>}
                        </div>
                        {dish.description && <p className="mt-1 text-[14px] leading-snug text-ink-muted">{dish.description}</p>}
                        {(dish.tags.length > 0 || dish.allergens.length > 0) && (
                          <p className="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
                            {dish.tags.map((t) => (
                              <span key={t} className="rounded-full bg-surface px-2 py-0.5 font-semibold text-ink-muted">
                                {t}
                              </span>
                            ))}
                            {dish.allergens.length > 0 && <span className="text-ink-faint">Contiene: {dish.allergens.join(", ")}</span>}
                          </p>
                        )}
                        <p className="mt-2 text-[16px] font-semibold tabular-nums">
                          {dish.variants.length > 0 ? `Desde ${formatCLP(from)}` : formatCLP(dish.price)}
                          {dish.soldOut && <span className="ml-2 text-[13px] font-semibold text-status-occupied">Agotado</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                        {dish.imageUrl && <img src={dish.imageUrl} alt="" loading="lazy" className="h-20 w-20 rounded-xl object-cover" />}
                        {ordering && !dish.soldOut && (
                          <button
                            onClick={() => pressDish(dish)}
                            className="h-10 min-w-10 rounded-full bg-accent px-3.5 text-[14px] font-bold text-accent-ink active:scale-95 transition-transform"
                            aria-label={`Agregar ${dish.name}`}
                          >
                            {inCart > 0 ? `${inCart} · +` : "Agregar"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-center text-[12px] text-ink-faint">Precios en pesos chilenos, IVA incluido.</p>
      </main>

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

      {picking && (
        <Sheet onClose={() => setPicking(null)} title={picking.name}>
          <p className="text-[14px] text-ink-muted mb-3">Elige una opción</p>
          <ul className="space-y-2">
            {picking.variants.map((v) => (
              <li key={v.name}>
                <button onClick={() => add(picking, v.name)} className="flex h-14 w-full items-center justify-between rounded-xl border border-line-strong bg-surface-2 px-4 font-semibold active:bg-surface">
                  <span>{v.name}</span>
                  <span className="tabular-nums">{formatCLP(v.price)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {showCart && (
        <Sheet onClose={() => setShowCart(false)} title="Tu pedido">
          <ul className="divide-y divide-line">
            {cart.map((l) => (
              <li key={l.key} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{l.dish.name}</p>
                    {l.variant && <p className="text-[13px] text-ink-muted">{l.variant}</p>}
                    <p className="text-[14px] tabular-nums text-ink-muted">{formatCLP(unitPrice(l.dish, l.variant) * l.qty)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => change(l.key, -1)} className="h-10 w-10 rounded-full bg-surface text-lg font-bold" aria-label="Quitar uno">
                      −
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                    <button onClick={() => change(l.key, 1)} className="h-10 w-10 rounded-full bg-surface text-lg font-bold" aria-label="Agregar uno">
                      +
                    </button>
                  </div>
                </div>
                <input
                  value={l.note}
                  onChange={(e) => setCart((cur) => cur.map((x) => (x.key === l.key ? { ...x, note: e.target.value.slice(0, 200) } : x)))}
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
          <button
            onClick={sendOrder}
            disabled={busy}
            className="mt-4 flex h-14 w-full items-center justify-between rounded-2xl bg-accent px-5 text-accent-ink font-semibold disabled:opacity-60"
          >
            <span>{busy ? "Enviando…" : "Enviar pedido"}</span>
            <span className="tabular-nums">{formatCLP(total)}</span>
          </button>
          <p className="mt-2 text-center text-[12px] text-ink-faint">El pedido le llega al personal de tu mesa. La cuenta se paga al final.</p>
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

function QuickButton({ label, done, onClick, disabled }: { label: string; done: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || done}
      className={`h-16 rounded-xl px-2 text-[14px] font-semibold leading-tight transition-colors active:scale-[0.98] ${
        done ? "bg-surface text-status-available" : "border border-line-strong bg-surface-2 hover:border-accent"
      } disabled:opacity-90`}
    >
      {done ? "Avisado ✓" : label}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
