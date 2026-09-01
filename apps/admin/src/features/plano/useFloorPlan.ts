import { useEffect, useMemo, useState } from "react";
import {
  createCustomer,
  createReservation,
  deactivateTable,
  getReservationRules,
  listReservationsForDate,
  listTables,
  listZones,
  updateReservationStatus,
  updateTablePosition,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { deriveTableStatus, type ReservationStatus, type ReservationRules, type Table, type Zone } from "@reservia/core";
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
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!restaurantId) return;
    const [z, t, r, rr] = await Promise.all([
      listZones(supabase, restaurantId),
      listTables(supabase, restaurantId),
      listReservationsForDate(supabase, restaurantId, todayISO()),
      getReservationRules(supabase, restaurantId),
    ]);
    setZones(z);
    setTables(t);
    setReservationsToday(r);
    setRules(rr);
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

  async function deleteTable(tableId: string) {
    if (!confirm("¿Eliminar esta mesa? Se puede volver a crear, pero no se recupera esta.")) return false;
    await deactivateTable(supabase, tableId);
    await reload();
    return true;
  }

  async function changeReservationStatus(reservationId: string, status: ReservationStatus) {
    const totalAmount = promptTotalAmountIfCompleting(status);
    await updateReservationStatus(supabase, reservationId, status, totalAmount);
    await reload();
  }

  async function seatWalkIn(tableId: string, partySize: number, name: string) {
    if (!restaurantId || !user) return;
    const table = tables.find((t) => t.id === tableId);
    const duration = rules?.defaultDurationMinutes ?? 90;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + duration * 60_000).toISOString();

    const customer = await createCustomer(supabase, { restaurantId, firstName: name });
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
    loading,
    reload,
    getTableStatus,
    moveTable,
    deleteTable,
    changeReservationStatus,
    seatWalkIn,
  };
}
