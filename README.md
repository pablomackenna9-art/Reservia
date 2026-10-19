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

## Estado y continuidad

El producto está en uso real (panel + páginas públicas desplegadas en Vercel, base en Supabase). Para retomar el trabajo lee, en este orden:

1. [`CLAUDE.md`](CLAUDE.md) — reglas de trabajo y comandos.
2. [`docs/GUIA_SESION_NUEVA.md`](docs/GUIA_SESION_NUEVA.md) — cómo operar (despliegue, base de datos, credenciales sin exponerlas, trampas conocidas).
3. [`docs/ESTADO.md`](docs/ESTADO.md) — qué está implementado.
4. [`docs/DECISIONES.md`](docs/DECISIONES.md) — por qué se hizo así.
5. [`docs/PENDIENTES.md`](docs/PENDIENTES.md) — qué falta (del usuario y de desarrollo).
