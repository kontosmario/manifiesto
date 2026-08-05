-- Endurecer TODAS las funciones SECURITY DEFINER internas que quedaban
-- ejecutables por anon/authenticated.
--
-- Causa raíz (igual que 20260630010000): `revoke ... from public` NO quita
-- los grants explícitos que Supabase aplica por default privileges
-- (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE TO anon, authenticated en cada
-- función nueva). Varias migraciones hicieron `revoke all ... from public;
-- grant execute to service_role` creyendo que eso bloqueaba la función — no
-- lo hacía. Estas funciones son SECURITY DEFINER y operan/devuelven datos
-- cross-tenant (de TODAS las familias/usuarios) sin chequeo interno de
-- auth.uid()/membership. Solo las corren pg_cron o el service_role (edge
-- functions / orchestrator). Un `authenticated` podía:
--   * leer notificaciones pendientes de todas las familias
--     (list_pending_notifications, igual que list_unpushed_notifications),
--   * forjar entitlements / estado de suscripción de cualquier familia
--     (apply_subscription_transaction),
--   * disparar emisión masiva de notificaciones, cierres de ciclo, purgas
--     de datos y prunes a nivel global (cron_*, emit_*, *_notifications),
--   * leer entitlement / timezone / ciclo de cualquier usuario o familia
--     (resolve_entitlement, user_local_timezone, user_current_cycle_start).
--
-- Hay DOS formas en que estas funciones quedaban abiertas, y por eso se
-- revoca de `public, anon, authenticated` (no solo de anon/authenticated):
--   1. Grant explícito por rol (Supabase default privileges):
--      acl = {... anon=X/postgres, authenticated=X/postgres ...}
--      → `revoke from anon, authenticated` lo limpia.
--   2. Grant a PUBLIC (default de Postgres al crear la función, nunca revocado):
--      acl = {=X/postgres, ...}  (el grantee vacío antes del `=` es PUBLIC)
--      → `revoke from anon, authenticated` es NO-OP acá; authenticated hereda
--        el EXECUTE vía PUBLIC. Hay que `revoke from public`.
--   Varias de estas funciones (cron_emit_*, emit_notification,
--   emit_notifications_bulk_returning, advance_streak, user_local_timezone)
--   estaban en el caso 2, por eso un primer revoke solo-de-roles no las cerró.
--
-- Tras el revoke, las llamadas internas (función definer → función definer,
-- pg_cron, service_role) siguen funcionando: el chequeo de EXECUTE en las
-- llamadas anidadas se hace contra el owner (postgres), y service_role
-- conserva su grant explícito. Solo se cierra la puerta a anon/authenticated.
--
-- Funciones trigger SECURITY DEFINER (tr_award_*, handle_*, guard_*, etc.)
-- NO se tocan: no son invocables directamente como RPC y el firing del
-- trigger no chequea EXECUTE, así que no son vector de leak.

-- Relay de notificaciones (solo orchestrator vía service_role / pg_cron).
-- `dispatch_notifications_kind` se creó a mano en prod antes de esta migración, y
-- el repo recién la codificó en 20260709000322_sync_prod_function_sources. Por eso
-- en un replay desde cero (local / staging) todavía no existe acá. El revoke se
-- re-afirma al final de esa migración, así que la postura de seguridad es la misma
-- en prod y en una base reconstruida.
do $$
begin
  if to_regprocedure('public.dispatch_notifications_kind(text)') is not null then
    revoke execute on function public.dispatch_notifications_kind(text) from public, anon, authenticated;
  end if;
