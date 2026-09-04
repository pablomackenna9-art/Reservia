"use client";

import type { DayAvailability } from "@reservia/api-client";
import type { Locale } from "./i18n";
import { LOCALE_TAG } from "./i18n";

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DOT_COLOR: Record<DayAvailability, string> = {
  available: "bg-status-available",
  waitlist: "bg-status-arriving",
  closed: "bg-ink-faint",
};

/** Calendario de un mes -- cada día se pinta según `availability` (ver get_month_availability). Días fuera del rango reservable simplemente no aparecen en el mapa y se muestran deshabilitados. */
export function Calendar({
  year,
  month, // 1-12
  selectedDate,
  availability,
  loading,
  locale,
  onSelectDate,
  onNavigate,
}: {
  year: number;
  month: number;
  selectedDate: string | null;
  availability: Map<string, DayAvailability>;
  loading: boolean;
  locale: Locale;
  onSelectDate: (dateISO: string) => void;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Lunes=0 ... Domingo=6, para alinear con el encabezado Lu-Ma-Mi-Ju-Vi-Sa-Do.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  const todayISO = dateToISO(new Date());
  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((dow) =>
    new Date(2026, 0, 4 + dow).toLocaleDateString(LOCALE_TAG[locale], { weekday: "short" }).slice(0, 2),
  );
  const monthLabel = firstOfMonth.toLocaleDateString(LOCALE_TAG[locale], { month: "long", year: "numeric" });

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onNavigate(-1)}
          aria-label="Mes anterior"
          className="w-7 h-7 rounded-full border border-line text-ink-muted hover:text-ink hover:border-accent grid place-items-center"
        >
          ‹
        </button>
        <p className="text-sm font-medium capitalize">{monthLabel}</p>
        <button
          onClick={() => onNavigate(1)}
          aria-label="Mes siguiente"
          className="w-7 h-7 rounded-full border border-line text-ink-muted hover:text-ink hover:border-accent grid place-items-center"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="text-center text-[10px] text-ink-faint uppercase">
            {label}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const dateISO = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = availability.get(dateISO);
          const isPast = dateISO < todayISO;
          const disabled = isPast || status === "closed" || status === undefined;
          const selected = dateISO === selectedDate;

          return (
            <button
              key={dateISO}
              disabled={disabled}
              onClick={() => onSelectDate(dateISO)}
              className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition-colors ${
                selected
                  ? "bg-accent text-accent-ink font-semibold"
                  : disabled
                    ? "text-ink-faint/50 cursor-not-allowed"
                    : "text-ink hover:bg-surface-2 border border-line"
              }`}
            >
              <span>{day}</span>
              {!disabled && status && <span className={`w-1 h-1 rounded-full ${selected ? "bg-accent-ink" : DOT_COLOR[status]}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
