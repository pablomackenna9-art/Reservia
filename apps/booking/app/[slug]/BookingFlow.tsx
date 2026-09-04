"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createPublicReservation,
  createPublicWaitlistEntry,
  getMonthAvailability,
  isSlotAvailable,
  lookupPublicCustomer,
  type DayAvailability,
  type PublicCustomerMatch,
} from "@reservia/api-client";
import type { Reservation, ReservationRules, RestaurantHours, Restaurant, WaitlistEntry } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { RestaurantHeader } from "./RestaurantHeader";
import { Calendar } from "./Calendar";
import { DICTIONARIES, loadStoredLocale, storeLocale, LOCALE_TAG, type Locale } from "./i18n";

type Step = "email" | "when" | "time" | "confirm" | "confirmed" | "waitlist" | "waitlist-confirmed";

interface Slot {
  startsAt: string;
  endsAt: string;
  serviceName: string;
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SLOT_INTERVAL_MINUTES = 30;
const PROGRESS_STEPS: Step[] = ["email", "when", "time", "confirm"];

export function BookingFlow({
  restaurant,
  hours,
  rules,
}: {
  restaurant: Restaurant;
  hours: RestaurantHours[];
  rules: ReservationRules;
}) {
  const [locale, setLocale] = useState<Locale>("es");
  useEffect(() => setLocale(loadStoredLocale()), []);
  function changeLocale(l: Locale) {
    setLocale(l);
    storeLocale(l);
  }
  const t = DICTIONARIES[locale];

  const [step, setStep] = useState<Step>("email");

  // Paso 1: correo
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [knownCustomer, setKnownCustomer] = useState<PublicCustomerMatch | null>(null);
  const [editingKnownCustomer, setEditingKnownCustomer] = useState(false);

  // Paso 2: fecha + personas
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-12
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Map<string, DayAvailability>>(new Map());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Paso 3: hora
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Paso 4: confirmar
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);
  const [waitlistConfirmed, setWaitlistConfirmed] = useState<WaitlistEntry | null>(null);

  useEffect(() => {
    setAvailabilityLoading(true);
    getMonthAvailability(supabase, restaurant.slug, partySize, viewYear, viewMonth)
      .then(setAvailability)
      .finally(() => setAvailabilityLoading(false));
  }, [restaurant.slug, partySize, viewYear, viewMonth]);

