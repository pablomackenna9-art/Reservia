-- Portal público: logo del restaurante, reconocer a un cliente que vuelve
-- por su mail, y disponibilidad de todo un mes de un solo llamado (para el
-- calendario). Todo aditivo -- no toca reservas ni el flujo existente.

-- ============================================================================
-- 1. Logo del restaurante -- bucket público de Storage. Solo owner/admin del
--    restaurante puede subir/reemplazar/borrar; cualquiera puede leer (el
--    portal público lo necesita sin sesión). Los archivos se guardan como
--    "{restaurant_id}/logo.<ext>" -- el primer segmento de la ruta es el
--    tenant, igual que restaurant_id en cualquier otra tabla.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

create policy "restaurant_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'restaurant-logos');

create policy "restaurant_logos_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'restaurant-logos'
    and public.has_role((storage.foldername(name))[1]::uuid, array['owner', 'administrator'])
  );

create policy "restaurant_logos_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'restaurant-logos'
    and public.has_role((storage.foldername(name))[1]::uuid, array['owner', 'administrator'])
  );

create policy "restaurant_logos_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'restaurant-logos'
    and public.has_role((storage.foldername(name))[1]::uuid, array['owner', 'administrator'])
  );

-- ============================================================================
-- 2. Reconocer a un cliente que ya reservó antes, por mail -- para el saludo
--    "¿Eres Pablo Mackenna?" en la confirmación. Nunca expone si el mail
--    existe de forma ambigua: sin restaurante activo o sin match, no
--    devuelve filas, igual que cualquier búsqueda vacía.
-- ============================================================================
create or replace function public.lookup_public_customer(
  p_restaurant_slug text,
  p_email text
)
returns table (first_name text, last_name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  select id into v_restaurant_id from public.restaurants where slug = p_restaurant_slug and status = 'active';
  if v_restaurant_id is null then
    return;
  end if;

  return query
    select c.first_name, c.last_name, c.phone
    from public.customers c
    where c.restaurant_id = v_restaurant_id and c.email = p_email and not c.blacklisted
    order by c.last_visit_at desc nulls last
    limit 1;
end;
$$;

grant execute on function public.lookup_public_customer(text, text) to anon;

-- ============================================================================
-- 3. Disponibilidad de un mes completo en un solo llamado -- para pintar el
--    calendario (verde = disponible, ámbar = sin mesas pero el restaurante
--    abre ese día -- candidato a lista de espera, gris = cerrado). Reusa
--    list_available_tables día por día, cortando apenas encuentra un
--    horario que sirva -- no evalúa cada franja si la primera ya alcanza.
-- ============================================================================
create or replace function public.get_month_availability(
  p_restaurant_slug text,
  p_party_size int,
  p_year int,
  p_month int
)
returns table (day date, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_rules record;
  v_tz text;
  v_duration interval;
  v_day date;
  v_last_day date;
  v_dow int;
  v_service record;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_service_end timestamptz;
  v_has_service boolean;
  v_has_slot boolean;
  v_min_ts timestamptz;
  v_max_ts timestamptz;
begin
  select id, coalesce(timezone, 'America/Santiago') as tz into v_restaurant
  from public.restaurants r where r.slug = p_restaurant_slug and r.status = 'active';
  if v_restaurant.id is null then
    return;
  end if;
  v_tz := v_restaurant.tz;

  select * into v_rules from public.reservation_rules where restaurant_id = v_restaurant.id;
  v_duration := make_interval(mins => coalesce(v_rules.default_duration_minutes, 90));
  v_min_ts := now() + make_interval(hours => coalesce(v_rules.min_advance_hours, 1));
  v_max_ts := now() + make_interval(days => coalesce(v_rules.max_advance_days, 60));

  v_day := make_date(p_year, p_month, 1);
  v_last_day := (v_day + interval '1 month' - interval '1 day')::date;

  while v_day <= v_last_day loop
    v_dow := extract(dow from v_day);
    v_has_service := false;
    v_has_slot := false;

    for v_service in
      select opens_at, closes_at from public.restaurant_hours
      where restaurant_id = v_restaurant.id and day_of_week = v_dow
    loop
      v_has_service := true;
      exit when v_has_slot;

      v_slot_start := (v_day::timestamp + v_service.opens_at) at time zone v_tz;
      v_service_end := (v_day::timestamp + v_service.closes_at) at time zone v_tz;

      while v_slot_start + v_duration <= v_service_end loop
        v_slot_end := v_slot_start + v_duration;
        if v_slot_start >= v_min_ts and v_slot_start <= v_max_ts then
          if exists (
            select 1 from public.list_available_tables(v_restaurant.id, p_party_size, v_slot_start, v_slot_end, null)
          ) then
            v_has_slot := true;
            exit;
          end if;
        end if;
        v_slot_start := v_slot_start + interval '30 minutes';
      end loop;
    end loop;

    day := v_day;
    status := case when not v_has_service then 'closed' when v_has_slot then 'available' else 'waitlist' end;
    return next;

    v_day := v_day + interval '1 day';
  end loop;

  return;
end;
$$;

grant execute on function public.get_month_availability(text, int, int, int) to anon;
