/** Dónde vive la página pública de reservas y la API de POS (la app "booking"). Se puede cambiar con VITE_BOOKING_URL. */
export const BOOKING_BASE_URL: string = (
  (import.meta.env.VITE_BOOKING_URL as string | undefined) ?? "https://reservia-booking-seven.vercel.app"
).replace(/\/+$/, "");

export const POS_API_URL = `${BOOKING_BASE_URL}/api/pos`;

export function bookingUrlFor(slug: string): string {
  return `${BOOKING_BASE_URL}/${slug}`;
}

/** La carta pública del restaurante (solo para mirar). */
export function menuUrlFor(slug: string): string {
  return `${BOOKING_BASE_URL}/${slug}/carta`;
}

/** Lo que abre el QR de una mesa: apunta al código de la mesa física, no a su número. */
export function tableQrUrl(token: string): string {
  return `${BOOKING_BASE_URL}/m/${token}`;
}
