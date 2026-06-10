-- supabase/migrations/20260613001000_sprint_j_restore_cycle_anchor_guard.sql
--
-- Sprint J · Red team Audit #3 finding J-DB1 (2026-06-10):
--   Sprint F-DB F10 (20260612001400_sprint_f_cycle_anchor_validation.sql)
--   added validation that `apply_month_close_decision.p_new_cycle_anchor`
--   must be a valid date in [current_date - 7d, current_date + 45d].
--
--   The function was rewritten twice after F10 — once in Sprint G-DB1
--   (20260612002000_sprint_g_audit_log_financial_rpcs.sql:145-265) to
--   add explicit audit_log writes, and again in Sprint I-DB1
--   (20260612004000_sprint_i_monthly_summary_generic_error.sql:26-150)
--   to collapse error messages. BOTH rewrites used `create or replace
--   function` and SILENTLY DROPPED the F10 anchor window check.
--
--   Reproducer (before this migration):
--     select apply_month_close_decision(
--       p_monthly_summary_id => '...',
--       p_decision           => 'acumular',
--       p_new_cycle_anchor   => '9999-12-31'
--     );  -- ACCEPTED — anchor far in the future poisons the cycle UX.
--
-- Fix:
--   1. Re-create the function (idempotent via `create or replace`)
--      preserving the V8+ body from Sprint I-DB1 (audit_log write +
--      generic-error lookup) AND adding the F10 anchor window check
--      back exactly as originally specified:
--        • Reject non-date strings with 'invalid anchor: not a valid date'
--        • Reject out-of-window with
--          'invalid anchor: must be within [today - 7 days, today + 45 days]'
--      The check runs AFTER `p_decision = 'acumular' requires
--      new_cycle_anchor` and BEFORE any mutation, so non-acumular
--      paths with anchor=null still succeed (preserving F10 test case 5).
--
--   2. Defense-in-depth: add a CHECK constraint on
--      `family_finance.current_cycle_anchor` so even if a future
--      function rewrite drops the RPC-level guard again, the DB itself
--      refuses to persist anchors more than ~1 year off from any
--      plausible window. The constraint is intentionally looser than
--      the RPC window (±400 days vs ±45) so legitimate seeds /
--      back-fills don't trip it; the goal is to fail loudly on
--      9999-12-31 / 1900-01-01 class values, not to replicate the
--      RPC's tighter business rule.
--
-- Manual test plan:
--   1. anchor = current_date + 30 → succeeds.
--   2. anchor = '9999-12-31'     → raises 'invalid anchor: must be within ...'.
--   3. anchor = '1900-01-01'     → raises 'invalid anchor: must be within ...'.
--   4. anchor = 'not-a-date'     → raises 'invalid anchor: not a valid date'.
--   5. anchor = null + decision != acumular → succeeds (no anchor write).

-- ─── (1) Re-create apply_month_close_decision WITH the F10 guard ──────

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
  v_anchor_date date;
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

  -- Sprint F-DB F10 (2026-06-10) RESTORED in Sprint J (Audit #3 J-DB1,
  -- 2026-06-10): anchor window validation. Block arbitrary far-past /
  -- far-future anchors that would break projections, advisor signals,
  -- and try_close_previous_cycle. This check was silently dropped by
  -- Sprint G-DB1 and Sprint I-DB1 `create or replace` rewrites.
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
           current_cycle_anchor = v_anchor_date,
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
  'Validates p_new_cycle_anchor within [today-7d, today+45d] '
  '(Sprint F-DB F10, restored in Sprint J / Audit #3 J-DB1). '
  'Rate-limited 5/hour. Audit-logged (Sprint G-DB G-DB1). Generic '
  'cross-family error message (Sprint I-DB I-DB1).';

-- ─── (2) Defense-in-depth CHECK constraint ────────────────────────────
--
-- Even if a future rewrite drops the RPC-level guard again, the DB
-- refuses to persist anchors more than ~1 year off. ±400 days is
-- intentionally looser than the RPC window (±45 days) so legitimate
-- seeds / back-fills don't trip it; the goal is to fail loudly on
-- 9999-12-31 / 1900-01-01 class values.
--
-- Wrapped in a DO block so the migration is idempotent on re-run.

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.family_finance'::regclass
       and conname  = 'family_finance_current_cycle_anchor_sane'
  ) then
    alter table public.family_finance
      add constraint family_finance_current_cycle_anchor_sane
      check (
        current_cycle_anchor is null
        or (
          current_cycle_anchor >= date '2020-01-01'
          and current_cycle_anchor <= current_date + interval '400 days'
        )
      ) not valid;

    -- VALIDATE separately so existing rows out of bounds don't block
    -- the migration; if there's a 9999-12-31 in prod (the very bug we're
    -- fixing) we want the constraint to apply going FORWARD even if
    -- backfill is required. Re-run `alter table ... validate constraint`
    -- once anchors are cleaned up.
    begin
      alter table public.family_finance
        validate constraint family_finance_current_cycle_anchor_sane;
    exception when check_violation then
      raise notice 'family_finance.current_cycle_anchor has existing out-of-range rows; constraint left NOT VALID. Clean up + re-run VALIDATE.';
    end;
  end if;
end$$;

comment on constraint family_finance_current_cycle_anchor_sane on public.family_finance is
  'Defense-in-depth (Sprint J · Audit #3 J-DB1, 2026-06-10): blocks '
  'anchors more than ~1 year off any plausible window so a future RPC '
  'rewrite cannot silently drop the F10 guard again. Tighter business '
  'rule (±45 days from current_date) lives in apply_month_close_decision.';
