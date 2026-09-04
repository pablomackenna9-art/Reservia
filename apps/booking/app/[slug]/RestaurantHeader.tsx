"use client";

import { useState } from "react";
import type { Restaurant, RestaurantHours } from "@reservia/core";
import { DICTIONARIES, LOCALES, LOCALE_LABEL, type Locale } from "./i18n";

const DAY_ORDER_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatHM(time: string, localeTag: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
}

/** ¿Hay algún service de `hours` que cubra el momento actual? Si sí, devuelve hasta cuándo. */
function currentOpenService(hours: RestaurantHours[], now: Date): RestaurantHours | null {
  const dow = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const h of hours) {
    if (h.dayOfWeek !== dow) continue;
    const [oh, om] = h.opensAt.split(":").map(Number);
    const [ch, cm] = h.closesAt.split(":").map(Number);
    const opens = (oh ?? 0) * 60 + (om ?? 0);
    const closes = (ch ?? 0) * 60 + (cm ?? 0);
    if (nowMinutes >= opens && nowMinutes < closes) return h;
  }
  return null;
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
  const openService = currentOpenService(hours, now);

  const groupedHours = [0, 1, 2, 3, 4, 5, 6]
    .map((dow) => ({ dow, services: hours.filter((h) => h.dayOfWeek === dow) }))
    .filter((g) => g.services.length > 0);

  return (
    <div className="text-center mb-6">
      <div className="flex justify-center gap-1 mb-5">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => onLocaleChange(l)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              l === locale ? "bg-accent text-accent-ink" : "text-ink-faint hover:text-ink"
            }`}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>

      {restaurant.logoUrl ? (
        <img src={restaurant.logoUrl} alt={restaurant.name} className="w-20 h-20 mx-auto mb-3 object-contain rounded-full" />
      ) : null}

      <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
      {restaurant.address && <p className="text-xs text-ink-faint mt-1">{restaurant.address}</p>}

      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
        <span className={`w-1.5 h-1.5 rounded-full ${openService ? "bg-status-available" : "bg-ink-faint"}`} />
        {openService ? t.openNow(formatHM(openService.closesAt, "es-CL")) : t.closedNow}
      </div>

      <div className="mt-1.5">
        <button onClick={() => setShowHours((v) => !v)} className="text-xs text-accent underline">
          {t.viewHours}
        </button>
      </div>

      {showHours && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs text-left space-y-1 max-w-xs mx-auto">
          {groupedHours.map(({ dow, services }) => (
            <div key={dow} className="flex justify-between gap-3">
              <span className="text-ink-muted shrink-0">{DAY_ORDER_ES[dow]}</span>
              <span className="text-ink-faint text-right">
                {services.map((s) => `${s.serviceName}: ${formatHM(s.opensAt, "es-CL")}–${formatHM(s.closesAt, "es-CL")}`).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
