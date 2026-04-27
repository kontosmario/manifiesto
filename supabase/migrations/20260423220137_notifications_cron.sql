-- ════════════════════════════════════════════════════════════════════
-- Notifications — Fase 4 (pg_cron scheduled emits)
--
-- Adds SECURITY DEFINER functions that walk family / user state and
-- emit rows into public.notifications via public.emit_notification,
-- then schedules them via pg_cron. Everything is idempotent per-day
-- so the cron can fire twice in a slot without duplicating. If
-- pg_cron is not available on the project plan, the extension
-- creation + schedule calls are wrapped so the migration still applies.
-- All "today" derivations use America/Argentina/Buenos_Aires.
-- ════════════════════════════════════════════════════════════════════

-- ─── 0 · Enable pg_cron (graceful) ───────────────────────────────────
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available on this project plan: %', sqlerrm;
end;
$$;

-- ─── 1 · Morning check-in ────────────────────────────────────────────
create or replace function public.cron_emit_morning_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_fixed_total numeric(12,2);
  v_opening numeric(12,2);
  v_cycle_day integer;
  v_first_name text;
begin
  for v_rec in
    select
      fm.family_id,
      fm.user_id,
      ff.monthly_income,
      ff.salary_payment_day,
      coalesce(p.display_name, 'vos') as display_name
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.profiles p on p.id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      -- Skip if user already got today's morning check-in.
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = 'checkin_morning'
          and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
      ) then
        continue;
      end if;

      select coalesce(sum(fe.amount), 0) into v_fixed_total
      from public.fixed_expenses fe
      where fe.family_id = v_rec.family_id
        and coalesce(fe.status, 'active') = 'active'
        and coalesce(fe.frequency, 'monthly') = 'monthly';

      v_opening := greatest(0, (v_rec.monthly_income - coalesce(v_fixed_total, 0)) / 30.0);

      v_cycle_day := 1 + ((extract(day from v_today)::int - coalesce(v_rec.salary_payment_day, 1) + 30) % 30);

      v_first_name := split_part(btrim(v_rec.display_name), ' ', 1);
      if v_first_name = '' then v_first_name := 'vos'; end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        'Buen día, ' || v_first_name,
        'Hoy tenés ~$' || to_char(round(v_opening), 'FM999,999,999') || ' para moverte con margen.',
        'checkin_morning',
        'info',
        null,
        jsonb_build_object('route', '/', 'cycle_day', v_cycle_day)
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 2 · Midday check-in ─────────────────────────────────────────────
create or replace function public.cron_emit_midday_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_fixed_total numeric(12,2);
  v_opening numeric(12,2);
  v_spent_today numeric(12,2);
  v_title text;
  v_body text;
  v_severity text;
begin
  for v_rec in
    select
      fm.family_id,
      fm.user_id,
      ff.monthly_income
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = 'checkin_midday'
          and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
      ) then
        continue;
      end if;

      select coalesce(sum(fe.amount), 0) into v_fixed_total
      from public.fixed_expenses fe
      where fe.family_id = v_rec.family_id
        and coalesce(fe.status, 'active') = 'active'
        and coalesce(fe.frequency, 'monthly') = 'monthly';

      v_opening := greatest(0, (v_rec.monthly_income - coalesce(v_fixed_total, 0)) / 30.0);

      select coalesce(sum(e.price), 0) into v_spent_today
      from public.expenses e
      where e.family_id = v_rec.family_id
        and e.created_by = v_rec.user_id
        and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;

      if v_spent_today > v_opening then
        v_title := 'Ojo con el ritmo';
        v_body := 'Ya llevás $' || to_char(round(v_spent_today), 'FM999,999,999')
                  || ' hoy, pasaste el margen (~$' || to_char(round(v_opening), 'FM999,999,999') || '). Bajá un cambio el resto del día.';
        v_severity := 'warning';
      else
        v_title := 'Medio día';
        v_body := 'Llevás $' || to_char(round(v_spent_today), 'FM999,999,999')
                  || ' de $' || to_char(round(v_opening), 'FM999,999,999') || ' de hoy. Vas bien.';
        v_severity := 'info';
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        v_title,
        v_body,
        'checkin_midday',
        v_severity,
        null,
        jsonb_build_object('route', '/', 'spent_today', v_spent_today, 'opening', v_opening)
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 3 · Evening check-in ────────────────────────────────────────────
create or replace function public.cron_emit_evening_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_spent_today numeric(12,2);
  v_logged_today boolean;
  v_body text;
