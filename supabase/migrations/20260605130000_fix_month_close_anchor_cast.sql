-- supabase/migrations/20260605130000_fix_month_close_anchor_cast.sql
--
-- Fix: en apply_month_close_decision el assignment a
-- current_cycle_anchor (column tipo date) recibía un text sin cast
-- explícito y plpgsql no auto-castea en UPDATE. Agregamos ::date.
-- Bug detectado por tests/integration/month-close-decision-flow.test.ts.

create or replace function public.apply_month_close_decision(
  p_family_id uuid,
  p_month_iso text,
  p_sobrante numeric,
  p_decision text,
  p_meta_goal_id uuid default null,
  p_new_cycle_anchor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = p_family_id and user_id = v_user_id and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  insert into public.month_close_decisions (
    family_id, month_iso, sobrante, decision, meta_goal_id, decided_by
  ) values (
    p_family_id, p_month_iso, p_sobrante, p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + p_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = p_family_id;
  elsif p_decision = 'acumular' then
    if p_new_cycle_anchor is null then
      raise exception 'acumular decision requires new_cycle_anchor';
    end if;
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, 0) + p_sobrante,
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = p_family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = monthly_reserve_amount + p_sobrante,
           updated_at = now()
     where family_id = p_family_id;
  end if;
end;
$$;
