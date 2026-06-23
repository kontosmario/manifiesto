# Suscripciones por uso real — check-in post-pago · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar task-por-task. Los pasos usan checkbox (`- [ ]`).

**Goal:** que el asistente pregunte por el uso REAL de una suscripción enganchado al pago, re-pregunte a ~15 días, acumule respuestas y escale hasta sugerir cancelar — retirando el detector viejo por ausencia-de-pago. v1 solo card in-app.

**Architecture:** reusa las tablas del "Sistema B" (`fixed_expense_usage_audit`, `fixed_expense_action_intent`) con flujo a medida. El servidor expone en **`home_snapshot()` (live, sin ventana de ciclo)** un payload derivado `subscription_checkins`; el cliente lo lee vía `useHomeSnapshot`, una función pura `scoreSubscriptionUsage` decide qué preguntar, y un builder nuevo emite la card en el asistente. Se retira el Sistema A (cron + builder + zombi sintético) sin borrar tablas (reversible).

**Tech Stack:** React Native/Expo (SDK 54), Supabase (Postgres + pg_cron), react-query, vitest (env node), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-23-sub-usage-checkin-design.md` (incluye las 9 invariantes cross-ciclo — respetarlas).

---

## Decisión de arquitectura resuelta (NO cambiar sin releer)

El asistente NO lee `control_snapshot` para esto. `control_snapshot` es **materializado por cron 3×/día (6/12/18 AR)** → lag de hasta 6h, inservible para "preguntá al pagar". `subscription_checkins` va en **`home_snapshot()`** (se computa LIVE en cada fetch; el pago ya invalida home_snapshot → la card aparece pronto). El cliente lo lee desde el cache de `useHomeSnapshot`, NO de `control_snapshot`. Por eso `tests/integration/control-snapshot.test.ts` **no cambia** y `control_snapshots.zombie_candidates` queda dormido.

## File Structure

**Crear:**
- `mobile/features/subscriptions-zombie/usage-checkin.constants.ts` — umbrales del scoring.
- `mobile/features/subscriptions-zombie/usage-checkin.ts` — `scoreSubscriptionUsage` (pura) + tipo `SubscriptionCheckin`.
- `mobile/features/subscriptions-zombie/record-subscription-usage.ts` — repo fire-and-forget (RPC nuevo) para el dispatcher.
- `supabase/migrations/20260623000000_sub_usage_checkin.sql` — home_snapshot+key, RPC `record_subscription_usage`, cron prune 12m, unschedule `control_zombies`.
- `tests/unit/subscription-usage-checkin.test.ts` — tests de la función pura.
- `docs/sistemas/suscripciones-uso.md` — doc canónico del feature.

**Modificar:**
- `mobile/features/insights/control-action.ts` — kinds `sub-usage-answer` + `sub-usage-cancel`.
- `mobile/components/control-v2/asesor-action-meta.ts` — entries en `META_BY_KIND` (Record exhaustivo → typecheck rompe sin esto).
- `mobile/features/insights/control-v2-mock.ts` — campo `replies?` en `ControlAdvisorTask`.
- `mobile/features/insights/signal-family.ts` — prefijo `'sub-usage-'`.
- `mobile/features/insights/control-dismiss-store.ts` — `'sub-usage': 15` en `BASE_TTL_DAYS`.
- `mobile/features/insights/control-signals.ts` — `BuildSignalsArgs.subscriptionCheckins`, builder `buildSubUsageCheckin`, registrar; **borrar** `buildFromZombieNotifications` + su registro.
- `mobile/features/home/use-home-snapshot.ts` — tipar `subscription_checkins` en el payload.
- `mobile/features/insights/use-control-v2-data.ts` — leer `subscription_checkins` de home_snapshot e inyectar; **borrar** zombi sintético.
- `mobile/features/insights/use-control-action-dispatcher.ts` — handlers de los 2 kinds nuevos.
- `mobile/screens/home/asistente-screen.tsx` — fila de réplicas (escala) cuando `task.replies`.
- `tests/unit/control-signals.test.ts` — casos nuevos + arreglar el caso roto al retirar zombie.
- `docs/sistemas/asistente-financiero.md` — catálogo de señales/acciones.

---

## Task 1: Función pura de scoring + constantes (hoja, TDD)

**Files:**
- Create: `mobile/features/subscriptions-zombie/usage-checkin.constants.ts`
- Create: `mobile/features/subscriptions-zombie/usage-checkin.ts`
- Test: `tests/unit/subscription-usage-checkin.test.ts`

- [ ] **Step 1: Constantes**

```ts
// usage-checkin.constants.ts
export const REASK_DAYS = 15
export const REASK_DAYS_AFTER_HIGH = 35
export const SOFT_FLAG_STREAK = 2
export const HARD_FLAG_STREAK = 3
export const USAGE_SCORE = { mucho: 0, a_veces: 0.5, casi_nunca: 1 } as const
export const NEGATIVE_SCORE_THRESHOLD = 0.5
```

- [ ] **Step 2: Escribir el test (debe fallar — módulo inexistente)**

```ts
// tests/unit/subscription-usage-checkin.test.ts
import { describe, expect, it } from 'vitest'
import { scoreSubscriptionUsage, type SubscriptionCheckin } from '@/features/subscriptions-zombie/usage-checkin'

