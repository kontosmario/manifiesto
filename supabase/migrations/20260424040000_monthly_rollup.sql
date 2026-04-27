-- Monthly rollup: compacts each closed pay cycle into a
-- `monthly_summaries` row and archives the underlying `expenses`.
--
-- Close rules (both required):
--   1. The cycle's end date is in the past (cron-safe).
--   2. The user confirmed the next salary (family_finance.last_salary_confirmed_at >= period_end).
--
-- Triggers:
--   - AFTER INSERT/UPDATE on family_finance when last_salary_confirmed_at
--     moves forward → try close previous cycle.
--   - pg_cron 03:00 UTC daily → try close previous cycle for every family
--     (idempotent, so no-ops when already closed).

-- ─── 1. archived_at on expenses ─────────────────────────────────────
alter table public.expenses
  add column if not exists archived_at timestamptz null;

-- Hot path: active (unarchived) expenses per family, newest first.
create index if not exists expenses_family_active_idx
  on public.expenses (family_id, created_at desc)
  where archived_at is null;

-- Cold path: all expenses in an archived window (for drill-down).
create index if not exists expenses_family_archived_idx
  on public.expenses (family_id, archived_at)
  where archived_at is not null;

-- ─── 2. monthly_summaries table ────────────────────────────────────
create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  period_label text not null,

  -- Totals
  total_variable_spent numeric(14,2) not null default 0,
  total_fixed_spent numeric(14,2) not null default 0,
  total_spent numeric(14,2) not null default 0,
  expenses_count integer not null default 0,
  fixed_paid_count integer not null default 0,

  -- Context (snapshot of finance at close time)
  monthly_income numeric(14,2) not null default 0,
  savings_goal_amount numeric(14,2) not null default 0,
  savings_delta numeric(14,2) not null default 0,

  -- Detail blobs
  category_breakdown jsonb not null default '[]'::jsonb,
  daily_totals jsonb not null default '[]'::jsonb,
  by_member jsonb not null default '[]'::jsonb,
  top_expense jsonb,

  -- Comparison
  delta_vs_previous_percent numeric(6,2),

  -- Meta
  mood text check (mood in ('green','yellow','red') or mood is null),
  created_at timestamptz not null default now(),

  unique (family_id, period_start)
);

create index if not exists monthly_summaries_family_end_idx
  on public.monthly_summaries (family_id, period_end desc);

alter table public.monthly_summaries enable row level security;

drop policy if exists "monthly_summaries_select_members" on public.monthly_summaries;
create policy "monthly_summaries_select_members"
on public.monthly_summaries for select
using (public.is_family_member(family_id));

-- No INSERT/UPDATE/DELETE policies for clients; only SECURITY DEFINER
-- RPCs touch this table. Authenticated users can only read their own
-- family's summaries.

-- ─── 3. pay_date_for helper (no business-day adjustment) ───────────
-- Server-side rollup uses calendar days. Client UI adjusts for
-- business days (buildPayDate); for compaction consistency we
-- intentionally ignore that — a user who "got paid Monday instead
-- of Sunday" still has the same accounting month.
create or replace function public.pay_date_for(
  p_year int,
  p_month int,
  p_pay_day int
)
returns date
language sql
immutable
as $$
  select make_date(
    p_year,
    p_month,
    least(
      p_pay_day,
      extract(day from (
        make_date(p_year, p_month, 1) + interval '1 month - 1 day'
      ))::int
    )
  );
$$;

