# Auth y Onboarding — Estado actual

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/

---

## 1. Visión general

### Flujo frío (cold start sin sesión)

```
Cold start (sin sesión)
       │
       ▼
AppEntryGate (root layout)
       │
       ├─ biometricCheck → hasSavedCredentials?
       │       YES → /(auth)/login?autoBiometric=1
       │       NO  → /(auth)/welcome
       │
   AuthLaunchSplash (overlay durante el boot)
```

```
/(auth)/welcome
       │
   "Empezar"  ──────────────────────────────► /(auth)/signup
   "Ya tengo cuenta" ────────────────────────► /(auth)/login
```

```
/(auth)/login
       │
  [Returning user: Face ID hero]
       ├─ Tap "Entrar con Face ID"
       │      └─ biometric OK → showAuthTransitionSplash → router.replace('/') → AppEntryGate → /(app)/(tabs)/home
       │
  [formMode=use-password / change-account]
       ├─ email + password → supabase.auth.signInWithPassword
       │      └─ OK → showAuthTransitionSplash → router.replace('/')
       ├─ "Olvidé mi contraseña" → /(auth)/forgot-password
       └─ "Continuar con Apple" → signInWithApple → Supabase → session detectada → AppEntryGate
```

```
/(auth)/signup
       │
  email+nombre+password ──► supabase.auth.signUp
       │
  ┌────┴───────────────────────────────────────────────────┐
  │ hasSession=true → showAuthTransitionSplash             │
  │      └─ router.replace('/(app)/biometric-setup')       │
  │                                                        │
  │ hasSession=false (email sin confirmar)                 │
  │      └─ panel "Revisá tu mail" + resend con cooldown   │
  └────────────────────────────────────────────────────────┘
  Social (Apple/Google) → signInWithIdToken → router.replace('/(app)/biometric-setup')
```

### Cold start con sesión válida

```
AppEntryGate
       │
       ├─ (biometric.shouldUseBiometric || pin.isSet) && !isAppUnlocked → lock
       │        ├─ biometría seteada → /(auth)/login?autoBiometric=1&lock=1
       │        │        └─ Face ID OK → markAppUnlocked → router.replace('/')
       │        │        └─ (con PIN seteado también: botón "Usar PIN" → /(auth)/pin-unlock)
       │        └─ solo PIN → /(auth)/pin-unlock
       │                 └─ PIN OK → markAppUnlocked → router.replace('/')
       │
       └─ profileQuery.onboarding_completed_at?
               NO  → ¿biometric-setup-shown:<userId>?
                       NO  → /(app)/biometric-setup    (pre-onboarding Face ID gate, 2026-05-27)
                       YES → /(app)/onboarding          (wizard de 5 pasos)
               YES → /(app)/(tabs)/home
```

### Manejo de sesión

- `useAuthSession` (React Query, `staleTime: Infinity`) suscribe a `supabase.auth.onAuthStateChange`.
- En `SIGNED_OUT`: limpia todas las queries (excepto `auth`), elimina el caché persistido de AsyncStorage, borra `lastUserProfile` de SecureStore.
- La sesión se persiste automáticamente por el cliente Supabase (SecureStore en native vía `supabase-secure-storage.ts`).
- El refresh token rotativo se almacena también en SecureStore como `auth.biometric.credentials` para el flujo biométrico; se actualiza tras cada `auth.refreshSession` exitoso.

### PIN de acceso (4 dígitos) ✅ LIVE (2026-05-28)

Método de bloqueo **independiente** de la biometría. El usuario puede tener biometría, PIN, ambos o ninguno. La app se bloquea en cold-start (sesión válida) si hay **cualquiera** de los dos.

- **Storage** ([pin-lock.ts](../../../mobile/lib/pin-lock.ts)): SHA-256 salteado (`js-sha256`, pure-JS, sin módulo nativo — Hermes no tiene `crypto.subtle` y `expo-standard-web-crypto` ya crasheó una vez) en SecureStore `WHEN_UNLOCKED_THIS_DEVICE_ONLY` + flag espejo en AsyncStorage (`app-lock.pin.enabled`, [pin-enabled-flag.ts](../../../mobile/features/auth/pin-enabled-flag.ts)) como tie-breaker contra lecturas flaky del keychain. API: `setPin`, `verifyPin`, `clearPin`, `getPinLockState(): { isSet }`.
- **Threat model:** lock *casual* (alguien levanta el teléfono desbloqueado), no defensa criptográfica — el secreto real (refresh token) ya vive en el keychain. El hash solo evita guardar el PIN en claro; el salt evita reuso de rainbow tables entre dispositivos.
- **Cold-start probe** ([use-pin-lock-check.ts](../../../mobile/features/auth/use-pin-lock-check.ts)): espejo de `useColdStartBiometricCheck`, keyed por session user; reporta `loading` durante el re-sondeo para que el gate no rutee con un `isSet` stale.
- **Gate** ([app-entry-gate.tsx](../../../mobile/components/root/app-entry-gate.tsx)): `(biometric.shouldUseBiometric || pin.isSet) && !isAppUnlocked` → biometría tiene precedencia (ruta al login lock, con botón "Usar PIN"); solo-PIN ruta a `/(auth)/pin-unlock`. El PIN solo desbloquea una sesión ya válida, nunca la restaura.
- **UI:** `PinPad` (4 dots + keypad circular, shake en error — [pin-pad.tsx](../../../mobile/components/auth/pin-pad.tsx), lógica pura testeada en [pin-pad-model.ts](../../../mobile/components/auth/pin-pad-model.ts)); `pin-setup` (enter + confirm); `pin-unlock` (lock screen, escape "Olvidé mi PIN · usar contraseña" → logout, sin límite de intentos).
  - **Copy `pin-setup`:** fase `enter` → título "Crea tu PIN", subtítulo "Elige un PIN de 4 dígitos para entrar a la app."; fase `confirm` → título "Confirma tu PIN", subtítulo "Ingrésalo de nuevo para confirmar.". Botón secundario "Cancelar".
  - **Copy `pin-unlock`:** título "Ingresa tu PIN" (con FernLogo 64px como header). Escape "Olvidé mi PIN · usar contraseña" → `logoutSession` → `/(auth)/welcome`.
- **Alta:** biometric-setup ofrece "Usar un PIN" (modo A) / "Crear un PIN" (modo B) → `pin-setup?next=onboarding`.
- **Settings:** fila "PIN de acceso" en el grupo "Acceso rápido" (set / cambiar / quitar vía Alert).
- **Recovery:** logout limpia el PIN ([logout.ts](../../../mobile/features/auth/logout.ts) → `clearPin()`), porque es device-local. "Olvidé mi PIN" → logout → re-login con contraseña → setear uno nuevo.

---

## 2. Screens

### Tabla de rutas → screen → propósito

