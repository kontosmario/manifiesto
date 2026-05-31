# P0 Code Review Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 6 bloqueantes P0 del code review consolidado del 2026-05-31: 3 bugs de seguridad (push function bypass, RLS payments asimétrica, orchestrator open), rotación de credenciales (acción manual del owner), CI rojo (vitest `__DEV__`, motion-tokens), y workflow CI que no corre tests/guards.

**Architecture:**
1. Edge functions: añadir gate de service-role explícito a las ramas privilegiadas (no depender de `verify_jwt` que está off por ES256).
2. RLS: migración nueva, simétrica a `20260522000000_fix_expenses_rls_owner_scope.sql`, para `fixed_expense_payments` UPDATE/DELETE.
3. Test infra: shim `__DEV__` global + crear `mobile/lib/copy/glossary.ts` que ya está importado por el test pero no existe.
4. Motion tokens: usar `@motion-allow` allowlist en las 3 líneas decorativas de sheen.
5. CI: extender `mobile-ci.yml` con `npm test` + 3 guards.

**Tech Stack:** Deno (Edge Functions), Postgres/RLS, Vitest, GitHub Actions, React Native/Expo, Reanimated 4.

**Out of scope para este plan:** P1+ (PIN hardening, CORS, search_path en triggers, EAS profiles, performance, arquitectura, polish). Se planifican en docs separados después que P0 esté en main y verde.

---

## Task 1: Cerrar bypass de auth en `send-family-push` (rama `messages`)

**Files:**
- Modify: `supabase/functions/send-family-push/index.ts:309-328`

**Problema:** la rama `if (Array.isArray(payload.messages))` retorna antes de validar el bearer token. Con `verify_jwt = false` en config.toml, cualquier caller anónimo puede enviar `{ messages: [{ to: "ExponentPushToken[...]", title, body }] }` y disparar pushes arbitrarios.

**Fix:** requerir bearer token === `SUPABASE_SERVICE_ROLE_KEY` antes de aceptar la rama. El orchestrator usa `admin.functions.invoke('send-family-push', { body: { messages } })` con el admin client, que envía exactamente ese bearer.

- [ ] **Step 1.1: Modificar la rama `messages` para exigir service-role**

Reemplazar el bloque actual (líneas 316-328) por:

```typescript
  // notifications-orchestrator path: caller pre-resolved tokens and
  // built ExpoPushMessage[]. This branch must ONLY be reachable by
  // the orchestrator (service-role). Without this gate, since
  // verify_jwt is off at the gateway (ES256 workaround), an
  // unauthenticated caller could spam arbitrary Expo push tokens.
  if (Array.isArray(payload.messages)) {
    const orchestratorToken = extractBearerToken(
      request.headers.get('Authorization') ?? request.headers.get('authorization'),
    )
    if (!orchestratorToken || orchestratorToken !== supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Unauthorized (service-role required for batch path).' }, 401)
    }
    const messages = payload.messages
    if (messages.length === 0) {
      return jsonResponse({ ok: true, count: 0 })
    }
    await sendExpoBatch(messages)
    return jsonResponse({ ok: true, count: messages.length })
  }
```

- [ ] **Step 1.2: Commit**

```bash
git add supabase/functions/send-family-push/index.ts
git commit -m "fix(security): require service-role bearer on send-family-push messages branch

Without this gate, with verify_jwt=false at the gateway (required by
ES256), an unauthenticated caller could POST { messages: [...] } and
trigger arbitrary Expo push fan-out (spam/phishing). The orchestrator
uses admin.functions.invoke which signs with the service-role key.

Closes P0 #1 of 2026-05-31 code review."
```

---

## Task 2: Migration para cerrar gap RLS en `fixed_expense_payments`

**Files:**
- Create: `supabase/migrations/20260601000000_fix_fixed_expense_payments_rls_owner_scope.sql`

**Problema:** las policies UPDATE/DELETE en `fixed_expense_payments` solo chequean `is_fixed_expense_family_member(fixed_expense_id)`. Cualquier miembro puede editar/borrar pagos creados por otro. Mismo bug que `expenses` (cerrado el 2026-05-22 con `20260522000000_fix_expenses_rls_owner_scope.sql`).

Para la simetría, necesitamos saber el `family_id` del `fixed_expense` que el pago referencia. Reutilizamos `is_fixed_expense_family_member` para membership y agregamos chequeo de owner.

- [ ] **Step 2.1: Verificar la firma de `is_family_owner` y existencia de un helper de owner sobre fixed_expense_id**

Run: `grep -n "is_family_owner\|is_fixed_expense" supabase/migrations/ -r | head -20`

