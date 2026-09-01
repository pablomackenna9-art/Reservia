import { useEffect, useState } from "react";
import { listReservationsForDate, updateReservationStatus, type ReservationWithDetails } from "@reservia/api-client";
import { RESERVATION_STATUSES, type ReservationStatus } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { NewReservationForm } from "./NewReservationForm";
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

  async function reload() {
    if (!restaurantId) return;
    setLoading(true);
    setReservations(await listReservationsForDate(supabase, restaurantId, date));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, date]);

  async function handleStatusChange(id: string, status: ReservationStatus) {
    await updateReservationStatus(supabase, id, status);
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
            <div key={r.id} className="flex items-center gap-4 px-4 py-3">
              <span className="w-14 text-sm tabular-nums text-ink-muted">{formatTime(r.startsAt)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.customerName}</p>
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
    </div>
  );
}
