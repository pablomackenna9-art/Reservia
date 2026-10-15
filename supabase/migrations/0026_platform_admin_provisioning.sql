-- Administración de plataforma: dar de alta clientes rápido.
--
--   * El registro público se cierra: las cuentas las crea el administrador de plataforma
--     desde el panel (admin_create_client / admin_add_owner), no cualquier visitante.
--   * Un restaurante nuevo nace configurado: se clona una plantilla (zonas, plano de mesas,
--     horarios y reglas) de otro restaurante, ya publicado con el nombre correcto.
--   * Cada dueño ve solo lo suyo: nada de esto cambia las reglas de acceso existentes
--     (is_member_of / has_role); el administrador de plataforma ya las atravesaba.
--
-- Todas las funciones admin_* verifican is_platform_admin() adentro: llamarlas sin serlo falla.

-- ============================================================================
-- 1. Verificación común
-- ============================================================================
create or replace function public._assert_platform_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Solo el administrador de plataforma puede hacer esto.';
  end if;
end;
$$;

revoke all on function public._assert_platform_admin() from public, anon, authenticated;

-- ============================================================================
-- 2. Cerrar el alta pública de usuarios
--    Solo se puede insertar en auth.users si la función interna lo habilitó en esa misma transacción.
-- ============================================================================
create or replace function public.block_public_signup()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('reservia.allow_user_creation', true), '') <> 'on' then
    raise exception 'El registro público está cerrado: pide tu acceso al equipo de Reservia.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_public_signup on auth.users;
create trigger block_public_signup
  before insert on auth.users
  for each row execute function public.block_public_signup();

