import { useEffect, useState } from "react";
import {
  addToWaitlist,
  createCustomer,
  createReservation,
  listAvailableTables,
  listWaitlist,
  searchCustomers,
  setWaitlistPriority,
  updateWaitlistStatus,
  type WaitlistEntryWithCustomer,
} from "@reservia/api-client";
import type { Customer, Table } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { useRestaurant } from "../restaurants/RestaurantProvider";

function minutesWaiting(requestedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(requestedAt).getTime()) / 60_000));
}

export function ListaDeEsperaPage() {
  const { current } = useRestaurant();
  const { user } = useAuth();
  const restaurantId = current?.restaurant.id;

  const [entries, setEntries] = useState<WaitlistEntryWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);

  async function reload() {
    if (!restaurantId) return;
    setEntries(await listWaitlist(supabase, restaurantId));
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

  async function openAssign(entry: WaitlistEntryWithCustomer) {
    if (!restaurantId) return;
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
    if (!restaurantId || !user) return;
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

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lista de espera</h1>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!restaurantId}
          className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          + Agregar a la lista
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface min-h-[50vh] grid place-items-center">
          <p className="text-sm text-ink-muted">Nadie está esperando ahora mismo.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {entry.priority > 0 && <span title="Prioritaria">⭐</span>}
                    {entry.customerName}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {entry.partySize} personas · esperando hace {minutesWaiting(entry.requestedAt)} min
                    {entry.customerPhone ? ` · ${entry.customerPhone}` : ""}
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
                  className={`text-[10px] rounded-full px-2 py-0.5 border ${
                    entry.status === "notified" ? "text-status-arriving border-status-arriving" : "text-ink-faint border-line"
                  }`}
                >
                  {entry.status === "notified" ? "Notificado" : "Esperando"}
                </span>
                {entry.status === "waiting" && (
                  <button onClick={() => handleNotify(entry.id)} className="text-xs text-accent">
                    Notificar
                  </button>
                )}
                <button
                  onClick={() => openAssign(entry)}
                  className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
                >
                  Asignar mesa
                </button>
                <button onClick={() => handleCancel(entry.id)} className="text-xs text-ink-faint hover:text-status-occupied">
                  Cancelar
                </button>
              </div>

              {assigningId === entry.id && (
                <div className="mt-2.5 pl-0 flex flex-wrap gap-1.5">
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

      {showAdd && restaurantId && (
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
