-- `peek_family_by_code(p_code)` — preview a family without joining.
--
-- The onboarding wizard's joiner flow needs to show the family
-- summary (members, monthly_income, cycle stats, active goal)
-- BEFORE the user commits to joining. Until now we called
-- `join_family_by_code` in step 3, which actually inserted the
-- membership — meaning the user was committed before they even
-- saw the preview. The right shape is:
--
--   step 3 — peek_family_by_code → validate + preview, no insert.
--   step 5 — join_family_by_code → actually create the membership.
--
-- This RPC is `security definer` so authenticated users can read a
-- read-only summary of a family they're not yet a member of (RLS
-- on the underlying tables would block direct reads). The body
-- exposes only what the joiner needs to make an informed
-- "Confirmar y unirme" decision — no expense detail, no member
-- emails, no per-row financial entries.

create or replace function public.peek_family_by_code(p_code text)
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
  v_today date := current_date;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select f.id, f.code
    into v_family_id, v_family_code
  from public.families f
  where f.code = upper(btrim(p_code))
  limit 1;

  if v_family_id is null then
    raise exception 'Family code not found';
  end if;

  select jsonb_build_object(
    'family_id', v_family_id,
    'family_code', v_family_code,
    -- Total monthly income cached on family_finance (kept in sync
    -- by the recompute trigger from 20260506000000).
    'monthly_income', coalesce((
      select ff.monthly_income
      from public.family_finance ff
      where ff.family_id = v_family_id
    ), 0),
    -- Member roster: name, avatar slug, contribution. Ordered by
    -- created_at asc so the original creator appears first.
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', fm.user_id,
        'display_name', coalesce(p.display_name, ''),
        'avatar_animal', p.avatar_animal,
        'monthly_income_contribution',
          coalesce(fm.monthly_income_contribution, 0),
        'role', coalesce(fm.role, 'member'),
        'is_blocked', fm.blocked_at is not null
      ) order by fm.created_at asc)
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    -- Variable spend so far this calendar month (cycle stats are
    -- enough for a preview — full pay-cycle math lives in the home
    -- screen).
    'cycle_variable_spent', coalesce((
      select sum(e.price)::numeric(12,2)
      from public.expenses e
      where e.family_id = v_family_id
        and e.commitment_id is null
        and e.created_at::date >= v_period_start
        and e.created_at::date <= v_period_end
    ), 0),
    'active_fixed_count', coalesce((
      select count(*)::int
      from public.fixed_expenses fe
      where fe.family_id = v_family_id
        and fe.status = 'active'
    ), 0),
    -- Active savings goal preview: title + progress.
    'active_goal', (
      select jsonb_build_object(
        'title', sg.title,
        'goal_amount', sg.goal_amount,
        'current_amount', sg.current_amount
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id
        and sg.is_active = true
      order by sg.created_at desc
      limit 1
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.peek_family_by_code(text) from public;
grant execute on function public.peek_family_by_code(text) to authenticated;
