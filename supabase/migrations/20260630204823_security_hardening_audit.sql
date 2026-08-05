-- Security hardening — auditoría end-to-end de Supabase (2026-06-30).
--
-- Cierra los hallazgos de la auditoría (6 dimensiones + verificación adversarial):
--   HIGH   1. _migration_category_id_backup: RLS off + anon/auth RW → DROP.
--   HIGH   2. account_deletions_due: view DEFINER legible por anon (enumera UUIDs
--             de cuentas en baja) → security_invoker + revoke.
--   HIGH   3. peek_family_invite: filtraba monthly_income + active_goal_title de la
--             familia a cualquier portador de un código → se remueven.
--   MEDIUM 4. family_finance DELETE lo podía hacer cualquier miembro → owner-only.
--   MEDIUM 5. is_fixed_expense_family_member no excluía 'blocked' → se agrega.
--   LOW    6. record_subscription_usage / mark_cycle_wrapped_seen no excluían
--             'blocked' → se agrega.
--   LOW    7. revoked_at no se chequeaba en peek/consume_family_invite → se agrega.
--   LOW    8. Funciones SECURITY DEFINER internas (triggers + rate-limit + admin +
--             is_super_admin) world-ejecutables → revoke execute.
--   LOW    9. Grants DML sueltos en subscription_events / family_entitlements /
--             views read-only → revoke (RLS ya protegía; defensa en profundidad).
-- NO se revocan is_family_member / is_family_owner / is_family_member_active /
-- is_fixed_expense_family_member de authenticated: son load-bearing para la
-- evaluación de RLS y no filtran nada (solo responden sobre el propio caller).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP backup table (RLS disabled + anon/authenticated full DML).
drop table if exists public._migration_category_id_backup;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. account_deletions_due → invoker + sin acceso de roles cliente (solo el cron
--    de borrado, que corre como service_role/definer, la necesita).
alter view public.account_deletions_due set (security_invoker = on);
revoke all on public.account_deletions_due from anon, authenticated;

-- 3. Views read-only: quitar grants de escritura inertes (mantener SELECT).
revoke insert, update, delete, truncate, references, trigger
  on public.categories, public.advisor_value_summary
  from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. peek_family_invite: NO exponer datos financieros de la familia en el preview
