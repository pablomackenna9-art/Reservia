import { useEffect, useState } from "react";
import {
  acceptReservation,
  completeReservationWithConsumption,
  getReservationRules,
  listReservationsForDate,
  updateReservationNotes,
  updateReservationStatus,
  updateReservationTable,
  type ConsumptionItemInput,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { RESERVATION_STATUSES, type ReservationRules, type ReservationStatus } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { NewReservationForm } from "./NewReservationForm";
import { ReservationDetailModal } from "./ReservationDetailModal";
import { CompleteReservationModal } from "./CompleteReservationModal";
import { RESERVATION_STATUS_COLOR, RESERVATION_STATUS_LABEL } from "./statusStyles";

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO(): string {
  return dateToISO(new Date());
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function ReservasPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [date, setDate] = useState(todayISO());
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailReservation, setDetailReservation] = useState<ReservationWithDetails | null>(null);
  const [rules, setRules] = useState<ReservationRules | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<ReservationWithDetails | null>(null);

  async function reload() {
    if (!restaurantId) return;
    setLoading(true);
    const [r, rr] = await Promise.all([
      listReservationsForDate(supabase, restaurantId, date),
      getReservationRules(supabase, restaurantId),
    ]);
    setReservations(r);
    setRules(rr);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, date]);

  async function handleStatusChange(id: string, status: ReservationStatus) {
    const reservation = reservations.find((r) => r.id === id);
    if (status === "confirmed" && reservation?.status === "pending" && rules) {
      await acceptReservation(supabase, reservation, rules.tableAssignmentMode);
      reload();
      return;
    }
    if (status === "completed" && reservation) {
      setPendingCompletion(reservation); // el checkout real corre en confirmCompletion/skipCompletion
      return;
    }
    await updateReservationStatus(supabase, id, status);
    reload();
  }

  async function confirmCompletion(items: ConsumptionItemInput[]) {
    if (!pendingCompletion) return;
    await completeReservationWithConsumption(supabase, pendingCompletion, items);
    setPendingCompletion(null);
    reload();
  }

  async function skipCompletion() {
    if (!pendingCompletion) return;
    await updateReservationStatus(supabase, pendingCompletion.id, "completed");
    setPendingCompletion(null);
    reload();
  }

  return (
    <div className="p-6">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Reservas</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-ink-muted">
            <button onClick={() => setDate((d) => shiftDate(d, -1))} className="hover:text-ink">
              ←
            </button>
            <span>
              {new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <button onClick={() => setDate((d) => shiftDate(d, 1))} className="hover:text-ink">
              →
            </button>
            {date !== todayISO() && (
              <button onClick={() => setDate(todayISO())} className="text-accent text-xs ml-1">
                Hoy
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!restaurantId}
          className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          + Nueva reserva
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : reservations.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface min-h-[50vh] grid place-items-center">
          <p className="text-sm text-ink-muted">No hay reservas para este día.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {reservations.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailReservation(r)}
              onKeyDown={(e) => e.key === "Enter" && setDetailReservation(r)}
              className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer hover:bg-surface-2"
            >
              <span className="w-14 text-sm tabular-nums text-ink-muted">{formatTime(r.startsAt)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  {r.customerName}
                  {r.source === "walk_in" && (
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-line text-ink-faint shrink-0">
                      Walk-in
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-faint">
                  {r.partySize} personas{r.tableName ? ` · Mesa ${r.tableName}` : " · sin mesa asignada"}
                  {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                </p>
              </div>
              <span
                className="text-xs rounded-full px-2.5 py-1 border"
                style={{ color: RESERVATION_STATUS_COLOR[r.status], borderColor: RESERVATION_STATUS_COLOR[r.status] }}
              >
                {RESERVATION_STATUS_LABEL[r.status]}
              </span>
              <select
                value={r.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => handleStatusChange(r.id, e.target.value as ReservationStatus)}
                className="rounded-lg bg-ground border border-line text-xs px-2 py-1.5 outline-none focus:border-accent"
              >
                {RESERVATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {RESERVATION_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {showForm && restaurantId && (
        <NewReservationForm
          restaurantId={restaurantId}
          date={date}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {detailReservation && restaurantId && (
        <ReservationDetailModal
          reservation={reservations.find((r) => r.id === detailReservation.id) ?? detailReservation}
          restaurantId={restaurantId}
          zoneName={null}
          onClose={() => setDetailReservation(null)}
          onChangeStatus={async (id, status) => {
            await handleStatusChange(id, status);
          }}
          onAssignTable={async (id, tableId, source) => {
            await updateReservationTable(supabase, id, tableId, source);
            await reload();
          }}
          onSaveNotes={async (id, notes) => {
            await updateReservationNotes(supabase, id, notes);
            await reload();
          }}
        />
      )}

      {pendingCompletion && (
        <CompleteReservationModal
          customerName={pendingCompletion.customerName}
          onCancel={() => setPendingCompletion(null)}
          onConfirm={confirmCompletion}
          onSkip={skipCompletion}
        />
      )}
    </div>
  );
}
