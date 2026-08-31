import { useRestaurant } from "../restaurants/RestaurantProvider";

// Placeholder hasta Fase 3 (reservas) y Fase 4 (operación en vivo) — sin
// datos reales todavía no hay nada honesto que mostrar en vez de "—".
const INDICATORS = [
  { label: "Reservas hoy" },
  { label: "Cubiertos reservados" },
  { label: "Ocupación estimada" },
  { label: "Ingresos estimados" },
  { label: "No-shows" },
];

export function DashboardPage() {
  const { current } = useRestaurant();

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Centro de Control</h1>
        {current && <p className="text-sm text-ink-muted mt-0.5">{current.restaurant.name}</p>}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {INDICATORS.map((indicator) => (
          <div key={indicator.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-faint">{indicator.label}</p>
            <p className="text-xl font-semibold mt-1 text-ink-faint">—</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface min-h-[60vh] grid place-items-center">
        <div className="text-center max-w-sm px-4">
          <p className="text-ink-muted text-sm">
            El plano del restaurante — zonas, mesas y su estado en vivo — se construye en Fase 2.
          </p>
        </div>
      </div>
    </div>
  );
}
