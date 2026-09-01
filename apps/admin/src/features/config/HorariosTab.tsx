import { useEffect, useState } from "react";
import { addHours, listHours, removeHours } from "@reservia/api-client";
import { DAY_NAMES_ES, type RestaurantHours } from "@reservia/core";
import { supabase } from "../../lib/supabase";

export function HorariosTab({ restaurantId }: { restaurantId: string }) {
  const [hours, setHours] = useState<RestaurantHours[]>([]);
  const [loading, setLoading] = useState(true);

  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [serviceName, setServiceName] = useState("Cena");
  const [opensAt, setOpensAt] = useState("19:00");
  const [closesAt, setClosesAt] = useState("23:30");
  const [creating, setCreating] = useState(false);

  async function reload() {
    setHours(await listHours(supabase, restaurantId));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleAdd() {
    setCreating(true);
    await addHours(supabase, { restaurantId, dayOfWeek, serviceName, opensAt: `${opensAt}:00`, closesAt: `${closesAt}:00` });
    setCreating(false);
    reload();
  }

  async function handleRemove(id: string) {
    await removeHours(supabase, id);
    reload();
  }

  if (loading) return <p className="text-sm text-ink-muted">Cargando…</p>;

  const byDay = DAY_NAMES_ES.map((name, day) => ({
    day,
    name,
    services: hours.filter((h) => h.dayOfWeek === day),
  }));

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink-muted mb-4">
        Los turnos que cargues acá son los que usa el motor de disponibilidad para saber cuándo se puede reservar.
      </p>

      <div className="rounded-xl border border-line bg-surface divide-y divide-line mb-5">
        {byDay.map(({ day, name, services }) => (
          <div key={day} className="flex items-start gap-4 px-4 py-3">
            <span className="w-24 text-sm text-ink-muted shrink-0 pt-0.5">{name}</span>
            <div className="flex-1 flex flex-wrap gap-2">
              {services.length === 0 ? (
                <span className="text-xs text-ink-faint pt-0.5">Cerrado</span>
              ) : (
                services.map((h) => (
                  <span
                    key={h.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ground border border-line px-2.5 py-1 text-xs"
                  >
                    {h.serviceName} · {h.opensAt.slice(0, 5)}–{h.closesAt.slice(0, 5)}
                    <button onClick={() => handleRemove(h.id)} className="text-ink-faint hover:text-status-occupied">
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-medium mb-3">Agregar turno</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Día</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              {DAY_NAMES_ES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Turno</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="Cena"
              className="w-full rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Abre</label>
            <input
              type="time"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="w-full rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Cierra</label>
            <input
              type="time"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={creating || !serviceName.trim()}
          className="mt-3 rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Agregar turno
        </button>
      </div>
    </div>
  );
}
