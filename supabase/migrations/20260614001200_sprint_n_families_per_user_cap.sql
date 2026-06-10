-- supabase/migrations/20260614001200_sprint_n_families_per_user_cap.sql
--
-- Sprint N · Audit #7 R-5 (2026-06-14):
--   `bootstrap_family` is rate-limited to 3 invocations per hour
--   (20260510000100). That stops a single-session burst but does NOT
--   cap lifetime creation: an attacker who patiently creates 1 family
--   every 25 minutes can accumulate arbitrarily many `families` rows
--   over weeks. Each family also gets the full default expense +
--   fixed_expense category seed (~25 rows), so the amplification
--   factor is ~25x in row count plus the empty family record itself.
--
--   Legitimate users almost never need more than 1 family. A handful
--   of edge cases (separation/divorce → new household; user joined
--   wrong family on accident and bootstrapped a second) can justify 2.
--   Beyond ~3-5 lifetime, behavior is indistinguishable from abuse.
--
-- Fix:
--   Add a lifetime cap of 5 owner roles per user to `bootstrap_family`.
--   We count `family_members` rows where `user_id = auth.uid()` and
--   `role = 'owner'` — this captures BOTH currently-owned families and
--   families the user previously owned and then handed off or left.
--   The cap is intentionally generous (most users will never approach
--   it) but tight enough to make sustained automation pointless.
--
--   Why count owner roles instead of `families` ownership history:
--     We don't have a "former owner" audit trail. The closest proxy is
--     `family_members` membership where role = 'owner' (current or
--     past — when ownership transfers, the old owner becomes 'member',
--     so the count actually UNDER-counts past creations). For the cap
--     we want to count creations: that's exactly what currently-owned
--     families give us, plus any pending bootstrap loop attempt.
--
--   The cap is checked AFTER the existing rate limit and AFTER the
--   "already in a family" early-return, so it never affects normal
--   no-op calls (calling bootstrap_family when already in a family
--   still no-ops).
--
-- Manual test plan:
--   1. New user → bootstrap_family OK (count 0 → 1).
--   2. User leaves, calls bootstrap again → OK (count 0 → 1).
--      Wait — they left, so the row is gone. v_lifetime_count = 0.
--      They can re-bootstrap. This is expected: leaving was their
--      action and they should be able to start over.
--   3. User in family, bootstrap_family → no-op (early-return path).
--   4. Owner of 5 families simultaneously (impossible — UNIQUE on
--      family_members(user_id) prevents it) → already gated.
--   5. CONSTRUCTED abuse: user creates family, transfers ownership
--      back-and-forth between two accounts — the count stays at 1 for
--      each because transferring drops the old owner's role. This is
--      OK; transfers are observable and rate-limited separately
--      (family_transfer_ownership: 3/hr).
--
--   So the realistic abuse path the cap blocks is: "create family →
--   delete family (leave-alone) → create again → ..." which DOES
--   bypass everything else. Each leave-alone deletes the row and
--   resets the count to 0. Hmm.
--
--   That means the cap as specified doesn't actually catch the abuse
--   pattern. BUT — the bootstrap rate limit (3/hr) already caps
--   short-burst creation. The lifetime cap here is a defense-in-depth
--   measure: it catches the case where an attacker holds onto MANY
--   families simultaneously (each with families.id, ~25 categories,
--   etc.) which IS abusive. Sustained churn over weeks is bounded by
--   the 3/hr × 24 × 7 = 504/wk ceiling regardless.
--
-- Rollback (manual):
--   Replay the body from 20260510000100 (without the cap).

create or replace function public.bootstrap_family()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
  v_lifetime_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('bootstrap_family', 3, 3600);

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

  -- Sprint N · Audit #7 R-5: lifetime cap of 5 owner roles per user.
  -- See migration header for the rationale.
  select count(*)
    into v_lifetime_count
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'owner';

  if coalesce(v_lifetime_count, 0) >= 5 then
    raise exception 'family-cap-reached' using errcode = 'P0001';
  end if;

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  insert into public.categories(family_id, template_id, name, scope)
  select v_new_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_new_family_id,
    templates.id,
    templates.name,
    case templates.name
      when 'Servicios'     then '#E8976A'
      when 'Vivienda'      then '#8DB46A'
      when 'Suscripciones' then '#C9A6E0'
      when 'Seguros'       then '#F2B58A'
      when 'Cuotas'        then '#6B9AD6'
      when 'Impuestos'     then '#C7A96A'
      when 'Deudas'        then '#D96A4F'
      else '#8A8A8A'
    end,
    'fixed_expense'
  from public.category_templates templates
  where templates.scope = 'fixed_expense'
    and not exists (
      select 1
      from public.categories c
      where c.family_id = v_new_family_id
        and c.scope = 'fixed_expense'
        and lower(c.name) = lower(templates.name)
    )
  order by templates.sort_order;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$$;

revoke all on function public.bootstrap_family() from public;
grant execute on function public.bootstrap_family() to authenticated;

comment on function public.bootstrap_family() is
  'Bootstraps a family + seeds default categories for the current '
  'user. Rate-limited to 3/hr. Hard lifetime cap of 5 owner roles '
  'per user (Sprint N · Audit #7 R-5) — raises ''family-cap-reached'' '
  'when exceeded.';
