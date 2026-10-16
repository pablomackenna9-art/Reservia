-- 1) Ubicación preferida al reservar (salón, terraza... o "me da lo mismo").
-- 2) Confirmación del cliente: cada reserva tiene un enlace único; el cliente abre el
--    enlace (llega por WhatsApp o correo) y re-confirma o avisa que no podrá ir.
--    Si avisa que no, la reserva pasa a cancelada y la mesa queda libre al instante.

alter table public.reservations
  add column if not exists preferred_zone_id uuid references public.zones(id) on delete set null,
  add column if not exists confirmation_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists customer_response text check (customer_response in ('confirmed', 'declined')),
  add column if not exists customer_responded_at timestamptz;

-- Dirección pública de la página de reservas (el enlace del correo apunta acá). Si algún día
-- hay dominio propio, es lo único que hay que cambiar.
create or replace function public.booking_base_url()
returns text
language sql
immutable
as $$ select 'https://reservia-booking-seven.vercel.app'::text $$;

-- Zonas que el cliente puede elegir: solo las activas que tienen mesas utilizables.
create or replace function public.list_public_zones(p_restaurant_slug text)
returns table (id uuid, name text, type text)
language sql
stable
security definer
set search_path = public
as $$
  select z.id, z.name, z.type
  from public.zones z
  join public.restaurants r on r.id = z.restaurant_id
  where r.slug = p_restaurant_slug
    and r.status = 'active'
    and z.active
    and exists (select 1 from public.tables t where t.zone_id = z.id and t.active and not t.blocked)
  order by z.sort_order, z.created_at;
$$;

grant execute on function public.list_public_zones(text) to anon;

-- Reserva desde el portal, ahora con zona preferida opcional. Si se elige una zona, la
-- disponibilidad se valida dentro de esa zona.
drop function if exists public.create_public_reservation(text, int, timestamptz, timestamptz, text, text, text, text, text);

