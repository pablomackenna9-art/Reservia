"use client";

import { useState, type ReactNode } from "react";
import { createPublicReservation, isSlotAvailable } from "@reservia/api-client";
import type { Reservation, ReservationRules, RestaurantHours, Restaurant } from "@reservia/core";
import { supabase } from "../../lib/supabase";

type Step = "party" | "date" | "time" | "details" | "confirmed";

interface Slot {
  startsAt: string;
  endsAt: string;
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];
const SLOT_INTERVAL_MINUTES = 30;

export function BookingFlow({
  restaurant,
  hours,
  rules,
}: {
  restaurant: Restaurant;
  hours: RestaurantHours[];
  rules: ReservationRules;
}) {
  const [step, setStep] = useState<Step>("party");
  const [partySize, setPartySize] = useState<number | null>(null);
  const [date, setDate] = useState(dateToISO(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [closedToday, setClosedToday] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);

  const minDate = dateToISO(new Date());
  const maxDate = dateToISO(new Date(Date.now() + rules.maxAdvanceDays * 86_400_000));

  async function pickPartySize(size: number) {
    setPartySize(size);
    setStep("date");
  }

  async function pickDate(newDate: string) {
    setDate(newDate);
    setStep("time");
    await loadSlots(newDate, partySize!);
  }

  async function loadSlots(forDate: string, forPartySize: number) {
    setSlotsLoading(true);
    setClosedToday(false);
    setSelectedSlot(null);

    const dayOfWeek = new Date(`${forDate}T12:00:00`).getDay();
    const servicesToday = hours.filter((h) => h.dayOfWeek === dayOfWeek);

    if (servicesToday.length === 0) {
      setClosedToday(true);
      setSlots([]);
      setSlotsLoading(false);
      return;
    }

    const candidates: Slot[] = [];
    for (const service of servicesToday) {
      const [openH = 0, openM = 0] = service.opensAt.split(":").map(Number);
      const [closeH = 0, closeM = 0] = service.closesAt.split(":").map(Number);
      const open = new Date(`${forDate}T00:00:00`);
      open.setHours(openH, openM, 0, 0);
      const close = new Date(`${forDate}T00:00:00`);
      close.setHours(closeH, closeM, 0, 0);

      for (let t = new Date(open); t.getTime() + rules.defaultDurationMinutes * 60_000 <= close.getTime(); t = new Date(t.getTime() + SLOT_INTERVAL_MINUTES * 60_000)) {
        if (t.getTime() < Date.now() + rules.minAdvanceHours * 3_600_000) continue;
        const startsAt = new Date(t);
        const endsAt = new Date(startsAt.getTime() + rules.defaultDurationMinutes * 60_000);
        candidates.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      }
    }

    const availability = await Promise.all(
      candidates.map((slot) =>
        isSlotAvailable(supabase, { restaurantId: restaurant.id, partySize: forPartySize, startsAt: slot.startsAt, endsAt: slot.endsAt }),
      ),
    );
    setSlots(candidates.filter((_, i) => availability[i]));
    setSlotsLoading(false);
  }

  function pickSlot(slot: Slot) {
    setSelectedSlot(slot);
    setStep("details");
  }

  async function handleConfirm() {
    if (!selectedSlot || !partySize) return;
    if (!firstName.trim() || !phone.trim()) {
      setError("Nombre y teléfono son obligatorios.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reservation = await createPublicReservation(supabase, {
        restaurantSlug: restaurant.slug,
        partySize,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setConfirmed(reservation);
      setStep("confirmed");
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos confirmar la reserva. Probá otro horario.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <p className="text-xs uppercase tracking-wide text-ink-faint mb-1">Reservia</p>
        <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
      </div>

      {step === "party" && (
        <StepCard title="¿Cuántas personas?">
          <div className="grid grid-cols-4 gap-2">
            {PARTY_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => pickPartySize(n)}
                className="rounded-lg border border-line bg-surface py-3 text-sm hover:border-accent hover:text-accent"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-3 text-center">¿Más de 8? Llamá al restaurante directamente.</p>
        </StepCard>
      )}

      {step === "date" && (
        <StepCard title="¿Qué día?" onBack={() => setStep("party")}>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => pickDate(e.target.value)}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </StepCard>
      )}

      {step === "time" && (
        <StepCard title="¿A qué hora?" onBack={() => setStep("date")}>
          {slotsLoading ? (
            <p className="text-sm text-ink-muted">Buscando horarios…</p>
          ) : closedToday ? (
            <p className="text-sm text-ink-muted">El restaurante está cerrado ese día — probá otra fecha.</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-ink-muted">No queda disponibilidad ese día para {partySize} personas.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  onClick={() => pickSlot(slot)}
                  className="rounded-lg border border-line bg-surface py-2.5 text-sm hover:border-accent hover:text-accent"
                >
                  {new Date(slot.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </StepCard>
      )}

      {step === "details" && selectedSlot && (
        <StepCard title="Tus datos" onBack={() => setStep("time")}>
          <p className="text-xs text-ink-faint mb-3">
            {partySize} personas ·{" "}
            {new Date(selectedSlot.startsAt).toLocaleDateString("es-CL", { day: "numeric", month: "long" })} ·{" "}
            {new Date(selectedSlot.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="space-y-2.5">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nombre"
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Apellido"
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono"
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo (opcional)"
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Algo que debamos saber (opcional)"
              rows={2}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent resize-none"
            />
          </div>

          {error && <p className="text-sm text-status-occupied mt-3">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full mt-4 rounded-lg bg-accent text-accent-ink py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </StepCard>
      )}

      {step === "confirmed" && confirmed && (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/40 grid place-items-center mx-auto mb-4 text-accent text-xl">
            ✓
          </div>
          <h2 className="text-lg font-semibold mb-1">Solicitud enviada</h2>
          <p className="text-sm text-ink-muted">
            {partySize} personas en {restaurant.name}
            <br />
            {new Date(confirmed.startsAt).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            {new Date(confirmed.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-ink-faint mt-4">
            El restaurante todavía tiene que confirmarla — te avisamos por teléfono si hay algún cambio.
          </p>
        </div>
      )}
    </div>
  );
}

function StepCard({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {onBack && (
          <button onClick={onBack} className="text-ink-faint hover:text-ink text-sm" aria-label="Volver">
            ←
          </button>
        )}
        <h2 className="text-sm font-medium text-ink-muted">{title}</h2>
      </div>
      {children}
    </div>
  );
}
