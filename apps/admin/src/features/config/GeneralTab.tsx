import { useState } from "react";
import { Link } from "react-router-dom";
import { updateRestaurant } from "@reservia/api-client";
import type { Restaurant } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";

export function GeneralTab({ restaurant }: { restaurant: Restaurant }) {
  const { refetch } = useRestaurant();
  const [name, setName] = useState(restaurant.name);
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [saving, setSaving] = useState(false);

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
      <p className="text-[15px] text-ink-muted rounded-lg bg-surface p-4">
        El logo, la foto y los horarios de la página pública se editan en <Link to="/pagina-de-reservas" className="text-accent underline underline-offset-2">Página de reservas</Link>.
      </p>

      <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold">Datos del restaurante</h2>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Dirección</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle 1234, Comuna"
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[13px] text-ink-faint mb-1">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-[10px] bg-ground border border-line px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={handleSaveDetails}
          disabled={saving || !name.trim()}
          className="rounded-[10px] bg-accent text-accent-ink h-11 px-[18px] text-[15px] font-semibold disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
