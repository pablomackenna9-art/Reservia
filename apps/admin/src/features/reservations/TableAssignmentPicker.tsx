import { useEffect, useState } from "react";
import { getSmartTableCandidates, listTables, listZones } from "@reservia/api-client";
import type { Table, TableCandidate, Zone, ZonePreferenceMode } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { ZoneCanvas } from "../plano/ZoneCanvas";
import type { TableHighlightState } from "../plano/TableToken";

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
  /** `wasRecommended` is true only for the top pick — choosing an alternative counts as an override. */
  onSelect: (candidate: TableCandidate, wasRecommended: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<TableCandidate[] | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);

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

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowPlan((v) => !v)}
        className="text-xs text-accent mb-2"
      >
        {showPlan ? "Ver como lista" : "Ver en el plano"}
      </button>

      {showPlan ? (
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
          <button
            type="button"
            onClick={() => onSelect(recommended!, true)}
            className="w-full text-left rounded-lg border border-status-available/50 bg-status-available/10 px-3 py-2.5 hover:border-status-available"
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

          {alternatives.length > 0 && (
            <div>
              <p className="text-xs text-ink-faint mb-1">Otras alternativas</p>
              <div className="flex flex-wrap gap-1.5">
                {alternatives.map((c) => (
                  <button
                    key={c.tableIds.join("+")}
                    type="button"
                    onClick={() => onSelect(c, false)}
                    title={c.reasons.join(" · ")}
                    className="rounded-lg bg-ground border border-line px-2.5 py-1.5 text-xs hover:border-accent text-left"
                  >
                    <span>
                      {c.tableNames.join("+")} · {c.capacityMax}p
                    </span>
                    <span className="block text-ink-faint text-[10px]">{zoneNameById.get(c.zoneId) ?? "…"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
