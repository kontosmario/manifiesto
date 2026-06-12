# Suscripciones · Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Modelo de datos + resolución de entitlement + enforcement (paywall duro) de suscripciones, SIN IAP real (testeable con `comped`/unlock mock). Las fases 2-4 (expo-iap, validate-purchase, webhook ASSN v2, App Store Connect) vienen después.

**Architecture:** Trial monotónico per-usuario (derivado de `profiles.created_at`) + suscripción per-familia (`family_entitlements`). Resolución en cascada server-side (`resolve_entitlement`: comped > familia con sub activa > trial > bloqueado), path de escritura unificado (`apply_subscription_transaction` con ordering por `signed_date`). Cliente: `SubscriptionGate` overlay (patrón del auth-flow), nudge del período libre por umbrales, aviso al salir de familia.

**Tech Stack:** Supabase (Postgres + RLS), migraciones vía `node scripts/supabase-remote.mjs db push`, React Native/Expo, React Query, vitest (node env, sin renderer).

**Spec:** [docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md](../specs/2026-06-12-apple-subscriptions-design.md)

**Reglas del repo:** migraciones SQL se aplican a prod con `db push` y se verifican con query directa (no hay test runner de SQL); helpers TS puros → vitest en `tests/unit/`; componentes/hooks → tsc + eslint (vitest no tiene React renderer). Commits en español. Branch `feature/subscriptions`.

---

### Task 1: Migración — tablas, `trial_days`, seed/backfill

**Files:**
- Create: `supabase/migrations/20260615060000_subscriptions_entitlement_model.sql`

- [ ] **Step 1: Escribir la migración** (tablas + columna + backfill + trigger seed)

```sql
-- supabase/migrations/20260615060000_subscriptions_entitlement_model.sql
-- Fase 1 de suscripciones: modelo de entitlement. Sin IAP real todavía.

-- ── profiles.trial_days (trial monotónico per-usuario) ──────────────
alter table public.profiles
  add column if not exists trial_days int not null default 30;

-- Piso: las cuentas EXISTENTES arrancan con >=30 días desde el deploy
-- (greatest(30, edad_en_dias + 30) → days_left = trial_days - edad = 30).
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
create policy family_entitlements_select on public.family_entitlements
  for select using (public.is_family_member_active(family_id));
-- Escritura: solo edge functions (security definer). Nada de client writes.
create policy family_entitlements_no_write on public.family_entitlements
  for all using (false) with check (false);

-- ── subscription_events (dedup + ordering + audit) ──────────────────
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
```

- [ ] **Step 2: Aplicar a prod**

Run: `node scripts/supabase-remote.mjs db push --include-all`
Expected: `Applying migration 20260615060000_...` + `Finished supabase db push.`

- [ ] **Step 3: Verificar contra prod**

```bash
TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.supabase | cut -d= -f2 | tr -d '"' | tr -d ' ')
curl -s -X POST "https://api.supabase.com/v1/projects/xaquigyhylzvuyfslkqq/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"select (select count(*) from public.family_entitlements) as ents, (select count(*) from public.families) as fams, (select min(trial_days) from public.profiles) as min_trial"}'
```
Expected: `ents == fams` (toda familia tiene entitlement), `min_trial >= 30`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615060000_subscriptions_entitlement_model.sql
git commit -m "feat(subs): modelo de entitlement — tablas + trial_days + seed/backfill"
```

---

### Task 2: Migración — `apply_subscription_transaction` + `resolve_entitlement` + snapshot

**Files:**
- Create: `supabase/migrations/20260615061000_subscriptions_resolution_fns.sql`

- [ ] **Step 1: Escribir las funciones SQL**

```sql
-- supabase/migrations/20260615061000_subscriptions_resolution_fns.sql

