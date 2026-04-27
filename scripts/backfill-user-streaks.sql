-- Replay advance_streak for every (family_id, created_by, day) in
-- public.expenses so existing users land on a populated streak row the
-- moment the feature ships. Ordered chronologically so the state
-- machine walks through the same sequence of cases.
--
-- Idempotent: the same-day guard inside advance_streak skips dupes.

do $$
declare
  r record;
begin
  -- Clear existing rows so we rebuild cleanly — the table is derived.
  delete from public.user_streaks;

  for r in
    select distinct
      e.family_id,
      e.created_by,
      (e.created_at at time zone public.user_local_timezone(e.created_by))::date as event_date
    from public.expenses e
    where e.created_by is not null
    order by (e.created_at at time zone public.user_local_timezone(e.created_by))::date asc, e.family_id, e.created_by
  loop
    perform public.advance_streak(r.family_id, r.created_by, r.event_date);
  end loop;

  raise notice 'Streak backfill complete.';
end;
$$;
