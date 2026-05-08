-- WHAT: Asegura columna last_used_at en push_subscriptions.
-- WHY:  El cron de retención mensual borra suscripciones inactivas hace 90+
--       días usando esta columna. Sin ella, la cláusula WHERE era un no-op
--       (la excepción era capturada silenciosamente). Esta migración agrega
--       la columna si no existe, retrorrellena con created_at y crea un
--       índice parcial para que la purga sea eficiente.

alter table public.push_subscriptions
  add column if not exists last_used_at timestamptz;

update public.push_subscriptions
set last_used_at = created_at
where last_used_at is null;

create index if not exists push_subscriptions_last_used_at_idx
  on public.push_subscriptions (last_used_at)
  where last_used_at is not null;

-- DOWN:
-- drop index if exists push_subscriptions_last_used_at_idx;
-- alter table public.push_subscriptions drop column if exists last_used_at;
