import { useEffect, useMemo, useRef, useState } from "react";
import { formatCLP, minutesSince, requestTotal, type MenuStation, type TableRequest } from "@reservia/core";
import { SegTabs } from "../../components/ui";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { beep, useTableRequests } from "./useTableRequests";

const STATION_KEY = "reservia.station";
const SOUND_KEY = "reservia.station.sound";

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Pantalla de cocina y barra: solo los pedidos de los clientes, en tarjetas por mesa. Cada estación ve solo lo suyo
 * (los platos de Bebidas van a barra, el resto a cocina, según la categoría). Nuevo → Preparando → Listo.
 */
export function CocinaBarraPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;
  const { requests, loading, error, setStatus, labelOf, zoneNameOf } = useTableRequests(restaurantId, 5000);
  const [station, setStation] = useState<MenuStation>(() => readStored<MenuStation>(STATION_KEY, "cocina", ["cocina", "barra"]));
  const [sound, setSound] = useState(() => readStored(SOUND_KEY, "on", ["on", "off"]) === "on");
  const [, tick] = useState(0);

  // Los minutos de cada tarjeta se actualizan solos.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const orders = useMemo(() => requests.filter((r) => r.kind === "order"), [requests]);
  const mine = orders.filter((r) => r.station === station || (!r.station && station === "cocina"));
  const countOf = (s: MenuStation) => orders.filter((r) => r.station === s || (!r.station && s === "cocina")).filter((r) => r.status === "pending").length;

  const pending = mine.filter((r) => r.status === "pending").sort(byAge);
  const preparing = mine.filter((r) => r.status === "preparing").sort(byAge);
  const ready = mine.filter((r) => r.status === "ready").sort(byAge);

  // Pitido cuando llega un pedido nuevo a esta estación (y no en la primera carga).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const ids = new Set(pending.map((r) => r.id));
    if (seen.current && sound && [...ids].some((id) => !seen.current!.has(id))) beep();
    seen.current = ids;
  }, [pending.map((r) => r.id).join(","), loading, sound]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickStation(s: MenuStation) {
    setStation(s);
    seen.current = null;
    try {
      localStorage.setItem(STATION_KEY, s);
    } catch {
      // sin almacenamiento
    }
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next) beep();
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // sin almacenamiento
    }
  }

  if (!restaurantId) return null;

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="font-serif text-4xl font-normal leading-tight mr-auto">{station === "cocina" ? "Cocina" : "Barra"}</h1>
        <SegTabs
          value={station}
          onChange={pickStation}
          options={[
            { value: "cocina", label: `Cocina${countOf("cocina") ? ` · ${countOf("cocina")}` : ""}` },
            { value: "barra", label: `Barra${countOf("barra") ? ` · ${countOf("barra")}` : ""}` },
          ]}
        />
        <button onClick={toggleSound} aria-pressed={sound} className={`h-11 px-4 rounded-[10px] text-[15px] font-semibold ${sound ? "bg-accent text-accent-ink" : "bg-surface-2"}`}>
          {sound ? "Sonido activado" : "Sonido apagado"}
        </button>
      </div>

      {error && (
        <p className="text-[15px] text-status-occupied mb-3">
          {error}. Si es lo primero que ves, falta aplicar las migraciones 0037 y 0038 en Supabase.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Column title="Nuevos" tone="new" empty="Sin pedidos nuevos." requests={pending}>
          {(r) => <Ticket r={r} label={labelOf(r.tableId)} zone={zoneNameOf(r.tableId)} actionLabel="Empezar" onAction={() => setStatus(r.id, "preparing")} onCancel={() => setStatus(r.id, "cancelled")} />}
        </Column>
        <Column title="Preparando" tone="doing" empty="Nada en preparación." requests={preparing}>
          {(r) => <Ticket r={r} label={labelOf(r.tableId)} zone={zoneNameOf(r.tableId)} actionLabel="Listo para servir" onAction={() => setStatus(r.id, "ready")} onBack={() => setStatus(r.id, "pending")} />}
        </Column>
        <Column title="Listos" tone="done" empty="Nada esperando al garzón." requests={ready}>
          {(r) => <Ticket r={r} label={labelOf(r.tableId)} zone={zoneNameOf(r.tableId)} actionLabel="Entregado" onAction={() => setStatus(r.id, "done")} onBack={() => setStatus(r.id, "preparing")} waiting />}
        </Column>
      </div>
    </div>
  );
}

