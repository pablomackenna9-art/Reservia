import { useEffect, useState } from "react";
import { addOpeningHours, listOpeningHours, removeOpeningHours } from "@reservia/api-client";
import { DAY_NAMES_ES, type OpeningHours } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { inputClass } from "../../components/ui";

// Lunes primero (en la base 0 = domingo).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Horario de ATENCIÓN del local: es lo que la página pública muestra como "Abierto hasta las…". */
export function OpeningHoursEditor({ restaurantId, onChanged }: { restaurantId: string; onChanged: () => void }) {
  const [hours, setHours] = useState<OpeningHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number[]>(DAY_ORDER);
  const [label, setLabel] = useState("Almuerzo");
  const [opensAt, setOpensAt] = useState("12:30");
  const [closesAt, setClosesAt] = useState("18:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setHours(await listOpeningHours(supabase, restaurantId));
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function toggleDay(d: number) {
    setDays((current) => (current.includes(d) ? current.filter((x) => x !== d) : [...current, d]));
  }

  async function add() {
    if (days.length === 0) return setError("Elige al menos un día.");
    if (!opensAt || !closesAt) return setError("Pon la hora de apertura y de cierre.");
    setSaving(true);
    setError(null);
    try {
      await addOpeningHours(supabase, { restaurantId, days, label: label.trim() || "Atención", opensAt: `${opensAt}:00`, closesAt: `${closesAt}:00` });
      await reload();
      onChanged();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await removeOpeningHours(supabase, id);
    await reload();
    onChanged();
  }

  if (loading) return <p className="text-[15px] text-ink-muted">Cargando…</p>;

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-ink-muted max-w-2xl">
        Es el horario real del local, el que ve el cliente arriba de la página: «Abierto hasta las 18:00 · Reabrimos a las 19:00». Si abres corrido (sin pausa
        entre almuerzo y cena), crea un solo tramo y no aparecerá «Reabrimos». Si cierras pasada la medianoche, pon la hora real de cierre (ej. 02:00).
      </p>

      <div className="rounded-2xl bg-surface divide-y divide-line">
        {DAY_ORDER.map((day) => {
          const services = hours.filter((h) => h.dayOfWeek === day);
          return (
            <div key={day} className="flex items-start gap-3 px-4 py-3">
              <span className="w-24 text-[15px] text-ink-muted shrink-0 pt-1">{DAY_NAMES_ES[day]}</span>
              <div className="flex-1 flex flex-wrap gap-2">
                {services.length === 0 ? (
                  <span className="text-[13px] text-ink-faint pt-1.5">Cerrado</span>
                ) : (
                  services.map((h) => (
                    <span key={h.id} className="inline-flex items-center gap-1.5 h-9 rounded-full bg-ground border border-line pl-3 pr-1 text-[13px]">
                      {h.label} · {h.opensAt.slice(0, 5)}–{h.closesAt.slice(0, 5)}
                      <button
                        onClick={() => remove(h.id)}
                        aria-label={`Quitar ${h.label} del ${DAY_NAMES_ES[day]}`}
                        className="w-7 h-7 rounded-full text-ink-faint hover:text-status-occupied"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-surface p-4 space-y-4">
        <p className="text-[15px] font-semibold">Agregar tramo de atención</p>
        <div>
          <p className="text-[13px] text-ink-faint mb-1.5">Días</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`h-10 px-3 rounded-[10px] text-sm font-semibold ${days.includes(d) ? "bg-ink text-ground" : "bg-surface-2 text-ink-muted"}`}
              >
                {(DAY_NAMES_ES[d] ?? "").slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Nombre</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Almuerzo" className={inputClass} />
          </div>
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Abre</label>
            <input type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Cierra</label>
            <input type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <p className="text-[15px] text-status-occupied">{error}</p>}
        <button onClick={add} disabled={saving} className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-60">
          {saving ? "Guardando…" : "Agregar a los días elegidos"}
        </button>
      </div>
    </div>
  );
}
