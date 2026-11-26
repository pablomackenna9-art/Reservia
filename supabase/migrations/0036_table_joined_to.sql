-- ============================================================================
-- 0036 — A qué mesa se pegó una mesa en el plano.
--
-- Cuando el administrador arrastra una mesa (o un módulo) junto a otra, la mesa arrastrada pasa a ser parte
-- de la otra y toma su número. `joined_to` guarda cuál es la mesa "madre" (la que ya estaba ahí).
-- Al separarla se borra y la mesa vuelve a su propio número (un módulo suelto recibe un número nuevo, calculado
-- en el plano). Mover mesas sigue funcionando aunque esta columna todavía no exista.
-- ============================================================================

alter table public.tables
  add column if not exists joined_to uuid references public.tables(id) on delete set null;
