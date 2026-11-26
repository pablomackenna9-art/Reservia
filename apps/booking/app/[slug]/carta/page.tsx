import { createReservationClient, getPublicMenu } from "@reservia/api-client";
import { MenuScreen } from "../../_menu/MenuScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Carta · ${params.slug}` };
}

/** La carta pública del restaurante, solo para mirar (para pedir desde la mesa se escanea el QR). */
export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
  const supabase = createReservationClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const menu = await getPublicMenu(supabase, params.slug);
  if (!menu) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-ink-muted">No encontramos "{params.slug}".</p>
      </main>
    );
  }
  return <MenuScreen menu={menu} />;
}
