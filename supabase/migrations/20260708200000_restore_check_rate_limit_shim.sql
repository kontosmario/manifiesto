-- ════════════════════════════════════════════════════════════════════
-- HOTFIX CRÍTICO: 20260708190000 dropeó check_rate_limit(text,int,int)
-- creyéndola sin llamadores (la verificación buscó escritores de la
-- TABLA legacy, no llamadores de la FUNCIÓN). En realidad la llaman 7
-- RPCs vivas: apply_month_close_decision, apply_reserve_decision,
-- cancel_account_deletion, clear_pin_failures, consume_family_invite,
-- create_family_invite, track_pin_failure — todas rotas con
-- "function does not exist" ("No pudimos guardar tu decisión" en el
-- wrapped, reporte del owner).
--
-- Fix: recrear check_rate_limit como SHIM que delega en el guard
-- moderno enforce_rate_limit (misma semántica de args: acción, máximo
-- de intentos, ventana en segundos) — que escribe en rpc_rate_limits
-- (plural, la tabla viva con purga diaria ya reparada en 20260708180000).
-- Una sola función restaura los 7 llamadores sin re-emitirlos.
--
-- Contexto honesto: antes de la limpieza, esos 7 RPCs escribían en la
-- tabla singular y el cron viejo la purgaba — el sistema legacy SÍ
-- estaba vivo, solo que con volumen bajísimo. El estado final (una
-- tabla, un guard, una purga) es el correcto; el agujero fueron las
-- ~2 horas entre 190000 y este shim.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.check_rate_limit(
  p_rpc text,
  p_max integer,
  p_window_seconds integer
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  select public.enforce_rate_limit(p_rpc, p_max, p_window_seconds);
$$;

-- Helper interno: solo lo invocan funciones SECURITY DEFINER (corren
-- como owner). Revoke completo incluyendo PUBLIC (gotcha proacl =X).
revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
