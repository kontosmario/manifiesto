-- supabase/migrations/20260613003100_sprint_k_anchor_check_absolute.sql
--
-- Sprint K · Red team Audit #4 finding K-3 / LOW (2026-06-10):
--   The defense-in-depth CHECK on family_finance.current_cycle_anchor
--   introduced by Sprint J · J-DB1 (20260613001000_sprint_j_restore_cycle_anchor_guard.sql:229-235)
--   uses `current_date + interval '400 days'`. Postgres allows non-IMMUTABLE
--   functions in CHECK constraints but it's a footgun:
--     • A row valid TODAY admits an anchor of current_date + 399 days.
--       The row stays valid forever because constraints are not re-evaluated
--       on existing rows — but a pg_dump + restore re-validates the CHECK
--       against the RESTORE-time current_date. Anchors written legitimately
--       3 years ago could fail validation on restore.
--     • Replication / logical decoding boundaries can hit the same
--       inconsistency.
--     • Postgres docs explicitly recommend IMMUTABLE expressions in CHECK
--       to keep ALTER TABLE ... VALIDATE deterministic.
--
-- Fix:
--   Drop the dynamic CHECK and replace it with an absolute upper bound.
--   The RPC body in apply_month_close_decision still enforces the tight
--   business rule ([today-7d, today+45d]) — the CHECK is only defense
--   in depth against catastrophic values (9999-12-31 / 1900-01-01 class).
--   An absolute bound is just as effective for that purpose and is
--   IMMUTABLE-safe.
--
-- Bump this bound during yearly maintenance.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + DO block creation guard.

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.family_finance'::regclass
       and conname  = 'family_finance_current_cycle_anchor_sane'
  ) then
    alter table public.family_finance
      drop constraint family_finance_current_cycle_anchor_sane;
  end if;
end$$;

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
          current_cycle_anchor >= date '2024-01-01'
          and current_cycle_anchor <= date '2030-01-01'
        )
      ) not valid;

    -- VALIDATE separately so existing rows out of bounds don't block
    -- the migration. If a 9999-12-31 / 1900-01-01 slipped in pre-fix,
    -- clean it up + re-run `alter table ... validate constraint`.
    begin
      alter table public.family_finance
        validate constraint family_finance_current_cycle_anchor_sane;
    exception when check_violation then
      raise notice 'family_finance.current_cycle_anchor has existing out-of-range rows; constraint left NOT VALID. Clean up + re-run VALIDATE.';
    end;
  end if;
end$$;

comment on constraint family_finance_current_cycle_anchor_sane on public.family_finance is
  'Defense-in-depth (Sprint J · Audit #3 J-DB1, refined Sprint K · '
  'Audit #4 K-3, 2026-06-10): blocks catastrophic anchors '
  '(9999-12-31 / 1900-01-01 class). Uses ABSOLUTE bounds '
  '[2024-01-01, 2030-01-01] because current_date is non-IMMUTABLE '
  'and would make pg_dump+restore semantics drift. The tighter '
  'business rule (±45 days from current_date) lives in '
  'apply_month_close_decision. Bump this bound during yearly maintenance.';
