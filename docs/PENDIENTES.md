# Pendientes

## A. Del usuario (recordárselos cuando pregunte "qué falta")
1. **Dominio propio para correos (Resend)** — *el usuario dijo que lo haría otro día*. Comprar dominio (.cl ≈ $9.940 + IVA/año en nic.cl; .com ≈ 10–15 USD), agregarlo en Resend → Domains, copiar los registros DNS (SPF/DKIM), verificar y avisar para cambiar el remitente en `send_transactional_email`. Resend gratis: 3.000 correos/mes (100/día), 1 dominio; Pro 20 USD/mes. **Hoy los correos a clientes reales probablemente no llegan** (el remitente de prueba solo entrega al dueño de la cuenta de Resend).
2. **Volver privado el repositorio de GitHub** (Settings → Danger Zone → Change visibility). La clave antigua del demo ya no sirve, pero sigue en el historial.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://reservia-admin.vercel.app`; Redirect URLs `https://reservia-admin.vercel.app/**` (y `http://localhost:5199/**` si prueba en local). Hoy el Site URL es `http://localhost:3000`, así que los correos de recuperar clave apuntarían mal.
4. **Revocar y recrear el token de acceso de Supabase** usado en la sesión anterior (quedó en el historial de una conversación).
5. **Probar con clics** lo que no se pudo verificar sin sesión: arrastrar reservas en la línea de tiempo, ventana "Avisar al cliente" tras aceptar, "Elegir yo la mesa", pestañas de *Página de reservas*, eliminar restaurante / quitar acceso, y reportar fallas.
6. Subir **logo (PNG transparente)** y **foto (≥1920 px de ancho)** de Vinoteca; decidir qué hacer con **CNIT** (vacío; usar "Cargar plantilla") y si quitar a `demo@reservia.app` de CNIT.
7. Desactivar (o dejar) la tarea programada de Windows `supabase/seed/run-refresh.cmd`: se interrumpió el 15 y 16 de oct. y vacía el demo; el simulador nuevo la reemplaza.

8. **Aplicar la migración 0033 (decoración del plano)** si aún no está aplicada: `supabase/migrations/0033_zone_decor.sql` (CLI `db push` tras `npx supabase login`, o pegarla en el editor SQL de Supabase) y luego `node supabase/seed/seed-decor.mjs` para la decoración de ejemplo.
9. ~~Migración 0034 (módulos) y división de CNIT~~ — hecho (26-nov): aplicada; las mesas de 8 y 10 de CNIT son módulos (las de 6 quedaron enteras). Falta: que el POS acepte el nombre de la mesa larga ("Mesa 10") y lo resuelva a sus módulos.
10. **Aplicar la migración 0035 (`supabase/migrations/0035_reservation_seated_at.sql`)**: guarda la hora real en que se sentó cada grupo; sin ella el cronómetro de la mesa cuenta desde la hora de la reserva (nunca negativo).

## B. Desarrollo sugerido (no empezado)
- **WhatsApp automático** (Meta WhatsApp Business Cloud API o Twilio/360dialog): número verificado, plantilla aprobada ("reserva aceptada + enlace"), envío al aceptar y webhook de respuestas; recordatorio automático antes de la reserva y liberación si no responde. El enlace `/c/<token>` y la liberación de mesa ya existen; falta solo el canal de envío (guardar credenciales en Vault, nunca en el código).
- Que aceptar/rechazar dispare correo de rechazo explícito y aviso a la lista de espera al liberarse una mesa por "No podré ir" (hoy lo ve el equipo en Notificaciones).
- Modelo de **adyacencia de mesas** (qué mesa está al lado de cuál) para uniones más realistas que "misma zona + unible".
- Arrastrar y soltar **táctil** en la línea de tiempo (HTML5 DnD no funciona en pantallas táctiles; hoy se usa "Cambiar de mesa").
- Ocupación/KPIs: contar mesas unidas en `computeCapacityPacing` ya hecho; revisar reportes y marketing con uniones y estados nuevos.
- Panel: mostrar el consumo de la visita al mover (mensaje ya dice "con todo su consumo"); revisar que Reportes sume bien reservas canceladas por el cliente.
- Dominio propio para la página pública y el panel (hoy subdominios de Vercel); actualizar `booking_base_url()` y `VITE_BOOKING_URL`.
- Mejorar `get_month_availability` para considerar la zona elegida (hoy el calendario es general; las horas sí respetan la zona).
- Pruebas automatizadas de integración (hoy: 50 tests de `core` + pruebas SQL manuales con rollback).

## C. Cómo se registró lo hecho
Todo en `git log` (≈65 commits). Últimos hitos: `0c2d49f` rutas del panel, `6f7f653` ubicación + confirmación del cliente, `899df0c` mesa antes de aceptar, `87a675d` uniones, `fe06684` cancelar con confirmación + elegir cualquier mesa, `9196d91` arrastrar entre mesas, `c8f8741` sin "hay mesas disponibles".