--    pre-unión. Antes filtraba monthly_income + active_goal_title a cualquier
--    portador de un código (no-miembro). Se removieron; solo nombres + conteo.
--    Además se respeta revoked_at.
create or replace function public.peek_family_invite(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Seguridad (audit 2026-06-30): el peek pre-unión NO expone datos financieros
  -- de la familia. Antes filtraba el monthly_income real + el título de la meta
  -- activa a CUALQUIER portador de un código (no-miembro). Ahora monthly_income
  -- va 0 y active_goal_title null (placeholders constantes, NO el dato real) para
  -- que el build viejo no muestre $NaN; el cliente nuevo deja de renderizarlos.
  -- Solo se devuelve lo necesario para confirmar la unión: nombres + conteo.
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
$function$;

-- 5. consume_family_invite: respetar revoked_at en el lookup (idéntica salvo eso).
create or replace function public.consume_family_invite(p_code text, p_contribution numeric DEFAULT NULL::numeric)
 returns TABLE(family_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_expires timestamptz;
  v_invite_consumed_at timestamptz;
  v_existing_family_id uuid;
  v_contribution numeric(12,2);
  v_blocked_family_id uuid;
  v_owner_user_id uuid;
  v_owner_deletion_scheduled_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id
    into v_existing_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_existing_family_id is not null then
    perform public.enforce_rate_limit('consume_family_invite_noop', 30, 60);
    family_id := v_existing_family_id;
    return next;
    return;
  end if;

  perform public.enforce_rate_limit('consume_family_invite', 5, 60);
  perform public.check_rate_limit('consume_family_invite', 3, 86400);

  select fi.family_id, fi.expires_at, fi.consumed_at
    into v_family_id, v_invite_expires, v_invite_consumed_at
  from public.family_invites fi
  where fi.code = upper(btrim(p_code))
    and fi.revoked_at is null
  for update;

  if v_family_id is null then
    raise notice 'consume_family_invite: code not found/revoked (code=%)', upper(btrim(p_code));
    raise exception 'Invalid invite';
  end if;
  if v_invite_consumed_at is not null then
    raise notice 'consume_family_invite: code already used (family=%, consumed_at=%)',
      v_family_id, v_invite_consumed_at;
    raise exception 'Invalid invite';
  end if;
  if v_invite_expires < now() then
    raise notice 'consume_family_invite: code expired (family=%, expires_at=%)',
      v_family_id, v_invite_expires;
    raise exception 'Invalid invite';
  end if;

  select fm.user_id
    into v_owner_user_id
  from public.family_members fm
  where fm.family_id = v_family_id
    and fm.role = 'owner'
  limit 1;

  if v_owner_user_id is not null then
    select p.deletion_scheduled_at
      into v_owner_deletion_scheduled_at
    from public.profiles p
    where p.id = v_owner_user_id
    for update;

    if v_owner_deletion_scheduled_at is not null then
      raise notice 'consume_family_invite: family owner pending deletion (family=%)', v_family_id;
      raise exception 'Invalid invite';
    end if;
  end if;

  v_contribution := greatest(coalesce(p_contribution, 0), 0);

  select fm.family_id
    into v_blocked_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role = 'blocked'
  limit 1;

  delete from public.family_members
  where user_id = v_user_id
    and role = 'blocked';

  insert into public.family_members(
    family_id, user_id, role, monthly_income_contribution
  )
  values (
    v_family_id, v_user_id, 'member', v_contribution
  )
  on conflict (user_id) do update
    set monthly_income_contribution = excluded.monthly_income_contribution;

  update public.family_invites
  set consumed_by = v_user_id,
      consumed_at = now()
  where family_invites.code = upper(btrim(p_code));

  update public.profiles
  set family_closed_by_owner_at = null
  where profiles.id = v_user_id
    and family_closed_by_owner_at is not null;

  if v_blocked_family_id is not null then
    insert into public.audit_log (user_id, family_id, action, target_table, target_id, payload)
    values (
      v_user_id,
      v_family_id,
      'consume_family_invite_unblock',
      'family_members',
      v_user_id,
      jsonb_build_object(
        'prev_family_id', v_blocked_family_id,
        'new_family_id', v_family_id,
        'invite_code', upper(btrim(p_code))
      )
    );
  end if;

  family_id := v_family_id;
  return next;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. family_finance DELETE: owner-only (coherente con INSERT/UPDATE).
alter policy family_finance_delete_members on public.family_finance
  using (is_family_owner(family_id));

-- 7. is_fixed_expense_family_member: excluir miembros 'blocked' (gatea las 4
--    policies de fixed_expense_payments + auditoría).
create or replace function public.is_fixed_expense_family_member(fe_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.fixed_expenses fe
    join public.family_members fm on fm.family_id = fe.family_id
    where fe.id = fe_id
      and fm.user_id = auth.uid()
      and fm.role <> 'blocked'
  );
$function$;

-- 8. record_subscription_usage: excluir 'blocked' en el check de membresía.
create or replace function public.record_subscription_usage(p_fixed_expense_id uuid, p_level text, p_period text)
 returns fixed_expense_usage_audit
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_period is null or btrim(p_period) = '' then raise exception 'Period required' using errcode = '22023'; end if;
  select family_id into v_family_id from public.fixed_expenses where id = p_fixed_expense_id;
  if v_family_id is null then raise exception 'Fixed expense not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.family_members fm where fm.family_id = v_family_id and fm.user_id = v_user_id and fm.role <> 'blocked')
    then raise exception 'Not a member of this family' using errcode = '42501'; end if;
  if p_level not in ('mucho','a_veces','casi_nunca') then raise exception 'Invalid level' using errcode = '22023'; end if;
  insert into public.fixed_expense_usage_audit (fixed_expense_id, family_id, user_id, period, level)
  values (p_fixed_expense_id, v_family_id, v_user_id, p_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update set level = excluded.level, updated_at = now()
  returning * into v_row;
  return v_row;
end; $function$;

-- 9. mark_cycle_wrapped_seen: excluir 'blocked' en el check de membresía.
create or replace function public.mark_cycle_wrapped_seen(p_summary_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id into v_family_id
  from public.monthly_summaries
  where id = p_summary_id;

  if v_family_id is null then
    raise exception 'Summary not found';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_family_id
      and fm.user_id = v_user_id
      and fm.role <> 'blocked'
  ) then
    raise exception 'Not a member of this family';
  end if;

  update public.monthly_summaries
  set wrapped_seen_at = coalesce(wrapped_seen_at, now())
  where id = p_summary_id;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Revocar EXECUTE de roles cliente en funciones SECURITY DEFINER internas
--     (triggers, rate-limit, is_super_admin). Disparan vía trigger (owner) o se
--     llaman dentro de otros definer (contexto owner); el cliente NUNCA las llama.
--     Revocar también de PUBLIC (ver [[feedback_revoke_execute_public_not_just_roles]]).
revoke execute on function
  public.tr_award_first_cycle_under_budget(),
  public.tr_award_first_expense(),
  public.tr_award_first_fixed(),
  public.tr_award_first_goal(),
  public.tr_award_first_paid_fixed(),
  public.tr_award_goal_completed(),
  public.tr_award_goal_milestones(),
  public.tr_award_streak_milestones(),
  public.tr_award_streak_milestones_initial(),
  public.no_spend_marked_award_trigger(),
  public.expenses_trigger_advance_streak(),
  public.guard_expense_not_in_closed_month(),
  public.rate_limit_expense_inserts(),
  public.trg_family_finance_on_salary_confirm(),
  public.trg_fixed_expenses_price_history(),
  public.handle_new_user_profile(),
  public.handle_onboarding_completion(),
  public.notify_cycle_closed(),
  public.recompute_family_income(),
  public.seed_family_entitlement(),
  public.audit_service_role_write(),
  public.enforce_rate_limit(text, integer, integer),
  public.check_rate_limit(text, integer, integer),
  public.is_super_admin()
from anon, authenticated, public;

-- 11. Admin RPCs: el cliente (super-admin UI) las llama como authenticated; el
--     gate is_super_admin() interno restringe al owner. Quitar solo anon/PUBLIC.
revoke execute on function
  public.admin_search_users(text),
  public.admin_set_mvp(uuid, boolean)
from anon, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Grants DML sueltos en tablas protegidas por RLS-deny-all (defensa en
--     profundidad; el cliente nunca escribe estas tablas directo).
revoke all on public.subscription_events from anon, authenticated;
revoke insert, update, delete, truncate
  on public.family_entitlements
  from anon, authenticated;
