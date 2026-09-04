-- Fase: lista de espera con prioridad + camino público cuando no hay
-- disponibilidad. Aditivo -- no toca reservas, disponibilidad ni el resto
-- del portal público existente.

-- ============================================================================
-- 1. Prioridad -- mayor número = se atiende primero. 0 = normal (default).
-- ============================================================================
alter table public.waitlist_entries
  add column if not exists priority int not null default 0;

comment on column public.waitlist_entries.priority is
  'Mayor = más prioridad al asignar mesa. 0 = normal, sin marcar.';

create index if not exists waitlist_entries_priority_idx
  on public.waitlist_entries (restaurant_id, status, priority desc, requested_at asc);

-- ============================================================================
-- 2. Anotarse en lista de espera desde el portal público -- mismo patrón de
--    seguridad que create_public_reservation (SECURITY DEFINER, valida
--    restaurante activo y lista negra, crea el cliente si no existe).
--    A propósito NO valida capacidad -- se usa justo cuando no queda.
-- ============================================================================
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

grant execute on function public.create_public_waitlist_entry(text, int, text, text, text, text, text) to anon;
