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
  /** Temporarily out of service (broken, reserved for a private event) — distinct from `active`, which is a soft delete. */
  blocked: z.boolean().default(false),
  blockedReason: z.string().nullable().default(null),
  /** Mesa larga a la que pertenece como módulo (ej. 10-A, 10-B, 10-C); null/ausente = mesa normal. */
  layoutId: z.string().uuid().nullable().optional(),
  /** Lugar de origen del módulo dentro de su mesa larga: a dónde vuelve con "Devolver a su lugar". */
  homeX: z.number().nullable().optional(),
  homeY: z.number().nullable().optional(),
  homeRotation: z.number().nullable().optional(),
  homeWidth: z.number().nullable().optional(),
  homeHeight: z.number().nullable().optional(),
});
export type Table = z.infer<typeof tableSchema>;

/** ¿Es un módulo que se apartó de su lugar en la mesa larga? (false si no es módulo o está en su sitio.) */
export function isModuleDetached(t: Pick<Table, "positionX" | "positionY" | "rotation" | "homeX" | "homeY" | "homeRotation">): boolean {
  if (t.homeX == null || t.homeY == null) return false;
  const moved = Math.hypot(t.positionX - t.homeX, t.positionY - t.homeY) > 0.6;
  const turned = t.homeRotation != null && Math.abs(((((t.rotation - t.homeRotation + 540) % 360) + 360) % 360) - 180) > 1.5;
  return moved || turned;
}

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

/** Decoración del plano: solo dibujo (no se reserva ni cuenta como mesa). */
export const DECOR_KINDS = ["plant", "tree", "planter", "column", "wall", "door", "bar", "sofa"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Nombre en el panel y tamaño inicial (mismas unidades que el ancho/alto de una mesa). */
export const DECOR_META: Record<DecorKind, { label: string; width: number; height: number }> = {
  plant: { label: "Planta", width: 46, height: 46 },
  tree: { label: "Árbol", width: 86, height: 86 },
  planter: { label: "Jardinera", width: 120, height: 36 },
  column: { label: "Columna", width: 30, height: 30 },
  wall: { label: "Muro", width: 130, height: 14 },
  door: { label: "Puerta", width: 62, height: 62 },
  bar: { label: "Barra", width: 190, height: 52 },
  sofa: { label: "Sofá / banqueta", width: 200, height: 44 },
};

export const zoneDecorSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  zoneId: z.string().uuid(),
  kind: z.enum(DECOR_KINDS),
  /** 0–100, porcentaje del lienzo de la zona (igual que las mesas). */
  positionX: z.number().min(0).max(100),
  positionY: z.number().min(0).max(100),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(0).max(359).default(0),
});
export type ZoneDecor = z.infer<typeof zoneDecorSchema>;
