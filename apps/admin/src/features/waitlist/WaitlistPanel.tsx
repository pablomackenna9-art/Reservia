import { useEffect, useState } from "react";
import {
  addToWaitlist,
  createCustomer,
  createReservation,
  listAvailableTables,
  listWaitlist,
  searchCustomers,
  setWaitlistPriority,
  updateWaitlistEntry,
  updateWaitlistStatus,
  type WaitlistEntryWithCustomer,
} from "@reservia/api-client";
import type { Customer, Table } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

/** Mismo umbral que "Frecuente" en Notificaciones -- hace de proxy de "cliente favorito", no hay un flag propio todavía. */
const FREQUENT_VISITS_THRESHOLD = 5;
const ALL_STATUSES = ["waiting", "notified", "seated", "cancelled", "left"] as const;

function minutesWaiting(requestedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(requestedAt).getTime()) / 60_000));
}

/**
 * Lista de espera compartida entre el Centro de Control y la página propia
 * (`/lista-de-espera`) -- misma carga de datos, mismo orden, mismas acciones,
 * para no mantener dos implementaciones. Favoritos (clientes frecuentes)
 * arriba, canceladas/abandonadas en una sección aparte al final.
 */
export function WaitlistPanel({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuth();

  const [entries, setEntries] = useState<WaitlistEntryWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPartySize, setEditPartySize] = useState(2);
  const [editNotes, setEditNotes] = useState("");

  async function reload() {
    setEntries(await listWaitlist(supabase, restaurantId, [...ALL_STATUSES]));
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    const interval = setInterval(reload, 60_000); // keeps "esperando hace N min" honest without a manual refresh
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleNotify(id: string) {
    await updateWaitlistStatus(supabase, id, "notified");
    reload();
  }

  async function handleCancel(id: string) {
    await updateWaitlistStatus(supabase, id, "cancelled");
    reload();
  }

  async function handleTogglePriority(entry: WaitlistEntryWithCustomer) {
    await setWaitlistPriority(supabase, entry.id, entry.priority > 0 ? 0 : 1);
    reload();
  }

  function startEdit(entry: WaitlistEntryWithCustomer) {
    setEditingId(entry.id);
    setEditPartySize(entry.partySize);
    setEditNotes(entry.notes ?? "");
  }

  async function saveEdit(id: string) {
    await updateWaitlistEntry(supabase, id, { partySize: editPartySize, notes: editNotes.trim() || null });
    setEditingId(null);
    reload();
  }

  async function openAssign(entry: WaitlistEntryWithCustomer) {
    setAssigningId(entry.id);
    const now = new Date();
    const endsAt = new Date(now.getTime() + 90 * 60_000);
    setAvailableTables(
      await listAvailableTables(supabase, {
        restaurantId,
        partySize: entry.partySize,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
    );
  }

  async function assignTable(entry: WaitlistEntryWithCustomer, table: Table) {
    if (!user) return;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 90 * 60_000).toISOString();
    await createReservation(supabase, {
      restaurantId,
      customerId: entry.customerId,
      tableId: table.id,
      startsAt,
      endsAt,
      partySize: entry.partySize,
      status: "seated",
      source: "walk_in",
      createdBy: user.id,
    });
    await updateWaitlistStatus(supabase, entry.id, "seated");
    setAssigningId(null);
    reload();
  }

  const active = entries.filter((e) => e.status === "waiting" || e.status === "notified");
  const done = entries.filter((e) => e.status === "cancelled" || e.status === "left");

  // Sort estable, de la clave menos importante a la más importante:
  // hora de pedido -> favorito/frecuente -> prioridad manual.
  const sorted = [...active]
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
    .sort((a, b) => Number(b.customerTotalVisits >= FREQUENT_VISITS_THRESHOLD) - Number(a.customerTotalVisits >= FREQUENT_VISITS_THRESHOLD))
    .sort((a, b) => b.priority - a.priority);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Lista de espera</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-accent text-accent-ink px-3 py-1.5 text-xs font-medium"
        >
          + Agregar a la lista
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-ink-faint">Cargando…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-ink-faint">Nadie está esperando ahora mismo.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {sorted.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {entry.priority > 0 && <span title="Prioritaria">⭐</span>}
                    {entry.customerTotalVisits >= FREQUENT_VISITS_THRESHOLD && (
                      <span
                        title={`Cliente frecuente (${entry.customerTotalVisits} visitas)`}
                        className="text-[10px] rounded-full px-1.5 py-0.5 border border-accent/50 text-accent"
                      >
                        Frecuente
                      </span>
                    )}
                    {entry.customerName}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {entry.partySize} personas · esperando hace {minutesWaiting(entry.requestedAt)} min
                    {entry.customerPhone ? ` · ${entry.customerPhone}` : ""}
                    {entry.notes ? ` · ${entry.notes}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleTogglePriority(entry)}
                  className={`text-xs rounded-full px-2 py-0.5 border shrink-0 ${
                    entry.priority > 0
                      ? "text-accent border-accent bg-accent/10"
                      : "text-ink-faint border-line hover:border-accent hover:text-accent"
                  }`}
                >
                  {entry.priority > 0 ? "★ Prioritaria" : "Marcar prioritaria"}
                </button>
                <span
                  className={`text-[10px] rounded-full px-2 py-0.5 border shrink-0 ${
                    entry.status === "notified" ? "text-status-arriving border-status-arriving" : "text-ink-faint border-line"
                  }`}
                >
                  {entry.status === "notified" ? "Notificado" : "Esperando"}
                </span>
                {entry.status === "waiting" && (
                  <button onClick={() => handleNotify(entry.id)} className="text-xs text-accent shrink-0">
                    Notificar
                  </button>
                )}
                <button onClick={() => startEdit(entry)} className="text-xs text-ink-faint hover:text-ink shrink-0">
                  Editar
                </button>
                <button
                  onClick={() => openAssign(entry)}
                  className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium shrink-0"
                >
                  Asignar mesa
                </button>
                <button onClick={() => handleCancel(entry.id)} className="text-xs text-ink-faint hover:text-status-occupied shrink-0">
                  Cancelar
                </button>
              </div>

              {editingId === entry.id && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-faint">
                    Personas{" "}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={editPartySize}
                      onChange={(e) => setEditPartySize(Number(e.target.value))}
                      className="w-16 ml-1 rounded-lg bg-ground border border-line px-2 py-1 text-xs outline-none focus:border-accent"
                    />
                  </label>
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notas"
                    className="flex-1 min-w-[8rem] rounded-lg bg-ground border border-line px-2 py-1 text-xs outline-none focus:border-accent"
                  />
                  <button onClick={() => saveEdit(entry.id)} className="text-xs text-accent">
                    Guardar
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-ink-faint">
                    Cancelar
                  </button>
                </div>
              )}

              {assigningId === entry.id && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {availableTables.length === 0 ? (
                    <p className="text-xs text-ink-faint">Ninguna mesa libre para {entry.partySize} personas ahora.</p>
                  ) : (
                    availableTables.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => assignTable(entry, t)}
                        className="rounded-lg bg-ground border border-line px-2.5 py-1.5 text-xs hover:border-accent"
                      >
                        Mesa {t.name} · {t.capacityMax}p
                      </button>
                    ))
                  )}
                  <button onClick={() => setAssigningId(null)} className="text-xs text-ink-faint">
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowCancelled((v) => !v)} className="text-xs text-ink-faint hover:text-ink">
            {showCancelled ? "▾" : "▸"} Canceladas / no atendidas ({done.length})
          </button>
          {showCancelled && (
            <div className="mt-2 rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden opacity-70">
              {done.map((entry) => (
                <div key={entry.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{entry.customerName}</p>
                    <p className="text-xs text-ink-faint">
                      {entry.partySize} personas · pedido hace {minutesWaiting(entry.requestedAt)} min
                    </p>
                  </div>
                  <span className="text-[10px] rounded-full px-2 py-0.5 border border-line text-ink-faint shrink-0">
                    {entry.status === "cancelled" ? "Cancelada" : "No se presentó"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddToWaitlistForm restaurantId={restaurantId} onCancel={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload(); }} />
      )}
    </div>
  );
}

function AddToWaitlistForm({
  restaurantId,
  onCancel,
  onAdded,
}: {
  restaurantId: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [duplicateMatches, setDuplicateMatches] = useState<Customer[]>([]);
  const [partySize, setPartySize] = useState(2);
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // While loading a "new" customer, check if the phone/email they just typed
  // already belongs to someone — cheaper to offer linking now than to end up
  // with two rows for the same person later.
  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!newMode || selected) return;
      const term = phone.trim() || email.trim();
      if (term.length < 4) {
        setDuplicateMatches([]);
        return;
      }
      setDuplicateMatches(await searchCustomers(supabase, restaurantId, term));
    }, 300);
    return () => clearTimeout(handle);
  }, [newMode, phone, email, restaurantId, selected]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!query.trim() || selected) return;
      setResults(await searchCustomers(supabase, restaurantId, query));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, restaurantId, selected]);

  async function handleSubmit() {
    setSubmitting(true);
    const customer =
      selected ??
      (await createCustomer(supabase, {
        restaurantId,
        firstName: firstName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      }));
    await addToWaitlist(supabase, { restaurantId, customerId: customer.id, partySize, priority: priority ? 1 : 0 });
    setSubmitting(false);
    onAdded();
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold mb-4">Agregar a la lista de espera</h2>

        {selected ? (
          <div className="flex items-center justify-between rounded-lg bg-ground border border-line px-3 py-2 text-sm mb-3">
            <span>{selected.firstName} {selected.lastName ?? ""}</span>
            <button onClick={() => { setSelected(null); setQuery(""); }} className="text-ink-faint hover:text-ink">Cambiar</button>
          </div>
        ) : newMode ? (
          <div className="space-y-2 mb-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Mail" className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
            {duplicateMatches.length > 0 && (
              <div className="rounded-lg border border-accent/40 bg-accent/10 p-2 space-y-1">
                <p className="text-xs text-accent">Ya existe un cliente con estos datos:</p>
                {duplicateMatches.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelected(c);
                      setDuplicateMatches([]);
                    }}
                    className="w-full text-left text-xs rounded px-2 py-1 hover:bg-surface-2"
                  >
                    {c.firstName} {c.lastName ?? ""} {c.phone ? `· ${c.phone}` : ""} {c.email ? `· ${c.email}` : ""} — usar este
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setNewMode(false)} className="text-xs text-ink-faint">Buscar cliente existente</button>
          </div>
        ) : (
          <div className="mb-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente…" className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
            {results.length > 0 && (
              <ul className="mt-1 rounded-lg border border-line bg-ground overflow-hidden">
                {results.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSelected(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2">
                      {c.firstName} {c.lastName ?? ""} {c.phone ? `· ${c.phone}` : ""} {c.email ? `· ${c.email}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setNewMode(true)} className="text-xs text-accent mt-1">+ Cliente nuevo</button>
          </div>
        )}

        <label className="block text-sm text-ink-muted mb-1">Personas</label>
        <input type="number" min={1} max={30} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className="w-full mb-3 rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent" />

        <label className="flex items-center gap-2 text-sm text-ink-muted mb-4">
          <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} />
          ⭐ Prioritaria (se atiende antes que el resto)
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (!selected && !firstName.trim())}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
