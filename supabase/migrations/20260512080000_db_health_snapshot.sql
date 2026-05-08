-- WHAT: db_health_snapshot() devuelve métricas de la DB.
-- WHY: Pantalla dev en mobile para chequeo rápido sin entrar a Supabase.

create or replace function public.db_health_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_db_size bigint;
  v_table_sizes jsonb;
  v_growth jsonb;
  v_slow jsonb;
begin
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
$$;

-- En vez de un rol custom, gateamos por el rol postgres (admin) +
-- el cliente solo lo invoca con service_role key en dev. Para mobile
-- dev, agregamos grant a authenticated y gateamos en el cliente
-- por __DEV__. Es info de la DB, no expone PII de otros usuarios.
revoke all on function public.db_health_snapshot() from public;
grant execute on function public.db_health_snapshot() to authenticated;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop function if exists public.db_health_snapshot();
