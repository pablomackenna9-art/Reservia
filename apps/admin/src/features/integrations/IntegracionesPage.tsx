import { useEffect, useState } from "react";
import { createMockPosAdapter, listPosConnections } from "@reservia/api-client";
import type { PosConnection } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { MockPosSimulator } from "./MockPosSimulator";

const STATIC_CATEGORIES = [
  {
    name: "Mensajería",
    items: [
      { name: "WhatsApp", desc: "Confirmaciones y recordatorios de reserva automáticos." },
      { name: "Email", desc: "Confirmaciones por correo — vía Resend o Postmark." },
      { name: "SMS", desc: "Recordatorios por SMS — vía Twilio." },
    ],
  },
  {
    name: "Pagos",
    items: [
      { name: "Mercado Pago", desc: "Cobro de señas y pagos en el local." },
      { name: "Transbank", desc: "Pagos con tarjeta en Chile." },
      { name: "Stripe", desc: "Pagos internacionales." },
    ],
  },
  {
    name: "Operación",
    items: [{ name: "Google Business Profile", desc: "Reservas desde la ficha de Google del restaurante." }],
  },
];

const POS_PROVIDERS: { provider: PosConnection["provider"]; name: string; desc: string; connectable: boolean }[] = [
  { provider: "mock", name: "MockPOS", desc: "Simulador interno — para probar la integración sin un proveedor real.", connectable: true },
  { provider: "lightspeed", name: "Lightspeed", desc: "POS moderno con API REST — el más rápido de certificar cuando llegue el momento.", connectable: false },
  { provider: "icg", name: "ICG", desc: "El más común en restaurantes chilenos — se gestiona vía distribuidor local.", connectable: false },
  { provider: "oracle_simphony", name: "Oracle Simphony", desc: "Nivel enterprise — certificación formal más larga.", connectable: false },
];

export function IntegracionesPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const [connections, setConnections] = useState<PosConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  async function reload() {
    if (!restaurantId) return;
    const conns = await listPosConnections(supabase, restaurantId);
    setConnections(conns);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const mockConnection = connections.find((c) => c.provider === "mock");
  const mockConnected = mockConnection?.status === "connected";

  async function handleConnectMock() {
    if (!restaurantId) return;
    setConnecting(true);
    await createMockPosAdapter(supabase).connect(restaurantId, {});
    await reload();
    setConnecting(false);
  }

  async function handleDisconnectMock() {
    if (!mockConnection) return;
    setConnecting(true);
    await createMockPosAdapter(supabase).disconnect(mockConnection.id);
    await reload();
    setConnecting(false);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-1">Integraciones</h1>
      <p className="text-sm text-ink-muted mb-6 max-w-2xl">
        Ninguna está conectada todavía — conectar cualquiera de estas requiere una cuenta y credenciales reales del
        proveedor, que solo vos podés crear. La arquitectura ya está preparada para que, cuando llegue el momento,
        conectar una sea configurar credenciales, no reescribir el sistema.
      </p>

      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-ink-faint mb-2">POS / caja</h2>
          <div className="rounded-xl border border-line bg-surface divide-y divide-line">
            {loading
              ? null
              : POS_PROVIDERS.map((p) => {
                  const conn = connections.find((c) => c.provider === p.provider);
                  const connected = conn?.status === "connected";
                  return (
                    <div key={p.provider} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-ink-faint">{p.desc}</p>
                      </div>
                      {p.connectable ? (
                        connected ? (
                          <button
                            onClick={handleDisconnectMock}
                            disabled={connecting}
                            className="text-xs text-status-occupied border border-status-occupied/40 rounded-full px-2.5 py-1 shrink-0 hover:bg-status-occupied/10 disabled:opacity-60"
                          >
                            Desconectar
                          </button>
                        ) : (
                          <button
                            onClick={handleConnectMock}
                            disabled={connecting}
                            className="text-xs text-accent-ink bg-accent rounded-full px-2.5 py-1 shrink-0 font-medium disabled:opacity-60"
                          >
                            Conectar
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-ink-faint border border-line rounded-full px-2.5 py-1 shrink-0">
                          Próximamente
                        </span>
                      )}
                    </div>
                  );
                })}
          </div>
        </div>

        {STATIC_CATEGORIES.map((category) => (
          <div key={category.name}>
            <h2 className="text-xs uppercase tracking-wide text-ink-faint mb-2">{category.name}</h2>
            <div className="rounded-xl border border-line bg-surface divide-y divide-line">
              {category.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-ink-faint">{item.desc}</p>
                  </div>
                  <span className="text-xs text-ink-faint border border-line rounded-full px-2.5 py-1 shrink-0">
                    No conectado
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {mockConnected && restaurantId && mockConnection && (
        <MockPosSimulator restaurantId={restaurantId} connectionId={mockConnection.id} />
      )}
    </div>
  );
}
