-- Shift the shield-token cadence from 30 days to 7 days. A full
-- consecutive week of registering earns the user a shield (cap = 2).
-- Only the comparison thresholds change; the rest of the state machine
-- is untouched.

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
  v_row public.user_streaks%rowtype;
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
  v_regression integer;
  v_level_start integer;
begin
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row
  from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id
  for update;

  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

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

  -- Consecutive day.
  if v_gap = 1 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 1;
    v_new_tokens := v_row.freeze_tokens;
    if v_new_days_since >= 7 and v_new_tokens < 2 then
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

  -- Shield covers a single missed day.
  if v_gap = 2 and v_row.freeze_tokens > 0 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 2;
    v_new_tokens := v_row.freeze_tokens - 1;
    if v_new_days_since >= 7 and v_new_tokens < 2 then
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

  -- Streak broken — regression to the start of the current level + 1.
  v_level_start := case
    when v_row.current_streak >= 90 then 90
    when v_row.current_streak >= 60 then 60
    when v_row.current_streak >= 30 then 30
    when v_row.current_streak >= 14 then 14
    when v_row.current_streak >= 7 then 7
    else 0
  end;
  v_regression := v_level_start + 1;

  update public.user_streaks
  set current_streak = v_regression,
      total_days_logged = v_row.total_days_logged + 1,
      last_logged_date = p_event_date,
      streak_broken_at = now(),
      days_since_last_token_grant = 1,
      updated_at = now()
  where id = v_row.id;
end;
$$;

grant execute on function public.advance_streak(uuid, uuid, date) to authenticated;
