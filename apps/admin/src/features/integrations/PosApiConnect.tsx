import { useCallback, useEffect, useState } from "react";
import {
  generatePosApiKey,
  getPosApiConnection,
  listPosIngestLog,
  listPosTableMappings,
  listTables,
  removePosTableMapping,
  revokePosApiKey,
  sendPosApiTest,
  setPosTableMapping,
  type PosIngestLogEntry,
} from "@reservia/api-client";
import { compareTableNames, type PosConnection, type PosTableMapping, type Table } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { POS_API_URL } from "../../lib/config";
import { CopyButton, SegTabs } from "../../components/ui";

type GuideTab = "proveedor" | "make" | "curl" | "link";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "hace unos segundos";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function snippets(key: string) {
  const minimal = `{\n  "check_id": "1042",\n  "table": "12",\n  "total": 45900\n}`;
  const full = `{\n  "check_id": "1042",\n  "table": "12",\n  "status": "paid",\n  "total": 45900,\n  "guests": 4,\n  "items": [\n    { "name": "Lomo vetado", "quantity": 2, "price": 12900 },\n    { "name": "Vino", "quantity": 1, "price": 20100 }\n  ]\n}`;

  const proveedor = `Hola, necesitamos que nuestro sistema de ventas (POS) envíe cada cuenta a Reservia, para ver en vivo qué mesas están consumiendo y pagando.

Es una llamada HTTP POST con un JSON, cada vez que cambia una cuenta:

• URL: ${POS_API_URL}
• Header: Authorization: Bearer ${key}
• Content-Type: application/json
• Cuerpo mínimo:
${minimal}

Enviarla cuando se abre la cuenta (status "open"), cuando se pide la cuenta (status "bill") y cuando se paga (status "paid").
Campos opcionales: items (detalle), guests (comensales), status ("cancelled" si se anula).

Para probar que la URL y la clave funcionan, basta abrir en el navegador:
${POS_API_URL}?key=${key}`;

  const make = `En Make, Zapier o n8n agrega un módulo "HTTP / Webhook → Hacer una solicitud" con:

• URL: ${POS_API_URL}
• Método: POST
• Header: Authorization = Bearer ${key}
• Tipo de cuerpo: JSON
• Cuerpo:
${minimal}

Reemplaza "1042", "12" y 45900 por los datos que entrega tu sistema (número de cuenta, mesa y total).
Úsalo en el paso que ocurre cuando se abre, se pide o se paga una cuenta, y agrega "status": "paid" cuando es el pago.`;

  const curl = `curl -X POST "${POS_API_URL}" \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"check_id":"1042","table":"12","total":45900,"status":"open"}'`;

  const link = `${POS_API_URL}?key=${key}&check_id=1042&table=12&total=45900&status=paid

Para sistemas que solo saben abrir un link cuando pasa algo.
Cambia check_id, table, total y status por las variables de tu sistema.
status puede ser: open (abierta), bill (cuenta pedida), paid (pagada) o cancelled (anulada).`;

  return { minimal, full, proveedor, make, curl, link };
}

