# Pre-Onboarding Biometric Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insertar una pantalla `/(app)/biometric-setup` entre signup y el wizard de onboarding para que toda cuenta nueva tome una decisión consciente sobre Face ID antes de entrar.

**Architecture:** Pantalla dedicada controlada por `AppEntryGate` con un flag local por usuario (key `biometric-setup-shown:<userId>` en SecureStore vía `persistent-kv`). El flag se setea cuando el usuario interactúa con la pantalla (Activar éxito, Activar fail, Ahora no, Continuar). La pantalla detecta internamente modo A (biometría disponible) vs. modo B (no enrolada) leyendo `getBiometricLoginState()`.

**Tech Stack:** React Native / Expo SDK 54, TypeScript, expo-router, expo-secure-store, expo-local-authentication, Reanimated v4. Tests con vitest (config existente en `tests/unit/`).

**Spec amendment:** El spec menciona AsyncStorage para el flag; el codebase usa SecureStore vía `mobile/lib/persistent-kv.ts` (mismo helper que `tour-seen.*` + `tours-backfill-done`). Usamos persistent-kv por consistencia. Comportamiento equivalente para el flujo: device-local, key-namespaced por userId.

**Branch:** `feat/pre-onboarding-biometric-setup` (ya creada).

---

## File Structure

### Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `mobile/features/auth/biometric-setup-flag.ts` | `getBiometricSetupShown(userId)` / `markBiometricSetupShown(userId)` / `clearBiometricSetupShown(userId)` |
| `mobile/features/auth/should-show-biometric-setup.ts` | Pure decision fn para AppEntryGate |
| `mobile/features/auth/activate-biometric-for-session.ts` | Helper standalone: prompt + save refresh token |
| `mobile/screens/auth/biometric-setup-screen.tsx` | Pantalla con 2 modos (A: activar / B: informativo) |
| `app/(app)/biometric-setup.tsx` | Ruta wrapper (re-export del screen) |
| `tests/unit/biometric-setup-flag.test.ts` | Tests del flag (get/set/clear/aislamiento) |
| `tests/unit/should-show-biometric-setup.test.ts` | Tests de la decisión (8 combinaciones) |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `mobile/components/root/app-entry-gate.tsx` | Nueva regla antes del redirect a `/(app)/onboarding`. Lee flag async vía hook local. |
| `mobile/screens/auth/signup-screen.tsx` | 3 sitios cambian `/(app)/onboarding` → `/(app)/biometric-setup` (líneas 215, 255 + resolución de onboarding hand-off) |
| `mobile/features/auth/logout.ts` | Limpiar `biometric-setup-shown:<userId>` |

---

## Task 1: Flag storage (biometric-setup-flag.ts + tests)

**Files:**
- Create: `mobile/features/auth/biometric-setup-flag.ts`
- Test: `tests/unit/biometric-setup-flag.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/biometric-setup-flag.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => store.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

import {
  clearBiometricSetupShown,
  getBiometricSetupShown,
  markBiometricSetupShown,
} from '@/features/auth/biometric-setup-flag'

beforeEach(() => {
  store.clear()
})

describe('biometric-setup-flag', () => {
  it('returns false when no flag is stored for the user', async () => {
    expect(await getBiometricSetupShown('user-1')).toBe(false)
  })

  it('returns true after mark', async () => {
    await markBiometricSetupShown('user-1')
    expect(await getBiometricSetupShown('user-1')).toBe(true)
  })

  it('returns false after clear', async () => {
    await markBiometricSetupShown('user-1')
    await clearBiometricSetupShown('user-1')
    expect(await getBiometricSetupShown('user-1')).toBe(false)
  })

  it('isolates flags between users', async () => {
    await markBiometricSetupShown('user-A')
    expect(await getBiometricSetupShown('user-A')).toBe(true)
    expect(await getBiometricSetupShown('user-B')).toBe(false)
  })

  it('returns false when userId is empty', async () => {
    expect(await getBiometricSetupShown('')).toBe(false)
  })

  it('no-ops when marking with empty userId', async () => {
    await markBiometricSetupShown('')
    expect(store.size).toBe(0)
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/biometric-setup-flag.test.ts`
Expected: FAIL — `Cannot find module '@/features/auth/biometric-setup-flag'`