Expected: `is_family_owner(fam_id uuid)` existe; no hay helper `is_fixed_expense_family_owner`. Tendremos que resolver el `family_id` del fixed_expense desde la policy con subquery.

- [ ] **Step 2.2: Crear la migración**

```sql
-- Fix RLS gap on public.fixed_expense_payments (security: HIGH).
--
-- Problem: UPDATE and DELETE policies only checked
-- is_fixed_expense_family_member(fixed_expense_id), so ANY member of
-- a family could edit or delete payment rows created by ANOTHER
-- member (mutate amount, paid_at, or silently delete history).
-- INSERT already required paid_by = auth.uid(); UPDATE/DELETE did not.
--
-- Fix: a member can only mutate their OWN payments
-- (paid_by = auth.uid()); the family owner retains full control
-- (is_family_owner(family_id resolved from the parent fixed_expense)).
--
-- Symmetric to 20260522000000_fix_expenses_rls_owner_scope.sql.
-- Closes P0 #2 of 2026-05-31 code review.

drop policy if exists "fixed_expense_payments_update_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_update_members"
on public.fixed_expense_payments
for update
to authenticated
using (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
)
with check (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
);

drop policy if exists "fixed_expense_payments_delete_members" on public.fixed_expense_payments;
create policy "fixed_expense_payments_delete_members"
on public.fixed_expense_payments
for delete
to authenticated
using (
  public.is_fixed_expense_family_member(fixed_expense_id)
  and (
    paid_by = auth.uid()
    or public.is_family_owner((
      select fe.family_id
      from public.fixed_expenses fe
      where fe.id = fixed_expense_payments.fixed_expense_id
    ))
  )
);
```

- [ ] **Step 2.3: Commit**

```bash
git add supabase/migrations/20260601000000_fix_fixed_expense_payments_rls_owner_scope.sql
git commit -m "fix(security): tighten RLS on fixed_expense_payments UPDATE/DELETE

Mirror of the 2026-05-22 expenses RLS fix. Without this, any family
member could mutate or silently delete payment rows created by
another member. Restrict to paid_by = auth.uid() OR family owner.

Closes P0 #2 of 2026-05-31 code review."
```

---

## Task 3: Gate de service-role en `notifications-orchestrator`

**Files:**
- Modify: `supabase/functions/notifications-orchestrator/index.ts:193-219`

**Problema:** el orchestrator no chequea explícitamente service-role. Por defecto el gateway hace `verify_jwt = true` (sin entry en config.toml), entonces solo callers autenticados pueden invocarlo, pero **cualquier usuario logueado** puede dispararlo y procesar fan-out completo de notificaciones. Para una app que va a 5k MAU, eso es un amplificador de DoS/costo.

- [ ] **Step 3.1: Añadir helper `extractBearerToken` si no existe en este archivo**

Run: `grep -n "extractBearerToken\|service.role" supabase/functions/notifications-orchestrator/index.ts`

Si no existe, copiar el helper de `send-family-push` (mismas líneas 95-110). Esto se hace inline en el step siguiente.

- [ ] **Step 3.2: Modificar el handler para exigir service-role**

Reemplazar el bloque `async function handler(request: Request)` (líneas 193-219) por:

```typescript
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }
  const normalized = authorizationHeader.trim()
  if (normalized.toLowerCase().startsWith('bearer ')) {
    const token = normalized.slice(7).trim()
    return token.length > 0 ? token : null
  }
  return normalized.length > 0 ? normalized : null
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  // Service-role gate: this function is invoked by pg_cron (which
  // signs with the service-role key) and should not be reachable by
  // end users. Defense-in-depth against an authenticated user
  // triggering a full notification fan-out (DoS/cost amplifier at
  // scale).
  const callerToken = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!callerToken || callerToken !== supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Unauthorized (service-role required).' }, 401)
  }

  let payload: { kind?: unknown }
  try {
    payload = (await request.json()) as { kind?: unknown }
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }
  if (!isKind(payload.kind)) {
    return jsonResponse({ error: 'kind required (one of allowed kinds).' }, 400)
  }
  try {
    const result = await processKind(payload.kind)
    return jsonResponse(result)
  } catch (error) {
    console.error('orchestrator failed', error)
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error != null
          ? JSON.stringify(error)
          : String(error)
    return jsonResponse({ error: message }, 500)
  }
}
```

Nota: este archivo ya debe tener `supabaseServiceRoleKey` en scope (porque crea `admin` client). Si no — verificar primero leyendo el top del archivo.

- [ ] **Step 3.3: Verificar que `supabaseServiceRoleKey` está en scope al top del archivo**

