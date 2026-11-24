-- Mesas grandes hechas de módulos (ej. una de 10 = 4 + 4 + 2).
--
-- Una "mesa larga" (table_layouts) agrupa módulos que son mesas reales (cada una con su nombre, capacidad y
-- estado) y que se dibujan pegadas como una sola mesa. Se divide DENTRO de la misma huella de la mesa original:
-- no cambia su posición ni su tamaño total. Cada módulo recuerda su lugar de origen (home_*), así que si se
-- aparta puede volver exactamente donde estaba, y la mesa larga puede deshacerse y quedar como era.

create table if not exists public.table_layouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  -- cómo era la mesa antes de dividirla, para poder deshacer la división
  orig_x numeric not null,
  orig_y numeric not null,
  orig_width numeric not null,
  orig_height numeric not null,
  orig_rotation numeric not null default 0,
  orig_shape text not null default 'rectangle',
  orig_capacity_min int not null default 1,
  orig_capacity_max int not null,
  created_at timestamptz not null default now()
);
create index if not exists table_layouts_restaurant_idx on public.table_layouts (restaurant_id);

alter table public.table_layouts enable row level security;
create policy table_layouts_select on public.table_layouts
  for select using (public.is_member_of(restaurant_id));
create policy table_layouts_write on public.table_layouts
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator']));

alter table public.tables
  add column if not exists layout_id uuid references public.table_layouts(id) on delete set null,
  add column if not exists home_x numeric,
  add column if not exists home_y numeric,
  add column if not exists home_rotation numeric,
  add column if not exists home_width numeric,
  add column if not exists home_height numeric;
create index if not exists tables_layout_idx on public.tables (layout_id) where layout_id is not null;

