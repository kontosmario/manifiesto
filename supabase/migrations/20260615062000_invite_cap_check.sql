-- supabase/migrations/20260615062000_invite_cap_check.sql
-- Fase 1 de suscripciones: check de cap de miembros en create_family_invite.
-- Downgrade grandfathering: no se expulsa a nadie, pero no se puede invitar
-- por encima del cap del plan vigente (free/mensual = 2, anual = 4).
-- El resto del body se preserva VERBATIM del RPC actual (deletion guard +
-- rate limit + loop de generación con returning into).
create or replace function public.create_family_invite()
returns table(code text, expires_at timestamp with time zone)
language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
  v_pending_deletion timestamptz;
  v_cap int;
  v_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Sprint L · Audit #5 L-1 (2026-06-10): owner con baja agendada no
  -- puede generar invites (el redeemer quedaría huérfano en <30 días).
  select p.deletion_scheduled_at into v_pending_deletion
    from public.profiles p
   where p.id = v_user_id;

  if v_pending_deletion is not null then
    raise exception 'No podés generar invitaciones mientras tu cuenta tenga una baja agendada. Cancelá la baja primero.'
      using errcode = 'P0001';
  end if;

  -- Sprint I-DB I-DB4 (2026-06-10): rate limit 10/hora.
  perform public.check_rate_limit('create_family_invite', 10, 3600);

  -- Sprint F-DB F13: canonical active-member helper.
  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not currently in a family';
  end if;

  -- ── Check de cap (Fase 1 de suscripciones, 2026-06-12) ──────────
  -- Cap del plan vigente vs miembros activos. Bloquea invitar por
  -- encima del cap (no expulsa a los existentes — grandfathering).
  select case when fe.product_id like '%yearly%' then 4 else 2 end
    into v_cap
    from public.family_entitlements fe where fe.family_id = v_family_id;
  select count(*) into v_count
    from public.family_members m
   where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked';
  if v_count >= coalesce(v_cap, 2) then
    raise exception 'Tu hogar alcanzó el máximo de miembros de tu plan. Pasá al Anual o reducí el hogar para invitar a alguien más.'
      using errcode = 'P0001';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id)
      returning family_invites.code, family_invites.expires_at
      into code, expires_at;
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
$function$;
revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;
