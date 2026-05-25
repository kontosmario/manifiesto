# Spec — Hardening del app-lock + biometría · v1

> 🗓️ **2026-05-24** · Diseño aprobado (brainstorming) tras la auditoría del flujo de login + Face ID. Cierra los gaps abiertos que quedaron documentados en [`docs/operaciones/pendientes-seguridad.md`](../../operaciones/pendientes-seguridad.md) (sección "Auditoría de login + biometría — 2026-05-24").
>
> **Precondición:** ya está fixeado el bug del CTA Face ID que desaparecía en lock mode (`resolveLoginActionView` + `getBiometricLoginState` con `Promise.allSettled` + effect de `status` sin closure stale). Este spec cubre los 5 gaps restantes.

---

## 1. Objetivo y criterios de éxito

**Objetivo:** endurecer el "candado de banco" de Manifiesto — re-bloqueo al volver de background, gate biométrico estricto con escape a contraseña, mensajería de lockout, y limpieza de estados muertos — sin romper el flujo actual de usuarios con o sin biometría.

**Criterios de éxito (medibles en QA):**
- La app re-pide Face ID al volver a foreground tras **≥ 60s** en background (usuario logueado con biometría).
- Un peek corto (control-center, notificación, < 60s) **NO** re-bloquea.
- En el gate de app-lock, el prompt nativo **no ofrece el passcode del dispositivo**; si Face ID falla/cancela el usuario se queda en el lock screen con el escape "Usar contraseña".
- "Usar contraseña" en lock mode re-autentica y desbloquea (→ Home).
- Tras varios fallos, aparece copy diferenciada de lockout ("… está bloqueado por varios intentos. Usá tu contraseña para entrar.").
- Un fallo/throw del prompt en lock mode **no** dumpea al usuario a un formulario de contraseña sin contexto: se queda en el lock screen.
- Usuario **sin** biometría: comportamiento idéntico al actual (cero regresión).

**Decisiones tomadas (brainstorming 2026-05-24):**
- Re-lock: **tras umbral de 60s** en background (no inmediato, no 5 min).
- Passcode policy: **biometría-only en el gate de app-lock + escape a contraseña de la cuenta** (`disableDeviceFallback: true` solo en lock mode).
- Enforcement del re-lock: **Enfoque A — watcher root-mounted que navega** (`resetAppLock()` + `router.replace('/')`), reutilizando `AppEntryGate` para decidir lock vs passthrough.
- Estado `'authed'`: **eliminar** (código muerto; el transition splash ya cubre el éxito).

---

## 2. Contexto del código (estado actual)

- **`app-lock-state.ts`** — store module-level (`unlocked`), resetea en cold start. `markAppUnlocked()` / `resetAppLock()` / `useAppLockState()`. Comentario ya anticipa el re-lock por background (líneas 19-21).
- **`AppEntryGate`** (`app/index.tsx` → `mobile/components/root/app-entry-gate.tsx`) — **único** enforcer del lock: si `shouldUseBiometric && !isAppUnlocked` → `Redirect /(auth)/login?autoBiometric=1&lock=1`. Skip si no hay biometría.
- **`RequireAuth`** (`mobile/components/guards.tsx`) — **NO** enforce el app-lock (verificado). Por eso el re-lock necesita forzar navegación a `/`.
- **`authenticateBiometricAccess`** (`mobile/lib/biometric-auth.ts`) — hoy `disableDeviceFallback: false`, `fallbackLabel: 'Usar código'` (iOS).
- **`triggerFaceID`** (`mobile/screens/auth/login-screen.tsx`) — rama `isLockMode`: `authenticateBiometricAccess` → `markAppUnlocked` + `router.replace('/')`. El `catch` hoy hace `setFormMode('use-password')` (dumpea a password form incluso en lock mode).
- **`GlobalConnectivityWatcher`** (`mobile/components/root/global-connectivity-watcher.tsx`) — patrón de referencia: watcher montado en `RootLayoutShell`, suscribe `AppState`, renderiza `null`.

---

## 3. Gap 1 — Re-lock por background