| Ruta (expo-router) | Archivo de ruta | Screen | Propósito |
|---|---|---|---|
| `/(auth)/welcome` | [welcome.tsx](../../../app/(auth)/welcome.tsx) | [welcome-screen.tsx](../../../mobile/screens/auth/welcome-screen.tsx) | Primera pantalla de usuario no autenticado. CTAs "Empezar" / "Ya tengo cuenta". |
| `/(auth)/login` | [login.tsx](../../../app/(auth)/login.tsx) | [login-screen.tsx](../../../mobile/screens/auth/login-screen.tsx) | Login Face ID-first, password fallback, Apple Sign-In. También app-lock (`?lock=1`). |
| `/(auth)/signup` | [signup.tsx](../../../app/(auth)/signup.tsx) | [signup-screen.tsx](../../../mobile/screens/auth/signup-screen.tsx) | Registro: nombre + email + password + Apple + Google. |
| `/(auth)/join` | [join.tsx](../../../app/(auth)/join.tsx) | [join-screen.tsx](../../../mobile/screens/auth/join-screen.tsx) | Crear o unirse a grupo familiar (path alternativo a onboarding). |
| `/(auth)/forgot-password` | [forgot-password.tsx](../../../app/(auth)/forgot-password.tsx) | [forgot-password-screen.tsx](../../../mobile/screens/auth/forgot-password-screen.tsx) | Solicita email y envía link de reset. |
| `app/auth/callback` | [callback.tsx](../../../app/auth/callback.tsx) | [auth-callback-screen.tsx](../../../mobile/screens/auth/auth-callback-screen.tsx) | Intercepta deep link de confirmación de email (PKCE). |
| `app/auth/reset-password` | [reset-password.tsx](../../../app/auth/reset-password.tsx) | [reset-password-screen.tsx](../../../mobile/screens/auth/reset-password-screen.tsx) | Recibe `?code=` del link de reset, intercambia PKCE, formulario nueva contraseña. |
| `/(app)/biometric-setup` 🆕 | [biometric-setup.tsx](../../../app/(app)/biometric-setup.tsx) | [biometric-setup-screen.tsx](../../../mobile/screens/auth/biometric-setup-screen.tsx) | Gate pre-onboarding para activar Face ID (modo A) o informar que no hay biometría enrolada (modo B). Ambos modos ofrecen "Usar/Crear un PIN" → `pin-setup?next=onboarding`. 2026-05-27. |
| `/(app)/pin-setup` 🆕 | [pin-setup.tsx](../../../app/(app)/pin-setup.tsx) | [pin-setup-screen.tsx](../../../mobile/screens/auth/pin-setup-screen.tsx) | Seteo de PIN de 4 dígitos (enter + confirm). Honra `?next=onboarding` (alta) si no, vuelve atrás (Settings). 2026-05-28. |
| `/(auth)/pin-unlock` 🆕 | [pin-unlock.tsx](../../../app/(auth)/pin-unlock.tsx) | [pin-unlock-screen.tsx](../../../mobile/screens/auth/pin-unlock-screen.tsx) | Lock screen dedicada por PIN (cold-start solo-PIN, o "Usar PIN" desde el login lock). Escape "Olvidé mi PIN" → logout. `gestureEnabled: false`. 2026-05-28. |
| `/(app)/onboarding` | [onboarding.tsx](../../../app/(app)/onboarding.tsx) | [onboarding-screen.tsx](../../../mobile/screens/home/onboarding-screen.tsx) | Wizard de 5 pasos post-signup. |
| `/(app)/household-setup` | [household-setup.tsx](../../../app/(app)/household-setup.tsx) | [household-setup-screen.tsx](../../../mobile/screens/settings/household-setup-screen.tsx) | Re-configuración del hogar (desde Settings). |

> **Layout del stack auth:** [`app/(auth)/_layout.tsx`](../../../app/(auth)/_layout.tsx) — `Stack` con `animation: 'fade'`, `animationDuration: 240`, `headerShown: false`, `freezeOnBlur: true`. `contentStyle.backgroundColor` = canvas del tema para eliminar flash blanco entre transiciones en dark mode.

---

### Narrativa por screen

#### `welcome-screen.tsx` — Welcome
- **Fondo:** verde oscuro (`authTokens.welcomeBg`) con 2 blobs aurora (sin JS, animación independiente) + 8 partículas flotantes (loops sin/coseno, 10–14s).
- **Hero:** `FernLogo` 220px → wordmark "Manifiesto." (punto en peach) → tagline "Finanzas para tu familia". Stagger `RiseView` en 1100/1300/1500ms.
- **CTAs:** "Empezar" (cream sobre verde, flecha) → `onCreate()` → `push('/(auth)/signup')`. "Ya tengo cuenta" (outline) → `onLogin()` → `push('/(auth)/login')`.
- **Footer:** disclosure de privacidad + links a Términos y Privacidad (via `Linking.openURL`).
- **Efecto en mount:** llama `markAuthTransitionLoaded()` para destrabar el splash overlay si venía de un logout.
- **Animaciones deshabilitadas** bajo `useReducedMotion`.

#### `login-screen.tsx` — Login (Face ID-first)
- **Modos de presentación:**
  - **Returning user** (biometric guardado O caché de perfil previo): muestra hero personalizado con avatar animal + nombre/email. Botón principal: "Entrar con Face ID" con animación de scan pulsante. Secundarios: "Usar contraseña" y "Cambiar cuenta".
  - **First-time** (sin sesión previa en dispositivo): hero genérico "Hola de vuelta" con Fern logo. Directamente abre `formMode='change-account'`.
  - **App-lock** (`?lock=1`): mismo hero returning, pero Face ID solo llama `authenticateBiometricAccess` + `markAppUnlocked` + `router.replace('/')` sin Supabase refresh.
  - **Auto-biometric** (`?autoBiometric=1`): dispara `triggerFaceID()` automáticamente al montar (una sola vez, guarda con `autoBiometricFiredRef`).
- **Qué bloque de acción se muestra:** decidido por el helper puro `resolveLoginActionView({ formMode, isLockMode, hasSavedBiometric, isReturningUser })` ([login-action-view.ts](../../../mobile/features/auth/login-action-view.ts), testeado). **Invariante de lock mode:** en `?lock=1` el CTA "Entrar con Face ID" se muestra SIEMPRE (no condicionado al re-sondeo `hasSavedBiometric`), porque AppEntryGate solo entra a lock mode si la biometría está habilitada. Esto corrige un bug donde, al cancelar el Face ID con sesión válida, el re-sondeo async podía dar `false` y esconder el CTA dejando solo "Usar contraseña"/"Cambiar cuenta" (sin sentido para un usuario ya logueado). El auto-fire en lock mode tampoco espera al re-sondeo.
- **Formulario password:** dos sub-modos:
  - `use-password`: solo campo contraseña (email pre-rellenado desde cache). Incluye "¿Olvidaste tu contraseña?" → `push('/(auth)/forgot-password')`.
  - `change-account`: email + contraseña.
- **Apple Sign-In:** disponible en iOS. Botón "Continuar con Apple" (separador "O" si `withDivider`). Sesión detectada por `AppEntryGate` vía listener, no requiere navegación manual.
- **Guards:** `RequireGuest allowFamilylessSession` (salvo en lock mode).
- **Caché last user:** lee `getLastUserProfile()` de SecureStore al montar para mostrar nombre y avatar sin red.
- **Saludos:** `pickReturningGreeting()` — pool de 47 frases neutras + 3-5 time-aware (mañana/tarde/noche), seleccionado aleatoriamente una vez por mount.
- **Teclado:** `scrollRef.scrollToEnd` cuando `keyboardDidShow` en formMode activo.

