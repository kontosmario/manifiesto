do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_finance'
      and column_name = 'daily_budget_buffer_mode'
  ) then
    alter table public.family_finance
      add column daily_budget_buffer_mode text not null default 'none';
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
      and column_name = 'daily_budget_buffer_value'
  ) then
    alter table public.family_finance
      add column daily_budget_buffer_value numeric(12,2) not null default 0;
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
      and column_name = 'daily_budget_nudges_enabled'
  ) then
    alter table public.family_finance
      add column daily_budget_nudges_enabled boolean not null default true;
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
      and column_name = 'daily_budget_checkin_hour'
  ) then
    alter table public.family_finance
      add column daily_budget_checkin_hour smallint not null default 9;
  end if;
exception
  when duplicate_column then null;
end;
$$;

do $$
begin
  update public.family_finance
  set daily_budget_buffer_mode = 'none'
  where daily_budget_buffer_mode is null
     or daily_budget_buffer_mode not in ('none', 'fixed', 'percent');
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  update public.family_finance
  set daily_budget_buffer_value = 0
  where daily_budget_buffer_value is null
     or daily_budget_buffer_value < 0;
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  update public.family_finance
  set daily_budget_nudges_enabled = true
  where daily_budget_nudges_enabled is null;
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  update public.family_finance
  set daily_budget_checkin_hour = 9
  where daily_budget_checkin_hour is null
     or daily_budget_checkin_hour < 0
     or daily_budget_checkin_hour > 23;
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.family_finance'::regclass
      and conname = 'family_finance_daily_budget_buffer_mode_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_daily_budget_buffer_mode_check
      check (daily_budget_buffer_mode in ('none', 'fixed', 'percent'));
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
      and conname = 'family_finance_daily_budget_buffer_value_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_daily_budget_buffer_value_check
      check (daily_budget_buffer_value >= 0);
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
      and conname = 'family_finance_daily_budget_checkin_hour_check'
  ) then
    alter table public.family_finance
      add constraint family_finance_daily_budget_checkin_hour_check
      check (daily_budget_checkin_hour between 0 and 23);
  end if;
exception
  when duplicate_object then null;
end;
$$;
