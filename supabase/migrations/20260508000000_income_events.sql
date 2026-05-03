-- Income events — one-time positive cash inflows beyond the
-- configured monthly salary (a friend's transfer, a bonus, a gift,
-- some side income). They contribute to the cycle's "disponible"
-- amount when the event_date falls in the current pay cycle.
--
-- Why a separate table (vs. negative-amount expenses or extending
-- family_finance):
--   · expenses are scoped to spending categories and have a
--     different RLS / trigger surface; conflating them would muddy
--     the analytics we already built around expense aggregation.
--   · family_finance.monthly_income is the *configured* base; we
--     keep that immutable from the user-flow side and treat one-off
--     events as discrete records on top of it.

create table if not exists public.income_events (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  created_by  uuid not null references auth.users(id),
  amount      numeric(12,2) not null check (amount > 0),
  -- Constrained kind keeps analytics tractable. Open-text
  -- descriptions on top.
  kind        text not null check (kind in ('transfer', 'bonus', 'gift', 'other')),
  description text,
  -- The "real" date of the income (defaults to today, can be
  -- backdated). Cycle membership is computed against this column.
  event_date  date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists idx_income_events_family_date
  on public.income_events(family_id, event_date desc);

create index if not exists idx_income_events_created_by
  on public.income_events(created_by);

alter table public.income_events enable row level security;

-- ─── RLS policies ─────────────────────────────────────────────
-- Family-scoped reads: any non-blocked member of the family can
-- see all of the family's income events.
drop policy if exists "members_read_income_events" on public.income_events;
create policy "members_read_income_events"
  on public.income_events for select
  using (
    family_id in (
      select fm.family_id
      from public.family_members fm
      where fm.user_id = auth.uid()
        and fm.role <> 'blocked'
        and fm.blocked_at is null
    )
  );

-- Members can insert events tagged with their own user id, into
-- their own family.
drop policy if exists "members_insert_income_events" on public.income_events;
create policy "members_insert_income_events"
  on public.income_events for insert
  with check (
    created_by = auth.uid()
    and family_id in (
      select fm.family_id
      from public.family_members fm
      where fm.user_id = auth.uid()
        and fm.role <> 'blocked'
        and fm.blocked_at is null
    )
  );

-- Members can edit / delete only their own events. (Owners may
-- moderate via admin RPCs in a follow-up if needed; for now
-- self-only edit keeps the surface tight.)
drop policy if exists "members_update_own_income_events" on public.income_events;
create policy "members_update_own_income_events"
  on public.income_events for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "members_delete_own_income_events" on public.income_events;
create policy "members_delete_own_income_events"
  on public.income_events for delete
  using (created_by = auth.uid());

-- Realtime: enable the table so client subscriptions receive INSERT
-- / UPDATE / DELETE events on the home cycle calculation.
alter publication supabase_realtime add table public.income_events;
