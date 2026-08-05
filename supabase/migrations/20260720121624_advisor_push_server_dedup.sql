create table if not exists public.advisor_push_ledger (
  user_id uuid not null,
  kind text not null,
  pushed_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.advisor_push_ledger enable row level security;

create or replace function public.advisor_push_allowed_recipients(
  p_user_ids uuid[],
  p_kind text,
  p_cooldown_seconds integer
) returns table(user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  insert into public.advisor_push_ledger as l (user_id, kind, pushed_at)
  select distinct u, p_kind, now()
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as u
  where u is not null
  on conflict (user_id, kind) do update
    set pushed_at = now()
    where l.pushed_at < now() - make_interval(secs => greatest(coalesce(p_cooldown_seconds, 0), 0))
  returning l.user_id;
end;
$$;

revoke all on function public.advisor_push_allowed_recipients(uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.advisor_push_allowed_recipients(uuid[], text, integer) to service_role;

comment on function public.advisor_push_allowed_recipients(uuid[], text, integer) is
  'Backstop de idempotencia para push del asistente. De los destinatarios candidatos devuelve (y marca) los que estan fuera de cooldown para (user, kind); a lo sumo uno por ventana p_cooldown_seconds, atomico contra el race del cliente. Lo llama send-family-push para kinds advisor_*.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'advisor-push-ledger-cleanup') then
    perform cron.unschedule('advisor-push-ledger-cleanup');
  end if;
end $$;
select cron.schedule(
  'advisor-push-ledger-cleanup',
  '17 4 * * *',
  $$delete from public.advisor_push_ledger where pushed_at < now() - interval '3 days'$$
);
