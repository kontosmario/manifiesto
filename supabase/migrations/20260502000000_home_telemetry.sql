-- Home telemetry — captura de eventos de interacción para medir tap
-- rate, dwell time, bounce, navegación derivada y heatmap de intent.
--
-- Pattern: reutiliza la convención establecida por
-- `advisor_interactions` (tabla propia + RLS select-own + RPC
-- SECURITY DEFINER + cron de pruning). No instalamos un SDK comercial
-- por el momento — la decisión está documentada en el RFC del Sprint 0
-- (docs/home-sprint-0-rfc-meta.md §D5).
--
-- Tabla:
--   home_telemetry — un row por evento. `event` discrimina tipo
--   (home.opened, home.closed, home.element_shown, home.element_tapped,
--   home.element_dismissed, home.scrolled_to_bottom, home.refreshed,
--   home.left_without_tap, home.reopened_in_session). El `context`
--   jsonb carga la metadata específica del evento (session_id,
--   dwell_ms, ms_since_shown, destination_route, etc.).
--
-- RLS:
--   SELECT propio. INSERT solo via RPC `log_home_event` que valida
--   pertenencia a la familia. Cliente nunca insert directo.
--
-- Pruning:
--   Cron mensual borra rows >90 días. Los análisis tactical (4-12
--   semanas) no necesitan más historia y la tabla puede crecer rápido
--   si la app escala (5-15 inserts × sesión × MAU).

set search_path = public;

create table if not exists public.home_telemetry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  event text not null,
  element_id text,
  slot text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists home_telemetry_user_event_idx
  on public.home_telemetry (user_id, event, created_at desc);

create index if not exists home_telemetry_family_element_idx
  on public.home_telemetry (family_id, element_id, created_at desc);

create index if not exists home_telemetry_session_idx
  on public.home_telemetry ((context->>'session_id'), created_at);

alter table public.home_telemetry enable row level security;

create policy "home_telemetry_select_own"
  on public.home_telemetry
  for select
  using (auth.uid() = user_id);

-- ─── RPC: log_home_event ──────────────────────────────────────────

create or replace function public.log_home_event(
  p_family_id uuid,
  p_event text,
  p_element_id text default null,
  p_slot text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Caller must belong to the family. Family ownership check is the
  -- only auth gate — `event` and `element_id` are free-form strings
  -- that the client produces, so we don't validate them server-side
  -- (the cost of a bad client value is just noise in analytics, not
  -- a security risk).
  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
  ) then
    raise exception 'Forbidden: not a member of family';
  end if;

  insert into public.home_telemetry (
    user_id, family_id, event, element_id, slot, context
  )
  values (
    auth.uid(),
    p_family_id,
    p_event,
    p_element_id,
    p_slot,
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_home_event from public;
grant execute on function public.log_home_event to authenticated;

-- ─── Pruning cron ────────────────────────────────────────────────

create or replace function public.cron_prune_home_telemetry()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.home_telemetry
  where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.cron_prune_home_telemetry from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cron_prune_home_telemetry');
    perform cron.schedule(
      'cron_prune_home_telemetry',
      '0 5 1 * *',  -- 05:00 UTC el 1 de cada mes
      $cron$select public.cron_prune_home_telemetry();$cron$
    );
  end if;
exception when others then
  null;
end;
$$;
