-- Single-use family invites.
--
-- Replaces the persistent `families.code` model (one shared code
-- forever, anyone with it can join) with ephemeral per-invite
-- tokens:
--
--   • An owner / member taps "Invitar" in Settings → server
--     generates a fresh code via `create_family_invite()`,
--     persists it in `family_invites` with a 7-day TTL.
--   • The user shares that code out-of-band (DM, AirDrop, etc).
--   • The joiner enters it in onboarding step 3. The wizard calls
--     `peek_family_invite(p_code)` which returns the family preview
--     IFF the invite is still valid (not consumed, not expired).
--   • At step 5 "Confirmar y unirme", the wizard calls
--     `consume_family_invite(p_code, p_contribution)` which:
--       1. validates the invite is still valid,
--       2. inserts `family_members` with the contribution,
--       3. marks the invite as consumed (`consumed_at = now()`,
--          `consumed_by = caller`).
--   • Subsequent attempts to use the same code raise
--     'Invite already used'.
--
-- Why this beats the persistent `families.code`:
--   - Brute-force enumeration is much harder: invites are ~17K
--     active codes max (one per pending invite), short-lived,
--     and consumed quickly. With 32^8 keyspace (1.1 trillion)
--     you'd need millions of years at any sane rate limit.
--   - A leaked code is single-use → exposure window is one join.
--   - The owner doesn't have to rotate a long-lived code when
--     someone they don't trust anymore knew it.
--
-- This migration is ADDITIVE: existing `families.code` and
-- `bootstrap_family` / `join_family_by_code` / `peek_family_by_code`
-- stay functional during the transition. Cleanup migration drops
-- them once the client is fully cut over.

-- ─── 1. Table ──────────────────────────────────────────────────────
create table if not exists public.family_invites (
  code text primary key check (char_length(code) between 4 and 16),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_by uuid null references auth.users(id) on delete set null,
  consumed_at timestamptz null
);

create index if not exists family_invites_family_idx
  on public.family_invites(family_id);

-- Partial index for the hot path: looking up active invites.
-- "Active" = not consumed AND not expired. Server checks both
-- conditions, but the index lets us skip rows that are already
-- consumed (the dominant prune target over time).
create index if not exists family_invites_active_idx
  on public.family_invites(family_id, expires_at)
  where consumed_at is null;

-- RLS: invites are read by the lookup RPC (security definer) and
-- written by the create/consume RPCs (also security definer).
-- Direct table access is locked down — clients can't enumerate.
alter table public.family_invites enable row level security;

drop policy if exists family_invites_no_direct_access on public.family_invites;
create policy family_invites_no_direct_access
  on public.family_invites
  for all
  using (false)
  with check (false);

-- ─── 2. Helper: random Crockford-alphabet code ────────────────────
-- 32 chars (no I, O, 0, 1) × 8 chars = 32^8 ≈ 1.1 trillion keyspace.
-- Built on `gen_random_bytes` (cryptographically secure), modded
-- against the alphabet length per byte. Slight bias from mod-32 is
-- negligible at this keyspace size.
create or replace function public.generate_invite_code(p_length int default 8)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len int := length(v_alphabet);
  v_bytes bytea;
  v_code text := '';
  v_idx int;
  v_byte int;
begin
  v_bytes := gen_random_bytes(p_length);
  for v_idx in 0..(p_length - 1) loop
    v_byte := get_byte(v_bytes, v_idx);
    v_code := v_code || substr(v_alphabet, 1 + (v_byte % v_alphabet_len), 1);
  end loop;
  return v_code;
end;
$$;

-- ─── 3. create_family_invite — generate a fresh single-use code ──
create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_expires timestamptz;
  v_attempts int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be an active member of a family. Blocked members
  -- can't generate invites.
  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and (fm.blocked_at is null)
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Generate-and-retry on unique_violation. With 32^8 keyspace and
  -- O(K) active invites system-wide, collisions are vanishingly
  -- rare; the loop is purely defensive.
  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
      v_expires := expires_at;
      return next;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 8 then
        raise exception 'Could not generate a unique invite code.';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;

-- ─── 4. peek_family_invite — preview without consuming ──────────
-- Returns the same JSONB shape as `peek_family_by_code` so the
-- onboarding wizard's step 5 summary works without changes once
-- the client switches the lookup hook.
create or replace function public.peek_family_invite(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  limit 1;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', upper(btrim(p_code)),
    'monthly_income', coalesce((
      select ff.monthly_income
      from public.family_finance ff
      where ff.family_id = v_family_id
    ), 0),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', fm.user_id,
        'display_name', coalesce(p.display_name, ''),
        'avatar_animal', p.avatar_animal,
        'monthly_income_contribution',
          coalesce(fm.monthly_income_contribution, 0),
        'role', coalesce(fm.role, 'member'),
        'is_blocked', fm.blocked_at is not null
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'cycle_variable_spent', coalesce((
      select sum(e.price)::numeric(12,2)
      from public.expenses e
      where e.family_id = v_family_id
        and e.commitment_id is null
        and e.created_at::date >= v_period_start
        and e.created_at::date <= v_period_end
    ), 0),
    'active_fixed_count', coalesce((
      select count(*)::int
      from public.fixed_expenses fe
      where fe.family_id = v_family_id
        and fe.status = 'active'
    ), 0),
    'active_goal', (
      select jsonb_build_object(
        'title', sg.title,
        'goal_amount', sg.goal_amount,
        'current_amount', sg.current_amount
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id
        and sg.is_active = true
      order by sg.created_at desc
      limit 1
    ),
    'invite_expires_at', v_invite_expires
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.peek_family_invite(text) from public;
grant execute on function public.peek_family_invite(text) to authenticated;

-- ─── 5. consume_family_invite — actually join + mark used ────────
create or replace function public.consume_family_invite(
  p_code text,
  p_contribution numeric default null
)
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_existing_family_id uuid;
  v_contribution numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotent: if the user is already a member of a family,
  -- return that family without consuming the invite. Lets the
  -- client re-tap "Confirmar y unirme" without breaking on a
  -- transient network blip.
  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  -- Lock the invite row so concurrent consume calls can't both
  -- succeed (e.g. two clients sharing the same code racing).
  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
  for update;

  if v_family_id is null then
    raise exception 'Invite code not found';
  end if;
  if v_invite_consumed_at is not null then
    raise exception 'Invite already used';
  end if;
  if v_invite_expires < now() then
    raise exception 'Invite expired';
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;
  -- Trigger from 20260506000000 recomputes family_finance.monthly_income.

  update public.family_invites
  set consumed_by = v_user_id,
      consumed_at = now()
  where family_invites.code = upper(btrim(p_code));

  -- Clear "closed by owner" notice on the joining user (legacy
  -- flag from before owner-leave-preserves-family).
  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.consume_family_invite(text, numeric) from public;
grant execute on function public.consume_family_invite(text, numeric) to authenticated;
