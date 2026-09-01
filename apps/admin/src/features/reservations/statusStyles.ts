import type { ReservationStatus } from "@reservia/core";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  arriving: "Por llegar",
  seated: "Sentados",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

export const RESERVATION_STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: "#8a7f6d",
  confirmed: "#5b9bda",
  arriving: "#e0ac4e",
  seated: "#4cae83",
  completed: "#5fb2a8",
  cancelled: "#8a7f6d",
  no_show: "#dd7c68",
};

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
