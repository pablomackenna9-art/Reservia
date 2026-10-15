"use client";

import { useState } from "react";
import type { OpeningHours, Restaurant } from "@reservia/core";
import { DICTIONARIES, LOCALES, LOCALE_TAG, formatTime, type Locale } from "./i18n";

function formatHM(time: string, locale: Locale): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return formatTime(d, locale);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Día de la semana y minutos desde medianoche, en la zona horaria del
 * restaurante -- no la del server ni la del visitante. Sin esto, `now.getDay()`
 * / `now.getHours()` leen la zona local del runtime (el server de Vercel corre
 * en UTC, el browser en la del visitante), así que el render inicial del
 * server y la hidratación en el cliente pueden calcular un "abierto/cerrado"
 * distinto para el mismo instante real -- eso es lo que dispara el mismatch.
 */
function restaurantLocalParts(timezone: string, at: Date): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { dayOfWeek: WEEKDAY_INDEX[weekday] ?? 0, minutes: hour * 60 + minute };
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface Block {
  dow: number;
  start: number;
  /** Minutos desde la medianoche de `dow`; pasa de 1440 si el tramo cierra después de medianoche. */
  end: number;
}

function toBlock(h: OpeningHours): Block {
  const start = minutesOf(h.opensAt);
  let end = minutesOf(h.closesAt);
  if (end <= start) end += 1440;
  return { dow: h.dayOfWeek, start, end };
}

function hmFromMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type OpenStatus = { open: true; until: string; reopensAt: string | null } | { open: false; opensAt: string | null };

/** ¿Está abierto ahora? Hasta cuándo, y si hay una pausa, a qué hora reabre ese mismo día. null = el restaurante no cargó horario de atención. */
function openStatus(hours: OpeningHours[], now: Date, timezone: string): OpenStatus | null {
  if (hours.length === 0) return null;
  const { dayOfWeek: dow, minutes: n } = restaurantLocalParts(timezone, now);
  const blocks = hours.map(toBlock);
  const today = blocks.filter((b) => b.dow === dow).sort((a, b) => a.start - b.start);
  const yesterday = blocks.filter((b) => b.dow === (dow + 6) % 7 && b.end > 1440);

  const spill = yesterday.find((b) => n < b.end - 1440);
  const running = today.find((b) => n >= b.start && n < b.end);
  const closeAt = spill ? spill.end - 1440 : running?.end;

  if (closeAt !== undefined) {
    const next = today.find((b) => b.start > n && b.start > closeAt);
    return { open: true, until: hmFromMinutes(closeAt), reopensAt: next ? hmFromMinutes(next.start) : null };
  }
  const upcoming = today.find((b) => b.start > n);
  return { open: false, opensAt: upcoming ? hmFromMinutes(upcoming.start) : null };
}

export function RestaurantHeader({
  restaurant,
  openingHours,
  locale,
  onLocaleChange,
}: {
  restaurant: Restaurant;
  openingHours: OpeningHours[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [showHours, setShowHours] = useState(false);
  const t = DICTIONARIES[locale];
  const status = openStatus(openingHours, new Date(), restaurant.timezone);

  // Lunes primero; los nombres de los días salen del idioma elegido.
  const days = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    name: new Date(2024, 0, 7 + dow).toLocaleDateString(LOCALE_TAG[locale], { weekday: "long" }),
    services: openingHours.filter((h) => h.dayOfWeek === dow).sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  }));

  return (
    <div className="mb-7 text-center">
      <div className="flex justify-center mb-6">
        <div className="flex gap-0.5 p-1 rounded-full bg-surface">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => onLocaleChange(l)}
              className={`h-8 px-3.5 rounded-full text-[13px] font-semibold ${
                l === locale ? "bg-ink-dark text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {restaurant.logoUrl ? (
        <>
          {/* El logo reemplaza al nombre escrito; el nombre queda para lectores de pantalla y buscadores. */}
          <img src={restaurant.logoUrl} alt="" className="mx-auto h-28 sm:h-32 w-auto max-w-full object-contain" />
          <h1 className="sr-only">{restaurant.name}</h1>
        </>
      ) : (
        <h1 className="font-serif text-[44px] leading-none">{restaurant.name}</h1>
      )}
      {restaurant.address && <p className="text-[15px] text-ink-muted mt-4">{restaurant.address}</p>}

      {status && (
        <p
          className={`mt-4 mx-auto inline-flex items-center gap-2.5 min-h-11 px-4 py-2 rounded-full border text-sm font-semibold text-left ${
            status.open ? "border-status-available/40 bg-status-available/10 text-ink" : "border-line-strong bg-surface text-ink-muted"
          }`}
        >
          <span
            className={`w-2.5 h-2.5 shrink-0 rounded-full ${status.open ? "bg-status-available ring-4 ring-status-available/20" : "bg-ink-faint"}`}
          />
          <span>
            {status.open ? (
              <>
                {t.openNow(formatHM(status.until, locale))}
                {status.reopensAt && <> · {t.reopensAt(formatHM(status.reopensAt, locale))}</>}
              </>
            ) : (
              <>
                {t.closedNow}
                {status.opensAt && <> · {t.opensAt(formatHM(status.opensAt, locale))}</>}
              </>
            )}
          </span>
        </p>
      )}

      {openingHours.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowHours((v) => !v)} className="text-sm text-accent underline underline-offset-2 h-9">
            {t.viewHours}
          </button>
        </div>
      )}

      {showHours && (
        <div className="mt-2 rounded-xl bg-surface p-4 text-sm space-y-1.5 text-left">
          {days.map(({ dow, name, services }) => (
            <div key={dow} className="flex justify-between gap-3">
              <span className="text-ink-muted shrink-0 capitalize">{name}</span>
              <span className="text-ink text-right">
                {services.length === 0
                  ? t.closedDay
                  : services.map((s) => `${formatHM(s.opensAt, locale)}–${formatHM(s.closesAt, locale)}`).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
