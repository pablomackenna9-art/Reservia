import { useEffect, useState, type FormEvent } from "react";
import { createCustomer, createReservation, getReservationRules, listHours, searchCustomers } from "@reservia/api-client";
import type { Customer, ReservationRules, RestaurantHours, TableCandidate } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { TableAssignmentPicker } from "./TableAssignmentPicker";

const SLOT_INTERVAL_MINUTES = 30;

interface Slot {
  time: string; // "HH:MM"
  label: string;
}

function buildSlots(hours: RestaurantHours[], dayOfWeek: number, durationMinutes: number): Slot[] {
  const servicesToday = hours.filter((h) => h.dayOfWeek === dayOfWeek);
  const slots: Slot[] = [];
  for (const service of servicesToday) {
    const [openH = 0, openM = 0] = service.opensAt.split(":").map(Number);
    const [closeH = 0, closeM = 0] = service.closesAt.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += SLOT_INTERVAL_MINUTES) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const label = new Date(`2000-01-01T${time}:00`).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
      slots.push({ time, label });
    }
  }
  return slots;
}

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
  const [newEmail, setNewEmail] = useState("");
  const [duplicateMatches, setDuplicateMatches] = useState<Customer[]>([]);

  const [partySize, setPartySize] = useState(2);
  const [time, setTime] = useState<string | null>(null);

  const [hours, setHours] = useState<RestaurantHours[]>([]);
  const [rules, setRules] = useState<ReservationRules | null>(null);

  const [selectedCandidate, setSelectedCandidate] = useState<{ candidate: TableCandidate; wasRecommended: boolean } | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listHours(supabase, restaurantId), getReservationRules(supabase, restaurantId)]).then(([h, r]) => {
      setHours(h);
      setRules(r);
    });
  }, [restaurantId]);

  const duration = rules?.defaultDurationMinutes ?? 90;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const slots = buildSlots(hours, dayOfWeek, duration);

  const startsAt = time ? `${date}T${time}:00` : null;
  const endsAt = startsAt ? new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString() : null;

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!customerQuery.trim() || selectedCustomer) return;
      setCustomerResults(await searchCustomers(supabase, restaurantId, customerQuery));
    }, 250);
    return () => clearTimeout(handle);
  }, [customerQuery, restaurantId, selectedCustomer]);

  // Same idea as the search box, but for the "cliente nuevo" path — catches
  // it before a duplicate customer row gets created.
  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!newCustomerMode || selectedCustomer) return;
      const term = newPhone.trim() || newEmail.trim();
      if (term.length < 4) {
        setDuplicateMatches([]);
        return;
      }
      setDuplicateMatches(await searchCustomers(supabase, restaurantId, term));
    }, 300);
    return () => clearTimeout(handle);
  }, [newCustomerMode, newPhone, newEmail, restaurantId, selectedCustomer]);

  // A previously picked table stops being valid the moment the time or party
  // size changes — force the host to re-confirm rather than silently keep a
  // stale (maybe now-unavailable) assignment.
  useEffect(() => {
    setSelectedCandidate(null);
  }, [time, partySize]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !startsAt || !endsAt) return;
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
              email: newEmail.trim() || undefined,
            })
          ).id;

      await createReservation(supabase, {
        restaurantId,
        customerId,
        tableId: selectedCandidate?.candidate.tableIds[0] ?? null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt,
        partySize,
        createdBy: user.id,
        tableAssignmentSource: selectedCandidate ? (selectedCandidate.wasRecommended ? "suggested" : "manual") : undefined,
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
            <div>
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
              {selectedCustomer.blacklisted && (
                <p className="text-xs text-status-occupied mt-1.5">
                  🚫 Este cliente está bloqueado del portal público
                  {selectedCustomer.blacklistedReason ? ` — ${selectedCustomer.blacklistedReason}` : ""}. Podés cargarle
                  la reserva igual si es una excepción.
                </p>
              )}
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
                placeholder="Teléfono"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                placeholder="Mail"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg bg-ground border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {duplicateMatches.length > 0 && (
                <div className="rounded-lg border border-accent/40 bg-accent/10 p-2 space-y-1">
                  <p className="text-xs text-accent">Ya existe un cliente con estos datos:</p>
                  {duplicateMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(c);
                        setDuplicateMatches([]);
                      }}
                      className="w-full text-left text-xs rounded px-2 py-1 hover:bg-surface-2"
                    >
                      {c.firstName} {c.lastName ?? ""} {c.phone ? `· ${c.phone}` : ""} {c.email ? `· ${c.email}` : ""} — usar este
                    </button>
                  ))}
                </div>
              )}
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

        <div className="grid grid-cols-2 gap-2 mb-4">
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
            <label className="block text-sm text-ink-muted mb-1">Duración</label>
            <p className="text-sm text-ink py-2">{duration} min</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-ink-muted mb-1">Hora</label>
          {hours.length === 0 && rules === null ? (
            <p className="text-xs text-ink-faint">Cargando horarios…</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-ink-faint">El restaurante no tiene horario configurado para ese día.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => setTime(s.time)}
                  className={`rounded-lg px-2 py-1.5 text-xs border ${
                    s.time === time
                      ? "bg-accent text-accent-ink border-accent"
                      : "bg-ground border-line text-ink-muted hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm text-ink-muted mb-1">Mesa (opcional)</label>
          {!startsAt ? (
            <p className="text-xs text-ink-faint">Elegí una hora primero.</p>
          ) : selectedCandidate ? (
            <div className="flex items-center justify-between rounded-lg bg-ground border border-line px-3 py-2 text-sm">
              <span>
                {selectedCandidate.candidate.tableNames.join(" + ")} · {selectedCandidate.candidate.capacityMax}p
              </span>
              <button type="button" onClick={() => setSelectedCandidate(null)} className="text-ink-faint hover:text-ink">
                Cambiar
              </button>
            </div>
          ) : (
            <TableAssignmentPicker
              restaurantId={restaurantId}
              partySize={partySize}
              startsAt={new Date(startsAt).toISOString()}
              endsAt={endsAt!}
              allowCombinations={false}
              onSelect={(candidate, wasRecommended) => setSelectedCandidate({ candidate, wasRecommended })}
            />
          )}
        </div>

        {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !startsAt}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Creando…" : "Crear reserva"}
          </button>
        </div>
      </form>
    </div>
  );
}
