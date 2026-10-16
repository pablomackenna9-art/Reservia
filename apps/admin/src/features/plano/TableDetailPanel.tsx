import { useEffect, useState } from "react";
import {
  currentOrNextReservation,
  findTurnoverConflict,
  minutesSince,
  tableStatusLabel,
  type PosCheck,
  type PosCheckItem,
  type ReservationStatus,
  type Table,
  type TableLiveStatusValue,
} from "@reservia/core";
import {
  addConsumptionItem,
  ensureOpenCheck,
  getOpenCheckForReservation,
  assignCandidateToReservation,
  joinTables,
  listConsumptionItems,
  removeConsumptionItem,
  type ReservationWithDetails,
  type TableGroupInfo,
} from "@reservia/api-client";
import type { TableAssignmentSource, TableCandidate } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { StatePill } from "../../components/ui";
import { tableVisualState } from "../../lib/stateStyle";
import { NEXT_STATUS_ACTIONS, RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";
import { TableAssignmentPicker } from "../reservations/TableAssignmentPicker";
import { ReservationDetailModal } from "../reservations/ReservationDetailModal";

function formatElapsed(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const SHAPE_LABEL: Record<Table["shape"], string> = {
  round: "Redonda",
  square: "Cuadrada",
  rectangle: "Rectangular",
};

type TableEditPatch = Partial<
  Pick<Table, "name" | "shape" | "capacityMin" | "capacityMax" | "width" | "height" | "rotation">
>;

export function TableDetailPanel({
  table,
  restaurantId,
  zoneName,
  status,
  reservationsToday,
  allReservationsToday,
  allTables,
  groupInfo,
  joinPending,
  editable,
  onClose,
  onDelete,
  onDuplicate,
  onChangeReservationStatus,
  onSeatWalkIn,
  onMoveReservation,
  onStartJoin,
  onCancelJoin,
  onUnjoin,
  onUpdateTable,
  onToggleBlocked,
  onSaveNotes,
}: {
  table: Table;
  restaurantId: string;
  zoneName: string;
  status: TableLiveStatusValue;
  reservationsToday: ReservationWithDetails[];
  /** Reservas de TODO el restaurante hoy (no solo esta mesa) -- para que "Cambiar de mesa" pueda avisar sobre otras mesas candidatas, no solo esta. */
  allReservationsToday: ReservationWithDetails[];
  allTables: Table[];
  groupInfo: TableGroupInfo | undefined;
  /** True while this table is the source of an in-progress "unir mesas" pick. */
  joinPending: boolean;
  editable: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onChangeReservationStatus: (reservationId: string, status: ReservationStatus) => void;
  onSeatWalkIn: (partySize: number, name: string, phone: string, email: string) => void;
  onMoveReservation: (reservationId: string, tableId: string, source?: TableAssignmentSource) => void;
  onStartJoin: () => void;
  onCancelJoin: () => void;
  onUnjoin: () => void;
  onUpdateTable?: (patch: TableEditPatch) => void;
  onToggleBlocked?: (blocked: boolean, reason?: string | null) => void;
  onSaveNotes?: (reservationId: string, notes: string) => void;
}) {
  const reservation = currentOrNextReservation(reservationsToday);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("Walk-in");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInSize, setWalkInSize] = useState(Math.min(2, table.capacityMax));
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [viewReservation, setViewReservation] = useState<ReservationWithDetails | null>(null);

  const todaysSchedule = reservationsToday
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const conflict = findTurnoverConflict(reservationsToday);

  const [name, setName] = useState(table.name);
  const [capacityMin, setCapacityMin] = useState(table.capacityMin);
  const [capacityMax, setCapacityMax] = useState(table.capacityMax);
  const [width, setWidth] = useState(table.width);
  const [height, setHeight] = useState(table.height);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== table.name) onUpdateTable?.({ name: trimmed });
    else setName(table.name);
  }

  function commitCapacity() {
    const min = Math.max(1, Math.min(capacityMin, capacityMax));
    const max = Math.max(min, capacityMax);
    setCapacityMin(min);
    setCapacityMax(max);
    if (min !== table.capacityMin || max !== table.capacityMax) {
      onUpdateTable?.({ capacityMin: min, capacityMax: max });
    }
  }

  function commitSize() {
    const w = Math.max(20, width);
    const h = Math.max(20, height);
    setWidth(w);
    setHeight(h);
    if (w !== table.width || h !== table.height) onUpdateTable?.({ width: w, height: h });
  }

  function rotateBy(delta: number) {
    const next = ((table.rotation + delta) % 360 + 360) % 360;
    onUpdateTable?.({ rotation: next });
  }

  const joinedTableNames = groupInfo
    ? groupInfo.tableIds.filter((id) => id !== table.id).map((id) => allTables.find((t) => t.id === id)?.name ?? "?")
    : [];

  async function handlePickTable(candidate: TableCandidate, wasRecommended: boolean) {
    if (!reservation) return;
    const source: TableAssignmentSource = wasRecommended ? "suggested" : "manual";
    if (candidate.tableIds.length > 1) await assignCandidateToReservation(supabase, reservation.id, candidate, source);
    onMoveReservation(reservation.id, candidate.tableIds[0]!, source);
    setShowMoveTo(false);
  }

  return (
    <>
    <div className="fixed inset-0 z-40 bg-black/55 xl:hidden" onClick={onClose} aria-hidden />
    <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 sm:p-5 pb-8 xl:static xl:z-auto xl:max-h-none xl:w-[356px] xl:max-w-full xl:shrink-0 xl:h-full xl:rounded-2xl xl:pb-5">
      <div className="xl:hidden mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[13px] font-semibold text-ink-faint uppercase tracking-[0.08em]">{zoneName}</p>
          <h2 className="font-serif text-[56px] leading-[0.95] mt-1">{table.name}</h2>
          <p className="text-[13px] text-ink-muted mt-1.5">
            hasta {table.capacityMax} personas · {SHAPE_LABEL[table.shape].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={onClose}
            className="h-11 px-4 xl:h-9 xl:w-9 xl:px-0 rounded-[10px] bg-surface-2 text-[15px] font-semibold text-ink xl:text-ink-muted xl:hover:text-ink"
            aria-label="Cerrar"
          >
            <span className="xl:hidden">✕ Cerrar</span>
            <span className="hidden xl:inline">✕</span>
          </button>
          <StatePill state={tableVisualState(status)} label={tableStatusLabel(status)} />
        </div>
      </div>

      {joinedTableNames.length > 0 && (
        <div className="flex items-center justify-between rounded-[10px] bg-ground border border-line px-3 py-2 text-[13px] mb-3">
          <span>Unida con Mesa {joinedTableNames.join(", ")}</span>
          <button onClick={onUnjoin} className="text-ink-faint hover:text-status-occupied">
            Desunir
          </button>
        </div>
      )}

      {conflict && (
        <div className="rounded-lg border border-status-arriving/50 bg-status-arriving/10 px-3 py-2 text-[13px] mb-3">
          <p className="text-status-arriving font-medium">
            ⚠️ Hay gente sentada y una reserva a las{" "}
            {new Date(conflict.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} (
            {conflict.customerName}, {conflict.partySize}p)
          </p>
          <button onClick={() => setViewReservation(conflict)} className="text-accent mt-1">
            Ver reserva y mover a otra mesa →
          </button>
        </div>
      )}

      {reservation ? (
        <div className="rounded-xl bg-surface-2 p-4 mb-4">
          <p className="text-[17px] font-semibold">{reservation.customerName}</p>
          {reservation.status === "seated" &&
            (() => {
              const seatedMinutes = minutesSince(reservation.startsAt);
              const over = seatedMinutes > 90;
              return (
                <div className="mt-2">
                  <p className={`font-serif text-5xl leading-none tabular-nums ${over ? "text-status-occupied" : ""}`}>
                    {formatElapsed(seatedMinutes)}
                  </p>
                  <div className="h-1.5 rounded-full bg-surface-3 mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${over ? "bg-status-occupied" : "bg-status-available"}`}
                      style={{ width: `${Math.min(100, (seatedMinutes / 90) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[13px] text-ink-faint mt-1">sentados · promedio 1:30</p>
                </div>
              );
            })()}
          <p className="text-[13px] text-ink-muted mt-2">
            {new Date(reservation.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {reservation.partySize} personas
            {reservation.customerPhone ? ` · ${reservation.customerPhone}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {NEXT_STATUS_ACTIONS[reservation.status]?.map((action) => (
              <button
                key={action.status}
                onClick={() => onChangeReservationStatus(reservation.id, action.status)}
                className="h-11 px-[18px] rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={() => setShowMoveTo(true)}
              className="h-11 px-[18px] rounded-[10px] bg-surface-3 border border-line text-[15px] text-ink hover:border-accent"
            >
              Cambiar de mesa
            </button>
          </div>

          {showMoveTo && (
            <div className="mt-2.5 pt-2.5 border-t border-line">
              <TableAssignmentPicker
                restaurantId={restaurantId}
                partySize={reservation.partySize}
                startsAt={reservation.startsAt}
                endsAt={reservation.endsAt}
                excludeReservationId={reservation.id}
                reservationsForSchedule={allReservationsToday}
                onSelect={handlePickTable}
              />
              <button onClick={() => setShowMoveTo(false)} className="text-[13px] text-ink-faint mt-1.5">
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : showWalkIn ? (
        <div className="rounded-[10px] bg-ground border border-line p-3 mb-4 space-y-2">
          <input
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={walkInPhone}
            onChange={(e) => setWalkInPhone(e.target.value)}
            placeholder="Teléfono (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={walkInEmail}
            onChange={(e) => setWalkInEmail(e.target.value)}
            placeholder="Mail (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <label className="text-[13px] text-ink-faint">Personas</label>
            <input
              type="number"
              min={1}
              max={table.capacityMax}
              value={walkInSize}
              onChange={(e) => setWalkInSize(Number(e.target.value))}
              className="w-16 rounded-lg bg-surface border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                onSeatWalkIn(walkInSize, walkInName.trim() || "Walk-in", walkInPhone.trim(), walkInEmail.trim());
                setShowWalkIn(false);
              }}
              className="rounded-[10px] bg-accent text-accent-ink px-2.5 py-1.5 text-[13px] font-semibold"
            >
              Sentar ahora
            </button>
            <button onClick={() => setShowWalkIn(false)} className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-muted">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm text-ink-muted mb-2">Sin reservas para hoy en esta mesa.</p>
          <button
            onClick={() => setShowWalkIn(true)}
            className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-[13px] text-ink hover:border-accent"
          >
            + Sentar walk-in
          </button>
        </div>
      )}

      {reservation && reservation.status === "seated" && (
        <CurrentCheckSection key={reservation.id} reservation={reservation} restaurantId={restaurantId} />
      )}

      {todaysSchedule.length > 0 && (
        <div className="mb-4">
          <p className="text-[13px] text-ink-faint uppercase tracking-wide mb-1.5">Reservas de hoy en esta mesa</p>
          <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
            {todaysSchedule.map((r) => (
              <button
                key={r.id}
                onClick={() => setViewReservation(r)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ground"
              >
                <span className="w-11 text-[13px] tabular-nums text-ink-muted shrink-0">
                  {new Date(r.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex-1 min-w-0 text-[13px] truncate">
                  {r.customerName} · {r.partySize}p
                </span>
                <span
                  className="text-[13px] rounded-full px-1.5 py-0.5 border shrink-0"
                  style={{ color: RESERVATION_STATUS_COLOR[r.status], borderColor: RESERVATION_STATUS_COLOR[r.status] }}
                >
                  {RESERVATION_STATUS_LABEL[r.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {editable ? (
        <div className="space-y-2.5 text-sm mb-4 rounded-lg border border-line bg-ground p-3">
          <div>
            <label className="block text-[13px] text-ink-faint mb-1">Nombre / número</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Forma</label>
              <select
                value={table.shape}
                onChange={(e) => onUpdateTable?.({ shape: e.target.value as Table["shape"] })}
                className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                {(Object.entries(SHAPE_LABEL) as [Table["shape"], string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Rotación</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => rotateBy(-45)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] hover:border-accent"
                  aria-label="Rotar -45°"
                >
                  ⟲
                </button>
                <span className="flex-1 text-center text-[13px] text-ink-muted tabular-nums">{table.rotation}°</span>
                <button
                  type="button"
                  onClick={() => rotateBy(45)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] hover:border-accent"
                  aria-label="Rotar +45°"
                >
                  ⟳
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Cap. mínima</label>
              <input
                type="number"
                min={1}
                value={capacityMin}
                onChange={(e) => setCapacityMin(Number(e.target.value))}
                onBlur={commitCapacity}
                className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Cap. máxima</label>
              <input
                type="number"
                min={1}
                value={capacityMax}
                onChange={(e) => setCapacityMax(Number(e.target.value))}
                onBlur={commitCapacity}
                className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Ancho</label>
              <input
                type="number"
                min={20}
                value={Math.round(width)}
                onChange={(e) => setWidth(Number(e.target.value))}
                onBlur={commitSize}
                className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[13px] text-ink-faint mb-1">Alto</label>
              <input
                type="number"
                min={20}
                value={Math.round(height)}
                onChange={(e) => setHeight(Number(e.target.value))}
                onBlur={commitSize}
                className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] pt-1 border-t border-line">
            <input
              type="checkbox"
              checked={table.blocked}
              onChange={(e) => onToggleBlocked?.(e.target.checked, table.blockedReason)}
            />
            Mesa bloqueada (fuera de servicio temporalmente)
          </label>
          {table.blocked && (
            <input
              value={table.blockedReason ?? ""}
              onChange={(e) => onToggleBlocked?.(true, e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          )}
        </div>
      ) : (
        <dl className="space-y-2.5 text-sm mb-4">
          <Row label="Forma" value={SHAPE_LABEL[table.shape]} />
          <Row label="Capacidad" value={`${table.capacityMin}–${table.capacityMax} personas`} />
        </dl>
      )}

      {joinedTableNames.length === 0 &&
        (joinPending ? (
          <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-[13px] text-accent flex items-center justify-between">
            Tocá otra mesa de la misma zona para unir
            <button onClick={onCancelJoin} className="text-ink-faint hover:text-ink">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={onStartJoin}
            className="w-full rounded-lg bg-surface-2 border border-line px-2.5 py-2 text-[13px] text-ink hover:border-accent"
          >
            Unir con otra mesa
          </button>
        ))}

      {editable && (
        <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-2">
          <button onClick={onDuplicate} className="text-sm text-accent hover:opacity-80 text-left">
            Duplicar mesa
          </button>
          <button onClick={onDelete} className="text-sm text-status-occupied hover:opacity-80 text-left">
            Eliminar mesa
          </button>
        </div>
      )}

      {viewReservation && (
        <ReservationDetailModal
          reservation={reservationsToday.find((r) => r.id === viewReservation.id) ?? viewReservation}
          restaurantId={restaurantId}
          zoneName={zoneName}
          reservationsToday={allReservationsToday}
          onClose={() => setViewReservation(null)}
          onChangeStatus={(id, s) => onChangeReservationStatus(id, s)}
          onAssignTable={(id, tableId, source) => onMoveReservation(id, tableId, source)}
          onSaveNotes={(id, notes) => onSaveNotes?.(id, notes)}
        />
      )}
    </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  );
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/**
 * "En cuánto va la cuenta" mientras la mesa sigue sentada -- no hace falta
 * esperar a completar la reserva para ver el consumo acumulado. La primera
 * vez que se agrega un ítem crea la cuenta (visits + pos_checks); a partir
 * de ahí el modal de "Completar reserva" la reutiliza tal cual quedó.
 */
function CurrentCheckSection({ reservation, restaurantId }: { reservation: ReservationWithDetails; restaurantId: string }) {
  const [check, setCheck] = useState<PosCheck | null>(null);
  const [items, setItems] = useState<PosCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  async function reload() {
    const c = await getOpenCheckForReservation(supabase, reservation.id);
    setCheck(c);
    setItems(c ? await listConsumptionItems(supabase, c.id) : []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.id]);

  async function handleStart() {
    const c = await ensureOpenCheck(supabase, reservation);
    setCheck(c);
  }

  async function handleAdd() {
    const price = Number(itemPrice);
    if (!check || !itemName.trim() || !price) return;
    await addConsumptionItem(supabase, { restaurantId, checkId: check.id, name: itemName.trim(), quantity: 1, unitPrice: price });
    setItemName("");
    setItemPrice("");
    await reload();
  }

  async function handleRemove(itemId: string) {
    if (!check) return;
    await removeConsumptionItem(supabase, itemId, check.id);
    await reload();
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-line bg-ground p-3 mb-4">
      <p className="text-[13px] text-ink-faint uppercase tracking-wide mb-2">Cuenta actual</p>

      {!check ? (
        <button onClick={handleStart} className="text-[13px] text-accent">
          + Registrar consumo
        </button>
      ) : (
        <>
          {items.length > 0 && (
            <ul className="space-y-1 mb-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink-muted">{item.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="tabular-nums">{formatCLP(item.total)}</span>
                    <button onClick={() => handleRemove(item.id)} className="text-ink-faint hover:text-status-occupied" aria-label="Quitar">
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between text-sm pt-2 border-t border-line mb-2">
            <span className="text-ink-faint">Total</span>
            <span className="font-semibold tabular-nums">{formatCLP(check.total)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Producto"
              className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-2 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <input
              type="number"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              placeholder="$"
              className="w-20 rounded-lg bg-surface border border-line px-2 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button onClick={handleAdd} className="rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-[13px] hover:border-accent shrink-0">
              + Agregar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