-- ── apply_subscription_transaction: path de escritura UNIFICADO ─────
-- validate-purchase (Fase 2) y el webhook (Fase 3) lo comparten.
-- Ordering por signed_date: nunca pisa estado más nuevo con más viejo.
create or replace function public.apply_subscription_transaction(
  p_family_id uuid,
  p_original_transaction_id text,
  p_status text,
  p_product_id text,
  p_expires_at timestamptz,
  p_grace_expires_at timestamptz,
  p_auto_renew boolean,
  p_environment text,
  p_signed_date timestamptz,
  p_purchaser_user_id uuid default null,
  p_pending_product_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.family_entitlements fe set
    subscription_status = p_status,
    original_transaction_id = coalesce(p_original_transaction_id, fe.original_transaction_id),
    product_id = coalesce(p_product_id, fe.product_id),
    pending_product_id = p_pending_product_id,
    expires_at = coalesce(p_expires_at, fe.expires_at),
    grace_expires_at = p_grace_expires_at,
    auto_renew = coalesce(p_auto_renew, fe.auto_renew),
    environment = coalesce(p_environment, fe.environment),
    purchaser_user_id = coalesce(p_purchaser_user_id, fe.purchaser_user_id),
    last_applied_signed_date = p_signed_date,
    updated_at = now()
  where fe.family_id = p_family_id
    and (fe.last_applied_signed_date is null
         or p_signed_date > fe.last_applied_signed_date);  -- ordering
end;
$$;
revoke all on function public.apply_subscription_transaction(uuid,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz,uuid,text) from public;

-- ── resolve_entitlement: cascada server-side, solo DB ──────────────
create or replace function public.resolve_entitlement(p_user_id uuid)
returns table(source text, plan text, days_left int, has_access boolean)
language plpgsql security definer stable set search_path = public as $$
declare
  v_family_id uuid;
  v_status text;
  v_product text;
  v_created_at timestamptz;
  v_trial_days int;
  v_comped boolean;
  v_days_left int;
begin
  -- Familia activa del usuario.
  select fm.family_id into v_family_id
    from public.family_members fm
   where fm.user_id = p_user_id and coalesce(fm.role,'') <> 'blocked'
   limit 1;

  -- Estado de la sub de esa familia.
  if v_family_id is not null then
    select fe.subscription_status, fe.product_id, fe.comped
      into v_status, v_product, v_comped
      from public.family_entitlements fe where fe.family_id = v_family_id;
  end if;

  -- 1. comped.
  if coalesce(v_comped, false) then
    return query select 'comped'::text, 'comped'::text, null::int, true; return;
  end if;
  -- 2. familia con sub activa/gracia.
  if v_status in ('active','grace') then
    return query select 'family'::text,
      coalesce(case when v_product like '%yearly%' then 'yearly'
                    when v_product like '%monthly%' then 'monthly'
                    else 'family' end, 'family')::text,
      null::int, true; return;
  end if;
  -- 3. trial monotónico per-usuario.
  select p.created_at, p.trial_days into v_created_at, v_trial_days
    from public.profiles p where p.id = p_user_id;
  v_days_left := greatest(0, coalesce(v_trial_days,30) - (now()::date - v_created_at::date));
  if v_days_left > 0 then
    return query select 'trial'::text, 'trial'::text, v_days_left, true; return;
  end if;
  -- 4. bloqueado.
  return query select 'free'::text, 'free'::text, 0, false;
end;
$$;
revoke all on function public.resolve_entitlement(uuid) from public;
grant execute on function public.resolve_entitlement(uuid) to authenticated;

-- ── snapshot: lo que la UI necesita (incl. cap/count para downgrade) ─
create or replace function public.family_entitlement_snapshot()
returns table(
  source text, plan text, has_access boolean, days_left int,
  expires_at timestamptz, subscription_status text,
  member_cap int, member_count int, pending_product_id text
) language plpgsql security definer stable set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  r record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select * into r from public.resolve_entitlement(v_user_id);
  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role,'') <> 'blocked' limit 1;
  return query
    select r.source, r.plan, r.has_access, r.days_left,
      fe.expires_at, fe.subscription_status,
      (case when fe.product_id like '%yearly%' then 4 else 2 end)::int as member_cap,
      (select count(*)::int from public.family_members m
        where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked') as member_count,
      fe.pending_product_id
    from public.family_entitlements fe where fe.family_id = v_family_id;
end;
$$;
revoke all on function public.family_entitlement_snapshot() from public;
grant execute on function public.family_entitlement_snapshot() to authenticated;
```

- [ ] **Step 2: Aplicar + verificar contra la cuenta owner**

Run: `node scripts/supabase-remote.mjs db push --include-all`
Luego (la cuenta owner debería resolver `trial` o `free` hoy, sin sub):
```bash
TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.supabase | cut -d= -f2 | tr -d '"' | tr -d ' ')
curl -s -X POST "https://api.supabase.com/v1/projects/xaquigyhylzvuyfslkqq/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"select * from public.resolve_entitlement((select fm.user_id from public.family_members fm join auth.users u on u.id=fm.user_id where u.email='"'"'kontosmario@gmail.com'"'"' limit 1))"}'
```
Expected: una fila con `source` in (`trial`,`free`) y `has_access` coherente (con el backfill de trial_days, debería ser `trial` con `days_left` ~30).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615061000_subscriptions_resolution_fns.sql
git commit -m "feat(subs): apply_subscription_transaction + resolve_entitlement + snapshot"
```

