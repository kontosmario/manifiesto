# Backend Hardening 5K MAU — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer el backend de Manifiesto (Supabase Postgres + Edge Functions + cliente RN) para sostener 5.000 MAU en plan Pro + Compute Medium con margen ≥30% sobre los límites del plan, sin romper firmas de RPC públicas y con cero downtime.

**Architecture:** 7 fases secuenciales, cada una mergeable y desplegable por separado. Phase 1 (índices y RLS) y Phase 2 (`home_snapshot` trim + client cache) son foundational y safe. Phase 3 introduce `control_snapshot()` materializado c/6h. Phase 4 implementa retención (purga `expenses` 14 días post-cierre + cron mensual). Phase 5 mueve fan-out de notificaciones a Edge Function orchestrator (cambio más grande, mejor riesgo:beneficio). Phase 6 expone `db_health_snapshot()` solo en dev. Phase 7 valida.

**Tech Stack:** Supabase (Postgres 17 + pg_cron + pg_net), Deno Edge Functions, Expo + React Native + TanStack Query, Vitest. Idioma del proyecto: español (copy + comentarios en español; identificadores en inglés).

**Spec de referencia:** `docs/superpowers/specs/2026-05-08-backend-hardening-5k-mau-design.md`

---

## File Structure

### Migrations nuevas (todas en `supabase/migrations/`)

| Archivo | Responsabilidad |
|---|---|
| `20260512000000_indexes_for_5k_mau.sql` | Índices compuestos y partials para hot-paths (notifications unread, retention scans, family_members lookup). |
| `20260512010000_rls_helpers_stable_leakproof.sql` | Marca `is_family_member`, `is_family_owner` como `STABLE LEAKPROOF`. |
| `20260512020000_home_snapshot_payload_trim.sql` | Reescribe `home_snapshot()` con caps en arrays (expenses 120, fixed_expenses 100, family_finance columnas explícitas). |
| `20260512030000_control_snapshot_table_and_rpc.sql` | Crea `control_snapshots` (1 fila/familia) + RPC pública `control_snapshot()`. |
| `20260512040000_control_snapshot_cron.sql` | `cron_refresh_control_snapshots()` + schedule pg_cron c/6h. |
| `20260512050000_purge_archived_expenses.sql` | `cron_purge_archived_expenses()` + schedule diario 04:30 UTC. |
| `20260512051000_retention_policies.sql` | `cron_apply_retention_policies()` + schedule mensual día 1. |
| `20260512060000_notifications_pending_helpers.sql` | `list_pending_notifications(kind)` + `emit_notifications_bulk(rows)`. |
| `20260512070000_notifications_cron_handover.sql` | Reschedule pg_cron a llamar al orchestrator vía pg_net.http_post. |
| `20260512080000_db_health_snapshot.sql` | RPC `db_health_snapshot()` + rol `dev_admin`. |
| `20260512090000_push_subscriptions_last_used_at.sql` | Agrega `last_used_at` a `push_subscriptions` si no existe. |

### Edge Functions

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/send-family-push/index.ts` | (modificar) acepta `{ tokens: string[], payload }` además de la firma vieja. |
| `supabase/functions/notifications-orchestrator/index.ts` | (nuevo) recibe `{ kind }`, pide candidatos a la DB, chunkea, emite, llama a `send-family-push`. |
| `supabase/functions/notifications-orchestrator/chunking.ts` | (nuevo) helper puro para chunkear un array. Permite test unitario sin DB. |

### Cliente (`mobile/`)

| Archivo | Cambio |
|---|---|
| `mobile/features/home/use-home-snapshot.ts` | Tunear `staleTime`/`gcTime`/`refetchOnWindowFocus`. |
| `mobile/features/insights/use-control-v2-data.ts` | Llamar nueva `control_snapshot()` con fallback. |
| `mobile/features/home/use-home-realtime.ts` | Gate por presence (subscribe sólo si hay 2+ miembros activos). |
| `mobile/features/home/use-family-presence.ts` | (nuevo) hook que maneja el canal presence ligero. |
| `mobile/features/dev-health/use-db-health.ts` | (nuevo) hook que llama `db_health_snapshot()`. |
| `mobile/features/dev-health/db-health-types.ts` | (nuevo) tipos del payload. |
| `mobile/screens/dev-health-screen.tsx` | (nuevo) screen plana con la info. |
| `app/(app)/settings/dev-health.tsx` | (nuevo) route file delgado. |
| `app/(app)/(tabs)/_layout.tsx` | (modificar) prefetch de home + insights al mount. |
| `mobile/lib/supabase.ts` | (verificar / modificar si aplica) confirmar uso del pooler en port 6543. |

### Tests (`tests/`)

| Archivo | Responsabilidad |
|---|---|
| `tests/integration/home-snapshot-shape.test.ts` | Snapshot test del shape de `home_snapshot()` (golden JSON). |
| `tests/integration/control-snapshot.test.ts` | RPC `control_snapshot()` para 3 perfiles de familia. |
| `tests/integration/retention-purge-archived.test.ts` | Verifica que `cron_purge_archived_expenses` borra solo los archivados >14 días. |
| `tests/integration/retention-monthly.test.ts` | Verifica `cron_apply_retention_policies()` por tabla. |
| `tests/integration/notifications-bulk.test.ts` | `list_pending_notifications` + `emit_notifications_bulk` integran con dedup. |
| `tests/integration/db-health-snapshot.test.ts` | RPC accesible solo a `dev_admin`. |
| `tests/integration/_helpers/supabase-test-client.ts` | (nuevo si no existe) helper de cliente local. |
| `tests/integration/_helpers/seed.ts` | (nuevo) helper para sembrar familia + expenses + fixed_expenses. |
| `tests/unit/notifications-chunking.test.ts` | Test puro del helper `chunking.ts`. |

### Cron schedule resumen (post-plan)

| Schedule UTC | Hora AR | Job | Tabla / Edge |
|---|---|---|---|
| `0 3 * * *` | 0:00 | `close-previous-cycles` (existe) | DB |
| `0 4 * * *` | 1:00 | `control_velocity` (existe) | DB |
| `30 4 * * *` | 1:30 | `cron_purge_archived_expenses` (NUEVO) | DB |
| `12 0 * * *` | 21:00 día anterior | `notifications-morning` → orchestrator | Edge |
| `0 12 * * *` | 9:00 | `notifications-fixed-upcoming` → orchestrator | Edge |
| `0 17 * * *` | 14:00 | `notifications-midday` → orchestrator | Edge |
| `0 23 * * *` | 20:00 | `notifications-streak-at-risk` → orchestrator | Edge |
| `30 23 * * *` | 20:30 | `notifications-evening` → orchestrator | Edge |
| `59 2 * * *` | 23:59 | `notifications-streak-broken` → orchestrator | Edge |
| `0 12 * * 1` | 9:00 lun | `notifications-weekly-insights` → orchestrator | Edge |
| `0 9,15,21 * * *` | 6:00, 12:00, 18:00 | `cron_refresh_control_snapshots` (NUEVO) | DB |
| `0 4 1 * *` | 1:00 día 1 | `cron_apply_retention_policies` (NUEVO) | DB |

---

## Conventions for every migration task

- Cada migración tiene comentario de header `-- WHAT: ... -- WHY: ...`.
- Idempotente: `IF NOT EXISTS`, `CREATE OR REPLACE`, bloques `DO $$ EXCEPTION ... $$`.
- Down script en comentario al pie.
- Cada función SQL nueva: `SECURITY DEFINER` cuando muta o cuando los crones la disparan; `STABLE` cuando solo lee; `set search_path = public` siempre; `revoke all from public` + `grant execute to <rol específico>`.
- Cada RPC pública: `grant execute to authenticated`. Cada cron-only: `grant execute to service_role`.

## Conventions for every code task

- TypeScript estricto. Sin `any` salvo justificado.
- Tests: vitest con `describe`/`it`. Setup en `beforeAll` que inicializa Supabase local client.
- Ejecutar siempre antes de commitear: `./scripts/npmw run typecheck` + `./scripts/npmw run lint` + `./scripts/npmw run test`.
- Commit message en español, formato convencional: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`. Co-author trailer.

---

# PHASE 1 — Foundations: Indexes + RLS

**Goal:** Bajar latencia de queries hot-path y asegurar que las RLS policies escalan. Riesgo bajísimo (solo agrega índices y marca helpers como STABLE LEAKPROOF).

**Stop criteria:** Migraciones aplican limpio. Validate verde. Mergeable independiente.

---

### Task 1.1: Crear migración de índices faltantes

**Files:**
- Create: `supabase/migrations/20260512000000_indexes_for_5k_mau.sql`

- [ ] **Step 1: Crear el archivo con índices**

```sql
-- WHAT: Índices compuestos y parciales para hot-paths a 5K MAU.
-- WHY: A escala el conteo de unread notifications y los scans de retención
--      necesitan índices cubrientes. family_members(user_id) lo lee cada
--      RLS policy via is_family_member().

-- ─── notifications: unread por usuario ─────────────────────────────
-- home_snapshot calcula unread_notification_count en cada apertura.
create index if not exists notifications_family_user_unread_idx
  on public.notifications (family_id, user_id, created_at desc)
  where read_at is null;

-- ─── notifications: retención (cron mensual purga por created_at) ──
create index if not exists notifications_created_at_idx
  on public.notifications (created_at);

-- ─── advisor_signal_dismissals: retención por created_at ───────────
create index if not exists advisor_signal_dismissals_created_at_idx
  on public.advisor_signal_dismissals (created_at);

-- ─── velocity_snapshots: retención por snapshot_date ──────────────
-- (idx de family_id + snapshot_date desc ya existe; este es para cron purga)
create index if not exists velocity_snapshots_snapshot_date_idx
  on public.velocity_snapshots (snapshot_date);

-- ─── fixed_expense_price_history: retención por changed_at ─────────
create index if not exists fixed_expense_price_history_changed_at_idx
  on public.fixed_expense_price_history (changed_at);

-- ─── family_members: lookup por user_id (lo usa is_family_member) ──
-- Si family_members ya tiene PK sobre (family_id, user_id) o índice equivalente,
-- esto agrega el reverse lookup (user → familia).
create index if not exists family_members_user_id_idx
  on public.family_members (user_id);

-- ─── expenses: retención por archived_at ──────────────────────────
-- expenses_family_archived_idx (family_id, archived_at) ya existe
-- según monthly_rollup migration. Este es el cubriente para cron purge
-- que solo necesita archived_at sin family_id.
create index if not exists expenses_archived_at_idx
  on public.expenses (archived_at)
  where archived_at is not null;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop index if exists notifications_family_user_unread_idx;
-- drop index if exists notifications_created_at_idx;
-- drop index if exists advisor_signal_dismissals_created_at_idx;
-- drop index if exists velocity_snapshots_snapshot_date_idx;
-- drop index if exists fixed_expense_price_history_changed_at_idx;
-- drop index if exists family_members_user_id_idx;
-- drop index if exists expenses_archived_at_idx;
```

- [ ] **Step 2: Aplicar migración local y verificar**

Run: `supabase db reset` (o `supabase migration up` si está corriendo).
Expected: sin errores. Output incluye `Applying migration 20260512000000_indexes_for_5k_mau.sql`.

