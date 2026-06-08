-- supabase/migrations/20260605140000_month_close_v2_summary_ref.sql
--
-- Spec B V2: reescribe el modelo de decisión sobre saldo a favor para
-- apoyarse en `monthly_summaries` (existing rollup machinery) en vez
-- de un string `month_iso` cliente-side.
--
-- Cambios:
--   1. month_close_decisions: drop month_iso, add monthly_summary_id
--      como FK a monthly_summaries(id), unique
--   2. apply_month_close_decision RPC: cambia signature
--      (p_month_iso text → p_monthly_summary_id uuid)
--   3. La RPC ahora deriva el family_id desde el summary (defensive)
--      y valida que el summary pertenece a una familia del user
--
-- V1 commits previos sobre este mismo branch siguen presentes; este
-- migration sobrescribe schema y RPC. Tabla está vacía al momento
-- (test pollution borrado).

-- 1. Drop V1 column + constraint
alter table public.month_close_decisions
  drop constraint if exists month_close_decisions_family_id_month_iso_key;
alter table public.month_close_decisions
  drop column if exists month_iso;

-- 2. Add monthly_summary_id (NOT NULL because rebuild from scratch)
alter table public.month_close_decisions
  add column monthly_summary_id uuid not null
    references public.monthly_summaries(id) on delete cascade;

alter table public.month_close_decisions
  add constraint month_close_decisions_summary_unique unique(monthly_summary_id);

-- 3. Drop V1 RPC signature
drop function if exists public.apply_month_close_decision(
  uuid, text, numeric, text, uuid, text
);

-- 4. Recreate RPC with V2 signature
create or replace function public.apply_month_close_decision(
  p_monthly_summary_id uuid,
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
  v_summary record;
  v_sobrante numeric;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  -- Derivar family_id + sobrante directamente del summary canónico
  select id, family_id, monthly_income, total_spent, savings_delta
    into v_summary
    from public.monthly_summaries
   where id = p_monthly_summary_id;

  if not found then
    raise exception 'monthly_summary not found';
  end if;

  if not exists (
    select 1 from public.family_members
    where family_id = v_summary.family_id
      and user_id = v_user_id
      and role <> 'blocked'
  ) then
    raise exception 'Not a family member';
  end if;

  if p_decision not in ('meta', 'acumular', 'reserva', 'skip') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'meta' and p_meta_goal_id is null then
    raise exception 'meta decision requires meta_goal_id';
  end if;

  -- Sobrante canónico: ingreso del periodo menos lo gastado menos lo
  -- aportado al goal. Clamp a >= 0 (CHECK constraint).
  v_sobrante := greatest(
    0,
    coalesce(v_summary.monthly_income, 0)
      - coalesce(v_summary.total_spent, 0)
      - coalesce(v_summary.savings_delta, 0)
  );

  -- Atomicidad: unique constraint sobre monthly_summary_id previene
  -- doble-apply.
  insert into public.month_close_decisions (
    family_id, monthly_summary_id, sobrante, decision, meta_goal_id, decided_by
  ) values (
    v_summary.family_id, p_monthly_summary_id, v_sobrante,
    p_decision, p_meta_goal_id, v_user_id
  );

  if p_decision = 'meta' then
    update public.savings_goals
       set current_amount = current_amount + v_sobrante,
           updated_at = now()
     where id = p_meta_goal_id and family_id = v_summary.family_id;
  elsif p_decision = 'acumular' then
    if p_new_cycle_anchor is null then
      raise exception 'acumular decision requires new_cycle_anchor';
    end if;
    update public.family_finance
       set current_cycle_starting_balance =
             coalesce(current_cycle_starting_balance, 0) + v_sobrante,
           current_cycle_anchor = p_new_cycle_anchor::date,
           updated_at = now()
     where family_id = v_summary.family_id;
  elsif p_decision = 'reserva' then
    update public.family_finance
       set monthly_reserve_amount = monthly_reserve_amount + v_sobrante,
           updated_at = now()
     where family_id = v_summary.family_id;
  end if;
end;
$$;

revoke all on function public.apply_month_close_decision(uuid, text, uuid, text) from public;
grant execute on function public.apply_month_close_decision(uuid, text, uuid, text) to authenticated;
