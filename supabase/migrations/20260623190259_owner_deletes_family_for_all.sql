-- Decisión owner (2026-06-23): cuando el DUEÑO "Elimina el hogar", el hogar se
-- borra para TODOS (lo que el copy del sheet ya decía). Antes (desde
-- 20260507000000) el dueño que se iba PROMOVÍA al miembro más antiguo y preservaba
-- el hogar — eso contradecía el copy. Volvemos a la conducta destructiva de
-- 20260426190000 (borrar + marcar a los sobrevivientes), pero conservando el fix
-- de families.code droppeado (20260623130000, sin referencias a f.code) y el
-- predicado canónico role <> 'blocked'.
--
-- Comportamiento:
--  · Dueño (solo o con miembros): borra la familia (cascade: gastos/fijos/metas/
--    finanzas/categorías/miembros). Cada miembro SOBREVIVIENTE queda con
--    onboarding_completed_at=null + family_closed_by_owner_at=now() → re-onboardea
--    con el aviso "tu hogar fue cerrado" (el cliente lo lee en onboarding-screen).
--    El dueño NO recibe esa marca (él lo cerró). Cubre también "Reiniciar mi
--    cuenta" (solo = dueño sin miembros: borra y re-onboardea).
--  · Miembro regular: se va solo él (notifica al hogar si aportaba ingreso).
-- El trigger existente limpia family_closed_by_owner_at al re-onboardear.

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
  v_now timestamptz := now();
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

  select coalesce(p.display_name, 'Un miembro')
    into v_display_name
  from public.profiles p
  where p.id = v_user_id;

  -- ─── Dueño: ELIMINA el hogar para TODOS ──────────────────────────────
  if v_caller_role = 'owner' then
    -- Marcar a los sobrevivientes (canonical role <> 'blocked') para avisarles
    -- que el dueño cerró el hogar y forzar su re-onboarding.
    select count(*) into v_other_active_members
    from public.family_members fm
    where fm.family_id = v_current_family_id
      and fm.user_id <> v_user_id
      and fm.role <> 'blocked';

    if coalesce(v_other_active_members, 0) > 0 then
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

    -- Tear down: las FK on delete cascade limpian expenses, fixed_expenses,
    -- savings_goals, family_finance, categories, monthly_summaries, etc. El
    -- trigger protector de categorías necesita el opt-in del GUC.
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

  -- ─── Miembro regular: se va solo él ──────────────────────────────────
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

  -- Defensivo: si el hogar quedó vacío, lo bajamos.
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

comment on function public.leave_current_family() is
  'Owner deletes the household for EVERYONE (cascade); surviving members get '
  'family_closed_by_owner_at + onboarding reset (decisión owner 2026-06-23). '
  'Regular members just leave. family_code siempre null (columna droppeada).';
