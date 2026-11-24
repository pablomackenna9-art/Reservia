import { useState } from "react";
import type { Table } from "@reservia/core";
import { Modal } from "../../components/ui";

/** Reparto sugerido de una mesa grande en módulos medianos (de 4) y chicos (de 2 o lo que sobre): 10 → 4 + 4 + 2. */
export function suggestSplit(capacity: number): number[] {
  let remaining = Math.max(2, Math.round(capacity));
  const parts: number[] = [];
  while (remaining >= 4 && parts.length < 5) {
    parts.push(4);
    remaining -= 4;
  }
  if (remaining > 0) parts.push(remaining);
  if (parts.length === 1) return [Math.ceil(parts[0]! / 2), Math.floor(parts[0]! / 2)].filter((p) => p > 0);
  return parts;
}

const LETTERS = "ABCDEF";

/**
 * Divide una mesa grande en módulos SIN moverla: los módulos se reparten dentro del mismo espacio que ocupaba la
 * mesa, así el plano queda igual y se entiende de qué partes está hecha. Cada módulo es una mesa real que puede
 * reservarse por separado y, si se aparta, vuelve exactamente a su lugar.
 */
export function SplitTableModal({
  table,
  onClose,
  onConfirm,
}: {
  table: Table;
  onClose: () => void;
  onConfirm: (capacities: number[]) => Promise<void>;
}) {
  const [parts, setParts] = useState<number[]>(() => suggestSplit(table.capacityMax));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = parts.reduce((s, p) => s + p, 0);
  const matches = total === table.capacityMax;

  function change(index: number, delta: number) {
    setParts((cur) => cur.map((p, i) => (i === index ? Math.min(12, Math.max(1, p + delta)) : p)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(parts);
      onClose();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudo dividir la mesa.");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Dividir la mesa ${table.name} en módulos`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px] text-ink-muted">
          La mesa no se mueve ni cambia de tamaño: se reparte en partes dentro del mismo espacio. Cada parte es una mesa real, con su número, que se puede reservar sola. Un grupo grande usa
          todas juntas.
        </p>

        <ul className="space-y-2">
          {parts.map((p, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl bg-ground px-3 py-2">
              <span className="font-serif text-xl w-20 shrink-0">
                {table.name}-{LETTERS[i]}
              </span>
              <button type="button" onClick={() => change(i, -1)} className="h-10 w-10 rounded-[10px] bg-surface-2 text-lg font-semibold" aria-label="Menos asientos">
                −
              </button>
              <span className="w-24 text-center text-[15px]">
                <span className="font-semibold">{p}</span> {p === 1 ? "persona" : "personas"}
              </span>
              <button type="button" onClick={() => change(i, 1)} className="h-10 w-10 rounded-[10px] bg-surface-2 text-lg font-semibold" aria-label="Más asientos">
                +
              </button>
              {parts.length > 2 && (
                <button type="button" onClick={() => setParts((cur) => cur.filter((_, j) => j !== i))} className="ml-auto text-[13px] font-semibold text-status-occupied">
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>

        {parts.length < 6 && (
          <button type="button" onClick={() => setParts((cur) => [...cur, 2])} className="text-[15px] font-semibold text-accent">
            + Agregar un módulo
          </button>
        )}

        <p className={`text-[13px] ${matches ? "text-status-available" : "text-status-arriving"}`}>
          {matches
            ? `Suma ${total} personas, igual que la mesa actual.`
            : `Suma ${total} personas y la mesa actual es de ${table.capacityMax}: la mesa quedará con capacidad ${total}.`}
        </p>

        {error && <p className="text-[15px] text-status-occupied">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-12 px-5 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60"
          >
            {busy ? "Dividiendo…" : `Dividir en ${parts.length} módulos`}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-4 rounded-[10px] text-[15px] font-semibold text-ink-muted">
            Cancelar
          </button>
        </div>
        <p className="text-[13px] text-ink-faint">Se puede deshacer cuando quieras: la mesa vuelve a ser una sola, exactamente como estaba.</p>
      </div>
    </Modal>
  );
}
