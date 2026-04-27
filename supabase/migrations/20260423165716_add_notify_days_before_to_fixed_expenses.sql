-- AddFijoV2Screen exposes a reminder toggle ("2 días antes" / "Sin
-- aviso"). Persist the choice so the commitment carries the user's
-- preference across devices. We store the lead-time in days (null =
-- no reminder, 2 = "2 días antes"). Using smallint leaves room for
-- future custom windows without another migration.

alter table public.fixed_expenses
  add column if not exists notify_days_before smallint null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fixed_expenses'::regclass
      and conname = 'fixed_expenses_notify_days_before_check'
  ) then
    alter table public.fixed_expenses
      add constraint fixed_expenses_notify_days_before_check
      check (notify_days_before is null or notify_days_before between 0 and 30);
  end if;
exception
  when duplicate_object then null;
end;
$$;
