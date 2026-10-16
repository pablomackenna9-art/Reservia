import type { Reservation } from "@reservia/core";
import { Tag } from "../../components/ui";

/** Estado de la re-confirmación del cliente: confirmó, avisó que no viene, o todavía no responde. */
export function CustomerResponseTag({ reservation }: { reservation: Pick<Reservation, "status" | "customerResponse"> }) {
  if (reservation.customerResponse === "declined") return <Tag tone="danger">Cliente avisó que no viene</Tag>;
  if (reservation.customerResponse === "confirmed") return <Tag tone="accent">Cliente confirmó ✓</Tag>;
  if (reservation.status === "confirmed" || reservation.status === "arriving") return <Tag>Esperando confirmación del cliente</Tag>;
  return null;
}
