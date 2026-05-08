-- WHAT: Cron diario que borra físicamente expenses archivados >14 días.
-- WHY: archived_at lo setea close_monthly_cycle al cerrar ciclo.
--      14 días de gracia para que cron_compute_velocity_snapshots tenga
--      ventana de 30d empalmando ciclos. Después: hard-delete para
--      controlar tamaño de la tabla.

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
      where archived_at is not null and archived_at < v_cutoff
      limit v_chunk_size
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    v_iterations := v_iterations + 1;
    exit when v_deleted = 0 or v_iterations > 100; -- safety cap: 1M filas/run
  end loop;

  raise notice 'cron_purge_archived_expenses: deleted=% iterations=%', v_total, v_iterations;
end;
$$;

revoke all on function public.cron_purge_archived_expenses() from public;
grant execute on function public.cron_purge_archived_expenses() to service_role;

-- ─── pg_cron schedule diario ───────────────────────────────────────
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping purge schedule.';
    return;
  end if;
  begin perform cron.unschedule('purge-archived-expenses'); exception when others then null; end;
  perform cron.schedule(
    'purge-archived-expenses',
    '30 4 * * *', -- 04:30 UTC = 01:30 AR, después de close-cycles + velocity
    $cron$select public.cron_purge_archived_expenses();$cron$
  );
exception when others then
  raise notice 'purge cron schedule failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('purge-archived-expenses');
-- drop function if exists public.cron_purge_archived_expenses();
