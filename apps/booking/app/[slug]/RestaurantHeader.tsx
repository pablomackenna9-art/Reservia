"use client";

import { useState } from "react";
import type { Restaurant, RestaurantHours } from "@reservia/core";
import { DICTIONARIES, LOCALES, formatTime, type Locale } from "./i18n";

const DAY_ORDER_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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

/** Turnos de reserva de hoy (en la zona horaria del restaurante), en orden de hora. */
function todaysServices(hours: RestaurantHours[], now: Date, timezone: string): RestaurantHours[] {
  const { dayOfWeek: dow } = restaurantLocalParts(timezone, now);
  return hours.filter((h) => h.dayOfWeek === dow).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

export function RestaurantHeader({
  restaurant,
  hours,
  locale,
  onLocaleChange,
}: {
  restaurant: Restaurant;
  hours: RestaurantHours[];
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [showHours, setShowHours] = useState(false);
  const t = DICTIONARIES[locale];
  const now = new Date();
  const todays = todaysServices(hours, now, restaurant.timezone);

  const groupedHours = [0, 1, 2, 3, 4, 5, 6]
    .map((dow) => ({ dow, services: hours.filter((h) => h.dayOfWeek === dow) }))
    .filter((g) => g.services.length > 0);

  return (
    <div className="mb-6">
      <div className="flex justify-end mb-5">
        <div className="flex gap-0.5 p-1 rounded-full bg-surface">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => onLocaleChange(l)}
              className={`h-8 px-3 rounded-full text-[13px] font-semibold ${
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
          <img src={restaurant.logoUrl} alt="" className="h-24 w-auto max-w-full object-contain object-left" />
          <h1 className="sr-only">{restaurant.name}</h1>
        </>
      ) : (
        <h1 className="font-serif text-[38px] leading-none">{restaurant.name}</h1>
      )}
      {restaurant.address && <p className="text-sm text-ink-muted mt-2">{restaurant.address}</p>}

      <p className={`mt-3 flex items-start gap-2 text-sm font-semibold ${todays.length > 0 ? "text-status-available" : "text-ink-faint"}`}>
        <span
          className={`w-2 h-2 mt-1.5 shrink-0 rounded-full ${todays.length > 0 ? "bg-status-available ring-4 ring-status-available/20" : "bg-ink-faint"}`}
        />
        {todays.length > 0
          ? t.todayHours(todays.map((s) => `${s.serviceName} ${formatHM(s.opensAt, locale)}–${formatHM(s.closesAt, locale)}`).join(" · "))
          : t.closedToday}
      </p>

      <div className="mt-1">
        <button onClick={() => setShowHours((v) => !v)} className="text-sm text-accent underline underline-offset-2">
          {t.viewHours}
        </button>
      </div>

      {showHours && (
        <div className="mt-3 rounded-xl bg-surface p-4 text-sm space-y-1.5">
          {groupedHours.map(({ dow, services }) => (
            <div key={dow} className="flex justify-between gap-3">
              <span className="text-ink-muted shrink-0">{DAY_ORDER_ES[dow]}</span>
              <span className="text-ink text-right">
                {services.map((s) => `${s.serviceName}: ${formatHM(s.opensAt, locale)}–${formatHM(s.closesAt, locale)}`).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
