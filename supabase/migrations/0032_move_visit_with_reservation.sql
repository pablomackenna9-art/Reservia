-- Al cambiar una reserva de mesa, TODO lo que ya se consumió viaja con ella: la visita abierta (y con ella
-- la cuenta del POS y sus productos, que cuelgan de la visita) pasa a la mesa nueva. Antes la reserva se
-- movía pero la visita se quedaba en la mesa vieja, que seguía apareciendo ocupada / "pagando".

create or replace function public.move_open_visit_with_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.table_id is not null and old.table_id is distinct from new.table_id then
    begin
      update public.visits
        set table_id = new.table_id
        where reservation_id = new.id and ended_at is null;
    exception when unique_violation then
      raise exception 'Esa mesa ya tiene una visita abierta (hay alguien sentado). Elige otra mesa.';
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_move_visit on public.reservations;
create trigger reservations_move_visit
  after update of table_id on public.reservations
  for each row execute function public.move_open_visit_with_reservation();