const NOW = new Date('2026-06-23T12:00:00')
function checkin(over: Partial<SubscriptionCheckin> = {}): SubscriptionCheckin {
  return { fixedExpenseId: 'fe1', name: 'Netflix', amount: 4500,
    lastPaymentAt: null, lastAuditAt: null, recentLevels: [], hasOpenCancelIntent: false, ...over }
}

describe('scoreSubscriptionUsage', () => {
  it('ask-al-pagar: pago posterior a la última respuesta', () => {
    const r = scoreSubscriptionUsage(checkin({ lastPaymentAt: '2026-06-22T10:00:00', lastAuditAt: '2026-06-01T10:00:00' }), NOW)
    expect(r.shouldAsk).toBe(true); expect(r.prompt).toBe('pay')
  })
  it('re-ask por timer >=15d, sin depender de payments', () => {
    const r = scoreSubscriptionUsage(checkin({ lastPaymentAt: null, lastAuditAt: '2026-06-05T10:00:00', recentLevels: ['a_veces'] }), NOW)
    expect(r.shouldAsk).toBe(true); expect(r.prompt).toBe('reask')
  })
  it('respondió hace <15d → no preguntar', () => {
    const r = scoreSubscriptionUsage(checkin({ lastAuditAt: '2026-06-20T10:00:00', recentLevels: ['a_veces'] }), NOW)
    expect(r.shouldAsk).toBe(false)
  })
  it('"mucho" resetea racha y afloja a 35d', () => {
    const r = scoreSubscriptionUsage(checkin({ lastAuditAt: '2026-06-03T10:00:00', recentLevels: ['mucho', 'casi_nunca', 'casi_nunca'] }), NOW) // 20d
    expect(r.shouldAsk).toBe(false); expect(r.flag).toBe('none'); expect(r.negativeStreak).toBe(0)
  })
  it('2 negativas seguidas → soft', () => {
    const r = scoreSubscriptionUsage(checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['a_veces', 'a_veces'] }), NOW)
    expect(r.flag).toBe('soft'); expect(r.negativeStreak).toBe(2)
  })
  it('3 negativas → hard', () => {
    const r = scoreSubscriptionUsage(checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['casi_nunca', 'a_veces', 'casi_nunca'] }), NOW)
    expect(r.flag).toBe('hard'); expect(r.negativeStreak).toBe(3)
  })
  it('2 casi_nunca seguidas → hard', () => {
    const r = scoreSubscriptionUsage(checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['casi_nunca', 'casi_nunca'] }), NOW)
    expect(r.flag).toBe('hard')
  })
  it('array vacío / nunca preguntó ni pagó → no preguntar', () => {
    expect(scoreSubscriptionUsage(checkin(), NOW).shouldAsk).toBe(false)
  })
})
```

Run: `npx vitest run tests/unit/subscription-usage-checkin.test.ts` — Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `usage-checkin.ts`** (código completo)

```ts
import { REASK_DAYS, REASK_DAYS_AFTER_HIGH, SOFT_FLAG_STREAK, HARD_FLAG_STREAK, USAGE_SCORE, NEGATIVE_SCORE_THRESHOLD } from './usage-checkin.constants'
import type { UsageLevel } from './types'

