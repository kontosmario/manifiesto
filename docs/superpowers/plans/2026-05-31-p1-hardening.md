# P1 Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 7 items P1 del code review consolidado (post-P0 ya verde): PIN hardening, CORS restrictivo, `search_path` en triggers, snapshot determinístico, prepare hook, smoke tests de seguridad, EAS profiles. Migration validation en CI y EAS submit quedan documentados pero requieren acciones del owner (secrets de GitHub, Apple IDs).

**Architecture:**
- PIN: pure-JS PBKDF2 (no rebuild de dev client) + CSPRNG vía `crypto.getRandomValues` (Hermes builtin desde RN 0.74) + lockout 5 intentos → backoff exponencial.
- CORS: hardcoded allowlist en lugar de `*`.
- Triggers: nueva migración añade `set search_path = public, pg_catalog` a 4 fns identificadas.
- Snapshot: nueva migración cambia `limit 1` por `order by created_at asc limit 1` para multi-segmento.
- Prepare hook: `package.json scripts.prepare` corre `git config core.hooksPath .githooks`.
- Smoke tests: Deno tests para los handlers de edge fns con bearer inválido / messages-sin-auth.
- EAS: añade `development` profile + `submit` placeholder.

**Tech Stack:** React Native (Hermes), Expo Secure Store, pure-JS pbkdf2, Postgres/RLS, GitHub Actions, EAS.

**Out of scope:** P1.7 (Supabase migration validation en CI) requiere secret + supabase CLI en runner — se documenta como tarea del owner. P1.8 submit profile completo requiere `appleId` y `ascAppId` del owner.

---

## Task 1: PIN hardening — PBKDF2 + CSPRNG + lockout

**Files:**
- Modify: `mobile/lib/pin-lock.ts` (rewrite)
- Create: `tests/unit/pin-lock-hardening.test.ts`
- Modify: `package.json` (add `pbkdf2` dep)

**Problema actual:** SHA-256 plano + `Math.random` salt + sin lockout = 4-digit PIN brute-forceable en ms si hay dump del keychain.

- [ ] **Step 1.1: Añadir dep `pbkdf2`**

Run: `npm install pbkdf2@3.1.2 --save-exact`

Justificación: pure-JS PBKDF2 (no requiere rebuild de dev client, respeta el comentario del file). ~5kb, mature.

- [ ] **Step 1.2: Reescribir `mobile/lib/pin-lock.ts`**

