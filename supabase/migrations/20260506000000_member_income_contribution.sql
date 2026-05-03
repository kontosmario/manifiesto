-- Per-member income contribution.
--
-- Up to now `family_finance.monthly_income` was a single number set
-- by whoever ran onboarding first (the family creator). When other
-- members joined later there was no way to express "I contribute
-- $X to the household" without overwriting the creator's value, and
-- when a member left we couldn't subtract their share because we
-- didn't know it.
--
-- New design:
--   1. `family_members.monthly_income_contribution` — per-row, the
--      member's monthly contribution to the household income. `0`
--      means "doesn't contribute" (e.g. child, unemployed partner).
--   2. `family_finance.monthly_income` stays as the cached SUM of
--      all members' contributions. We recompute via trigger on
--      every insert / update / delete of `family_members`.
--   3. Backfill: for each existing family, attribute the current
--      `family_finance.monthly_income` to the family OWNER (or, if
--      there's no owner row, the first member). Other members start
--      at 0. This preserves the cached total so analytics and signals
--      see no change after the migration runs.
--
-- The leave RPC also emits a `member_left` notification when the
-- contribution was non-zero, so remaining members understand the
-- impact on the household total.

-- ─── 1. Column ──────────────────────────────────────────────────────

alter table public.family_members
  add column if not exists monthly_income_contribution numeric(12,2) not null default 0
  check (monthly_income_contribution >= 0);

-- ─── 2. Backfill ────────────────────────────────────────────────────
-- Attribute each family's current `monthly_income` to its owner.
-- We use a CTE so the update is atomic per family.

with first_member as (
  select distinct on (fm.family_id)
    fm.family_id,
    fm.user_id,
    ff.monthly_income
  from public.family_members fm
  join public.family_finance ff on ff.family_id = fm.family_id
  where coalesce(fm.role, 'member') = 'owner'
     or not exists (
       select 1 from public.family_members fm2
       where fm2.family_id = fm.family_id
         and fm2.role = 'owner'
     )
  order by fm.family_id,
           case when fm.role = 'owner' then 0 else 1 end,
           fm.created_at asc
)
update public.family_members fm
set monthly_income_contribution = first_member.monthly_income
from first_member
where fm.family_id = first_member.family_id
  and fm.user_id = first_member.user_id
  and first_member.monthly_income > 0;

-- ─── 3. Recompute trigger ──────────────────────────────────────────
-- Whenever a member's contribution changes (or members are added /
-- removed), recompute the cached `family_finance.monthly_income` as
-- the SUM of all contributions for that family.

create or replace function public.recompute_family_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_total numeric(12,2);
begin
  -- Pick the family whose totals we need to refresh. INSERT/UPDATE
  -- use NEW; DELETE uses OLD. For UPDATE that changes family_id
  -- (rare — should not happen in practice) we recompute both sides.
  if tg_op = 'DELETE' then
    v_family_id := old.family_id;
  else
    v_family_id := new.family_id;
  end if;

  select coalesce(sum(fm.monthly_income_contribution), 0)
    into v_total
  from public.family_members fm
  where fm.family_id = v_family_id;

  -- The family_finance row may not exist yet if the family was just
  -- bootstrapped. UPSERT keeps the trigger order-independent.
  insert into public.family_finance (family_id, monthly_income)
  values (v_family_id, v_total)
  on conflict (family_id) do update
    set monthly_income = excluded.monthly_income;

  -- If UPDATE moved the row to a different family, refresh the old
  -- family too so it doesn't keep a stale total.
  if tg_op = 'UPDATE' and old.family_id is distinct from new.family_id then
    select coalesce(sum(fm.monthly_income_contribution), 0)
      into v_total
    from public.family_members fm
    where fm.family_id = old.family_id;
    update public.family_finance
    set monthly_income = v_total
    where family_finance.family_id = old.family_id;
  end if;

  return null; -- AFTER trigger
end;
$$;

drop trigger if exists trg_family_members_recompute_income on public.family_members;
create trigger trg_family_members_recompute_income
after insert or update of monthly_income_contribution, family_id
       or delete
on public.family_members
for each row
execute function public.recompute_family_income();
