import type { ReservationWithDetails } from "@reservia/api-client";
import { CopyButton, Modal } from "../../components/ui";
import { confirmationLink, confirmationMessage, whatsappUrl } from "../../lib/whatsapp";
import { useRestaurant } from "../restaurants/RestaurantProvider";

/**
 * Avisar al cliente que su reserva fue aceptada, con el enlace para que re-confirme (o avise que no
 * viene). Hoy se manda con un toque por WhatsApp (se abre el chat con el mensaje escrito) y, si dejó
 * correo, también sale por correo.
 */
export function NotifyCustomerModal({
  reservation,
  zoneName,
  accepted,
  onClose,
}: {
  reservation: ReservationWithDetails;
  zoneName?: string | null;
  /** true = recién aceptada (muestra el encabezado de éxito); false = reenvío desde el detalle. */
  accepted: boolean;
  onClose: () => void;
}) {
  const { current } = useRestaurant();
  const restaurant = current?.restaurant;
  const token = reservation.confirmationToken;

  if (!restaurant) return null;

  const message = token
    ? confirmationMessage({
        customerName: reservation.customerName,
        restaurantName: restaurant.name,
        startsAt: reservation.startsAt,
        timezone: restaurant.timezone,
        partySize: reservation.partySize,
        zoneName,
        link: confirmationLink(token),
      })
    : null;
  const wa = message ? whatsappUrl(reservation.customerPhone, message) : null;

  return (
    <Modal title={accepted ? "Reserva aceptada ✓" : "Avisar al cliente"} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px]">
          {accepted ? "Ahora avísale a " : "Enviar la confirmación a "}
          <span className="font-semibold">{reservation.customerName}</span>
          {accepted ? " para que re-confirme que viene. Si no puede, usa el mismo enlace y la mesa queda libre." : "."}
        </p>

        {message ? (
          <>
            <pre className="rounded-xl bg-ground p-4 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-sans">{message}</pre>
            <div className="flex flex-wrap gap-2">
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="h-11 px-4 inline-flex items-center rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
                >
                  Enviar por WhatsApp ↗
                </a>
              ) : (
                <p className="text-[13px] text-status-arriving">Este cliente no tiene un teléfono válido para WhatsApp.</p>
              )}
              <CopyButton text={message} label="Copiar mensaje" />
            </div>
          </>
        ) : (
          <p className="text-[15px] text-status-arriving">Esta reserva no tiene enlace de confirmación.</p>
        )}

        <p className="text-[13px] text-ink-faint">
          {reservation.customerEmail
            ? `También le llega un correo a ${reservation.customerEmail} con el mismo enlace.`
            : "No dejó correo, así que solo puedes avisarle por WhatsApp."}
        </p>

        <button onClick={onClose} className="h-11 px-4 rounded-[10px] text-[15px] font-semibold text-ink-muted">
          Listo
        </button>
      </div>
    </Modal>
  );
}