#### `signup-screen.tsx` — Signup
- **Campos:** Nombre (>1 char), Email (valida `@`), Contraseña (mín 6 chars + strength meter 3 barras: Débil/Buena/Excelente).
- **Validaciones client-side:** nombre ≥2, email con `@`, password ≥6. Errores vía `setErrorMessage`.
- **Email normalizado:** `normalizeEmail()` = trim + lowercase.
- **Supabase call:** `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { display_name } } })`.
- **Resolución:**
  - `hasSession=true` → `showAuthTransitionSplash()` → `router.replace('/(app)/biometric-setup')` (gate pre-onboarding; ver sección "Pre-onboarding biometric setup" abajo).
  - `hasSession=false` → panel "Revisá tu mail" con email enmascarado (`jo***@gmail.com`), botón "Reenviar email" con cooldown 60s (timer visible), botón "Cambiar email".
- **Reenvío:** `supabase.auth.resend({ type: 'signup', email })` via `useResendSignupEmail`.
- **Apple:** `isAppleSignInAvailable()` → botón negro "Continuar con Apple". Si no disponible, `Alert`.
- **Google:** `isGoogleSignInConfigured()` (requiere `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + módulo nativo). Botón con "G" oficial.
- **Social result:** `signed-in` → `router.replace('/(app)/biometric-setup')`. `cancelled` → silencioso. `unavailable` → `setErrorMessage`.
- **Guard:** `RequireGuest allowFamilylessSession`.
- **Fineprint:** links a Términos y Privacidad.

#### `join-screen.tsx` — Join Family (path alternativo)
- **Audiencia:** usuarios con sesión pero sin familia (redirect desde `RequireAuth` cuando `!familyId`).
- **UI:** `SegmentedControl` Crear/Unirme + 2 `ChoiceCard` visuales.
- **Modo Crear:** botón "Crear grupo familiar" → `controller.actions.createFamily()` (via `useJoinController` de `features/family/`).
- **Modo Unirse:** campo código (máx 8 chars, `autoCapitalize: "characters"`) → `controller.actions.joinWithCode()`. Placeholder "Ej: A9KD3L".
- **Guard:** `RequireGuest allowFamilylessSession`.
- **Nota:** este screen es un path legacy/de recuperación. El flujo normal de nuevos usuarios pasa por el wizard en `/(app)/onboarding` (step 3 cubre la decisión de familia).

#### `forgot-password-screen.tsx` — Forgot Password
- **Campos:** email único.
- **Submit:** `normalizeEmail` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: getPasswordResetRedirectTo() })` via `usePasswordReset`.
- **RedirectTo:** `Linking.createURL('auth/reset-password')` → deep link `manifiesto://auth/reset-password`.
- **Estado post-envío:** pantalla "Revisá tu mail" con email destino + CTA "Volver a login".
- **Validación:** solo verifica que el string tenga `@`. Supabase no revela si el email existe.
- **Guard:** `RequireGuest allowFamilylessSession`.

#### `reset-password-screen.tsx` — Reset Password
- **Recibe:** `?code=` de URL (deep link desde email de Supabase).
- **Stages:** `'exchanging'` → `'form'` → `'success'` / `'error'` / `'timeout'`.
- **Exchange:** `supabase.auth.exchangeCodeForSession(code)` via `useCompleteAuthCallback`. Timeout de 30s (`RESET_TIMEOUT_MS`).
- **Formulario nueva contraseña:** dos campos (nueva + confirmar), mín 6 chars, deben coincidir. CTA deshabilitado hasta `passwordValid`.
- **Submit:** `supabase.auth.updateUser({ password })` via `useUpdatePassword`.
- **Éxito:** stage `'success'` → "Contraseña actualizada" → "Ir al inicio" → `router.replace('/')`.
- **Error (link vencido/consumido):** CTA "Pedir nuevo link" → `router.replace('/(auth)/forgot-password')`.
- **Timeout:** pantalla especial con retry + fallback a forgot-password.

#### `auth-callback-screen.tsx` — Auth Callback
- **Recibe:** `?code=` del deep link `manifiesto://auth/callback` (confirmación de email post-signup).
- **PKCE-only:** solo acepta `code`. NO acepta `access_token`/`refresh_token` en query params (vector de session fixation cerrado).
- **Exchange:** `supabase.auth.exchangeCodeForSession(code)` → sesión activa → `router.replace('/')`.
- **Timeout:** 30s (`AUTH_CALLBACK_TIMEOUT_MS`). Muestra "Reintentar" + "Volver a login".
- **Retry:** botón incrementa `retryToken` → re-corre el `useEffect` de exchange.
- **Montada en:** `app/auth/callback.tsx` (fuera del stack `(auth)`, ruta propia).

#### Guards — `RequireGuest` y `RequireAuth`

**`RequireGuest`** ([guards.tsx](../../../mobile/components/guards.tsx)) redirige a TODO usuario con sesión activa a `/` (AppEntryGate). No decide destino propio — eso lo hace AppEntryGate como única fuente de verdad. Esto cierra un bypass del app-lock que permitía: cancelar Face ID → volver a welcome → "Ya tengo cuenta" → llegar a Home sin autenticar (el redirect directo a `/(app)/(tabs)/home` saltaba el gate). El prop `allowFamilylessSession` se mantiene por back-compat pero es no-op: la decisión de routing pasa íntegramente a AppEntryGate.

**`RequireAuth`** — protege rutas que requieren sesión activa + familia. Si no hay sesión, redirige a `/`; si no hay `familyId`, redirige a `/(auth)/join`.

---

## 3. Métodos de autenticación

### Email/Password ✅ LIVE

| Operación | Función Supabase | Archivo |
|---|---|---|
| Sign in | `supabase.auth.signInWithPassword({ email, password })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Sign up | `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { display_name } } })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Reenvío signup | `supabase.auth.resend({ type: 'signup', email })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Reset password | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Update password | `supabase.auth.updateUser({ password })` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |
| Exchange code | `supabase.auth.exchangeCodeForSession(code)` | [use-auth-actions.ts](../../../mobile/features/auth/use-auth-actions.ts) |

**Normalización:** `normalizeEmail()` = `rawEmail.trim().toLowerCase()`.

**Validaciones client-side:**
- Email: debe incluir `@`.
- Password (signup): mínimo 6 chars.
- Nombre (signup): mínimo 2 chars.
- Password (reset): mínimo 6 chars + confirmación debe coincidir.

### Apple Sign-In 🟡 PARCIAL

- **Librería:** `expo-apple-authentication` (`AppleAuthentication.signInAsync`).
- **Scopes solicitados:** `FULL_NAME` + `EMAIL`.
- **Flujo:** `credential.identityToken` → `supabase.auth.signInWithIdToken({ provider: 'apple', token })`.
- **Nombre:** Apple solo entrega `fullName` en el primer sign-in. Se parchea vía `supabase.auth.updateUser({ data: { display_name: fullName } })`.
- **Disponibilidad:** `Platform.OS === 'ios'` + `AppleAuthentication.isAvailableAsync()`. En Android siempre muestra el botón pero da `Alert` al pulsar.
- **Resultado:** `{ status: 'signed-in' | 'cancelled' | 'unavailable', error? }`.
- **Configuración requerida:** Supabase Dashboard → Apple provider (Service ID, Team ID, Key ID, .p8 key) + Apple Developer Portal → "Sign In with Apple" habilitado para `com.manifiesto.mobile`. Requiere build de desarrollo/producción (NO funciona en Expo Go por entitlement nativo).
- **Estado:** El código está completo y correcto. ⛔ BLOQUEADO si no hay Apple Developer Program activo o Supabase no tiene el provider configurado.

### Google Sign-In 🟡 PARCIAL

- **Librería:** `@react-native-google-signin/google-signin` (lazy-loaded para evitar crash en Expo Go).
- **Flujo:** `GoogleSignin.signIn()` → `idToken` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`.
- **Configuración:** `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (requerido) + `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (opcional para iOS nativo).
- **`isGoogleSignInConfigured()`:** retorna `false` si no hay `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` o si el módulo nativo no está disponible (Expo Go).
- **Android API 29:** downgrade a `biometricsSecurityLevel: 'weak'` para compatibilidad con `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`.
- **Estado:** código listo. ⛔ BLOQUEADO por falta de env vars en builds actuales (muestra Alert en desarrollo).

