-- ============================================================================
-- 0037 — Carta, QR por mesa y solicitudes de los clientes.
--
-- 1. La carta del restaurante (categorías y platos), editable desde el panel. Precios en CLP, IVA incluido.
-- 2. Un código (qr_token) por MESA FÍSICA: el QR impreso apunta a ese código, no al número de la mesa, así que
--    nunca se invalida cuando se renumera, se pega o se separa una mesa.
-- 3. Solicitudes que el cliente hace desde el QR: llamar al mozo, pedir la cuenta, agua, otra cosa, o pedir
--    platos de la carta (con notas como "sin ajo"). Se guardan en table_requests y el personal las ve en el plano.
-- Los clientes no tienen sesión: todo lo público pasa por funciones security definer que validan el código.
-- ============================================================================

-- ---------------------------------------------------------------- carta
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '',
  station text not null default 'cocina' check (station in ('cocina', 'barra')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort_order);

create table if not exists public.menu_dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  -- Precio en pesos chilenos, IVA incluido.
  price integer not null default 0 check (price >= 0),
  -- Variantes opcionales con su propio precio: [{"name": "Media", "price": 6900}, ...]
  variants jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  allergens text[] not null default '{}',
  sold_out boolean not null default false,
  featured boolean not null default false,
  image_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_dishes_restaurant_idx on public.menu_dishes (restaurant_id, category_id, sort_order);

alter table public.menu_categories enable row level security;
alter table public.menu_dishes enable row level security;

create policy menu_categories_select on public.menu_categories for select using (public.is_member_of(restaurant_id));
create policy menu_categories_write on public.menu_categories for all
  using (public.has_role(restaurant_id, array['owner', 'administrator']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy menu_dishes_select on public.menu_dishes for select using (public.is_member_of(restaurant_id));
create policy menu_dishes_write on public.menu_dishes for all
  using (public.has_role(restaurant_id, array['owner', 'administrator']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator']));

-- Marcar un plato como agotado lo puede hacer también el equipo de sala.
create policy menu_dishes_soldout on public.menu_dishes for update
  using (public.has_role(restaurant_id, array['host', 'waiter']))
  with check (public.has_role(restaurant_id, array['host', 'waiter']));

-- ---------------------------------------------------------------- QR por mesa
-- Tabla aparte (no una columna de `tables`) para que el código nunca viaje en las consultas públicas de mesas.
create table if not exists public.table_qr_tokens (
  table_id uuid primary key references public.tables(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
);
create index if not exists table_qr_tokens_restaurant_idx on public.table_qr_tokens (restaurant_id);

alter table public.table_qr_tokens enable row level security;
create policy table_qr_tokens_select on public.table_qr_tokens for select using (public.is_member_of(restaurant_id));
-- Escribir: solo por el trigger de abajo (security definer).

insert into public.table_qr_tokens (table_id, restaurant_id)
select t.id, t.restaurant_id from public.tables t
on conflict (table_id) do nothing;

create or replace function public.tables_create_qr_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.table_qr_tokens (table_id, restaurant_id) values (new.id, new.restaurant_id) on conflict (table_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tables_create_qr_token on public.tables;
create trigger tables_create_qr_token after insert on public.tables for each row execute function public.tables_create_qr_token();

-- ---------------------------------------------------------------- solicitudes
create table if not exists public.table_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  kind text not null check (kind in ('waiter', 'bill', 'water', 'order', 'other')),
  -- [{"dish_id": "...", "name": "...", "price": 8900, "qty": 2, "variant": null, "note": "sin ajo"}]
  items jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'seen', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);
create index if not exists table_requests_open_idx on public.table_requests (restaurant_id, status, created_at desc);
create index if not exists table_requests_table_idx on public.table_requests (table_id, created_at desc);

alter table public.table_requests enable row level security;
create policy table_requests_select on public.table_requests for select using (public.is_member_of(restaurant_id));
create policy table_requests_update on public.table_requests for update
  using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));
-- Insertar: solo por create_table_request (security definer). Nadie inserta directo.

-- ---------------------------------------------------------------- funciones públicas
-- La carta pública de un restaurante (solo platos activos).
create or replace function public.get_public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants;
begin
  select * into v_restaurant from public.restaurants where slug = p_slug and status = 'active';
  if v_restaurant.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'restaurant', jsonb_build_object('id', v_restaurant.id, 'name', v_restaurant.name, 'slug', v_restaurant.slug, 'logo_url', v_restaurant.logo_url),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) - 'restaurant_id' - 'created_at' order by c.sort_order, c.created_at)
      from public.menu_categories c where c.restaurant_id = v_restaurant.id and c.active
    ), '[]'::jsonb),
    'dishes', coalesce((
      select jsonb_agg(to_jsonb(d) - 'restaurant_id' - 'created_at' order by d.sort_order, d.created_at)
      from public.menu_dishes d
      join public.menu_categories c on c.id = d.category_id and c.active
      where d.restaurant_id = v_restaurant.id and d.active
    ), '[]'::jsonb)
  );
