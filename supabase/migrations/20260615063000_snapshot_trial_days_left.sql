-- supabase/migrations/20260615063000_snapshot_trial_days_left.sql
-- Fase 1 de suscripciones: el snapshot expone trial_days_left SIEMPRE
-- (no solo cuando el trial es el source que gana la cascada). Lo usa el
-- aviso de salir-de-familia: un miembro cuyo acceso viene del hogar pero
-- cuyo período libre personal ya venció debe ser advertido antes de salir
-- (al salir cae a 'free' → bloqueo). Spec §6.6.
drop function if exists public.family_entitlement_snapshot();
create or replace function public.family_entitlement_snapshot()
returns table(
  source text, plan text, has_access boolean, days_left int,
  trial_days_left int,
  expires_at timestamptz, subscription_status text,
  member_cap int, member_count int, pending_product_id text
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

  -- trial_days_left independiente de la cascada (estado del período
  -- libre personal del usuario, gane o no la resolución).
  select p.created_at, p.trial_days into v_created_at, v_trial_days
    from public.profiles p where p.id = v_user_id;
  v_trial_left := greatest(0, coalesce(v_trial_days,30) - (now()::date - v_created_at::date));

  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role,'') <> 'blocked' limit 1;
  return query
    select r.source, r.plan, r.has_access, r.days_left,
      v_trial_left,
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
