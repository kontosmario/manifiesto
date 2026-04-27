-- Atomic helper to bump a savings goal's current_amount. Lets the
-- mobile app surface a "+ Agregar ahorro" action without doing a
-- read-modify-write round trip from the client (which could lose
-- contributions when two devices fire near-simultaneously).
--
-- The RPC is restricted to family members of the goal's family. The
-- amount must be positive — withdrawals belong in a future "ajustar
-- ahorro" flow with its own confirmation copy, not in this happy-path
-- shortcut.

create or replace function public.add_savings_contribution(
  p_goal_id uuid,
  p_amount numeric
)
returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.savings_goals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte debe ser mayor a cero';
  end if;

  select * into v_goal from public.savings_goals where id = p_goal_id;
  if not found then
    raise exception 'Meta no encontrada';
  end if;
  if not public.is_family_member(v_goal.family_id) then
    raise exception 'No sos miembro de esta familia';
  end if;

  update public.savings_goals
  set current_amount = current_amount + p_amount,
      updated_at = now()
  where id = p_goal_id
  returning * into v_goal;

  return v_goal;
end;
$$;

revoke all on function public.add_savings_contribution(uuid, numeric) from public;
grant execute on function public.add_savings_contribution(uuid, numeric) to authenticated;