begin
  for v_rec in
    select
      fm.family_id,
      fm.user_id
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = 'checkin_evening'
          and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
      ) then
        continue;
      end if;

      select coalesce(sum(e.price), 0), count(*) > 0 into v_spent_today, v_logged_today
      from public.expenses e
      where e.family_id = v_rec.family_id
        and e.created_by = v_rec.user_id
        and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;

      if coalesce(v_logged_today, false) then
        v_body := 'Hoy cargaste $' || to_char(round(v_spent_today), 'FM999,999,999')
                  || '. Si te faltó algo, anotalo antes de dormir y mantené la racha.';
      else
        v_body := 'Todavía no cargaste nada hoy. Anotá un último movimiento y mantené la racha viva.';
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        'Cierre del día',
        v_body,
        'checkin_evening',
        'info',
        null,
        jsonb_build_object('route', '/expenses', 'spent_today', v_spent_today, 'logged_today', coalesce(v_logged_today, false))
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 4 · Streak at risk (20:00 AR) ───────────────────────────────────
create or replace function public.cron_emit_streak_at_risk()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_level_start integer;
  v_regression integer;
  v_kind text;
  v_title text;
  v_body text;
  v_severity text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.current_streak, us.freeze_tokens, us.last_logged_date
    from public.user_streaks us
    where us.current_streak > 0
      and (us.last_logged_date is null or us.last_logged_date < v_today)
  loop
    begin
      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint';
        v_title := 'Tu escudo está listo';
        v_body := 'Si no cargás nada hoy, a la medianoche se va a usar 1 escudo para salvar tu racha.';
        v_severity := 'warning';
      else
        v_level_start := case
          when v_rec.current_streak >= 90 then 90
          when v_rec.current_streak >= 60 then 60
          when v_rec.current_streak >= 30 then 30
          when v_rec.current_streak >= 14 then 14
          when v_rec.current_streak >= 7 then 7
          else 0
        end;
        v_regression := v_level_start + 1;
        v_kind := 'streak_at_risk';
        v_title := 'Tu racha está en riesgo';
        v_body := 'Si no cargás hoy, volvés al día ' || v_regression
                  || ' (perdés ' || greatest(0, v_rec.current_streak - v_regression) || ' días).';
        v_severity := 'warning';
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = v_kind
          and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
      ) then
        continue;
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        v_title,
        v_body,
        v_kind,
        v_severity,
        null,
        jsonb_build_object('route', '/expenses', 'current_streak', v_rec.current_streak, 'freeze_tokens', v_rec.freeze_tokens)
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 5 · Streak broken (23:59 AR = 02:59 UTC next day) ───────────────
create or replace function public.cron_emit_streak_broken()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_new_tokens smallint;
  v_level_start integer;
  v_regression integer;
begin
  for v_rec in
    select us.id, us.family_id, us.user_id, us.current_streak, us.freeze_tokens, us.last_logged_date
    from public.user_streaks us
    where us.current_streak > 0
      and (us.last_logged_date is null or us.last_logged_date < v_today)
  loop
    begin
      if v_rec.freeze_tokens > 0 then
        -- Consume a shield: decrement tokens, mark today as logged, keep streak.
        v_new_tokens := v_rec.freeze_tokens - 1;
        update public.user_streaks
        set freeze_tokens = v_new_tokens,
            last_logged_date = v_today,
            streak_broken_at = null,
            updated_at = now()
        where id = v_rec.id;

        if exists (
          select 1 from public.notifications n
          where n.family_id = v_rec.family_id
            and n.user_id = v_rec.user_id
            and n.kind = 'shield_used'
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
        ) then
          continue;
        end if;

        perform public.emit_notification(
          v_rec.family_id,
          v_rec.user_id,
          'Tu escudo salvó la racha',
          'No registraste hoy, pero se consumió 1 escudo. Te queda ' || v_new_tokens || '.',
          'shield_used',
          'info',
          null,
          jsonb_build_object('route', '/expenses', 'freeze_tokens', v_new_tokens)
        );
      else
        -- Regression to level start + 1.
        v_level_start := case
          when v_rec.current_streak >= 90 then 90
          when v_rec.current_streak >= 60 then 60
          when v_rec.current_streak >= 30 then 30
          when v_rec.current_streak >= 14 then 14
          when v_rec.current_streak >= 7 then 7
          else 0
        end;
        v_regression := v_level_start + 1;

        update public.user_streaks
        set current_streak = v_regression,
            streak_broken_at = now(),
            days_since_last_token_grant = 0,
            updated_at = now()
        where id = v_rec.id;

        if exists (
          select 1 from public.notifications n
          where n.family_id = v_rec.family_id
            and n.user_id = v_rec.user_id
            and n.kind = 'streak_broken'
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
        ) then
          continue;
        end if;

        perform public.emit_notification(
          v_rec.family_id,
          v_rec.user_id,
          'La racha se cortó',
          'Arrancás desde el día ' || v_regression || '. Cargá mañana y recuperás el ritmo.',
          'streak_broken',
          'alert',
          null,
          jsonb_build_object('route', '/expenses', 'regression_day', v_regression)
        );
      end if;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 6 · Fixed upcoming (today or tomorrow) ──────────────────────────
