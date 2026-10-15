import { useRef, useState } from "react";
import { updateRestaurant, uploadRestaurantCover, uploadRestaurantLogo } from "@reservia/api-client";
import type { Restaurant } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

/** Logo y foto de portada de la página pública de reservas. */
export function BrandingEditor({ restaurant, onChanged }: { restaurant: Restaurant; onChanged: () => void }) {
  const { refetch } = useRestaurant();
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: "logo" | "cover", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(kind);
    try {
      if (kind === "logo") {
        const logoUrl = await uploadRestaurantLogo(supabase, restaurant.id, file);
        await updateRestaurant(supabase, restaurant.id, { logoUrl });
      } else {
        const coverUrl = await uploadRestaurantCover(supabase, restaurant.id, file);
        await updateRestaurant(supabase, restaurant.id, { coverUrl });
      }
      await refetch();
      onChanged();
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos subir la imagen.");
    } finally {
      setBusy(null);
      const input = kind === "logo" ? logoInput.current : coverInput.current;
      if (input) input.value = "";
    }
  }

  async function remove(kind: "logo" | "cover") {
    await updateRestaurant(supabase, restaurant.id, kind === "logo" ? { logoUrl: null } : { coverUrl: null });
    await refetch();
    onChanged();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold mb-1">Logo</h2>
        <p className="text-[15px] text-ink-muted mb-4">
          Aparece grande y centrado arriba de la página, en lugar del nombre escrito. Funciona mejor un PNG con fondo transparente.
        </p>
        <div className="flex items-center gap-4">
          <div className="w-40 h-24 rounded-xl border border-line bg-ground grid place-items-center overflow-hidden shrink-0 p-2">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[13px] text-ink-faint">Sin logo</span>
            )}
          </div>
          <div className="space-y-2">
            <input ref={logoInput} type="file" accept="image/*" onChange={(e) => upload("logo", e)} className="hidden" id="logo-upload" />
            <label
              htmlFor="logo-upload"
              className="h-11 px-4 inline-flex items-center rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold cursor-pointer"
            >
              {busy === "logo" ? "Subiendo…" : restaurant.logoUrl ? "Cambiar logo" : "Subir logo"}
            </label>
            {restaurant.logoUrl && (
              <button onClick={() => remove("logo")} className="block text-[13px] font-semibold text-status-occupied">
                Quitar logo
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold mb-1">Foto del restaurante</h2>
        <p className="text-[15px] text-ink-muted mb-4">
          En computador se ve grande al costado, difuminada hacia el formulario; en el celular, como una franja arriba. Usa una foto horizontal del local, de buena calidad.
        </p>
        <div className="w-full max-w-md aspect-[16/9] rounded-xl border border-line bg-ground grid place-items-center overflow-hidden mb-3">
          {restaurant.coverUrl ? (
            <img src={restaurant.coverUrl} alt="Foto del restaurante" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[13px] text-ink-faint">Sin foto</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <input ref={coverInput} type="file" accept="image/*" onChange={(e) => upload("cover", e)} className="hidden" id="cover-upload" />
          <label
            htmlFor="cover-upload"
            className="h-11 px-4 inline-flex items-center rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold cursor-pointer"
          >
            {busy === "cover" ? "Subiendo…" : restaurant.coverUrl ? "Cambiar foto" : "Subir foto"}
          </label>
          {restaurant.coverUrl && (
            <button onClick={() => remove("cover")} className="text-[13px] font-semibold text-status-occupied">
              Quitar foto
            </button>
          )}
        </div>
      </section>

      {error && <p className="text-[15px] text-status-occupied">{error}</p>}
    </div>
  );
}