-- ─── 4. close_monthly_cycle RPC ────────────────────────────────────
create or replace function public.close_monthly_cycle(
  p_family_id uuid,
  p_period_start date,
  p_period_end date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_finance record;
  v_variable_total numeric := 0;
  v_fixed_total numeric := 0;
  v_expenses_count int := 0;
  v_fixed_paid_count int := 0;
  v_category_breakdown jsonb;
  v_daily_totals jsonb;
  v_by_member jsonb;
  v_top_expense jsonb;
  v_previous_total numeric;
  v_delta_pct numeric;
  v_mood text;
  v_period_label text;
  v_expected_monthly numeric;
  v_summary_id uuid;
begin
  -- Idempotency: already closed for this exact period?
  select id into v_existing_id
  from public.monthly_summaries
  where family_id = p_family_id and period_start = p_period_start;

  if v_existing_id is not null and not p_force then
    return jsonb_build_object(
      'status', 'already_closed',
      'id', v_existing_id,
      'period_start', p_period_start
    );
  end if;

  -- Load finance once (we use it for guard 2 and for context).
  select * into v_finance from public.family_finance where family_id = p_family_id;

  -- Guard 1: cycle must have ended.
  if not p_force and current_date < p_period_end then
    return jsonb_build_object('status', 'not_yet_ended', 'period_end', p_period_end);
  end if;

  -- Guard 2: user must have confirmed the next salary.
  if not p_force and (
    v_finance.last_salary_confirmed_at is null
    or v_finance.last_salary_confirmed_at < p_period_end::timestamptz
  ) then
    return jsonb_build_object(
      'status', 'salary_not_confirmed',
      'last_salary_confirmed_at', v_finance.last_salary_confirmed_at,
      'period_end', p_period_end
    );
  end if;

  -- Totals (variable = expenses without commitment_id; fixed = those with).
  select
    coalesce(sum(price) filter (where commitment_id is null), 0),
    coalesce(sum(price) filter (where commitment_id is not null), 0),
    coalesce(count(*) filter (where commitment_id is null), 0)::int
  into v_variable_total, v_fixed_total, v_expenses_count
  from public.expenses
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz;

  -- Count of fixed expenses paid in the period.
  select count(*)::int into v_fixed_paid_count
  from public.fixed_expense_payments fep
  join public.fixed_expenses fe on fe.id = fep.fixed_expense_id
  where fe.family_id = p_family_id
    and fep.period_month >= p_period_start
    and fep.period_month < p_period_end;

  -- Category breakdown (variable only).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cat_id,
      'name', cat_name,
      'color', cat_color,
      'total', cat_total,
      'count', cat_count,
      'pct', case when v_variable_total > 0
        then round((cat_total / v_variable_total) * 100, 1)
        else 0::numeric end
    ) order by cat_total desc
  ), '[]'::jsonb) into v_category_breakdown
  from (
    select
      c.id as cat_id,
      c.name as cat_name,
      c.color as cat_color,
      sum(e.price)::numeric as cat_total,
      count(*)::int as cat_count
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by c.id, c.name, c.color
  ) x;

  -- Daily totals (for sparkline).
  select coalesce(jsonb_agg(
    jsonb_build_object('day', d::text, 'total', daily_total)
    order by d asc
  ), '[]'::jsonb) into v_daily_totals
  from (
    select date(e.created_at) as d, sum(e.price)::numeric as daily_total
    from public.expenses e
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by date(e.created_at)
  ) x;

  -- Per-member contribution.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', member_id,
      'display_name', coalesce(member_name, 'Usuario'),
      'total', member_total,
      'count', member_count
    ) order by member_total desc
  ), '[]'::jsonb) into v_by_member
  from (
    select
      e.created_by as member_id,
      p.display_name as member_name,
      sum(e.price)::numeric as member_total,
      count(*)::int as member_count
    from public.expenses e
    left join public.profiles p on p.id = e.created_by
    where e.family_id = p_family_id
      and e.commitment_id is null
      and e.created_at >= p_period_start::timestamptz
      and e.created_at < p_period_end::timestamptz
    group by e.created_by, p.display_name
  ) x;

  -- Top expense (variable, highest price).
  select jsonb_build_object(
    'id', e.id,
    'description', e.description,
    'price', e.price,
    'category_id', e.category_id,
    'created_at', e.created_at
  ) into v_top_expense
  from public.expenses e
  where e.family_id = p_family_id
    and e.commitment_id is null
    and e.created_at >= p_period_start::timestamptz
    and e.created_at < p_period_end::timestamptz
  order by e.price desc, e.created_at desc
  limit 1;

  -- Delta vs previous rollup (whose period_end == this period_start).
  select total_variable_spent into v_previous_total
  from public.monthly_summaries
  where family_id = p_family_id and period_end = p_period_start
  limit 1;

  if v_previous_total is not null and v_previous_total > 0 then
    v_delta_pct := round(
      ((v_variable_total - v_previous_total) / v_previous_total) * 100,
      1
    );
  end if;

  -- Mood = how the cycle went vs expected variable budget.
  v_expected_monthly := greatest(
    0,
    coalesce(v_finance.monthly_income, 0)
      - coalesce(v_finance.savings_goal, 0)
      - v_fixed_total
  );
  v_mood := case
    when v_expected_monthly = 0 then null
    when v_variable_total <= v_expected_monthly * 0.85 then 'green'
    when v_variable_total <= v_expected_monthly then 'yellow'
    else 'red'
  end;

  v_period_label := (case extract(month from p_period_start)::int
    when 1 then 'Enero'
    when 2 then 'Febrero'
    when 3 then 'Marzo'
    when 4 then 'Abril'
    when 5 then 'Mayo'
    when 6 then 'Junio'
    when 7 then 'Julio'
    when 8 then 'Agosto'
    when 9 then 'Septiembre'
    when 10 then 'Octubre'
    when 11 then 'Noviembre'
    when 12 then 'Diciembre'
  end) || ' ' || extract(year from p_period_start)::text;

  -- Upsert the summary.
  insert into public.monthly_summaries (
    family_id, period_start, period_end, period_label,
    total_variable_spent, total_fixed_spent, total_spent,
    expenses_count, fixed_paid_count,
    monthly_income, savings_goal_amount, savings_delta,
    category_breakdown, daily_totals, by_member, top_expense,
    delta_vs_previous_percent, mood
  )
  values (
    p_family_id, p_period_start, p_period_end, v_period_label,
    v_variable_total, v_fixed_total, v_variable_total + v_fixed_total,
    v_expenses_count, v_fixed_paid_count,
    coalesce(v_finance.monthly_income, 0),
    coalesce(v_finance.savings_goal, 0),
    greatest(0, coalesce(v_finance.monthly_income, 0) - (v_variable_total + v_fixed_total)),
    v_category_breakdown, v_daily_totals, v_by_member, v_top_expense,
    v_delta_pct, v_mood
  )
  on conflict (family_id, period_start) do update set
    period_end = excluded.period_end,
    period_label = excluded.period_label,
    total_variable_spent = excluded.total_variable_spent,
    total_fixed_spent = excluded.total_fixed_spent,
    total_spent = excluded.total_spent,
    expenses_count = excluded.expenses_count,
    fixed_paid_count = excluded.fixed_paid_count,
    monthly_income = excluded.monthly_income,
    savings_goal_amount = excluded.savings_goal_amount,
    savings_delta = excluded.savings_delta,
    category_breakdown = excluded.category_breakdown,
    daily_totals = excluded.daily_totals,
    by_member = excluded.by_member,
    top_expense = excluded.top_expense,
    delta_vs_previous_percent = excluded.delta_vs_previous_percent,
    mood = excluded.mood
  returning id into v_summary_id;

  -- Archive the underlying expenses (soft delete via archived_at).
  update public.expenses
  set archived_at = now()
  where family_id = p_family_id
    and created_at >= p_period_start::timestamptz
    and created_at < p_period_end::timestamptz
    and archived_at is null;

  return jsonb_build_object(
    'status', 'closed',
    'id', v_summary_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'period_label', v_period_label,
    'variable_total', v_variable_total,
    'fixed_total', v_fixed_total,
    'expenses_count', v_expenses_count
  );