### Biometría (Face ID / Touch ID / Huella) ✅ LIVE

Implementado en [`biometric-auth.ts`](../../../mobile/lib/biometric-auth.ts) con `expo-local-authentication` + `expo-secure-store`.

**Diseño de seguridad:** NO guarda la contraseña. Guarda el **refresh token** de Supabase en SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no viaja en iCloud/iTunes). El refresh se rota tras cada sesión biométrica exitosa (`updateStoredRefreshToken`).

**Almacenamiento:**
- `auth.biometric.credentials` → `{ email, refreshToken }` (SecureStore).
- `auth.biometric.metadata` → `{ email }` (SecureStore, legible sin el token completo para mostrar el hero personalizado).

**`getBiometricLoginState()`:** consulta en paralelo `SecureStore.isAvailableAsync()`, `LocalAuthentication.hasHardwareAsync()`, `LocalAuthentication.isEnrolledAsync()`, `supportedAuthenticationTypesAsync()` + metadata. Usa **`Promise.allSettled`** (no `Promise.all` + catch único): un read que falla de forma transitoria degrada solo esa señal en vez de colapsar todo a `false` — clave para que un hipo de SecureStore no flipee `hasSavedCredentials`/`isAvailable` y esconda el CTA en la pantalla de bloqueo. Cubierto por `tests/unit/biometric-login-state.test.ts`.

Adicionalmente, `getBiometricLoginState` consulta una flag persistente en AsyncStorage ([`biometric-enabled-flag.ts`](../../../mobile/features/auth/biometric-enabled-flag.ts)) que se setea/borra en lock-step con las credenciales del Keychain. `hasSavedCredentials = Boolean(metadata) || flagIsSet` — si el read del Keychain falla transientemente, la flag impide que `hasSavedCredentials` colapse a `false` y bypassee el gate de app-lock en cold start.

**Labels auto-detectados:**
- `FACIAL_RECOGNITION` → "Face ID" (iOS) / "reconocimiento facial" (Android).
- `FINGERPRINT` → "Touch ID" (iOS) / "huella digital" (Android).
- `IRIS` → "iris".

**Flujo de sign-in biométrico:**
1. `authenticateBiometricAccess()` (prompt nativo).
2. Si OK → `showAuthTransitionSplash()` optimista + haptic success.
3. `getBiometricCredentials()` → `supabase.auth.refreshSession({ refresh_token })`.
4. Token rotado → `updateStoredRefreshToken(newRefreshToken)`.
5. `onSignedIn()` → `markAppUnlocked()` + `router.replace('/')`.

**Degradación:** si el refresh token expiró (default Supabase: 30d), NO borra las credenciales. Muestra error "Tu sesión expiró. Ingresá con tu contraseña una vez para reactivar Face ID." La próxima sign-in manual con password sobreescribe el token automáticamente.

**Setup automático:** tras un sign-in manual exitoso, `persistBiometricCredentials` pregunta si habilitar biometría (`authenticateBiometricAccess({ promptMessage: "Activa Face ID para entrar más rápido" })`).

**App-lock:** módulo [`app-lock-state.ts`](../../../mobile/features/auth/app-lock-state.ts) — store module-level en memoria (resets en cold start). `markAppUnlocked()` / `resetAppLock()` / `useAppLockState()`. **Re-lock por background:** [`background-relock-watcher.tsx`](../../../mobile/components/root/background-relock-watcher.tsx) (montado en RootLayoutShell) re-arma el lock vía `resetAppLock()` + `router.replace('/')` si la app estuvo > 60s en background (helper puro `shouldRelock` en [`background-relock.ts`](../../../mobile/features/auth/background-relock.ts)). El gate de app-lock usa `disableDeviceFallback: true` (solo biometría; el escape es "Usar contraseña", que re-autentica con la contraseña de la cuenta). Copy de lockout diferenciada vía `biometricFeedbackForError` ([`biometric-feedback.ts`](../../../mobile/features/auth/biometric-feedback.ts)). El status local del login es `'idle' | 'scanning'` (el estado `'authed'` se eliminó: el transition splash ya cubre el éxito).

**Expo Go soft override:** [`biometric-auth.ts`](../../../mobile/lib/biometric-auth.ts) fuerza `disableDeviceFallback: false` cuando `Constants.executionEnvironment === 'storeClient'` (Expo Go). El SDK 54 de Expo Go carece de `NSFaceIDUsageDescription` en su host binary; las llamadas biométricas estrictas fallan con `missing_usage_description`. Con el override, el prompt de passcode del dispositivo cubre el flujo end-to-end en Expo Go. En dev client, EAS o store builds, el valor del caller se respeta sin cambios.

**Auto-sign-in:** `useAuthBiometricAutoSignIn` está **deshabilitado** (no-op). Face ID solo se dispara al tocar el botón explícito o via `?autoBiometric=1`.

---

## 4. Onboarding y Household Setup

### Pre-onboarding biometric setup ✅ LIVE (2026-05-27)

**Ruta:** `/(app)/biometric-setup` → `BiometricSetupScreen` ([biometric-setup-screen.tsx](../../../mobile/screens/auth/biometric-setup-screen.tsx)).

**Propósito:** toda cuenta nueva pasa por esta pantalla **antes** del wizard de onboarding para tomar una decisión consciente sobre Face ID. Sin este step, la activación quedaba escondida en Settings → Seguridad (alto drop-off) y el primer cold-start post-onboarding no tenía App Lock.

**Dos modos** (decididos al montar leyendo `getBiometricLoginState()`):
- **Modo A** — `isAvailable=true`. Hero icon `scan-circle-outline`, título "Activá Face ID" (label dinámico), body "Entrá más rápido y con más seguridad.", CTA primario `Activar Face ID` + ghost `Ahora no`.
  - **Activar** → `activateBiometricForSession(email)` ([activate-biometric-for-session.ts](../../../mobile/features/auth/activate-biometric-for-session.ts)) dispara el prompt nativo y guarda el refresh token en Keychain vía `saveBiometricCredentials`. Avanza al wizard sin importar el resultado.
  - **Ahora no** → solo marca el flag y avanza.
- **Modo B** — `isAvailable=false` (device sin biometría enrolada). Hero icon `lock-closed-outline`, título "Activalo cuando quieras", body "Tu dispositivo no tiene Face ID configurado. Podés activarlo más adelante desde Ajustes → Seguridad.", CTA único `Continuar`.

**Gating:** la decisión "mostrar/no mostrar" vive en la pure fn `shouldShowBiometricSetup({ sessionUserId, onboardingCompletedAt, biometricSetupShown, biometricSetupFlagLoaded })` ([should-show-biometric-setup.ts](../../../mobile/features/auth/should-show-biometric-setup.ts)) y se ejecuta dentro de `AppEntryGate` ANTES del redirect a `/(app)/onboarding`. Retorna true cuando hay sesión + onboarding incompleto + flag false + flag-loaded true.