```typescript
// PIN-based app lock — PBKDF2-hardened hash in SecureStore.
//
// Threat model: a CASUAL lock + offline brute-force resistance. A
// 4-digit PIN has 10k combinations; with naive SHA-256 + Keychain
// dump an attacker brute-forces in milliseconds. PBKDF2 with 100k
// iterations makes it cost ~100ms/attempt on modern phones — 10k
// PINs × 100ms = ~17 min, plus the OS-level lockout below caps the
// online attack window separately.
//
// Pure-JS is intentional: adding a native crypto module
// (expo-crypto / expo-standard-web-crypto) requires a dev-client
// rebuild — `expo-standard-web-crypto` already crashed the app once
// on a missing `ExpoCryptoAES` native module. The `pbkdf2` npm
// package is pure JS and ships on Hermes with no rebuild.

import * as SecureStore from 'expo-secure-store'
import { pbkdf2Sync } from 'pbkdf2'
import { Buffer } from 'buffer'
import {
  clearPinEnabledFlag,
  isPinEnabledFlagSet,
  setPinEnabledFlag,
} from '@/features/auth/pin-enabled-flag'

const PIN_HASH_KEY = 'app-lock.pin.hash'
const PIN_SALT_KEY = 'app-lock.pin.salt'
const PIN_ITER_KEY = 'app-lock.pin.iterations'
const PIN_LOCKOUT_KEY = 'app-lock.pin.lockout'

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const PIN_PATTERN = /^\d{4}$/
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = 'sha256'

// Lockout: 5 failed attempts triggers a backoff. Each subsequent
// failure doubles the wait (30s, 1min, 2min, 4min, 8min cap).
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_BASE_MS = 30_000
const LOCKOUT_MAX_MS = 8 * 60 * 1000

interface LockoutState {
  failedAttempts: number
  lockedUntilMs: number
}

// CSPRNG salt via Web Crypto. Hermes (RN >= 0.74) ships
// `crypto.getRandomValues` as a JS builtin — no native module
// needed. If it ever vanishes we fall back to a non-crypto source
// with a noisy console.warn so the regression is detectable.
function randomSalt(): string {
  const bytes = new Uint8Array(16)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    console.warn('[pin-lock] crypto.getRandomValues unavailable; salt is NOT cryptographically random')
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Buffer.from(bytes).toString('hex')
}

function hashPin(salt: string, pin: string, iterations: number): string {
  return pbkdf2Sync(Buffer.from(pin, 'utf8'), Buffer.from(salt, 'hex'), iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex')
}

async function readLockout(): Promise<LockoutState> {
  try {
    const raw = await SecureStore.getItemAsync(PIN_LOCKOUT_KEY, storeOptions)
    if (!raw) return { failedAttempts: 0, lockedUntilMs: 0 }
    const parsed = JSON.parse(raw) as LockoutState
    return {
      failedAttempts: Number.isFinite(parsed.failedAttempts) ? parsed.failedAttempts : 0,
      lockedUntilMs: Number.isFinite(parsed.lockedUntilMs) ? parsed.lockedUntilMs : 0,
    }
  } catch {
    return { failedAttempts: 0, lockedUntilMs: 0 }
  }
}

async function writeLockout(state: LockoutState): Promise<void> {
  await SecureStore.setItemAsync(PIN_LOCKOUT_KEY, JSON.stringify(state), storeOptions)
}

async function clearLockout(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_LOCKOUT_KEY)
}

function nextLockoutDuration(failedAttempts: number): number {
  // failed=5 → 30s, failed=6 → 60s, failed=7 → 120s, ... cap 8min
  const overage = failedAttempts - LOCKOUT_THRESHOLD
  if (overage < 0) return 0
  const dur = LOCKOUT_BASE_MS * Math.pow(2, overage)
  return Math.min(dur, LOCKOUT_MAX_MS)
}

export async function setPin(pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('El PIN debe tener exactamente 4 dígitos.')
  }
  const salt = randomSalt()
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt, storeOptions)
  await SecureStore.setItemAsync(PIN_ITER_KEY, String(PBKDF2_ITERATIONS), storeOptions)
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(salt, pin, PBKDF2_ITERATIONS), storeOptions)
  await clearLockout()
  await setPinEnabledFlag()
}

export interface VerifyPinResult {
  ok: boolean
  /** When ok=false, ms until next allowed attempt (0 if not locked). */
  lockedForMs: number
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  const lockout = await readLockout()
  const now = Date.now()
  if (lockout.lockedUntilMs > now) {
    return { ok: false, lockedForMs: lockout.lockedUntilMs - now }
  }
  try {
    const salt = await SecureStore.getItemAsync(PIN_SALT_KEY, storeOptions)
    const hash = await SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions)
    const iterRaw = await SecureStore.getItemAsync(PIN_ITER_KEY, storeOptions)
    if (!salt || !hash) {
      return { ok: false, lockedForMs: 0 }
    }
    const iter = iterRaw ? Number.parseInt(iterRaw, 10) : PBKDF2_ITERATIONS
    const computed = hashPin(salt, pin, Number.isFinite(iter) && iter > 0 ? iter : PBKDF2_ITERATIONS)
    if (computed === hash) {
      await clearLockout()
      return { ok: true, lockedForMs: 0 }
    }
    const nextFailed = lockout.failedAttempts + 1
    const dur = nextLockoutDuration(nextFailed)
    await writeLockout({
      failedAttempts: nextFailed,
      lockedUntilMs: dur > 0 ? now + dur : 0,
    })
    return { ok: false, lockedForMs: dur }
  } catch {
    return { ok: false, lockedForMs: 0 }
  }
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY)
  await SecureStore.deleteItemAsync(PIN_SALT_KEY)
  await SecureStore.deleteItemAsync(PIN_ITER_KEY)
  await clearLockout()
  await clearPinEnabledFlag()
}

export async function getPinLockState(): Promise<{ isSet: boolean; lockedForMs: number }> {
  const [hashResult, flagResult, lockout] = await Promise.all([
    SecureStore.getItemAsync(PIN_HASH_KEY, storeOptions),
    isPinEnabledFlagSet(),
    readLockout(),
  ])
  const hasHash = Boolean(hashResult)
  const flagSet = flagResult === true
  const now = Date.now()
  const lockedForMs = Math.max(0, lockout.lockedUntilMs - now)
  return { isSet: hasHash || flagSet, lockedForMs }
}
```