export function PosApiConnect({ restaurantId }: { restaurantId: string }) {
  const [connection, setConnection] = useState<PosConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<PosIngestLogEntry[]>([]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [guideTab, setGuideTab] = useState<GuideTab>("proveedor");
  const [showMapping, setShowMapping] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [conn, entries] = await Promise.all([
        getPosApiConnection(supabase, restaurantId),
        listPosIngestLog(supabase, restaurantId, 20),
      ]);
      setConnection(conn);
      setLog(entries);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  function handleGenerate() {
    if (connection && !confirm("Vas a regenerar la clave. La anterior deja de funcionar y tendrás que actualizarla en tu POS. ¿Continuar?")) return;
    run(async () => {
      const result = await generatePosApiKey(supabase, restaurantId);
      setRevealedKey(result.apiKey);
      setShowKeyModal(true);
    });
  }

  function handleRevoke() {
    if (!confirm("¿Desconectar? Tu POS deja de poder enviar cuentas hasta que generes una clave nueva.")) return;
    run(async () => {
      await revokePosApiKey(supabase, restaurantId);
      setRevealedKey(null);
    });
  }

  function handleTest() {
    setTestSent(false);
    run(async () => {
      await sendPosApiTest(supabase, restaurantId);
      setTestSent(true);
    });
  }

  const key = revealedKey ?? "TU_CLAVE";
  const code = snippets(key);
  const guideText = { proveedor: code.proveedor, make: code.make, curl: code.curl, link: code.link }[guideTab];

  const lastEventMs = connection?.lastEventAt ? Date.now() - new Date(connection.lastEventAt).getTime() : null;
  const state: { label: string; tone: "idle" | "wait" | "ok" | "stale" } = !connection
    ? { label: "Sin conectar", tone: "idle" }
    : lastEventMs === null
      ? { label: "Esperando la primera señal de tu sistema…", tone: "wait" }
      : lastEventMs < 10 * 60_000
        ? { label: `Conectado · última señal ${timeAgo(connection.lastEventAt!)}`, tone: "ok" }
        : { label: `Sin señal ${timeAgo(connection.lastEventAt!)}`, tone: "stale" };

  const toneClass = {
    idle: "text-ink-muted bg-surface-2",
    wait: "text-status-arriving bg-status-arriving/15",
    ok: "text-status-available bg-status-available/15",
    stale: "text-status-arriving bg-status-arriving/15",
  }[state.tone];

  return (
    <section className="rounded-2xl bg-surface p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-tight">Conecta tu POS o sistema de ventas</h2>
          <p className="text-[15px] text-ink-muted mt-1 max-w-xl">
            Funciona con cualquier sistema que pueda enviar una cuenta por internet. Cuando se pide o se paga una cuenta, la mesa
            aparece como <span className="font-semibold text-ink">Pagando</span> en el plano y el consumo queda en la reserva.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 h-9 px-3 rounded-full text-[13px] font-semibold ${toneClass} shrink-0`}>
          <span className={`w-2 h-2 rounded-full bg-current ${state.tone === "wait" ? "animate-pulse" : ""}`} />
          {state.label}
        </span>
      </div>

      {loading ? null : !connection ? (
        <div className="mt-5">
          <ol className="text-[15px] text-ink-muted space-y-1.5 mb-5 list-decimal list-inside">
            <li>Genera una clave de conexión (un clic).</li>
            <li>Copia el mensaje listo y envíaselo a quien administra tu POS, o pégalo en Make / Zapier.</li>
            <li>Haz una prueba: aquí abajo verás en vivo todo lo que llegue.</li>
          </ol>
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="h-12 px-6 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60"
          >
            {busy ? "Generando…" : "Generar clave de conexión"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl bg-surface-2 p-4">
            <p className="text-[13px] text-ink-faint">Clave de conexión</p>
            <p className="font-mono text-[17px] mt-1 break-all">
              {connection.apiKeyPrefix}
              <span className="text-ink-faint">••••••••••••••••••••••••••••••••••••••••</span>
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={handleTest}
                disabled={busy}
                className="h-11 px-4 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-60"
              >
                Probar conexión
              </button>
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="h-11 px-4 rounded-[10px] bg-surface-3 text-[15px] font-semibold disabled:opacity-60"
              >
                Regenerar clave
              </button>
              <button
                onClick={handleRevoke}
                disabled={busy}
                className="h-11 px-4 rounded-[10px] bg-status-occupied/15 text-status-occupied text-[15px] font-semibold disabled:opacity-60"
              >
                Desconectar
              </button>
            </div>
            {testSent && <p className="text-[13px] text-status-available mt-2">Evento de prueba enviado: míralo en "Lo que ha llegado".</p>}
          </div>

          <div>
            <h3 className="text-[15px] font-semibold mb-2">Cómo conectarlo</h3>
            {!revealedKey && (
              <p className="text-[13px] text-ink-faint mb-2">
                Por seguridad la clave completa solo se muestra al generarla. Si la perdiste, regenérala; mientras tanto, en los
                ejemplos aparece <span className="font-mono">TU_CLAVE</span>.
              </p>
            )}
            <SegTabs
              tone="surface-2"
              value={guideTab}
              onChange={setGuideTab}
              options={[
                { value: "proveedor", label: "Mensaje para tu proveedor" },
                { value: "make", label: "Make / Zapier / n8n" },
                { value: "curl", label: "curl" },
                { value: "link", label: "Solo un link" },
              ]}
            />
            <pre className="mt-3 rounded-xl bg-ground p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-80 overflow-y-auto">
              {guideText}
            </pre>
            <div className="flex flex-wrap gap-2 mt-2">
              <CopyButton text={guideText} label="Copiar este texto" />
              <CopyButton text={POS_API_URL} label="Copiar solo la URL" />
            </div>
            <p className="text-[13px] text-ink-faint mt-3">
              Solo hace falta <span className="font-mono">check_id</span>. Lo demás es opcional: <span className="font-mono">table</span>,{" "}
              <span className="font-mono">total</span>, <span className="font-mono">status</span> (open, bill, paid, cancelled),{" "}
              <span className="font-mono">items</span> y <span className="font-mono">guests</span>. Acepta también los nombres en español
              (mesa, cuenta, monto, estado).
            </p>
          </div>

          <div>
            <button onClick={() => setShowMapping((v) => !v)} className="text-[15px] font-semibold text-accent">
              {showMapping ? "▾" : "▸"} Mesas con otro nombre en tu POS
            </button>
            {showMapping && <TableMapping restaurantId={restaurantId} connectionId={connection.id} />}
          </div>

          <div>
            <h3 className="text-[15px] font-semibold mb-2">Lo que ha llegado</h3>
            {log.length === 0 ? (
              <p className="text-[15px] text-ink-faint">Todavía nada. Aparece aquí al instante apenas tu sistema (o la prueba) envíe algo.</p>
            ) : (
              <ul className="space-y-1.5">
                {log.map((entry) => {
                  const warn = entry.ok && entry.message?.includes("No encontramos la mesa");
                  return (
                    <li
                      key={entry.id}
                      className={`rounded-[10px] px-3 py-2 text-[13px] flex gap-3 ${
                        !entry.ok ? "bg-status-occupied/10" : warn ? "bg-status-arriving/10" : "bg-surface-2"
                      }`}
                    >
                      <span className="tabular-nums text-ink-faint shrink-0">{clock(entry.receivedAt)}</span>
                      <span className={`shrink-0 font-bold ${!entry.ok ? "text-status-occupied" : warn ? "text-status-arriving" : "text-status-available"}`}>
                        {!entry.ok ? "✕" : warn ? "!" : "✓"}
                      </span>
                      <span className="min-w-0 break-words">
                        {entry.isTest && <span className="font-semibold text-ink-muted">[prueba] </span>}
                        {entry.message ?? "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[15px] text-status-occupied mt-4">{error}</p>}

      {showKeyModal && revealedKey && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center px-4" onClick={() => setShowKeyModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-surface p-5 max-h-[90dvh] overflow-y-auto"
          >
            <h3 className="font-serif text-3xl leading-tight">Tu clave de conexión</h3>
            <p className="text-[15px] text-status-arriving font-semibold mt-2">
              Cópiala ahora: por seguridad no se vuelve a mostrar completa.
            </p>

            <p className="text-[13px] text-ink-faint mt-4 mb-1">Clave</p>
            <p className="font-mono text-[15px] bg-ground rounded-[10px] p-3 break-all">{revealedKey}</p>
            <CopyButton text={revealedKey} label="Copiar clave" className="mt-2" />

            <p className="text-[13px] text-ink-faint mt-4 mb-1">URL a la que se envían las cuentas</p>
            <p className="font-mono text-[15px] bg-ground rounded-[10px] p-3 break-all">{POS_API_URL}</p>
            <CopyButton text={POS_API_URL} label="Copiar URL" className="mt-2" />

            <p className="text-[15px] text-ink-muted mt-4">
              Abajo, en "Cómo conectarlo", ya tienes un mensaje listo con todo esto para enviárselo a tu proveedor de POS.
            </p>
            <button
              onClick={() => setShowKeyModal(false)}
              className="w-full h-12 mt-5 rounded-[10px] bg-accent text-accent-ink text-base font-semibold"
            >
              Listo, ya la copié
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TableMapping({ restaurantId, connectionId }: { restaurantId: string; connectionId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [saved, setSaved] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    Promise.all([listTables(supabase, restaurantId), listPosTableMappings(supabase, connectionId)]).then(
      ([t, mappings]: [Table[], PosTableMapping[]]) => {
        setTables([...t].sort((a, b) => compareTableNames(a.name, b.name)));
        const map = new Map(mappings.map((m) => [m.tableId, m.externalTableId]));
        setSaved(map);
        setDraft(new Map(map));
      },
    );
  }, [restaurantId, connectionId]);

  async function commit(tableId: string) {
    const value = (draft.get(tableId) ?? "").trim();
    const before = saved.get(tableId) ?? "";
    if (value === before) return;
    if (value) await setPosTableMapping(supabase, { restaurantId, posConnectionId: connectionId, tableId, externalTableId: value });
    else await removePosTableMapping(supabase, connectionId, tableId);
    setSaved((prev) => new Map(prev).set(tableId, value));
  }

  return (
    <div className="mt-3">
      <p className="text-[13px] text-ink-faint mb-3">
        Si tu POS llama a las mesas igual que Reservia (12, "Mesa 12"…) no necesitas hacer nada. Si usa otro nombre (por ejemplo "T-04" para
        tu mesa 4), escríbelo al lado y se vincula solo.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tables.map((table) => (
          <li key={table.id} className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
            <span className="font-serif text-xl w-12 shrink-0">{table.name}</span>
            <input
              value={draft.get(table.id) ?? ""}
              onChange={(e) => setDraft((prev) => new Map(prev).set(table.id, e.target.value))}
              onBlur={() => commit(table.id)}
              placeholder="Nombre en tu POS"
              className="flex-1 min-w-0 h-10 rounded-[10px] bg-ground border border-line px-3 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
