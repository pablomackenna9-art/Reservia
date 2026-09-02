import { useState } from "react";
import {
  currentOrNextReservation,
  findTurnoverConflict,
  minutesSince,
  tableStatusLabel,
  type ReservationStatus,
  type Table,
  type TableLiveStatusValue,
} from "@reservia/core";
import { joinTables, type ReservationWithDetails, type TableGroupInfo } from "@reservia/api-client";
import type { TableAssignmentSource, TableCandidate } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { STATUS_COLORS } from "./statusColors";
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
  allTables: Table[];
  groupInfo: TableGroupInfo | undefined;
  /** True while this table is the source of an in-progress "unir mesas" pick. */
  joinPending: boolean;
  editable: boolean;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onChangeReservationStatus: (reservationId: string, status: ReservationStatus) => void;
  onSeatWalkIn: (partySize: number, name: string) => void;
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
    onMoveReservation(reservation.id, candidate.tableIds[0]!, source);
    if (candidate.isCombination && candidate.tableIds.length > 1) {
      await joinTables(supabase, restaurantId, candidate.tableIds[0]!, candidate.tableIds[1]!, `Mesa ${candidate.tableNames.join("+")}`);
    }
    setShowMoveTo(false);
  }

  return (
    <aside className="w-72 shrink-0 h-full overflow-y-auto rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-ink-faint uppercase tracking-wide">{zoneName}</p>
          <h2 className="text-lg font-semibold">Mesa {table.name}</h2>
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink text-sm" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <span
        className="inline-block text-xs rounded-full px-2.5 py-1 border mb-3"
        style={{ color: STATUS_COLORS[status], borderColor: STATUS_COLORS[status] }}
      >
        {tableStatusLabel(status)}
      </span>

      {joinedTableNames.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-ground border border-line px-3 py-2 text-xs mb-3">
          <span>Unida con Mesa {joinedTableNames.join(", ")}</span>
          <button onClick={onUnjoin} className="text-ink-faint hover:text-status-occupied">
            Desunir
          </button>
        </div>
      )}

      {conflict && (
        <div className="rounded-lg border border-status-arriving/50 bg-status-arriving/10 px-3 py-2 text-xs mb-3">
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
        <div className="rounded-lg bg-ground border border-line p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{reservation.customerName}</p>
            {reservation.status === "seated" && (
              <span className="text-xs text-accent tabular-nums shrink-0">
                ⏱ {formatElapsed(minutesSince(reservation.startsAt))}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-faint mt-0.5">
            {new Date(reservation.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {reservation.partySize} personas
            {reservation.customerPhone ? ` · ${reservation.customerPhone}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {NEXT_STATUS_ACTIONS[reservation.status]?.map((action) => (
              <button
                key={action.status}
                onClick={() => onChangeReservationStatus(reservation.id, action.status)}
                className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={() => setShowMoveTo(true)}
              className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-ink hover:border-accent"
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
                onSelect={handlePickTable}
              />
              <button onClick={() => setShowMoveTo(false)} className="text-xs text-ink-faint mt-1.5">
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : showWalkIn ? (
        <div className="rounded-lg bg-ground border border-line p-3 mb-4 space-y-2">
          <input
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-faint">Personas</label>
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
                onSeatWalkIn(walkInSize, walkInName.trim() || "Walk-in");
                setShowWalkIn(false);
              }}
              className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium"
            >
              Sentar ahora
            </button>
            <button onClick={() => setShowWalkIn(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-ink-muted">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm text-ink-muted mb-2">Sin reservas para hoy en esta mesa.</p>
          <button
            onClick={() => setShowWalkIn(true)}
            className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-ink hover:border-accent"
          >
            + Sentar walk-in
          </button>
        </div>
      )}

      {todaysSchedule.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-ink-faint uppercase tracking-wide mb-1.5">Reservas de hoy en esta mesa</p>
          <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
            {todaysSchedule.map((r) => (
              <button
                key={r.id}
                onClick={() => setViewReservation(r)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ground"
              >
                <span className="w-11 text-xs tabular-nums text-ink-muted shrink-0">
                  {new Date(r.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex-1 min-w-0 text-xs truncate">
                  {r.customerName} · {r.partySize}p
                </span>
                <span
                  className="text-[10px] rounded-full px-1.5 py-0.5 border shrink-0"
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
            <label className="block text-xs text-ink-faint mb-1">Nombre / número</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-ink-faint mb-1">Forma</label>
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
              <label className="block text-xs text-ink-faint mb-1">Rotación</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => rotateBy(-45)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs hover:border-accent"
                  aria-label="Rotar -45°"
                >
                  ⟲
                </button>
                <span className="flex-1 text-center text-xs text-ink-muted tabular-nums">{table.rotation}°</span>
                <button
                  type="button"
                  onClick={() => rotateBy(45)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs hover:border-accent"
                  aria-label="Rotar +45°"
                >
                  ⟳
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-ink-faint mb-1">Cap. mínima</label>
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
              <label className="block text-xs text-ink-faint mb-1">Cap. máxima</label>
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
              <label className="block text-xs text-ink-faint mb-1">Ancho</label>
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
              <label className="block text-xs text-ink-faint mb-1">Alto</label>
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

          <label className="flex items-center gap-2 text-xs pt-1 border-t border-line">
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
          <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-accent flex items-center justify-between">
            Tocá otra mesa de la misma zona para unir
            <button onClick={onCancelJoin} className="text-ink-faint hover:text-ink">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={onStartJoin}
            className="w-full rounded-lg bg-surface-2 border border-line px-2.5 py-2 text-xs text-ink hover:border-accent"
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
          onClose={() => setViewReservation(null)}
          onChangeStatus={(id, s) => onChangeReservationStatus(id, s)}
          onAssignTable={(id, tableId, source) => onMoveReservation(id, tableId, source)}
          onSaveNotes={(id, notes) => onSaveNotes?.(id, notes)}
        />
      )}
    </aside>
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
