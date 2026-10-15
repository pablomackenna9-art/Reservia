/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Opcional: URL de la app pública de reservas (por defecto la de Vercel). */
  readonly VITE_BOOKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
