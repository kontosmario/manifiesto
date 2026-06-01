# Día sin gasto — Phase 1 — FAB Petal Real + Confetti

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la Fase 1 del spec `docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md`: el petal "Día sin gasto" del FAB persiste vía `useMarkNoExpenseDay()` (en lugar del toast del commit d7d7db1), maneja toggle / has-expenses / confeti, y todo se verifica con `npm run validate` + `npx expo export`.

**Architecture:**
1. `add-expense-tab-button.tsx` obtiene `familyId` + `userId` con los hooks ya cacheados (`useAuthSession` + `useHomeSnapshot`).
2. El petal handler usa `useMarkNoExpenseDay` / `useUnmarkNoExpenseDay`. Estado del petal (label + icon) refleja `streakData.hasMarkedNoExpenseToday`. Has-expenses-today dispara confirm Alert (mirror del streak-sheet, líneas 113-136).
3. Confetti vive en un nuevo pub/sub bus + `<NoSpendConfettiHost>` montado en `app-stack-shell.tsx` al mismo nivel que `<ToastHost>`. Bus API: `confetti.celebrate()`.

**Tech Stack:** React Native (Hermes), Expo Router, React Query (TanStack), Reanimated 4, `react-native-confetti-cannon@1.5.2` (con fallback a Reanimated puro si rompe el bundle).

**Out of scope (futuras fases):**
- F2: past-date marking via calendar (`p_date` arg en el RPC + UI day-detail).
- F3: achievements catalog + home_snapshot extension + Control hero stat.

---

## File map

| Path | Cambio | Tarea |
|------|--------|-------|
| `mobile/lib/confetti-bus.ts` | Crear (mirror de `mobile/lib/toast-bus.ts`) | Task 1 |
| `mobile/components/ui/no-spend-confetti-host.tsx` | Crear | Task 2 |
| `mobile/components/root/app-stack-shell.tsx` | Modify: montar `<NoSpendConfettiHost>` junto a `<ToastHost>` | Task 2 |
| `package.json` + `package-lock.json` | `npm install react-native-confetti-cannon@1.5.2 --save-exact` | Task 3 |
| `mobile/components/navigation/add-expense-tab-button.tsx` | Refactor el handler del petal `no-spend` (línea ~110 post-commit d7d7db1) | Task 4 |
| `mobile/components/navigation/add-quick-actions-overlay.tsx` | Soportar estado `marked` del petal (icon/label cambian) | Task 5 |
| `tests/unit/no-spend-petal-state.test.ts` | Crear | Task 6 |

---

## Task 1: Confetti pub/sub bus

**Files:**
- Create: `mobile/lib/confetti-bus.ts`

**Por qué pub/sub**: el petal del FAB y (en F2) el calendario van a disparar el confeti. Si el confeti se pinta vía props, cada caller tiene que conocer el componente — frágil. El bus + host pattern ya está validado por `toast-bus` + `ToastHost`.

- [ ] **Step 1.1: Crear el archivo**

```typescript
// mobile/lib/confetti-bus.ts
//
// Pub/sub minimal para celebraciones de confetti. Mismo patrón que
// `toast-bus.ts`. Un único listener (NoSpendConfettiHost) consume el
// stream; los productores en cualquier parte de la app llaman a
// confetti.celebrate(...) sin saber dónde se pinta.

export interface ConfettiPayload {
  id: string
  /** Duración total del burst en ms. Default 2000. */
  durationMs?: number
  /** Origen visual del burst. 'top' = cae desde arriba; 'center' =
   *  explota desde el centro. Default 'top'. */
  origin?: 'top' | 'center'
}

type Listener = (payload: ConfettiPayload) => void
const listeners = new Set<Listener>()
let counter = 0

export const confetti = {
  celebrate: (opts?: Omit<ConfettiPayload, 'id'>) => {
    counter += 1
    const payload: ConfettiPayload = {
      id: `${Date.now()}-${counter}`,
      durationMs: opts?.durationMs ?? 2000,
      origin: opts?.origin ?? 'top',
    }
    listeners.forEach((l) => {
      l(payload)
    })
  },
}

export function subscribeConfetti(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
```

- [ ] **Step 1.2: Commit**

```bash
git add mobile/lib/confetti-bus.ts
git commit -m "feat(ui): confetti pub/sub bus

Mirrors toast-bus.ts. Producers anywhere in the app call
confetti.celebrate(); a single host component (NoSpendConfettiHost,
landed in next commit) subscribes and paints the overlay.

Phase 1 of no-spend-day feature."
```