- [ ] **Step 1.3: Implement the module**

Create `mobile/features/auth/biometric-setup-flag.ts`:

```ts
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

/**
 * Per-user "biometric setup screen has been shown" flag. Stored
 * device-locally so the AppEntryGate can decide whether to route a
 * brand-new account through `/(app)/biometric-setup` before the
 * onboarding wizard.
 *
 * Storage: SecureStore on native (survives reinstall on iOS, wipes on
 * Android wipe), localStorage on web — same pattern as `tour-seen.*`
 * and `tours-backfill-done`. Reset on logout in `logout.ts`.
 *
 * Key namespaced by userId so multiple accounts on the same device
 * each get their own decision.
 *
 * Value: literal `'1'` when shown; absence (null) means not shown.
 */
const PREFIX = 'biometric-setup-shown:'

function keyFor(userId: string): string {
  return `${PREFIX}${userId}`
}

export async function getBiometricSetupShown(userId: string): Promise<boolean> {
  if (!userId) return false
  const raw = await getPersistentValue(keyFor(userId))
  return raw === '1'
}

export async function markBiometricSetupShown(userId: string): Promise<void> {
  if (!userId) return
  await setPersistentValue(keyFor(userId), '1')
}

export async function clearBiometricSetupShown(userId: string): Promise<void> {
  if (!userId) return
  await deletePersistentValue(keyFor(userId))
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run tests/unit/biometric-setup-flag.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 1.5: Commit**

```bash
git add mobile/features/auth/biometric-setup-flag.ts tests/unit/biometric-setup-flag.test.ts
git commit -m "feat(auth): biometric-setup-shown flag (per-user, device-local)"
```

---

## Task 2: Decision fn (should-show-biometric-setup.ts + tests)

**Files:**
- Create: `mobile/features/auth/should-show-biometric-setup.ts`
- Test: `tests/unit/should-show-biometric-setup.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/should-show-biometric-setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'

