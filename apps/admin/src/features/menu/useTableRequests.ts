import { useEffect, useMemo, useRef, useState } from "react";
import { listOpenTableRequests, listTables, listZones, updateTableRequestStatus } from "@reservia/api-client";
import { buildTableGroups, type Table, type TableRequest, type TableRequestStatus, type Zone } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

/**
 * Los avisos y pedidos abiertos de los clientes (QR), al día cada pocos segundos, junto con las mesas para poder
 * decir "Mesa 7" con el mismo número que muestra el plano. Lo usan las pantallas de cocina/barra y de garzones.
 */
export function useTableRequests(restaurantId: string | undefined, pollMs = 5000) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);

  async function reload() {
    if (!restaurantId) return;
    try {
      setRequests(await listOpenTableRequests(supabase, restaurantId));
      setError(null);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!restaurantId) return;
    firstLoad.current = true;
    setLoading(true);
    Promise.all([listTables(supabase, restaurantId), listZones(supabase, restaurantId)])
      .then(([t, z]) => {
        setTables(t.filter((x) => x.active));
        setZones(z);
      })
      .catch(() => undefined);
    reload();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, pollMs]);

  const groups = useMemo(() => buildTableGroups(tables, zones), [tables, zones]);

  /** El número con que se ve esa mesa en el plano (mesas pegadas o separadas incluidas). */
  const labelOf = (tableId: string): string => groups.byTable.get(tableId)?.label ?? tables.find((t) => t.id === tableId)?.name ?? "?";
  const zoneNameOf = (tableId: string): string => zones.find((z) => z.id === tables.find((t) => t.id === tableId)?.zoneId)?.name ?? "";

  async function setStatus(requestId: string, status: TableRequestStatus) {
    // Se refleja al tiro (sin esperar la red) y se confirma con la respuesta.
    setRequests((prev) => (status === "done" || status === "cancelled" ? prev.filter((r) => r.id !== requestId) : prev.map((r) => (r.id === requestId ? { ...r, status } : r))));
    try {
      await updateTableRequestStatus(supabase, requestId, status, user?.id);
    } finally {
      await reload();
    }
  }

  return { requests, tables, zones, loading, error, reload, setStatus, labelOf, zoneNameOf };
}

/** Un pitido corto para avisar que llegó algo nuevo (el navegador solo lo permite después de que el usuario toque la página). */
export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (const [i, freq] of [880, 1175].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.15);
    }
    setTimeout(() => ctx.close(), 600);
  } catch {
    // sin audio: no pasa nada
  }
}
