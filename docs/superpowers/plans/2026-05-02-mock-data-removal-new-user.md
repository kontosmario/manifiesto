# Mock Data Removal for New Users — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la fuga de `CONTROL_MOCK` (ingresos $2.2M, gastos diarios fake, "Disney+", "Edenor", "Cena cumpleaños") a usuarios recién registrados sin datos reales. La pantalla CONTROL ya tiene su propio empty state — el problema es que Home, Asistente y el badge del tab leen `signals` y `data` del hook y muestran tareas + métricas inventadas.

**Architecture:**
1. Cambiar el contrato de `useControlV2Data`: cuando `usingMock === true` (nuevo usuario), `signals` se devuelve **vacío** (`[]`) en lugar de `CONTROL_MOCK.tareas`. La forma `data` sigue retornando `CONTROL_MOCK` (es la única referencia de tipo no-nulo, pero ningún consumer lo lee si comprueba `usingMock` antes — Control v2 ya lo hace).
2. Adaptar el `EmptyState` del Asistente para diferenciar "usuario nuevo / sin datos" de "tenías sugerencias y las revisaste todas".
3. Marcar `CONTROL_MOCK` como `dev fixture` (mantenerlo importable para tests/Storybook, pero garantizar via test que `signals` jamás contiene sus tareas en runtime).

**Tech Stack:** TypeScript, React Native (Expo Router), Vitest + tests/stubs (node env). Tests se ejecutan con `npm run test` (vitest).

---

## File Structure

**Modify:**
- `mobile/features/insights/use-control-v2-data.ts` — cambiar fallback `signals` y `forecast` para usuario sin datos.
- `mobile/screens/home/asistente-screen.tsx` — adaptar `EmptyState` con copy de "primer uso" cuando `usingMock`.
- `mobile/features/insights/control-v2-mock.ts` — añadir comentario destacando que `tareas` es **dev-only** y nunca debe servirse a usuarios reales.

**Create:**
- `tests/unit/use-control-v2-data-empty.test.ts` — test del nuevo contrato del hook (signals vacíos en usingMock).

**Read-only / verificación:**
- `mobile/features/insights/use-advisor-badge.ts` — ya consume `signals.filter(urgency==='alta')`, queda automáticamente correcto cuando signals es `[]`.
- `mobile/screens/home/home-screen.tsx:125-130` — `assistantPendingCount` queda en 0 automáticamente.
- `mobile/components/home/home-dashboard.tsx:124-125` — ya hace `controlData.usingMock ? 0 : controlData.view.vault`.
- `mobile/screens/home/control-v2-screen.tsx:139-175` — ya renderiza `<ControlV2EmptyState>` cuando `usingMock`.

---

## Task 1: Test that signals are empty when usingMock is true

**Files:**
- Create: `tests/unit/use-control-v2-data-empty.test.ts`

This task validates the **pure logic** of the fallback decision. We don't render the hook (would require react-test-renderer + an entire React Query stub). Instead we extract the decision into a tiny pure helper and test it directly. The helper is then consumed inside the hook.

- [ ] **Step 1.1: Write the failing test**

