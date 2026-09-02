/**
 * Contrato universal para proveedores de pago (Mercado Pago, Transbank) usados
 * para garantías/prepagos de reservas — deliberadamente separado de
 * `PosAdapter` (`../pos/adapter`): POS mueve mesas, cuentas y consumo;
 * Payments mueve dinero de una reserva puntual. Fase 1 solo fija esta forma
 * — ningún adapter existe todavía, y esta capa siempre se asocia a un
 * `reservationId` interno explícito, nunca inferida por monto.
 */

export type PaymentIntentStatus = "pending" | "confirmed" | "failed" | "refunded";

export interface PaymentIntentResult {
  externalPaymentIntentId: string;
  status: PaymentIntentStatus;
}

export interface PaymentAdapter {
  readonly provider: string;

  createPaymentIntent(reservationId: string, amountClp: number): Promise<PaymentIntentResult>;

  confirmPayment(externalPaymentIntentId: string): Promise<PaymentIntentResult>;

  refund(externalPaymentIntentId: string, amountClp?: number): Promise<void>;
}
