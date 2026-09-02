import type { PosCheck, PosConnection, PosProvider } from "@reservia/core";

/**
 * Contrato universal que cualquier adapter de POS (MockPOS, Lightspeed,
 * Oracle Simphony, ICG...) deberá implementar. Fase 1 solo fija esta forma —
 * ningún adapter existe todavía. Cuando exista uno, vivirá en
 * `./{provider}/adapter.ts` y el resto de la plataforma seguirá hablando
 * solo con esta interfaz, nunca con el formato específico del proveedor.
 */

export interface PosExternalTable {
  externalTableId: string;
  name: string;
}

export type PosAdapterCredentials = Record<string, unknown>;

export interface PosAdapter {
  readonly provider: PosProvider;

  /** Intercambia credenciales por una conexión activa. Las credenciales nunca se guardan en texto plano — el adapter es responsable de dejarlas en Supabase Vault y solo persistir el `credentials_secret_id`. */
  connect(restaurantId: string, credentials: PosAdapterCredentials): Promise<PosConnection>;

  disconnect(connectionId: string): Promise<void>;

  /** Mesas tal como las conoce el proveedor — insumo para armar `pos_table_mappings` a mano, nunca inferido por nombre. */
  getTables(connectionId: string): Promise<PosExternalTable[]>;

  /** Respaldo por polling para proveedores sin webhooks, o para resincronizar tras una caída. */
  getOpenChecks(connectionId: string): Promise<PosCheck[]>;

  getCheck(connectionId: string, externalCheckId: string): Promise<PosCheck | null>;
}
