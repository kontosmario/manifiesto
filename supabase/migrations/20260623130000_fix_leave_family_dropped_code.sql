-- Fix: leave_current_family referenciaba families.code, que fue DROPPEADO en
-- 20260507000400_cleanup_legacy_family_code. La función canónica
-- (20260614001300) se reescribió manteniendo `f.code` → TODA llamada falla en
-- runtime con "column f.code does not exist". Afecta tanto el flujo de
-- salir/eliminar el hogar como el nuevo "Reiniciar mi cuenta" (que reusa este
-- RPC). Quitamos la referencia a f.code y el join a families (era solo para
-- code); el resto del cuerpo es idéntico a 20260614001300. La columna de retorno
-- family_code se mantiene en la firma (cliente agnóstico) pero ahora es null.

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
  v_caller_role text;
  v_other_active_members integer;
  v_remaining_members integer;
  v_contribution numeric(12,2);
  v_display_name text;
  v_next_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- families.code ya no existe (cleanup 20260507000400); leemos solo de fm.
  select fm.family_id, fm.role, fm.monthly_income_contribution
    into v_current_family_id, v_caller_role, v_contribution
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Capture display_name BEFORE deleting so the notification body can
  -- reference the leaving user.
  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  -- ─── Owner-alone branch ────────────────────────────────────────
  -- Canonical `role <> 'blocked'` (= is_family_member_active), Sprint N F3.
  select count(*) into v_other_active_members
  from public.family_members fm
  where fm.family_id = v_current_family_id
    and fm.user_id <> v_user_id
    and fm.role <> 'blocked';

  if v_caller_role = 'owner' and coalesce(v_other_active_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);

    delete from public.push_subscriptions
    where push_subscriptions.family_id = v_current_family_id;

    delete from public.family_members
    where family_members.family_id = v_current_family_id;

    delete from public.families
    where families.id = v_current_family_id;

    update public.profiles
    set onboarding_completed_at = null
    where profiles.id = v_user_id;

    return query
      select v_current_family_id, null::text;
    return;
  end if;

  -- ─── Owner-with-others branch — promote next member ──────────
  if v_caller_role = 'owner' then
    select fm.user_id
      into v_next_owner
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.role <> 'blocked'
    order by fm.created_at asc
    limit 1;

    if v_next_owner is not null then
      update public.family_members fm
      set role = 'owner'
      where fm.family_id = v_current_family_id
        and fm.user_id = v_next_owner;
    end if;
  end if;

  -- ─── Common cleanup for owner-with-others + regular member ────
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  -- Defensive: if the family is empty after the delete, tear it down.
  select count(*)
    into v_remaining_members
  from public.family_members
  where family_members.family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    perform set_config('app.allow_delete_categories', 'on', true);
    delete from public.families
    where families.id = v_current_family_id;
  else
    if coalesce(v_contribution, 0) > 0 then
      insert into public.notifications (
        family_id, kind, severity, title, body, metadata, created_by
      )
      values (
        v_current_family_id,
        'member_left',
        'warning',
        v_display_name || ' se retiró del hogar',
        'El ingreso mensual del hogar bajó en $' ||
          to_char(v_contribution, 'FM999G999G999D00') || '.',
        jsonb_build_object(
          'left_user_id', v_user_id,
          'left_display_name', v_display_name,
          'monthly_income_removed', v_contribution
        ),
        v_user_id
      );
    end if;
  end if;

  update public.profiles
  set onboarding_completed_at = null
  where profiles.id = v_user_id;

  return query
    select v_current_family_id, null::text;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;

comment on function public.leave_current_family() is
  'User leaves their current family. Owner-with-others promotes the oldest '
  'active member (role <> ''blocked''). Owner-alone deletes the family. '
  'Regular members just leave. family_code siempre null (columna droppeada '
  'en 20260507000400; firma conservada por compat del cliente).';
