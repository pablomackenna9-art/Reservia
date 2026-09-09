import { useEffect, useState } from "react";
import { getSmartTableCandidates, listTables, listZones, type ReservationWithDetails } from "@reservia/api-client";
import { nearbyTableSchedule, type Table, type TableCandidate, type Zone, type ZonePreferenceMode } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { ZoneCanvas } from "../plano/ZoneCanvas";
import type { TableHighlightState } from "../plano/TableToken";
import { TableDayTimeline } from "./TableDayTimeline";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/** Sentados de verdad, o una reserva "confirmed"/"arriving" cuyo horario ya cubre este instante -- el staff no siempre alcanza a marcar la llegada al toque. */
function isOccupyingNow(r: ReservationWithDetails, now: Date): boolean {
  if (r.status === "seated") return true;
  if (!["confirmed", "arriving"].includes(r.status)) return false;
  const nowMs = now.getTime();
  return new Date(r.startsAt).getTime() <= nowMs && new Date(r.endsAt).getTime() > nowMs;
}

function scheduleEntryLabel(r: ReservationWithDetails, now: Date): string {
  if (r.status === "seated") return " (sentados)";
  if (isOccupyingNow(r, now)) return " (ocupada ahora)";
  return "";
}

/**
 * The Smart Table Engine's UI: a ranked, explained shortlist plus an
 * optional floor-plan view where the recommendation glows and the rest of
 * the room dims — reuses the existing ZoneCanvas rather than drawing a
 * second floor plan. Used from NewReservationForm, ReservationDetailModal,
 * and NotificacionesPage so the recommendation logic only lives in one place.
 */
