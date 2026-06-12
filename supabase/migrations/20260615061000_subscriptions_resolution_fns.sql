-- supabase/migrations/20260615061000_subscriptions_resolution_fns.sql
-- Fase 1 de suscripciones: path de escritura unificado + resolución.

-- ── apply_subscription_transaction: path de escritura UNIFICADO ─────
-- validate-purchase (Fase 2) y el webhook (Fase 3) lo comparten. Ordering
-- por signed_date: nunca pisa estado más nuevo con más viejo (idempotente
-- ante retry / llegada fuera de orden / cliente-vs-webhook).
create or replace function public.apply_subscription_transaction(
  p_family_id uuid,
  p_original_transaction_id text,
  p_status text,
  p_product_id text,
  p_expires_at timestamptz,
  p_grace_expires_at timestamptz,
  p_auto_renew boolean,
  p_environment text,
  p_signed_date timestamptz,
  p_purchaser_user_id uuid default null,
  p_pending_product_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.family_entitlements fe set
    subscription_status = p_status,
    original_transaction_id = coalesce(p_original_transaction_id, fe.original_transaction_id),
    product_id = coalesce(p_product_id, fe.product_id),
    pending_product_id = p_pending_product_id,
    expires_at = coalesce(p_expires_at, fe.expires_at),
    grace_expires_at = p_grace_expires_at,
    auto_renew = coalesce(p_auto_renew, fe.auto_renew),
    environment = coalesce(p_environment, fe.environment),
    purchaser_user_id = coalesce(p_purchaser_user_id, fe.purchaser_user_id),
    last_applied_signed_date = p_signed_date,
    updated_at = now()
  where fe.family_id = p_family_id
    and (fe.last_applied_signed_date is null
         or p_signed_date > fe.last_applied_signed_date);  -- ordering
end;
$$;
revoke all on function public.apply_subscription_transaction(uuid,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz,uuid,text) from public;

-- ── resolve_entitlement: cascada server-side, solo DB (no StoreKit) ──
create or replace function public.resolve_entitlement(p_user_id uuid)
returns table(source text, plan text, days_left int, has_access boolean)
language plpgsql security definer stable set search_path = public as $$
declare
  v_family_id uuid;
  v_status text;
  v_product text;
  v_comped boolean;
  v_created_at timestamptz;
  v_trial_days int;
  v_days_left int;
begin
  -- Familia activa del usuario.
  select fm.family_id into v_family_id
    from public.family_members fm
   where fm.user_id = p_user_id and coalesce(fm.role,'') <> 'blocked'
   limit 1;

  -- Estado de la sub de esa familia.
  if v_family_id is not null then
    select fe.subscription_status, fe.product_id, fe.comped
      into v_status, v_product, v_comped
      from public.family_entitlements fe where fe.family_id = v_family_id;
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

-- ── snapshot: lo que la UI necesita (incl. cap/count para downgrade) ─
create or replace function public.family_entitlement_snapshot()
returns table(
  source text, plan text, has_access boolean, days_left int,
  expires_at timestamptz, subscription_status text,
  member_cap int, member_count int, pending_product_id text
) language plpgsql security definer stable set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  r record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select * into r from public.resolve_entitlement(v_user_id);
  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role,'') <> 'blocked' limit 1;
  return query
    select r.source, r.plan, r.has_access, r.days_left,
      fe.expires_at, fe.subscription_status,
      (case when fe.product_id like '%yearly%' then 4 else 2 end)::int as member_cap,
      (select count(*)::int from public.family_members m
        where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked') as member_count,
      fe.pending_product_id
    from public.family_entitlements fe where fe.family_id = v_family_id;
end;
$$;
revoke all on function public.family_entitlement_snapshot() from public;
grant execute on function public.family_entitlement_snapshot() to authenticated;
