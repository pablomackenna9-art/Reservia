import { TableMenu } from "./TableMenu";

export const dynamic = "force-dynamic";

// El QR es de una mesa: que no lo indexe ningún buscador.
export const metadata = { title: "Carta y pedidos de tu mesa", robots: { index: false, follow: false } };

export default function TableQrPage({ params }: { params: { token: string } }) {
  return <TableMenu token={params.token} />;
}