const DAY_MS = 86_400_000

export interface SubscriptionCheckin {
  fixedExpenseId: string
  name: string
  amount: number
  /** MAX(fixed_expense_payments.paid_at) — SIN ventana de ciclo (invariante 3). */
  lastPaymentAt: string | null
  /** MAX(fixed_expense_usage_audit.created_at) del usuario. */
  lastAuditAt: string | null
  /** Últimos ~3 levels por created_at DESC (más reciente primero). */
  recentLevels: UsageLevel[]
  hasOpenCancelIntent: boolean
}

export interface UsageScore {
  shouldAsk: boolean
  prompt: 'pay' | 'reask'
  flag: 'none' | 'soft' | 'hard'
  negativeStreak: number
}

function scoreOf(level: UsageLevel): number {
  return (USAGE_SCORE as Record<string, number>)[level] ?? 0 // robusto a legacy (invariante 8)
}

export function scoreSubscriptionUsage(checkin: SubscriptionCheckin, now: Date): UsageScore {
  const nowMs = now.getTime()
  const lastAuditMs = checkin.lastAuditAt ? Date.parse(checkin.lastAuditAt) : NaN
  const lastPayMs = checkin.lastPaymentAt ? Date.parse(checkin.lastPaymentAt) : NaN

  let negativeStreak = 0
  let casiNuncaStreak = 0
  for (const level of checkin.recentLevels) {
    if (scoreOf(level) >= NEGATIVE_SCORE_THRESHOLD) {
      negativeStreak++
      casiNuncaStreak = level === 'casi_nunca' ? casiNuncaStreak + 1 : 0
    } else break // 'mucho' (o legacy score 0) corta la racha
  }

  const lastWasMucho = checkin.recentLevels[0] === 'mucho'
  const reaskDays = lastWasMucho ? REASK_DAYS_AFTER_HIGH : REASK_DAYS

  let flag: UsageScore['flag'] = 'none'
  if (negativeStreak >= HARD_FLAG_STREAK || casiNuncaStreak >= 2) flag = 'hard'
  else if (negativeStreak >= SOFT_FLAG_STREAK) flag = 'soft'

  const paidUnanswered = !Number.isNaN(lastPayMs) && (Number.isNaN(lastAuditMs) || lastPayMs > lastAuditMs)
  const reaskDue = !Number.isNaN(lastAuditMs) && nowMs - lastAuditMs >= reaskDays * DAY_MS

  const shouldAsk = paidUnanswered || reaskDue
  const prompt: 'pay' | 'reask' = paidUnanswered ? 'pay' : 'reask'
  return { shouldAsk, prompt, flag, negativeStreak }
}
```

- [ ] **Step 4: Correr el test → PASS.** `npx vitest run tests/unit/subscription-usage-checkin.test.ts`
- [ ] **Step 5: typecheck + lint.** `npm run typecheck` · `npx eslint mobile/features/subscriptions-zombie tests/unit/subscription-usage-checkin.test.ts`
- [ ] **Step 6: Commit.** `git add mobile/features/subscriptions-zombie/usage-checkin*.ts tests/unit/subscription-usage-checkin.test.ts && git commit -m "feat(subs): scoreSubscriptionUsage puro + constantes del check-in de uso"`

---

## Task 2: Migración SQL (home_snapshot + RPC + crons)

**Files:** Create `supabase/migrations/20260623000000_sub_usage_checkin.sql`

> ⚠️ `home_snapshot()` se re-emite ENTERO (no acepta diff). Copiar el body EXACTO de `20260620260000_home_snapshot_freeze_until_salary_confirmed.sql` (líneas 33-406) y agregar SOLO el key nuevo. El key va **sin ventana de ciclo** (invariantes 2/3).

- [ ] **Step 1: Pieza A — `home_snapshot()` con `subscription_checkins`.** Re-emitir `create or replace function public.home_snapshot()...` idéntico, insertando este key justo después del bloque `advisor_signal_dismissals` (que cierra con `), '[]'::jsonb)`) y antes de la coma de `no_spend_days_count_cycle`:

```sql
    'subscription_checkins', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fixed_expense_id', fe.id,
          'name', fe.name,
          'amount', fe.amount::float8,
          'last_payment_at', (select max(fep.paid_at) from public.fixed_expense_payments fep where fep.fixed_expense_id = fe.id),
          'last_audit_at', (select max(fua.created_at) from public.fixed_expense_usage_audit fua where fua.fixed_expense_id = fe.id and fua.user_id = v_user_id),
          'recent_levels', coalesce((
            select jsonb_agg(t.level order by t.created_at desc)
            from (select fua.level, fua.created_at from public.fixed_expense_usage_audit fua
                  where fua.fixed_expense_id = fe.id and fua.user_id = v_user_id
                  order by fua.created_at desc limit 3) t
          ), '[]'::jsonb),
          'open_intent', exists(
            select 1 from public.fixed_expense_action_intent fai
            where fai.fixed_expense_id = fe.id and fai.intent = 'cancel' and fai.resolved_at is null)
        ) order by fe.created_at asc
      )
      from public.fixed_expenses fe
      join public.categories c on c.id = fe.category_id
      where fe.family_id = v_family_id
        and coalesce(fe.status, 'active') = 'active'
        and c.scope = 'fixed_expense' and c.name = 'Suscripciones'
    ), '[]'::jsonb),