---

## Task 3: Install + verify confetti library

**Files:**
- Modify: `package.json`, `package-lock.json`

**Por qué hago Task 3 antes de Task 2**: si la lib rompe el bundle (lesson learned con `pbkdf2`), el plan cambia a impl manual antes de escribir el host. Pre-flight del bundler es no-negociable.

- [ ] **Step 3.1: Instalar la lib pinned**

```bash
npm install react-native-confetti-cannon@1.5.2 --save-exact
```

- [ ] **Step 3.2: Bundle pre-flight con Metro**

Run:

```bash
npm run validate 2>&1 | tail -5
rm -rf /tmp/m-bundle-confetti-check
npx expo export --platform ios --output-dir /tmp/m-bundle-confetti-check --dump-sourcemap=false 2>&1 | tail -8
```

Expected: ambos exit 0, output incluye `_expo/static/js/ios/entry-*.hbc` ~5.6MB.

Si Metro falla con `import "events"` u otra resolución Node stdlib → **abortar Task 3** y aplicar la rama de fallback:
- `npm uninstall react-native-confetti-cannon`
- Saltar a la nota "Fallback: confetti manual con Reanimated" al final de este plan.

- [ ] **Step 3.3: Commit la dep**

```bash
git add package.json package-lock.json
git commit -m "deps: add react-native-confetti-cannon@1.5.2

Pinned. Pre-flight verified: npm run validate exit 0 + npx expo
export --platform ios produces a clean Hermes bundle (no Node
stdlib resolution leaks).

Used by the new NoSpendConfettiHost in Phase 1 of the no-spend-day
feature.

If a future bundle pre-flight fails on this dep (Expo SDK bump,
Metro resolver change), the fallback is a manual Reanimated impl
documented in docs/superpowers/plans/2026-06-01-no-spend-day-f1-*.md."
```

---

## Task 2: NoSpendConfettiHost component + mount

**Files:**
- Create: `mobile/components/ui/no-spend-confetti-host.tsx`
- Modify: `mobile/components/root/app-stack-shell.tsx`

- [ ] **Step 2.1: Crear el host**

```typescript
// mobile/components/ui/no-spend-confetti-host.tsx
//
// Pinta confetti full-screen cuando el bus emite. Un solo host por
// app (montado en app-stack-shell). Misma topología que ToastHost.

import { useEffect, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { subscribeConfetti, type ConfettiPayload } from '@/lib/confetti-bus'

const { width: SCREEN_W } = Dimensions.get('window')

// Paleta de confeti: colores cálidos + brand greens. Una sola
// constante para evitar inventar paletas distintas en cada caller.
const CONFETTI_COLORS = [
  '#A6EF8F', // brand bright
  '#329315', // brand deep
  '#FFD580', // warm amber
  '#FFB3C7', // soft pink
  '#9BB6FF', // pale blue
  '#FFFFFF', // confetti highlight
]

export function NoSpendConfettiHost() {
  const [active, setActive] = useState<ConfettiPayload | null>(null)
  const cannonRef = useRef<ConfettiCannon | null>(null)

  useEffect(() => {
    return subscribeConfetti((payload) => {
      setActive(payload)
    })
  }, [])

  useEffect(() => {
    if (!active) return
    cannonRef.current?.start()
    const timer = setTimeout(() => {
      setActive((current) => (current?.id === active.id ? null : current))
    }, active.durationMs ?? 2000)
    return () => {
      clearTimeout(timer)
    }
  }, [active])

  if (!active) return null

  const isTop = (active.origin ?? 'top') === 'top'

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <ConfettiCannon
        ref={cannonRef}
        count={120}
        origin={
          isTop
            ? { x: SCREEN_W / 2, y: -20 }
            : { x: SCREEN_W / 2, y: 0 }
        }
        autoStart={false}
        explosionSpeed={isTop ? 350 : 500}
        fallSpeed={2400}
        fadeOut
        colors={CONFETTI_COLORS}
      />
    </View>
  )
}
```

- [ ] **Step 2.2: Mount en app-stack-shell.tsx**

Editar `mobile/components/root/app-stack-shell.tsx`. Importar `NoSpendConfettiHost` y agregarlo dentro del bloque `<>` que ya monta `<ToastHost />` (línea ~164).

