-- Unir varias mesas para una reserva grande (ej. 9 personas con mesas libres de 2 + 4 + 4).
--
-- 1) La reserva guarda sus mesas extra en reservation_tables y recibe un NÚMERO de unión
--    (reservations.union_number: 1, 2, 3... por restaurante y por día) con el que se identifica
--    la mesa unida / su cuenta ("Unión 3"). El POS puede mandar "Unión 3" como mesa.
-- 2) check_table_availability ahora considera esas mesas extra: antes una reserva con mesas unidas
--    solo bloqueaba la primera, y las demás quedaban "libres" para reservarse otra vez.
-- 3) assign_reservation_tables asigna una o varias mesas de forma atómica y valida que estén libres.

alter table public.reservations add column if not exists union_number int;

create table if not exists public.reservation_tables (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  primary key (reservation_id, table_id)
);
create index if not exists reservation_tables_table_idx on public.reservation_tables (table_id);

alter table public.reservation_tables enable row level security;
create policy reservation_tables_select on public.reservation_tables
  for select using (public.is_member_of(restaurant_id));
create policy reservation_tables_write on public.reservation_tables
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']))
  with check (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

-- Si la reserva cambia de mesa principal por la vía simple, se desarma la unión.
create or replace function public.reservations_clear_union_on_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.table_id is distinct from new.table_id then
    new.union_number := null;
    delete from public.reservation_tables where reservation_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_clear_union on public.reservations;
create trigger reservations_clear_union
  before update of table_id on public.reservations
  for each row execute function public.reservations_clear_union_on_table_change();

-- Una mesa está ocupada si la reserva la tiene como principal O como mesa extra de una unión.
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
    where (
        r.table_id = p_table_id
        or exists (select 1 from public.reservation_tables rt where rt.reservation_id = r.id and rt.table_id = p_table_id)
      )
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

-- Asigna una o varias mesas a una reserva. La primera es la principal; con más de una se crea la
-- unión y se le da número. Devuelve el número de unión (null si es una sola mesa).
create or replace function public.assign_reservation_tables(p_reservation uuid, p_table_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.reservations;
  v_tz text;
  v_id uuid;
  v_name text;
  v_number int := null;
begin
  select * into v_res from public.reservations where id = p_reservation;
  if v_res.id is null then
    raise exception 'La reserva no existe.';
  end if;
  if not public.has_role(v_res.restaurant_id, array['owner', 'administrator', 'host', 'waiter']) then
    raise exception 'No tienes permiso para asignar mesas en este restaurante.';
  end if;
  if p_table_ids is null or coalesce(array_length(p_table_ids, 1), 0) = 0 then
    raise exception 'Elige al menos una mesa.';
  end if;
  if array_length(p_table_ids, 1) > 6 then
    raise exception 'No se pueden unir más de 6 mesas.';
  end if;
  if (select count(distinct x) from unnest(p_table_ids) x) <> array_length(p_table_ids, 1) then
    raise exception 'Hay una mesa repetida.';
  end if;

  foreach v_id in array p_table_ids loop
    v_name := null;
    select name into v_name from public.tables
      where id = v_id and restaurant_id = v_res.restaurant_id and active and not blocked;
    if v_name is null then
      raise exception 'Una de las mesas no existe o no se puede usar.';
    end if;
    if not public.check_table_availability(v_id, v_res.starts_at, v_res.ends_at, v_res.id) then
      raise exception 'La mesa % ya está ocupada a esa hora.', v_name;
    end if;
  end loop;

  delete from public.reservation_tables where reservation_id = p_reservation;
  update public.reservations set table_id = p_table_ids[1] where id = p_reservation and table_id is distinct from p_table_ids[1];

  if array_length(p_table_ids, 1) > 1 then
    insert into public.reservation_tables (reservation_id, table_id, restaurant_id)
    select p_reservation, x, v_res.restaurant_id from unnest(p_table_ids[2:array_length(p_table_ids, 1)]) x;

    select coalesce(timezone, 'America/Santiago') into v_tz from public.restaurants where id = v_res.restaurant_id;
    select coalesce(max(r.union_number), 0) + 1 into v_number
    from public.reservations r
    where r.restaurant_id = v_res.restaurant_id
      and r.id <> p_reservation
      and (r.starts_at at time zone v_tz)::date = (v_res.starts_at at time zone v_tz)::date;
    v_number := coalesce(v_res.union_number, v_number);
    update public.reservations set union_number = v_number where id = p_reservation;
  else
    update public.reservations set union_number = null where id = p_reservation;
  end if;

  return v_number;
end;
$$;

grant execute on function public.assign_reservation_tables(uuid, uuid[]) to authenticated;

-- POS: aceptar "Unión 3" como identificador de mesa (pos_ingest_one, versión de 0024 + este caso).
create or replace function public.pos_ingest_one(p_conn public.pos_connections, p_payload jsonb, p_test boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_restaurant uuid := p_conn.restaurant_id;
  v_check_ext text;
  v_label text;
  v_total numeric;
  v_subtotal numeric;
  v_taxes numeric;
  v_discounts numeric;
  v_status_raw text;
  v_paid_flag boolean;
  v_kind text;
  v_items jsonb;
  v_guests int;
  v_table_id uuid;
  v_table_name text;
  v_visit_id uuid;
  v_check_id uuid;
  v_warnings text[] := '{}';
  v_item jsonb;
  v_qty numeric;
  v_unit numeric;
  v_line numeric;
  v_name text;
  v_items_total numeric := 0;
  v_has_items boolean := false;
  v_res record;
  v_other_open uuid;
  v_opened timestamptz;
  v_method text;
  v_msg text;
  v_check_status text;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'El evento tiene que ser un objeto JSON, por ejemplo {"check_id": "1042", "table": "12", "total": 45900}.';
  end if;

  v_check_ext := nullif(btrim(coalesce(
    p_payload->>'check_id', p_payload->>'id', p_payload->>'check', p_payload->>'ticket',
    p_payload->>'order_id', p_payload->>'bill_id', p_payload->>'cuenta', p_payload->>'numero'
  )), '');
  if v_check_ext is null then
    raise exception 'Falta "check_id": el identificador de la cuenta en tu POS (por ejemplo "1042").';
  end if;

  v_label := nullif(btrim(coalesce(
    p_payload->>'table', p_payload->>'mesa', p_payload->>'table_name', p_payload->>'table_id', p_payload->>'table_number'
  )), '');

  v_total := public.pos_to_numeric(coalesce(p_payload->>'total', p_payload->>'amount', p_payload->>'monto', p_payload->>'importe'));
  v_subtotal := public.pos_to_numeric(coalesce(p_payload->>'subtotal', p_payload->>'neto'));
  v_taxes := public.pos_to_numeric(coalesce(p_payload->>'taxes', p_payload->>'tax', p_payload->>'iva'));
  v_discounts := public.pos_to_numeric(coalesce(p_payload->>'discounts', p_payload->>'discount', p_payload->>'descuento'));
  if p_payload ? 'total' and v_total is null and nullif(btrim(p_payload->>'total'), '') is not null then
    raise exception 'El "total" no es un número válido: %. Usa solo dígitos, por ejemplo 45900.', p_payload->>'total';
  end if;

  v_guests := case when public.pos_to_numeric(coalesce(p_payload->>'guests', p_payload->>'covers', p_payload->>'personas', p_payload->>'comensales')) >= 1
    then public.pos_to_numeric(coalesce(p_payload->>'guests', p_payload->>'covers', p_payload->>'personas', p_payload->>'comensales'))::int
    else null end;

  v_status_raw := lower(btrim(coalesce(p_payload->>'status', p_payload->>'estado', p_payload->>'event', p_payload->>'type', '')));
  v_paid_flag := lower(coalesce(p_payload->>'paid', '')) in ('true', 't', '1', 'yes', 'si', 'sí');
  v_kind := case
    when v_status_raw ~ '(cancel|void|anul|delete|elimin)' then 'cancelled'
    when v_paid_flag or v_status_raw ~ '(paid|pagad|pago|closed|cerrad|settle|complet)' then 'paid'
    when v_status_raw ~ '(bill|cuenta|paying|pidio|precuenta|pre_bill|print)' then 'bill'
    else 'open'
  end;
  v_check_status := case v_kind when 'paid' then 'paid' when 'cancelled' then 'cancelled' else 'open' end;

  v_items := coalesce(p_payload->'items', p_payload->'lines', p_payload->'products', p_payload->'productos', p_payload->'detalle');
  if v_items is not null and jsonb_typeof(v_items) = 'array' and jsonb_array_length(v_items) > 0 then
    v_has_items := true;
    for v_item in select * from jsonb_array_elements(v_items) loop
      v_qty := coalesce(public.pos_to_numeric(coalesce(v_item->>'quantity', v_item->>'qty', v_item->>'cantidad')), 1);
      v_unit := public.pos_to_numeric(coalesce(v_item->>'price', v_item->>'unit_price', v_item->>'precio'));
      v_line := coalesce(public.pos_to_numeric(coalesce(v_item->>'total', v_item->>'amount')), coalesce(v_unit, 0) * v_qty);
      v_items_total := v_items_total + v_line;
    end loop;
    if v_total is null then v_total := v_items_total; end if;
  end if;

  v_opened := null;
  begin
    v_opened := coalesce(p_payload->>'opened_at', p_payload->>'created_at', p_payload->>'fecha')::timestamptz;
  exception when others then
    v_opened := null;
  end;

  v_method := nullif(btrim(coalesce(p_payload->>'payment_method', p_payload->>'method', p_payload->>'metodo_pago')), '');

  -- Mesa: primero el mapeo explícito del panel, después el mismo nombre/número de mesa.
  if v_label is not null then
    select t.id, t.name into v_table_id, v_table_name
    from public.pos_table_mappings m
    join public.tables t on t.id = m.table_id
    where m.pos_connection_id = p_conn.id and lower(btrim(m.external_table_id)) = lower(v_label)
    limit 1;

    if v_table_id is null then
      select t.id, t.name into v_table_id, v_table_name
      from public.tables t
      where t.restaurant_id = v_restaurant and t.active and public.pos_table_key(t.name) = public.pos_table_key(v_label)
      order by t.name
      limit 1;
    end if;

    -- "Unión 3" / "U3": el número que lleva una reserva con varias mesas unidas apunta a su mesa principal.
    if v_table_id is null and v_label ~* '^\s*(u|uni[oó]n|mesa\s+unida)\s*[-#n°º.]*\s*\d+\s*$' then
      select r.table_id, t.name into v_table_id, v_table_name
      from public.reservations r
      join public.tables t on t.id = r.table_id
      where r.restaurant_id = v_restaurant
        and r.union_number = (regexp_replace(v_label, '\D', '', 'g'))::int
        and r.status in ('seated', 'arriving', 'confirmed')
        and (r.starts_at at time zone 'America/Santiago')::date = (now() at time zone 'America/Santiago')::date
      order by (r.status = 'seated') desc, r.starts_at desc
      limit 1;
    end if;

    if v_table_id is null then
      v_warnings := array_append(v_warnings,
        format('No encontramos la mesa "%s" en Reservia. Si tu POS la llama distinto, vincúlala en Integraciones.', v_label));
    end if;
  end if;

  v_msg := format('Cuenta %s%s%s · %s',
    v_check_ext,
    case when v_label is not null then ' · mesa ' || v_label else '' end,
    case when v_total is not null then ' · $' || replace(to_char(v_total, 'FM999,999,999'), ',', '.') else '' end,
    case v_kind when 'paid' then 'pagada' when 'bill' then 'cuenta pedida' when 'cancelled' then 'anulada' else 'abierta' end);

  if p_test then
    insert into public.pos_ingest_log (restaurant_id, ok, is_test, external_check_id, table_label, total, check_status, message, payload)
    values (v_restaurant, true, true, v_check_ext, v_label, v_total, v_kind, 'Evento de prueba recibido: la conexión funciona.', p_payload);
    return jsonb_build_object('ok', true, 'test', true, 'message', 'Evento de prueba recibido: la conexión funciona.');
  end if;

  -- Visita: la que ya está abierta en esa mesa, o la de la reserva sentada ahí.
  if v_table_id is not null then
    select id into v_visit_id from public.visits where table_id = v_table_id and ended_at is null limit 1;
    if v_visit_id is null then
      select r.id, r.customer_id, r.party_size, r.starts_at into v_res
      from public.reservations r
      where r.restaurant_id = v_restaurant and r.table_id = v_table_id and r.status = 'seated'
      order by r.starts_at desc
      limit 1;
      if v_res.id is not null then
        insert into public.visits (restaurant_id, table_id, reservation_id, customer_id, party_size, started_at, status)
        values (v_restaurant, v_table_id, v_res.id, v_res.customer_id, v_res.party_size, v_res.starts_at, 'seated')
        returning id into v_visit_id;
      else
        v_warnings := array_append(v_warnings,
          format('No hay nadie sentado en la mesa %s en Reservia: la cuenta se guardó pero sin asociarla a una reserva.', v_table_name));
      end if;
    end if;
  end if;

  -- Si ya había una cuenta manual abierta en esa visita: se descarta si estaba vacía; si tenía consumo, no se pisa.
  if v_visit_id is not null then
    select id into v_other_open
    from public.pos_checks
    where visit_id = v_visit_id and status = 'open'
      and not (pos_connection_id = p_conn.id and external_check_id = v_check_ext)
    limit 1;
    if v_other_open is not null then
      if not exists (select 1 from public.pos_check_items where check_id = v_other_open) then
        update public.pos_checks set status = 'cancelled', closed_at = now() where id = v_other_open;
      else
        v_visit_id := null;
        v_warnings := array_append(v_warnings,
          'La mesa ya tiene consumo cargado a mano en Reservia: la cuenta del POS se guardó aparte, sin mezclarla.');
      end if;
    end if;
  end if;

  insert into public.pos_checks (
    restaurant_id, pos_connection_id, visit_id, external_check_id, external_table_id,
    opened_at, closed_at, subtotal, taxes, discounts, total, paid_amount, guest_count, status
  ) values (
    v_restaurant, p_conn.id, v_visit_id, v_check_ext, v_label,
    coalesce(v_opened, now()),
    case when v_kind in ('paid', 'cancelled') then now() end,
    greatest(coalesce(v_subtotal, v_total, 0), 0), greatest(coalesce(v_taxes, 0), 0), greatest(coalesce(v_discounts, 0), 0),
    greatest(coalesce(v_total, 0), 0),
    case when v_kind = 'paid' then greatest(coalesce(v_total, 0), 0) else 0 end,
    v_guests, v_check_status
  )
  on conflict (pos_connection_id, external_check_id) where pos_connection_id is not null
  do update set
    visit_id = coalesce(excluded.visit_id, public.pos_checks.visit_id),
    external_table_id = coalesce(excluded.external_table_id, public.pos_checks.external_table_id),
    subtotal = case when v_subtotal is not null or v_total is not null then excluded.subtotal else public.pos_checks.subtotal end,
    taxes = case when v_taxes is not null then excluded.taxes else public.pos_checks.taxes end,
    discounts = case when v_discounts is not null then excluded.discounts else public.pos_checks.discounts end,
    total = case when v_total is not null then excluded.total else public.pos_checks.total end,
    paid_amount = case when v_kind = 'paid' then (case when v_total is not null then excluded.total else public.pos_checks.total end) else public.pos_checks.paid_amount end,
    guest_count = coalesce(excluded.guest_count, public.pos_checks.guest_count),
    status = excluded.status,
    closed_at = case when v_kind in ('paid', 'cancelled') then now() else null end
  returning id, visit_id into v_check_id, v_visit_id;

  if v_has_items then
    delete from public.pos_check_items where check_id = v_check_id;
    for v_item in select * from jsonb_array_elements(v_items) loop
      v_name := nullif(btrim(coalesce(v_item->>'name', v_item->>'description', v_item->>'producto', v_item->>'nombre')), '');
      v_qty := greatest(coalesce(public.pos_to_numeric(coalesce(v_item->>'quantity', v_item->>'qty', v_item->>'cantidad')), 1), 0.01);
      v_unit := greatest(coalesce(public.pos_to_numeric(coalesce(v_item->>'price', v_item->>'unit_price', v_item->>'precio')), 0), 0);
      v_line := greatest(coalesce(public.pos_to_numeric(coalesce(v_item->>'total', v_item->>'amount')), v_unit * v_qty), 0);
      insert into public.pos_check_items (restaurant_id, check_id, external_item_id, name, category, quantity, unit_price, total)
      values (v_restaurant, v_check_id, v_item->>'id', coalesce(v_name, 'Producto'), v_item->>'category', v_qty, v_unit, v_line);
    end loop;
  end if;

  if v_kind = 'paid' and coalesce(v_total, 0) > 0 then
    insert into public.pos_payments (restaurant_id, check_id, external_payment_id, amount, payment_method)
    values (v_restaurant, v_check_id, 'api-' || v_check_ext, v_total, v_method)
    on conflict (check_id, external_payment_id) where external_payment_id is not null do nothing;
  end if;

  if v_visit_id is not null and v_kind in ('bill', 'paid') then
    update public.visits set status = 'paying' where id = v_visit_id and ended_at is null;
  end if;

  update public.pos_connections
    set last_event_at = now(), last_synced_at = now(), last_error = null, status = 'connected'
    where id = p_conn.id;

  insert into public.pos_ingest_log (restaurant_id, ok, external_check_id, table_label, total, check_status, message, payload)
  values (v_restaurant, true, v_check_ext, v_label, v_total, v_kind,
          v_msg || case when array_length(v_warnings, 1) > 0 then ' — ' || array_to_string(v_warnings, ' ') else '' end,
          p_payload);

  return jsonb_build_object(
    'ok', true,
    'check_id', v_check_ext,
    'status', v_kind,
    'table', v_table_name,
    'table_matched', v_table_id is not null,
    'linked_to_reservation', v_visit_id is not null,
    'total', v_total,
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

revoke all on function public.pos_ingest_one(public.pos_connections, jsonb, boolean) from public, anon, authenticated;
