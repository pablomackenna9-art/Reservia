import { useEffect, useState } from "react";
import { getOpenCheckForReservation, listConsumptionItems, type ConsumptionItemInput } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/**
 * Reemplaza el viejo prompt() de "¿cuánto se cobró?" -- pide el consumo real
 * (con o sin detalle de productos) para que quede historial de qué pidió
 * cada cliente, no solo un monto suelto. Siempre arranca con una línea
 * genérica "Consumo" editable -- para completar rápido alcanza con ponerle
 * el monto ahí; "+ agregar producto" es solo para quien quiera itemizar.
 */
export function CompleteReservationModal({
  reservationId,
  customerName,
  onCancel,
  onConfirm,
  onSkip,
}: {
  reservationId: string;
  customerName: string;
  onCancel: () => void;
  onConfirm: (items: ConsumptionItemInput[]) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<ConsumptionItemInput[]>([{ name: "Consumo", quantity: 1, unitPrice: 0 }]);
  const [alreadyTracked, setAlreadyTracked] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(true);

  useEffect(() => {
    getOpenCheckForReservation(supabase, reservationId).then(async (check) => {
      if (!check) {
        setLoadingPrefill(false);
        return;
      }
      const existingItems = await listConsumptionItems(supabase, check.id);
      if (existingItems.length > 0) {
        setItems(existingItems.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })));
        setAlreadyTracked(check.total);
      }
      setLoadingPrefill(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function updateItem(index: number, patch: Partial<ConsumptionItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    setSaving(true);
    const cleaned = items.filter((item) => item.name.trim() && item.unitPrice > 0);
    await onConfirm(cleaned);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 px-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold mb-1">Completar reserva</h2>
        <p className="text-xs text-ink-faint mb-4">
          {customerName} — qué consumió, para llevar historial real.
          {alreadyTracked > 0 && " Ya venía con consumo cargado desde \"Cuenta actual\" — revisalo antes de confirmar."}
        </p>

        <div className="space-y-2 mb-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={item.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                placeholder="Producto"
                className="flex-1 min-w-0 rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value)) })}
                className="w-12 rounded-lg bg-ground border border-line px-1.5 py-1.5 text-sm text-center outline-none focus:border-accent"
              />
              <input
                type="number"
                min={0}
                value={item.unitPrice || ""}
                onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                placeholder="$"
                className="w-24 rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} className="text-ink-faint hover:text-status-occupied text-sm shrink-0" aria-label="Quitar">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addItem} className="text-xs text-accent mb-4">
          + Agregar producto
        </button>

        <div className="flex items-center justify-between text-sm pt-3 border-t border-line mb-4">
          <span className="text-ink-faint">Total</span>
          <span className="font-semibold tabular-nums">{formatCLP(total)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button onClick={onSkip} className="text-xs text-ink-faint hover:text-ink">
            Completar sin cargar monto
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-ink-muted">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || total <= 0}
              className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Completar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
