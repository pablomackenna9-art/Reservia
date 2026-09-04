import { useRestaurant } from "../restaurants/RestaurantProvider";
import { WaitlistPanel } from "./WaitlistPanel";

export function ListaDeEsperaPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Lista de espera</h1>
      </header>

      {restaurantId ? (
        <WaitlistPanel restaurantId={restaurantId} />
      ) : (
        <p className="text-sm text-ink-muted">Cargando…</p>
      )}
    </div>
  );
}
