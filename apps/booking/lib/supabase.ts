"use client";

import { createReservationClient } from "@reservia/api-client";

// Client-side singleton for the interactive booking flow. Server Components
// (like the [slug] page itself) still build their own short-lived client —
// see the comment there for why.
export const supabase = createReservationClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
