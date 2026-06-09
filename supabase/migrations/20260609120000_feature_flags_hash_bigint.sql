-- supabase/migrations/20260609120000_feature_flags_hash_bigint.sql
--
-- CR Sprint C finding #5: `get_user_flags` usaba `abs(hashtext(...)) % 100`
-- con resultado int4. Si por una probabilidad ínfima (1/2^31) el
-- hashtext devuelve INT_MIN (-2147483648), `abs(INT_MIN)` overflowea y
-- devuelve INT_MIN (undefined behavior en C, pero PostgreSQL lo
-- evalúa como negativo). El `% 100` de negativo es negativo en
-- Postgres, y `negative < rollout_percent` siempre es true → el user
-- vería el flag enabled a cualquier rollout > 0.
--
-- Fix: cast a bigint antes del abs() para evitar el overflow.

create or replace function public.get_user_flags()
returns table (key text, enabled boolean, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash int;
begin
  if v_user_id is null then raise exception 'No session'; end if;

  -- CR Sprint C #5: cast a bigint antes del abs() para evitar overflow
  -- en el edge case hashtext = INT_MIN. mod() con bigint preserva el
  -- signo + rango correcto, y casteamos a int al final para el shape.
  v_hash := mod(abs(hashtext(v_user_id::text)::bigint), 100)::int;

  return query
  select
    f.key,
    (f.enabled and v_hash < f.rollout_percent) as enabled,
    f.payload
  from public.feature_flags f;
end;
$$;

revoke all on function public.get_user_flags() from public;
grant execute on function public.get_user_flags() to authenticated;

comment on function public.get_user_flags() is
  'Devuelve los feature flags del user con su estado calculado por '
  'rollout_percent (hash determinista). Cast a bigint en el abs() '
  'previene overflow en INT_MIN edge case — CR Sprint C #5.';
