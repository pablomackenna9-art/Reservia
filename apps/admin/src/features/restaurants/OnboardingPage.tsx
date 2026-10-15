import { Navigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../auth/AuthProvider";
import { useRestaurant } from "./RestaurantProvider";

/** Pantalla para una cuenta que todavía no tiene ningún restaurante asignado (los restaurantes los crea el administrador de plataforma). */
export function OnboardingPage() {
  const { logOut } = useAuth();
  const { current, loading, isPlatformAdmin } = useRestaurant();

  if (loading) return null;
  if (current) return <Navigate to="/" replace />;
  if (isPlatformAdmin) return <Navigate to="/restaurantes" replace />;

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Logo size={36} />
        </div>
        <h1 className="font-serif text-4xl font-normal leading-tight mb-2">Tu cuenta aún no tiene un restaurante</h1>
        <p className="text-[15px] text-ink-muted mb-6">
          Tu acceso funciona, pero todavía no te asignaron ningún restaurante. Avisa al equipo de Reservia para que lo conecte a tu cuenta.
        </p>
        <button onClick={logOut} className="h-11 px-5 rounded-[10px] bg-surface-2 border border-line text-[15px] font-semibold">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
