-- Feedback post-visita: rating 1-5 + comentario opcional sobre una reserva
-- ya completada. Aditivo -- no toca ninguna columna ni política existente.

alter table public.reservations
  add column if not exists feedback_rating smallint check (feedback_rating between 1 and 5),
  add column if not exists feedback_comment text;
