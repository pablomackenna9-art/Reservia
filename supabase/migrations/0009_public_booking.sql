-- Portal público de reserva. Hasta ahora ningún dato era legible para un
-- visitante anónimo -- ni restaurants, ni restaurant_hours, ni
-- reservation_rules, y las funciones de disponibilidad solo estaban
-- otorgadas a "authenticated". El portal público, tal como esta pensado
-- desde el blueprint original, nunca inserta directo en reservations como
-- anon: pasa siempre por un RPC security definer que valida server-side.

-- ============================================================================
-- 1. Lectura publica minima -- lo que el portal necesita mostrar antes de
--    que la persona confirme nada.
-- ============================================================================
create policy restaurants_select_public on public.restaurants
  for select to anon
  using (status = 'active');

create policy restaurant_hours_select_public on public.restaurant_hours
  for select to anon
  using (exists (
    select 1 from public.restaurants r where r.id = restaurant_id and r.status = 'active'
  ));

create policy reservation_rules_select_public on public.reservation_rules
  for select to anon
  using (exists (
    select 1 from public.restaurants r where r.id = restaurant_id and r.status = 'active'
  ));

grant execute on function public.list_available_tables(uuid, int, timestamptz, timestamptz, uuid) to anon;
grant execute on function public.check_table_availability(uuid, timestamptz, timestamptz, uuid) to anon;

-- ============================================================================
-- 2. Crear una reserva desde el portal -- unico camino de escritura para
--    anon. Revalida todo server-side: no confia en que el horario que
--    manda el cliente siga disponible.
-- ============================================================================
create or replace function public.create_public_reservation(
  p_restaurant_slug text,
  p_party_size int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_rules record;
  v_customer_id uuid;
  v_table_id uuid;
  v_reservation public.reservations;
begin
  select id, status into v_restaurant from public.restaurants where slug = p_restaurant_slug;
  if v_restaurant.id is null or v_restaurant.status <> 'active' then
    raise exception 'Restaurante no encontrado.';
  end if;

  select * into v_rules from public.reservation_rules where restaurant_id = v_restaurant.id;
  if v_rules.restaurant_id is not null then
    if not coalesce(v_rules.allow_online_booking, true) then
      raise exception 'Este restaurante no acepta reservas online por ahora.';
    end if;
    if p_party_size < v_rules.min_party_size or p_party_size > v_rules.max_party_size then
      raise exception 'Cantidad de personas fuera del rango permitido.';
    end if;
    if p_starts_at < now() + make_interval(hours => v_rules.min_advance_hours) then
      raise exception 'Hace falta reservar con más anticipación.';
    end if;
    if p_starts_at > now() + make_interval(days => v_rules.max_advance_days) then
      raise exception 'Esa fecha está demasiado lejos todavía.';
    end if;
  end if;

  -- Mesa mas chica que alcance, para no gastar una mesa grande en un grupo chico.
  select id into v_table_id
  from public.list_available_tables(v_restaurant.id, p_party_size, p_starts_at, p_ends_at, null)
  order by capacity_max asc
  limit 1;

  if v_table_id is null then
    raise exception 'Ya no hay disponibilidad para ese horario -- probá otro.';
  end if;

  -- Mismo telefono en este restaurante -> es la misma persona, no un cliente nuevo.
  select id into v_customer_id
  from public.customers
  where restaurant_id = v_restaurant.id and phone = p_phone
  limit 1;

  if v_customer_id is null then
    insert into public.customers (restaurant_id, first_name, last_name, phone, email)
    values (v_restaurant.id, p_first_name, p_last_name, p_phone, p_email)
    returning id into v_customer_id;
  end if;

  insert into public.reservations (
    restaurant_id, customer_id, table_id, starts_at, ends_at, party_size, status, source, notes
  ) values (
    v_restaurant.id, v_customer_id, v_table_id, p_starts_at, p_ends_at, p_party_size, 'confirmed', 'public_portal', p_notes
  )
  returning * into v_reservation;

  return v_reservation;
end;
$$;

grant execute on function public.create_public_reservation(text, int, timestamptz, timestamptz, text, text, text, text, text) to anon;
