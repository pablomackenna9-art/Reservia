import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getReservationRules, updateRestaurant } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";
import { bookingUrlFor } from "../../lib/config";
import { CopyButton } from "../../components/ui";
import { useRestaurant } from "../restaurants/RestaurantProvider";

export function PaginaReservasPage() {
  const { current, refetch } = useRestaurant();
  const restaurant = current?.restaurant;
  const canEdit = current?.role === "owner" || current?.role === "administrator";

  const [qr, setQr] = useState<string | null>(null);
  const [onlineBooking, setOnlineBooking] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = restaurant ? bookingUrlFor(restaurant.slug) : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 2, width: 640, color: { dark: "#000000", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  useEffect(() => {
    if (!restaurant) return;
    getReservationRules(supabase, restaurant.id).then((rules) => setOnlineBooking(rules.allowOnlineBooking));
  }, [restaurant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!restaurant) return null;

  async function publish() {
    if (!restaurant) return;
    setPublishing(true);
    setError(null);
    try {
      await updateRestaurant(supabase, restaurant.id, { status: "active" });
      await refetch();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String(err.message) : "No se pudo publicar.");
    } finally {
      setPublishing(false);
    }
  }

  const published = restaurant.status === "active";

  return (
    <div className="p-3 sm:p-6">
      <h1 className="font-serif text-4xl font-normal leading-tight">Página de reservas</h1>
      <p className="text-[15px] text-ink-muted mt-1 mb-5 max-w-2xl">
        Es la página que ven tus clientes para reservar. Compártela donde quieras: Instagram, Google, WhatsApp o un código QR en el local.
      </p>

      {!published && (
        <div className="rounded-xl border border-status-arriving/50 bg-status-arriving/10 p-4 mb-5 max-w-3xl">
          <p className="text-[15px] font-semibold">
            Tu página todavía no está publicada ({restaurant.status === "suspended" ? "restaurante suspendido" : "en configuración"}).
          </p>
          <p className="text-[15px] text-ink-muted mt-1">
            Mientras tanto tus clientes ven un aviso de "no encontrado". Publícala cuando tengas zonas, mesas y horarios listos.
          </p>
          {canEdit && restaurant.status !== "suspended" && (
            <button
              onClick={publish}
              disabled={publishing}
              className="h-11 px-5 mt-3 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-60"
            >
              {publishing ? "Publicando…" : "Publicar mi página"}
            </button>
          )}
          {error && <p className="text-[15px] text-status-occupied mt-2">{error}</p>}
        </div>
      )}

      {published && onlineBooking === false && (
        <div className="rounded-xl border border-status-arriving/50 bg-status-arriving/10 p-4 mb-5 max-w-3xl">
          <p className="text-[15px] font-semibold">Las reservas online están desactivadas.</p>
          <p className="text-[15px] text-ink-muted mt-1">
            Tus clientes ven un aviso para llamarte. Actívalas en Configuración → Reglas de reserva.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-5 items-start">
        <div className="space-y-5">
          <section className="rounded-2xl bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold mb-3">Tu enlace</h2>
            <p className="font-mono text-[15px] bg-ground rounded-[10px] p-3 break-all">{url}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <CopyButton text={url} label="Copiar enlace" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="h-11 px-4 inline-flex items-center rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold"
              >
                Abrir en una pestaña nueva ↗
              </a>
            </div>
            <p className="text-[13px] text-ink-faint mt-3">
              Para cambiar la dirección del enlace, edita el nombre corto del restaurante en el panel de Restaurantes.
            </p>
          </section>

          <section className="rounded-2xl bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold mb-3">Código QR</h2>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              {qr ? (
                <img src={qr} alt={`Código QR de ${restaurant.name}`} className="w-44 h-44 rounded-xl bg-white p-1 shrink-0" />
              ) : (
                <div className="w-44 h-44 rounded-xl bg-surface-2 grid place-items-center text-[13px] text-ink-faint shrink-0">Generando…</div>
              )}
              <div>
                <p className="text-[15px] text-ink-muted">
                  Imprímelo para las mesas, la puerta o los menús: el cliente lo escanea y cae directo en tu página de reservas.
                </p>
                {qr && (
                  <a
                    href={qr}
                    download={`reserva-${restaurant.slug}.png`}
                    className="h-11 px-4 mt-3 inline-flex items-center rounded-[10px] bg-surface-3 text-[15px] font-semibold hover:bg-line"
                  >
                    Descargar QR (PNG)
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-3">Así la ve tu cliente</h2>
          <div className="mx-auto max-w-[390px] rounded-[36px] border-[10px] border-surface-3 bg-white overflow-hidden">
            <iframe
              key={url}
              src={url}
              title={`Página de reservas de ${restaurant.name}`}
              loading="lazy"
              className="w-full h-[680px] block bg-white"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
