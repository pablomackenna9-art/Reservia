-- Corrección de 0023: un evento que no trae mesa ("pidió la cuenta", "pagada") sobre una
-- cuenta ya vinculada no marcaba la visita como "pagando" porque solo miraba la mesa del
-- evento. Ahora usa la visita efectiva de la cuenta tras el upsert.

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
