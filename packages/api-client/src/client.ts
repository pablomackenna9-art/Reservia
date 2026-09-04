import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only file in the whole codebase allowed to import `@supabase/supabase-js`
 * directly. Every app builds its client here and passes it into the
 * domain functions below — UI code never talks to Supabase on its own.
 */
export function createReservationClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      // Next.js patches the global fetch to cache requests by default in
      // Server Components. supabase-js never sets its own `cache` option, so
      // without this every query made from a Server Component (e.g. the
      // booking portal's restaurant lookup) can silently keep serving the
      // response from the very first request instead of live data.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export type { SupabaseClient, Session, User, AuthChangeEvent } from "@supabase/supabase-js";
