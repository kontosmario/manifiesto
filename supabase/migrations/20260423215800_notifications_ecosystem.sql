-- ════════════════════════════════════════════════════════════════════
-- Notifications — Fase 1 (schema) + Fase 3 (streak/goal/fixed triggers)
--
-- Adds targeting + severity + metadata columns, then teaches the
-- streak state machine, the record-fixed-expense-payment RPC, and
-- the savings_goals update flow to emit rows into public.notifications.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1.1 · Schema changes on public.notifications ──────────────────
alter table public.notifications
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists read_at timestamptz null,
  add column if not exists severity text not null default 'info',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_severity_check'
  ) then
    alter table public.notifications
      add constraint notifications_severity_check
      check (severity in ('info','success','warning','alert'));
  end if;
exception when duplicate_object then null;
end;
$$;

create index if not exists notifications_family_user_unread_idx
  on public.notifications (family_id, user_id, read_at, created_at desc);

create index if not exists notifications_family_kind_idx
  on public.notifications (family_id, kind, created_at desc);

-- RLS — allow a member to mark their own notifs as read.
drop policy if exists "notifications_update_mark_read" on public.notifications;
create policy "notifications_update_mark_read"
on public.notifications
for update
to authenticated
using (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
)
with check (
  public.is_family_member(family_id)
  and (user_id is null or user_id = auth.uid())
);

-- ─── 1.2 · Helper to write notifications from SQL ──────────────────
create or replace function public.emit_notification(
  p_family_id uuid,
  p_user_id uuid,
  p_title text,
  p_body text,
  p_kind text,
  p_severity text default 'info',
  p_created_by uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    family_id, user_id, title, body, kind, severity, created_by, metadata
  )
  values (
    p_family_id, p_user_id, p_title, p_body, p_kind, p_severity, p_created_by, p_metadata
  )
  returning id into v_id;
  return v_id;
exception
  when others then
    return null;
end;
$$;

grant execute on function public.emit_notification(uuid, uuid, text, text, text, text, uuid, jsonb) to authenticated;

-- ─── 2 · Rewrite expense/fixed_expense notification triggers
--        so they populate severity + metadata properly. ────────────
create or replace function public.notify_expense_change()
returns trigger
language plpgsql
as $$
begin
  perform public.emit_notification(
    new.family_id,
    null,
    'Nuevo gasto cargado',
    concat(
      coalesce(nullif(btrim(new.description), ''), 'Sin descripción'),
      ' · $',
      coalesce(new.price, 0)::text
    ),
    case when new.commitment_id is not null then 'fixed_paid' else 'expense_logged' end,
    'info',
    new.created_by,
    jsonb_build_object(
      'route', case when new.commitment_id is not null then '/fixed-expenses' else '/expenses' end,
      'expense_id', new.id,
      'commitment_id', new.commitment_id,
      'amount', new.price
    )
  );
  return new;
exception when others then return new;
end;
$$;

drop trigger if exists trg_expense_notification on public.expenses;
create trigger trg_expense_notification
after insert on public.expenses
for each row execute function public.notify_expense_change();

create or replace function public.notify_fixed_expense_change()
returns trigger
language plpgsql
as $$
declare
  v_family_id uuid;
  v_name text;
  v_amount numeric(12,2);
  v_title text;
  v_kind text;
  v_severity text;