```typescript
// near the other imports:
import { NoSpendConfettiHost } from '@/components/ui/no-spend-confetti-host'

// inside the fragment that renders ToastHost (líneas 158-166), agregar el host
// justo después de <ToastHost />:
<ToastHost />
<NoSpendConfettiHost />
```

- [ ] **Step 2.3: Validate**

Run:

```bash
npm run validate 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 2.4: Commit**

```bash
git add mobile/components/ui/no-spend-confetti-host.tsx mobile/components/root/app-stack-shell.tsx
git commit -m "feat(ui): NoSpendConfettiHost + mount in app shell

Subscribes to confetti-bus and paints a full-screen 120-particle
burst (~2s) on demand. Mounted once globally in app-stack-shell,
same topology as ToastHost. pointerEvents='none' so it never
intercepts taps.

Phase 1 of no-spend-day feature."
```

---

## Task 4: Refactor FAB petal handler (call useMarkNoExpenseDay)

**Files:**
- Modify: `mobile/components/navigation/add-expense-tab-button.tsx`

**Estado actual:** el petal con `key: 'no-spend'` (commit d7d7db1) llama `triggerHaptic('success')` + `toast.success(...)`. No persiste. **Hay que reemplazar el handler entero por uno que llama el hook real.**

Necesitamos `familyId` + `userId` dentro del componente. El streak-sheet los recibe como props (líneas 49-50), pero el FAB-button está dentro del tab bar y no recibe props de session. Solución: usar los mismos hooks que `app-stack-shell.tsx` (`useAuthSession()` + `useHomeSnapshot(userId)`). Ambos están cacheados por React Query — leer dos veces es free.

- [ ] **Step 4.1: Agregar imports**

En `mobile/components/navigation/add-expense-tab-button.tsx` (top del archivo), después del import de `useAppTheme`:

```typescript
import { Alert } from 'react-native'
import {
  useMarkNoExpenseDay,
  useUnmarkNoExpenseDay,
  useStreak,
} from '@/features/streaks/use-streak'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { confetti } from '@/lib/confetti-bus'
```

Nota: si `Alert` ya está importado más arriba (revisar el bloque de imports de `react-native` en líneas 2-8), agregarlo a la lista existente en lugar de duplicar el import.

- [ ] **Step 4.2: Obtener familyId + userId + streakData + expensesToday**

Dentro de `AddExpenseTabButton` (después del `useRouter()`):

```typescript
  const session = useAuthSession()
  const userId = session.data?.user.id
  const homeSnapshot = useHomeSnapshot(userId)
  const familyId = homeSnapshot.data?.family?.familyId ?? undefined

  const streakResult = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)

  const markNoExpenseMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoExpenseMutation = useUnmarkNoExpenseDay(familyId, userId)

  // Today's expenses (user-local timezone). The streak hook already
  // handles tz; we just need "did this user log any expense today?"
  // for the confirm-Alert logic.
  const hasExpensesTodayOwn = useMemo(() => {
    if (!userId) return false
    const expenses = expensesQuery.data ?? []
    const tzNow = new Date()
    const todayKey = tzNow.toLocaleDateString('en-CA')
    for (const e of expenses) {
      if (e.created_by !== userId) continue
      const created = new Date(e.created_at)
      if (created.toLocaleDateString('en-CA') === todayKey) return true
    }
    return false
  }, [userId, expensesQuery.data])

  const hasMarkedToday = streakResult.data?.hasMarkedNoExpenseToday ?? false
```

Agregar `useMemo` al import desde React (línea 1):

```typescript
import { useCallback, useMemo, useState } from 'react'
```

- [ ] **Step 4.3: Reemplazar el handler `no-spend` del array `quickActions`**

Encontrar el bloque actual (post-commit d7d7db1):

```typescript
    {
      key: 'no-spend',
      label: 'No gasté hoy',
      icon: 'eco',
      // ...
      onPress: () => {
        void triggerHaptic('success')
        toast.success('Bien hecho. Día sin gastos.')
      },
    },
