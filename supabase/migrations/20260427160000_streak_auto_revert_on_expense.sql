-- Auto-revert "hoy no tuve gastos" when a real expense lands on the
-- same local day. The user's typical recovery path is "I marked the
-- day as no-spend, then a coffee popped up at 18:00" — they shouldn't
-- have to remember to tap the manual revert button. Whenever the
-- expenses trigger fires for a day that has a marked row, drop the
-- mark so the streak record reflects what really happened (a logged
-- day, not a marked day) and the UI's `hasMarkedNoExpenseToday` flag
-- naturally flips back to false.
--
-- The streak itself stays correct without any extra state work: both
-- "marked + expense" and "expense alone" produce the same
-- `last_logged_date` and `current_streak` via advance_streak's
-- same-day idempotency guard.

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

  -- Auto-revert: if the user previously marked this day as "no
  -- spending", a real expense supersedes it. Removing the row keeps
  -- the marked-days ledger honest (no phantom checkmarks for days
  -- that did have spending).
  delete from public.streak_marked_days
  where family_id = new.family_id
    and user_id = new.created_by
    and marked_date = v_event_date;

  perform public.advance_streak(new.family_id, new.created_by, v_event_date);
  return new;
exception
  when others then
    -- Never block an expense insert on a streak bookkeeping failure.
    return new;
end;
$$;
