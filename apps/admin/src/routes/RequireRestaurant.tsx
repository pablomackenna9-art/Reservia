import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRestaurant } from "../features/restaurants/RestaurantProvider";

export function RequireRestaurant({ children }: { children: ReactNode }) {
  const { current, loading, isPlatformAdmin } = useRestaurant();

  if (loading) return null;
  if (!current) return <Navigate to={isPlatformAdmin ? "/restaurantes" : "/onboarding"} replace />;

  return <>{children}</>;
}
