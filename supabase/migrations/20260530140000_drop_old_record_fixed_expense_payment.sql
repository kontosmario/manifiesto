-- ============================================================
-- WHAT
--   Dropea la signature vieja `record_fixed_expense_payment(uuid)`
--   que quedó co-existiendo con la nueva `(uuid, numeric DEFAULT NULL)`
--   tras la migración 20260530120000.
--
-- WHY
--   `create or replace function public.record_fixed_expense_payment(
--     p_fixed_expense_id uuid, p_amount_override numeric default null
--   )` NO reemplazó a la signature vieja — PostgreSQL trata las
--   funciones por nombre + lista de tipos de argumentos, así que
--   `(uuid)` y `(uuid, numeric)` son dos funciones distintas. Ambas
--   quedaron live.
--
--   Resultado: al llamar el RPC desde el cliente, PostgREST recibe el
--   parámetro `p_fixed_expense_id` y el nuevo `p_amount_override` y
--   no puede resolver entre las dos overloads:
--
--     "Could not choose the best candidate function between:
--      public.record_fixed_expense_payment(p_fixed_expense_id => uuid),
--      public.record_fixed_expense_payment(p_fixed_expense_id => uuid,
--                                          p_amount_override => numeric)"
--
--   Esto rompe el sheet de "Confirmar pago" en prod.
--
-- FIX
--   DROP de la signature vieja. La nueva con default null cubre 100%
--   del caso pre-migración (caller que solo pasa el id usa null como
--   override → comportamiento idéntico al original).
-- ============================================================

-- IF EXISTS para que la migración sea idempotente y no falle si la
-- signature vieja ya no está (re-runs, fresh installs futuros).
drop function if exists public.record_fixed_expense_payment(uuid);

-- Sanity: re-grant explícito sobre la nueva signature por si el drop
-- hubiera afectado algo (no debería — los grants se atan a oid, no
-- a la combinación nombre+signature — pero defense in depth).
grant execute on function public.record_fixed_expense_payment(uuid, numeric) to authenticated;