const byAge = (a: TableRequest, b: TableRequest) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

function Column({ title, tone, empty, requests, children }: { title: string; tone: "new" | "doing" | "done"; empty: string; requests: TableRequest[]; children: (r: TableRequest) => React.ReactNode }) {
  const dot = tone === "new" ? "bg-status-occupied" : tone === "doing" ? "bg-status-arriving" : "bg-status-available";
  return (
    <section className="rounded-2xl bg-surface p-3 sm:p-4 min-h-[180px]">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint mb-3">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        {title}
        <span className="tabular-nums">{requests.length}</span>
      </h2>
      {requests.length === 0 ? <p className="text-[15px] text-ink-faint py-6 text-center">{empty}</p> : <ul className="space-y-3">{requests.map((r) => <li key={r.id}>{children(r)}</li>)}</ul>}
    </section>
  );
}

function Ticket({
  r,
  label,
  zone,
  actionLabel,
  onAction,
  onBack,
  onCancel,
  waiting,
}: {
  r: TableRequest;
  label: string;
  zone: string;
  actionLabel: string;
  onAction: () => void;
  onBack?: () => void;
  onCancel?: () => void;
  waiting?: boolean;
}) {
  const mins = Math.max(0, minutesSince(r.createdAt));
  const late = r.status !== "ready" && mins >= 15;
  return (
    <article className={`rounded-xl bg-surface-2 p-3.5 border-2 ${late ? "border-status-occupied" : "border-transparent"}`}>
      <header className="flex items-baseline justify-between gap-2">
        <p className="font-serif text-[34px] leading-none">Mesa {label}</p>
        <p className={`text-[14px] font-semibold tabular-nums ${late ? "text-status-occupied" : "text-ink-faint"}`}>hace {mins} min</p>
      </header>
      {zone && <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint mt-0.5">{zone}</p>}
      <ul className="mt-3 space-y-2">
        {r.items.map((i, idx) => (
          <li key={idx} className="text-[17px] leading-snug">
            <span className="font-bold tabular-nums">{i.qty}×</span> {i.name}
            {i.variant && <span className="text-ink-muted"> · {i.variant}</span>}
            {i.note && <span className="mt-0.5 block rounded bg-status-arriving/15 px-2 py-1 text-[15px] font-semibold text-status-arriving">⚠ {i.note}</span>}
          </li>
        ))}
      </ul>
      {r.note && <p className="mt-2 rounded bg-status-arriving/15 px-2 py-1 text-[15px] font-semibold text-status-arriving">⚠ {r.note}</p>}
      <p className="mt-2 text-[12px] text-ink-faint tabular-nums">{formatCLP(requestTotal(r.items))}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onAction} className="h-12 flex-1 min-w-[140px] rounded-[10px] bg-accent text-accent-ink text-[16px] font-semibold active:scale-[0.98] transition-transform">
          {actionLabel}
        </button>
        {onBack && (
          <button onClick={onBack} className="h-12 px-3 rounded-[10px] bg-surface-3 text-[14px] font-semibold" aria-label="Devolver al paso anterior">
            ↩
          </button>
        )}
        {onCancel && (
          <button
            onClick={() => {
              if (confirm(`¿Cancelar el pedido de la mesa ${label}?`)) onCancel();
            }}
            className="h-12 px-3 rounded-[10px] text-[14px] font-semibold text-status-occupied"
          >
            Cancelar
          </button>
        )}
      </div>
      {waiting && <p className="mt-2 text-[13px] text-status-available font-semibold">Esperando al garzón</p>}
    </article>
  );
}
