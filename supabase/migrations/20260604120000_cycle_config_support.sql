-- supabase/migrations/20260604120000_cycle_config_support.sql
--
-- Cycle config support: 4 tipos de ciclo (monthly/biweekly/weekly/custom).
-- Default 'monthly' preserva el comportamiento previo para todas las
-- familias existentes. Helper `compute_pay_cycle` centraliza la lógica
-- — usado por home_snapshot, try_close_previous_cycle, y cualquier RPC
-- futura.
--
-- Spec: docs/superpowers/specs/2026-06-04-cycle-configurable-design.md

alter table public.family_finance
  add column if not exists cycle_type text not null default 'monthly'
    check (cycle_type in ('monthly','biweekly','weekly','custom')),
  add column if not exists cycle_anchor_date date null,
  add column if not exists cycle_length_days smallint null
    check (cycle_length_days is null or cycle_length_days between 1 and 365);

alter table public.family_finance
  drop constraint if exists family_finance_cycle_config_valid;
alter table public.family_finance
  add constraint family_finance_cycle_config_valid check (
    (cycle_type = 'monthly'
        and cycle_anchor_date is null
        and cycle_length_days is null)
    or
    (cycle_type in ('biweekly','weekly','custom')
        and cycle_anchor_date is not null
        and cycle_length_days is not null
        and ((cycle_type = 'biweekly' and cycle_length_days = 14)
          or (cycle_type = 'weekly'   and cycle_length_days = 7)
          or (cycle_type = 'custom')))
  );

create or replace function public.compute_pay_cycle(
  p_today date,
  p_cycle_type text,
  p_salary_payment_day smallint,
  p_cycle_anchor_date date,
  p_cycle_length_days smallint
) returns table (cycle_start date, cycle_end_exclusive date, cycle_days int)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_day int;
  v_month_last_day int;
  v_diff_days int;
  v_period_index int;
begin
  if p_cycle_type = 'monthly' then
    v_day := coalesce(p_salary_payment_day::int, 1);
    if extract(day from p_today)::int >= v_day then
      v_month_last_day := extract(day from
        (date_trunc('month', p_today) + interval '1 month' - interval '1 day')
      )::int;
      cycle_start := make_date(
        extract(year from p_today)::int,
        extract(month from p_today)::int,
        least(v_day, v_month_last_day)
      );
    else
      v_month_last_day := extract(day from
        (date_trunc('month', p_today) - interval '1 day')
      )::int;
      cycle_start := make_date(
        extract(year from (p_today - interval '1 month'))::int,
        extract(month from (p_today - interval '1 month'))::int,
        least(v_day, v_month_last_day)
      );
    end if;
    cycle_end_exclusive := (cycle_start + interval '1 month')::date;
    cycle_days := (cycle_end_exclusive - cycle_start)::int;
  else
    v_diff_days := (p_today - p_cycle_anchor_date)::int;
    v_period_index := floor(v_diff_days::numeric / p_cycle_length_days)::int;
    cycle_start := p_cycle_anchor_date + (v_period_index * p_cycle_length_days);
    cycle_end_exclusive := cycle_start + p_cycle_length_days;
    cycle_days := p_cycle_length_days;
  end if;
  return next;
end;
$$;

comment on function public.compute_pay_cycle is
  'Computes pay-cycle window for any cycle_type. Returns [start, end_exclusive). cycle_days = end - start. Used by home_snapshot + try_close_previous_cycle to share logic with mobile/utils/pay-cycle.ts.';
