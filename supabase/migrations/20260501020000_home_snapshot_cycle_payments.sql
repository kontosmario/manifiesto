-- home_snapshot() — return fixed-expense payments scoped to the
-- current pay cycle (not the calendar month).
--
-- The client hook `useFixedExpensePayments` keys queries by
-- `(family_id, cycleStartIso, cycleEndIso)`. The original RPC seeded
-- `fixed_expense_payments` filtered by `period_month` (calendar
-- month), so the seed never matched the hook's cache key — every
-- Home cold start fired a redundant `fetchPaymentsInRange` round-trip.
--
-- This migration:
--   1. Computes the active pay cycle from `family_finance.salary_payment_day`
--      (defaults to day-1 → calendar month).
--   2. Returns payments whose `paid_at` falls in `[cycle_start, cycle_end)`.
--   3. Adds `payments_cycle_start` and `payments_cycle_end` ISO fields
--      so the client can seed the hook's exact query key.
--
-- Backwards-compatible: `period_month` is preserved (falls back to
-- `date_trunc('month', cycle_start)`) so older clients keep parsing.

create or replace function public.home_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_code text;
  v_period_month date := date_trunc('month', current_date)::date;
  v_payment_day int;
  v_today date := current_date;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return jsonb_build_object(
      'profile', (
        select to_jsonb(p) from (
          select id, display_name, created_at, avatar_animal, onboarding_completed_at
          from public.profiles
          where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'family_members', '[]'::jsonb,
      'notifications', '[]'::jsonb,
      'has_push_subscription', false,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'period_month', v_period_month,
      'payments_cycle_start', null,
      'payments_cycle_end', null
    );
  end if;

  -- Resolve the user's salary payment day (default 1).
  select coalesce(ff.salary_payment_day, 1) into v_payment_day
  from public.family_finance ff
  where ff.family_id = v_family_id;

  if v_payment_day is null then
    v_payment_day := 1;
  end if;

  -- Cycle window: [cycle_start, cycle_end).
  -- cycle_start = the most recent payday <= today.
  -- If today's day-of-month >= payment_day, cycle starts this month;
  -- otherwise it started last month.
  if extract(day from v_today)::int >= v_payment_day then
    v_cycle_start := date_trunc('day', make_date(
      extract(year from v_today)::int,
      extract(month from v_today)::int,
      least(v_payment_day,
            extract(day from
              (date_trunc('month', v_today) + interval '1 month' - interval '1 day')
            )::int)
    ))::timestamptz;
  else
    v_cycle_start := date_trunc('day',
      (date_trunc('month', v_today) - interval '1 month')
      + (least(v_payment_day,
               extract(day from
                 (date_trunc('month', v_today) - interval '1 day')
               )::int) - 1) * interval '1 day'
    )::timestamptz;
  end if;
  v_cycle_end := v_cycle_start + interval '1 month';

  select v_family_id, f.code into v_family_id, v_family_code
  from public.families f where f.id = v_family_id;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object('familyId', v_family_id, 'code', v_family_code),
    'family_finance', (
      select to_jsonb(ff.*) from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(to_jsonb(fe.*) order by fe.status, fe.next_due_on, fe.created_at)
      from public.fixed_expenses fe where fe.family_id = v_family_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(e.*) order by e.created_at desc)
      from public.expenses e where e.family_id = v_family_id
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at asc)
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', (
      select count(*) from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ),
    'family_members', coalesce((
      select jsonb_agg(to_jsonb(fm.*))
      from public.family_members fm where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n.*) order by n.created_at desc)
      from (
        select * from public.notifications
        where family_id = v_family_id
          and (user_id is null or user_id = v_user_id)
        order by created_at desc
        limit 80
      ) n
    ), '[]'::jsonb),
    'has_push_subscription', exists (
      select 1 from public.push_subscriptions ps
      where ps.user_id = v_user_id and ps.family_id = v_family_id
    ),
    'savings_goal', (
      select to_jsonb(sg.*)
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.paid_at >= v_cycle_start
        and fep.paid_at < v_cycle_end
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'period_month', date_trunc('month', v_cycle_start)::date,
    'payments_cycle_start', v_cycle_start,
    'payments_cycle_end', v_cycle_end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;
