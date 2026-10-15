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
import { DICTIONARIES, formatTime, loadStoredLocale, storeLocale, LOCALE_TAG, type Locale } from "./i18n";

type Step = "email" | "when" | "time" | "confirm" | "confirmed" | "waitlist" | "waitlist-confirmed";

interface Slot {
  startsAt: string;
  endsAt: string;
  serviceName: string;
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Las reservas se ofrecen cada 15 minutos; el cierre del turno es la ultima hora reservable (inclusive).
const SLOT_INTERVAL_MINUTES = 15;
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
    const servicesToday = hours.filter((h) => h.dayOfWeek === dayOfWeek).sort((a, b) => a.opensAt.localeCompare(b.opensAt));

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
        cursor.getTime() <= close.getTime();
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
        <div className="mb-6">
          <div className="flex gap-1.5">
            {PROGRESS_STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${i <= progressIndex ? "bg-accent" : "bg-line-strong"}`} />
            ))}
          </div>
          <p className="text-[13px] text-ink-faint mt-2">{t.stepOf(progressIndex + 1, PROGRESS_STEPS.length)}</p>
        </div>
      )}

      {step === "email" && (
        <StepCard title={t.stepEmailTitle} subtitle={t.stepEmailSubtitle}>
          <label className="block text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-faint mb-1.5">{t.emailLabel}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent mb-3"
          />
          <label className="flex items-start gap-2 text-[13px] text-ink-muted mb-5">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            {t.consent(restaurant.name)}
          </label>
          <button
            onClick={handleEmailContinue}
            disabled={!email.trim() || !consent || lookupLoading}
            className="w-full h-[54px] rounded-[14px] bg-ink-dark text-white text-base font-semibold disabled:opacity-40"
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

          <div className="flex items-center gap-4 mt-3 text-[13px] text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-status-available" /> {t.legendAvailable}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-status-arriving" /> {t.legendWaitlist}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-ink-faint" /> {t.legendClosed}
            </span>
          </div>

          <p className="text-[15px] font-semibold mt-5 mb-2">{t.people}</p>
          <div className="grid grid-cols-5 gap-2 mb-1.5">
            {Array.from({ length: Math.min(10, rules.maxPartySize) }, (_, i) => i + 1)
              .filter((n) => n >= rules.minPartySize)
              .map((n) => (
                <button
                  key={n}
                  onClick={() => setPartySize(n)}
                  className={`h-[46px] rounded-xl font-serif text-[22px] ${
                    n === partySize ? "bg-ink-dark text-white" : "bg-surface text-ink hover:bg-line"
                  }`}
                >
                  {n}
                </button>
              ))}
          </div>
          <p className="text-[13px] text-ink-faint mb-6">
            {t.morePeople(Math.min(10, rules.maxPartySize))}
            {restaurant.phone && (
              <>
                {" "}
                <a href={`tel:${restaurant.phone.replace(/[^+\d]/g, "")}`} className="text-accent underline underline-offset-2 whitespace-nowrap">
                  {restaurant.phone}
                </a>
              </>
            )}
          </p>

          <div className="sticky bottom-4">
            <button onClick={handleWhenContinue} disabled={!selectedDate} className="w-full h-[54px] rounded-[14px] bg-ink-dark text-white text-base font-semibold disabled:opacity-40">
              {selectedDate
                ? `${t.seeTimes} · ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString(LOCALE_TAG[locale], {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}, ${partySize} ${t.persShort}`
                : t.continueCta}
            </button>
          </div>
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
                className="w-full h-[54px] rounded-[14px] border-2 border-dashed border-accent text-accent text-base font-semibold hover:bg-accent/10"
              >
                {t.joinWaitlistCta}
              </button>
            </div>
          ) : (
            Object.entries(groupedSlots).map(([serviceName, serviceSlots]) => (
              <div key={serviceName} className="mb-4 last:mb-0">
                <p className="text-[13px] font-semibold text-ink-faint uppercase tracking-[0.1em] mb-1">{serviceName}</p>
                <p className="text-[13px] font-semibold text-status-available mb-2.5">{t.tablesLeft}</p>
                <div className="grid grid-cols-3 gap-2">
                  {serviceSlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      onClick={() => pickSlot(slot)}
                      className={`h-12 rounded-[14px] grid place-items-center tabular-nums ${
                        selectedSlot?.startsAt === slot.startsAt ? "bg-ink-dark text-white" : "bg-surface text-ink hover:bg-line"
                      }`}
                    >
                      <span className="font-serif text-[26px] leading-none">{formatTime(new Date(slot.startsAt), locale)}</span>
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
          <div className="rounded-xl border-2 border-dashed border-line-strong p-4 mb-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint mb-2">{t.yourReservation}</p>
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
              value={formatTime(new Date(selectedSlot.startsAt), locale)}
            />
          </div>

          {knownFullName && !editingKnownCustomer ? (
            <div className="rounded-xl bg-surface px-4 py-3 mb-3">
              <p className="text-sm">{t.areYouX(knownFullName)}</p>
              <p className="text-[13px] text-ink-muted mt-1">
                {t.emailShownLabel}: {email}
              </p>
              <button onClick={() => setEditingKnownCustomer(true)} className="text-[13px] text-accent underline mt-1.5">
                {t.fixMyData}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 mb-3">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t.firstNameLabel}
                className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t.lastNameLabel}
                className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.phoneLabel}
                className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
              />
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            rows={2}
            className="w-full rounded-xl bg-surface-2 border border-line-strong px-3.5 py-3 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent resize-none mb-3"
          />

          <div className="rounded-xl bg-status-available/10 border border-status-available/40 px-4 py-3 text-[13px] font-semibold text-status-available mb-4">
            {t.availableMsg}
          </div>

          {error && <p className="text-sm text-status-occupied mb-3">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full h-[54px] rounded-[14px] bg-ink-dark text-white text-base font-semibold disabled:opacity-40"
          >
            {submitting ? t.sending : t.confirmCta}
          </button>
        </StepCard>
      )}

      {step === "confirmed" && confirmed && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-dark text-on-dark">
          <div className="mx-auto max-w-sm px-5 py-10">
            <p className="flex items-center gap-2 text-sm font-semibold text-free-on-dark">
              <span className="w-2 h-2 rounded-full bg-free-on-dark ring-4 ring-free-on-dark/25" />
              {t.confirmedTitle}
            </p>
            <h2 className="font-serif text-[54px] leading-[0.95] mt-3 mb-7">{t.thanksName(firstName || knownCustomer?.firstName || "")}</h2>

            <div className="talon bg-ground text-ink rounded-2xl">
              <div className="px-6 pt-6 pb-8">
                <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{restaurant.name}</p>
                {restaurant.address && <p className="text-sm text-ink-muted mt-1">{restaurant.address}</p>}
                <p className="font-serif text-[64px] leading-none mt-5 tabular-nums">
                  {formatTime(new Date(confirmed.startsAt), locale)}
                </p>
                <p className="text-base text-ink-muted mt-2 capitalize">
                  {new Date(confirmed.startsAt).toLocaleDateString(LOCALE_TAG[locale], {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <div className="border-t-2 border-dashed border-line-strong" />
              <div className="px-6 pt-8 pb-6 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-serif text-[34px] leading-none truncate">
                    {[firstName || knownCustomer?.firstName, lastName || knownCustomer?.lastName].filter(Boolean).join(" ")}
                  </p>
                  <p className="text-[13px] text-ink-faint mt-2">
                    {t.referenceLabel} · <span className="font-mono">{confirmed.id.slice(0, 8).toUpperCase()}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-serif text-[64px] leading-none">{partySize}</p>
                  <p className="text-[13px] text-ink-faint">{t.people.toLowerCase()}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-on-dark-faint mt-6">{t.confirmedNote}</p>
          </div>
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
              className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t.lastNameLabel}
              className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phoneLabel}
              className="w-full h-[50px] rounded-xl bg-surface-2 border border-line-strong px-3.5 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-status-occupied mt-3">{error}</p>}

          <button
            onClick={handleWaitlistConfirm}
            disabled={submitting}
            className="w-full h-[54px] rounded-[14px] bg-ink-dark text-white text-base font-semibold disabled:opacity-40 mt-4"
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
          <h2 className="font-serif text-4xl mb-2">{t.waitlistConfirmedTitle}</h2>
          <p className="text-sm text-ink-muted">
            {partySize} {t.people.toLowerCase()} · {restaurant.name}
          </p>
          <p className="text-sm text-ink-muted mt-4">{t.waitlistConfirmedNote}</p>
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
          <button onClick={onBack} className="text-ink-muted hover:text-ink text-xl w-11 h-11 -ml-3 grid place-items-center" aria-label="Volver">
            ←
          </button>
        )}
        <h2 className="font-serif text-[38px] leading-none">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-ink-muted mb-5">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-[15px] py-1">
      <span className="text-ink-muted capitalize">{label}</span>
      <span className="font-medium capitalize text-right">{value}</span>
    </div>
  );
}