**Flag:** `biometric-setup-shown:<userId>` en SecureStore vía `mobile/lib/persistent-kv.ts` (mismo patrón que `tour-seen.*` y `tours-backfill-done`). API en [biometric-setup-flag.ts](../../../mobile/features/auth/biometric-setup-flag.ts):
- `getBiometricSetupShown(userId)` / `markBiometricSetupShown(userId)` / `clearBiometricSetupShown(userId)`
- Empty userId → no-op (defensivo)
- Se marca cuando el usuario interactúa con cualquier CTA (Activar éxito, Activar fail, Ahora no, Continuar)
- Se limpia en `logoutSession` ([logout.ts](../../../mobile/features/auth/logout.ts)) → `userId` capturado **antes** de `supabase.auth.signOut()` para namespacing correcto

**Cobertura de flujos:**
- Email+password signup → redirect directo (`signup-screen.tsx` línea ~215)
- Apple/Google signup → redirect directo (`signup-screen.tsx` línea ~256)
- Magic link confirm → vuelve a la app con sesión; AppEntryGate intercepta vía cold-start
- Hot-restart durante setup → cold-start → AppEntryGate vuelve a routear ahí
- Logout mid-setup → flag limpiado → siguiente login → vuelve a aparecer
- Returners con `onboarding_completed_at` → JAMÁS lo ven (regla `!onboardingCompletedAt`)
- Reinstalación → flag inexistente → vuelve a aparecer (device-specific, deseado)

**Tests:** unit tests para `biometric-setup-flag` (6 casos: get/mark/clear/aislamiento/empty-userId guards) y `should-show-biometric-setup` (8 combinaciones de inputs). El activate helper es I/O-pesado y se cubre con smoke manual.

**No hay back gesture** en la stack screen (`gestureEnabled: false, fullScreenGestureEnabled: false` en `app-stack-shell.tsx`), igual que `onboarding` y `onboarding-success`.

---

### Onboarding — Wizard 5 pasos

**Ruta:** `/(app)/onboarding` → `OnboardingRoute` → `OnboardingScreen`.

**Guard en la ruta:** si `profileQuery.data?.onboarding_completed_at` existe → redirect a `/(app)/(tabs)/home`.

**Estado:** `useOnboardingState` — `useReducer` con `OnboardingDraft`. La navegación entre pasos es completamente local, sin escribir a la DB hasta el paso 5 (excepto display_name en paso 1 y avatar en paso 2, que se envían en background optimistamente).

#### Paso 1 — Nombre (`StepWelcome`)
- Campo: nombre de perfil. Validación: `trimmedName.length >= 2`.
- Hidrata desde `profileQuery.data.display_name` si existe (una sola vez).
- Detecta re-entrada: `profile.previously_onboarded === true` → copy "Bienvenida de vuelta". `family_closed_by_owner_at` → copy suave "tu hogar fue cerrado".
- Al avanzar: `updateDisplayName.mutate(trimmedName)` en background (fire-and-forget).

#### Paso 2 — Avatar (`StepAvatar`)
- Título "Elige tu avatar", subtítulo "Lo vas a ver en tu perfil y en la actividad de la familia.".
- **Hero card:** muestra el avatar seleccionado en tamaño 120px con su nombre (`AVATAR_LABELS[selected]`). Cambia con animación `FadeIn` (220ms, `key` por slug) cada vez que se elige uno nuevo.
- **Grid:** `ScrollView` horizontal con `flexWrap: 'wrap'` en columnas — 3 filas fijas de celdas 64x64px, el contenido crece en horizontal y el usuario desliza para recorrer los 42 avatares. Header "TODOS LOS AVATARES · N opciones". Celda seleccionada invierte colores (fondo `theme.colors.text`, icono `theme.colors.creamCard`).
- `canContinue = true` siempre.
- Al avanzar: `updateAvatar.mutate(state.avatarSlug)` en background.

#### Paso 3 — Familia (`StepFamily`)
- Dos sub-modos:
  - **Crear:** llama a RPC de bootstrap → devuelve `familyId`. `canContinue = familyMode === 'created' && !!familyId`.
  - **Unirse:** campo código → `peek_family_by_code` RPC (sin insertar membresía todavía). Resultado en `state.pendingFamily`. `canContinue = !!state.pendingFamily`.
- No auto-avanza si ya existe `family_members` row (por diseño — evita silenciar la elección).

#### Paso 4 — Ingresos

**Branch por `state.familyMode`:**

- **Creador (`StepIncome`):** `InAppNumpad` para ingreso mensual + picker día de cobro (1–31). `canContinue = monthlyIncome > 0 && salaryPaymentDay >= 1 && salaryPaymentDay <= 31`.
- **Joiner (`StepIncomeContribution`):** toggle "¿Aportas ingreso al hogar?" Si sí: `InAppNumpad` para monto. `canContinue`: si `contributesIncome === null` → false; si true → `monthlyIncome > 0`; si false → true.

#### Paso 5 — Ahorro / Resumen

- **Creador (`StepSavings`):** slider porcentaje de ahorro (default 20%) + toggle "¿Crear primera meta?" Si sí: nombre de meta + monto (numpad) + meses (default 6).
- **Joiner (`StepFamilySummary`):** muestra snapshot del hogar (`pendingFamily`), nombre y avatar del usuario que se une, contribución elegida.

#### Finish (`handleFinish`)

- **Path creador:**
  1. `upsertFamilyFinance` (income, salaryPaymentDay, savingsGoalPercent, `lastSalaryConfirmedAt = now()`, etc.).
  2. Si `createFirstGoal` → `upsertSavingsGoal`.
  3. `completeOnboarding.mutateAsync()` → `profiles.update({ onboarding_completed_at: now() })`.
  4. `showAuthTransitionSplash()` → `router.replace('/(app)/(tabs)/home')`.

- **Path joiner:**
  1. `consumeInvite.mutateAsync({ code, monthlyIncomeContribution })` → RPC `consume_family_invite` (inserta membresía + marca invite usada).
  2. `completeOnboarding.mutateAsync()`.
  3. `showAuthTransitionSplash()` → `router.replace('/(app)/(tabs)/home')`.

- **Back en step 1:** Alert con opciones "Seguir aquí" (cancel) / "Cerrar sesión" (destructivo → `logoutSession` → welcome).

**Success screen post-wizard** ([`onboarding-success-screen.tsx`](../../../mobile/screens/home/onboarding-success-screen.tsx), ruta [`/(app)/onboarding-success`](../../../app/(app)/onboarding-success.tsx)): pantalla intermedia entre el step 5 del wizard y Home. Muestra avatar + saludo personalizado por modo (solo vs familia, derivado vía [`onboardingSuccessCopy`](../../../mobile/features/onboarding/success-copy.ts)) + CTA "Empezar" tap-to-continue. `useCompleteOnboarding` ahora hace `setQueryData` síncrono sobre el profile cache antes de invalidar, así `RequireAuth` ve `onboarding_completed_at` set y no bouncea a la ruta de wizard.

