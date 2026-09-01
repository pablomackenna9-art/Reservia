import { useEffect, useState, type ReactNode } from "react";
import { getReservationRules, updateReservationRules } from "@reservia/api-client";
import { DEFAULT_RESERVATION_RULES, type ReservationRules } from "@reservia/core";
import { supabase } from "../../lib/supabase";

export function ReglasTab({ restaurantId }: { restaurantId: string }) {
  const [rules, setRules] = useState<ReservationRules>({ restaurantId, ...DEFAULT_RESERVATION_RULES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getReservationRules(supabase, restaurantId).then((r) => {
      setRules(r);
      setLoading(false);
    });
  }, [restaurantId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await updateReservationRules(supabase, restaurantId, rules);
    setSaving(false);
    setSaved(true);
  }

  if (loading) return <p className="text-sm text-ink-muted">Cargando…</p>;

  return (
    <div className="max-w-md">
      <p className="text-sm text-ink-muted mb-4">
        Estos valores los usa el motor de disponibilidad — duración por defecto de una reserva, colchón entre
        reservas de la misma mesa, y con cuánta antelación se puede reservar.
      </p>

      <div className="space-y-4">
        <Field label="Duración por defecto (minutos)">
          <input
            type="number"
            min={15}
            value={rules.defaultDurationMinutes}
            onChange={(e) => setRules({ ...rules, defaultDurationMinutes: Number(e.target.value) })}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Colchón entre reservas (minutos)">
          <input
            type="number"
            min={0}
            value={rules.bufferMinutes}
            onChange={(e) => setRules({ ...rules, bufferMinutes: Number(e.target.value) })}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mínimo de personas">
            <input
              type="number"
              min={1}
              value={rules.minPartySize}
              onChange={(e) => setRules({ ...rules, minPartySize: Number(e.target.value) })}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          <Field label="Máximo de personas">
            <input
              type="number"
              min={1}
              value={rules.maxPartySize}
              onChange={(e) => setRules({ ...rules, maxPartySize: Number(e.target.value) })}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Antelación mínima (horas)">
            <input
              type="number"
              min={0}
              value={rules.minAdvanceHours}
              onChange={(e) => setRules({ ...rules, minAdvanceHours: Number(e.target.value) })}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          <Field label="Antelación máxima (días)">
            <input
              type="number"
              min={1}
              value={rules.maxAdvanceDays}
              onChange={(e) => setRules({ ...rules, maxAdvanceDays: Number(e.target.value) })}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
        </div>
        <Field label="Ticket promedio estimado ($/persona)">
          <input
            type="number"
            min={0}
            value={rules.averageTicketPerPerson}
            onChange={(e) => setRules({ ...rules, averageTicketPerPerson: Number(e.target.value) })}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rules.allowOnlineBooking}
            onChange={(e) => setRules({ ...rules, allowOnlineBooking: e.target.checked })}
          />
          Permitir reservas desde el portal público
        </label>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Guardando…" : saved ? "Guardado ✓" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-ink-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
