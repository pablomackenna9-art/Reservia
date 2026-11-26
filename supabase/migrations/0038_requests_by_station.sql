-- ============================================================================
-- 0038 — Pedidos por estación (cocina / barra) y avance de cada pedido.
--
-- Un pedido del cliente se parte en una fila por estación según la categoría de cada plato (Entradas → cocina,
-- Bebidas → barra...), así cada pantalla ve solo lo suyo y avanza a su ritmo:
--   pedidos:  pending (nuevo) → preparing (preparando) → ready (listo para servir) → done (entregado)
--   avisos:   pending → seen (visto) → done   (llamar al mozo, cuenta, agua, otra cosa)
-- ============================================================================

alter table public.table_requests add column if not exists station text check (station in ('cocina', 'barra'));
alter table public.table_requests add column if not exists order_group uuid;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.table_requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.table_requests drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.table_requests
  add constraint table_requests_status_check check (status in ('pending', 'seen', 'preparing', 'ready', 'done', 'cancelled'));

create index if not exists table_requests_station_idx on public.table_requests (restaurant_id, station, status, created_at);

-- El cliente envía una solicitud (ahora los pedidos se parten por estación).
create or replace function public.create_table_request(
  p_token text,
  p_kind text,
  p_items jsonb default '[]'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables;
  v_item jsonb;
  v_dish public.menu_dishes;
  v_station text;
  v_qty int;
  v_variant text;
  v_price int;
  v_line jsonb;
  v_cocina jsonb := '[]'::jsonb;
  v_barra jsonb := '[]'::jsonb;
  v_group uuid := gen_random_uuid();
  v_id uuid;
  v_first uuid;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if p_kind not in ('waiter', 'bill', 'water', 'order', 'other') then
    raise exception 'Solicitud no válida.';
  end if;
  select t.* into v_table from public.tables t join public.table_qr_tokens q on q.table_id = t.id where q.token = p_token and t.active;
  if v_table.id is null then
    raise exception 'No encontramos esta mesa. Pide ayuda al personal.';
  end if;
  if not exists (select 1 from public.restaurants where id = v_table.restaurant_id and status = 'active') then
    raise exception 'Este restaurante no está disponible.';
  end if;

  perform public.check_rate_limit('tablereq:' || v_table.id, 12, 10);
  perform public.check_rate_limit('tablereq:restaurant:' || v_table.restaurant_id, 120, 10);

  if p_kind <> 'order' then
    insert into public.table_requests (restaurant_id, table_id, kind, note)
    values (v_table.restaurant_id, v_table.id, p_kind, v_note)
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'status', 'pending');
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Elige al menos un plato.';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Son demasiados platos en un solo pedido.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select d.* into v_dish from public.menu_dishes d
      where d.id = nullif(v_item->>'dish_id', '')::uuid and d.restaurant_id = v_table.restaurant_id and d.active;
    if v_dish.id is null then
      raise exception 'Uno de los platos ya no está en la carta.';
    end if;
    if v_dish.sold_out then
      raise exception '"%" se agotó.', v_dish.name;
    end if;
    select c.station into v_station from public.menu_categories c where c.id = v_dish.category_id;
    v_qty := greatest(1, least(20, coalesce((v_item->>'qty')::int, 1)));
    v_variant := nullif(btrim(coalesce(v_item->>'variant', '')), '');
    v_price := v_dish.price;
    if v_variant is not null then
      select (x->>'price')::int into v_price
      from jsonb_array_elements(v_dish.variants) x
      where x->>'name' = v_variant
      limit 1;
      if v_price is null then
        raise exception 'La opción elegida ya no existe.';
      end if;
    end if;
    v_line := jsonb_build_object(
      'dish_id', v_dish.id,
      'name', v_dish.name,
      'price', v_price,
      'qty', v_qty,
      'variant', v_variant,
      'note', nullif(left(btrim(coalesce(v_item->>'note', '')), 200), '')
    );
    if coalesce(v_station, 'cocina') = 'barra' then
      v_barra := v_barra || jsonb_build_array(v_line);
    else
      v_cocina := v_cocina || jsonb_build_array(v_line);
    end if;
  end loop;

  if jsonb_array_length(v_cocina) > 0 then
    insert into public.table_requests (restaurant_id, table_id, kind, items, note, station, order_group)
    values (v_table.restaurant_id, v_table.id, 'order', v_cocina, v_note, 'cocina', v_group)
    returning id into v_id;
    v_first := v_id;
  end if;
  if jsonb_array_length(v_barra) > 0 then
    insert into public.table_requests (restaurant_id, table_id, kind, items, note, station, order_group)
    values (v_table.restaurant_id, v_table.id, 'order', v_barra, v_note, 'barra', v_group)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
  end if;

  return jsonb_build_object('id', v_first, 'status', 'pending');
end;
$$;

create or replace function public.get_table_requests_public(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table public.tables;
begin
  select t.* into v_table from public.tables t join public.table_qr_tokens q on q.table_id = t.id where q.token = p_token and t.active;
  if v_table.id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'station', r.station, 'created_at', r.created_at, 'items', r.items, 'note', r.note) order by r.created_at desc)
    from public.table_requests r
    where r.table_id = v_table.id and r.created_at > now() - interval '3 hours'
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.create_table_request(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.get_table_requests_public(text) to anon, authenticated;