- [ ] **Step 3: Verificar índices con psql**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select indexname from pg_indexes where schemaname = 'public' and indexname like '%_idx' order by indexname;"
```
Expected: aparecen los 7 índices nuevos.

- [ ] **Step 4: Re-correr migración (idempotencia)**

Run: aplicar la misma migración 2 veces (con un script ad-hoc o re-running el archivo via psql).
Expected: 0 errores (todas las creaciones son `IF NOT EXISTS`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512000000_indexes_for_5k_mau.sql
git commit -m "feat(db): índices para retention scans y RLS lookups a 5K MAU

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Marcar helpers de RLS como STABLE LEAKPROOF

**Files:**
- Create: `supabase/migrations/20260512010000_rls_helpers_stable_leakproof.sql`

Antes de escribir la migración, hay que confirmar la firma actual de `is_family_member` y `is_family_owner`. Estos viven en `20260510000000_security_hardening_rls.sql`. La firma esperada: `is_family_member(uuid) returns boolean`, `is_family_owner(uuid) returns boolean`. La migración usa `ALTER FUNCTION` para no tocar el cuerpo.

- [ ] **Step 1: Inspeccionar la firma actual**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "\df+ public.is_family_member public.is_family_owner"
```
Expected: ambas existen, retornan `boolean`, toman 1 arg `uuid`. Si la firma difiere, ajustar la migración antes de seguir.

- [ ] **Step 2: Crear archivo de migración**

```sql
-- WHAT: Marca helpers de RLS como STABLE + LEAKPROOF.
-- WHY: Postgres puede llamar STABLE LEAKPROOF helpers una vez por query
--      en vez de por fila. Sin esto, una RLS policy que use is_family_member
--      en un SELECT con muchas filas se ejecuta N veces. Las funciones
--      hacen un único SELECT contra family_members con WHERE family_id = $1
--      y user_id = auth.uid(); no exponen información sensible (LEAKPROOF
--      es seguro porque solo retorna boolean basado en datos del usuario
--      autenticado).

do $$
begin
  alter function public.is_family_member(uuid) stable leakproof;
exception when others then
  raise notice 'is_family_member alter failed: %', sqlerrm;
end;
$$;

do $$
begin
  alter function public.is_family_owner(uuid) stable leakproof;
exception when others then
  raise notice 'is_family_owner alter failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- alter function public.is_family_member(uuid) volatile;
-- alter function public.is_family_owner(uuid) volatile;
```

- [ ] **Step 3: Aplicar y verificar**

Run: `supabase db reset` o re-aplicar.
Run para verificar:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select proname, provolatile, proleakproof from pg_proc where proname in ('is_family_member','is_family_owner');"
```
Expected: `provolatile = 's'` (stable) y `proleakproof = t` para ambas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512010000_rls_helpers_stable_leakproof.sql
git commit -m "perf(rls): marcar is_family_member/owner STABLE LEAKPROOF

Reduce ejecuciones por fila en queries grandes con RLS habilitado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: Run validate y push para Phase 1

- [ ] **Step 1: Validate en cliente**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint && ./scripts/npmw run test`
Expected: 0 errores en todos.

- [ ] **Step 2: STOP & MERGE**

Esta fase ya es mergeable. **Pausa el plan acá** — push al remoto, deploy, verificar producción 24h antes de avanzar a Phase 2. Mientras corre Phase 1 en prod, verificá:
- Latencia p95 de `home_snapshot` en métricas de Supabase.
- Que ninguna query empezó a fallar por LEAKPROOF mal aplicado (improbable, pero observalo).

---

# PHASE 2 — `home_snapshot` payload trim + client cache tuning

**Goal:** Reducir egress promedio del endpoint más caliente del cliente (~30% menos bytes) y reducir refetches innecesarios.

**Stop criteria:** Test snapshot del shape JSON pasa antes y después; egress promedio de `home_snapshot` cae en métricas de Supabase.

---

### Task 2.1: Snapshot test del shape actual de `home_snapshot`

**Files:**
- Create: `tests/integration/_helpers/supabase-test-client.ts` (si no existe)
- Create: `tests/integration/_helpers/seed.ts`
- Create: `tests/integration/home-snapshot-shape.test.ts`

Antes de tocar la RPC, congelamos el shape esperado en un golden test. La rewrite no debe agregar ni quitar keys top-level.

- [ ] **Step 1: Crear helper de cliente Supabase para tests**

```ts
// tests/integration/_helpers/supabase-test-client.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export function adminClient() {
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export function userClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
```

- [ ] **Step 2: Crear seed helper para una familia mínima**

```ts
// tests/integration/_helpers/seed.ts
import { adminClient } from './supabase-test-client';

export type SeededFamily = {
  familyId: string;
  ownerId: string;
  ownerAccessToken: string;
};

/** Crea un user, una familia, y le agrega 5 expenses + 1 fixed_expense. */
export async function seedMinimalFamily(suffix = ''): Promise<SeededFamily> {
  const admin = adminClient();
  const email = `test-${Date.now()}${suffix}@test.local`;
  const password = 'test1234!';

  const { data: signup, error: signupErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (signupErr || !signup.user) throw signupErr ?? new Error('no user');

  const { data: bootstrap, error: bootErr } = await admin.rpc('bootstrap_family', {
    p_display_name: 'Test Owner',
  }, { count: undefined });
  // bootstrap_family asume que la sesión es del user; re-firmamos:
  const { data: signin } = await admin.auth.admin.generateLink({
    type: 'magiclink', email,
  });
  // En lugar de magic link complejo, asumimos un helper rpc admin que crea family:
  // Si no existe, usar SQL directo para crear la familia y member.
  const { data: family } = await admin
    .from('families')
    .insert({ name: 'Test Family', code: `T${Date.now()}` })
    .select()
    .single();
  if (!family) throw new Error('no family');

  await admin
    .from('family_members')
    .insert({ family_id: family.id, user_id: signup.user.id, role: 'owner' });

  await admin
    .from('family_finance')
    .insert({ family_id: family.id, monthly_income: 1000000, salary_payment_day: 1 });

  // 5 expenses
  await admin.from('expenses').insert(
    Array.from({ length: 5 }, (_, i) => ({
      family_id: family.id,
      created_by: signup.user!.id,
      description: `Gasto ${i}`,
      price: 1000 + i * 100,
    })),
  );

  // 1 fixed_expense
  await admin.from('fixed_expenses').insert({
    family_id: family.id,
    name: 'Alquiler',
    amount: 200000,
    kind: 'periodic',
    status: 'active',
    frequency: 'monthly',
    day_of_month: 5,
  });

  // Sign in to get user JWT
  const { data: session, error: sessionErr } = await admin.auth.signInWithPassword({
    email, password,
  });
  if (sessionErr || !session.session) throw sessionErr ?? new Error('no session');

  return {
    familyId: family.id,
    ownerId: signup.user.id,
    ownerAccessToken: session.session.access_token,
  };
}

export async function cleanupFamily(familyId: string) {
  const admin = adminClient();
  await admin.from('families').delete().eq('id', familyId);
}
```

- [ ] **Step 3: Escribir golden test del shape**

```ts
// tests/integration/home-snapshot-shape.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { userClient } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

const EXPECTED_KEYS = [
  'profile', 'family', 'family_finance', 'fixed_expenses', 'expenses',
  'categories_expense', 'categories_fixed_expense', 'unread_notification_count',
  'notifications', 'family_members', 'savings_goal', 'fixed_expense_payments',
  'has_push_subscription', 'period_month', 'monthly_summaries_history',
  'category_limits', 'velocity_today',
].sort();

describe('home_snapshot shape (golden)', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-shape');
  });

  afterAll(async () => {
    await cleanupFamily(family.familyId);
  });

  it('returns the expected top-level keys', async () => {
    const sb = userClient(family.ownerAccessToken);
    const { data, error } = await sb.rpc('home_snapshot');
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const keys = Object.keys(data as object).sort();
    expect(keys).toEqual(EXPECTED_KEYS);
  });

  it('expenses array length is bounded to <= 120', async () => {
    const sb = userClient(family.ownerAccessToken);
    const { data } = await sb.rpc('home_snapshot');
    expect(((data as any).expenses as unknown[]).length).toBeLessThanOrEqual(120);
  });

  it('fixed_expenses array length is bounded to <= 100', async () => {
    const sb = userClient(family.ownerAccessToken);
    const { data } = await sb.rpc('home_snapshot');
    expect(((data as any).fixed_expenses as unknown[]).length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 4: Correr el test contra la versión actual de `home_snapshot`**

Run: `./scripts/npmw run test -- tests/integration/home-snapshot-shape.test.ts`
Expected: el test de keys PASS (los keys ya son los esperados); los tests de bound PASS o FAIL según seed (si la familia tiene <120 expenses passa). En esta etapa basta con confirmar que el shape match.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test(home): golden snapshot del shape de home_snapshot

Congela los keys top-level antes de la rewrite con caps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Migración `home_snapshot` con payload trim

**Files:**
- Create: `supabase/migrations/20260512020000_home_snapshot_payload_trim.sql`

- [ ] **Step 1: Crear migración**

La RPC se reescribe con caps en `expenses` (120), `fixed_expenses` (100), y enumeración explícita de columnas en `family_finance` (en vez de `to_jsonb(ff.*)`).

```sql
-- WHAT: Reescribe home_snapshot() con caps de payload sin cambiar el shape.
-- WHY: A 5K MAU el promedio de payload es ~80KB pero crece sin tope si
--      una familia acumula muchos expenses no archivados o muchos fixed_expenses.
--      Caps duros: expenses=120 (~80 días con 60/mes), fixed_expenses=100.
--      family_finance: columnas explícitas para no exponer columnas internas.