```

- [ ] **Step 2: Pieza B — RPC `record_subscription_usage`** (espejo de `audit_subscription` con period explícito, SECURITY DEFINER, invariante 7):

```sql
create or replace function public.record_subscription_usage(p_fixed_expense_id uuid, p_level text, p_period text)
returns public.fixed_expense_usage_audit language plpgsql security definer set search_path = public as $$
declare v_family_id uuid; v_user_id uuid := auth.uid(); v_row public.fixed_expense_usage_audit;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_period is null or btrim(p_period) = '' then raise exception 'Period required' using errcode = '22023'; end if;
  select family_id into v_family_id from public.fixed_expenses where id = p_fixed_expense_id;
  if v_family_id is null then raise exception 'Fixed expense not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.family_members fm where fm.family_id = v_family_id and fm.user_id = v_user_id)
    then raise exception 'Not a member of this family' using errcode = '42501'; end if;
  if p_level not in ('mucho','a_veces','casi_nunca') then raise exception 'Invalid level' using errcode = '22023'; end if;
  insert into public.fixed_expense_usage_audit (fixed_expense_id, family_id, user_id, period, level)
  values (p_fixed_expense_id, v_family_id, v_user_id, p_period, p_level)
  on conflict (fixed_expense_id, user_id, period) do update set level = excluded.level, updated_at = now()
  returning * into v_row;
  return v_row;
end; $$;
grant execute on function public.record_subscription_usage(uuid, text, text) to authenticated;
```

- [ ] **Step 3: Pieza C — cron prune 12m** (invariante 9) y **Pieza D — unschedule `control_zombies`** (retiro Sistema A, reversible):

```sql
create or replace function public.cron_prune_usage_audit() returns void language plpgsql security definer set search_path = public as $$
begin delete from public.fixed_expense_usage_audit where created_at < now() - interval '12 months'; end; $$;
revoke all on function public.cron_prune_usage_audit() from public;
grant execute on function public.cron_prune_usage_audit() to service_role;

do $mig$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cron_prune_usage_audit') then perform cron.unschedule('cron_prune_usage_audit'); end if;
    perform cron.schedule('cron_prune_usage_audit', '0 5 1 * *', $cron$select public.cron_prune_usage_audit();$cron$);
    if exists (select 1 from cron.job where jobname = 'control_zombies') then perform cron.unschedule('control_zombies'); end if;
  end if;
