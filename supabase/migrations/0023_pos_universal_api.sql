-- API universal de POS: cualquier sistema (POS, ERP, Make/Zapier/n8n, un script)
-- puede mandar cuentas a Reservia con una clave por restaurante y un JSON mínimo.
--
-- Diseño:
--   * La clave se genera acá y SOLO se guarda su hash (sha256) -- el texto de la
--     clave se muestra una vez, al generarla. Sin clave en texto plano en la base.
--   * `pos_ingest` es el único punto de entrada público (grant a anon): sin una
--     clave válida no hace nada. Toda la lógica vive en la base, así que no hace
--     falta ninguna clave de servicio en el servidor web.
--   * El payload es deliberadamente tolerante: solo `check_id` es obligatorio;
--     el resto (mesa, total, items, estado) se acepta con varios nombres de campo.
--   * Cada evento queda en `pos_ingest_log` para poder depurar la conexión desde
--     el panel ("llegó / no llegó / no encontramos la mesa").
-- Todo aditivo: un restaurante sin clave generada no cambia en nada.

-- ============================================================================
-- 1. Proveedor 'api' + columnas de la clave
-- ============================================================================
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.pos_connections'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%provider%';
  if c is not null then
    execute format('alter table public.pos_connections drop constraint %I', c);
  end if;
end $$;

alter table public.pos_connections
  add constraint pos_connections_provider_check
  check (provider in ('mock', 'oracle_simphony', 'lightspeed', 'icg', 'api'));

alter table public.pos_connections
  add column if not exists api_key_hash text,
  add column if not exists api_key_prefix text,
  add column if not exists last_event_at timestamptz;

create unique index if not exists pos_connections_api_key_hash_idx
  on public.pos_connections (api_key_hash)
  where api_key_hash is not null;

-- ============================================================================
-- 2. Registro de eventos recibidos
-- ============================================================================
create table public.pos_ingest_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  received_at timestamptz not null default now(),
  ok boolean not null,
  is_test boolean not null default false,
  external_check_id text,
  table_label text,
  total numeric(12, 2),
  check_status text,
  message text,
  payload jsonb
);

create index pos_ingest_log_restaurant_idx on public.pos_ingest_log (restaurant_id, received_at desc);

alter table public.pos_ingest_log enable row level security;

create policy pos_ingest_log_select on public.pos_ingest_log
  for select using (public.has_role(restaurant_id, array['owner', 'administrator']));
-- Sin policies de escritura: solo las funciones security definer de abajo escriben.

-- ============================================================================
-- 3. Helpers de normalización
-- ============================================================================

-- "45900", 45900, "$45.900", "45.900,50" -> numeric; basura -> null.
create or replace function public.pos_to_numeric(p text)
returns numeric
language plpgsql
immutable
as $$
declare
  s text;
begin
  if p is null then return null; end if;
  s := btrim(replace(replace(p, '$', ''), ' ', ''));
  if s = '' then return null; end if;
  if s ~ '^\d{1,3}(\.\d{3})+(,\d+)?$' then
    s := replace(replace(s, '.', ''), ',', '.');
  elsif s ~ '^\d+,\d+$' then
    s := replace(s, ',', '.');
  end if;
  if s !~ '^-?\d+(\.\d+)?$' then return null; end if;
  return s::numeric;
exception when others then
  return null;
end;
$$;

-- "Mesa 12", "mesa  12", "#12", "N°12" -> "12". Letras pegadas ("M12") se dejan: se comparan igual en ambos lados.
create or replace function public.pos_table_key(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(lower(btrim(coalesce(p, ''))), '^(mesa|table|tabla|n[°º]?|#)\s*', ''));
$$;

-- ============================================================================
-- 4. Ingesta de UN evento (interna: no se otorga a anon)
-- ============================================================================
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
  returning id into v_check_id;

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

