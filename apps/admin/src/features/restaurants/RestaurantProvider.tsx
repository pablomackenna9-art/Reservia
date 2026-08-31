import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listMyRestaurants, type MyRestaurant } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

interface RestaurantContextValue {
  restaurants: MyRestaurant[];
  current: MyRestaurant | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<MyRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setRestaurants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = await listMyRestaurants(supabase);
    setRestaurants(mine);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const value: RestaurantContextValue = {
    restaurants,
    current: restaurants[0] ?? null,
    loading,
    refetch,
  };

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant debe usarse dentro de <RestaurantProvider>");
  return ctx;
}