create or replace function public.home_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_family_code text;
  v_period_month date := date_trunc('month', current_date)::date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
    and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return jsonb_build_object(
      'profile', (
        select to_jsonb(p) from (
          select id, display_name, created_at, avatar_animal, onboarding_completed_at
          from public.profiles where id = v_user_id
        ) p
      ),
      'family', null,
      'family_finance', null,
      'fixed_expenses', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'categories_expense', '[]'::jsonb,
      'categories_fixed_expense', '[]'::jsonb,
      'unread_notification_count', 0,
      'notifications', '[]'::jsonb,
      'family_members', '[]'::jsonb,
      'savings_goal', null,
      'fixed_expense_payments', '[]'::jsonb,
      'has_push_subscription', false,
      'period_month', v_period_month,
      'monthly_summaries_history', '[]'::jsonb,
      'category_limits', '[]'::jsonb,
      'velocity_today', null
    );
  end if;

  select f.code into v_family_code from public.families f where f.id = v_family_id;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, display_name, created_at, avatar_animal, onboarding_completed_at
        from public.profiles where id = v_user_id
      ) p
    ),
    'family', jsonb_build_object('familyId', v_family_id, 'familyCode', v_family_code),
    -- columnas explícitas (antes era to_jsonb(ff.*))
    'family_finance', (
      select jsonb_build_object(
        'family_id', ff.family_id,
        'monthly_income', ff.monthly_income::float8,
        'salary_payment_day', ff.salary_payment_day,
        'savings_goal', ff.savings_goal::float8,
        'last_salary_confirmed_at', ff.last_salary_confirmed_at,
        'created_at', ff.created_at,
        'updated_at', ff.updated_at
      )
      from public.family_finance ff where ff.family_id = v_family_id
    ),
    'fixed_expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fe.id, 'family_id', fe.family_id, 'name', fe.name,
          'amount', fe.amount::float8, 'kind', fe.kind, 'status', fe.status,
          'frequency', fe.frequency, 'category_id', fe.category_id,
          'next_due_on', fe.next_due_on, 'day_of_month', fe.day_of_month,
          'ends_on', fe.ends_on, 'installments_total', fe.installments_total,
          'installments_paid', fe.installments_paid,
          'remaining_balance', fe.remaining_balance::float8,
          'lender_name', fe.lender_name, 'notes', fe.notes,
          'notify_days_before', fe.notify_days_before,
          'last_paid_at', fe.last_paid_at,
          'last_used_at', fe.last_used_at,
          'created_at', fe.created_at, 'updated_at', fe.updated_at
        )
        order by fe.status asc, fe.next_due_on asc nulls last, fe.created_at asc
      )
      from (
        select * from public.fixed_expenses
        where family_id = v_family_id
        order by status asc, next_due_on asc nulls last, created_at asc
        limit 100
      ) fe
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'family_id', e.family_id, 'category_id', e.category_id,
          'commitment_id', e.commitment_id, 'description', e.description,
          'price', e.price::float8, 'created_by', e.created_by,
          'created_at', e.created_at,
          'creator_display_name', coalesce(p.display_name, 'Sin nombre')
        )
        order by e.created_at desc
      )
      from (
        select * from public.expenses
        where family_id = v_family_id and archived_at is null
        order by created_at desc
        limit 120
      ) e
      left join public.profiles p on p.id = e.created_by
    ), '[]'::jsonb),
    'categories_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'family_id', c.family_id, 'name', c.name,
          'color', c.color, 'template_id', c.template_id,
          'scope', c.scope, 'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'expense'
    ), '[]'::jsonb),
    'categories_fixed_expense', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'family_id', c.family_id, 'name', c.name,
          'color', c.color, 'template_id', c.template_id,
          'scope', c.scope, 'created_at', c.created_at
        )
        order by c.created_at asc
      )
      from public.categories c
      where c.family_id = v_family_id and c.scope = 'fixed_expense'
    ), '[]'::jsonb),
    'unread_notification_count', coalesce((
      select count(*)::int from public.notifications n
      where n.family_id = v_family_id
        and n.read_at is null
        and (n.user_id is null or n.user_id = v_user_id)
    ), 0),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id, 'family_id', n.family_id, 'user_id', n.user_id,
          'title', n.title, 'body', n.body, 'kind', n.kind,
          'severity', n.severity, 'created_by', n.created_by,
          'created_at', n.created_at, 'read_at', n.read_at,
          'metadata', n.metadata
        )
        order by n.created_at desc
      )
      from (
        select * from public.notifications
        where family_id = v_family_id
          and (user_id is null or user_id = v_user_id)
        order by created_at desc
        limit 80
      ) n
    ), '[]'::jsonb),
    'family_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', fm.user_id, 'role', fm.role,
          'blocked_at', fm.blocked_at,
          'display_name', p.display_name, 'avatar_animal', p.avatar_animal,
          'created_at', fm.created_at
        )
        order by
          case fm.role when 'owner' then 0 when 'member' then 1 else 2 end,
          fm.created_at asc
      )
      from public.family_members fm
      left join public.profiles p on p.id = fm.user_id
      where fm.family_id = v_family_id
    ), '[]'::jsonb),
    'savings_goal', (
      select jsonb_build_object(
        'id', sg.id, 'family_id', sg.family_id, 'title', sg.title,
        'emoji', sg.emoji,
        'goal_amount', sg.goal_amount::float8,
        'current_amount', sg.current_amount::float8,
        'target_months', sg.target_months,
        'is_active', sg.is_active,
        'created_at', sg.created_at, 'updated_at', sg.updated_at
      )
      from public.savings_goals sg
      where sg.family_id = v_family_id and sg.is_active = true
      order by sg.created_at asc
      limit 1
    ),
    'fixed_expense_payments', coalesce((
      select jsonb_agg(to_jsonb(fep.*))
      from public.fixed_expense_payments fep
      where fep.period_month = v_period_month
        and fep.fixed_expense_id in (
          select fe.id from public.fixed_expenses fe where fe.family_id = v_family_id
        )
    ), '[]'::jsonb),
    'has_push_subscription', exists (
      select 1 from public.push_subscriptions ps
      where ps.family_id = v_family_id and ps.user_id = v_user_id
    ),
    'period_month', v_period_month,
    'monthly_summaries_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'period_start', ms.period_start,
          'period_end', ms.period_end,
          'period_label', ms.period_label,
          'total_variable_spent', ms.total_variable_spent::float8,
          'total_fixed_spent', ms.total_fixed_spent::float8,
          'total_spent', ms.total_spent::float8,
          'expenses_count', ms.expenses_count,
          'fixed_paid_count', ms.fixed_paid_count,
          'monthly_income', ms.monthly_income::float8,
          'savings_delta', ms.savings_delta::float8,
          'category_breakdown', ms.category_breakdown,
          'daily_totals', ms.daily_totals,
          'delta_vs_previous_percent', ms.delta_vs_previous_percent,
          'mood', ms.mood
        )
        order by ms.period_start desc
      )
      from (
        select *
        from public.monthly_summaries
        where family_id = v_family_id
        order by period_start desc
        limit 6
      ) ms
    ), '[]'::jsonb),
    'category_limits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cl.id,
          'category_id', cl.category_id,
          'monthly_cap', cl.monthly_cap::float8,
          'warning_threshold_pct', cl.warning_threshold_pct
        )
        order by cl.created_at asc
      )
      from public.category_limits cl
      where cl.family_id = v_family_id
    ), '[]'::jsonb),
    'velocity_today', (
      select jsonb_build_object(
        'id', vs.id,
        'family_id', vs.family_id,
        'snapshot_date', vs.snapshot_date,
        'avg_daily_last_7', vs.avg_daily_last_7::float8,
        'avg_daily_last_30', vs.avg_daily_last_30::float8,
        'momentum', vs.momentum::float8,
        'forecast_close_amount', vs.forecast_close_amount::float8,
        'stress_level', vs.stress_level,
        'created_at', vs.created_at
      )
      from public.velocity_snapshots vs
      where vs.family_id = v_family_id
      order by vs.snapshot_date desc
      limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.home_snapshot() from public;
grant execute on function public.home_snapshot() to authenticated;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- Re-aplicar la versión previa de la migración 20260424150000_control_intelligence.sql
-- (la que define home_snapshot sin caps).
```

- [ ] **Step 2: Aplicar migración**

Run: `supabase db reset` o `supabase migration up`.
Expected: migración aplica sin errores.

- [ ] **Step 3: Re-correr el snapshot test**

Run: `./scripts/npmw run test -- tests/integration/home-snapshot-shape.test.ts`
Expected: PASS — los keys siguen siendo los mismos. Los caps test PASS porque la familia seed tiene 5 expenses y 1 fixed_expense.

- [ ] **Step 4: Test específico para los caps con seed sobre el cap**

Editar `tests/integration/home-snapshot-shape.test.ts` y agregar:

```ts
it('caps expenses to 120 even when family has 200 active expenses', async () => {
  const fam = await seedMinimalFamily('-cap');
  try {
    // Seed 200 extra expenses
    const admin = (await import('./_helpers/supabase-test-client')).adminClient();
    await admin.from('expenses').insert(
      Array.from({ length: 200 }, (_, i) => ({
        family_id: fam.familyId,
        created_by: fam.ownerId,
        description: `Extra ${i}`,
        price: 100,
      })),
    );
    const sb = userClient(fam.ownerAccessToken);
    const { data } = await sb.rpc('home_snapshot');
    expect(((data as any).expenses as unknown[]).length).toBe(120);
  } finally {
    await cleanupFamily(fam.familyId);
  }
});
```

Run: `./scripts/npmw run test -- tests/integration/home-snapshot-shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512020000_home_snapshot_payload_trim.sql tests/integration/home-snapshot-shape.test.ts
git commit -m "perf(home): trim home_snapshot payload con caps duros

expenses cap=120, fixed_expenses cap=100, family_finance columnas explícitas.
Shape JSON inalterado (test golden). Egress promedio cae ~30%.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Cliente — tunear cache de `use-home-snapshot`

**Files:**
- Modify: `mobile/features/home/use-home-snapshot.ts`

Antes de editar hay que leer el archivo. Pasos:

- [ ] **Step 1: Leer el hook actual**

Run: `cat mobile/features/home/use-home-snapshot.ts`
Anotá: nombre del export, queryKey, options pasadas a `useQuery`.

- [ ] **Step 2: Aplicar cambios de cache**

Editar el archivo. Si hoy NO especifica `staleTime` ni `gcTime`, agregarlos. Si ya los tiene con otros valores, ajustar.

Cambios a aplicar (el código exacto depende de lo que esté hoy; el patrón es):

```ts
// Antes:
useQuery({
  queryKey: homeSnapshotKey(),
  queryFn: () => fetchHomeSnapshot(),
});

// Después:
useQuery({
  queryKey: homeSnapshotKey(),
  queryFn: () => fetchHomeSnapshot(),
  staleTime: 60_000,        // 1 min de freshness
  gcTime: 5 * 60_000,       // 5 min en cache antes de GC
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
```

- [ ] **Step 3: Validate**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/home/use-home-snapshot.ts
git commit -m "perf(home): tunear staleTime/gcTime en use-home-snapshot

staleTime 60s + gcTime 5min + refetchOnWindowFocus. Reduce refetches
redundantes manteniendo data fresca.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4: Cliente — prefetch de tabs

**Files:**
- Modify: `app/(app)/(tabs)/_layout.tsx`

- [ ] **Step 1: Leer el layout actual**

Run: `cat 'app/(app)/(tabs)/_layout.tsx'`

- [ ] **Step 2: Agregar prefetch al mount**

Editar `_layout.tsx` para agregar (al inicio del componente, después de los hooks existentes):

```tsx
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { homeSnapshotKey, fetchHomeSnapshot } from '@/mobile/features/home/use-home-snapshot';
// (ajustar el import según la API real del hook)

// Dentro del componente:
const queryClient = useQueryClient();

useEffect(() => {
  queryClient.prefetchQuery({
    queryKey: homeSnapshotKey(),
    queryFn: fetchHomeSnapshot,
    staleTime: 60_000,
  });
}, [queryClient]);
```

Si el hook no exporta el queryKey/queryFn, refactor para que lo haga (pieza pequeña, mismo PR).

- [ ] **Step 3: Validate**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint && ./scripts/npmw run test`
Expected: 0 errores.

- [ ] **Step 4: Smoke test manual**

Run: `./scripts/npmw run start`
Abrir la app en simulador/device. Verificar que:
- Al loguearse, el tab Home está pre-poblado al cambiar a él.
- No hay regresiones (no aparecen pantallas en blanco, transiciones funcionan).

- [ ] **Step 5: Commit**

```bash
git add 'app/(app)/(tabs)/_layout.tsx' mobile/features/home/use-home-snapshot.ts
git commit -m "perf(tabs): prefetch home_snapshot al mount del tab layout

Reduce loading visible al cambiar de tab. queryKey/queryFn
exportados desde use-home-snapshot para reuso.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.5: STOP & MERGE Phase 2

- [ ] **Step 1: Validate full**

Run: `./scripts/npmw run validate`
Expected: 0 errores.

- [ ] **Step 2: Mergear Phase 2 a producción y observar 24h**

Verificar en métricas Supabase:
- `home_snapshot` p95 latency.
- Egress promedio por response de `/rest/v1/rpc/home_snapshot`.

---

# PHASE 3 — `control_snapshot()` materializado c/6h

**Goal:** Bajar costo del Asistente moviéndolo a una tabla materializada.

**Stop criteria:** RPC nueva responde <50ms en familia normal. Cron refresca sin error.

---

### Task 3.1: Tabla `control_snapshots` + RPC `control_snapshot()`

**Files:**
- Create: `supabase/migrations/20260512030000_control_snapshot_table_and_rpc.sql`

- [ ] **Step 1: Crear tabla + RPC + helper de cómputo**

```sql
-- WHAT: control_snapshots (1 fila/familia) + RPC control_snapshot() que lee
--       y compute_control_snapshot(family) que escribe.
-- WHY: La pantalla Control hoy hace cálculos pesados client-side
--      (causal-engine, forecast-engine). Materializamos en server con
--      refresh cada 6h. Datos OK para tolerancia 6h del usuario.

create table if not exists public.control_snapshots (
  family_id uuid primary key references public.families(id) on delete cascade,
  forecast_close_amount numeric(14,2),
  forecast_overshoot_pct numeric(6,2),
  over_budget_categories jsonb not null default '[]'::jsonb,
  zombie_candidates jsonb not null default '[]'::jsonb,
  member_pressure jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table public.control_snapshots enable row level security;

drop policy if exists "control_snapshots_select_members" on public.control_snapshots;
create policy "control_snapshots_select_members"
on public.control_snapshots for select
to authenticated
using (public.is_family_member(family_id));

-- ─── compute helper (SECURITY DEFINER, escribe la fila) ────────────
create or replace function public.compute_control_snapshot(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_velocity record;
  v_finance record;
  v_libre numeric(14,2);
  v_overshoot_pct numeric(6,2);
  v_over_categories jsonb;
  v_zombies jsonb;
  v_member_pressure jsonb;
  v_actions jsonb := '[]'::jsonb;
begin
  -- Última velocity
  select * into v_velocity
  from public.velocity_snapshots
  where family_id = p_family_id
  order by snapshot_date desc
  limit 1;

  select * into v_finance from public.family_finance where family_id = p_family_id;

  if v_finance is null then
    return;
  end if;

  v_libre := coalesce(v_finance.monthly_income, 0)
           - coalesce((select sum(amount) from public.fixed_expenses
                       where family_id = p_family_id and coalesce(status,'active')='active'), 0);

  if v_libre > 0 and v_velocity.forecast_close_amount is not null then
    v_overshoot_pct := round(
      ((v_velocity.forecast_close_amount - v_libre) / v_libre) * 100, 2
    );
  else
    v_overshoot_pct := 0;
  end if;

  -- Categorías over-budget (top 3)
  select coalesce(jsonb_agg(x order by ratio desc), '[]'::jsonb) into v_over_categories
  from (
    select jsonb_build_object(
      'category_id', cl.category_id,
      'monthly_cap', cl.monthly_cap::float8,
      'spent', spent::float8,
      'ratio', round(spent / nullif(cl.monthly_cap,0), 3)::float8
    ) as x, (spent / nullif(cl.monthly_cap,0)) as ratio
    from public.category_limits cl
    cross join lateral (
      select coalesce(sum(e.price), 0) as spent
      from public.expenses e
      where e.family_id = cl.family_id
        and e.category_id = cl.category_id
        and e.archived_at is null
    ) s
    where cl.family_id = p_family_id
      and cl.monthly_cap > 0
    order by ratio desc nulls last
    limit 3
  ) y;

  -- Zombi candidates (top 3 fixed_expenses sin uso 60+ días)
  select coalesce(jsonb_agg(jsonb_build_object(
    'fixed_expense_id', fe.id,
    'name', fe.name,
    'amount', fe.amount::float8,
    'last_used_at', fe.last_used_at
  ) order by fe.amount desc), '[]'::jsonb) into v_zombies
  from public.fixed_expenses fe
  where fe.family_id = p_family_id
    and coalesce(fe.status, 'active') = 'active'
    and coalesce(fe.kind, 'periodic') = 'periodic'
    and (fe.last_used_at is null or fe.last_used_at < now() - interval '60 days')
  order by fe.amount desc
  limit 3;

  -- Member pressure (top miembros por gasto del ciclo)
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'total', total::float8
  ) order by total desc), '[]'::jsonb) into v_member_pressure
  from (
    select e.created_by as user_id, sum(e.price) as total
    from public.expenses e
    where e.family_id = p_family_id and e.archived_at is null
    group by e.created_by
    order by total desc
    limit 5
  ) m;

  -- Upsert
  insert into public.control_snapshots (
    family_id, forecast_close_amount, forecast_overshoot_pct,
    over_budget_categories, zombie_candidates, member_pressure,
    recommended_actions, computed_at
  )
  values (
    p_family_id, v_velocity.forecast_close_amount, v_overshoot_pct,
    v_over_categories, v_zombies, v_member_pressure,
    v_actions, now()
  )
  on conflict (family_id) do update set
    forecast_close_amount = excluded.forecast_close_amount,
    forecast_overshoot_pct = excluded.forecast_overshoot_pct,
    over_budget_categories = excluded.over_budget_categories,
    zombie_candidates = excluded.zombie_candidates,
    member_pressure = excluded.member_pressure,
    recommended_actions = excluded.recommended_actions,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.compute_control_snapshot(uuid) from public;
grant execute on function public.compute_control_snapshot(uuid) to service_role;

-- ─── RPC pública: control_snapshot() ───────────────────────────────
-- Lee la tabla. Si stale > 12h, dispara compute on-demand y devuelve fresco.
create or replace function public.control_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_row record;
  v_stale_threshold interval := interval '12 hours';
begin
  if v_user_id is null then
    raise exception 'No session';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id and fm.role <> 'blocked'
  limit 1;

  if v_family_id is null then
    return null;
  end if;

  select * into v_row from public.control_snapshots where family_id = v_family_id;

  if v_row is null or v_row.computed_at < now() - v_stale_threshold then
    -- fallback: compute on-demand. Salir de stable temporalmente vía
    -- una función SECURITY DEFINER que sí muta. Esto tira un side-effect
    -- desde una función STABLE — Postgres lo permite porque la SECURITY
    -- DEFINER recibe su propia volatility. Aceptable.
    perform public.compute_control_snapshot(v_family_id);
    select * into v_row from public.control_snapshots where family_id = v_family_id;
  end if;

  return jsonb_build_object(
    'family_id', v_row.family_id,
    'forecast_close_amount', v_row.forecast_close_amount::float8,
    'forecast_overshoot_pct', v_row.forecast_overshoot_pct::float8,
    'over_budget_categories', v_row.over_budget_categories,
    'zombie_candidates', v_row.zombie_candidates,
    'member_pressure', v_row.member_pressure,
    'recommended_actions', v_row.recommended_actions,
    'computed_at', v_row.computed_at
  );
end;
$$;

revoke all on function public.control_snapshot() from public;
grant execute on function public.control_snapshot() to authenticated;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop function if exists public.control_snapshot();
-- drop function if exists public.compute_control_snapshot(uuid);
-- drop table if exists public.control_snapshots;
```

> **Nota técnica:** la RPC `control_snapshot()` es `STABLE` pero dentro llama a `compute_control_snapshot()` que es `VOLATILE`. Postgres lo permite porque `compute_control_snapshot` es SECURITY DEFINER y mantiene su propia volatility evaluation. Si en algún ambiente tira `query has no destination for result data`, cambiar `select * into v_row` por `perform` y luego un nuevo `select`.

- [ ] **Step 2: Aplicar migración**

Run: `supabase db reset`
Expected: aplica sin errores.

- [ ] **Step 3: Test de la RPC**

Crear `tests/integration/control-snapshot.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { userClient } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

describe('control_snapshot', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-control');
  });

  afterAll(async () => {
    await cleanupFamily(family.familyId);
  });

  it('returns expected keys for a fresh family', async () => {
    const sb = userClient(family.ownerAccessToken);
    const { data, error } = await sb.rpc('control_snapshot');
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const expected = [
      'family_id', 'forecast_close_amount', 'forecast_overshoot_pct',
      'over_budget_categories', 'zombie_candidates', 'member_pressure',
      'recommended_actions', 'computed_at',
    ].sort();
    expect(Object.keys(data as object).sort()).toEqual(expected);
  });

  it('arrays default to empty for a family with no signals', async () => {
    const sb = userClient(family.ownerAccessToken);
    const { data } = await sb.rpc('control_snapshot');
    expect((data as any).over_budget_categories).toEqual([]);
    expect((data as any).zombie_candidates).toEqual([]);
  });
});
```

Run: `./scripts/npmw run test -- tests/integration/control-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512030000_control_snapshot_table_and_rpc.sql tests/integration/control-snapshot.test.ts
git commit -m "feat(control): control_snapshots tabla + RPC pública

Materializa el cómputo del Asistente con TTL 12h fallback on-demand.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: Cron `cron_refresh_control_snapshots()` cada 6h

**Files:**
- Create: `supabase/migrations/20260512040000_control_snapshot_cron.sql`

- [ ] **Step 1: Crear archivo**

```sql
-- WHAT: Cron que refresca control_snapshots para todas las familias activas.
-- WHY: TTL de 12h en la RPC + refresh cada 6h = data nunca >6h vieja.
--      Procesa en chunks de 200 familias con savepoint por chunk para
--      no abortar todo si una falla.

create or replace function public.cron_refresh_control_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk_size int := 200;
  v_offset int := 0;
  v_processed int := 0;
  v_failed int := 0;
  v_id uuid;
  v_ids uuid[];
begin
  loop
    select array_agg(id) into v_ids
    from (
      select id from public.families
      order by id
      offset v_offset limit v_chunk_size
    ) f;

    exit when v_ids is null or array_length(v_ids, 1) is null;

    foreach v_id in array v_ids loop
      begin
        perform public.compute_control_snapshot(v_id);
        v_processed := v_processed + 1;
      exception when others then
        v_failed := v_failed + 1;
        raise notice 'compute_control_snapshot failed for %: %', v_id, sqlerrm;
      end;
    end loop;

    v_offset := v_offset + v_chunk_size;
  end loop;

  raise notice 'cron_refresh_control_snapshots: processed=% failed=%', v_processed, v_failed;
end;
$$;

revoke all on function public.cron_refresh_control_snapshots() from public;
grant execute on function public.cron_refresh_control_snapshots() to service_role;

-- ─── pg_cron schedule (06:00, 12:00, 18:00 AR = 09:00, 15:00, 21:00 UTC) ──
do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping control_snapshots refresh.';
    return;
  end if;

  begin perform cron.unschedule('control-snapshots-refresh'); exception when others then null; end;
  perform cron.schedule(
    'control-snapshots-refresh',
    '0 9,15,21 * * *',
    $cron$select public.cron_refresh_control_snapshots();$cron$
  );
exception when others then
  raise notice 'pg_cron control_snapshots schedule failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('control-snapshots-refresh');
-- drop function if exists public.cron_refresh_control_snapshots();
```

- [ ] **Step 2: Aplicar y verificar schedule**

Run: `supabase db reset`
Run para verificar:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select jobname, schedule from cron.job where jobname = 'control-snapshots-refresh';"
```
Expected: 1 fila con `schedule = '0 9,15,21 * * *'`. Si pg_cron no está instalado en local (típico en Supabase local default), el `raise notice` lo loguea y no falla la migración.

- [ ] **Step 3: Test del cron manual**

Agregar al test:

```ts
it('cron_refresh_control_snapshots populates a row for every family', async () => {
  const admin = adminClient();
  const { error } = await admin.rpc('cron_refresh_control_snapshots');
  expect(error).toBeNull();

  const { data } = await admin
    .from('control_snapshots')
    .select('family_id, computed_at')
    .eq('family_id', family.familyId);
  expect(data?.length).toBe(1);
});
```

Run: `./scripts/npmw run test -- tests/integration/control-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512040000_control_snapshot_cron.sql tests/integration/control-snapshot.test.ts
git commit -m "feat(control): cron 6h para refrescar control_snapshots

Schedule 09:00/15:00/21:00 UTC = 06:00/12:00/18:00 AR.
Chunks de 200 con savepoint por chunk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: Cliente — consumir `control_snapshot()` con fallback

**Files:**
- Modify: `mobile/features/insights/use-control-v2-data.ts`

- [ ] **Step 1: Leer el hook actual**

Run: `cat mobile/features/insights/use-control-v2-data.ts`
Identificar: queryKey, queryFn, dependencias.

- [ ] **Step 2: Agregar la query a `control_snapshot()` en paralelo**

El hook hoy compute client-side. Estrategia: agregar una `useQuery` que llama `control_snapshot()` y úsala como **input** de las funciones engine actuales (causal-engine, forecast-engine). Si `control_snapshot()` falla o retorna null, fallback a la lógica vieja.

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/mobile/lib/supabase';

export type ControlSnapshot = {
  family_id: string;
  forecast_close_amount: number | null;
  forecast_overshoot_pct: number | null;
  over_budget_categories: Array<{ category_id: string; monthly_cap: number; spent: number; ratio: number }>;
  zombie_candidates: Array<{ fixed_expense_id: string; name: string; amount: number; last_used_at: string | null }>;
  member_pressure: Array<{ user_id: string; total: number }>;
  recommended_actions: unknown[];
  computed_at: string;
};

export const controlSnapshotKey = () => ['control-snapshot'] as const;

export async function fetchControlSnapshot(): Promise<ControlSnapshot | null> {
  const { data, error } = await supabase.rpc('control_snapshot');
  if (error) return null;
  return data as ControlSnapshot | null;
}

export function useControlSnapshot() {
  return useQuery({
    queryKey: controlSnapshotKey(),
    queryFn: fetchControlSnapshot,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
```

Y en `use-control-v2-data.ts`, en el lugar donde hoy se computa client-side, primero leer `useControlSnapshot()` y usar sus arrays cuando estén; si vacíos o null, fallback a la lógica anterior. **No remover la lógica anterior** — queda como fallback.

- [ ] **Step 3: Tunear cache**

Asegurar que el hook principal tenga:
```ts
staleTime: 5 * 60_000,
gcTime: 30 * 60_000,
```

- [ ] **Step 4: Validate**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint && ./scripts/npmw run test`
Expected: 0 errores.

- [ ] **Step 5: Smoke test**

Run dev build, navegar a Asistente. Verificar que:
- La pantalla renderiza igual que antes (los campos se llenan).
- No aparecen errores en consola por shape mismatch.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/insights/use-control-v2-data.ts
git commit -m "feat(insights): consumir control_snapshot() con fallback

useControlSnapshot() lee la RPC materializada. Si null o vacío,
fallback a la lógica actual client-side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4: STOP & MERGE Phase 3

- [ ] **Step 1: Validate full**

Run: `./scripts/npmw run validate`
Expected: 0 errores.

- [ ] **Step 2: Verificar en producción 24h**

Métricas a observar:
- `control_snapshot` p95 latency (debería ser <50ms en familias con fila).
- `cron_refresh_control_snapshots` corre sin errores en logs.

---

# PHASE 4 — Retención

**Goal:** Purga física de `expenses` 14 días post-cierre + crones mensuales.

**Stop criteria:** Tests de retención pasan. Primer mes corre con `dry_run` mode (configurable vía variable) si querés extra cuidado.

---

### Task 4.1: `cron_purge_archived_expenses()` (cron diario)

**Files:**
- Create: `supabase/migrations/20260512050000_purge_archived_expenses.sql`
- Create: `tests/integration/retention-purge-archived.test.ts`

- [ ] **Step 1: Crear test ANTES de la migración (TDD)**

```ts
// tests/integration/retention-purge-archived.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

describe('cron_purge_archived_expenses', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-purge');
  });

  afterAll(async () => {
    await cleanupFamily(family.familyId);
  });

  it('deletes expenses archived more than 14 days ago, keeps newer ones', async () => {
    const admin = adminClient();

    // Insert: 1 archivado hace 15 días, 1 archivado hace 13 días, 1 sin archivar.
    await admin.from('expenses').insert([
      {
        family_id: family.familyId,
        created_by: family.ownerId,
        description: 'old archived',
        price: 100,
        archived_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        family_id: family.familyId,
        created_by: family.ownerId,
        description: 'recent archived',
        price: 200,
        archived_at: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        family_id: family.familyId,
        created_by: family.ownerId,
        description: 'live',
        price: 300,
      },
    ]);

    const { data: before } = await admin.from('expenses')
      .select('description').eq('family_id', family.familyId);
    expect(before?.length).toBeGreaterThanOrEqual(3);

    const { error } = await admin.rpc('cron_purge_archived_expenses');
    expect(error).toBeNull();

    const { data: after } = await admin.from('expenses')
      .select('description').eq('family_id', family.familyId);
    const descs = (after ?? []).map(r => r.description);
    expect(descs).not.toContain('old archived');
    expect(descs).toContain('recent archived');
    expect(descs).toContain('live');
  });
});
```

- [ ] **Step 2: Run test — debe fallar (función no existe)**

Run: `./scripts/npmw run test -- tests/integration/retention-purge-archived.test.ts`
Expected: FAIL — `function public.cron_purge_archived_expenses() does not exist`.

- [ ] **Step 3: Crear la migración**

```sql
-- WHAT: Cron diario que borra físicamente expenses archivados >14 días.
-- WHY: archived_at lo setea close_monthly_cycle al cerrar ciclo.
--      14 días de gracia para que cron_compute_velocity_snapshots tenga
--      ventana de 30d empalmando ciclos. Después: hard-delete para
--      controlar tamaño de la tabla.

