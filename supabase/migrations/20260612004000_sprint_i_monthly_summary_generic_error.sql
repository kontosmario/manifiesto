-- supabase/migrations/20260612004000_sprint_i_monthly_summary_generic_error.sql
--
-- Sprint I-DB · Red team finding I-DB1 (2026-06-10):
--   `apply_month_close_decision` (V8 in
--   20260612002000_sprint_g_audit_log_financial_rpcs.sql:145-265) looks
--   up `monthly_summaries` by id BEFORE the member check. If the lookup
--   fails the function raises `'monthly_summary not found'`; if it
--   succeeds but the caller isn't a member of the owning family it
--   raises `'Not a family member'`. The error-message asymmetry leaks
--   existence of a `monthly_summary_id` belonging to ANOTHER family —
--   an attacker can brute-force `p_monthly_summary_id` and bin which
--   ids exist on the platform.
--
-- Fix:
--   Collapse the two early-failure paths into a single generic message
--   `'monthly_summary not accessible'`. We DO NOT change the lookup
--   shape (still by id only) — only the error string — so the function
--   stays simple to reason about. The downstream owner check
--   (`is_family_owner`) is unaffected.
--
--   Idempotent via `create or replace function`. Signature unchanged
--   so existing grants survive the rewrite, but we re-run revoke/grant
--   defensively. The rest of the function body is preserved verbatim
--   from V8 (audit_log write + all decision branches).

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
  v_decision_id uuid;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Sprint I-DB I-DB1 (2026-06-10): collapsed lookup + membership check
  -- error messages into a single generic string so an attacker cannot
  -- distinguish "summary does not exist" from "summary belongs to
  -- another family". Lookup shape preserved.
  select id, family_id, monthly_income, total_spent, savings_delta
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not accessible';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'monthly_summary not accessible';
  end if;

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
  )
  returning id into v_decision_id;

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

  -- Sprint G-DB G-DB1 (2026-06-10): explicit audit_log write (preserved).
  insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
  values (
    v_user_id,
    v_summary.family_id,
    'apply_month_close_decision',
    'month_close_decisions',
    v_decision_id,
    jsonb_build_object(
      'monthly_summary_id', p_monthly_summary_id,
      'decision', p_decision,
      'sobrante', v_sobrante,
      'meta_goal_id', p_meta_goal_id,
      'new_cycle_anchor', p_new_cycle_anchor
    )
  );
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;

comment on function public.apply_month_close_decision(uuid, text, uuid, text) is
  'Applies a month-close sobrante decision atomically. Owner-only '
  '(Sprint F-DB F3). Validates meta_goal_id belongs to family (Sprint E C5). '
  'Rate-limited 5/hour. Audit-logged (Sprint G-DB G-DB1). Generic '
  'cross-family error message (Sprint I-DB I-DB1, 2026-06-10).';
