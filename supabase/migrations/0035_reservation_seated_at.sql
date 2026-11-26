-- ============================================================================
-- 0035 — Hora real en que se sentó el grupo.
--
-- El cronómetro de una mesa ocupada contaba desde la hora de la RESERVA: si el grupo llegaba 59 minutos antes,
-- mostraba "-59m" (cuenta regresiva). Ahora cuenta desde que se sentó de verdad (reservations.seated_at).
-- ============================================================================

alter table public.reservations add column if not exists seated_at timestamptz;

create or replace function public.reservations_stamp_seated_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'seated' and (tg_op = 'INSERT' or old.status is distinct from 'seated') then
    new.seated_at := coalesce(new.seated_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_stamp_seated_at on public.reservations;
create trigger reservations_stamp_seated_at
  before insert or update of status on public.reservations
  for each row execute function public.reservations_stamp_seated_at();

-- Las que ya están sentadas ahora: se sentaron como muy tarde a su hora de reserva (o ahora, si llegaron antes).
update public.reservations
   set seated_at = least(starts_at, now())
 where status = 'seated' and seated_at is null;

-- Las ya completadas: la mejor aproximación que hay es la hora de la reserva.
update public.reservations
   set seated_at = starts_at
 where status = 'completed' and seated_at is null;
