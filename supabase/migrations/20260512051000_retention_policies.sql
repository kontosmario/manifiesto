-- WHAT: Cron mensual que purga data más vieja que el window de cada tabla.
-- WHY: Retenciones definidas: notifications 90d, velocity 6m,
--      advisor_signal_dismissals 12m, fixed_expense_price_history 60d,
--      home_telemetry 30d, monthly_summaries top-12 por familia,
--      push_subscriptions 90d sin uso.

create or replace function public.cron_apply_retention_policies()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk int := 10000;
  v_deleted int;
  v_total int := 0;
begin
  -- notifications: 90d
  loop
    delete from public.notifications
    where ctid in (
      select ctid from public.notifications
      where created_at < now() - interval '90 days'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    exit when v_deleted = 0;
  end loop;

  -- velocity_snapshots: 6m
  loop
    delete from public.velocity_snapshots
    where ctid in (
      select ctid from public.velocity_snapshots
      where snapshot_date < (current_date - interval '6 months')::date
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- advisor_signal_dismissals: 12m
  loop
    delete from public.advisor_signal_dismissals
    where ctid in (
      select ctid from public.advisor_signal_dismissals
      where created_at < now() - interval '12 months'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- fixed_expense_price_history: 60d
  loop
    delete from public.fixed_expense_price_history
    where ctid in (
      select ctid from public.fixed_expense_price_history
      where changed_at < now() - interval '60 days'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- home_telemetry: 30d (si la tabla existe)
  begin
    loop
      delete from public.home_telemetry
      where ctid in (
        select ctid from public.home_telemetry
        where created_at < now() - interval '30 days'
        limit v_chunk
      );
      get diagnostics v_deleted = row_count;
      exit when v_deleted = 0;
    end loop;
  exception when undefined_table then null;
  end;

  -- monthly_summaries: top 12 por familia
  delete from public.monthly_summaries ms
  using (
    select id from (
      select id, row_number() over (
        partition by family_id order by period_start desc
      ) as rn
      from public.monthly_summaries
    ) ranked
    where rn > 12
  ) old
  where ms.id = old.id;

  -- push_subscriptions: 90d sin uso (si la columna last_used_at existe)
  begin
    delete from public.push_subscriptions
    where last_used_at is not null
      and last_used_at < now() - interval '90 days';
  exception when undefined_column then null;
  end;
end;
$$;

revoke all on function public.cron_apply_retention_policies() from public;
grant execute on function public.cron_apply_retention_policies() to service_role;

-- ─── pg_cron schedule mensual (día 1, 04:00 UTC) ──────────────────
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then return; end if;
  begin perform cron.unschedule('apply-retention-policies'); exception when others then null; end;
  perform cron.schedule(
    'apply-retention-policies',
    '0 4 1 * *',
    $cron$select public.cron_apply_retention_policies();$cron$
  );
exception when others then null;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('apply-retention-policies');
-- drop function if exists public.cron_apply_retention_policies();
