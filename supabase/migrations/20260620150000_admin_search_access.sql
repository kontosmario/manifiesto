-- supabase/migrations/20260620150000_admin_search_access.sql
-- admin_search_users: estado de acceso CLARO por usuario. Antes devolvía
-- has_sub mirando el estado de la FAMILIA → un miembro cubierto (que NO paga,
-- vive del plan de un titular) salía igual que el que paga. Ahora distingue:
--   mvp        super cuenta (acceso de por vida)
--   comped     cortesía
--   purchaser  TITULAR: la sub está atada a su Apple ID (paga)
--   covered    CUBIERTO por el hogar (no paga; vive del plan del titular)
--   trial      en período de prueba
--   none       sin plan
-- Para 'covered' también devuelve el email del titular (quién paga).
-- (Return columns cambian → drop + recreate. Mantiene el gate is_super_admin.)

drop function if exists public.admin_search_users(text);
create or replace function public.admin_search_users(p_query text)
returns table(
  user_id uuid, email text, display_name text,
  family_id uuid, is_mvp boolean,
  access text, purchaser_email text
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_query), '') = '' then return; end if;
  return query
  with base as (
    select u.id as uid, u.email::text as uemail,
           p.display_name as dname, p.created_at as pcreated, p.trial_days as tdays,
           fam.family_id as fid,
           fe.mvp as fmvp, fe.comped as fcomped,
           fe.subscription_status as fstatus, fe.purchaser_user_id as fpurchaser
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
    limit 25
  )
  select
    b.uid, b.uemail, b.dname, b.fid,
    coalesce(b.fmvp, false) as is_mvp,
    (case
       when coalesce(b.fmvp, false) then 'mvp'
       when coalesce(b.fcomped, false) then 'comped'
       when coalesce(b.fstatus, 'none') in ('active', 'grace')
            and b.fpurchaser = b.uid then 'purchaser'
       when coalesce(b.fstatus, 'none') in ('active', 'grace') then 'covered'
       when greatest(0, coalesce(b.tdays, 30) - (now()::date - b.pcreated::date)) > 0
            then 'trial'
       else 'none'
     end)::text as access,
    (case
       when coalesce(b.fstatus, 'none') in ('active', 'grace')
            and b.fpurchaser is not null and b.fpurchaser <> b.uid
       then (select pu.email::text from auth.users pu where pu.id = b.fpurchaser)
       else null
     end)::text as purchaser_email
  from base b;
end;
$$;
revoke all on function public.admin_search_users(text) from public;
grant execute on function public.admin_search_users(text) to authenticated;
