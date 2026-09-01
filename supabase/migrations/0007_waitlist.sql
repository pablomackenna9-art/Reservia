-- Fase 5: lista de espera — clientes sin reserva esperando que se libere una mesa.

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  party_size int not null check (party_size > 0),
  requested_at timestamptz not null default now(),
  estimated_wait_minutes int check (estimated_wait_minutes is null or estimated_wait_minutes >= 0),
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'seated', 'cancelled', 'left')),
  preferred_zone_id uuid references public.zones(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index waitlist_entries_restaurant_idx on public.waitlist_entries (restaurant_id, status);

alter table public.waitlist_entries enable row level security;

create policy waitlist_select on public.waitlist_entries
  for select using (public.is_member_of(restaurant_id));

create policy waitlist_write on public.waitlist_entries
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create trigger waitlist_entries_set_updated_at
  before update on public.waitlist_entries
  for each row execute function public.set_updated_at();