-- ============================================================================
-- 5. Punto de entrada público
-- ============================================================================
create or replace function public.pos_ingest(p_api_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_conn public.pos_connections;
  v_status text;
  v_event jsonb;
  v_events jsonb;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_all_ok boolean := true;
begin
  if p_api_key is null or length(btrim(p_api_key)) < 12 then
    return jsonb_build_object('ok', false, 'error', 'invalid_api_key', 'message', 'Falta la clave de conexión o no es válida.');
  end if;

  v_hash := encode(extensions.digest(btrim(p_api_key), 'sha256'), 'hex');
  select * into v_conn from public.pos_connections where api_key_hash = v_hash and provider = 'api';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_api_key', 'message', 'La clave de conexión no es válida o fue regenerada.');
  end if;

  select status into v_status from public.restaurants where id = v_conn.restaurant_id;
  if v_status = 'suspended' then
    return jsonb_build_object('ok', false, 'error', 'suspended', 'message', 'Este restaurante está suspendido.');
  end if;

  begin
    perform public.check_rate_limit('pos:' || v_conn.id::text, 1200, 1);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'message', 'Demasiados eventos por minuto: baja el ritmo e intenta de nuevo.');
  end;

  -- Un objeto, un arreglo de objetos, o {"events": [...]}
  if jsonb_typeof(p_payload) = 'array' then
    v_events := p_payload;
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'events') = 'array' then
    v_events := p_payload->'events';
  else
    v_events := jsonb_build_array(p_payload);
  end if;

  if jsonb_array_length(v_events) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_many_events', 'message', 'Máximo 200 eventos por llamada.');
  end if;

  for v_event in select * from jsonb_array_elements(v_events) loop
    begin
      v_one := public.pos_ingest_one(v_conn, v_event, false);
    exception when others then
      v_one := jsonb_build_object('ok', false, 'error', 'invalid_event', 'message', sqlerrm);
      v_all_ok := false;
      insert into public.pos_ingest_log (restaurant_id, ok, message, payload)
      values (v_conn.restaurant_id, false, sqlerrm, jsonb_build_object('raw', left(v_event::text, 2000)));
      update public.pos_connections set last_error = left(sqlerrm, 300) where id = v_conn.id;
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  -- Auto-limpieza: el registro no crece sin límite.
  delete from public.pos_ingest_log where restaurant_id = v_conn.restaurant_id and received_at < now() - interval '30 days';

  if jsonb_array_length(v_results) = 1 then
    return v_results->0;
  end if;
  return jsonb_build_object('ok', v_all_ok, 'results', v_results);
end;
$$;

grant execute on function public.pos_ingest(text, jsonb) to anon, authenticated;

-- ============================================================================
-- 6. Gestión de la clave desde el panel (owner / administrator)
-- ============================================================================
create or replace function public.pos_api_generate_key(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_conn uuid;
begin
  if not public.has_role(p_restaurant_id, array['owner', 'administrator']) then
    raise exception 'No tienes permiso para conectar el POS de este restaurante.';
  end if;

  v_key := 'rsv_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.pos_connections (restaurant_id, provider, status, api_key_hash, api_key_prefix, created_by)
  values (p_restaurant_id, 'api', 'disconnected', encode(extensions.digest(v_key, 'sha256'), 'hex'), left(v_key, 8), auth.uid())
  on conflict (restaurant_id, provider) do update set
    api_key_hash = excluded.api_key_hash,
    api_key_prefix = excluded.api_key_prefix,
    updated_at = now()
  returning id into v_conn;

  return jsonb_build_object('api_key', v_key, 'prefix', left(v_key, 8), 'connection_id', v_conn);
end;
$$;

create or replace function public.pos_api_revoke_key(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_restaurant_id, array['owner', 'administrator']) then
    raise exception 'No tienes permiso para desconectar el POS de este restaurante.';
  end if;
  update public.pos_connections
    set api_key_hash = null, api_key_prefix = null, status = 'disconnected'
    where restaurant_id = p_restaurant_id and provider = 'api';
end;
$$;

-- "Probar conexión": registra un evento de prueba en el log sin tocar cuentas ni mesas.
create or replace function public.pos_api_send_test(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.pos_connections;
  v_table text;
begin
  if not public.has_role(p_restaurant_id, array['owner', 'administrator']) then
    raise exception 'No tienes permiso para probar la conexión de este restaurante.';
  end if;
  select * into v_conn from public.pos_connections where restaurant_id = p_restaurant_id and provider = 'api';
  if not found then
    raise exception 'Primero genera una clave de conexión.';
  end if;
  select name into v_table from public.tables where restaurant_id = p_restaurant_id and active order by name limit 1;
  return public.pos_ingest_one(
    v_conn,
    jsonb_build_object('check_id', 'PRUEBA', 'table', coalesce(v_table, '1'), 'total', 1000),
    true
  );
end;
$$;

grant execute on function public.pos_api_generate_key(uuid) to authenticated;
grant execute on function public.pos_api_revoke_key(uuid) to authenticated;
grant execute on function public.pos_api_send_test(uuid) to authenticated;
