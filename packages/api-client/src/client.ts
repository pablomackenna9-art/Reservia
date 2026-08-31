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
  });
}

export type { SupabaseClient, Session, User, AuthChangeEvent } from "@supabase/supabase-js";
