-- supabase/migrations/20260612002200_sprint_g_backdate_closed_month_guard.sql
--
-- Sprint G-DB · Red team finding G-DB3 (2026-06-10):
--   `expenses.created_at` is editable by the owner (cf. the back-date UI
--   in add-expense / edit-expense flows). There is no server-side guard
--   that prevents an INSERT/UPDATE from placing the row in a period that
--   has already been closed via `month_close_decisions`.
--
--   Consequence: if the owner edits an expense's `created_at` so it
--   falls into a closed month, the next `monthly_summaries` rollup
--   recomputes that closed period from fresh expense data, which now
--   includes a row the decision (meta / reserva / acumular) never saw.
--   `sobrante` and `total_spent` drift silently from what the user
--   actually decided about; reserve / goal balances no longer reconcile
--   against the audit trail.
--
-- Fix:
--   BEFORE INSERT / UPDATE trigger on `public.expenses` that rejects any
--   row whose `created_at` is earlier than the MOST RECENT
--   `month_close_decisions.decided_at` for the same family.
--
--   Per the spec we use the simpler family-level "any decision" check
--   rather than computing the exact cycle window from
--   `family_finance.current_cycle_anchor` + `salary_payment_day`. The
--   correct cycle math is in mobile-side code (see
--   mobile/features/cycle/*); replicating it in plpgsql risks drift and
--   the simpler check is strictly conservative — it blocks ALL writes
--   older than the last close, which is the safe direction (false
--   positives only happen if the user back-dates *within* the still-open
--   current cycle to a time before the previous close, which is
--   semantically what we want to block anyway since that data should
--   have been part of the previous close).
--
-- Compatibility carve-outs (CRITICAL — do NOT remove without checking
-- the seed scripts):
--   1. Service role bypass — `auth.role() = 'service_role'` skips the
--      guard. Seed scripts, the apple-review seeder (20260611000000),
--      and any future maintenance tooling write with the service role
--      and may legitimately backdate rows.
--   2. NULL auth.uid() bypass — pure SQL session (psql, migrations,
--      pg_cron jobs) also skips. Same rationale.
--   3. The trigger fires AFTER `created_at` is set (i.e. on INSERT it
--      sees the explicit override if any, else `default now()`). On
--      UPDATE it fires only if `created_at` actually changed, to avoid
--      blocking edits to other columns on old rows.
--
-- Idempotent: `create or replace function` + `drop trigger if exists`
-- before `create trigger`.

create or replace function public.guard_expense_not_in_closed_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_close timestamptz;
begin
  -- Bypass for service_role and pure SQL sessions — see header.
  if auth.role() is not distinct from 'service_role' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;

  -- On UPDATE, only validate if created_at actually changed. Editing
  -- description / category / price on an old row must keep working.
  if tg_op = 'UPDATE' and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- created_at is non-nullable in expenses; default now(). Skip guard
  -- if for some reason it's null (defensive).
  if new.created_at is null then
    return new;
  end if;

  -- Most recent close for this family. If no close decisions exist yet
  -- nothing to guard against.
  select max(decided_at)
    into v_last_close
    from public.month_close_decisions
   where family_id = new.family_id;

  if v_last_close is null then
    return new;
  end if;

  if new.created_at < v_last_close then
    raise exception
      'No podés crear ni modificar un gasto con fecha anterior al ultimo cierre de mes (%). Ese período ya está cerrado.',
      v_last_close
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_guard_closed_month on public.expenses;

create trigger expenses_guard_closed_month
before insert or update on public.expenses
for each row
execute function public.guard_expense_not_in_closed_month();

comment on function public.guard_expense_not_in_closed_month() is
  'Sprint G-DB G-DB3 (2026-06-10): blocks INSERT/UPDATE on expenses '
  'whose created_at predates the most recent month_close_decisions row '
  'for the same family. Service role and pure SQL bypass to keep seed '
  'scripts working. UPDATE only validates when created_at changes.';
