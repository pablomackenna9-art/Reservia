import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function SignupPage() {
  const { user, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signUpError } = await register(email, password, fullName);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
    } else {
      setConfirmationSent(true);
    }
  }

  if (confirmationSent) {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold mb-2">Revisa tu correo</h1>
          <p className="text-ink-muted text-sm">
            Te enviamos un enlace de confirmación a <strong className="text-ink">{email}</strong>. Una vez
            confirmes, vuelve a{" "}
            <Link to="/login" className="text-accent">
              iniciar sesión
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Crea tu cuenta</h1>
        <p className="text-ink-muted text-sm mb-8">Después configuras tu restaurante.</p>

        <label className="block text-sm text-ink-muted mb-1" htmlFor="fullName">
          Nombre completo
        </label>
        <input
          id="fullName"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full mb-4 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />

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
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {error && <p className="text-sm text-status-occupied mb-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent text-accent-ink font-medium py-2 text-sm disabled:opacity-60"
        >
          {submitting ? "Creando…" : "Crear cuenta"}
        </button>

        <p className="text-sm text-ink-muted mt-6 text-center">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-accent">
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
