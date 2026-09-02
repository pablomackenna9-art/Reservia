import { z } from "zod";

export const customerSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  birthday: z.string().nullable(),
  notes: z.string().nullable(),
  totalVisits: z.number().int().nonnegative(),
  noShowCount: z.number().int().nonnegative(),
  cancellationCount: z.number().int().nonnegative(),
  lastVisitAt: z.string().nullable(),
  /** Blocked from booking through the public portal — staff can still create a reservation by hand as an exception. */
  blacklisted: z.boolean().default(false),
  blacklistedReason: z.string().nullable().default(null),
});
export type Customer = z.infer<typeof customerSchema>;

export function customerFullName(customer: Pick<Customer, "firstName" | "lastName">): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ");
}