Run: `grep -n "SUPABASE_SERVICE_ROLE_KEY\|supabaseServiceRoleKey" supabase/functions/notifications-orchestrator/index.ts`

Expected: una declaración tipo `const supabaseServiceRoleKey = env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''` en el top. Si no existe, agregarla siguiendo el patrón de `send-family-push/index.ts:62`.

- [ ] **Step 3.4: Commit**

```bash
git add supabase/functions/notifications-orchestrator/index.ts
git commit -m "fix(security): require service-role bearer on notifications-orchestrator

Without this gate, any authenticated user could POST and trigger a
full notification fan-out (DoS/cost amplifier at 5k MAU scale).
pg_cron signs invocations with the service-role key.

Closes P0 #3 of 2026-05-31 code review."
```

---

## Task 4: Documentar rotación de credenciales (acción manual del owner)

**Files:**
- Create: `docs/operaciones/2026-05-31-credential-rotation-required.md`

**Problema:** `.env.supabase` contiene `SUPABASE_ACCESS_TOKEN` (sbp_...) y `SUPABASE_DB_PASSWORD` en plaintext en el working dir. Está en `.gitignore` (verificado) pero conviene rotar al haber sido expuestos a análisis. No puedo rotarlos por el usuario — requiere acción en el dashboard de Supabase.

- [ ] **Step 4.1: Crear documento de acción**

```markdown
# Rotación de credenciales requerida (2026-05-31)

> **Acción manual del owner**. Claude no puede ejecutar esto.

## Por qué

El code review consolidado del 2026-05-31 identificó que `.env.supabase`
contiene en plaintext:

- `SUPABASE_ACCESS_TOKEN` (sbp_...) — personal access token con acceso
  total a la Management API del proyecto.
- `SUPABASE_DB_PASSWORD` — password de Postgres del proyecto.

Aunque el archivo está en `.gitignore` y nunca se commiteó (verificado
con `git log --all --diff-filter=A --name-only`), conviene tratarlos
como comprometidos al haber sido expuestos a análisis externo.

## Pasos

1. **Rotar `SUPABASE_ACCESS_TOKEN`**:
   - Ir a https://supabase.com/dashboard/account/tokens
   - Revocar el token vigente (su prefijo de 4 chars + 32 hex está en `.env.supabase` local; no lo replicamos acá para no embeberlo en git history)
   - Generar uno nuevo, scoped solo al proyecto si es posible
   - Guardar en macOS Keychain (`security add-generic-password -a $USER -s manifiesto-supabase-access-token -w <token>`)
     o en 1Password CLI (`op item create`)
   - Actualizar local: borrar la línea de `.env.supabase` y leer del
     keychain en los scripts que lo usen
2. **Rotar `SUPABASE_DB_PASSWORD`**:
   - Dashboard → Project Settings → Database → Reset database password
   - Actualizar las connection strings en EAS Secrets y en el keychain local
   - Verificar que `npm run supabase:remote:db:push` siga funcionando
3. **Verificar que no hay otros tokens en el repo**:

Usar el scanner del pre-commit hook (`.githooks/pre-commit`) que cubre tokens Supabase, JWTs, AWS y OpenSSH:

```bash
bash .githooks/pre-commit
```

Expected output: vacío.

4. **Marcar este doc como cerrado** moviéndolo a `docs/operaciones/archivo/`
   una vez completos los pasos.

## Referencia

Code review consolidado 2026-05-31, P0 #4.
```

- [ ] **Step 4.2: Commit**

```bash
git add docs/operaciones/2026-05-31-credential-rotation-required.md
git commit -m "docs(security): action item for owner — rotate Supabase credentials

Sbp_ access token and DB password are local-only (.gitignore'd, never
committed) but should be rotated after external review exposure.
Step-by-step in the doc.

P0 #4 of 2026-05-31 code review (owner action, not code change)."
```

---

## Task 5: Reparar `npm test` rojo — `__DEV__` global + módulo `glossary` faltante

**Files:**
- Modify: `vitest.config.ts`
- Create: `mobile/lib/copy/glossary.ts`

**Problema:** 3 suites crashean. Dos por `ReferenceError: __DEV__ is not defined` (importan `expo-modules-core` que referencia el global de RN). Una por `Cannot find module '@/lib/copy/glossary'` — el test existe pero el módulo no.

El test `tests/unit/copy-glossary.test.ts` espera 7 términos canónicos en español. Esos términos ya existen distribuidos en la app (ver `mobile/lib/copy/states.ts`); falta consolidarlos en un solo módulo `terms`.

- [ ] **Step 5.1: Añadir `__DEV__` y `__TEST__` al vitest config**

