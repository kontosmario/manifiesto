-- supabase/migrations/20260615060000_subscriptions_entitlement_model.sql
-- Fase 1 de suscripciones: modelo de entitlement. Sin IAP real todavía.
-- Spec: docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md

-- ── profiles.trial_days (trial monotónico per-usuario) ──────────────
-- El trial no se guarda como contador: se deriva de profiles.created_at
-- (now() − created_at). trial_days permite variar la duración por
-- cohorte. Anclar a created_at hace el exploit de leave/rejoin imposible
-- por diseño (no hay estado que resetear).
alter table public.profiles
  add column if not exists trial_days int not null default 30;

-- Piso para cuentas EXISTENTES: arrancan con >=30 días desde el deploy.
-- greatest(30, edad_en_dias + 30) → days_left = trial_days − edad = 30.
update public.profiles
  set trial_days = greatest(30, (now()::date - created_at::date) + 30)
  where created_at < now();

-- ── family_entitlements (estado de la suscripción per-familia) ──────
create table if not exists public.family_entitlements (
  family_id uuid primary key references public.families(id) on delete cascade,
  subscription_status text not null default 'none'
    check (subscription_status in ('none','active','grace','expired')),
  original_transaction_id text unique,
  product_id text,
  pending_product_id text,
  purchaser_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  grace_expires_at timestamptz,
  last_applied_signed_date timestamptz,
  auto_renew boolean not null default true,
  environment text not null default 'Production'
    check (environment in ('Sandbox','Production')),
  comped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.family_entitlements enable row level security;

-- SELECT: miembros activos de la familia leen su entitlement.
drop policy if exists family_entitlements_select on public.family_entitlements;
create policy family_entitlements_select on public.family_entitlements
  for select using (public.is_family_member_active(family_id));
-- Escritura: solo edge functions (security definer). Nada de client writes.
drop policy if exists family_entitlements_no_write on public.family_entitlements;
create policy family_entitlements_no_write on public.family_entitlements
  for all using (false) with check (false);

-- ── subscription_events (dedup + ordering + audit) ──────────────────
-- Dedup correcto: guardar TODOS los notification_uuid vistos (no solo el
-- último). Apple reintenta notificaciones viejas; el dedup por tabla +
-- ordering por signed_date evita pisar estado fresco con estado stale.
create table if not exists public.subscription_events (
  notification_uuid text primary key,
  original_transaction_id text not null,
  notification_type text not null,
  signed_date timestamptz not null,
  environment text not null,
  raw_payload jsonb not null,
  processed_at timestamptz not null default now()
);
create index if not exists subscription_events_otid_signed_idx
  on public.subscription_events (original_transaction_id, signed_date desc);

alter table public.subscription_events enable row level security;
-- Sin policies → solo service_role accede (RLS deniega a authenticated).

-- ── Seed: cada familia tiene una fila de entitlement ────────────────
create or replace function public.seed_family_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.family_entitlements (family_id)
  values (new.id)
  on conflict (family_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_family_entitlement on public.families;
create trigger trg_seed_family_entitlement
  after insert on public.families
  for each row execute function public.seed_family_entitlement();

-- Backfill de familias existentes.
insert into public.family_entitlements (family_id)
  select id from public.families
  on conflict (family_id) do nothing;
