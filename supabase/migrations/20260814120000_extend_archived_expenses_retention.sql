-- supabase/migrations/20260814120000_extend_archived_expenses_retention.sql
--
-- WHAT: La retención de gastos variables archivados pasa de 14 días a
--   13 meses. No agrega índice — ver nota de abajo.
--
-- WHY: la vista Gastos ahora permite entrar a una edición cerrada y ver sus
--   movimientos (spec 2026-08-14-gastos-ediciones-movimientos-design.md).
--   Los movimientos salen de las RPCs existentes (gastos_expenses_paginated /
--   gastos_expenses_for_day) sobre la ventana [period_start, period_end) de
--   la edición — pero el purge diario los borraba a los 14 días del cierre.
--   13 meses = las 12 ediciones que muestra el dropdown + 1 de margen.
--   Solo hacia adelante: lo ya purgado no se recupera (la UI tiene fallback).
--
-- Notas:
--   · La retención de pagos de fijos (last-3 por fijo, 20260620210000) NO
--     cambia — el feed histórico excluye commitment_id igual que el vivo.
--   · Sin índice nuevo: el feed histórico filtra family_id + commitment_id
--     is null + rango de created_at, y ESE patrón ya lo cubre el índice
--     existente `expenses_family_commitment_created_idx (family_id,
--     commitment_id, created_at desc)` (20260419193000) — btree hace seek
--     por (family_id, commitment_id IS NULL) y range-scan por created_at.
--     No crear un índice redundante: en esta tabla (la de mayor escritura
--     de la app) cada índice de más es write amplification permanente, y
--     `create index` sin CONCURRENTLY toma ACCESS EXCLUSIVE mientras corre
--     (Supabase aplica migraciones dentro de una transacción implícita,
--     que no admite CONCURRENTLY — precedente documentado en
--     20260512000000_indexes_for_5k_mau.sql:6-12).

-- ─── 1. Retención: 14 días → 13 meses ───────────────────────────────
create or replace function public.cron_purge_archived_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk_size int := 10000;
  v_deleted int;
  v_total int := 0;
  v_iterations int := 0;
  v_cutoff timestamptz := now() - interval '13 months';
begin
  loop
    delete from public.expenses
    where ctid in (
      select ctid from public.expenses
      where archived_at is not null
        and archived_at < v_cutoff
        and commitment_id is null   -- pagos de fijos: gestionados aparte (last-3)
      limit v_chunk_size
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    v_iterations := v_iterations + 1;
    exit when v_deleted = 0 or v_iterations > 100; -- safety cap
  end loop;

  raise notice 'cron_purge_archived_expenses: deleted=% iterations=%', v_total, v_iterations;
end;
$$;

revoke all on function public.cron_purge_archived_expenses() from public;
grant execute on function public.cron_purge_archived_expenses() to service_role;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- begin;
--   -- restaurar cutoff 14 días: ver 20260620210000_fixed_payment_expenses_retention.sql
-- commit;
