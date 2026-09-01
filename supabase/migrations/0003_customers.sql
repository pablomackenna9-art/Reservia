-- Fase 3: clientes — una fila por persona, no por reserva.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  first_name text not null check (char_length(first_name) > 0),
  last_name text,
  phone text,
  email text,
  birthday date,
  notes text,
  total_visits int not null default 0,
  no_show_count int not null default 0,
  cancellation_count int not null default 0,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_restaurant_idx on public.customers (restaurant_id);
create index customers_phone_idx on public.customers (restaurant_id, phone);

alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select using (public.is_member_of(restaurant_id));

-- host/waiter pueden crear y editar clientes en el día a día; solo
-- owner/administrator los eliminan (evita que un mesero borre historial).
create policy customers_write on public.customers
  for insert with check (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create policy customers_update on public.customers
  for update using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create policy customers_delete on public.customers
  for delete using (public.has_role(restaurant_id, array['owner', 'administrator']));

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
