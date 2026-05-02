-- RPCs for subscription zombie audit/intent flow.

-- ─── audit_subscription(fixed_expense_id, level) ──────────────────
-- Inserts a usage audit row for the calling user, period derived from now().
create or replace function public.audit_subscription(
  p_fixed_expense_id uuid,
  p_level text
)
returns public.fixed_expense_usage_audit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_period text := to_char(now(), 'YYYY-MM');
  v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_level not in ('mucho', 'a_veces', 'casi_nunca') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  insert into public.fixed_expense_usage_audit
    (fixed_expense_id, family_id, user_id, period, level)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, v_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update
    set level = excluded.level,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.audit_subscription(uuid, text) to authenticated;

-- ─── declare_subscription_intent(fixed_expense_id, intent, notes?) ─
create or replace function public.declare_subscription_intent(
  p_fixed_expense_id uuid,
  p_intent text,
  p_notes text default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id
  from public.fixed_expenses
  where id = p_fixed_expense_id;

  if v_family_id is null then
    raise exception 'Fixed expense not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_intent not in ('cancel', 'pause', 'downgrade') then
    raise exception 'Invalid intent' using errcode = '22023';
  end if;

  insert into public.fixed_expense_action_intent
    (fixed_expense_id, family_id, user_id, intent, notes)
  values
    (p_fixed_expense_id, v_family_id, v_user_id, p_intent, p_notes)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.declare_subscription_intent(uuid, text, text) to authenticated;

-- ─── resolve_subscription_intent(intent_id, resolution, new_amount?) ─
create or replace function public.resolve_subscription_intent(
  p_intent_id uuid,
  p_resolution text,
  p_new_amount numeric default null
)
returns public.fixed_expense_action_intent
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_fixed_expense_id uuid;
  v_intent text;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_action_intent;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select family_id, fixed_expense_id, intent
    into v_family_id, v_fixed_expense_id, v_intent
  from public.fixed_expense_action_intent
  where id = p_intent_id;

  if v_family_id is null then
    raise exception 'Intent not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id = v_user_id
  ) then
    raise exception 'Not a member of this family' using errcode = '42501';
  end if;

  if p_resolution not in ('completed', 'abandoned') then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;

  update public.fixed_expense_action_intent
    set resolved_at = now(),
        resolution = p_resolution
  where id = p_intent_id and resolved_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Intent already resolved' using errcode = '22023';
  end if;

  -- Apply effects on the fixed expense if the intent was completed.
  if p_resolution = 'completed' then
    if v_intent = 'cancel' then
      update public.fixed_expenses
        set status = 'archived', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'pause' then
      update public.fixed_expenses
        set status = 'paused', updated_at = now()
      where id = v_fixed_expense_id;
    elsif v_intent = 'downgrade' and p_new_amount is not null then
      update public.fixed_expenses
        set amount = p_new_amount, updated_at = now()
      where id = v_fixed_expense_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.resolve_subscription_intent(uuid, text, numeric) to authenticated;
