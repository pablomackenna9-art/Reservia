import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { listTableQrTokens, listTables, listZones } from "@reservia/api-client";
import { buildTableGroups, compareTableNames, type Table, type Zone } from "@reservia/core";
import { SegTabs } from "../../components/ui";
import { tableQrUrl } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

/**
 * Un QR por MESA FÍSICA para imprimir y pegar. El código apunta a la mesa, no a su número: si después se
 * renumera, se pega o se separa una mesa, el QR ya impreso sigue funcionando.
 */
export function QrMesasPage() {
  const { current } = useRestaurant();
  const restaurant = current?.restaurant;
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tokens, setTokens] = useState<Map<string, string>>(new Map());
  const [qrs, setQrs] = useState<Map<string, string>>(new Map());
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurant) return;
    setLoading(true);
    Promise.all([listZones(supabase, restaurant.id), listTables(supabase, restaurant.id), listTableQrTokens(supabase, restaurant.id)])
      .then(([z, t, tok]) => {
        setZones(z);
        setTables(t.filter((x) => x.active));
        setTokens(tok);
        setError(null);
      })
      .catch((err) => setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudieron cargar las mesas."))
      .finally(() => setLoading(false));
  }, [restaurant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        [...tokens.entries()].map(async ([tableId, token]) => [tableId, await QRCode.toDataURL(tableQrUrl(token), { margin: 1, width: 420, errorCorrectionLevel: "M" })] as const),
      );
      if (!cancelled) setQrs(new Map(entries));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const { byTable } = useMemo(() => buildTableGroups(tables, zones), [tables, zones]);
  const visible = useMemo(
    () =>
      tables
        .filter((t) => zoneFilter === "all" || t.zoneId === zoneFilter)
        .map((t) => ({ table: t, label: byTable.get(t.id)?.label ?? t.name }))
        .sort((a, b) => compareTableNames(a.label, b.label) || compareTableNames(a.table.name, b.table.name)),
    [tables, zoneFilter, byTable],
  );

  if (!restaurant) return null;

  return (
    <div className="p-3 sm:p-6">
      <div className="print:hidden">
        <h1 className="font-serif text-4xl font-normal leading-tight">QR de las mesas</h1>
        <p className="text-[15px] text-ink-muted mt-1 mb-4 max-w-2xl">
          Imprime un QR por mesa. Al escanearlo, el cliente ve tu carta, pide con notas ("sin ajo"), llama al mozo o pide la cuenta. El QR es de la mesa física: si después cambias su número o la pegas a otra, el
          mismo papel sigue funcionando.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {zones.length > 1 && (
            <SegTabs value={zoneFilter} onChange={setZoneFilter} options={[{ value: "all", label: "Todas" }, ...zones.map((z) => ({ value: z.id, label: z.name }))]} />
          )}
          <button onClick={() => window.print()} disabled={qrs.size === 0} className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-50">
            Imprimir {zoneFilter === "all" ? "todas" : "esta zona"}
          </button>
        </div>
        {error && (
          <p className="text-[15px] text-status-occupied mb-3">
            {error}. Si es lo primero que ves, falta aplicar la migración 0037 en Supabase.
          </p>
        )}
        {loading && <p className="text-ink-muted">Cargando…</p>}
        {!loading && !error && tokens.size === 0 && <p className="text-ink-muted">Todavía no hay códigos: aplica la migración 0037 en Supabase.</p>}
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 print:grid-cols-3 print:gap-4">
        {visible.map(({ table, label }) => (
          <li key={table.id} className="break-inside-avoid rounded-2xl bg-surface p-4 text-center print:rounded-none print:border print:border-black print:bg-white print:text-black">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-faint print:text-black/60 truncate">{restaurant.name}</p>
            <p className="font-serif text-[44px] leading-none my-1">Mesa {label}</p>
            {qrs.get(table.id) ? <img src={qrs.get(table.id)} alt={`QR de la mesa ${label}`} className="mx-auto w-full max-w-[200px] rounded-lg bg-white" /> : <div className="mx-auto aspect-square w-full max-w-[200px] rounded-lg bg-ground" />}
            <p className="mt-2 text-[13px] font-semibold">Escanea para ver la carta y pedir</p>
            {table.layoutId && <p className="text-[11px] text-ink-faint print:text-black/50">módulo {table.name}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
