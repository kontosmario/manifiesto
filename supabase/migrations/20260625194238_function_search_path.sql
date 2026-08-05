-- WHAT: Fija `search_path = 'public'` en las 15 funciones que el advisor marca
--       `function_search_path_mutable`. Defense-in-depth: sin search_path fijo,
--       un search_path manipulado podría resolver nombres a objetos maliciosos.
-- WHY:  Hygiene de seguridad (son non-secdef, riesgo bajo, pero cierra el lint).
--       Todas referencian objetos de `public` → 'public' no las rompe.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and p.proname = any (array[
        'ensure_expense_category_belongs_family','feature_flags_set_updated_at',
        'fixed_expense_monthly_equivalent','notify_expense_change','notify_fixed_expense_change',
        'notify_savings_goal_change','pay_date_for','prevent_expense_creator_change',
        'sanitize_display_name','savings_goals_touch_updated_at','touch_family_finance_updated_at',
        'touch_fixed_expenses_updated_at','touch_notification_preferences_updated_at',
        'touch_push_subscriptions_updated_at','trg_category_limits_touch_updated_at'
      ])
  loop
    execute format('alter function %s set search_path = %L', r.sig, 'public');
  end loop;
end $$;
