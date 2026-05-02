-- ─────────────────────────────────────────────────────────────────────
-- Fix `cron_compute_velocity_snapshots` math
-- ─────────────────────────────────────────────────────────────────────
-- The original version (20260424150000_control_intelligence.sql, lines
-- 489-592) had five bugs that produced absurd `velocity` warnings in
-- the asesor card ("Cierre estimado $7M" / "+321% más rápido"):
--
--   1. `v_sum_7` and `v_sum_30` summed *every* expense — including
--      rows tied to a `commitment_id` (i.e. fixed-expense payments).
--      A week containing rent/internet/school dragged the daily
--      average up 3-4× and stayed in the 7-day window for a week
--      after the payment landed.
--
--   2. `v_libre := ingreso − fijos` was apples-to-oranges against
--      `v_forecast := avg_7 × días_calendario`, which (because of #1)
--      already counted fijos. The threshold `forecast > libre × 1.15`
--      always tripped during weeks when fijos posted.
--
--   3. `v_sum_fijos` summed `fixed_expenses.amount` directly — without
--      scaling by `frequency`. A quarterly $300k expense was being
--      counted as $300k/month instead of ~$100k/month, etc.
--
--   4. `v_days_in_month` came from the calendar month, not the user's
--      `salary_payment_day` cycle. The rest of the app respects the
--      pay cycle; this function ignored it, so its idea of "this
--      month" diverged from the cupo diario, the home dashboard, etc.
--
--   5. `v_forecast := avg_7 × días_calendario` projected the *whole*
--      cycle at the last 7 days' pace, ignoring whatever was already
--      spent. The honest cycle-close is `gastado_en_ciclo + avg_7 ×
--      días_restantes`. Without that, the number flips wildly with
--      every fresh purchase.
--
-- This migration:
--   • adds a small SQL helper `fixed_expense_monthly_equivalent` that
--     mirrors the TS `sumFixedMonthlyTotal` multipliers (4.33, 2.17,
--     1, 1/3, 1/6, 1/12) so `libre` is computed against an honest
--     monthly equivalent;
--   • rewrites `cron_compute_velocity_snapshots` end-to-end against
--     the user's pay cycle, with discretionary-only averages and a
--     real cycle-close forecast.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.fixed_expense_monthly_equivalent(
  p_amount numeric,
  p_frequency text
) returns numeric
language sql
immutable
as $$
  -- Standard monthly-equivalent multipliers — must stay in sync with
  -- `sumFixedMonthlyTotal` on the client.
  select coalesce(p_amount, 0) * case coalesce(p_frequency, 'monthly')
    when 'weekly'     then 4.33
    when 'biweekly'   then 2.17
    when 'monthly'    then 1.0
    when 'quarterly'  then 1.0 / 3.0
    when 'semiannual' then 1.0 / 6.0
    when 'annual'     then 1.0 / 12.0
    else 1.0
  end;
$$;

revoke all on function public.fixed_expense_monthly_equivalent(numeric, text) from public;
grant execute on function public.fixed_expense_monthly_equivalent(numeric, text) to authenticated;
grant execute on function public.fixed_expense_monthly_equivalent(numeric, text) to service_role;


create or replace function public.cron_compute_velocity_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_now   timestamptz := (v_today + interval '0 hours') at time zone 'America/Argentina/Buenos_Aires';
  v_rec record;
  v_payment_day int;
  v_cycle_start timestamptz;
  v_cycle_end   timestamptz;
  v_cycle_days  int;
  v_dias_transcurridos int;
  v_dias_restantes     int;
  v_sum_7  numeric(14,2);
  v_sum_30 numeric(14,2);
  v_avg_7  numeric(14,2);
  v_avg_30 numeric(14,2);
  v_momentum numeric(10,4);
  v_monthly_income numeric(14,2);
  v_savings_goal   numeric(14,2);
  v_sum_fijos      numeric(14,2);
  v_libre          numeric(14,2);
  v_gastado_ciclo  numeric(14,2);
  v_forecast       numeric(14,2);
  v_stress text;
begin
  for v_rec in
    select distinct e.family_id
    from public.expenses e
    where e.created_at >= (v_today - interval '30 days')::timestamptz
  loop
    begin
      -- ── Resolve the user's pay cycle ──────────────────────────────
      -- Same algorithm as `home_snapshot` / `family_dashboard`.
      select coalesce(ff.salary_payment_day, 1),
             coalesce(ff.monthly_income, 0),
             coalesce(ff.savings_goal, 0)
        into v_payment_day, v_monthly_income, v_savings_goal
        from public.family_finance ff
       where ff.family_id = v_rec.family_id;

      if v_payment_day is null then
        v_payment_day := 1;
      end if;

      if extract(day from v_today)::int >= v_payment_day then
        v_cycle_start := date_trunc('day', make_date(
          extract(year from v_today)::int,
          extract(month from v_today)::int,
          least(v_payment_day,
                extract(day from
                  (date_trunc('month', v_today) + interval '1 month' - interval '1 day')
                )::int)
        ))::timestamptz;
      else
        v_cycle_start := date_trunc('day',
          (date_trunc('month', v_today) - interval '1 month')
          + (least(v_payment_day,
                   extract(day from
                     (date_trunc('month', v_today) - interval '1 day')
                   )::int) - 1) * interval '1 day'
        )::timestamptz;
      end if;
      v_cycle_end := v_cycle_start + interval '1 month';
      v_cycle_days := greatest(
        1,
        round(extract(epoch from (v_cycle_end - v_cycle_start)) / 86400.0)::int
      );
      v_dias_transcurridos := greatest(
        0,
        round(extract(epoch from (v_today::timestamptz - v_cycle_start)) / 86400.0)::int
      );
      v_dias_transcurridos := least(v_dias_transcurridos, v_cycle_days);
      v_dias_restantes := greatest(0, v_cycle_days - v_dias_transcurridos);

      -- ── Discretionary-only spend (last 7 / 30 days) ───────────────
      -- BUG #1 fix: filter out commitment-tied expenses so the avg
      -- doesn't spike on rent/internet weeks.
      select coalesce(sum(e.price), 0) into v_sum_7
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.archived_at is null
         and e.commitment_id is null
         and e.created_at >= (v_today - interval '7 days')::timestamptz;

      select coalesce(sum(e.price), 0) into v_sum_30
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.commitment_id is null
         and e.created_at >= (v_today - interval '30 days')::timestamptz;

      v_avg_7  := round(v_sum_7  / 7.0,  2);
      v_avg_30 := round(v_sum_30 / 30.0, 2);

      if v_avg_30 > 0 then
        v_momentum := round(v_avg_7 / v_avg_30, 4);
      else
        v_momentum := 1;
      end if;

      -- ── What's already been spent IN THIS CYCLE (discretionary) ───
      select coalesce(sum(e.price), 0) into v_gastado_ciclo
        from public.expenses e
       where e.family_id = v_rec.family_id
         and e.archived_at is null
         and e.commitment_id is null
         and e.created_at >= v_cycle_start
         and e.created_at <  v_cycle_end;

      -- ── Monthly-equivalent fijos (BUG #3 fix) ─────────────────────
      select coalesce(
        sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency)),
        0
      ) into v_sum_fijos
        from public.fixed_expenses fe
       where fe.family_id = v_rec.family_id
         and coalesce(fe.status, 'active') = 'active';

      -- ── Libre = ingreso − fijos − ahorro (BUG #2 fix domain) ──────
      v_libre := greatest(
        0,
        v_monthly_income - coalesce(v_sum_fijos, 0) - coalesce(v_savings_goal, 0)
      );

      -- ── Cycle-close forecast (BUG #5 fix) ─────────────────────────
      -- "Si el resto del ciclo se mantiene al ritmo de los últimos
      --  7 días, ¿cuánto cierra?" — gastado real + ritmo × días que
      -- faltan, NOT avg_7 × días_calendario.
      v_forecast := round(v_gastado_ciclo + v_avg_7 * v_dias_restantes, 2);

      -- ── Stress level (apple-to-apple now) ─────────────────────────
      -- Both sides of the comparison live in the same domain: cycle
      -- discretionary close vs cycle discretionary budget.
      if v_libre <= 0 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.15 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.00 then
        v_stress := 'warn';
      elsif v_forecast > v_libre * 0.85 then
        v_stress := 'watch';
      else
        v_stress := 'calm';
      end if;

      insert into public.velocity_snapshots (
        family_id, snapshot_date,
        avg_daily_last_7, avg_daily_last_30,
        momentum, forecast_close_amount, stress_level
      ) values (
        v_rec.family_id, v_today,
        v_avg_7, v_avg_30,
        v_momentum, v_forecast, v_stress
      )
      on conflict (family_id, snapshot_date) do update set
        avg_daily_last_7 = excluded.avg_daily_last_7,
        avg_daily_last_30 = excluded.avg_daily_last_30,
        momentum = excluded.momentum,
        forecast_close_amount = excluded.forecast_close_amount,
        stress_level = excluded.stress_level;

    exception when others then
      raise notice 'velocity snapshot failed for family %: %',
        v_rec.family_id, sqlerrm;
    end;
  end loop;

  -- Avoid unused-variable warning when no families match the loop.
  perform v_now;
exception when others then
  raise notice 'cron_compute_velocity_snapshots: %', sqlerrm;
end;
$$;

revoke all on function public.cron_compute_velocity_snapshots() from public;
grant execute on function public.cron_compute_velocity_snapshots() to service_role;
grant execute on function public.cron_compute_velocity_snapshots() to authenticated;