---

### Task 3: Check de cap en `create_family_invite`

**Files:**
- Create: `supabase/migrations/20260615062000_invite_cap_check.sql`

- [ ] **Step 1: Escribir la migración (re-crea el RPC con el check)**

Traer el body actual completo y reinsertar agregando, después del bloque que resuelve `v_family_id` y valida `is_family_member_active`, este check (cap del plan vigente vs miembros activos):

```sql
-- supabase/migrations/20260615062000_invite_cap_check.sql
-- Re-crea create_family_invite agregando el check de cap (downgrade
-- grandfathering: no se expulsa a nadie, pero no se invita por encima
-- del cap del plan vigente). El resto del body se preserva verbatim del
-- RPC actual (deletion guard + rate limit + loop de generación).
create or replace function public.create_family_invite()
returns table(code text, expires_at timestamp with time zone)
language plpgsql security definer set search_path to 'public','extensions' as $function$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_target_code text;
  v_attempts int := 0;
  v_pending_deletion timestamptz;
  v_cap int;
  v_count int;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select p.deletion_scheduled_at into v_pending_deletion
    from public.profiles p where p.id = v_user_id;
  if v_pending_deletion is not null then
    raise exception 'No podés generar invitaciones mientras tu cuenta tenga una baja agendada. Cancelá la baja primero.'
      using errcode = 'P0001';
  end if;

  perform public.check_rate_limit('create_family_invite', 10, 3600);

  select fm.family_id into v_family_id
    from public.family_members fm where fm.user_id = v_user_id limit 1;
  if v_family_id is null then raise exception 'Not currently in a family'; end if;
  if not public.is_family_member_active(v_family_id) then
    raise exception 'Not currently in a family';
  end if;

  -- ── Check de cap (Fase 1 de suscripciones) ──────────────────────
  select case when fe.product_id like '%yearly%' then 4 else 2 end
    into v_cap from public.family_entitlements fe where fe.family_id = v_family_id;
  select count(*) into v_count from public.family_members m
    where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked';
  if v_count >= coalesce(v_cap, 2) then
    raise exception 'Tu hogar alcanzó el máximo de miembros de tu plan. Pasá al Anual o reducí el hogar para invitar a alguien más.'
      using errcode = 'P0001';
  end if;

  loop
    v_target_code := public.generate_invite_code(8);
    begin
      insert into public.family_invites(code, family_id, created_by)
      values (v_target_code, v_family_id, v_user_id);
      return query select v_target_code, (now() + interval '7 days')::timestamptz;
      return;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise exception 'Could not generate a unique invite code'; end if;
    end;
  end loop;
end;
$function$;
revoke all on function public.create_family_invite() from public;
grant execute on function public.create_family_invite() to authenticated;
```

> ⚠ Antes de escribir: traer el body REAL completo con
> `select pg_get_functiondef(oid) from pg_proc where proname='create_family_invite'`
> y preservar exactamente el loop de inserción / columnas de `family_invites`
> (el bloque de arriba refleja el actual, pero confirmar `expires_at` y
> columnas antes de aplicar).

- [ ] **Step 2: Aplicar + verificar el cap (familia solo-owner, count=1, cap=2 → permite)**