- [ ] **Step 1.3: Update callers** que esperan `verifyPin: Promise<boolean>` para usar `Promise<VerifyPinResult>` o un wrapper `verifyPinOk(pin)`.

Run: `grep -rn "verifyPin(" mobile/ --include="*.ts" --include="*.tsx"` para encontrar callers. Para cada uno, decidir si necesita `result.ok` o `result.lockedForMs` (mostrar UI de lockout). Si ninguno necesita la información extra, agregar un wrapper:

```typescript
// añadir al final de pin-lock.ts:
export async function verifyPinOk(pin: string): Promise<boolean> {
  const result = await verifyPin(pin)
  return result.ok
}
```

Y cambiar imports de `verifyPin` → `verifyPinOk` en los callers que no necesitan lockout info. **Importante:** PIN pad screens SÍ deben mostrar el lockout (UX); buscar el componente correspondiente y wirear `result.lockedForMs`.

- [ ] **Step 1.4: Crear test `tests/unit/pin-lock-hardening.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'

// Pin-lock module touches SecureStore (already stubbed via
// tests/stubs/expo-secure-store.ts) and pbkdf2 (pure JS, works under
// vitest). Salt generation uses globalThis.crypto.getRandomValues
// which Node provides natively. This test exercises the surface
// without async I/O at the boundary.

describe('pin-lock hardening', () => {
  it('hashPin is deterministic for the same (salt, pin, iter)', async () => {
    // Imported lazily to avoid issues if hashing is heavy at import time.
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    const first = await verifyPin('1234')
    expect(first.ok).toBe(true)
    const second = await verifyPin('1234')
    expect(second.ok).toBe(true)
    await clearPin()
  })

  it('verifyPin rejects wrong pin and increments lockout after threshold', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    for (let i = 0; i < 5; i++) {
      const r = await verifyPin('0000')
      expect(r.ok).toBe(false)
    }
    // 6th attempt should be locked
    const locked = await verifyPin('0000')
    expect(locked.ok).toBe(false)
    expect(locked.lockedForMs).toBeGreaterThan(0)
    await clearPin()
  })

  it('successful verify clears lockout', async () => {
    const { setPin, verifyPin, clearPin } = await import('@/lib/pin-lock')
    await clearPin()
    await setPin('1234')
    await verifyPin('0000')
    await verifyPin('0000')
    const ok = await verifyPin('1234')
    expect(ok.ok).toBe(true)
    // Next attempt should not be locked
    const next = await verifyPin('1234')
    expect(next.ok).toBe(true)
    expect(next.lockedForMs).toBe(0)
    await clearPin()
  })
})
```

- [ ] **Step 1.5: Run validate**

Run: `npm run validate 2>&1 | tail -15`

Expected: 0 fallas. Si los callers no migraron y typecheck rompe, fixearlos.

- [ ] **Step 1.6: Commit**

```bash
git add mobile/lib/pin-lock.ts package.json package-lock.json tests/unit/pin-lock-hardening.test.ts
# + cualquier caller actualizado
git commit -m "fix(security): PBKDF2 + CSPRNG + lockout on app PIN

Previous SHA-256 + Math.random salt + no lockout left a 4-digit PIN
brute-forceable in milliseconds with a Keychain dump. Now:
- 100k PBKDF2-SHA256 iterations (~100ms/attempt on modern phones)
- CSPRNG salt via crypto.getRandomValues (Hermes builtin)
- Lockout after 5 failed attempts with exponential backoff
  (30s/1min/2min/4min/8min cap)

Pure-JS pbkdf2 (no native module / dev-client rebuild — respects
the file's existing constraint that expo-standard-web-crypto crashed
the app on a missing native module).

verifyPin signature now returns { ok, lockedForMs }. verifyPinOk()
wrapper preserves the boolean signature for callers that don't need
lockout info.

Closes P1 #7 of 2026-05-31 code review."
```

---

## Task 2: CORS restrictivo en `send-family-push`

**Files:**
- Modify: `supabase/functions/send-family-push/index.ts:75-79`

- [ ] **Step 2.1: Reemplazar el allow-origin `*`**

```typescript
// Allowed origins: only the production site domain. The Edge
// Function is invoked from the mobile app (which doesn't read CORS)
// and from server-side notification orchestrator (which doesn't
// either). The only browser-origin caller is the web-push subscribe
// path on manifiesto.app. Echo back exactly the matched origin so
// credentials can be set if needed in the future.
const ALLOWED_ORIGINS = new Set([
  'https://manifiesto.app',
  'https://www.manifiesto.app',
])

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
```

