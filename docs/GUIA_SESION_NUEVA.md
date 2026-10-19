# Guía para retomar en una sesión nueva

## 1. Dónde está todo
- Repo: `pablomackenna9-art/Reservia` (rama `main`; **hoy es público** → ver pendientes). Cada `push` a `main` despliega solo en Vercel:
  - Panel de administración (`apps/admin`, Vite + React): https://reservia-admin.vercel.app
  - Páginas públicas de reserva (`apps/booking`, Next.js 14): https://reservia-booking-seven.vercel.app (ej. `/vinoteca`, `/cnit`, `/restaurante-demo`; enlaces de confirmación `/c/<token>`; API de POS `/api/pos`).
- Base de datos: proyecto Supabase con ref `bbzeftlaivutmduvnagd` (Postgres + RLS + Auth + Storage + Vault + pg_net).
- Estructura: `apps/admin`, `apps/booking`, `packages/core` (lógica pura y tipos, con tests), `packages/api-client` (única puerta a Supabase), `supabase/migrations` (0001–0032), `supabase/seed` (scripts del demo), `docs/` (esto).

## 2. Credenciales (NO están en el repo)
- **Panel Supabase / CLI:** el CLI necesita un *Access Token* de Supabase (Account → Access Tokens). Pídeselo al usuario y úsalo **solo como variable de entorno** (`SUPABASE_ACCESS_TOKEN`) en el comando, nunca lo escribas en archivos ni lo repitas en el chat.
  - ⚠ Un token anterior quedó expuesto en el historial de una conversación: **recomienda al usuario revocarlo y crear uno nuevo**.
- **Service role key** (para `supabase/seed/*.mjs`): vive en `supabase/seed/.env` (ignorado por git). Si no existe, pedirla al usuario.
- **Apps:** cada una lee su `.env` local (Supabase URL + anon key). Ver `.env.example`.
- **GitHub:** `gh` debe estar logueado como `pablomackenna9-art`. Si un `git push` da 403, correr `gh auth logout` y `gh auth login --web`.
- **Resend (correos):** la API key está en Supabase Vault con nombre `resend_api_key` (no se toca desde el código).

## 3. Cómo operar la base de datos
```bash
# aplicar migraciones nuevas (archivo en supabase/migrations con número siguiente: 0033_...)
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --linked
# consultar (UNA sola sentencia por comando; --file igual, un solo statement)
SUPABASE_ACCESS_TOKEN=<token> npx supabase db query --linked "select ..."
```
- **Probar sin ensuciar datos:** escribir un bloque `do $$ ... raise exception 'RESULTADO_PRUEBA %', jsonb_pretty(v_out); end $$;` (la excepción devuelve el resultado y hace rollback). Para actuar como un usuario: `perform set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role','authenticated')::text, true);`.
- Si una prueba necesita datos reales, bórralos después y verifica que no quedó nada.
- Las funciones `SECURITY DEFINER` del administrador de plataforma llaman a `_assert_platform_admin()`.

## 4. Trampas conocidas (Windows + este entorno)
- Heredocs largos o con muchas comillas fallan en la consola (ENAMETOOLONG / comillas). **Escribe el script con la herramienta Write en el scratchpad y ejecútalo con `python <ruta>`**.
- Edita con scripts Python de reemplazo con `assert` (falla ruidoso si el texto no existe). Cuidado con `\n` dentro de strings Python no-raw.
- Tailwind purga clases dinámicas: las clases `.st-*` del plano están **fuera de `@layer`** en `apps/admin/src/styles/index.css` a propósito.
- React StrictMode recrea el Stage de Konva en dev: el plano usa `getStage()` (ver `ZoneCanvas.tsx`).
- Los navegadores cachean la SPA: tras desplegar, el usuario debe hacer Ctrl+F5 / incógnito. Verifica el despliegue con `gh api repos/pablomackenna9-art/Reservia/deployments` y comprobando que el bundle publicado contiene el texto nuevo.
- `apps/admin/vercel.json` reescribe todas las rutas a `index.html` (sin esto, recargar en `/pagina-de-reservas` daba 404).
- El Vercel del panel tiene Root Directory `apps/admin`; el del booking `apps/booking`.
- No puedes iniciar sesión en el panel del usuario: las pantallas del panel se verifican con typecheck/build/pruebas de base de datos; dile al usuario qué revisar. Crear cuentas admin temporales para probar fue **bloqueado** por seguridad: no lo intentes.
- La página pública (booking) sí se puede probar con el navegador integrado (`preview_start` "booking"); usa datos de prueba temporales y límpialos.

## 5. Datos y cuentas actuales (sin claves)
- Administrador de plataforma: `mackennapablo@hotmail.com` (ve y administra TODOS los restaurantes).
- Restaurantes: `restaurante-demo` ("Jardin Secreto", 44 mesas, 4 zonas: Salón Principal/Terraza/Barra/Privado), `vinoteca` (clonado del demo, publicado), `cnit` (vacío; dueño aparte, tiene además a `demo@reservia.app` como dueña → se puede quitar con "Quitar acceso").
- Cuenta `demo@reservia.app`: su clave fue rotada a un valor desconocido; se restablece desde el panel (Restaurantes → "Restablecer clave").
- Registro público de cuentas **cerrado**: solo el administrador de plataforma crea clientes (Restaurantes → "+ Nuevo cliente").
- Simulador del día (solo demo, correos `@example.com`): `node supabase/seed/simulate-day.mjs [--drip 6 --every 75] [--union-demo]`. El refresco antiguo `supabase/seed/refresh.mjs` (tarea programada de Windows `run-refresh.cmd`) se interrumpió dos veces y deja el demo vacío; el simulador lo reemplaza.

## 6. Cómo trabajar un cambio típico
1. Leer el código relevante (api-client → core → pantalla). 2. Si hace falta BD: migración nueva + `db push` + prueba con rollback. 3. Cambios con script Python o Edit. 4. `pnpm -r typecheck`, tests, builds. 5. Si es visible en la página pública, probar con el navegador integrado. 6. Commit + push. 7. Resumir al usuario en español: hecho / cómo probarlo / qué le toca.
