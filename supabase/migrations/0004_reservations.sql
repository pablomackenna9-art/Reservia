-- Fase 3: reservas + motor de disponibilidad mínimo.
--
-- Alcance de esta migración: CRUD de reservas para el staff (Centro de
-- Control) con detección de solape real. El generador de horarios para el
-- portal público (Fase 3, segunda mitad) se agrega en una migración aparte
-- una vez que ese flujo esté en construcción — no tiene sentido diseñarlo
-- a ciegas antes de tener la UI que lo va a consumir.

-- ============================================================================
-- 1. RESERVATIONS
-- ============================================================================
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  table_id uuid references public.tables(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  party_size int not null check (party_size > 0),
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'arriving', 'seated', 'completed', 'cancelled', 'no_show')
  ),
  source text not null default 'admin' check (source in ('admin', 'public_portal', 'phone', 'walk_in')),
  notes text,
  internal_notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El motor de disponibilidad filtra por restaurante+fecha constantemente;
-- el índice en table_id además sostiene la detección de solape por mesa.
create index reservations_restaurant_starts_idx on public.reservations (restaurant_id, starts_at);
create index reservations_table_idx on public.reservations (table_id, starts_at) where table_id is not null;
create index reservations_customer_idx on public.reservations (customer_id);

alter table public.reservations enable row level security;

create policy reservations_select on public.reservations
  for select using (public.is_member_of(restaurant_id));

create policy reservations_write on public.reservations
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. Contadores del cliente — se mantienen por trigger, no en el cliente.
-- ============================================================================
create or replace function public.handle_reservation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    update public.customers
      set total_visits = total_visits + 1, last_visit_at = new.ends_at
      where id = new.customer_id;
  elsif new.status = 'no_show' and (old.status is distinct from 'no_show') then
    update public.customers set no_show_count = no_show_count + 1 where id = new.customer_id;
  elsif new.status = 'cancelled' and (old.status is distinct from 'cancelled') then
    update public.customers set cancellation_count = cancellation_count + 1 where id = new.customer_id;
  end if;
  return new;
end;
$$;

create trigger reservations_status_change
  after update of status on public.reservations
  for each row execute function public.handle_reservation_status_change();

-- ============================================================================
-- 3. Motor de disponibilidad — funciones compartidas por admin y portal
--    público, para que nunca diverjan en qué significa "disponible".
-- ============================================================================

-- ¿Esta mesa está libre en [p_starts_at, p_ends_at)? Aplica el buffer entre
-- reservas consecutivas y opcionalmente ignora una reserva (para permitir
-- editar la reserva propia sin que se rechace a sí misma).
create or replace function public.check_table_availability(
  p_table_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_reservation_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.reservations r
    join public.reservation_rules rr on rr.restaurant_id = r.restaurant_id
    where r.table_id = p_table_id
      and r.status not in ('cancelled', 'no_show')
      and (p_exclude_reservation_id is null or r.id <> p_exclude_reservation_id)
      and (
        p_starts_at, p_ends_at
      ) overlaps (
        r.starts_at - make_interval(mins => coalesce(rr.buffer_minutes, 15)),
        r.ends_at + make_interval(mins => coalesce(rr.buffer_minutes, 15))
      )
  );
$$;

grant execute on function public.check_table_availability(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- Mesas activas con capacidad suficiente y libres en ese rango — lo que
-- alimenta el selector de mesa del formulario "nueva reserva".
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
    and t.capacity_min <= p_party_size
    and t.capacity_max >= p_party_size
    and (p_zone_id is null or t.zone_id = p_zone_id)
    and public.check_table_availability(t.id, p_starts_at, p_ends_at, null)
  order by t.capacity_max asc;
$$;

grant execute on function public.list_available_tables(uuid, int, timestamptz, timestamptz, uuid) to authenticated;
