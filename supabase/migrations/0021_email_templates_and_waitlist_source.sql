-- Reemplaza los correos de texto plano por una plantilla con la misma
-- identidad visual del portal (tarjeta oscura, badge de estado, tabla de
-- detalles) -- el usuario mostró una referencia de otra plataforma con ese
-- formato y pidió algo parecido, con los colores propios de Reservia (no
-- se copia marca ajena, solo el patrón de layout).
--
-- De paso corrige un bug real: los triggers de 0019 formateaban starts_at
-- con to_char() directo, que usa el TimeZone de la sesión de Postgres (UTC
-- en este proyecto) en vez de la zona horaria del restaurante -- una
-- reserva de las 22:00 en Chile podía salir como otra hora (u otro día)
-- en el correo. Ahora todo pasa por `starts_at at time zone
-- restaurants.timezone` antes de formatear.
--
-- También corrige que to_char(...,'FMDay ... FMMonth') depende del lc_time
-- de la sesión (en_US acá), o sea salía "Tuesday 08 de September" --
-- nombres de día/mes ahora salen de spanish_date_label(), no de to_char.
--
-- Aprovecha para agregar el correo que faltaba: "te anotamos en la lista de
-- espera" al crear la entrada (antes solo existía el de "se liberó una
-- mesa"), y una columna `source` en waitlist_entries para saber si una
-- entrada vino de un walk-in, del portal público, o de una reserva que no
-- consiguió mesa -- la necesita también la vista de ocupación en vivo.

alter table public.waitlist_entries
  add column source text not null default 'walk_in' check (source in ('walk_in', 'public_portal', 'reservation'));

-- --- Plantilla compartida ------------------------------------------------

/** Recibe un timestamp YA convertido a la zona del restaurante (`ts at time zone tz`, sin tz propio) -- no vuelve a convertir nada. */
create or replace function public.spanish_date_label(p_local_ts timestamp)
returns text
language sql
immutable
as $$
  select
    (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from p_local_ts)::int + 1]
    || ' ' || extract(day from p_local_ts)::int || ' de ' ||
    (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from p_local_ts)::int];
$$;

create or replace function public.email_detail_row(p_label text, p_value text)
returns text
language sql
immutable
as $$
  select format(
    '<tr><td style="padding:10px 0;color:#8a7f6d;font-size:13px;border-bottom:1px solid #2a251e;">%s</td><td style="padding:10px 0;color:#f3eee4;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #2a251e;">%s</td></tr>',
    p_label, p_value
  );
$$;

/** `p_rows_html` es una concatenación de email_detail_row(...) -- una fila por dato a mostrar. */
create or replace function public.email_shell(
  p_badge_label text,
  p_badge_color text,
  p_heading text,
  p_body_html text,
  p_rows_html text
)
returns text
language plpgsql
immutable
as $$
begin
  return format(
    '<div style="background:#141210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">' ||
    '<div style="max-width:480px;margin:0 auto;background:#1c1916;border:1px solid #39332b;border-radius:16px;padding:28px;">' ||
    '<span style="display:inline-block;background:%1$s26;color:%1$s;border:1px solid %1$s66;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">%2$s</span>' ||
    '<h1 style="color:#f3eee4;font-size:22px;margin:16px 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">%3$s</h1>' ||
    '<p style="color:#b7ac9a;font-size:14px;line-height:1.5;margin:0 0 20px;">%4$s</p>' ||
    '<table style="width:100%%;border-collapse:collapse;background:#141210;border:1px solid #39332b;border-radius:10px;padding:0 16px;"><tbody>%5$s</tbody></table>' ||
    '</div></div>',
    p_badge_color, p_badge_label, p_heading, p_body_html, p_rows_html
  );
end;
$$;

-- --- Reservas: confirmación / cancelación / solicitud recibida ---------

create or replace function public.notify_reservation_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
  v_local_ts timestamp;
  v_rows text;
