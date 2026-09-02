-- Lista negra de clientes: el dueño puede marcar a alguien para que no
-- pueda reservar más por el portal público (no-shows repetidos, etc.).
-- El staff sigue pudiendo cargarle una reserva a mano desde el Centro de
-- Control si decide hacer una excepción -- el bloqueo automático es solo
-- para el flujo público, sin intervención humana.

alter table public.customers
  add column if not exists blacklisted boolean not null default false,
  add column if not exists blacklisted_reason text;

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
