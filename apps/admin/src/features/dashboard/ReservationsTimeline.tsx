import { useMemo, useState } from "react";
import type { ReservationWithDetails, TableGroupInfo } from "@reservia/api-client";
import { findTurnoverConflict, minutesSince, type ReservationStatus, type Table, type Zone } from "@reservia/core";
import { RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";
import { reservationVisualState, stateClass } from "../../lib/stateStyle";

const ROW_HEIGHT = 48;
const BUFFER_MS = 15 * 60_000;
/** Estados que se pueden arrastrar a otra mesa (una pendiente primero se acepta; lo ya terminado no se mueve). */
const DRAGGABLE_STATUSES: ReservationStatus[] = ["confirmed", "arriving", "seated"];

/** Todas las mesas que ocupa una reserva: la principal, las de su unión y las de un grupo de mesas unidas a mano. */
function tableIdsOf(r: ReservationWithDetails, tableGroups?: Map<string, TableGroupInfo>): string[] {
  const ids = new Set<string>();
  if (r.tableId) {
    ids.add(r.tableId);
    for (const id of tableGroups?.get(r.tableId)?.tableIds ?? []) ids.add(id);
  }
  for (const id of r.extraTableIds ?? []) ids.add(id);
  return [...ids];
}

/**
 * Vista mesa × hora, estilo Cover Manager: una fila por mesa mostrando qué
 * reserva la ocupa a qué hora, cuánta gente, y si ya está sentada hace
 * cuánto. Clic en cualquier bloque abre `ReservationDetailModal`.
 *
 * Arrastrar: una reserva se puede soltar sobre otra mesa (libre a esa hora) y se va con TODO: la visita
 * abierta y su consumo viajan con ella. Las mesas unidas muestran el nombre de la reserva en cada una
 * (🔗), así ninguna se ve vacía.
 */
export function ReservationsTimeline({
  zones,
  visibleTables,
  reservationsToday,
  tableGroups,
  now,
  onSelectReservation,
  onMoveReservation,
}: {
  zones: Zone[];
  visibleTables: Table[];
  reservationsToday: ReservationWithDetails[];
  tableGroups?: Map<string, TableGroupInfo>;
  now: Date;
  onSelectReservation: (r: ReservationWithDetails) => void;
  onMoveReservation?: (reservationId: string, tableId: string) => Promise<void>;
}) {
  const active = reservationsToday.filter((r) => r.status !== "cancelled");
  const unassigned = active.filter((r) => !r.tableId);
  const [dragging, setDragging] = useState<ReservationWithDetails | null>(null);
  const [overTableId, setOverTableId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Ventana fija de 12:00 a 22:00 -- el rango dinámico (de la reserva más
  // temprana a la más tardía) quedaba angosto o carecía de horas sin
  // reservas todavía, y se veía distinto cada vez que se abría.
  const { rangeStart, rangeEnd } = useMemo(() => {
    const start = new Date(now);
    start.setHours(12, 0, 0, 0);
    const end = new Date(now);
    end.setHours(22, 0, 0, 0);
    return { rangeStart: start.getTime(), rangeEnd: end.getTime() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMs = Math.max(1, rangeEnd - rangeStart);
  function pct(ms: number): number {
    return Math.min(100, Math.max(0, ((ms - rangeStart) / totalMs) * 100));
  }

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const first = new Date(rangeStart);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < rangeStart) first.setHours(first.getHours() + 1);
    for (let t = first.getTime(); t <= rangeEnd; t += 60 * 60_000) marks.push(t);
    return marks;
  }, [rangeStart, rangeEnd]);

  const nowPct = now.getTime() >= rangeStart && now.getTime() <= rangeEnd ? pct(now.getTime()) : null;

  const rowGroups = zones
    .map((zone) => ({ zone, tables: visibleTables.filter((t) => t.zoneId === zone.id) }))
    .filter((g) => g.tables.length > 0);

  /** ¿La mesa está libre para la reserva que se arrastra (sin contar a la propia reserva)? */
  function isFreeForDragged(tableId: string): boolean {
    if (!dragging) return false;
    const s = new Date(dragging.startsAt).getTime();
    const e = new Date(dragging.endsAt).getTime();
    return !active.some(
      (r) =>
        r.id !== dragging.id &&
        !["completed", "no_show"].includes(r.status) &&
        tableIdsOf(r, tableGroups).includes(tableId) &&
        new Date(r.startsAt).getTime() < e + BUFFER_MS &&
        new Date(r.endsAt).getTime() + BUFFER_MS > s,
    );
  }

  async function handleDrop(table: Table) {
    const moved = dragging;
    setDragging(null);
    setOverTableId(null);
    if (!moved || !onMoveReservation || moved.tableId === table.id) return;
    if (
      table.capacityMax < moved.partySize &&
      !confirm(`La mesa ${table.name} es para ${table.capacityMax} personas y el grupo de ${moved.customerName} es de ${moved.partySize}. ¿Mover igual?`)
    ) {
      return;
    }
    try {
      await onMoveReservation(moved.id, table.id);
      setNotice({
        ok: true,
        text: `${moved.customerName} pasó a la Mesa ${table.name}${moved.status === "seated" ? " con todo su consumo" : ""}.`,
      });
    } catch (err) {
      setNotice({ ok: false, text: err && typeof err === "object" && "message" in err ? String(err.message) : "No se pudo mover la reserva." });
    }
    setTimeout(() => setNotice(null), 5000);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[720px]">
        {notice && (
          <p
            className={`sticky left-0 px-3 py-1.5 text-[13px] font-semibold ${
              notice.ok ? "bg-status-available/15 text-status-available" : "bg-status-occupied/15 text-status-occupied"
            }`}
          >
            {notice.text}
          </p>
        )}
        {dragging && (
          <p className="sticky left-0 px-3 py-1 text-[13px] bg-accent/10 text-accent">
            Suelta a {dragging.customerName} sobre una mesa libre (borde verde) para moverla con todo lo que lleva.
          </p>
        )}

        {/* Eje de horas */}
        <div className="flex sticky top-0 z-10 bg-surface-2 border-b border-line" style={{ height: 24 }}>
          <div className="w-32 shrink-0" />
          <div className="relative flex-1">
            {hourMarks.map((t) => (
              <span
                key={t}
                className="absolute top-1 text-[13px] text-ink-faint -translate-x-1/2"
                style={{ left: `${pct(t)}%` }}
              >
                {new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Línea vertical de "ahora", cruzando todas las filas */}
          {nowPct !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-accent z-10 pointer-events-none"
              style={{ left: `calc(8rem + (100% - 8rem) * ${nowPct / 100})` }}
            />
          )}

          {unassigned.length > 0 && (
            <TimelineRow
              label="Sin mesa asignada"
              highlight
              reservations={unassigned}
              pct={pct}
              now={now}
              onSelectReservation={onSelectReservation}
            />
          )}

          {rowGroups.map(({ zone, tables }) => (
            <div key={zone.id}>
              <p className="px-3 py-1 text-[13px] uppercase tracking-wide text-ink-faint bg-surface-2/60 sticky left-0">
                {zone.name}
              </p>
              {tables.map((table) => {
                const tableReservations = active.filter((r) => tableIdsOf(r, tableGroups).includes(table.id));
                const conflict = findTurnoverConflict(tableReservations, now);
                const canDrop = !!dragging && dragging.tableId !== table.id && isFreeForDragged(table.id);
                return (
                  <TimelineRow
                    key={table.id}
                    label={`Mesa ${table.name}`}
                    sublabel={capacityLabel(table.capacityMin, table.capacityMax)}
                    conflict={!!conflict}
                    rowTableId={table.id}
                    reservations={tableReservations}
                    pct={pct}
                    now={now}
                    onSelectReservation={onSelectReservation}
                    dragEnabled={!!onMoveReservation}
                    dropState={!dragging || dragging.tableId === table.id ? "none" : canDrop ? (overTableId === table.id ? "over" : "free") : "busy"}
                    onDragStartReservation={setDragging}
                    onDragEndReservation={() => {
                      setDragging(null);
                      setOverTableId(null);
                    }}
                    onDragEnterRow={() => canDrop && setOverTableId(table.id)}
                    onDropOnRow={() => canDrop && handleDrop(table)}
                  />
                );
              })}
            </div>
          ))}

          {rowGroups.length === 0 && unassigned.length === 0 && (
            <p className="text-[13px] text-ink-faint p-4">No hay mesas en esta zona.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** "2–4 personas", "6 personas", "1 persona": cuánta gente cabe en la mesa. */
function capacityLabel(min: number, max: number): string {
  if (max === 1) return "1 persona";
  return min < max ? `${min}–${max} personas` : `${max} personas`;
}

function TimelineRow({
  label,
  sublabel,
  reservations,
  pct,
  now,
  onSelectReservation,
  highlight,
  conflict,
  rowTableId,
  dragEnabled,
  dropState = "none",
  onDragStartReservation,
  onDragEndReservation,
  onDragEnterRow,
  onDropOnRow,
}: {
  label: string;
  sublabel?: string;
  reservations: ReservationWithDetails[];
  pct: (ms: number) => number;
  now: Date;
  onSelectReservation: (r: ReservationWithDetails) => void;
  highlight?: boolean;
  conflict?: boolean;
  rowTableId?: string;
  dragEnabled?: boolean;
  dropState?: "none" | "free" | "over" | "busy";
  onDragStartReservation?: (r: ReservationWithDetails) => void;
  onDragEndReservation?: () => void;
  onDragEnterRow?: () => void;
  onDropOnRow?: () => void;
}) {
  return (
    <div
      className={`flex border-b border-line transition-colors ${
        dropState === "over" ? "bg-status-available/20 outline outline-2 -outline-offset-2 outline-status-available" : dropState === "free" ? "bg-status-available/5" : ""
      } ${dropState === "busy" ? "opacity-50" : ""}`}
      style={{ height: ROW_HEIGHT }}
      onDragOver={(e) => {
        if (dropState === "free" || dropState === "over") {
          e.preventDefault();
          onDragEnterRow?.();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnRow?.();
      }}
    >
      <div className={`w-32 shrink-0 flex flex-col justify-center px-3 ${highlight ? "text-accent text-[13px]" : "text-ink"}`}>
        <span className={highlight ? "" : "font-serif text-lg leading-tight"}>
          {conflict && <span title="Alguien sentado y otra reserva por llegar pronto -- puede que haya que reasignarla.">⚠ </span>}
          {label}
        </span>
        {sublabel && (
          <span className="text-[13px] leading-tight text-ink-faint">
            {dropState === "busy" ? "ocupada a esa hora" : sublabel}
          </span>
        )}
      </div>
      <div className="relative flex-1">
        {reservations.map((r) => {
          const left = pct(new Date(r.startsAt).getTime());
          const right = pct(new Date(r.endsAt).getTime());
          const width = Math.max(3, right - left);
          // Esta fila es una mesa "secundaria" de una unión / grupo: se muestra la reserva igual para que no parezca vacía.
          const secondary = !!rowTableId && r.tableId !== rowTableId;
          const isUnion = secondary || r.unionNumber != null;
          const draggable = !!dragEnabled && !isUnion && DRAGGABLE_STATUSES.includes(r.status);
          return (
            <button
              key={r.id}
              onClick={() => onSelectReservation(r)}
              draggable={draggable}
              onDragStart={(e) => {
                if (!draggable) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.id);
                onDragStartReservation?.(r);
              }}
              onDragEnd={() => onDragEndReservation?.()}
              title={
                secondary
                  ? `${r.customerName}: mesas unidas, esta reserva ocupa también esta mesa`
                  : `${r.customerName} · ${r.partySize}p · ${RESERVATION_STATUS_LABEL[r.status]}${draggable ? " · arrastra para cambiarla de mesa" : ""}`
              }
              style={{ left: `${left}%`, width: `${width}%` }}
              className={`${stateClass(reservationVisualState(r.status))} absolute top-1 bottom-1 rounded-md border-2 px-1.5 text-left overflow-hidden hover:brightness-110 ${
                secondary ? "border-dashed" : ""
              } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <span className="block truncate text-[13px] font-semibold leading-tight">
                {isUnion && <span>🔗 {r.unionNumber != null ? `U${r.unionNumber} · ` : ""}</span>}
                {r.customerName}
              </span>
              <span className="block truncate text-[13px] opacity-80 leading-tight">
                {r.partySize}p{r.status === "seated" ? ` · hace ${minutesSince(r.startsAt, now)} min` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
