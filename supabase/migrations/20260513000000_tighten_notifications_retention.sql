-- WHAT: Bajar retención de notifications de 90d a 30d en cron_apply_retention_policies().
-- WHY: El bell icon en home_snapshot corta a las 80 filas más recientes (limit 80),
--      y la dedup_key cubre el caso de "no duplicar la misma notif el mismo día".
--      90d era defensivo conservador del spec original; >30d es zombi storage que
--      no se renderiza ni se usa. 3× DB liberado en notifications. A 5K MAU
--      bajamos de ~1.8 GB a ~600 MB.
--
-- Solo cambia la cláusula de notifications dentro de la función. El resto de
-- retenciones se preserva idéntico (velocity 6m, dismissals 12m, price_history 60d,
-- telemetry 30d, monthly_summaries top-12, push_subscriptions 90d).

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
  -- notifications: 30d (antes 90d, bajado el 2026-05-09 — ver migración
  -- 20260513000000_tighten_notifications_retention.sql)
  loop
    delete from public.notifications
    where ctid in (
      select ctid from public.notifications
      where created_at < now() - interval '30 days'
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

-- ═══ DOWN ═══════════════════════════════════════════════════════════
-- Re-aplicar 20260512051000_retention_policies.sql para volver a 90d.
