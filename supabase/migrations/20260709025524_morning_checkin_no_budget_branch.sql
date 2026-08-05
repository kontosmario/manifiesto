-- ════════════════════════════════════════════════════════════════════
-- Review-loop (2026-07-08, 2da vuelta): R4b de 20260708250000 quedó
-- incompleto — la rama "dinámico sin presupuesto" del morning check-in
-- exigía raw_cycle_balance = 0 EXACTO, pero el primer gasto logueado lo
-- vuelve negativo → un dinámico sin ingresos que registró un café de
-- $3.500 recibía 'ya vas $3.500 arriba del plan' (no hay plan del cual
-- estar arriba). La condición correcta es la AUSENCIA de presupuesto
-- (sin income_events del ciclo y sin override), no el balance.
-- Misma cirugía verbatim-base de siempre.
-- ════════════════════════════════════════════════════════════════════

create or replace function pg_temp.patch_fn(p_fn regprocedure, p_from text, p_to text)
returns void language plpgsql as $helper$
declare
  src text;
  n int;
begin
  src := pg_get_functiondef(p_fn);
  n := (length(src) - length(replace(src, p_from, ''))) / length(p_from);
  if n > 1 then
    raise exception 'patch_fn %: ancla ambigua (% veces)', p_fn, n;
  end if;
  if n = 0 then
    raise warning 'patch_fn %: ancla ausente — parche omitido (replay en entorno fresco)', p_fn;
    return;
  end if;
  execute replace(src, p_from, p_to);
end;
$helper$;

-- A · exponer has_override + presencia de ingresos del ciclo en la CTE
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'd.daily_budget, d.available_today, d.raw_cycle_balance, c.income_mode
      from cycle c',
  'd.daily_budget, d.available_today, d.raw_cycle_balance, c.income_mode,
        d.has_override,
        exists (
          select 1 from public.income_events ie
          where ie.family_id = c.family_id
            and ie.event_date >= c.cycle_start::date
        ) as has_cycle_income
      from cycle c');

-- B · la rama "sin presupuesto" gatilla por AUSENCIA de ingresos, no
--     por balance = 0 (cubre al dinámico que ya gastó sin ingresos)
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'when f.raw_cycle_balance = 0 and coalesce(f.income_mode, ''fixed'') = ''dynamic'' and coalesce(f.daily_budget, 0) = 0 then',
  'when coalesce(f.income_mode, ''fixed'') = ''dynamic''
             and not f.has_cycle_income
             and not coalesce(f.has_override, false) then');

-- C · severity de esa rama = info (aunque el balance sea negativo)
select pg_temp.patch_fn(
  'public.list_pending_notifications(text)'::regprocedure,
  'case when not f.confirmado then ''warning'' when f.raw_cycle_balance >= 0 then ''info'' else ''warning'' end as severity,',
  'case when not f.confirmado then ''warning''
           when coalesce(f.income_mode, ''fixed'') = ''dynamic''
             and not f.has_cycle_income
             and not coalesce(f.has_override, false) then ''info''
           when f.raw_cycle_balance >= 0 then ''info''
           else ''warning'' end as severity,');