```ts
// tests/unit/use-control-v2-data-empty.test.ts
import { describe, expect, it } from 'vitest'
import { resolveControlSignals } from '@/features/insights/control-v2-empty-fallback'
import { CONTROL_MOCK, type ControlAdvisorTask } from '@/features/insights/control-v2-mock'

const REAL_TASK: ControlAdvisorTask = {
  id: 'real-1',
  emoji: '⚡',
  cat: 'Servicios',
  title: 'Real signal',
  body: 'real',
  impact: '+$1',
  impactRaw: 1,
  cta: 'Ver',
  urgency: 'baja',
  confidence: 1,
  dataDays: 30,
}

describe('resolveControlSignals', () => {
  it('returns empty array for new users (usingMock=true) — never the mock tasks', () => {
    const result = resolveControlSignals({
      usingMock: true,
      computedSignals: [REAL_TASK],
    })
    expect(result).toEqual([])
  })

  it('does NOT include CONTROL_MOCK tareas (Disney+, Edenor, Ocio) when usingMock=true', () => {
    const result = resolveControlSignals({
      usingMock: true,
      computedSignals: [REAL_TASK],
    })
    const titles = result.map((t) => t.title)
    expect(titles).not.toContain(CONTROL_MOCK.tareas[0].title) // "Bajá un poco el Ocio..."
    expect(titles).not.toContain(CONTROL_MOCK.tareas[1].title) // "Disney+ lleva 2 meses..."
    expect(titles).not.toContain(CONTROL_MOCK.tareas[2].title) // "La luz subió 14%"
  })

  it('returns the computed signals when usingMock=false', () => {
    const result = resolveControlSignals({
      usingMock: false,
      computedSignals: [REAL_TASK],
    })
    expect(result).toEqual([REAL_TASK])
  })

  it('returns empty array when usingMock=false but there are no computed signals', () => {
    const result = resolveControlSignals({
      usingMock: false,
      computedSignals: [],
    })
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 1.2: Run the test to verify it fails (file does not exist yet)**

Run: `npx vitest run tests/unit/use-control-v2-data-empty.test.ts`
Expected: FAIL — `Cannot find module '@/features/insights/control-v2-empty-fallback'`

- [ ] **Step 1.3: Create the helper file**

Create `mobile/features/insights/control-v2-empty-fallback.ts` with the exact content:

```ts
// Fallback gate for `useControlV2Data`.
//
// When `usingMock === true` the user is brand-new (no income configured
// or zero expenses) and we used to serve `CONTROL_MOCK.tareas` — three
// fake tasks referencing Disney+, Edenor and a fictitious "Ocio"
// overspend. Real users perceived these as their own data.
//
// New contract: `signals` is empty during the mock window. UI
// consumers (asistente-screen, home tab badge) already render empty
// states correctly when `signals.length === 0`.

import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

export interface ResolveControlSignalsInput {
  usingMock: boolean
  computedSignals: ControlAdvisorTask[]
}

export function resolveControlSignals(
  input: ResolveControlSignalsInput,
): ControlAdvisorTask[] {
  if (input.usingMock) return []
  return input.computedSignals
}
```

- [ ] **Step 1.4: Run tests — expect PASS**

Run: `npx vitest run tests/unit/use-control-v2-data-empty.test.ts`
Expected: 4 tests passed.

- [ ] **Step 1.5: Commit**

```bash
git add tests/unit/use-control-v2-data-empty.test.ts mobile/features/insights/control-v2-empty-fallback.ts
git commit -m "test(insights): add resolveControlSignals fallback gate for new users

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire the helper into useControlV2Data

**Files:**
- Modify: `mobile/features/insights/use-control-v2-data.ts:216-263`

- [ ] **Step 2.1: Add the import**

In `mobile/features/insights/use-control-v2-data.ts`, after the existing `import type { ControlAdvisorTask } ...` line (currently line 48), add:

```ts
import { resolveControlSignals } from '@/features/insights/control-v2-empty-fallback'
```

- [ ] **Step 2.2: Replace the `signals` useMemo body**

In `use-control-v2-data.ts`, locate the block:

```ts
  const signals = useMemo<ControlAdvisorTask[]>(() => {
    if (usingMock) return CONTROL_MOCK.tareas
    return memoizedBuildSignals({
```

(currently around line 216-217). Replace **only** the `if (usingMock) return CONTROL_MOCK.tareas` line with:

```ts
    if (usingMock) return resolveControlSignals({ usingMock: true, computedSignals: [] })
```

The `memoizedBuildSignals(...)` call below stays untouched. The deps array of the `useMemo` stays untouched.

Rationale: keeping the helper call (rather than inlining `return []`) makes the contract explicit and the test from Task 1 covers the runtime path the hook takes.

- [ ] **Step 2.3: Run the existing control-signals test to make sure nothing else regressed**