exception when others then raise notice 'sub_usage cron block failed: %', sqlerrm; end $mig$;
```

- [ ] **Step 4: Aplicar a prod** vía `mcp__claude_ai_Supabase__apply_migration` (o el patrón `curl` Management API del proyecto).
- [ ] **Step 5: Verificar** con `execute_sql`:
  - `select proname from pg_proc where proname='record_subscription_usage';` → 1 fila.
  - `select jobname from cron.job where jobname in ('cron_prune_usage_audit','control_zombies');` → solo `cron_prune_usage_audit`.
  - Con sesión del owner: `select home_snapshot()->'subscription_checkins';` → array (vacío o con subs). Verificar `last_payment_at` = MAX(paid_at) **sin** ventana de ciclo (pagar a fin de ciclo previo y confirmar que sigue apareciendo tras cerrar).
- [ ] **Step 6: Commit.** `git add supabase/migrations/20260623000000_sub_usage_checkin.sql && git commit -m "feat(subs): home_snapshot.subscription_checkins + record_subscription_usage + prune 12m + retiro cron zombie"`

---

## Task 3: Tipos + plumbing (ControlAction, replies, meta, signal-family, dismiss TTL)

**Files:** `control-action.ts`, `asesor-action-meta.ts`, `control-v2-mock.ts`, `signal-family.ts`, `control-dismiss-store.ts`

- [ ] **Step 1: `control-action.ts`** — agregar al union (antes del cierre del type):

```ts
  | { kind: 'sub-usage-answer'; fixedExpenseId: string; level: 'mucho' | 'a_veces' | 'casi_nunca'; dismissId: string }
  | { kind: 'sub-usage-cancel'; fixedExpenseId: string; dismissId: string }
```

- [ ] **Step 2: `asesor-action-meta.ts`** — agregar a `META_BY_KIND` (OBLIGATORIO; Record exhaustivo, typecheck rompe sin esto). Usar el shape real de `AsesorActionMeta` (confirmar campos `icon`/`haptic`/`fallbackLabel` contra el archivo):

```ts
  'sub-usage-answer': { icon: 'check', haptic: 'success', fallbackLabel: 'Responder' },
  'sub-usage-cancel': { icon: 'cancel', haptic: 'warning', fallbackLabel: 'Cancelar' },
```

- [ ] **Step 3: `control-v2-mock.ts`** — campo opcional en `ControlAdvisorTask` (después de `action?`):

```ts
  /** Botonera de respuesta rápida (escala de uso). Cuando está presente, la
   *  card renderiza esta fila EN VEZ del CTA único. */
  replies?: { label: string; action: ControlAction }[]
```
(importar `ControlAction` si no está ya).

- [ ] **Step 4: `signal-family.ts`** — agregar `'sub-usage-'` al array `PREFIXES` (dejar `'zombie-'` también, no rompe).
- [ ] **Step 5: `control-dismiss-store.ts`** — agregar a `BASE_TTL_DAYS`: `'sub-usage': 15,` (backstop; la cadencia real la gobierna el gate del builder, invariante 5).
- [ ] **Step 6: typecheck + lint + commit.** `npm run typecheck` → debe pasar. `git commit -m "feat(subs): tipos de ControlAction sub-usage + replies + meta + dismiss TTL"`

---

## Task 4: Repo del RPC + handlers del dispatcher

**Files:** Create `mobile/features/subscriptions-zombie/record-subscription-usage.ts`; modify `use-control-action-dispatcher.ts`

- [ ] **Step 1: Repo fire-and-forget** (el dispatcher no es hook → funciones async sueltas):

```ts
import { supabase } from '@/lib/supabase'
import type { UsageLevel } from './types'

