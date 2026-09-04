import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listWaitlist,
  setAverageTicketPerPerson,
  type ReservationWithDetails,
  type WaitlistEntryWithCustomer,
} from "@reservia/api-client";
import { computeCapacityPacing } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "../plano/ZoneCanvas";
import { TableDetailPanel } from "../plano/TableDetailPanel";
import { useFloorPlan, todayISO } from "../plano/useFloorPlan";
import { NewReservationForm } from "../reservations/NewReservationForm";
import { ReservationDetailModal } from "../reservations/ReservationDetailModal";
import { CompleteReservationModal } from "../reservations/CompleteReservationModal";
import { RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export function DashboardPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const {
    zones,
    tables,
    reservationsToday,
    reservationsByTable,
    rules,
    tableGroups,
    loading,
    reload,
    getTableStatus,
    moveTable,
    changeReservationStatus,
    pendingCompletion,
    confirmCompletion,
    skipCompletion,
    cancelCompletion,
    seatWalkIn,
    joinTablesTogether,
    unjoinTable,
    moveReservationToTable,
    saveReservationNotes,
  } = useFloorPlan(restaurantId);

  // null = "not decided yet". Once the zones load we default to the first
  // one by sortOrder — the owner's own order from Configuración — instead
  // of dumping every zone onto the screen at once. "Todo" stays one click
  // away, it's just not where you land.
  const [activeZoneId, setActiveZoneId] = useState<string | "all" | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [joinSourceId, setJoinSourceId] = useState<string | null>(null);
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [planoExpanded, setPlanoExpanded] = useState(false);
  const [editingTicket, setEditingTicket] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntryWithCustomer[]>([]);
  const [detailReservation, setDetailReservation] = useState<ReservationWithDetails | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    listWaitlist(supabase, restaurantId).then(setWaitlist);
  }, [restaurantId, reservationsToday]);
  const [ticketInput, setTicketInput] = useState("");

  const now = new Date();
  const active = reservationsToday.filter((r) => r.status !== "cancelled");
  const occupiedNow = tables.filter((t) => getTableStatus(t.id) === "occupied").length;
  const availableNow = tables.length - occupiedNow;
  const cubiertosReservados = active.reduce((sum, r) => sum + r.partySize, 0);
  const estimatedRevenue = (rules?.averageTicketPerPerson ?? 0) * cubiertosReservados;

  const completedWithAmount = reservationsToday.filter((r) => r.status === "completed" && r.totalAmount != null);
  const facturacion = completedWithAmount.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
  const ticketPromedio = completedWithAmount.length ? facturacion / completedWithAmount.length : null;

  const upcoming = active
    .filter((r) => new Date(r.startsAt) >= now && r.status !== "seated")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);

  const indicators = [
    { label: "Reservas hoy", value: String(active.length) },
    { label: "Cubiertos reservados", value: String(cubiertosReservados) },
    { label: "Ocupación estimada", value: tables.length ? `${Math.round((occupiedNow / tables.length) * 100)}%` : "—" },
    { label: "Mesas disponibles", value: tables.length ? String(availableNow) : "—" },
    { label: "No-shows", value: String(reservationsToday.filter((r) => r.status === "no_show").length) },
    { label: "Hora actual", value: now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) },
  ];

  const insights: string[] = [];
  if (active.length > 0) insights.push(`Tenés ${active.length} reserva${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"} hoy.`);
  if (tables.length > 0) insights.push(`${availableNow} de ${tables.length} mesas están libres ahora mismo.`);
  if (upcoming.length > 0) insights.push(`La próxima reserva es a las ${formatTime(upcoming[0]!.startsAt)} — ${upcoming[0]!.customerName}.`);
  if (insights.length === 0) insights.push("Sin reservas todavía — se llena a medida que entren.");

  const pacing = useMemo(
    () => computeCapacityPacing(tables.length, reservationsToday, now, { slotMinutes: 30, horizonMinutes: 240 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables.length, reservationsToday],
  );

  const hourly = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const r of active) {
      const hour = new Date(r.startsAt).getHours();
      buckets.set(hour, (buckets.get(hour) ?? 0) + r.partySize);
    }
    const hours = [...buckets.keys()].sort((a, b) => a - b);
    const max = Math.max(1, ...buckets.values());
    return hours.map((hour) => ({ hour, covers: buckets.get(hour)!, pct: (buckets.get(hour)! / max) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationsToday]);

  const sortedZones = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);
  // No manual pick yet -> land on the owner's first zone, not every zone at once.
  const effectiveZoneId = activeZoneId ?? sortedZones[0]?.id ?? "all";
  const visibleZones = effectiveZoneId === "all" ? zones : zones.filter((z) => z.id === effectiveZoneId);
  const visibleTables = effectiveZoneId === "all" ? tables : tables.filter((t) => t.zoneId === effectiveZoneId);
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableZone = selectedTable ? zones.find((z) => z.id === selectedTable.zoneId) ?? null : null;

  async function handleSelectTable(id: string | null) {
    if (joinSourceId && id && id !== joinSourceId) {
      const groupId = await joinTablesTogether(joinSourceId, id);
      if (!groupId) alert("Solo se pueden unir mesas de la misma zona.");
      setJoinSourceId(null);
      setSelectedTableId(joinSourceId);
      return;
    }
    setJoinSourceId(null);
    setSelectedTableId(id);
  }

  async function saveTicket() {
    if (!restaurantId) return;
    const value = Number(ticketInput.replace(/[^\d.]/g, "")) || 0;
    await setAverageTicketPerPerson(supabase, restaurantId, value);
    setEditingTicket(false);
    reload();
  }

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando…</div>;
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Centro de Control</h1>
          {current && (
            <p className="text-sm text-ink-muted mt-0.5">
              {current.restaurant.name} ·{" "}
              {now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/plano-de-mesas" className="text-sm text-accent">
            Editar plano →
          </Link>
          <button
            onClick={() => setShowNewReservation(true)}
            disabled={!restaurantId}
            className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            + Nueva reserva
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
        {indicators.map((indicator) => (
          <div key={indicator.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-faint">{indicator.label}</p>
            <p className={`text-xl font-semibold mt-1 ${indicator.value === "—" ? "text-ink-faint" : ""}`}>
              {indicator.value}
            </p>
          </div>
        ))}

        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-xs text-ink-faint flex items-center justify-between">
            Ingresos estimados
            {!editingTicket && (
              <button
                onClick={() => {
                  setTicketInput(String(rules?.averageTicketPerPerson ?? 0));
                  setEditingTicket(true);
                }}
                className="text-accent"
                title="Editar ticket promedio estimado"
              >
                editar
              </button>
            )}
          </p>
          {editingTicket ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                autoFocus
                type="number"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="Ticket/persona"
                className="w-full rounded bg-ground border border-line px-1.5 py-0.5 text-sm outline-none focus:border-accent"
              />
              <button onClick={saveTicket} className="text-accent text-xs shrink-0">
                Guardar
              </button>
            </div>
          ) : (
            <p className={`text-xl font-semibold mt-1 ${!rules?.averageTicketPerPerson ? "text-ink-faint" : ""}`}>
              {rules?.averageTicketPerPerson ? formatCLP(estimatedRevenue) : "—"}
            </p>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-1.5">
        <div className="flex gap-1.5">
          <ZoneTab label="Todo" active={effectiveZoneId === "all"} onClick={() => setActiveZoneId("all")} />
          {sortedZones.map((zone) => (
            <ZoneTab
              key={zone.id}
              label={zone.name}
              active={effectiveZoneId === zone.id}
              onClick={() => setActiveZoneId(zone.id)}
            />
          ))}
        </div>
        <button
          onClick={() => setPlanoExpanded((v) => !v)}
          className="rounded-lg px-3 py-1.5 text-sm bg-surface text-ink-muted hover:text-ink border border-line transition-colors shrink-0"
        >
          {planoExpanded ? "↙ Achicar plano" : "↗ Agrandar plano"}
        </button>
      </div>

      <div
        className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 mb-4 transition-[height] duration-200"
        style={{ height: planoExpanded ? "82vh" : "48vh" }}
      >
        <div className="rounded-xl border border-line overflow-hidden bg-surface-2">
          {zones.length === 0 ? (
            <div className="h-full grid place-items-center">
              <p className="text-sm text-ink-muted">Este restaurante todavía no tiene zonas configuradas.</p>
            </div>
          ) : (
            <ZoneCanvas
              zones={visibleZones}
              tables={visibleTables}
              selectedTableId={selectedTableId}
              onSelectTable={handleSelectTable}
              onMoveTable={moveTable}
              getTableStatus={getTableStatus}
            />
          )}
        </div>

        {selectedTable && selectedTableZone && restaurantId ? (
          <TableDetailPanel
            table={selectedTable}
            restaurantId={restaurantId}
            zoneName={selectedTableZone.name}
            status={getTableStatus(selectedTable.id)}
            reservationsToday={reservationsByTable.get(selectedTable.id) ?? []}
            allTables={tables}
            groupInfo={tableGroups.get(selectedTable.id)}
            joinPending={joinSourceId === selectedTable.id}
            editable={false}
            onClose={() => {
              setSelectedTableId(null);
              setJoinSourceId(null);
            }}
            onDelete={() => {}}
            onChangeReservationStatus={changeReservationStatus}
            onSeatWalkIn={(partySize, name, phone, email) => seatWalkIn(selectedTable.id, partySize, name, phone, email)}
            onMoveReservation={moveReservationToTable}
            onSaveNotes={saveReservationNotes}
            onStartJoin={() => setJoinSourceId(selectedTable.id)}
            onCancelJoin={() => setJoinSourceId(null)}
            onUnjoin={() => unjoinTable(selectedTable.id)}
          />
        ) : (
          <div className="flex flex-col gap-4 min-h-0">
            <div className="rounded-xl border border-line bg-surface p-4 flex-1 min-h-0 overflow-y-auto">
              <h2 className="text-sm font-semibold mb-3">Próximas reservas</h2>
              {upcoming.length === 0 ? (
                <p className="text-xs text-ink-faint">No hay reservas próximas.</p>
              ) : (
                <ul className="space-y-1">
                  {upcoming.map((r) => {
                    const zoneName = zones.find((z) => z.id === tables.find((t) => t.id === r.tableId)?.zoneId)?.name;
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => setDetailReservation(r)}
                          className="w-full flex items-center gap-2 text-sm text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2"
                        >
                          <span className="w-12 text-xs tabular-nums text-ink-muted shrink-0">{formatTime(r.startsAt)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{r.customerName}</p>
                            <p className="text-xs text-ink-faint truncate">
                              {r.partySize}p · {r.tableName ? `${zoneName ? `${zoneName} · ` : ""}Mesa ${r.tableName}` : "Sin mesa"}
                            </p>
                          </div>
                          <span
                            className="text-[10px] rounded-full px-2 py-0.5 border shrink-0"
                            style={{ color: RESERVATION_STATUS_COLOR[r.status], borderColor: RESERVATION_STATUS_COLOR[r.status] }}
                          >
                            {RESERVATION_STATUS_LABEL[r.status]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Lista de espera</h2>
                <Link to="/lista-de-espera" className="text-xs text-accent">
                  Ver todas
                </Link>
              </div>
              {waitlist.length === 0 ? (
                <p className="text-xs text-ink-faint">Nadie está esperando ahora mismo.</p>
              ) : (
                <ul className="space-y-2">
                  {waitlist.slice(0, 4).map((w) => (
                    <li key={w.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{w.customerName}</span>
                      <span className="text-xs text-ink-faint shrink-0 ml-2">{w.partySize}p</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 mb-4">
        <h2 className="text-sm font-semibold mb-1">Capacidad por horario</h2>
        <p className="text-xs text-ink-faint mb-3">
          Mesas ocupadas de verdad en cada franja — cuenta tanto lo que ya está sentado y todavía no debería
          liberarse (con el colchón de {rules?.bufferMinutes ?? 15} min) como lo que arranca ahí.
        </p>
        {pacing.length === 0 || tables.length === 0 ? (
          <p className="text-xs text-ink-faint">Sin mesas o sin datos todavía.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pacing.map((slot) => {
              const colorClass =
                slot.pctOccupied >= 90
                  ? "text-status-occupied"
                  : slot.pctOccupied >= 70
                    ? "text-status-arriving"
                    : "text-status-available";
              return (
                <div
                  key={slot.startsAt}
                  className="shrink-0 w-20 rounded-lg border border-line bg-ground px-2 py-2 text-center"
                >
                  <p className="text-[11px] text-ink-faint tabular-nums">
                    {new Date(slot.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className={`text-lg font-semibold tabular-nums mt-0.5 ${colorClass}`}>{slot.pctOccupied}%</p>
                  <p className="text-[10px] text-ink-faint tabular-nums">{slot.freeTables} libres</p>
                  {slot.newArrivals > 0 && (
                    <p className="text-[10px] text-accent tabular-nums">+{slot.newArrivals} nuevas</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">Cubiertos por hora</h2>
          {hourly.length === 0 ? (
            <p className="text-xs text-ink-faint">Sin reservas hoy todavía.</p>
          ) : (
            <div className="space-y-1.5">
              {hourly.map(({ hour, covers, pct }) => (
                <div key={hour} className="flex items-center gap-2 text-xs">
                  <span className="w-9 tabular-nums text-ink-faint">{String(hour).padStart(2, "0")}:00</span>
                  <div className="flex-1 h-2 rounded-full bg-ground overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 tabular-nums text-ink-faint text-right">{covers}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">Insights del día</h2>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="text-sm text-ink-muted">
                {insight}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 content-start">
          <StatTile label="Mesas ocupadas" value={String(occupiedNow)} />
          <StatTile label="Mesas libres" value={String(availableNow)} />
          <StatTile
            label="Facturación hoy"
            value={completedWithAmount.length ? formatCLP(facturacion) : "—"}
            note={completedWithAmount.length ? undefined : "sin reservas completadas con monto cargado"}
          />
          <StatTile
            label="Ticket promedio"
            value={ticketPromedio != null ? formatCLP(ticketPromedio) : "—"}
          />
        </div>
      </div>

      {showNewReservation && restaurantId && (
        <NewReservationForm
          restaurantId={restaurantId}
          date={todayISO()}
          onCancel={() => setShowNewReservation(false)}
          onCreated={() => {
            setShowNewReservation(false);
            reload();
          }}
        />
      )}

      {detailReservation && restaurantId && (
        <ReservationDetailModal
          reservation={
            reservationsToday.find((r) => r.id === detailReservation.id) ?? detailReservation
          }
          restaurantId={restaurantId}
          zoneName={zones.find((z) => z.id === tables.find((t) => t.id === detailReservation.tableId)?.zoneId)?.name ?? null}
          onClose={() => setDetailReservation(null)}
          onChangeStatus={async (id, status) => {
            await changeReservationStatus(id, status);
          }}
          onAssignTable={async (id, tableId, source) => {
            await moveReservationToTable(id, tableId, source);
          }}
          onSaveNotes={saveReservationNotes}
        />
      )}

      {pendingCompletion && (
        <CompleteReservationModal
          customerName={pendingCompletion.customerName}
          onCancel={cancelCompletion}
          onConfirm={confirmCompletion}
          onSkip={skipCompletion}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${value === "—" ? "text-ink-faint" : ""}`}>{value}</p>
      {note && <p className="text-[10px] text-ink-faint mt-0.5">{note}</p>}
    </div>
  );
}

function ZoneTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted hover:text-ink border border-line"
      }`}
    >
      {label}
    </button>
  );
}