```

Reemplazar por:

```typescript
    {
      key: 'no-spend',
      // Label changes based on state — "Día sin gasto" when not yet
      // marked today, "Marcado ✓" when already marked. The icon
      // does too: `eco` (outline leaf) vs `eco` filled tone driven
      // by the petal's color prop (handled in Task 5).
      label: hasMarkedToday ? 'Marcado ✓' : 'Día sin gasto',
      icon: 'eco',
      onPress: () => {
        // Guard: don't react while a mutation is in flight.
        if (markNoExpenseMutation.isPending || unmarkNoExpenseMutation.isPending) {
          return
        }

        if (!familyId) {
          // Session not ready yet — surface a soft notice instead
          // of failing silently. Should be very rare (FAB is only
          // visible when the app is authenticated).
          toast.info('Estamos preparando tu cuenta, intenta de nuevo en un instante.')
          return
        }

        // CASE A: toggle off. Already marked → unmark, no confetti,
        // selection haptic.
        if (hasMarkedToday) {
          unmarkNoExpenseMutation.mutate(undefined, {
            onSuccess: () => {
              void triggerHaptic('selection')
              toast.info('Marca de día sin gastos removida.')
            },
            onError: (error: unknown) => {
              void triggerHaptic('error')
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'No se pudo revertir. Reintentá en un momento.',
              )
            },
          })
          return
        }

        // CASE B: today has expenses → confirm before marking. Mirror
        // of streak-sheet.tsx:113-136 prompt copy.
        const proceedToMark = () => {
          markNoExpenseMutation.mutate(undefined, {
            onSuccess: () => {
              void triggerHaptic('success')
              confetti.celebrate({ durationMs: 2000, origin: 'top' })
              toast.success('Día sin gastos registrado')
            },
            onError: (error: unknown) => {
              void triggerHaptic('error')
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'No se pudo marcar. Reintentá en un momento.',
              )
            },
          })
        }

        if (hasExpensesTodayOwn) {
          Alert.alert(
            'Hoy tenés gastos cargados',
            'Ya registraste gastos hoy. ¿Marcar igual el día como "sin gastos"? Después podés revertir la marca si te confundiste.',
            [
              { style: 'cancel', text: 'Cancelar' },
              { text: 'Marcar igual', onPress: proceedToMark },
            ],
          )
          return
        }

        // CASE C: clean mark.
        proceedToMark()
      },
    },
```

- [ ] **Step 4.4: Quitar el import `toast` si dejó de usarse**

Después del refactor, `toast.info` / `toast.success` / `toast.error` se siguen usando dentro del handler → mantener el import.

- [ ] **Step 4.5: Validate + bundle**

```bash
npm run validate 2>&1 | tail -8
rm -rf /tmp/m-bundle-petal-refactor
npx expo export --platform ios --output-dir /tmp/m-bundle-petal-refactor --dump-sourcemap=false 2>&1 | tail -5
```

Expected: ambos OK.

- [ ] **Step 4.6: Commit**

```bash
git add mobile/components/navigation/add-expense-tab-button.tsx
git commit -m "feat(home): FAB no-spend petal now persists via mark_no_expense_day

The petal landed in commit d7d7db1 used toast+haptic without
persistence — analytics, streak, weekly grid all ignored it.
Now it calls useMarkNoExpenseDay (server-side advance_streak +
streak_marked_days insert) on tap.

State machine:
- already-marked-today → unmark (toggle), selection haptic, no confetti
- has-expenses-today → confirm Alert mirroring streak-sheet pattern
- clean tap → mark + success haptic + confetti.celebrate() + toast

Label flips to 'Marcado ✓' when hasMarkedNoExpenseToday is true so
the petal visually reflects the persisted state.

Phase 1 of no-spend-day feature."
```

---

## Task 5: Petal marked-state visual

**Files:**
- Modify: `mobile/components/navigation/add-quick-actions-overlay.tsx`

El label ya cambia (Task 4), pero el background del petal sigue siendo `theme.colors.primary` para todos los petals. Queremos que el petal `no-spend` cuando está `marked` tenga un tinte verde más claro (estilo "ya hecho").

- [ ] **Step 5.1: Agregar prop opcional a `QuickAction`**

En `mobile/components/navigation/add-quick-actions-overlay.tsx`, ampliar la interface:

```typescript
export interface QuickAction {
  key: 'expense' | 'fixed' | 'income' | 'no-spend'
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  /** Optional visual override. 'marked' tints the petal in a paler
   *  green to communicate "ya está hecho hoy" without removing the
   *  petal from the menu (so the user can toggle it off). */
  visualState?: 'default' | 'marked'
}
```

- [ ] **Step 5.2: Aplicar el tint en `ActionPetal`**

En la misma file, dentro del `<Pressable>` que renderiza el círculo (líneas ~273-284):

Cambiar:
```typescript
            backgroundColor: theme.colors.primary,
