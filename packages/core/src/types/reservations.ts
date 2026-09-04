import { z } from "zod";

export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "arriving",
  "seated",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_SOURCES = ["admin", "public_portal", "phone", "walk_in"] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const TABLE_ASSIGNMENT_SOURCES = ["manual", "suggested", "automatic"] as const;
export type TableAssignmentSource = (typeof TABLE_ASSIGNMENT_SOURCES)[number];

export const reservationSchema = z
  .object({
    id: z.string().uuid(),
    restaurantId: z.string().uuid(),
    customerId: z.string().uuid(),
    tableId: z.string().uuid().nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    partySize: z.number().int().positive(),
    status: z.enum(RESERVATION_STATUSES),
    source: z.enum(RESERVATION_SOURCES),
    notes: z.string().nullable(),
    internalNotes: z.string().nullable(),
    totalAmount: z.number().nonnegative().nullable(),
    createdAt: z.string(),
    /** The Smart Table Engine's top pick at assignment time — kept even if staff later override it. */
    suggestedTableId: z.string().uuid().nullable().default(null),
    tableAssignmentSource: z.enum(TABLE_ASSIGNMENT_SOURCES).nullable().default(null),
    /** Post-visita, cargado a mano por el staff hasta que exista un canal para pedirlo automático. */
    feedbackRating: z.number().int().min(1).max(5).nullable().default(null),
    feedbackComment: z.string().nullable().default(null),
  })
  .refine((r) => new Date(r.endsAt) > new Date(r.startsAt), {
    message: "endsAt debe ser posterior a startsAt",
    path: ["endsAt"],
  });
export type Reservation = z.infer<typeof reservationSchema>;

export const WAITLIST_STATUSES = ["waiting", "notified", "seated", "cancelled", "left"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const waitlistEntrySchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  customerId: z.string().uuid(),
  partySize: z.number().int().positive(),
  requestedAt: z.string(),
  estimatedWaitMinutes: z.number().int().nonnegative().nullable(),
  status: z.enum(WAITLIST_STATUSES),
  preferredZoneId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  /** Mayor = se atiende primero. 0 = normal. */
  priority: z.number().int().default(0),
});
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;

/** Public booking form input — the minimal, untrusted shape the portal collects. */
export const publicReservationRequestSchema = z.object({
  restaurantSlug: z.string().min(1),
  partySize: z.number().int().positive().max(30),
  startsAt: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});
export type PublicReservationRequest = z.infer<typeof publicReservationRequestSchema>;
