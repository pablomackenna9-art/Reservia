import { useEffect, useMemo, useState } from "react";
import {
  acceptReservation,
  createCustomer,
  createReservation,
  createTable,
  deactivateTable,
  getReservationRules,
  joinTables as apiJoinTables,
  listReservationsForDate,
  listTableGroups,
  listTables,
  listZones,
  setTableBlocked,
  ungroupTables,
  updateReservationNotes,
  updateReservationStatus,
  updateReservationTable,
  updateTable,
  updateTablePosition,
  type ReservationWithDetails,
  type TableGroupInfo,
} from "@reservia/api-client";
import {
  deriveTableStatus,
  type ReservationStatus,
  type ReservationRules,
  type Table,
  type TableAssignmentSource,
  type Zone,
} from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { promptTotalAmountIfCompleting } from "../reservations/promptTotalAmount";

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Shared by the dashboard's embedded plano and the full Plano de mesas page — same data, same actions. */
export function useFloorPlan(restaurantId: string | undefined) {
  const { user } = useAuth();

  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationWithDetails[]>([]);
  const [rules, setRules] = useState<ReservationRules | null>(null);
  const [tableGroups, setTableGroups] = useState<Map<string, TableGroupInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!restaurantId) return;
    const [z, t, r, rr, tg] = await Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
      getReservationRules(supabase, restaurantId),
      listTableGroups(supabase, restaurantId),
    ]);
    setZones(z);
    setTables(t);
    setReservationsToday(r);
    setRules(rr);
    setTableGroups(tg);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, ReservationWithDetails[]>();
    for (const r of reservationsToday) {
      if (!r.tableId) continue;
      map.set(r.tableId, [...(map.get(r.tableId) ?? []), r]);
    }
    return map;
  }, [reservationsToday]);

  function getTableStatus(tableId: string) {
    return deriveTableStatus(reservationsByTable.get(tableId) ?? []);
  }

  async function moveTable(tableId: string, positionX: number, positionY: number) {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, positionX, positionY } : t)));
    await updateTablePosition(supabase, tableId, positionX, positionY);
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
    } else {
      const totalAmount = promptTotalAmountIfCompleting(status);
      await updateReservationStatus(supabase, reservationId, status, totalAmount);
    }
    await reload();
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

  async function moveReservationToTable(reservationId: string, tableId: string, source?: TableAssignmentSource) {
    await updateReservationTable(supabase, reservationId, tableId, source);
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
    await createReservation(supabase, {
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
    await reload();
  }

  return {
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
    updateTableProps,
    toggleTableBlocked,
    duplicateTable,
    deleteTable,
    changeReservationStatus,
    seatWalkIn,
    joinTablesTogether,
    unjoinTable,
    moveReservationToTable,
    saveReservationNotes,
  };
}
