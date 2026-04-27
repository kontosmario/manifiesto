-- ════════════════════════════════════════════════════════════════════
-- Control intelligence layer
--
-- Ships the server-side primitives that power the new Control screen:
--
--   1. category_limits          per-category monthly cap + warning %.
--   2. fixed_expense_price_history  audit trail of amount changes.
--   3. fixed_expenses.last_used_at  user-confirmed "still using it"
--                                   marker for zombie detection.
--   4. velocity_snapshots       daily rollup of spending velocity +
--                               stress signal per family.
--   5. home_snapshot extension  exposes last 6 monthly_summaries,
--                               category_limits and today's velocity.
--   6. cron_compute_velocity_snapshots  materialises velocity daily.
--   7. cron_detect_zombies      emits zombie_alert notifications
--                               (weekly).
--   8. cron_detect_price_hikes  emits price_hike notifications when a
--                               fixed_expense jumped ≥10% (daily).
--   9. pg_cron schedules for 6/7/8.
--
-- Everything uses America/Argentina/Buenos_Aires where relevant.
-- All helper/cron functions are SECURITY DEFINER + set search_path.
-- Migration is idempotent (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE,
-- DO blocks with guards). Client access goes through RLS policies
-- anchored on public.is_family_member / public.is_family_owner.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1 · category_limits ────────────────────────────────────────────
create table if not exists public.category_limits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_cap numeric(14,2) not null check (monthly_cap >= 0),
  warning_threshold_pct int not null default 80
    check (warning_threshold_pct between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, category_id)
);

create index if not exists category_limits_family_idx
  on public.category_limits (family_id);

alter table public.category_limits enable row level security;

drop policy if exists "category_limits_select_members" on public.category_limits;
create policy "category_limits_select_members"
on public.category_limits for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "category_limits_insert_owner" on public.category_limits;
create policy "category_limits_insert_owner"
on public.category_limits for insert
to authenticated
with check (public.is_family_owner(family_id));

drop policy if exists "category_limits_update_owner" on public.category_limits;
create policy "category_limits_update_owner"
on public.category_limits for update
to authenticated
using (public.is_family_owner(family_id))
with check (public.is_family_owner(family_id));

drop policy if exists "category_limits_delete_owner" on public.category_limits;
create policy "category_limits_delete_owner"
on public.category_limits for delete
to authenticated
using (public.is_family_owner(family_id));

-- touch updated_at on every UPDATE
create or replace function public.trg_category_limits_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_category_limits_touch on public.category_limits;
create trigger trg_category_limits_touch
before update on public.category_limits
for each row execute function public.trg_category_limits_touch_updated_at();