create or replace function public.create_public_reservation(
  p_restaurant_slug text,
  p_party_size int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_zone_id uuid default null
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

  if p_zone_id is not null
     and not exists (select 1 from public.zones z where z.id = p_zone_id and z.restaurant_id = v_restaurant.id and z.active) then
    raise exception 'Esa ubicación no existe en este restaurante.';
  end if;

  select id, blacklisted into v_customer_id, v_blacklisted
    from public.customers where restaurant_id = v_restaurant.id and phone = p_phone limit 1;

  if v_customer_id is not null and v_blacklisted then
    raise exception 'No pudimos crear tu reserva -- contacta directamente al restaurante.';
  end if;

  -- Solo confirma que ALGUNA mesa (de la zona elegida, si hay) podría recibirlos -- no reserva
  -- ninguna en particular. La asignación real queda para cuando el restaurante acepte.
  select exists (
    select 1 from public.list_available_tables(v_restaurant.id, p_party_size, p_starts_at, p_ends_at, p_zone_id)
  ) into v_has_capacity;
  if not v_has_capacity then
    raise exception 'Ya no hay disponibilidad para ese horario -- prueba otro.';
  end if;

  if v_customer_id is null then
    insert into public.customers (restaurant_id, first_name, last_name, phone, email)
    values (v_restaurant.id, p_first_name, p_last_name, p_phone, p_email)
    returning id into v_customer_id;
  end if;

  insert into public.reservations (restaurant_id, customer_id, table_id, starts_at, ends_at, party_size, status, source, notes, preferred_zone_id)
  values (v_restaurant.id, v_customer_id, null, p_starts_at, p_ends_at, p_party_size, 'pending', 'public_portal', p_notes, p_zone_id)
  returning * into v_reservation;

  return v_reservation;
end;
$$;

grant execute on function public.create_public_reservation(text, int, timestamptz, timestamptz, text, text, text, text, text, uuid) to anon;

-- Lo que ve el cliente al abrir su enlace de confirmación.
create or replace function public.get_reservation_by_token(p_token text)
returns table (
  restaurant_name text,
  restaurant_slug text,
  restaurant_logo text,
  timezone text,
  starts_at timestamptz,
  party_size int,
  status text,
  customer_response text,
  first_name text,
  zone_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select r.name, r.slug, r.logo_url, coalesce(r.timezone, 'America/Santiago'), res.starts_at, res.party_size,
           res.status, res.customer_response, c.first_name, z.name
    from public.reservations res
    join public.restaurants r on r.id = res.restaurant_id
    join public.customers c on c.id = res.customer_id
    left join public.zones z on z.id = res.preferred_zone_id
    where res.confirmation_token = p_token
      and length(coalesce(p_token, '')) >= 32;
end;
$$;

grant execute on function public.get_reservation_by_token(text) to anon;

-- El cliente re-confirma ('confirm') o avisa que no podrá ir ('decline'). Al declinar, la reserva
-- se cancela y la mesa queda libre (la reserva conserva table_id para que el equipo vea cuál se liberó).
create or replace function public.respond_to_reservation(p_token text, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.reservations;
begin
  if length(coalesce(p_token, '')) < 32 then
    raise exception 'Enlace no válido.';
  end if;
  perform public.check_rate_limit('respond:' || p_token, 20, 10);

  select * into v_res from public.reservations where confirmation_token = p_token;
  if v_res.id is null then
    raise exception 'Enlace no válido.';
  end if;
  if v_res.status in ('cancelled', 'completed', 'no_show', 'seated') then
    raise exception 'Esta reserva ya no se puede modificar.';
  end if;
  if v_res.ends_at < now() then
    raise exception 'Esta reserva ya pasó.';
  end if;

  if p_action = 'confirm' then
    update public.reservations
      set customer_response = 'confirmed', customer_responded_at = now()
      where id = v_res.id;
    return 'confirmed';
  elsif p_action = 'decline' then
    update public.reservations
      set customer_response = 'declined', customer_responded_at = now(), status = 'cancelled'
      where id = v_res.id;
    return 'declined';
  end if;

  raise exception 'Acción no válida.';
end;
$$;

grant execute on function public.respond_to_reservation(text, text) to anon;

-- El correo de "reserva confirmada" ahora pide re-confirmar asistencia con el enlace personal.
create or replace function public.notify_reservation_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
  v_local_ts timestamp;
  v_rows text;
  v_link text;
begin
  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name, timezone into v_restaurant from public.restaurants where id = new.restaurant_id;
  v_local_ts := new.starts_at at time zone coalesce(v_restaurant.timezone, 'America/Santiago');

  v_rows :=
    public.email_detail_row('A nombre de', v_customer.first_name) ||
    public.email_detail_row('Restaurante', v_restaurant.name) ||
    public.email_detail_row('Fecha', public.spanish_date_label(v_local_ts)) ||
    public.email_detail_row('Hora', to_char(v_local_ts, 'HH24:MI')) ||
    public.email_detail_row('Personas', new.party_size::text);

  if new.status = 'confirmed' then
    v_link := public.booking_base_url() || '/c/' || new.confirmation_token;
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva está confirmada',
      public.email_shell(
        'Confirmada', '#4cae83',
        '¡Tu reserva está confirmada!',
        format(
          'Hola %s, te esperamos. <strong>Por favor confirma que vienes</strong> (o avísanos si no puedes) en este enlace: <a href="%s" style="color:#e0ac4e;">%s</a>. Si no puedes venir, liberamos tu mesa para otra persona.',
          v_customer.first_name, v_link, v_link
        ),
        v_rows
      )
    );
  elsif new.status = 'cancelled' then
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva fue cancelada',
      public.email_shell(
        'Cancelada', '#dd7c68',
        'Tu reserva fue cancelada',
        format('Hola %s. Si fue un error, contacta directamente al restaurante.', v_customer.first_name),
        v_rows
      )
    );
  end if;
  return new;
end;
$$;
