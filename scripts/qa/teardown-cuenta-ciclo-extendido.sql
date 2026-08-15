-- Borra por completo la cuenta de prueba del ciclo extendido (PROD).
-- Correr entero. El delete de auth.users cascadea a profiles.
do $$
declare
  v_family uuid := '0e5f3c7a-11e0-4a6d-9b3c-2f0a7d5e8c41';
  v_user   uuid := '7b2d9f10-3c48-4e5a-8d61-9a0e4c7b2f83';
begin
  delete from public.fixed_expense_payments
   where fixed_expense_id in (select id from public.fixed_expenses where family_id = v_family);
  delete from public.fixed_expense_price_history
   where fixed_expense_id in (select id from public.fixed_expenses where family_id = v_family);
  delete from public.month_close_decisions   where family_id = v_family;
  delete from public.monthly_summaries       where family_id = v_family;
  delete from public.expenses                where family_id = v_family;
  delete from public.fixed_expenses          where family_id = v_family;
  delete from public.savings_goals           where family_id = v_family;
  delete from public.income_events           where family_id = v_family;
  delete from public.notifications           where family_id = v_family;
  delete from public.achievements_earned     where family_id = v_family;
  delete from public.streak_marked_days      where family_id = v_family;
  delete from public.garden_recovered_days   where family_id = v_family;
  delete from public.user_streaks            where family_id = v_family;
  delete from public.family_streaks          where family_id = v_family;
  delete from public.velocity_snapshots      where family_id = v_family;
  delete from public.control_snapshots       where family_id = v_family;
  delete from public.home_telemetry          where family_id = v_family;
  delete from public.advisor_interactions    where family_id = v_family;
  delete from public.advisor_signal_dismissals where family_id = v_family;
  delete from public.audit_log               where family_id = v_family;
  delete from public.family_entitlements     where family_id = v_family;
  delete from public.family_finance          where family_id = v_family;
  delete from public.family_members          where family_id = v_family;
  delete from public.families                where id = v_family;
  delete from auth.users                     where id = v_user;
end $$;
