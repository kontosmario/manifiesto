-- supabase/migrations/20260620160000_notifications_ephemeral_cleanup.sql
-- Notificaciones EFÍMERAS: auto-limpieza diaria (leídas 48h / cualquiera 14d) +
-- limpieza del backlog. El badge se limpia al abrir el feed (cliente) y el
-- delete-on-read explícito (✓/swipe) ya existe.
-- Spec: docs/superpowers/specs/2026-06-15-notifications-ephemeral-design.md
--
-- El bloque de 30d en cron_apply_retention_policies() se DEJA como backstop
-- inofensivo (la limpieza diaria de 14d siempre lo deja sin trabajo).

-- ── función de limpieza (chunked, idempotente) ──────────────────────────────
create or replace function public.cron_cleanup_notifications_ephemeral()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chunk int := 10000;
  v_deleted int;
begin
  -- Leídas: 48h de gracia tras ser vistas (ya las viste → se van).
  loop
    delete from public.notifications
    where ctid in (
      select ctid from public.notifications
      where read_at is not null and read_at < now() - interval '48 hours'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;
  -- Cualquiera (piso para las nunca-vistas): 14 días.
  loop
    delete from public.notifications
    where ctid in (
      select ctid from public.notifications
      where created_at < now() - interval '14 days'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;
end;
$$;
revoke all on function public.cron_cleanup_notifications_ephemeral() from public;
grant execute on function public.cron_cleanup_notifications_ephemeral() to service_role;

-- ── cron diario (4am) ───────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-notifications') then
    perform cron.unschedule('cleanup-notifications');
  end if;
  perform cron.schedule(
    'cleanup-notifications',
    '0 4 * * *',
    $cmd$select public.cron_cleanup_notifications_ephemeral()$cmd$
  );
end $$;

-- ── backlog one-shot (aplica la política nueva una vez) ─────────────────────
select public.cron_cleanup_notifications_ephemeral();
