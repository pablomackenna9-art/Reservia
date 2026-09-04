-- Estadísticas de consumo por cliente -- consumo total y productos
-- favoritos, calculados desde visits/pos_checks/pos_check_items (la
-- infraestructura POS de Fase 1/2). Aditivo: no crea ni modifica tablas.

create or replace function public.get_customer_consumption_stats(p_restaurant_id uuid)
returns table (customer_id uuid, total_spent numeric, visit_count bigint, top_products jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_member_of(p_restaurant_id) then
    raise exception 'No autorizado.';
  end if;

  return query
  with items as (
    select v.customer_id, pci.name, pci.quantity, pci.total
    from public.pos_check_items pci
    join public.pos_checks pc on pc.id = pci.check_id
    join public.visits v on v.id = pc.visit_id
    where v.restaurant_id = p_restaurant_id
      and v.customer_id is not null
  ),
  totals as (
    select i.customer_id, sum(i.total) as total_spent
    from items i
    group by i.customer_id
  ),
  product_totals as (
    select i.customer_id, i.name, sum(i.quantity) as qty
    from items i
    group by i.customer_id, i.name
  ),
  ranked_products as (
    select pt.customer_id, pt.name, pt.qty,
      row_number() over (partition by pt.customer_id order by pt.qty desc, pt.name asc) as rn
    from product_totals pt
  ),
  top_products_agg as (
    select rp.customer_id, jsonb_agg(jsonb_build_object('name', rp.name, 'quantity', rp.qty) order by rp.qty desc) as top_products
    from ranked_products rp
    where rp.rn <= 3
    group by rp.customer_id
  ),
  visit_counts as (
    select v.customer_id, count(*) as visit_count
    from public.visits v
    where v.restaurant_id = p_restaurant_id and v.customer_id is not null
    group by v.customer_id
  )
  select
    t.customer_id,
    t.total_spent,
    coalesce(vc.visit_count, 0) as visit_count,
    coalesce(tp.top_products, '[]'::jsonb) as top_products
  from totals t
  left join top_products_agg tp on tp.customer_id = t.customer_id
  left join visit_counts vc on vc.customer_id = t.customer_id;
end;
$$;

grant execute on function public.get_customer_consumption_stats(uuid) to authenticated;
