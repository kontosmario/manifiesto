-- supabase/migrations/20260612000200_security_apply_month_close_meta_goal_family_guard.sql
--
-- Sprint E · Red team finding C5 (2026-06-10):
--   `apply_month_close_decision` (sprint_b_cr_hardening V5) accepts
--   `p_meta_goal_id` and, on `p_decision = 'meta'`:
--
--     1. INSERTs into `month_close_decisions` (burning the unique
--        constraint on `monthly_summary_id` → that summary can never
--        be re-decided).
--     2. UPDATEs `savings_goals` filtered by `id AND family_id`.
--
--   If `p_meta_goal_id` belongs to a DIFFERENT family, step (1)
--   succeeds but step (2) matches 0 rows. Net effect: the user's
--   sobrante vanishes (it's neither stored in the meta goal nor in
--   the reserve nor in the cycle balance), and the decision can't be
--   redone because the unique-on-summary lock is burned.
--
--   This mirrors a vulnerability previously fixed in
--   `apply_reserve_decision`, which validates membership of
--   `p_meta_goal_id` BEFORE writing
--   (20260609100000_sprint_b_cr_hardening.sql:184).
--
-- Fix (V6):
--   Validate that `p_meta_goal_id` (when non-null) belongs to the
--   `v_summary.family_id` BEFORE the INSERT. If not, raise.
--   Everything else (signature, rate-limit ordering, downstream
--   updates) is preserved verbatim from V5.
--
-- Manual test plan (run after apply):
--   1. With a `meta_goal_id` belonging to the user's family →
--      decision succeeds, goal current_amount grows by sobrante.
--   2. With a `meta_goal_id` belonging to a DIFFERENT family →
--      raises 'meta goal does not belong to family', no INSERT.
--   3. With a non-existent `meta_goal_id` → same raise.
--   4. With `p_decision = 'reserva'` (no meta_goal_id involved) → unchanged.

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

  -- Validations first (CR Sprint B #8): rate limit charges only calls
  -- that pass the full input guard.
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

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  if p_decision = 'acumular' and p_new_cycle_anchor is null then
    raise exception 'acumular decision requires new_cycle_anchor';
  end if;

  -- Sprint E C5 (2026-06-10): cross-family meta_goal_id guard. When
  -- meta_goal_id is provided we must verify it belongs to the same
  -- family as the summary BEFORE inserting into month_close_decisions.
  -- Otherwise the INSERT burns the unique-on-summary lock while the
  -- downstream UPDATE matches 0 rows → sobrante vanishes silently.
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

  -- Rate limit AFTER inputs OK. 5/h covers retries on flap.
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
  'Applies a month-close sobrante decision atomically. Validates that '
  'meta_goal_id (when provided) belongs to the same family as the '
  'monthly_summary BEFORE writing (Sprint E C5, 2026-06-10) — otherwise '
  'a cross-family goal would burn the unique-on-summary lock while the '
  'UPDATE matches 0 rows, vanishing the sobrante silently.';
