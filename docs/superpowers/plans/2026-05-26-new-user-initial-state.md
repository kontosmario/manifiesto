# New User Initial State v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un usuario recién registrado entra al Home con (a) un momento de éxito post-wizard, (b) un tour guiado auto-fire por screen (ya cableado en el código), (c) un CTA destacado para confirmar saldo inicial, (d) hero con copy diferenciado por modo solo/familia, y (e) puede re-ver cualquier tour desde Settings. Usuarios existentes no reciben tours retroactivos.

**Architecture:** El auto-fire de los 4 tours **ya está vivo** (`useScreenTour` en home-dashboard / gastos-v2 / fijos-v2 / control-v2 con auto-start on focus). Este plan suma: backfill one-shot para usuarios existentes (helper puro + hook + wiring en AppEntryGate), helpers puros para copy del hero y del success screen, una pantalla `OnboardingSuccessScreen` entre wizard finish y Home, una card destacada en Home para confirmar saldo, y un grupo "Ayuda · Tutoriales" en Settings que reutiliza los helpers `resetTourSeen / resetAllTours` ya existentes en `tours/persistence.ts`.

**Tech Stack:** React Native / Expo (SDK 54), TypeScript, Vitest, React Query, expo-router, expo-secure-store via `@/lib/persistent-kv`.

**Rama:** `feat/new-user-initial-state-v1` (ya creada).

**Spec:** [`docs/superpowers/specs/2026-05-26-new-user-initial-state-design.md`](../specs/2026-05-26-new-user-initial-state-design.md)

---

## File Structure

| Archivo | Responsabilidad | Tipo |
|---|---|---|
| `mobile/features/tours/backfill-config.ts` | Constante `TOURS_FEATURE_DEPLOYED_AT` (ISO timestamp) | nuevo |
| `mobile/features/tours/should-backfill-tours.ts` | Helper puro `shouldBackfillToursAsSeen` | nuevo |
| `mobile/features/tours/use-backfill-existing-user.ts` | Hook one-shot que ejecuta el backfill | nuevo |
| `mobile/components/root/app-entry-gate.tsx` | Invoca `useBackfillExistingUser` | modify |
| `mobile/features/family/family-mode-copy.ts` | Helper puro `familyModeHeroCopy` (solo vs familia) | nuevo |
| `mobile/components/home/home-hero-card.tsx` | Recibe + renderiza eyebrow/title contextual al modo | modify |
| `mobile/components/home/home-dashboard.tsx` | Pasa `kind / memberCount / familyName` al hero + monta el CTA de saldo | modify |
| `mobile/components/home/starting-balance-cta.tsx` | Card destacada para confirmar saldo cuando `IS NULL` | nuevo |
| `mobile/features/onboarding/success-copy.ts` | Helper puro `onboardingSuccessCopy` (solo vs familia × firstName) | nuevo |
| `mobile/screens/home/onboarding-success-screen.tsx` | Pantalla de éxito tap-to-continue | nuevo |
| `app/(app)/onboarding-success.tsx` | Route wrapper | nuevo |
| `mobile/features/onboarding/use-complete-onboarding.ts` | `setQueryData` para evitar race con RequireAuth | modify |
| `mobile/screens/home/onboarding-screen.tsx` | Redirige a `/onboarding-success` en vez de `/home` | modify |
| `mobile/screens/settings/settings-screen.tsx` | Nuevo grupo "Ayuda · Tutoriales" con 5 rows | modify |
| `tests/unit/should-backfill-tours.test.ts` | 4 casos del helper de backfill | nuevo |
| `tests/unit/family-mode-copy.test.ts` | 4 casos del copy del hero | nuevo |
| `tests/unit/onboarding-success-copy.test.ts` | 4 casos del copy del success screen | nuevo |
| `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md` | Documentar success screen + backfill | modify |
| `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md` | Documentar "Ayuda · Tutoriales" | modify |

---

## Task 1: Helper `shouldBackfillToursAsSeen` (TDD)

**Files:**
- Create: `mobile/features/tours/should-backfill-tours.ts`
- Test: `tests/unit/should-backfill-tours.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/should-backfill-tours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldBackfillToursAsSeen } from '@/features/tours/should-backfill-tours'

const TOURS_DEPLOYED_AT = '2026-05-27T00:00:00Z'

describe('shouldBackfillToursAsSeen', () => {
  it('false si el backfill ya se hizo (idempotencia)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-01-01T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: true,
      }),
    ).toBe(false)
  })

  it('false si el usuario aún no completó el onboarding (mid-wizard)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: null,
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(false)
  })

  it('true si el onboarding se completó ANTES del deploy (usuario existente)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-01-01T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(true)
  })

  it('false si el onboarding se completó DESPUÉS del deploy (usuario nuevo)', () => {
    expect(
      shouldBackfillToursAsSeen({
        onboardingCompletedAt: '2026-06-15T00:00:00Z',
        toursDeployedAt: TOURS_DEPLOYED_AT,
        backfillAlreadyDone: false,
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/should-backfill-tours.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `mobile/features/tours/should-backfill-tours.ts`:

```ts
// Pure decision for the one-shot tour-seen backfill applied to
// existing users at the first launch after this feature ships.
//
// Without this, every existing user (who never had auto-firing tours)
// would suddenly get tours on their next visit to home/gastos/fijos/
// control — perceived as unsolicited noise. We mark all 4 tours seen
// silently for anyone whose onboarding_completed_at predates the
// feature's deploy timestamp. New users (onboarding completed after
// the deploy) are untouched and get the regular auto-fire flow.

