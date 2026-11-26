import { useEffect, useMemo, useRef, useState } from "react";
import { formatCLP, minutesSince, requestTotal, TABLE_REQUEST_LABEL, type TableRequest } from "@reservia/core";
import { ZoneCanvas } from "../plano/ZoneCanvas";
import { useFloorPlan } from "../plano/useFloorPlan";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { beep, useTableRequests } from "./useTableRequests";

const SOUND_KEY = "reservia.waiters.sound";

/** Qué tiene que hacer el garzón con cada aviso o pedido. */
function taskOf(r: TableRequest): { title: string; action: string; next: "seen" | "done"; urgent: boolean } | null {
  if (r.kind === "order") {
    // Los pedidos solo le importan al garzón cuando ya están listos para llevar.
    if (r.status === "ready") return { title: `Llevar pedido de ${r.station === "barra" ? "barra" : "cocina"}`, action: "Entregado", next: "done", urgent: true };
    return null;
  }
  return { title: TABLE_REQUEST_LABEL[r.kind], action: "Listo", next: "done", urgent: r.kind === "waiter" || r.kind === "bill" };
}

/**
 * Pantalla de garzones: el plano de sala con una marca en cada mesa que necesita algo (la llaman, piden la cuenta,
 * o su pedido ya está listo para llevar) y la lista de tareas, de la más antigua a la más nueva.
 */
export function GarzonesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;
  const plan = useFloorPlan(restaurantId);
  const { requests, error, setStatus, labelOf } = useTableRequests(restaurantId, 5000);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const tasks = useMemo(
    () =>
      requests
        .map((r) => ({ r, task: taskOf(r) }))
        .filter((x): x is { r: TableRequest; task: NonNullable<ReturnType<typeof taskOf>> } => x.task !== null)
        .sort((a, b) => new Date(a.r.createdAt).getTime() - new Date(b.r.createdAt).getTime()),
    [requests],
  );
  const cooking = requests.filter((r) => r.kind === "order" && (r.status === "pending" || r.status === "preparing"));

  const countByTable = useMemo(() => {
    const map = new Map<string, number>();
    for (const { r } of tasks) map.set(r.tableId, (map.get(r.tableId) ?? 0) + 1);
    return map;
  }, [tasks]);

  // Pitido cuando aparece una tarea nueva.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.r.id));
    if (seen.current && sound && [...ids].some((id) => !seen.current!.has(id))) beep();
    seen.current = ids;
  }, [tasks.map((t) => t.r.id).join(","), sound]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const visibleTasks = selectedTableId ? tasks.filter((t) => t.r.tableId === selectedTableId) : tasks;

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="font-serif text-4xl font-normal leading-tight mr-auto">Garzones</h1>
        {selectedTableId && (
          <button onClick={() => setSelectedTableId(null)} className="h-11 px-4 rounded-[10px] bg-surface-2 text-[15px] font-semibold">
            Ver todas las mesas
          </button>
        )}
        <button onClick={toggleSound} aria-pressed={sound} className={`h-11 px-4 rounded-[10px] text-[15px] font-semibold ${sound ? "bg-accent text-accent-ink" : "bg-surface-2"}`}>
          {sound ? "Sonido activado" : "Sonido apagado"}
        </button>
      </div>
      {error && (
        <p className="text-[15px] text-status-occupied mb-3">
          {error}. Si es lo primero que ves, falta aplicar las migraciones 0037 y 0038 en Supabase.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="rounded-2xl bg-surface p-3 sm:p-4 h-[420px] sm:h-[560px] xl:h-[calc(100dvh-190px)] min-h-[420px] flex flex-col">
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-surface-2">
            {plan.zones.length === 0 ? (
              <div className="h-full grid place-items-center">
                <p className="text-[15px] text-ink-muted">{plan.loading ? "Cargando el plano…" : "Este restaurante todavía no tiene zonas."}</p>
              </div>
            ) : (
              <ZoneCanvas
                zones={plan.zones}
                tables={plan.tables}
                selectedTableId={selectedTableId}
                onSelectTable={setSelectedTableId}
                getTableStatus={plan.getTableStatus}
                getTableRequestCount={(id) => countByTable.get(id) ?? 0}
                decor={plan.decor}
              />
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl bg-surface p-3 sm:p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint mb-3">
              Para hacer <span className="tabular-nums">{visibleTasks.length}</span>
            </h2>
            {visibleTasks.length === 0 ? (
              <p className="text-[15px] text-ink-faint py-6 text-center">Todo al día. Cuando una mesa llame o un pedido esté listo, aparece aquí.</p>
            ) : (
              <ul className="space-y-2.5">
                {visibleTasks.map(({ r, task }) => {
                  const mins = Math.max(0, minutesSince(r.createdAt));
                  return (
                    <li key={r.id} className={`rounded-xl bg-surface-2 p-3 border-2 ${task.urgent && mins >= 5 ? "border-status-occupied" : "border-transparent"}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <button onClick={() => setSelectedTableId(r.tableId)} className="font-serif text-[28px] leading-none text-left">
                          Mesa {labelOf(r.tableId)}
                        </button>
                        <span className="text-[13px] tabular-nums text-ink-faint">hace {mins} min</span>
                      </div>
                      <p className="mt-1 text-[16px] font-semibold">{task.title}</p>
                      {r.kind === "order" && (
                        <ul className="mt-1.5 text-[14px] text-ink-muted">
                          {r.items.map((i, idx) => (
                            <li key={idx}>
                              {i.qty}× {i.name}
                              {i.variant ? ` (${i.variant})` : ""}
                            </li>
                          ))}
                          <li className="text-[12px] tabular-nums text-ink-faint">{formatCLP(requestTotal(r.items))}</li>
                        </ul>
                      )}
                      {r.note && r.kind !== "order" && <p className="mt-1 text-[14px] font-semibold text-status-arriving">“{r.note}”</p>}
                      <div className="mt-2.5 flex gap-2">
                        {r.kind !== "order" && r.status === "pending" && (
                          <button onClick={() => setStatus(r.id, "seen")} className="h-11 px-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold">
                            Voy
                          </button>
                        )}
                        <button onClick={() => setStatus(r.id, task.next)} className="h-11 flex-1 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold active:scale-[0.98] transition-transform">
                          {task.action}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {cooking.length > 0 && (
            <section className="rounded-2xl bg-surface p-3 sm:p-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint mb-2">
                En preparación <span className="tabular-nums">{cooking.length}</span>
              </h2>
              <ul className="space-y-1.5">
                {cooking.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[14px]">
                    <span>
                      <span className="font-semibold">Mesa {labelOf(r.tableId)}</span> · {r.station === "barra" ? "barra" : "cocina"} · {r.items.reduce((s, i) => s + i.qty, 0)} platos
                    </span>
                    <span className="text-ink-faint">{r.status === "preparing" ? "preparando" : "recién enviado"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