**Helper puro** `mobile/features/auth/background-relock.ts`:
```ts
export const BACKGROUND_RELOCK_THRESHOLD_MS = 60_000

export function shouldRelock(input: {
  leftActiveAt: number | null
  now: number
  thresholdMs: number
  isUnlocked: boolean
}): boolean
```
Devuelve `true` **solo si**: `isUnlocked === true` **y** `leftActiveAt !== null` **y** `now - leftActiveAt >= thresholdMs`. Puro y testeable.

**Watcher** `mobile/components/root/background-relock-watcher.tsx`:
- Suscribe `AppState.addEventListener('change', ...)`.
- Estado interno (`useRef`) `leftActiveAt: number | null`:
  - transición a `'background'` o `'inactive'` → si `leftActiveAt == null`, `leftActiveAt = Date.now()`.
  - transición a `'active'` → si `shouldRelock({ leftActiveAt, now: Date.now(), thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS, isUnlocked: isAppUnlocked() })` → `resetAppLock()` + `router.replace('/')`. Siempre limpia `leftActiveAt = null`.
- Usa el `router` **imperativo** de expo-router (no hook) y `isAppUnlocked` / `resetAppLock` de `app-lock-state`.
- Renderiza `null`. Montado en `RootLayoutShell` junto a `GlobalConnectivityWatcher`.

**Por qué `router.replace('/')` y no navegar directo al lock screen:** `AppEntryGate` ya decide lock (si hay biometría) vs passthrough (si no). Navegar a `/` reutiliza esa lógica → un usuario sin biometría no queda atrapado en un lock screen inservible. Las queries de session/family/profile están cacheadas (React Query), así que el re-paso por el gate es barato.

**Trade-off aceptado:** tras desbloquear, el usuario vuelve a Home (no a la pantalla profunda donde estaba). Comportamiento típico de apps financieras.

**Tests:** `shouldRelock` — bajo umbral, sobre umbral, locked (isUnlocked false), sin timestamp (`leftActiveAt null`).

---

## 4. Gap 2 — Gate biométrico estricto + escape a contraseña

**`authenticateBiometricAccess`** pasa a aceptar:
```ts
options?: { promptMessage?: string; disableDeviceFallback?: boolean }
```
- Default `disableDeviceFallback: false` → login + setup **sin cambios** (mantienen el fallback, según scope).
- Cuando `disableDeviceFallback === true`: pasar `disableDeviceFallback: true` **y** `fallbackLabel: undefined` (que el SO no muestre "Usar código"; el escape es nuestro botón in-app).

**`triggerFaceID`** rama lock-mode → llama con `disableDeviceFallback: true`.

**Escape a contraseña:** ya existe — en lock mode `resolveLoginActionView` devuelve `'face-id'`, que renderiza el CTA + "Usar contraseña" / "Cambiar cuenta". `handleUsePassword` → form → `handleSubmit` → `signInWithPassword` → `onSignedIn` → `markAppUnlocked` + `replace('/')`. Se confirma en QA (sin cambio de código salvo lo de §5/§6).

**Sin test unitario** (integración con módulo nativo); cubierto por QA manual.

---

## 5. Gap 3 — lock-mode `catch` no dumpea a password form

En el `catch` de `triggerFaceID`: forzar `setFormMode('use-password')` **solo si `!isLockMode`**. En lock mode, solo `setStatus('idle')` → el usuario se queda en el lock screen y decide (reintentar Face ID o tocar el escape). Con `disableDeviceFallback: true` el lockout vuelve como `{ success: false, error: 'lockout' }` (no throw), así que cae por la rama de no-success de todos modos; este cambio cubre el caso defensivo del throw real.

---

## 6. Gap 4 — Copy de iOS lockout diferenciada

**Helper puro** `mobile/features/auth/biometric-feedback.ts`:
```ts
export function biometricFeedbackForError(
  error: string | undefined,
  label: string,
): { message: string } | null
```
- `'lockout'` / `'lockout_permanent'` → `{ message: '${label} está bloqueado por varios intentos. Usá tu contraseña para entrar.' }`.
- `'user_cancel'` / `'system_cancel'` → `null` (silencioso, sin feedback).
- Otros errores → `null` (mantiene el comportamiento actual: el haptic warning ya se dispara aparte).