export interface BackfillInput {
  /** profiles.onboarding_completed_at — null when user is mid-wizard. */
  onboardingCompletedAt: string | null
  /** ISO timestamp from `backfill-config.ts`. */
  toursDeployedAt: string
  /** Whether the `tours-backfill-done` KV flag is already set. */
  backfillAlreadyDone: boolean
}

export function shouldBackfillToursAsSeen(input: BackfillInput): boolean {
  if (input.backfillAlreadyDone) return false
  if (input.onboardingCompletedAt === null) return false
  return input.onboardingCompletedAt < input.toursDeployedAt
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/unit/should-backfill-tours.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/features/tours/should-backfill-tours.ts tests/unit/should-backfill-tours.test.ts
git commit -m "feat(tours): shouldBackfillToursAsSeen helper (decisión pura para backfill one-shot)"
```

---

## Task 2: Backfill config + hook + wiring en AppEntryGate

**Files:**
- Create: `mobile/features/tours/backfill-config.ts`
- Create: `mobile/features/tours/use-backfill-existing-user.ts`
- Modify: `mobile/components/root/app-entry-gate.tsx`

- [ ] **Step 1: Crear la constante del deploy date**

Create `mobile/features/tours/backfill-config.ts`:

```ts
// ISO timestamp del deploy inicial del backfill + success screen +
// CTA de saldo (feature "estado inicial de usuario nuevo v1").
//
// Usuarios cuyo profiles.onboarding_completed_at es estrictamente
// ANTERIOR a este timestamp reciben un backfill silencioso (todos
// los tours marcados seen) en el primer arranque post-deploy. Esto
// evita que vean tours retroactivos en pantallas que llevaban tiempo
// usando sin que el auto-fire los molestara.
//
// Ajustar al día efectivo del merge.
export const TOURS_FEATURE_DEPLOYED_AT = '2026-05-27T00:00:00Z'
```

- [ ] **Step 2: Crear el hook que ejecuta el backfill**

Create `mobile/features/tours/use-backfill-existing-user.ts`:

```ts
import { useEffect, useRef } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { ALL_TOUR_KEYS } from './tour-keys'
import { setTourSeen } from './persistence'
import { TOURS_FEATURE_DEPLOYED_AT } from './backfill-config'
import { shouldBackfillToursAsSeen } from './should-backfill-tours'

const BACKFILL_DONE_KEY = 'tours-backfill-done'

/**
 * Ejecuta UNA VEZ por install el backfill descrito en
 * `should-backfill-tours.ts`. Idempotente vía un flag persistente
 * (`tours-backfill-done`). Pensado para invocarse en AppEntryGate
 * con `profile.onboarding_completed_at` como input.
 *
 * Casos:
 *   - Usuario existente (onboarding viejo): marca los 4 tours seen
 *     + setea el flag. No dispara ni interrumpe nada.
 *   - Usuario nuevo (onboarding reciente): solo setea el flag y se
 *     queda corto (deja que el auto-fire normal haga lo suyo).
 *   - profile aún cargando o sin onboarding: no hace nada (espera).
 */
export function useBackfillExistingUser(
  onboardingCompletedAt: string | null | undefined,
): void {
  const ranRef = useRef(false)
  useEffect(() => {
    if (ranRef.current) return
    if (onboardingCompletedAt === undefined) return
    let cancelled = false
    void (async () => {
      const flagRaw = await getPersistentValue(BACKFILL_DONE_KEY)
      const backfillAlreadyDone = flagRaw === '1'
      const decision = shouldBackfillToursAsSeen({
        onboardingCompletedAt: onboardingCompletedAt ?? null,
        toursDeployedAt: TOURS_FEATURE_DEPLOYED_AT,
        backfillAlreadyDone,
      })
      if (cancelled) return
      if (decision) {
        await Promise.all(ALL_TOUR_KEYS.map((key) => setTourSeen(key)))
      }
      if (!backfillAlreadyDone) {
        await setPersistentValue(BACKFILL_DONE_KEY, '1')
      }
      ranRef.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [onboardingCompletedAt])
}
```

- [ ] **Step 3: Invocar el hook en AppEntryGate**

READ `mobile/components/root/app-entry-gate.tsx` first to confirm shape.

Add import at the top alongside the other `@/features/...` imports:
```tsx
import { useBackfillExistingUser } from '@/features/auth/use-cold-start-biometric-check' // wrong import, replace below
```

Wait — the import must be:
```tsx
import { useBackfillExistingUser } from '@/features/tours/use-backfill-existing-user'
```

Add it next to the other tours/auth imports.

Inside the `AppEntryGate` function body, after `const profileQuery = useMyProfile(userId)`, call:

```tsx
useBackfillExistingUser(profileQuery.data?.onboarding_completed_at ?? null)
```

(Pass `null` explicitly when `data?.onboarding_completed_at` is `undefined` — the hook treats `undefined` as "still loading" and skips, while `null` means "loaded, never completed", which the helper short-circuits to `false` anyway.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `npx eslint mobile/features/tours/backfill-config.ts mobile/features/tours/use-backfill-existing-user.ts mobile/components/root/app-entry-gate.tsx --ext .ts,.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/tours/backfill-config.ts mobile/features/tours/use-backfill-existing-user.ts mobile/components/root/app-entry-gate.tsx
git commit -m "feat(tours): backfill one-shot para usuarios existentes (no ver tours retroactivos)"
```

---

## Task 3: Helper `familyModeHeroCopy` (TDD)

**Files:**
- Create: `mobile/features/family/family-mode-copy.ts`
- Test: `tests/unit/family-mode-copy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/family-mode-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { familyModeHeroCopy } from '@/features/family/family-mode-copy'

describe('familyModeHeroCopy', () => {
  it('modo solo → "Tu espacio personal" + título del usuario', () => {
    expect(
      familyModeHeroCopy({
        kind: 'solo',
        memberCount: 1,
        familyName: null,
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu espacio personal',
      title: 'Mario',
    })
  })

  it('modo solo sin nombre → fallback', () => {
    expect(
      familyModeHeroCopy({
        kind: 'solo',
        memberCount: 1,
        familyName: null,
        userFirstName: null,
      }),
    ).toEqual({
      eyebrow: 'Tu espacio personal',
      title: 'Bienvenido',
    })
  })

  it('modo shared con nombre de familia → "Tu familia" + nombre', () => {
    expect(
      familyModeHeroCopy({
        kind: 'shared',
        memberCount: 3,
        familyName: 'Los Pérez',
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu familia',
      title: 'Los Pérez',
    })
  })

  it('modo shared sin nombre de familia → fallback "{N} miembros"', () => {
    expect(
      familyModeHeroCopy({
        kind: 'shared',
        memberCount: 2,
        familyName: null,
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu familia',
      title: '2 miembros',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/family-mode-copy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `mobile/features/family/family-mode-copy.ts`:

```ts
// Pure copy resolver for the Home hero — surfaces the family mode
// (solo vs. shared) so the screen reads as personal or shared
// depending on what the user chose in the onboarding wizard.
//
// Used by `home-hero-card.tsx`. Returned strings respect the project
// copy glossary (no "hogar"/"nuestro"/"familia" in solo mode).

export interface FamilyModeHeroInput {
  kind: 'solo' | 'shared'
  memberCount: number
  familyName: string | null
  userFirstName: string | null
}

export interface FamilyModeHeroCopy {
  eyebrow: string
  title: string
}

export function familyModeHeroCopy(input: FamilyModeHeroInput): FamilyModeHeroCopy {
  if (input.kind === 'solo') {
    return {
      eyebrow: 'Tu espacio personal',
      title: input.userFirstName ?? 'Bienvenido',
    }
  }
  return {
    eyebrow: 'Tu familia',
    title: input.familyName ?? `${input.memberCount} miembros`,
  }
}
```

- [ ] **Step 4: Run test + guard de copy**

Run: `./node_modules/.bin/vitest run tests/unit/family-mode-copy.test.ts`
Expected: PASS (4 tests).

Run: `npm run guard:forbidden-copy`
Expected: PASS. (Si falla por los strings nuevos, ajustar manteniendo el sentido.)

- [ ] **Step 5: Commit**

```bash
git add mobile/features/family/family-mode-copy.ts tests/unit/family-mode-copy.test.ts
git commit -m "feat(family): familyModeHeroCopy helper (copy del hero por modo solo/familia)"
```

---

## Task 4: Cablear `familyModeHeroCopy` en el hero del Home

**Files:**
- Modify: `mobile/components/home/home-hero-card.tsx`
- Modify: `mobile/components/home/home-dashboard.tsx`

- [ ] **Step 1: Extender props de `home-hero-card.tsx`**

READ the file first. Locate `HomeHeroCardProps` interface and the `HomeHeroCardImpl` function (`memo`'d at the bottom usually).

Add to `HomeHeroCardProps`:

```tsx
/** Family mode + identity data for the eyebrow/title contextual copy. */
heroMode: {
  kind: 'solo' | 'shared'
  memberCount: number
  familyName: string | null
  userFirstName: string | null
}
```

In the function signature, destructure `heroMode` alongside the other props.

Import the helper at the top:
```tsx
import { familyModeHeroCopy } from '@/features/family/family-mode-copy'
```

In the body (early in the render, near `const { theme } = useAppTheme()`):
```tsx
const heroCopy = familyModeHeroCopy(heroMode)
```

Then render `heroCopy.eyebrow` and `heroCopy.title` in the appropriate Text components. **READ the existing JSX to find where the current eyebrow/title render is, and replace whatever hardcoded strings exist with `{heroCopy.eyebrow}` and `{heroCopy.title}`.** If the current hero doesn't have an eyebrow at all, add one above the title following the existing Text-with-style pattern in the file.

If the hero currently uses a different variable (e.g. `data.title` from `HomeHeroMetrics`), replace that specific binding.

- [ ] **Step 2: Pasar `heroMode` desde `home-dashboard.tsx`**

READ `mobile/components/home/home-dashboard.tsx`. Locate where `<HomeHeroCard ... />` is rendered (~line 590+; near the existing `showMembers={!isSolo}` line).

The component already has `isSolo` in scope. Verify whether `family.name` / `family.memberCount` / a profile firstName are available. If not, you'll need to:
- Pass them from `home-screen.tsx` as new props to `HomeDashboard`, OR
- Read them inline via hooks (`useFamily(userId)` is already used; `useMyProfile(userId)` too).

Simplest path: in `home-dashboard.tsx`, add the data inline using the existing query hooks. If `useFamily` returns `{ familyId, name?, memberCount?, kind }`, derive directly. If not, surface the data via props from `home-screen.tsx`.

Then pass to `HomeHeroCard`:

```tsx
<HomeHeroCard
  data={...}
  // ... existing props
  heroMode={{
    kind: isSolo ? 'solo' : 'shared',
    memberCount: <derived from family data>,
    familyName: <derived from family data>,
    userFirstName: <first token of profile.display_name>,
  }}
/>
```

For `userFirstName`: split the existing display_name on whitespace and take `[0]` (return `null` if empty).

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/components/home/home-hero-card.tsx mobile/components/home/home-dashboard.tsx --ext .ts,.tsx
```
Both clean.

- [ ] **Step 4: Sanity test**

Run: `./node_modules/.bin/vitest run tests/unit/family-mode-copy.test.ts tests/unit/login-action-view.test.ts`
Expected: still passing (no regression).

- [ ] **Step 5: Commit**

```bash
git add mobile/components/home/home-hero-card.tsx mobile/components/home/home-dashboard.tsx
git commit -m "feat(home): hero usa familyModeHeroCopy (eyebrow + título por modo)"
```

---

## Task 5: Crear `StartingBalanceCta` component

**Files:**
- Create: `mobile/components/home/starting-balance-cta.tsx`

- [ ] **Step 1: Crear el componente**

Create `mobile/components/home/starting-balance-cta.tsx`:

```tsx
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import { TourTarget } from '@/features/tours'
import { TOUR_KEYS } from '@/features/tours/tour-keys'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'

interface StartingBalanceCtaProps {
  /** Called when user taps "Confirmar". Owner provides the modal/sheet UX. */
  onPress: () => void
  /** Tour order to register with — kept loose so the home-tour author
   *  can renumber steps without changing this component. */
  tourOrder: number
}

/**
 * Card destacada que aparece en Home cuando el ciclo todavía no
 * tiene `current_cycle_starting_balance` confirmado. Pulse sutil
 * para llamar la atención sin gritar. El tour de Home la highlightea
 * como step. Una vez confirmado el saldo, el padre desmonta la card.
 */
function StartingBalanceCtaImpl({ onPress, tourOrder }: StartingBalanceCtaProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1
      return
    }
    scale.value = withRepeat(
      withSequence(
        // @motion-allow: 1400ms pulse half-cycle for a low-urgency cta
        withTiming(1.012, { duration: 1400 }),
        // @motion-allow: 1400ms pulse half-cycle for a low-urgency cta
        withTiming(1, { duration: 1400 }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(scale)
    }
  }, [reduceMotion, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePress = () => {
    void triggerHaptic('selection')
    onPress()
  }

  return (
    <TourTarget order={tourOrder} tour={TOUR_KEYS.home}>
      <Animated.View style={animatedStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirmá tu saldo inicial del ciclo"
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: theme.colors.creamSoft,
              borderColor: theme.colors.peach,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: theme.colors.peach },
            ]}
          >
            <MaterialIcons name="savings" size={20} color={theme.colors.text} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Confirmá tu saldo inicial
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
              Empezá tu ciclo con la plata que tenés disponible hoy.
            </Text>
          </View>
          <View
            style={[
              styles.ctaPill,
              { backgroundColor: theme.colors.text },
            ]}
          >
            <Text style={[styles.ctaPillText, { color: theme.colors.canvas }]}>
              Confirmar
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </TourTarget>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  ctaPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ctaPillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
})

export const StartingBalanceCta = memo(StartingBalanceCtaImpl)
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/components/home/starting-balance-cta.tsx --ext .ts,.tsx
```
Both clean.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/home/starting-balance-cta.tsx
git commit -m "feat(home): StartingBalanceCta card destacada con tour target + pulse"
```

---

## Task 6: Cablear `StartingBalanceCta` en `home-dashboard.tsx`

**Files:**
- Modify: `mobile/components/home/home-dashboard.tsx`

- [ ] **Step 1: Importar el componente**

READ `mobile/components/home/home-dashboard.tsx`. Add the import alongside other component imports:
```tsx
import { StartingBalanceCta } from '@/components/home/starting-balance-cta'
```

- [ ] **Step 2: Renderizar la card condicionalmente**

En `home-dashboard.tsx`, ubicar:
1. El prop `onConfirmCycleStartingBalance` que ya viene del padre (lo pasa `home-screen.tsx:338`).
2. El valor de `current_cycle_starting_balance` (típicamente accesible vía la query / dashboard model que ya consume el componente).

Justo ANTES del `<HomeHeroCard ... />`, agregar:

```tsx
{currentCycleStartingBalance === null ? (
  <View style={{ marginBottom: 12 }}>
    <StartingBalanceCta
      tourOrder={99}
      onPress={() => onConfirmCycleStartingBalance(null)}
    />
  </View>
) : null}
```

Notas:
- Renombrar `currentCycleStartingBalance` al nombre exacto que ya está en scope (puede ser `dashboard.familyFinanceQuery.data?.current_cycle_starting_balance` o un derivado del model). LEER el código existente para usar el binding correcto en vez de inventar.
- `tourOrder={99}` es un placeholder seguro (mayor al último step actual del home-tour); el autor del tour puede reasignarlo después sin tocar este componente.
- Pasar `onConfirmCycleStartingBalance(null)` mantiene el default (monthly_income como balance). Si en tu UX el tap debe abrir un input para que el usuario tipee un monto, reemplazar por la función adecuada que dispare ese flow.

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/components/home/home-dashboard.tsx --ext .ts,.tsx
```
Both clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/home/home-dashboard.tsx
git commit -m "feat(home): mostrar StartingBalanceCta cuando current_cycle_starting_balance IS NULL"
```

---

## Task 7: Helper `onboardingSuccessCopy` (TDD)

**Files:**
- Create: `mobile/features/onboarding/success-copy.ts`
- Test: `tests/unit/onboarding-success-copy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/onboarding-success-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { onboardingSuccessCopy } from '@/features/onboarding/success-copy'

describe('onboardingSuccessCopy', () => {
  it('modo solo con nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'solo', firstName: 'Mario' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo, Mario!',
      subtitle: 'Tu espacio personal ya está armado. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo solo sin nombre → saludo neutral', () => {
    expect(
      onboardingSuccessCopy({ kind: 'solo', firstName: '' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo!',
      subtitle: 'Tu espacio personal ya está armado. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo shared con nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'shared', firstName: 'Mario' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo, Mario!',
      subtitle: 'Tu familia ya está armada. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo shared sin nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'shared', firstName: '' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo!',
      subtitle: 'Tu familia ya está armada. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/onboarding-success-copy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `mobile/features/onboarding/success-copy.ts`:

```ts
// Pure copy resolver for the success screen shown after the 5-step
// onboarding wizard finishes. Variants on (kind, firstName).

export interface OnboardingSuccessInput {
  kind: 'solo' | 'shared'
  firstName: string
}

export interface OnboardingSuccessCopy {
  eyebrow: string
  title: string
  subtitle: string
  ctaLabel: string
}

export function onboardingSuccessCopy(
  input: OnboardingSuccessInput,
): OnboardingSuccessCopy {
  const trimmedName = input.firstName.trim()
  const title = trimmedName ? `¡Listo, ${trimmedName}!` : '¡Listo!'
  const subtitle =
    input.kind === 'solo'
      ? 'Tu espacio personal ya está armado. Vamos a Home.'
      : 'Tu familia ya está armada. Vamos a Home.'
  return {
    eyebrow: 'Bienvenido a Manifiesto',
    title,
    subtitle,
    ctaLabel: 'Empezar',
  }
}
```

- [ ] **Step 4: Run test + guard de copy**

Run: `./node_modules/.bin/vitest run tests/unit/onboarding-success-copy.test.ts`
Expected: PASS (4 tests).

Run: `npm run guard:forbidden-copy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/onboarding/success-copy.ts tests/unit/onboarding-success-copy.test.ts
git commit -m "feat(onboarding): onboardingSuccessCopy helper (copy del success screen)"
```

---

## Task 8: `OnboardingSuccessScreen` component + ruta

**Files:**
- Create: `mobile/screens/home/onboarding-success-screen.tsx`
- Create: `app/(app)/onboarding-success.tsx`

- [ ] **Step 1: Crear el screen component**

Create `mobile/screens/home/onboarding-success-screen.tsx`:

```tsx
import { useCallback, useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug } from '@/assets/avatars'
import { RiseView } from '@/components/home/animated/rise-view'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyProfile } from '@/features/profile/use-profile'
import { onboardingSuccessCopy } from '@/features/onboarding/success-copy'
import { markAuthTransitionLoaded, showAuthTransitionSplash } from '@/lib/auth-transition-splash'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

const CREAM = authTokens.surfaceCream
const PEACH = authTokens.peach
const CLAY = authTokens.clay
const DARK_GREEN = authTokens.welcomeBg

/**
 * Post-onboarding success screen. Sits between the wizard's last step
 * and Home. Tap-to-continue, sin auto-dismiss, para que el usuario
 * sienta el momento de cierre. Una vez en Home, el tour de Home
 * auto-fira (mecánica existente en `useScreenTour`).
 */
export function OnboardingSuccessScreen() {
  return (
    <RequireAuth>
      {({ userId }) => <OnboardingSuccessBody userId={userId} />}
    </RequireAuth>
  )
}

function OnboardingSuccessBody({ userId }: { userId: string }) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const isSolo = useIsSolo(userId)
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  // Hide the auth transition splash once this screen has rendered.
  useEffect(() => {
    markAuthTransitionLoaded()
  }, [])

  const firstName = useMemo(() => {
    const raw = profile?.display_name?.trim() ?? ''
    return raw.split(/\s+/)[0] ?? ''
  }, [profile?.display_name])

  const copy = useMemo(
    () =>
      onboardingSuccessCopy({
        kind: isSolo ? 'solo' : 'shared',
        firstName,
      }),
    [isSolo, firstName],
  )

  const avatarSlug = profile?.avatar_animal && isAvatarSlug(profile.avatar_animal)
    ? profile.avatar_animal
    : null

  const handleContinue = useCallback(() => {
    void triggerHaptic('selection')
    showAuthTransitionSplash()
    router.replace('/(app)/(tabs)/home')
  }, [router])

  return (
    <View style={[styles.root, { backgroundColor: CREAM }]}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <RiseView delay={100} duration={620} style={styles.eyebrowSlot}>
          <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
            {copy.eyebrow}
          </Text>
        </RiseView>

        <RiseView delay={250} duration={620} style={styles.titleSlot}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {copy.title}
          </Text>
        </RiseView>

        <RiseView delay={400} duration={700} style={styles.avatarSlot}>
          <View style={styles.avatarShell}>
            <LinearGradient
              colors={[PEACH, CLAY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {avatarSlug ? (
              <AvatarAnimal
                slug={avatarSlug}
                size={108}
                tint={CREAM}
                backgroundTint="transparent"
              />
            ) : null}
          </View>
        </RiseView>

        <RiseView delay={560} duration={620} style={styles.subtitleSlot}>
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
            {copy.subtitle}
          </Text>
        </RiseView>
      </View>

      <RiseView delay={760} duration={520} style={styles.ctaSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.ctaLabel}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: DARK_GREEN, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>{copy.ctaLabel}</Text>
        </Pressable>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
  },
  eyebrowSlot: {
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  titleSlot: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  avatarSlot: {
    alignItems: 'center',
    marginTop: 40,
  },
  avatarShell: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: CREAM,
  },
  subtitleSlot: {
    alignItems: 'center',
    marginTop: 22,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaSlot: {
    width: '100%',
  },
  cta: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
})
```

> Notas: si `RiseView`, `useIsSolo`, o `AvatarAnimal` no existen exactamente con esos nombres/paths, ajustar al equivalente existente. La estructura visual sigue el patrón del welcome/login screens del mismo proyecto.

- [ ] **Step 2: Crear el route wrapper**

Create `app/(app)/onboarding-success.tsx`:

```tsx
import { OnboardingSuccessScreen } from '@/screens/home/onboarding-success-screen'
export default OnboardingSuccessScreen
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/screens/home/onboarding-success-screen.tsx app/\(app\)/onboarding-success.tsx --ext .ts,.tsx
```
Both clean. If any import resolves wrong (e.g. RiseView path), fix and rerun.

- [ ] **Step 4: Commit**

```bash
git add mobile/screens/home/onboarding-success-screen.tsx app/\(app\)/onboarding-success.tsx
git commit -m "feat(onboarding): OnboardingSuccessScreen tap-to-continue + ruta"
```

---

## Task 9: `useCompleteOnboarding` setQueryData + redirect a success

**Files:**
- Modify: `mobile/features/onboarding/use-complete-onboarding.ts`
- Modify: `mobile/screens/home/onboarding-screen.tsx`

- [ ] **Step 1: `useCompleteOnboarding` actualiza el cache síncronamente**

READ `mobile/features/onboarding/use-complete-onboarding.ts` (~35 lines, already shown in the spec context).

Modify the `onSuccess` callback to ALSO write to the cache before invalidating, so `RequireAuth` no longer races on the success screen mount:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'

export function useCompleteOnboarding(userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para completar el onboarding.')
      }
      const completedAt = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: completedAt })
        .eq('id', userId)
      if (error) {
        throw error
      }
      return completedAt
    },
    onSuccess: async (completedAt) => {
      // Sync cache write FIRST so RequireAuth (read on next render of
      // the success route) sees onboarding_completed_at set and
      // doesn't bounce the user back to /(app)/onboarding.
      queryClient.setQueryData<Profile | undefined>(
        profileQueryKey(userId),
        (prev) =>
          prev
            ? { ...prev, onboarding_completed_at: completedAt }
            : prev,
      )
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
    },
  })
}
```

> Verify `Profile` type is exported from `mobile/features/profile/use-profile.ts`. If not (e.g. it's `interface Profile` but not exported), make it exported in the same commit, or import the existing exported shape.

- [ ] **Step 2: Cambiar el redirect del wizard a `/onboarding-success`**

READ `mobile/screens/home/onboarding-screen.tsx`. Locate the call to `useCompleteOnboarding`'s mutate (typically at the finish of step 5; will be wrapped with `showAuthTransitionSplash() + router.replace('/(app)/(tabs)/home')`).

Change the navigation target from `'/(app)/(tabs)/home'` to `'/(app)/onboarding-success'`:

Find this (approximate; actual code may differ in formatting):
```tsx
showAuthTransitionSplash()
router.replace('/(app)/(tabs)/home')
```

Replace with:
```tsx
showAuthTransitionSplash()
router.replace('/(app)/onboarding-success')
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/features/onboarding/use-complete-onboarding.ts mobile/screens/home/onboarding-screen.tsx --ext .ts,.tsx
```
Both clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/onboarding/use-complete-onboarding.ts mobile/screens/home/onboarding-screen.tsx
git commit -m "feat(onboarding): success screen via setQueryData + redirect a /onboarding-success"
```

---

## Task 10: Settings — sección "Ayuda · Tutoriales"

**Files:**
- Modify: `mobile/screens/settings/settings-screen.tsx`

- [ ] **Step 1: Importar helpers + componer la sección**

READ `mobile/screens/settings/settings-screen.tsx` around lines 14 (imports of SettingsGroup/SettingsRow) and the JSX body (~lines 789+, where the other `<SettingsGroup>` instances live).

Add imports at the top:
```tsx
import { useRouter } from 'expo-router'   // verify if already imported
import { resetTourSeen, resetAllTours } from '@/features/tours/persistence'
import { TOUR_KEYS, TOUR_LABELS, ALL_TOUR_KEYS } from '@/features/tours/tour-keys'
```

(Verify `useRouter` isn't already imported. If it is, skip adding it.)

Inside the component body (near other `const router = useRouter()` if present, else add it), build the handler:

```tsx
const handleRewatchTour = useCallback(
  async (tourKey: (typeof ALL_TOUR_KEYS)[number]) => {
    await resetTourSeen(tourKey)
    const target =
      tourKey === TOUR_KEYS.home
        ? '/(app)/(tabs)/home'
        : tourKey === TOUR_KEYS.gastos
          ? '/(app)/(tabs)/expenses'
          : tourKey === TOUR_KEYS.fijos
            ? '/(app)/(tabs)/fixed-expenses'
            : '/(app)/(tabs)/insights'
    router.push(target)
  },
  [router],
)

const handleResetAllTours = useCallback(async () => {
  await resetAllTours()
  // No navigation: the user keeps where they are. Next visit to each
  // screen will auto-fire its tour.
}, [])
```

(Verify the exact tab route names by reading `app/(app)/(tabs)/`. The plan says `expenses` / `fixed-expenses` / `insights` per the earlier `ls` output. Adjust if different.)

- [ ] **Step 2: Renderizar el grupo en el JSX**

In the JSX, after one of the existing `<SettingsGroup ...>` blocks (recommended: after "Notificaciones", before "Apariencia"), add:

```tsx
<SettingsGroup
  title="Ayuda"
  footer="Volvé a ver cualquier tutorial cuando quieras."
>
  <SettingsRow
    icon="home"
    label="Ver tutorial de Inicio"
    onPress={() => void handleRewatchTour(TOUR_KEYS.home)}
  />
  <SettingsRow
    icon="receipt-long"
    label="Ver tutorial de Gastos"
    onPress={() => void handleRewatchTour(TOUR_KEYS.gastos)}
  />
  <SettingsRow
    icon="event-repeat"
    label="Ver tutorial de Fijos"
    onPress={() => void handleRewatchTour(TOUR_KEYS.fijos)}
  />
  <SettingsRow
    icon="insights"
    label="Ver tutorial de Control"
    onPress={() => void handleRewatchTour(TOUR_KEYS.control)}
  />
  <SettingsRow
    icon="restart-alt"
    label="Volver a ver todos los tutoriales"
    helper="Resetea los 4 tutoriales — el próximo ingreso a cada pantalla los vuelve a mostrar."
    onPress={() => void handleResetAllTours()}
    isLast
  />
</SettingsGroup>
```

(Icon names are MaterialIcons. If any doesn't render, swap for an equivalent — `tips-and-updates`, `school`, `play-circle`, etc.)

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck
npx eslint mobile/screens/settings/settings-screen.tsx --ext .ts,.tsx
```
Both clean.

- [ ] **Step 4: Sanity tests**

Run: `./node_modules/.bin/vitest run tests/unit/should-backfill-tours.test.ts tests/unit/family-mode-copy.test.ts tests/unit/onboarding-success-copy.test.ts`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "feat(settings): sección 'Ayuda · Tutoriales' con re-watch + reset-all"
```

---

## Task 11: Docs sync + validación final

**Files:**
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md`
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md`

- [ ] **Step 1: Actualizar `02-auth-onboarding.md`**

READ the file first to find the right section. Insert a new paragraph in the onboarding section describing the success screen + the auto-fire tour:

```md
**Success screen post-wizard** ([`onboarding-success-screen.tsx`](../../../mobile/screens/home/onboarding-success-screen.tsx), ruta `/(app)/onboarding-success`): pantalla intermedia entre el step 5 del wizard y Home. Muestra avatar + saludo personalizado por modo (solo vs familia) + CTA "Empezar" tap-to-continue. `useCompleteOnboarding` ahora hace `setQueryData` síncrono sobre el profile cache antes de invalidar, así `RequireAuth` ve `onboarding_completed_at` set y no bouncea a la ruta de wizard.

**Auto-fire de tours** ([`useScreenTour`](../../../mobile/features/tours/use-screen-tour.ts)): ya cableado en `home-dashboard.tsx`, `gastos-v2-screen.tsx`, `fijos-v2-screen.tsx`, `control-v2-screen.tsx`. Primera visita a cada screen fira el tour respectivo (gated por `getToursEnabled` + `getTourSeen` + splash hidden). Marca `seen` on stop. **Backfill para usuarios existentes:** [`use-backfill-existing-user.ts`](../../../mobile/features/tours/use-backfill-existing-user.ts), invocado en `AppEntryGate`, marca los 4 tours como seen para cualquier usuario cuyo `onboarding_completed_at` sea anterior a `TOURS_FEATURE_DEPLOYED_AT` (constante en [`backfill-config.ts`](../../../mobile/features/tours/backfill-config.ts)). Idempotente vía flag persistente `tours-backfill-done`.
```

(Reemplazar fechas/links si la estructura del doc difiere.)

- [ ] **Step 2: Actualizar `06-settings-engagement.md`**

Insert a section describing the new "Ayuda · Tutoriales" group:

```md
**Ayuda · Tutoriales** — nuevo grupo en Settings con 5 rows: "Ver tutorial de Inicio/Gastos/Fijos/Control" (cada uno resetea su flag `tour-seen.{key}` vía `resetTourSeen` y navega al tab correspondiente; el auto-fire del hook re-dispara) y "Volver a ver todos los tutoriales" (llama `resetAllTours` que además re-habilita el toggle global). No requiere migración ni cambio de schema: usa los helpers ya existentes en [`tours/persistence.ts`](../../../mobile/features/tours/persistence.ts).
```

- [ ] **Step 3: Validación completa**

Run each:
```bash
npm run typecheck
npm run lint
./node_modules/.bin/vitest run tests/unit/should-backfill-tours.test.ts tests/unit/family-mode-copy.test.ts tests/unit/onboarding-success-copy.test.ts tests/unit/biometric-feedback.test.ts tests/unit/biometric-login-state.test.ts tests/unit/biometric-enabled-flag.test.ts tests/unit/background-relock.test.ts tests/unit/login-action-view.test.ts
npm run guard:forbidden-copy
```
Expected: typecheck/lint clean, all tests pass (~44 tests across 8 files), guard clean.

> Nota: el suite completo (`npm run test`) tiene 3 fallas pre-existentes por `__DEV__` en módulos expo (`skeleton-layouts`, `use-unbounded-loop-animation`, `copy-glossary`), ajenas a este plan. Si querés sanity-check, podés correr `npm run test` y confirmar que las únicas fallas son esas 3.

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md
git commit -m "docs: sync success screen + backfill + sección Ayuda en Settings"
```

---

## QA manual (post-implementación, en device / dev client)

> **Importante:** los tours NO funcionan en Expo Go SDK 54 si no fue cableado a dev build, porque dependen de medición de layout y haptics nativos. Probar en dev client (`expo run:ios --device`) o EAS build.

1. **Usuario nuevo:** signup → wizard 5 pasos → tap "Finalizar" → ✨ Success screen aparece con avatar + "¡Listo, [nombre]!" + copy del modo → tap "Empezar" → llega a Home.
2. Home muestra el hero con eyebrow "Tu espacio personal" o "Tu familia" + título contextual.
3. Si `current_cycle_starting_balance IS NULL`, aparece la card destacada "Confirmá tu saldo inicial" con pulse sutil.
4. Tour de Home auto-fira (después del splash). Recorrer el tour → al final se marca como seen.
5. Navegar a **Gastos** → tour de Gastos auto-fira.
6. Idem **Fijos** y **Control**.
7. **Re-watch:** Settings → "Ayuda · Tutoriales" → "Ver tutorial de Home" → navega a Home → tour re-fira.
8. **Reset all:** Settings → "Volver a ver todos los tutoriales" → próxima visita a cada screen, los 4 tours firan.
9. **Modo solo:** repetir el flujo eligiendo "Yo solo" en el step 3 del wizard → success screen dice "Tu espacio personal" → Home muestra eyebrow "Tu espacio personal".
10. **Usuario existente:** simulate un install fresh con un usuario cuyo `onboarding_completed_at` es anterior a `TOURS_FEATURE_DEPLOYED_AT`. Abrir la app → AppEntryGate invoca el backfill → marca los 4 tours seen. Visitar Home/Gastos/Fijos/Control → **ningún tour fira** (porque el backfill los marcó seen). Verificar en Settings que igual están disponibles para re-watch on-demand.