```

por:
```typescript
            backgroundColor:
              action.visualState === 'marked'
                ? // Paler tint communicates "done today" without
                  // disappearing the petal (user can still toggle).
                  theme.isDark
                  ? withAlpha(theme.colors.primary, 0.55)
                  : withAlpha(theme.colors.primary, 0.45)
                : theme.colors.primary,
```

Necesita importar `withAlpha`:

```typescript
import { withAlpha } from '@/theme/color-utils'
```

- [ ] **Step 5.3: Pasar `visualState` desde el caller**

En `mobile/components/navigation/add-expense-tab-button.tsx`, en el array `quickActions`, dentro del object del petal `no-spend`, agregar:

```typescript
      visualState: hasMarkedToday ? 'marked' : 'default',
```

- [ ] **Step 5.4: Validate**

```bash
npm run validate 2>&1 | tail -5
```

- [ ] **Step 5.5: Commit**

```bash
git add mobile/components/navigation/add-quick-actions-overlay.tsx mobile/components/navigation/add-expense-tab-button.tsx
git commit -m "feat(home): FAB no-spend petal shows marked tint when state is on

Added optional QuickAction.visualState ('default' | 'marked'). When
the user has already marked today, the no-spend petal paints with
a paler green (alpha 0.45/0.55 dark) so the user sees it's already
done but can still tap to toggle off.

Phase 1 of no-spend-day feature."
```

---

## Task 6: Unit test for the petal state machine

**Files:**
- Create: `tests/unit/no-spend-petal-state.test.ts`

El handler tiene 4 ramas (offline session / toggle / has-expenses / clean). Vitest no monta React, así que testeamos la **pure decision function** extraída.

- [ ] **Step 6.1: Extraer la decision logic a una pure fn**

En `mobile/components/navigation/add-expense-tab-button.tsx`, agregar al top (debajo de los imports, antes del componente) una pure helper:

```typescript
// Pure decision function for the no-spend petal. Returns the next
// action (or 'noop' if a guard short-circuits) given the current
// state. Lifted out of the handler so it's unit-testable without
// React.
export type NoSpendPetalDecision =
  | { kind: 'noop'; reason: 'pending' | 'no-family' }
  | { kind: 'unmark' }
  | { kind: 'mark-confirm' }   // has expenses today → show Alert before marking
  | { kind: 'mark-direct' }    // clean mark, no Alert

export function decideNoSpendPetal(input: {
  isMutationPending: boolean
  familyId: string | undefined
  hasMarkedToday: boolean
  hasExpensesTodayOwn: boolean
}): NoSpendPetalDecision {
  if (input.isMutationPending) return { kind: 'noop', reason: 'pending' }
  if (!input.familyId) return { kind: 'noop', reason: 'no-family' }
  if (input.hasMarkedToday) return { kind: 'unmark' }
  if (input.hasExpensesTodayOwn) return { kind: 'mark-confirm' }
  return { kind: 'mark-direct' }
}
```

Y refactorizar el handler `onPress` para usarla. Reemplazar el cuerpo del `onPress` (después del refactor de Task 4) por:

```typescript
      onPress: () => {
        const decision = decideNoSpendPetal({
          isMutationPending:
            markNoExpenseMutation.isPending || unmarkNoExpenseMutation.isPending,
          familyId,
          hasMarkedToday,
          hasExpensesTodayOwn,
        })

        switch (decision.kind) {
          case 'noop':
            if (decision.reason === 'no-family') {
              toast.info('Estamos preparando tu cuenta, intenta de nuevo en un instante.')
            }
            return

          case 'unmark':
            unmarkNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('selection')
                toast.info('Marca de día sin gastos removida.')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'No se pudo revertir. Reintentá en un momento.',
                )
              },
            })
            return

          case 'mark-confirm':
            Alert.alert(
              'Hoy tenés gastos cargados',
              'Ya registraste gastos hoy. ¿Marcar igual el día como "sin gastos"? Después podés revertir la marca si te confundiste.',
              [
                { style: 'cancel', text: 'Cancelar' },
                {
                  text: 'Marcar igual',
                  onPress: () => doMark(),
                },
              ],
            )
            return

          case 'mark-direct':
            doMark()
            return
        }
      },