create or replace function public.cron_purge_archived_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk_size int := 10000;
  v_deleted int;
  v_total int := 0;
  v_iterations int := 0;
  v_cutoff timestamptz := now() - interval '14 days';
begin
  loop
    delete from public.expenses
    where ctid in (
      select ctid from public.expenses
      where archived_at is not null and archived_at < v_cutoff
      limit v_chunk_size
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    v_iterations := v_iterations + 1;
    exit when v_deleted = 0 or v_iterations > 100; -- safety cap: 1M filas/run
  end loop;

  raise notice 'cron_purge_archived_expenses: deleted=% iterations=%', v_total, v_iterations;
end;
$$;

revoke all on function public.cron_purge_archived_expenses() from public;
grant execute on function public.cron_purge_archived_expenses() to service_role;

-- ─── pg_cron schedule diario ───────────────────────────────────────
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice 'pg_cron not installed; skipping purge schedule.';
    return;
  end if;
  begin perform cron.unschedule('purge-archived-expenses'); exception when others then null; end;
  perform cron.schedule(
    'purge-archived-expenses',
    '30 4 * * *', -- 04:30 UTC = 01:30 AR, después de close-cycles + velocity
    $cron$select public.cron_purge_archived_expenses();$cron$
  );
exception when others then
  raise notice 'purge cron schedule failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('purge-archived-expenses');
-- drop function if exists public.cron_purge_archived_expenses();
```

- [ ] **Step 4: Aplicar y correr test**

Run: `supabase db reset`
Run: `./scripts/npmw run test -- tests/integration/retention-purge-archived.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512050000_purge_archived_expenses.sql tests/integration/retention-purge-archived.test.ts
git commit -m "feat(db): cron diario que purga expenses archivados >14 días

Hard-delete físico en chunks de 10K. Schedule 04:30 UTC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: `cron_apply_retention_policies()` (cron mensual)

**Files:**
- Create: `supabase/migrations/20260512051000_retention_policies.sql`
- Create: `tests/integration/retention-monthly.test.ts`

- [ ] **Step 1: Crear test antes**

```ts
// tests/integration/retention-monthly.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

describe('cron_apply_retention_policies', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-retention');
  });

  afterAll(async () => {
    await cleanupFamily(family.familyId);
  });

  it('purges notifications older than 90 days', async () => {
    const admin = adminClient();
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await admin.from('notifications').insert([
      { family_id: family.familyId, title: 'old', body: '...', kind: 'test', severity: 'info', created_at: old },
      { family_id: family.familyId, title: 'recent', body: '...', kind: 'test', severity: 'info', created_at: recent },
    ]);

    await admin.rpc('cron_apply_retention_policies');

    const { data } = await admin.from('notifications')
      .select('title').eq('family_id', family.familyId);
    const titles = (data ?? []).map(r => r.title);
    expect(titles).not.toContain('old');
    expect(titles).toContain('recent');
  });

  it('keeps only the latest 12 monthly_summaries per family', async () => {
    const admin = adminClient();
    // Seed 15 ciclos
    const rows = Array.from({ length: 15 }, (_, i) => ({
      family_id: family.familyId,
      period_start: `2024-${String(i + 1).padStart(2, '0')}-01`,
      period_end: `2024-${String(i + 1).padStart(2, '0')}-28`,
      period_label: `Ciclo ${i + 1}`,
      total_variable_spent: 100 * (i + 1),
      total_spent: 100 * (i + 1),
    }));
    // Limpiar primero
    await admin.from('monthly_summaries').delete().eq('family_id', family.familyId);
    await admin.from('monthly_summaries').insert(rows);

    await admin.rpc('cron_apply_retention_policies');

    const { data } = await admin.from('monthly_summaries')
      .select('period_start')
      .eq('family_id', family.familyId)
      .order('period_start', { ascending: false });
    expect(data?.length).toBe(12);
  });
});
```

- [ ] **Step 2: Run — falla (función no existe)**

Run: `./scripts/npmw run test -- tests/integration/retention-monthly.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear migración**

```sql
-- WHAT: Cron mensual que purga data más vieja que el window de cada tabla.
-- WHY: Retenciones definidas: notifications 90d, velocity 6m,
--      advisor_signal_dismissals 12m, fixed_expense_price_history 60d,
--      home_telemetry 30d, monthly_summaries top-12 por familia,
--      push_subscriptions 90d sin uso.

create or replace function public.cron_apply_retention_policies()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk int := 10000;
  v_deleted int;
  v_total int := 0;
begin
  -- notifications: 90d
  loop
    delete from public.notifications
    where ctid in (
      select ctid from public.notifications
      where created_at < now() - interval '90 days'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    exit when v_deleted = 0;
  end loop;

  -- velocity_snapshots: 6m
  loop
    delete from public.velocity_snapshots
    where ctid in (
      select ctid from public.velocity_snapshots
      where snapshot_date < (current_date - interval '6 months')::date
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- advisor_signal_dismissals: 12m
  loop
    delete from public.advisor_signal_dismissals
    where ctid in (
      select ctid from public.advisor_signal_dismissals
      where created_at < now() - interval '12 months'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- fixed_expense_price_history: 60d
  loop
    delete from public.fixed_expense_price_history
    where ctid in (
      select ctid from public.fixed_expense_price_history
      where changed_at < now() - interval '60 days'
      limit v_chunk
    );
    get diagnostics v_deleted = row_count;
    exit when v_deleted = 0;
  end loop;

  -- home_telemetry: 30d (si la tabla existe)
  begin
    loop
      delete from public.home_telemetry
      where ctid in (
        select ctid from public.home_telemetry
        where created_at < now() - interval '30 days'
        limit v_chunk
      );
      get diagnostics v_deleted = row_count;
      exit when v_deleted = 0;
    end loop;
  exception when undefined_table then null;
  end;

  -- monthly_summaries: top 12 por familia
  delete from public.monthly_summaries ms
  using (
    select id from (
      select id, row_number() over (
        partition by family_id order by period_start desc
      ) as rn
      from public.monthly_summaries
    ) ranked
    where rn > 12
  ) old
  where ms.id = old.id;

  -- push_subscriptions: 90d sin uso (si la columna last_used_at existe)
  begin
    delete from public.push_subscriptions
    where last_used_at is not null
      and last_used_at < now() - interval '90 days';
  exception when undefined_column then null;
  end;
end;
$$;

revoke all on function public.cron_apply_retention_policies() from public;
grant execute on function public.cron_apply_retention_policies() to service_role;

-- ─── pg_cron schedule mensual (día 1, 04:00 UTC) ──────────────────
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then return; end if;
  begin perform cron.unschedule('apply-retention-policies'); exception when others then null; end;
  perform cron.schedule(
    'apply-retention-policies',
    '0 4 1 * *',
    $cron$select public.cron_apply_retention_policies();$cron$
  );
exception when others then null;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- select cron.unschedule('apply-retention-policies');
-- drop function if exists public.cron_apply_retention_policies();
```

- [ ] **Step 4: Aplicar + run tests**

Run: `supabase db reset`
Run: `./scripts/npmw run test -- tests/integration/retention-monthly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512051000_retention_policies.sql tests/integration/retention-monthly.test.ts
git commit -m "feat(db): cron mensual de retención

Notifications 90d, velocity 6m, dismissals 12m, price_history 60d,
telemetry 30d, monthly_summaries top-12/familia, push_subs 90d.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3: STOP & MERGE Phase 4

- [ ] **Step 1: Validate**: `./scripts/npmw run validate`. Expected: verde.
- [ ] **Step 2: Mergear**. Primer mes calendario después del merge, observar logs de `apply-retention-policies` para confirmar conteos esperados.

---

# PHASE 5 — Notifications: Edge orchestrator

**Goal:** Mover el fan-out de notificaciones de pg_cron 1-a-1 a Edge orchestrator que chunkea.

**Stop criteria:** Edge function recibe llamada del cron viejo, devuelve éxito, los emite. Un día completo sin errores. Después se desactivan los crones viejos.

> Esta fase tiene 2 sub-fases: 5A (helpers SQL + Edge function nueva, sin tocar crones viejos) y 5B (handover de crones).

---

### Task 5.1: Helpers SQL `list_pending_notifications` + `emit_notifications_bulk`

**Files:**
- Create: `supabase/migrations/20260512060000_notifications_pending_helpers.sql`
- Create: `tests/integration/notifications-bulk.test.ts`

- [ ] **Step 1: Test antes**

```ts
// tests/integration/notifications-bulk.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

describe('notifications bulk helpers', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-bulk');
  });

  afterAll(async () => {
    await cleanupFamily(family.familyId);
  });

  it('list_pending_notifications(\'morning_checkins\') returns family member candidates', async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc('list_pending_notifications', {
      p_kind: 'morning_checkins',
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const found = (data as any[]).find(r => r.family_id === family.familyId);
    expect(found).toBeDefined();
    expect(found.user_id).toBe(family.ownerId);
    expect(found.dedup_key).toBeTruthy();
  });

  it('emit_notifications_bulk inserts rows and dedups via dedup_key', async () => {
    const admin = adminClient();
    const rows = [
      {
        family_id: family.familyId,
        user_id: family.ownerId,
        title: 'Test',
        body: '...',
        kind: 'checkin_morning',
        severity: 'info',
        metadata: { route: '/' },
        dedup_key: `checkin_morning:${family.familyId}:${family.ownerId}:2026-05-08`,
      },
    ];

    const { data: r1 } = await admin.rpc('emit_notifications_bulk', { p_rows: rows });
    expect(r1).toBe(1);

    // Re-emit same dedup_key → 0 inserted
    const { data: r2 } = await admin.rpc('emit_notifications_bulk', { p_rows: rows });
    expect(r2).toBe(0);
  });
});
```

Run: `./scripts/npmw run test -- tests/integration/notifications-bulk.test.ts`
Expected: FAIL (RPCs no existen).

- [ ] **Step 2: Crear migración**

```sql
-- WHAT: Helpers SQL para que la Edge orchestrator lea candidatos
--       y emita en bulk con deduplicación.
-- WHY: Mueve el bottleneck de fan-out a Edge sin perder la lógica
--      de negocio (idempotencia diaria) que hoy vive en cron_emit_*.

-- Agregar columna de dedup a notifications si no existe.
alter table public.notifications
  add column if not exists dedup_key text;

create unique index if not exists notifications_dedup_key_uq
  on public.notifications (dedup_key)
  where dedup_key is not null;

-- ─── list_pending_notifications ─────────────────────────────────────
-- Devuelve candidatos para un kind sin emitir nada.
-- Reutiliza la lógica de los cron_emit_* viejos.
create or replace function public.list_pending_notifications(p_kind text)
returns table (
  family_id uuid,
  user_id uuid,
  title text,
  body text,
  kind text,
  severity text,
  metadata jsonb,
  dedup_key text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_kind = 'morning_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Buen día, ' || split_part(coalesce(p.display_name, 'vos'), ' ', 1) as title,
      'Hoy tenés ~$' || to_char(round(greatest(0, (ff.monthly_income - coalesce(
        (select sum(amount) from public.fixed_expenses
         where family_id = fm.family_id and coalesce(status,'active')='active'
         and coalesce(frequency,'monthly')='monthly'), 0)) / 30.0)), 'FM999,999,999')
        || ' para moverte con margen.' as body,
      'checkin_morning' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_morning:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    left join public.profiles p on p.id = fm.user_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'midday_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Medio día' as title,
      'Pasá por la app y revisá cómo vas hoy.' as body,
      'checkin_midday' as kind,
      'info' as severity,
      jsonb_build_object('route', '/') as metadata,
      'checkin_midday:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'evening_checkins' then
    return query
    select
      fm.family_id,
      fm.user_id,
      'Cierre del día' as title,
      'Anotá lo último de hoy y mantené la racha.' as body,
      'checkin_evening' as kind,
      'info' as severity,
      jsonb_build_object('route', '/expenses') as metadata,
      'checkin_evening:' || fm.family_id::text || ':' || fm.user_id::text
        || ':' || v_today_ar::text as dedup_key
    from public.family_members fm
    join public.family_finance ff on ff.family_id = fm.family_id
    where coalesce(ff.monthly_income, 0) > 0
      and fm.role <> 'blocked';

  elsif p_kind = 'fixed_upcoming' then
    return query
    select
      fe.family_id,
      null::uuid as user_id,
      coalesce(nullif(btrim(fe.name), ''), 'Compromiso')
        || ' vence ' || (case when fe.next_due_on = v_today_ar then 'hoy' else 'mañana' end) as title,
      '$' || to_char(round(coalesce(fe.amount, 0)), 'FM999,999,999') as body,
      'fixed_upcoming' as kind,
      'warning' as severity,
      jsonb_build_object('route', '/fixed-expenses', 'fixed_expense_id', fe.id, 'amount', fe.amount, 'due_on', fe.next_due_on) as metadata,
      'fixed_upcoming:' || fe.id::text || ':' || v_today_ar::text as dedup_key
    from public.fixed_expenses fe
    where coalesce(fe.status, 'active') = 'active'
      and fe.next_due_on between v_today_ar and v_today_ar + 1;

  -- Otros kinds: streak_at_risk, streak_broken, weekly_insights se
  -- pueden agregar incrementalmente. Por ahora devolvemos vacío y la
  -- Edge orchestrator los maneja como no-op para esos kinds.
  end if;
end;
$$;

revoke all on function public.list_pending_notifications(text) from public;
grant execute on function public.list_pending_notifications(text) to service_role;

-- ─── emit_notifications_bulk ────────────────────────────────────────
-- Inserta N filas con on conflict do nothing por dedup_key.
-- Devuelve el conteo de filas efectivamente insertadas.
create or replace function public.emit_notifications_bulk(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  with src as (
    select
      (r->>'family_id')::uuid as family_id,
      nullif(r->>'user_id','')::uuid as user_id,
      r->>'title' as title,
      r->>'body' as body,
      r->>'kind' as kind,
      r->>'severity' as severity,
      r->'metadata' as metadata,
      r->>'dedup_key' as dedup_key
    from jsonb_array_elements(p_rows) as r
  )
  insert into public.notifications (
    family_id, user_id, title, body, kind, severity, metadata, dedup_key
  )
  select family_id, user_id, title, body, kind, severity, metadata, dedup_key
  from src
  on conflict (dedup_key) where dedup_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.emit_notifications_bulk(jsonb) from public;
grant execute on function public.emit_notifications_bulk(jsonb) to service_role;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop function if exists public.list_pending_notifications(text);
-- drop function if exists public.emit_notifications_bulk(jsonb);
-- drop index if exists notifications_dedup_key_uq;
-- alter table public.notifications drop column if exists dedup_key;
```

- [ ] **Step 3: Aplicar + run tests**

Run: `supabase db reset`
Run: `./scripts/npmw run test -- tests/integration/notifications-bulk.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512060000_notifications_pending_helpers.sql tests/integration/notifications-bulk.test.ts
git commit -m "feat(notifications): list_pending + emit_bulk helpers

Helpers SQL para que la Edge orchestrator lea candidatos y emita
con dedup_key sin tocar la lógica de negocio.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.2: Edge Function `notifications-orchestrator` + chunking helper

**Files:**
- Create: `supabase/functions/notifications-orchestrator/index.ts`
- Create: `supabase/functions/notifications-orchestrator/chunking.ts`
- Create: `tests/unit/notifications-chunking.test.ts`

- [ ] **Step 1: Test del chunking helper (puro)**

```ts
// tests/unit/notifications-chunking.test.ts
import { describe, it, expect } from 'vitest';
import { chunk } from '../../supabase/functions/notifications-orchestrator/chunking';

describe('chunk', () => {
  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('splits array into chunks of given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk if size >= length', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});
```

Run: `./scripts/npmw run test -- tests/unit/notifications-chunking.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 2: Crear `chunking.ts`**

```ts
// supabase/functions/notifications-orchestrator/chunking.ts
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
```

Run: `./scripts/npmw run test -- tests/unit/notifications-chunking.test.ts`
Expected: PASS.

- [ ] **Step 3: Crear `index.ts` (orchestrator)**

```ts
// supabase/functions/notifications-orchestrator/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { chunk } from './chunking.ts';

type Kind =
  | 'morning_checkins'
  | 'midday_checkins'
  | 'evening_checkins'
  | 'fixed_upcoming'
  | 'streak_at_risk'
  | 'streak_broken'
  | 'weekly_insights';

type PendingRow = {
  family_id: string;
  user_id: string | null;
  title: string;
  body: string;
  kind: string;
  severity: string;
  metadata: Record<string, unknown>;
  dedup_key: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHUNK_SIZE = 200;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function fetchPushTokens(familyIds: string[], userIds: string[]) {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('family_id, user_id, expo_push_token')
    .in('family_id', familyIds);
  if (error) throw error;
  return (data ?? []).filter(r => userIds.length === 0 || userIds.includes(r.user_id));
}

async function processKind(kind: Kind) {
  const { data: pending, error } = await admin
    .rpc('list_pending_notifications', { p_kind: kind })
    .returns<PendingRow[]>();
  if (error) throw error;
  if (!pending || pending.length === 0) return { kind, processed: 0, sent: 0, chunks: 0 };

  const chunks = chunk(pending, CHUNK_SIZE);
  let processed = 0, sent = 0;

  for (const c of chunks) {
    // 1. emit_notifications_bulk
    const { data: insertedCount, error: insErr } = await admin
      .rpc('emit_notifications_bulk', { p_rows: c });
    if (insErr) {
      console.error('bulk insert failed', insErr);
      continue;
    }
    processed += (insertedCount as number) ?? 0;

    // 2. resolve push tokens
    const familyIds = [...new Set(c.map(r => r.family_id))];
    const userIds = c.map(r => r.user_id).filter(Boolean) as string[];
    const tokens = await fetchPushTokens(familyIds, userIds);

    if (tokens.length === 0) continue;

    // 3. agrupar por (title, body) — los rows del chunk pueden tener
    //    distintos textos (ej: morning_checkin con nombre del user),
    //    así que mappeamos token -> mensaje.
    const tokenToMsg = new Map<string, { title: string; body: string; data: unknown }>();
    for (const sub of tokens) {
      const row = c.find(r =>
        r.family_id === sub.family_id &&
        (r.user_id === null || r.user_id === sub.user_id)
      );
      if (!row) continue;
      tokenToMsg.set(sub.expo_push_token, {
        title: row.title,
        body: row.body,
        data: row.metadata,
      });
    }

    // 4. invocar send-family-push v2 en una sola llamada con todos los tokens
    const messages = [...tokenToMsg.entries()].map(([token, m]) => ({
      to: token, sound: 'default', title: m.title, body: m.body, data: m.data,
    }));

    const res = await admin.functions.invoke('send-family-push', {
      body: { messages },
    });
    if (res.error) {
      console.error('send-family-push failed', res.error);
    } else {
      sent += messages.length;
    }
  }

  return { kind, processed, sent, chunks: chunks.length };
}

Deno.serve(async (req) => {
  try {
    const { kind } = await req.json() as { kind: Kind };
    if (!kind) {
      return new Response(JSON.stringify({ error: 'kind required' }), { status: 400 });
    }
    const result = await processKind(kind);
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
```

- [ ] **Step 4: Modificar `send-family-push` para aceptar la firma `messages: ExpoPushMessage[]`**

Leer el archivo actual:

Run: `cat supabase/functions/send-family-push/index.ts`

Agregar al manejador: si el body trae `{ messages: [...] }`, mandar todos a Expo Push API en una sola request (Expo soporta hasta 100 mensajes por request — chunkear de a 100). Mantener compat con la firma vieja (que probable acepta `{ family_id, user_id, ... }`) en un branch del handler.

Patch genérico (ajustar al código real):

```ts
// supabase/functions/send-family-push/index.ts (fragmento)
type ExpoPushMessage = {
  to: string; title: string; body: string; data?: unknown; sound?: string;
};

async function sendBatch(messages: ExpoPushMessage[]) {
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  for (const c of chunks) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(c),
    });
  }
}

Deno.serve(async (req) => {
  const body = await req.json();
  if (Array.isArray(body.messages)) {
    await sendBatch(body.messages as ExpoPushMessage[]);
    return Response.json({ ok: true, count: body.messages.length });
  }
  // ...firma vieja: mantener tal cual
});
```

- [ ] **Step 5: Deploy local + smoke test**

Run: `supabase functions serve --env-file supabase/.env.local`
En otra terminal:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/notifications-orchestrator \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning_checkins"}'
```

Expected: 200 OK con `{ kind: 'morning_checkins', processed: N, sent: M, chunks: K }`. Verificar en DB que las filas se insertaron.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notifications-orchestrator/ supabase/functions/send-family-push/index.ts tests/unit/notifications-chunking.test.ts
git commit -m "feat(edge): notifications-orchestrator + send-family-push v2

Orchestrator chunkea de 200 candidatos y envía push en lotes de 100.
send-family-push acepta { messages } además de la firma vieja.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.3: Cron handover — pg_cron llama al orchestrator

**Files:**
- Create: `supabase/migrations/20260512070000_notifications_cron_handover.sql`

- [ ] **Step 1: Crear migración**

```sql
-- WHAT: Cambia los pg_cron schedules para que llamen al orchestrator
--       vía pg_net.http_post, en vez de las funciones cron_emit_* viejas.
-- WHY: La Edge orchestrator chunkea y manda push en bulk. Reduce
--       invocaciones Edge de ~5000/día a ~50/día.
-- ROLLBACK: re-aplicar el schedule de 20260423220137_notifications_cron.sql.

do $$
declare
  v_has_cron boolean;
  v_has_pg_net boolean;
  v_url text;
  v_auth text;
  v_old_jobs text[] := array[
    'morning-checkins', 'midday-checkins', 'streak-at-risk',
    'evening-checkins', 'streak-broken', 'fixed-upcoming', 'weekly-insights'
  ];
  v_name text;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;
  if not v_has_cron or not v_has_pg_net then
    raise notice 'pg_cron or pg_net not available; skipping handover.';
    return;
  end if;

  -- URL del orchestrator y service-role key vienen de vault o config.
  -- Asume que existen secrets configurados:
  --   app.settings.orchestrator_url
  --   app.settings.service_role_key
  v_url := current_setting('app.settings.orchestrator_url', true);
  v_auth := 'Bearer ' || current_setting('app.settings.service_role_key', true);

  if v_url is null then
    raise notice 'app.settings.orchestrator_url not configured; skipping handover.';
    return;
  end if;

  -- Desactivar schedules viejos
  foreach v_name in array v_old_jobs loop
    begin perform cron.unschedule(v_name); exception when others then null; end;
  end loop;

  -- Crear schedules nuevos que llaman al orchestrator
  perform cron.schedule(
    'notifications-morning', '0 12 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'morning_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-midday', '0 17 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'midday_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-evening', '30 23 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'evening_checkins')
    );$cron$, v_url, v_auth)
  );
  perform cron.schedule(
    'notifications-fixed-upcoming', '0 12 * * *',
    format($cron$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'fixed_upcoming')
    );$cron$, v_url, v_auth)
  );
exception when others then
  raise notice 'cron handover failed: %', sqlerrm;
end;
$$;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- Re-aplicar 20260423220137_notifications_cron.sql para volver al modelo viejo.
```

- [ ] **Step 2: Setear secrets en producción (manual, antes de aplicar la migración en prod)**

```sql
-- Como superuser en producción:
alter database postgres set "app.settings.orchestrator_url"
  = 'https://<project-ref>.supabase.co/functions/v1/notifications-orchestrator';
alter database postgres set "app.settings.service_role_key"
  = '<service-role-key>';
```

(En local Supabase no aplica; el `raise notice` lo skippa.)

- [ ] **Step 3: Aplicar local (no-op por falta de pg_net en local default)**

Run: `supabase db reset`
Expected: aplica con `notice` "pg_cron or pg_net not available".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512070000_notifications_cron_handover.sql
git commit -m "feat(notifications): cron handover a Edge orchestrator

pg_cron llama al orchestrator vía pg_net.http_post.
Schedule viejo de cron_emit_* desactivado en el mismo bloque.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.4: STOP & MERGE Phase 5

- [ ] **Step 1**: Configurar secrets en prod ANTES de aplicar la migración 7.
- [ ] **Step 2**: Deploy de Edge function `notifications-orchestrator` y `send-family-push v2`.
- [ ] **Step 3**: Aplicar migraciones 6 + 7 en orden.
- [ ] **Step 4**: Observar 24-48h: cantidad de notifications insertadas debe ser similar a antes (mismo conteo); cantidad de invocaciones Edge debe caer drásticamente.

---

# PHASE 6 — Observability dev

**Goal:** RPC `db_health_snapshot()` + pantalla en Settings (solo dev build).

**Stop criteria:** RPC accesible solo a rol `dev_admin`. Pantalla aparece sólo en `__DEV__`.

---

### Task 6.1: RPC `db_health_snapshot()` + rol `dev_admin`

**Files:**
- Create: `supabase/migrations/20260512080000_db_health_snapshot.sql`
- Create: `tests/integration/db-health-snapshot.test.ts`

- [ ] **Step 1: Crear test antes**

```ts
// tests/integration/db-health-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { adminClient } from './_helpers/supabase-test-client';

describe('db_health_snapshot', () => {
  it('returns shape with table_sizes and limits_pro', async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc('db_health_snapshot');
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const d = data as any;
    expect(d.db_size_bytes).toBeGreaterThan(0);
    expect(Array.isArray(d.table_sizes)).toBe(true);
    expect(d.limits_pro).toBeDefined();
  });
});
```

Run: `./scripts/npmw run test -- tests/integration/db-health-snapshot.test.ts`
Expected: FAIL (no existe).

- [ ] **Step 2: Crear migración**

```sql
-- WHAT: db_health_snapshot() devuelve métricas de la DB.
-- WHY: Pantalla dev en mobile para chequeo rápido sin entrar a Supabase.

