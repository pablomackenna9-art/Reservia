import { useEffect, useMemo, useState } from "react";
import {
  acceptReservation,
  completeReservationWithConsumption,
  createCustomer,
  createDecor,
  createReservation,
  createTable,
  deactivateTable,
  deleteDecor,
  getReservationRules,
  joinTables as apiJoinTables,
  listDecor,
  listOpenTableRequests,
  updateTableRequestStatus,
  listPayingTables,
  listReservationsForDate,
  listTableGroups,
  mergeTableModules,
  returnModuleHome,
  splitTableIntoModules,
  listTables,
  listZones,
  seatWaitlistEntry,
  setTableBlocked,
  ungroupTables,
  updateReservationNotes,
  updateReservationStatus,
  updateDecor,
  updateReservationTable,
  assignReservationToTableOrGroup,
  assignCandidateToReservation,
  releaseTableFromReservation,
  updateTable,
  updateTablePosition,
  type ConsumptionItemInput,
  type ReservationWithDetails,
  type TableGroupInfo,
} from "@reservia/api-client";
import {
  DECOR_META,
  deriveTableStatus,
  findTurnoverConflict,
  type ReservationStatus,
  type TableRequest,
  type TableRequestStatus,
  type ReservationRules,
  type Table,
  type TableAssignmentSource,
  type DecorKind,
  type TableLiveStatusValue,
  type Zone,
  type ZoneDecor,
} from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Shared by the dashboard's embedded plano and the full Plano de mesas page — same data, same actions. */
export function useFloorPlan(restaurantId: string | undefined) {
  const { user } = useAuth();

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [decor, setDecor] = useState<ZoneDecor[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationWithDetails[]>([]);
  const [rules, setRules] = useState<ReservationRules | null>(null);
  // Mesas con la cuenta pedida/pagada según el POS (tableId -> monto): se ven como "Pagando".
  const [payingTotals, setPayingTotals] = useState<Map<string, number>>(new Map());
  const [tableGroups, setTableGroups] = useState<Map<string, TableGroupInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pendingCompletion, setPendingCompletion] = useState<ReservationWithDetails | null>(null);

  // Avisos de los clientes (QR): se consultan más seguido que el resto porque "llamar al mozo" no puede esperar.
  async function reloadRequests() {
    if (!restaurantId) return;
    // Es opcional: si la migración 0037 aún no está aplicada, el plano sigue funcionando sin avisos.
    setRequests(await listOpenTableRequests(supabase, restaurantId).catch(() => [] as TableRequest[]));
  }

  async function setRequestStatus(requestId: string, status: TableRequestStatus) {
    await updateTableRequestStatus(supabase, requestId, status, user?.id);
    await reloadRequests();
  }

  async function reload() {
    if (!restaurantId) return;
    reloadRequests();
    const [z, t, r, rr, tg, paying, dec] = await Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
      getReservationRules(supabase, restaurantId),
      listTableGroups(supabase, restaurantId),
      listPayingTables(supabase, restaurantId),
      // La decoración es opcional: si algo falla (o aún no existe la tabla) el plano sigue funcionando sin ella.
      listDecor(supabase, restaurantId).catch(() => [] as ZoneDecor[]),
    ]);
    setDecor(dec);
    setZones(z);
    setTables(t);
    setReservationsToday(r);
    setRules(rr);
    setTableGroups(tg);
    setPayingTotals(paying);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // El POS (y el resto del staff) cambian cosas desde afuera: se refresca solo cada 20 s mientras la pestaña está visible.
  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reloadRequests();
    }, 8_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const requestsByTable = useMemo(() => {
    const map = new Map<string, TableRequest[]>();
    for (const r of requests) map.set(r.tableId, [...(map.get(r.tableId) ?? []), r]);
    return map;
  }, [requests]);

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, ReservationWithDetails[]>();
    for (const r of reservationsToday) {
      // Una reserva con mesas unidas (unión de la reserva o grupo armado a mano) ocupa todas sus mesas, no solo la principal.
      const ids = new Set<string>([...(r.tableId ? [r.tableId, ...(tableGroups.get(r.tableId)?.tableIds ?? [])] : []), ...(r.extraTableIds ?? [])]);
      for (const id of ids) map.set(id, [...(map.get(id) ?? []), r]);
    }
    return map;
  }, [reservationsToday, tableGroups]);

  function getTableStatus(tableId: string): TableLiveStatusValue {
    const derived = deriveTableStatus(reservationsByTable.get(tableId) ?? []);
    return derived === "occupied" && payingTotals.has(tableId) ? "paying" : derived;
  }

  function getTurnoverWarning(tableId: string): boolean {
    return findTurnoverConflict(reservationsByTable.get(tableId) ?? []) !== null;
  }

  async function moveTable(tableId: string, positionX: number, positionY: number, joinedTo?: string | null) {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, positionX, positionY, ...(joinedTo !== undefined ? { joinedTo } : {}) } : t)));
    await updateTablePosition(supabase, tableId, positionX, positionY, joinedTo);
  }

  async function updateTableProps(
    tableId: string,
    patch: Partial<Pick<Table, "name" | "shape" | "capacityMin" | "capacityMax" | "width" | "height" | "rotation">>,
  ) {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...patch } : t)));
    await updateTable(supabase, tableId, patch);
  }

  async function toggleTableBlocked(tableId: string, blocked: boolean, reason?: string | null) {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, blocked, blockedReason: blocked ? (reason ?? null) : null } : t)));
    await setTableBlocked(supabase, tableId, blocked, reason);
  }

  /** Copies shape/capacity/size from an existing table onto a new one, offset slightly so it doesn't land exactly on top. */
  async function duplicateTable(tableId: string): Promise<string | null> {
    const source = tables.find((t) => t.id === tableId);
    if (!source || !restaurantId) return null;
    const created = await createTable(supabase, {
      restaurantId,
      zoneId: source.zoneId,
      name: `${source.name} copia`,
      shape: source.shape,
      capacityMin: source.capacityMin,
      capacityMax: source.capacityMax,
      positionX: Math.min(96, source.positionX + 4),
      positionY: Math.min(96, source.positionY + 4),
      width: source.width,
      height: source.height,
    });
    await reload();
    return created.id;
  }

  async function deleteTable(tableId: string) {
    if (!confirm("¿Eliminar esta mesa? Se puede volver a crear, pero no se recupera esta.")) return false;
    await deactivateTable(supabase, tableId);
    await reload();
    return true;
  }

  async function changeReservationStatus(reservationId: string, status: ReservationStatus) {
    const reservation = reservationsToday.find((r) => r.id === reservationId);
    if (status === "confirmed" && reservation?.status === "pending" && rules) {
      await acceptReservation(supabase, reservation, rules.tableAssignmentMode);
      await reload();
      return;
    }
    if (status === "completed" && reservation) {
      setPendingCompletion(reservation); // el checkout real corre en confirmCompletion/skipCompletion
      return;
    }
    await updateReservationStatus(supabase, reservationId, status);
    await reload();
  }

  async function confirmCompletion(items: ConsumptionItemInput[]) {
    if (!pendingCompletion) return;
    await completeReservationWithConsumption(supabase, pendingCompletion, items);
    setPendingCompletion(null);
    await reload();
  }

  async function skipCompletion() {
    if (!pendingCompletion) return;
    // Sin ítems nuevos -- si ya había una cuenta en curso (ver ./consumption)
    // la cierra con lo que ya tenía en vez de descartarlo; si no, cierra en $0.
    await completeReservationWithConsumption(supabase, pendingCompletion, []);
    setPendingCompletion(null);
    await reload();
  }

  function cancelCompletion() {
    setPendingCompletion(null);
  }

  /**
   * Joins two tables for a bigger party. Same zone only — "next to each
   * other" doesn't mean anything across two different rooms. Moves the
   * second table to sit right against the first (keeps their existing
   * direction from one another, just closes the gap) and links them in
   * table_groups so the plano can show them as one unit.
   */
  async function joinTablesTogether(tableAId: string, tableBId: string): Promise<string | null> {
    if (!restaurantId || tableAId === tableBId) return null;
    const a = tables.find((t) => t.id === tableAId);
    const b = tables.find((t) => t.id === tableBId);
    if (!a || !b || a.zoneId !== b.zoneId) return null;
    const zone = zones.find((z) => z.id === a.zoneId);
    if (!zone) return null;

    const aUnits = { x: (a.positionX / 100) * zone.width, y: (a.positionY / 100) * zone.height };
    const bUnits = { x: (b.positionX / 100) * zone.width, y: (b.positionY / 100) * zone.height };
    let dx = bUnits.x - aUnits.x;
    let dy = bUnits.y - aUnits.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    if (length < 0.01) {
      dx = 1;
      dy = 0;
    }

    const gap = 6;
    const distance = a.width / 2 + b.width / 2 + gap;
    const newBUnits = { x: aUnits.x + dx * distance, y: aUnits.y + dy * distance };
    const newPositionX = Math.min(98, Math.max(2, (newBUnits.x / zone.width) * 100));
    const newPositionY = Math.min(98, Math.max(2, (newBUnits.y / zone.height) * 100));

    await updateTablePosition(supabase, b.id, newPositionX, newPositionY);
    const groupId = await apiJoinTables(supabase, restaurantId, a.id, b.id, `Mesa ${a.name}+${b.name}`);
    await reload();
    return groupId;
  }

  async function unjoinTable(tableId: string) {
    const info = tableGroups.get(tableId);
    if (!info) return;
    await ungroupTables(supabase, info.groupId);
    await reload();
  }

  // --- Mesas grandes hechas de módulos ---
  async function splitTable(tableId: string, capacities: number[]) {
    await splitTableIntoModules(supabase, tableId, capacities);
    await reload();
  }

  async function mergeModules(layoutId: string) {
    await mergeTableModules(supabase, layoutId);
    await reload();
  }

  async function returnModuleToHome(tableId: string) {
    const table = tables.find((t) => t.id === tableId);
    if (!table || table.homeX == null || table.homeY == null) return;
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, positionX: table.homeX!, positionY: table.homeY!, rotation: table.homeRotation ?? t.rotation } : t)));
    await returnModuleHome(supabase, table);
  }

  // --- Decoración del plano (plantas, columnas, barra...) ---
  async function addDecor(zoneId: string, kind: DecorKind): Promise<string | null> {
    if (!restaurantId) return null;
    const meta = DECOR_META[kind];
    // Cada objeto nuevo aparece un poco desplazado para que no se encimen al agregar varios.
    const nudge = (decor.filter((d) => d.zoneId === zoneId).length % 6) * 3;
    try {
      const created = await createDecor(supabase, {
        restaurantId,
        zoneId,
        kind,
        positionX: 50 + nudge,
        positionY: 50 + nudge,
        width: meta.width,
        height: meta.height,
      });
      setDecor((prev) => [...prev, created]);
      return created.id;
    } catch (err) {
      alert(err && typeof err === "object" && "message" in err ? String(err.message) : "No se pudo agregar el objeto.");
      return null;
    }
  }

  async function updateDecorProps(id: string, patch: Partial<Pick<ZoneDecor, "positionX" | "positionY" | "width" | "height" | "rotation">>) {
    setDecor((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    await updateDecor(supabase, id, patch);
  }

  async function removeDecor(id: string) {
    setDecor((prev) => prev.filter((d) => d.id !== id));
    await deleteDecor(supabase, id);
  }

  async function moveReservationToTable(reservationId: string, tableId: string, source?: TableAssignmentSource, tableIds?: string[]) {
    if (tableIds && tableIds.length > 1) await assignCandidateToReservation(supabase, reservationId, { tableIds }, source ?? "manual");
    else if (restaurantId) await assignReservationToTableOrGroup(supabase, restaurantId, reservationId, tableId, source);
    else await updateReservationTable(supabase, reservationId, tableId, source);
    await reload();
  }

  /** Llegaron menos personas: la reserva suelta una de sus mesas unidas y sigue con las demás. */
  async function releaseReservationTable(reservationId: string, tableId: string) {
    const reservation = reservationsToday.find((r) => r.id === reservationId);
    if (!reservation) return;
    await releaseTableFromReservation(supabase, reservation, tableId);
    await reload();
  }

  async function saveReservationNotes(reservationId: string, notes: string) {
    await updateReservationNotes(supabase, reservationId, notes);
    await reload();
  }

  async function seatWalkIn(tableId: string, partySize: number, name: string, phone?: string, email?: string) {
    if (!restaurantId || !user) return;
    const table = tables.find((t) => t.id === tableId);
    const duration = rules?.defaultDurationMinutes ?? 90;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + duration * 60_000).toISOString();

    const customer = await createCustomer(supabase, {
      restaurantId,
      firstName: name,
      phone: phone || undefined,
      email: email || undefined,
    });
    const created = await createReservation(supabase, {
      restaurantId,
      customerId: customer.id,
      tableId: table?.id ?? tableId,
      startsAt,
      endsAt,
      partySize,
      status: "seated",
      source: "walk_in",
      createdBy: user.id,
    });
    // Si la mesa está pegada a otras en el plano, se sienta en el conjunto completo.
    await assignReservationToTableOrGroup(supabase, restaurantId, created.id, table?.id ?? tableId);
    await reload();
  }

  /** Arrastrar una entrada de la lista de espera hasta una mesa del plano -- misma lógica que "Asignar mesa" en WaitlistPanel, un solo reload deja plano y vista de reservas al día. */
  async function seatFromWaitlist(
    entry: { id: string; customerId: string; partySize: number },
    tableId: string,
  ) {
    if (!restaurantId || !user) return;
    await seatWaitlistEntry(supabase, {
      restaurantId,
      entry,
      tableId,
      createdBy: user.id,
      durationMinutes: rules?.defaultDurationMinutes,
    });
    await reload();
  }

  return {
    zones,
    tables,
    decor,
    splitTable,
    mergeModules,
    returnModuleToHome,
    addDecor,
    updateDecorProps,
    removeDecor,
    reservationsToday,
    reservationsByTable,
    requests,
    requestsByTable,
    setRequestStatus,
    payingTotals,
    rules,
    tableGroups,
    loading,
    reload,
    getTableStatus,
    getTurnoverWarning,
    moveTable,
    updateTableProps,
    toggleTableBlocked,
    duplicateTable,
    deleteTable,
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
    releaseReservationTable,
    saveReservationNotes,
  };
}
