-- 1) Horario de atención del local (distinto del horario de reserva): lo que ve el
--    cliente como "Abierto ahora · hasta las 18:00 · Reabrimos a las 19:00".
--    Un bloque por tramo de atención y día; si cierra pasada la medianoche,
--    closes_at <= opens_at (ej. 19:00 → 02:00).
-- 2) Eliminar un restaurante completo (solo administrador de plataforma).
-- 3) Quitar el acceso de una persona a un restaurante (solo administrador de plataforma).

create table if not exists public.restaurant_opening_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  label text not null default 'Atención',
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now()
);
create index if not exists restaurant_opening_hours_restaurant_idx on public.restaurant_opening_hours (restaurant_id);

alter table public.restaurant_opening_hours enable row level security;

create policy restaurant_opening_hours_select on public.restaurant_opening_hours
  for select using (public.is_member_of(restaurant_id));
create policy restaurant_opening_hours_write on public.restaurant_opening_hours
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator']));
create policy restaurant_opening_hours_select_public on public.restaurant_opening_hours
  for select to anon
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.status = 'active'));

-- Los restaurantes que ya tienen turnos de reserva parten con una atención razonable
-- (almuerzo 12:30–16:00, cena 19:00–23:30) que el dueño ajusta después.
insert into public.restaurant_opening_hours (restaurant_id, day_of_week, label, opens_at, closes_at)
select restaurant_id, day_of_week, service_name,
       case when service_name = 'Almuerzo' then time '12:30' else time '19:00' end,
       case when service_name = 'Almuerzo' then time '16:00' else time '23:30' end
from public.restaurant_hours
where service_name in ('Almuerzo', 'Cena');

-- La plantilla de un cliente nuevo también copia el horario de atención.
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

-- Eliminar un restaurante y todo lo que cuelga de él (zonas, mesas, reservas, clientes,
-- POS, accesos...: todas las tablas tienen ON DELETE CASCADE). Exige escribir el nombre
-- corto para evitar borrados por error. Las cuentas de usuario NO se borran.
create or replace function public.admin_delete_restaurant(p_restaurant uuid, p_confirm_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_name text;
  v_tables int;
  v_reservations int;
begin
  perform public._assert_platform_admin();

  select slug, name into v_slug, v_name from public.restaurants where id = p_restaurant;
  if v_slug is null then
    raise exception 'Ese restaurante no existe.';
  end if;
  if lower(btrim(coalesce(p_confirm_slug, ''))) <> v_slug then
    raise exception 'Para eliminar escribe exactamente el nombre corto del restaurante (%).', v_slug;
  end if;

  select count(*) into v_tables from public.tables where restaurant_id = p_restaurant;
  select count(*) into v_reservations from public.reservations where restaurant_id = p_restaurant;

  delete from public.restaurants where id = p_restaurant;

  return jsonb_build_object('slug', v_slug, 'name', v_name, 'tables', v_tables, 'reservations', v_reservations);
end;
$$;

grant execute on function public.admin_delete_restaurant(uuid, text) to authenticated;

-- Quitar a una persona del restaurante (su cuenta sigue existiendo; solo pierde el acceso).
create or replace function public.admin_remove_access(p_restaurant uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int;
begin
  perform public._assert_platform_admin();

  delete from public.restaurant_users ru
  using auth.users u
  where ru.restaurant_id = p_restaurant
    and u.id = ru.user_id
    and lower(u.email) = lower(btrim(coalesce(p_email, '')));
  get diagnostics v_removed = row_count;

  if v_removed = 0 then
    raise exception 'Esa persona no tiene acceso a este restaurante.';
  end if;

  return jsonb_build_object('removed', v_removed);
end;
$$;

grant execute on function public.admin_remove_access(uuid, text) to authenticated;
