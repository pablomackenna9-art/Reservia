import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { listWaitlist, setAverageTicketPerPerson, type ReservationWithDetails, type WaitlistEntryWithCustomer } from "@reservia/api-client";
import { compareTableNames, computeCapacityPacing, findLateArrivals, minutesSince, reservationsActiveInWindow } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas, WAITLIST_DRAG_MIME, type WaitlistDragPayload } from "../plano/ZoneCanvas";
import { TableDetailPanel } from "../plano/TableDetailPanel";
import { useFloorPlan, todayISO } from "../plano/useFloorPlan";
import { NewReservationForm } from "../reservations/NewReservationForm";
import { ReservationDetailModal } from "../reservations/ReservationDetailModal";
import { CompleteReservationModal } from "../reservations/CompleteReservationModal";
import { RESERVATION_STATUS_LABEL } from "../reservations/statusStyles";
import { reservationVisualState, STATE_LABEL, stateClass, tableVisualState, type VisualState } from "../../lib/stateStyle";
import { SegTabs, StateSwatch } from "../../components/ui";
import type { TableInfoLine } from "../plano/TableToken";
import { WaitlistPanel } from "../waitlist/WaitlistPanel";
import { ReservationsTimeline } from "./ReservationsTimeline";

const WAITLIST_SOURCE_LABEL = { walk_in: "En el lugar", public_portal: "Portal", reservation: "Desde reserva" } as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function formatElapsed(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const LEGEND_STATES: VisualState[] = ["free", "reserved", "arriving", "occupied", "paying", "blocked"];

export function DashboardPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const {
    zones,
    tables,
    reservationsToday,
    reservationsByTable,
    payingTotals,
    rules,
    tableGroups,
    loading,
    reload,
    getTableStatus,
    getTurnoverWarning,
    moveTable,
    changeReservationStatus,
    pendingCompletion,
    confirmCompletion,
    skipCompletion,
    cancelCompletion,
    seatWalkIn,
    seatFromWaitlist,
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
  const [viewMode, setViewMode] = useState<"plano" | "timeline">("plano");
  const [editingTicket, setEditingTicket] = useState(false);
  const [detailReservation, setDetailReservation] = useState<ReservationWithDetails | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [expandedSlotStart, setExpandedSlotStart] = useState<string | null>(null);
  const [sidebarWaitlist, setSidebarWaitlist] = useState<WaitlistEntryWithCustomer[]>([]);
  const [waitlistMinimized, setWaitlistMinimized] = useState(false);
  const [upcomingSearch, setUpcomingSearch] = useState("");

  // El botón "+ Nueva reserva" vive en la barra superior y llega acá por location.state.
  const location = useLocation();
  const navigate = useNavigate();
  const openNewReservationToken = (location.state as { openNewReservation?: number } | null)?.openNewReservation;
  useEffect(() => {
    if (openNewReservationToken) {
      setShowNewReservation(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewReservationToken]);

  useEffect(() => {
    if (!restaurantId) return;
    listWaitlist(supabase, restaurantId).then(setSidebarWaitlist);
    // Carga liviana propia -- mismo patrón que WaitlistPanel, que también se
    // trae su propia lista en vez de compartir estado -- se refresca sola
    // cada vez que reservationsToday cambia (un drop exitoso dispara reload()
    // del plano, que actualiza reservationsToday, que dispara este efecto).
  }, [restaurantId, reservationsToday]);

  function handleDropWaitlistEntry(payload: WaitlistDragPayload, tableId: string) {
    seatFromWaitlist({ id: payload.waitlistEntryId, customerId: payload.customerId, partySize: payload.partySize }, tableId);
  }

  const now = new Date();
  const active = reservationsToday.filter((r) => r.status !== "cancelled");

  // Un conteo por los 4 estados reales, no solo "ocupada vs. el resto" --
  // una mesa reservada para más tarde no está libre, aunque nadie esté
  // sentado ahí todavía. Todo lo que se muestra como "libre" en el
  // dashboard sale de este mismo cálculo para que no se contradigan entre sí.
  const tableStatusCounts = { occupied: 0, arriving: 0, reserved: 0, available: 0, paying: 0, blocked: 0 };
  for (const t of tables) tableStatusCounts[getTableStatus(t.id)]++;
  const occupiedNow = tableStatusCounts.occupied;
  const availableNow = tableStatusCounts.available;

  const lateArrivals = findLateArrivals(active, now);

  const cubiertosReservados = active.reduce((sum, r) => sum + r.partySize, 0);
  const estimatedRevenue = (rules?.averageTicketPerPerson ?? 0) * cubiertosReservados;

  const completedWithAmount = reservationsToday.filter((r) => r.status === "completed" && r.totalAmount != null);
  const facturacion = completedWithAmount.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
  const ticketPromedio = completedWithAmount.length ? facturacion / completedWithAmount.length : null;

  // Sin tope -- el panel lateral tiene su propio scroll, y el pedido fue
  // específicamente "poder ver todas las reservas que vienen".
  // Próximas 3 horas -- mostrarlas todas sin límite de tiempo (como estaba
  // antes) hacía la lista enorme y poco útil a media mañana.
  const UPCOMING_WINDOW_MS = 3 * 60 * 60_000;
  const upcoming = active
    .filter((r) => {
      const startsAt = new Date(r.startsAt).getTime();
      return startsAt >= now.getTime() && startsAt <= now.getTime() + UPCOMING_WINDOW_MS && r.status !== "seated";
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const upcomingFiltered = upcomingSearch.trim()
    ? upcoming.filter((r) => r.customerName.toLowerCase().includes(upcomingSearch.trim().toLowerCase()))
    : upcoming;

  const insights: string[] = [];
  if (active.length > 0) insights.push(`Tenés ${active.length} reserva${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"} hoy.`);
  if (tables.length > 0) insights.push(`${availableNow} de ${tables.length} mesas están libres de verdad ahora mismo (sin contar las reservadas o por llegar).`);
  if (lateArrivals.length > 0)
    insights.push(
      `${lateArrivals.length} reserva${lateArrivals.length === 1 ? "" : "s"} no ${lateArrivals.length === 1 ? "ha" : "han"} llegado a la hora — ver aviso arriba.`,
    );
  if (upcoming.length > 0) insights.push(`La próxima reserva es a las ${formatTime(upcoming[0]!.startsAt)} — ${upcoming[0]!.customerName}.`);
  if (insights.length === 0) insights.push("Sin reservas todavía — se llena a medida que entren.");

  // Ventana fija de almuerzo+cena (13:00–22:00), no "desde ahora" -- si son
  // las 4pm, el dueño igual quiere ver cómo vino el almuerzo, no solo lo que
  // falta del día.
  const CAPACITY_SLOT_MINUTES = 30;
  const CAPACITY_WINDOW_MINUTES = 9 * 60;
  const capacityWindowStart = (() => {
    const d = new Date(now);
    d.setHours(13, 0, 0, 0);
    return d;
  })();

  const pacing = useMemo(
    () =>
      computeCapacityPacing(tables.length, reservationsToday, capacityWindowStart, {
        slotMinutes: CAPACITY_SLOT_MINUTES,
        horizonMinutes: CAPACITY_WINDOW_MINUTES,
      }),
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
  // Solo la zona puntual que se está mirando -- con "Todo" seleccionado el
  // plano ya muestra las cuatro zonas juntas, repetir el desglose de las
  // cuatro a la vez ahí arriba es ruido, no info nueva.
  const zoneBreakdown = sortedZones
    .filter((zone) => zone.id === effectiveZoneId)
    .map((zone) => {
      const counts = { occupied: 0, arriving: 0, reserved: 0, available: 0 };
      for (const t of tables) {
        if (t.zoneId !== zone.id) continue;
        const status = getTableStatus(t.id);
        if (status in counts) counts[status as keyof typeof counts]++;
      }
      return { zone, counts };
    });
  const visibleZones = effectiveZoneId === "all" ? zones : zones.filter((z) => z.id === effectiveZoneId);
  const visibleTables = tables
    .filter((t) => effectiveZoneId === "all" || t.zoneId === effectiveZoneId)
    .sort((a, b) => compareTableNames(a.name, b.name));
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableZone = selectedTable ? zones.find((z) => z.id === selectedTable.zoneId) ?? null : null;

  /** Línea viva bajo cada mesa del plano: tiempo sentados, hora de la reserva, atraso... */
  function getTableInfo(tableId: string): TableInfoLine | undefined {
    const status = getTableStatus(tableId);
    if (status === "blocked") return { text: "bloqueada" };
    if (status === "available") return { text: "libre" };
    const list = (reservationsByTable.get(tableId) ?? []).filter((r) => !["cancelled", "completed", "no_show"].includes(r.status));
    if (status === "occupied" || status === "paying") {
      const seated = list.find((r) => r.status === "seated");
      if (!seated) return undefined;
      if (status === "paying") {
        const amount = payingTotals.get(tableId);
        return { text: amount ? formatCLP(amount) : "pagando" };
      }
      const mins = minutesSince(seated.startsAt, now);
      return { text: formatElapsed(mins), alert: mins > 90 };
    }
    const next = list
      .filter((r) => r.status !== "seated")
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    if (!next) return undefined;
    if (status === "arriving") return { text: `llega ${formatTime(next.startsAt)}` };
    const late = minutesSince(next.startsAt, now);
    if (late > 0) return { text: `+${late} min`, alert: true };
    const lastName = next.customerName.split(" ").slice(-1)[0];
    return { text: `${formatTime(next.startsAt)} · ${lastName}` };
  }

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
    return <div className="p-6 text-ink-muted text-[15px]">Cargando…</div>;
  }

  const occupancyPct = tables.length ? Math.round((occupiedNow / tables.length) * 100) : null;
  const pendingCount = reservationsToday.filter((r) => r.status === "pending").length;
  const noShowCount = reservationsToday.filter((r) => r.status === "no_show").length;
  const pulseSegments = (["occupied", "paying", "arriving", "reserved", "available", "blocked"] as const)
    .map((k) => ({ state: tableVisualState(k), n: tableStatusCounts[k] }))
    .filter((seg) => seg.n > 0);

  const upcomingGroups = upcomingFiltered.reduce<{ time: string; items: ReservationWithDetails[] }[]>((groups, r) => {
    const time = formatTime(r.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.time === time) last.items.push(r);
    else groups.push({ time, items: [r] });
    return groups;
  }, []);

  return (
    <div className="pb-10">
      {/* ---- Franja de KPIs: celdas separadas por líneas de 1px ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.9fr_1fr_1fr_1fr_1fr_1.1fr] gap-px bg-line border-b border-line">
        <div className="col-span-2 md:col-span-3 xl:col-span-1 bg-ground p-4 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-[52px] leading-[0.9]">{occupancyPct === null ? "—" : `${occupancyPct}%`}</span>
              <span className="text-[15px] text-ink-muted">ocupación ahora</span>
            </div>
            <span className="text-[15px] font-semibold text-status-available whitespace-nowrap">
              {availableNow} mesas libres
            </span>
          </div>
          <div className="flex gap-[3px] h-4 mt-4">
            {pulseSegments.map((seg) => (
              <div
                key={seg.state}
                style={{ flex: seg.n }}
                title={`${STATE_LABEL[seg.state]}: ${seg.n}`}
                className={`${stateClass(seg.state)} rounded-[5px] border-2`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[13px] text-ink-muted">
            {pulseSegments.map((seg) => (
              <span key={seg.state} className="inline-flex items-center gap-1.5">
                <StateSwatch state={seg.state} small />
                {seg.n} {STATE_LABEL[seg.state].toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <Kpi label="Reservas hoy" value={String(active.length)}>
          {pendingCount > 0 ? (
            <Link to="/notificaciones" className="text-accent font-semibold">
              {pendingCount} por aprobar →
            </Link>
          ) : (
            "todas al día"
          )}
        </Kpi>
        <Kpi label="Cubiertos reservados" value={String(cubiertosReservados)}>
          personas esperadas hoy
        </Kpi>
        <Kpi label="No-shows" value={String(noShowCount)} valueClass={noShowCount > 0 ? "text-status-occupied" : ""}>
          {noShowCount > 0 ? "cupo liberado" : "ninguno hoy"}
        </Kpi>
        <Kpi label="Facturación hoy" value={completedWithAmount.length ? formatCLP(facturacion) : "—"}>
          {ticketPromedio != null ? `ticket promedio ${formatCLP(ticketPromedio)}` : "sin reservas completadas"}
        </Kpi>
        <div className="col-span-2 xl:col-span-1 bg-ground p-4 sm:p-6">
          <p className="text-[15px] text-ink-muted flex items-center justify-between">
            Ingresos estimados
            {!editingTicket && (
              <button
                onClick={() => {
                  setTicketInput(String(rules?.averageTicketPerPerson ?? 0));
                  setEditingTicket(true);
                }}
                className="text-[13px] text-accent font-semibold"
                title="Editar ticket promedio estimado"
              >
                editar
              </button>
            )}
          </p>
          {editingTicket ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                type="number"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="Ticket por persona"
                className="w-full h-10 rounded-[10px] bg-surface border border-line px-3 text-[15px] outline-none focus:border-accent"
              />
              <button onClick={saveTicket} className="text-accent text-[13px] font-semibold shrink-0">
                Guardar
              </button>
            </div>
          ) : (
            <p className={`font-serif text-[36px] sm:text-[44px] leading-none mt-2 ${!rules?.averageTicketPerPerson ? "text-ink-faint" : ""}`}>
              {rules?.averageTicketPerPerson ? formatCLP(estimatedRevenue) : "—"}
            </p>
          )}
          <p className="text-[13px] text-ink-faint mt-2">según el ticket promedio</p>
        </div>
      </div>

      {/* ---- Alerta contextual: reservas atrasadas ---- */}
      {lateArrivals.length > 0 && (
        <div className="mx-3 sm:mx-6 mt-4 rounded-xl border border-status-occupied/45 bg-status-occupied/15 px-5 py-4">
          <p className="flex items-center gap-3 text-base font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-status-occupied ring-4 ring-status-occupied/30" />
            {lateArrivals.length} reserva{lateArrivals.length === 1 ? "" : "s"} sin presentarse a la hora
          </p>
          <ul className="mt-3 space-y-2">
            {lateArrivals.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <button onClick={() => setDetailReservation(r)} className="text-left min-w-0 text-[15px]">
                  <span className="font-semibold">{r.customerName}</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {r.partySize}p{r.tableName ? ` · Mesa ${r.tableName}` : ""} · debía llegar a las {formatTime(r.startsAt)}{" "}
                  </span>
                  <span className="text-status-occupied font-semibold">(+{minutesSince(r.startsAt, now)} min)</span>
                </button>
                <div className="flex gap-2 sm:shrink-0">
                  {r.customerPhone && (
                    <a
                      href={`tel:${r.customerPhone}`}
                      className="h-11 px-4 inline-flex items-center justify-center rounded-[10px] bg-surface-2 border border-line text-[15px] font-semibold"
                    >
                      Llamar
                    </a>
                  )}
                  <button
                    onClick={() => changeReservationStatus(r.id, "no_show")}
                    className="h-11 flex-1 sm:flex-none px-4 rounded-[10px] bg-status-occupied text-status-on text-[15px] font-semibold"
                  >
                    Marcar no-show y liberar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {lateArrivals.length > 6 && <p className="text-[13px] text-ink-muted mt-2">+{lateArrivals.length - 6} más</p>}
        </div>
      )}

      {/* ---- Barra de controles ---- */}
      <div className="px-3 sm:px-6 mt-4 mb-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 xl:gap-4">
        <SegTabs
          value={effectiveZoneId}
          onChange={(v) => setActiveZoneId(v)}
          options={[{ value: "all", label: "Todo" }, ...sortedZones.map((z) => ({ value: z.id, label: z.name }))]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/plano-de-mesas" className="text-[15px] text-accent font-semibold whitespace-nowrap">
            Editar plano →
          </Link>
          <SegTabs
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "plano", label: "Plano" },
              { value: "timeline", label: "Línea de tiempo" },
            ]}
          />
          <button
            onClick={() => setPlanoExpanded((v) => !v)}
            className="h-11 px-4 rounded-xl bg-surface text-[15px] text-ink-muted hover:text-ink whitespace-nowrap"
          >
            {planoExpanded ? "↙ Achicar" : "↗ Agrandar"}
          </button>
        </div>
      </div>

      {zoneBreakdown.length > 0 && (
        <div className="px-3 sm:px-6 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-muted">
          {zoneBreakdown.map(({ zone, counts }) => (
            <p key={zone.id}>
              <span className="font-semibold text-ink">{zone.name}</span>
              {" — "}
              <span className="text-status-occupied">{counts.occupied} ocupadas</span>
              {" · "}
              <span className="text-status-arriving">{counts.arriving} por llegar</span>
              {" · "}
              {counts.reserved} reservadas{" · "}
              <span className="text-status-available">{counts.available} libres</span>
            </p>
          ))}
        </div>
      )}

      {/* ---- Área principal: lista de espera · plano · próximas reservas ---- */}
      <div
        className={`grid grid-cols-1 gap-4 px-3 sm:px-6 mb-4 xl:h-[var(--plano-h)] ${
          waitlistMinimized ? "xl:grid-cols-[56px_1fr_356px]" : "xl:grid-cols-[268px_1fr_356px]"
        }`}
        style={{ "--plano-h": planoExpanded ? "82vh" : "620px" } as CSSProperties}
      >
        {waitlistMinimized ? (
          <button
            onClick={() => setWaitlistMinimized(false)}
            className="rounded-2xl bg-surface flex flex-row xl:flex-col items-center gap-3 px-4 py-3 xl:px-0 xl:pt-4 xl:pb-0 hover:bg-surface-2"
            title="Mostrar lista de espera"
          >
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-ink text-xs font-bold flex items-center justify-center">
              {sidebarWaitlist.length}
            </span>
            <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-faint xl:[writing-mode:vertical-rl]">
              Lista de espera
            </span>
          </button>
        ) : (
          <div className="rounded-2xl bg-surface p-4 min-h-0 overflow-y-auto flex flex-col max-h-[420px] xl:max-h-none">
            <button onClick={() => setWaitlistMinimized(true)} className="w-full flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Lista de espera <span className="font-serif text-accent text-2xl ml-1">{sidebarWaitlist.length}</span>
              </h2>
              <span className="text-[13px] text-ink-faint">◂ Minimizar</span>
            </button>
            <p className="text-[13px] text-ink-faint mt-1 mb-3">Arrastra a una mesa libre para sentar</p>
            {sidebarWaitlist.length === 0 ? (
              <p className="text-[15px] text-ink-faint">Nadie esperando ahora mismo.</p>
            ) : (
              <ul className="space-y-2">
                {sidebarWaitlist.map((w) => {
                  const waited = minutesSince(w.requestedAt, now);
                  const quoted = w.estimatedWaitMinutes;
                  const over = quoted ? waited >= quoted * 0.85 : false;
                  return (
                    <li
                      key={w.id}
                      draggable
                      onDragStart={(e) => {
                        const payload: WaitlistDragPayload = {
                          waitlistEntryId: w.id,
                          customerId: w.customerId,
                          partySize: w.partySize,
                          customerName: w.customerName,
                        };
                        e.dataTransfer.setData(WAITLIST_DRAG_MIME, JSON.stringify(payload));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="flex gap-3 rounded-xl bg-surface-2 p-3 cursor-grab active:cursor-grabbing"
                      title="Arrastrar hasta una mesa libre"
                    >
                      <span className="font-serif text-[34px] leading-none w-9 text-center">{w.partySize}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold truncate">{w.customerName}</p>
                        <p className={`text-[13px] ${over ? "text-status-occupied font-semibold" : "text-ink-muted"}`}>
                          {waited} min esperando{quoted ? ` · cotizado ${quoted}` : ""}
                        </p>
                        {quoted ? (
                          <div className="h-1 rounded-full bg-surface-3 mt-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${over ? "bg-status-occupied" : "bg-status-available"}`}
                              style={{ width: `${Math.min(100, (waited / quoted) * 100)}%` }}
                            />
                          </div>
                        ) : null}
                        <p className="text-[13px] text-ink-faint mt-1.5">
                          {WAITLIST_SOURCE_LABEL[w.source]}
                          {w.notes ? ` · ${w.notes}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/lista-de-espera"
              className="mt-3 h-11 rounded-xl border-2 border-dashed border-line text-[15px] text-ink-muted hover:text-ink hover:border-accent flex items-center justify-center"
            >
              + Agregar a la espera
            </Link>
          </div>
        )}

        <div
          className={`bg-surface p-3 sm:p-4 min-h-0 flex flex-col gap-3 ${
            planoExpanded
              ? "fixed inset-0 z-40 xl:static xl:z-auto xl:rounded-2xl"
              : "rounded-2xl h-[460px] sm:h-[560px] xl:h-auto"
          } xl:rounded-2xl`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {LEGEND_STATES.map((st) => (
                <span key={st} className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
                  <StateSwatch state={st} />
                  {STATE_LABEL[st]}
                </span>
              ))}
            </div>
            {planoExpanded && (
              <button
                onClick={() => setPlanoExpanded(false)}
                className="xl:hidden h-11 px-4 shrink-0 rounded-[10px] bg-surface-2 text-[15px] font-semibold"
              >
                ✕ Cerrar
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-surface-2">
            {zones.length === 0 ? (
              <div className="h-full grid place-items-center">
                <p className="text-[15px] text-ink-muted">Este restaurante todavía no tiene zonas configuradas.</p>
              </div>
            ) : viewMode === "timeline" ? (
              <ReservationsTimeline
                zones={visibleZones}
                visibleTables={visibleTables}
                reservationsToday={reservationsToday}
                now={now}
                onSelectReservation={setDetailReservation}
              />
            ) : (
              <ZoneCanvas
                zones={sortedZones}
                tables={tables.slice().sort((a, b) => compareTableNames(a.name, b.name))}
                activeZoneId={effectiveZoneId === "all" ? null : effectiveZoneId}
                selectedTableId={selectedTableId}
                onSelectTable={handleSelectTable}
                onMoveTable={moveTable}
                getTableStatus={getTableStatus}
                getTurnoverWarning={getTurnoverWarning}
                getTableInfo={getTableInfo}
                onDropWaitlistEntry={handleDropWaitlistEntry}
              />
            )}
          </div>
        </div>

        {selectedTable && selectedTableZone && restaurantId ? (
          <TableDetailPanel
            table={selectedTable}
            restaurantId={restaurantId}
            zoneName={selectedTableZone.name}
            status={getTableStatus(selectedTable.id)}
            reservationsToday={reservationsByTable.get(selectedTable.id) ?? []}
            allReservationsToday={reservationsToday}
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
          <div className="rounded-2xl bg-surface p-4 min-h-0 overflow-y-auto flex flex-col max-h-[560px] xl:max-h-none">
            <h2 className="text-lg font-semibold mb-3">Próximas reservas · 3 horas</h2>
            <input
              type="text"
              value={upcomingSearch}
              onChange={(e) => setUpcomingSearch(e.target.value)}
              placeholder="Buscar por nombre…"
              className="w-full h-[42px] rounded-[10px] bg-ground border border-line px-3 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent mb-3 shrink-0"
            />
            {upcoming.length === 0 ? (
              <p className="text-[15px] text-ink-faint">No hay reservas en las próximas 3 horas.</p>
            ) : upcomingFiltered.length === 0 ? (
              <p className="text-[15px] text-ink-faint">Ninguna reserva coincide con "{upcomingSearch}".</p>
            ) : (
              <div className="space-y-4">
                {upcomingGroups.map((group) => (
                  <section key={group.time}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-serif text-[26px] leading-none">{group.time}</span>
                      <span className="text-[13px] text-ink-faint">
                        {group.items.length} reserva{group.items.length === 1 ? "" : "s"} ·{" "}
                        {group.items.reduce((sum, r) => sum + r.partySize, 0)} personas
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {group.items.map((r) => {
                        const zoneName = zones.find((z) => z.id === tables.find((t) => t.id === r.tableId)?.zoneId)?.name;
                        const vs = reservationVisualState(r.status);
                        return (
                          <li key={r.id}>
                            <button
                              onClick={() => setDetailReservation(r)}
                              className="w-full flex items-center gap-3 text-left rounded-xl bg-surface-2 px-3 py-2.5 hover:bg-surface-3"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-semibold truncate">
                                  {r.customerName} <span className="font-normal text-ink-muted">· {r.partySize}p</span>
                                </p>
                                <p className="text-[13px] text-ink-muted inline-flex items-center gap-1.5">
                                  <StateSwatch state={vs} small />
                                  {RESERVATION_STATUS_LABEL[r.status]}
                                  {zoneName ? ` · ${zoneName}` : ""}
                                </p>
                              </div>
                              {r.tableName ? (
                                <span className="font-serif text-[26px] leading-none shrink-0">{r.tableName}</span>
                              ) : (
                                <span className="st-pending border-2 rounded-lg px-2 h-7 inline-flex items-center text-[13px] font-semibold shrink-0">
                                  Sin mesa
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Capacidad por horario ---- */}
      <div className="mx-3 sm:mx-6 rounded-2xl bg-surface p-4 sm:p-5 mb-4">
        <h2 className="text-lg font-semibold mb-1">Capacidad por horario</h2>
        <p className="text-[13px] text-ink-faint mb-4">
          Mesas ocupadas de verdad en cada franja — cuenta lo que ya está sentado y todavía no debería liberarse (colchón de{" "}
          {rules?.bufferMinutes ?? 15} min) y lo que arranca ahí.
        </p>
        {pacing.length === 0 || tables.length === 0 ? (
          <p className="text-[15px] text-ink-faint">Sin mesas o sin datos todavía.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pacing.map((slot) => {
              const barClass =
                slot.pctOccupied >= 85 ? "bg-status-occupied" : slot.pctOccupied >= 60 ? "bg-status-arriving" : "bg-status-available";
              const slotStartMs = new Date(slot.startsAt).getTime();
              const slotEndMs = slotStartMs + CAPACITY_SLOT_MINUTES * 60_000;
              const isNow = now.getTime() >= slotStartMs && now.getTime() < slotEndMs;
              const isExpanded = expandedSlotStart === slot.startsAt;
              return (
                <button
                  key={slot.startsAt}
                  onClick={() => setExpandedSlotStart(isExpanded ? null : slot.startsAt)}
                  className={`shrink-0 w-[104px] rounded-[10px] px-3 py-2.5 text-left ${isExpanded ? "bg-surface-3" : "bg-surface-2"} ${
                    isNow ? "outline outline-2 outline-accent" : ""
                  }`}
                >
                  <p className={`text-[13px] tabular-nums ${isNow ? "text-accent font-semibold" : "text-ink-muted"}`}>
                    {isNow ? "Ahora" : new Date(slot.startsAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-sm font-bold tabular-nums mt-0.5">{slot.pctOccupied}%</p>
                  <div className="h-2 rounded-full bg-surface-3 mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${slot.pctOccupied}%` }} />
                  </div>
                  <p className="text-[13px] text-ink-faint tabular-nums mt-1.5">
                    {slot.occupiedTables} · {slot.freeTables} libres
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {expandedSlotStart &&
          (() => {
            const slotStart = new Date(expandedSlotStart);
            const slotEnd = new Date(slotStart.getTime() + CAPACITY_SLOT_MINUTES * 60_000);
            const atThatHour = reservationsActiveInWindow(active, slotStart, slotEnd, rules?.bufferMinutes ?? 15).sort((a, b) =>
              compareTableNames(a.tableName ?? "", b.tableName ?? ""),
            );
            return (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-[15px] text-ink-muted mb-2">
                  Reservas en {slotStart.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {slotEnd.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {atThatHour.length === 0 ? (
                  <p className="text-[15px] text-ink-faint">Ninguna mesa ocupada en esa franja.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {atThatHour.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => setDetailReservation(r)}
                          className="rounded-[10px] bg-surface-2 px-3 py-2 text-[15px] hover:bg-surface-3 text-left"
                        >
                          <span className="font-semibold">{r.customerName}</span>
                          <span className="text-ink-muted"> · {r.partySize}p{r.tableName ? ` · Mesa ${r.tableName}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
      </div>

      {restaurantId && (
        <div className="mx-3 sm:mx-6 rounded-2xl bg-surface p-4 sm:p-5 mb-4">
          <WaitlistPanel restaurantId={restaurantId} tables={tables} reservationsToday={reservationsToday} />
        </div>
      )}

      <div className="mx-3 sm:mx-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-surface p-5">
          <h2 className="text-lg font-semibold mb-3">Cubiertos por hora</h2>
          {hourly.length === 0 ? (
            <p className="text-[15px] text-ink-faint">Sin reservas hoy todavía.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {hourly.map(({ hour, covers, pct }) => (
                <div key={hour} className="flex items-center gap-3 text-[13px]">
                  <span className="w-11 tabular-nums text-ink-muted">{String(hour).padStart(2, "0")}:00</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 tabular-nums text-ink-muted text-right">{covers}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-surface p-5">
          <h2 className="text-lg font-semibold mb-3">Insights del día</h2>
          <ul className="space-y-2.5">
            {insights.map((insight, i) => (
              <li key={i} className="text-[15px] text-ink-muted">
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
          <StatTile label="Ticket promedio" value={ticketPromedio != null ? formatCLP(ticketPromedio) : "—"} />
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
          reservation={reservationsToday.find((r) => r.id === detailReservation.id) ?? detailReservation}
          restaurantId={restaurantId}
          zoneName={zones.find((z) => z.id === tables.find((t) => t.id === detailReservation.tableId)?.zoneId)?.name ?? null}
          reservationsToday={reservationsToday}
          onClose={() => setDetailReservation(null)}
          onChangeStatus={async (id, status) => {
            await changeReservationStatus(id, status);
          }}
          onAssignTable={async (id, tableId, source) => {
            await moveReservationToTable(id, tableId, source);
          }}
          onSaveNotes={saveReservationNotes}
          onAccepted={async () => {
            await reload();
          }}
        />
      )}

      {pendingCompletion && (
        <CompleteReservationModal
          reservationId={pendingCompletion.id}
          customerName={pendingCompletion.customerName}
          onCancel={cancelCompletion}
          onConfirm={confirmCompletion}
          onSkip={skipCompletion}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass = "",
  children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-ground p-4 sm:p-6">
      <p className="text-[15px] text-ink-muted">{label}</p>
      <p className={`font-serif text-[36px] sm:text-[44px] leading-none mt-2 ${value === "—" ? "text-ink-faint" : ""} ${valueClass}`}>{value}</p>
      <p className="text-[13px] text-ink-faint mt-2">{children}</p>
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-[13px] text-ink-faint">{label}</p>
      <p className={`font-serif text-[30px] leading-none mt-2 ${value === "—" ? "text-ink-faint" : ""}`}>{value}</p>
      {note && <p className="text-[13px] text-ink-faint mt-1.5">{note}</p>}
    </div>
  );
}
