# App-Lock + Biometría Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer el app-lock de Manifiesto — re-lock por background (60s), gate biométrico estricto con escape a contraseña, copy de iOS lockout, fix del catch en lock mode, y limpieza del estado `'authed'` muerto.

**Architecture:** Helpers puros testeables (`shouldRelock`, `biometricFeedbackForError`) + un watcher root-mounted que escucha `AppState` y fuerza el re-paso por `AppEntryGate` vía `router.replace('/')`. Cambios quirúrgicos en `authenticateBiometricAccess`, el controller de login y `login-screen.tsx`.

**Tech Stack:** React Native / Expo, expo-local-authentication, expo-router, Vitest. Spec: [`docs/superpowers/specs/2026-05-24-app-lock-hardening-design.md`](../specs/2026-05-24-app-lock-hardening-design.md).

**Rama:** `feat/app-lock-hardening` (ya creada; el fix previo está commiteado ahí).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `mobile/features/auth/background-relock.ts` (nuevo) | Helper puro `shouldRelock` + constante umbral |
| `mobile/components/root/background-relock-watcher.tsx` (nuevo) | Watcher `AppState` → `resetAppLock()` + `router.replace('/')` |
| `mobile/components/root/root-layout-shell.tsx` | Montar el watcher |
| `mobile/features/auth/biometric-feedback.ts` (nuevo) | Helper puro `biometricFeedbackForError` |
| `mobile/lib/biometric-auth.ts` | Param `disableDeviceFallback` en `authenticateBiometricAccess` |
| `mobile/features/auth/use-login-controller.ts` | Exponer `clearFeedback` + `setInfoMessage` en actions |
| `mobile/screens/auth/login-screen.tsx` | Gate estricto en lock, catch fix, copy lockout + FeedbackPill, quitar `'authed'` |
| `tests/unit/background-relock.test.ts` (nuevo) | Tests de `shouldRelock` |
| `tests/unit/biometric-feedback.test.ts` (nuevo) | Tests de `biometricFeedbackForError` |
| `docs/...` | Sync |

---

## Task 1: Helper puro `shouldRelock`

**Files:**
- Create: `mobile/features/auth/background-relock.ts`
- Test: `tests/unit/background-relock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/background-relock.test.ts
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'

describe('shouldRelock', () => {
  const base = { thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS, isUnlocked: true }

  it('no re-bloquea si nunca salió de active (leftActiveAt null)', () => {
    expect(shouldRelock({ ...base, leftActiveAt: null, now: 1_000_000 })).toBe(false)
  })

  it('no re-bloquea bajo el umbral', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 30_000 }),
    ).toBe(false)
  })

  it('re-bloquea en o sobre el umbral', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 60_000 }),
    ).toBe(true)
    expect(
      shouldRelock({ ...base, leftActiveAt, now: leftActiveAt + 120_000 }),
    ).toBe(true)
  })

  it('no re-bloquea si la app ya está locked', () => {
    const leftActiveAt = 1_000_000
    expect(
      shouldRelock({
        ...base,
        isUnlocked: false,
        leftActiveAt,
        now: leftActiveAt + 120_000,
      }),
    ).toBe(false)
  })

  it('el umbral default es 60s', () => {
    expect(BACKGROUND_RELOCK_THRESHOLD_MS).toBe(60_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/background-relock.test.ts`
Expected: FAIL — `Cannot find module '@/features/auth/background-relock'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/features/auth/background-relock.ts
// Pure decision for the per-launch app-lock re-arm on foreground.
//
// The app-lock (app-lock-state.ts) only re-locks on cold start. This
// adds a background-timeout re-lock: if the app was backgrounded longer
// than the threshold, re-arm the lock so AppEntryGate re-prompts Face ID
// on the next foreground. Pure + testable; the AppState wiring lives in
// background-relock-watcher.tsx.

/** Background dwell time after which a foregrounding app re-locks. */
export const BACKGROUND_RELOCK_THRESHOLD_MS = 60_000

export interface ShouldRelockInput {
  /** Timestamp (ms) the app last left the 'active' state, or null if it never did. */
  leftActiveAt: number | null
  /** Current time (ms). */
  now: number
  /** Re-lock threshold in ms. */
  thresholdMs: number
  /** Whether the app is currently unlocked (isAppUnlocked()). */
  isUnlocked: boolean
}

export function shouldRelock({
  leftActiveAt,
  now,
  thresholdMs,
  isUnlocked,
}: ShouldRelockInput): boolean {
  if (!isUnlocked) return false
  if (leftActiveAt === null) return false
  return now - leftActiveAt >= thresholdMs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/unit/background-relock.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/features/auth/background-relock.ts tests/unit/background-relock.test.ts
git commit -m "feat(auth): shouldRelock helper (background re-lock decision)"
```

