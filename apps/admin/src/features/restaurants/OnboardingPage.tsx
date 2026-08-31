import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { createRestaurant } from "@reservia/api-client";
import { slugify } from "@reservia/core";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "./RestaurantProvider";

export function OnboardingPage() {
  const { current, loading, refetch } = useRestaurant();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRestaurant(supabase, { name: name.trim(), slug: slugify(name) });
      await refetch();
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : null;
      setError(message ?? "No pudimos crear el restaurante.");
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (current) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Tu restaurante</h1>
        <p className="text-ink-muted text-sm mb-8">
          Un nombre para empezar — zonas, mesas y horarios se configuran después.
        </p>

        <label className="block text-sm text-ink-muted mb-1" htmlFor="name">
          Nombre del restaurante
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restaurante Demo"
          className="w-full mb-2 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {name.trim() && <p className="text-xs text-ink-faint mb-6">reservia.com/r/{slugify(name)}</p>}

        {error && <p className="text-sm text-status-occupied mb-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full rounded-lg bg-accent text-accent-ink font-medium py-2 text-sm disabled:opacity-60"
        >
          {submitting ? "Creando…" : "Crear restaurante"}
        </button>
      </form>
    </main>
  );
}
