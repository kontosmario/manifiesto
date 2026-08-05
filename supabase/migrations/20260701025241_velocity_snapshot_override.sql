-- El fallback de velocity (velocity_snapshots, usado por el asistente en ciclos
-- jóvenes con <7 días cerrados) calculaba v_libre = monthly_income − fijos −
-- ahorro, ignorando el override. Con override activo, el presupuesto del ciclo
-- es el override (BRUTO), no el sueldo recurrente. Fix: v_eff_income = override
-- cuando el anchor == inicio del ciclo actual (mismo criterio que
-- cycle_disponible). Los fijos siguen siendo el equivalente mensual (diseño
-- pre-existente del cron; fuera de alcance). Verificado: kontosmario pasa a
-- v_eff_income=6.539.107,83 (era 6.400.000).
CREATE OR REPLACE FUNCTION public.cron_compute_velocity_snapshots()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_anchor date;
  v_override numeric(14,2);
  v_eff_income numeric(14,2);
begin
  for v_rec in
    select distinct e.family_id
    from public.expenses e
    where e.created_at >= (v_today - interval '30 days')::timestamptz
  loop
    begin
      -- ── Resolve the user's pay cycle ──────────────────────────────
      select coalesce(ff.salary_payment_day, 1),
             coalesce(ff.monthly_income, 0),
             coalesce(ff.savings_goal, 0),
             ff.current_cycle_anchor,
             ff.current_cycle_starting_balance
        into v_payment_day, v_monthly_income, v_savings_goal, v_anchor, v_override
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

      -- ── Override del ciclo (mismo criterio que cycle_disponible) ───
      -- Si el usuario confirmó un saldo para ESTE ciclo (anchor == inicio del
      -- ciclo actual), ese es el presupuesto BRUTO; sino, el sueldo recurrente.
      v_eff_income := case
        when v_anchor is not null
             and v_anchor = v_cycle_start::date
             and v_override is not null and v_override >= 0
          then v_override
        else v_monthly_income
      end;

      -- ── Discretionary-only spend (last 7 / 30 days) ───────────────
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

      -- ── Monthly-equivalent fijos ──────────────────────────────────
      select coalesce(
        sum(public.fixed_expense_monthly_equivalent(fe.amount, fe.frequency)),
        0
      ) into v_sum_fijos
        from public.fixed_expenses fe
       where fe.family_id = v_rec.family_id
         and coalesce(fe.status, 'active') = 'active';

      -- ── Libre = ingreso EFECTIVO (override si aplica) − fijos − ahorro ──
      v_libre := greatest(
        0,
        v_eff_income - coalesce(v_sum_fijos, 0) - coalesce(v_savings_goal, 0)
      );

      -- ── Cycle-close forecast ──────────────────────────────────────
      v_forecast := round(v_gastado_ciclo + v_avg_7 * v_dias_restantes, 2);

      -- ── Stress level (apple-to-apple) ─────────────────────────────
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

  perform v_now;
exception when others then
  raise notice 'cron_compute_velocity_snapshots: %', sqlerrm;
end;
$function$;
