-- ════════════════════════════════════════════════════════════════════
-- SINCRONIZACIÓN repo ← prod (auditoría backend 2026-07-08).
--
-- El detector de drift (md5 de prosrc de las 156 funciones de prod vs
-- la última definición en migraciones locales) encontró 10 funciones
-- cuya versión de PROD no coincide con NINGÚN archivo local de main:
-- fueron aplicadas desde branches cuyos archivos nunca llegaron a main
-- (la misma clase de drift que causó el incidente de categorías de hoy:
-- redefinir desde una base stale de main pisa mejoras vivas de prod).
--
-- En los 10 casos PROD ES MÁS NUEVO (rate limits nuevos, caps por plan,
-- family_closed_by_owner_at, compat post-cutover, dedup de notifs...).
-- Este archivo captura la versión de prod VERBATIM (pg_get_functiondef)
-- como canon del repo. Aplicarla a prod es un NO-OP byte a byte; su
-- valor es que la próxima redefinición parta de la base correcta.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bootstrap_family()
 RETURNS TABLE(family_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_family_id uuid;
  v_new_family_id uuid;
  v_lifetime_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('bootstrap_family', 3, 3600);

  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_existing_family_id is not null then
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  select count(*)
    into v_lifetime_count
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'owner';

  if coalesce(v_lifetime_count, 0) >= 5 then
    raise exception 'family-cap-reached' using errcode = 'P0001';
  end if;

  insert into public.families default values
  returning id into v_new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (v_new_family_id, v_user_id, 'owner')
  on conflict (user_id) do nothing;

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  family_id := v_new_family_id;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_family_invite()
 RETURNS TABLE(code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  select p.deletion_scheduled_at into v_pending_deletion
    from public.profiles p
   where p.id = v_user_id;

  if v_pending_deletion is not null then
    raise exception 'No podés generar invitaciones mientras tu cuenta tenga una baja agendada. Cancelá la baja primero.'
      using errcode = 'P0001';
  end if;

  perform public.check_rate_limit('create_family_invite', 10, 3600);

  select fm.family_id
    into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  -- Solo el dueño invita (audit 2026-06-30). Antes era is_family_member_active.
  if not public.is_family_owner(v_family_id) then
    raise exception 'Solo el dueño del hogar puede invitar miembros.'
      using errcode = '42501';
  end if;

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
$function$
;

CREATE OR REPLACE FUNCTION public.peek_family_invite(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit('peek_family_invite', 10, 60);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
    and fi.revoked_at is null
  limit 1;

  if v_family_id is null then
    raise notice 'peek_family_invite: code not found/revoked (code=%)', upper(btrim(p_code));
    raise exception 'Invalid invite';
  end if;
  if v_invite_consumed_at is not null then
    raise notice 'peek_family_invite: code already used (family=%, consumed_at=%)',
      v_family_id, v_invite_consumed_at;
    raise exception 'Invalid invite';
  end if;
  if v_invite_expires < now() then
    raise notice 'peek_family_invite: code expired (family=%, expires_at=%)',
      v_family_id, v_invite_expires;
    raise exception 'Invalid invite';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', upper(btrim(p_code)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', coalesce(p.display_name, 'Usuario'),
        'avatar_animal', p.avatar_animal,
        'role', coalesce(fm.role, 'member')
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), '[]'::jsonb),
    'member_count', coalesce((
      select count(*)::int
      from public.family_members fm
      where fm.family_id = v_family_id
        and fm.role <> 'blocked'
    ), 0),
    'monthly_income', 0,
    'active_goal_title', null,
    'invite_expires_at', v_invite_expires
  )
  into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_notifications_kind(p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
  v_url text := 'https://xaquigyhylzvuyfslkqq.supabase.co/functions/v1/notifications-orchestrator';
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'orchestrator_service_role_key' limit 1;
  if v_key is null then
    raise notice 'orchestrator service key not in vault; skipping dispatch for kind=%', p_kind;
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('kind', p_kind)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_expense_category_belongs_family()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.category_id is null then
    return new;
  end if;
  if exists (select 1 from public.category_templates t where t.id = new.category_id) then
    return new;
  end if;
  if exists (
    select 1 from public.family_custom_categories fcc
    where fcc.id = new.category_id and fcc.family_id = new.family_id
  ) then
    return new;
  end if;
  raise exception 'Category does not belong to selected family.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.family_entitlement_snapshot()
 RETURNS TABLE(source text, plan text, has_access boolean, days_left integer, trial_days_left integer, expires_at timestamp with time zone, subscription_status text, member_cap integer, member_count integer, pending_product_id text, auto_renew boolean, grace_expires_at timestamp with time zone, is_purchaser boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from (select 1) as one
    left join public.family_entitlements fe on fe.family_id = v_family_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_current_family()
 RETURNS TABLE(family_id uuid, family_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Dueño: ELIMINA el hogar para TODOS
  if v_caller_role = 'owner' then
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

  -- Miembro regular: se va solo él
  delete from public.push_subscriptions
  where push_subscriptions.family_id = v_current_family_id
    and push_subscriptions.user_id = v_user_id;

  delete from public.family_members
  where family_members.family_id = v_current_family_id
    and family_members.user_id = v_user_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.notify_cycle_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member record; v_severity text; v_title text; v_body text;
  v_top_cat text; v_top_cat_amt numeric; v_sobrante numeric;
begin
  if coalesce(new.total_variable_spent, 0) <= 0 and coalesce(new.total_spent, 0) <= 0 then return new; end if;
  v_sobrante := coalesce(new.monthly_income, 0) + coalesce(new.extra_income, 0)
    - coalesce(new.total_spent, 0) - coalesce(new.savings_goal_amount, 0);
  v_severity := case when new.mood = 'red' then 'warning' when new.mood = 'yellow' then 'info'
    when new.mood = 'green' then 'success' else 'info' end;
  if new.category_breakdown is not null then
    select e.value->>'name', (e.value->>'total')::numeric into v_top_cat, v_top_cat_amt
    from jsonb_array_elements(new.category_breakdown) as e(value)
    order by (e.value->>'total')::numeric desc nulls last limit 1;
  end if;
  v_title := 'Cerró ' || coalesce(new.period_label, to_char(new.period_start, 'TMMonth YYYY'));
  v_body := case
    when v_sobrante > 0 then 'Te sobró $' || to_char(round(v_sobrante), 'FM999G999G999') || coalesce(' · ' || v_top_cat || ' fue tu top', '')
    when v_sobrante < 0 then 'Te pasaste $' || to_char(round(abs(v_sobrante)), 'FM999G999G999') || ' del plan' || coalesce(' · ' || v_top_cat || ' pesó más', '')
    else coalesce(v_top_cat || ' fue tu top', 'Cerró el ciclo.')
  end;
  for v_member in select fm.user_id from public.family_members fm where fm.family_id = new.family_id and fm.role <> 'blocked' loop
    if not exists (select 1 from public.notifications n where n.family_id = new.family_id and n.user_id = v_member.user_id
        and n.kind = 'cycle_closed' and n.metadata->>'period_start' = new.period_start::text) then
      perform public.emit_notification(new.family_id, v_member.user_id, v_title, v_body, 'cycle_closed', v_severity, null,
        jsonb_build_object('period_start', new.period_start, 'period_end', new.period_end, 'period_label', new.period_label,
          'mood', new.mood, 'sobrante', round(v_sobrante), 'total_variable_spent', new.total_variable_spent,
          'top_category_name', v_top_cat, 'top_category_amount', v_top_cat_amt, 'route', '/(app)/(tabs)/control'));
    end if;
  end loop;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.recompute_family_income()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_family_id uuid;
  v_total numeric(12,2);
begin
  if tg_op = 'DELETE' then
    v_family_id := old.family_id;
  else
    v_family_id := new.family_id;
  end if;

  select coalesce(sum(fm.monthly_income_contribution), 0)
    into v_total
  from public.family_members fm
  where fm.family_id = v_family_id
    and coalesce(fm.role, '') <> 'blocked';

  insert into public.family_finance (family_id, monthly_income)
  values (v_family_id, v_total)
  on conflict (family_id) do update
    set monthly_income = excluded.monthly_income;

  if tg_op = 'UPDATE' and old.family_id is distinct from new.family_id then
    select coalesce(sum(fm.monthly_income_contribution), 0)
      into v_total
    from public.family_members fm
    where fm.family_id = old.family_id
      and coalesce(fm.role, '') <> 'blocked';
    update public.family_finance
    set monthly_income = v_total
    where family_finance.family_id = old.family_id;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_family_finance_on_salary_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- family_finance recién creado (primer confirm en onboarding, o tras abandonar
  -- familia y re-onboardear) no tiene ciclo previo: nunca cerramos en INSERT.
  if TG_OP = 'INSERT' then
    return NEW;
  elsif TG_OP = 'UPDATE' then
    -- Cerrar el ciclo previo solo cuando el confirm avanzó Y la familia ya estaba
    -- anclada (OLD.current_cycle_anchor not null). Sin ese guard, el primer
    -- "Ya cobré" en Home cerraría un ciclo sintético que la cuenta nunca vivió.
    if NEW.last_salary_confirmed_at is distinct from OLD.last_salary_confirmed_at
       and NEW.last_salary_confirmed_at is not null
       and (OLD.last_salary_confirmed_at is null
            or NEW.last_salary_confirmed_at > OLD.last_salary_confirmed_at)
       and OLD.current_cycle_anchor is not null then
      perform public.try_close_previous_cycle(NEW.family_id);
    end if;
  end if;
  return NEW;
end;
$function$
;
