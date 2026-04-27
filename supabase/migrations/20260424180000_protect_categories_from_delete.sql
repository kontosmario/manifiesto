-- ────────────────────────────────────────────────────────────────
-- 20260424180000_protect_categories_from_delete.sql
--
-- Protects `public.categories` from accidental deletion.
--
-- The `categories` table stores per-family instances of the global
-- `category_templates` catalog. They're seeded automatically on
-- `bootstrap_family` and referenced by `expenses.category_id` /
-- `fixed_expenses.category_id`. Deleting them (manually, via a
-- cleanup script, or a misguided UI action) silently breaks the
-- app: users lose the ability to categorize movements and existing
-- references dangle.
--
-- We block DELETE at the trigger level. Future migrations that
-- legitimately need to prune orphan categories (e.g. a catalog
-- consolidation) can opt in by setting a session GUC:
--
--   begin;
--   set local app.allow_delete_categories = 'on';
--   delete from public.categories where ...;
--   commit;
--
-- RLS-level protection is weaker because the service_role bypasses
-- RLS, while this trigger fires for every role — keeping the
-- service_role honest too.
-- ────────────────────────────────────────────────────────────────

create or replace function public.prevent_categories_delete()
returns trigger
language plpgsql
as $$
begin
  -- Escape hatch for migrations/admin tasks that explicitly opt in.
  -- `current_setting(..., true)` returns NULL when the GUC is unset
  -- (the `true` arg means "missing_ok"); comparing to 'on' handles
  -- both the unset and the disabled case safely.
  if current_setting('app.allow_delete_categories', true) = 'on' then
    return old;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'categories cannot be deleted (protected row)',
    hint = 'Categories are seed data derived from category_templates. '
        || 'To delete legitimately, run: set local app.allow_delete_categories = ''on''; '
        || 'before your DELETE statement inside the same transaction.';
end;
$$;

drop trigger if exists trg_prevent_categories_delete on public.categories;

create trigger trg_prevent_categories_delete
before delete on public.categories
for each row
execute function public.prevent_categories_delete();

comment on function public.prevent_categories_delete() is
  'Trigger fn: blocks DELETE on public.categories unless '
  'app.allow_delete_categories is set to ''on'' in the current '
  'transaction. See migration 20260424180000 for rationale.';