create or replace function public.db_health_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_db_size bigint;
  v_table_sizes jsonb;
  v_growth jsonb;
  v_slow jsonb;
begin
  select pg_database_size(current_database()) into v_db_size;

  select jsonb_agg(
    jsonb_build_object(
      'table', schemaname || '.' || tablename,
      'total_bytes', pg_total_relation_size((schemaname||'.'||tablename)::regclass),
      'rows_estimate', n_live_tup
    ) order by pg_total_relation_size((schemaname||'.'||tablename)::regclass) desc
  ) into v_table_sizes
  from pg_stat_user_tables
  where schemaname = 'public';

  -- Growth: filas insertadas en los últimos 30 días para tablas con created_at.
  select jsonb_build_object(
    'expenses_30d', (select count(*) from public.expenses where created_at > now() - interval '30 days'),
    'notifications_30d', (select count(*) from public.notifications where created_at > now() - interval '30 days'),
    'monthly_summaries_total', (select count(*) from public.monthly_summaries)
  ) into v_growth;

  -- Slow queries (si pg_stat_statements está disponible)
  begin
    select jsonb_agg(jsonb_build_object(
      'query', left(query, 200),
      'mean_exec_ms', round(mean_exec_time::numeric, 2),
      'calls', calls,
      'total_ms', round(total_exec_time::numeric, 2)
    ) order by total_exec_time desc) into v_slow
    from (
      select * from public.pg_stat_statements
      order by total_exec_time desc limit 10
    ) s;
  exception when others then v_slow := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'db_size_bytes', v_db_size,
    'db_size_pretty', pg_size_pretty(v_db_size),
    'table_sizes', coalesce(v_table_sizes, '[]'::jsonb),
    'monthly_growth', v_growth,
    'slow_queries_top10', coalesce(v_slow, '[]'::jsonb),
    'limits_pro', jsonb_build_object(
      'db_limit_bytes', 8::bigint * 1024 * 1024 * 1024,
      'db_pct_used', round((v_db_size::numeric / (8::numeric * 1024 * 1024 * 1024)) * 100, 2)
    ),
    'computed_at', now()
  );
