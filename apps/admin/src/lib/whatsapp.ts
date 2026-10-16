import { BOOKING_BASE_URL } from "./config";

/**
 * Número listo para wa.me (solo dígitos con código de país). Acepta formatos chilenos habituales:
 * "9 7667 2852", "+56 9 7667 2852", "56976672852", "76672852" (8 dígitos: se asume móvil 9).
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("56") && digits.length >= 11) return digits;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  if (digits.length === 8) return `569${digits}`;
  return digits;
}

export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export function confirmationLink(token: string): string {
  return `${BOOKING_BASE_URL}/c/${token}`;
}

/** El mensaje que recibe el cliente cuando el restaurante acepta su reserva: lo invita a re-confirmar con su enlace personal. */
export function confirmationMessage(opts: {
  customerName: string;
  restaurantName: string;
  startsAt: string;
  timezone: string;
  partySize: number;
  zoneName?: string | null;
  link: string;
}): string {
  const d = new Date(opts.startsAt);
  const date = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: opts.timezone });
  const time = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: opts.timezone });
  const first = opts.customerName.trim().split(/\s+/)[0] ?? "";
  return [
    `Hola ${first}, tu reserva en ${opts.restaurantName} está aceptada: ${date} a las ${time}, ${opts.partySize} ${opts.partySize === 1 ? "persona" : "personas"}${opts.zoneName ? ` (${opts.zoneName})` : ""}.`,
    "",
    `Por favor confirma que vienes aquí (si no puedes, avísanos en el mismo enlace y liberamos tu mesa):`,
    opts.link,
    "",
    "¡Te esperamos!",
  ].join("\n");
}
