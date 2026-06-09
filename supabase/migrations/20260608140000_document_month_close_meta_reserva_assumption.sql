-- supabase/migrations/20260608140000_document_month_close_meta_reserva_assumption.sql
--
-- Code review v2 finding H1 (2026-06-08): documentar la asunción
-- detrás de las ramas `meta` y `reserva` de `apply_month_close_decision`.
--
-- Contexto: el branch `acumular` (migration 20260608030000) es
-- explícitamente atomic: el UPDATE referencia
-- current_cycle_starting_balance + monthly_income en la misma row,
-- eliminando la ventana de race con triggers concurrentes (p. ej.
-- confirm-salary).
--
-- Las ramas `meta` y `reserva` parecen patrón SELECT-then-UPDATE no
-- colapsado, pero NO comparten el riesgo del branch `acumular`:
--
--   * `meta`: el UPDATE en `savings_goals` toma `current_amount` y le
--     suma `v_sobrante` calculado pre-INSERT. `v_sobrante` viene de
--     `monthly_summaries`, que es frozen post-cierre (no se updatea
--     por ningún trigger después del INSERT de `month_close_decisions`,
--     porque el unique constraint en `monthly_summary_id` previene
--     re-runs). No hay race posible — `v_sobrante` ya está fijado.
--
--   * `reserva`: el UPDATE en `family_finance` suma `v_sobrante` a
--     `monthly_reserve_amount`. Mismo argumento: `v_sobrante` es
--     constante para esta llamada y el INSERT en `month_close_decisions`
--     con unique constraint impide doble ejecución. La suma "atomic
--     incremental" (`coalesce(x, 0) + constante`) es segura bajo MVCC:
--     dos transacciones concurrentes con la misma row producen el
--     mismo resultado (commutativo + asociativo) — y el unique
--     constraint las serializa de todos modos antes de llegar acá.
--
-- TODO (futuro): si se introduce un trigger que update
-- `monthly_summaries` post-INSERT (p. ej. para corregir el savings_delta
-- retroactivamente), esto se vuelve unsafe. Migrar al patrón del branch
-- `acumular`: calcular `v_sobrante` y aplicarlo en un solo UPDATE,
-- referenciando los campos source (savings_goals.current_amount o
-- family_finance.monthly_reserve_amount) directamente.
--
-- Esta migration agrega comentarios SQL sobre la función para que
-- aparezcan en pg_proc.prosrc-adjacent metadata y en el dump.
-- No cambia código ni signatures.

comment on function public.apply_month_close_decision(uuid, text, uuid, text)
is 'V3 (2026-06-08). Aplica decision de cierre mensual: meta/acumular/reserva/skip.
Ramas meta y reserva usan SELECT-then-UPDATE seguro porque v_sobrante es derivado
de monthly_summaries (frozen post-cierre por unique constraint en monthly_summary_id).
Branch acumular es explícitamente atomic (UPDATE referenciando monthly_income
en la misma row) — patrón a usar si en el futuro algún trigger update monthly_summaries
post-INSERT. Ver migration 20260608140000_document_month_close_meta_reserva_assumption.sql.';
