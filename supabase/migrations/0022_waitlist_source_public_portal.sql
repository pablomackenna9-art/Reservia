-- create_public_waitlist_entry insertaba sin especificar `source` (agregada
-- en 0021), así que quedaba con el default 'walk_in' -- una entrada creada
-- desde el portal público no es un walk-in.

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

  insert into public.waitlist_entries (restaurant_id, customer_id, party_size, notes, status, source)
  values (v_restaurant.id, v_customer_id, p_party_size, p_notes, 'waiting', 'public_portal')
  returning * into v_entry;

  return v_entry;
end;
$$;
