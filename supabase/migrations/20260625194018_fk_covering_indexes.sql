-- WHAT: Índices de cobertura para las 24 FKs que el advisor marca sin índice
--       (`unindexed_foreign_keys`). Acelera joins por la FK + el chequeo de
--       cascade-delete (sin índice, borrar el padre hace Seq Scan del hijo).
-- WHY:  Postgres NO indexa FKs automáticamente. La hot-table `expenses` ya tiene
--       sus compuestos de lectura `(family_id, ...)`; esto cubre las columnas FK
--       sueltas (category_id, created_by, etc.) que esos compuestos no encabezan.
-- NOTE: expenses.created_by cubre sus 2 FKs (created_by_fkey + created_by_profile).

create index if not exists idx_achievements_earned_code on public.achievements_earned (code);
create index if not exists idx_achievements_earned_family_id on public.achievements_earned (family_id);
create index if not exists idx_categories_template_id on public.categories (template_id);
create index if not exists idx_category_limits_category_id on public.category_limits (category_id);
create index if not exists idx_expenses_category_id on public.expenses (category_id);
create index if not exists idx_expenses_commitment_id on public.expenses (commitment_id);
create index if not exists idx_expenses_created_by on public.expenses (created_by);
create index if not exists idx_family_entitlements_purchaser_user_id on public.family_entitlements (purchaser_user_id);
create index if not exists idx_family_invites_consumed_by on public.family_invites (consumed_by);
create index if not exists idx_family_invites_created_by on public.family_invites (created_by);
create index if not exists idx_fixed_expense_action_intent_user_id on public.fixed_expense_action_intent (user_id);
create index if not exists idx_fixed_expense_payments_paid_by on public.fixed_expense_payments (paid_by);
create index if not exists idx_fixed_expense_price_history_changed_by on public.fixed_expense_price_history (changed_by);
create index if not exists idx_fixed_expense_usage_audit_user_id on public.fixed_expense_usage_audit (user_id);
create index if not exists idx_fixed_expenses_category_id on public.fixed_expenses (category_id);
create index if not exists idx_garden_recovered_days_family_id on public.garden_recovered_days (family_id);
create index if not exists idx_month_close_decisions_decided_by on public.month_close_decisions (decided_by);
create index if not exists idx_month_close_decisions_family_id on public.month_close_decisions (family_id);
create index if not exists idx_month_close_decisions_meta_goal_id on public.month_close_decisions (meta_goal_id);
create index if not exists idx_notifications_created_by on public.notifications (created_by);
create index if not exists idx_notifications_user_id on public.notifications (user_id);
create index if not exists idx_profiles_avatar_animal on public.profiles (avatar_animal);
create index if not exists idx_user_streaks_user_id on public.user_streaks (user_id);