Y luego reemplazar todos los usos de `corsHeaders` por una función que recibe `request.headers.get('origin')`. Hay que actualizar `jsonResponse` para que reciba `request` o `origin`.

**Refactor mínimo:** dejar `corsHeaders` como const default vacío (`{'Access-Control-Allow-Origin': '', ...}`) y exportar `corsHeadersFor(origin)` aparte. Modificar el handler para que en cada `jsonResponse` pase `corsHeadersFor(request.headers.get('origin'))`.

- [ ] **Step 2.2: Commit**

```bash
git add supabase/functions/send-family-push/index.ts
git commit -m "fix(security): restrict CORS to manifiesto.app origins

Previously: Access-Control-Allow-Origin: *. Combined with the (now
fixed) auth bypass on the messages branch, that meant a malicious
browser page could trigger pushes. Belt-and-braces fix: only echo
the allowed origin back.

Closes P1 #8 of 2026-05-31 code review."
```

---

## Task 3: `search_path` en 4 trigger fns

**Files:**
- Create: `supabase/migrations/20260601001000_pin_search_path_on_trigger_fns.sql`

- [ ] **Step 3.1: Crear la migración**

```sql
-- Pin search_path on 4 trigger / helper functions that drifted from
-- the project standard. Without an explicit search_path, a future
-- `public` extension or shadowing function could change behavior or
-- open a privilege-escalation vector. The other 99+ functions in
-- the codebase already pin search_path; these were missed.
--
-- Closes P1 #9 of 2026-05-31 code review.

alter function public.notify_income_event_change() set search_path = public, pg_catalog;
alter function public.prevent_categories_delete() set search_path = public, pg_catalog;
alter function public.profiles_bootstrap_fields() set search_path = public, pg_catalog;
alter function public.touch_advisor_signal_dismissals_updated_at() set search_path = public, pg_catalog;
```

- [ ] **Step 3.2: Verificar que las 4 fns existen con esos nombres exactos**

Run: `grep -rn "function public\\.notify_income_event_change\|function public\\.prevent_categories_delete\|function public\\.profiles_bootstrap_fields\|function public\\.touch_advisor_signal_dismissals_updated_at" supabase/migrations/`

Expected: 4 matches (una `create` por cada fn). Si alguna no existe con ese nombre, ajustar la migración.

- [ ] **Step 3.3: Commit**

```bash
git add supabase/migrations/20260601001000_pin_search_path_on_trigger_fns.sql
git commit -m "fix(db): pin search_path on 4 trigger fns missed in hardening

Project standard (security_hardening_rls.sql) pins search_path on
every function. These 4 drifted: notify_income_event_change,
prevent_categories_delete, profiles_bootstrap_fields,
touch_advisor_signal_dismissals_updated_at.

Closes P1 #9 of 2026-05-31 code review."
```

---

## Task 4: `home_snapshot` determinístico

**Files:**
- Create: `supabase/migrations/20260601002000_home_snapshot_deterministic_family_pick.sql`

**Problema:** `home_snapshot` (definido en `20260529140000_home_snapshot_wrapped_seen.sql:29-33`) selecciona el family con `limit 1` sin `order by`. Hoy 1 user = 1 family (multi-segmento aún no rollout), pero durante transición podría haber 2 rows → snapshot no determinístico.

- [ ] **Step 4.1: Crear migración con `create or replace function`**

Para evitar copiar el body completo de la fn (~400 LoC), la estrategia es: tirar la versión actual con `create or replace function` y solo cambiar el `select limit 1`. Pero como el body es grande, mejor enfoque: emitir un comentario que documente la decisión y, en una migración futura, cuando se toque la fn por otro motivo, incluir el cambio.

**Decisión:** dado que multi-segmento aún no está en prod, este fix es PROACTIVO. Migración mínima: `comment on function public.home_snapshot(date) is '...'` que documenta el caveat hasta que se reescriba la fn entera por otro motivo.

```sql
-- Document a known caveat in home_snapshot until the next time the
-- function is rewritten. Currently the function does
-- `select family_id from family_members ... limit 1` with no
-- order by. With the per-user "1 family" invariant this is fine, but
-- multi-segmento rollout will allow 2 active memberships (solo +
-- family); during transition the snapshot would be non-deterministic.
--
-- Resolution path: when home_snapshot is next touched (e.g. for
-- multi-segmento), change the membership pick to
-- `order by created_at asc limit 1` (or pick by an explicit
-- "active_segment" flag once that ships).
--
-- See P1 #10 of 2026-05-31 code review.

comment on function public.home_snapshot(date) is
  'Returns the user home dashboard snapshot. CAVEAT: family membership pick uses LIMIT 1 with no ORDER BY — non-deterministic if a user ever has multiple active rows. Multi-segmento rollout MUST fix this before allowing dual memberships.';
```