**Cableado:**
- `handleBiometricSignIn` (sign-in mode): en la rama de no-success, si el helper devuelve mensaje → `onInfoMessage(message)`.
- `triggerFaceID` (lock mode): en la rama de no-success, si el helper devuelve mensaje → mostrarlo vía el canal de feedback del lock screen.

**Copy:** respetar `guard:forbidden-copy` (`tests/unit/copy-glossary.test.ts`) — tono personal/neutral, sin términos prohibidos. **Verificar el glosario antes de fijar el string final.**

**Test:** `biometricFeedbackForError` — lockout, lockout_permanent, user_cancel→null, system_cancel→null, error desconocido→null.

---

## 7. Gap 5 — Eliminar estado `'authed'` muerto

`setStatus('authed')` nunca se llama. Eliminar:
- `'authed'` del tipo `Status` (`'idle' | 'scanning'`).
- La rama del checkmark en el avatar (línea ~507).
- `ctaLabel === 'authed' ? 'Entrando…'` y `ctaBg === 'authed' ? FOCUS`.

Justificación: el transition splash (`showAuthTransitionSplash`) ya cubre el momento de éxito; el checkmark nunca se ve. YAGNI.

---

## 8. Testing

- **Unit (Vitest):** `shouldRelock` (4 casos), `biometricFeedbackForError` (5 casos). Reusan stubs existentes (`react-native` para `Platform`); el watcher no se unit-testea (efecto con `AppState`), su lógica vive en `shouldRelock`.
- **QA manual:**
  1. Logueado + biometría → background > 60s → foreground ⇒ re-pide Face ID.
  2. Peek control-center < 60s ⇒ NO re-pide.
  3. Lock gate: prompt nativo sin opción de passcode del dispositivo.
  4. Face ID cancela en lock ⇒ se queda en lock screen con CTA + "Usar contraseña".
  5. "Usar contraseña" en lock ⇒ re-auth + Home.
  6. Lockout (varios fallos) ⇒ copy diferenciada.
  7. Usuario sin biometría ⇒ idéntico al actual (no re-lock, no lock screen).

---

## 9. Fuera de alcance (v1)

- **Blur de privacidad en el app-switcher** (snapshot de iOS con datos financieros) — futuro; no estaba en los gaps reportados.
- **Biometría estricta en login sin sesión** (path refresh-token) — queda con fallback como hoy; la decisión de `disableDeviceFallback: true` se limitó al gate de app-lock.
- Re-lock configurable por el usuario (umbral en Settings) — futuro.

---

## 10. Archivos afectados (resumen)

| Capa | Archivo | Cambio |
|---|---|---|
| Cliente | `mobile/features/auth/background-relock.ts` (nuevo) | helper puro `shouldRelock` + constante umbral |
| Cliente | `mobile/components/root/background-relock-watcher.tsx` (nuevo) | watcher AppState → resetAppLock + replace('/') |
| Cliente | `mobile/components/root/root-layout-shell.tsx` | montar el watcher |
| Cliente | `mobile/lib/biometric-auth.ts` | param `disableDeviceFallback` en `authenticateBiometricAccess` |
| Cliente | `mobile/features/auth/biometric-feedback.ts` (nuevo) | helper puro `biometricFeedbackForError` |
| Cliente | `mobile/screens/auth/login-screen.tsx` | lock-mode `disableDeviceFallback: true`; `catch` no fuerza form en lock; cableo de copy lockout; eliminar `'authed'` |
| Tests | `tests/unit/background-relock.test.ts` (nuevo) | `shouldRelock` |
| Tests | `tests/unit/biometric-feedback.test.ts` (nuevo) | `biometricFeedbackForError` |
| Docs | `docs/ESTADO-DEL-PROYECTO/.../02-auth-onboarding.md`, `docs/operaciones/pendientes-seguridad.md` | sync (mismo commit — [[feedback_keep_docs_in_sync]]) |

<!-- Spec aprobado en brainstorming 2026-05-24; pendiente review del owner antes de writing-plans -->
