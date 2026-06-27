-- ────────────────────────────────────────────────────────────────
-- 20260627020000_family_custom_categories.sql  (EXPAND · paso 1)
--
-- Tabla per-familia para categorías CUSTOM. Parte del refactor a
-- "catálogo global (category_templates) + custom per-familia".
-- Aditiva y segura: tabla nueva vacía, no toca nada existente.
-- Ver docs/sistemas/category-architecture-refactor.md.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.family_custom_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  color text,                      -- nullable: el hue del badge se deriva del nombre
  scope text not null default 'expense' check (scope in ('expense','fixed_expense')),
  created_at timestamptz not null default now()
);

-- Unicidad (family, scope, nombre case-insensitive) — espeja categories.
create unique index if not exists family_custom_categories_family_scope_name_uidx
  on public.family_custom_categories (family_id, scope, lower(name));

create index if not exists family_custom_categories_family_scope_idx
  on public.family_custom_categories (family_id, scope);

alter table public.family_custom_categories enable row level security;

drop policy if exists family_custom_categories_select_members on public.family_custom_categories;
create policy family_custom_categories_select_members on public.family_custom_categories
  for select using (public.is_family_member(family_id));

drop policy if exists family_custom_categories_insert_members on public.family_custom_categories;
create policy family_custom_categories_insert_members on public.family_custom_categories
  for insert with check (public.is_family_member(family_id));

drop policy if exists family_custom_categories_update_members on public.family_custom_categories;
create policy family_custom_categories_update_members on public.family_custom_categories
  for update using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

drop policy if exists family_custom_categories_delete_members on public.family_custom_categories;
create policy family_custom_categories_delete_members on public.family_custom_categories
  for delete using (public.is_family_member(family_id));
