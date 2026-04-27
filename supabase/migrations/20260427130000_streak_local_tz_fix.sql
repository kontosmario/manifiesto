-- Fix streak day boundary: derive the event date in the user's own
-- timezone, not UTC.
--
-- With UTC, an expense logged in the local evening rolls into the next
-- UTC date. Two failure modes followed:
--   a) the next-morning log lands on the SAME UTC date → the trigger
--      hits its same-day idempotency guard and that day silently
--      doesn't count, so the streak breaks the day after; or
--   b) a morning log on day N (UTC=N) followed by an evening log on
--      day N+1 (UTC=N+2) shows a phantom gap=2 → consumes a shield
--      (or breaks the streak) even though the user logged every
--      local day.
--
-- We store each user's IANA timezone on `profiles` and refresh it on
-- every authenticated app session (client-side hook). The trigger
-- reads that value to compute the event date, so the day boundary
-- always tracks the user's actual device.

alter table public.profiles
  add column if not exists timezone text;

-- Best-effort default for existing rows. New users get the device tz
-- from the client on first session; this just keeps historical rows
-- valid in the meantime so the trigger has a non-null value to use.
update public.profiles
set timezone = 'America/Argentina/Buenos_Aires'
where timezone is null;

alter table public.profiles
  alter column timezone set default 'America/Argentina/Buenos_Aires';

alter table public.profiles
  alter column timezone set not null;

-- Helper: read the user's IANA timezone, falling back to the BA
-- default (matches the project's other date-aware features — e.g.
-- the notifications cron). Wrapping the lookup makes the trigger
-- and the historical replay share a single source of truth.
create or replace function public.user_local_timezone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select timezone from public.profiles where id = p_user_id),
    'America/Argentina/Buenos_Aires'
  );
$$;

grant execute on function public.user_local_timezone(uuid) to authenticated;

create or replace function public.expenses_trigger_advance_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  if new.created_by is null then
    return new;
  end if;
  v_tz := public.user_local_timezone(new.created_by);
  perform public.advance_streak(
    new.family_id,
    new.created_by,
    (new.created_at at time zone v_tz)::date
  );
  return new;
exception
  when others then
    -- Never block an expense insert on a streak bookkeeping failure.
    return new;
end;
$$;

-- Recompute every streak from scratch using each user's own timezone.
-- Users who lost their streak to the UTC bug are restored to the
-- value the spec would have produced. Replays in chronological order
-- (per the user's local calendar) so advance_streak's state machine
-- walks through the same sequence of cases.
do $$
declare
  r record;
begin
  delete from public.user_streaks;

  for r in
    select distinct
      e.family_id,
      e.created_by,
      (e.created_at at time zone public.user_local_timezone(e.created_by))::date
        as event_date
    from public.expenses e
    where e.created_by is not null
    order by 3 asc, 1, 2
  loop
    perform public.advance_streak(r.family_id, r.created_by, r.event_date);
  end loop;
end $$;
