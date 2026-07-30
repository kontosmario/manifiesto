-- Fix tz del calendario de intensidad de ciclos cerrados.
--
-- `close_monthly_cycle` bucketeaba `daily_totals` por `date(created_at)` en la
-- tz de sesión de Postgres (UTC), corriendo los gastos nocturnos al día
-- siguiente — a diferencia del trigger de racha, ya corregido a tz local en
-- 20260427130000_streak_local_tz_fix.sql. El calendario de intensidad de un
-- ciclo CERRADO (rediseño Gastos, neo-gastos-screen) consume `daily_totals`,
-- así que un gasto de las 21–23:59 AR encendía el día equivocado.
--
-- Se ancla el bucketing a la misma tz que `cycle_disponible` usa para el "hoy"
-- del cupo: 'America/Argentina/Buenos_Aires'. Cambio QUIRÚRGICO — SOLO el
-- bucketing de `daily_totals` (2 puntos del CTE). NO toca el total, categorías,
-- aporte-por-miembro, top-gasto (ninguno agrupa por día), la ventana del ciclo,
-- el saldo/sobrante ni el archivado de gastos. La ventana de selección no
-- cambia → la suma de daily_totals es idéntica; solo cambian las etiquetas de
-- día. Solo afecta CIERRES FUTUROS: los monthly_summaries ya cerrados no se
-- reprocesan (quedan con su intensidad histórica en UTC).
--
-- Se auto-parcha desde la definición viva para no duplicar las ~340 líneas de
-- la función (que evolucionó a través de varias migraciones), con guards que
-- abortan si no encuentra exactamente 2 ocurrencias o si ya fue aplicada.
do $mig$
declare
  v_def text;
  v_cnt int;
begin
  v_def := pg_get_functiondef('public.close_monthly_cycle(uuid,date,date,boolean)'::regprocedure);
  v_cnt := (length(v_def) - length(replace(v_def, 'date(e.created_at)', ''))) / length('date(e.created_at)');
  if v_cnt <> 2 then
    raise exception 'Abort rollup tz fix: se esperaban exactamente 2 ocurrencias de date(e.created_at), se encontraron %', v_cnt;
  end if;
  if position('at time zone ''America/Argentina/Buenos_Aires''' in v_def) > 0 then
    raise exception 'Abort rollup tz fix: la funcion ya contiene el ancla de tz AR (ya aplicada?)';
  end if;
  v_def := replace(
    v_def,
    'date(e.created_at)',
    'date(e.created_at at time zone ''America/Argentina/Buenos_Aires'')'
  );
  execute v_def;
end $mig$;
