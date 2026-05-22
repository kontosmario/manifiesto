-- Conversión Familia → Soltero (owner-only).
-- Quita a los demás miembros (reseteando su onboarding para que vuelvan a
-- configurar su cuenta), invalida invites pendientes y deja la familia en
-- kind='solo'. El trigger recompute_family_income() ajusta family_finance.
-- Ver docs/auditorias/expansion-multisegmento-2026-05-22/spec-conversion-cuenta-v1.md

create or replace function public.convert_family_to_solo()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el dueño puede pasar la cuenta a individual.';
  end if;

  -- Los demás miembros vuelven a onboardear. previously_onboarded queda
  -- intacto (true) para el copy de reingreso.
  update public.profiles p
  set onboarding_completed_at = null
  where p.id in (
    select fm.user_id from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id <> v_user_id
  );

  delete from public.push_subscriptions ps
  where ps.family_id = v_family_id and ps.user_id <> v_user_id;

  delete from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id <> v_user_id;

  delete from public.family_invites fi
  where fi.family_id = v_family_id and fi.consumed_at is null;

  update public.families set kind = 'solo' where id = v_family_id;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.convert_family_to_solo() from public;
grant execute on function public.convert_family_to_solo() to authenticated;