-- ============================================================================
-- 3. Crear cuentas (interna)
-- ============================================================================
create or replace function public._create_auth_user(p_email text, p_password text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo "%" no es válido.', p_email;
  end if;

  -- Si la cuenta ya existe se reutiliza tal cual (no se le toca la clave).
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is not null then
    return v_id;
  end if;

  if length(coalesce(p_password, '')) < 10 then
    raise exception 'La clave debe tener al menos 10 caracteres.';
  end if;

  v_id := gen_random_uuid();
  perform set_config('reservia.allow_user_creation', 'on', true);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email_verified', true, 'full_name', coalesce(nullif(btrim(p_full_name), ''), split_part(v_email, '@', 1))),
    now(), now()
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  perform set_config('reservia.allow_user_creation', 'off', true);
  return v_id;
end;
$$;

revoke all on function public._create_auth_user(text, text, text) from public, anon, authenticated;

-- ============================================================================
-- 4. Clonar plantilla (interna): zonas, mesas, horarios y reglas de otro restaurante
-- ============================================================================
create or replace function public._clone_template(p_target uuid, p_source uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  z record;
  t record;
  h record;
  r record;
  v_new_zone uuid;
  v_zone_map jsonb := '{}'::jsonb;
  v_zones int := 0;
  v_tables int := 0;
  v_hours int := 0;
begin
  if p_target = p_source then
    raise exception 'La plantilla no puede ser el mismo restaurante.';
  end if;
  if not exists (select 1 from public.restaurants where id = p_source) then
    raise exception 'No existe el restaurante de plantilla.';
  end if;
  if exists (select 1 from public.zones where restaurant_id = p_target)
     or exists (select 1 from public.tables where restaurant_id = p_target) then
    raise exception 'Este restaurante ya tiene zonas o mesas: no se le puede aplicar una plantilla encima.';
  end if;

  for z in select * from public.zones where restaurant_id = p_source and active order by sort_order, created_at loop
    v_new_zone := gen_random_uuid();
    insert into public.zones
      select (jsonb_populate_record(null::public.zones,
        to_jsonb(z) || jsonb_build_object('id', v_new_zone, 'restaurant_id', p_target, 'created_at', now(), 'updated_at', now()))).*;
    v_zone_map := v_zone_map || jsonb_build_object(z.id::text, v_new_zone);
    v_zones := v_zones + 1;
  end loop;

  for t in select * from public.tables where restaurant_id = p_source and active loop
    if v_zone_map ? t.zone_id::text then
      insert into public.tables
        select (jsonb_populate_record(null::public.tables,
          to_jsonb(t) || jsonb_build_object(
            'id', gen_random_uuid(), 'restaurant_id', p_target, 'zone_id', v_zone_map ->> t.zone_id::text,
            'created_at', now(), 'updated_at', now()))).*;
      v_tables := v_tables + 1;
    end if;
  end loop;

  delete from public.restaurant_hours where restaurant_id = p_target;
  for h in select * from public.restaurant_hours where restaurant_id = p_source loop
    insert into public.restaurant_hours
      select (jsonb_populate_record(null::public.restaurant_hours,
        to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', p_target, 'created_at', now()))).*;
    v_hours := v_hours + 1;
  end loop;

  select * into r from public.reservation_rules where restaurant_id = p_source;
  if found then
    delete from public.reservation_rules where restaurant_id = p_target;
    insert into public.reservation_rules
      select (jsonb_populate_record(null::public.reservation_rules,
        to_jsonb(r) || jsonb_build_object('restaurant_id', p_target, 'updated_at', now()))).*;
  end if;

  return jsonb_build_object('zones', v_zones, 'tables', v_tables, 'hours', v_hours);
end;
$$;

revoke all on function public._clone_template(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- 5. Funciones del panel (administrador de plataforma)
-- ============================================================================

-- Alta de un cliente: restaurante + cuenta del dueño + plantilla + publicado, todo en un paso.
create or replace function public.admin_create_client(
  p_name text,
  p_slug text,
  p_owner_email text default null,
  p_owner_password text default null,
  p_owner_name text default null,
  p_template uuid default null,
  p_activate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid;
  v_owner_existed boolean := false;
  v_rest uuid;
  v_clone jsonb := null;
begin
  perform public._assert_platform_admin();

  if v_name = '' then raise exception 'El nombre del restaurante no puede quedar vacío.'; end if;
  if v_slug !~ '^[a-z0-9-]+$' then raise exception 'El nombre corto solo puede tener letras minúsculas, números y guiones.'; end if;
  if exists (select 1 from public.restaurants where slug = v_slug) then
    raise exception 'Ese nombre corto ya lo usa otro restaurante.';
  end if;

  if nullif(btrim(coalesce(p_owner_email, '')), '') is not null then
    v_owner_existed := exists (select 1 from auth.users where lower(email) = lower(btrim(p_owner_email)));
    v_owner := public._create_auth_user(p_owner_email, p_owner_password, p_owner_name);
  else
    v_owner := auth.uid();
  end if;

  -- created_by = dueño: el trigger on_restaurant_created lo deja como owner del restaurante.
  insert into public.restaurants (name, slug, status, created_by)
  values (v_name, v_slug, case when p_activate then 'active' else 'onboarding' end, v_owner)
  returning id into v_rest;

  if p_template is not null then
    v_clone := public._clone_template(v_rest, p_template);
  end if;

  return jsonb_build_object(
    'restaurant_id', v_rest,
    'slug', v_slug,
    'owner_email', nullif(lower(btrim(coalesce(p_owner_email, ''))), ''),
    'owner_created', nullif(btrim(coalesce(p_owner_email, '')), '') is not null and not v_owner_existed,
    'template', v_clone
  );
end;
$$;

-- Cargar una plantilla en un restaurante que todavía no tiene zonas ni mesas.
create or replace function public.admin_apply_template(p_restaurant uuid, p_template uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_platform_admin();
  return public._clone_template(p_restaurant, p_template);
end;
$$;

-- Dar acceso (como dueño) a un restaurante que ya existe; crea la cuenta si el correo es nuevo.
create or replace function public.admin_add_owner(p_restaurant uuid, p_email text, p_password text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existed boolean;
  v_user uuid;
begin
  perform public._assert_platform_admin();
  if not exists (select 1 from public.restaurants where id = p_restaurant) then
    raise exception 'No existe ese restaurante.';
  end if;

  v_existed := exists (select 1 from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))));
  v_user := public._create_auth_user(p_email, p_password, p_name);

  insert into public.restaurant_users (restaurant_id, user_id, role, status)
  values (p_restaurant, v_user, 'owner', 'active')
  on conflict (restaurant_id, user_id) do update set role = 'owner', status = 'active';

  return jsonb_build_object('email', lower(btrim(p_email)), 'created', not v_existed);
end;
$$;

-- Restablecer la clave de una cuenta (por si el cliente la pierde). Cierra sus sesiones abiertas.
create or replace function public.admin_set_user_password(p_email text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_id uuid;
begin
  perform public._assert_platform_admin();
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'La clave debe tener al menos 10 caracteres.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if v_id is null then
    raise exception 'No existe una cuenta con ese correo.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = v_id;
  delete from auth.sessions where user_id = v_id;
end;
$$;

-- Quién tiene acceso a un restaurante (correo y rol).
create or replace function public.admin_restaurant_owners(p_restaurant uuid)
returns table (email text, role text, status text, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public._assert_platform_admin();
  return query
    select u.email::text, ru.role::text, ru.status::text, u.last_sign_in_at
    from public.restaurant_users ru
    join auth.users u on u.id = ru.user_id
    where ru.restaurant_id = p_restaurant and ru.role in ('owner', 'administrator')
    order by ru.role, u.email;
end;
$$;

grant execute on function public.admin_create_client(text, text, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.admin_apply_template(uuid, uuid) to authenticated;
grant execute on function public.admin_add_owner(uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_user_password(text, text) to authenticated;
grant execute on function public.admin_restaurant_owners(uuid) to authenticated;
