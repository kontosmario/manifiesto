-- supabase/migrations/20260605120000_month_close_decision.sql
--
-- Spec B: cuando un mes cierra con sobrante, persistir la decisión del user.
-- Tabla month_close_decisions + columna monthly_reserve_amount + RPC atómico.

alter table public.family_finance
  add column if not exists monthly_reserve_amount numeric(12,2) not null default 0
    check (monthly_reserve_amount >= 0);

create table if not exists public.month_close_decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  month_iso text not null check (month_iso ~ '^\d{4}-\d{2}-\d{2}$'),
  sobrante numeric(12,2) not null check (sobrante >= 0),
  decision text not null check (decision in ('meta', 'acumular', 'reserva', 'skip')),
  meta_goal_id uuid null references public.savings_goals(id) on delete set null,
  decided_at timestamptz not null default now(),
  decided_by uuid not null references auth.users(id),
  unique(family_id, month_iso)
);

alter table public.month_close_decisions enable row level security;

drop policy if exists "month_close_decisions read" on public.month_close_decisions;
create policy "month_close_decisions read"
  on public.month_close_decisions for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.family_id = month_close_decisions.family_id
        and fm.user_id = auth.uid()
        and fm.role <> 'blocked'
    )
  );

drop policy if exists "month_close_decisions insert via rpc" on public.month_close_decisions;
-- INSERTs solo via RPC (security definer). RLS bloquea writes directos
-- desde el cliente para garantizar atomicidad con savings_goals etc.
create policy "month_close_decisions insert via rpc"
  on public.month_close_decisions for insert
  with check (false);

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

  -- Atomicidad: la insertion en month_close_decisions es el lock.
  -- Si ya existe la unique constraint salta — no double-apply.
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
           current_cycle_anchor = p_new_cycle_anchor,
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

revoke all on function public.apply_month_close_decision(uuid, text, numeric, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, numeric, text, uuid, text) to authenticated;
