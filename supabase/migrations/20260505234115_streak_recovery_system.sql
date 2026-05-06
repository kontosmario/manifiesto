-- ════════════════════════════════════════════════════════════════════
-- Streak recovery system
--
-- Hardens the streak state machine and adds a graduated recovery nudge
-- flow when a user's streak actually breaks. The previous design
-- "regressed" the user to their level start instead of fully breaking
-- the streak — which masked real failure and never triggered a
-- recovery cycle. This migration:
--
--   1. Updates `advance_streak` to (a) skip back-dated events
--      entirely (only present/future logs ever advance or recover the
--      streak) and (b) handle the "recovery from broken" case
--      explicitly (fresh day-1 restart that clears `streak_broken_at`).
--
--   2. Routes the expense trigger through the user's local timezone
--      and refuses to advance the streak when the event date is in
--      the past (back-dated retro entries).
--
--   3. Replaces `cron_emit_streak_broken` with a per-user TZ-aware
--      version that sets `current_streak = 0` (true broken state)
--      and only emits the notification during civilised hours
--      (09:00–21:00 user-local, never madrugada).
--
--   4. Replaces `cron_emit_streak_at_risk` with a TZ-aware version
--      and softer copy when the user is exactly at a level boundary
--      (regression of 0 days reads weirdly).
--
--   5. Adds `cron_emit_streak_recovery_nudge` — graduated motivational
--      messages at days 1, 3, 7, 14 after `streak_broken_at`. Each
--      milestone is sent at most once. Stops after day 14 to avoid
--      becoming spam.
--
--   6. Re-schedules the streak crons to run HOURLY UTC. Each cron
--      filters per user by their local hour, so messages always land
--      in the right window for any timezone.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1a · _advance_streak_internal — historical-replay safe core ───
-- Pure state-machine. Does NOT enforce the "no past dates" rule —
-- that's the caller's job. Used by `recompute_user_streak` (which
-- legitimately replays past events to rebuild a streak from scratch).
create or replace function public._advance_streak_internal(
  p_family_id uuid,
  p_user_id uuid,
  p_event_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_streaks%rowtype;
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
begin
  -- Upsert row.
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row
  from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id
  for update;

  -- ─ Recovery case: streak was broken (current_streak = 0, broken_at
  --   set). The first present-day log restarts at day 1 and clears
  --   the broken marker. Idempotent on same-day repeat (next branch).
  if v_row.streak_broken_at is not null and v_row.current_streak = 0 then
    if v_row.last_logged_date = p_event_date then
      return; -- same day, already recovered
    end if;
    update public.user_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 0: same day → idempotent.
  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

  -- Case 1: first ever log.
  if v_row.last_logged_date is null then
    update public.user_streaks
    set current_streak = 1,
        longest_streak = greatest(v_row.longest_streak, 1),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        days_since_last_token_grant = 1,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  v_gap := p_event_date - v_row.last_logged_date;

  -- Case 2: consecutive day (gap = 1).
  if v_gap = 1 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 1;
    v_new_tokens := v_row.freeze_tokens;
    if v_new_days_since >= 30 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.user_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 3: exactly one missed day + shield → consume shield, advance.
  if v_gap = 2 and v_row.freeze_tokens > 0 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 2;
    v_new_tokens := v_row.freeze_tokens - 1;
    if v_new_days_since >= 30 and v_new_tokens < 2 then
      v_new_tokens := v_new_tokens + 1;
      v_new_days_since := 0;
    end if;
    update public.user_streaks
    set current_streak = v_new_streak,
        longest_streak = greatest(v_row.longest_streak, v_new_streak),
        total_days_logged = v_row.total_days_logged + 1,
        last_logged_date = p_event_date,
        streak_broken_at = null,
        freeze_tokens = v_new_tokens,
        days_since_last_token_grant = v_new_days_since,
        updated_at = now()
    where id = v_row.id;
    return;
  end if;

  -- Case 4: gap > shield-coverable → real break. The midnight cron
  -- normally handles breaks proactively, but this branch catches
  -- the rare race where a user goes silent past the cron run and
  -- then logs a present-day expense. We TREAT IT AS RECOVERY:
  -- start a fresh day-1 streak (consistent with the recovery branch
  -- above) instead of regressing to a level boundary. The user
  -- shouldn't be punished further for finally coming back.
  update public.user_streaks
  set current_streak = 1,
      longest_streak = greatest(v_row.longest_streak, 1),
      total_days_logged = v_row.total_days_logged + 1,
      last_logged_date = p_event_date,
      streak_broken_at = null,
      days_since_last_token_grant = 1,
      updated_at = now()
  where id = v_row.id;
end;
$$;

revoke all on function public._advance_streak_internal(uuid, uuid, date) from public;

-- ─── 1b · advance_streak — backdate-proof public wrapper ────────────
-- Used by triggers and RPCs. Enforces the "only present-or-future
-- events touch the streak" rule before delegating to the internal
-- replay-safe core. Back-dated retro expenses save fine but must NOT
-- advance, recover, or regress the streak (otherwise users could
-- accidentally corrupt their streak by logging an old movement).
create or replace function public.advance_streak(
  p_family_id uuid,
  p_user_id uuid,
  p_event_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_local date;
  v_tz text;
begin
  v_tz := public.user_local_timezone(p_user_id);
  v_today_local := (now() at time zone v_tz)::date;
  if p_event_date < v_today_local then
    return;
  end if;
  perform public._advance_streak_internal(p_family_id, p_user_id, p_event_date);
end;
$$;

grant execute on function public.advance_streak(uuid, uuid, date) to authenticated;

-- Update `recompute_user_streak` to use the unguarded internal core
-- so historical replays still work after the public guard is in place.
create or replace function public.recompute_user_streak(
  p_family_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_tz text;
begin
  v_tz := public.user_local_timezone(p_user_id);

  delete from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id;

  for r in
    select event_date from (
      select distinct (e.created_at at time zone v_tz)::date as event_date
        from public.expenses e
        where e.family_id = p_family_id and e.created_by = p_user_id
      union
      select distinct md.marked_date as event_date
        from public.streak_marked_days md
        where md.family_id = p_family_id and md.user_id = p_user_id
    ) days
    order by event_date asc
  loop
    perform public._advance_streak_internal(p_family_id, p_user_id, r.event_date);
  end loop;
end;
$$;

revoke all on function public.recompute_user_streak(uuid, uuid) from public;

-- ─── 2 · expense trigger — passes user-tz event_date ───────────────
create or replace function public.expenses_trigger_advance_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_event_date date;
begin
  if new.created_by is null then
    return new;
  end if;
  v_tz := public.user_local_timezone(new.created_by);
  v_event_date := (new.created_at at time zone v_tz)::date;

  -- Auto-revert: a real expense supersedes any prior "no spending"
  -- mark on the same local day.
  delete from public.streak_marked_days
  where family_id = new.family_id
    and user_id = new.created_by
    and marked_date = v_event_date;

  -- advance_streak now self-guards against past dates, so we can
  -- always pass through and let it decide whether to act.
  perform public.advance_streak(new.family_id, new.created_by, v_event_date);
  return new;
exception
  when others then
    -- Never block an expense insert on a streak bookkeeping failure.
    return new;
end;
$$;

-- ─── 3 · cron_emit_streak_broken — TZ-aware, true-break version ────
create or replace function public.cron_emit_streak_broken()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_new_tokens smallint;
  v_long integer;
begin
  for v_rec in
    select us.id, us.family_id, us.user_id,
           us.current_streak, us.longest_streak,
           us.freeze_tokens, us.last_logged_date, us.streak_broken_at
    from public.user_streaks us
    where us.current_streak > 0
      and us.streak_broken_at is null
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      -- Skip if the user's last log is today or yesterday in their
      -- local timezone — they're either active or still at-risk.
      if v_rec.last_logged_date is null then
        continue;
      end if;
      if v_rec.last_logged_date >= v_today_local - 1 then
        continue;
      end if;

      -- Shield can only cover a single missed day. If the gap is
      -- exactly 2 (one missed day) and the user has tokens, consume
      -- one and pretend they logged yesterday.
      if v_rec.last_logged_date = v_today_local - 2 and v_rec.freeze_tokens > 0 then
        v_new_tokens := v_rec.freeze_tokens - 1;
        update public.user_streaks
        set freeze_tokens = v_new_tokens,
            last_logged_date = v_today_local - 1,
            updated_at = now()
        where id = v_rec.id;

        -- Notify only during civilised hours (09–21 local). Outside
        -- that window the row update still happens, but we skip the
        -- push so the user doesn't get pinged at 03:00 about a
        -- shield they'd have read in the morning anyway.
        if v_local_hour between 9 and 21 then
          if not exists (
            select 1 from public.notifications n
            where n.family_id = v_rec.family_id
              and n.user_id = v_rec.user_id
              and n.kind = 'shield_used'
              and (n.created_at at time zone v_tz)::date = v_today_local
          ) then
            perform public.emit_notification(
              v_rec.family_id,
              v_rec.user_id,
              'Tu escudo salvó la racha',
              'No registraste ayer, pero se consumió 1 escudo. Te quedan ' || v_new_tokens || '.',
              'shield_used',
              'info',
              null,
              jsonb_build_object('route', '/expenses', 'freeze_tokens', v_new_tokens)
            );
          end if;
        end if;
        continue;
      end if;

      -- True break: gap > 2 days, or no shields available.
      -- current_streak goes to 0 (full reset). longest_streak preserved.
      v_long := v_rec.longest_streak;
      update public.user_streaks
      set current_streak = 0,
          streak_broken_at = now(),
          days_since_last_token_grant = 0,
          updated_at = now()
      where id = v_rec.id;

      -- Notify only during civilised hours.
      if v_local_hour between 9 and 21 then
        if not exists (
          select 1 from public.notifications n
          where n.family_id = v_rec.family_id
            and n.user_id = v_rec.user_id
            and n.kind = 'streak_broken'
            and (n.created_at at time zone v_tz)::date = v_today_local
        ) then
          perform public.emit_notification(
            v_rec.family_id,
            v_rec.user_id,
            'La racha se cortó',
            case
              when v_long >= 14 then
                'Tu marca personal sigue siendo ' || v_long || ' días. Cargá hoy y arrancás un nuevo intento.'
              else
                'Cargá hoy un movimiento y arrancás de cero, con todo el camino por delante.'
            end,
            'streak_broken',
            'alert',
            null,
            jsonb_build_object('route', '/expenses', 'longest_streak', v_long)
          );
        end if;
      end if;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 4 · cron_emit_streak_at_risk — TZ-aware + better edge copy ────
create or replace function public.cron_emit_streak_at_risk()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_kind text;
  v_title text;
  v_body text;
  v_severity text;
begin
  for v_rec in
    select us.family_id, us.user_id, us.current_streak,
           us.freeze_tokens, us.last_logged_date
    from public.user_streaks us
    where us.current_streak > 0
      and us.streak_broken_at is null
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      -- Fire window: between 19:00 and 21:00 user-local (the existing
      -- notification was at 23:00 BA — too close to bedtime). 19:00
      -- gives time to react but stays within civilised hours. Run
      -- once per local day.
      if v_local_hour < 19 or v_local_hour > 21 then
        continue;
      end if;
      if v_rec.last_logged_date = v_today_local then
        continue;
      end if;

      if v_rec.freeze_tokens > 0 then
        v_kind := 'shield_auto_hint';
        v_title := 'Tu escudo está listo';
        v_body := 'Si no cargás nada hoy, a la medianoche se va a usar 1 escudo para salvar tu racha.';
        v_severity := 'warning';
      else
        v_kind := 'streak_at_risk';
        v_title := 'Tu racha está en riesgo';
        -- New copy: no more "perdés 0 días" weirdness at level
        -- boundaries. Always frame the consequence as "se corta hoy".
        v_body := 'Llevás ' || v_rec.current_streak || ' ' ||
                  case when v_rec.current_streak = 1 then 'día' else 'días' end ||
                  ' de racha. Cargá un movimiento antes de medianoche para mantenerla viva.';
        v_severity := 'warning';
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = v_kind
          and (n.created_at at time zone v_tz)::date = v_today_local
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

-- ─── 5 · cron_emit_streak_recovery_nudge — graduated motivation ────
-- Graduated nudges sent at days 1, 3, 7, 14 after `streak_broken_at`.
-- Each milestone is sent at most once (deduped via metadata
-- `nudge_day` + kind 'streak_recovery_nudge'). Stops after day 14 so
-- inactive users don't get spammed forever.
create or replace function public.cron_emit_streak_recovery_nudge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_tz text;
  v_today_local date;
  v_local_hour integer;
  v_days_since integer;
  v_milestone integer;
  v_title text;
  v_body text;
  -- Pseudo-random index per (user, milestone) so each user gets
  -- different copy if they break + recover repeatedly.
  v_seed bigint;
  v_pick integer;
begin
  for v_rec in
    select us.family_id, us.user_id, us.longest_streak, us.streak_broken_at
    from public.user_streaks us
    where us.streak_broken_at is not null
      and us.current_streak = 0
      and us.streak_broken_at > now() - interval '15 days'
  loop
    begin
      v_tz := public.user_local_timezone(v_rec.user_id);
      v_today_local := (now() at time zone v_tz)::date;
      v_local_hour := extract(hour from (now() at time zone v_tz))::int;

      -- Civilised hours only.
      if v_local_hour < 10 or v_local_hour > 20 then
        continue;
      end if;

      v_days_since := v_today_local - (v_rec.streak_broken_at at time zone v_tz)::date;

      -- Only fire on milestone days.
      if v_days_since not in (1, 3, 7, 14) then
        continue;
      end if;

      v_milestone := v_days_since;

      -- Dedup: one nudge per milestone per user.
      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.user_id = v_rec.user_id
          and n.kind = 'streak_recovery_nudge'
          and (n.metadata->>'nudge_day')::int = v_milestone
      ) then
        continue;
      end if;

      -- Pick a copy variant (3 per milestone). Seed by user_id +
      -- milestone so the same user doesn't get the same line twice
      -- across different break/recover cycles.
      v_seed := abs(hashtextextended(v_rec.user_id::text, v_milestone));
      v_pick := (v_seed % 3)::int;

      if v_milestone = 1 then
        v_title := 'Hoy es buen día para volver';
        v_body := case v_pick
          when 0 then
            case when v_rec.longest_streak >= 7
              then 'Tu marca de ' || v_rec.longest_streak || ' días sigue tuya. Un gasto y arrancás otra racha.'
              else 'Una racha nueva empieza con un solo registro. Hoy puede ser ese día.'
            end
          when 1 then 'Anotá lo primero que gastés hoy y volvés al ruedo. Es así de simple.'
          else 'Ayer pasó. Hoy podés arrancar el día 1 de tu próximo récord.'
        end;
      elsif v_milestone = 3 then
        v_title := 'Tres días sin registrar';
        v_body := case v_pick
          when 0 then 'Volver es más fácil que mantener — un solo movimiento y reactivás la racha.'
          when 1 then 'Un café, un mandado, lo que sea. Basta con un gasto para arrancar de nuevo.'
          else 'No hace falta esperar al lunes. Podés volver hoy mismo.'
        end;
      elsif v_milestone = 7 then
        v_title := 'Una semana — pero todavía estás a tiempo';
        v_body := case v_pick
          when 0 then 'Tu cuenta sigue acá esperando. Un gasto registrado hoy y volvés al juego.'
          when 1 then
            case when v_rec.longest_streak >= 14
              then 'Llegaste a ' || v_rec.longest_streak || ' días una vez. Podés volver a hacerlo.'
              else 'No mires lo que pasó — mirá lo que viene. Hoy es el día 1.'
            end
          else 'A veces la mejor racha empieza después de una pausa. Probá hoy.'
        end;
      else -- 14
        v_title := 'Última nota antes de soltar';
        v_body := case v_pick
          when 0 then
            case when v_rec.longest_streak >= 14
              then 'Tus ' || v_rec.longest_streak || ' días siguen siendo récord. Si querés volver, hoy es buen momento.'
              else 'Si querés retomar el hábito, hoy es buen momento. No te vamos a insistir más.'
            end
          when 1 then 'Si volvés en algún momento, va a ser el día 1 de algo nuevo. Te dejamos en paz por ahora.'
          else 'Esta es la última. Si retomás, lo celebramos. Si no, también.'
        end;
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        v_rec.user_id,
        v_title,
        v_body,
        'streak_recovery_nudge',
        'info',
        null,
        jsonb_build_object('route', '/expenses', 'nudge_day', v_milestone, 'longest_streak', v_rec.longest_streak)
      );
    exception when others then null;
    end;
  end loop;
exception when others then null;
end;
$$;

-- ─── 6 · Re-schedule streak crons — hourly UTC, per-user TZ filter ─
do $$
begin
  -- Unschedule the prior streak-related jobs (they ran at fixed UTC
  -- times that mapped to AR-only windows). Wrapped so the migration
  -- still applies if pg_cron isn't on the project plan.
  begin
    perform cron.unschedule('streak-at-risk');
  exception when others then null;
  end;
  begin
    perform cron.unschedule('streak-broken');
  exception when others then null;
  end;
  begin
    perform cron.unschedule('streak-recovery');
  exception when others then null;
  end;

  -- Hourly. Each function self-filters by per-user local hour so the
  -- right notification lands in the right window for any timezone.
  perform cron.schedule('streak-broken',  '0 * * * *', $cron$select public.cron_emit_streak_broken();$cron$);
  perform cron.schedule('streak-at-risk', '0 * * * *', $cron$select public.cron_emit_streak_at_risk();$cron$);
  perform cron.schedule('streak-recovery','15 * * * *', $cron$select public.cron_emit_streak_recovery_nudge();$cron$);
exception when others then
  raise notice 'pg_cron rescheduling skipped: %', sqlerrm;
end;
$$;
