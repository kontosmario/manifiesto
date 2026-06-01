-- Extend mark_no_expense_day + unmark_no_expense_day with an
-- optional `p_date` argument so the gastos calendar's day-detail can
-- mark / revert past days, not only today. Adds server-side
-- validation:
--   • Future dates rejected (cannot mark a day that hasn't happened
--     yet in the user's tz).
--   • Past dates with expenses rejected unconditionally (the past is
--     settled — if there's an expense row, the day was NOT no-spend).
--   • Today with expenses requires p_force = true (mirrors the
--     streak-sheet + FAB confirm-Alert UX where the user explicitly
--     consents to override).
--
-- Postgres doesn't support changing a function's signature in place,
-- so we drop+recreate. The grant is also re-applied.
--
-- Spec: docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md

drop function if exists public.mark_no_expense_day(uuid);
drop function if exists public.unmark_no_expense_day(uuid);

create or replace function public.mark_no_expense_day(
  p_family_id uuid,
  p_date date default null,
  p_force boolean default false
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_target date;
  v_has_expenses boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;
  v_target := coalesce(p_date, v_today);

  -- Future dates are nonsensical: you can't claim "no spend" for a
  -- day that hasn't happened yet.
  if v_target > v_today then
    raise exception 'FUTURE_DATE_NOT_ALLOWED'
      using hint = 'Cannot mark a future date as no-spend.';
  end if;

  -- Check if the target date already has expenses from this user.
  select exists(
    select 1
    from public.expenses e
    where e.family_id = p_family_id
      and e.created_by = v_user_id
      and (e.created_at at time zone public.user_local_timezone(v_user_id))::date = v_target
  ) into v_has_expenses;

  if v_has_expenses then
    -- Past dates: hard reject. The past is settled.
    if v_target < v_today then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'That day already has registered expenses; it cannot be marked as no-spend.';
    end if;
    -- Today: require explicit consent (the UI shows an Alert).
    if not p_force then
      raise exception 'EXPENSES_EXIST_ON_DATE'
        using hint = 'Today already has expenses; pass p_force = true to mark anyway.';
    end if;
  end if;

  insert into public.streak_marked_days (family_id, user_id, marked_date)
  values (p_family_id, v_user_id, v_target)
  on conflict (family_id, user_id, marked_date) do nothing;

  perform public.advance_streak(p_family_id, v_user_id, v_target);

  return v_target;
end;
$$;

revoke all on function public.mark_no_expense_day(uuid, date, boolean) from public;
grant execute on function public.mark_no_expense_day(uuid, date, boolean) to authenticated;

create or replace function public.unmark_no_expense_day(
  p_family_id uuid,
  p_date date default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_target date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;
  v_target := coalesce(p_date, v_today);

  delete from public.streak_marked_days
  where family_id = p_family_id
    and user_id = v_user_id
    and marked_date = v_target;

  -- Recompute from scratch so the streak row reflects the new
  -- history (any shield grants / level transitions tied to the
  -- unmarked day roll back too). Uses the existing helper from
  -- migration 20260427150000.
  perform public.recompute_user_streak(p_family_id, v_user_id);

  return v_target;
end;
$$;

revoke all on function public.unmark_no_expense_day(uuid, date) from public;
grant execute on function public.unmark_no_expense_day(uuid, date) to authenticated;