**Auto-fire de tours** ([`useScreenTour`](../../../mobile/features/tours/use-screen-tour.ts)): ya cableado en `home-dashboard.tsx`, `gastos-v2-screen.tsx`, `fijos-v2-screen.tsx`, `control-v2-screen.tsx`. Primera visita a cada screen fira el tour respectivo (gated por `getToursEnabled` + `getTourSeen` + splash hidden). Marca `seen` on stop. **Backfill para usuarios existentes:** [`use-backfill-existing-user.ts`](../../../mobile/features/tours/use-backfill-existing-user.ts), invocado en `AppEntryGate`, marca los 4 tours como seen para cualquier usuario cuyo `onboarding_completed_at` sea anterior a `TOURS_FEATURE_DEPLOYED_AT` (constante en [`backfill-config.ts`](../../../mobile/features/tours/backfill-config.ts)). Idempotente vía flag persistente `tours-backfill-done`.

**Hero del Home** ([`home-hero-card.tsx`](../../../mobile/components/home/home-hero-card.tsx)): recibe `heroMode` ({kind, memberCount, familyName, userFirstName}) y usa [`familyModeHeroCopy`](../../../mobile/features/family/family-mode-copy.ts) para resolver eyebrow + título contextual al modo (`'Tu espacio personal'` + nombre del usuario en solo, `'Tu familia'` + nombre o `N miembros` en shared).

**CTA de saldo inicial** ([`starting-balance-cta.tsx`](../../../mobile/components/home/starting-balance-cta.tsx)): card destacada con pulse sutil + `TourTarget`. `home-dashboard.tsx` la renderiza cuando `isOnboardingFlow && !onboardingSkippedViaExpense && monthlyIncome > 0`. Tap → abre el cycle balance sheet existente (`setCycleBalanceSheetOpen(true)`).

---

### Household Setup (`/(app)/household-setup`) ✅ LIVE

[`household-setup-screen.tsx`](../../../mobile/screens/settings/household-setup-screen.tsx) — Wizard de 3 pasos accesible desde Settings para **re-configurar** la distribución de ahorro del hogar.

- **Guard:** `RequireAuth` (necesita sesión + familyId).
- **Datos iniciales:** carga `useFamilyFinance(familyId)` → `FamilyFinanceInputSnapshot`.
- **Pasos:** distribución de gastos esenciales/variables/ahorro (presets + research panel con estadísticas).
- **Submit:** `useUpsertFamilyFinance` → `family_finance` upsert.
- **`TOTAL_STEPS = 3`** (constante en la screen).

---

## 5. features/auth + components/auth

### Inventario features/auth

| Archivo | Propósito |
|---|---|
| [`app-lock-state.ts`](../../../mobile/features/auth/app-lock-state.ts) | Store module-level (useSyncExternalStore) para el gate de re-confirmación biométrica por cold start. `markAppUnlocked` / `resetAppLock` / `useAppLockState`. |
| [`auth-biometric-state.ts`](../../../mobile/features/auth/auth-biometric-state.ts) | `buildInitialBiometricState()` — estado sincrono inicial antes de la consulta async. |
| [`biometric-enabled-flag.ts`](../../../mobile/features/auth/biometric-enabled-flag.ts) | Flag persistente en AsyncStorage que refleja "biometría habilitada para este usuario". Se setea en `saveBiometricCredentials` y se borra en `clearBiometricCredentials`, en lock-step con el Keychain. Actúa como tie-breaker en `getBiometricLoginState`: un read transitoriamente fallido de SecureStore no colapsa `hasSavedCredentials` a `false`. |
| [`biometric-feedback.ts`](../../../mobile/features/auth/biometric-feedback.ts) | `biometricFeedbackForError(code, label)` — mapea códigos de error biométrico a copy de usuario. Cubre: `lockout`/`lockout_permanent` → "{label} está bloqueado por varios intentos. Usá tu contraseña para entrar."; `not_available`/`not_enrolled`/`passcode_not_set` → "{label} no está disponible. Revisá Ajustes → Manifiesto → Face ID o usá tu contraseña."; `user_cancel`/`system_cancel`/`app_cancel`/`user_fallback` → null (silencioso); cualquier otro → catch-all genérico. No más silencio total ante fallos no manejados. |
| [`auth-flow.ts`](../../../mobile/features/auth/auth-flow.ts) | Helpers de normalización, validación, copy de la UI y construcción de redirect URLs. Contiene `normalizeEmail`, `validateAuthSubmission`, `buildAuthHelperCopy`, `getEmailRedirectTo`, `getPasswordResetRedirectTo`. |
| [`auth-layout.ts`](../../../mobile/features/auth/auth-layout.ts) | `buildAuthViewportMetrics` (métricas de layout responsive según alto/ancho de pantalla) + `computeAuthKeyboardShiftTarget` (target de shift del teclado por campo focalizado). |
| [`auth-submit-flow.ts`](../../../mobile/features/auth/auth-submit-flow.ts) | `resolveAuthSubmitResolution` — decide entre `signed-in`, `onboarding`, `email-confirmation` según modo (sign-in/sign-up) y si hay sesión. |
| [`logout.ts`](../../../mobile/features/auth/logout.ts) | `logoutSession` — llama `supabase.auth.signOut()` → awaita explícitamente `clearBiometricCredentials()` + `clearLastUserProfile()` antes de `onSuccess()` → `resetAppLock()`. El cleanup atómico cierra una race donde el login screen podía montar antes de que el delete de SecureStore terminara y mostrar el avatar/nombre del usuario anterior. Imports dinámicos para code-splitting. |
| [`social-sign-in.ts`](../../../mobile/features/auth/social-sign-in.ts) | `signInWithApple` (expo-apple-authentication) + `signInWithGoogle` (lazy require para evitar crash en Expo Go). Ambas conectan via `supabase.auth.signInWithIdToken`. |
| [`use-auth-actions.ts`](../../../mobile/features/auth/use-auth-actions.ts) | Mutations TanStack Query: `usePasswordSignIn`, `usePasswordSignUp`, `useResendSignupEmail`, `usePasswordReset`, `useUpdatePassword`, `useCompleteAuthCallback`. |
| [`use-auth-biometric-auto-sign-in.ts`](../../../mobile/features/auth/use-auth-biometric-auto-sign-in.ts) | Hook **deshabilitado** (no-op). El auto-fire en mount causaba prompts duplicados. Preservado para back-compat de firma. |
| [`use-auth-biometric-controller.ts`](../../../mobile/features/auth/use-auth-biometric-controller.ts) | Orquesta el flujo biométrico completo: `handleBiometricSignIn` (prompt → refresh → rotate token → onSignedIn), `persistBiometricCredentials` (post sign-in manual), `refreshBiometricState`. |
| [`use-auth-keyboard-controller.ts`](../../../mobile/features/auth/use-auth-keyboard-controller.ts) | Escucha `keyboardWillShow/Hide` y gestiona refs a inputs. Calcula `keyboardShiftTarget` via `computeAuthKeyboardShiftTarget`. Devuelve `emailInputRef`, `passwordInputRef`, `nameInputRef`. |
| [`use-auth-session.ts`](../../../mobile/features/auth/use-auth-session.ts) | React Query (`staleTime: Infinity`) + listener `onAuthStateChange`. En `SIGNED_OUT` limpia queries + AsyncStorage + lastUserProfile. |
| [`use-cold-start-biometric-check.ts`](../../../mobile/features/auth/use-cold-start-biometric-check.ts) | Determina `shouldUseBiometric` (biometría disponible + credenciales guardadas) para el routing en `AppEntryGate`. El hook es reactivo a cambios de sesión (toma `sessionUserId` como argumento): cuando la sesión pasa a null tras un logout, el hook re-evalúa y `AppEntryGate` redirige correctamente a `/(auth)/welcome` en vez de mantener cacheado el `shouldUseBiometric: true` del usuario anterior. |
| [`use-delete-account.ts`](../../../mobile/features/auth/use-delete-account.ts) | `useRequestAccountDeletion` → RPC `request_account_deletion` (programa baja en 30d). `useCancelAccountDeletion` → RPC `cancel_account_deletion`. |
| [`use-last-user-profile-sync.ts`](../../../mobile/features/auth/use-last-user-profile-sync.ts) | Persiste email + display_name + avatarSlug en SecureStore (`auth.last-user.profile`) tras cada sesión activa. Solo escribe cuando el fingerprint JSON cambia. |
| [`use-login-controller.ts`](../../../mobile/features/auth/use-login-controller.ts) | Fachada que combina `useLoginFormState` + `useAuthBiometricController` + `useAuthKeyboardController` + `useLoginSubmit`. Expone el objeto controller completo al LoginScreen. |
| [`use-login-form-state.ts`](../../../mobile/features/auth/use-login-form-state.ts) | Estado local de formulario de login: `mode` (sign-in/sign-up), `displayName`, `email`, `password`, `errorMessage`, `infoMessage`, con callbacks clearFeedback-on-change. |
| [`use-login-submit.ts`](../../../mobile/features/auth/use-login-submit.ts) | Lógica de submit unificada (sign-in y sign-up): valida, llama Supabase, resuelve destino, persiste biometría si aplica, maneja errores. |
| [`use-timezone-sync.ts`](../../../mobile/features/auth/use-timezone-sync.ts) | Sincroniza `Intl.DateTimeFormat().resolvedOptions().timeZone` → `profiles.timezone` cuando difiere. Fallback `America/Argentina/Buenos_Aires`. |

