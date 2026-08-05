DO $$
DECLARE
  v_family uuid := '3d7f2031-50c9-47fa-8892-2b4cf95043ad';
  v_mario  uuid := 'ba9dd732-9434-4874-8021-66334dd98726';
  goal_vac uuid;
  c record;
  v_var numeric; v_fix numeric; v_total numeric; v_cnt int; v_fcnt int; v_extra numeric;
  v_cat jsonb; v_daily jsonb; v_member jsonb; v_top jsonb; v_mood text;
  v_sobrante numeric; v_delta numeric; v_prev numeric := NULL; v_sid uuid;
  v_last_sobrante numeric := 0; v_total_days int;
BEGIN
  -- Guard de reproducibilidad: ver 20260625223322_sim_account_mario_kenility_01_setup.
  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = v_family) THEN
    RAISE NOTICE 'sim_account_kenility_03: familia demo ausente, se omite (esperado fuera de prod)';
    RETURN;
  END IF;

  SELECT id INTO goal_vac FROM public.savings_goals WHERE family_id=v_family AND title='Vacaciones en Brasil';

  FOR c IN SELECT * FROM (VALUES
      (1,'2026-02-22'::date,'2026-03-04'::date,'Febrero', 3200000::numeric,  400000::numeric,'acumular'),
      (2,'2026-03-05'::date,'2026-04-04'::date,'Marzo',   8000000::numeric,  950000::numeric,'meta'),
      (3,'2026-04-05'::date,'2026-05-04'::date,'Abril',   8000000::numeric, 1100000::numeric,'acumular'),
      (4,'2026-05-05'::date,'2026-06-04'::date,'Mayo',    8000000::numeric, 1200000::numeric,'meta')
    ) v(n,ps,pe,label,income,savings,decision) LOOP

    SELECT coalesce(sum(price) filter (where commitment_id is null),0),
           coalesce(sum(price) filter (where commitment_id is not null),0),
           coalesce(sum(price),0),
           count(*) filter (where commitment_id is null),
           count(*) filter (where commitment_id is not null)
      INTO v_var, v_fix, v_total, v_cnt, v_fcnt
      FROM public.expenses e WHERE e.family_id=v_family
       AND (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN c.ps AND c.pe;

    SELECT coalesce(sum(amount),0) INTO v_extra FROM public.income_events ie
     WHERE ie.family_id=v_family AND ie.event_date BETWEEN c.ps AND c.pe;

    SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'total',tot) ORDER BY tot DESC),'[]'::jsonb) INTO v_cat FROM (
      SELECT cat.name, sum(e.price) tot FROM public.expenses e JOIN public.categories cat ON cat.id=e.category_id
      WHERE e.family_id=v_family AND (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN c.ps AND c.pe
      GROUP BY cat.name) s;
    SELECT coalesce(jsonb_object_agg(d::text, tot),'{}'::jsonb) INTO v_daily FROM (
      SELECT (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date d, sum(e.price) tot FROM public.expenses e
      WHERE e.family_id=v_family AND (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN c.ps AND c.pe GROUP BY 1) s;
    SELECT coalesce(jsonb_object_agg(coalesce(created_by::text,'?'), tot),'{}'::jsonb) INTO v_member FROM (
      SELECT created_by, sum(price) tot FROM public.expenses e
      WHERE e.family_id=v_family AND (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN c.ps AND c.pe GROUP BY created_by) s;
    SELECT jsonb_build_object('description',description,'price',price,'category_id',category_id) INTO v_top
      FROM public.expenses e WHERE e.family_id=v_family
       AND (e.created_at AT TIME ZONE 'America/Argentina/Cordoba')::date BETWEEN c.ps AND c.pe ORDER BY price DESC LIMIT 1;

    v_delta := CASE WHEN v_prev IS NULL OR v_prev=0 THEN NULL ELSE round((v_total - v_prev)/v_prev*100,1) END;
    v_mood  := CASE WHEN v_total <= c.income*0.75 THEN 'green' WHEN v_total <= c.income*0.95 THEN 'yellow' ELSE 'red' END;
    v_sobrante := greatest(0, c.income + v_extra - v_total - c.savings);

    INSERT INTO public.monthly_summaries(family_id,period_start,period_end,period_label,
      total_variable_spent,total_fixed_spent,total_spent,expenses_count,fixed_paid_count,
      monthly_income,savings_goal_amount,savings_delta,category_breakdown,daily_totals,by_member,
      top_expense,delta_vs_previous_percent,mood,extra_income,created_at,wrapped_seen_at)
    VALUES(v_family,c.ps,c.pe,c.label,v_var,v_fix,v_total,v_cnt,v_fcnt,
      c.income,1500000,c.savings,v_cat,v_daily,v_member,v_top,v_delta,v_mood,v_extra,
      (c.pe + interval '1 day 10 hours') AT TIME ZONE 'America/Argentina/Cordoba',
      (c.pe + interval '1 day 11 hours') AT TIME ZONE 'America/Argentina/Cordoba')
    RETURNING id INTO v_sid;

    INSERT INTO public.month_close_decisions(family_id,sobrante,decision,meta_goal_id,decided_at,decided_by,monthly_summary_id)
    VALUES(v_family,v_sobrante,c.decision,CASE WHEN c.decision='meta' THEN goal_vac ELSE NULL END,
      (c.pe + interval '1 day 11 hours') AT TIME ZONE 'America/Argentina/Cordoba',v_mario,v_sid);

    v_prev := v_total; v_last_sobrante := v_sobrante;
  END LOOP;

  UPDATE public.family_finance SET current_cycle_starting_balance = v_last_sobrante WHERE family_id=v_family;

  SELECT count(DISTINCT (created_at AT TIME ZONE 'America/Argentina/Cordoba')::date) INTO v_total_days
    FROM public.expenses WHERE family_id=v_family;

  INSERT INTO public.user_streaks(family_id,user_id,current_streak,longest_streak,total_days_logged,
      last_logged_date,freeze_tokens,days_since_last_token_grant,created_at,updated_at)
  VALUES(v_family,v_mario,16,31,v_total_days,'2026-06-25',2,4,'2026-02-22 14:00:00-03',now())
  ON CONFLICT (family_id,user_id) DO UPDATE SET
    current_streak=excluded.current_streak, longest_streak=excluded.longest_streak,
    total_days_logged=excluded.total_days_logged, last_logged_date=excluded.last_logged_date,
    freeze_tokens=excluded.freeze_tokens, days_since_last_token_grant=excluded.days_since_last_token_grant,
    updated_at=excluded.updated_at;

  INSERT INTO public.streak_marked_days(family_id,user_id,marked_date,marked_at)
  SELECT v_family,v_mario,d,(d + interval '21 hours') AT TIME ZONE 'America/Argentina/Cordoba'
  FROM (VALUES ('2026-03-30'::date),('2026-04-22'::date),('2026-05-18'::date),('2026-06-09'::date),('2026-06-21'::date)) g(d)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.garden_recovered_days(family_id,user_id,day,created_at) VALUES
    (v_family,v_mario,'2026-05-02','2026-05-03 09:00:00-03'),
    (v_family,v_mario,'2026-06-03','2026-06-04 09:00:00-03')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.achievements_earned(user_id,code,family_id,earned_at,context) VALUES
    (v_mario,'first_expense',          v_family,'2026-02-22 15:30:00-03','{}'),
    (v_mario,'first_fixed',            v_family,'2026-02-22 16:00:00-03','{}'),
    (v_mario,'first_goal',             v_family,'2026-02-22 16:30:00-03','{}'),
    (v_mario,'first_paid_fixed',       v_family,'2026-03-05 10:00:00-03','{}'),
    (v_mario,'streak_7',               v_family,'2026-03-01 21:00:00-03','{}'),
    (v_mario,'streak_14',              v_family,'2026-03-09 21:00:00-03','{}'),
    (v_mario,'streak_30',              v_family,'2026-03-26 21:00:00-03','{}'),
    (v_mario,'first_cycle_under_budget',v_family,'2026-04-05 10:00:00-03','{}'),
    (v_mario,'goal_25',                v_family,'2026-04-10 12:00:00-03','{}'),
    (v_mario,'goal_50',                v_family,'2026-05-20 12:00:00-03','{}')
  ON CONFLICT DO NOTHING;
END $$;