Run: `node scripts/supabase-remote.mjs db push --include-all`
```bash
TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.supabase | cut -d= -f2 | tr -d '"' | tr -d ' ')
curl -s -X POST "https://api.supabase.com/v1/projects/xaquigyhylzvuyfslkqq/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"select proname from pg_proc where proname='"'"'create_family_invite'"'"'"}'
```
Expected: existe; el cap se ejercita de verdad en device (familia con 2 miembros).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615062000_invite_cap_check.sql
git commit -m "feat(subs): check de cap en create_family_invite (downgrade grandfathering)"
```

---

### Task 4: Cliente — hook del snapshot de entitlement

**Files:**
- Create: `mobile/features/billing/use-entitlement.ts`
- Test: `tests/unit/entitlement-snapshot-shape.test.ts`

- [ ] **Step 1: Escribir el test de la forma del snapshot (helper puro)**

```ts
// tests/unit/entitlement-snapshot-shape.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeEntitlementSnapshot } from '@/features/billing/use-entitlement'

describe('normalizeEntitlementSnapshot', () => {
  it('coacciona la fila del RPC a la forma del cliente', () => {
    const row = {
      source: 'trial', plan: 'trial', has_access: true, days_left: 12,
      expires_at: null, subscription_status: 'none',
      member_cap: 2, member_count: 1, pending_product_id: null,
    }
    expect(normalizeEntitlementSnapshot(row)).toEqual({
      source: 'trial', plan: 'trial', hasAccess: true, daysLeft: 12,
      expiresAt: null, subscriptionStatus: 'none',
      memberCap: 2, memberCount: 1, pendingProductId: null,
    })
  })
  it('default seguro cuando el RPC no devuelve fila (bloquea)', () => {
    expect(normalizeEntitlementSnapshot(null).hasAccess).toBe(false)
    expect(normalizeEntitlementSnapshot(null).source).toBe('free')
  })
})
```

- [ ] **Step 2: Correr → falla** (`npx vitest run tests/unit/entitlement-snapshot-shape.test.ts`). Expected: módulo inexistente.

- [ ] **Step 3: Implementar el hook + normalizador**

```ts
// mobile/features/billing/use-entitlement.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type EntitlementSource = 'comped' | 'family' | 'trial' | 'subscription' | 'free'

export interface EntitlementSnapshot {
  source: EntitlementSource
  plan: string
  hasAccess: boolean
  daysLeft: number | null
  expiresAt: string | null
  subscriptionStatus: string
  memberCap: number
  memberCount: number
  pendingProductId: string | null
}

const BLOCKED: EntitlementSnapshot = {
  source: 'free', plan: 'free', hasAccess: false, daysLeft: 0,
  expiresAt: null, subscriptionStatus: 'none',
  memberCap: 2, memberCount: 1, pendingProductId: null,
}

export function normalizeEntitlementSnapshot(row: Record<string, unknown> | null): EntitlementSnapshot {
  if (!row) return BLOCKED
  return {
    source: (row.source as EntitlementSource) ?? 'free',
    plan: String(row.plan ?? 'free'),
    hasAccess: Boolean(row.has_access),
    daysLeft: row.days_left == null ? null : Number(row.days_left),
    expiresAt: (row.expires_at as string) ?? null,
    subscriptionStatus: String(row.subscription_status ?? 'none'),
    memberCap: Number(row.member_cap ?? 2),
    memberCount: Number(row.member_count ?? 1),
    pendingProductId: (row.pending_product_id as string) ?? null,
  }
}

export const entitlementQueryKey = (userId?: string) => ['entitlement', userId] as const

export function useEntitlement(userId?: string) {
  return useQuery({
    queryKey: entitlementQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<EntitlementSnapshot> => {
      const { data, error } = await supabase.rpc('family_entitlement_snapshot')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return normalizeEntitlementSnapshot((row as Record<string, unknown>) ?? null)
    },
  })
}
```

- [ ] **Step 4: Verde + tsc** (`npx vitest run tests/unit/entitlement-snapshot-shape.test.ts && npx tsc --noEmit`). Expected: 2 passed, tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/billing/use-entitlement.ts tests/unit/entitlement-snapshot-shape.test.ts
git commit -m "feat(subs): use-entitlement — hook + normalizador del snapshot (testeado)"
```

---

### Task 5: `SubscriptionGate` — overlay del paywall duro

**Files:**
- Create: `mobile/components/billing/subscription-gate.tsx`
- Modify: `app/(app)/(tabs)/_layout.tsx` (montar junto a `ShareImportHost`)

- [ ] **Step 1: Crear el gate** (reusa `billing-screen` como contenido del overlay)

