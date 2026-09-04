import { useEffect, useMemo, useState } from "react";
import { customerFullName, type Customer } from "@reservia/core";
import { getCustomerConsumptionStats, listCustomers, type CustomerConsumptionStats } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

const MS_PER_DAY = 24 * 60 * 60_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY);
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
  const [loading, setLoading] = useState(true);
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    Promise.all([listCustomers(supabase, restaurantId), getCustomerConsumptionStats(supabase, restaurantId)]).then(
      ([c, cons]) => {
        setCustomers(c);
        setConsumption(cons);
        setLoading(false);
      },
    );
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
