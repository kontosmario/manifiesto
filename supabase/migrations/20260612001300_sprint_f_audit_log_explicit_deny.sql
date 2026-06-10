-- supabase/migrations/20260612001300_sprint_f_audit_log_explicit_deny.sql
--
-- Sprint F-DB · Red team finding F9 (2026-06-10):
--   `audit_log` (20260609040000) has SELECT + INSERT policies but no
--   explicit UPDATE/DELETE. Under RLS with default-deny that is correct
--   today — but a future migration could accidentally add a permissive
--   UPDATE/DELETE policy (e.g. via a copy-paste of another table's
--   policies), silently allowing audit log tampering.
--
-- Fix (defense-in-depth):
--   Add explicit DENY policies for UPDATE and DELETE. With these in
--   place, even if someone accidentally adds a permissive policy
--   later, the DENY still applies (RLS ANDs ALL policy USING/CHECK
--   per command, and these return false).
--
-- Note: service_role bypasses RLS entirely, so this does NOT prevent
-- legitimate admin/forensics rewrites via service-role connection.
-- It only locks down `authenticated` (and `anon`).
--
-- Manual test plan:
--   1. Insert via service-role trigger → succeeds (unchanged).
--   2. Authenticated user SELECTs their own rows → succeeds (unchanged).
--   3. Authenticated user attempts UPDATE → 0 rows (RLS denies).
--   4. Authenticated user attempts DELETE → 0 rows (RLS denies).

drop policy if exists "audit_log_no_update" on public.audit_log;
create policy "audit_log_no_update"
  on public.audit_log
  for update
  using (false)
  with check (false);

drop policy if exists "audit_log_no_delete" on public.audit_log;
create policy "audit_log_no_delete"
  on public.audit_log
  for delete
  using (false);

comment on policy "audit_log_no_update" on public.audit_log is
  'Sprint F-DB F9 (2026-06-10): defense-in-depth. Authenticated users '
  'cannot UPDATE audit rows under any circumstances. service_role '
  'bypasses RLS for legitimate admin/forensics rewrites.';

comment on policy "audit_log_no_delete" on public.audit_log is
  'Sprint F-DB F9 (2026-06-10): defense-in-depth. Authenticated users '
  'cannot DELETE audit rows under any circumstances. service_role '
  'bypasses RLS for legitimate purge.';