begin
  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name, timezone into v_restaurant from public.restaurants where id = new.restaurant_id;
  v_local_ts := new.starts_at at time zone coalesce(v_restaurant.timezone, 'America/Santiago');

  v_rows :=
    public.email_detail_row('A nombre de', v_customer.first_name) ||
    public.email_detail_row('Restaurante', v_restaurant.name) ||
    public.email_detail_row('Fecha', public.spanish_date_label(v_local_ts)) ||
    public.email_detail_row('Hora', to_char(v_local_ts, 'HH24:MI')) ||
    public.email_detail_row('Personas', new.party_size::text);

  if new.status = 'confirmed' then
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva está confirmada',
      public.email_shell(
        'Confirmada', '#4cae83',
        '¡Tu reserva está confirmada!',
        format('Hola %s, te esperamos.', v_customer.first_name),
        v_rows
      )
    );
  elsif new.status = 'cancelled' then
    perform public.send_transactional_email(
      v_customer.email,
      v_restaurant.name || ': tu reserva fue cancelada',
      public.email_shell(
        'Cancelada', '#dd7c68',
        'Tu reserva fue cancelada',
        format('Hola %s. Si fue un error, contactá directamente al restaurante.', v_customer.first_name),
        v_rows
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_reservation_created_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_restaurant record;
  v_local_ts timestamp;
begin
  if new.source <> 'public_portal' then
    return new;
  end if;

  select first_name, email into v_customer from public.customers where id = new.customer_id;
  select name, timezone into v_restaurant from public.restaurants where id = new.restaurant_id;
  v_local_ts := new.starts_at at time zone coalesce(v_restaurant.timezone, 'America/Santiago');

  perform public.send_transactional_email(
    v_customer.email,
    v_restaurant.name || ': recibimos tu solicitud de reserva',
    public.email_shell(
      'Solicitud recibida', '#e0ac4e',
      'Recibimos tu solicitud',
      format(
        'Hola %s. El restaurante todavía tiene que confirmarla -- te avisamos apenas haya novedades. Hasta entonces, la mesa no está reservada.',
        v_customer.first_name
      ),
      public.email_detail_row('A nombre de', v_customer.first_name) ||
      public.email_detail_row('Restaurante', v_restaurant.name) ||
      public.email_detail_row('Fecha', public.spanish_date_label(v_local_ts)) ||
      public.email_detail_row('Hora', to_char(v_local_ts, 'HH24:MI')) ||
      public.email_detail_row('Personas', new.party_size::text)
    )
  );
  return new;
end;
$$;

-- --- Lista de espera: "te anotamos" / "se liberó una mesa" -------------

create or replace function public.notify_waitlist_created_email()
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
    v_restaurant.name || ': te avisaremos si aparece una mesa',
    public.email_shell(
      'En espera', '#e0ac4e',
      'Te avisaremos si aparece una mesa',
      format(
        'Hola %s. Aún no podemos confirmar una mesa para ese horario. Tu solicitud quedó en lista de espera. No necesitás hacer nada -- si aparece disponibilidad, te enviamos una confirmación. Hasta entonces, la mesa no está reservada.',
        v_customer.first_name
      ),
      public.email_detail_row('A nombre de', v_customer.first_name) ||
      public.email_detail_row('Restaurante', v_restaurant.name) ||
      public.email_detail_row('Personas', new.party_size::text)
    )
  );
  return new;
end;
$$;

create trigger waitlist_created_email
  after insert on public.waitlist_entries
  for each row
  execute function public.notify_waitlist_created_email();

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
    public.email_shell(
      'Mesa lista', '#4cae83',
      '¡Se liberó una mesa para vos!',
      format('Hola %s. Acercate cuando puedas.', v_customer.first_name),
      public.email_detail_row('A nombre de', v_customer.first_name) ||
      public.email_detail_row('Restaurante', v_restaurant.name) ||
      public.email_detail_row('Personas', new.party_size::text)
    )
  );
  return new;
end;
$$;
