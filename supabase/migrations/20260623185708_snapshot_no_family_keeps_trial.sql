-- Fix: tras "Reiniciar mi cuenta" (o cualquier ventana transitoria SIN familia),
-- el paywall duro aparecía aunque el período de acceso completo estuviera ACTIVO.
--
-- family_entitlement_snapshot() resuelve el entitlement correcto en el record `r`
-- (resolve_entitlement lee profiles.created_at/trial_days — NO necesita familia),
-- pero el RETURN QUERY tomaba todas las filas `FROM family_entitlements fe WHERE
-- fe.family_id = v_family_id`. Cuando el usuario NO tiene familia
-- (leave_current_family la borró antes de re-onboardear), v_family_id es null →
-- cero filas `fe` → el set entero queda VACÍO y se descarta el `r` válido (trial,
-- has_access=true). El cliente normaliza el set vacío a BLOCKED_ENTITLEMENT
-- (has_access=false) → el SubscriptionGate monta el paywall duro y, como las tabs
-- siguen montadas debajo del modal de onboarding, el usuario queda atrapado.
--
-- Fix: anclar el RETURN QUERY en una fila base + LEFT JOIN a family_entitlements,
-- así `r.*` (el entitlement resuelto, incluido el trial) se emite SIEMPRE; las
-- columnas `fe.*` quedan null cuando no hay familia (el normalizer del cliente ya
-- defaultea esos campos). NO afecta el gate legítimo: una cuenta con el período
-- vencido resuelve `r.has_access=false` y sigue bloqueada. CREATE OR REPLACE
-- conserva los grants existentes.

create or replace function public.family_entitlement_snapshot()
returns table (
  source text, plan text, has_access boolean, days_left integer,
  trial_days_left integer, expires_at timestamptz, subscription_status text,
  member_cap integer, member_count integer, pending_product_id text,
  auto_renew boolean, grace_expires_at timestamptz, is_purchaser boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  v_trial_left := greatest(0, coalesce(v_trial_days, 30) - (now()::date - v_created_at::date));

  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role, '') <> 'blocked' limit 1;

  return query
    select r.source, r.plan, r.has_access, r.days_left,
      v_trial_left,
      fe.expires_at, fe.subscription_status,
      (case when r.source = 'mvp' then 4
            when fe.product_id like '%yearly%' then 4 else 2 end)::int as member_cap,
      (select count(*)::int from public.family_members m
        where m.family_id = v_family_id and coalesce(m.role, '') <> 'blocked') as member_count,
      fe.pending_product_id,
      fe.auto_renew, fe.grace_expires_at,
      (fe.purchaser_user_id is not null and fe.purchaser_user_id = v_user_id) as is_purchaser
    -- ANCLAJE: fila base (r ya está cargado en una variable) + LEFT JOIN a
    -- family_entitlements → r.* se emite SIEMPRE, también sin familia (fe.* null).
    from (select 1) as one
    left join public.family_entitlements fe on fe.family_id = v_family_id;
end;
$function$;
