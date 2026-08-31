import type { SupabaseClient } from "@supabase/supabase-js";

export async function signInWithPassword(supabase: SupabaseClient, email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(supabase: SupabaseClient, email: string, password: string, fullName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
}

export async function signOut(supabase: SupabaseClient) {
  return supabase.auth.signOut();
}

export function onAuthStateChange(
  supabase: SupabaseClient,
  callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0],
) {
  return supabase.auth.onAuthStateChange(callback);
}
