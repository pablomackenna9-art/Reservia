-- Rate limiting básico en los RPC públicos -- create_public_reservation y
-- create_public_waitlist_entry estaban abiertas a anon sin ningún límite;
-- cualquiera con el slug del restaurante podía scriptear reservas/clientes
-- falsos sin fricción.
--
-- Por teléfono (siempre viene, ya es obligatorio en ambos RPC) y por
-- restaurante entero, para frenar tanto un mismo número insistiendo como un
-- script que rota números contra el mismo local. Queda pendiente un límite
-- por IP más adelante -- leer request.headers en PostgREST no se usa en
-- ningún lado de este proyecto todavía y no queremos introducirlo sin poder
-- probarlo en vivo contra el proyecto real.

create table public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_key_idx on public.rate_limit_hits (key, created_at);

alter table public.rate_limit_hits enable row level security;
-- Sin policies para nadie -- solo la tocan funciones security definer.

create or replace function public.check_rate_limit(p_key text, p_max_hits int, p_window_minutes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Auto-limpieza: nunca crece sin límite, no hace falta un cron aparte.
  delete from public.rate_limit_hits where created_at < now() - interval '1 day';

  select count(*) into v_count
    from public.rate_limit_hits
    where key = p_key and created_at > now() - make_interval(mins => p_window_minutes);

  if v_count >= p_max_hits then
    raise exception 'Demasiados intentos -- esperá un rato y volvé a intentar.';
  end if;

  insert into public.rate_limit_hits (key) values (p_key);
end;
$$;

-- Re-declara ambos RPC públicos con el mismo listado de parámetros (los
-- grants a anon de 0009/0017 siguen valiendo, la firma no cambia) agregando
-- el chequeo apenas se resuelve el restaurante -- antes de tocar cualquier
-- otra tabla.

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
  v_blacklisted boolean;
  v_has_capacity boolean;
  v_reservation public.reservations;
begin
  select id, status into v_restaurant from public.restaurants where slug = p_restaurant_slug;
  if v_restaurant.id is null or v_restaurant.status <> 'active' then
    raise exception 'Restaurante no encontrado.';
  end if;

  perform public.check_rate_limit('reservation:phone:' || p_phone, 5, 60);
  perform public.check_rate_limit('reservation:restaurant:' || v_restaurant.id, 30, 10);

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

  select id, blacklisted into v_customer_id, v_blacklisted
    from public.customers where restaurant_id = v_restaurant.id and phone = p_phone limit 1;

  if v_customer_id is not null and v_blacklisted then
    raise exception 'No pudimos crear tu reserva -- contactá al restaurante directamente.';
  end if;

  -- Solo confirma que ALGUNA mesa podría recibirlos -- no reserva ninguna en
  -- particular. La asignación real queda para cuando el dueño acepte.
  select exists (
    select 1 from public.list_available_tables(v_restaurant.id, p_party_size, p_starts_at, p_ends_at, null)
  ) into v_has_capacity;
  if not v_has_capacity then
    raise exception 'Ya no hay disponibilidad para ese horario -- probá otro.';
  end if;

  if v_customer_id is null then
    insert into public.customers (restaurant_id, first_name, last_name, phone, email)
    values (v_restaurant.id, p_first_name, p_last_name, p_phone, p_email)
    returning id into v_customer_id;
  end if;

  insert into public.reservations (restaurant_id, customer_id, table_id, starts_at, ends_at, party_size, status, source, notes)
  values (v_restaurant.id, v_customer_id, null, p_starts_at, p_ends_at, p_party_size, 'pending', 'public_portal', p_notes)
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.create_public_waitlist_entry(
  p_restaurant_slug text,
  p_party_size int,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null
)
returns public.waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_customer_id uuid;
  v_blacklisted boolean;
  v_entry public.waitlist_entries;
begin
  select id, status into v_restaurant from public.restaurants where slug = p_restaurant_slug;
  if v_restaurant.id is null or v_restaurant.status <> 'active' then
    raise exception 'Restaurante no encontrado.';
  end if;

  perform public.check_rate_limit('waitlist:phone:' || p_phone, 5, 60);
  perform public.check_rate_limit('waitlist:restaurant:' || v_restaurant.id, 30, 10);

  select id, blacklisted into v_customer_id, v_blacklisted
    from public.customers where restaurant_id = v_restaurant.id and phone = p_phone limit 1;

  if v_customer_id is not null and v_blacklisted then
    raise exception 'No pudimos anotarte -- contactá al restaurante directamente.';
  end if;

  if v_customer_id is null then
    insert into public.customers (restaurant_id, first_name, last_name, phone, email)
    values (v_restaurant.id, p_first_name, p_last_name, p_phone, p_email)
    returning id into v_customer_id;
  end if;

  insert into public.waitlist_entries (restaurant_id, customer_id, party_size, notes, status)
  values (v_restaurant.id, v_customer_id, p_party_size, p_notes, 'waiting')
  returning * into v_entry;

  return v_entry;
end;
$$;