Run: `npx vitest run tests/unit/control-signals.test.ts tests/unit/use-control-v2-data-empty.test.ts`
Expected: ALL pass.

- [ ] **Step 2.4: Run typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit` if no `typecheck` script exists — verify by reading `package.json` first).
Expected: 0 errors related to the files modified.

- [ ] **Step 2.5: Commit**

```bash
git add mobile/features/insights/use-control-v2-data.ts
git commit -m "fix(insights): stop leaking CONTROL_MOCK tareas to new users

useControlV2Data now returns an empty signals[] when usingMock is true.
Previously a fresh account saw three fabricated tasks (Disney+, Edenor,
Ocio) sourced from the dev fixture, which surfaced in the home badge,
asistente screen and advisor tab dot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Adapt asistente EmptyState copy for first-time users

The `EmptyState` component in `asistente-screen.tsx:1053-1069` currently renders:

> "Revisaste todas las sugerencias"
> "El asistente sigue mirando tus números. Si los patrones persisten, las sugerencias volverán a aparecer."

This message is correct when a user **had** signals and dismissed them. It is **wrong** for a brand-new user who never had any signal. We add a `firstTime` boolean prop and a different copy for that case.

**Files:**
- Modify: `mobile/screens/home/asistente-screen.tsx`

- [ ] **Step 3.1: Add a unit test for the copy selection helper**

Create `tests/unit/asistente-empty-copy.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { selectAsistenteEmptyCopy } from '@/features/insights/asistente-empty-copy'

describe('selectAsistenteEmptyCopy', () => {
  it('returns first-time copy for brand-new users (usingMock=true)', () => {
    const copy = selectAsistenteEmptyCopy({ usingMock: true })
    expect(copy.title).toMatch(/empezando|registr|primero|listos/i)
    expect(copy.body).toMatch(/cargá|gasto|configur|ingres/i)
    // Must NOT pretend the user already reviewed signals.
    expect(copy.title.toLowerCase()).not.toContain('revisaste')
  })

  it('returns the "all reviewed" copy for established users with no pending signals', () => {
    const copy = selectAsistenteEmptyCopy({ usingMock: false })
    expect(copy.title).toContain('Revisaste')
    expect(copy.body).toMatch(/asistente|patrones|sugerencias/i)
  })
})
```

