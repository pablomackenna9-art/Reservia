import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitableRole, RestaurantInvitation, RestaurantRole, RestaurantUserStatus, TeamMember } from "@reservia/core";

export async function listTeamMembers(supabase: SupabaseClient, restaurantId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc("list_restaurant_team", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    email: row.email as string,
    fullName: (row.full_name as string) ?? null,
    role: row.role as RestaurantRole,
    status: row.status as RestaurantUserStatus,
    invitedAt: (row.invited_at as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function listPendingInvitations(supabase: SupabaseClient, restaurantId: string): Promise<RestaurantInvitation[]> {
  const { data, error } = await supabase
    .from("restaurant_invitations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    email: row.email as string,
    role: row.role as InvitableRole,
    status: row.status as RestaurantInvitation["status"],
    invitedBy: row.invited_by as string,
    createdAt: row.created_at as string,
  }));
}

/** Adds the person immediately if they already have a Reservia account, otherwise leaves a pending invitation that resolves itself when they sign up with this email. Returns which one happened. */
export async function inviteStaffMember(
  supabase: SupabaseClient,
  restaurantId: string,
  email: string,
  role: InvitableRole,
): Promise<"added" | "invited"> {
  const { data, error } = await supabase.rpc("invite_staff_member", {
    p_restaurant_id: restaurantId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data as "added" | "invited";
}

export async function updateTeamMemberRole(supabase: SupabaseClient, id: string, role: RestaurantRole): Promise<void> {
  const { error } = await supabase.from("restaurant_users").update({ role }).eq("id", id);
  if (error) throw error;
}

/** Soft-disable — matches the deactivate pattern used elsewhere; keeps history instead of a hard delete. */
export async function removeTeamMember(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("restaurant_users").update({ status: "disabled" }).eq("id", id);
  if (error) throw error;
}

export async function revokeInvitation(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("restaurant_invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw error;
}
