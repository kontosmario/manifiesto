-- supabase/migrations/20260609010000_rpc_rate_limit.sql
--
-- Sprint B · B2 — Rate limiting RPCs sensibles
--
-- Por qué:
--   Hoy `apply_month_close_decision`, `apply_reserve_decision` y
--   `consume_family_invite` (entre otros) son RPCs authenticadas que
--   pueden ser abusadas — replay del confirm para inflar reserva,
--   bruteforce de codes, etc. La protección actual `enforce_rate_limit`
--   (migración 20260507000500_invite_rate_limit) cubre solo las RPCs
--   de invite y usa buckets alineados a `floor(epoch/window)`. Para
--   las RPCs financieras queremos throttling con ventana deslizante
--   (más estricta para retries legítimos pero con cap claro por hora).
--
-- Diseño:
--   • Tabla `rpc_rate_limit` con PK compuesto `(user_id, rpc_name)`.
--     Una sola row por user/RPC; la ventana se reinicia "perezosamente"
--     desde el propio statement de UPSERT.
--   • Function `check_rate_limit(p_rpc, p_max, p_window_sec)` SECURITY
--     DEFINER que incrementa el contador atómicamente y RAISE si excede.
--   • RLS: deny-all directo; accesible solo via SECURITY DEFINER.
--
-- Nota sobre coexistencia con `enforce_rate_limit` (M050):
--   Ambas funciones cumplen propósitos similares pero con semánticas
--   diferentes (windowed-aligned vs sliding-from-first-call). El plan
--   B2 pide la versión sliding para RPCs financieras; mantenemos la
--   windowed para invite RPCs porque el patrón está documentado y
--   tested. Cuando consolidemos en una sola, migrar invite RPCs a
--   `check_rate_limit` y deprecar `enforce_rate_limit`.

create table if not exists public.rpc_rate_limit (
  user_id uuid not null references auth.users(id) on delete cascade,
  rpc_name text not null,
  count int not null default 0,
  window_start timestamptz not null default now(),
  primary key (user_id, rpc_name)
);

create index if not exists rpc_rate_limit_window_idx
  on public.rpc_rate_limit (window_start);

alter table public.rpc_rate_limit enable row level security;

drop policy if exists rpc_rate_limit_no_direct_access on public.rpc_rate_limit;
create policy rpc_rate_limit_no_direct_access
  on public.rpc_rate_limit
  for all
  using (false)
  with check (false);

-- ─── check_rate_limit helper ────────────────────────────────────────
create or replace function public.check_rate_limit(
  p_rpc text,
  p_max int,
  p_window_sec int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count int;
  v_window_start timestamptz;
  v_retry_after int;
begin
  if v_user is null then
    raise exception 'No session';
  end if;

  insert into public.rpc_rate_limit (user_id, rpc_name, count, window_start)
  values (v_user, p_rpc, 1, now())
  on conflict (user_id, rpc_name)
  do update set
    count = case
      when public.rpc_rate_limit.window_start
           < now() - (p_window_sec || ' seconds')::interval
        then 1
      else public.rpc_rate_limit.count + 1
    end,
    window_start = case
      when public.rpc_rate_limit.window_start
           < now() - (p_window_sec || ' seconds')::interval
        then now()
      else public.rpc_rate_limit.window_start
    end
  returning count, window_start
    into v_count, v_window_start;

  if v_count > p_max then
    v_retry_after := greatest(
      0,
      extract(epoch from (
        v_window_start + (p_window_sec || ' seconds')::interval - now()
      ))::int
    );
    raise exception
      'rate_limit_exceeded: % calls in % seconds (max %)',
      v_count, p_window_sec, p_max
      using errcode = '54000',
            hint = 'retry_after_' || v_retry_after::text;
  end if;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