Reemplazar `vitest.config.ts` completo por:

```typescript
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'mobile'),
      'react-native-reanimated': resolve(__dirname, 'tests/stubs/react-native-reanimated.ts'),
      'react-native': resolve(__dirname, 'tests/stubs/react-native.ts'),
      'expo-secure-store': resolve(__dirname, 'tests/stubs/expo-secure-store.ts'),
      '@react-navigation/native': resolve(__dirname, 'tests/stubs/react-navigation-native.ts'),
    },
  },
  define: {
    // expo-modules-core / RN runtime check this global. Without it
    // any test file that transitively imports those modules crashes
    // with "ReferenceError: __DEV__ is not defined" before user code
    // runs.
    __DEV__: true,
  },
  test: {
    environment: 'node',
    exclude: [
      'dist/**',
      'ios/**',
      'legacy-web-src/**',
      'node_modules/**',
    ],
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5.2: Crear el módulo `glossary.ts`**

Crear `mobile/lib/copy/glossary.ts`:

```typescript
/**
 * Canonical Spanish-language terminology used across the app's UI
 * copy. Centralizing these terms here keeps a single source of
 * truth — feature copy should reference `terms.expense` rather than
 * inlining the literal "Gasto", so renames propagate.
 *
 * Asserted by tests/unit/copy-glossary.test.ts.
 */
export const terms = {
  expense: 'Gasto',
  expensePlural: 'Gastos',
  currentCycle: 'Este ciclo',
  available: 'Disponible',
  margin: 'Margen',
  payday: 'Día de cobro',
  fixedExpense: 'Gasto fijo',
  fixedExpensePlural: 'Gastos fijos',
  history: 'Historial',
} as const

export type TermKey = keyof typeof terms
```

- [ ] **Step 5.3: Run tests, verify all 3 previously-failing suites pass**

Run: `npm test 2>&1 | tail -30`

Expected: `Test Files <N> passed`, `Tests <M> passed`. No `__DEV__ is not defined`, no `Cannot find module '@/lib/copy/glossary'`.

- [ ] **Step 5.4: Commit**

```bash
git add vitest.config.ts mobile/lib/copy/glossary.ts
git commit -m "fix(tests): unblock npm test — define __DEV__ global, add copy glossary

Three suites were red:
- skeleton-layouts.test.ts and use-unbounded-loop-animation.test.ts
  crashed on \`ReferenceError: __DEV__ is not defined\` from
  expo-modules-core. Fixed with vitest \`define\`.
- copy-glossary.test.ts imported \`@/lib/copy/glossary\` which never
  existed. Created the module with the 7 canonical Spanish terms the
  test asserts.

Closes P0 #6a of 2026-05-31 code review."
```

---

## Task 6: Cerrar `guard:motion-tokens` — sheen sweep en achievements-gallery

**Files:**
- Modify: `mobile/screens/settings/achievements-gallery-screen.tsx:430-443`

**Problema:** 3 inline `{ duration }` en una animación de sheen decorativa rompen `npm run guard:motion-tokens`. Los valores (60, 520, 160) son tuned para el sweep y no encajan limpio en `motionDurations` ni `decorativeDurations`. La guard tiene allowlist `// @motion-allow: <reason>` exactamente para este caso.

- [ ] **Step 6.1: Agregar comentarios `@motion-allow` sobre cada línea ofensora**

Modificar las 3 occurrences en el archivo. Cada `withTiming(...)` con `duration:` numérico necesita un comentario `// @motion-allow: ...` en la línea inmediatamente anterior (la guard busca el comentario en la línea anterior o la misma).

Cambio en líneas 430-443:

```typescript
    // Delay slightly so the RiseView stagger entrance lands first.
    // @motion-allow: sheen fade-in tuned to 60ms — sub-micro decorative one-off, not UI feedback
    sheenOpacity.value = withDelay(
      180,
      withTiming(1, { duration: 60, easing: Easing.bezier(0.16, 1, 0.30, 1) }),
    )
    // @motion-allow: sheen sweep tuned to 520ms — designer-set, between slow(480) and breath(2800)
    sheenX.value = withDelay(
      180,
      withTiming(340, {
        duration: 520,
        easing: Easing.bezier(0.16, 1, 0.30, 1),
      }),
    )
    // Fade the sheen out near the end so it doesn't linger.
    // @motion-allow: sheen fade-out tuned to 160ms — between micro(120) and quick(180)
    sheenOpacity.value = withDelay(
      500,
      withTiming(0, { duration: 160, easing: Easing.bezier(0.16, 1, 0.30, 1) }),
    )
```

- [ ] **Step 6.2: Verificar que el guard pasa**