end;
$$;

revoke all on function public.close_monthly_cycle(uuid, date, date, boolean) from public;
-- Intentionally NOT granted to authenticated: only triggers / cron
-- (which run as security definer owners) can invoke close.

-- ─── 5. try_close_previous_cycle (period computation + delegate) ───
create or replace function public.try_close_previous_cycle(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finance record;
  v_pay int;
  v_today date := current_date;
  v_ty int := extract(year from v_today)::int;
  v_tm int := extract(month from v_today)::int;
  v_pay_this date;
  v_current_start date;
  v_before_current date;
  v_prev_start date;
begin
  select * into v_finance from public.family_finance where family_id = p_family_id;
  if not found then
    return jsonb_build_object('status', 'no_finance_record');
  end if;

  v_pay := coalesce(v_finance.salary_payment_day, 1);
  v_pay_this := public.pay_date_for(v_ty, v_tm, v_pay);

  -- Current cycle start = the most recent pay date <= today.
  if v_today >= v_pay_this then
    v_current_start := v_pay_this;
  else
    -- Go one month back.
    v_before_current := make_date(v_ty, v_tm, 1) - interval '1 day';
    v_current_start := public.pay_date_for(
      extract(year from v_before_current)::int,
      extract(month from v_before_current)::int,
      v_pay
    );
  end if;

  -- Previous cycle spans [prev_start, current_start).
  v_before_current := (v_current_start - interval '1 day')::date;
  v_prev_start := public.pay_date_for(
    extract(year from v_before_current)::int,
    extract(month from v_before_current)::int,
    v_pay
  );

  return public.close_monthly_cycle(
    p_family_id,
    v_prev_start,
    v_current_start,
    false
  );
end;
$$;

revoke all on function public.try_close_previous_cycle(uuid) from public;
-- Only the salary trigger and the cron call this — no client access.

-- ─── 6. Trigger on family_finance ──────────────────────────────────
create or replace function public.trg_family_finance_on_salary_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only react when last_salary_confirmed_at moved forward to a real
  -- timestamp (INSERT with non-null, or UPDATE to a newer value).
  if TG_OP = 'INSERT' then
    if NEW.last_salary_confirmed_at is not null then
      perform public.try_close_previous_cycle(NEW.family_id);
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.last_salary_confirmed_at is distinct from OLD.last_salary_confirmed_at
       and NEW.last_salary_confirmed_at is not null
       and (OLD.last_salary_confirmed_at is null
            or NEW.last_salary_confirmed_at > OLD.last_salary_confirmed_at) then
      perform public.try_close_previous_cycle(NEW.family_id);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_family_finance_salary_confirm on public.family_finance;
create trigger trg_family_finance_salary_confirm
after insert or update on public.family_finance
for each row execute function public.trg_family_finance_on_salary_confirm();

-- ─── 7. Cron wrapper (daily sweeper) ───────────────────────────────
create or replace function public.cron_close_previous_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_result jsonb;
begin
  for r in select family_id from public.family_finance loop
    begin
      v_result := public.try_close_previous_cycle(r.family_id);
      if (v_result->>'status') = 'closed' then
        raise notice 'Closed cycle for family %: % → %',
          r.family_id, v_result->>'period_label', v_result->>'variable_total';
      end if;
    exception when others then
      raise notice 'Close failed for family %: %', r.family_id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke all on function public.cron_close_previous_cycles() from public;
grant execute on function public.cron_close_previous_cycles() to service_role;

-- ─── 8. pg_cron schedule (idempotent) ──────────────────────────────
do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping close-cycles schedule.';
    return;
  end if;

  begin
    perform cron.unschedule('close-previous-cycles');
  exception when others then null;
  end;

  -- 03:00 UTC = 00:00 AR. Safe slot after midnight.
  perform cron.schedule(
    'close-previous-cycles',
    '0 3 * * *',
    $cron$select public.cron_close_previous_cycles();$cron$
  );
exception when others then
  raise notice 'pg_cron schedule failed: %', sqlerrm;
end;
$$;

-- ─── 9. Update home_snapshot to exclude archived expenses ──────────
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
          from public.profiles where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'notifications', '[]'::jsonb,
      'family_members', '[]'::jsonb,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'has_push_subscription', false,
      'period_month', v_period_month
    );
  end if;

  select f.code into v_family_code from public.families f where f.id = v_family_id;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object('familyId', v_family_id, 'familyCode', v_family_code),
    'family_finance', (select to_jsonb(ff.*) from public.family_finance ff where ff.family_id = v_family_id),
    'fixed_expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fe.id, 'family_id', fe.family_id, 'name', fe.name,
          'amount', fe.amount::float8, 'kind', fe.kind, 'status', fe.status,
          'frequency', fe.frequency, 'category_id', fe.category_id,
          'next_due_on', fe.next_due_on, 'day_of_month', fe.day_of_month,
          'ends_on', fe.ends_on, 'installments_total', fe.installments_total,
          'installments_paid', fe.installments_paid,
          'remaining_balance', fe.remaining_balance::float8,
          'lender_name', fe.lender_name, 'notes', fe.notes,
          'notify_days_before', fe.notify_days_before,
          'last_paid_at', fe.last_paid_at,
          'created_at', fe.created_at, 'updated_at', fe.updated_at
        )
        order by fe.status asc, fe.next_due_on asc nulls last, fe.created_at asc
      )
      from public.fixed_expenses fe where fe.family_id = v_family_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'family_id', e.family_id, 'category_id', e.category_id,
          'commitment_id', e.commitment_id, 'description', e.description,
          'price', e.price::float8, 'created_by', e.created_by,
          'created_at', e.created_at,
          'creator_display_name', coalesce(p.display_name, 'Sin nombre')
        )
        order by e.created_at desc
      )
      from public.expenses e
      left join public.profiles p on p.id = e.created_by
      where e.family_id = v_family_id
        and e.archived_at is null
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'family_id', c.family_id, 'name', c.name,
          'color', c.color, 'template_id', c.template_id,
          'scope', c.scope, 'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'family_id', c.family_id, 'name', c.name,
          'color', c.color, 'template_id', c.template_id,
          'scope', c.scope, 'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', coalesce((
      select count(*)::int from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ), 0),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id, 'family_id', n.family_id, 'user_id', n.user_id,
          'title', n.title, 'body', n.body, 'kind', n.kind,
          'severity', n.severity, 'created_by', n.created_by,
          'created_at', n.created_at, 'read_at', n.read_at,
          'metadata', n.metadata
        )
        order by n.created_at desc
      )
      from (
        select * from public.notifications
        where family_id = v_family_id
          and (user_id is null or user_id = v_user_id)
        order by created_at desc
        limit 80
      ) n
    ), '[]'::jsonb),
    'family_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', fm.user_id, 'role', fm.role,
          'blocked_at', fm.blocked_at,
          'display_name', p.display_name, 'avatar_animal', p.avatar_animal,
          'created_at', fm.created_at
        )
        order by
          case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
          fm.created_at asc
      )
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'savings_goal', (
      select jsonb_build_object(
        'id', sg.id, 'family_id', sg.family_id, 'title', sg.title,
        'emoji', sg.emoji,
        'goal_amount', sg.goal_amount::float8,
        'current_amount', sg.current_amount::float8,
        'target_months', sg.target_months,
        'is_active', sg.is_active,
        'created_at', sg.created_at, 'updated_at', sg.updated_at
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.period_month = v_period_month
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'has_push_subscription', exists (
      select 1 from public.push_subscriptions ps
      where ps.family_id = v_family_id and ps.user_id = v_user_id
    ),
    'period_month', v_period_month
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;
