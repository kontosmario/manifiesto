-- Per-user, per-signal dismissals for the Asistente Financiero.
--
-- Until this migration the dismiss state lived in client-side
-- SecureStore (`control-advisor-dismiss:v2`). That meant:
--   · device-scoped (a user uninstalling/reinstalling lost their
--     dismiss state)
--   · NOT shared across devices for the same user
--   · NOT scoped per family member: if user A dismissed a family
--     signal, user B never got to see/dismiss it themselves
--
-- The new model mirrors how generic family notifications work:
-- one row per (user_id, signal_id) pair. Each family member has
-- their own dismissal book, server-side.
--
-- TTL/escalation logic (cooldown days, ignore-count multiplier)
-- stays on the client — the server just stores the raw record.
-- That keeps the rules in one place and avoids a SQL re-write of
-- the existing TypeScript decision table.

create table if not exists public.advisor_signal_dismissals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The signal id is a stable string from `control-signals.ts` (e.g.
  -- 'velocity', 'cat-dominance-restaurantes', 'savings-milestone').
  -- Length-bounded as a sanity guard; the real ids are short.
  signal_id text not null check (char_length(signal_id) <= 120),
  dismissed_at timestamptz not null default now(),
  -- How many distinct times the user has dismissed this signal.
  -- Used by the client to escalate the cooldown for chronic
  -- dismissers (cap 4×).
  ignore_count integer not null default 1 check (ignore_count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One active row per (user, signal). Re-dismissing the same id
  -- updates this row in place via upsert; never inserts a duplicate.
  unique (user_id, signal_id)
);

create index if not exists advisor_signal_dismissals_family_user_idx
  on public.advisor_signal_dismissals (family_id, user_id);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.advisor_signal_dismissals enable row level security;

-- A user can SELECT their own dismissals — full stop. No reading
-- other family members' state.
create policy "Members read their own dismissals"
  on public.advisor_signal_dismissals
  for select
  to authenticated
  using (auth.uid() = user_id);

-- A user can INSERT a dismissal only for themselves AND only if they
-- are still an active member of the family the signal belongs to.
create policy "Members insert their own dismissals"
  on public.advisor_signal_dismissals
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.family_members fm
      where fm.user_id = auth.uid()
        and fm.family_id = advisor_signal_dismissals.family_id
        and fm.role <> 'blocked'
        and fm.blocked_at is null
    )
  );

-- A user can UPDATE their own row (used by the upsert path to bump
-- timestamp + ignore_count when re-dismissing).
create policy "Members update their own dismissals"
  on public.advisor_signal_dismissals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE is rare but useful for "unsuppress" UX (e.g. a settings
-- toggle to clear the dismiss history). Allow only on own rows.
create policy "Members delete their own dismissals"
  on public.advisor_signal_dismissals
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Auto-update `updated_at` on every UPDATE.
create or replace function public.touch_advisor_signal_dismissals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_advisor_signal_dismissals_updated_at
  on public.advisor_signal_dismissals;
create trigger trg_touch_advisor_signal_dismissals_updated_at
  before update on public.advisor_signal_dismissals
  for each row
  execute function public.touch_advisor_signal_dismissals_updated_at();

comment on table public.advisor_signal_dismissals is
  'Per-user, per-signal dismissals for the Asistente Financiero. Replaces the client-side SecureStore that scoped to device only.';