Run: `npm run guard:motion-tokens`

Expected: exit 0, no violations reported.

- [ ] **Step 6.3: Commit**

```bash
git add mobile/screens/settings/achievements-gallery-screen.tsx
git commit -m "fix(motion): allowlist sheen sweep tuned durations in achievements gallery

The sheen sweep on premium achievement cards uses 60/520/160ms
durations that don't fit motionDurations or decorativeDurations
cleanly. Each is a designer-tuned decorative one-off (not UI
interaction feedback), which is exactly what the @motion-allow
allowlist is for. Adds inline comments documenting why.

Closes P0 #6b of 2026-05-31 code review."
```

---

## Task 7: Extender `mobile-ci.yml` con tests y guards

**Files:**
- Modify: `.github/workflows/mobile-ci.yml`

**Problema:** el workflow corre solo `lint` + `typecheck`. PRs con tests rojos o guards rotos pueden mergear. El script `validate` ya hace lo correcto; solo hay que invocarlo (o expandirlo en pasos separados para mejor reporting en GitHub Actions).

- [ ] **Step 7.1: Reemplazar el workflow por la versión completa**

```yaml
name: Mobile CI

on:
  push:
    branches:
      - main
  pull_request:
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm test

      - name: Guard — legacy spacing
        run: npm run guard:legacy-spacing

      - name: Guard — forbidden copy
        run: npm run guard:forbidden-copy

      - name: Guard — motion tokens
        run: npm run guard:motion-tokens
```

- [ ] **Step 7.2: Verificar localmente que `npm run validate` pasa entero**

Run: `npm run validate 2>&1 | tail -40`

Expected: exit 0. Si falla, debug — los pasos previos (Task 5, Task 6) deberían haberlo dejado verde.

- [ ] **Step 7.3: Commit**

```bash
git add .github/workflows/mobile-ci.yml
git commit -m "ci: run tests and all guards on every PR

mobile-ci.yml only ran lint+typecheck. Tests and the three custom
guards (legacy-spacing, forbidden-copy, motion-tokens) could rot
silently. Now every PR must pass the full validate suite.

Closes P0 #5 of 2026-05-31 code review."
```

---

## P0 verification gate

After all 7 tasks merge:

- [ ] **Gate.1: Re-run `npm run validate` end-to-end on main**

Run: `git checkout main && git pull && npm run validate 2>&1 | tail -20`

Expected: exit 0.

- [ ] **Gate.2: Push migration + edge functions to remote staging**

Run:
```bash
npm run supabase:remote:db:push
npm run supabase:remote:functions:deploy   # send-family-push
supabase functions deploy notifications-orchestrator
```

- [ ] **Gate.3: Smoke test the gates manually**

Bash:
```bash
# Should return 401 (no bearer)
curl -X POST "$SUPABASE_FUNCTIONS_URL/send-family-push" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"to":"ExponentPushToken[fake]","title":"t","body":"b"}]}'

# Should return 401 (anon caller, not service-role)
curl -X POST "$SUPABASE_FUNCTIONS_URL/notifications-orchestrator" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"kind":"daily-digest"}'
```

Expected: both return `401 Unauthorized`.

- [ ] **Gate.4: P0 #4 manual action confirmed by owner**

Confirmar con el owner que los tokens fueron rotados antes de declarar P0 cerrado.

---

## Self-review

**Spec coverage:** 6 items P0 del punch list → 7 tasks (P0 #6 se partió en 6a/6b porque vitest y motion son archivos diferentes). #4 es documentación porque no puedo rotar tokens del owner.

**Placeholder scan:** ninguno. Todo el código está completo en cada step.

**Type consistency:** `terms` es `const` con keys en camelCase consistentes con el test. `extractBearerToken` reusa la firma idéntica de `send-family-push/index.ts:95`.

---

## Próximos planes (out of scope para este)

- `2026-06-XX-p1-hardening.md` — PIN PBKDF2 + CSPRNG + lockout, CORS restrictivo, `search_path` en 4 trigger fns, `home_snapshot` determinístico, `prepare` hook auto-install, validación de migrations en CI, EAS dev/submit profiles.
- `2026-06-XX-p2-performance.md` — `memberById` map, removeClippedSubviews en historial, theme context split, refetchOnWindowFocus, getItemLayout.
- `2026-06-XX-p3-architecture.md` — romper ciclos home↔telemetry y expenses↔insights, extraer controllers de mega-screens, doc de convención `gastos`/`expenses` UI/dominio.
- `2026-06-XX-p4-polish.md` — `as any` Href, DAY_MS shared util, scripts huérfanos, password mínimo 8 chars.
