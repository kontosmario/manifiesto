-- Follow-up policies + cron tweaks for the advisor cognitive layer.
--
-- The base memory-layer migration (`20260501000000`) granted SELECT-own
-- on `advisor_interactions` but no DELETE. The "clear my history" UI
-- needs the user to be able to wipe their own log on demand, which
-- requires a `delete_own` policy.
--
-- We also bump the zombie detection cron from weekly to daily — the
-- v2 spec called this out as P0 polish that didn't ship in the first
-- migration. Faster detection means a zombie isn't haunting the
-- household for up to 6 days after it crosses the threshold.

set search_path = public;

-- ─── advisor_interactions: allow user to delete own rows ──────────

create policy "advisor_interactions_delete_own"
  on public.advisor_interactions
  for delete
  using (auth.uid() = user_id);

-- ─── Reschedule zombie detection cron weekly → daily ──────────────
--
-- Both `cron.schedule` (idempotent on conflict) and `cron.unschedule`
-- (no-op on missing) are safe to re-run, so the block stays
-- migration-friendly.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Drop any prior schedule under the v1 name so the new schedule
    -- replaces it cleanly.
    perform cron.unschedule('cron_detect_zombies_weekly');
    perform cron.unschedule('cron_detect_zombies');

    perform cron.schedule(
      'cron_detect_zombies',
      '15 4 * * *',  -- daily 04:15 UTC
      $cron$select public.cron_detect_zombies();$cron$
    );
  end if;
exception when others then
  null;
end;
$$;