```

Y agregar `doMark` como `useCallback` justo antes del array `quickActions`:

```typescript
  const doMark = useCallback(() => {
    markNoExpenseMutation.mutate(undefined, {
      onSuccess: () => {
        void triggerHaptic('success')
        confetti.celebrate({ durationMs: 2000, origin: 'top' })
        toast.success('Día sin gastos registrado')
      },
      onError: (error: unknown) => {
        void triggerHaptic('error')
        toast.error(
          error instanceof Error
            ? error.message
            : 'No se pudo marcar. Reintentá en un momento.',
        )
      },
    })
  }, [markNoExpenseMutation])
```

- [ ] **Step 6.2: Escribir el test**

Crear `tests/unit/no-spend-petal-state.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { decideNoSpendPetal } from '@/components/navigation/add-expense-tab-button'

describe('decideNoSpendPetal', () => {
  const baseInput = {
    isMutationPending: false,
    familyId: 'fam-1' as string | undefined,
    hasMarkedToday: false,
    hasExpensesTodayOwn: false,
  }

  it('returns noop:pending when a mutation is in flight', () => {
    const decision = decideNoSpendPetal({ ...baseInput, isMutationPending: true })
    expect(decision).toEqual({ kind: 'noop', reason: 'pending' })
  })

  it('returns noop:no-family when familyId is undefined', () => {
    const decision = decideNoSpendPetal({ ...baseInput, familyId: undefined })
    expect(decision).toEqual({ kind: 'noop', reason: 'no-family' })
  })

  it('returns unmark when already marked today', () => {
    const decision = decideNoSpendPetal({ ...baseInput, hasMarkedToday: true })
    expect(decision).toEqual({ kind: 'unmark' })
  })

  it('returns mark-confirm when today has expenses already', () => {
    const decision = decideNoSpendPetal({ ...baseInput, hasExpensesTodayOwn: true })
    expect(decision).toEqual({ kind: 'mark-confirm' })
  })

  it('returns mark-direct on clean state', () => {
    const decision = decideNoSpendPetal(baseInput)
    expect(decision).toEqual({ kind: 'mark-direct' })
  })

  it('pending guard wins over everything else', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: true,
      familyId: undefined,
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'noop', reason: 'pending' })
  })

  it('no-family guard wins over marked/expenses checks', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: false,
      familyId: undefined,
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'noop', reason: 'no-family' })
  })

  it('unmark wins over has-expenses (toggle priority)', () => {
    const decision = decideNoSpendPetal({
      isMutationPending: false,
      familyId: 'fam-1',
      hasMarkedToday: true,
      hasExpensesTodayOwn: true,
    })
    expect(decision).toEqual({ kind: 'unmark' })
  })
})
```

- [ ] **Step 6.3: Run the test**

```bash
npx vitest run tests/unit/no-spend-petal-state.test.ts 2>&1 | tail -15
```

Expected: 8 tests passed.

- [ ] **Step 6.4: Full validate**

```bash
npm run validate 2>&1 | tail -8
```

- [ ] **Step 6.5: Commit**

```bash
git add mobile/components/navigation/add-expense-tab-button.tsx tests/unit/no-spend-petal-state.test.ts
git commit -m "test(home): decideNoSpendPetal pure decision + 8 vectors

Refactored the FAB petal handler so the branch selection lives in
a pure decideNoSpendPetal() function (vs inlined ifs in the
onPress). Now testable in isolation: 4 happy paths + 3 guard-
precedence tests + 1 clean-state baseline.

