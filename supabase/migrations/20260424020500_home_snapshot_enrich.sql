-- Patch `home_snapshot()` to return enriched expenses
-- (creator_display_name pre-joined) + numeric coercion for price.
-- Mirrors the client's `enrichExpenses` transform and eliminates the
-- round-trip to profiles that happens today on every expense fetch.

create or replace function public.home_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_code text;
  v_period_month date := date_trunc('month', current_date)::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return jsonb_build_object(
      'profile', (
        select to_jsonb(p) from (
          select id, display_name, created_at, avatar_animal, onboarding_completed_at
          from public.profiles
          where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'family_members', '[]'::jsonb,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'period_month', v_period_month
    );
  end if;

  select f.code into v_family_code
  from public.families f
  where f.id = v_family_id;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles
        where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object(
      'familyId', v_family_id,
      'familyCode', v_family_code
    ),
    'family_finance', (
      select to_jsonb(ff.*) from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fe.id,
          'family_id', fe.family_id,
          'name', fe.name,
          'amount', fe.amount::float8,
          'kind', fe.kind,
          'status', fe.status,
          'frequency', fe.frequency,
          'category_id', fe.category_id,
          'next_due_on', fe.next_due_on,
          'day_of_month', fe.day_of_month,
          'ends_on', fe.ends_on,
          'installments_total', fe.installments_total,
          'installments_paid', fe.installments_paid,
          'remaining_balance', fe.remaining_balance::float8,
          'lender_name', fe.lender_name,
          'notes', fe.notes,
          'notify_days_before', fe.notify_days_before,
          'last_paid_at', fe.last_paid_at,
          'created_at', fe.created_at,
          'updated_at', fe.updated_at
        )
        order by fe.status asc, fe.next_due_on asc nulls last, fe.created_at asc
      )
      from public.fixed_expenses fe
      where fe.family_id = v_family_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'family_id', e.family_id,
          'category_id', e.category_id,
          'commitment_id', e.commitment_id,
          'description', e.description,
          'price', e.price::float8,
          'created_by', e.created_by,
          'created_at', e.created_at,
          'creator_display_name', coalesce(p.display_name, 'Sin nombre')
        )
        order by e.created_at desc
      )
      from public.expenses e
      left join public.profiles p on p.id = e.created_by
      where e.family_id = v_family_id
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'family_id', c.family_id,
          'name', c.name,
          'color', c.color,
          'template_id', c.template_id,
          'scope', c.scope,
          'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'family_id', c.family_id,
          'name', c.name,
          'color', c.color,
          'template_id', c.template_id,
          'scope', c.scope,
          'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', coalesce((
      select count(*)::int
      from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ), 0),
    'family_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', fm.user_id,
          'role', fm.role,
          'blocked_at', fm.blocked_at,
          'display_name', p.display_name,
          'avatar_animal', p.avatar_animal,
          'created_at', fm.created_at
        )
        order by
          case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
          fm.created_at asc
      )
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'savings_goal', (
      select jsonb_build_object(
        'id', sg.id,
        'family_id', sg.family_id,
        'title', sg.title,
        'emoji', sg.emoji,
        'goal_amount', sg.goal_amount::float8,
        'current_amount', sg.current_amount::float8,
        'target_months', sg.target_months,
        'is_active', sg.is_active,
        'created_at', sg.created_at,
        'updated_at', sg.updated_at
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.period_month = v_period_month
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'period_month', v_period_month
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;
