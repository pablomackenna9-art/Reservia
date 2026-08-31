-- Fase 0: fundación multi-tenant — restaurantes, perfiles, roles y RLS.
-- Mercado inicial: Chile (defaults de timezone/currency/locale).

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. RESTAURANTS — raíz del tenant
-- ============================================================================
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  timezone text not null default 'America/Santiago',
  currency text not null default 'CLP',
  locale text not null default 'es-CL',
  phone text,
  address text,
  logo_url text,
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'suspended')),
  plan text not null default 'trial',
  show_guests_on_floorplan boolean not null default true,
  -- created_by respalda la política RLS de abajo: garantiza que el creador
  -- pueda ver su propio restaurante incluso antes de que exista su fila en
  -- restaurant_users (la inserta el trigger on_restaurant_created).
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on column public.restaurants.deleted_at is
  'Soft-delete: nunca borrar filas directamente. Un job aparte se encarga de anonimizar/purgar según política de retención.';

-- ============================================================================
-- 2. PROFILES — un perfil por usuario de auth.users, no por restaurante
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'es-CL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 3. RESTAURANT_USERS — rol de cada usuario dentro de cada restaurante
-- ============================================================================
create table public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'administrator', 'host', 'waiter', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create index restaurant_users_restaurant_idx on public.restaurant_users (restaurant_id);
create index restaurant_users_user_idx on public.restaurant_users (user_id);

-- Al crear un restaurante, su creador queda automáticamente como owner.
create or replace function public.handle_new_restaurant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_users (restaurant_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'active');
  return new;
end;
$$;

create trigger on_restaurant_created
  after insert on public.restaurants
  for each row execute function public.handle_new_restaurant();

-- ============================================================================
-- 4. PLATFORM_ADMINS — super_admin de plataforma, no pertenece a ningún restaurante
-- ============================================================================
create table public.platform_admins (
  user_id uuid primary key references auth.users(id)
);
-- Sin policies: deny-all directo. Solo se consulta a través de is_platform_admin().

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- ============================================================================
-- 5. CUSTOM_ROLES — estructura preparada para roles personalizados (Fase 6+)
-- ============================================================================
create table public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.restaurant_users
  add column custom_role_id uuid references public.custom_roles(id);

-- ============================================================================
-- 6. FUNCIONES DE PERMISOS — usadas por las políticas RLS de este módulo
--    y de todos los que vengan después
-- ============================================================================
create or replace function public.is_member_of(target_restaurant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_users
    where restaurant_id = target_restaurant_id
      and user_id = auth.uid()
      and status = 'active'
  ) or public.is_platform_admin();
$$;

create or replace function public.has_role(target_restaurant_id uuid, roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_users
    where restaurant_id = target_restaurant_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(roles)
  ) or public.is_platform_admin();
$$;

grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.platform_admins enable row level security;
alter table public.custom_roles enable row level security;

-- restaurants: miembros ven el suyo; cualquier usuario autenticado puede crear uno (onboarding)
create policy restaurants_select on public.restaurants
  for select using (public.is_member_of(id) or created_by = auth.uid());

create policy restaurants_insert on public.restaurants
  for insert with check (created_by = auth.uid());

create policy restaurants_update on public.restaurants
  for update using (public.has_role(id, array['owner', 'administrator']));

-- profiles: cada usuario ve y edita únicamente el suyo
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- restaurant_users: miembros ven el equipo; solo owner/administrator lo gestiona
create policy restaurant_users_select on public.restaurant_users
  for select using (public.is_member_of(restaurant_id));

create policy restaurant_users_write on public.restaurant_users
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

-- custom_roles: mismo patrón de lectura amplia / escritura restringida
create policy custom_roles_select on public.custom_roles
  for select using (public.is_member_of(restaurant_id));

create policy custom_roles_write on public.custom_roles
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

-- ============================================================================
-- 8. updated_at automático
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger restaurant_users_set_updated_at
  before update on public.restaurant_users
  for each row execute function public.set_updated_at();
