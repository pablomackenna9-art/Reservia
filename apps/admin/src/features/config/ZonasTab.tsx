import { useEffect, useState } from "react";
import { createZone, deactivateZone, listZones, renameZone } from "@reservia/api-client";
import type { Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";

export function ZonasTab({ restaurantId }: { restaurantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function reload() {
    setZones(await listZones(supabase, restaurantId));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    await createZone(supabase, { restaurantId, name: newName.trim(), sortOrder: zones.length });
    setNewName("");
    setCreating(false);
    reload();
  }

  async function handleRename(id: string, name: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
    await renameZone(supabase, id, name);
  }

  async function handleDeactivate(id: string) {
    if (!confirm("¿Eliminar esta zona? Las mesas que tenga dejan de aparecer en el plano.")) return;
    await deactivateZone(supabase, id);
    reload();
  }

  if (loading) return <p className="text-sm text-ink-muted">Cargando…</p>;

  return (
    <div className="max-w-xl">
      <p className="text-sm text-ink-muted mb-4">
        Salón, terraza, barra, privado — cualquier cantidad. El editor de mesas dentro de cada zona está en{" "}
        <span className="text-ink">Plano de mesas → Editar plano</span>.
      </p>

      <div className="rounded-xl border border-line bg-surface divide-y divide-line mb-4">
        {zones.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Todavía no hay zonas.</p>
        ) : (
          zones
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((zone) => (
              <div key={zone.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  defaultValue={zone.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== zone.name && handleRename(zone.id, e.target.value.trim())}
                  className="flex-1 bg-transparent text-sm outline-none focus:text-accent"
                />
                <button
                  onClick={() => handleDeactivate(zone.id)}
                  className="text-xs text-ink-faint hover:text-status-occupied"
                >
                  Eliminar
                </button>
              </div>
            ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Nombre de la nueva zona"
          className="flex-1 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
