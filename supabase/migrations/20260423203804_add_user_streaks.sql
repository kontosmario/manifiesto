-- Per-user registration streaks for the Gastos screen. One row per
-- (family_id, user_id) tracks the consecutive-days counter, the
-- lifetime record, freeze tokens (shields), and the last registered
-- date. The logic runs on expense insert via trigger; the client
-- computes at-risk / broken states from `last_logged_date` + today.

create table if not exists public.user_streaks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  total_days_logged integer not null default 0,

  last_logged_date date null,
  streak_broken_at timestamptz null,

  freeze_tokens smallint not null default 0 check (freeze_tokens between 0 and 2),
  days_since_last_token_grant integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (family_id, user_id)
);

create index if not exists user_streaks_family_user_idx
  on public.user_streaks (family_id, user_id);

alter table public.user_streaks enable row level security;

drop policy if exists "user_streaks_select_own" on public.user_streaks;
create policy "user_streaks_select_own"
on public.user_streaks
for select
using (
  auth.uid() = user_id
  and public.is_family_member(family_id)
);

-- No insert/update/delete policies for normal users: the trigger with
-- SECURITY DEFINER is the only writer.

-- ─────────────────────────────────────────────────────────────
-- advance_streak — invoked by the expenses AFTER INSERT trigger.
-- Implements the 4 cases from the spec: first ever, next-day,
-- shield-consumed, and regression-to-level-start. Idempotent on
-- same-day second insert (last_logged_date guard).
-- ─────────────────────────────────────────────────────────────
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
  v_yesterday date := p_event_date - 1;
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
  v_regression integer;
  v_level_start integer;
begin
  -- Upsert row.
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row
  from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id
  for update;

  -- Case 0: same day → idempotent, nothing changes.
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

  -- Case 3: exactly one missed day + shield → consume shield and advance.
  if v_gap = 2 and v_row.freeze_tokens > 0 then
    v_new_streak := v_row.current_streak + 1;
    v_new_days_since := v_row.days_since_last_token_grant + 2; -- skipped a day
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

  -- Case 4: streak broken → regression to current level's start day + 1.
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

-- ─────────────────────────────────────────────────────────────
-- Trigger on public.expenses — fires the streak advance after
-- every insert. Uses new.family_id + new.created_by as identity.
-- ─────────────────────────────────────────────────────────────
create or replace function public.expenses_trigger_advance_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    return new;
  end if;
  perform public.advance_streak(new.family_id, new.created_by, (new.created_at at time zone 'UTC')::date);
  return new;
exception
  when others then
    -- Never block an expense insert on a streak bookkeeping failure.
    return new;
end;
$$;

drop trigger if exists trg_expenses_advance_streak on public.expenses;
create trigger trg_expenses_advance_streak
after insert on public.expenses
for each row execute function public.expenses_trigger_advance_streak();