---

## Task 2: Watcher de background re-lock + montaje

**Files:**
- Create: `mobile/components/root/background-relock-watcher.tsx`
- Modify: `mobile/components/root/root-layout-shell.tsx` (import + montaje junto a `GlobalConnectivityWatcher`)

> No hay test unitario del watcher (efecto con `AppState`); su lógica está cubierta por `shouldRelock` (Task 1). Verificación por typecheck + QA manual.

- [ ] **Step 1: Crear el watcher**

```tsx
// mobile/components/root/background-relock-watcher.tsx
// Background re-lock watcher.
//
// Re-arms the per-launch app-lock when the app returns to foreground
// after more than BACKGROUND_RELOCK_THRESHOLD_MS in background. On
// re-lock it calls resetAppLock() + router.replace('/') so AppEntryGate
// re-decides the destination (Face ID lock screen if biometrics are set
// up, passthrough otherwise — reusing all the existing gate logic).
//
// Why navigate to '/' instead of straight to the lock screen: RequireAuth
// does NOT enforce the app-lock (only AppEntryGate does), so a user on a
// deep screen wouldn't be redirected by resetAppLock() alone. Routing to
// '/' re-runs AppEntryGate, whose cached session/family/profile queries
// make the re-evaluation cheap. Renders nothing of its own.

import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'
import { isAppUnlocked, resetAppLock } from '@/features/auth/app-lock-state'

export function BackgroundRelockWatcher() {
  // First timestamp at which the app left 'active' for the current
  // background spell. Null while active. We record the FIRST non-active
  // transition (a control-center peek reports 'inactive' first, then
  // 'background') so the elapsed time measures the whole spell.
  const leftActiveAtRef = useRef<number | null>(null)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const relock = shouldRelock({
          leftActiveAt: leftActiveAtRef.current,
          now: Date.now(),
          thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS,
          isUnlocked: isAppUnlocked(),
        })
        leftActiveAtRef.current = null
        if (relock) {
          resetAppLock()
          router.replace('/')
        }
        return
      }
      // 'background' | 'inactive' — record the start of the spell once.
      if (leftActiveAtRef.current === null) {
        leftActiveAtRef.current = Date.now()
      }
    })
    return () => sub.remove()
  }, [])

  return null
}
```

- [ ] **Step 2: Montar el watcher en RootLayoutShell**

En `mobile/components/root/root-layout-shell.tsx`, agregar el import junto a los otros watchers (después de la línea que importa `GlobalConnectivityWatcher`, ~línea 13):

```tsx
import { BackgroundRelockWatcher } from '@/components/root/background-relock-watcher'
```

Y montarlo junto a `<GlobalConnectivityWatcher />` (después de esa línea, ~línea 72):

```tsx
          <GlobalConnectivityWatcher />
          <BackgroundRelockWatcher />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/root/background-relock-watcher.tsx mobile/components/root/root-layout-shell.tsx
git commit -m "feat(auth): re-lock app tras 60s en background"
```

---

## Task 3: Helper puro `biometricFeedbackForError`

**Files:**
- Create: `mobile/features/auth/biometric-feedback.ts`
- Test: `tests/unit/biometric-feedback.test.ts`

> **Antes de fijar el string:** revisar `tests/unit/copy-glossary.test.ts` (guard:forbidden-copy) para no usar términos prohibidos. El copy propuesto ("… está bloqueado por varios intentos. Usá tu contraseña para entrar.") es personal/neutral; si el glosario lo rechaza, ajustar manteniendo el sentido.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/biometric-feedback.test.ts
import { describe, expect, it } from 'vitest'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'