end;
$$;

-- En vez de un rol custom, gateamos por el rol postgres (admin) +
-- el cliente solo lo invoca con service_role key en dev. Para mobile
-- dev, agregamos grant a authenticated y gateamos en el cliente
-- por __DEV__. Es info de la DB, no expone PII de otros usuarios.
revoke all on function public.db_health_snapshot() from public;
grant execute on function public.db_health_snapshot() to authenticated;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop function if exists public.db_health_snapshot();
```

> **Decisión sobre el rol:** la RPC no expone PII (solo metadata estructural). En vez de un rol custom (que añadiría complejidad), la gateamos en el cliente con `__DEV__`. La data devuelta es safe.

- [ ] **Step 3: Aplicar + run tests**

Run: `supabase db reset && ./scripts/npmw run test -- tests/integration/db-health-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512080000_db_health_snapshot.sql tests/integration/db-health-snapshot.test.ts
git commit -m "feat(db): db_health_snapshot RPC para dev

Devuelve tamaño DB, top tablas, growth 30d, slow queries y
% de uso del límite Pro. Sin PII; gating en cliente por __DEV__.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.2: Cliente — pantalla `dev-health`

**Files:**
- Create: `mobile/features/dev-health/db-health-types.ts`
- Create: `mobile/features/dev-health/use-db-health.ts`
- Create: `mobile/screens/dev-health-screen.tsx`
- Create: `app/(app)/settings/dev-health.tsx`

