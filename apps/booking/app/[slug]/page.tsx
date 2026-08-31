import { getRestaurantBySlug, createReservationClient } from "@reservia/api-client";

export default async function RestaurantBookingPage({ params }: { params: { slug: string } }) {
  // Created per-request, not at module scope, so this route only needs
  // Supabase env vars when it's actually hit — not whenever Next evaluates
  // the module (e.g. while resolving an unrelated 404).
  const supabase = createReservationClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const restaurant = await getRestaurantBySlug(supabase, params.slug);

  if (!restaurant) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <p>No encontramos "{params.slug}".</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{restaurant.name}</h1>
        <p style={{ color: "#b7ac9a" }}>El flujo de reserva pública llega en Fase 3.</p>
      </div>
    </main>
  );
}
