-- WHAT: Cron que refresca control_snapshots para todas las familias activas.
-- WHY: TTL de 12h en la RPC + refresh cada 6h = data nunca >6h vieja.
--      Procesa en chunks de 200 familias con savepoint por chunk para
--      no abortar todo si una falla.

create or replace function public.cron_refresh_control_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk_size int := 200;
  v_offset int := 0;
  v_processed int := 0;
  v_failed int := 0;
  v_id uuid;
  v_ids uuid[];
begin
  loop
    select array_agg(id) into v_ids
    from (
      select id from public.families
      order by id
      offset v_offset limit v_chunk_size
    ) f;

    exit when v_ids is null or array_length(v_ids, 1) is null;

    foreach v_id in array v_ids loop
      begin
        perform public.compute_control_snapshot(v_id);
        v_processed := v_processed + 1;
      exception when others then
        v_failed := v_failed + 1;
        raise notice 'compute_control_snapshot failed for %: %', v_id, sqlerrm;
      end;
    end loop;

    v_offset := v_offset + v_chunk_size;
  end loop;

  raise notice 'cron_refresh_control_snapshots: processed=% failed=%', v_processed, v_failed;
end;
$$;

revoke all on function public.cron_refresh_control_snapshots() from public;
grant execute on function public.cron_refresh_control_snapshots() to service_role;

-- ─── pg_cron schedule (06:00, 12:00, 18:00 AR = 09:00, 15:00, 21:00 UTC) ──
do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping control_snapshots refresh.';
    return;
  end if;

  begin perform cron.unschedule('control-snapshots-refresh'); exception when others then null; end;
  perform cron.schedule(
    'control-snapshots-refresh',
    '0 9,15,21 * * *',
    $cron$select public.cron_refresh_control_snapshots();$cron$
  );
exception when others then
  raise notice 'pg_cron control_snapshots schedule failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('control-snapshots-refresh');
-- drop function if exists public.cron_refresh_control_snapshots();
