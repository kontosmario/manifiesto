-- Fix: `bootstrap_family` was inserting the creator into
-- `family_members` without specifying `role`. The `role` column
-- (added in 20260424001858) defaults to 'member', so every family
-- created after that migration was born without an owner — the
-- creator silently lost owner-only RLS privileges (family_finance
-- writes, savings_goals writes, transfer/block/remove RPCs).
--
-- The backfill in 20260424001858 only promoted the earliest member
-- of *existing* families, so families created since are still
-- broken. We:
--
--   1. Recreate `bootstrap_family` to insert the creator with
--      role='owner' explicitly.
--   2. Recreate `join_family_by_code` to insert the joiner with
--      role='member' explicitly (no behavior change — this just
--      makes the role assignment robust if the column default ever
--      changes).
--   3. Backfill: promote the earliest member of any family that
--      currently has no owner to 'owner'.
--
-- The unique partial index `family_members_one_owner_per_family`
-- guarantees the backfill can't create duplicates.

-- ─── 1. bootstrap_family with explicit owner role ──────────────────
drop function if exists public.bootstrap_family();
drop function if exists public.bootstrap_family(text);
create or replace function public.bootstrap_family(p_preferred_code text default null)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_existing_family_code text;
  v_target_code text;
  v_attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_existing_family_id, v_existing_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    return query select v_existing_family_id, v_existing_family_code;
    return;
  end if;

  if p_preferred_code is not null and btrim(p_preferred_code) <> '' then
    v_target_code := upper(btrim(p_preferred_code));
  else
    v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  end if;

  loop
    begin
      insert into public.families(code)
      values (v_target_code)
      returning id, code into v_existing_family_id, v_existing_family_code;
      exit;
    exception
      when unique_violation then
        v_attempts := v_attempts + 1;
        if v_attempts > 8 then
          raise exception 'Could not generate a unique family code.';
        end if;
        v_target_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    end;
  end loop;

  -- Creator becomes the owner. The unique partial index
  -- `family_members_one_owner_per_family` guarantees uniqueness.
  insert into public.family_members(family_id, user_id, role)
  values (v_existing_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  -- Expense categories (scope='expense').
  insert into public.categories(family_id, template_id, name, scope)
  select v_existing_family_id, templates.id, templates.name, 'expense'
  from public.category_templates templates
  where templates.scope = 'expense'
    and not exists (
      select 1
      from public.categories categories
      where categories.family_id = v_existing_family_id
        and categories.scope = 'expense'
        and lower(categories.name) = lower(templates.name)
    )
  order by templates.sort_order;

  -- Fixed expense categories (scope='fixed_expense').
  insert into public.categories(family_id, template_id, name, color, scope)
  select
    v_existing_family_id,
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
      from public.categories categories
      where categories.family_id = v_existing_family_id
        and categories.scope = 'fixed_expense'
        and lower(categories.name) = lower(templates.name)
    )
  order by templates.sort_order;

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;

-- ─── 2. join_family_by_code with explicit member role ──────────────
drop function if exists public.join_family_by_code(text);
create or replace function public.join_family_by_code(p_code text)
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_target_family_id uuid;
  v_target_family_code text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is not null then
    return query select v_current_family_id, v_current_family_code;
    return;
  end if;

  select f.id, f.code
    into v_target_family_id, v_target_family_code
  from public.families f
  where f.code = upper(btrim(p_code))
  limit 1;

  if v_target_family_id is null then
    raise exception 'Family code not found';
  end if;

  -- Joining via shared code = member, never owner.
  insert into public.family_members(family_id, user_id, role)
  values (v_target_family_id, v_user_id, 'member')
  on conflict (user_id) do nothing;

  return query select v_target_family_id, v_target_family_code;
end;
$$;

revoke all on function public.join_family_by_code(text) from public;
grant execute on function public.join_family_by_code(text) to authenticated;

-- ─── 3. Backfill ownerless families ────────────────────────────────
-- Families that have at least one member but no owner: promote the
-- earliest member (by created_at, then user_id as tiebreaker) so
-- exactly one owner exists per family. Idempotent: families that
-- already have an owner are excluded by the WHERE clause.
with ownerless as (
  select fm.family_id
  from public.family_members fm
  group by fm.family_id
  having sum(case when fm.role = 'owner' then 1 else 0 end) = 0
),
earliest as (
  select fm.family_id, fm.user_id,
         row_number() over (
           partition by fm.family_id
           order by fm.created_at asc, fm.user_id asc
         ) as rn
  from public.family_members fm
  where fm.family_id in (select family_id from ownerless)
    and fm.role <> 'blocked'
)
update public.family_members fm
set role = 'owner'
from earliest e
where fm.family_id = e.family_id
  and fm.user_id = e.user_id
  and e.rn = 1;
