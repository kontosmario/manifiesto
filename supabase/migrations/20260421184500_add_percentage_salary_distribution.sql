do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'savings_goal_percent'
  ) then
    alter table public.family_finance
      add column savings_goal_percent smallint not null default 20;
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'essential_monthly_cost'
  ) then
    alter table public.family_finance
      add column essential_monthly_cost numeric(12,2) not null default 0;
  end if;
exception
  when duplicate_column then null;
end;
$$;

update public.family_finance
set savings_goal_percent = case
      when monthly_income > 0 and savings_goal > 0
        then least(50, greatest(0, round((savings_goal / monthly_income) * 100)))
      when monthly_income > 0 and savings_goal = 0
        then 0
      else coalesce(savings_goal_percent, 20)
    end
where savings_goal_percent is null
   or savings_goal_percent < 0
   or savings_goal_percent > 50
   or (
     monthly_income > 0
     and savings_goal >= 0
   );

update public.family_finance
set essential_monthly_cost = 0
where essential_monthly_cost is null
   or essential_monthly_cost < 0;

update public.family_finance
set savings_goal = round((monthly_income * savings_goal_percent / 100.0)::numeric, 2)
where monthly_income >= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.family_finance'::regclass
      and conname = 'family_finance_savings_goal_percent_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_savings_goal_percent_check
      check (savings_goal_percent between 0 and 50);
  end if;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.family_finance'::regclass
      and conname = 'family_finance_essential_monthly_cost_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_essential_monthly_cost_check
      check (essential_monthly_cost >= 0);
  end if;
exception
  when duplicate_object then null;
end;
$$;
