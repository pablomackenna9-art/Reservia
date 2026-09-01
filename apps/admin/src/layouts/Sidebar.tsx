import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { useRestaurant } from "../features/restaurants/RestaurantProvider";
import { useNotificationCount } from "../features/notifications/useNotificationCount";

const NAV_ITEMS = [
  { to: "/", label: "Centro de Control", end: true },
  { to: "/notificaciones", label: "Notificaciones", badge: true },
  { to: "/reservas", label: "Reservas" },
  { to: "/plano-de-mesas", label: "Plano de mesas" },
  { to: "/lista-de-espera", label: "Lista de espera" },
  { to: "/clientes", label: "Clientes" },
  { to: "/marketing", label: "Marketing" },
  { to: "/reportes", label: "Reportes" },
  { to: "/integraciones", label: "Integraciones" },
  { to: "/configuracion", label: "Configuración" },
];

const STATUS_LABEL: Record<string, string> = {
  onboarding: "Configurando",
  active: "Activo",
  suspended: "Suspendido",
};

export function Sidebar() {
  const { current } = useRestaurant();
  const { logOut } = useAuth();
  const notificationCount = useNotificationCount(current?.restaurant.id);

  return (
    <aside className="w-60 shrink-0 border-r border-line flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold">Reservia</span>
        </div>
        {current && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-ink-muted truncate">{current.restaurant.name}</span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide rounded-full border border-line px-2 py-0.5 text-ink-faint">
              {STATUS_LABEL[current.restaurant.status] ?? current.restaurant.status}
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-3 py-2 text-sm mb-0.5 transition-colors ${
                isActive ? "bg-surface text-ink" : "text-ink-muted hover:text-ink hover:bg-surface"
              }`
            }
          >
            <span>{item.label}</span>
            {item.badge && notificationCount > 0 && (
              <span className="rounded-full bg-accent text-accent-ink text-[11px] leading-none px-1.5 py-1 tabular-nums">
                {notificationCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-line">
        <button
          onClick={logOut}
          className="w-full text-left rounded-lg px-3 py-2 text-sm text-ink-muted hover:text-ink hover:bg-surface"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
