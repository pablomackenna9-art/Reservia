import { Logo } from "../../components/Logo";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) setError(traducirError(signInError));
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-3"><Logo size={36} /></div>
        <p className="text-ink-muted text-sm mb-8">Inicia sesión en tu Centro de Control.</p>

        <label className="block text-sm text-ink-muted mb-1" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="block text-sm text-ink-muted mb-1" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {error && <p className="text-sm text-status-occupied mb-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[10px] bg-accent text-accent-ink h-11 font-semibold text-[15px] disabled:opacity-60"
        >
          {submitting ? "Entrando…" : "Entrar"}
        </button>

        <p className="text-sm text-ink-muted mt-6 text-center">
          ¿Sin acceso?{" "}
          <Link to="/signup" className="text-accent">
            Cómo conseguirlo
          </Link>
        </p>
      </form>
    </main>
  );
}

function traducirError(message: string): string {
  if (message.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  return message;
}