begin
  if tg_op = 'UPDATE'
     and old.name is not distinct from new.name
     and old.amount is not distinct from new.amount
     and old.kind is not distinct from new.kind
     and old.frequency is not distinct from new.frequency
     and old.category_id is not distinct from new.category_id
     and old.ends_on is not distinct from new.ends_on
     and old.installments_total is not distinct from new.installments_total
     and old.lender_name is not distinct from new.lender_name
     and old.notes is not distinct from new.notes then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_family_id := new.family_id;
    v_name := new.name;
    v_amount := new.amount;
    v_title := 'Nuevo compromiso';
    v_kind := 'fixed_created';
    v_severity := 'info';
  elsif tg_op = 'UPDATE' then
    v_family_id := new.family_id;
    v_name := new.name;
    v_amount := new.amount;
    v_title := 'Compromiso actualizado';
    v_kind := 'fixed_edited';
    v_severity := 'info';
  else
    v_family_id := old.family_id;
    v_name := old.name;
    v_amount := old.amount;
    v_title := 'Compromiso eliminado';
    v_kind := 'fixed_deleted';
    v_severity := 'info';
  end if;

  perform public.emit_notification(
    v_family_id,
    null,
    v_title,
    concat(coalesce(nullif(btrim(v_name), ''), 'Sin nombre'), ' · $', coalesce(v_amount, 0)::text),
    v_kind,
    v_severity,
    auth.uid(),
    jsonb_build_object(
      'route', '/fixed-expenses',
      'fixed_expense_id', coalesce(new.id, old.id),
      'amount', v_amount
    )
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ─── 3.1 · Streak state machine emits notifications on milestones,
--          shield grants, shield consumes, and level-ups. ──────────
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
  v_gap integer;
  v_new_streak integer;
  v_new_tokens smallint;
  v_new_days_since integer;
  v_regression integer;
  v_level_start integer;
  v_emitted_streak integer := null;
  v_old_level_start integer;
  v_new_level_start integer;
  v_shield_consumed boolean := false;
  v_shield_earned boolean := false;
begin
  insert into public.user_streaks (family_id, user_id)
  values (p_family_id, p_user_id)
  on conflict (family_id, user_id) do nothing;

  select * into v_row from public.user_streaks
  where family_id = p_family_id and user_id = p_user_id for update;

  -- same day → no-op
  if v_row.last_logged_date is not null and v_row.last_logged_date = p_event_date then
    return;
  end if;

  -- ── first ever
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
    v_emitted_streak := 1;
  else
    v_gap := p_event_date - v_row.last_logged_date;

    if v_gap = 1 then
      v_new_streak := v_row.current_streak + 1;
      v_new_days_since := v_row.days_since_last_token_grant + 1;
      v_new_tokens := v_row.freeze_tokens;
      if v_new_days_since >= 7 and v_new_tokens < 2 then
        v_new_tokens := v_new_tokens + 1;
        v_new_days_since := 0;
        v_shield_earned := true;
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
      v_emitted_streak := v_new_streak;
    elsif v_gap = 2 and v_row.freeze_tokens > 0 then
      v_new_streak := v_row.current_streak + 1;
      v_new_days_since := v_row.days_since_last_token_grant + 2;
      v_new_tokens := v_row.freeze_tokens - 1;
      v_shield_consumed := true;
      if v_new_days_since >= 7 and v_new_tokens < 2 then
        v_new_tokens := v_new_tokens + 1;
        v_new_days_since := 0;
        v_shield_earned := true;
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
      v_emitted_streak := v_new_streak;
    else
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
      v_emitted_streak := v_regression;

      perform public.emit_notification(
        p_family_id, p_user_id,
        'La racha se cortó',
        'Arrancás desde el día ' || v_regression || '. Cargá hoy y recuperás el ritmo.',
        'streak_broken',
        'alert',
        p_user_id,
        jsonb_build_object('route', '/expenses', 'regression_day', v_regression)
      );
    end if;
  end if;

  -- Emitter: shield events.
  if v_shield_consumed then
    perform public.emit_notification(
      p_family_id, p_user_id,
      'Tu escudo salvó la racha',
      'Se consumió 1 escudo. Te queda ' || v_new_tokens || '.',
      'shield_used', 'info', p_user_id,
      jsonb_build_object('route', '/expenses')
    );
  end if;
  if v_shield_earned then
    perform public.emit_notification(
      p_family_id, p_user_id,
      'Ganaste un escudo 🛡️',
      '7 días seguidos. Ya tenés ' || v_new_tokens || ' escudo(s) disponibles.',
      'shield_earned', 'success', p_user_id,
      jsonb_build_object('route', '/expenses')
    );
  end if;

  -- Emitter: milestones on level-up boundaries.
  if v_emitted_streak is not null and v_emitted_streak in (7, 14, 30, 60, 90) then
    v_old_level_start := case
      when v_row.current_streak >= 90 then 90
      when v_row.current_streak >= 60 then 60
      when v_row.current_streak >= 30 then 30
      when v_row.current_streak >= 14 then 14
      when v_row.current_streak >= 7 then 7
      else 0
    end;
    if v_emitted_streak <> v_old_level_start then
      perform public.emit_notification(
        p_family_id, p_user_id,
        '🔥 ' || v_emitted_streak || ' días seguidos',
        'Subiste de nivel — seguí registrando para llegar al próximo.',
        'streak_milestone', 'success', p_user_id,
        jsonb_build_object('route', '/expenses', 'streak', v_emitted_streak)
      );
    end if;
  end if;
end;
$$;

grant execute on function public.advance_streak(uuid, uuid, date) to authenticated;

-- ─── 3.2 · Fixed-expense payment notification (success severity) ───
create or replace function public.record_fixed_expense_payment(p_fixed_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.fixed_expenses%rowtype;
  v_expense_id uuid;
  v_next_due date;
  v_payment_amount numeric(12,2);
  v_remaining_balance numeric(12,2);
  v_installments_paid integer;
  v_new_status text;
  v_period_month date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa para registrar pagos.';
  end if;

  select * into v_commitment from public.fixed_expenses where id = p_fixed_expense_id;
  if not found then raise exception 'Compromiso no encontrado.'; end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_commitment.family_id and fm.user_id = auth.uid()
  ) then raise exception 'No tenés permisos para registrar este pago.'; end if;

  if v_commitment.status <> 'active' then
    raise exception 'Solo podés registrar pagos sobre compromisos activos.';
  end if;

  if v_commitment.category_id is null then
    raise exception 'Definí una categoría antes de registrar el pago.';
  end if;

  v_payment_amount := case
    when v_commitment.kind = 'debt' and coalesce(v_commitment.remaining_balance, 0) > 0
      then least(v_commitment.amount, v_commitment.remaining_balance)
    else v_commitment.amount
  end;

  -- NOTE: this insert fires trg_expense_notification → it emits a
  -- 'fixed_paid' row already (we detect commitment_id is not null).
  -- So we DO NOT emit a second notification here.
  insert into public.expenses (family_id, category_id, commitment_id, description, price, created_by)
  values (
    v_commitment.family_id, v_commitment.category_id, v_commitment.id,
    coalesce(nullif(btrim(v_commitment.name), ''), 'Compromiso'),
    v_payment_amount, auth.uid()
  )
  returning id into v_expense_id;

  v_period_month := date_trunc('month', current_date)::date;
  insert into public.fixed_expense_payments (fixed_expense_id, period_month, paid_by)
  values (v_commitment.id, v_period_month, auth.uid())
  on conflict (fixed_expense_id, period_month) do nothing;

  v_next_due := public.advance_fixed_expense_due_date(
    v_commitment.next_due_on, v_commitment.frequency, v_commitment.day_of_month
  );
  v_installments_paid := coalesce(v_commitment.installments_paid, 0);
  v_remaining_balance := v_commitment.remaining_balance;
  v_new_status := 'active';

  if v_commitment.kind = 'installment' then
    v_installments_paid := v_installments_paid + 1;
    if coalesce(v_commitment.installments_total, 0) > 0 and v_installments_paid >= v_commitment.installments_total then
      v_new_status := 'completed';
    end if;
  elsif v_commitment.kind = 'debt' then
    v_remaining_balance := greatest(0, coalesce(v_commitment.remaining_balance, v_payment_amount) - v_payment_amount);
    if v_remaining_balance <= 0 then v_new_status := 'completed'; end if;
  elsif v_commitment.ends_on is not null and v_next_due > v_commitment.ends_on then
    v_new_status := 'completed';
  end if;

  update public.fixed_expenses
  set next_due_on = case when v_new_status = 'completed' then v_commitment.next_due_on else v_next_due end,
      installments_paid = v_installments_paid,
      remaining_balance = v_remaining_balance,
      status = v_new_status,
      last_paid_at = now()
  where id = v_commitment.id;

  return v_expense_id;
end;
$$;

grant execute on function public.record_fixed_expense_payment(uuid) to authenticated;

-- ─── 3.3 · Savings goal contributions + milestones ─────────────────
create or replace function public.notify_savings_goal_change()
returns trigger
language plpgsql
as $$
declare
  v_delta numeric(12,2);
  v_milestones integer[] := array[25, 50, 75, 100];
  v_old_pct integer;
  v_new_pct integer;
  m integer;
begin
  if tg_op = 'UPDATE'
     and old.current_amount is not distinct from new.current_amount
     and old.goal_amount is not distinct from new.goal_amount
     and old.title is not distinct from new.title
     and old.is_active is not distinct from new.is_active then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.emit_notification(
      new.family_id, null,
      'Nueva meta',
      new.title || ' · objetivo $' || new.goal_amount::text,
      'goal_created', 'info', auth.uid(),
      jsonb_build_object('route', '/savings-goal', 'goal_id', new.id)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_delta := coalesce(new.current_amount, 0) - coalesce(old.current_amount, 0);

    if v_delta > 0 then
      perform public.emit_notification(
        new.family_id, null,
        'Aporte a ' || new.title,
        '+$' || v_delta::text || ' · llevás $' || new.current_amount::text || ' de $' || new.goal_amount::text,
        'goal_contribution', 'success', auth.uid(),
        jsonb_build_object('route', '/savings-goal', 'goal_id', new.id, 'delta', v_delta)
      );
    end if;

    -- milestone crossings
    if new.goal_amount > 0 then
      v_old_pct := floor((coalesce(old.current_amount, 0) / old.goal_amount) * 100)::int;
      v_new_pct := floor((coalesce(new.current_amount, 0) / new.goal_amount) * 100)::int;
      foreach m in array v_milestones loop
        if v_old_pct < m and v_new_pct >= m then
          perform public.emit_notification(
            new.family_id, null,
            '🎯 ' || m || '% de ' || new.title,
            'Vas ' || new.current_amount::text || ' de ' || new.goal_amount::text || '. Seguí así.',
            case when m = 100 then 'goal_achieved' else 'goal_milestone' end,
            'success', auth.uid(),
            jsonb_build_object('route', '/savings-goal', 'goal_id', new.id, 'milestone', m)
          );
        end if;
      end loop;
    end if;
  end if;

  return new;
exception when others then return new;
end;
$$;

drop trigger if exists trg_savings_goal_notification on public.savings_goals;
create trigger trg_savings_goal_notification
after insert or update on public.savings_goals
for each row execute function public.notify_savings_goal_change();
