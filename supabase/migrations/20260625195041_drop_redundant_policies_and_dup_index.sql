-- WHAT: Cierra los últimos lints del advisor de performance.
--   (1) multiple_permissive en family_entitlements + feature_flags: la policy
--       `no_write(s)` (FOR ALL, qual=false, check=false) es REDUNDANTE — sin policy
--       de write, RLS ya deniega por default; para SELECT solo aportaba un `false`
--       OR-eado (ruido). Dropearla preserva el comportamiento exacto (los writes
--       reales van por service_role, que bypassa RLS).
--   (2) duplicate_index en fixed_expense_payments: 2 índices únicos idénticos
--       sobre (fixed_expense_id, period_month). Dejo el del constraint (`_key`),
--       dropeo el manual (`_uidx`).
-- WHY:  Perf + hygiene, cero cambio de acceso.
-- NOTE: expenses INSERT (active vs created_by_self) queda flageado a propósito —
--       es una decisión de producto/seguridad (¿un miembro puede registrar un
--       gasto con created_by de otro?), no un fix mecánico.

drop policy if exists family_entitlements_no_write on public.family_entitlements;
drop policy if exists feature_flags_no_writes on public.feature_flags;

drop index if exists public.fixed_expense_payments_fixed_expense_period_uidx;
