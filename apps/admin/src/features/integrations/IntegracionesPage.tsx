const CATEGORIES = [
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
    items: [
      { name: "POS", desc: "Sincronizar el monto real de cada mesa en vez de cargarlo a mano." },
      { name: "Google Business Profile", desc: "Reservas desde la ficha de Google del restaurante." },
    ],
  },
];

export function IntegracionesPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-1">Integraciones</h1>
      <p className="text-sm text-ink-muted mb-6 max-w-2xl">
        Ninguna está conectada todavía — conectar cualquiera de estas requiere una cuenta y credenciales reales del
        proveedor, que solo vos podés crear. La arquitectura ya está preparada para que, cuando llegue el momento,
        conectar una sea configurar credenciales, no reescribir el sistema.
      </p>

      <div className="space-y-6 max-w-2xl">
        {CATEGORIES.map((category) => (
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
    </div>
  );
}
