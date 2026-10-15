import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { useRestaurant } from "../features/restaurants/RestaurantProvider";
import { useNotificationCount } from "../features/notifications/useNotificationCount";
import { Logo } from "../components/Logo";
import { toggleTheme, useTheme } from "../lib/theme";

const MAIN_NAV = [
  { to: "/", label: "Centro de Control", end: true },
  { to: "/plano-de-mesas", label: "Plano" },
  { to: "/reservas", label: "Reservas" },
  { to: "/clientes", label: "Clientes" },
  { to: "/notificaciones", label: "Por decidir", badge: true },
];

const MORE_NAV = [
  { to: "/lista-de-espera", label: "Lista de espera" },
  { to: "/marketing", label: "Marketing" },
  { to: "/reportes", label: "Reportes" },
  { to: "/integraciones", label: "Integraciones" },
  { to: "/configuracion", label: "Configuración" },
];

const tabClass = (isActive: boolean) =>
  `h-[38px] px-3 flex items-center gap-2 whitespace-nowrap rounded-[9px] text-sm transition-colors ${
    isActive ? "bg-surface-2 text-ink font-semibold" : "text-ink-muted hover:text-ink hover:bg-surface"
  }`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const { current } = useRestaurant();
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const notificationCount = useNotificationCount(current?.restaurant.id);
  const now = useClock();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <header className="h-[68px] flex items-center gap-6 px-6 border-b border-line bg-ground sticky top-0 z-30">
      <Logo />
      <div className="h-7 w-px bg-line" />
      <span className="text-[15px] font-semibold truncate max-w-[200px]">{current?.restaurant.name ?? "—"}</span>

      <nav className="flex gap-0.5 ml-2">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
            {item.label}
            {item.badge && notificationCount > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-ink text-xs font-bold flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </NavLink>
        ))}

        <div className="relative" ref={moreRef}>
          <button type="button" onClick={() => setMoreOpen((v) => !v)} className={tabClass(moreOpen)}>
            Más <span className="text-ink-faint">▾</span>
          </button>
          {moreOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-surface-2 border border-line p-1.5 shadow-none">
              {MORE_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-surface-3 text-ink font-semibold" : "text-ink-muted hover:text-ink hover:bg-surface-3"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="my-1.5 h-px bg-line" />
              <button
                type="button"
                onClick={logOut}
                className="w-full text-left rounded-lg px-3 py-2.5 text-sm text-ink-muted hover:text-ink hover:bg-surface-3"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          aria-label="Cambiar tema"
          className="h-10 w-10 rounded-[10px] bg-surface-2 border border-line text-ink-muted hover:text-ink text-lg"
        >
          {theme === "oscuro" ? "☀" : "☾"}
        </button>

        <div className="hidden 2xl:block text-right leading-tight whitespace-nowrap">
          <div className="text-sm text-ink-muted capitalize">
            {now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div className="font-serif text-4xl leading-none tabular-nums">
          {now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </div>

        <button
          type="button"
          onClick={() => navigate("/", { state: { openNewReservation: Date.now() } })}
          className="h-[42px] px-[18px] whitespace-nowrap rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
        >
          + Nueva reserva
        </button>
        <div className="h-[38px] w-[38px] rounded-full bg-surface-3 flex items-center justify-center text-sm font-semibold">
          {initial}
        </div>
      </div>
    </header>
  );
}
