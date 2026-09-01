-- Modelo de precio minimo: un ticket promedio configurable por restaurante
-- (para estimar ingresos de reservas que todavia no pasaron), y el monto
-- real cobrado por reserva (para facturacion real una vez que se completa).
-- No hay integracion de pagos todavia -- el monto lo carga el host a mano
-- al marcar una reserva como completada.

alter table public.reservation_rules
  add column average_ticket_per_person numeric not null default 0 check (average_ticket_per_person >= 0);

alter table public.reservations
  add column total_amount numeric check (total_amount is null or total_amount >= 0);