export function todayCheckinPeriod(now: Date = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export async function recordSubscriptionUsage(input: { fixedExpenseId: string; level: UsageLevel; period: string }): Promise<void> {
  const { error } = await supabase.rpc('record_subscription_usage', { p_fixed_expense_id: input.fixedExpenseId, p_level: input.level, p_period: input.period })
  if (error) throw error
}
export async function declareSubscriptionCancelIntent(fixedExpenseId: string): Promise<void> {
  const { error } = await supabase.rpc('declare_subscription_intent', { p_fixed_expense_id: fixedExpenseId, p_intent: 'cancel', p_notes: null })
  if (error) throw error
}
```

- [ ] **Step 2: dispatcher** — imports + `const queryClient = useQueryClient()` dentro del hook + 2 casos en el `switch(action.kind)` (ver bloque del gather, área card-action change "use-control-action-dispatcher.ts"). Cada caso: `triggerHaptic` → `dismissCard(action.dismissId)` (optimista) → RPC en background → `syncAllAfterMutation(queryClient, { familyId: ctx.familyId, userId: ctx.userId, scopes: ['fixed','fixedPayment'] })` (mantiene home_snapshot fresco) → `.catch(Alert)`. Agregar `queryClient` al dep array del `useCallback`. Sumar los 2 kinds a `actionKey()` si el switch es exhaustivo.
- [ ] **Step 3: typecheck + lint + bundle.** `npm run typecheck` · `npx eslint mobile/features/insights mobile/features/subscriptions-zombie` · **`npx expo export --platform ios`** (importar supabase en módulo nuevo puede romper el bundle aunque typecheck pase — memoria `validate ≠ bundle`).
- [ ] **Step 4: Commit.** `git commit -m "feat(subs): repo record_subscription_usage + handlers del dispatcher (answer/cancel)"`

---

## Task 5: Builder `buildSubUsageCheckin` + retirar System A builder + tests

**Files:** `control-signals.ts`, `tests/unit/control-signals.test.ts`

- [ ] **Step 1: `BuildSignalsArgs`** — agregar `subscriptionCheckins?: SubscriptionCheckin[]` + import del tipo desde `@/features/subscriptions-zombie/usage-checkin`.
- [ ] **Step 2: Escribir los tests del builder** (en `control-signals.test.ts`, patrón `baseArgs`) — Expected: FAIL (builder no existe):
  - pago-sin-responder → `out.find(s => s.id.startsWith('sub-usage-'))` defined, `replies.length === 3`.
  - respondió hace <15d → undefined.
  - 3 negativas → card `urgency==='alta'`, `cta==='Cancelar'`.
  - `hasOpenCancelIntent: true` → no card.
  - cap: 3 checkins con shouldAsk → solo 2 `sub-usage` cards.
- [ ] **Step 3: Implementar `buildSubUsageCheckin`** (código completo en el gather, área builder-scoring, change "control-signals.ts create function"). Copia/encabezado/escala/flags/replies. `id: \`sub-usage-${c.fixedExpenseId}\``, `cap 2`.
- [ ] **Step 4: Retirar System A builder.** En `buildControlSignals` (~L193) reemplazar `signals.push(...buildFromZombieNotifications(args, now))` por `signals.push(...buildSubUsageCheckin(args, now))`. **Borrar** la función `buildFromZombieNotifications` (L1206-1243).
- [ ] **Step 5: Arreglar el test roto** `caps output at 5 tasks and ranks by urgency` (L154-198): reemplazar los 2 `zombie_alert` por `subscriptionCheckins: [{...flag hard (3 'casi_nunca')...}]` para reponer la fuente de urgency 'alta' (código en el gather, área tests-retire change 1).
- [ ] **Step 6: Correr tests.** `npx vitest run tests/unit/control-signals.test.ts tests/unit/cognitive-layer.test.ts` → todos PASS (incl. los nuevos).
- [ ] **Step 7: typecheck + lint + commit.** `git commit -m "feat(subs): builder buildSubUsageCheckin + retiro del builder zombie por ausencia-de-pago"`

---

## Task 6: Wire home_snapshot.subscription_checkins → builder + retirar zombi sintético

**Files:** `use-home-snapshot.ts`, `use-control-v2-data.ts`

- [ ] **Step 1: Tipar el payload** en `use-home-snapshot.ts` — agregar `subscription_checkins` al tipo `HomeSnapshot` (shape: `{ fixed_expense_id, name, amount, last_payment_at, last_audit_at, recent_levels, open_intent }[]`).
- [ ] **Step 2: En `use-control-v2-data.ts`** — leer home_snapshot (ya hay `userId`): `const homeSnapshot = useHomeSnapshot(userId)` (cache caliente). Mapear `subscription_checkins` (snake→camel) a `SubscriptionCheckin[]` en un `useMemo`. Inyectar `subscriptionCheckins` en el objeto de `memoizedBuildSignals` + agregar al dep array.
- [ ] **Step 3: Retirar zombi sintético** — borrar `zombiesFromServer` (L325-329) y la síntesis de `kind:'zombie_alert'` en el memo `notifications` (L374-390 → `notifications = notificationsBase`). Limpiar el campo `zombiesFromServer` del VM si nadie más lo consume.
- [ ] **Step 4: typecheck + lint + bundle.** `npm run typecheck` · eslint · `npx expo export --platform ios`.
- [ ] **Step 5: Commit.** `git commit -m "feat(subs): inyectar subscription_checkins de home_snapshot al asistente + retirar zombi sintético"`

---

## Task 7: Render de la fila de escala en la card

**Files:** `mobile/screens/home/asistente-screen.tsx`

- [ ] **Step 1:** Agregar prop `onReply: (action: ControlAction) => void` a `InsightCard` + handler `handleReplyAction(task, action)` en `AsistenteScreen` (dispara `dispatch(action, meta)` con guard anti-doble-haptic — código en el gather, área card-action change "asistente-screen.tsx").
- [ ] **Step 2:** En `InsightCard`, renderizar `styles.scaleRow` con `task.replies.map(...)` cuando `task.replies?.length`, en vez del `styles.replies` CTA único. Reusar tokens theme-aware (`t.vistoBg/vistoBorder/vistoText`); NO embeber `AuditPromptCard` (paleta beige hardcodeada + consenso familiar fuera de scope). Agregar estilos `scaleRow/scaleBtn/scaleBtnText` (min 44px touch target).
- [ ] **Step 3: Verificación manual (dev journey)** — no hay renderer en vitest (memoria `vitest_no_react_renderer`): pagar una sub categoría 'Suscripciones' → abrir Asistente → ver card con 3 botones → tap 'Casi nunca' → card se descarta + fila nueva en `fixed_expense_usage_audit` con `period='YYYY-MM-DD'`.
- [ ] **Step 4: typecheck + lint + bundle + commit.** `git commit -m "feat(subs): fila de escala (Mucho/A veces/Casi nunca) en la card del asistente"`

---

## Task 8: Docs

**Files:** Create `docs/sistemas/suscripciones-uso.md`; modify `docs/sistemas/asistente-financiero.md`

- [ ] **Step 1:** `suscripciones-uso.md`: flujo end-to-end, el payload `subscription_checkins` (home_snapshot, sin ventana de ciclo), el scoring/umbrales, las 9 invariantes cross-ciclo, qué se retiró del Sistema A (reversible).
- [ ] **Step 2:** `asistente-financiero.md`: sumar la señal `sub-usage` al catálogo + los kinds `sub-usage-answer`/`sub-usage-cancel`; nota de que el zombie por ausencia-de-pago quedó retirado.
- [ ] **Step 3: Commit.** `git commit -m "docs(subs): sistema de uso de suscripciones + retiro del zombie legacy"`

---

## Self-Review (cobertura del spec)

- §Storage (reuse tablas, period=fecha) → Task 2 (RPC) + Task 1 (tipo). ✓
- §subscription_checkins server-side sin ventana de ciclo → Task 2 home_snapshot. ✓ (corrección: home_snapshot, NO control_snapshot — ver "Decisión resuelta").
- §Scoring + escalación → Task 1 + Task 5 builder. ✓
- §Card + escala → Task 3 (replies) + Task 7 (render). ✓
- §Acción/persistencia → Task 4 (dispatcher + RPC). ✓
- §Cadencia gobernada por gate (no TTL) → Task 1 (shouldAsk) + Task 3 (backstop 15). ✓
- §Retirar System A → Task 5 (builder) + Task 6 (synthetic) + Task 2 (cron). ✓
- §Retención 12m → Task 2 cron. ✓
- §Tests → Task 1 + Task 5; el caso roto se arregla en Task 5. ✓
- §Invariantes cross-ciclo (9) → respetadas explícitamente en Tasks 1/2/5/6.

**Tipos consistentes:** `SubscriptionCheckin` (camelCase, cliente) vs `subscription_checkins` (snake, payload SQL) — el mapeo vive en Task 6. `ControlAction` kinds nuevos consistentes entre Task 3 (tipo), Task 4 (dispatcher), Task 5 (builder replies).

## Orden / dependencias (crítico)

1 (pura) → 3 (tipos) → 4 (repo+dispatcher) y 5 (builder) → 6 (wire) → 7 (render). **Task 2 (migración) debe aplicarse a prod ANTES de mergear el cliente** (sino `subscription_checkins` viene `undefined` → `?? []` → builder no emite; degradación segura, no crash, pero la feature no funciona hasta aplicar). Docs (8) al final.