create or replace function public.cron_emit_fixed_upcoming()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_when text;
  v_title text;
begin
  for v_rec in
    select fe.id, fe.family_id, fe.name, fe.amount, fe.next_due_on
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and fe.next_due_on is not null
      and fe.next_due_on between v_today and v_today + 1
  loop
    begin
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.kind = 'fixed_upcoming'
          and (n.metadata ->> 'fixed_expense_id') = v_rec.id::text
          and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today
      ) then
        continue;
      end if;

      v_when := case when v_rec.next_due_on = v_today then 'hoy' else 'mañana' end;
      v_title := coalesce(nullif(btrim(v_rec.name), ''), 'Compromiso') || ' vence ' || v_when;

      perform public.emit_notification(
        v_rec.family_id,
        null,
        v_title,
        '$' || to_char(round(coalesce(v_rec.amount, 0)), 'FM999,999,999'),
        'fixed_upcoming',
        'warning',
        null,
        jsonb_build_object(
          'route', '/fixed-expenses',
          'fixed_expense_id', v_rec.id,
          'amount', v_rec.amount,
          'due_on', v_rec.next_due_on
        )
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 7 · Weekly insights (Mondays 09:00 AR) ──────────────────────────
create or replace function public.cron_emit_weekly_insights()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_cycle_start date := date_trunc('month', v_today)::date;
  v_fam record;
  v_goal record;
  v_zombie_count integer;
  v_contrib_this_cycle numeric(12,2);
  v_target_pace numeric(12,2);
  v_months_remaining integer;
begin
  for v_fam in
    select f.id as family_id from public.families f
  loop
    begin
      -- Zombie subscriptions.
      select count(*) into v_zombie_count
      from public.fixed_expenses fe
      where fe.family_id = v_fam.family_id
        and coalesce(fe.status, 'active') = 'active'
        and coalesce(fe.kind, 'recurring') = 'recurring'
        and coalesce(fe.amount, 0) <= 15000
        and (fe.last_paid_at is null or fe.last_paid_at < now() - interval '60 days');

      if v_zombie_count > 0 then
        if not exists (
          select 1 from public.notifications n
          where n.family_id = v_fam.family_id
            and n.kind = 'zombie_detected'
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
        ) then
          perform public.emit_notification(
            v_fam.family_id,
            null,
            'Suscripciones zombi detectadas',
            'Encontramos ' || v_zombie_count || ' compromiso(s) chicos sin movimiento hace 60+ días. Revisá si los seguís usando.',
            'zombie_detected',
            'warning',
            null,
            jsonb_build_object('route', '/fixed-expenses', 'count', v_zombie_count)
          );
        end if;
      end if;

      -- Goal behind pace.
      for v_goal in
        select sg.id, sg.title, sg.goal_amount, sg.current_amount, sg.target_months
        from public.savings_goals sg
        where sg.family_id = v_fam.family_id and sg.is_active
      loop
        begin
          if coalesce(v_goal.target_months, 0) <= 0 or coalesce(v_goal.goal_amount, 0) <= 0 then
            continue;
          end if;

          v_months_remaining := greatest(1, coalesce(v_goal.target_months, 1));
          v_target_pace := (coalesce(v_goal.goal_amount, 0) - coalesce(v_goal.current_amount, 0))
                           / v_months_remaining;

          -- Approximate this cycle's contribution as the sum of positive deltas
          -- reflected in goal_contribution notifications since the cycle start.
          select coalesce(sum(((n.metadata ->> 'delta')::numeric)), 0)
          into v_contrib_this_cycle
          from public.notifications n
          where n.family_id = v_fam.family_id
            and n.kind = 'goal_contribution'
            and (n.metadata ->> 'goal_id') = v_goal.id::text
            and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_cycle_start;

          if v_target_pace > 0 and v_contrib_this_cycle < 0.3 * v_target_pace then
            if not exists (
              select 1 from public.notifications n
              where n.family_id = v_fam.family_id
                and n.kind = 'goal_behind'
                and (n.metadata ->> 'goal_id') = v_goal.id::text
                and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_week_start
            ) then
              perform public.emit_notification(
                v_fam.family_id,
                null,
                'Vas atrasado con ' || v_goal.title,
                'Este ciclo aportaste $' || to_char(round(v_contrib_this_cycle), 'FM999,999,999')
                  || ' · ritmo sugerido $' || to_char(round(v_target_pace), 'FM999,999,999') || '/mes.',
                'goal_behind',
                'warning',
                null,
                jsonb_build_object(
                  'route', '/savings-goal',
                  'goal_id', v_goal.id,
                  'contribution', v_contrib_this_cycle,
                  'target_pace', v_target_pace
                )
              );
            end if;
          end if;
        exception when others then null;
        end;
      end loop;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 8 · Grants (functions run as SECURITY DEFINER, but grant exec) ──
grant execute on function public.cron_emit_morning_checkins() to service_role;
grant execute on function public.cron_emit_midday_checkins() to service_role;
grant execute on function public.cron_emit_evening_checkins() to service_role;
grant execute on function public.cron_emit_streak_at_risk() to service_role;
grant execute on function public.cron_emit_streak_broken() to service_role;
grant execute on function public.cron_emit_fixed_upcoming() to service_role;
grant execute on function public.cron_emit_weekly_insights() to service_role;

-- ─── 9 · Schedule via pg_cron (idempotent) ───────────────────────────
-- pg_cron runs in UTC; AR = UTC-3:
--   09:00 AR → 12:00 UTC · 14:00 AR → 17:00 UTC
--   20:00 AR → 23:00 UTC · 20:30 AR → 23:30 UTC
--   23:59 AR → 02:59 UTC (next day)
do $$
declare
  v_has_cron boolean;
  v_jobs record;
  v_job_names text[] := array[
    'morning-checkins',
    'midday-checkins',
    'streak-at-risk',
    'evening-checkins',
    'streak-broken',
    'fixed-upcoming',
    'weekly-insights'
  ];
  v_name text;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping schedule.';
    return;
  end if;

  -- Drop any pre-existing schedules with the same names so the
  -- migration is re-runnable.
  foreach v_name in array v_job_names loop
    begin
      perform cron.unschedule(v_name);
    exception when others then null;
    end;
  end loop;

  perform cron.schedule('morning-checkins', '0 12 * * *', $cron$select public.cron_emit_morning_checkins();$cron$);
  perform cron.schedule('midday-checkins',  '0 17 * * *', $cron$select public.cron_emit_midday_checkins();$cron$);
  perform cron.schedule('streak-at-risk',   '0 23 * * *', $cron$select public.cron_emit_streak_at_risk();$cron$);
  perform cron.schedule('evening-checkins', '30 23 * * *', $cron$select public.cron_emit_evening_checkins();$cron$);
  perform cron.schedule('streak-broken',    '59 2 * * *', $cron$select public.cron_emit_streak_broken();$cron$);
  perform cron.schedule('fixed-upcoming',   '0 12 * * *', $cron$select public.cron_emit_fixed_upcoming();$cron$);
  perform cron.schedule('weekly-insights',  '0 12 * * 1', $cron$select public.cron_emit_weekly_insights();$cron$);
exception when others then
  raise notice 'pg_cron scheduling failed: %', sqlerrm;
end;
$$;
