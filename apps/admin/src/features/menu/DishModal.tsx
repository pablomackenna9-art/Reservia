import { useRef, useState } from "react";
import { uploadDishImage, type MenuDishInput } from "@reservia/api-client";
import { MENU_ALLERGEN_SUGGESTIONS, MENU_TAG_SUGGESTIONS, type MenuCategory, type MenuDish, type MenuVariant } from "@reservia/core";
import { Field, Modal, inputClass } from "../../components/ui";
import { supabase } from "../../lib/supabase";

/** Crear o editar un plato: nombre, precio (CLP, IVA incluido), opciones con su precio, etiquetas, alérgenos y foto. */
export function DishModal({
  restaurantId,
  categories,
  dish,
  defaultCategoryId,
  onClose,
  onSave,
  onDelete,
}: {
  restaurantId: string;
  categories: MenuCategory[];
  dish: MenuDish | null;
  defaultCategoryId: string;
  onClose: () => void;
  onSave: (input: MenuDishInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(dish?.name ?? "");
  const [categoryId, setCategoryId] = useState(dish?.categoryId ?? defaultCategoryId);
  const [description, setDescription] = useState(dish?.description ?? "");
  const [price, setPrice] = useState(dish ? String(dish.price) : "");
  const [variants, setVariants] = useState<{ name: string; price: string }[]>((dish?.variants ?? []).map((v) => ({ name: v.name, price: String(v.price) })));
  const [tags, setTags] = useState<string[]>(dish?.tags ?? []);
  const [allergens, setAllergens] = useState<string[]>(dish?.allergens ?? []);
  const [featured, setFeatured] = useState(dish?.featured ?? false);
  const [imageUrl, setImageUrl] = useState<string | null>(dish?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasVariants = variants.length > 0;

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Elige una imagen (JPG, PNG o WebP).");
    if (file.size > 6 * 1024 * 1024) return setError("La foto pesa más de 6 MB. Usa una más liviana.");
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadDishImage(supabase, restaurantId, file));
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!name.trim()) return setError("Escribe el nombre del plato.");
    const cleanVariants: MenuVariant[] = variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), price: Number(v.price.replace(/\D/g, "")) || 0 }));
    const basePrice = Number(price.replace(/\D/g, "")) || 0;
    if (cleanVariants.length === 0 && basePrice <= 0) return setError("Escribe el precio del plato.");
    setBusy(true);
    setError(null);
    try {
      await onSave({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        price: cleanVariants.length > 0 ? Math.min(...cleanVariants.map((v) => v.price)) : basePrice,
        variants: cleanVariants,
        tags,
        allergens,
        featured,
        soldOut: dish?.soldOut ?? false,
        active: dish?.active ?? true,
        imageUrl,
      });
      onClose();
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "No se pudo guardar el plato.");
      setBusy(false);
    }
  }

  return (
    <Modal title={dish ? "Editar plato" : "Nuevo plato"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ej: Ceviche clásico" autoFocus />
        </Field>

        <Field label="Categoría">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Descripción (opcional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-[10px] bg-ground border border-line p-3 text-[15px] placeholder:text-ink-faint outline-none focus:border-accent"
            placeholder="Ingredientes o cómo viene servido"
          />
        </Field>

        {!hasVariants && (
          <Field label="Precio (pesos, IVA incluido)">
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputClass} placeholder="8900" />
          </Field>
        )}

        <div>
          <p className="text-[13px] text-ink-faint mb-1">Opciones con distinto precio (opcional)</p>
          {variants.length > 0 && (
            <ul className="space-y-2 mb-2">
              {variants.map((v, i) => (
                <li key={i} className="flex gap-2">
                  <input
                    value={v.name}
                    onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className={`${inputClass} flex-1`}
                    placeholder="Ej: Media porción"
                  />
                  <input
                    value={v.price}
                    onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/\D/g, "") } : x)))}
                    inputMode="numeric"
                    className={`${inputClass} w-28`}
                    placeholder="Precio"
                  />
                  <button type="button" onClick={() => setVariants((cur) => cur.filter((_, j) => j !== i))} className="h-11 px-3 rounded-[10px] bg-surface-2 text-status-occupied font-semibold" aria-label="Quitar opción">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setVariants((cur) => [...cur, { name: "", price: "" }])} className="text-[15px] font-semibold text-accent">
            + Agregar una opción (tamaño, versión…)
          </button>
        </div>

        <ChipPicker label="Etiquetas" options={MENU_TAG_SUGGESTIONS} value={tags} onToggle={(v) => toggle(tags, setTags, v)} />
        <ChipPicker label="Contiene (alérgenos)" options={MENU_ALLERGEN_SUGGESTIONS} value={allergens} onToggle={(v) => toggle(allergens, setAllergens, v)} />

        <label className="flex items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--acc))]" />
          Destacar como "Del chef"
        </label>

        <div>
          <p className="text-[13px] text-ink-faint mb-1">Foto (opcional)</p>
          <div className="flex items-center gap-3">
            {imageUrl ? <img src={imageUrl} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="h-20 w-20 rounded-xl bg-ground border border-dashed border-line" />}
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-11 px-4 rounded-[10px] bg-surface-2 text-[15px] font-semibold disabled:opacity-60">
                {uploading ? "Subiendo…" : imageUrl ? "Cambiar foto" : "Subir foto"}
              </button>
              {imageUrl && (
                <button type="button" onClick={() => setImageUrl(null)} className="text-[13px] font-semibold text-status-occupied text-left">
                  Quitar foto
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
          </div>
        </div>

        {error && <p className="text-[15px] text-status-occupied">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={submit} disabled={busy || uploading} className="h-12 px-6 rounded-[10px] bg-accent text-accent-ink text-base font-semibold disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar plato"}
          </button>
          {dish && onDelete && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Eliminar "${dish.name}" de la carta? No se puede deshacer.`)) return;
                await onDelete();
                onClose();
              }}
              className="h-12 px-4 rounded-[10px] text-[15px] font-semibold text-status-occupied"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ChipPicker({ label, options, value, onToggle }: { label: string; options: readonly string[]; value: string[]; onToggle: (v: string) => void }) {
  const [custom, setCustom] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  return (
    <div>
      <p className="text-[13px] text-ink-faint mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={value.includes(o)}
            className={`h-9 px-3 rounded-full text-[14px] font-semibold border transition-colors ${value.includes(o) ? "bg-accent text-accent-ink border-accent" : "bg-ground border-line text-ink-muted"}`}
          >
            {o}
          </button>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              e.preventDefault();
              if (!value.includes(custom.trim())) onToggle(custom.trim());
              setCustom("");
            }
          }}
          placeholder="Otra… (Enter)"
          className="h-9 w-32 rounded-full bg-ground border border-line px-3 text-[14px] outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
