-- Decoración del plano: plantas, árboles, jardineras, columnas, muros, puertas, barras y sofás.
-- Son solo dibujo (no se reservan ni cuentan como mesas) y se editan en "Editar plano".
-- Posición en % de la zona (igual que las mesas); tamaño en las mismas unidades que el ancho/alto de una mesa.

create table if not exists public.zone_decor (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  kind text not null check (kind in ('plant', 'tree', 'planter', 'column', 'wall', 'door', 'bar', 'sofa')),
  pos_x numeric not null check (pos_x >= 0 and pos_x <= 100),
  pos_y numeric not null check (pos_y >= 0 and pos_y <= 100),
  width numeric not null default 60 check (width > 0),
  height numeric not null default 60 check (height > 0),
  rotation numeric not null default 0 check (rotation >= 0 and rotation < 360),
  created_at timestamptz not null default now()
);
create index if not exists zone_decor_zone_idx on public.zone_decor (zone_id);
create index if not exists zone_decor_restaurant_idx on public.zone_decor (restaurant_id);

alter table public.zone_decor enable row level security;
create policy zone_decor_select on public.zone_decor
  for select using (public.is_member_of(restaurant_id));
create policy zone_decor_write on public.zone_decor
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator']));

-- Los clientes nuevos que se crean desde una plantilla heredan también la decoración.
create or replace function public._clone_template(p_target uuid, p_source uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  z record;
  t record;
  h record;
  o record;
  d record;
  r record;
  v_new_zone uuid;
  v_zone_map jsonb := '{}'::jsonb;
  v_zones int := 0;
  v_tables int := 0;
  v_hours int := 0;
begin
  if p_target = p_source then
    raise exception 'La plantilla no puede ser el mismo restaurante.';
  end if;
  if not exists (select 1 from public.restaurants where id = p_source) then
    raise exception 'No existe el restaurante de plantilla.';
  end if;
  if exists (select 1 from public.zones where restaurant_id = p_target)
     or exists (select 1 from public.tables where restaurant_id = p_target) then
    raise exception 'Este restaurante ya tiene zonas o mesas: no se le puede aplicar una plantilla encima.';
  end if;

  for z in select * from public.zones where restaurant_id = p_source and active order by sort_order, created_at loop
    v_new_zone := gen_random_uuid();
    insert into public.zones
      select (jsonb_populate_record(null::public.zones,
        to_jsonb(z) || jsonb_build_object('id', v_new_zone, 'restaurant_id', p_target, 'created_at', now(), 'updated_at', now()))).*;
    v_zone_map := v_zone_map || jsonb_build_object(z.id::text, v_new_zone);
    v_zones := v_zones + 1;
  end loop;

  for t in select * from public.tables where restaurant_id = p_source and active loop
    if v_zone_map ? t.zone_id::text then
      insert into public.tables
        select (jsonb_populate_record(null::public.tables,
          to_jsonb(t) || jsonb_build_object(
            'id', gen_random_uuid(), 'restaurant_id', p_target, 'zone_id', v_zone_map ->> t.zone_id::text,
            'created_at', now(), 'updated_at', now()))).*;
      v_tables := v_tables + 1;
    end if;
  end loop;

  -- Decoración del plano (plantas, columnas, barra...): se copia a la zona equivalente.
  for d in select * from public.zone_decor where restaurant_id = p_source loop
    if v_zone_map ? d.zone_id::text then
      insert into public.zone_decor
        select (jsonb_populate_record(null::public.zone_decor,
          to_jsonb(d) || jsonb_build_object(
            'id', gen_random_uuid(), 'restaurant_id', p_target, 'zone_id', v_zone_map ->> d.zone_id::text,
            'created_at', now()))).*;
    end if;
  end loop;

  delete from public.restaurant_hours where restaurant_id = p_target;
  for h in select * from public.restaurant_hours where restaurant_id = p_source loop
    insert into public.restaurant_hours
      select (jsonb_populate_record(null::public.restaurant_hours,
        to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', p_target, 'created_at', now()))).*;
    v_hours := v_hours + 1;
  end loop;

  delete from public.restaurant_opening_hours where restaurant_id = p_target;
  for o in select * from public.restaurant_opening_hours where restaurant_id = p_source loop
    insert into public.restaurant_opening_hours
      select (jsonb_populate_record(null::public.restaurant_opening_hours,
        to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', p_target, 'created_at', now()))).*;
  end loop;

  select * into r from public.reservation_rules where restaurant_id = p_source;
  if found then
    delete from public.reservation_rules where restaurant_id = p_target;
    insert into public.reservation_rules
      select (jsonb_populate_record(null::public.reservation_rules,
        to_jsonb(r) || jsonb_build_object('restaurant_id', p_target, 'updated_at', now()))).*;
  end if;

  return jsonb_build_object('zones', v_zones, 'tables', v_tables, 'hours', v_hours);
end;
$$;

revoke all on function public._clone_template(uuid, uuid) from public, anon, authenticated;
