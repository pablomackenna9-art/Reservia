-- Fix: check_table_availability usaba un INNER JOIN contra reservation_rules.
-- Si el restaurante todavía no tiene una fila en reservation_rules (nadie
-- construyó esa pantalla de configuración todavía — Fase 2-3 del roadmap),
-- el join no devolvía ninguna fila y el NOT EXISTS quedaba siempre en true:
-- toda mesa se veía "disponible" sin importar los solapes reales.

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
    left join public.reservation_rules rr on rr.restaurant_id = r.restaurant_id
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
