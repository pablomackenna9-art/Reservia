import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { useRestaurant } from "../features/restaurants/RestaurantProvider";
import { useNotificationCount } from "../features/notifications/useNotificationCount";
import { Logo } from "../components/Logo";
import { toggleTheme, useTheme } from "../lib/theme";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  badge?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Centro de Control", end: true },
  { to: "/plano-de-mesas", label: "Plano" },
  { to: "/reservas", label: "Reservas" },
  { to: "/clientes", label: "Clientes" },
  { to: "/notificaciones", label: "Por decidir", badge: true },
];

const MORE_NAV: NavItem[] = [
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

function CountBadge({ count }: { count: number }) {
  return (
    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-accent-ink text-xs font-bold flex items-center justify-center">
      {count}
    </span>
  );
}

export function TopBar() {
  const { current } = useRestaurant();
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const notificationCount = useNotificationCount(current?.restaurant.id);
  const now = useClock();
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // El menú del celular se cierra solo al cambiar de pantalla.
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  const clock = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });

  function newReservation() {
    setMenuOpen(false);
    navigate("/", { state: { openNewReservation: Date.now() } });
  }

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-label="Cambiar tema"
      className="h-11 w-11 xl:h-10 xl:w-10 shrink-0 rounded-[10px] bg-surface-2 border border-line text-ink-muted hover:text-ink text-lg"
    >
      {theme === "oscuro" ? "☀" : "☾"}
    </button>
  );

  return (
    <header className="sticky top-0 z-30 bg-ground border-b border-line">
      <div className="h-16 xl:h-[68px] flex items-center gap-3 xl:gap-6 px-3 sm:px-6">
        <Logo size={26} />
        <div className="hidden xl:block h-7 w-px bg-line" />
        <span className="hidden xl:block text-[15px] font-semibold truncate max-w-[200px]">{current?.restaurant.name ?? "—"}</span>

        {/* ---- Escritorio: tabs ---- */}
        <nav className="hidden xl:flex gap-0.5 ml-2">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
              {item.label}
              {item.badge && notificationCount > 0 && <CountBadge count={notificationCount} />}
            </NavLink>
          ))}

          <div className="relative" ref={moreRef}>
            <button type="button" onClick={() => setMoreOpen((v) => !v)} className={tabClass(moreOpen)}>
              Más <span className="text-ink-faint">▾</span>
            </button>
            {moreOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-surface-2 border border-line p-1.5">
                {MORE_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
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

        <div className="ml-auto flex items-center gap-2 xl:gap-4">
          <div className="hidden xl:block">{themeButton}</div>

          <div className="hidden 2xl:block text-right leading-tight whitespace-nowrap text-sm text-ink-muted capitalize">
            {now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="font-serif text-[32px] xl:text-4xl leading-none tabular-nums">{clock}</div>

          <button
            type="button"
            onClick={newReservation}
            className="hidden xl:block h-[42px] px-[18px] whitespace-nowrap rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
          >
            + Nueva reserva
          </button>
          <button
            type="button"
            onClick={newReservation}
            aria-label="Nueva reserva"
            className="xl:hidden h-11 w-11 rounded-[10px] bg-accent text-accent-ink text-2xl font-semibold leading-none"
          >
            +
          </button>

          <div className="hidden xl:flex h-[38px] w-[38px] rounded-full bg-surface-3 items-center justify-center text-sm font-semibold">
            {initial}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            className="xl:hidden h-11 w-11 rounded-[10px] bg-surface-2 border border-line text-xl"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* ---- Celular / tablet: menú a todo el ancho ---- */}
      {menuOpen && (
        <nav className="xl:hidden border-t border-line bg-ground px-3 pb-4 pt-2 max-h-[calc(100dvh-64px)] overflow-y-auto">
          <p className="px-3 py-2 text-[13px] text-ink-faint">{current?.restaurant.name ?? ""}</p>
          {[...MAIN_NAV, ...MORE_NAV].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between h-12 px-3 rounded-xl text-[17px] ${
                  isActive ? "bg-surface-2 text-ink font-semibold" : "text-ink-muted active:bg-surface"
                }`
              }
            >
              {item.label}
              {item.badge && notificationCount > 0 && <CountBadge count={notificationCount} />}
            </NavLink>
          ))}
          <div className="flex gap-2 mt-3 pt-3 border-t border-line">
            {themeButton}
            <button
              type="button"
              onClick={logOut}
              className="flex-1 h-11 rounded-[10px] bg-surface-2 border border-line text-[15px] text-ink-muted"
            >
              Cerrar sesión
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
