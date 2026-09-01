import { z } from "zod";

export const reservationRulesSchema = z.object({
  restaurantId: z.string().uuid(),
  defaultDurationMinutes: z.number().int().positive(),
  bufferMinutes: z.number().int().nonnegative(),
  minPartySize: z.number().int().positive(),
  maxPartySize: z.number().int().positive(),
  minAdvanceHours: z.number().int().nonnegative(),
  maxAdvanceDays: z.number().int().positive(),
  allowOnlineBooking: z.boolean(),
  averageTicketPerPerson: z.number().nonnegative(),
});
export type ReservationRules = z.infer<typeof reservationRulesSchema>;

export const DEFAULT_RESERVATION_RULES: Omit<ReservationRules, "restaurantId"> = {
  defaultDurationMinutes: 90,
  bufferMinutes: 15,
  minPartySize: 1,
  maxPartySize: 20,
  minAdvanceHours: 1,
  maxAdvanceDays: 60,
  allowOnlineBooking: true,
  averageTicketPerPerson: 0,
};
