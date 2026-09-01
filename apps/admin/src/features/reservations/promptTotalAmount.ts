import type { ReservationStatus } from "@reservia/core";

/** Asks for the real bill amount only when a reservation is being marked completed — the one status that means money actually changed hands. */
export function promptTotalAmountIfCompleting(status: ReservationStatus): number | undefined {
  if (status !== "completed") return undefined;
  const input = prompt("¿Cuánto se cobró en total? (opcional, en $ — dejar vacío para omitir)");
  if (!input || !input.trim()) return undefined;
  const parsed = Number(input.replace(/[^\d.]/g, ""));
  return Number.isNaN(parsed) ? undefined : parsed;
}
