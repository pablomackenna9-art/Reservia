import { createReservationClient, getReservationRules, getRestaurantBySlug, listHours } from "@reservia/api-client";
import { BookingFlow } from "./BookingFlow";

// Supabase's client fetches under the hood; without this, Next.js caches those
// fetch() calls at build/first-request time and keeps serving stale restaurant
// data (logo, hours, rules) instead of the live row.
export const dynamic = "force-dynamic";

export default async function RestaurantBookingPage({ params }: { params: { slug: string } }) {
  // Created per-request, not at module scope, so this route only needs
  // Supabase env vars when it's actually hit — not whenever Next evaluates
  // the module (e.g. while resolving an unrelated 404).
  const supabase = createReservationClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const restaurant = await getRestaurantBySlug(supabase, params.slug);

  if (!restaurant || restaurant.status !== "active") {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <p className="text-ink-muted text-sm">No encontramos "{params.slug}".</p>
      </main>
    );
  }

  const [hours, rules] = await Promise.all([
    listHours(supabase, restaurant.id),
    getReservationRules(supabase, restaurant.id),
  ]);

  if (!rules.allowOnlineBooking) {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">{restaurant.name}</h1>
          <p className="text-ink-muted text-sm">Este restaurante no acepta reservas online por ahora — llamalo directamente.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <BookingFlow restaurant={restaurant} hours={hours} rules={rules} />
    </main>
  );
}
