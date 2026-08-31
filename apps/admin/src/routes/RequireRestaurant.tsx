import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRestaurant } from "../features/restaurants/RestaurantProvider";

export function RequireRestaurant({ children }: { children: ReactNode }) {
  const { current, loading } = useRestaurant();

  if (loading) return null;
  if (!current) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
