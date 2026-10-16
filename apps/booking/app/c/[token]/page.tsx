import { ConfirmReservation } from "./ConfirmReservation";

export const dynamic = "force-dynamic";

// El enlace es personal: que no lo indexe ningún buscador.
export const metadata = { title: "Confirma tu reserva", robots: { index: false, follow: false } };

export default function ConfirmPage({ params }: { params: { token: string } }) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <ConfirmReservation token={params.token} />
    </main>
  );
}