describe('shouldShowBiometricSetup', () => {
  const base = {
    sessionUserId: 'u1',
    onboardingCompletedAt: null,
    biometricSetupShown: false,
    biometricSetupFlagLoaded: true,
  } as const

  it('true when session valid + onboarding incomplete + flag false + loaded', () => {
    expect(shouldShowBiometricSetup(base)).toBe(true)
  })

  it('false when no session', () => {
    expect(shouldShowBiometricSetup({ ...base, sessionUserId: null })).toBe(false)
  })

  it('false when sessionUserId is undefined', () => {
    expect(shouldShowBiometricSetup({ ...base, sessionUserId: undefined })).toBe(false)
  })

  it('false when onboarding completed', () => {
    expect(
      shouldShowBiometricSetup({
        ...base,
        onboardingCompletedAt: '2026-05-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('false when flag already shown', () => {
    expect(shouldShowBiometricSetup({ ...base, biometricSetupShown: true })).toBe(false)
  })

  it('false when flag not yet loaded (avoid premature redirect)', () => {
    expect(
      shouldShowBiometricSetup({ ...base, biometricSetupFlagLoaded: false }),
    ).toBe(false)
  })

  it('true when onboardingCompletedAt is undefined (treated as incomplete)', () => {
    expect(
      shouldShowBiometricSetup({ ...base, onboardingCompletedAt: undefined }),
    ).toBe(true)
  })

  it('false when every input is empty/false', () => {
    expect(
      shouldShowBiometricSetup({
        sessionUserId: null,
        onboardingCompletedAt: null,
        biometricSetupShown: false,
        biometricSetupFlagLoaded: false,
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/should-show-biometric-setup.test.ts`
Expected: FAIL — `Cannot find module '@/features/auth/should-show-biometric-setup'`

- [ ] **Step 2.3: Implement the module**

Create `mobile/features/auth/should-show-biometric-setup.ts`:

```ts
/**
 * Pure decision fn for AppEntryGate. Returns true when the user
 * should be routed to `/(app)/biometric-setup` (the intermediate
 * activation screen between signup and the onboarding wizard).
 *
 * The decision does NOT depend on whether biometric hardware is
 * available — the screen itself renders an informative variant
 * (modo B) when there's no biometry enrolled. This guarantees every
 * brand-new account makes a conscious decision (or sees the "you can
 * activate it later" copy) before entering the wizard.
 *
 * `biometricSetupFlagLoaded` exists to avoid a routing flicker: if we
 * redirect before the persistent-kv read completes, a user who
 * already saw the screen (flag=true) would briefly land on
 * biometric-setup again before the flag resolves. Returning false
 * while the flag is loading lets the AppEntryGate render its loading
 * state instead.
 */
export function shouldShowBiometricSetup(input: {
  sessionUserId: string | null | undefined
  onboardingCompletedAt: string | null | undefined
  biometricSetupShown: boolean
  biometricSetupFlagLoaded: boolean
}): boolean {
  return Boolean(
    input.sessionUserId &&
      !input.onboardingCompletedAt &&
      !input.biometricSetupShown &&
      input.biometricSetupFlagLoaded,
  )
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run tests/unit/should-show-biometric-setup.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 2.5: Commit**

```bash
git add mobile/features/auth/should-show-biometric-setup.ts tests/unit/should-show-biometric-setup.test.ts
git commit -m "feat(auth): shouldShowBiometricSetup pure decision fn"
```

---

## Task 3: Activation helper (activate-biometric-for-session.ts)

**Files:**
- Create: `mobile/features/auth/activate-biometric-for-session.ts`

(No unit tests — function is I/O-heavy against SecureStore + LocalAuthentication + Supabase. Smoke-tested via manual tests in Task 9.)

- [ ] **Step 3.1: Implement the helper**

Create `mobile/features/auth/activate-biometric-for-session.ts`:

```ts
import {
  authenticateBiometricAccess,
  getBiometricLoginState,
  saveBiometricCredentials,
} from '@/lib/biometric-auth'
import { supabase } from '@/lib/supabase'

export type ActivateBiometricResult =
  | 'activated'
  | 'cancelled'
  | 'unavailable'
  | 'no-session'

/**
 * Standalone activation flow for the pre-onboarding biometric-setup
 * screen. Mirrors what `useAuthBiometricController.persistBiometricCredentials`
 * does internally, but without depending on the hook's auth-flow
 * params (clearFeedback / onErrorMessage / etc.) that don't apply
 * here.
 *
 * Returns a discriminated string the caller can map to a toast or
 * silent advance:
 *   - 'activated'     → biometry saved, can advance to onboarding
 *   - 'cancelled'     → user dismissed / failed the prompt
 *   - 'unavailable'   → hardware missing or not enrolled
 *   - 'no-session'    → session expired between signup and now
 *
 * Idempotent: if credentials already saved, returns 'activated'
 * without re-prompting.
 */
export async function activateBiometricForSession(
  email: string,
): Promise<ActivateBiometricResult> {
  const state = await getBiometricLoginState()

  if (!state.isAvailable) {
    return 'unavailable'
  }

  if (state.hasSavedCredentials) {
    return 'activated'
  }

  const result = await authenticateBiometricAccess({
    promptMessage: `Activá ${state.label} para entrar más rápido la próxima vez.`,
  })

  if (!result.success) {
    return 'cancelled'
  }

  const sessionResponse = await supabase.auth.getSession()
  const refreshToken = sessionResponse.data.session?.refresh_token

  if (!refreshToken) {
    return 'no-session'
  }

  await saveBiometricCredentials({ email, refreshToken })

  return 'activated'
}
```

- [ ] **Step 3.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3.3: Commit**

```bash
git add mobile/features/auth/activate-biometric-for-session.ts
git commit -m "feat(auth): activateBiometricForSession helper (standalone)"
```

---

## Task 4: Biometric setup screen

**Files:**
- Create: `mobile/screens/auth/biometric-setup-screen.tsx`

- [ ] **Step 4.1: Implement the screen**

Create `mobile/screens/auth/biometric-setup-screen.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { RequireAuth } from '@/components/guards'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  activateBiometricForSession,
  type ActivateBiometricResult,
} from '@/features/auth/activate-biometric-for-session'
import { markBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import {
  getBiometricLoginState,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

/**
 * Pre-onboarding biometric setup screen. Sits between signup and
 * the 5-step wizard. Two modes:
 *
 *   - Modo A (`isAvailable=true`): Activá Face ID + Activar / Ahora no
 *   - Modo B (`isAvailable=false`): Activalo cuando quieras + Continuar
 *
 * On any interaction we mark the per-user flag so the gate doesn't
 * route here again, then `router.replace('/(app)/onboarding')`.
 *
 * The flag is set even when the biometric prompt fails — the user
 * already made the conscious decision to attempt activation.
 */
export function BiometricSetupScreen() {
  return (
    <RequireAuth>
      {({ userId }) => <BiometricSetupBody userId={userId} />}
    </RequireAuth>
  )
}

function BiometricSetupBody({ userId }: { userId: string }) {
  const router = useRouter()
  const sessionQuery = useAuthSession()
  const email = sessionQuery.data?.user.email ?? ''
  const { theme } = useAppTheme()

  const [biometric, setBiometric] = useState<BiometricLoginState | null>(null)
  const [isWorking, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState().then((state) => {
      if (!cancelled) setBiometric(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const advanceToOnboarding = useCallback(async () => {
    await markBiometricSetupShown(userId)
    router.replace('/(app)/onboarding')
  }, [router, userId])

  const handleActivate = useCallback(async () => {
    if (isWorking || !email) return
    setWorking(true)
    try {
      const result: ActivateBiometricResult = await activateBiometricForSession(email)
      if (result === 'activated') {
        void triggerHaptic('success')
      } else if (result === 'cancelled') {
        void triggerHaptic('warning')
      }
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, email, isWorking])

  const handleSkip = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      void triggerHaptic('selection')
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, isWorking])

  // While biometric state is loading, render an empty themed canvas
  // (no spinner — the read is fast and a spinner here would flash).
  const isLoading = biometric === null

  const label = biometric?.label ?? 'Face ID'
  const isAvailable = biometric?.isAvailable ?? false

  const copy = useMemo(
    () =>
      isAvailable
        ? {
            iconName: 'scan-circle-outline' as const,
            title: `Activá ${label}`,
            body: 'Entrá más rápido y con más seguridad.',
            primaryLabel: `Activar ${label}`,
            secondaryLabel: 'Ahora no',
          }
        : {
            iconName: 'lock-closed-outline' as const,
            title: 'Activalo cuando quieras',
            body: `Tu dispositivo no tiene ${label} configurado. Podés activarlo más adelante desde Ajustes → Seguridad.`,
            primaryLabel: 'Continuar',
            secondaryLabel: null as string | null,
          },
    [isAvailable, label],
  )

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {!isLoading && (
        <View style={styles.content}>
          <RiseView delay={100} duration={620} style={styles.iconSlot}>
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.surface }]}>
              <Ionicons
                name={copy.iconName}
                size={56}
                color={authTokens.welcomeBg}
              />
            </View>
          </RiseView>

          <RiseView delay={180} duration={620}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {copy.title}
            </Text>
          </RiseView>

          <RiseView delay={260} duration={620}>
            <Text style={[styles.body, { color: theme.colors.textMuted }]}>
              {copy.body}
            </Text>
          </RiseView>

          <RiseView delay={340} duration={620} style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              hitSlop={DEFAULT_HIT_SLOP}
              onPress={isAvailable ? handleActivate : handleSkip}
              disabled={isWorking}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: authTokens.welcomeBg,
                  opacity: isWorking ? 0.5 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text style={[styles.primaryLabel, { color: authTokens.surfaceCream }]}>
                {copy.primaryLabel}
              </Text>
            </Pressable>

            {copy.secondaryLabel && (
              <Pressable
                accessibilityRole="button"
                hitSlop={DEFAULT_HIT_SLOP}
                onPress={handleSkip}
                disabled={isWorking}
                style={({ pressed }) => [
                  styles.ghostButton,
                  {
                    opacity: isWorking ? 0.5 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.ghostLabel, { color: theme.colors.textMuted }]}>
                  {copy.secondaryLabel}
                </Text>
              </Pressable>
            )}
          </RiseView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 96,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconSlot: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 48,
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    alignItems: 'stretch',
    gap: 12,
  },
  primaryButton: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  ghostButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
})
```

- [ ] **Step 4.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4.3: Commit**

```bash
git add mobile/screens/auth/biometric-setup-screen.tsx
git commit -m "feat(auth): pantalla biometric-setup (modo A/B + theme-aware)"
```

---

## Task 5: Route wrapper

**Files:**
- Create: `app/(app)/biometric-setup.tsx`

- [ ] **Step 5.1: Implement the route**

Create `app/(app)/biometric-setup.tsx`:

```tsx
import { BiometricSetupScreen } from '@/screens/auth/biometric-setup-screen'
export default BiometricSetupScreen
```

- [ ] **Step 5.2: Register route options (no back gesture)**

Open `mobile/components/root/app-stack-shell.tsx`, find where `onboarding-success` is registered as a stack screen with `gestureEnabled: false`. Add the same options block for `biometric-setup`.

If the file uses a `<Stack.Screen>` JSX list, add:

```tsx
<Stack.Screen
  name="biometric-setup"
  options={{ gestureEnabled: false, headerShown: false }}
/>
```

If it uses a `screenOptions` map, add the equivalent entry.

(Investigate the file first; copy the exact pattern used by `onboarding-success` adjacent to it.)

- [ ] **Step 5.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5.4: Commit**

```bash
git add app/(app)/biometric-setup.tsx mobile/components/root/app-stack-shell.tsx
git commit -m "feat(app): ruta /(app)/biometric-setup + sin gesture back"
```

---

## Task 6: AppEntryGate — insert new rule

**Files:**
- Modify: `mobile/components/root/app-entry-gate.tsx`

- [ ] **Step 6.1: Add async flag read hook inline**

Open `mobile/components/root/app-entry-gate.tsx`. Add these imports near the top (with the other `@/features/auth/*` imports):

```ts
import { getBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import { shouldShowBiometricSetup } from '@/features/auth/should-show-biometric-setup'
```

Inside `AppEntryGate()`, after the existing hooks (`useColdStartBiometricCheck`, `useAppLockState`) and before the `isLoading` aggregate, add:

```ts
// Flag read for the pre-onboarding biometric-setup gate. We resolve
// it lazily here (no separate hook file) because the result only
// influences one routing branch. While loading, treat as
// "not loaded" so `shouldShowBiometricSetup` returns false and the
// gate keeps rendering the loading state — prevents a redirect
// flicker when the flag is actually `true` but the read hasn't
// resolved yet.
const [biometricSetupShown, setBiometricSetupShown] = useState(false)
const [biometricSetupFlagLoaded, setBiometricSetupFlagLoaded] = useState(false)
useEffect(() => {
  // No userId yet → nothing to read; mark as "loaded=false" so
  // gate stays in loading and re-checks once userId resolves.
  if (!userId) {
    setBiometricSetupShown(false)
    setBiometricSetupFlagLoaded(false)
    return
  }
  let cancelled = false
  setBiometricSetupFlagLoaded(false)
  void getBiometricSetupShown(userId).then((value) => {
    if (cancelled) return
    setBiometricSetupShown(value)
    setBiometricSetupFlagLoaded(true)
  })
  return () => {
    cancelled = true
  }
}, [userId])
```

Add `useState` to the existing `useEffect` import line at the top:

```ts
import { useEffect, useState } from 'react'
```

- [ ] **Step 6.2: Wire the flag into the loading aggregate**

Find the `isLoading` declaration and extend it. The current form is:

```ts
const isLoading =
  sessionQuery.isLoading ||
  (Boolean(userId) && familyQuery.isLoading) ||
  (Boolean(userId) && profileQuery.isLoading) ||
  (biometric.status === 'loading' && !isAppUnlocked)
```

Replace with:

```ts
const isLoading =
  sessionQuery.isLoading ||
  (Boolean(userId) && familyQuery.isLoading) ||
  (Boolean(userId) && profileQuery.isLoading) ||
  (biometric.status === 'loading' && !isAppUnlocked) ||
  // Wait for the biometric-setup flag whenever it can change the
  // routing decision: we have a userId AND onboarding isn't yet
  // marked complete. Otherwise the read is irrelevant and we skip
  // the wait to keep returning users fast.
  (Boolean(userId) &&
    !profileQuery.data?.onboarding_completed_at &&
    !biometricSetupFlagLoaded)
```

- [ ] **Step 6.3: Insert the redirect branch**

Find the existing redirect:

```ts
if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
  return <Redirect href="/(app)/onboarding" />
}
```

Replace with:

```ts
if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
  if (
    shouldShowBiometricSetup({
      sessionUserId: userId,
      onboardingCompletedAt: profileQuery.data.onboarding_completed_at,
      biometricSetupShown,
      biometricSetupFlagLoaded,
    })
  ) {
    return <Redirect href="/(app)/biometric-setup" />
  }
  return <Redirect href="/(app)/onboarding" />
}
```

- [ ] **Step 6.4: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6.5: Run all existing unit tests**

Run: `npx vitest run`
Expected: all tests PASS (including the 14 new ones from Tasks 1+2)

- [ ] **Step 6.6: Commit**

```bash
git add mobile/components/root/app-entry-gate.tsx
git commit -m "feat(auth): AppEntryGate rutea a biometric-setup pre-onboarding"
```

---

## Task 7: Signup redirects → biometric-setup

**Files:**
- Modify: `mobile/screens/auth/signup-screen.tsx`

- [ ] **Step 7.1: Update email+password redirect (line 214-216)**

Open `mobile/screens/auth/signup-screen.tsx`. Find this block (around line 214):

```ts
router.replace(
  resolution.type === 'onboarding' ? resolution.href : '/(app)/onboarding',
)
```

Replace with:

```ts
// Hand off to the pre-onboarding biometric-setup gate. AppEntryGate
// will fall through to /(app)/onboarding if the user already saw
// the biometric-setup screen (flag set). Apple/Google + magic-link
// flows hit the same gate via cold-start.
router.replace(
  resolution.type === 'onboarding' ? resolution.href : '/(app)/biometric-setup',
)
```

- [ ] **Step 7.2: Update Apple/Google redirect (line 255)**

Find:

```ts
router.replace('/(app)/onboarding')
```

Replace with:

```ts
router.replace('/(app)/biometric-setup')
```

(Update the surrounding comment from "5-step onboarding handles family + profile" to "pre-onboarding biometric-setup gate handles activation, then hands off to the 5-step onboarding wizard".)

Final comment block:

```ts
// Apple/Google sign-up = same as email signup → biometric-setup gate
// first (activate Face ID), then 5-step onboarding handles family +
// profile. The session arrives already email-confirmed (provider-
// verified), so we never need to route through /(auth)/join for these.
router.replace('/(app)/biometric-setup')
```

- [ ] **Step 7.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7.4: Commit**

```bash
git add mobile/screens/auth/signup-screen.tsx
git commit -m "feat(auth): signup redirige a biometric-setup (email+pass + Apple + Google)"
```

---

## Task 8: Logout — clear flag

**Files:**
- Modify: `mobile/features/auth/logout.ts`

- [ ] **Step 8.1: Capture userId BEFORE signOut**

Open `mobile/features/auth/logout.ts`. The current implementation imports `supabase` and calls `signOut()` first; the userId is needed BEFORE that to namespace the flag clear. Capture it from the live session at the top of the function (after the dynamic imports).

Replace the function body with:

```ts
export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { resetAppLock } = await import('@/features/auth/app-lock-state')
  const { clearLastUserProfile } = await import('@/lib/last-user-cache')
  const { resetAllTours } = await import('@/features/tours/persistence')
  const { deletePersistentValue } = await import('@/lib/persistent-kv')
  const { clearBiometricSetupShown } = await import(
    '@/features/auth/biometric-setup-flag'
  )

  // Capture userId BEFORE signOut so we can namespace the per-user
  // flag clear. After signOut the session is null and we'd lose
  // the ability to target the right key.
  const sessionResponse = await supabase.auth.getSession()
  const userId = sessionResponse.data.session?.user.id ?? null

  const { error } = await supabase.auth.signOut()

  if (error) {
    input.onError(error)
    return
  }

  // Atomic cleanup: await every persisted artifact of the previous
  // session BEFORE handing control back via onSuccess. The SIGNED_OUT
  // handler in `use-auth-session` also fires these clears, but its
  // calls are fire-and-forget and race against the next screen's
  // mount — clearing them here with explicit awaits eliminates the
  // window where the login screen could read stale data (e.g. the
  // previous user's avatar/name from the last-user cache).
  await clearBiometricCredentials()
  await clearLastUserProfile()
  // Tours-seen flags (`tour-seen.{key}`) are device-scoped in SecureStore.
  // On logout we wipe them so a subsequent signup OR login (this user
  // or another) gets the same fresh tour experience as a first install.
  // The `tours-backfill-done` flag is also wiped so the AppEntryGate
  // hook re-evaluates against whoever signs in next.
  await resetAllTours()
  await deletePersistentValue('tours-backfill-done')
  // Pre-onboarding biometric-setup flag (per-user). If the user
  // signed out mid-onboarding without seeing the screen, they should
  // see it again on the next login.
  if (userId) {
    await clearBiometricSetupShown(userId)
  }
  // Re-arm the app-lock gate so the next session (if a different
  // user signs in on the same device, or the same user signs back
  // in) goes through the biometric re-confirmation again.
  resetAppLock()
  input.onSuccess()
}
```

- [ ] **Step 8.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8.3: Commit**

```bash
git add mobile/features/auth/logout.ts
git commit -m "feat(auth): logout limpia biometric-setup-shown del userId saliente"
```

---

## Task 9: Manual smoke tests

(No code changes — verification only. Execute on iOS dev client.)

- [ ] **Step 9.1: Smoke test 1 — cuenta nueva email+pass + activar**

1. Logout completo de cualquier cuenta existente
2. Welcome → "Crear cuenta" → ingresar nombre/email/password nuevos
3. Submit → debe aparecer `/(app)/biometric-setup` en modo A (Face ID disponible)
4. Tap "Activar Face ID" → prompt nativo iOS → autenticar
5. Debe redirigir a onboarding wizard (StepWelcome)
6. Completar wizard → success → home
7. Hacer logout
8. Welcome → "Ya tengo cuenta" → debe aparecer login screen con auto-Face ID (porque guardamos credenciales en paso 4)

Resultado esperado: 8/8 OK.

- [ ] **Step 9.2: Smoke test 2 — cuenta nueva + "Ahora no"**

1. Logout
2. Crear otra cuenta nueva
3. Biometric-setup modo A → tap "Ahora no"
4. Wizard arranca
5. Completar wizard → home
6. Logout → re-login (manual) → home (sin auto-biometría porque no la activamos)

Resultado esperado: 6/6 OK.

- [ ] **Step 9.3: Smoke test 3 — simulador sin biometría enrolada**

(En simulador iOS: Features → Face ID → desenrolar)

1. Logout
2. Crear cuenta nueva
3. Biometric-setup debe aparecer en modo B (texto "Activalo cuando quieras")
4. Tap "Continuar" → wizard

Resultado esperado: 4/4 OK.

- [ ] **Step 9.4: Smoke test 4 — Apple sign-in**

1. Logout
2. "Continuar con Apple" → autenticar
3. Biometric-setup aparece (modo A si Face ID enrolado)
4. Decidir → wizard

Resultado esperado: 4/4 OK.

- [ ] **Step 9.5: Smoke test 5 — logout mid-flow + re-login**

1. Crear cuenta nueva → biometric-setup → "Ahora no" → wizard
2. En el wizard, navegar a Settings (si accesible) o forzar logout vía dev menu
3. Re-login con esa misma cuenta (email+pass)
4. **Debe volver a aparecer biometric-setup** (flag fue limpiado en logout)

Resultado esperado: 4/4 OK.

- [ ] **Step 9.6: Smoke test 6 — hot-restart durante biometric-setup**

1. Crear cuenta nueva → llegar a biometric-setup → NO tocar nada
2. Cerrar app (swipe up + kill)
3. Reabrir
4. Cold-start → AppEntryGate → debe redirigir a biometric-setup otra vez

Resultado esperado: 4/4 OK.

- [ ] **Step 9.7: Smoke test 7 — returner con onboarding completo**

1. Login con cuenta existente que ya tiene `onboarding_completed_at`
2. **NO debe pasar por biometric-setup** — va directo a home (o lock screen si tiene biometría guardada)

Resultado esperado: 2/2 OK.

- [ ] **Step 9.8: Anotar resultados**

Si todos los smokes pasan, registrar en el commit-message del Task 10. Si alguno falla, parar y volver a investigation (sistemic-debugging).

---

## Task 10: Docs update + cierre

**Files:**
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md`

- [ ] **Step 10.1: Actualizar estado de auth/onboarding**

Abrir `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md`. Buscar la sección que describe el flujo de signup → onboarding. Insertar al final de esa sección (o en una sección dedicada de "Pre-onboarding biometric setup") este bloque:

```markdown
### Pre-onboarding biometric setup (2026-05-27)

Toda cuenta nueva pasa por `/(app)/biometric-setup` antes de entrar al
wizard. La pantalla tiene dos modos:

- **Modo A** — Face ID / huella enrolada en el device. CTA primario
  "Activar Face ID" dispara `activateBiometricForSession(email)`
  (`mobile/features/auth/activate-biometric-for-session.ts`) que
  guarda el refresh token en Keychain vía `saveBiometricCredentials`.
  CTA secundario "Ahora no" salta sin activar.
- **Modo B** — sin biometría enrolada. CTA "Continuar" educa y avanza.

La decisión "mostrar/no mostrar" vive en
`mobile/features/auth/should-show-biometric-setup.ts` (pure fn) y se
ejecuta dentro de `AppEntryGate`. El flag `biometric-setup-shown:<userId>`
se guarda en SecureStore vía `persistent-kv` y se limpia en `logout.ts`.

Aplica a los 3 proveedores de signup (email+pass, Apple, Google) y
sobrevive cold-start. Returners con `onboarding_completed_at` jamás
ven la pantalla.
```

- [ ] **Step 10.2: Commit docs**

```bash
git add docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md
git commit -m "docs: registrar pantalla pre-onboarding biometric-setup"
```

- [ ] **Step 10.3: Final tests + typecheck**

Run:
```bash
npm run typecheck
npx vitest run
npm run lint 2>&1 | tail -20
```

Expected: typecheck PASS, all vitest PASS, lint sin errors nuevos.

- [ ] **Step 10.4: Hand off to finishing-a-development-branch**

Done. La branch está lista para mergear vía `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

**Spec coverage:**
- Modo A activar/skip ✅ (Task 4 + Task 3)
- Modo B continuar ✅ (Task 4)
- Decisión en AppEntryGate ✅ (Task 6 + Task 2)
- Flag per-user device-local ✅ (Task 1)
- Logout limpia flag ✅ (Task 8)
- Signup → biometric-setup en 3 proveedores ✅ (Task 7)
- Magic link cubierto por la regla del gate (cold-start cuando vuelve con sesión) ✅ (Task 6)
- Hot-restart durante setup ✅ (cubierto por gate + flag)
- Reinstalación → flag inexistente → vuelve a aparecer ✅ (storage device-local)
- Sin migración DB ✅
- Todos los edge cases del spec cubiertos en smoke tests (Task 9)

**Placeholder scan:** ningún TBD/TODO; cada paso muestra código completo o comando exacto con output esperado.

**Type consistency:**
- `shouldShowBiometricSetup` input names: `sessionUserId`, `onboardingCompletedAt`, `biometricSetupShown`, `biometricSetupFlagLoaded` — usados idénticos en Task 2 + Task 6 ✅
- `ActivateBiometricResult` discriminated union — definida en Task 3, importada igual en Task 4 ✅
- Flag fn signatures (`getBiometricSetupShown(userId)` / `markBiometricSetupShown(userId)` / `clearBiometricSetupShown(userId)`) — consistentes entre Task 1, Task 4, Task 6, Task 8 ✅