  function navigateMonth(direction: -1 | 1) {
    let y = viewYear;
    let m = viewMonth + direction;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  async function handleEmailContinue() {
    if (!email.trim() || !consent) return;
    setLookupLoading(true);
    try {
      const match = await lookupPublicCustomer(supabase, restaurant.slug, email.trim());
      setKnownCustomer(match);
      if (match) {
        setFirstName(match.firstName);
        setLastName(match.lastName ?? "");
        setPhone(match.phone ?? "");
      }
    } finally {
      setLookupLoading(false);
      setStep("when");
    }
  }

  async function handleDateSelected(dateISO: string) {
    setSelectedDate(dateISO);
  }

  async function handleWhenContinue() {
    if (!selectedDate) return;
    const status = availability.get(selectedDate);
    if (status === "waitlist") {
      setStep("waitlist");
      return;
    }
    await loadSlotsForDate(selectedDate);
    setStep("time");
  }

  async function loadSlotsForDate(dateISO: string) {
    setSlotsLoading(true);
    setSelectedSlot(null);
    const dayOfWeek = new Date(`${dateISO}T12:00:00`).getDay();
    const servicesToday = hours.filter((h) => h.dayOfWeek === dayOfWeek);

    const candidates: Slot[] = [];
    for (const service of servicesToday) {
      const [openH = 0, openM = 0] = service.opensAt.split(":").map(Number);
      const [closeH = 0, closeM = 0] = service.closesAt.split(":").map(Number);
      const open = new Date(`${dateISO}T00:00:00`);
      open.setHours(openH, openM, 0, 0);
      const close = new Date(`${dateISO}T00:00:00`);
      close.setHours(closeH, closeM, 0, 0);

      for (
        let cursor = new Date(open);
        cursor.getTime() + rules.defaultDurationMinutes * 60_000 <= close.getTime();
        cursor = new Date(cursor.getTime() + SLOT_INTERVAL_MINUTES * 60_000)
      ) {
        if (cursor.getTime() < Date.now() + rules.minAdvanceHours * 3_600_000) continue;
        const startsAt = new Date(cursor);
        const endsAt = new Date(startsAt.getTime() + rules.defaultDurationMinutes * 60_000);
        candidates.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), serviceName: service.serviceName });
      }
    }

    const availabilityChecks = await Promise.all(
      candidates.map((slot) =>
        isSlotAvailable(supabase, { restaurantId: restaurant.id, partySize, startsAt: slot.startsAt, endsAt: slot.endsAt }),
      ),
    );
    setSlots(candidates.filter((_, i) => availabilityChecks[i]));
    setSlotsLoading(false);
  }

  function pickSlot(slot: Slot) {
    setSelectedSlot(slot);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!selectedSlot) return;
    if (!firstName.trim() || !phone.trim()) {
      setError(t.requiredFields);
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
      setError(message ?? "—");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWaitlistConfirm() {
    if (!firstName.trim() || !phone.trim()) {
      setError(t.requiredFields);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // create_public_waitlist_entry no tiene columna de fecha (nació para el
      // caso "mesa se libera en un rato" del walk-in) -- la incrustamos en
      // notes para que el equipo sepa para cuándo era este pedido.
      const dateNote = selectedDate
        ? t.waitlistDateNote(
            new Date(`${selectedDate}T12:00:00`).toLocaleDateString(LOCALE_TAG[locale], {
              weekday: "long",
              day: "numeric",
              month: "long",
            }),
          )
        : null;
      const combinedNotes = [dateNote, notes.trim() || null].filter(Boolean).join(" — ");
      const entry = await createPublicWaitlistEntry(supabase, {
        restaurantSlug: restaurant.slug,
        partySize,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        notes: combinedNotes || undefined,
      });
      setWaitlistConfirmed(entry);
      setStep("waitlist-confirmed");
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "—");
    } finally {
      setSubmitting(false);
    }
  }

  const progressIndex = PROGRESS_STEPS.indexOf(step);
  const showProgress = progressIndex >= 0;
  const knownFullName = knownCustomer ? [knownCustomer.firstName, knownCustomer.lastName].filter(Boolean).join(" ") : null;

  const groupedSlots = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    (acc[slot.serviceName] ??= []).push(slot);
    return acc;
  }, {});

  return (
    <div className="w-full max-w-sm">
      <RestaurantHeader restaurant={restaurant} hours={hours} locale={locale} onLocaleChange={changeLocale} />

      {showProgress && (
        <div className="flex gap-1.5 mb-6">
          {PROGRESS_STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${i <= progressIndex ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      )}

      {step === "email" && (
        <StepCard title={t.stepEmailTitle} subtitle={t.stepEmailSubtitle}>
          <label className="block text-[10px] uppercase tracking-wide text-ink-faint mb-1">{t.emailLabel}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent mb-3"
          />
          <label className="flex items-start gap-2 text-xs text-ink-faint mb-4">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            {t.consent(restaurant.name)}
          </label>
          <button
            onClick={handleEmailContinue}
            disabled={!email.trim() || !consent || lookupLoading}
            className="w-full rounded-lg bg-accent text-accent-ink py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {lookupLoading ? "…" : t.continueCta}
          </button>
        </StepCard>
      )}

      {step === "when" && (
        <StepCard title={t.stepWhenTitle} subtitle={t.stepWhenSubtitle} onBack={() => setStep("email")}>
          <Calendar
            year={viewYear}
            month={viewMonth}
            selectedDate={selectedDate}
            availability={availability}
            loading={availabilityLoading}
            locale={locale}
            onSelectDate={handleDateSelected}
            onNavigate={navigateMonth}
          />

          <div className="flex items-center gap-3 mt-3 mb-3 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-available" /> {t.legendAvailable}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-arriving" /> {t.legendWaitlist}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" /> {t.legendClosed}
            </span>
          </div>

          <p className="text-sm font-medium mb-1.5">{t.people}</p>
          <div className="flex items-center justify-center gap-4 rounded-lg border border-line bg-surface py-2.5 mb-1">
            <button
              onClick={() => setPartySize((n) => Math.max(rules.minPartySize, n - 1))}
              className="w-8 h-8 rounded-full border border-line text-ink hover:border-accent"
            >
              −
            </button>
            <span className="text-lg font-semibold tabular-nums w-10 text-center">{partySize}</span>
            <button
              onClick={() => setPartySize((n) => Math.min(Math.min(8, rules.maxPartySize), n + 1))}
              className="w-8 h-8 rounded-full border border-line text-ink hover:border-accent"
            >
              +
            </button>
          </div>
          <p className="text-[11px] text-ink-faint text-center mb-4">{t.morePeople}</p>

          <button
            onClick={handleWhenContinue}
            disabled={!selectedDate}
            className="w-full rounded-lg bg-accent text-accent-ink py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {t.continueCta}
          </button>
        </StepCard>
      )}

      {step === "time" && (
        <StepCard title={t.stepTimeTitle} onBack={() => setStep("when")}>
          {slotsLoading ? (
            <p className="text-sm text-ink-muted">{t.loadingTimes}</p>
          ) : slots.length === 0 ? (
            <div>
              <p className="text-sm text-ink-muted mb-3">{t.noTimesThatDay}</p>
              <button
                onClick={() => setStep("waitlist")}
                className="w-full rounded-lg border border-accent text-accent py-2.5 text-sm font-medium hover:bg-accent/10"
              >
                {t.joinWaitlistCta}
              </button>
            </div>
          ) : (
            Object.entries(groupedSlots).map(([serviceName, serviceSlots]) => (
              <div key={serviceName} className="mb-4 last:mb-0">
                <p className="text-xs text-ink-faint uppercase tracking-wide mb-2">{serviceName}</p>
                <div className="grid grid-cols-3 gap-2">
                  {serviceSlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      onClick={() => pickSlot(slot)}
                      className="rounded-lg border border-line bg-surface py-2.5 text-sm hover:border-accent hover:text-accent"
                    >
                      {new Date(slot.startsAt).toLocaleTimeString(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </StepCard>
      )}

      {step === "confirm" && selectedSlot && selectedDate && (
        <StepCard title={t.stepConfirmTitle} subtitle={t.stepConfirmSubtitle} onBack={() => setStep("time")}>
          <div className="rounded-lg border border-dashed border-line p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-ink-faint mb-2">{t.yourReservation}</p>
            <SummaryRow label={t.partySizeLabel} value={`${partySize} ${t.people.toLowerCase()}`} />
            <SummaryRow
              label={t.dateLabel}
              value={new Date(`${selectedDate}T12:00:00`).toLocaleDateString(LOCALE_TAG[locale], {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            />
            <SummaryRow label={t.turnLabel} value={selectedSlot.serviceName} />
            <SummaryRow
              label={t.timeLabel}
              value={new Date(selectedSlot.startsAt).toLocaleTimeString(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" })}
            />
          </div>

          {knownFullName && !editingKnownCustomer ? (
            <div className="rounded-lg bg-surface border border-line px-3 py-2.5 mb-3">
              <p className="text-sm">{t.areYouX(knownFullName)}</p>
              <p className="text-xs text-ink-faint mt-1">
                {t.emailShownLabel}: {email}
              </p>
              <button onClick={() => setEditingKnownCustomer(true)} className="text-xs text-accent underline mt-1.5">
                {t.fixMyData}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 mb-3">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t.firstNameLabel}
                className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t.lastNameLabel}
                className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.phoneLabel}
                className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            rows={2}
            className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent resize-none mb-3"
          />

          <div className="rounded-lg bg-status-available/10 border border-status-available/40 px-3 py-2 text-xs text-status-available mb-4">
            {t.availableMsg}
          </div>

          {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full rounded-lg bg-accent text-accent-ink py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? t.sending : t.confirmCta}
          </button>
        </StepCard>
      )}

      {step === "confirmed" && confirmed && (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/40 grid place-items-center mx-auto mb-4 text-accent text-xl">
            ✓
          </div>
          <h2 className="text-lg font-semibold mb-1">{t.confirmedTitle}</h2>
          <p className="text-sm text-ink-muted">
            {partySize} {t.people.toLowerCase()} · {restaurant.name}
            <br />
            {new Date(confirmed.startsAt).toLocaleDateString(LOCALE_TAG[locale], { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            {new Date(confirmed.startsAt).toLocaleTimeString(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-ink-faint mt-4">{t.confirmedNote}</p>
        </div>
      )}

      {step === "waitlist" && selectedDate && (
        <StepCard title={t.waitlistTitle} onBack={() => setStep("when")}>
          <p className="text-xs text-ink-faint mb-3">
            {t.waitlistSubtitle(
              partySize,
              new Date(`${selectedDate}T12:00:00`).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long" }),
            )}
          </p>
          <div className="space-y-2.5">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t.firstNameLabel}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t.lastNameLabel}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phoneLabel}
              className="w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-status-occupied mt-3">{error}</p>}

          <button
            onClick={handleWaitlistConfirm}
            disabled={submitting}
            className="w-full mt-4 rounded-lg bg-accent text-accent-ink py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? t.sending : t.joinWaitlistCta}
          </button>
        </StepCard>
      )}

      {step === "waitlist-confirmed" && waitlistConfirmed && (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/40 grid place-items-center mx-auto mb-4 text-accent text-xl">
            ✓
          </div>
          <h2 className="text-lg font-semibold mb-1">{t.waitlistConfirmedTitle}</h2>
          <p className="text-sm text-ink-muted">
            {partySize} {t.people.toLowerCase()} · {restaurant.name}
          </p>
          <p className="text-xs text-ink-faint mt-4">{t.waitlistConfirmedNote}</p>
        </div>
      )}
    </div>
  );
}

function StepCard({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {onBack && (
          <button onClick={onBack} className="text-ink-faint hover:text-ink text-sm" aria-label="Volver">
            ←
          </button>
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm py-1">
      <span className="text-ink-faint capitalize">{label}</span>
      <span className="font-medium capitalize text-right">{value}</span>
    </div>
  );
}
