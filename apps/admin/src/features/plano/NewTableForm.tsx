import { useState, type FormEvent } from "react";
import { createTable } from "@reservia/api-client";
import type { Table, Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";

const SHAPES: { value: Table["shape"]; label: string }[] = [
  { value: "round", label: "Redonda" },
  { value: "square", label: "Cuadrada" },
  { value: "rectangle", label: "Rectangular" },
];

export function NewTableForm({
  restaurantId,
  zones,
  defaultZoneId,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  zones: Zone[];
  defaultZoneId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [zoneId, setZoneId] = useState(defaultZoneId);
  const [name, setName] = useState("");
  const [shape, setShape] = useState<Table["shape"]>("square");
  const [capacity, setCapacity] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) return;

    setSubmitting(true);
    setError(null);
    try {
      const unit = Math.min(zone.width, zone.height) / 8;
      const sizeMult = capacity <= 2 ? 0.75 : capacity <= 4 ? 1 : capacity <= 6 ? 1.25 : 1.5;
      await createTable(supabase, {
        restaurantId,
        zoneId,
        name: name.trim(),
        shape,
        capacityMin: Math.max(1, capacity - 2),
        capacityMax: capacity,
        positionX: 50,
        positionY: 50,
        width: shape === "rectangle" ? unit * sizeMult * 1.4 : unit * sizeMult,
        height: unit * sizeMult,
      });
      onCreated();
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos crear la mesa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5"
      >
        <h2 className="text-lg font-semibold mb-1">Nueva mesa</h2>
        <p className="text-xs text-ink-faint mb-4">Aparece en el centro de la zona — arrástrala a su lugar.</p>

        <label className="block text-sm text-ink-muted mb-1">Zona</label>
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>

        <label className="block text-sm text-ink-muted mb-1">Nombre / número</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="18"
          className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-sm text-ink-muted mb-1">Forma</label>
            <select
              value={shape}
              onChange={(e) => setShape(e.target.value as Table["shape"])}
              className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-ink-muted mb-1">Capacidad</label>
            <input
              type="number"
              min={1}
              max={30}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Creando…" : "Crear mesa"}
          </button>
        </div>
      </form>
    </div>
  );
}
