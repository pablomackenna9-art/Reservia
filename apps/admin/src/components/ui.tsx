import type { ReactNode } from "react";
import { stateClass, STATE_LABEL, type VisualState } from "../lib/stateStyle";

/** Tabs segmentados: contenedor con padding 4, ítem de 36px, activo en --sf3. */
export function SegTabs<T extends string>({
  options,
  value,
  onChange,
  tone = "surface",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  tone?: "surface" | "surface-2";
}) {
  return (
    <div className={`flex gap-0.5 p-1 rounded-xl max-w-full overflow-x-auto ${tone === "surface" ? "bg-surface" : "bg-surface-2"}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-10 sm:h-9 px-4 shrink-0 rounded-[9px] text-sm whitespace-nowrap transition-colors ${
            o.value === value ? "bg-surface-3 text-ink font-semibold" : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Muestra de 14x14 con la forma de relleno del estado (mismo `.st-*` que usa el plano). */
export function StateSwatch({ state, small = false }: { state: VisualState; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`${stateClass(state)} ${small ? "st-sm" : ""} inline-block shrink-0 h-3.5 w-3.5 rounded-[4px] border-2`}
    />
  );
}

/** Pill de estado: alto 32, swatch + texto. */
export function StatePill({ state, label }: { state: VisualState; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-surface-2 text-sm font-medium whitespace-nowrap">
      <StateSwatch state={state} />
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

type TagTone = "accent" | "danger" | "neutral";

/** Etiqueta (Frecuente, Riesgo no-show, Cumpleaños...). */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  const toneClass =
    tone === "accent"
      ? "bg-accent/15 text-accent"
      : tone === "danger"
        ? "bg-status-occupied/15 text-status-occupied"
        : "bg-surface-3 text-ink-muted";
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-[7px] text-[13px] font-semibold whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}
