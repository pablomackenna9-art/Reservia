import { Link } from "react-router-dom";
import { Logo } from "../../components/Logo";

/** El registro público está cerrado: las cuentas las crea el equipo de Reservia desde el panel de administración. */
export function SignupPage() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Logo size={36} />
        </div>
        <h1 className="font-serif text-4xl font-normal leading-tight mb-2">El acceso lo crea tu equipo</h1>
        <p className="text-[15px] text-ink-muted mb-6">
          Las cuentas de Reservia las crea el equipo de Reservia al dar de alta tu restaurante: recibes tu correo y tu clave
          directamente. Si todavía no los tienes, pídelos a quien te contactó.
        </p>
        <Link to="/login" className="inline-flex items-center h-11 px-5 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold">
          Ya tengo mi acceso
        </Link>
      </div>
    </main>
  );
}
