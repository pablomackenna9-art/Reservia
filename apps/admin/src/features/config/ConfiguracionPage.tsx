import { useState } from "react";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { GeneralTab } from "./GeneralTab";
import { ZonasTab } from "./ZonasTab";
import { HorariosTab } from "./HorariosTab";
import { ReglasTab } from "./ReglasTab";
import { EquipoTab } from "./EquipoTab";

const TABS = [
  { id: "general", label: "General" },
  { id: "zonas", label: "Zonas" },
  { id: "horarios", label: "Horarios" },
  { id: "reglas", label: "Reglas de reserva" },
  { id: "equipo", label: "Equipo" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ConfiguracionPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;
  const [tab, setTab] = useState<TabId>("general");

  if (!restaurantId) return null;

  const canManageTeam = current?.role === "owner" || current?.role === "administrator";
  const visibleTabs = TABS.filter((t) => t.id !== "equipo" || canManageTeam);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Configuración</h1>

      <div className="flex gap-1.5 mb-5">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted border border-line hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && current && <GeneralTab restaurant={current.restaurant} />}
      {tab === "zonas" && <ZonasTab restaurantId={restaurantId} />}
      {tab === "horarios" && <HorariosTab restaurantId={restaurantId} />}
      {tab === "reglas" && <ReglasTab restaurantId={restaurantId} />}
      {tab === "equipo" && canManageTeam && <EquipoTab restaurantId={restaurantId} />}
    </div>
  );
}
