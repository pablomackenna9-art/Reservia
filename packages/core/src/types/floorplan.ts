import { z } from "zod";

export const zoneSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  name: z.string().min(1),
  type: z.string(),
  sortOrder: z.number().int(),
  /** Logical canvas size for this zone. Table positions are 0–100% of this box. */
  width: z.number().positive(),
  height: z.number().positive(),
  active: z.boolean(),
});
export type Zone = z.infer<typeof zoneSchema>;

export const TABLE_SHAPES = ["round", "square", "rectangle"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const tableSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  zoneId: z.string().uuid(),
  name: z.string().min(1),
  number: z.number().int().nullable(),
  shape: z.enum(TABLE_SHAPES),
  capacityMin: z.number().int().positive(),
  capacityMax: z.number().int().positive(),
  /** 0–100, percent of the zone's logical canvas — resolution independent. */
  positionX: z.number().min(0).max(100),
  positionY: z.number().min(0).max(100),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(0).max(359).default(0),
  active: z.boolean(),
  joinable: z.boolean().default(false),
});
export type Table = z.infer<typeof tableSchema>;

export const TABLE_LIVE_STATUSES = [
  "available",
  "reserved",
  "arriving",
  "occupied",
  "paying",
  "blocked",
] as const;
export type TableLiveStatusValue = (typeof TABLE_LIVE_STATUSES)[number];

export const tableLiveStatusSchema = z.object({
  tableId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  status: z.enum(TABLE_LIVE_STATUSES),
  currentReservationId: z.string().uuid().nullable(),
  occupiedSince: z.string().nullable(),
  blockedReason: z.string().nullable(),
  updatedAt: z.string(),
});
export type TableLiveStatus = z.infer<typeof tableLiveStatusSchema>;
