-- supabase/migrations/20260612001400_sprint_f_cycle_anchor_validation.sql
--
-- Sprint F-DB · Red team finding F10 (2026-06-10):
--   `apply_month_close_decision` and `apply_reserve_decision` accept
--   `p_new_cycle_anchor text` and cast it to date without bound
--   validation. A malicious caller (or a buggy client) can set the
--   cycle anchor to '9999-12-31' or '1900-01-01', which:
--
--     • Breaks projections / advisor signals (they multiply by days
--       remaining in the cycle).
--     • Breaks `try_close_previous_cycle` (it compares anchor against
--       current_date for closure scheduling).
--     • Could DoS the family's cycle UX permanently (manual fix
--       requires SQL access since there's no UI to repair an
--       arbitrary anchor).
--
-- Fix:
--   Validate p_new_cycle_anchor (when non-null) is within
--   [current_date - 7 days, current_date + 45 days]. That window
--   covers:
--     • A few days of clock skew / late close (current_date - 7).
--     • Scheduling next cycle up to ~6 weeks ahead (current_date + 45)
--       — generous for monthly cycles with bi-weekly variants.
--   Anything outside raises before any mutation.
--
-- Note: apply_reserve_decision (V3 from F3) does not accept
-- p_new_cycle_anchor in its signature — it only ever updates
-- current_cycle_starting_balance. So this finding only applies to
-- apply_month_close_decision in practice. We add the validation
-- there.
--
-- Manual test plan:
--   1. Owner closes with anchor = current_date + 30 → succeeds.
--   2. Owner closes with anchor = '9999-12-31' → raises 'invalid anchor'.
--   3. Owner closes with anchor = current_date - 1 → succeeds.
--   4. Owner closes with anchor = current_date - 30 → raises.
--   5. Owner closes with no anchor (non-acumular path) → succeeds.

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
  v_anchor_date date;
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

  -- Sprint F-DB F3 (2026-06-10): owner-only guard.
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

  -- Sprint F-DB F10 (2026-06-10): anchor window validation. Block
  -- arbitrary far-past / far-future anchors that would break
  -- projections, advisor signals, and try_close_previous_cycle.
  if p_new_cycle_anchor is not null then
    begin
      v_anchor_date := p_new_cycle_anchor::date;
    exception when others then
      raise exception 'invalid anchor: not a valid date';
    end;

    if v_anchor_date < current_date - interval '7 days'
       or v_anchor_date > current_date + interval '45 days' then
      raise exception 'invalid anchor: must be within [today - 7 days, today + 45 days]';
    end if;
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
           current_cycle_anchor = v_anchor_date,
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
  '(Sprint F-DB F3). Validates meta_goal_id belongs to family (Sprint E C5). '
  'Validates p_new_cycle_anchor within [today-7d, today+45d] '
  '(Sprint F-DB F10). Rate-limited 5/hour.';
