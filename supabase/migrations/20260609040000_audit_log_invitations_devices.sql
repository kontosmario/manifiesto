-- supabase/migrations/20260609040000_audit_log_invitations_devices.sql
--
-- Sprint B · B4 — Tablas audit_log / invitations / devices.
--
-- Tres tablas pre-prod (no se popula código mobile ahora — la idea es
-- tenerlas listas para que B5 cuelgue los triggers de service_role audit
-- y para que features futuras (delete-account audit trail, multi-device
-- session management, revoked invites) tengan donde anclarse).
--
-- Decisiones de diseño:
--
-- 1. audit_log: shape genérico (action text + payload jsonb + ip/ua) que
--    sirve tanto para B5 (service-role triggers) como para futuras
--    invocaciones desde edge functions / RPCs (request_account_deletion,
--    family_left, savings_goal_deleted, etc.). RLS: solo owner lee sus
--    propias rows; service_role escribe sin filtro.
--
-- 2. invitations: el plan B4 menciona "extender invitations" — la tabla
--    real existente es `family_invites` (20260507000200). Agregamos las
--    columnas faltantes ahí en lugar de crear una segunda tabla. Las
--    columnas (revoked_at, max_uses, times_used) habilitan invites
--    multi-uso (familia con onboarding masivo) y revocación explícita
--    sin esperar al TTL.
--
-- 3. devices: track de sesiones activas para futuro multi-device session
--    management (logout-all, push token routing, "estás logueado en X
--    devices"). Hoy no se popula desde mobile — el ticket A7 sigue
--    usando push_subscriptions. Es una tabla *parking* para cuando
--    arranque el feature de session management.

-- ════════════════════════════════════════════════════════════════════
-- 1 · audit_log
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  family_id uuid references public.families(id) on delete set null,
  -- Action canónico. Convenciones:
  --   'service_role_<OP>_<TABLE>'  → triggers de B5
  --   'delete_account_requested'    → request_account_deletion
  --   'family_left'                 → leave_family
  --   'savings_goal_deleted'        → delete_savings_goal
  --   'reauth_failed'               → require_reauth
  action text not null,
  target_table text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  at timestamptz not null default now()
);

create index if not exists audit_log_user_at_idx
  on public.audit_log (user_id, at desc);
create index if not exists audit_log_family_at_idx
  on public.audit_log (family_id, at desc);
create index if not exists audit_log_action_at_idx
  on public.audit_log (action, at desc);

alter table public.audit_log enable row level security;

-- Owner lee sus propias rows. Las rows sin user_id (service_role triggers)
-- no las ve nadie via RLS — quedan accesibles solo via service_role / SQL
-- directo. Eso es intencional: el audit log de service-role es para
-- forensics, no para UX del user final.
drop policy if exists audit_log_owner_can_read on public.audit_log;
create policy audit_log_owner_can_read
  on public.audit_log for select
  using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- 2 · invitations (extender family_invites)
-- ════════════════════════════════════════════════════════════════════
-- El plan B4 menciona "invitations" — la tabla real es family_invites
-- (20260507000200). Agregamos columnas faltantes acá.
--
-- • revoked_at:  marca de revocación explícita por el creador. peek/
--                consume las tratan como expiradas. Permite "borrar"
--                un invite sin esperar al TTL.
-- • max_uses:    cuántas veces se puede consumir antes de cerrarlo.
--                Default 1 → mantiene la semántica actual single-use.
--                Habilita invites multi-uso para onboarding masivo
--                (ej. familia con 4 hijos invitados con un solo code).
-- • times_used:  contador para enforcer del max_uses.
--
-- IMPORTANTE: este migration solo agrega las columnas. Las RPCs
-- peek_family_invite/consume_family_invite NO se actualizan acá — se
-- harán en un migration aparte cuando se decida activar multi-uso.
-- Hoy el contrato sigue siendo single-use (consumed_at != null).
alter table public.family_invites
  add column if not exists revoked_at timestamptz null;

alter table public.family_invites
  add column if not exists max_uses int not null default 1
    check (max_uses >= 1);

alter table public.family_invites
  add column if not exists times_used int not null default 0
    check (times_used >= 0);

-- ════════════════════════════════════════════════════════════════════
-- 3 · devices
-- ════════════════════════════════════════════════════════════════════
-- Track de sesiones activas. Hoy no se popula desde mobile (A7 sigue
-- usando push_subscriptions). Tabla parking para el feature de
-- multi-device session management.
--
-- Convención de uso esperada (cuando se implemente el hook mobile):
--   • device_id = random uuid persistido en SecureStore al primer boot.
--   • Upsert en cada cold-start con (platform, app_version, last_seen).
--   • push_token espejado de push_subscriptions cuando esté disponible
--     (alternativa: dejarlo null y hacer JOIN por user_id).
--   • last_ip: derivado del header X-Forwarded-For en una RPC SECDEF.
create table if not exists public.devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  last_seen timestamptz not null default now(),
  last_ip text,
  push_token text,
  primary key (user_id, device_id)
);

create index if not exists devices_user_last_seen_idx
  on public.devices (user_id, last_seen desc);

alter table public.devices enable row level security;

drop policy if exists devices_owner_full_access on public.devices;
create policy devices_owner_full_access
  on public.devices for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
