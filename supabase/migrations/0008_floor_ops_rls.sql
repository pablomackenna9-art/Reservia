-- Mover una mesa o unir dos mesas para una mesa grande es parte de correr
-- el turno en vivo -- lo hace el host o el mesero, no solo el dueño. Crear
-- o eliminar mesas (estructural) sigue siendo owner/administrator. La
-- politica anterior (tables_write) no distinguía: cualquier UPDATE exigía
-- el mismo rol que un DELETE, así que el drag-and-drop del plano y "unir
-- mesas" habrían fallado con cualquier usuario host/waiter real, aunque
-- el owner de prueba nunca lo notó.

drop policy tables_write on public.tables;

create policy tables_insert on public.tables
  for insert with check (public.has_role(restaurant_id, array['owner', 'administrator']));

create policy tables_update on public.tables
  for update using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

create policy tables_delete on public.tables
  for delete using (public.has_role(restaurant_id, array['owner', 'administrator']));

drop policy table_groups_write on public.table_groups;

create policy table_groups_write on public.table_groups
  for all using (public.has_role(restaurant_id, array['owner', 'administrator', 'host', 'waiter']));

drop policy table_group_members_write on public.table_group_members;

create policy table_group_members_write on public.table_group_members
  for all using (exists (
    select 1 from public.table_groups g
    where g.id = table_group_id
      and public.has_role(g.restaurant_id, array['owner', 'administrator', 'host', 'waiter'])
  ));
