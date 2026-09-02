import { z } from "zod";

/**
 * Restaurant roles. `super_admin` is a platform-level flag (see
 * `platform_admins` in the DB) and never appears here — this enum is only
 * the role a user holds *within one restaurant*.
 */
export const RESTAURANT_ROLES = ["owner", "administrator", "host", "waiter", "viewer"] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

export const RESTAURANT_STATUSES = ["onboarding", "active", "suspended"] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const restaurantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  timezone: z.string().default("America/Santiago"),
  currency: z.string().default("CLP"),
  locale: z.string().default("es-CL"),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  status: z.enum(RESTAURANT_STATUSES),
  plan: z.string(),
  showGuestsOnFloorplan: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Restaurant = z.infer<typeof restaurantSchema>;

export const RESTAURANT_USER_STATUSES = ["invited", "active", "disabled"] as const;
export type RestaurantUserStatus = (typeof RESTAURANT_USER_STATUSES)[number];

export const restaurantUserSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(RESTAURANT_ROLES),
  status: z.enum(RESTAURANT_USER_STATUSES),
});
export type RestaurantUser = z.infer<typeof restaurantUserSchema>;

/** A member of the team, enriched with the bits of auth.users/profiles the UI needs — never fetched by querying those tables directly. */
export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: z.enum(RESTAURANT_ROLES),
  status: z.enum(RESTAURANT_USER_STATUSES),
  invitedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

/** Roles an owner/administrator can hand out via invite_staff_member — 'owner' is never granted this way. */
export const INVITABLE_ROLES = ["administrator", "host", "waiter", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const RESTAURANT_INVITATION_STATUSES = ["pending", "accepted", "revoked"] as const;
export type RestaurantInvitationStatus = (typeof RESTAURANT_INVITATION_STATUSES)[number];

export const restaurantInvitationSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(INVITABLE_ROLES),
  status: z.enum(RESTAURANT_INVITATION_STATUSES),
  invitedBy: z.string().uuid(),
  createdAt: z.string(),
});
export type RestaurantInvitation = z.infer<typeof restaurantInvitationSchema>;

/** True for roles allowed to edit zones, tables and restaurant configuration. */
export function canEditFloorplan(role: RestaurantRole): boolean {
  return role === "owner" || role === "administrator";
}

/** True for roles allowed to operate the live floor (seat guests, take reservations). */
export function canOperateFloor(role: RestaurantRole): boolean {
  return role === "owner" || role === "administrator" || role === "host" || role === "waiter";
}
