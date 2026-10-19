# Decisiones de producto y técnicas

## Producto
1. **Toda reserva online la aprueba el restaurante.** Nada se confirma solo; la página pública nunca promete confirmación automática (texto "Enviar solicitud de reserva").
2. **Solo el administrador de plataforma (Pablo) crea restaurantes y cuentas.** Registro público cerrado en la base (trigger sobre `auth.users`). Cada dueño ve únicamente su restaurante; Pablo ve todos. Alta rápida: plantilla del demo (plano, mesas, horarios, reglas) + cuenta del dueño con clave temporal + mensaje para copiar.
3. **Logo reemplaza al nombre** en la página pública; la **foto** es opcional y se ve grande (escritorio) o en franja (celular). Se editan en *Página de reservas*, no en Configuración.
4. **Dos horarios distintos:** *atención* (lo que ve el cliente: abierto/cerrado/reabrimos) y *reserva* (franjas ofrecidas; el "cierra" es la última hora reservable, inclusive; cada 15 min). Hoy: almuerzo 13:00–15:00, cena 19:00–21:00.
5. **Máximo 10 personas online**; más → contactar al restaurante.
6. **Ubicación al reservar** (salón/terraza/…) es una preferencia, no obligación; el motor la favorece (+15) y el panel avisa si no hay mesa ahí.
7. **Saber la mesa antes de aceptar**: el detalle muestra la mesa que se usará y se puede cambiar; aceptar la deja asignada.
8. **Re-confirmación del cliente por enlace personal** (`/c/<token>`), sirve por WhatsApp o correo. "No podré ir" cancela y libera la mesa; queda en Notificaciones para ofrecerla a la lista de espera.
9. **WhatsApp hoy es semiautomático** (botón que abre `wa.me` con el mensaje y el enlace). El envío automático requiere WhatsApp Business API (ver pendientes).
10. **Uniones de mesas**: si nada alcanza, se ofrecen 3–4 mesas libres de la misma zona (explícito: "Unir N mesas y aceptar"). La reserva recibe **número de unión por día** ("Unión N°3"), el nombre de la reserva se muestra en todas sus mesas (🔗), y el POS puede referirse a la cuenta como "Unión 3".
11. **Mover reservas**: arrastrar en la línea de tiempo o "Cambiar de mesa". **Nunca** a una mesa ocupada a esa hora (evita doble reserva). **Todo viaja con la reserva** (visita, cuenta POS, consumo).
12. **Confirmar antes de cancelar/rechazar** una reserva.
13. Textos en español neutro/chileno tuteando (no voseo).

## Técnicas
- Una sola puerta a Supabase: `packages/api-client`. Lógica pura y testeable en `packages/core`.
- Seguridad: funciones `SECURITY DEFINER` + `_assert_platform_admin()` para todo lo global; tokens de confirmación largos y aleatorios como "permiso" de la página pública; la API de POS guarda solo el hash de la clave.
- `check_table_availability` es la única fuente de verdad de disponibilidad (considera mesas extra de uniones y colchón de 15 min). `assign_reservation_table(s)` validan en el servidor.
- Estado de visuales: clases `.st-*` fuera de `@layer` (Tailwind las purgaría).
- Probar la base con bloques `do $$ … raise exception` (rollback) en vez de datos reales; si se crean datos reales de prueba, se borran al terminar.
- Despliegue: push a `main` → Vercel (dos proyectos). `apps/admin/vercel.json` reescribe a `index.html`.
- Correos salen de `onboarding@resend.dev` hasta que haya dominio propio verificado (cambiar solo el `from` en `send_transactional_email`). El enlace base de los correos está en `booking_base_url()` (SQL).