describe('biometricFeedbackForError', () => {
  it('lockout → copy diferenciada con el label', () => {
    expect(biometricFeedbackForError('lockout', 'Face ID')).toEqual({
      message: 'Face ID está bloqueado por varios intentos. Usá tu contraseña para entrar.',
    })
  })

  it('lockout_permanent → misma copy', () => {
    expect(biometricFeedbackForError('lockout_permanent', 'Touch ID')).toEqual({
      message: 'Touch ID está bloqueado por varios intentos. Usá tu contraseña para entrar.',
    })
  })

  it('user_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('user_cancel', 'Face ID')).toBeNull()
  })

  it('system_cancel → null (silencioso)', () => {
    expect(biometricFeedbackForError('system_cancel', 'Face ID')).toBeNull()
  })

  it('error desconocido o undefined → null', () => {
    expect(biometricFeedbackForError('authentication_failed', 'Face ID')).toBeNull()
    expect(biometricFeedbackForError(undefined, 'Face ID')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/biometric-feedback.test.ts`
Expected: FAIL — `Cannot find module '@/features/auth/biometric-feedback'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/features/auth/biometric-feedback.ts
// Maps a LocalAuthentication error code to user-facing feedback.
//
// Only lockout states get a differentiated message (telling the user to
// fall back to their password). Cancels are silent (the user chose to
// dismiss). Everything else returns null — the caller already fires a
// generic warning haptic for non-cancel failures.

export interface BiometricFeedback {
  message: string
}

export function biometricFeedbackForError(
  error: string | undefined,
  label: string,
): BiometricFeedback | null {
  if (error === 'lockout' || error === 'lockout_permanent') {
    return {
      message: `${label} está bloqueado por varios intentos. Usá tu contraseña para entrar.`,
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/unit/biometric-feedback.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificar el glosario de copy**

Run: `npm run guard:forbidden-copy`
Expected: PASS. Si falla por el string nuevo, ajustar el copy en `biometric-feedback.ts` y re-correr Step 4 + este step.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/auth/biometric-feedback.ts tests/unit/biometric-feedback.test.ts
git commit -m "feat(auth): biometricFeedbackForError (copy de lockout)"
```

---

## Task 4: Param `disableDeviceFallback` en `authenticateBiometricAccess`

**Files:**
- Modify: `mobile/lib/biometric-auth.ts:212-222`

- [ ] **Step 1: Modificar la firma y el cuerpo**

Reemplazar la función actual:

```ts
export async function authenticateBiometricAccess(
  options?: { promptMessage?: string },
) {
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel: Platform.OS === 'ios' ? 'Usar código' : undefined,
    disableDeviceFallback: false,
    biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
  })
}
```

por:

```ts
export async function authenticateBiometricAccess(
  options?: { promptMessage?: string; disableDeviceFallback?: boolean },
) {
  // When the caller wants a strict biometric gate (no device-passcode
  // fallback — used by the app-lock screen) we also clear fallbackLabel
  // so the OS doesn't offer "Usar código"; the in-app "Usar contraseña"
  // button is the escape hatch instead.
  const disableDeviceFallback = options?.disableDeviceFallback ?? false
  return await LocalAuthentication.authenticateAsync({
    promptMessage: options?.promptMessage ?? 'Desbloqueá tu acceso guardado',
    cancelLabel: 'Cancelar',
    fallbackLabel:
      disableDeviceFallback || Platform.OS !== 'ios' ? undefined : 'Usar código',
    disableDeviceFallback,
    biometricsSecurityLevel: ANDROID_REQUIRES_WEAK_BIOMETRIC ? 'weak' : 'strong',
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. (Los call sites existentes sin el nuevo param siguen compilando — es opcional.)

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/biometric-auth.ts
git commit -m "feat(auth): disableDeviceFallback opcional en authenticateBiometricAccess"
```

---

## Task 5: Exponer `clearFeedback` + `setInfoMessage` desde el controller

**Files:**
- Modify: `mobile/features/auth/use-login-controller.ts:200-211`

> `triggerFaceID` (en `login-screen.tsx`) corre en lock mode y necesita poder limpiar/poner feedback. Hoy las actions no exponen los setters. `clearFeedback` y `setInfoMessage` ya existen en `formActions` (ver `use-login-form-state.ts`).

- [ ] **Step 1: Agregar los dos campos al objeto `actions` retornado**

En el bloque `actions: { ... }` (líneas ~200-211), agregar `clearFeedback` y `setInfoMessage`. Ambos ya están destructurados de `formActions` arriba en el archivo (`clearFeedback` línea ~42, `setInfoMessage` línea ~44-50). El bloque queda:

```ts
    actions: {
      clearFeedback,
      dismissKeyboard: keyboardActions.dismissKeyboard,
      handleBiometricSignIn,
      handleFieldBlur: keyboardActions.handleFieldBlur,
      handleFieldFocus: keyboardActions.handleFieldFocus,
      handleSubmit,
      handleViewportLayout: keyboardActions.handleViewportLayout,
      setDisplayName,
      setEmail,
      setInfoMessage,
      setPassword: setPasswordValue,
      updateMode,
    },
```

> Verificar que `clearFeedback` y `setInfoMessage` estén en la lista de destructuring de `formActions` cerca del top del hook (líneas ~41-51). `clearFeedback` ya está; `setInfoMessage` ya está. Si alguno faltara, agregarlo a ese destructuring.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/features/auth/use-login-controller.ts
git commit -m "feat(auth): exponer clearFeedback + setInfoMessage en login controller"
```

---

## Task 6: Login-screen — gate estricto en lock, catch fix, copy lockout + FeedbackPill

**Files:**
- Modify: `mobile/screens/auth/login-screen.tsx`

Depende de Tasks 3, 4, 5.

- [ ] **Step 1: Importar los helpers**

Junto a los imports de `@/features/auth/...` (cerca de `resolveLoginActionView`, ~línea 35):

```tsx
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'
```

- [ ] **Step 2: Destructurar los nuevos campos del controller**

En el bloque que destructura `controller` (donde están `actions`, `biometricState`, `email`, `errorMessage`, `infoMessage`, …, ~líneas 96-107), confirmar que `errorMessage` e `infoMessage` ya están (sí lo están). No hace falta agregar nada acá: `actions.clearFeedback` y `actions.setInfoMessage` se usan vía `actions`.

- [ ] **Step 3: Gate estricto + clear feedback + copy lockout en `triggerFaceID`**

Reemplazar el cuerpo de `triggerFaceID` (líneas 276-322) por:

```tsx
  const triggerFaceID = useCallback(async () => {
    if (status !== 'idle' || isBusy) return
    await triggerHaptic('selection')
    actions.clearFeedback()
    setStatus('scanning')
    try {
      if (isLockMode) {
        // App-lock unlock path: strict biometric gate (no device-passcode
        // fallback). On success mark unlocked + route home. On failure we
        // stay on the lock screen (idle) with the CTA + "Usar contraseña"
        // escape; surface differentiated copy for a lockout.
        const result = await authenticateBiometricAccess({
          promptMessage: 'Desbloqueá Manifiesto',
          disableDeviceFallback: true,
        })
        if (result.success) {
          await triggerHaptic('success')
          showAuthTransitionSplash()
          markAppUnlocked()
          router.replace('/')
          return
        }
        const feedback = biometricFeedbackForError(result.error, biometricState.label)
        if (feedback) actions.setInfoMessage(feedback.message)
        setStatus('idle')
        return
      }
      await actions.handleBiometricSignIn()
      // handleBiometricSignIn swallows every non-success path internally
      // (cancel / stale creds / network) and returns. On success it
      // navigates away (this screen unmounts). Reaching here = cancelled
      // or failed silently → reset to idle so the user can retry.
      setStatus('idle')
    } catch {
      // Defensive: handleBiometricSignIn doesn't throw today. In sign-in
      // mode fall back to the password form so the user has a path
      // forward; in lock mode stay on the lock screen (the password
      // escape is already visible there).
      setStatus('idle')
      if (!isLockMode) {
        userPickedModeRef.current = true
        setFormMode('use-password')
      }
    }
  }, [actions, isBusy, status, isLockMode, router, biometricState.label])
```

> Nota: se agregó `biometricState.label` a las deps del `useCallback`.

- [ ] **Step 4: Renderizar FeedbackPill en la vista face-id**

En la rama `actionView === 'face-id' ? (` (el fragmento `<>` que abre ~línea 633), agregar los dos pills al inicio del fragmento, justo antes del `<Pressable accessibilityLabel={ctaLabel} ...>`:

```tsx
            ) : actionView === 'face-id' ? (
              <>
                {errorMessage ? (
                  <FeedbackPill intent="error" message={errorMessage} />
                ) : null}
                {!errorMessage && infoMessage ? (
                  <FeedbackPill intent="info" message={infoMessage} />
                ) : null}
                <Pressable
                  accessibilityLabel={ctaLabel}
```

> `FeedbackPill` ya está importado (línea 29). `errorMessage`/`infoMessage` ya están destructurados del controller.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint mobile/screens/auth/login-screen.tsx --ext .ts,.tsx`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add mobile/screens/auth/login-screen.tsx
git commit -m "feat(auth): lock gate estricto + copy lockout + catch no dumpea a password"
```

---

## Task 7: Copy de lockout en sign-in mode (controller)

**Files:**
- Modify: `mobile/features/auth/use-auth-biometric-controller.ts:138-149`

- [ ] **Step 1: Importar el helper**

Junto a los imports de `@/lib/...` / `@/features/...` (top del archivo):

```ts
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'
```

- [ ] **Step 2: Cablear la copy en la rama de no-success**

Reemplazar el bloque actual (líneas 138-149):

```ts
        const biometricResult = await authenticateBiometricAccess()

        if (!biometricResult.success) {
          if (
            !options?.isAutomatic &&
            biometricResult.error !== 'user_cancel' &&
            biometricResult.error !== 'system_cancel'
          ) {
            void triggerHaptic('warning')
          }
          return
        }
```

por:

```ts
        const biometricResult = await authenticateBiometricAccess()

        if (!biometricResult.success) {
          if (
            !options?.isAutomatic &&
            biometricResult.error !== 'user_cancel' &&
            biometricResult.error !== 'system_cancel'
          ) {
            void triggerHaptic('warning')
          }
          const feedback = biometricFeedbackForError(
            biometricResult.error,
            biometricState.label,
          )
          if (feedback) onInfoMessage(feedback.message)
          return
        }
```

> `onInfoMessage` y `biometricState` ya están en scope (params del hook). `biometricState` ya está en las deps del `useCallback` de `handleBiometricSignIn`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/auth/use-auth-biometric-controller.ts
git commit -m "feat(auth): copy de lockout en biometric sign-in"
```

---

## Task 8: Eliminar el estado `'authed'` muerto

**Files:**
- Modify: `mobile/screens/auth/login-screen.tsx` (tipo `Status`, `FOCUS`, `ctaLabel`, `ctaBg`, checkmark del avatar, comentario del effect de status)

> `setStatus('authed')` nunca se llama; el transition splash ya cubre el éxito. `FOCUS` solo se usa en la rama `'authed'` de `ctaBg`, así que también sale.

- [ ] **Step 1: Tipo `Status` (línea 62)**

```tsx
type Status = 'idle' | 'scanning'
```

- [ ] **Step 2: Eliminar `const FOCUS` (línea 60)**

Borrar la línea:

```tsx
const FOCUS = authTokens.focusRing
```

- [ ] **Step 3: `ctaLabel` (líneas ~438-443)**

Reemplazar:

```tsx
  const ctaLabel =
    status === 'authed'
      ? 'Entrando…'
      : status === 'scanning'
        ? 'Reconociendo'
        : `Entrar con ${biometricState.label || 'Face ID'}`
```

por:

```tsx
  const ctaLabel =
    status === 'scanning'
      ? 'Reconociendo'
      : `Entrar con ${biometricState.label || 'Face ID'}`
```

- [ ] **Step 4: `ctaBg` (línea ~445)**

Reemplazar:

```tsx
  const ctaBg = status === 'authed' ? FOCUS : DARK_GREEN
```

por:

```tsx
  const ctaBg = DARK_GREEN
```

- [ ] **Step 5: Checkmark del avatar (líneas ~527-540)**

Eliminar la rama `status === 'authed' ?` que renderiza el `<Svg>` del checkmark, dejando directamente el `lastUserAvatarSlug ? ... : <FernLogo/>`. Es decir, reemplazar:

```tsx
                    {status === 'authed' ? (
                      <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
                        <Path
                          d="M11 22l8 8 14-16"
                          stroke={CREAM}
                          strokeWidth={3.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                    ) : lastUserAvatarSlug ? (
```

por:

```tsx
                    {lastUserAvatarSlug ? (
```

> El cierre de ese ternario (`) : (` → FernLogo fallback) NO cambia: sigue siendo `lastUserAvatarSlug ? (AvatarAnimal) : (FernLogo)`.

- [ ] **Step 6: Actualizar el comentario del effect de status (línea ~201)**

En el comentario del `useEffect` que sincroniza `status`, quitar la referencia a `'authed'`. Reemplazar:

```tsx
  // leave the CTA stuck disabled). 'authed' is terminal and left alone.
```

por:

```tsx
  // leave the CTA stuck disabled).
```

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npx eslint mobile/screens/auth/login-screen.tsx --ext .ts,.tsx`
Expected: sin errores (en particular, ningún "FOCUS is defined but never used" ni "CREAM unused" — `CREAM` se sigue usando en otros lados; verificar el output).

- [ ] **Step 8: Commit**

```bash
git add mobile/screens/auth/login-screen.tsx
git commit -m "refactor(auth): eliminar estado 'authed' muerto del login"
```

---

## Task 9: Docs sync + validación final

**Files:**
- Modify: `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md`
- Modify: `docs/operaciones/pendientes-seguridad.md`

- [ ] **Step 1: Actualizar `02-auth-onboarding.md`**

En la sección de App-lock (cerca de "NO implementa re-lock por backgrounding", ~línea 247), reemplazar esa frase por la descripción del re-lock implementado:

```md
**App-lock:** módulo [`app-lock-state.ts`](../../../mobile/features/auth/app-lock-state.ts) — store module-level en memoria (resets en cold start). `markAppUnlocked()` / `resetAppLock()` / `useAppLockState()`. **Re-lock por background:** [`background-relock-watcher.tsx`](../../../mobile/components/root/background-relock-watcher.tsx) (montado en RootLayoutShell) re-arma el lock vía `resetAppLock()` + `router.replace('/')` si la app estuvo > 60s en background (helper puro `shouldRelock`). El gate de app-lock usa `disableDeviceFallback: true` (solo biometría; el escape es "Usar contraseña", que re-autentica). Copy de lockout vía `biometricFeedbackForError`.
```

En la sección de `getBiometricLoginState`/Face ID, agregar una línea cerca de la descripción de modos:

```md
- **Estado `'authed'`:** eliminado (era código muerto; el transition splash ya cubre el momento de éxito). El status local es `'idle' | 'scanning'`.
```

- [ ] **Step 2: Marcar los gaps como cerrados en `pendientes-seguridad.md`**

En la sección "Auditoría de login + biometría — 2026-05-24", mover los items de la tabla "Gaps abiertos" que se cerraron (re-lock por background, passcode fallback en el gate, iOS lockout copy, lock-mode catch, estado 'authed') a la lista "Cerrado en esta auditoría", agregando referencias a los archivos nuevos (`background-relock.ts`, `background-relock-watcher.tsx`, `biometric-feedback.ts`). Dejar abiertos solo: blur de privacidad en app-switcher (fuera de alcance), biometría estricta en login sin sesión (fuera de alcance), y `useAuthBiometricAutoSignIn` no-op (baja).

- [ ] **Step 3: Validación completa**

Run: `npm run typecheck && npm run lint && ./node_modules/.bin/vitest run tests/unit/background-relock.test.ts tests/unit/biometric-feedback.test.ts tests/unit/login-action-view.test.ts tests/unit/biometric-login-state.test.ts && npm run guard:forbidden-copy`
Expected: typecheck OK, lint OK, tests verdes, guard de copy OK.

> Nota: el suite completo (`npm run test`) tiene 3 fallas pre-existentes por `__DEV__ is not defined` en módulos expo (`skeleton-layouts`, `use-unbounded-loop-animation`, y una tercera), **ajenas a este trabajo** — verificado en HEAD limpio. No bloquean.

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md docs/operaciones/pendientes-seguridad.md
git commit -m "docs: sync app-lock hardening (re-lock, gate estricto, lockout copy)"
```

---

## QA manual (post-implementación, en device/simulador)

1. Logueado + biometría → background > 60s → foreground ⇒ re-pide Face ID.
2. Peek de control-center / notif < 60s ⇒ NO re-pide.
3. Lock gate: el prompt nativo **no** ofrece passcode del dispositivo.
4. Face ID cancela en lock ⇒ se queda en el lock screen con CTA + "Usar contraseña".
5. "Usar contraseña" en lock ⇒ re-auth + Home.
6. Varios fallos ⇒ copy de lockout visible.
7. Usuario **sin** biometría ⇒ idéntico al actual (no re-lock, no lock screen, login con fallback normal).
