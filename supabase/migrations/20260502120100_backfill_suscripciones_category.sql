-- Backfill: ensure every family has a 'Suscripciones' category with scope='fixed_expense'.
-- bootstrap_family() seeds it for new families (since 20260423151925), but families
-- created before that migration may be missing it.

insert into public.categories (id, family_id, name, color, scope, created_at)
select
  gen_random_uuid(),
  f.id,
  'Suscripciones',
  '#C9A6E0',
  'fixed_expense',
  now()
from public.families f
where not exists (
  select 1
  from public.categories c
  where c.family_id = f.id
    and c.name = 'Suscripciones'
    and c.scope = 'fixed_expense'
);
