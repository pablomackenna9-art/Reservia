import { useEffect, useState, type FormEvent } from "react";
import {
  createCustomer,
  createReservation,
  listAvailableTables,
  searchCustomers,
} from "@reservia/api-client";
import type { Customer, Table } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const DURATIONS = [60, 90, 120, 150];

export function NewReservationForm({
  restaurantId,
  date,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  date: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [partySize, setPartySize] = useState(2);
  const [time, setTime] = useState("20:00");
  const [duration, setDuration] = useState(90);

  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startsAt = `${date}T${time}:00`;
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!customerQuery.trim() || selectedCustomer) return;
      setCustomerResults(await searchCustomers(supabase, restaurantId, customerQuery));
    }, 250);
    return () => clearTimeout(handle);
  }, [customerQuery, restaurantId, selectedCustomer]);

  useEffect(() => {
    let cancelled = false;
    setTablesLoading(true);
    setSelectedTableId(null);
    listAvailableTables(supabase, { restaurantId, partySize, startsAt: new Date(startsAt).toISOString(), endsAt })
      .then((tables) => {
        if (!cancelled) setAvailableTables(tables);
      })
      .finally(() => {
        if (!cancelled) setTablesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, partySize, startsAt, duration]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (!selectedCustomer && !newFirstName.trim()) {
      setError("Elegí un cliente existente o cargá uno nuevo.");
      return;
    }

    setSubmitting(true);
    try {
      const customerId = selectedCustomer
        ? selectedCustomer.id
        : (
            await createCustomer(supabase, {
              restaurantId,
              firstName: newFirstName.trim(),
              lastName: newLastName.trim() || undefined,
              phone: newPhone.trim() || undefined,
            })
          ).id;

      await createReservation(supabase, {
        restaurantId,
        customerId,
        tableId: selectedTableId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt,
        partySize,
        createdBy: user.id,
      });

      onCreated();
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos crear la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-5 max-h-[85vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold mb-4">Nueva reserva</h2>

        <div className="mb-4">
          <label className="block text-sm text-ink-muted mb-1">Cliente</label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg bg-ground border border-line px-3 py-2 text-sm">
              <span>
                {selectedCustomer.firstName} {selectedCustomer.lastName ?? ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerQuery("");
                }}
                className="text-ink-faint hover:text-ink"
              >
                Cambiar
              </button>
            </div>
          ) : newCustomerMode ? (
            <div className="space-y-2">
              <input
                placeholder="Nombre"
                required
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                placeholder="Apellido (opcional)"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                placeholder="Teléfono (opcional)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="button" onClick={() => setNewCustomerMode(false)} className="text-xs text-ink-faint">
                Buscar cliente existente en cambio
              </button>
            </div>
          ) : (
            <div>
              <input
                placeholder="Buscar por nombre o teléfono…"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {customerResults.length > 0 && (
                <ul className="mt-1 rounded-lg border border-line bg-ground overflow-hidden">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2"
                      >
                        {c.firstName} {c.lastName ?? ""} {c.phone ? `· ${c.phone}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setNewCustomerMode(true)}
                className="text-xs text-accent mt-1"
              >
                + Cliente nuevo
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-sm text-ink-muted mb-1">Personas</label>
            <input
              type="number"
              min={1}
              max={30}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-muted mb-1">Hora</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-muted mb-1">Duración</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-ink-muted mb-1">Mesa (opcional)</label>
          {tablesLoading ? (
            <p className="text-xs text-ink-faint">Buscando mesas disponibles…</p>
          ) : availableTables.length === 0 ? (
            <p className="text-xs text-ink-faint">Ninguna mesa activa tiene capacidad libre a esa hora.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availableTables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTableId(t.id === selectedTableId ? null : t.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs border ${
                    t.id === selectedTableId
                      ? "bg-accent text-accent-ink border-accent"
                      : "bg-ground border-line text-ink-muted hover:text-ink"
                  }`}
                >
                  {t.name} · {t.capacityMax}p
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Creando…" : "Crear reserva"}
          </button>
        </div>
      </form>
    </div>
  );
}
