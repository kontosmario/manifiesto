-- Owner-leaves-deletes-family policy.
--
-- Replaces the previous owner-guard. New rules for `leave_current_family`:
--
-- • Caller is the owner with N other members: the entire family is
--   torn down (members rows, families row, all cascading data).
--   Every surviving member's profile gets `onboarding_completed_at`
--   reset AND `family_closed_by_owner_at` set so the next time they
--   open the app, the onboarding screen knows to show the
--   "tu hogar anterior fue cerrado por su dueño" copy.
--
-- • Caller is the owner alone: family deleted as before. The owner
--   themselves never gets `family_closed_by_owner_at` set — they
--   chose to close it.
--
-- • Caller is a regular member: only their own membership row is
--   removed; the family stays intact for the rest. Their own
--   onboarding gate is reset.
--
-- The frontend builds an explicit 2-step "type to confirm" sheet
-- before invoking the RPC, so we no longer need the server-side
-- `owner_has_members` guard — the destructive intent is captured
-- on the client.

-- ─── 1. profiles.family_closed_by_owner_at ─────────────────────────
alter table public.profiles
add column if not exists family_closed_by_owner_at timestamptz null;

comment on column public.profiles.family_closed_by_owner_at is
  'Set by leave_current_family for the surviving members when the '
  'owner tears down a family. Cleared on the next bootstrap_family '
  'or join_family_by_code. The onboarding screen reads it to show '
  'a tailored "your previous home was closed" message.';

-- Clear the flag automatically when the user completes onboarding
-- again (covers any edge case where the user finishes the wizard
-- without going through bootstrap/join — e.g. a future re-flow).
create or replace function public.handle_onboarding_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null then
    new.previously_onboarded := true;
    new.family_closed_by_owner_at := null;
  end if;
  return new;
end;
$$;

-- ─── 2. leave_current_family ────────────────────────────────────────
drop function if exists public.leave_current_family();
create or replace function public.leave_current_family()
returns table (family_id uuid, family_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_current_family_code text;
  v_caller_role text;
  v_other_active_members integer;
  v_remaining_members integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code, fm.role
    into v_current_family_id, v_current_family_code, v_caller_role
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  if v_caller_role = 'owner' then
    -- Count other still-active members so we can decide whether to
    -- mark survivors with `family_closed_by_owner_at`. (Blocked
    -- members keep historic data access but aren't notified — the
    -- owner already chose to silence them.)
    select count(*) into v_other_active_members
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.blocked_at is null;

    if v_other_active_members > 0 then
      update public.profiles p
      set onboarding_completed_at = null,
          family_closed_by_owner_at = v_now
      where p.id in (
        select fm.user_id
        from public.family_members fm
        where fm.family_id = v_current_family_id
          and fm.user_id <> v_user_id
      );
    end if;

    -- Tear the whole family down. Cascading FKs handle expenses,
    -- fixed_expenses, savings_goals, family_finance, categories, etc.
    -- The category-protect trigger from migration 20260424180000
    -- needs the GUC opt-in to allow the cascade.
    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.push_subscriptions
    where push_subscriptions.family_id = v_current_family_id;

    delete from public.family_members
    where family_members.family_id = v_current_family_id;

    delete from public.families
    where families.id = v_current_family_id;

    -- Owner's own onboarding gate reset (their flag stays null —
    -- they're the one who closed it).
    update public.profiles
    set onboarding_completed_at = null
    where profiles.id = v_user_id;

    return query
      select v_current_family_id, v_current_family_code;
    return;
  end if;

  -- Regular-member path: remove just the caller's row.
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  -- If the regular-member path drained the family (shouldn't happen
  -- now that owners always exist, but defensive anyway).
  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);
    delete from public.families
    where families.id = v_current_family_id;
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  return query
    select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;

-- ─── 3. clear flag on bootstrap / join ─────────────────────────────
-- We update both functions so that the moment the user starts a new
-- home (creating one or joining), the "closed by owner" notice is
-- cleared from their profile.

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

  insert into public.family_members(family_id, user_id, role)
  values (v_existing_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

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

  -- Clear "closed by owner" notice now that the user is starting fresh.
  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  return query select v_existing_family_id, v_existing_family_code;
end;
$$;

revoke all on function public.bootstrap_family(text) from public;
grant execute on function public.bootstrap_family(text) to authenticated;

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

  insert into public.family_members(family_id, user_id, role)
  values (v_target_family_id, v_user_id, 'member')
  on conflict (user_id) do nothing;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  return query select v_target_family_id, v_target_family_code;
end;
$$;

revoke all on function public.join_family_by_code(text) from public;
grant execute on function public.join_family_by_code(text) to authenticated;
