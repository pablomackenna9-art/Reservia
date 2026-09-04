import { useEffect, useMemo, useState } from "react";
import { customerFullName, type Customer } from "@reservia/core";
import {
  getCustomerConsumptionStats,
  listCustomers,
  listReservationsMissingFeedback,
  submitReservationFeedback,
  type CustomerConsumptionStats,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

const MS_PER_DAY = 24 * 60 * 60_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

interface Segment {
  id: string;
  name: string;
  description: string;
  members: Customer[];
}

export function MarketingPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumption, setConsumption] = useState<Map<string, CustomerConsumptionStats>>(new Map());
  const [missingFeedback, setMissingFeedback] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);

  async function reload() {
    if (!restaurantId) return;
    const [c, cons, feedback] = await Promise.all([
      listCustomers(supabase, restaurantId),
      getCustomerConsumptionStats(supabase, restaurantId),
      listReservationsMissingFeedback(supabase, restaurantId),
    ]);
    setCustomers(c);
    setConsumption(cons);
    setMissingFeedback(feedback);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const segments = useMemo<Segment[]>(() => {
    const thisMonth = new Date().getMonth();
    const spendThreshold = (() => {
      const spends = customers.map((c) => consumption.get(c.id)?.totalSpent ?? 0).filter((v) => v > 0);
      if (spends.length < 4) return Infinity; // not enough data to call anyone "top spender" yet
      const sorted = [...spends].sort((a, b) => b - a);
      return sorted[Math.max(0, Math.ceil(sorted.length * 0.2) - 1)]!;
    })();

    return [
      {
        id: "frequent",
        name: "Clientes frecuentes",
        description: "5 visitas o más — los que ya conocen el lugar.",
        members: customers.filter((c) => c.totalVisits >= 5),
      },
      {
        id: "top-spend",
        name: "Mayor consumo",
        description: "El 20% que más gasta por visita, en promedio.",
        members: customers.filter((c) => (consumption.get(c.id)?.totalSpent ?? 0) >= spendThreshold),
      },
      {
        id: "inactive",
        name: "Inactivos",
        description: "Sin visitas hace más de 30 días, o nunca vinieron.",
        members: customers.filter((c) => {
          const d = daysSince(c.lastVisitAt);
          return d === null || d > 30;
        }),
      },
      {
        id: "no-show-risk",
        name: "Riesgo de no-show",
        description: "2 o más ausencias sin avisar.",
        members: customers.filter((c) => c.noShowCount >= 2),
      },
      {
        id: "birthday",
        name: "Cumpleaños este mes",
        description: "Cargá la fecha de nacimiento en la ficha del cliente para que aparezca acá.",
        members: customers.filter((c) => c.birthday && new Date(`${c.birthday}T12:00:00`).getMonth() === thisMonth),
      },
    ];
  }, [customers, consumption]);

  /** Producto más pedido en todo el restaurante -- suma las cantidades de "productos favoritos" de cada cliente. */
  const popularProducts = useMemo(() => {
    const totals = new Map<string, number>();
    for (const stats of consumption.values()) {
      for (const p of stats.topProducts) totals.set(p.name, (totals.get(p.name) ?? 0) + p.quantity);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [consumption]);

  /** A quién recomendarle qué -- los clientes con más consumo, con su producto favorito y una sugerencia concreta. */
  const personalRecommendations = useMemo(() => {
    return customers
      .map((c) => ({ customer: c, stats: consumption.get(c.id) }))
      .filter((x): x is { customer: Customer; stats: CustomerConsumptionStats } => !!x.stats && x.stats.topProducts.length > 0)
      .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
      .slice(0, 6);
  }, [customers, consumption]);

  const messagingConnected = false; // ninguno de WhatsApp/Email/SMS está conectado todavía (Integraciones)

  return (
    <div className="p-6">
      <header className="mb-1">
        <h1 className="text-xl font-semibold">Marketing</h1>
      </header>
      <p className="text-sm text-ink-muted mb-6 max-w-2xl">
        Audiencias reales, calculadas desde tus clientes y su consumo — nadie acá es de prueba. Armá campañas para
        cada una apenas conectes un canal de mensajería en{" "}
        <a href="/integraciones" className="text-accent">
          Integraciones
        </a>
        .
      </p>

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {segments.map((segment) => (
              <div key={segment.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-sm font-semibold">{segment.name}</h2>
                  <span className="text-lg font-semibold tabular-nums text-accent shrink-0">{segment.members.length}</span>
                </div>
                <p className="text-xs text-ink-faint mb-3">{segment.description}</p>

                {segment.members.length > 0 && (
                  <button
                    onClick={() => setOpenSegmentId(openSegmentId === segment.id ? null : segment.id)}
                    className="text-xs text-accent"
                  >
                    {openSegmentId === segment.id ? "Ocultar lista" : "Ver quiénes son"}
                  </button>
                )}

                {openSegmentId === segment.id && (
                  <ul className="mt-2 pt-2 border-t border-line space-y-1 max-h-40 overflow-y-auto">
                    {segment.members.map((c) => (
                      <li key={c.id} className="text-xs text-ink-muted truncate">
                        {customerFullName(c)}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  disabled={!messagingConnected || segment.members.length === 0}
                  title={messagingConnected ? undefined : "Conectá WhatsApp, Email o SMS en Integraciones primero"}
                  className="w-full mt-3 rounded-lg bg-accent text-accent-ink px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Crear campaña para esta audiencia
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-1">Recomendaciones por cliente</h2>
              <p className="text-xs text-ink-faint mb-3">
                Basado en lo que más pide cada cliente — para que el staff sepa qué ofrecerle o destacarle.
              </p>
              {personalRecommendations.length === 0 ? (
                <p className="text-xs text-ink-faint">Todavía no hay suficiente historial de consumo por cliente.</p>
              ) : (
                <ul className="space-y-2">
                  {personalRecommendations.map(({ customer, stats }) => (
                    <li key={customer.id} className="text-xs">
                      <span className="font-medium">{customerFullName(customer)}</span>{" "}
                      <span className="text-ink-muted">
                        — le encanta <span className="text-accent">{stats.topProducts[0]!.name}</span> (lo pidió{" "}
                        {stats.topProducts[0]!.quantity} {stats.topProducts[0]!.quantity === 1 ? "vez" : "veces"}). Ofrecéselo
                        de entrada la próxima vez.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold mb-1">Lo más pedido del restaurante</h2>
              <p className="text-xs text-ink-faint mb-3">Sumando los productos favoritos de todos tus clientes.</p>
              {popularProducts.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin datos de consumo todavía.</p>
              ) : (
                <ol className="space-y-1.5">
                  {popularProducts.map(([name, qty], i) => (
                    <li key={name} className="flex items-center justify-between text-xs">
                      <span>
                        <span className="text-ink-faint tabular-nums mr-1.5">{i + 1}.</span>
                        {name}
                      </span>
                      <span className="text-ink-faint tabular-nums">×{qty}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 mb-8 max-w-2xl">
            <h2 className="text-sm font-semibold mb-1">Feedback post-visita</h2>
            <p className="text-xs text-ink-faint mb-3">
              Sin un canal conectado todavía no se puede pedir solo — cargalo a mano cuando el cliente te comente algo
              al pagar o te responda por teléfono. En cuanto conectes WhatsApp o Email, esto se pide automático.
            </p>
            {missingFeedback.length === 0 ? (
              <p className="text-xs text-ink-faint">Nada pendiente de las últimas 2 semanas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {missingFeedback.map((r) => (
                  <FeedbackRow key={r.id} reservation={r} onSaved={() => setMissingFeedback((prev) => prev.filter((x) => x.id !== r.id))} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="rounded-xl border border-line bg-surface p-4 max-w-2xl">
        <h2 className="text-sm font-semibold mb-1">Campañas</h2>
        <p className="text-xs text-ink-faint">
          Todavía no podés enviar campañas reales — ninguno de los canales de mensajería (WhatsApp, Email, SMS) está
          conectado en Configuración → Integraciones. Las audiencias de arriba ya están listas; en cuanto conectes un
          canal, esta sección pasa a armar y mandar campañas de verdad sobre esos mismos grupos.
        </p>
      </div>
    </div>
  );
}

function FeedbackRow({ reservation, onSaved }: { reservation: ReservationWithDetails; onSaved: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!rating) return;
    setSaving(true);
    await submitReservationFeedback(supabase, reservation.id, rating, comment);
    setSaving(false);
    onSaved();
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm truncate">{reservation.customerName}</p>
          <p className="text-[11px] text-ink-faint">
            {formatDate(reservation.endsAt)} · {reservation.partySize} personas
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`text-lg leading-none ${rating != null && n <= rating ? "text-accent" : "text-ink-faint"}`}
              aria-label={`${n} estrellas`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      {rating != null && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario (opcional)"
            className="flex-1 min-w-0 rounded-lg bg-ground border border-line px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent text-accent-ink px-2.5 py-1 text-xs font-medium disabled:opacity-60 shrink-0"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </li>
  );
}
