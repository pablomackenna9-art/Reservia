-- "Ping": permite probar la URL + clave de la API de POS (por ejemplo abriendo el link en el
-- navegador) sin mandar ninguna cuenta. Verifica la clave y deja una señal en el registro
-- para que el panel muestre "llegó algo" al instante.

create or replace function public.pos_ping(p_api_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conn public.pos_connections;
  v_name text;
begin
  if p_api_key is null or length(btrim(p_api_key)) < 12 then
    return jsonb_build_object('ok', false, 'error', 'invalid_api_key', 'message', 'Falta la clave de conexión o no es válida.');
  end if;

  select * into v_conn
  from public.pos_connections
  where api_key_hash = encode(extensions.digest(btrim(p_api_key), 'sha256'), 'hex') and provider = 'api';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_api_key', 'message', 'La clave de conexión no es válida o fue regenerada.');
  end if;

  begin
    perform public.check_rate_limit('pos:' || v_conn.id::text, 1200, 1);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'message', 'Demasiados eventos por minuto.');
  end;

  select name into v_name from public.restaurants where id = v_conn.restaurant_id;

  update public.pos_connections set last_event_at = now() where id = v_conn.id;
  insert into public.pos_ingest_log (restaurant_id, ok, is_test, message)
  values (v_conn.restaurant_id, true, true, 'Ping recibido: la URL y la clave funcionan.');

  return jsonb_build_object(
    'ok', true,
    'restaurant', v_name,
    'message', 'Conexión lista. Ahora manda cada cuenta con POST: {"check_id": "1042", "table": "12", "total": 45900}.'
  );
end;
$$;

grant execute on function public.pos_ping(text) to anon, authenticated;