```tsx
// mobile/components/billing/subscription-gate.tsx
import { Modal, View, StyleSheet } from 'react-native'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { BillingScreen } from '@/screens/settings/billing-screen'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Paywall duro. Cuando el entitlement resuelto bloquea (source:'free'),
 * monta billing-screen como overlay NO descartable sobre la app. Corre
 * DESPUÉS del unlock (vive en el layout de tabs, que solo existe con
 * sesión). El acceso lo decide el server (snapshot), nunca el cliente.
 */
export function SubscriptionGate() {
  const { theme } = useAppTheme()
  const userId = useAuthSession().data?.user.id
  const { data: ent, isLoading } = useEntitlement(userId)

  // Mientras carga, NO bloqueamos (evita un flash de paywall en el cold
  // start antes de que resuelva). Si resuelve has_access:false → overlay.
  const blocked = !isLoading && ent != null && !ent.hasAccess
  if (!blocked) return null

  return (
    <Modal visible animationType="fade" transparent={false} presentationStyle="fullScreen">
      <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
        <BillingScreen lockMode />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
```

> Nota: `BillingScreen` necesita aceptar una prop opcional `lockMode` que
> (a) oculte el botón de volver / header de navegación, (b) muestre el copy
> "Tu mes gratis terminó. Elegí tu plan para seguir." Si `billing-screen` hoy
> es una screen de router, extraer su contenido a un componente reutilizable
> o aceptar la prop. Confirmar la firma actual antes de editar.

- [ ] **Step 2: Montar en el layout de tabs**

En `app/(app)/(tabs)/_layout.tsx`, junto a `<ShareImportHost />`:
```tsx
<>
  <AppTabs />
  <ShareImportHost />
  <SubscriptionGate />
</>
```
con `import { SubscriptionGate } from '@/components/billing/subscription-gate'`.

- [ ] **Step 3: Verificar** (`npx tsc --noEmit && npx eslint mobile/components/billing/subscription-gate.tsx "app/(app)/(tabs)/_layout.tsx"`). Expected: limpio (ajustar la firma de BillingScreen/lockMode hasta que compile).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/billing/subscription-gate.tsx "app/(app)/(tabs)/_layout.tsx" mobile/screens/settings/billing-screen.tsx
git commit -m "feat(subs): SubscriptionGate — overlay del paywall duro montado en tabs"
```

---

### Task 6: Nudge del período libre (badge + banner por umbrales)

**Files:**
- Create: `mobile/features/billing/free-access-nudge.ts` (lógica pura + persistencia del umbral)
- Test: `tests/unit/free-access-nudge.test.ts`
- Modify: la superficie de Settings/Home que muestre el badge (definir en Step 4)

- [ ] **Step 1: Test de la lógica de umbrales**

```ts
// tests/unit/free-access-nudge.test.ts
import { describe, expect, it } from 'vitest'
import { shouldShowFreeAccessBanner, TRIAL_NUDGE_THRESHOLDS } from '@/features/billing/free-access-nudge'

describe('shouldShowFreeAccessBanner', () => {
  it('solo para source==trial', () => {
    expect(shouldShowFreeAccessBanner({ source: 'family', daysLeft: 1 }, null)).toBe(false)
    expect(shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 20 }, null)).toBe(false)
  })
  it('dispara una vez por umbral [7,3,1]', () => {
    expect(shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 7 }, null)).toBe(true)
    expect(shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 7 }, 7)).toBe(false) // ya mostrado
    expect(shouldShowFreeAccessBanner({ source: 'trial', daysLeft: 3 }, 7)).toBe(true)  // nuevo umbral
  })
  it('exporta los umbrales canónicos', () => {
    expect(TRIAL_NUDGE_THRESHOLDS).toEqual([7, 3, 1])
  })
})
```

- [ ] **Step 2: Correr → falla.** `npx vitest run tests/unit/free-access-nudge.test.ts`

- [ ] **Step 3: Implementar**

```ts
// mobile/features/billing/free-access-nudge.ts
export const TRIAL_NUDGE_THRESHOLDS = [7, 3, 1] as const

export function shouldShowFreeAccessBanner(
  snap: { source: string; daysLeft: number | null },
  lastShownThreshold: number | null,
): boolean {
  if (snap.source !== 'trial' || snap.daysLeft == null) return false
  const t = TRIAL_NUDGE_THRESHOLDS.find((x) => snap.daysLeft! <= x)
  return t !== undefined && t !== lastShownThreshold
}

