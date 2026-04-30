-- Defense-in-depth lockdown for `home_telemetry`.
--
-- The base migration (20260502000000) applied RLS with a single
-- `select_own` policy and routed all inserts through the SECURITY
-- DEFINER RPC `log_home_event`. Without explicit INSERT/UPDATE/DELETE
-- policies the table already denies those operations to authenticated
-- callers via RLS — but a future migration that adds *any* INSERT/
-- UPDATE/DELETE policy could silently open a write path the RPC
-- guard wouldn't catch.
--
-- Revoking the privileges at the table level closes that gap: even if
-- a future policy is added, the role itself can't reach the table
-- without an explicit grant. Idempotent — `revoke` is a no-op when
-- the privilege isn't held.

set search_path = public;

revoke insert, update, delete on public.home_telemetry from authenticated;
revoke insert, update, delete on public.home_telemetry from anon;