end $$;
revoke execute on function public.emit_notification(uuid,uuid,text,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.emit_notifications_bulk(jsonb) from public, anon, authenticated;
revoke execute on function public.emit_notifications_bulk_returning(jsonb) from public, anon, authenticated;
revoke execute on function public.list_pending_notifications(text) from public, anon, authenticated;
revoke execute on function public.mark_notifications_pushed(uuid[]) from public, anon, authenticated;

-- Jobs de pg_cron (corren como postgres; los tests los llaman vía service_role).
revoke execute on function public.cron_apply_retention_policies() from public, anon, authenticated;
revoke execute on function public.cron_cleanup_notifications_ephemeral() from public, anon, authenticated;
revoke execute on function public.cron_close_previous_cycles() from public, anon, authenticated;
revoke execute on function public.cron_compute_velocity_snapshots() from public, anon, authenticated;
revoke execute on function public.cron_detect_price_hikes() from public, anon, authenticated;
revoke execute on function public.cron_detect_zombies() from public, anon, authenticated;
revoke execute on function public.cron_emit_evening_checkins() from public, anon, authenticated;
revoke execute on function public.cron_emit_fixed_upcoming() from public, anon, authenticated;
revoke execute on function public.cron_emit_midday_checkins() from public, anon, authenticated;
revoke execute on function public.cron_emit_morning_checkins() from public, anon, authenticated;
revoke execute on function public.cron_emit_streak_at_risk() from public, anon, authenticated;
revoke execute on function public.cron_emit_streak_broken() from public, anon, authenticated;
revoke execute on function public.cron_emit_streak_recovery_nudge() from public, anon, authenticated;
revoke execute on function public.cron_emit_weekly_insights() from public, anon, authenticated;
revoke execute on function public.cron_prune_advisor_interactions() from public, anon, authenticated;
revoke execute on function public.cron_prune_advisor_value_log() from public, anon, authenticated;
revoke execute on function public.cron_prune_fixed_payment_expenses() from public, anon, authenticated;
revoke execute on function public.cron_prune_home_telemetry() from public, anon, authenticated;
revoke execute on function public.cron_prune_rpc_rate_limits() from public, anon, authenticated;
revoke execute on function public.cron_prune_usage_audit() from public, anon, authenticated;
revoke execute on function public.cron_purge_archived_expenses() from public, anon, authenticated;
revoke execute on function public.cron_refresh_control_snapshots() from public, anon, authenticated;

-- Helpers de ciclo / racha / control (solo invocados por otras funciones
-- definer, triggers o pg_cron; nunca por el cliente).
revoke execute on function public._advance_streak_internal(uuid,uuid,date) from public, anon, authenticated;
revoke execute on function public.advance_streak(uuid,uuid,date) from public, anon, authenticated;
revoke execute on function public.recompute_user_streak(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.close_monthly_cycle(uuid,date,date,boolean) from public, anon, authenticated;
revoke execute on function public.try_close_previous_cycle(uuid) from public, anon, authenticated;
revoke execute on function public.compute_control_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.user_current_cycle_start(uuid) from public, anon, authenticated;
revoke execute on function public.user_local_timezone(uuid) from public, anon, authenticated;

-- Entitlement / suscripción (apply_* es el webhook de StoreKit vía service_role;
-- resolve_entitlement lo consume el snapshot del home y el seed, siempre internos).
revoke execute on function public.apply_subscription_transaction(uuid,text,text,text,timestamp with time zone,timestamp with time zone,boolean,text,timestamp with time zone,uuid,text) from public, anon, authenticated;
revoke execute on function public.resolve_entitlement(uuid) from public, anon, authenticated;

-- Rate-limit para llamadas service_role (la variante de usuario,
-- enforce_rate_limit(), sí usa auth.uid() y la siguen llamando las RPCs del cliente).
revoke execute on function public.enforce_rate_limit_for_user(uuid,text,integer,integer) from public, anon, authenticated;

-- db_health_snapshot NO se revoca: la pantalla "DB Health" (solo __DEV__) la
-- llama con el cliente authenticated del owner, y el test de integración la
-- corre vía service_role. Pero NO tenía chequeo interno → cualquier
-- authenticated podía leer tamaños de tablas, conteos y texto de slow queries.
-- Se le agrega el mismo guard que admin_search_users/admin_set_mvp: super-admin
-- o service_role/postgres (idéntico al patrón de audit_service_role_write).
CREATE OR REPLACE FUNCTION public.db_health_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_db_size bigint;
  v_table_sizes jsonb;
  v_growth jsonb;
  v_slow jsonb;
begin
  if not (
    public.is_super_admin()
    or auth.role() = 'service_role'
    or coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
    or current_user in ('service_role', 'postgres', 'supabase_admin')
  ) then
    raise exception 'forbidden';
  end if;

  select pg_database_size(current_database()) into v_db_size;

  select jsonb_agg(
    jsonb_build_object(
      'table', schemaname || '.' || relname,
      'total_bytes', pg_total_relation_size((schemaname||'.'||relname)::regclass),
      'rows_estimate', n_live_tup
    ) order by pg_total_relation_size((schemaname||'.'||relname)::regclass) desc
  ) into v_table_sizes
  from pg_stat_user_tables
  where schemaname = 'public';

  -- Growth: filas insertadas en los últimos 30 días para tablas con created_at.
  select jsonb_build_object(
    'expenses_30d', (select count(*) from public.expenses where created_at > now() - interval '30 days'),
    'notifications_30d', (select count(*) from public.notifications where created_at > now() - interval '30 days'),
    'monthly_summaries_total', (select count(*) from public.monthly_summaries)
  ) into v_growth;

  -- Slow queries (si pg_stat_statements está disponible)
  begin
    select jsonb_agg(jsonb_build_object(
      'query', left(query, 200),
      'mean_exec_ms', round(mean_exec_time::numeric, 2),
      'calls', calls,
      'total_ms', round(total_exec_time::numeric, 2)
    ) order by total_exec_time desc) into v_slow
    from (
      select * from public.pg_stat_statements
      order by total_exec_time desc limit 10
    ) s;
  exception when others then v_slow := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'db_size_bytes', v_db_size,
    'db_size_pretty', pg_size_pretty(v_db_size),
    'table_sizes', coalesce(v_table_sizes, '[]'::jsonb),
    'monthly_growth', v_growth,
    'slow_queries_top10', coalesce(v_slow, '[]'::jsonb),
    'limits_pro', jsonb_build_object(
      'db_limit_bytes', 8::bigint * 1024 * 1024 * 1024,
      'db_pct_used', round((v_db_size::numeric / (8::numeric * 1024 * 1024 * 1024)) * 100, 2)
    ),
    'computed_at', now()
  );
end;
$function$;
