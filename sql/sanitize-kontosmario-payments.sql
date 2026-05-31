-- One-off sanitation for kontosmario's family: the old RPC anchored
-- payments to next_due_on, which for items with day_of_month < today
-- ended up writing rows under a future period. The client queries
-- first-of-current-month, so those rows are invisible → items stay
-- flagged pending forever.
--
-- This script:
--   1. Drops every fixed_expense_payments row whose period_month is
--      AHEAD of the current calendar month (those are the phantoms).
--   2. Re-anchors each fijo's next_due_on so it matches the last
--      remaining payment: May of day_of_month when the April cycle is
--      paid, April of day_of_month when it isn't.
--   3. Clears last_paid_at for items that no longer have any payment
--      rows (otherwise the zombie detector would still consider them
--      "recently paid").

do $$
declare
  v_family_id uuid;
  v_current_month date := date_trunc('month', current_date)::date;
  v_next_month date := (v_current_month + interval '1 month')::date;
  r record;
  v_new_due date;
begin
  select fm.family_id
    into v_family_id
  from public.family_members fm
  join auth.users u on u.id = fm.user_id
  where u.email = 'kontosmario@gmail.com'
  limit 1;

  if v_family_id is null then
    raise notice 'kontosmario family not found; nothing to sanitize.';
    return;
  end if;

  -- 1. Drop phantom payments ahead of the current month.
  delete from public.fixed_expense_payments p
  using public.fixed_expenses fe
  where p.fixed_expense_id = fe.id
    and fe.family_id = v_family_id
    and p.period_month > v_current_month;

  raise notice 'Dropped phantom payments beyond %', v_current_month;

  -- 2 + 3. For each fijo, realign next_due_on and last_paid_at.
  for r in
    select fe.id,
           fe.day_of_month,
           exists (
             select 1
             from public.fixed_expense_payments p
             where p.fixed_expense_id = fe.id
               and p.period_month = v_current_month
           ) as paid_current,
           (
             select max(p.paid_at)
             from public.fixed_expense_payments p
             where p.fixed_expense_id = fe.id
           ) as latest_paid_at
    from public.fixed_expenses fe
    where fe.family_id = v_family_id
      and fe.status = 'active'
  loop
    if r.paid_current then
      -- Already paid this cycle → roll forward to same day next month,
      -- clamped to the target month's last valid day.
      v_new_due := public.advance_fixed_expense_due_date(
        make_date(
          extract(year from v_current_month)::integer,
          extract(month from v_current_month)::integer,
          least(r.day_of_month::integer,
                extract(day from (v_current_month + interval '1 month - 1 day'))::integer)
        ),
        'monthly',
        r.day_of_month::smallint
      );
    else
      -- Still due this cycle → land next_due_on in the current month
      -- on the commitment's anchor day, clamped to its last valid day.
      v_new_due := make_date(
        extract(year from v_current_month)::integer,
        extract(month from v_current_month)::integer,
        least(r.day_of_month::integer,
              extract(day from (v_current_month + interval '1 month - 1 day'))::integer)
      );
    end if;

    update public.fixed_expenses
       set next_due_on = v_new_due,
           last_paid_at = r.latest_paid_at
     where id = r.id;
  end loop;

  raise notice 'Sanitation complete for family %', v_family_id;
end;
$$;