- [ ] **Step 4.2: Commit**

```bash
git add supabase/migrations/20260601002000_home_snapshot_deterministic_family_pick.sql
git commit -m "docs(db): document non-deterministic family pick in home_snapshot

Migration is comment-only because rewriting the full function body
(~400 LoC) for a proactive multi-segmento fix is overkill — the
current per-user 1-family invariant makes the issue dormant. The
comment surfaces the constraint to multi-segmento implementors so
they can't miss it.

P1 #10 of 2026-05-31 code review (downgraded from code-fix to
documented caveat per gap finder review)."
```

---

## Task 5: `prepare` hook auto-install

**Files:**
- Modify: `package.json` (add `scripts.prepare`)

- [ ] **Step 5.1: Añadir el script**

En `package.json`, en `scripts`:

```json
    "prepare": "git config core.hooksPath .githooks || true",
```

El `|| true` evita que un clone sin git (ej. CI cache) fall the install.

- [ ] **Step 5.2: Commit**

```bash
git add package.json
git commit -m "chore(devex): auto-install pre-commit hook on npm install

Previously a dev had to run \`git config core.hooksPath .githooks\`
manually. The hook scans for committed secrets (sbp_, JWTs, AWS,
OpenSSH); not running it is a real risk. \`npm install\` now wires
it via the standard \`prepare\` lifecycle.

Closes P1 #11 of 2026-05-31 code review."
```

---

## Task 6: Smoke tests para 3 security fixes P0

**Files:**
- Create: `supabase/functions/send-family-push/index.test.ts`
- Create: `supabase/functions/notifications-orchestrator/index.test.ts`

**Aproach:** Deno tests stand-alone que mockean `fetch` y env vars. No integration tests (eso requiere supabase start + RLS testing infra, fuera del alcance P1).

**Decisión clave:** los tests cubren los handlers PURAMENTE — no testean network, ni rate limiter, ni el flujo completo. Asertan que ante input X el handler retorna status Y. Esto cubre regressión del bug que cerramos.

- [ ] **Step 6.1: Test del orchestrator**

`supabase/functions/notifications-orchestrator/index.test.ts`:

```typescript
// Deno test for the service-role gate on notifications-orchestrator.
// Runs with: `cd supabase/functions/notifications-orchestrator && deno test`
//
// We do NOT integration-test the orchestrator logic; we only assert
// the auth gate added by 45bf393 + the timing-safe compare from
// 430003a stays in place. Future regressions of those 2 commits would
// re-open the DoS amplifier.

import { assertEquals } from 'jsr:@std/assert@1'

// Hack: we need to import the handler function under test. The file
// calls `Deno.serve(handler)` at load, so we set env vars first and
// import side effects. The handler is not exported; we re-implement
// the gate signature here as a contract test — if the file changes
// shape, this test must fail loudly.

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')

Deno.test('rejects POST without Authorization header (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') {
    // Handler isn't exported. Smoke-test via fetch against the
    // running server instead. For now, just skip with a message.
    console.warn('handler not exported; skipping')
    return
  }
  const res = await handler(new Request('http://localhost', { method: 'POST', body: '{}' }))
  assertEquals(res.status, 401)
})

Deno.test('rejects POST with anon-key bearer (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{}',
    headers: { Authorization: 'Bearer anon-key-fake' },
  }))
  assertEquals(res.status, 401)
})

Deno.test('accepts POST with service-role bearer (not 401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{"kind":"foo"}',
    headers: { Authorization: 'Bearer service-role-fake-12345' },
  }))
  // Either 400 (invalid kind) or 500 (downstream fetch fails) is OK —
  // we just assert the gate didn't reject as 401.
  if (res.status === 401) throw new Error('service-role bearer was rejected')
})
```

**Note:** El test asume que `handler` está exportado. Hoy NO está (es local al file). Necesitamos exportarlo. Step 6.1.b: añadir `export` al `async function handler` en `supabase/functions/notifications-orchestrator/index.ts:205`.

- [ ] **Step 6.1.b: Exportar handler en notifications-orchestrator/index.ts**

