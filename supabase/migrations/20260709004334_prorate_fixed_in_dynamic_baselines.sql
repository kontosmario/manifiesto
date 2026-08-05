-- ════════════════════════════════════════════════════════════════════
-- Review-loop de la auditoría backend (2026-07-08) — finding del
-- verificador sobre el fix A2 de 20260708230000:
--
-- En modo DINÁMICO con ciclo corto (semanal/quincenal), tanto
-- compute_control_snapshot como cron_compute_velocity_snapshots
-- restaban el mes COMPLETO de fijos al ingreso de UN ciclo → v_libre
-- negativo (overshoot/stress clavados en 0 con el guard v_libre>0) o
-- subestimado (overshoot inflado). Fix: prorratear el equivalente
-- mensual de fijos por (días del ciclo / días del mes del inicio).
-- Misma técnica de cirugía verbatim-base que 20260708230000.
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
    -- Entorno fresco cuya cadena local difiere del vivo de prod (drift
    -- documentado del proyecto): no abortar el provisioning; el estado
    -- queda como lo dejó la cadena local. En prod este camino no corre
    -- (la migración ya está en el ledger).
    raise warning 'patch_fn %: ancla ausente — parche omitido (replay en entorno fresco)', p_fn;
    return;
  end if;
  execute replace(src, p_from, p_to);
end;
$helper$;

-- 1 · compute_control_snapshot: fijos prorrateados en el branch dinámico
select pg_temp.patch_fn(
  'public.compute_control_snapshot(uuid)'::regprocedure,
  'select coalesce(sum(ie.amount), 0) into v_libre
    from public.compute_pay_cycle(
      current_date,
      coalesce(v_finance.cycle_type, ''monthly''),
      coalesce(v_finance.salary_payment_day, 1)::smallint,
      v_finance.cycle_anchor_date,
      v_finance.cycle_length_days
    ) cp
    left join public.income_events ie
      on ie.family_id = p_family_id
     and ie.event_date >= cp.cycle_start
     and ie.event_date < cp.cycle_end_exclusive;
    v_libre := v_libre - coalesce((
        select sum(fe.amount)
        from public.fixed_expenses fe
        where fe.family_id = p_family_id
          and coalesce(fe.status, ''active'') = ''active''
      ), 0);',
  '-- Fijos PRORRATEADOS al largo del ciclo (review 2026-07-08): restar
    -- el mes completo de fijos a un ciclo semanal/quincenal dejaba
    -- v_libre negativo (overshoot clavado en 0) o subestimado.
    select coalesce(sum(ie.amount), 0)
           - coalesce((
               select sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency))
               from public.fixed_expenses fe
               where fe.family_id = p_family_id
                 and coalesce(fe.status, ''active'') = ''active''
             ), 0)
             * least(1.0, (cp.cycle_end_exclusive - cp.cycle_start)::numeric
                 / extract(day from (date_trunc(''month'', cp.cycle_start::timestamp)
                     + interval ''1 month - 1 day''))::numeric)
      into v_libre
    from public.compute_pay_cycle(
      current_date,
      coalesce(v_finance.cycle_type, ''monthly''),
      coalesce(v_finance.salary_payment_day, 1)::smallint,
      v_finance.cycle_anchor_date,
      v_finance.cycle_length_days
    ) cp
    left join public.income_events ie
      on ie.family_id = p_family_id
     and ie.event_date >= cp.cycle_start
     and ie.event_date < cp.cycle_end_exclusive
    group by cp.cycle_start, cp.cycle_end_exclusive;');

-- 2 · cron_compute_velocity_snapshots: misma proration para el stress
select pg_temp.patch_fn(
  'public.cron_compute_velocity_snapshots()'::regprocedure,
  'v_eff_income - coalesce(v_sum_fijos, 0)',
  'v_eff_income - coalesce(v_sum_fijos, 0)
          -- Dinámico: fijos prorrateados al largo del ciclo (review 2026-07-08)
          * (case when v_income_mode = ''dynamic''
               then least(1.0, v_cycle_days::numeric
                 / extract(day from (date_trunc(''month'', v_cycle_start)
                     + interval ''1 month - 1 day''))::numeric)
               else 1 end)');
