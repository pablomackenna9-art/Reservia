-- Solo el administrador de plataforma crea restaurantes (desde el panel: admin_create_client, que es
-- security definer y no pasa por esta policy). Antes cualquier usuario autenticado podía insertar uno
-- propio en el onboarding; ahora cada dueño ve y gestiona únicamente lo que se le asigna.

drop policy if exists restaurants_insert on public.restaurants;

create policy restaurants_insert on public.restaurants
  for insert with check (created_by = auth.uid() and public.is_platform_admin());