---

### Inventario components/auth

| Archivo | Propósito |
|---|---|
| [`auth-feedback-pill.tsx`](../../../mobile/components/auth/auth-feedback-pill.tsx) | Pill de feedback inline: `intent='error'` (rojo) o `'info'` (azul). Icono MaterialIcons + texto. Usado en login, signup, forgot-password, reset-password. |
| ~~`auth-gradient-action-button.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — huérfano (SPRINT D cleanup). |
| ~~`auth-input.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — huérfano (SPRINT D cleanup). |
| [`auth-launch-splash.tsx`](../../../mobile/components/auth/auth-launch-splash.tsx) | Splash de lanzamiento (cold start): misma composición visual que welcome (aurora + partículas + hero stack) — mismo pixel-layout para lograr transición shared-element cuando welcome monta debajo. 24 partículas. Props: `onComplete`, `persistent`, `reducedMotion`. |
| ~~`auth-segmented-control.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — huérfano (SPRINT D cleanup). |
| [`auth-transition-splash.tsx`](../../../mobile/components/auth/auth-transition-splash.tsx) | Splash post-login (login → home bridge). Verde oscuro + 16 fireflies (CSS animations Reanimated 4, sin worklets). Dos modos: `showing/success-pending` (WarmFernLogo) / `error` (ErrorFallback con NetInfo probe en retry). |
| [`fern-logo.tsx`](../../../mobile/components/auth/fern-logo.tsx) | SVG del helecho animado (draw-on animado, `animate` prop). Paletas: `dark`, `light`, `peach`, `mono-light`, `warm`. |
| ~~`login-primitives.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano sin consumidores (Bucket 2 de [09](09-candidatos-a-eliminar.md)). Los componentes re-exportados siguen vivos por import directo. |
| [`warm-fern-logo.tsx`](../../../mobile/components/auth/warm-fern-logo.tsx) | FernLogo estático (sin animación) + wordmark "Manifiesto." sobre fondo verde. Usado exclusivamente en la transition splash post-login. |

---

## 6. Auth Transitions / Splash / Caches

### Auth Transition Splash

**Módulo:** [`auth-transition-splash.ts`](../../../mobile/lib/auth-transition-splash.ts) — store module-level con `useSyncExternalStore`.

**Máquina de estados:**

```
hidden → showing → success-pending → hidden
                 → error
```

- `showAuthTransitionSplash()`: abre el splash. Inicia `MIN_VISIBLE_MS=3000ms` y safety timer `MAX_VISIBLE_MS=15000ms`.
- `markAuthTransitionLoaded()`: señala que la data del destino ya cargó. Si ya pasó el mínimo → oculta inmediatamente; si no → espera el resto del mínimo.
- `reportAuthTransitionError(kind)`: promueve a `error`. Kinds: `'network'`, `'timeout'`, `'unknown'`.
- `showAuthTransitionError(kind)`: mueve a `error` desde cualquier estado (incluyendo `hidden`). Usado por el watcher de conectividad.
- `hideAuthTransitionSplash()`: force-hide incondicionalmente.
- `useAuthTransitionSplash()`: hook React para componentes.

**Rendimiento:** las 16 fireflies del `AuthTransitionSplash` usan CSS animations de Reanimated 4 — cero worklets, cero shared values.

**Dismiss gate:** [`auth-transition-dismiss-gate.ts`](../../../mobile/lib/auth-transition-dismiss-gate.ts) — predicado puro `shouldDismissAuthTransition({ isLoading, splashVisible })`. Centralizado para que `AppEntryGate`, `RequireAuth`, `RequireGuest`, `OnboardingRoute`, `AppStackShell` usen la misma condición.

---

### Last User Cache

**Módulo:** [`last-user-cache.ts`](../../../mobile/lib/last-user-cache.ts) — SecureStore key `auth.last-user.profile`.

**Interfaz `LastUserProfile`:** `{ email: string, displayName: string | null, avatarSlug: string | null }`.

**Escritura:** `useLastUserProfileSync` (montado en AppStackShell) — escribe en SecureStore solo cuando el fingerprint JSON cambia. Se borra en `SIGNED_OUT` via `clearLastUserProfile()`.

**Lectura:** `getLastUserProfile()` — en login-screen al montar para mostrar hero personalizado sin red.

**Uso:** permite mostrar nombre de usuario, avatar animal, y email pre-rellenado antes de cualquier network call, incluso en cold start sin sesión.

---

### Profile Display Name Cache

**Módulo:** [`profile-display-name-cache.ts`](../../../mobile/lib/profile-display-name-cache.ts) — Map en memoria (no persistido), TTL 5 minutos.

**API:** `getCachedProfileDisplayName(userId)`, `setCachedProfileDisplayName(userId, displayName)`, `setCachedProfileDisplayNames(profiles[])`.

**Uso:** cache de corto plazo para display names en listas/avatares sin re-fetchear el perfil completo.

---

### Auth Greetings

**Módulo:** [`lib/copy/auth-greetings.ts`](../../../mobile/lib/copy/auth-greetings.ts).

**`pickReturningGreeting(now?: Date)`:** selecciona aleatoriamente de un pool de 47 frases neutras + 3-5 específicas por franja horaria (mañana 5-12h, tarde 12-19h, noche 19-5h). Todas en español rioplatense sin marcadores de género.

---

## 7. Reset Password y Deep Links

### URL Scheme

- Deep link base: `manifiesto://` (configurado por expo-linking).
- Redirect de confirmación de email: `manifiesto://auth/callback?code=...` → ruta `app/auth/callback.tsx`.
- Redirect de reset de password: `manifiesto://auth/reset-password?code=...` → ruta `app/auth/reset-password.tsx`.

