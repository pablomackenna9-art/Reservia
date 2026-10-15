import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { Field, inputClass } from "../../components/ui";
import { useAuth } from "./AuthProvider";

export function CuentaPage() {
  const { user, logOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 10) return setMessage({ ok: false, text: "La clave debe tener al menos 10 caracteres." });
    if (password !== confirm) return setMessage({ ok: false, text: "Las dos claves no coinciden." });

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    setPassword("");
    setConfirm("");
    setMessage({ ok: true, text: "Listo: tu clave nueva ya está activa." });
  }

  return (
    <div className="p-3 sm:p-6">
      <h1 className="font-serif text-4xl font-normal leading-tight mb-1">Mi cuenta</h1>
      <p className="text-[15px] text-ink-muted mb-5">Entras como <span className="font-semibold text-ink">{user?.email}</span>.</p>

      <form onSubmit={submit} className="rounded-2xl bg-surface p-4 sm:p-5 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Cambiar mi clave</h2>
        <Field label="Clave nueva" hint="Mínimo 10 caracteres.">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Repite la clave nueva">
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {message && <p className={`text-[15px] ${message.ok ? "text-status-available" : "text-status-occupied"}`}>{message.text}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Guardar clave"}
        </button>
      </form>

      <button onClick={logOut} className="h-11 px-5 mt-5 rounded-[10px] bg-surface-2 border border-line text-[15px] font-semibold text-ink-muted">
        Cerrar sesión
      </button>
    </div>
  );
}
