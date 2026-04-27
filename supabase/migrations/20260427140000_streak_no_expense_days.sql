-- Lets a user keep their streak alive on a day they genuinely did not
-- spend anything. Without this, the only way to advance the streak is
-- to insert an expense row — which forced users to fabricate a "$0
-- coffee" entry just to avoid losing progress.
--
-- Design:
--   • One row per (family_id, user_id, marked_date) so the table
--     doubles as a ledger we can union with `expenses` to render the
--     7-day activity grid.
--   • Writes go exclusively through `mark_no_expense_day()`, which
--     runs SECURITY DEFINER and calls the existing `advance_streak`
--     state machine. RLS is select-only for the owning user.

create table if not exists public.streak_marked_days (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marked_date date not null,
  marked_at timestamptz not null default now(),
  primary key (family_id, user_id, marked_date)
);

create index if not exists streak_marked_days_user_idx
  on public.streak_marked_days (user_id, marked_date desc);

alter table public.streak_marked_days enable row level security;

drop policy if exists "streak_marked_days_select_own" on public.streak_marked_days;
create policy "streak_marked_days_select_own"
on public.streak_marked_days
for select
using (
  auth.uid() = user_id
  and public.is_family_member(family_id)
);

-- No insert/update/delete policies — the RPC below is the only writer.

create or replace function public.mark_no_expense_day(p_family_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  v_today := (now() at time zone public.user_local_timezone(v_user_id))::date;

  insert into public.streak_marked_days (family_id, user_id, marked_date)
  values (p_family_id, v_user_id, v_today)
  on conflict (family_id, user_id, marked_date) do nothing;

  perform public.advance_streak(p_family_id, v_user_id, v_today);

  return v_today;
end;
$$;

revoke all on function public.mark_no_expense_day(uuid) from public;
grant execute on function public.mark_no_expense_day(uuid) to authenticated;
