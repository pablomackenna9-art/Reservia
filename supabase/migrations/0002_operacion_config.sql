-- Fase 2 (estructura) / Fase 0-2 (uso): zonas, mesas, mesas unidas,
-- horarios y reglas de reserva. Todo cuelga de restaurant_id y usa el
-- mismo patrón de RLS que 0001_tenancy.

-- ============================================================================
-- 1. ZONES
-- ============================================================================
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(name) > 0),
  type text not null default 'salon',
  sort_order int not null default 0,
  -- tamaño lógico del lienzo de esta zona; las mesas se posicionan como
  -- 0-100% de este tamaño, nunca en píxeles fijos, para que el plano
  -- escale igual en un monitor y en una tablet.
  width numeric not null default 1000 check (width > 0),
  height numeric not null default 700 check (height > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zones_restaurant_idx on public.zones (restaurant_id);

-- ============================================================================
-- 2. TABLES
-- ============================================================================
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  number int,
  shape text not null default 'square' check (shape in ('round', 'square', 'rectangle')),
  capacity_min int not null default 1 check (capacity_min > 0),
  capacity_max int not null check (capacity_max >= capacity_min),
  -- porcentaje (0-100) del lienzo de la zona, no píxeles.
  pos_x numeric not null check (pos_x >= 0 and pos_x <= 100),
  pos_y numeric not null check (pos_y >= 0 and pos_y <= 100),
  width numeric not null default 80 check (width > 0),
  height numeric not null default 80 check (height > 0),
  rotation numeric not null default 0 check (rotation >= 0 and rotation < 360),
  active boolean not null default true,
  joinable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tables_restaurant_idx on public.tables (restaurant_id);
create index tables_zone_idx on public.tables (zone_id);

-- ============================================================================
-- 3. TABLE_GROUPS / TABLE_GROUP_MEMBERS — mesas unidas
-- ============================================================================
create table public.table_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.table_group_members (
  table_group_id uuid not null references public.table_groups(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  primary key (table_group_id, table_id)
);

-- ============================================================================
-- 4. RESTAURANT_HOURS
-- ============================================================================
create table public.restaurant_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = domingo
  service_name text not null default 'general',
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now()
);

create index restaurant_hours_restaurant_idx on public.restaurant_hours (restaurant_id);

-- ============================================================================
-- 5. RESERVATION_RULES — una fila por restaurante
-- ============================================================================
create table public.reservation_rules (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  default_duration_minutes int not null default 90 check (default_duration_minutes > 0),
  buffer_minutes int not null default 15 check (buffer_minutes >= 0),
  min_party_size int not null default 1 check (min_party_size > 0),
  max_party_size int not null default 20 check (max_party_size >= min_party_size),
  min_advance_hours int not null default 1 check (min_advance_hours >= 0),
  max_advance_days int not null default 60 check (max_advance_days > 0),
  allow_online_booking boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. RLS — mismo patrón que 0001: lectura para cualquier miembro activo,
--    escritura solo para owner/administrator.
-- ============================================================================
alter table public.zones enable row level security;
alter table public.tables enable row level security;
alter table public.table_groups enable row level security;
alter table public.table_group_members enable row level security;
alter table public.restaurant_hours enable row level security;
alter table public.reservation_rules enable row level security;

create policy zones_select on public.zones for select using (public.is_member_of(restaurant_id));
create policy zones_write on public.zones for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy tables_select on public.tables for select using (public.is_member_of(restaurant_id));
create policy tables_write on public.tables for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy table_groups_select on public.table_groups for select using (public.is_member_of(restaurant_id));
create policy table_groups_write on public.table_groups for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

-- table_group_members no tiene restaurant_id propio: hereda el permiso de su grupo.
create policy table_group_members_select on public.table_group_members
  for select using (exists (
    select 1 from public.table_groups g
    where g.id = table_group_id and public.is_member_of(g.restaurant_id)
  ));

create policy table_group_members_write on public.table_group_members
  for all using (exists (
    select 1 from public.table_groups g
    where g.id = table_group_id and public.has_role(g.restaurant_id, array['owner', 'administrator'])
  ));

create policy restaurant_hours_select on public.restaurant_hours for select using (public.is_member_of(restaurant_id));
create policy restaurant_hours_write on public.restaurant_hours for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy reservation_rules_select on public.reservation_rules for select using (public.is_member_of(restaurant_id));
create policy reservation_rules_write on public.reservation_rules for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

-- ============================================================================
-- 7. updated_at automático
-- ============================================================================
create trigger zones_set_updated_at before update on public.zones
  for each row execute function public.set_updated_at();
create trigger tables_set_updated_at before update on public.tables
  for each row execute function public.set_updated_at();
create trigger reservation_rules_set_updated_at before update on public.reservation_rules
  for each row execute function public.set_updated_at();
