-- supabase/migrations/20260614001100_sprint_n_expenses_insert_rate_limit.sql
--
-- Sprint N · Audit #7 R-2 (2026-06-14):
--   Mobile clients write directly to `public.expenses` via PostgREST
--   (`supabase.from('expenses').insert(...)` in expense-repository.ts).
--   There is RLS enforcing family_id ownership, but NO per-user rate
--   limit on the insert path. A compromised JWT (or a malicious client
--   running with a real session) can flood the table at ~1k rows/sec,
--   bloating storage, polluting metrics/insights cards, and degrading
--   query performance on the family snapshot.
--
--   All RPC-mediated mutations (add_savings_contribution,
--   record_fixed_expense_payment, etc.) already pass through
--   `enforce_rate_limit`. Direct PostgREST inserts bypass that.
--
-- Fix:
--   Attach a BEFORE INSERT trigger to `public.expenses` that calls
--   `enforce_rate_limit('expenses_insert', 120, 60)`. The 120/min cap
--   (= 2/sec sustained) is generous for legitimate use:
--
--     • Manual add-expense screen: typical cadence is < 1/min.
--     • OCR import (50 rows): inserts run sequentially through the
--       JS layer (~50ms per round-trip → ~20/sec theoretical, but in
--       practice ~5-10/sec end-to-end with network). 50 rows fit
--       comfortably in the 120/min budget.
--     • Worst-case OCR: a user imports ~100 rows from a statement.
--       Still under 120/min.
--
--   The trigger skips when `auth.uid()` is null — that covers
--   service_role / SECURITY DEFINER callers (recompute jobs, admin
--   tooling). Real user sessions always have a JWT and a uid.
--
-- Manual test plan:
--   1. Insert 50 expenses in a tight loop as a real user → all succeed.
--   2. Insert 121 expenses within 60s → row 121 raises 'Demasiados
--      intentos. Esperá un momento e intentá de nuevo.'.
--   3. service_role insert → bypasses (no auth.uid()).
--
-- Rollback (manual):
--   drop trigger if exists rate_limit_expenses_insert on public.expenses;
--   drop function if exists public.rate_limit_expense_inserts();

create or replace function public.rate_limit_expense_inserts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / SECURITY DEFINER callers run without an end-user
  -- JWT and therefore have a NULL auth.uid(). Skip the rate limit for
  -- those paths — they are internal jobs (recompute, admin tooling),
  -- not user-driven floods.
  if auth.uid() is null then
    return new;
  end if;

  -- 120 inserts per 60s = 2/sec sustained. Generous for OCR imports
  -- (~50-100 rows) but cuts off any per-user flood within a single
  -- minute. The error message is the canonical one from
  -- `enforce_rate_limit` (Spanish, user-facing).
  perform public.enforce_rate_limit('expenses_insert', 120, 60);
  return new;
end;
$$;

revoke all on function public.rate_limit_expense_inserts() from public;
-- The trigger function is invoked by the trigger runtime; we don't
-- need a grant to authenticated. Trigger functions execute with the
-- privileges of the trigger owner (this migration), not the caller,
-- so SECURITY DEFINER + the existing enforce_rate_limit grant chain
-- is sufficient.

drop trigger if exists rate_limit_expenses_insert on public.expenses;
create trigger rate_limit_expenses_insert
  before insert on public.expenses
  for each row execute function public.rate_limit_expense_inserts();

comment on function public.rate_limit_expense_inserts() is
  'BEFORE INSERT trigger on public.expenses. Enforces 120 inserts/'
  '60s per authenticated user via enforce_rate_limit. Skips when '
  'auth.uid() is null (service_role / SECDEF callers). Sprint N · '
  'Audit #7 R-2.';
