import { createReservationClient } from "@reservia/api-client";

export const supabase = createReservationClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
