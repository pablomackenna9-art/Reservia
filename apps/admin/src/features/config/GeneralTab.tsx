import { useRef, useState } from "react";
import { updateRestaurant, uploadRestaurantLogo } from "@reservia/api-client";
import type { Restaurant } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

export function GeneralTab({ restaurant }: { restaurant: Restaurant }) {
  const { refetch } = useRestaurant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(restaurant.name);
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const logoUrl = await uploadRestaurantLogo(supabase, restaurant.id, file);
      await updateRestaurant(supabase, restaurant.id, { logoUrl });
      await refetch();
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos subir el logo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    await updateRestaurant(supabase, restaurant.id, { logoUrl: null });
    await refetch();
  }

  async function handleSaveDetails() {
    setSaving(true);
    await updateRestaurant(supabase, restaurant.id, {
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
    });
    await refetch();
    setSaving(false);
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-1">Logo</h2>
        <p className="text-xs text-ink-faint mb-3">Aparece en el portal público de reservas, arriba del nombre.</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-line bg-ground grid place-items-center overflow-hidden shrink-0">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] text-ink-faint text-center px-1">Sin logo</span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
              id="logo-upload"
            />
            <label
              htmlFor="logo-upload"
              className="inline-block rounded-lg bg-surface-2 border border-line px-3 py-1.5 text-xs text-ink hover:border-accent cursor-pointer"
            >
              {uploading ? "Subiendo…" : restaurant.logoUrl ? "Cambiar logo" : "Subir logo"}
            </label>
            {restaurant.logoUrl && (
              <button onClick={handleRemoveLogo} className="block text-xs text-status-occupied hover:opacity-80">
                Quitar logo
              </button>
            )}
            {error && <p className="text-xs text-status-occupied">{error}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold">Datos del restaurante</h2>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Dirección</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle 1234, Comuna"
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg bg-ground border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={handleSaveDetails}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