/** Copy neutro — NUNCA "Prueba"/"trial" (regla de compliance del spec §7). */
export function freeAccessBadgeLabel(daysLeft: number): string {
  return `Acceso completo: ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} restantes`
}
```

- [ ] **Step 4: Verde + cablear el badge** (`npx vitest run tests/unit/free-access-nudge.test.ts`). Luego mostrar `freeAccessBadgeLabel(ent.daysLeft)` como row pasiva en `billing-screen`/Settings cuando `ent.source === 'trial'`. El banner por umbral usa `shouldShowFreeAccessBanner` + persistir el último umbral mostrado en AsyncStorage (key `free-access-last-threshold`). Implementación del wiring concreta al editar la pantalla.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/billing/free-access-nudge.ts tests/unit/free-access-nudge.test.ts mobile/screens/settings/billing-screen.tsx
git commit -m "feat(subs): nudge del período libre — badge + banner por umbrales [7,3,1] (testeado)"
```

---

### Task 7: Aviso al salir de familia con período libre vencido

**Files:**
- Modify: `mobile/features/family/use-family-actions.ts` (o el componente que confirma el leave en `settings-screen.tsx:598`)

- [ ] **Step 1: Inyectar la advertencia en el flujo de confirmación**

Antes de disparar `leave_current_family`, si el snapshot de entitlement del usuario tiene `source !== 'family'` y `daysLeft === 0` (período libre vencido), agregar al copy de confirmación: *"Si salís de la familia pasás al plan gratuito (tu período de prueba ya finalizó)."* Leer el snapshot con `useEntitlement(userId)` en el componente que arma el `Alert.alert`/sheet de confirmación (`settings-screen.tsx` `runLeaveFamily`). Solo se agrega la línea extra cuando corresponde; el flujo no cambia.

- [ ] **Step 2: Verificar** (`npx tsc --noEmit && npx eslint mobile/screens/settings/settings-screen.tsx`). Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "feat(subs): aviso al salir de familia si el período libre venció"
```

---

### Task 8: Validación integral + doc

**Files:**
- Modify: `docs/sistemas/` (nuevo doc `subscriptions.md` o sección)

- [ ] **Step 1: Suite + tsc + lint**

Run: `npm run validate 2>&1 | tail -5`
Expected: unit verde salvo la baseline de integración conocida (3 archivos que necesitan stack local).

- [ ] **Step 2: Documentar Fase 1** en `docs/sistemas/subscriptions.md` (modelo, cascada, gate, qué falta de las fases 2-4). Link al spec.

- [ ] **Step 3: Commit**

```bash
git add docs/sistemas/subscriptions.md
git commit -m "docs(subs): sistema de suscripciones Fase 1 (modelo + resolución + enforcement)"
```

---

## Self-review

- **Cobertura del spec (Fase 1)**: tablas family_entitlements + subscription_events (T1), trial_days + backfill piso (T1), seed trigger (T1), apply_subscription_transaction + ordering (T2), resolve_entitlement cascada (T2), snapshot con cap/count (T2), cap check en create_family_invite (T3), hook cliente (T4), SubscriptionGate overlay (T5), nudge por umbrales solo trial (T6), aviso leave-family (T7), validación+doc (T8). Fases 2-4 (expo-iap, validate-purchase, webhook, ASC) explícitamente fuera.
- **Placeholders**: los pasos de SQL traen el código completo; T3 y T5 tienen una nota de "confirmar el body/firma real antes de aplicar" porque tocan código existente que hay que leer en el momento — no es placeholder de lógica, es la verificación obligatoria pre-edición.
- **Consistencia de tipos**: `EntitlementSnapshot`/`normalizeEntitlementSnapshot` (T4) consumidos por el gate (T5) y el nudge (T6); `source`/`days_left`/`has_access` idénticos entre el SQL (T2) y el normalizador (T4); `TRIAL_NUDGE_THRESHOLDS = [7,3,1]` consistente con el spec §6.3.
- **Riesgo conocido**: T5 asume que `BillingScreen` puede montarse como componente con `lockMode`; si hoy es una screen de router pura, el primer paso real es extraer su contenido — anotado en la nota del task.
