# Reservia

SaaS de gestión de reservas para restaurantes. Monorepo Turborepo + pnpm.

- `apps/admin` — Centro de Control (React + Vite)
- `apps/booking` — portal público de reserva (Next.js)
- `packages/core` — tipos y lógica de dominio, sin React ni Supabase
- `packages/api-client` — única puerta hacia Supabase
- `packages/config` — tsconfig compartido
- `supabase/migrations` — esquema y RLS

Ver el [Reservia Blueprint](https://claude.ai/code/artifact/6ca0dc15-12db-4b66-9b0e-72474f7b2eab) para la arquitectura completa.

## Desarrollo

```bash
pnpm install
pnpm dev:admin      # apps/admin en :5199
pnpm dev:booking    # apps/booking
```

Cada app necesita su propio `.env` (ver `.env.example` en cada carpeta) con las credenciales del proyecto Supabase.

## Estado

Fase 0 — infraestructura y modelo de datos base (`0001_tenancy`, `0002_operacion_config`). Sin proyecto Supabase ni repositorio remoto todavía.