Los paths están **hardcodeados** en `auth-flow.ts` (`AUTH_REDIRECT_PATH = 'auth/callback'`, `AUTH_RESET_PASSWORD_PATH = 'auth/reset-password'`). Comentario explícito: NO se leen de `EXPO_PUBLIC_*` para evitar que un deploy no auditado desvíe la confirmación a un path arbitrario.

### Flujo Reset Password completo

```
Usuario en login-screen → "¿Olvidaste tu contraseña?"
        ↓
/(auth)/forgot-password
   • Campo email
   • Submit → supabase.auth.resetPasswordForEmail(email, { redirectTo: 'manifiesto://auth/reset-password' })
   • UI cambia a "Revisá tu mail" + email destino
        ↓
Email recibido → link abre la app
        ↓
app/auth/reset-password?code=<PKCE_CODE>
   → ResetPasswordScreen
   • Stage 'exchanging': supabase.auth.exchangeCodeForSession(code) [timeout 30s]
   • Stage 'form': nueva contraseña + confirmar
   • Submit: supabase.auth.updateUser({ password })
   • Stage 'success': "Ir al inicio" → router.replace('/')
   • Stage 'error': link vencido → "Pedir nuevo link"
   • Stage 'timeout': "Está tardando más de lo normal" → retry + fallback
```

### Flujo Confirmación Email (signup)

```
Signup screen → supabase.auth.signUp (hasSession=false)
   → panel "Revisá tu mail" con email enmascarado
   → (usuario hace click en el email)
        ↓
app/auth/callback?code=<PKCE_CODE>
   → AuthCallbackScreen
   • supabase.auth.exchangeCodeForSession(code) [timeout 30s]
   • OK → router.replace('/')
   • Error → botones retry / ir a login
```

**Seguridad PKCE:** los screens de callback y reset-password solo consumen el `code`. El handler anterior que aceptaba `access_token` + `refresh_token` en query params (explotable para session fixation via deep link de phishing) fue removido.

---

## 8. Account Deletion — Flujo de usuario

### Trigger

Settings screen → sección "Zona de riesgo" → botón "Eliminar cuenta" → abre `DeleteAccountConfirmSheet`.

### Guard especial: owner con miembros

Si el usuario es owner de una familia con otros miembros activos (`isOwnerWithMembers = true`), el sheet muestra un panel informativo en lugar del flujo destructivo:
> "Antes de borrar, transferí tu hogar — No podés borrar tu cuenta todavía. Si te vas como dueño, el resto del hogar pierde acceso. Pasale el rol a otro miembro desde 'Administrar familia' y volvé."

Solo CTA: "Entendido" (cierra el sheet). El RPC del servidor también bloquea esta situación, pero el UI adelanta el feedback para evitar el round-trip.

### Flujo de dos pasos (usuario normal / miembro sin dependientes)

**Step 1 — Warning**

- Panel con ícono ⚠️ rojo: "Esto no se puede deshacer fácil".
- Copy: "Tu cuenta queda agendada para borrarse en 30 días. Si cambiás de idea, podés cancelar volviendo a entrar dentro de ese plazo."
- Lista de qué se borra: gastos/fijos/metas/notificaciones, perfil/avatar/config, suscripción activa.
- Nota: "Tenés 30 días para arrepentirte y reactivar."
- CTAs: "Cancelar" (ghost) | "Continuar" (danger) → pasa a step 2.

**Step 2 — Confirmación de frase**

- Instrucción: escribir `BORRAR MI CUENTA` (en mayúsculas, `CONFIRM_PHRASE`).
- Input con `autoCapitalize: "characters"`, `autoCorrect: false`, `spellCheck: false`.
- Validación: `phrase.trim().toUpperCase() === 'BORRAR MI CUENTA'`.
- Error inline si no coincide: "Tiene que coincidir exactamente con BORRAR MI CUENTA."
- CTA "Borrar cuenta" (danger) habilitado solo cuando coincide exactamente.

**Submit:**
- `useRequestAccountDeletion.mutate()` → `supabase.rpc('request_account_deletion')`.
- RPC backend: (1) verifica que no sea owner con miembros activos, (2) setea `profiles.deletion_scheduled_at = now() + 30d`, (3) borra `push_subscriptions`.
- RPC retorna ISO timestamp del `scheduled_at`.
- Post-éxito en la settings screen: `supabase.auth.signOut()` → usuario es deslogueado inmediatamente.

**Cancelación de baja (dentro de los 30 días):**
- `useCancelAccountDeletion` → `supabase.rpc('cancel_account_deletion')`.
- No se expone activamente en el UI de la versión actual (no verificado, el hook existe).

**Procesado final:**
- Cron/edge function del servidor (service-role) borra el `auth.users` row cuando vence `deletion_scheduled_at`. El borrado es en cascade.

---

## 9. Estado vs Deuda técnica

| Funcionalidad | Estado | Notas |
|---|---|---|
| Email/password sign-in | ✅ LIVE | Completo, PKCE, validaciones robustas. |
| Email/password sign-up | ✅ LIVE | Con confirmación de email, resend con cooldown 60s. |
| Reset password (forgot + deep link) | ✅ LIVE | PKCE, timeout 30s, todos los estados de error. |
| Auth callback (email confirmation) | ✅ LIVE | PKCE-only, timeout 30s, retry. |
| Biometría (Face ID / Touch ID / Huella) | ✅ LIVE | Refresh-token flow (no password), rotación automática, degradación sin borrar credenciales. |
| App-lock (gate biométrico por cold start) | ✅ LIVE | Per-launch, se resetea en logout. Sin re-lock por backgrounding. |
| Apple Sign-In | 🟡 PARCIAL | Código completo. ⛔ BLOQUEADO sin Apple Developer Program activo + Supabase configurado. |
| Google Sign-In | 🟡 PARCIAL | Código completo. ⛔ BLOQUEADO: requiere `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` en env + módulo nativo (no Expo Go). |
| Onboarding wizard (5 pasos) | ✅ LIVE | Creator y joiner paths, re-entrada detectada por `previously_onboarded`. |
| Household setup (re-config desde settings) | ✅ LIVE | 3 pasos, wizard post-onboarding. |
| Join screen (path legacy/recuperación) | ✅ LIVE | Para usuarios sin familia que perdieron acceso. |
| Auth transition splash | ✅ LIVE | Máquina de estados, min 3s, safety 15s, fallback de error con NetInfo. |
| Last user cache (SecureStore) | ✅ LIVE | Login personalizado sin red. |
| Account deletion (flujo UI completo) | ✅ LIVE | 2-step con frase de confirmación, guard owner-con-miembros, gracia 30 días. |
| Cancel account deletion | 🟡 PARCIAL | Hook `useCancelAccountDeletion` existe; exposición en UI no verificada. |
| Re-lock por backgrounding | 🔴 NO EXISTE | Comentario en `app-lock-state.ts` lo menciona como "si queremos en el futuro". |
| Auto-sign-in biométrico en mount | ⏸️ EN PAUSA | `useAuthBiometricAutoSignIn` es no-op. Deshabilitado por double-prompt. La ruta `?autoBiometric=1` cubre el caso de cold start. |
| Google Sign-In en Expo Go | 🔴 NO EXISTE | Por diseño: lazy-require para no crashear; muestra Alert en Expo Go. |
