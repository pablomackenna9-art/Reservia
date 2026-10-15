-- Página pública de reservas: foto de portada, turnos de reserva cada 15 min
-- (el "cierra" de un turno es la ÚLTIMA hora reservable, inclusive) y grupos
-- de hasta 10 personas (más que eso: contactar al restaurante).

-- 1. Foto de portada del restaurante. Se guarda en el mismo bucket público
--    que el logo ("{restaurant_id}/cover.<ext>"), así que las políticas de
--    0018 ya cubren la escritura.
alter table public.restaurants add column if not exists cover_url text;

-- 2. Máximo de personas por reserva online: 10 (default y restaurantes existentes).
alter table public.reservation_rules alter column max_party_size set default 10;
update public.reservation_rules set max_party_size = 10 where max_party_size > 10;

-- 3. Turnos: almuerzo 13:00–15:00 y cena 19:00–21:00 (primera y última reserva).
update public.restaurant_hours set opens_at = '13:00', closes_at = '15:00' where service_name = 'Almuerzo';
update public.restaurant_hours set opens_at = '19:00', closes_at = '21:00' where service_name = 'Cena';

-- 4. Disponibilidad del mes con la misma regla que el portal: franjas cada
--    15 minutos desde "abre" hasta "cierra" inclusive (la reserva puede durar
--    más allá del cierre del turno).
create or replace function public.get_month_availability(
  p_restaurant_slug text,
  p_party_size int,
  p_year int,
  p_month int
)
returns table (day date, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_rules record;
  v_tz text;
  v_duration interval;
  v_day date;
  v_last_day date;
  v_dow int;
  v_service record;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_service_end timestamptz;
  v_has_service boolean;
  v_has_slot boolean;
  v_min_ts timestamptz;
  v_max_ts timestamptz;
begin
  select id, coalesce(timezone, 'America/Santiago') as tz into v_restaurant
  from public.restaurants r where r.slug = p_restaurant_slug and r.status = 'active';
  if v_restaurant.id is null then
    return;
  end if;
  v_tz := v_restaurant.tz;

  select * into v_rules from public.reservation_rules where restaurant_id = v_restaurant.id;
  v_duration := make_interval(mins => coalesce(v_rules.default_duration_minutes, 90));
  v_min_ts := now() + make_interval(hours => coalesce(v_rules.min_advance_hours, 1));
  v_max_ts := now() + make_interval(days => coalesce(v_rules.max_advance_days, 60));

  v_day := make_date(p_year, p_month, 1);
  v_last_day := (v_day + interval '1 month' - interval '1 day')::date;

  while v_day <= v_last_day loop
    v_dow := extract(dow from v_day);
    v_has_service := false;
    v_has_slot := false;

    for v_service in
      select opens_at, closes_at from public.restaurant_hours
      where restaurant_id = v_restaurant.id and day_of_week = v_dow
    loop
      v_has_service := true;
      exit when v_has_slot;

      v_slot_start := (v_day::timestamp + v_service.opens_at) at time zone v_tz;
      v_service_end := (v_day::timestamp + v_service.closes_at) at time zone v_tz;

      while v_slot_start <= v_service_end loop
        v_slot_end := v_slot_start + v_duration;
        if v_slot_start >= v_min_ts and v_slot_start <= v_max_ts then
          if exists (
            select 1 from public.list_available_tables(v_restaurant.id, p_party_size, v_slot_start, v_slot_end, null)
          ) then
            v_has_slot := true;
            exit;
          end if;
        end if;
        v_slot_start := v_slot_start + interval '15 minutes';
      end loop;
    end loop;

    day := v_day;
    status := case when not v_has_service then 'closed' when v_has_slot then 'available' else 'waitlist' end;
    return next;

    v_day := v_day + interval '1 day';
  end loop;

  return;
end;
$$;

grant execute on function public.get_month_availability(text, int, int, int) to anon;
