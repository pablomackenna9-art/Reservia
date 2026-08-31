const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * Fase 0 placeholder — confirms the shell boots and reads env config.
 * The real Centro de Control (sidebar, indicadores, plano) lands in Fase 1.
 */
export function App() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Reservia</h1>
        <p style={{ color: "var(--ink-muted)" }}>
          Fase 0 — infraestructura lista. El Centro de Control se construye en Fase 1.
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: hasSupabaseConfig ? "#4cae83" : "#dd7c68" }}>
          {hasSupabaseConfig ? "Conexión a Supabase configurada." : "Falta configurar VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env"}
        </p>
      </div>
    </main>
  );
}