export function TableAssignmentPicker({
  restaurantId,
  partySize,
  startsAt,
  endsAt,
  preferredZoneId,
  zonePreference,
  excludeReservationId,
  allowCombinations = true,
  showFloorPlanToggle = true,
  reservationsForSchedule,
  onSelect,
}: {
  restaurantId: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  preferredZoneId?: string | null;
  zonePreference?: ZonePreferenceMode;
  excludeReservationId?: string;
  allowCombinations?: boolean;
  /** Off cuando ver el plano no aporta (p. ej. ya se está mirando desde el detalle de la reserva) -- fuerza la lista. */
  showFloorPlanToggle?: boolean;
  /** Reservas del mismo día -- si viene, cada candidato muestra quién más tiene esa mesa antes/después. */
  reservationsForSchedule?: ReservationWithDetails[];
  /** `wasRecommended` is true only for the top pick — choosing an alternative counts as an override. */
  onSelect: (candidate: TableCandidate, wasRecommended: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<TableCandidate[] | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    setCandidates(null);
    getSmartTableCandidates(supabase, {
      restaurantId,
      partySize,
      startsAt,
      endsAt,
      preferredZoneId,
      zonePreference,
      excludeReservationId,
    }).then((result) => {
      if (!cancelled) setCandidates(allowCombinations ? result : result.filter((c) => !c.isCombination));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, partySize, startsAt, endsAt, preferredZoneId, zonePreference, excludeReservationId, allowCombinations]);

  // Zones load eagerly (cheap, small list) so every candidate — list view or
  // floor-plan view — can always say which sector it's in, not just when the
  // plan is open.
  useEffect(() => {
    listZones(supabase, restaurantId).then(setZones);
  }, [restaurantId]);

  useEffect(() => {
    if (!showPlan || tables.length > 0) return;
    listTables(supabase, restaurantId).then(setTables);
  }, [showPlan, tables.length, restaurantId]);

  const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));

  if (candidates === null) {
    return <p className="text-xs text-ink-faint">Buscando la mejor mesa…</p>;
  }

  if (candidates.length === 0) {
    return <p className="text-xs text-ink-faint">Ninguna mesa libre a esa hora para {partySize} personas.</p>;
  }

  const [recommended, ...alternatives] = candidates;
  const recommendedIds = new Set(recommended!.tableIds);
  const alternativeIds = new Set(alternatives.flatMap((c) => c.tableIds));

  function highlightFor(tableId: string): TableHighlightState | undefined {
    if (recommendedIds.has(tableId)) return "recommended";
    if (alternativeIds.has(tableId)) return "alternative";
    return "dimmed";
  }

  function selectByTableId(tableId: string) {
    const candidate = candidates!.find((c) => c.tableIds.includes(tableId));
    if (candidate) onSelect(candidate, candidate === recommended);
  }

  function scheduleFor(candidate: TableCandidate): ReservationWithDetails[] {
    if (!reservationsForSchedule) return [];
    return nearbyTableSchedule(reservationsForSchedule, candidate.tableIds, startsAt, { excludeId: excludeReservationId, now });
  }

  function dayScheduleFor(candidate: TableCandidate): ReservationWithDetails[] {
    if (!reservationsForSchedule) return [];
    return reservationsForSchedule
      .filter(
        (r) =>
          r.tableId &&
          candidate.tableIds.includes(r.tableId) &&
          r.status !== "cancelled" &&
          r.id !== excludeReservationId,
      )
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  function toggleExpanded(key: string) {
    setExpandedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function ScheduleBlock({ candidate }: { candidate: TableCandidate }) {
    if (!reservationsForSchedule) return null;
    const key = candidate.tableIds.join("+");
    const schedule = scheduleFor(candidate);
    const hasActiveNow = schedule.some((s) => isOccupyingNow(s, now));
    const expanded = expandedCandidates.has(key);
    return (
      <div className="mt-0.5">
        {schedule.length === 0 ? (
          <p className="text-[10px] text-status-available">Sin reservas cerca de esa hora</p>
        ) : (
          <p
            className={`text-[10px] truncate ${hasActiveNow ? "text-status-occupied font-medium" : "text-ink-faint"}`}
            title={schedule.map((s) => `${formatTime(s.startsAt)} ${s.customerName}`).join(" · ")}
          >
            {hasActiveNow ? "⚠ " : ""}
            {schedule.map((s) => `${formatTime(s.startsAt)} ${s.customerName}${scheduleEntryLabel(s, now)}`).join(" · ")}
          </p>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(key);
          }}
          className="text-[10px] text-accent mt-0.5"
        >
          {expanded ? "▾ Ocultar horario del día" : "▸ Ver horario del día"}
        </button>
        {expanded && <TableDayTimeline reservations={dayScheduleFor(candidate)} now={now} />}
      </div>
    );
  }

  return (
    <div>
      {showFloorPlanToggle && (
        <button
          type="button"
          onClick={() => setShowPlan((v) => !v)}
          className="text-xs text-accent mb-2"
        >
          {showPlan ? "Ver como lista" : "Ver en el plano"}
        </button>
      )}

      {showFloorPlanToggle && showPlan ? (
        <div className="h-64 rounded-lg border border-line bg-surface-2 overflow-hidden mb-2">
          {zones.length === 0 ? (
            <div className="h-full grid place-items-center">
              <p className="text-xs text-ink-faint">Cargando plano…</p>
            </div>
          ) : (
            <ZoneCanvas
              zones={zones}
              tables={tables}
              selectedTableId={null}
              onSelectTable={(id) => {
                if (id) selectByTableId(id);
              }}
              getHighlightState={highlightFor}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-status-available/50 bg-status-available/10 px-3 py-2.5">
            <button
              type="button"
              onClick={() => onSelect(recommended!, true)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-status-available">
                  ✨ {recommended!.tableNames.join(" + ")} recomendada
                </span>
                <span className="text-xs text-ink-faint">{recommended!.capacityMax}p</span>
              </div>
              <p className="text-xs text-ink-faint mt-0.5">
                {zoneNameById.get(recommended!.zoneId) ?? "…"}
              </p>
              <p className="text-xs text-ink-faint mt-1">{recommended!.reasons.join(" · ")}</p>
            </button>
            <ScheduleBlock candidate={recommended!} />
          </div>

          {alternatives.length > 0 && (
            <div>
              <p className="text-xs text-ink-faint mb-1">Otras alternativas</p>
              <div className={reservationsForSchedule ? "grid grid-cols-1 sm:grid-cols-2 gap-1.5" : "flex flex-wrap gap-1.5"}>
                {alternatives.map((c) => (
                  <div
                    key={c.tableIds.join("+")}
                    className="rounded-lg bg-ground border border-line px-2.5 py-1.5 text-xs hover:border-accent min-w-0"
                  >
                    <button type="button" onClick={() => onSelect(c, false)} title={c.reasons.join(" · ")} className="w-full text-left">
                      <span>
                        {c.tableNames.join("+")} · {c.capacityMax}p
                      </span>
                      <span className="block text-ink-faint text-[10px]">{zoneNameById.get(c.zoneId) ?? "…"}</span>
                    </button>
                    <ScheduleBlock candidate={c} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