- [ ] **Step 3.2: Run the test — expect FAIL (helper doesn't exist)**

Run: `npx vitest run tests/unit/asistente-empty-copy.test.ts`
Expected: FAIL — `Cannot find module '@/features/insights/asistente-empty-copy'`

- [ ] **Step 3.3: Create the helper**

Create `mobile/features/insights/asistente-empty-copy.ts` with:

```ts
// Copy selection for the Asistente Financiero EmptyState.
//
// Two distinct empty states:
//   - First-time / new account (`usingMock`): the user just registered
//     and there is no income or no expenses yet. The assistant has
//     literally nothing to talk about; framing this as "you reviewed
//     all suggestions" would be a lie.
//   - Established user with no pending signals: the user has data and
//     either had no signals this cycle or dismissed them all. The
//     original "Revisaste todas las sugerencias" copy applies.

export interface AsistenteEmptyCopyInput {
  usingMock: boolean
}

export interface AsistenteEmptyCopy {
  title: string
  body: string
}

export function selectAsistenteEmptyCopy(
  input: AsistenteEmptyCopyInput,
): AsistenteEmptyCopy {
  if (input.usingMock) {
    return {
      title: 'Listos para empezar',
      body: 'Cargá tu ingreso y un par de gastos para que el asistente pueda mirar tus números.',
    }
  }
  return {
    title: 'Revisaste todas las sugerencias',
    body: 'El asistente sigue mirando tus números. Si los patrones persisten, las sugerencias volverán a aparecer.',
  }
}
```

- [ ] **Step 3.4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/asistente-empty-copy.test.ts`
Expected: 2 tests passed.

- [ ] **Step 3.5: Wire the helper into asistente-screen.tsx**

In `mobile/screens/home/asistente-screen.tsx`:

(a) Add the import alongside other `@/features/insights/...` imports (search for the existing `import { useControlV2Data } from '@/features/insights/use-control-v2-data'` line — currently line 51 — and add right below it):

```ts
import { selectAsistenteEmptyCopy } from '@/features/insights/asistente-empty-copy'
```

(b) Update the destructure on line 110 to include `usingMock`:

```ts
  const { signals, data, forecast, usingMock } = useControlV2Data(familyId, userId)
```

(c) Pass `usingMock` to the EmptyState. Find the JSX block around line 321:

```tsx
            {visible.length === 0 ? (
              <EmptyState />
            ) : (
```

Replace with:

```tsx
            {visible.length === 0 ? (
              <EmptyState usingMock={usingMock} />
            ) : (
```

(d) Update the `EmptyState` function definition. Find it at line 1053 and replace the whole function with:

```tsx
function EmptyState({ usingMock }: { usingMock: boolean }) {
  const copy = selectAsistenteEmptyCopy({ usingMock })
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.emptyState}
    >
      <View style={styles.emptyCheck}>
        <MaterialIcons name="check" size={20} color="#0F2A1E" />
      </View>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
    </Animated.View>
  )
}
```

- [ ] **Step 3.6: Run typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit`).
Expected: 0 new errors.

- [ ] **Step 3.7: Run all relevant tests**

Run: `npx vitest run tests/unit/asistente-empty-copy.test.ts tests/unit/use-control-v2-data-empty.test.ts`
Expected: ALL pass.

- [ ] **Step 3.8: Commit**

```bash
git add mobile/screens/home/asistente-screen.tsx mobile/features/insights/asistente-empty-copy.ts tests/unit/asistente-empty-copy.test.ts
git commit -m "fix(asistente): show first-time copy for new users instead of \"revisaste todas\"

A user with no income/expenses configured used to land on the Asistente
and read \"Revisaste todas las sugerencias\" — a sentence implying they
had reviewed something they never had. Now we branch on usingMock and
show \"Listos para empezar\" with a configuration nudge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mark CONTROL_MOCK.tareas as dev-only and update the file header

The mock dataset still has value (it powers Storybook screens during UI iteration), but its `tareas` array must never reach a real user. Update the file header so future readers don't reintroduce the leak.

**Files:**
- Modify: `mobile/features/insights/control-v2-mock.ts:1-13`

- [ ] **Step 4.1: Replace the file header comment**

In `mobile/features/insights/control-v2-mock.ts`, replace the existing header (lines 1-13):

```ts
// Control v2 — mock dataset and pure math layer.
//
// PHASE 1 (now): this file hard-codes a realistic dataset + a single
// `computeControlView` function so we can build the UI without waiting
// for backend wiring. Every number in the mock has a clear meaning —
// income, fixed, month length, current day/time, daily spend history —
// so when we connect real data in PHASE 2 we swap the `CONTROL_MOCK`
// source and keep every visualization intact.
//
// PHASE 2 plan: replace `CONTROL_MOCK` with the output of
// `useControlSnapshot(familyId)` + historical expenses query. The
// shape of `ControlView` is the contract the UI will consume.
```

with:

```ts
// Control v2 — type contracts, pure math layer, and a dev fixture.
//
// `ControlMockData`, `ControlAdvisorTask`, `computeControlView` are the
// runtime contract consumed by the Control v2 screen.
//
// `CONTROL_MOCK` is a dev-only fixture: realistic numbers used by
// Storybook and historical UI iteration. It is NEVER served to real
// users at runtime. `useControlV2Data` returns the mock `data` shape
// (so downstream components keep their non-null types) but `signals`
// is gated through `resolveControlSignals` and stays empty for new
// accounts. See `control-v2-empty-fallback.ts` for the gate, and
// `control-v2-screen.tsx` (`if (usingMock)`) for the empty state.
//
// If you find yourself reading the values below in a UI test for a
// brand-new user, that is a regression — file a bug.
```

- [ ] **Step 4.2: Verify everything still compiles**

Run: `npm run typecheck` (or `npx tsc --noEmit`).
Expected: 0 errors.

- [ ] **Step 4.3: Run the full unit suite for the insights area**

Run: `npx vitest run tests/unit/control-model.test.ts tests/unit/control-signals.test.ts tests/unit/control-metric-groups.test.ts tests/unit/control-today-actions.test.ts tests/unit/use-control-v2-data-empty.test.ts tests/unit/asistente-empty-copy.test.ts`
Expected: ALL pass.

- [ ] **Step 4.4: Commit**

```bash
git add mobile/features/insights/control-v2-mock.ts
git commit -m "docs(insights): clarify CONTROL_MOCK is dev-only and never served at runtime

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Manual verification on a fresh account

The unit tests cover the data path. Verify the user-facing result for a brand-new user.

- [ ] **Step 5.1: Start the dev server**

Run: `npm start` (or whichever script `package.json` exposes — verify by reading it first; common: `npm run start`, `npm run ios`, `npm run android`).

- [ ] **Step 5.2: Sign up a brand-new account (or reset onboarding for a test account)**

Reach the post-onboarding home screen with `monthly_income = 0` and zero expenses logged.

- [ ] **Step 5.3: Verify Home tab**

Expected:
- No "Disney+", "Edenor", "Ocio", "Cena cumpleaños" anywhere.
- Assistant badge / pending count: 0.
- Existing empty states ([home-activity-section.tsx:58-65](mobile/components/home/home-activity-section.tsx#L58-L65)) render normally.

- [ ] **Step 5.4: Verify Asistente screen (open the assistant sheet)**

Expected:
- EmptyState shows "Listos para empezar" + the configuration nudge.
- No constellation / no chat bubbles / no forecast strip / no zombie feed.

- [ ] **Step 5.5: Verify CONTROL tab**

Expected (already working before this plan, regression check only):
- `<ControlV2EmptyState>` renders with `missingIncome=true` and `missingExpenses=true`.
- No fake numbers.

- [ ] **Step 5.6: Verify advisor tab badge**

Expected:
- Tab dot on the Control tab is hidden (no `urgency: 'alta'` signal exists when `signals === []`).

- [ ] **Step 5.7: Add an income + one real expense, confirm the assistant lights up**

Set `monthly_income > 0` (settings) and add one expense. Pull-to-refresh. Confirm `usingMock` flips to false and the screens populate with real numbers.

- [ ] **Step 5.8: If everything checks out, the plan is done. No further commit needed.**

---

## Self-Review Notes

Spec coverage check:
- ✅ Eliminar `CONTROL_MOCK.tareas` del runtime para nuevos users → Task 1+2.
- ✅ Asistente screen empty state honesto → Task 3.
- ✅ Marcar fixture como dev-only → Task 4.
- ✅ Verificación manual end-to-end → Task 5.
- ✅ Tab CONTROL ya gateado al onboarding completado (`profiles.onboarding_completed_at`) — no requiere cambio. Si en el futuro se quiere ocultar el tab hasta tener N días de datos, modificar `mobile/components/navigation/app-tabs.tsx:104-112`.

Type consistency:
- `resolveControlSignals` returns `ControlAdvisorTask[]` — same type as the existing `signals` declaration in `use-control-v2-data.ts:216`.
- `selectAsistenteEmptyCopy` returns `{ title: string; body: string }` consumed in JSX as `{copy.title}` / `{copy.body}`.

Out of scope (intentionally not touched):
- `dummyExplanation` text in `control-signals.ts` — these are educational tooltips on real signals, not fabricated data.
- `KNOWN_SUBSCRIPTION_PROVIDERS` list — used for matching real expense descriptions, not displayed as fake user data.
- Default values in `use-home-snapshot.ts` (salary_payment_day=1, savings_goal_percent=20) — reasonable defaults seeded at onboarding; out of scope.