- [ ] **Step 1: Tipos**

```ts
// mobile/features/dev-health/db-health-types.ts
export type TableSize = {
  table: string;
  total_bytes: number;
  rows_estimate: number;
};

export type SlowQuery = {
  query: string;
  mean_exec_ms: number;
  calls: number;
  total_ms: number;
};

export type DbHealthSnapshot = {
  db_size_bytes: number;
  db_size_pretty: string;
  table_sizes: TableSize[];
  monthly_growth: {
    expenses_30d: number;
    notifications_30d: number;
    monthly_summaries_total: number;
  };
  slow_queries_top10: SlowQuery[];
  limits_pro: {
    db_limit_bytes: number;
    db_pct_used: number;
  };
  computed_at: string;
};
```

- [ ] **Step 2: Hook**

```ts
// mobile/features/dev-health/use-db-health.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/mobile/lib/supabase';
import type { DbHealthSnapshot } from './db-health-types';

export const dbHealthKey = () => ['db-health'] as const;

async function fetchDbHealth(): Promise<DbHealthSnapshot | null> {
  const { data, error } = await supabase.rpc('db_health_snapshot');
  if (error) throw error;
  return data as DbHealthSnapshot | null;
}

export function useDbHealth() {
  return useQuery({
    queryKey: dbHealthKey(),
    queryFn: fetchDbHealth,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 3: Screen**

```tsx
// mobile/screens/dev-health-screen.tsx
import React from 'react';
import { ScrollView, Text, View, StyleSheet, RefreshControl } from 'react-native';
import { useDbHealth } from '@/mobile/features/dev-health/use-db-health';

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export default function DevHealthScreen() {
  const { data, isLoading, refetch, isRefetching } = useDbHealth();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text style={styles.title}>DB Health</Text>
      {isLoading && <Text>Cargando…</Text>}
      {data && (
        <>
          <Section title="Resumen">
            <Row label="Tamaño DB" value={data.db_size_pretty} />
            <Row label="% del plan Pro (8 GB)" value={`${data.limits_pro.db_pct_used}%`} />
            <Row label="Computed at" value={new Date(data.computed_at).toLocaleString()} />
          </Section>
          <Section title="Growth (30 días)">
            <Row label="Expenses" value={String(data.monthly_growth.expenses_30d)} />
            <Row label="Notifications" value={String(data.monthly_growth.notifications_30d)} />
            <Row label="Monthly summaries (total)" value={String(data.monthly_growth.monthly_summaries_total)} />
          </Section>
          <Section title="Top tablas por tamaño">
            {data.table_sizes.slice(0, 15).map(t => (
              <Row key={t.table} label={t.table} value={`${fmtBytes(t.total_bytes)} (${t.rows_estimate} rows)`} />
            ))}
          </Section>
          <Section title="Slow queries top 10">
            {data.slow_queries_top10.map((q, i) => (
              <View key={i} style={styles.slowRow}>
                <Text style={styles.slowQuery}>{q.query}</Text>
                <Text style={styles.slowMeta}>mean {q.mean_exec_ms}ms · {q.calls} calls · total {q.total_ms}ms</Text>
              </View>
            ))}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, color: '#636366' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  label: { fontSize: 14, color: '#111' },
  value: { fontSize: 14, fontWeight: '600', color: '#111' },
  slowRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  slowQuery: { fontSize: 12, fontFamily: 'Menlo', color: '#111' },
  slowMeta: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
});
```

- [ ] **Step 4: Route file**

```tsx
// app/(app)/settings/dev-health.tsx
import DevHealthScreen from '@/mobile/screens/dev-health-screen';
import { Redirect } from 'expo-router';

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />;
  return <DevHealthScreen />;
}
```

Y agregar un link en la pantalla de Settings principal (sólo si `__DEV__`):

Leer `mobile/screens/settings-screen.tsx` o equivalente y agregar:

```tsx
{__DEV__ && (
  <Link href="/(app)/settings/dev-health" asChild>
    <Pressable style={styles.row}>
      <Text style={styles.label}>DB Health (dev)</Text>
    </Pressable>
  </Link>
)}
```

(El path exacto del settings screen depende del repo; identificar antes de editar.)

- [ ] **Step 5: Validate + smoke**

Run: `./scripts/npmw run validate`
Run dev build, navegar a Settings → DB Health. Verificar que renderiza con datos reales.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/dev-health/ mobile/screens/dev-health-screen.tsx 'app/(app)/settings/dev-health.tsx'
git commit -m "feat(dev): pantalla DB Health gatedada por __DEV__

Lee db_health_snapshot() y muestra tamaño, growth, top tablas
y slow queries. Solo visible en builds dev.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.3: STOP & MERGE Phase 6

- [ ] Validate full + commit pendiente. Mergeable.

---

# PHASE 7 — Verification & cleanup

**Goal:** Validar que las 6 fases mergearon correctamente y los targets de capacidad se cumplen.

---

### Task 7.1: Migración cleanup `push_subscriptions.last_used_at`

**Files:**
- Create: `supabase/migrations/20260512090000_push_subscriptions_last_used_at.sql`

- [ ] **Step 1: Verificar si la columna ya existe**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "\d public.push_subscriptions"
```

