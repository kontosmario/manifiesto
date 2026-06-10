-- supabase/migrations/20260612001000_sprint_f_owner_check_financial_rpcs.sql
--
-- Sprint F-DB · Red team finding F3 (2026-06-10):
--   `apply_month_close_decision` and `apply_reserve_decision` (last
--   updated in 20260612000200 and 20260609100000) only check that the
--   caller is a non-blocked family member. That lets ANY active member
--   (not just the owner) unilaterally close the month with an arbitrary
--   decision (reserva / acumular / meta) and move money from the
--   family's reserve.
--
--   Per product spec, both financial decisions belong to the owner:
--   month-close decides where the sobrante lives next, and reserve
--   re-allocation re-routes savings. Members shouldn't have unilateral
--   power over either.
--
-- Fix:
--   Add `is_family_owner(...)` guard early in each RPC, BEFORE any
--   mutation but AFTER the family_id is known. Re-raise as a distinct
--   error message so the client can render an "owner only" hint.
--
-- Preserves: signature, rate-limit ordering, cross-family meta_goal
-- guard (Sprint E C5), atomic UPDATE pattern (Sprint A H2).
--
-- Manual test plan:
--   1. Owner calls apply_month_close_decision → succeeds (unchanged).
--   2. Member calls apply_month_close_decision → raises
--      'only family owner can apply month close decision'.
--   3. Owner calls apply_reserve_decision → succeeds (unchanged).
--   4. Member calls apply_reserve_decision → raises
--      'only family owner can apply reserve decision'.
--   5. Blocked user → still raises 'Not a family member' (or owner check fails).

-- ── apply_month_close_decision (V7: + owner guard) ──────────────────

create or replace function public.apply_month_close_decision(
  p_monthly_summary_id uuid,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_summary record;
  v_sobrante numeric;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select id, family_id, monthly_income, total_spent, savings_delta
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not found';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  -- Sprint F-DB F3 (2026-06-10): owner-only guard. Members can view
  -- closure UI but only the owner commits the decision.
  if not public.is_family_owner(v_summary.family_id) then
    raise exception 'only family owner can apply month close decision';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  if p_decision = 'acumular' and p_new_cycle_anchor is null then
    raise exception 'acumular decision requires new_cycle_anchor';
  end if;

  -- Sprint E C5 (2026-06-10): cross-family meta_goal_id guard.
  if p_meta_goal_id is not null then
    if not exists (
      select 1
        from public.savings_goals
       where id = p_meta_goal_id
         and family_id = v_summary.family_id
    ) then
      raise exception 'meta goal does not belong to family';
    end if;
  end if;

  perform public.check_rate_limit('apply_month_close_decision', 5, 3600);

  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
      - coalesce(v_summary.total_spent, 0)
      - coalesce(v_summary.savings_delta, 0)
  );

  insert into public.month_close_decisions (
    family_id, monthly_summary_id, sobrante, decision, meta_goal_id, decided_by
  ) values (
    v_summary.family_id, p_monthly_summary_id, v_sobrante,
    p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + v_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_summary.family_id;
  elsif p_decision = 'acumular' then
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + v_sobrante,
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = v_summary.family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;

comment on function public.apply_month_close_decision(uuid, text, uuid, text) is
  'Applies a month-close sobrante decision atomically. Owner-only '
  '(Sprint F-DB F3, 2026-06-10). Validates meta_goal_id belongs to '
  'family (Sprint E C5). Rate-limited 5/hour.';

-- ── apply_reserve_decision (V3: + owner guard) ──────────────────────

create or replace function public.apply_reserve_decision(
  p_amount numeric,
  p_target text,
  p_meta_goal_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_count int;
  v_updated int;
begin
  if v_user_id is null then raise exception 'No session'; end if;

  if p_target not in ('cycle', 'meta') then raise exception 'invalid target'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_target = 'meta' and p_meta_goal_id is null then raise exception 'meta requires meta_goal_id'; end if;

  select count(*)
    into v_family_count
    from public.family_members
   where user_id = v_user_id
     and role <> 'blocked';
  if v_family_count > 1 then
    raise exception 'multi-family detected, p_family_id required';
  end if;

  select fm.family_id
    into v_family_id
    from public.family_members fm
   where fm.user_id = v_user_id
     and fm.role <> 'blocked'
   limit 1;
  if v_family_id is null then raise exception 'No family'; end if;

  -- Sprint F-DB F3 (2026-06-10): owner-only guard. Re-routing reserve
  -- balance is a financial decision that belongs to the owner only.
  if not public.is_family_owner(v_family_id) then
    raise exception 'only family owner can apply reserve decision';
  end if;

  perform public.check_rate_limit('apply_reserve_decision', 10, 3600);

  if p_target = 'cycle' then
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, coalesce(monthly_income, 0))
             + p_amount,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
  elsif p_target = 'meta' then
    if not exists (select 1 from public.savings_goals where id = p_meta_goal_id and family_id = v_family_id) then
      raise exception 'meta goal does not belong to family';
    end if;
    update public.family_finance
       set monthly_reserve_amount = coalesce(monthly_reserve_amount, 0) - p_amount,
           updated_at = now()
     where family_id = v_family_id
       and coalesce(monthly_reserve_amount, 0) >= p_amount;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'amount exceeds reserve';
    end if;
    update public.savings_goals
       set current_amount = current_amount + p_amount,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_family_id;
  end if;
end;
$$;

revoke all on function public.apply_reserve_decision(numeric, text, uuid) from public;
grant execute on function public.apply_reserve_decision(numeric, text, uuid) to authenticated;

comment on function public.apply_reserve_decision(numeric, text, uuid) is
  'Re-routes reserve balance into the current cycle or a savings goal. '
  'Owner-only (Sprint F-DB F3, 2026-06-10). Atomic guard via WHERE-clause '
  'reserve check (Sprint A). Rate-limited 10/hour.';
