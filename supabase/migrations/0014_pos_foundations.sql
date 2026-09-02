-- Fase 1 de integraciones POS/Pagos: fundaciones de datos únicamente.
-- Todo aditivo -- ninguna tabla, columna, función ni policy existente se
-- elimina, renombra ni cambia de comportamiento. Un restaurante sin ninguna
-- fila en estas tablas sigue funcionando exactamente igual que hoy: nada en
-- reservas, disponibilidad, mesas o el Smart Table Engine lee de acá.
--
-- No hay ninguna integración real todavía (sin Lightspeed/Oracle/ICG/Mercado
-- Pago/Transbank). Esto es solo el molde donde esas integraciones van a
-- escribir más adelante.

-- ============================================================================
-- 1. VISITS -- la visita física real a la mesa. Distinta de una reserva:
--    una reserva es la intención de venir; una visita es "alguien está
--    efectivamente sentado ahí ahora". Puede nacer de una reserva
--    (reservation_id set) o de un walk-in que el POS detecta sin que nadie
--    haya cargado nada en Reservia (reservation_id null).
--
--    Ojo: por decisión explícita, esta migración NO agrega reservations.visit_id.
--    La relación es unidireccional (visits.reservation_id -> reservations.id)
--    para evitar dos referencias cruzadas que puedan desincronizarse -- para
--    ir de una reserva a su visita, se consulta visits where reservation_id = ...
-- ============================================================================
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  party_size int not null check (party_size > 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'seated' check (status in ('seated', 'consuming', 'paying', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index visits_restaurant_idx on public.visits (restaurant_id, started_at);
create index visits_table_idx on public.visits (table_id) where table_id is not null;
create index visits_reservation_idx on public.visits (reservation_id) where reservation_id is not null;

-- Nunca dos visitas abiertas a la vez en la misma mesa -- protege contra un
-- doble check-in accidental (manual o vía POS) igual que el resto del
-- proyecto protege contra doble-booking de mesas.
create unique index visits_one_open_per_table on public.visits (table_id) where table_id is not null and ended_at is null;

alter table public.visits enable row level security;

create policy visits_select on public.visits
  for select using (public.is_member_of(restaurant_id));

create policy visits_write on public.visits
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. POS_CONNECTIONS -- una fila por restaurante conectado a un proveedor de
--    caja. `credentials_secret_id` es solo un puntero (uuid) hacia un secreto
--    en Supabase Vault (extensión `supabase_vault`, confirmada instalada en
--    este proyecto) -- nunca un token en texto plano en esta tabla. Fase 1 no
--    escribe nada real acá todavía: sin proveedor conectado, esta columna
--    queda sin uso.
-- ============================================================================
create table public.pos_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('mock', 'oracle_simphony', 'lightspeed', 'icg')),
  external_location_id text,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  credentials_secret_id uuid,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

comment on column public.pos_connections.credentials_secret_id is
  'Puntero a vault.secrets.id (Supabase Vault) -- nunca un token real en esta columna ni en ningún log.';

create index pos_connections_restaurant_idx on public.pos_connections (restaurant_id);

alter table public.pos_connections enable row level security;

-- Cualquier miembro puede ver qué está conectado; solo owner/administrator
-- puede conectar, desconectar o editar -- son credenciales de dinero.
create policy pos_connections_select on public.pos_connections
  for select using (public.is_member_of(restaurant_id));

create policy pos_connections_write on public.pos_connections
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

create trigger pos_connections_set_updated_at
  before update on public.pos_connections
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. POS_TABLE_MAPPINGS -- traducción explícita mesa interna <-> mesa del
--    proveedor. Nunca se infiere por nombre o posición; se arma una vez al
--    conectar, a mano.
-- ============================================================================
create table public.pos_table_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pos_connection_id uuid not null references public.pos_connections(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  external_table_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pos_connection_id, external_table_id),
  unique (pos_connection_id, table_id)
);

create index pos_table_mappings_restaurant_idx on public.pos_table_mappings (restaurant_id);
create index pos_table_mappings_table_idx on public.pos_table_mappings (table_id);

alter table public.pos_table_mappings enable row level security;

create policy pos_table_mappings_select on public.pos_table_mappings
  for select using (public.is_member_of(restaurant_id));

create policy pos_table_mappings_write on public.pos_table_mappings
  for all using (public.has_role(restaurant_id, array['owner', 'administrator']));

create trigger pos_table_mappings_set_updated_at
  before update on public.pos_table_mappings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. POS_CHECKS -- la cuenta abierta en el POS. `visit_id` es el ancla
--    principal (nunca `reservation_id` directo, ver diagrama Fase 0);
--    `visit_id` y `pos_connection_id` son SET NULL al borrar su referencia
--    -- desconectar un POS o borrar una visita jamás debe hacer desaparecer
--    historial financiero ya guardado acá.
--    Montos en NUMERIC(12,2), nunca float, para evitar errores de precisión.
-- ============================================================================
create table public.pos_checks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pos_connection_id uuid references public.pos_connections(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  external_check_id text not null,
  external_table_id text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  taxes numeric(12, 2) not null default 0 check (taxes >= 0),
  discounts numeric(12, 2) not null default 0 check (discounts >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  guest_count int check (guest_count > 0),
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotencia de upsert por proveedor: mientras la conexión siga viva, un
-- mismo external_check_id nunca genera dos filas. Deja de aplicar recién si
-- la conexión se desconecta (pos_connection_id pasa a null) -- momento en el
-- que ya no deberían llegar checks nuevos de todos modos.
create unique index pos_checks_connection_external_idx
  on public.pos_checks (pos_connection_id, external_check_id)
  where pos_connection_id is not null;

create index pos_checks_restaurant_idx on public.pos_checks (restaurant_id, opened_at);
create index pos_checks_visit_idx on public.pos_checks (visit_id) where visit_id is not null;
create index pos_checks_status_idx on public.pos_checks (status);

alter table public.pos_checks enable row level security;

create policy pos_checks_select on public.pos_checks
  for select using (public.is_member_of(restaurant_id));

create policy pos_checks_write on public.pos_checks
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create trigger pos_checks_set_updated_at
  before update on public.pos_checks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. POS_CHECK_ITEMS -- líneas de consumo de una cuenta.
-- ============================================================================
create table public.pos_check_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  external_item_id text,
  name text not null,
  category text,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create index pos_check_items_check_idx on public.pos_check_items (check_id);

alter table public.pos_check_items enable row level security;

create policy pos_check_items_select on public.pos_check_items
  for select using (public.is_member_of(restaurant_id));

create policy pos_check_items_write on public.pos_check_items
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

-- ============================================================================
-- 6. POS_PAYMENTS -- pagos aplicados a una cuenta del POS (no confundir con
--    Payment Integration / Mercado Pago / Transbank -- esos son pagos de
--    garantía/prepago de una reserva, capa completamente separada, todavía
--    sin tabla propia porque Fase 1 no la requiere aún).
-- ============================================================================
create table public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  external_payment_id text,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index pos_payments_check_idx on public.pos_payments (check_id);
create unique index pos_payments_check_external_idx
  on public.pos_payments (check_id, external_payment_id)
  where external_payment_id is not null;

alter table public.pos_payments enable row level security;

create policy pos_payments_select on public.pos_payments
  for select using (public.is_member_of(restaurant_id));

create policy pos_payments_write on public.pos_payments
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

-- ============================================================================
-- 7. POS_WEBHOOK_EVENTS -- log de idempotencia para la futura Edge Function
--    receptora. `restaurant_id` y `pos_connection_id` son nullable a
--    propósito: un evento puede llegar antes de que se logre identificar a
--    qué restaurante pertenece.
--
--    Sin policies de RLS para authenticated/anon -- deny-all directo, mismo
--    patrón que `platform_admins`. Solo la Edge Function, usando la
--    service_role key (que bypassea RLS), puede leer o escribir acá. Ningún
--    usuario del Centro de Control debe ver payloads crudos de webhooks.
-- ============================================================================
create table public.pos_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mock', 'oracle_simphony', 'lightspeed', 'icg')),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  pos_connection_id uuid references public.pos_connections(id) on delete set null,
  external_event_id text not null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'ignored')),
  error text,
  unique (provider, external_event_id)
);

create index pos_webhook_events_restaurant_idx on public.pos_webhook_events (restaurant_id) where restaurant_id is not null;
create index pos_webhook_events_pending_idx on public.pos_webhook_events (received_at) where status = 'pending';

alter table public.pos_webhook_events enable row level security;
-- Sin policies -- deny-all para anon/authenticated.