end;
$$;

-- Qué mesa es este código: restaurante, mesa y el plano (sin los códigos de las demás mesas), para poder
-- mostrarle al cliente el MISMO número que ve el personal aunque las mesas estén pegadas o separadas.
create or replace function public.resolve_table_qr(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table public.tables;
  v_restaurant public.restaurants;
begin
  select t.* into v_table from public.tables t join public.table_qr_tokens q on q.table_id = t.id where q.token = p_token and t.active;
  if v_table.id is null then
    return null;
  end if;
  select * into v_restaurant from public.restaurants where id = v_table.restaurant_id and status = 'active';
  if v_restaurant.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'restaurant', jsonb_build_object('id', v_restaurant.id, 'name', v_restaurant.name, 'slug', v_restaurant.slug, 'logo_url', v_restaurant.logo_url),
    'table_id', v_table.id,
    'tables', coalesce((select jsonb_agg(to_jsonb(t) - 'blocked_reason') from public.tables t where t.restaurant_id = v_table.restaurant_id and t.active), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(to_jsonb(z)) from public.zones z where z.restaurant_id = v_table.restaurant_id and z.active), '[]'::jsonb)
  );
end;
$$;

-- El cliente envía una solicitud. Precios y nombres de los platos salen SIEMPRE de la carta, no del cliente.
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
  v_qty int;
  v_variant text;
  v_price int;
  v_clean jsonb := '[]'::jsonb;
  v_id uuid;
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

  if p_kind = 'order' then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Elige al menos un plato.';
    end if;
    if jsonb_array_length(p_items) > 30 then
      raise exception 'Son demasiados platos en un solo pedido.';
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      select * into v_dish from public.menu_dishes
        where id = nullif(v_item->>'dish_id', '')::uuid and restaurant_id = v_table.restaurant_id and active;
      if v_dish.id is null then
        raise exception 'Uno de los platos ya no está en la carta.';
      end if;
      if v_dish.sold_out then
        raise exception '"%" se agotó.', v_dish.name;
      end if;
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
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'dish_id', v_dish.id,
        'name', v_dish.name,
        'price', v_price,
        'qty', v_qty,
        'variant', v_variant,
        'note', nullif(left(btrim(coalesce(v_item->>'note', '')), 200), '')
      ));
    end loop;
  end if;

  insert into public.table_requests (restaurant_id, table_id, kind, items, note)
  values (v_table.restaurant_id, v_table.id, p_kind, v_clean, v_note)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

-- Estado de lo que pidió esta mesa en las últimas horas (para mostrar "recibido" / "listo").
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
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'created_at', r.created_at, 'items', r.items, 'note', r.note) order by r.created_at desc)
    from public.table_requests r
    where r.table_id = v_table.id and r.created_at > now() - interval '3 hours'
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_public_menu(text) to anon, authenticated;
grant execute on function public.resolve_table_qr(text) to anon, authenticated;
grant execute on function public.create_table_request(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.get_table_requests_public(text) to anon, authenticated;

-- ---------------------------------------------------------------- fotos de los platos
-- Mismo bucket público que el logo: la ruta es "{restaurant_id}/menu/{archivo}" (las reglas por carpeta ya existen).