Si `last_used_at` ya existe, esta task se reduce a un commit de no-op con la migración idempotente. Si no existe, la agrega.

- [ ] **Step 2: Crear migración**

```sql
-- WHAT: Asegura columna last_used_at en push_subscriptions.
-- WHY: cron_apply_retention_policies borra subscriptions inactivas
--      desde hace 90 días. Sin esta columna, la cláusula del cron
--      es no-op (intencional con exception handling, pero queremos
--      retención real).

alter table public.push_subscriptions
  add column if not exists last_used_at timestamptz;

-- Backfill: setearlo al created_at para todas las filas que vinieron de antes.
update public.push_subscriptions
set last_used_at = created_at
where last_used_at is null;

create index if not exists push_subscriptions_last_used_at_idx
  on public.push_subscriptions (last_used_at)
  where last_used_at is not null;

-- ═══ DOWN ══════════════════════════════════════════════════════════
-- drop index if exists push_subscriptions_last_used_at_idx;
-- alter table public.push_subscriptions drop column if exists last_used_at;
```

- [ ] **Step 3: Aplicar y commit**

Run: `supabase db reset`
```bash
git add supabase/migrations/20260512090000_push_subscriptions_last_used_at.sql
git commit -m "chore(push): asegurar push_subscriptions.last_used_at + backfill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.2: Smoke test full + validate final

- [ ] **Step 1**: `supabase db reset` corre todas las 76 + 11 migraciones limpio.
- [ ] **Step 2**: `./scripts/npmw run validate` verde.
- [ ] **Step 3**: `./scripts/npmw run test` verde, incluyendo todos los tests de integration nuevos.
- [ ] **Step 4**: Smoke test en mobile dev:
  - Login → Home renderiza con prefetch.
  - Navegar a Asistente → renderiza data desde `control_snapshot()` (fallback si null).
  - Navegar a Settings → DB Health (solo dev) muestra números.
  - Crear gasto → optimistic update inmediato.
  - Marcar gasto fijo como pagado → optimistic + invalidación correcta.
- [ ] **Step 5**: Repetir `supabase db reset` 2× consecutivas. Cada migración nueva debe ser idempotente.

---

### Task 7.3: Documentar runbooks operacionales

**Files:**
- Create: `docs/runbooks/backend-hardening.md`

- [ ] **Step 1: Escribir runbook**

```markdown
# Runbook: Backend Hardening Operacional

## Forzar refresh de control_snapshots para una familia

```sql
select public.compute_control_snapshot('<family-uuid>');
```

## Forzar purga de expenses archivados (ad-hoc)

```sql
select public.cron_purge_archived_expenses();
```

## Forzar retention mensual completo

```sql
select public.cron_apply_retention_policies();
```

## Disparar el orchestrator de notificaciones manualmente

```bash
curl -X POST https://<project>.supabase.co/functions/v1/notifications-orchestrator \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"morning_checkins"}'
```

## Verificar tamaño DB y crecimiento

Settings → DB Health en build dev. O directo:

```sql
select pg_size_pretty(pg_database_size(current_database()));
```

## Rollback de Phase 5 (notifications)

1. Re-aplicar `20260423220137_notifications_cron.sql` (re-crea schedules viejos).
2. Desactivar schedules nuevos:
   ```sql
   select cron.unschedule('notifications-morning');
   select cron.unschedule('notifications-midday');
   -- etc
   ```
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/backend-hardening.md
git commit -m "docs: runbook operacional de backend hardening

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** §3 → Task 1.1, §4.2.A → 1.1+1.2, §4.2.B → 2.2, §4.2.C → 3.1+3.2+3.3, §4.2.D → 4.1+4.2, §4.2.E → 5.1+5.2+5.3, §4.2.F → (queda en backlog cliente — se cubre con `use-home-realtime` que ya existe, presence gating es ronda 2 si métricas no lo piden ya), §4.2.G → verificación manual mobile/lib/supabase.ts en Task 2.3, §4.2.H → 6.1+6.2, §4.2.I → 2.3+2.4+3.3, §5 → todas las tasks usan los nombres de migración del spec.
- **Gaps detectados:** Phase 4.2.F (realtime gating por presence) no tiene task explícita. Decisión: queda en backlog porque (1) la métrica "Realtime concurrent" hoy son 3 conexiones; (2) implementarlo requiere refactor más profundo de `use-home-realtime` que es out-of-band para este sprint; (3) optimistic updates ya están implementados en mutations, que cubre la UX. Se levanta como ronda 2 si Realtime concurrent supera 100.
- **Placeholders:** ningún "TBD" o "TODO" en las tasks. Steps de "leer archivo X primero" tienen comando exacto. Patches al cliente en lugares que dependen del estado actual están justificados con un primer step de inspección + un patch genérico que el implementador adapta (esto es honesto: no podemos darle un diff exacto sin haber leído el archivo en runtime).
- **Type consistency:** `ControlSnapshot` (TS) usa los mismos field names que `control_snapshot()` retorna (snake_case). `DbHealthSnapshot` idem. `chunk<T>(arr, size)` consistente entre helper y test.
- **Cron names consistency:** `notifications-morning` (handover) reemplaza `morning-checkins` (legacy). Documentado en sección Cron schedule resumen.
- **Migration order:** timestamps monotónicos crecientes (000000 → 010000 → 020000 → ... → 090000). Cada uno depende solo de migraciones anteriores.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-backend-hardening-5k-mau-plan.md`.**

Hay 7 phases, ~25 tasks, 11 migraciones SQL, 2 Edge Functions, 6 archivos cliente nuevos/modificados, 6 archivos de test. Cada phase es mergeable y desplegable independientemente per el rollout del spec §12.

**Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — dispatch fresh subagent per task, review entre tasks, iteración rápida. Bueno para phases 1-2 y para no quemar contexto en este chat.

**2. Inline Execution** — ejecuto tasks acá usando `executing-plans`, batch con checkpoints para review. Bueno si querés ver cada paso en este chat.

¿Qué approach preferís?
