-- supabase/migrations/20260614001000_sprint_n_account_deletion_processor_race.sql
--
-- Sprint N · Audit #7 7-T4 (2026-06-14):
--   `cron_process_account_deletions` (20260518000000) iterates the
--   `account_deletions_due` view and calls `admin_delete_account` per
--   row. The user_id list is materialized at the start of the loop —
--   there is no row-lock on `profiles` between the SELECT and the per-
--   row CALL. A user can fire `cancel_account_deletion` (which clears
--   `profiles.deletion_scheduled_at`) AFTER the cron snapshotted the
--   list but BEFORE the loop reaches that row, and the account will
--   still be hard-deleted despite the successful cancel.
--
--   The window is small in practice (the loop processes batches in
--   seconds), but it exists and the consequence is unrecoverable.
--
-- Fix:
--   Re-validate inside the loop with `SELECT ... FOR UPDATE` on
--   `profiles` immediately before the per-row delete. The lock
--   serializes against any concurrent `cancel_account_deletion` (which
--   itself updates the same row), and we re-check that
--   `deletion_scheduled_at` is still set and still elapsed. If the
--   user cancelled, the predicate fails, we skip the row.
--
--   The lock is per-user (single row) inside its own implicit
--   sub-transaction, so it cannot deadlock with concurrent cancels —
--   `cancel_account_deletion` only ever locks ONE row (the caller's
--   own profile), and the cron locks rows ONE AT A TIME in
--   deterministic order. No two transactions ever grab the same two
--   rows in opposite order.
--
-- Rollback (manual):
--   Replay the previous body from migration 20260518000000.

create or replace function public.cron_process_account_deletions()
returns table (
  processed_count int,
  failed_count int,
  failures jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_processed int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_failures jsonb := '[]'::jsonb;
  v_error_msg text;
  v_still_due boolean;
begin
  for v_user_id in
    select user_id from public.account_deletions_due
  loop
    -- Re-validate inside the loop with FOR UPDATE so a concurrent
    -- `cancel_account_deletion` that fires between the SELECT above
    -- and this CALL cannot be lost. The lock is scoped to a single
    -- row; cancel_account_deletion takes the same row lock when it
    -- updates `deletion_scheduled_at`.
    begin
      select (
        p.deletion_scheduled_at is not null
        and p.deletion_scheduled_at <= now()
      )
        into v_still_due
      from public.profiles p
      where p.id = v_user_id
      for update;
    exception when others then
      -- Row vanished entirely (e.g. user already deleted out-of-band).
      -- Nothing to do.
      v_still_due := false;
    end;

    if not coalesce(v_still_due, false) then
      -- User cancelled between the SELECT and now, OR the profile is
      -- gone. Either way: skip silently — the next cron run will pick
      -- it up again if it's still due.
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      perform public.admin_delete_account(v_user_id);
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_error_msg := sqlerrm;
      v_failures := v_failures || jsonb_build_object(
        'user_id', v_user_id,
        'error', v_error_msg,
        'sqlstate', sqlstate
      );
      raise warning
        'cron_process_account_deletions: failed user_id=% sqlstate=% msg=%',
        v_user_id, sqlstate, v_error_msg;
    end;
  end loop;

  return query select v_processed, v_failed, v_failures;
end;
$$;

revoke all on function public.cron_process_account_deletions() from public;
grant execute on function public.cron_process_account_deletions() to service_role;

comment on function public.cron_process_account_deletions() is
  'Daily cron processor for hard-deleting accounts whose '
  'deletion_scheduled_at has elapsed. Re-validates each row under a '
  'FOR UPDATE lock to close the cancel-race window (Sprint N · '
  'Audit #7 7-T4). Returns (processed, failed, failures jsonb).';
