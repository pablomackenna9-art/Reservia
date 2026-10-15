import { z } from "zod";

export const DAY_NAMES_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export const restaurantHoursSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  serviceName: z.string(),
  opensAt: z.string(), // "HH:MM:SS"
  closesAt: z.string(),
});
export type RestaurantHours = z.infer<typeof restaurantHoursSchema>;

/**
 * Horario de ATENCIÓN del local (lo que ve el cliente como "Abierto hasta las 18:00"), distinto del
 * horario de reserva. Si `closesAt <= opensAt` el tramo cierra pasada la medianoche (ej. 19:00 → 02:00).
 */
export const openingHoursSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  label: z.string(),
  opensAt: z.string(), // "HH:MM:SS"
  closesAt: z.string(),
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;
