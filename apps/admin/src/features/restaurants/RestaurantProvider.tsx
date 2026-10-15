import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isPlatformAdmin, listAllRestaurants, listMyRestaurants, type MyRestaurant } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const STORAGE_KEY = "reservia-current-restaurant";

interface RestaurantContextValue {
  /** Todos los restaurantes que puede gestionar (para un administrador de plataforma, todos los del sistema). */
  restaurants: MyRestaurant[];
  /** El restaurante que se está viendo ahora. */
  current: MyRestaurant | null;
  /** Cambia el restaurante activo (se recuerda entre visitas). */
  selectRestaurant: (id: string) => void;
  /** Administrador de plataforma: ve y gestiona todos los restaurantes, no solo aquellos donde es miembro. */
  isPlatformAdmin: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [restaurants, setRestaurants] = useState<MyRestaurant[]>([]);
  const [admin, setAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(readStoredId);

  const refetch = useCallback(async () => {
    if (!user) {
      setRestaurants([]);
      setAdmin(false);
      setLoaded(true);
      return;
    }
    const [mine, platformAdmin] = await Promise.all([listMyRestaurants(supabase), isPlatformAdmin(supabase)]);
    let list = mine;
    if (platformAdmin) {
      // Un administrador de plataforma opera sobre todos; donde no es miembro actúa como dueño.
      const everyone = await listAllRestaurants(supabase);
      const roleById = new Map(mine.map((m) => [m.restaurant.id, m.role]));
      list = everyone.map((restaurant) => ({ restaurant, role: roleById.get(restaurant.id) ?? "owner" }));
    }
    setRestaurants(list);
    setAdmin(platformAdmin);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoaded(false);
    refetch();
  }, [refetch, authLoading]);

  const selectRestaurant = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // sin localStorage: el cambio vale solo para esta sesión
    }
  }, []);

  const current = restaurants.find((r) => r.restaurant.id === currentId) ?? restaurants[0] ?? null;

  const value: RestaurantContextValue = {
    restaurants,
    current,
    selectRestaurant,
    isPlatformAdmin: admin,
    // Mientras la sesión sigue cargando NO se considera "sin restaurantes" -- evita el rebote a /onboarding al abrir un link directo.
    loading: authLoading || !loaded,
    refetch,
  };

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant debe usarse dentro de <RestaurantProvider>");
  return ctx;
}
