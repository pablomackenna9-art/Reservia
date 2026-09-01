import { useEffect, useState } from "react";
import {
  listReservationsNeedingAttention,
  updateReservationNotes,
  updateReservationStatus,
  updateReservationTable,
  type ReservationWithDetails,
} from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ReservationDetailModal } from "../reservations/ReservationDetailModal";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificacionesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [pendingApproval, setPendingApproval] = useState<ReservationWithDetails[]>([]);
  const [unassignedTable, setUnassignedTable] = useState<ReservationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailReservation, setDetailReservation] = useState<ReservationWithDetails | null>(null);

  async function reload() {
    if (!restaurantId) return;
    const { pendingApproval: p, unassignedTable: u } = await listReservationsNeedingAttention(supabase, restaurantId);
    setPendingApproval(p);
    setUnassignedTable(u);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleAccept(id: string) {
    await updateReservationStatus(supabase, id, "confirmed");
    await reload();
  }

  async function handleReject(id: string) {
    if (!confirm("¿Rechazar esta solicitud de reserva?")) return;
    await updateReservationStatus(supabase, id, "cancelled");
    await reload();
  }

  async function handleChangeStatus(id: string, status: Parameters<typeof updateReservationStatus>[2]) {
    await updateReservationStatus(supabase, id, status);
    await reload();
    setDetailReservation(null);
  }

  async function handleAssignTable(id: string, tableId: string) {
    await updateReservationTable(supabase, id, tableId);
    await reload();
    setDetailReservation(null);
  }

  async function handleSaveNotes(id: string, notes: string) {
    await updateReservationNotes(supabase, id, notes);
    await reload();
  }

  if (loading) {
    return <div className="p-6 text-ink-muted text-sm">Cargando…</div>;
  }

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Notificaciones</h1>
        <p className="text-sm text-ink-muted mt-0.5">Lo que necesita tu decisión antes de que llegue el cliente.</p>
      </header>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
          Pendientes de aprobación
          {pendingApproval.length > 0 && (
            <span className="rounded-full bg-accent text-accent-ink text-[11px] px-2 py-0.5">{pendingApproval.length}</span>
          )}
        </h2>
        {pendingApproval.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
            <p className="text-sm text-ink-faint">No hay solicitudes esperando respuesta.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {pendingApproval.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <button onClick={() => setDetailReservation(r)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{r.customerName}</p>
                  <p className="text-xs text-ink-faint">
                    {formatWhen(r.startsAt)} · {r.partySize} personas
                    {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                  </p>
                </button>
                <button
                  onClick={() => handleAccept(r.id)}
                  className="rounded-lg bg-accent text-accent-ink px-2.5 py-1.5 text-xs font-medium shrink-0"
                >
                  Aceptar
                </button>
                <button
                  onClick={() => handleReject(r.id)}
                  className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5 text-xs text-status-occupied hover:border-status-occupied shrink-0"
                >
                  Rechazar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
          Sin mesa asignada
          {unassignedTable.length > 0 && (
            <span className="rounded-full bg-status-arriving text-accent-ink text-[11px] px-2 py-0.5">
              {unassignedTable.length}
            </span>
          )}
        </h2>
        {unassignedTable.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
            <p className="text-sm text-ink-faint">Todas las reservas aceptadas tienen mesa.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
            {unassignedTable.map((r) => (
              <button
                key={r.id}
                onClick={() => setDetailReservation(r)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.customerName}</p>
                  <p className="text-xs text-ink-faint">
                    {formatWhen(r.startsAt)} · {r.partySize} personas
                  </p>
                </div>
                <span className="text-xs text-accent shrink-0">Asignar mesa →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {detailReservation && restaurantId && (
        <ReservationDetailModal
          reservation={
            [...pendingApproval, ...unassignedTable].find((r) => r.id === detailReservation.id) ?? detailReservation
          }
          restaurantId={restaurantId}
          zoneName={null}
          onClose={() => setDetailReservation(null)}
          onChangeStatus={handleChangeStatus}
          onAssignTable={handleAssignTable}
          onSaveNotes={handleSaveNotes}
        />
      )}
    </div>
  );
}
