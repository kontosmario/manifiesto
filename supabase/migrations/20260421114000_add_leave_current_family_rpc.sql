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
  v_current_family_code text;
  v_remaining_members integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id, f.code
    into v_current_family_id, v_current_family_code
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = v_user_id
  limit 1;

  if v_current_family_id is null then
    raise exception 'Not currently in a family';
  end if;

  delete from public.push_subscriptions
  where family_id = v_current_family_id
    and user_id = v_user_id;

  delete from public.family_members
  where family_id = v_current_family_id
    and user_id = v_user_id;

  select count(*)
    into v_remaining_members
  from public.family_members
  where family_id = v_current_family_id;

  if coalesce(v_remaining_members, 0) = 0 then
    delete from public.families
    where id = v_current_family_id;
  end if;

  return query select v_current_family_id, v_current_family_code;
end;
$$;

revoke all on function public.leave_current_family() from public;
grant execute on function public.leave_current_family() to authenticated;
