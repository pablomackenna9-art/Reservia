/** Dónde vive la página pública de reservas y la API de POS (la app "booking"). Se puede cambiar con VITE_BOOKING_URL. */
export const BOOKING_BASE_URL: string = (
  (import.meta.env.VITE_BOOKING_URL as string | undefined) ?? "https://reservia-booking-seven.vercel.app"
).replace(/\/+$/, "");

export const POS_API_URL = `${BOOKING_BASE_URL}/api/pos`;

export function bookingUrlFor(slug: string): string {
  return `${BOOKING_BASE_URL}/${slug}`;
}
