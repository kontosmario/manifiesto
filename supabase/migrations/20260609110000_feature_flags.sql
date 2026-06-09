-- supabase/migrations/20260609110000_feature_flags.sql
--
-- Sprint C · C9 — Feature flags infra
--
-- Por qué:
--   Necesitamos un knob server-side para gateaer features experimentales
--   (wrapped_v2, ai_coach, etc) sin bloquear el codebase con `if (false)`
--   hardcoded. El cliente lee los flags vía RPC `get_user_flags()` que
--   aplica rollout determinístico por user_id (hash módulo 100).
--
-- Diseño:
--   • Tabla `feature_flags` PK por key, con `enabled`, `rollout_percent`
--     (0-100) y `payload jsonb` para configurarlos sin redeploy.
--   • RLS: lectura abierta a `authenticated` (los flags son knobs
--     públicos — no exponen PII). Insert/update/delete solo via
--     service_role (admin desde dashboard o migración).
--   • RPC `get_user_flags()` SECURITY DEFINER que resuelve el rollout
--     por user_id usando `abs(hashtext(user_id::text)) % 100`.
--
-- Decisión sobre home_snapshot integration:
--   Por ahora **no** incluimos los flags en `home_snapshot`. Razones:
--   (1) los flags cambian con mucha menos frecuencia que el snapshot
--   (staleTime de 5min vs 60s), (2) inflar el payload del snapshot para
--   ahorrarse un round-trip que se hace UNA vez por cold-start tiene
--   poco upside y complejiza la invalidación, (3) este flow puede
--   evolucionar a un hook standalone con sus propios consumers (ej:
--   settings → debug flags) que no querés acoplados a home_snapshot.
--   Si la latencia del cold-start se vuelve problema, mover acá es
--   trivial: agregar el array de flags al payload + seed en
--   `seedCaches`.

-- ─── Tabla ──────────────────────────────────────────────────────────
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  rollout_percent int not null default 100
    check (rollout_percent between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Lectura abierta para authenticated (los flags son knobs públicos)
drop policy if exists feature_flags_read_all on public.feature_flags;
create policy feature_flags_read_all
  on public.feature_flags
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE bloqueados desde el cliente — solo service_role
-- via dashboard o migrations puede tocar la tabla.
drop policy if exists feature_flags_no_writes on public.feature_flags;
create policy feature_flags_no_writes
  on public.feature_flags
  for all
  to authenticated
  using (false)
  with check (false);

-- Trigger para mantener updated_at fresco
create or replace function public.feature_flags_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists feature_flags_updated_at on public.feature_flags;
create trigger feature_flags_updated_at
  before update on public.feature_flags
  for each row
  execute function public.feature_flags_set_updated_at();

-- ─── RPC: get_user_flags() ───────────────────────────────────────────
-- Devuelve la tabla resuelta con rollout aplicado para el caller.
-- enabled efectivo = (flag.enabled AND user_hash < rollout_percent).
-- Hash determinístico por user_id: el mismo user ve los mismos flags
-- siempre (hasta que cambie rollout_percent), no varía entre sesiones.
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
  if v_user_id is null then
    raise exception 'No session' using errcode = '42501';
  end if;

  -- abs() porque hashtext puede devolver negativos. % 100 mapea
  -- uniformemente a [0,99]. Si rollout_percent = 0 → nadie pasa
  -- (v_hash < 0 = false). Si = 100 → todos pasan (v_hash < 100 siempre
  -- true). Coverage 0-100% en saltos del 1%.
  v_hash := abs(hashtext(v_user_id::text)) % 100;

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

-- ─── Seed de flags placeholder ──────────────────────────────────────
-- Quedan OFF por default (enabled=false, rollout=0). Cuando se quiera
-- empezar el rollout: `update feature_flags set enabled=true,
-- rollout_percent=10 where key='wrapped_v2'`.
insert into public.feature_flags (key, enabled, rollout_percent)
values
  ('wrapped_v2', false, 0),
  ('ai_coach', false, 0)
on conflict (key) do nothing;
