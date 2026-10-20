# Reservia — instrucciones para Codex

SaaS multi-restaurante de reservas para Chile (es-CL, CLP, America/Santiago). Monorepo Turborepo + pnpm.
**Antes de hacer nada, lee `docs/GUIA_SESION_NUEVA.md`** (cómo retomar), luego `docs/ESTADO.md` (qué está hecho),
`docs/DECISIONES.md` (por qué) y `docs/PENDIENTES.md` (qué falta).

## Reglas de trabajo con este usuario (Pablo)
- Habla **español neutro/chileno, tuteando** ("tú", "elige", "contacta"; NO voseo argentino tipo "elegí/probá/llamá").
- Quiere cosas **simples y rápidas de usar**; prueba en vivo (también desde el celular) y manda capturas. Responde corto y concreto: qué quedó hecho, qué le toca a él.
- **No pongas secretos en archivos ni en el chat**: ni claves, ni tokens, ni contraseñas. El `.env` de `supabase/seed/` y los `.env` de las apps están en `.gitignore`.
- Después de cada cambio: `pnpm -r typecheck`, `pnpm --filter @reservia/core test`, build de la app tocada, commit con el trailer `Co-Authored-By` indicado por el entorno y `git push` (Vercel despliega solo desde `main`).
- Acciones sobre datos reales (borrar, reiniciar simulaciones, tocar restaurantes de clientes): confírmalas o limítalas al restaurante demo (`restaurante-demo`).
- Si el usuario pregunta **"qué falta"**, recuérdale primero lo de `docs/PENDIENTES.md` (dominio de Resend, WhatsApp automático, repo privado, URL de Supabase Auth).

## Comandos
```bash
pnpm install
pnpm -r typecheck
pnpm --filter @reservia/core test
pnpm --filter @reservia/admin build && pnpm --filter @reservia/booking build
pnpm dev:admin      # :5199
pnpm dev:booking    # :3000
```
