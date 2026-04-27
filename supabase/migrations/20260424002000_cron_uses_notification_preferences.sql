-- ════════════════════════════════════════════════════════════════════
-- Notifications — switch crons to public.notification_preferences.
--
-- Before this migration the morning / midday / evening check-in crons,
-- plus the streak-at-risk cron, read per-user settings from
-- family_finance.daily_budget_checkin_hour and
-- family_finance.daily_budget_nudges_enabled. Those columns are now
-- per-family, which is wrong for a multi-user household. This migration
-- rewrites the cron functions to consult public.notification_preferences
-- so every user controls their own schedule, mute list, and channels.
--
-- Backward compat: we intentionally DO NOT drop the legacy columns from
-- family_finance. Older clients still read them; the cron simply stops
-- honouring them. A later migration can remove them once every client
-- ships the new settings screen.
--
-- Semantics per function:
--   1. LEFT JOIN notification_preferences np on np.user_id = recipient.
--   2. coalesce so a missing row defaults to:
--        morning=9, midday=14, evening=20,
--        nudges_enabled=true, kinds_muted={}, channel_inapp=true.
--   3. Skip the recipient when np.channel_inapp is false (cron emits
--      in-app rows).
--   4. Skip when the kind is in np.kinds_muted.
--   5. For check-in crons, only emit when "hour of now AR" matches the
--      user's preferred hour for that slot.
--   6. For nudge-shaped crons (streak at risk) also skip when
--      nudges_enabled is false.
--
-- All functions below use CREATE OR REPLACE so the migration is
-- idempotent.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1 · Morning check-in ────────────────────────────────────────────
create or replace function public.cron_emit_morning_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_ar timestamptz := now() at time zone 'America/Argentina/Buenos_Aires';
  v_today  date         := v_now_ar::date;
  v_hour   integer      := extract(hour from v_now_ar)::int;
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
      coalesce(p.display_name, 'vos')                as display_name,
      coalesce(np.checkin_morning_hour, 9)::int      as checkin_hour,
      coalesce(np.channel_inapp, true)               as channel_inapp,
      coalesce(np.kinds_muted, array[]::text[])      as kinds_muted
    from public.family_members fm
    join public.family_finance ff          on ff.family_id = fm.family_id
    left join public.profiles  p           on p.id         = fm.user_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      -- Per-user opt-outs.
      if v_rec.channel_inapp is false then continue; end if;
      if 'checkin_morning' = any (v_rec.kinds_muted) then continue; end if;

      -- Only fire during the user's preferred hour slot.
      if v_rec.checkin_hour <> v_hour then continue; end if;

      -- Idempotent per-day.
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id   = v_rec.user_id
          and n.kind      = 'checkin_morning'
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
  v_now_ar timestamptz := now() at time zone 'America/Argentina/Buenos_Aires';
  v_today  date         := v_now_ar::date;
  v_hour   integer      := extract(hour from v_now_ar)::int;
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
      ff.monthly_income,
      coalesce(np.checkin_midday_hour, 14)::int as checkin_hour,
      coalesce(np.channel_inapp, true)          as channel_inapp,
      coalesce(np.kinds_muted, array[]::text[]) as kinds_muted
    from public.family_members fm
    join public.family_finance ff          on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      if v_rec.channel_inapp is false then continue; end if;
      if 'checkin_midday' = any (v_rec.kinds_muted) then continue; end if;
      if v_rec.checkin_hour <> v_hour then continue; end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id   = v_rec.user_id
          and n.kind      = 'checkin_midday'
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
  v_now_ar timestamptz := now() at time zone 'America/Argentina/Buenos_Aires';
  v_today  date         := v_now_ar::date;
  v_hour   integer      := extract(hour from v_now_ar)::int;
  v_rec record;
  v_spent_today numeric(12,2);
  v_logged_today boolean;
  v_body text;
begin
  for v_rec in
    select
      fm.family_id,
      fm.user_id,
      coalesce(np.checkin_evening_hour, 20)::int as checkin_hour,
      coalesce(np.channel_inapp, true)           as channel_inapp,
      coalesce(np.kinds_muted, array[]::text[])  as kinds_muted
    from public.family_members fm
    join public.family_finance ff          on ff.family_id = fm.family_id
    left join public.notification_preferences np on np.user_id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
  loop
    begin
      if v_rec.channel_inapp is false then continue; end if;
      if 'checkin_evening' = any (v_rec.kinds_muted) then continue; end if;
      if v_rec.checkin_hour <> v_hour then continue; end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id   = v_rec.user_id
          and n.kind      = 'checkin_evening'
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

-- ─── 4 · Streak at risk (nudge-shaped, also gated by nudges_enabled) ─
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
    select
      us.family_id,
      us.user_id,
      us.current_streak,
      us.freeze_tokens,
      us.last_logged_date,
      coalesce(np.nudges_enabled, true)          as nudges_enabled,
      coalesce(np.channel_inapp, true)           as channel_inapp,
      coalesce(np.kinds_muted, array[]::text[])  as kinds_muted
    from public.user_streaks us
    left join public.notification_preferences np on np.user_id = us.user_id
    where us.current_streak > 0
      and (us.last_logged_date is null or us.last_logged_date < v_today)
  loop
    begin
      if v_rec.channel_inapp is false then continue; end if;
      if v_rec.nudges_enabled is false then continue; end if;

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

      if v_kind = any (v_rec.kinds_muted) then continue; end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id   = v_rec.user_id
          and n.kind      = v_kind
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

-- Keep prior grants; re-applying them is cheap and idempotent.
grant execute on function public.cron_emit_morning_checkins()  to service_role;
grant execute on function public.cron_emit_midday_checkins()   to service_role;
grant execute on function public.cron_emit_evening_checkins()  to service_role;
grant execute on function public.cron_emit_streak_at_risk()    to service_role;