-- Divide una mesa en módulos dentro de su misma huella. p_capacities = asientos de cada módulo, en orden
-- (ej. {4,4,2}). El primer módulo conserva el id de la mesa original (sus reservas siguen apuntando a él);
-- una reserva más grande que ese módulo pasa a ocupar los módulos necesarios (queda como unión con número).
create or replace function public.split_table_into_modules(p_table uuid, p_capacities int[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tables;
  z public.zones;
  v_layout uuid;
  n int;
  total int;
  i int;
  k int;
  acc numeric := 0;
  v_horizontal boolean;
  v_len numeric;
  v_w numeric;
  v_h numeric;
  v_off numeric;
  rad double precision;
  dx numeric;
  dy numeric;
  v_x numeric;
  v_y numeric;
  v_new uuid;
  v_ids uuid[] := '{}';
  r record;
  v_cum int;
  v_n int;
  v_tz text;
  v_letters constant text := 'ABCDEFGH';
begin
  select * into t from public.tables where id = p_table;
  if t.id is null then
    raise exception 'La mesa no existe.';
  end if;
  if not (auth.role() = 'service_role' or public.has_role(t.restaurant_id, array['owner', 'administrator'])) then
    raise exception 'Solo el dueño o un administrador puede dividir mesas.';
  end if;
  if t.layout_id is not null then
    raise exception 'Esta mesa ya está dividida en módulos.';
  end if;

  n := coalesce(array_length(p_capacities, 1), 0);
  if n < 2 or n > 6 then
    raise exception 'Una mesa se divide en entre 2 y 6 módulos.';
  end if;
  if exists (select 1 from unnest(p_capacities) c where c < 1 or c > 12) then
    raise exception 'Cada módulo debe ser de 1 a 12 personas.';
  end if;
  select sum(c) into total from unnest(p_capacities) c;

  select * into z from public.zones where id = t.zone_id;
  select coalesce(timezone, 'America/Santiago') into v_tz from public.restaurants where id = t.restaurant_id;

  v_horizontal := t.width >= t.height;
  v_len := case when v_horizontal then t.width else t.height end;
  rad := radians(t.rotation::double precision);

  insert into public.table_layouts (restaurant_id, zone_id, name, orig_x, orig_y, orig_width, orig_height, orig_rotation, orig_shape, orig_capacity_min, orig_capacity_max)
  values (t.restaurant_id, t.zone_id, t.name, t.pos_x, t.pos_y, t.width, t.height, t.rotation, t.shape, t.capacity_min, t.capacity_max)
  returning id into v_layout;

  for i in 1..n loop
    k := p_capacities[i];
    v_w := case when v_horizontal then t.width * k / total else t.width end;
    v_h := case when v_horizontal then t.height else t.height * k / total end;
    v_off := -v_len / 2 + (v_len * acc / total) + (v_len * k / total) / 2;
    -- desplazamiento del centro del módulo respecto del centro de la mesa, girado como la mesa
    dx := case when v_horizontal then v_off * cos(rad) else -v_off * sin(rad) end;
    dy := case when v_horizontal then v_off * sin(rad) else v_off * cos(rad) end;
    v_x := least(100, greatest(0, t.pos_x + dx / z.width * 100));
    v_y := least(100, greatest(0, t.pos_y + dy / z.height * 100));
    acc := acc + k;

    if i = 1 then
      update public.tables
        set name = t.name || '-' || substr(v_letters, i, 1),
            shape = 'rectangle', capacity_min = 1, capacity_max = k,
            pos_x = v_x, pos_y = v_y, width = v_w, height = v_h,
            joinable = true, layout_id = v_layout,
            home_x = v_x, home_y = v_y, home_rotation = t.rotation, home_width = v_w, home_height = v_h
        where id = t.id;
      v_ids := v_ids || t.id;
    else
      insert into public.tables (restaurant_id, zone_id, name, shape, capacity_min, capacity_max, pos_x, pos_y, width, height, rotation,
                                 active, joinable, layout_id, home_x, home_y, home_rotation, home_width, home_height)
      values (t.restaurant_id, t.zone_id, t.name || '-' || substr(v_letters, i, 1), 'rectangle', 1, k, v_x, v_y, v_w, v_h, t.rotation,
              true, true, v_layout, v_x, v_y, t.rotation, v_w, v_h)
      returning id into v_new;
      v_ids := v_ids || v_new;
    end if;
  end loop;

  -- Las reservas que ya estaban en la mesa original y no caben en el primer módulo pasan a ocupar los que hagan falta.
  for r in
    select id, party_size, starts_at, union_number from public.reservations
    where table_id = t.id and status in ('pending', 'confirmed', 'arriving', 'seated')
  loop
    if r.party_size > p_capacities[1] then
      v_cum := 0;
      k := 0;
      for i in 1..n loop
        v_cum := v_cum + p_capacities[i];
        k := i;
        exit when v_cum >= r.party_size;
      end loop;
      if k > 1 then
        insert into public.reservation_tables (reservation_id, table_id, restaurant_id)
        select r.id, x, t.restaurant_id from unnest(v_ids[2:k]) x
        on conflict do nothing;
        select coalesce(max(rr.union_number), 0) + 1 into v_n
        from public.reservations rr
        where rr.restaurant_id = t.restaurant_id and rr.id <> r.id
          and (rr.starts_at at time zone v_tz)::date = (r.starts_at at time zone v_tz)::date;
        update public.reservations set union_number = coalesce(r.union_number, v_n) where id = r.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('layout_id', v_layout, 'table_ids', to_jsonb(v_ids));
end;
$$;

grant execute on function public.split_table_into_modules(uuid, int[]) to authenticated;

-- Deshace la división: la mesa vuelve a ser UNA, exactamente como era (misma posición, tamaño y capacidad).
-- Solo si ninguna reserva activa depende de los módulos 2..n por su cuenta (las uniones sí se pasan a la mesa entera).
create or replace function public.merge_table_modules(p_layout uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.table_layouts;
  v_first uuid;
  v_others uuid[];
begin
  select * into l from public.table_layouts where id = p_layout;
  if l.id is null then
    raise exception 'Esa mesa larga no existe.';
  end if;
  if not (auth.role() = 'service_role' or public.has_role(l.restaurant_id, array['owner', 'administrator'])) then
    raise exception 'Solo el dueño o un administrador puede deshacer la división.';
  end if;

  select id into v_first from public.tables where layout_id = p_layout order by created_at, name limit 1;
  select coalesce(array_agg(id), '{}') into v_others from public.tables where layout_id = p_layout and id <> v_first;

  if exists (
    select 1 from public.reservations r
    where r.table_id = any (v_others)
      and r.status in ('pending', 'confirmed', 'arriving', 'seated')
      and r.ends_at > now()
  ) then
    raise exception 'Hay reservas activas en otros módulos de esta mesa. Muévelas o termínalas antes de deshacer la división.';
  end if;

  -- las uniones que usaban los módulos pasan a usar la mesa entera
  update public.reservations set union_number = null
    where id in (select reservation_id from public.reservation_tables where table_id = any (v_others || v_first));
  delete from public.reservation_tables where table_id = any (v_others);
  delete from public.tables where id = any (v_others);

  update public.tables
    set name = l.name, shape = l.orig_shape, capacity_min = l.orig_capacity_min, capacity_max = l.orig_capacity_max,
        pos_x = l.orig_x, pos_y = l.orig_y, width = l.orig_width, height = l.orig_height, rotation = l.orig_rotation,
        layout_id = null, home_x = null, home_y = null, home_rotation = null, home_width = null, home_height = null
    where id = v_first;

  delete from public.table_layouts where id = p_layout;
  return v_first;
end;
$$;

grant execute on function public.merge_table_modules(uuid) to authenticated;