-- ─── 2 · fixed_expense_price_history ────────────────────────────────
create table if not exists public.fixed_expense_price_history (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null
    references public.fixed_expenses(id) on delete cascade,
  previous_amount numeric(14,2),
  new_amount numeric(14,2) not null,
  delta_pct numeric(10,2),
  source text not null check (source in ('create','update','payment')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists fixed_expense_price_history_fe_idx
  on public.fixed_expense_price_history (fixed_expense_id, changed_at desc);

alter table public.fixed_expense_price_history enable row level security;

-- Members of the owning family may read their own history.
drop policy if exists "fixed_expense_price_history_select_members"
  on public.fixed_expense_price_history;
create policy "fixed_expense_price_history_select_members"
on public.fixed_expense_price_history for select
to authenticated
using (
  exists (
    select 1
    from public.fixed_expenses fe
    where fe.id = fixed_expense_price_history.fixed_expense_id
      and public.is_family_member(fe.family_id)
  )
);

-- No INSERT/UPDATE/DELETE for clients; only the trigger (SECURITY
-- DEFINER) writes rows.

-- Trigger: emit a price-history row when amount changes (or on INSERT).
create or replace function public.trg_fixed_expenses_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta_pct numeric(10,2);
  v_source text;
  v_previous numeric(14,2);
begin
  if tg_op = 'INSERT' then
    v_source := 'create';
    v_previous := null;
    v_delta_pct := null;
  elsif tg_op = 'UPDATE' then
    if new.amount is not distinct from old.amount then
      return new;
    end if;
    v_source := 'update';
    v_previous := old.amount;
    if coalesce(old.amount, 0) > 0 then
      v_delta_pct := round(
        ((new.amount - old.amount) / old.amount) * 100,
        2
      );
    else
      v_delta_pct := null;
    end if;
  else
    return new;
  end if;

  begin
    insert into public.fixed_expense_price_history (
      fixed_expense_id, previous_amount, new_amount,
      delta_pct, source, changed_by
    )
    values (
      new.id, v_previous, new.amount,
      v_delta_pct, v_source, auth.uid()
    );
  exception when others then
    -- never block the write on history failure
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_fixed_expenses_price_history_ins on public.fixed_expenses;
create trigger trg_fixed_expenses_price_history_ins
after insert on public.fixed_expenses
for each row execute function public.trg_fixed_expenses_price_history();

drop trigger if exists trg_fixed_expenses_price_history_upd on public.fixed_expenses;
create trigger trg_fixed_expenses_price_history_upd
after update of amount on public.fixed_expenses
for each row execute function public.trg_fixed_expenses_price_history();

-- ─── 3 · fixed_expenses.last_used_at ────────────────────────────────
-- User-confirmed "still using it" marker. NULL = never confirmed.
alter table public.fixed_expenses
  add column if not exists last_used_at timestamptz null;

-- ─── 4 · velocity_snapshots ─────────────────────────────────────────
create table if not exists public.velocity_snapshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  snapshot_date date not null,
  avg_daily_last_7 numeric(14,2) not null default 0,
  avg_daily_last_30 numeric(14,2) not null default 0,
  momentum numeric(10,4) not null default 1,
  forecast_close_amount numeric(14,2) not null default 0,
  stress_level text not null
    check (stress_level in ('calm','watch','warn','critical'))
    default 'calm',
  created_at timestamptz not null default now(),
  unique (family_id, snapshot_date)
);

create index if not exists velocity_snapshots_family_date_idx
  on public.velocity_snapshots (family_id, snapshot_date desc);

alter table public.velocity_snapshots enable row level security;

drop policy if exists "velocity_snapshots_select_members" on public.velocity_snapshots;
create policy "velocity_snapshots_select_members"
on public.velocity_snapshots for select
to authenticated
using (public.is_family_member(family_id));

-- No client writes: only the SECURITY DEFINER cron mutates this table.

-- ─── 5 · home_snapshot extension ────────────────────────────────────
-- Preserves every existing field and adds:
--   - monthly_summaries_history: last 6 rollups (minus by_member /
--     top_expense to keep payload light).
--   - category_limits: the family's per-category caps.
--   - velocity_today: most recent velocity_snapshot row (or null).
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
      'period_month', v_period_month,
      'monthly_summaries_history', '[]'::jsonb,
      'category_limits', '[]'::jsonb,
      'velocity_today', null
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
          'last_used_at', fe.last_used_at,
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
    'period_month', v_period_month,

    -- Control layer additions ───────────────────────────────────────
    'monthly_summaries_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'period_start', ms.period_start,
          'period_end', ms.period_end,
          'period_label', ms.period_label,
          'total_variable_spent', ms.total_variable_spent::float8,
          'total_fixed_spent', ms.total_fixed_spent::float8,
          'total_spent', ms.total_spent::float8,
          'expenses_count', ms.expenses_count,
          'fixed_paid_count', ms.fixed_paid_count,
          'monthly_income', ms.monthly_income::float8,
          'savings_delta', ms.savings_delta::float8,
          'category_breakdown', ms.category_breakdown,
          'daily_totals', ms.daily_totals,
          'delta_vs_previous_percent', ms.delta_vs_previous_percent,
          'mood', ms.mood
        )
        order by ms.period_start desc
      )
      from (
        select *
        from public.monthly_summaries
        where family_id = v_family_id
        order by period_start desc
        limit 6
      ) ms
    ), '[]'::jsonb),
    'category_limits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cl.id,
          'category_id', cl.category_id,
          'monthly_cap', cl.monthly_cap::float8,
          'warning_threshold_pct', cl.warning_threshold_pct
        )
        order by cl.created_at asc
      )
      from public.category_limits cl
      where cl.family_id = v_family_id
    ), '[]'::jsonb),
    'velocity_today', (
      select jsonb_build_object(
        'id', vs.id,
        'family_id', vs.family_id,
        'snapshot_date', vs.snapshot_date,
        'avg_daily_last_7', vs.avg_daily_last_7::float8,
        'avg_daily_last_30', vs.avg_daily_last_30::float8,
        'momentum', vs.momentum::float8,
        'forecast_close_amount', vs.forecast_close_amount::float8,
        'stress_level', vs.stress_level,
        'created_at', vs.created_at
      )
      from public.velocity_snapshots vs
      where vs.family_id = v_family_id
      order by vs.snapshot_date desc
      limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;

-- ─── 6 · cron_compute_velocity_snapshots ────────────────────────────
-- Materialises a velocity row per family for TODAY (AR timezone).
-- Skips families with no expenses in the last 30 days.
create or replace function public.cron_compute_velocity_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_rec record;
  v_sum_7 numeric(14,2);
  v_sum_30 numeric(14,2);
  v_avg_7 numeric(14,2);
  v_avg_30 numeric(14,2);
  v_momentum numeric(10,4);
  v_monthly_income numeric(14,2);
  v_sum_fijos numeric(14,2);
  v_libre numeric(14,2);
  v_days_in_month int;
  v_forecast numeric(14,2);
  v_stress text;
begin
  v_days_in_month := extract(
    day from (date_trunc('month', v_today) + interval '1 month - 1 day')
  )::int;

  for v_rec in
    select distinct e.family_id
    from public.expenses e
    where e.created_at >= (v_today - interval '30 days')::timestamptz
  loop
    begin
      -- Active (not archived) expenses in last 7 days.
      select coalesce(sum(e.price), 0) into v_sum_7
      from public.expenses e
      where e.family_id = v_rec.family_id
        and e.archived_at is null
        and e.created_at >= (v_today - interval '7 days')::timestamptz;

      -- Include archived in the 30-day window (cross-cycle data still
      -- represents the family's spending rhythm).
      select coalesce(sum(e.price), 0) into v_sum_30
      from public.expenses e
      where e.family_id = v_rec.family_id
        and e.created_at >= (v_today - interval '30 days')::timestamptz;

      v_avg_7 := round(v_sum_7 / 7.0, 2);
      v_avg_30 := round(v_sum_30 / 30.0, 2);

      if v_avg_30 > 0 then
        v_momentum := round(v_avg_7 / v_avg_30, 4);
      else
        v_momentum := 1;
      end if;

      select coalesce(ff.monthly_income, 0) into v_monthly_income
      from public.family_finance ff
      where ff.family_id = v_rec.family_id;
      v_monthly_income := coalesce(v_monthly_income, 0);

      select coalesce(sum(fe.amount), 0) into v_sum_fijos
      from public.fixed_expenses fe
      where fe.family_id = v_rec.family_id
        and coalesce(fe.status, 'active') = 'active';

      v_libre := v_monthly_income - coalesce(v_sum_fijos, 0);
      v_forecast := round(v_avg_7 * v_days_in_month, 2);

      if v_libre <= 0 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.15 then
        v_stress := 'critical';
      elsif v_forecast > v_libre * 1.00 then
        v_stress := 'warn';
      elsif v_forecast > v_libre * 0.85 then
        v_stress := 'watch';
      else
        v_stress := 'calm';
      end if;

      insert into public.velocity_snapshots (
        family_id, snapshot_date,
        avg_daily_last_7, avg_daily_last_30,
        momentum, forecast_close_amount, stress_level
      )
      values (
        v_rec.family_id, v_today,
        v_avg_7, v_avg_30,
        v_momentum, v_forecast, v_stress
      )
      on conflict (family_id, snapshot_date) do update set
        avg_daily_last_7 = excluded.avg_daily_last_7,
        avg_daily_last_30 = excluded.avg_daily_last_30,
        momentum = excluded.momentum,
        forecast_close_amount = excluded.forecast_close_amount,
        stress_level = excluded.stress_level;
    exception when others then
      raise notice 'velocity snapshot failed for family %: %',
        v_rec.family_id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_compute_velocity_snapshots: %', sqlerrm;
end;
$$;

revoke all on function public.cron_compute_velocity_snapshots() from public;
grant execute on function public.cron_compute_velocity_snapshots() to service_role;
grant execute on function public.cron_compute_velocity_snapshots() to authenticated;

-- ─── 7 · cron_detect_zombies ────────────────────────────────────────
-- Flags periodic (subscription-style) fixed_expenses that have ≥2
-- payments and haven't been "used" in 60+ days. Deduped 14 days.
create or replace function public.cron_detect_zombies()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_payment_count int;
begin
  for v_rec in
    select fe.id, fe.family_id, fe.name, fe.amount, fe.last_used_at
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and coalesce(fe.kind, 'periodic') = 'periodic'
      and (fe.last_used_at is null or fe.last_used_at < now() - interval '60 days')
  loop
    begin
      select count(*)::int into v_payment_count
      from public.fixed_expense_payments fep
      where fep.fixed_expense_id = v_rec.id;

      if coalesce(v_payment_count, 0) < 2 then
        continue;
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_rec.family_id
          and n.kind = 'zombie_alert'
          and (n.metadata ->> 'fixed_expense_id') = v_rec.id::text
          and n.created_at >= now() - interval '14 days'
      ) then
        continue;
      end if;

      perform public.emit_notification(
        v_rec.family_id,
        null,
        'Suscripción sin usar',
        coalesce(nullif(btrim(v_rec.name), ''), 'Compromiso')
          || ' · $' || to_char(round(coalesce(v_rec.amount, 0)), 'FM999,999,999')
          || ' sin movimiento hace 60+ días.',
        'zombie_alert',
        'warning',
        null,
        jsonb_build_object(
          'route', '/fixed-expenses',
          'fixed_expense_id', v_rec.id,
          'name', v_rec.name,
          'amount', v_rec.amount
        )
      );
    exception when others then
      raise notice 'zombie detect failed for fixed_expense %: %',
        v_rec.id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_detect_zombies: %', sqlerrm;
end;
$$;

revoke all on function public.cron_detect_zombies() from public;
grant execute on function public.cron_detect_zombies() to service_role;
grant execute on function public.cron_detect_zombies() to authenticated;

-- ─── 8 · cron_detect_price_hikes ────────────────────────────────────
-- Scans last 24h of price_history for jumps ≥10% and emits price_hike
-- notifications (deduped 7 days per fixed_expense_id).
create or replace function public.cron_detect_price_hikes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_family_id uuid;
  v_name text;
begin
  for v_rec in
    select h.fixed_expense_id, h.previous_amount, h.new_amount, h.delta_pct
    from public.fixed_expense_price_history h
    where h.changed_at >= now() - interval '24 hours'
      and coalesce(h.delta_pct, 0) >= 10
    order by h.changed_at desc
  loop
    begin
      select fe.family_id, fe.name into v_family_id, v_name
      from public.fixed_expenses fe
      where fe.id = v_rec.fixed_expense_id;

      if v_family_id is null then
        continue;
      end if;

      if exists (
        select 1 from public.notifications n
        where n.family_id = v_family_id
          and n.kind = 'price_hike'
          and (n.metadata ->> 'fixed_expense_id') = v_rec.fixed_expense_id::text
          and n.created_at >= now() - interval '7 days'
      ) then
        continue;
      end if;

      perform public.emit_notification(
        v_family_id,
        null,
        'Subió ' || coalesce(nullif(btrim(v_name), ''), 'un compromiso'),
        '+' || to_char(v_rec.delta_pct, 'FM990.0') || '% · de $'
          || to_char(round(coalesce(v_rec.previous_amount, 0)), 'FM999,999,999')
          || ' a $' || to_char(round(v_rec.new_amount), 'FM999,999,999') || '.',
        'price_hike',
        'info',
        null,
        jsonb_build_object(
          'route', '/fixed-expenses',
          'fixed_expense_id', v_rec.fixed_expense_id,
          'previous_amount', v_rec.previous_amount,
          'new_amount', v_rec.new_amount,
          'delta_pct', v_rec.delta_pct
        )
      );
    exception when others then
      raise notice 'price hike detect failed for fixed_expense %: %',
        v_rec.fixed_expense_id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_detect_price_hikes: %', sqlerrm;
end;
$$;

revoke all on function public.cron_detect_price_hikes() from public;
grant execute on function public.cron_detect_price_hikes() to service_role;
grant execute on function public.cron_detect_price_hikes() to authenticated;

-- ─── 9 · pg_cron schedules ──────────────────────────────────────────
-- 04:00 UTC = 01:00 AR — velocity snapshot.
-- 04:15 UTC Mondays     — zombie sweep.
-- 04:30 UTC daily       — price hike sweep.
do $$
declare
  v_has_cron boolean;
  v_job_names text[] := array[
    'control_velocity',
    'control_zombies',
    'control_price_hikes'
  ];
  v_name text;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping control schedules.';
    return;
  end if;

  foreach v_name in array v_job_names loop
    begin
      perform cron.unschedule(v_name);
    exception when others then null;
    end;
  end loop;

  perform cron.schedule(
    'control_velocity',
    '0 4 * * *',
    $cron$select public.cron_compute_velocity_snapshots();$cron$
  );
  perform cron.schedule(
    'control_zombies',
    '15 4 * * 1',
    $cron$select public.cron_detect_zombies();$cron$
  );
  perform cron.schedule(
    'control_price_hikes',
    '30 4 * * *',
    $cron$select public.cron_detect_price_hikes();$cron$
  );
exception when others then
  raise notice 'pg_cron control schedule failed: %', sqlerrm;
end;
$$;
