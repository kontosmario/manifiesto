-- Lets a user undo today's "no expense" mark — useful when they spent
-- something unexpected after marking the day. Reverting is non-trivial
-- because `advance_streak` is a forward-only state machine, so we
-- introduce a focused recompute helper that replays expenses + marked
-- days for a single user. That way the streak row converges to the
-- exact state it should have given the new ground truth (regardless of
-- whether the marked day had a shield consumption, level transition,
-- etc.). Cheap in practice — a user only has a few hundred logged days
-- worst-case.

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
    perform public.advance_streak(p_family_id, p_user_id, r.event_date);
  end loop;
end;
$$;

revoke all on function public.recompute_user_streak(uuid, uuid) from public;
-- Internal-use only — invoked transitively from `unmark_no_expense_day`
-- which already authorizes the caller. We don't expose this directly.

create or replace function public.unmark_no_expense_day(p_family_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;

  delete from public.streak_marked_days
  where family_id = p_family_id and user_id = v_user_id and marked_date = v_today;

  -- Recompute from scratch so the streak row reflects the new history
  -- (any shield grants/consumptions tied to today's mark roll back too).
  perform public.recompute_user_streak(p_family_id, v_user_id);

  return v_today;
end;
$$;

revoke all on function public.unmark_no_expense_day(uuid) from public;
grant execute on function public.unmark_no_expense_day(uuid) to authenticated;