Phase 1 of no-spend-day feature."
```

---

## Task 7: Final verification gate

- [ ] **Step 7.1: End-to-end validate + bundle**

```bash
npm run validate 2>&1 | tail -8
rm -rf /tmp/m-bundle-f1-final
npx expo export --platform ios --output-dir /tmp/m-bundle-f1-final --dump-sourcemap=false 2>&1 | tail -8
```

Both must exit 0.

- [ ] **Step 7.2: Manual smoke test (requires device or simulator)**

Run `npx expo start` and on a logged-in build:

1. Long-press el FAB → abanico abre con 4 petals.
2. Tap "Día sin gasto" → confetti cae desde arriba (~2s) + haptic success + toast "Día sin gastos registrado".
3. Tap streak-sheet (🔥 en gastos) → debería aparecer `hasMarkedNoExpenseToday=true`, copy "Hoy sin gastos — racha protegida".
4. Long-press FAB de nuevo → petal `no-spend` ahora dice "Marcado ✓" con tint paler.
5. Tap "Marcado ✓" → toast "Marca de día sin gastos removida" + haptic selection + sin confetti. Streak state vuelve a unmarked.
6. Registrar un gasto rápido, después long-press → petal en estado normal. Tap "Día sin gasto" → Alert "Hoy tenés gastos cargados" → Cancelar y Marcar igual ambos funcionan.

- [ ] **Step 7.3: Lock + resume regression check**

Bloquear el device y volver. NO debería aparecer ningún console error nuevo (sanity check de que la AppState wiring del fix `ad728f0` sigue OK).

---

## Fallback: confetti manual con Reanimated (si Task 3 falla)

Si `react-native-confetti-cannon` rompe el Metro bundle, reemplazar Task 2 por:

**File:** `mobile/components/ui/no-spend-confetti-host.tsx` (manual)

```typescript
// Manual Reanimated impl, no deps. ~30 partículas independientes.
// Cada partícula es un Animated.View con transform (translate +
// rotate + scale + opacity). Lifetime ~2s, todas paralelas.
//
// Trade-off vs la lib: no es físico-realista (cae lineal en lugar
// de con turbulence), pero pinta a 60fps y es independiente de
// transitive deps Node-stdlib.

import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { subscribeConfetti, type ConfettiPayload } from '@/lib/confetti-bus'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const PARTICLE_COUNT = 30
const COLORS = ['#A6EF8F', '#329315', '#FFD580', '#FFB3C7', '#9BB6FF', '#FFFFFF']

function Particle({ index, duration }: { index: number; duration: number }) {
  const x = useSharedValue(0)
  const y = useSharedValue(-40)
  const rot = useSharedValue(0)
  const opacity = useSharedValue(1)

  useEffect(() => {
    const targetX = (Math.random() - 0.5) * SCREEN_W * 0.9
    const targetY = SCREEN_H + 60
    x.value = withTiming(targetX, { duration, easing: Easing.out(Easing.quad) })
    y.value = withTiming(targetY, { duration, easing: Easing.in(Easing.quad) })
    rot.value = withTiming((Math.random() - 0.5) * 1080, {
      duration,
      easing: Easing.linear,
    })
    opacity.value = withTiming(0, {
      duration,
      easing: Easing.in(Easing.cubic),
    })
  }, [duration, x, y, rot, opacity])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rot.value}deg` },
    ],
  }))

  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: COLORS[index % COLORS.length] },
        style,
      ]}
    />
  )
}

export function NoSpendConfettiHost() {
  const [active, setActive] = useState<ConfettiPayload | null>(null)

  useEffect(() => {
    return subscribeConfetti((payload) => {
      setActive(payload)
      // Auto-clear when duration elapses so React unmounts the
      // particles (frees worklets).
      setTimeout(() => {
        setActive((current) => (current?.id === payload.id ? null : current))
      }, payload.durationMs ?? 2000)
    })
  }, [])

  if (!active) return null
  const dur = active.durationMs ?? 2000

  return (
    <View pointerEvents="none" style={styles.host}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <Particle key={`${active.id}-${i}`} index={i} duration={dur} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 12,
    borderRadius: 2,
    top: 0,
  },
})
```

Skipear Task 3 entera. Commit el manual host como reemplazo de Task 2 con un mensaje que aclare por qué (Metro bundle failure de la lib).

---

## Self-review

**Spec coverage F1:**
- ✅ FAB-petal real (Task 4 + 5)
- ✅ Confetti (Tasks 1 + 2 + 3 + fallback)
- ✅ Has-expenses-today confirm Alert (Task 4 / decision: `mark-confirm`)
- ✅ Toggle if already marked (Task 4 / decision: `unmark`)
- ✅ Edge case "tap mid-mutation" (Task 4 / decision: `noop:pending`)
- ✅ Edge case "session not ready" (Task 4 / decision: `noop:no-family`)
- ✅ Pre-flight bundle (Tasks 3.2, 4.5, 7.1)
- ✅ Unit tests (Task 6)
- ❌ Past-date marking → F2 (out of scope per spec)
- ❌ Achievements + home metric → F3 (out of scope per spec)
- ❌ Auto-revert toast surfacing → F3 (out of scope per spec)

**Placeholder scan:** none.

**Type consistency:** `NoSpendPetalDecision` discriminated union with `'noop'|'unmark'|'mark-confirm'|'mark-direct'` consistent across handler + test. `QuickAction.visualState` type consistent between overlay + petal caller.
