-- The earlier notifications migration created the new
-- trg_expense_notification trigger but didn't drop the legacy
-- trg_expenses_notify_insert, so every expense insert fires two
-- notifications (one with kind='expense' from the old function, one
-- with kind='expense_logged' from the new). Drop the legacy pair.

drop trigger if exists trg_expenses_notify_insert on public.expenses;
drop function if exists public.notify_expense_insert();
