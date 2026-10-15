import type { ReservationStatus } from "@reservia/core";
import { reservationVisualState, stateCssColor } from "../../lib/stateStyle";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  arriving: "Por llegar",
  seated: "Sentados",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

/** Color CSS por estado de reserva, derivado de la gramática de estados (sigue al tema). */
export const RESERVATION_STATUS_COLOR: Record<ReservationStatus, string> = Object.fromEntries(
  (["pending", "confirmed", "arriving", "seated", "completed", "cancelled", "no_show"] as const).map((s) => [
    s,
    stateCssColor(reservationVisualState(s)),
  ]),
) as Record<ReservationStatus, string>;

/** What a reservation can move to next, from wherever it is now. */
export const NEXT_STATUS_ACTIONS: Partial<Record<ReservationStatus, { label: string; status: ReservationStatus }[]>> = {
  pending: [{ label: "Confirmar", status: "confirmed" }],
  confirmed: [
    { label: "Marcar llegada", status: "arriving" },
    { label: "Cancelar", status: "cancelled" },
  ],
  arriving: [
    { label: "Sentar", status: "seated" },
    { label: "No-show", status: "no_show" },
  ],
  seated: [{ label: "Completar", status: "completed" }],
};
