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
