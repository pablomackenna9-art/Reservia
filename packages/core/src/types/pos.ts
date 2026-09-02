import { z } from "zod";

/**
 * Fase 1 de integraciones POS/Pagos: solo los tipos que respaldan las tablas
 * creadas en `0014_pos_foundations.sql`. Ningún proveedor real está
 * conectado todavía — ver `PosAdapter`/`PaymentAdapter` en
 * `@reservia/api-client` para el contrato que un proveedor futuro deberá
 * implementar.
 */

export const POS_PROVIDERS = ["mock", "oracle_simphony", "lightspeed", "icg"] as const;
export type PosProvider = (typeof POS_PROVIDERS)[number];

export const VISIT_STATUSES = ["seated", "consuming", "paying", "closed"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** La visita física real a una mesa — distinta de una reserva (intención) y de una cuenta POS (dinero). */
export const visitSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  tableId: z.string().uuid().nullable(),
  reservationId: z.string().uuid().nullable(),
  customerId: z.string().uuid().nullable(),
  partySize: z.number().int().positive(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.enum(VISIT_STATUSES),
});
export type Visit = z.infer<typeof visitSchema>;

export const POS_CONNECTION_STATUSES = ["disconnected", "connected", "error"] as const;
export type PosConnectionStatus = (typeof POS_CONNECTION_STATUSES)[number];

export const posConnectionSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  provider: z.enum(POS_PROVIDERS),
  externalLocationId: z.string().nullable(),
  status: z.enum(POS_CONNECTION_STATUSES),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type PosConnection = z.infer<typeof posConnectionSchema>;

export const posTableMappingSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  posConnectionId: z.string().uuid(),
  tableId: z.string().uuid(),
  externalTableId: z.string().min(1),
});
export type PosTableMapping = z.infer<typeof posTableMappingSchema>;

export const POS_CHECK_STATUSES = ["open", "partially_paid", "paid", "closed", "cancelled"] as const;
export type PosCheckStatus = (typeof POS_CHECK_STATUSES)[number];

export const posCheckSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  posConnectionId: z.string().uuid().nullable(),
  visitId: z.string().uuid().nullable(),
  externalCheckId: z.string(),
  externalTableId: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  subtotal: z.number(),
  taxes: z.number(),
  discounts: z.number(),
  total: z.number(),
  paidAmount: z.number(),
  guestCount: z.number().int().positive().nullable(),
  status: z.enum(POS_CHECK_STATUSES),
});
export type PosCheck = z.infer<typeof posCheckSchema>;

export const posCheckItemSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  checkId: z.string().uuid(),
  externalItemId: z.string().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});
export type PosCheckItem = z.infer<typeof posCheckItemSchema>;

export const posPaymentSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  checkId: z.string().uuid(),
  externalPaymentId: z.string().nullable(),
  amount: z.number(),
  paymentMethod: z.string().nullable(),
  paidAt: z.string(),
});
export type PosPayment = z.infer<typeof posPaymentSchema>;
