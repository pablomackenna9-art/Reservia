import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRestaurantOverview, updateRestaurant, type MyRestaurant, type RestaurantOverview } from "@reservia/api-client";
import { slugify, type Restaurant } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { bookingUrlFor } from "../../lib/config";
import { CopyButton, Tag } from "../../components/ui";
import { useRestaurant } from "./RestaurantProvider";

const STATUS_LABEL: Record<Restaurant["status"], string> = {
  onboarding: "Configurando",
  active: "Activo",
  suspended: "Suspendido",
};

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

export function RestaurantesPage() {
  const { restaurants, current, selectRestaurant, isPlatformAdmin, refetch } = useRestaurant();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Map<string, RestaurantOverview>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all(restaurants.map(async (r) => [r.restaurant.id, await getRestaurantOverview(supabase, r.restaurant.id)] as const)).then(
      (entries) => {
        if (!cancelled) setOverview(new Map(entries));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [restaurants]);

  function open(id: string, path: string) {
    selectRestaurant(id);
    navigate(path);
  }

  const totals = {
    active: restaurants.filter((r) => r.restaurant.status === "active").length,
    reservationsToday: [...overview.values()].reduce((sum, o) => sum + o.reservationsToday, 0),
    posLive: [...overview.values()].filter((o) => o.posLastEventAt && Date.now() - new Date(o.posLastEventAt).getTime() < 10 * 60_000).length,
  };

  return (
    <div className="p-3 sm:p-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-serif text-4xl font-normal leading-tight">{isPlatformAdmin ? "Todos los restaurantes" : "Mis restaurantes"}</h1>
          <p className="text-[15px] text-ink-muted mt-1 max-w-2xl">
            {isPlatformAdmin
              ? "Estás viendo todos los restaurantes del sistema como administrador de plataforma. Desde aquí cambias su nombre y enlace, los publicas y conectas su POS."
              : "Los restaurantes que administras. Elige uno para abrir su panel, cambiar su nombre o conectar su POS."}
          </p>
        </div>
        <button
          onClick={() => navigate("/onboarding?nuevo=1")}
          className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold shrink-0"
        >
          + Nuevo restaurante
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line rounded-2xl overflow-hidden mb-5">
        <Summary label="Restaurantes" value={restaurants.length} />
        <Summary label="Con página publicada" value={totals.active} />
        <Summary label="Reservas hoy" value={totals.reservationsToday} />
        <Summary label="POS enviando datos" value={totals.posLive} />
      </div>

      <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {restaurants.map((entry) => (
          <RestaurantCard
            key={entry.restaurant.id}
            entry={entry}
            isCurrent={entry.restaurant.id === current?.restaurant.id}
            overview={overview.get(entry.restaurant.id)}
            isPlatformAdmin={isPlatformAdmin}
            onOpen={open}
            onSaved={refetch}
          />
        ))}
      </ul>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="font-serif text-[36px] leading-none mt-1.5">{value}</p>
    </div>
  );
}

function RestaurantCard({
  entry,
  isCurrent,
  overview,
  isPlatformAdmin,
  onOpen,
  onSaved,
}: {
  entry: MyRestaurant;
  isCurrent: boolean;
  overview: RestaurantOverview | undefined;
  isPlatformAdmin: boolean;
  onOpen: (id: string, path: string) => void;
  onSaved: () => Promise<void>;
}) {
  const { restaurant, role } = entry;
  const canEdit = role === "owner" || role === "administrator";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(restaurant.name);
  const [slug, setSlug] = useState(restaurant.slug);
  const [status, setStatus] = useState<Restaurant["status"]>(restaurant.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setName(restaurant.name);
    setSlug(restaurant.slug);
    setStatus(restaurant.status);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (!cleanName) return setError("El nombre no puede quedar vacío.");
    if (!/^[a-z0-9-]+$/.test(cleanSlug)) return setError("El nombre corto solo puede tener letras minúsculas, números y guiones.");
    if (cleanSlug !== restaurant.slug && !confirm("Si cambias el nombre corto, el enlace anterior de la página de reservas deja de funcionar. ¿Continuar?")) return;

    setSaving(true);
    setError(null);
    try {
      await updateRestaurant(supabase, restaurant.id, { name: cleanName, slug: cleanSlug, status });
      await onSaved();
      setEditing(false);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      setError(/duplicate|unique/i.test(message) ? "Ese nombre corto ya lo usa otro restaurante." : message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const url = bookingUrlFor(restaurant.slug);
  const posLive = overview?.posLastEventAt && Date.now() - new Date(overview.posLastEventAt).getTime() < 10 * 60_000;
  const statusTone =
    restaurant.status === "active" ? "text-status-available bg-status-available/15" : restaurant.status === "suspended" ? "text-status-occupied bg-status-occupied/15" : "text-status-arriving bg-status-arriving/15";

  return (
    <li className={`rounded-2xl bg-surface p-4 sm:p-5 ${isCurrent ? "outline outline-2 outline-accent" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[30px] leading-tight truncate">{restaurant.name}</h2>
          <p className="text-[13px] text-ink-faint mt-0.5 break-all">{url}</p>
        </div>
        <span className={`h-8 px-3 rounded-full inline-flex items-center text-[13px] font-semibold shrink-0 ${statusTone}`}>
          {STATUS_LABEL[restaurant.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {isCurrent && <Tag tone="accent">Viendo ahora</Tag>}
        <Tag>{role === "owner" ? "Dueño" : role === "administrator" ? "Administrador" : "Equipo"}</Tag>
      </div>

      <dl className="grid grid-cols-3 gap-2 mt-4">
        <Stat label="Mesas" value={overview ? String(overview.tableCount) : "…"} />
        <Stat label="Reservas hoy" value={overview ? String(overview.reservationsToday) : "…"} />
        <Stat
          label="POS"
          value={!overview ? "…" : posLive ? "En vivo" : overview.posKeyActive ? "Sin señal" : "No conectado"}
          tone={posLive ? "ok" : overview?.posKeyActive ? "warn" : "idle"}
          note={overview?.posLastEventAt ? timeAgo(overview.posLastEventAt) : undefined}
        />
      </dl>

      {!editing ? (
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => onOpen(restaurant.id, "/")} className="h-11 px-4 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold">
            Abrir panel
          </button>
          <button onClick={() => onOpen(restaurant.id, "/integraciones")} className="h-11 px-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold hover:bg-line">
            Conectar POS
          </button>
          <button onClick={() => onOpen(restaurant.id, "/pagina-de-reservas")} className="h-11 px-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold hover:bg-line">
            Página de reservas
          </button>
          <CopyButton text={url} label="Copiar enlace" />
          {canEdit && (
            <button onClick={startEditing} className="h-11 px-4 rounded-[10px] text-[15px] font-semibold text-accent">
              Editar nombre y enlace
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-surface-2 p-4 space-y-3">
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Nombre del restaurante</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 rounded-[10px] bg-ground border border-line px-3 text-[15px] outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Nombre corto del enlace</label>
            <input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="w-full h-11 rounded-[10px] bg-ground border border-line px-3 text-[15px] font-mono outline-none focus:border-accent"
            />
            <p className="text-[13px] text-ink-faint mt-1 break-all">{bookingUrlFor(slug || "…")}</p>
          </div>
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Estado de la página de reservas</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Restaurant["status"])}
              className="w-full h-11 rounded-[10px] bg-ground border border-line px-3 text-[15px] outline-none focus:border-accent"
            >
              <option value="onboarding">Configurando (no publicada)</option>
              <option value="active">Activo (publicada)</option>
              {(isPlatformAdmin || restaurant.status === "suspended") && <option value="suspended">Suspendido</option>}
            </select>
          </div>
          {error && <p className="text-[15px] text-status-occupied">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setEditing(false)} className="h-11 px-4 rounded-[10px] text-[15px] text-ink-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, tone = "idle", note }: { label: string; value: string; tone?: "ok" | "warn" | "idle"; note?: string }) {
  const color = tone === "ok" ? "text-status-available" : tone === "warn" ? "text-status-arriving" : "";
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 min-w-0">
      <dt className="text-[13px] text-ink-faint">{label}</dt>
      <dd className={`text-[17px] font-semibold mt-0.5 truncate ${color}`}>{value}</dd>
      {note && <dd className="text-[13px] text-ink-faint truncate">{note}</dd>}
    </div>
  );
}
