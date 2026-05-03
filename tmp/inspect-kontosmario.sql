-- Diagnóstico kontosmario@gmail.com — output como SELECT para CLI.
select
  u.id                                  as user_id,
  u.email                               as email,
  p.display_name                        as display_name,
  p.onboarding_completed_at             as onboarding_completed_at,
  p.previously_onboarded                as previously_onboarded,
  p.family_closed_by_owner_at           as family_closed_by_owner_at,
  fm.family_id                          as family_id,
  f.code                                as family_code,
  fm.role                               as role,
  fm.monthly_income_contribution        as monthly_income_contribution,
  fm.created_at                         as family_membership_created_at,
  ff.monthly_income                     as family_total_monthly_income,
  (
    select count(*) from public.family_members fm2
    where fm.family_id is not null
      and fm2.family_id = fm.family_id
  )                                     as family_member_count
from auth.users u
left join public.profiles p
  on p.id = u.id
left join public.family_members fm
  on fm.user_id = u.id
left join public.families f
  on f.id = fm.family_id
left join public.family_finance ff
  on ff.family_id = fm.family_id
where lower(u.email) = lower('kontosmario@gmail.com');
