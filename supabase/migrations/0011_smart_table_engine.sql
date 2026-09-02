-- Smart Table Engine: fundamentos de datos. Todo aditivo -- ninguna tabla,
-- columna ni política existente se elimina o renombra.

-- ============================================================================
-- 1. Mesas bloqueadas -- estado operativo temporal (mesa rota, evento
--    privado, etc.), distinto de `active` (que es soft-delete permanente).
--    "blocked" ya existía como valor de TABLE_LIVE_STATUSES en el código
--    pero nunca tuvo una columna real que lo respaldara -- se la agregamos.
-- ============================================================================
alter table public.tables
  add column if not exists blocked boolean not null default false,
  add column if not exists blocked_reason text;

-- ============================================================================
-- 2. Modo de asignación de mesas por restaurante.
-- ============================================================================
alter table public.reservation_rules
  add column if not exists table_assignment_mode text not null default 'suggest'
    check (table_assignment_mode in ('manual', 'suggest', 'automatic'));

-- ============================================================================
-- 3. Trazabilidad de la asignación de mesa en cada reserva: qué sugirió el
--    motor vs. qué se asignó realmente, y por qué mecanismo.
-- ============================================================================
alter table public.reservations
  add column if not exists suggested_table_id uuid references public.tables(id) on delete set null,
  add column if not exists table_assignment_source text
    check (table_assignment_source in ('manual', 'suggested', 'automatic'));

-- ============================================================================
-- 4. list_available_tables ahora también excluye mesas bloqueadas.
--    Mismo nombre y firma -- ningún caller existente se rompe.
-- ============================================================================
create or replace function public.list_available_tables(
  p_restaurant_id uuid,
  p_party_size int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_zone_id uuid default null
)
returns setof public.tables
language sql
stable
security definer
set search_path = public
as $$
  select t.*
  from public.tables t
  where t.restaurant_id = p_restaurant_id
    and t.active
    and not t.blocked
    and t.capacity_min <= p_party_size
    and t.capacity_max >= p_party_size
    and (p_zone_id is null or t.zone_id = p_zone_id)
    and public.check_table_availability(t.id, p_starts_at, p_ends_at, null)
  order by t.capacity_max asc;
$$;

-- ============================================================================
-- 5. Asignación de mesa protegida contra condiciones de carrera: dos hosts
--    asignando la misma mesa al mismo tiempo. Corre con los permisos del
--    caller (RLS de `reservations_write` sigue aplicando tal cual), toma un
--    advisory lock por mesa+reserva para serializar intentos concurrentes, y
--    re-valida disponibilidad justo antes de escribir.
-- ============================================================================
create or replace function public.assign_reservation_table(
  p_reservation_id uuid,
  p_table_id uuid,
  p_source text default 'manual'
)
returns public.reservations
language plpgsql
as $$
declare
  v_reservation record;
  v_result public.reservations;
begin
  if p_source not in ('manual', 'suggested', 'automatic') then
    raise exception 'Origen de asignación inválido: %', p_source;
  end if;

  select id, starts_at, ends_at into v_reservation
  from public.reservations
  where id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'Reserva no encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  if not public.check_table_availability(p_table_id, v_reservation.starts_at, v_reservation.ends_at, p_reservation_id) then
    raise exception 'Esa mesa ya no está disponible para ese horario -- probá otra.';
  end if;

  update public.reservations
    set table_id = p_table_id,
        table_assignment_source = p_source
    where id = p_reservation_id
    returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.assign_reservation_table(uuid, uuid, text) to authenticated;
