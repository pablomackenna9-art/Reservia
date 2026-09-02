import { useEffect, useState } from "react";
import {
  addMockCheckItem,
  closeMockCheck,
  listMockCheckItems,
  listOpenMockChecks,
  listTables,
  openMockCheck,
  registerMockPayment,
} from "@reservia/api-client";
import type { PosCheck, PosCheckItem, Table } from "@reservia/core";
import { supabase } from "../../lib/supabase";

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  partially_paid: "Pago parcial",
  paid: "Pagada",
};

/**
 * Sin ningún proveedor real conectado, esto simula lo que Lightspeed/Oracle
 * Simphony/ICG reportarían — mesa, consumo, pago — para poder ver y probar
 * la cadena Mesa → Cuenta → Pago → Visita cerrada antes de que exista una
 * cuenta real con cualquiera de ellos.
 */
export function MockPosSimulator({ restaurantId, connectionId }: { restaurantId: string; connectionId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [checks, setChecks] = useState<PosCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTableId, setOpenTableId] = useState("");
  const [openPartySize, setOpenPartySize] = useState(2);

  async function reload() {
    const [t, c] = await Promise.all([listTables(supabase, restaurantId), listOpenMockChecks(supabase, restaurantId)]);
    setTables(t);
    setChecks(c);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const openTableIds = new Set(checks.map((c) => c.externalTableId));
  const availableTables = tables.filter((t) => !openTableIds.has(t.id));

  async function handleOpenCheck() {
    if (!openTableId) return;
    await openMockCheck(supabase, {
      restaurantId,
      posConnectionId: connectionId,
      tableId: openTableId,
      partySize: openPartySize,
    });
    setOpenTableId("");
    reload();
  }

  if (loading) return <p className="text-xs text-ink-faint mt-4">Cargando simulador…</p>;

  return (
    <div className="mt-6">
      <h2 className="text-xs uppercase tracking-wide text-ink-faint mb-2">Simulador MockPOS</h2>
      <p className="text-xs text-ink-faint mb-3 max-w-2xl">
        Corre 100% dentro de Reservia — sin ningún POS real detrás. Sirve para ver cómo se va a ver una mesa con
        consumo real una vez que conectes un proveedor de verdad.
      </p>

      <div className="rounded-xl border border-line bg-surface p-4 mb-3">
        <p className="text-sm font-medium mb-2">Abrir cuenta</p>
        {availableTables.length === 0 ? (
          <p className="text-xs text-ink-faint">Todas las mesas ya tienen una cuenta mock abierta.</p>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={openTableId}
              onChange={(e) => setOpenTableId(e.target.value)}
              className="rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Mesa…</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={openPartySize}
              onChange={(e) => setOpenPartySize(Number(e.target.value))}
              className="w-16 rounded-lg bg-ground border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={handleOpenCheck}
              disabled={!openTableId}
              className="rounded-lg bg-accent text-accent-ink px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              Abrir
            </button>
          </div>
        )}
      </div>

      {checks.length === 0 ? (
        <p className="text-xs text-ink-faint">Ninguna cuenta mock abierta ahora mismo.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {checks.map((check) => (
            <MockCheckCard
              key={check.id}
              check={check}
              tableName={tables.find((t) => t.id === check.externalTableId)?.name ?? "?"}
              restaurantId={restaurantId}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MockCheckCard({
  check,
  tableName,
  restaurantId,
  onChanged,
}: {
  check: PosCheck;
  tableName: string;
  restaurantId: string;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<PosCheckItem[]>([]);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  useEffect(() => {
    listMockCheckItems(supabase, check.id).then(setItems);
  }, [check.id, check.total]);

  const remaining = Math.max(0, check.total - check.paidAmount);

  async function handleAddItem() {
    const price = Number(itemPrice);
    if (!itemName.trim() || !price) return;
    await addMockCheckItem(supabase, {
      restaurantId,
      checkId: check.id,
      name: itemName.trim(),
      quantity: 1,
      unitPrice: price,
    });
    setItemName("");
    setItemPrice("");
    onChanged();
  }

  async function handlePay() {
    const amount = Number(paymentAmount) || remaining;
    if (!amount) return;
    await registerMockPayment(supabase, { restaurantId, checkId: check.id, amount });
    setPaymentAmount("");
    onChanged();
  }

  async function handleClose() {
    await closeMockCheck(supabase, check.id, check.visitId);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">
          Mesa {tableName} · {check.guestCount ?? "—"}p
        </p>
        <span className="text-xs rounded-full border border-line px-2 py-0.5 text-ink-faint">
          {STATUS_LABEL[check.status] ?? check.status}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="text-xs text-ink-muted mb-2 space-y-0.5">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="truncate">{item.name}</span>
              <span className="tabular-nums shrink-0">{formatCLP(item.total)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm mb-3 pt-2 border-t border-line">
        <span className="text-ink-faint">Total</span>
        <span className="font-medium tabular-nums">{formatCLP(check.total)}</span>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Producto"
          className="flex-1 min-w-0 rounded-lg bg-ground border border-line px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <input
          type="number"
          value={itemPrice}
          onChange={(e) => setItemPrice(e.target.value)}
          placeholder="Precio"
          className="w-24 rounded-lg bg-ground border border-line px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          onClick={handleAddItem}
          className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs hover:border-accent shrink-0"
        >
          + Agregar
        </button>
      </div>

      {remaining > 0 ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder={`Pagar (${formatCLP(remaining)})`}
            className="flex-1 min-w-0 rounded-lg bg-ground border border-line px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <button
            onClick={handlePay}
            className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium shrink-0"
          >
            Registrar pago
          </button>
        </div>
      ) : (
        <button
          onClick={handleClose}
          className="w-full rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs hover:border-accent"
        >
          Cerrar cuenta y liberar mesa
        </button>
      )}
    </div>
  );
}