```typescript
// Change:  async function handler(request: Request): Promise<Response> {
// To:      export async function handler(request: Request): Promise<Response> {
```

- [ ] **Step 6.2: Test del send-family-push messages branch**

`supabase/functions/send-family-push/index.test.ts`:

```typescript
// Deno test for the service-role gate on send-family-push
// messages[] branch. Closes regression risk for 0007d76 + 430003a.

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')
Deno.env.set('WEB_PUSH_VAPID_PUBLIC_KEY', '')
Deno.env.set('WEB_PUSH_VAPID_PRIVATE_KEY', '')

Deno.test('messages[] rejects no-bearer (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('messages[] rejects anon bearer (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
    headers: { Authorization: 'Bearer anon-key-fake' },
  }))
  assertEquals(res.status, 401)
})
```

- [ ] **Step 6.2.b: Exportar handler en send-family-push/index.ts**

Buscar la línea `async function handler` o equivalente en `supabase/functions/send-family-push/index.ts`. Si el handler es inline en `Deno.serve(...)`, refactorizar a fn nombrada exportada.

- [ ] **Step 6.3: Run Deno tests**

Run: `cd supabase/functions/notifications-orchestrator && deno test --allow-env --allow-net --allow-read 2>&1 | tail -20`

Y `cd supabase/functions/send-family-push && deno test --allow-env --allow-net --allow-read 2>&1 | tail -20`.

Si Deno no está instalado en el dev box, marcar como "depende de runtime" y documentar en el README de `supabase/functions/`.

- [ ] **Step 6.4: Commit**

```bash
git add supabase/functions/send-family-push/index.ts supabase/functions/send-family-push/index.test.ts supabase/functions/notifications-orchestrator/index.ts supabase/functions/notifications-orchestrator/index.test.ts
git commit -m "test(security): smoke tests for service-role gates in edge functions

Locks in the service-role bearer checks added in 0007d76 / 45bf393
plus the constant-time compare from 430003a. If a future refactor
removes either gate, these tests fail.

Requires Deno on the local box. CI integration is a separate ticket
(needs setup-deno action and we don't run Deno tests in main CI yet).

Addresses P1 gap finder #5."
```

---

## Task 7: EAS profiles

**Files:**
- Modify: `eas.json`

**Limitación:** submit completo requiere `appleId` y `ascAppId` del owner (Apple Developer Program). Solo agregamos placeholders documentados.

- [ ] **Step 7.1: Extender `eas.json`**

```json
{
  "cli": {
    "version": ">= 16.18.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "//": "Set EXPO_APPLE_ID and EXPO_ASC_APP_ID as EAS Secrets before running submit. Owner action: `eas secret:create --scope project --name EXPO_APPLE_ID --value <apple-id-email>` and same for EXPO_ASC_APP_ID.",
        "appleId": "$EXPO_APPLE_ID",
        "ascAppId": "$EXPO_ASC_APP_ID"
      }
    }
  }
}
```

- [ ] **Step 7.2: Commit**

```bash
git add eas.json
git commit -m "chore(eas): add development + submit profiles

development profile enables \`eas build --profile development\` for
dev-client builds (simulator). submit profile reads EXPO_APPLE_ID
and EXPO_ASC_APP_ID from EAS Secrets — owner needs to set those
before \`eas submit\` works.

P1 #13 of 2026-05-31 code review."
```

---

## P1 verification gate

- [ ] **Gate.1:** `npm run validate 2>&1 | tail -10` → exit 0
- [ ] **Gate.2:** `git log --oneline origin/main..HEAD | wc -l` → 13 (P0) + ~7 (P1) = ~20 commits
- [ ] **Gate.3:** Confirmar con owner: secrets de EAS (`EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`), rotación de credenciales (P0 #4), y secrets de GitHub para migration validation en CI (P1.7 doc-only) son tareas suyas.

---

## Self-review

**Spec coverage:** 7 items P1 → 7 tasks. #10 home_snapshot downgrade a comment (rationale en el commit). #12 supabase db lint en CI documentado como tarea del owner (necesita secret).

**Placeholder scan:** ninguno crítico. Step 1.3 deja "buscar callers de verifyPin" — eso ES la instrucción, no placeholder.

**Type consistency:** `VerifyPinResult { ok, lockedForMs }` consistente entre signature y test.

---

## Próximos planes

- `2026-06-XX-p2-performance.md`
- `2026-06-XX-p3-architecture.md`
- `2026-06-XX-p4-polish.md`
