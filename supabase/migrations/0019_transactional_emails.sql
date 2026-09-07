-- Correos transaccionales reales (confirmación, cancelación, "recibimos tu
-- solicitud", aviso de lista de espera) -- hasta ahora el portal público y
-- otras pantallas prometían "te avisamos por correo" sin que nada lo mandara.
--
-- Se llama a Resend directo desde Postgres vía pg_net, disparado por
-- triggers -- no hay infraestructura de Edge Functions lista todavía
-- (sin _shared/, sin import map, sin proyecto linkeado), así que evitamos
-- ese setup completo para esto.
--
-- La API key vive en Vault, no en el código ni en una columna. Para activar
-- el envío real, correr una sola vez (con la key real de Resend):
--   select vault.create_secret('re_xxxxxxxxxxxx', 'resend_api_key');
-- Sin key configurada, send_transactional_email no rompe nada -- solo no
-- manda el correo (raise notice para que quede en los logs).
--
-- Remitente sandbox (onboarding@resend.dev) hasta que se verifique un
-- dominio propio en Resend -- ese día, cambiar el 'from' acá abajo es lo
-- único que hace falta tocar.

create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function public.send_transactional_email(p_to text, p_subject text, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key text;
begin
  if p_to is null or p_to = '' then
    return;
  end if;

  select decrypted_secret into v_api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if v_api_key is null then
    raise notice 'send_transactional_email: falta configurar resend_api_key en Vault, no se mandó "%"', p_subject;
    return;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_api_key),
    body := jsonb_build_object(
      'from', 'Reservia <onboarding@resend.dev>',
      'to', jsonb_build_array(p_to),
      'subject', p_subject,
      'html', p_html
    )
  );
end;
$$;

-- --- Reservas: confirmación / cancelación ------------------------------

create or replace function public.notify_reservation_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
begin
  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name into v_restaurant from public.restaurants where id = new.restaurant_id;

  if new.status = 'confirmed' then
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva está confirmada',
      format(
        '<p>Hola %s,</p><p>Tu reserva en <strong>%s</strong> para el %s a las %s (%s personas) está confirmada.</p><p>¡Te esperamos!</p>',
        v_customer.first_name, v_restaurant.name,
        to_char(new.starts_at, 'DD/MM/YYYY'), to_char(new.starts_at, 'HH24:MI'), new.party_size
      )
    );
  elsif new.status = 'cancelled' then
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva fue cancelada',
      format(
        '<p>Hola %s,</p><p>Tu reserva en <strong>%s</strong> para el %s a las %s fue cancelada. Si fue un error, contactá directamente al restaurante.</p>',
        v_customer.first_name, v_restaurant.name,
        to_char(new.starts_at, 'DD/MM/YYYY'), to_char(new.starts_at, 'HH24:MI')
      )
    );
  end if;
  return new;
end;
$$;

create trigger reservations_status_email
  after update of status on public.reservations
  for each row
  when (new.status is distinct from old.status and new.status in ('confirmed', 'cancelled'))
  execute function public.notify_reservation_status_email();

-- --- Reservas: "recibimos tu solicitud" (solo portal público) ----------

create or replace function public.notify_reservation_created_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
begin
  if new.source <> 'public_portal' then
    return new;
  end if;

  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name into v_restaurant from public.restaurants where id = new.restaurant_id;

  perform public.send_transactional_email(
    v_customer.email,
    v_restaurant.name || ': recibimos tu solicitud de reserva',
    format(
      '<p>Hola %s,</p><p>Recibimos tu solicitud de reserva en <strong>%s</strong> para el %s a las %s (%s personas). El restaurante todavía tiene que confirmarla -- te avisamos apenas haya novedades.</p>',
      v_customer.first_name, v_restaurant.name,
      to_char(new.starts_at, 'DD/MM/YYYY'), to_char(new.starts_at, 'HH24:MI'), new.party_size
    )
  );
  return new;
end;
$$;

create trigger reservations_created_email
  after insert on public.reservations
  for each row
  execute function public.notify_reservation_created_email();

-- --- Lista de espera: "se liberó una mesa" -----------------------------

create or replace function public.notify_waitlist_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
begin
  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name into v_restaurant from public.restaurants where id = new.restaurant_id;

  perform public.send_transactional_email(
    v_customer.email,
    v_restaurant.name || ': se liberó una mesa para vos',
    format(
      '<p>Hola %s,</p><p>Buenas noticias -- se liberó una mesa para %s personas en <strong>%s</strong>. Acercate cuando puedas.</p>',
      v_customer.first_name, new.party_size, v_restaurant.name
    )
  );
  return new;
end;
$$;

create trigger waitlist_notified_email
  after update of status on public.waitlist_entries
  for each row
  when (new.status = 'notified' and old.status is distinct from new.status)
  execute function public.notify_waitlist_status_email();
