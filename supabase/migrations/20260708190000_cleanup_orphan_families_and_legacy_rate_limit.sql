-- ════════════════════════════════════════════════════════════════════
-- Limpieza aprobada por el owner (revisión de volúmenes DB Health):
--
--   1. FAMILIAS HUÉRFANAS (sin ninguna membresía): residuo de cuentas
--      de prueba borradas. Nadie puede volver a acceder a ellas (todo
--      el RLS ancla en family_members) y los crons nocturnos les
--      seguían calculando velocity y cerrando ciclos FANTASMA (3 de
--      los 5 snapshots del 2026-07-08 eran de familias muertas).
--      Todos los hijos tienen FK ON DELETE CASCADE; audit_log y
--      achievements_earned son SET NULL (el historial sobrevive).
--
--   2. Par LEGACY del primer rate limiter: tabla public.rpc_rate_limit
--      (singular, 0 filas desde mayo) + check_rate_limit (su único
--      escritor, sin llamadores). El guard vigente usa rpc_rate_limits
--      (plural) — el cron de purga ya fue re-apuntado en 20260708180000.
--
-- NO incluido a propósito: purga del ruido seed del audit_log (retención
-- 365d lo resuelve solo) y categories_legacy (backup del cutover del
-- catálogo global — hoy mismo un hotfix demostró que todavía vale oro).
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  v_orphans uuid[];
  v_deleted int;
begin
  select coalesce(array_agg(f.id), '{}') into v_orphans
  from public.families f
  where not exists (
    select 1 from public.family_members fm where fm.family_id = f.id
  );

  if coalesce(array_length(v_orphans, 1), 0) = 0 then
    raise notice 'sin familias huérfanas — nada que borrar';
    return;
  end if;

  -- Guard: el snapshot del 2026-07-08 contó 11. Si aparecen muchas más,
  -- algo cambió entre la revisión y el apply — abortar y revisar.
  if array_length(v_orphans, 1) > 12 then
    raise exception 'esperaba ~11 familias huérfanas, encontré % — abort',
      array_length(v_orphans, 1);
  end if;

  -- categories_legacy conserva el trigger prevent_categories_delete()
  -- del viejo modelo per-familia: exige este flag local (scope = esta
  -- transacción) para dejar pasar el CASCADE.
  perform set_config('app.allow_delete_categories', 'on', true);

  delete from public.families where id = any(v_orphans);
  get diagnostics v_deleted = row_count;
  raise notice 'familias huérfanas borradas: %', v_deleted;
end $$;

drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rpc_rate_limit;
