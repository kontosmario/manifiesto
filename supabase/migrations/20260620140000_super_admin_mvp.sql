-- supabase/migrations/20260620140000_super_admin_mvp.sql
-- Super admin + estado MVP (acceso full de por vida para cuentas elegidas).
--
-- Super admin = SOLO kontosmario@gmail.com. Puede buscar usuarios por email y
-- togglear el flag `mvp` de su hogar. Un hogar MVP resuelve a acceso total
-- (por encima de comped/family/trial), sin cobro, de por vida (no expira).
--
-- SEGURIDAD: todos los RPCs admin verifican `is_super_admin()` como PRIMERA
-- línea (gate por email de auth.users). SECURITY DEFINER + revoke public.

-- ── 1. flag mvp ─────────────────────────────────────────────────────────────
alter table public.family_entitlements
  add column if not exists mvp boolean not null default false;

-- ── 2. gate de super admin (SOLO kontosmario@gmail.com) ─────────────────────
create or replace function public.is_super_admin()
returns boolean language plpgsql security definer stable
set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then return false; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  return v_email = 'kontosmario@gmail.com';
end;
$$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- ── 3. resolve_entitlement: MVP resuelve PRIMERO ────────────────────────────
-- (réplica exacta de la cascada vigente + el escalón 0 = mvp)
create or replace function public.resolve_entitlement(p_user_id uuid)
returns table(source text, plan text, days_left int, has_access boolean)
language plpgsql security definer stable set search_path = public as $$
declare
  v_family_id uuid;
  v_status text;
  v_product text;
  v_comped boolean;
  v_mvp boolean;
  v_created_at timestamptz;
  v_trial_days int;
  v_days_left int;
begin
  select fm.family_id into v_family_id
    from public.family_members fm
   where fm.user_id = p_user_id and coalesce(fm.role,'') <> 'blocked'
   limit 1;

  if v_family_id is not null then
    select fe.subscription_status, fe.product_id, fe.comped, fe.mvp
      into v_status, v_product, v_comped, v_mvp
      from public.family_entitlements fe where fe.family_id = v_family_id;
  end if;

  -- 0. MVP — super cuenta, acceso total de por vida.
  if coalesce(v_mvp, false) then
    return query select 'mvp'::text, 'mvp'::text, null::int, true; return;
  end if;
  -- 1. comped.
  if coalesce(v_comped, false) then
    return query select 'comped'::text, 'comped'::text, null::int, true; return;
  end if;
  -- 2. familia con sub activa/gracia.
  if coalesce(v_status,'none') in ('active','grace') then
    return query select 'family'::text,
      (case when v_product like '%yearly%' then 'yearly'
            when v_product like '%monthly%' then 'monthly'
            else 'family' end)::text,
      null::int, true; return;
  end if;
  -- 3. trial monotónico per-usuario.
  select p.created_at, p.trial_days into v_created_at, v_trial_days
    from public.profiles p where p.id = p_user_id;
  v_days_left := greatest(0, coalesce(v_trial_days,30) - (now()::date - v_created_at::date));
  if v_days_left > 0 then
    return query select 'trial'::text, 'trial'::text, v_days_left, true; return;
  end if;
  -- 4. bloqueado.
  return query select 'free'::text, 'free'::text, 0, false;
end;
$$;
revoke all on function public.resolve_entitlement(uuid) from public;
grant execute on function public.resolve_entitlement(uuid) to authenticated;

-- ── 4. snapshot: source mvp fluye; cap al máximo (4) para mvp ────────────────
drop function if exists public.family_entitlement_snapshot();
create or replace function public.family_entitlement_snapshot()
returns table(
  source text, plan text, has_access boolean, days_left int,
  trial_days_left int,
  expires_at timestamptz, subscription_status text,
  member_cap int, member_count int, pending_product_id text,
  auto_renew boolean, grace_expires_at timestamptz,
  is_purchaser boolean
) language plpgsql security definer stable set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_created_at timestamptz;
  v_trial_days int;
  v_trial_left int;
  r record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select * into r from public.resolve_entitlement(v_user_id);

  select p.created_at, p.trial_days into v_created_at, v_trial_days
    from public.profiles p where p.id = v_user_id;
  v_trial_left := greatest(0, coalesce(v_trial_days,30) - (now()::date - v_created_at::date));

  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role,'') <> 'blocked' limit 1;
  return query
    select r.source, r.plan, r.has_access, r.days_left,
      v_trial_left,
      fe.expires_at, fe.subscription_status,
      (case when r.source = 'mvp' then 4
            when fe.product_id like '%yearly%' then 4 else 2 end)::int as member_cap,
      (select count(*)::int from public.family_members m
        where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked') as member_count,
      fe.pending_product_id,
      fe.auto_renew, fe.grace_expires_at,
      (fe.purchaser_user_id is not null and fe.purchaser_user_id = v_user_id) as is_purchaser
    from public.family_entitlements fe where fe.family_id = v_family_id;
end;
$$;
revoke all on function public.family_entitlement_snapshot() from public;
grant execute on function public.family_entitlement_snapshot() to authenticated;

-- ── 5. admin_search_users: buscar por email (SOLO super admin) ──────────────
create or replace function public.admin_search_users(p_query text)
returns table(
  user_id uuid, email text, display_name text,
  family_id uuid, is_mvp boolean, has_sub boolean
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_query), '') = '' then return; end if;
  return query
    select u.id,
           u.email::text,
           p.display_name,
           fam.family_id,
           coalesce(fe.mvp, false),
           coalesce(fe.subscription_status, 'none') in ('active', 'grace')
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select fm.family_id from public.family_members fm
      where fm.user_id = u.id and coalesce(fm.role, '') <> 'blocked'
      limit 1
    ) fam on true
    left join public.family_entitlements fe on fe.family_id = fam.family_id
    where u.email ilike '%' || p_query || '%'
    order by u.email
    limit 25;
end;
$$;
revoke all on function public.admin_search_users(text) from public;
grant execute on function public.admin_search_users(text) to authenticated;

-- ── 6. admin_set_mvp: prender/apagar MVP de un usuario (SOLO super admin) ────
create or replace function public.admin_set_mvp(p_target_user_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_family_id uuid;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = p_target_user_id and coalesce(fm.role, '') <> 'blocked'
    limit 1;
  if v_family_id is null then raise exception 'no_family'; end if;
  update public.family_entitlements set mvp = p_enabled, updated_at = now()
    where family_id = v_family_id;
  if not found then raise exception 'no_entitlement_row'; end if;
  return p_enabled;
end;
$$;
revoke all on function public.admin_set_mvp(uuid, boolean) from public;
grant execute on function public.admin_set_mvp(uuid, boolean) to authenticated;
