-- Gestión de equipo: invitar/agregar staff a un restaurante por email.
--
-- restaurant_users.user_id exige que la persona ya tenga una cuenta (FK a
-- auth.users), así que agregar a alguien que TODAVÍA no se registró no puede
-- ser un insert directo. Esta migración cubre los dos casos con una sola
-- función: si el email ya tiene cuenta, se agrega de inmediato; si no, queda
-- una invitación pendiente que se resuelve sola cuando esa persona se
-- registra con ese mismo email (no hay envío de mail real -- Reservia no
-- tiene un proveedor de correo conectado todavía, así que el dueño le pasa
-- el link de registro a mano).

-- ============================================================================
-- 1. RESTAURANT_INVITATIONS
-- ============================================================================
create table public.restaurant_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('administrator', 'host', 'waiter', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Un solo pending por email+restaurante a la vez -- reinvitar después de
-- revocar o aceptar crea una fila nueva en vez de chocar con la vieja.
create unique index restaurant_invitations_pending_unique
  on public.restaurant_invitations (restaurant_id, email)
  where status = 'pending';

create index restaurant_invitations_restaurant_idx on public.restaurant_invitations (restaurant_id);

alter table public.restaurant_invitations enable row level security;

create policy restaurant_invitations_select on public.restaurant_invitations
  for select using (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy restaurant_invitations_write on public.restaurant_invitations
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

-- ============================================================================
-- 2. invite_staff_member -- único punto de entrada para agregar/invitar
-- ============================================================================
create or replace function public.invite_staff_member(
  p_restaurant_id uuid,
  p_email text,
  p_role text
)
returns text -- 'added' | 'invited'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.has_role(p_restaurant_id, array['owner', 'administrator']) then
    raise exception 'No autorizado.';
  end if;
  if p_role not in ('administrator', 'host', 'waiter', 'viewer') then
    raise exception 'Rol inválido.';
  end if;

  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  if v_user_id is not null then
    insert into public.restaurant_users (restaurant_id, user_id, role, status, invited_by, invited_at)
    values (p_restaurant_id, v_user_id, p_role, 'active', auth.uid(), now())
    on conflict (restaurant_id, user_id) do update set role = excluded.role, status = 'active';
    return 'added';
  else
    insert into public.restaurant_invitations (restaurant_id, email, role, invited_by)
    values (p_restaurant_id, v_email, p_role, auth.uid())
    on conflict (restaurant_id, email) where status = 'pending'
      do update set role = excluded.role;
    return 'invited';
  end if;
end;
$$;

grant execute on function public.invite_staff_member(uuid, text, text) to authenticated;

-- ============================================================================
-- 3. Al registrarse, resolver cualquier invitación pendiente para ese email.
--    CREATE OR REPLACE sobre el trigger existente -- sigue creando el
--    profile igual que antes, solo se le agrega la resolución de invites.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  insert into public.restaurant_users (restaurant_id, user_id, role, status, invited_by, invited_at)
  select ri.restaurant_id, new.id, ri.role, 'active', ri.invited_by, ri.created_at
  from public.restaurant_invitations ri
  where lower(ri.email) = lower(new.email) and ri.status = 'pending'
  on conflict (restaurant_id, user_id) do nothing;

  update public.restaurant_invitations
  set status = 'accepted'
  where lower(email) = lower(new.email) and status = 'pending';

  return new;
end;
$$;

-- ============================================================================
-- 4. list_restaurant_team -- el equipo con email/nombre, sin exponer
--    auth.users directamente al cliente.
-- ============================================================================
create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  status text,
  invited_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ru.id, ru.user_id, u.email, p.full_name, ru.role, ru.status, ru.invited_at, ru.created_at
  from public.restaurant_users ru
  join auth.users u on u.id = ru.user_id
  left join public.profiles p on p.id = ru.user_id
  where ru.restaurant_id = p_restaurant_id
    and public.is_member_of(p_restaurant_id)
  order by ru.created_at asc;
$$;

grant execute on function public.list_restaurant_team(uuid) to authenticated;
