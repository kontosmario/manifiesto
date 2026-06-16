-- supabase/migrations/20260620210000_fixed_payment_expenses_retention.sql
--
-- WHAT: Los pagos de fijos (expenses con commitment_id) dejan de ser borrados
--   por el purge diario de archivados (14 días). En su lugar tienen su propia
--   retención: se conservan los ÚLTIMOS 3 pagos por fijo y se purgan los más
--   viejos. Así el historial reciente de cada fijo (hasta ~3 cuotas) queda
--   reflejado, sin que la tabla crezca sin límite.
--
-- WHY (bug de pérdida de datos, forensia 2026-06-16):
--   close_monthly_cycle archiva (archived_at = now()) TODOS los expenses del
--   ciclo al cerrar — incluidos los pagos de fijos — y `cron_purge_archived_
--   expenses` (diario 04:30) hace HARD-DELETE de los archivados con +14 días.
--   Resultado: el expense (= el MONTO) de cada pago de fijo de un ciclo cerrado
--   se borraba ~14 días después. El ledger `fixed_expense_payments` conserva el
--   período (qué mes se pagó) pero NO el monto, así que se perdía el historial
--   de montos de los fijos (sparkline plano, gasto pasado subvaluado, FK
--   expense_id → NULL por ON DELETE SET NULL).
--   El audit_log confirmó borrados `service_role_DELETE_expenses` en lote a las
--   04:30 (June 13: 106). Decisión del owner: no recuperar lo ya borrado;
--   reflejar sólo los últimos ~3 pagos de cada fijo de acá en adelante.
--
-- Nota: NO se toca `close_monthly_cycle`. Sigue archivando los pagos de fijos
--   (inofensivo: `loadCommitmentExpenses` los lee igual aunque estén archived,
--   y el home_snapshot los excluye del gasto del ciclo actual por fecha). Lo
--   único que cambia es QUIÉN los borra: ya no el purge de 14 días, sino la
--   retención last-3 de abajo.

-- ─── 1. El purge de archivados NUNCA borra pagos de fijos ───────────
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
  v_cutoff timestamptz := now() - interval '14 days';
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

-- ─── 2. Retención de pagos de fijos: conservar los últimos 3 por fijo ─
create or replace function public.cron_prune_fixed_payment_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  -- Por cada compromiso (fijo) ordenamos sus pagos del más nuevo al más viejo
  -- y borramos todo lo que pase del 3°. El expense más reciente nunca se toca.
  with ranked as (
    select
      id,
      row_number() over (
        partition by commitment_id
        order by created_at desc, id desc
      ) as rn
    from public.expenses
    where commitment_id is not null
  )
  delete from public.expenses e
  using ranked r
  where e.id = r.id
    and r.rn > 3;

  get diagnostics v_deleted = row_count;
  raise notice 'cron_prune_fixed_payment_expenses: deleted=%', v_deleted;
end;
$$;

revoke all on function public.cron_prune_fixed_payment_expenses() from public;
grant execute on function public.cron_prune_fixed_payment_expenses() to service_role;

-- ─── 3. Schedule diario (después del purge de archivados de las 04:30) ─
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping prune-fixed-payment-expenses schedule.';
    return;
  end if;
  begin perform cron.unschedule('prune-fixed-payment-expenses'); exception when others then null; end;
  perform cron.schedule(
    'prune-fixed-payment-expenses',
    '40 4 * * *', -- 04:40 UTC, 10 min después del purge de archivados
    $cron$select public.cron_prune_fixed_payment_expenses();$cron$
  );
exception when others then
  raise notice 'prune-fixed-payment-expenses schedule failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- begin;
--   select cron.unschedule('prune-fixed-payment-expenses');
--   drop function if exists public.cron_prune_fixed_payment_expenses();
--   -- restaurar cron_purge_archived_expenses sin el filtro commitment_id
--   --   (ver 20260512050000_purge_archived_expenses.sql)
-- commit;
